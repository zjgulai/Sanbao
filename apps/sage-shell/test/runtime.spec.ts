import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveHostRuntime, resolveSageElectronPaths } from '../src/main/runtime.js'
import { resolveSagePaths, type ActiveProfile } from '../src/profile/paths.js'

const paths = resolveSagePaths({
  home: '/home/lute',
  root: '/home/lute/Library/Application Support/Sage',
})
const activeProfile: ActiveProfile = {
  generation: 'sage-dev',
  profileDir: join(paths.generationsDir, 'sage-dev'),
  manifestSha256: 'a'.repeat(64),
  activatedAt: '2026-09-24T00:00:00.000Z',
}
const base = {
  execPath: '/Applications/Sage Shell.app/Contents/MacOS/Sage Shell',
  paths,
  activeProfile,
}

describe('resolveHostRuntime', () => {
  it('runs the host under the Electron binary as plain Node', () => {
    const runtime = resolveHostRuntime({ ...base, env: { HOME: '/home/lute' } })
    expect(runtime.node).toBe(base.execPath)
    expect(runtime.env.ELECTRON_RUN_AS_NODE).toBe('1')
    expect(runtime.profileDir).toBe(activeProfile.profileDir)
    expect(runtime.sageRoot).toBe(paths.root)
  })

  it('points the entry at the active Sage host runtime', () => {
    const runtime = resolveHostRuntime({ ...base, env: {} })
    expect(runtime.entry).toBe(join(activeProfile.profileDir, 'sage-host', 'host', 'index.js'))
  })

  it('honors an explicit node binary override', () => {
    const runtime = resolveHostRuntime({ ...base, env: { SAGE_NODE_BINARY: '/opt/homebrew/bin/node' } })
    expect(runtime.node).toBe('/opt/homebrew/bin/node')
  })

  it('passes only the Sage Harness root and scrubs external bootstrap variables', () => {
    const runtime = resolveHostRuntime({
      ...base,
      env: {
        HOME: '/home/lute',
        DSH_HOME: '/somewhere/else',
        NODE_OPTIONS: '--inspect',
        LUTE_SHELL_PROFILE: '/tmp/other',
        SAGE_ROOT: '/tmp/other-sage-root',
        SAGE_NODE_BINARY: '/opt/homebrew/bin/node',
        SAGE_DEVTOOLS: '1',
        pnpm_execpath: '/usr/bin/pnpm',
        npm_lifecycle_event: 'dev',
        corepack_root: '/opt/corepack',
      },
    })
    expect(runtime.env.DSH_HOME).toBe(paths.harnessHome)
    expect(runtime.env.HOME).toBe('/home/lute')
    expect(runtime.env.NODE_OPTIONS).toBeUndefined()
    expect(runtime.env.DSH_HOME).not.toBe('/somewhere/else')
    expect(runtime.env.LUTE_SHELL_PROFILE).toBeUndefined()
    expect(runtime.env.SAGE_ROOT).toBeUndefined()
    expect(runtime.env.SAGE_NODE_BINARY).toBeUndefined()
    expect(runtime.env.SAGE_DEVTOOLS).toBeUndefined()
    expect(runtime.env.pnpm_execpath).toBeUndefined()
    expect(runtime.env.npm_lifecycle_event).toBeUndefined()
    expect(runtime.env.corepack_root).toBeUndefined()
  })
})

describe('resolveSageElectronPaths', () => {
  it('keeps every Electron-owned directory under the Sage root', () => {
    expect(resolveSageElectronPaths(paths)).toEqual({
      userData: paths.electronUserDataDir,
      sessionData: paths.sessionDataDir,
      logs: paths.logsDir,
      crashDumps: paths.crashDumpsDir,
    })
  })
})

describe('isolated preview roots', () => {
  it('keeps the repo-local preview root disjoint from its fake home legacy root', () => {
    const preview = resolveSagePaths({
      home: '/repo/.sage-preview-home',
      root: '/repo/.sage-preview',
    })

    expect(preview.root).toBe('/repo/.sage-preview')
  })
})
