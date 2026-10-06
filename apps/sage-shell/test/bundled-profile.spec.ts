import { createHash } from 'node:crypto'
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HOST_CONFIG_FILE, HOST_LIB_FILES } from '../src/profile/layout.js'
import { materializeProfile } from '../src/profile/materialize.js'
import {
  BUNDLED_PROFILE_TEMPLATE_MANIFEST,
  BUNDLED_PROFILE_TEMPLATE_PROFILE_DIR,
  installBundledProfileTemplate,
} from '../src/profile/bundled-profile.js'
import { generationProfileDir, readActiveProfile, resolveSagePaths } from '../src/profile/paths.js'
import { RUNTIME_ARTIFACT_ATTESTATION_FILE } from '../src/profile/runtime-artifact-attestation.js'

const realShellRoot = join(import.meta.dirname, '..')
const seedDir = join(realShellRoot, 'seed')
const created: string[] = []

function temporary(label: string): string {
  const path = join(tmpdir(), `sage-bundled-profile-${label}-${String(created.length)}-${String(Date.now())}`)
  created.push(path)
  return path
}

function stubShellRoot(): string {
  const root = temporary('shellroot')
  for (const name of HOST_LIB_FILES) {
    const path = join(root, 'lib', name)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, `// built ${name}\n`)
  }
  mkdirSync(join(root, dirname(HOST_CONFIG_FILE)), { recursive: true })
  cpSync(join(realShellRoot, HOST_CONFIG_FILE), join(root, HOST_CONFIG_FILE))
  return root
}

function testPaths(label: string) {
  return resolveSagePaths({ home: temporary(`${label}-home`), root: temporary(`${label}-root`) })
}

async function installProfileFixture(profileDir: string): Promise<void> {
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

async function createTemplate(label: string) {
  const sourcePaths = testPaths(`${label}-source`)
  const generation = `${label}-generation`
  const materialized = await materializeProfile({
    seedDir,
    shellRoot: stubShellRoot(),
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

afterEach(() => {
  vi.restoreAllMocks()
  while (created.length > 0) rmSync(created.pop() as string, { recursive: true, force: true })
})

describe('installBundledProfileTemplate', () => {
  it('installs a verified template into a pristine root and reuses it on the second launch', async () => {
    const template = await createTemplate('first')
    const paths = testPaths('target')

    const first = await installBundledProfileTemplate({
      paths,
      templateRoot: template.templateRoot,
      now: () => '2026-10-05T12:00:00.000Z',
    })
    const second = await installBundledProfileTemplate({
      paths,
      templateRoot: join(template.templateRoot, 'does-not-need-to-exist'),
    })

    expect(first).toMatchObject({ state: 'installed', profile: { generation: template.generation } })
    expect(second).toMatchObject({ state: 'existing', profile: { generation: template.generation } })
    await expect(readActiveProfile(paths)).resolves.toMatchObject({ generation: template.generation })
    expect(existsSync(generationProfileDir(paths, template.generation))).toBe(true)
  })

  it('rejects a missing-pointer root that contains any prior state or partial transaction', async () => {
    const template = await createTemplate('nonpristine')
    const paths = testPaths('nonpristine-target')
    mkdirSync(paths.draftsDir, { recursive: true })
    writeFileSync(join(paths.draftsDir, 'existing.json'), '{}\n')

    await expect(installBundledProfileTemplate({ paths, templateRoot: template.templateRoot }))
      .rejects.toThrow(/not pristine/u)
    expect(existsSync(paths.activeProfileFile)).toBe(false)
    expect(existsSync(generationProfileDir(paths, template.generation))).toBe(false)
  })

  it('rejects tampered template bytes before activating a generation', async () => {
    const template = await createTemplate('tampered')
    const paths = testPaths('tampered-target')
    writeFileSync(join(template.templateRoot, BUNDLED_PROFILE_TEMPLATE_PROFILE_DIR, 'cordis.yml'), 'tampered\n')

    await expect(installBundledProfileTemplate({ paths, templateRoot: template.templateRoot }))
      .rejects.toThrow(/checksum does not match receipt/u)
    expect(existsSync(paths.activeProfileFile)).toBe(false)
    expect(existsSync(generationProfileDir(paths, template.generation))).toBe(false)
  })

  it('rejects a template manifest that is not sealed to the profile receipt', async () => {
    const template = await createTemplate('receipt')
    const paths = testPaths('receipt-target')
    const manifestPath = join(template.templateRoot, BUNDLED_PROFILE_TEMPLATE_MANIFEST)
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>
    manifest.profileManifestSha256 = createHash('sha256').update('wrong').digest('hex')
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

    await expect(installBundledProfileTemplate({ paths, templateRoot: template.templateRoot }))
      .rejects.toThrow(/does not match its signed template manifest/u)
    expect(existsSync(paths.activeProfileFile)).toBe(false)
  })
})
