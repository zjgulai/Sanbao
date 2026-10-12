/** ADR-0335: boot-time profile reconciliation over every ADR-0332 kill window. Each state is
 *  hand-built on disk (a kill skips the `finally` blocks, so the debris shapes are exactly
 *  reproducible), reconciled, and then fed through the normal install path to prove the boot
 *  converges. */
import { randomUUID } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { assertBundledProfileAdmissibleSync, installBundledProfileTemplate } from '../src/profile/bundled-profile.js'
import { ensureSageDirectoriesSync, generationProfileDir, readActiveProfile, type SagePaths } from '../src/profile/paths.js'
import { ProfileReconcileError, reconcileProfileState } from '../src/profile/profile-reconcile.js'
import { cleanupTemporaryRoots, createTemplate, testPaths } from './support/profile-fixtures.js'

afterEach(() => {
  vi.restoreAllMocks()
  cleanupTemporaryRoots()
})

const clock = () => '2026-10-13T00:00:00.000Z'

async function install(templateRoot: string, paths: SagePaths) {
  return installBundledProfileTemplate({ paths, templateRoot, now: clock })
}

function displace(paths: SagePaths, generation: string): string {
  const displaced = join(paths.stagingDir, `displaced-${randomUUID()}`)
  renameSync(generationProfileDir(paths, generation), displaced)
  return displaced
}

function killBeforePointer(paths: SagePaths): void {
  rmSync(paths.activeProfileFile)
}

function partialTransaction(paths: SagePaths, generation: string): string {
  const dir = join(paths.stagingDir, `bundled-${randomUUID()}`, generation)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'half-copied'), 'x\n')
  return dir
}

function chromiumJunk(paths: SagePaths): void {
  writeFileSync(join(paths.sessionDataDir, 'DevToolsActivePort'), '12345\n')
  writeFileSync(join(paths.electronUserDataDir, 'Local State'), '{}\n')
}

function strayPointerTemp(paths: SagePaths): string {
  const path = join(paths.root, `.profile-current.json.${randomUUID()}.tmp`)
  writeFileSync(path, '{}\n')
  return path
}

/** A verified tree of another release, placed without a pointer — the killed new-id roll-forward. */
async function placeVerifiedGeneration(target: SagePaths, generation: string, templateRoot: string): Promise<void> {
  const scratch = testPaths(`scratch-${generation}`)
  await install(templateRoot, scratch)
  cpSync(generationProfileDir(scratch, generation), generationProfileDir(target, generation), {
    recursive: true,
    verbatimSymlinks: true,
  })
}

function staleGarbage(paths: SagePaths, name: string): string {
  const dir = join(paths.generationsDir, name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'profile-manifest.json'), '{}\n')
  return dir
}

