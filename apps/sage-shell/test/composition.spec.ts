import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { readProfilePatches } from '@deepseek-ai/dsh-app-boot'
import {
  ROOT_CONFIG_CONTENT,
  ROOT_CONFIG_FILENAME,
  SHELL_LABEL,
  composeShellPatches,
  inspectEntries,
  rootConfigPath,
  type ShellCompositionInput,
} from '../src/host/composition.js'

const fixtures = join(import.meta.dirname, 'fixtures')
const fixtureProfile = join(fixtures, 'profile')
const brokenProfile = join(fixtures, 'profile-broken-bundle')
const overlay = join(import.meta.dirname, '..', 'config', 'shell.cordis.patch.yml')
const localOverlay = join(fixtures, 'local-overlay.patch.yml')

const scratch: string[] = []
function tempDir(label: string): string {
  const dir = mkdtempSync(join(tmpdir(), `sage-composition-${label}-`))
  scratch.push(dir)
  return dir
}

afterAll(() => {
  while (scratch.length > 0) rmSync(scratch.pop() as string, { recursive: true, force: true })
})

/** Base input: empty home (no home patch), settings document not yet saved (missing file). */
function input(overrides: Partial<ShellCompositionInput> = {}): ShellCompositionInput {
  const root = tempDir('root')
  return {
    profileDir: fixtureProfile,
    overlayPatchPath: overlay,
    settingsPatchPath: join(root, 'cordis.settings.patch.yml'),
    home: join(tempDir('home'), 'harness'),
    ...overrides,
  }
}

function ids(patches: readonly { id?: unknown }[]): string[] {
  return patches
    .map(patch => typeof patch.id === 'string' ? patch.id : undefined)
    .filter((id): id is string => id !== undefined)
}

