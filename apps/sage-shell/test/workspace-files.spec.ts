import { describe, expect, it } from 'vitest'

import { createFileCandidates, createFileReferences, isWorkspaceRelativePath } from '../src/main/workspace-files.js'
import { createUnavailableFirstService } from '../src/appservice/composition.js'
import { handleSageServiceRequest } from '../src/appservice/route-skeleton.js'
import { withProjectionReadTestAdmission } from './support/projection-read-test-runner.js'

/**
 * Ticket 013, the reference chain (US-077~082).
 *
 * The three acceptance lines live here as call-sequence assertions:
 * creation must be a stat and nothing else, a changed source must block the use before any
 * content read, and an outside path must never become a candidate or a reference.
 */

interface Call {
  readonly endpoint: string
  readonly payload: readonly unknown[]
}

function recorder(answers: Record<string, unknown>): { call: (endpoint: string, payload?: readonly unknown[]) => Promise<unknown>, calls: Call[] } {
  const calls: Call[] = []
  return {
    calls,
    call: async (endpoint: string, payload: readonly unknown[] = []) => {
      calls.push({ endpoint, payload })
      return answers[endpoint]
    },
  }
}

const statOf = (version: string, absolutePath = '/Users/someone/project/notes.md', bytes?: number) => ({
  ok: true,
  result: { absolutePath, version, ...(bytes === undefined ? {} : { bytes }) },
})

const refs = (bridge: ReturnType<typeof recorder>) => createFileReferences(bridge.call, { now: () => '2026-10-02T12:00:00.000Z', nextId: () => `ref-${String(bridge.calls.length)}` })

describe('creating a reference reads no content', () => {
  it('calls stat once and never read or list', async () => {
    const bridge = recorder({ 'workspaceFiles/stat': statOf('v1', '/Users/someone/project/notes.md', 12) })
    const outcome = await refs(bridge).create({ workspaceRoot: '/Users/someone/project', path: 'notes.md' })
    expect(outcome.state).toBe('created')
    expect(outcome.reference).toMatchObject({
      workspaceRoot: '/Users/someone/project',
      path: 'notes.md',
      absolutePath: '/Users/someone/project/notes.md',
      version: 'v1',
      bytes: 12,
      lastUse: 'unused',
    })
    // The whole point: exactly one call, and it is the metadata stat.
    expect(bridge.calls.map((entry) => entry.endpoint)).toEqual(['workspaceFiles/stat'])
    expect(bridge.calls[0]?.payload).toEqual([{ workspaceRoot: '/Users/someone/project', path: 'notes.md' }])
  })

  it('refuses an outside path without touching the bridge at all', async () => {
    const bridge = recorder({})
    const store = refs(bridge)
    for (const path of ['/etc/passwd', '../secrets.txt', 'notes/../../outside.md', '', 'notes/./x.md']) {
      const outcome = await store.create({ workspaceRoot: '/Users/someone/project', path })
      expect(outcome, path).toMatchObject({ state: 'refused', code: 'file-path-outside-workspace', reference: null })
    }
    expect(bridge.calls).toEqual([])
    expect(isWorkspaceRelativePath('notes/2026/plan.md')).toBe(true)
    expect(isWorkspaceRelativePath('notes//x.md')).toBe(false)
  })

  it('carries the base refusal through and records nothing', async () => {
    const bridge = recorder({ 'workspaceFiles/stat': { ok: false, code: 'bridge-file-not-found' } })
    const store = refs(bridge)
    expect(await store.create({ workspaceRoot: '/Users/someone/project', path: 'gone.md' }))
      .toMatchObject({ state: 'refused', code: 'bridge-file-not-found' })
    expect(store.list()).toEqual([])

    const shapeless = recorder({ 'workspaceFiles/stat': { ok: true, result: { version: '' } } })
    expect(await refs(shapeless).create({ workspaceRoot: '/Users/someone/project', path: 'notes.md' }))
      .toMatchObject({ state: 'refused', code: 'bridge-answer-unrecognised' })
  })
})

