import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
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

const shellRoot = '/repo/apps/lute-shell'
const seedDir = `${shellRoot}/seed`
const profileDir = '/home/lute/.dsh/profiles/lute-shell'

describe('layout', () => {
  it('puts the profile under DSH_HOME with the shell label', () => {
    expect(PROFILE_LABEL).toBe('lute-shell')
    expect(defaultProfileDir('/home/lute')).toBe(join('/home/lute', '.dsh', 'profiles', 'lute-shell'))
  })

  it('plans every seed file onto the profile root, in order', () => {
    const plan = planMaterialize({ seedDir, shellRoot, profileDir })
    const seedTargets = plan.entries.filter(entry => entry.from.startsWith(seedDir))
    expect(seedTargets.map(entry => entry.from)).toEqual(SEED_FILES.map(name => join(seedDir, name)))
    expect(seedTargets.map(entry => entry.to)).toEqual(SEED_FILES.map(name => join(profileDir, name)))
    expect([...SEED_FILES]).toEqual(['package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml', 'cordis.yml', 'cordis.patch.yml'])
  })

  it('plans the built host runtime into lute-host/ preserving relative imports', () => {
    const plan = planMaterialize({ seedDir, shellRoot, profileDir })
    const hostTargets = plan.entries.filter(entry => entry.from.startsWith(join(shellRoot, 'lib')))
    expect(hostTargets.map(entry => entry.from)).toEqual(HOST_LIB_FILES.map(name => join(shellRoot, 'lib', name)))
    expect(hostTargets.map(entry => entry.to)).toEqual(HOST_LIB_FILES.map(name => join(profileDir, HOST_DIR_NAME, name)))
  })

  it('plans the overlay next to the host entry and exposes both paths', () => {
    const plan = planMaterialize({ seedDir, shellRoot, profileDir })
    expect(plan.entries).toContainEqual({
      from: join(shellRoot, HOST_CONFIG_FILE),
      to: join(profileDir, HOST_DIR_NAME, 'shell.cordis.patch.yml'),
    })
    expect(hostEntryPath(profileDir)).toBe(join(profileDir, HOST_DIR_NAME, 'host', 'index.js'))
    expect(overlayPath(profileDir)).toBe(join(profileDir, HOST_DIR_NAME, 'shell.cordis.patch.yml'))
  })
})
