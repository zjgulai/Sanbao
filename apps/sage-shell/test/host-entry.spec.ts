import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { routeRequest, runShellHost } from '../src/host/index.js'

const fixtureProfile = join(import.meta.dirname, 'fixtures', 'profile')
const overlay = join(import.meta.dirname, '..', 'config', 'shell.cordis.patch.yml')
const tempBases: string[] = []

afterAll(() => {
  for (const base of tempBases.splice(0)) rmSync(base, { recursive: true, force: true })
})

// A temp copy keeps runShellHost's writeFileSync(cordis.yml) off the git-tracked fixture.
function copyProfile(bundleOutside: boolean): string {
  const base = mkdtempSync(join(tmpdir(), 'sage-shell-containment-'))
  tempBases.push(base)
  const profileDir = join(base, 'profile')
  cpSync(fixtureProfile, profileDir, { recursive: true })
  const bundle = join(profileDir, 'node_modules', 'lute-fixture-bundle')
  if (bundleOutside) {
    const outside = join(base, 'outside-bundle')
    cpSync(bundle, outside, { recursive: true })
    rmSync(bundle, { recursive: true, force: true })
    symlinkSync(outside, bundle, 'dir')
  }
  return profileDir
}

function emptyProfile(): { profileDir: string; overlayPatchPath: string } {
  const base = mkdtempSync(join(tmpdir(), 'sage-shell-empty-profile-'))
  tempBases.push(base)
  const profileDir = join(base, 'profile')
  mkdirSync(join(profileDir, 'node_modules', '@deepseek-ai', 'dsh'), { recursive: true })
  writeFileSync(join(profileDir, 'package.json'), JSON.stringify({
    name: 'sage-shell-empty-profile',
    private: true,
    type: 'module',
    dsh: { profile: { bundles: [] } },
  }))
  writeFileSync(join(profileDir, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'), JSON.stringify({
    name: '@deepseek-ai/dsh',
    version: '0.1.5-rc.2',
    type: 'module',
  }))
  writeFileSync(join(profileDir, 'cordis.patch.yml'), '[]\n')
  const overlayPatchPath = join(base, 'overlay.patch.yml')
  writeFileSync(overlayPatchPath, '[]\n')
  return { profileDir, overlayPatchPath }
}

async function writeResponse(): Promise<void> {}

function hostInput(profileDir: string): Parameters<typeof runShellHost>[0] {
  return { profileDir, overlayPatchPath: overlay, writeResponse }
}

describe('routeRequest', () => {
  it('rejects the main-owned Sage surface and retired upstream surfaces; serves only assets', () => {
    // WT-02D.1: the Host no longer owns /.sage/*; a stray request is rejected, never served.
    expect(routeRequest('/.sage/state')).toBe('rejected')
    expect(routeRequest('/.sage/actions')).toBe('rejected')
    expect(routeRequest('/.sage')).toBe('rejected')
    expect(routeRequest('/.dsh/remote-stream')).toBe('rejected')
    expect(routeRequest('/api/session/list')).toBe('rejected')
    expect(routeRequest('/api')).toBe('rejected')
    expect(routeRequest('/plugins/dsh-client-ui-chat.js')).toBe('rejected')
    expect(routeRequest('/.sanbao/session-directory')).toBe('rejected')
    expect(routeRequest('/index.html')).toBe('assets')
    expect(routeRequest('/')).toBe('assets')
  })
})

describe('runShellHost bundle containment', () => {
  it('refuses a missing profile without creating an arbitrary directory', async () => {
    const base = mkdtempSync(join(tmpdir(), 'sage-shell-missing-profile-'))
    tempBases.push(base)
    const missingProfile = join(base, 'not-an-active-profile')

    await expect(runShellHost(hostInput(missingProfile))).rejects.toThrow()

    expect(existsSync(missingProfile)).toBe(false)
  })

  it('refuses a bundle layer that resolves outside the profile', async () => {
    await expect(runShellHost(hostInput(copyProfile(true)))).rejects
      .toThrow(/^sage shell: profile bundle "lute-fixture-bundle" resolved outside the profile$/u)
  })

  // Negative control: the same profile with the bundle inside must not trip the check,
  // and must not fail earlier either — otherwise the test above proves nothing.
  it('does not refuse a bundle layer that stays inside the profile', async () => {
    const outcome = await runShellHost(hostInput(copyProfile(false))).then(
      async (controller) => {
        await controller.dispose()
        return 'booted'
      },
      (error: unknown) => error instanceof Error ? error.message : String(error),
    )
    expect(outcome).not.toMatch(/resolved outside the profile/u)
    expect(outcome).not.toMatch(/has no installed @deepseek-ai\/dsh/u)
    expect(outcome).not.toMatch(/declares no dsh\.bundle in its package\.json/u)
  })
})

describe('runShellHost lifecycle', () => {
  it('reports active only after settled boot and emits one invalidation after readiness is armed', async () => {
    const invalidations: string[] = []
    const profile = emptyProfile()
    const controller = await runShellHost({
      ...profile,
      writeResponse,
      onRuntimeInvalidated: () => { invalidations.push('runtime-invalidated') },
    })

    expect(controller.loaderPhase).toBe('active')
    expect(invalidations).toEqual([])

    controller.armRuntimeInvalidation()
    await controller.dispose()
    await controller.dispose()

    expect(invalidations).toEqual(['runtime-invalidated'])
  })
})
