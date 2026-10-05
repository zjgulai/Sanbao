import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'

const captured = vi.hoisted(() => ({
  spawn: vi.fn(() => ({ stdout: { on: vi.fn() }, stderr: { on: vi.fn() }, on: vi.fn(), kill: vi.fn() })),
}))
vi.mock('node:child_process', () => ({ spawn: captured.spawn }))
vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false), mkdirSync: vi.fn(), rmSync: vi.fn(), writeFileSync: vi.fn(),
  createWriteStream: vi.fn(() => ({ write: vi.fn(), end: vi.fn() })),
}))

const argv = process.argv
const signalListeners = { SIGINT: process.listeners('SIGINT'), SIGTERM: process.listeners('SIGTERM') }
afterEach(() => {
  process.argv = argv
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    for (const listener of process.listeners(signal)) {
      if (!signalListeners[signal].includes(listener)) process.off(signal, listener)
    }
  }
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('development GUI process environment', () => {
  it('launches real GUI mode without inherited fixture or auxiliary-surface flags', async () => {
    for (const name of ['ELECTRON_RUN_AS_NODE', 'SAGE_FIXTURE_PROJECTION', 'SAGE_FIXTURE_STAGE', 'SAGE_SANBAO_SURFACE', 'SAGE_SANBAO_SURFACE_ROOT']) {
      vi.stubEnv(name, 'inherited-canary')
    }
    const path = fileURLToPath(new URL('../scripts/dev-debug.mjs', import.meta.url))
    process.argv = [process.execPath, path, '--no-build', '--no-materialize']
    vi.spyOn(console, 'log').mockImplementation(() => {})
    await import('../scripts/dev-debug.mjs')
    expect(captured.spawn).toHaveBeenCalledTimes(1)
    const [command, args, options] = captured.spawn.mock.calls[0] as unknown as [string, string[], { env: NodeJS.ProcessEnv }]
    expect(command).toMatch(/electron$/)
    expect(args).toContain('.')
    for (const name of ['ELECTRON_RUN_AS_NODE', 'SAGE_FIXTURE_PROJECTION', 'SAGE_FIXTURE_STAGE', 'SAGE_SANBAO_SURFACE', 'SAGE_SANBAO_SURFACE_ROOT']) {
      expect(options.env[name], name).toBeUndefined()
    }
    expect(options.env.SAGE_DEVTOOLS).toBe('1')
    expect(options.env.SAGE_ROOT).toContain('Sage Dev')
  })
})
