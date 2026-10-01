import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  ROOT_CONFIG_CONTENT,
  ROOT_CONFIG_FILENAME,
  SHELL_LABEL,
  composeShellPatches,
  inspectEntries,
  rootConfigPath,
} from '../src/host/composition.js'

const fixtures = join(import.meta.dirname, 'fixtures')
const fixtureProfile = join(fixtures, 'profile')
const brokenProfile = join(fixtures, 'profile-broken-bundle')
const overlay = join(import.meta.dirname, '..', 'config', 'shell.cordis.patch.yml')
const localOverlay = join(fixtures, 'local-overlay.patch.yml')

function ids(patches: readonly { id?: unknown }[]): string[] {
  return patches
    .map(patch => typeof patch.id === 'string' ? patch.id : undefined)
    .filter((id): id is string => id !== undefined)
}

describe('composeShellPatches', () => {
  it('reads layers from dsh.profile.bundles, then the user layer, then the shell overlay', () => {
    const { patches, layerNames, layerDirs } = composeShellPatches({
      profileDir: fixtureProfile,
      overlayPatchPath: overlay,
    })
    expect(layerNames).toEqual(['lute-fixture-bundle'])
    expect(layerDirs).toHaveLength(1)
    expect(ids(patches)).toEqual([
      'web-startup', 'fixture-bundle-row', 'fixture-row',
      'web-startup', 'webserver', 'web-runtime', 'client-hmr',
      'open-in-app', 'ui-open-in-app', 'directory-picker', 'connection',
      'session-log-deepseek',
    ])
  })

  it('lets the overlay disable a row the bundle enabled', () => {
    const { patches } = composeShellPatches({ profileDir: fixtureProfile, overlayPatchPath: overlay })
    const webStartup = inspectEntries(patches).find(row => row.id === 'web-startup')
    expect(webStartup?.disabled).toBe(true)
  })

  it('composes both directory browsing faces without a webserver or native IPC dependency', () => {
    const { patches } = composeShellPatches({ profileDir: fixtureProfile, overlayPatchPath: overlay })
    const entries = inspectEntries(patches)
    expect(entries.find(row => row.id === 'shell-directory-picker')?.name)
      .toBe('@deepseek-ai/dsh-host-directory-picker-browse')
    expect(entries.find(row => row.id === 'shell-ui-directory-picker')?.name)
      .toBe('@deepseek-ai/dsh-client-ui-directory-picker-browse')
  })

  it('does not inject an agent-presets system root', () => {
    const { patches } = composeShellPatches({ profileDir: fixtureProfile, overlayPatchPath: overlay })
    expect(ids(patches)).not.toContain('agent-presets')
  })

  it('appends the instance-local patch layer after the shell overlay when it exists', () => {
    const { patches } = composeShellPatches({
      profileDir: fixtureProfile,
      overlayPatchPath: overlay,
      localPatchPath: localOverlay,
    })
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
    const { patches } = composeShellPatches({
      profileDir: fixtureProfile,
      overlayPatchPath: overlay,
      localPatchPath: join(fixtures, 'no-such-local.patch.yml'),
    })
    expect(inspectEntries(patches).some(row => row.id === 'local-fixture-row')).toBe(false)
  })

  it('fails loud when the profile has no installed @deepseek-ai/dsh anchor', () => {
    expect(() => composeShellPatches({
      profileDir: join(fixtureProfile, 'missing'),
      overlayPatchPath: overlay,
    })).toThrow(/^sage shell: profile .* has no installed @deepseek-ai\/dsh/u)
  })

  it('fails loud when a bundle manifest does not declare dsh.bundle.patch', () => {
    let message = ''
    try {
      composeShellPatches({ profileDir: brokenProfile, overlayPatchPath: overlay })
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }
    // 第一条断言才是承重的：证明 fixture 走到了 bundle 校验，而不是被 installAnchor 提前拦下。
    expect(message).not.toMatch(/has no installed @deepseek-ai\/dsh/u)
    expect(message).toMatch(/declares no dsh\.bundle in its package\.json/u)
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
