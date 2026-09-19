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
    ])
  })

  it('lets the overlay disable a row the bundle enabled', () => {
    const { patches } = composeShellPatches({ profileDir: fixtureProfile, overlayPatchPath: overlay })
    const webStartup = inspectEntries(patches).find(row => row.id === 'web-startup')
    expect(webStartup?.disabled).toBe(true)
  })

  it('does not inject an agent-presets system root', () => {
    const { patches } = composeShellPatches({ profileDir: fixtureProfile, overlayPatchPath: overlay })
    expect(ids(patches)).not.toContain('agent-presets')
  })

  it('fails loud when the profile has no installed @deepseek-ai/dsh anchor', () => {
    expect(() => composeShellPatches({
      profileDir: join(fixtureProfile, 'missing'),
      overlayPatchPath: overlay,
    })).toThrow(/^lute shell: profile .* has no installed @deepseek-ai\/dsh/u)
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
    expect(SHELL_LABEL).toBe('lute shell')
  })
})
