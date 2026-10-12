/** Shared fixtures for the bundled-profile install/upgrade specs (bundled-profile.spec.ts and
 *  profile-reconcile.spec.ts): a real materialized generation plus its signed template manifest,
 *  built through `materializeProfile` so receipts and attestations are the shipping ones. */
import { chmodSync, cpSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { HOST_CONFIG_FILE, HOST_LIB_FILES } from '../../src/profile/layout.js'
import { materializeProfile } from '../../src/profile/materialize.js'
import {
  BUNDLED_PROFILE_TEMPLATE_MANIFEST,
  BUNDLED_PROFILE_TEMPLATE_PROFILE_DIR,
} from '../../src/profile/bundled-profile.js'
import { readActiveProfile, resolveSagePaths, type SagePaths } from '../../src/profile/paths.js'
import { RUNTIME_ARTIFACT_ATTESTATION_FILE } from '../../src/profile/runtime-artifact-attestation.js'

const realShellRoot = join(import.meta.dirname, '..', '..')
const seedDir = join(realShellRoot, 'seed')
const created: string[] = []

export function temporary(label: string): string {
  const path = join(tmpdir(), `sage-profile-fx-${label}-${String(created.length)}-${String(Date.now())}`)
  created.push(path)
  return path
}

/** Remove every temporary root this module created. Call from the spec's afterEach. */
export function cleanupTemporaryRoots(): void {
  while (created.length > 0) rmSync(created.pop() as string, { recursive: true, force: true })
}

export function stubShellRoot(comment = ''): string {
  const root = temporary('shellroot')
  for (const name of HOST_LIB_FILES) {
    const path = join(root, 'lib', name)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, `// built ${name}\n${comment}`)
  }
  mkdirSync(join(root, dirname(HOST_CONFIG_FILE)), { recursive: true })
  cpSync(join(realShellRoot, HOST_CONFIG_FILE), join(root, HOST_CONFIG_FILE))
  return root
}

export function testPaths(label: string): SagePaths {
  return resolveSagePaths({ home: temporary(`${label}-home`), root: temporary(`${label}-root`) })
}

export async function installProfileFixture(profileDir: string): Promise<void> {
  const packageDir = join(profileDir, 'node_modules/.pnpm/fixture@1.0.0/node_modules/fixture')
  mkdirSync(join(profileDir, 'node_modules/.bin'), { recursive: true })
  mkdirSync(packageDir, { recursive: true })
  writeFileSync(join(packageDir, 'index.js'), 'export const fixture = true\n')
  const executable = join(packageDir, 'bin.js')
  writeFileSync(executable, '#!/usr/bin/env node\n')
  chmodSync(executable, 0o755)
  symlinkSync('../.pnpm/fixture@1.0.0/node_modules/fixture/bin.js', join(profileDir, 'node_modules/.bin/fixture'))
  writeFileSync(join(profileDir, 'node_modules/.modules.yaml'), 'storeDir: /fixture/pnpm/store\n')
}

export async function createTemplate(
  label: string,
  options: { readonly generation?: string, readonly comment?: string } = {},
): Promise<{ readonly generation: string, readonly templateRoot: string }> {
  const sourcePaths = testPaths(`${label}-source`)
  const generation = options.generation ?? `${label}-generation`
  const materialized = await materializeProfile({
    seedDir,
    shellRoot: stubShellRoot(options.comment ?? ''),
    repoRoot: realShellRoot,
    paths: sourcePaths,
    generation,
    install: installProfileFixture,
  })
  const active = await readActiveProfile(sourcePaths)
  if (active === null || active.runtimeArtifactAttestationSha256 === undefined) throw new Error('fixture profile lacks attestation')
  const attestation = JSON.parse(readFileSync(join(materialized.profileDir, RUNTIME_ARTIFACT_ATTESTATION_FILE), 'utf8')) as {
    ownedProfileDigest: string
    artifactAttestationDigest: string
  }
  const templateRoot = temporary(`${label}-template`)
  mkdirSync(templateRoot, { recursive: true })
  cpSync(materialized.profileDir, join(templateRoot, BUNDLED_PROFILE_TEMPLATE_PROFILE_DIR), {
    recursive: true,
    verbatimSymlinks: true,
  })
  writeFileSync(join(templateRoot, BUNDLED_PROFILE_TEMPLATE_MANIFEST), `${JSON.stringify({
    schemaVersion: 'sage.bundled-profile-template.v1',
    generation,
    profileManifestSha256: materialized.manifestSha256,
    runtimeArtifactAttestationSha256: active.runtimeArtifactAttestationSha256,
    ownedProfileDigest: attestation.ownedProfileDigest,
    artifactAttestationDigest: attestation.artifactAttestationDigest,
  }, null, 2)}\n`)
  return { generation, templateRoot }
}