describe('using a reference re-checks the version before reading', () => {
  it('reads only when the version is unchanged, and reports it live', async () => {
    const bridge = recorder({
      'workspaceFiles/stat': statOf('v1'),
      'workspaceFiles/read': { ok: true, result: { absolutePath: '/Users/someone/project/notes.md', version: 'v1', offset: 1, text: 'line one', lines: 1, eof: true } },
    })
    const store = refs(bridge)
    const created = await store.create({ workspaceRoot: '/Users/someone/project', path: 'notes.md' })
    const referenceId = created.reference!.referenceId
    const used = await store.use({ referenceId })
    expect(used).toMatchObject({ state: 'live', code: null, text: 'line one' })
    expect(used.reference?.lastUse).toBe('live')
    expect(bridge.calls.map((entry) => entry.endpoint)).toEqual(['workspaceFiles/stat', 'workspaceFiles/stat', 'workspaceFiles/read'])
    // The read page is asked for explicitly, never left to the provider's defaults.
    expect(bridge.calls[2]?.payload).toEqual([{ workspaceRoot: '/Users/someone/project', path: 'notes.md', range: { offset: 1, limit: 200 } }])
  })

  it('blocks with source-changed and reads nothing when the token moved', async () => {
    let version = 'v1'
    const bridge = recorder({})
    const store = createFileReferences(async (endpoint, payload = []) => {
      bridge.calls.push({ endpoint, payload })
      if (endpoint === 'workspaceFiles/stat') return statOf(version)
      if (endpoint === 'workspaceFiles/read') return { ok: true, result: { version, text: 'should never be read' } }
      return { ok: false, code: 'bridge-answer-unrecognised' }
    }, { now: () => '2026-10-02T12:00:00.000Z', nextId: () => 'ref-1' })
    const created = await store.create({ workspaceRoot: '/Users/someone/project', path: 'notes.md' })
    version = 'v2'
    const used = await store.use({ referenceId: created.reference!.referenceId })
    expect(used).toMatchObject({ state: 'stale', code: 'source-changed', text: null })
    // Blocked before the content read, and the record still points at the version of creation.
    expect(bridge.calls.map((entry) => entry.endpoint)).toEqual(['workspaceFiles/stat', 'workspaceFiles/stat'])
    expect(used.reference?.version).toBe('v1')
    expect(used.reference?.lastUse).toBe('stale')
    // A second use stays blocked and still does not read.
    const again = await store.use({ referenceId: created.reference!.referenceId })
    expect(again).toMatchObject({ state: 'stale', code: 'source-changed' })
    expect(bridge.calls.map((entry) => entry.endpoint)).toEqual(['workspaceFiles/stat', 'workspaceFiles/stat', 'workspaceFiles/stat'])
  })

  it('treats an unreadable source as its own stale reason, never as a deletion claim', async () => {
    let listed = true
    const calls: string[] = []
    const store = createFileReferences(async (endpoint) => {
      calls.push(endpoint)
      if (endpoint === 'workspaceFiles/stat' && listed) return statOf('v1')
      return { ok: false, code: 'bridge-file-not-found' }
    }, { now: () => '2026-10-02T12:00:00.000Z', nextId: () => 'ref-9' })
    const live = await store.create({ workspaceRoot: '/Users/someone/project', path: 'notes.md' })
    listed = false
    const used = await store.use({ referenceId: live.reference!.referenceId })
    expect(used).toMatchObject({ state: 'stale', code: 'source-not-readable', text: null })
    // The refusal is a fact about this attempt: no word in the outcome claims the file is gone.
    expect(JSON.stringify(used)).not.toMatch(/deleted|删除/iu)
    expect(calls).toEqual(['workspaceFiles/stat', 'workspaceFiles/stat'])
  })

  it('treats a read whose own stat moved on as stale instead of handing over mismatched content', async () => {
    const bridge = recorder({})
    const store = createFileReferences(async (endpoint, payload = []) => {
      bridge.calls.push({ endpoint, payload })
      if (endpoint === 'workspaceFiles/stat') return statOf('v1')
      // The read reports a different version: the content no longer matches the token we hold.
      return { ok: true, result: { originalPath: 'x', version: 'v2', text: 'newer content' } }
    }, { now: () => '2026-10-02T12:00:00.000Z', nextId: () => 'ref-1' })
    const created = await store.create({ workspaceRoot: '/Users/someone/project', path: 'notes.md' })
    const used = await store.use({ referenceId: created.reference!.referenceId })
    expect(used).toMatchObject({ state: 'stale', code: 'source-changed', text: null })
  })

  it('reports an unknown reference id instead of inventing a record', async () => {
    const store = refs(recorder({}))
    expect(await store.use({ referenceId: 'nope' })).toMatchObject({ state: 'unknown', code: 'reference-not-found', reference: null })
  })
})

