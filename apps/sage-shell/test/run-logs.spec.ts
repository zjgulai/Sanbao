import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { createRunLogs } from '../src/main/run-logs.js'

/**
 * Ticket 031, the run-log reader (US-164) — S5: real bytes on a local temporary directory.
 *
 * The bridge substitute reads the *actual* file, so the cursor claims are about real content:
 * one bounded page per read, an appending log keeps its cursor, a rotated one voids it with a
 * marked instruction, and a missing file is its own answer — never an empty log.
 */

const roots: string[] = []
afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true })
})

const versionOf = (absolutePath: string): string => {
  const stat = statSync(absolutePath)
  return `${Math.round(stat.mtimeMs)}:${stat.size}`
}

function fixture(initial: string, relative = 'logs/run.log', workspaceRelative = false) {
  const root = mkdtempSync(join(tmpdir(), 'sage-run-log-'))
  roots.push(root)
  mkdirSync(join(root, 'logs'), { recursive: true })
  const absolute = join(root, relative)
  writeFileSync(absolute, initial)
  const calls: Array<{ endpoint: string, payload: readonly unknown[] }> = []
  const call = async (endpoint: string, payload: readonly unknown[] = []): Promise<unknown> => {
    calls.push({ endpoint, payload })
    const request = (payload[0] ?? {}) as Record<string, unknown>
    const absolutePath = join(String(request.workspaceRoot), String(request.path))
    if (endpoint === 'workspaceFiles/stat') {
      try {
        return { ok: true, result: { absolutePath, version: versionOf(absolutePath), bytes: statSync(absolutePath).size } }
      } catch {
        return { ok: false, code: 'bridge-file-not-found' }
      }
    }
    if (endpoint === 'workspaceFiles/read') {
      const text = readFileSync(absolutePath, 'utf8')
      const lines = text.split('\n')
      if (text.endsWith('\n')) lines.pop()
      const range = (request.range ?? {}) as { offset?: number, limit?: number }
      const offset = range.offset ?? 1
      const limit = range.limit ?? lines.length
      const page = lines.slice(offset - 1, offset - 1 + limit)
      return {
        ok: true,
        result: { absolutePath, version: versionOf(absolutePath), text: page.join('\n'), lines: page.length, eof: offset - 1 + page.length >= lines.length },
      }
    }
    return { ok: false, code: 'bridge-answer-unrecognised' }
  }
  return { root, absolute, call, calls, relative: workspaceRelative ? relative : relative }
}

describe('reading a run log — one bounded page at a time (US-164)', () => {
  it('reads the real file with line numbers, then continues from the cursor while the log grows', async () => {
    const lines = Array.from({ length: 250 }, (_, index) => `第 ${String(index + 1)} 行日志`)
    const f = fixture(lines.join('\n'))
    const reader = createRunLogs(f.call)

    const first = await reader({ workspaceRoot: f.root, path: 'logs/run.log' })
    expect(first.state).toBe('read')
    if (first.state !== 'read') return
    expect(first.fromLine).toBe(1)
    expect(first.lines).toHaveLength(200)
    expect(first.lines[0]).toEqual({ no: 1, text: '第 1 行日志' })
    expect(first.lines[199]).toEqual({ no: 200, text: '第 200 行日志' })
    expect(first.nextLine).toBe(201)
    expect(first.eof).toBe(false)
    expect(first.rotation).toBeNull()
    expect(first.version).toBe(versionOf(f.absolute))

    const second = await reader({ workspaceRoot: f.root, path: 'logs/run.log', fromLine: first.nextLine, expectVersion: first.version })
    if (second.state !== 'read') throw new Error('expected read')
    expect(second.lines[0]).toEqual({ no: 201, text: '第 201 行日志' })
    expect(second.lines.at(-1)).toEqual({ no: 250, text: '第 250 行日志' })
    expect(second.eof).toBe(true)

    // The log grows: the version token moves on an append, so the cursor is judged by SIZE —
    // a live log keeps its cursor (only a shrink voids it).
    const grownFrom = statSync(f.absolute).size
    appendFileSync(f.absolute, '\n第 251 行日志\n')
    const third = await reader({ workspaceRoot: f.root, path: 'logs/run.log', fromLine: second.nextLine, expectVersion: second.version, expectBytes: grownFrom })
    if (third.state !== 'read') throw new Error('expected read')
    expect(third.lines).toEqual([{ no: 251, text: '第 251 行日志' }])
    expect(third.rotation).toBeNull()
    expect(third.eof).toBe(true)
  })

  it('a rotated or replaced file voids the cursor with a marked restart — never a silent guess', async () => {
    const f = fixture('旧一\n旧二\n旧三\n')
    const reader = createRunLogs(f.call)
    const first = await reader({ workspaceRoot: f.root, path: 'logs/run.log' })
    if (first.state !== 'read') throw new Error('expected read')
    // The log rotates: same path, a shorter body — the cursor is void.
    const before = statSync(f.absolute).size
    writeFileSync(f.absolute, '新一\n')
    const after = await reader({ workspaceRoot: f.root, path: 'logs/run.log', fromLine: first.nextLine, expectVersion: first.version, expectBytes: before })
    if (after.state !== 'read') throw new Error('expected read')
    expect(after.rotation).toBe('file-rotated')
    expect(after.lines).toEqual([])
    expect(after.nextLine).toBe(first.nextLine)
    expect(after.version).toBe(versionOf(f.absolute))
    // Restarting from line 1 with the new version reads the new content.
    const restart = await reader({ workspaceRoot: f.root, path: 'logs/run.log', fromLine: 1, expectVersion: after.version })
    if (restart.state !== 'read') throw new Error('expected read')
    expect(restart.lines).toEqual([{ no: 1, text: '新一' }])
    expect(restart.rotation).toBeNull()
  })

  it('an oversize line is cut with an explicit marker, counted — never silently shortened', async () => {
    const f = fixture(`短行\n${'长'.repeat(2500)}\n尾行\n`)
    const reader = createRunLogs(f.call)
    const outcome = await reader({ workspaceRoot: f.root, path: 'logs/run.log' })
    if (outcome.state !== 'read') throw new Error('expected read')
    expect(outcome.lines[1]?.text).toContain('（本行超长，已截断）')
    expect(outcome.lines[1]?.text.length).toBe(2000 + '…（本行超长，已截断）'.length)
    expect(outcome.truncatedLines).toBe(1)
  })

  it('a missing file and an outside path each answer with their own code — missing is not an empty log', async () => {
    const f = fixture('x\n')
    const reader = createRunLogs(f.call)
    expect(await reader({ workspaceRoot: f.root, path: 'logs/gone.log' })).toEqual({ state: 'refused', code: 'bridge-file-not-found' })
    expect(await reader({ workspaceRoot: f.root, path: '../secret.log' })).toEqual({ state: 'refused', code: 'log-path-outside-workspace' })
    expect(await reader({ workspaceRoot: f.root, path: 'logs/run.log', fromLine: 0 })).toEqual({ state: 'refused', code: 'log-cursor-invalid' })
    // Reading reaches the content port only — the discipline is stat + read, in that order.
    expect(f.calls.every((entry) => entry.endpoint === 'workspaceFiles/stat' || entry.endpoint === 'workspaceFiles/read')).toBe(true)
  })
})
