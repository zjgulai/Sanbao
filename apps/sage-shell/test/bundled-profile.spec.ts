import { createHash } from 'node:crypto'
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HOST_CONFIG_FILE, HOST_LIB_FILES } from '../src/profile/layout.js'
import { materializeProfile } from '../src/profile/materialize.js'
import {
  BUNDLED_PROFILE_TEMPLATE_MANIFEST,
  BUNDLED_PROFILE_TEMPLATE_PROFILE_DIR,
  assertBundledProfileAdmissibleSync,
  installBundledProfileTemplate,
} from '../src/profile/bundled-profile.js'
import { ensureSageDirectoriesSync, generationProfileDir, readActiveProfile, resolveSagePaths } from '../src/profile/paths.js'
import { RUNTIME_ARTIFACT_ATTESTATION_FILE } from '../src/profile/runtime-artifact-attestation.js'

const realShellRoot = join(import.meta.dirname, '..')
const seedDir = join(realShellRoot, 'seed')
const created: string[] = []

function temporary(label: string): string {
  const path = join(tmpdir(), `sage-bundled-profile-${label}-${String(created.length)}-${String(Date.now())}`)
  created.push(path)
  return path
}

function stubShellRoot(comment = ''): string {
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

async function createTemplate(label: string, options: { readonly generation?: string, readonly comment?: string } = {}) {
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
    // ADR-0332: the signed template manifest is read on every boot now — the same release is
    // the idempotent 'existing' answer, and a differing manifest would ride the upgrade swap.
    const second = await installBundledProfileTemplate({
      paths,
      templateRoot: template.templateRoot,
    })

    expect(first).toMatchObject({ state: 'installed', profile: { generation: template.generation } })
    expect(second).toMatchObject({ state: 'existing', profile: { generation: template.generation } })
    await expect(readActiveProfile(paths)).resolves.toMatchObject({ generation: template.generation })
    expect(existsSync(generationProfileDir(paths, template.generation))).toBe(true)
  })

  it('rejects a missing-pointer root that contains any prior state at admission time', () => {
    const paths = testPaths('nonpristine-target')
    ensureSageDirectoriesSync(paths)
    expect(() => assertBundledProfileAdmissibleSync(paths)).not.toThrow()
    writeFileSync(join(paths.draftsDir, 'existing.json'), '{}\n')
    expect(() => assertBundledProfileAdmissibleSync(paths)).toThrow(/not pristine/u)
  })

  it('installs after admission even though Chromium writes its session files in between', async () => {
    const template = await createTemplate('session-race')
    const paths = testPaths('session-race-target')
    ensureSageDirectoriesSync(paths)
    assertBundledProfileAdmissibleSync(paths)
    // Exactly the first packaged acceptance race (2026-10-10): the debugging launch writes
    // DevToolsActivePort into the configured session directory while the async install
    // transaction is still awaiting. Admission is a pre-configure decision, not a re-check.
    writeFileSync(join(paths.sessionDataDir, 'DevToolsActivePort'), '12345\n')

    const result = await installBundledProfileTemplate({
      paths,
      templateRoot: template.templateRoot,
      now: () => '2026-10-05T12:00:00.000Z',
    })
    expect(result).toMatchObject({ state: 'installed', profile: { generation: template.generation } })
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

  it('upgrades an existing activation in place when the signed template manifest differs (ADR-0332)', async () => {
    const paths = testPaths('upgrade-same-id')
    const first = await createTemplate('upgrade1', { generation: 'upgrade-generation' })
    const second = await createTemplate('upgrade2', { generation: 'upgrade-generation', comment: '// release two\n' })

    expect(await installBundledProfileTemplate({ paths, templateRoot: first.templateRoot }))
      .toMatchObject({ state: 'installed' })
    const upgraded = await installBundledProfileTemplate({ paths, templateRoot: second.templateRoot })
    expect(upgraded).toMatchObject({ state: 'upgraded', profile: { generation: 'upgrade-generation' } })

    const secondManifest = JSON.parse(readFileSync(join(second.templateRoot, BUNDLED_PROFILE_TEMPLATE_MANIFEST), 'utf8')) as { profileManifestSha256: string }
    const active = await readActiveProfile(paths)
    expect(active?.manifestSha256).toBe(secondManifest.profileManifestSha256)

    // Idempotent against the same release; no displaced leftovers.
    expect(await installBundledProfileTemplate({ paths, templateRoot: second.templateRoot }))
      .toMatchObject({ state: 'existing' })
    const leftovers = readdirSync(paths.stagingDir).filter((name) => name.startsWith('displaced-') || name.startsWith('bundled-'))
    expect(leftovers).toEqual([])
  })

  it('upgrades to a differently named generation without touching the old one (ADR-0332)', async () => {
    const paths = testPaths('upgrade-new-id')
    const first = await createTemplate('upgraden1', { generation: 'upgrade-old-generation' })
    const second = await createTemplate('upgraden2', { generation: 'upgrade-new-generation', comment: '// renamed release\n' })

    expect(await installBundledProfileTemplate({ paths, templateRoot: first.templateRoot }))
      .toMatchObject({ state: 'installed' })
    expect(await installBundledProfileTemplate({ paths, templateRoot: second.templateRoot }))
      .toMatchObject({ state: 'upgraded', profile: { generation: 'upgrade-new-generation' } })
    expect((await readActiveProfile(paths))?.generation).toBe('upgrade-new-generation')
    // The previous generation's tree stays addressable for rollback.
    expect(existsSync(generationProfileDir(paths, 'upgrade-old-generation'))).toBe(true)
  })
})