describe('candidates come from the confined listing only', () => {
  it('keeps file entries with their workspace-relative paths and drops directories', async () => {
    const bridge = recorder({
      'workspaceFiles/list': {
        ok: true,
        result: {
          path: 'notes',
          entries: [
            { name: 'plan.md', type: 'file', size: 42 },
            { name: 'sub', type: 'directory' },
            { name: 'link', type: 'other' },
          ],
          truncated: false,
        },
      },
    })
    const status = await createFileCandidates(bridge.call)({ workspaceRoot: '/Users/someone/project', path: 'notes' })
    expect(status).toMatchObject({ state: 'read', path: 'notes', truncated: false })
    expect(status.entries).toEqual([{ name: 'plan.md', path: 'notes/plan.md', bytes: 42 }])
    expect(bridge.calls[0]?.payload).toEqual([{ workspaceRoot: '/Users/someone/project', path: 'notes' }])
  })

  it('lists the workspace root when the path is empty and refuses an outside path without calling', async () => {
    const bridge = recorder({ 'workspaceFiles/list': { ok: true, result: { path: '', entries: [{ name: 'a.md', type: 'file' }], truncated: true } } })
    const list = createFileCandidates(bridge.call)
    const root = await list({ workspaceRoot: '/Users/someone/project', path: '' })
    expect(root.entries).toEqual([{ name: 'a.md', path: 'a.md' }])
    expect(root.truncated).toBe(true)

    expect(await list({ workspaceRoot: '/Users/someone/project', path: '../outside' }))
      .toMatchObject({ state: 'refused', code: 'file-path-outside-workspace', entries: [] })
    expect(bridge.calls).toHaveLength(1)
  })

  it('surfaces the base outside-workspace refusal instead of an empty folder', async () => {
    const bridge = recorder({ 'workspaceFiles/list': { ok: false, code: 'bridge-file-outside-workspace' } })
    expect(await createFileCandidates(bridge.call)({ workspaceRoot: '/Users/someone/project', path: 'notes' }))
      .toMatchObject({ state: 'refused', code: 'bridge-file-outside-workspace', entries: [] })

    const broken = recorder({ 'workspaceFiles/list': { ok: true, result: { path: 'notes' } } })
    expect(await createFileCandidates(broken.call)({ workspaceRoot: '/Users/someone/project', path: 'notes' }))
      .toMatchObject({ state: 'refused', code: 'bridge-answer-unrecognised', entries: [] })
  })
})

