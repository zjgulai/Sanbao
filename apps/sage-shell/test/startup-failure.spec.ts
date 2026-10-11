/** L2-A (ADR-0322): the startup-failure surface — ordering (log → ready → frontmost box →
 *  exit) and the never-throws contract on every dependency failing. */
import { describe, expect, it, vi } from 'vitest'

import { STARTUP_FAILURE_TITLE, surfaceStartupFailure } from '../src/main/startup-failure.js'

function deps(overrides: Partial<Parameters<typeof surfaceStartupFailure>[1]> = {}) {
  const events: string[] = []
  const base = {
    writeLog: (line: string) => { events.push(`log:${line.startsWith('sage shell: ')}`) },
    whenReady: async () => { events.push('ready') },
    showErrorBox: (title: string, content: string) => { events.push(`box:${title}:${content}`) },
    exit: (code: number) => { events.push(`exit:${code}`) },
  }
  return { events, deps: { ...base, ...overrides } }
}

describe('the startup-failure surface (ADR-0322)', () => {
  it('logs the stack, waits for ready, shows the one named box, then exits nonzero', async () => {
    const h = deps()
    await surfaceStartupFailure(new Error('sage shell: refusing bundled profile install'), h.deps)
    expect(h.events).toEqual([
      'log:true',
      'ready',
      `box:${STARTUP_FAILURE_TITLE}:sage shell: refusing bundled profile install`,
      'exit:1',
    ])
  })

  it('never throws even when every dependency fails — the box still exits the app', async () => {
    const h = deps({
      writeLog: () => { throw new Error('sink gone') },
      whenReady: async () => { throw new Error('ready failed') },
      showErrorBox: () => { throw new Error('no display') },
    })
    await expect(surfaceStartupFailure('non-Error failure', h.deps)).resolves.toBeUndefined()
    expect(h.events).toEqual(['exit:1'])
  })
})
