import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BUNDLED_PROFILE_TEMPLATE_MANIFEST,
  BUNDLED_PROFILE_TEMPLATE_PROFILE_DIR,
  assertBundledProfileAdmissibleSync,
  installBundledProfileTemplate,
} from '../src/profile/bundled-profile.js'
import { ensureSageDirectoriesSync, generationProfileDir, readActiveProfile } from '../src/profile/paths.js'
import { cleanupTemporaryRoots, createTemplate, testPaths } from './support/profile-fixtures.js'

afterEach(() => {
  vi.restoreAllMocks()
  cleanupTemporaryRoots()
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
    // transaction is still awaiting.
    writeFileSync(join(paths.sessionDataDir, 'DevToolsActivePort'), '12345\n')

    const result = await installBundledProfileTemplate({
      paths,
      templateRoot: template.templateRoot,
      now: () => '2026-10-05T12:00:00.000Z',
    })
    expect(result).toMatchObject({ state: 'installed', profile: { generation: template.generation } })
  })

  it('treats electron/** as opaque at admission while every Sage-owned path stays strict (ADR-0335)', () => {
    const paths = testPaths('admission-electron')
    ensureSageDirectoriesSync(paths)
    // Chromium's runtime files under electron/** are tolerated: admission runs after
    // configureElectronPaths now, so they exist by decision time on every first boot.
    writeFileSync(join(paths.sessionDataDir, 'DevToolsActivePort'), '12345\n')
    writeFileSync(join(paths.electronUserDataDir, 'Local State'), '{}\n')
    symlinkSync(paths.draftsDir, join(paths.electronUserDataDir, 'SingletonLock'))
    expect(() => assertBundledProfileAdmissibleSync(paths)).not.toThrow()
    // Sage-owned state at the root level and inside the owned directories still fails closed.
    writeFileSync(join(paths.draftsDir, 'draft.json'), '{}\n')
    expect(() => assertBundledProfileAdmissibleSync(paths)).toThrow(/not pristine/u)
    rmSync(join(paths.draftsDir, 'draft.json'))
    writeFileSync(join(paths.root, 'preferences.json'), '{}\n')
    expect(() => assertBundledProfileAdmissibleSync(paths)).toThrow(/not pristine/u)
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