describe('composeShellPatches', () => {
  it('reads bundle layers, then the shell overlay — the generation user layer stays out (ADR-0339)', () => {
    const { patches, layerNames, layerDirs } = composeShellPatches(input())
    expect(layerNames).toEqual(['lute-fixture-bundle'])
    expect(layerDirs).toHaveLength(1)
    expect(ids(patches)).toEqual([
      'web-startup', 'fixture-bundle-row',
      'web-startup', 'webserver', 'web-runtime', 'client-hmr', 'hmr',
      'open-in-app', 'ui-open-in-app', 'directory-picker', 'connection',
      'session-log-deepseek',
    ])
  })

  it('equals readProfilePatches(profileContext) by construction — settings document, home patch, overlays', () => {
    // The承重 equation (ticket 018 D2): boot patches and every later config-editor recomputation
    // come from the same launcher-owned context.
    const root = tempDir('eq-root')
    const home = join(tempDir('eq-home'), 'harness')
    mkdirSync(home, { recursive: true })
    writeFileSync(join(home, 'cordis.patch.yml'), '- id: home-fixture-row\n  config: { from: home }\n')
    const settingsPatchPath = join(root, 'cordis.settings.patch.yml')
    writeFileSync(settingsPatchPath, '- id: settings-fixture-row\n  config: { from: settings }\n')

    const composed = composeShellPatches({
      profileDir: fixtureProfile,
      overlayPatchPath: overlay,
      localPatchPath: localOverlay,
      settingsPatchPath,
      home,
    })
    const recomputed = readProfilePatches(SHELL_LABEL, composed.profileContext)
    expect(composed.patches).toEqual(recomputed)
    // Order: bundle rows → settings document → home patch → overlays (shell, then local).
    const order = ids(composed.patches)
    expect(order.indexOf('fixture-bundle-row')).toBeLessThan(order.indexOf('settings-fixture-row'))
    expect(order.indexOf('settings-fixture-row')).toBeLessThan(order.indexOf('home-fixture-row'))
    expect(order.indexOf('home-fixture-row')).toBeLessThan(order.indexOf('session-log-deepseek'))
    expect(inspectEntries(composed.patches).some(row => row.id === 'local-fixture-row')).toBe(true)
  })

  it('lets the overlay disable a row the bundle enabled', () => {
    const { patches } = composeShellPatches(input())
    const webStartup = inspectEntries(patches).find(row => row.id === 'web-startup')
    expect(webStartup?.disabled).toBe(true)
  })

  it('composes both directory browsing faces without a webserver or native IPC dependency', () => {
    const { patches } = composeShellPatches(input())
    const entries = inspectEntries(patches)
    expect(entries.find(row => row.id === 'shell-directory-picker')?.name)
      .toBe('@deepseek-ai/dsh-host-directory-picker-browse')
    expect(entries.find(row => row.id === 'shell-ui-directory-picker')?.name)
      .toBe('@deepseek-ai/dsh-client-ui-directory-picker-browse')
  })

  it('does not inject an agent-presets system root', () => {
    const { patches } = composeShellPatches(input())
    expect(ids(patches)).not.toContain('agent-presets')
  })

  it('appends the instance-local patch layer after the shell overlay when it exists', () => {
    const { patches } = composeShellPatches(input({ localPatchPath: localOverlay }))
    // 观测仪必须用 composeEntries 后的条目：insert 里的 id 不在补丁行的顶层。
    const entries = inspectEntries(patches)
    const localAt = entries.findIndex(row => row.id === 'local-fixture-row')
    const overlayLastAt = entries.findIndex(row => row.id === 'shell-ui-directory-picker')
    expect(overlayLastAt).toBeGreaterThan(-1)
    expect(localAt).toBeGreaterThan(-1)
    // 实例本地层最后合并：它必须能覆盖仓库层里的任何行。
    expect(localAt).toBeGreaterThan(overlayLastAt)
  })

  it('omits the instance-local layer when the file is absent', () => {
    const { patches } = composeShellPatches(input({ localPatchPath: join(fixtures, 'no-such-local.patch.yml') }))
    expect(inspectEntries(patches).some(row => row.id === 'local-fixture-row')).toBe(false)
  })

  it('fails loud when the profile has no installed @deepseek-ai/dsh anchor', () => {
    expect(() => composeShellPatches(input({ profileDir: join(fixtureProfile, 'missing') })))
      .toThrow(/^sage shell: profile .* has no installed @deepseek-ai\/dsh/u)
  })

  it('fails loud when a bundle manifest does not declare dsh.bundle.patch', () => {
    let message = ''
    try {
      composeShellPatches(input({ profileDir: brokenProfile }))
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }
    // 第一条断言才是承重的：证明 fixture 走到了 bundle 校验，而不是被 installAnchor 提前拦下。
    expect(message).not.toMatch(/has no installed @deepseek-ai\/dsh/u)
    expect(message).toMatch(/declares no dsh\.bundle in its package\.json/u)
  })

  it('fails loud when the generation user layer carries rows (ADR-0339: it left the composition)', () => {
    const profileDir = tempDir('stale-user-layer')
    cpSync(fixtureProfile, profileDir, { recursive: true, verbatimSymlinks: true })
    writeFileSync(join(profileDir, 'cordis.patch.yml'), '- id: stale-row\n  config: {}\n')
    expect(() => composeShellPatches(input({ profileDir })))
      .toThrow(/user layer cordis\.patch\.yml .* left the composition/u)
  })

  it('exposes the launcher-owned profileContext with every field the base reads', () => {
    const settingsPatchPath = join(tempDir('ctx-root'), 'cordis.settings.patch.yml')
    const home = join(tempDir('ctx-home'), 'harness')
    const { profileContext } = composeShellPatches(input({
      settingsPatchPath,
      home,
      localPatchPath: localOverlay,
      telemetryDisabledEnv: '1',
    }))
    expect(profileContext.name).toBe('sage-shell')
    expect(profileContext.dir).toBe(fixtureProfile)
    expect(profileContext.patchPath).toBe(settingsPatchPath)
    expect(profileContext.home).toBe(home)
    expect(profileContext.startedBundles).toEqual(['lute-fixture-bundle'])
    // overlays is a FLAT row list (base spreads rows): both layers present, merge order kept.
    const overlayIds = profileContext.overlays.map(row => row.id)
    expect(overlayIds).toContain('web-startup')
    // 本地层那行是 insert 行（id 嵌在 insert 里）：按序列化断言行内容在合并结果中。
    expect(JSON.stringify(profileContext.overlays)).toContain('local-fixture-row')
    expect(profileContext.telemetryDisabledEnv).toBe('1')
  })
})

describe('root config', () => {
  it('points boot at the seed-owned cordis.yml', () => {
    expect(rootConfigPath(fixtureProfile)).toBe(join(fixtureProfile, ROOT_CONFIG_FILENAME))
    expect(ROOT_CONFIG_FILENAME).toBe('cordis.yml')
    expect(ROOT_CONFIG_CONTENT.trimEnd().endsWith('[]')).toBe(true)
    expect(SHELL_LABEL).toBe('sage shell')
  })
})
