import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveHostRuntime } from '../src/main/runtime.js'

const base = {
  execPath: '/Applications/LUTE Shell.app/Contents/MacOS/LUTE Shell',
  profileDir: '/home/lute/.dsh/profiles/lute-shell',
  dshHome: '/home/lute/.dsh',
}

describe('resolveHostRuntime', () => {
  it('runs the host under the Electron binary as plain Node', () => {
    const runtime = resolveHostRuntime({ ...base, env: { HOME: '/home/lute' } })
    expect(runtime.node).toBe(base.execPath)
    expect(runtime.env.ELECTRON_RUN_AS_NODE).toBe('1')
    expect(runtime.profileDir).toBe(base.profileDir)
  })

  it('points the entry at the host runtime inside the profile', () => {
    const runtime = resolveHostRuntime({ ...base, env: {} })
    expect(runtime.entry).toBe(join(base.profileDir, 'lute-host', 'host', 'index.js'))
  })

  it('honors an explicit node binary override', () => {
    const runtime = resolveHostRuntime({ ...base, env: { LUTE_SHELL_NODE_BINARY: '/opt/homebrew/bin/node' } })
    expect(runtime.node).toBe('/opt/homebrew/bin/node')
  })

  it('passes DSH_HOME and scrubs bootstrap-only variables', () => {
    const runtime = resolveHostRuntime({
      ...base,
      env: {
        HOME: '/home/lute',
        DSH_HOME: '/somewhere/else',
        NODE_OPTIONS: '--inspect',
        LUTE_SHELL_PROFILE: '/tmp/other',
        pnpm_execpath: '/usr/bin/pnpm',
        npm_lifecycle_event: 'dev',
        corepack_root: '/opt/corepack',
      },
    })
    expect(runtime.env.DSH_HOME).toBe(base.dshHome)
    expect(runtime.env.HOME).toBe('/home/lute')
    expect(runtime.env.NODE_OPTIONS).toBeUndefined()
    expect(runtime.env.LUTE_SHELL_PROFILE).toBeUndefined()
    expect(runtime.env.pnpm_execpath).toBeUndefined()
    expect(runtime.env.npm_lifecycle_event).toBeUndefined()
    expect(runtime.env.corepack_root).toBeUndefined()
  })
})