describe('the file routes, the state slots and the unavailable-first defaults', () => {
  const post = (path: string, body: string, providers: ReturnType<typeof createUnavailableFirstService>) => handleSageServiceRequest(
    new Request(`dsh-app://app${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body }),
    { callerBinding: { correlation: 'c-013' }, providers } as never,
  )
  const get = (path: string, providers: ReturnType<typeof createUnavailableFirstService>) => handleSageServiceRequest(
    new Request(`dsh-app://app${path}`, { method: 'GET' }),
    { callerBinding: { correlation: 'c-013' }, providers } as never,
  )

  it('parses each of the three bodies exactly and refuses everything else before any provider runs', async () => {
    const seen: string[] = []
    const providers = withProjectionReadTestAdmission(createUnavailableFirstService(null, {
      listFileCandidates: async (request) => {
        seen.push(`candidates:${request.path}`)
        return { state: 'read', code: null, entries: [], truncated: false, path: request.path }
      },
      createFileReference: async (request) => {
        seen.push(`reference:${request.path}`)
        return { state: 'refused', code: 'file-reference-unavailable', reference: null }
      },
      useFileReference: async (request) => {
        seen.push(`use:${request.referenceId}`)
        return { state: 'unknown', code: 'reference-not-found', reference: null, text: null }
      },
    }))

    expect((await post('/.sage/workspace/files/candidates', JSON.stringify({ workspaceRoot: '/root', path: '' }), providers)).status).toBe(200)
    expect((await post('/.sage/workspace/files/reference', JSON.stringify({ workspaceRoot: '/root', path: 'a.md' }), providers)).status).toBe(200)
    expect((await post('/.sage/workspace/files/use', JSON.stringify({ referenceId: 'ref-1' }), providers)).status).toBe(200)
    expect(seen).toEqual(['candidates:', 'reference:a.md', 'use:ref-1'])

    const refused: Array<[string, string]> = [
      ['/.sage/workspace/files/candidates', 'not json'],
      ['/.sage/workspace/files/candidates', JSON.stringify({ workspaceRoot: '', path: 'a.md' })],
      ['/.sage/workspace/files/candidates', JSON.stringify({ workspaceRoot: '/root' })],
      ['/.sage/workspace/files/candidates', JSON.stringify({ workspaceRoot: '/root', path: 'a.md', extra: 1 })],
      ['/.sage/workspace/files/reference', JSON.stringify({ workspaceRoot: '/root', path: 7 })],
      ['/.sage/workspace/files/use', JSON.stringify({ referenceId: '' })],
      ['/.sage/workspace/files/use', JSON.stringify({ referenceId: 'ref-1', extra: true })],
    ]
    for (const [path, body] of refused) {
      const response = await post(path, body, providers)
      expect(response.status, `${path} ${body}`).toBe(400)
      expect(await response.json(), body).toMatchObject({ code: 'invalid-file-request', retryable: false })
    }
    expect(seen).toHaveLength(3)
  })

  it('keeps POST-only and JSON-only transport rules, and answers unavailable-first when unwired', async () => {
    const providers = withProjectionReadTestAdmission(createUnavailableFirstService(null, {}))
    expect((await get('/.sage/workspace/files/candidates', providers)).status).toBe(405)
    const wrongType = await handleSageServiceRequest(
      new Request('dsh-app://app/.sage/workspace/files/use', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' }),
      { callerBinding: { correlation: 'c-013' }, providers } as never,
    )
    expect(wrongType.status).toBe(415)

    expect(await (await post('/.sage/workspace/files/candidates', JSON.stringify({ workspaceRoot: '/root', path: '' }), providers)).json())
      .toEqual({ state: 'refused', code: 'file-candidates-unavailable', entries: [], truncated: false, path: '' })
    expect(await (await post('/.sage/workspace/files/reference', JSON.stringify({ workspaceRoot: '/root', path: 'a.md' }), providers)).json())
      .toEqual({ state: 'refused', code: 'file-reference-unavailable', reference: null })
    expect(await (await post('/.sage/workspace/files/use', JSON.stringify({ referenceId: 'ref-1' }), providers)).json())
      .toEqual({ state: 'unknown', code: 'file-reference-unavailable', reference: null, text: null })
  })

  it('projects the candidates, the reference records and the last use into the state', async () => {
    const bridge = recorder({
      'workspaceFiles/stat': statOf('v1'),
      'workspaceFiles/list': { ok: true, result: { path: '', entries: [{ name: 'a.md', type: 'file' }], truncated: false } },
      'workspaceFiles/read': { ok: true, result: { version: 'v1', text: 'abc' } },
    })
    const store = createFileReferences(bridge.call, { now: () => '2026-10-02T12:00:00.000Z', nextId: () => 'ref-1' })
    const providers = withProjectionReadTestAdmission(createUnavailableFirstService(null, {
      listFileCandidates: createFileCandidates(bridge.call),
      createFileReference: store.create,
      useFileReference: store.use,
      fileReferences: store.list,
    }))
    const created = await (await post('/.sage/workspace/files/reference', JSON.stringify({ workspaceRoot: '/root', path: 'a.md' }), providers)).json() as { reference: { referenceId: string } , state: string }
    expect(created.state).toBe('created')

    const state = await (await get('/.sage/state', providers)).json() as Record<string, unknown>
    expect(state.fileReferences).toEqual([expect.objectContaining({ referenceId: 'ref-1', version: 'v1', lastUse: 'unused' })])
    expect(state.fileReferenceUse).toBeNull()
    expect(state.fileCandidates).toBeNull()

    expect(await (await post('/.sage/workspace/files/candidates', JSON.stringify({ workspaceRoot: '/root', path: '' }), providers)).json())
      .toMatchObject({ state: 'read', entries: [{ name: 'a.md', path: 'a.md' }] })
    expect(await (await post('/.sage/workspace/files/use', JSON.stringify({ referenceId: created.reference.referenceId }), providers)).json())
      .toMatchObject({ state: 'live', text: 'abc' })

    const after = await (await get('/.sage/state', providers)).json() as Record<string, unknown>
    expect(after.fileCandidates).toMatchObject({ state: 'read', path: '' })
    expect(after.fileReferenceUse).toMatchObject({ state: 'live', text: 'abc' })
    expect(after.fileReferences).toEqual([expect.objectContaining({ lastUse: 'live' })])
  })
})
