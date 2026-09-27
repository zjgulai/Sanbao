import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  COMPOSED_DIR_NAME,
  COMPOSED_PACKAGES,
  HOST_CONFIG_FILE,
  HOST_DIR_NAME,
  HOST_LIB_FILES,
  PROFILE_LABEL,
  SEED_FILES,
  defaultProfileDir,
  hostEntryPath,
  overlayPath,
  planMaterialize,
} from '../src/profile/layout.js'
import { generationProfileDir, resolveSagePaths } from '../src/profile/paths.js'

const shellRoot = '/repo/apps/sage-shell'
const seedDir = `${shellRoot}/seed`
const paths = resolveSagePaths({ home: '/home/lute', root: '/tmp/sage-layout' })
const profileDir = generationProfileDir(paths, 'layout-fixture')

describe('layout', () => {
  it('uses Sage-owned profile and host names', () => {
    expect(PROFILE_LABEL).toBe('sage-shell')
    expect(HOST_DIR_NAME).toBe('sage-host')
    expect(defaultProfileDir('/home/lute')).toBe(resolveSagePaths({ home: '/home/lute' }).profilesDir)
  })

  it('plans every seed file onto the profile root, in order', () => {
    const plan = planMaterialize({ seedDir, shellRoot, repoRoot: shellRoot, profileDir })
    const seedTargets = plan.entries.filter(entry => entry.from.startsWith(seedDir))
    expect(seedTargets.map(entry => entry.from)).toEqual(SEED_FILES.map(name => join(seedDir, name)))
    expect(seedTargets.map(entry => entry.to)).toEqual(SEED_FILES.map(name => join(profileDir, name)))
    expect([...SEED_FILES]).toEqual(['package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml', 'cordis.yml', 'cordis.patch.yml'])
  })

  it('plans the runtime into the Sage host directory inside a generation', () => {
    const plan = planMaterialize({ seedDir, shellRoot, repoRoot: shellRoot, profileDir })
    const hostTargets = plan.entries.filter(entry => entry.from.startsWith(join(shellRoot, 'lib')))
    expect(hostTargets.map(entry => entry.from)).toEqual(HOST_LIB_FILES.map(name => join(shellRoot, 'lib', name)))
    expect(hostTargets.map(entry => entry.to)).toEqual(HOST_LIB_FILES.map(name => join(profileDir, HOST_DIR_NAME, name)))
  })

  it('plans the overlay next to the host entry and exposes both paths', () => {
    const plan = planMaterialize({ seedDir, shellRoot, repoRoot: shellRoot, profileDir })
    expect(plan.entries).toContainEqual({
      from: join(shellRoot, HOST_CONFIG_FILE),
      to: join(profileDir, HOST_DIR_NAME, 'shell.cordis.patch.yml'),
      kind: 'host-runtime',
    })
    expect(hostEntryPath(profileDir)).toBe(join(profileDir, HOST_DIR_NAME, 'host', 'index.js'))
    expect(overlayPath(profileDir)).toBe(join(profileDir, HOST_DIR_NAME, 'shell.cordis.patch.yml'))
  })

  it('keeps P0-2 free of composed product packages and copies only the self-owned renderer and adapter', () => {
    const plan = planMaterialize({ seedDir, shellRoot, repoRoot: shellRoot, profileDir })
    const composed = plan.entries.filter(entry => entry.kind === 'composed-package')
    expect(COMPOSED_PACKAGES).toEqual([])
    expect(composed).toEqual([])
    expect(HOST_LIB_FILES).toEqual(expect.arrayContaining([
      'product/contracts.js',
      'product/state.js',
      'product/renderer.js',
      'adapter/contracts.js',
      'adapter/capability-adapter.js',
      'adapter/handler.js',
      'profile/paths.js',
    ]))
    expect(HOST_LIB_FILES.join('\n')).not.toMatch(/composer|streams/u)
    expect(COMPOSED_DIR_NAME).toBe('.composed')
  })
})
