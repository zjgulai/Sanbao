import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { buildProductionLibrary } from './support/build-production-library.js'

const probe = fileURLToPath(new URL('./support/desktop-experts-window-probe.mjs', import.meta.url))
const prefix = 'SAGE_EXPERTS_WINDOW_RESULT '

async function runWindowProbe() {
  buildProductionLibrary()
  const root = await mkdtemp(join(tmpdir(), 'sage-experts-window-'))
  try {
    return await new Promise<{ code: number | null; result: Record<string, any> }>((resolve, reject) => {
      const env = { ...process.env, SAGE_EXPERTS_PROBE_ROOT: root }
      delete env.ELECTRON_RUN_AS_NODE
      const child = spawn(process.execPath, [probe], { env, stdio: ['ignore', 'pipe', 'pipe'] })
      let stdout = '', stderr = ''
      const timeout = setTimeout(() => { child.kill('SIGKILL') }, 60_000)
      child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
        stdout += chunk
        if (Buffer.byteLength(stdout) + Buffer.byteLength(stderr) > 512 * 1024) child.kill('SIGKILL')
      })
      child.stderr.setEncoding('utf8').on('data', (chunk: string) => { stderr += chunk })
      child.once('error', error => { clearTimeout(timeout); reject(error) })
      child.once('close', (code, signal) => {
        clearTimeout(timeout)
        const results = stdout.split(/\r?\n/u).filter(line => line.startsWith(prefix))
        if (signal !== null || results.length !== 1) {
          reject(new Error(`Expert window probe did not finish (signal=${signal}): ${stdout}\n${stderr}`))
          return
        }
        try { resolve({ code, result: JSON.parse(results[0]!.slice(prefix.length)) }) }
        catch (error) { reject(error) }
      })
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

describe('EP-1 default desktop expert window', () => {
  it('loads all avatars, navigates by real input, and reflows without creating an expert or session', async () => {
    const { code, result } = await runWindowProbe()
    expect(process.env.ELECTRON_RUN_AS_NODE).toBe('1')
    expect(result.failures).toEqual([])
    expect(result.fatal).toBeNull()
    expect(code).toBe(0)
    expect(result.processType).toBe('browser')
    expect(result.avatars).toBe(53)
    expect(result.categories).toEqual({ management: 3, jobs: 50, all: 53 })
    expect(result.keyboard).toBe(true)
    expect(result.search).toBe(true)
    expect(result.navigation).toBe(true)
    expect(result.postRequests).toEqual([])
    expect(result.assetFailures).toEqual([])
    expect(result.geometry).toHaveLength(4)
    expect(result.policy.contaminated).toBe(false)
  }, 120_000)
})