describe('reconcileProfileState (ADR-0335)', () => {
  it('W1: cleans a partial transaction and lets the pristine admission and install proceed', async () => {
    const template = await createTemplate('w1')
    const paths = testPaths('w1')
    ensureSageDirectoriesSync(paths)
    partialTransaction(paths, template.generation)
    chromiumJunk(paths)

    const reconciled = await reconcileProfileState({ paths, templateRoot: template.templateRoot, now: clock })
    expect(reconciled.state).toBe('cleaned')
    expect(readdirSync(paths.stagingDir)).toEqual([])
    // The exact state that is bricked today: admission previously rejected the leftover AND the
    // Chromium files. The electron subtree is opaque; the staging leftover is gone.
    expect(() => assertBundledProfileAdmissibleSync(paths)).not.toThrow()
    expect(await install(template.templateRoot, paths)).toMatchObject({ state: 'installed' })
  })

  it('W1b: sweeps unknown staging names, symlinks and stray pointer temp files', async () => {
    const template = await createTemplate('w1b')
    const paths = testPaths('w1b')
    ensureSageDirectoriesSync(paths)
    writeFileSync(join(paths.stagingDir, 'garbage.txt'), 'x\n')
    const linkTarget = join(paths.stagingDir, 'link-target')
    mkdirSync(linkTarget)
    symlinkSync(linkTarget, join(paths.stagingDir, 'link'))
    const stray = strayPointerTemp(paths)

    const reconciled = await reconcileProfileState({ paths, templateRoot: template.templateRoot, now: clock })
    expect(reconciled.state).toBe('cleaned')
    expect(readdirSync(paths.stagingDir)).toEqual([])
    // A symlink in staging is removed as a link; its target outside the link is not followed.
    expect(existsSync(stray)).toBe(false)
    expect(await install(template.templateRoot, paths)).toMatchObject({ state: 'installed' })
  })

  it('W2: restores the displaced active generation and the same boot upgrades normally', async () => {
    const first = await createTemplate('w2a', { generation: 'w2-generation' })
    const second = await createTemplate('w2b', { generation: 'w2-generation', comment: '// release two\n' })
    const paths = testPaths('w2')
    await install(first.templateRoot, paths)
    displace(paths, 'w2-generation')

    const reconciled = await reconcileProfileState({ paths, templateRoot: first.templateRoot, now: clock })
    expect(reconciled.state).toBe('rolled-back')
    expect(readdirSync(paths.stagingDir)).toEqual([])
    // The restored tree becomes active again, and the normal upgrade path re-runs the swap.
    expect(await install(first.templateRoot, paths)).toMatchObject({ state: 'existing' })
    expect(await install(second.templateRoot, paths)).toMatchObject({ state: 'upgraded' })
    const moduleManifest = JSON.parse(readFileSync(join(second.templateRoot, 'template-manifest.json'), 'utf8')) as { profileManifestSha256: string }
    expect((await readActiveProfile(paths))?.manifestSha256).toBe(moduleManifest.profileManifestSha256)
  })

  it('W2b: two matching displaced copies fail closed as ambiguous, mutating nothing', async () => {
    const template = await createTemplate('w2c')
    const paths = testPaths('w2c')
    await install(template.templateRoot, paths)
    const first = displace(paths, template.generation)
    // A second full copy of the same tree (hand-built; byte-identical receipts).
    cpSync(first, join(paths.stagingDir, `displaced-${randomUUID()}`), { recursive: true, verbatimSymlinks: true })

    await expect(reconcileProfileState({ paths, templateRoot: template.templateRoot, now: clock }))
      .rejects.toMatchObject({ code: 'displaced-ambiguous' })
    expect(existsSync(generationProfileDir(paths, template.generation))).toBe(false)
  })

  it('W2c: a missing generation with no displaced copy fails closed with the named cause', async () => {
    const template = await createTemplate('w2d')
    const paths = testPaths('w2d')
    await install(template.templateRoot, paths)
    rmSync(generationProfileDir(paths, template.generation), { recursive: true, force: true })

    const failure = await reconcileProfileState({ paths, templateRoot: template.templateRoot, now: clock })
      .catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(ProfileReconcileError)
    expect((failure as ProfileReconcileError).code).toBe('active-generation-missing')
    expect((failure as Error).message).toContain(template.generation)
  })

  it('W2d: a displaced copy whose receipt mismatches the pointer does not count as recovery', async () => {
    const template = await createTemplate('w2e')
    const paths = testPaths('w2e')
    await install(template.templateRoot, paths)
    const displaced = displace(paths, template.generation)
    writeFileSync(join(displaced, 'profile-manifest.json'), '{}\n')

    const failure = await reconcileProfileState({ paths, templateRoot: template.templateRoot, now: clock })
      .catch((error: unknown) => error)
    expect((failure as ProfileReconcileError).code).toBe('active-generation-missing')
    expect((failure as Error).message).toContain('displaced-')
  })

  it('W3: adopts a committed tree whose pointer write never landed — no re-copy', async () => {
    const template = await createTemplate('w3')
    const paths = testPaths('w3')
    await install(template.templateRoot, paths)
    killBeforePointer(paths)

    const reconciled = await reconcileProfileState({ paths, templateRoot: template.templateRoot, now: clock })
    expect(reconciled.state).toBe('adopted')
    expect((await readActiveProfile(paths))?.generation).toBe(template.generation)
    // 'existing' proves the boot did NOT pay another full copy.
    expect(await install(template.templateRoot, paths)).toMatchObject({ state: 'existing' })
  })

  it('W3b: a pointerless tree from an older release is cleared and the fresh install succeeds', async () => {
    const oldTemplate = await createTemplate('w3b-old', { generation: 'w3b-old-generation' })
    const newTemplate = await createTemplate('w3b-new', { generation: 'w3b-new-generation' })
    const paths = testPaths('w3b')
    await install(oldTemplate.templateRoot, paths)
    killBeforePointer(paths)
    chromiumJunk(paths)

    const reconciled = await reconcileProfileState({ paths, templateRoot: newTemplate.templateRoot, now: clock })
    expect(reconciled.state).toBe('cleaned')
    expect(existsSync(generationProfileDir(paths, 'w3b-old-generation'))).toBe(false)
    expect(() => assertBundledProfileAdmissibleSync(paths)).not.toThrow()
    expect(await install(newTemplate.templateRoot, paths)).toMatchObject({ state: 'installed' })
  })

  it('W3c: a corrupt pointerless tree is not adopted, is removed, and the install re-copies', async () => {
    const template = await createTemplate('w3c')
    const paths = testPaths('w3c')
    await install(template.templateRoot, paths)
    killBeforePointer(paths)
    writeFileSync(join(generationProfileDir(paths, template.generation), 'cordis.yml'), 'tampered\n')

    const reconciled = await reconcileProfileState({ paths, templateRoot: template.templateRoot, now: clock })
    expect(reconciled.state).toBe('cleaned')
    expect(await install(template.templateRoot, paths)).toMatchObject({ state: 'installed' })
  })

  it('W4: a verified new-generation tree from a killed roll-forward is adopted, old tree kept', async () => {
    const oldTemplate = await createTemplate('w4-old', { generation: 'w4-old-generation' })
    const newTemplate = await createTemplate('w4-new', { generation: 'w4-new-generation', comment: '// new release\n' })
    const paths = testPaths('w4')
    await install(oldTemplate.templateRoot, paths)
    await placeVerifiedGeneration(paths, 'w4-new-generation', newTemplate.templateRoot)

    const reconciled = await reconcileProfileState({ paths, templateRoot: newTemplate.templateRoot, now: clock })
    expect(reconciled.state).toBe('adopted')
    expect((await readActiveProfile(paths))?.generation).toBe('w4-new-generation')
    // The boot converges on the new release without the 'generation already exists' refusal.
    expect(await install(newTemplate.templateRoot, paths)).toMatchObject({ state: 'existing' })
    expect(existsSync(generationProfileDir(paths, 'w4-old-generation'))).toBe(true)
  })

  it('W4b: a corrupt placed tree is removed so the normal upgrade re-runs', async () => {
    const oldTemplate = await createTemplate('w4b-old', { generation: 'w4b-old-generation' })
    const newTemplate = await createTemplate('w4b-new', { generation: 'w4b-new-generation', comment: '// new release\n' })
    const paths = testPaths('w4b')
    await install(oldTemplate.templateRoot, paths)
    await placeVerifiedGeneration(paths, 'w4b-new-generation', newTemplate.templateRoot)
    writeFileSync(join(generationProfileDir(paths, 'w4b-new-generation'), 'cordis.yml'), 'tampered\n')

    const reconciled = await reconcileProfileState({ paths, templateRoot: newTemplate.templateRoot, now: clock })
    expect(reconciled.state).toBe('cleaned')
    expect(await install(newTemplate.templateRoot, paths)).toMatchObject({ state: 'upgraded' })
    expect((await readActiveProfile(paths))?.generation).toBe('w4b-new-generation')
  })

  it('W5: post-commit debris is collected on the next boot', async () => {
    const template = await createTemplate('w5')
    const paths = testPaths('w5')
    await install(template.templateRoot, paths)
    cpSync(generationProfileDir(paths, template.generation), join(paths.stagingDir, `displaced-${randomUUID()}`), { recursive: true })
    partialTransaction(paths, template.generation)

    const reconciled = await reconcileProfileState({ paths, templateRoot: template.templateRoot, now: clock })
    expect(reconciled.state).toBe('cleaned')
    expect(readdirSync(paths.stagingDir)).toEqual([])
    expect(await install(template.templateRoot, paths)).toMatchObject({ state: 'existing' })
  })

  it('GC: invalid generation directories go, valid old generations are kept newest-first', async () => {
    const oldTemplate = await createTemplate('gc-old', { generation: 'gc-old-generation' })
    const newTemplate = await createTemplate('gc-new', { generation: 'gc-new-generation', comment: '// gc release\n' })
    const paths = testPaths('gc')
    await install(oldTemplate.templateRoot, paths)
    await install(newTemplate.templateRoot, paths)
    staleGarbage(paths, 'gc-junk-one')
    staleGarbage(paths, 'gc-junk-two')

    const reconciled = await reconcileProfileState({ paths, templateRoot: newTemplate.templateRoot, now: clock })
    expect(reconciled.state).toBe('cleaned')
    expect(existsSync(join(paths.generationsDir, 'gc-junk-one'))).toBe(false)
    expect(existsSync(join(paths.generationsDir, 'gc-junk-two'))).toBe(false)
    // The only valid non-active generation survives as the rollback source (keep-1).
    expect(existsSync(generationProfileDir(paths, 'gc-old-generation'))).toBe(true)
    // Second run changes nothing.
    expect((await reconcileProfileState({ paths, templateRoot: newTemplate.templateRoot, now: clock })).state).toBe('unchanged')
  })

  it('GC tie: equal mtimes among stale valid generations keep everything', async () => {
    const oldTemplate = await createTemplate('gctie-old', { generation: 'gctie-old-generation' })
    const tieTemplate = await createTemplate('gctie-tie', { generation: 'gctie-tie-generation' })
    const newTemplate = await createTemplate('gctie-new', { generation: 'gctie-new-generation', comment: '// gc2\n' })
    const paths = testPaths('gctie')
    await install(oldTemplate.templateRoot, paths)
    await placeVerifiedGeneration(paths, 'gctie-tie-generation', tieTemplate.templateRoot)
    // A pointer for the new generation on top of two valid stale trees (hand-built state).
    await install(newTemplate.templateRoot, paths)
    const stamp = new Date('2026-10-13T00:00:00.000Z')
    utimesSync(generationProfileDir(paths, 'gctie-old-generation'), stamp, stamp)
    utimesSync(generationProfileDir(paths, 'gctie-tie-generation'), stamp, stamp)

    await reconcileProfileState({ paths, templateRoot: newTemplate.templateRoot, now: clock })
    expect(existsSync(generationProfileDir(paths, 'gctie-old-generation'))).toBe(true)
    expect(existsSync(generationProfileDir(paths, 'gctie-tie-generation'))).toBe(true)
  })

  it('rejects an unsafe active generation path by name', async () => {
    const template = await createTemplate('unsafe')
    const paths = testPaths('unsafe')
    await install(template.templateRoot, paths)
    rmSync(generationProfileDir(paths, template.generation), { recursive: true, force: true })
    symlinkSync(paths.draftsDir, generationProfileDir(paths, template.generation))

    await expect(reconcileProfileState({ paths, templateRoot: template.templateRoot, now: clock }))
      .rejects.toMatchObject({ code: 'active-generation-unsafe' })
  })

  it('propagates a malformed pointer untouched', async () => {
    const template = await createTemplate('badpointer')
    const paths = testPaths('badpointer')
    ensureSageDirectoriesSync(paths)
    writeFileSync(paths.activeProfileFile, '{')

    await expect(reconcileProfileState({ paths, templateRoot: template.templateRoot, now: clock }))
      .rejects.toThrow(/not valid JSON/u)
    expect(readFileSync(paths.activeProfileFile, 'utf8')).toBe('{')
  })

  it('leaves a healthy root unchanged', async () => {
    const template = await createTemplate('healthy')
    const paths = testPaths('healthy')
    await install(template.templateRoot, paths)
    const pointerBefore = readFileSync(paths.activeProfileFile, 'utf8')

    const reconciled = await reconcileProfileState({ paths, templateRoot: template.templateRoot, now: clock })
    expect(reconciled.state).toBe('unchanged')
    expect(reconciled.actions).toEqual([])
    expect(readFileSync(paths.activeProfileFile, 'utf8')).toBe(pointerBefore)
    expect(readdirSync(paths.generationsDir)).toEqual([template.generation])
  })
})
