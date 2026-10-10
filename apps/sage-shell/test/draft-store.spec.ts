import { randomBytes } from 'node:crypto'
import { readdirSync, statSync, writeFileSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createDraftStore, type DraftStore } from '../src/main/draft-store.js'
import { createUnavailableFirstService, PRODUCTION_FAIL_CLOSED_PORTS } from '../src/appservice/composition.js'
import { handleSageServiceRequest } from '../src/appservice/route-skeleton.js'
import { withProjectionReadTestAdmission } from './support/projection-read-test-runner.js'

/**
 * Ticket 002, the draft half (US-004/007/009/010/011).
 *
 * The acceptance lines that live here: a fresh draft never has its fields auto-filled from the
 * organized input, an incomplete draft cannot be converted, a converted draft never reaches the
 * custody side twice, only selected history fragments travel, and while signed out nothing is
 * read or written at all.
 */

const cleanups: Array<() => Promise<void>> = []

afterEach(async () => {
  let cleanup = cleanups.pop()
  while (cleanup !== undefined) {
    await cleanup()
    cleanup = cleanups.pop()
  }
})

async function freshStore(): Promise<{ store: DraftStore, dir: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'sage-draft-'))
  cleanups.push(() => rm(dir, { recursive: true, force: true }))
  let counter = 0
  const store = createDraftStore({
    draftsDir: dir,
    now: () => new Date(1_700_000_000_000 + counter * 1000).toISOString(),
    nextId: () => `id-${String(++counter)}`,
    randomKey: () => randomBytes(32),
  })
  return { store, dir }
}

describe('a fresh draft carries the input as history and fills nothing', () => {
  it('creates an editing draft whose fields are empty even though the input was organized text', async () => {
    const { store } = await freshStore()
    const gate = store.create('帮我把季度复盘整理成对外的交付说明', true)
    expect(gate?.state).toBe('ready')
    const draft = gate?.state === 'ready' ? gate.drafts[0] : undefined
    expect(draft?.status).toBe('editing')
    expect(draft?.matterRef).toBeNull()
    // US-010: the organized result never auto-writes the delivery or responsibility fields.
    expect(draft?.fields).toEqual({ goal: '', deliverable: '', responsibility: '', projectRef: '' })
    expect(draft?.history).toHaveLength(1)
    expect(draft?.history[0]?.text).toContain('季度复盘')
    expect(draft?.history[0]?.selected).toBe(false)
  })

  it('keeps every send as its own history entry, all initially unselected', async () => {
    const { store } = await freshStore()
    const first = store.create('第一段前史', true)
    const draftId = first?.state === 'ready' ? first.drafts[0]!.draftId : ''
    store.create('第二段前史', true)
    const gate = store.list(true)
    expect(gate.state).toBe('ready')
    const draft = gate.state === 'ready' ? gate.drafts.find((entry) => entry.draftId === draftId) : undefined
    expect(draft?.history.map((entry) => entry.text)).toEqual(['第一段前史'])
  })
})

describe('conversion is gated, single-shot and receipt-bound', () => {
  const fill = (store: DraftStore, draftId: string) => store.update(draftId, {
    fields: { goal: '季度复盘', deliverable: '对外交付说明', responsibility: 'role:owner', projectRef: '' },
  }, true)

  it('refuses while any required field is missing, and never builds a request', async () => {
    const { store } = await freshStore()
    const created = store.create('输入', true)
    const draftId = created?.state === 'ready' ? created.drafts[0]!.draftId : ''
    expect(store.prepareConversion(draftId, true)).toEqual({ state: 'incomplete' })
    await store.update(draftId, { fields: { goal: '目标' } }, true)
    expect(store.prepareConversion(draftId, true)).toEqual({ state: 'incomplete' })
    await store.update(draftId, { fields: { deliverable: '交付' } }, true)
    expect(store.prepareConversion(draftId, true)).toEqual({ state: 'incomplete' })
    await fill(store, draftId)
    expect(store.prepareConversion(draftId, true)).toMatchObject({ state: 'ready' })
  })

  it('carries the confirmed fields, the optional single project, and only the selected fragments', async () => {
    const { store } = await freshStore()
    const created = store.create('未选前史：只留本地', true)
    const draftId = created?.state === 'ready' ? created.drafts[0]!.draftId : ''
    const firstEntry = created?.state === 'ready' ? created.drafts[0]!.history[0]!.entryId : ''
    store.update(draftId, { fields: { goal: '季度复盘', deliverable: '对外说明', responsibility: 'role:owner', projectRef: 'project:q3' } }, true)
    store.update(draftId, { selectedEntryIds: [firstEntry] }, true)
    const prepared = store.prepareConversion(draftId, true)
    expect(prepared.state).toBe('ready')
    if (prepared.state !== 'ready') return
    expect(prepared.request.matterId).toBe(`draft:${draftId}`)
    expect(prepared.request.payload).toEqual({
      goal: '季度复盘',
      deliverable: '对外说明',
      responsibleParty: 'role:owner',
      projectRef: 'project:q3',
      attachedFragments: JSON.stringify(['未选前史：只留本地']),
    })

    // An unselected entry never travels; with nothing selected the key is absent entirely.
    const second = store.create('第二条前史', true)
    const otherId = second?.state === 'ready' ? second.drafts.find((draft) => draft.draftId !== draftId)!.draftId : ''
    store.update(otherId, { fields: { goal: 'g', deliverable: 'd', responsibility: 'r' } }, true)
    const plain = store.prepareConversion(otherId, true)
    expect(plain.state === 'ready' ? plain.request.payload : {}).toEqual({ goal: 'g', deliverable: 'd', responsibleParty: 'r' })
    expect(JSON.stringify(plain)).not.toContain('未选前史')
  })

  it('records the receipt once, and a converted draft never converts again', async () => {
    const { store } = await freshStore()
    const created = store.create('输入', true)
    const draftId = created?.state === 'ready' ? created.drafts[0]!.draftId : ''
    await fill(store, draftId)
    const converted = store.commitConversion(draftId, 'receipt:42')
    expect(converted).toMatchObject({ status: 'converted', matterRef: 'receipt:42' })
    // "重开不重复创建": the second attempt is refused locally, before any custody call could happen.
    expect(store.prepareConversion(draftId, true)).toEqual({ state: 'already-converted' })
    // And the fields stay frozen: an update cannot rewrite a converted draft.
    const after = store.update(draftId, { fields: { goal: '改一下' } }, true)
    expect(after?.state === 'ready' ? after.drafts[0]?.fields.goal : undefined).toBe('季度复盘')
  })
})

describe('the device lock (US-011)', () => {
  it('writes ciphertext under a 0600 key and reads nothing while signed out', async () => {
    const { store, dir } = await freshStore()
    const created = store.create('本地草案正文：季度复盘细节', true)
    const draftId = created?.state === 'ready' ? created.drafts[0]!.draftId : ''
    expect(draftId).not.toBe('')

    const files = readdirSync(dir)
    expect(files).toContain('.device-key')
    expect(files.some((name) => name.endsWith('.draft'))).toBe(true)
    const keyMode = statSync(join(dir, '.device-key')).mode & 0o777
    expect(keyMode).toBe(0o600)

    // The draft text is not on disk in the clear — a plain read shows an envelope, not the input.
    const sealed = await readFile(join(dir, `${draftId}.draft`), 'utf8')
    expect(sealed).not.toContain('季度复盘细节')
    expect(JSON.parse(sealed)).toMatchObject({ v: 1 })

    // Locked: nothing is listed, created, updated or converted.
    expect(store.list(false)).toEqual({ state: 'locked' })
    expect(store.create('签到前不许写', false)).toEqual({ state: 'locked' })
    expect(store.update(draftId, { fields: { goal: 'x' } }, false)).toEqual({ state: 'locked' })
    expect(store.prepareConversion(draftId, false)).toEqual({ state: 'locked' })

    // Unlocked again (the same device): the draft comes back exactly as it was.
    const reopened = store.list(true)
    expect(reopened.state).toBe('ready')
    const draft = reopened.state === 'ready' ? reopened.drafts.find((entry) => entry.draftId === draftId) : undefined
    expect(draft?.history[0]?.text).toBe('本地草案正文：季度复盘细节')
  })

  it('reads a record written by an earlier process, and treats a tampered one as absent', async () => {
    const { store, dir } = await freshStore()
    const created = store.create('跨进程草案', true)
    const draftId = created?.state === 'ready' ? created.drafts[0]!.draftId : ''
    let counter = 100
    const reopened = createDraftStore({
      draftsDir: dir,
      now: () => new Date(1_700_000_100_000).toISOString(),
      nextId: () => `id-${String(++counter)}`,
      randomKey: () => randomBytes(32),
    })
    const gate = reopened.list(true)
    expect(gate.state === 'ready' ? gate.drafts.map((draft) => draft.draftId) : []).toEqual([draftId])

    // Tampering the ciphertext makes the record absent rather than partially adopted.
    const path = join(dir, `${draftId}.draft`)
    const envelope = JSON.parse(await readFile(path, 'utf8')) as Record<string, string>
    envelope.data = Buffer.from('tampered').toString('base64')
    writeFileSync(path, JSON.stringify(envelope))
    const after = reopened.list(true)
    expect(after.state === 'ready' ? after.drafts : ['x']).toEqual([])
  })

  it('has no network dependency: nothing in the module can sync a draft', async () => {
    const source = await readFile(new URL('../src/main/draft-store.ts', import.meta.url), 'utf8')
    for (const banned of ['fetch(', 'node:http', 'node:https', 'node:net', 'node:dgram', 'WebSocket']) {
      expect(source.includes(banned), banned).toBe(false)
    }
  })
})

describe('the draft routes and the confirm path through the pipeline (ticket 002)', () => {
  it('parses each draft body exactly, refuses everything else, and answers unavailable-first when unwired', async () => {
    const post = (path: string, body: string, providers: ReturnType<typeof createUnavailableFirstService>) => handleSageServiceRequest(
      new Request(`dsh-app://app${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body }),
      { callerBinding: { correlation: 'c-002' }, providers } as never,
    )
    const seen: string[] = []
    const providers = createUnavailableFirstService(null, {
      draftCreate: (request) => {
        seen.push(`create:${request.rawInput}`)
        return { state: 'unlocked', drafts: [] }
      },
      draftUpdate: (request) => {
        seen.push(`update:${request.draftId}`)
        return { state: 'unlocked', drafts: [] }
      },
      draftPrepareConversion: () => ({ state: 'incomplete' }),
    })
    expect((await post('/.sage/draft/create', JSON.stringify({ rawInput: '需求' }), providers)).status).toBe(200)
    expect((await post('/.sage/draft/update', JSON.stringify({ draftId: 'draft-1', fields: { goal: 'g' } }), providers)).status).toBe(200)
    expect((await post('/.sage/draft/convert', JSON.stringify({ draftId: 'draft-1' }), providers)).status).toBe(200)
    expect(seen).toEqual(['create:需求', 'update:draft-1'])

    const refused: Array<[string, string]> = [
      ['/.sage/draft/create', 'not json'],
      ['/.sage/draft/create', JSON.stringify({ rawInput: '   ' })],
      ['/.sage/draft/create', JSON.stringify({ rawInput: 'x', extra: 1 })],
      ['/.sage/draft/update', JSON.stringify({ draftId: '' })],
      ['/.sage/draft/update', JSON.stringify({ draftId: 'draft-1', fields: { nope: 'x' } })],
      ['/.sage/draft/update', JSON.stringify({ draftId: 'draft-1', clarification: 7 })],
      ['/.sage/draft/update', JSON.stringify({ draftId: 'draft-1', selectedEntryIds: [7] })],
      ['/.sage/draft/convert', JSON.stringify({ draftId: 'draft-1', force: true })],
    ]
    for (const [path, body] of refused) {
      const response = await post(path, body, providers)
      expect(response.status, body).toBe(400)
      expect(await response.json(), body).toMatchObject({ code: 'invalid-draft-request' })
    }

    const unwired = createUnavailableFirstService(null, {})
    expect(await (await post('/.sage/draft/create', JSON.stringify({ rawInput: 'x' }), unwired)).json())
      .toEqual({ state: 'unavailable', drafts: [] })
    expect(await (await post('/.sage/draft/convert', JSON.stringify({ draftId: 'd' }), unwired)).json())
      .toMatchObject({ state: 'refused', code: 'draft-unavailable' })
  })

  it('runs the confirm through the same pipeline: an incomplete gate never reaches it, and a receipt makes the draft converted', async () => {
    const calls: string[] = []
    const providers = createUnavailableFirstService(null, {
      draftPrepareConversion: (request) => {
        calls.push(`prepare:${request.draftId}`)
        return { state: 'ready', request: { draftId: request.draftId, matterId: `draft:${request.draftId}`, revisionId: 'draft-revision:1', payload: { goal: 'g', deliverable: 'd', responsibleParty: 'r' } } }
      },
      draftCommitConversion: (request) => { calls.push(`commit:${request.draftId}:${request.matterRef}`) },
      // A custodian that answers with a receipt: the only shape that settles a creation.
      commandPorts: {
        ...PRODUCTION_FAIL_CLOSED_PORTS,
        resolveIdentityPolicy: () => ({ kind: 'authorized' as const, actor: {}, authoritySnapshot: {} }),
        createMatter: () => ({ receiptRef: 'receipt:42' }),
      },
    })
    const response = await handleSageServiceRequest(
      new Request('dsh-app://app/.sage/draft/convert', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ draftId: 'draft-1' }) }),
      { callerBinding: { correlation: 'c-002' }, providers } as never,
    )
    expect(await response.json()).toEqual({ state: 'converted', draftId: 'draft-1', matterRef: 'receipt:42' })
    expect(calls).toEqual(['prepare:draft-1', 'commit:draft-1:receipt:42'])

    // Without a custodian the very same path answers not-ready — and nothing is committed.
    const noCustodian: string[] = []
    const unwired = createUnavailableFirstService(null, {
      draftPrepareConversion: (request) => ({ state: 'ready', request: { draftId: request.draftId, matterId: `draft:${request.draftId}`, revisionId: 'draft-revision:1', payload: { goal: 'g', deliverable: 'd', responsibleParty: 'r' } } }),
      draftCommitConversion: () => { noCustodian.push('commit') },
      commandPorts: {
        ...PRODUCTION_FAIL_CLOSED_PORTS,
        resolveIdentityPolicy: () => ({ kind: 'authorized' as const, actor: {}, authoritySnapshot: {} }),
      },
    })
    const denied = await handleSageServiceRequest(
      new Request('dsh-app://app/.sage/draft/convert', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ draftId: 'draft-1' }) }),
      { callerBinding: { correlation: 'c-002' }, providers: unwired } as never,
    )
    expect(await denied.json()).toMatchObject({ state: 'denied', code: 'persistence-unavailable', stage: 'create', retryable: true })
    expect(noCustodian).toEqual([])

    // A refused gate never builds an intent or reaches the pipeline.
    const gated = createUnavailableFirstService(null, { draftPrepareConversion: () => ({ state: 'already-converted' }) })
    const refused = await handleSageServiceRequest(
      new Request('dsh-app://app/.sage/draft/convert', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ draftId: 'draft-1' }) }),
      { callerBinding: { correlation: 'c-002' }, providers: gated } as never,
    )
    expect(await refused.json()).toEqual({ state: 'refused', draftId: 'draft-1', code: 'draft-already-converted' })
  })

  it('keeps a real draft editing when custody is absent, without touching local execution rehydrate', async () => {
    const { store } = await freshStore()
    const created = store.create('输入', true)
    const draftId = created?.state === 'ready' ? created.drafts[0]!.draftId : ''
    store.update(draftId, { fields: { goal: 'g', deliverable: 'd', responsibility: 'r' } }, true)
    const commit = vi.fn()
    const strictRehydrate = vi.fn(() => undefined)
    const providers = createUnavailableFirstService(null, {
      draftPrepareConversion: (request) => store.prepareConversion(request.draftId, true),
      draftBeginAttempt: (request) => { store.beginAttempt(request.draftId, request.correlation) },
      draftNoteAttempt: (request) => { store.noteAttempt(request.draftId, request.correlation, request.state) },
      draftCommitConversion: commit,
      commandPorts: {
        ...PRODUCTION_FAIL_CLOSED_PORTS,
        resolveIdentityPolicy: () => ({ kind: 'authorized' as const, actor: {}, authoritySnapshot: {} }),
        // This is the execution-side read port. A create request must not reach it (ADR-0201 D3).
        strictRehydrate,
      },
    })

    const response = await handleSageServiceRequest(
      new Request('dsh-app://app/.sage/draft/convert', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ draftId }),
      }),
      { callerBinding: { correlation: 'c-002-real-draft' }, providers } as never,
    )

    expect(await response.json()).toMatchObject({
      state: 'denied',
      draftId,
      code: 'persistence-unavailable',
      stage: 'create',
      retryable: true,
    })
    expect(commit).not.toHaveBeenCalled()
    expect(strictRehydrate).not.toHaveBeenCalled()

    const reread = store.list(true)
    const draft = reread.state === 'ready' ? reread.drafts.find((entry) => entry.draftId === draftId) : undefined
    expect(draft).toMatchObject({ status: 'editing', matterRef: null, attempt: { state: 'failed' } })
  })
})

describe('the creation attempt: unknown, reconcile, cancel (ticket 003)', () => {
  const fillAndPrepare = async (store: DraftStore) => {
    const created = store.create('输入', true)
    const draftId = created?.state === 'ready' ? created.drafts[0]!.draftId : ''
    store.update(draftId, { fields: { goal: 'g', deliverable: 'd', responsibility: 'r' } }, true)
    return draftId
  }

  it('opens an attempt with its correlation, keeps it open across reads, and closes it on settle', async () => {
    const { store } = await freshStore()
    const draftId = await fillAndPrepare(store)
    const opened = store.beginAttempt(draftId, 'c-1')
    expect(opened?.attempt).toEqual({ correlation: 'c-1', at: expect.any(String), state: 'pending' })
    // The attempt is on disk with the draft: a restart re-reads the same open request.
    const reread = store.list(true)
    const draft = reread.state === 'ready' ? reread.drafts.find((entry) => entry.draftId === draftId) : undefined
    expect(draft?.attempt?.correlation).toBe('c-1')

    const settled = store.commitConversion(draftId, 'receipt:7')
    expect(settled?.status).toBe('converted')
    expect(settled?.attempt).toBeUndefined()
  })

  it('records unknown and failed for the open request only, and never rewrites a newer attempt', async () => {
    const { store } = await freshStore()
    const draftId = await fillAndPrepare(store)
    store.beginAttempt(draftId, 'c-1')
    expect(store.noteAttempt(draftId, 'c-2', 'unknown')?.attempt?.state).toBe('pending')
    expect(store.noteAttempt(draftId, 'c-1', 'unknown')?.attempt?.state).toBe('unknown')
    expect(store.noteAttempt(draftId, 'c-1', 'failed')?.attempt?.state).toBe('failed')
  })

  it('cancels only a pending confirmation, and the draft content is untouched', async () => {
    const { store } = await freshStore()
    const created = store.create('保留这段输入', true)
    const draftId = created?.state === 'ready' ? created.drafts[0]!.draftId : ''
    const entryId = created?.state === 'ready' ? created.drafts[0]!.history[0]!.entryId : ''
    store.update(draftId, { fields: { goal: 'g', deliverable: 'd', responsibility: 'r' }, selectedEntryIds: [entryId] }, true)
    store.beginAttempt(draftId, 'c-1')
    const before = store.list(true).state === 'ready' ? store.list(true).drafts[0]! : undefined

    const cancelled = store.cancelAttempt(draftId)
    expect(cancelled?.attempt).toBeUndefined()
    // Nothing the user typed is lost: fields, history and selection survive the cancel.
    expect(cancelled?.fields).toEqual({ goal: 'g', deliverable: 'd', responsibility: 'r', projectRef: '' })
    expect(cancelled?.history).toEqual(before?.history)
    expect(cancelled?.history[0]?.selected).toBe(true)
    expect(cancelled?.clarification).toBe(before?.clarification)

    // An unknown outcome cannot be "cancelled away": the request may exist on the custody side.
    store.beginAttempt(draftId, 'c-2')
    store.noteAttempt(draftId, 'c-2', 'unknown')
    expect(store.cancelAttempt(draftId)?.attempt?.state).toBe('unknown')
  })
})

describe('the unknown path end to end (US-005/119): inject unknown → reconcile → settled', () => {
  const draftPayload = (overrides: Record<string, unknown> = {}) => ({
    draftId: 'draft-1',
    fields: { goal: 'g', deliverable: 'd', responsibility: 'r', projectRef: '' },
    clarification: '', history: [], status: 'editing', matterRef: null, attempt: null, complete: true,
    createdAt: 'x', updatedAt: 'x', ...overrides,
  })
  const convertBody = JSON.stringify({ draftId: 'draft-1' })
  const route = (path: string, providers: ReturnType<typeof createUnavailableFirstService>) => handleSageServiceRequest(
    new Request(`dsh-app://app${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: path === '/.sage/draft/convert' ? convertBody : JSON.stringify({ draftId: 'draft-1' }) }),
    { callerBinding: { correlation: 'c-003' }, providers } as never,
  )

  it('records the attempt, answers unknown without a receipt, then reconciles to settled — one matter only', async () => {
    const events: string[] = []
    let draft = draftPayload()
    let custodianAnswer: 'unknown' | 'receipt' = 'unknown'
    const providers = createUnavailableFirstService(null, {
      draftList: () => ({ state: 'unlocked', drafts: [draft] as never }),
      draftPrepareConversion: () => ({ state: 'ready', request: { draftId: 'draft-1', matterId: 'draft:draft-1', revisionId: 'draft-revision:1', payload: { goal: 'g', deliverable: 'd', responsibleParty: 'r' } } }),
      draftBeginAttempt: ({ correlation }) => { draft = { ...draft, attempt: { correlation, at: 't', state: 'pending' } }; events.push('begin') },
      draftNoteAttempt: ({ state }) => { draft = { ...draft, attempt: { ...(draft.attempt as object), state } }; events.push(`note:${state}`) },
      draftCommitConversion: ({ matterRef }) => { draft = { ...draft, status: 'converted', matterRef, attempt: null }; events.push('commit') },
      commandPorts: {
        ...PRODUCTION_FAIL_CLOSED_PORTS,
        resolveIdentityPolicy: () => ({ kind: 'authorized' as const, actor: {}, authoritySnapshot: {} }),
        createMatter: () => (custodianAnswer === 'unknown' ? { unknown: true } : { receiptRef: 'receipt:9' }),
      },
      reconcileDraftCreation: ({ correlation }) => {
        events.push(`reconcile:${correlation}`)
        return custodianAnswer === 'receipt'
          ? { state: 'settled' as const, matterRef: 'receipt:9' }
          : { state: 'unknown' as const, code: 'custodian-query-unavailable' }
      },
    })

    const converted = await (await route('/.sage/draft/convert', providers)).json() as Record<string, unknown>
    expect(converted).toMatchObject({ state: 'unknown', draftId: 'draft-1' })
    const correlation = (draft.attempt as { correlation: string }).correlation
    expect(converted.correlation).toBe(correlation)
    expect(converted.matterRef).toBeUndefined()
    expect(draft.status).toBe('editing')

    // The reconcile asks about the same request; before the truth exists it stays unknown.
    expect(await (await route('/.sage/draft/reconcile', providers)).json()).toMatchObject({ state: 'unknown' })
    // The custody side then admits the creation took effect.
    custodianAnswer = 'receipt'
    expect(await (await route('/.sage/draft/reconcile', providers)).json()).toEqual({ state: 'settled', draftId: 'draft-1', matterRef: 'receipt:9' })
    expect(draft).toMatchObject({ status: 'converted', matterRef: 'receipt:9' })
    // Exactly one attempt, two reconciles, one commit — and never a second creation.
    expect(events).toEqual(['begin', 'note:unknown', `reconcile:${correlation}`, `reconcile:${correlation}`, 'commit'])
  })

  it('keeps unknown as its own answer when nothing can be asked, and cancels a pending confirm', async () => {
    const providers = createUnavailableFirstService(null, {
      draftList: () => ({ state: 'unlocked', drafts: [draftPayload({ attempt: { correlation: 'c-1', at: 't', state: 'pending' } })] as never }),
      draftCancelAttempt: () => ({ state: 'unlocked', drafts: [draftPayload()] as never }),
    })
    expect(await (await route('/.sage/draft/reconcile', providers)).json()).toMatchObject({ state: 'unknown', code: 'reconcile-unavailable' })
    expect(await (await route('/.sage/draft/cancel', providers)).json()).toMatchObject({ state: 'unlocked' })
  })
})

describe('the pipeline keeps an unconfirmed creation unretryable (US-119)', () => {
  it('answers outcome-unknown with retryable=false when the custodian cannot confirm', async () => {
    const { runCommand } = await import('../src/appservice/command-pipeline.js')
    const result = runCommand({
      correlation: 'c-unknown',
      intent: {
        matterId: 'draft:draft-1', revisionId: 'draft-revision:1', actionType: 'create-matter',
        actionScope: 'revision', payload: { goal: 'g', deliverable: 'd', responsibleParty: 'r' }, origin: 'renderer-action',
      },
      ports: {
        ...PRODUCTION_FAIL_CLOSED_PORTS,
        resolveIdentityPolicy: () => ({ kind: 'authorized' as const, actor: {}, authoritySnapshot: {} }),
        createMatter: () => ({ unknown: true }),
      },
    } as never)
    expect(result).toMatchObject({ code: 'outcome-unknown', stage: 'create', retryable: false })
    // And the classifier turns that into the shell's own unknown state, where 核对 is the only entry.
    const outcome = withProjectionReadTestAdmission(createUnavailableFirstService(null, { commandPorts: {
      ...PRODUCTION_FAIL_CLOSED_PORTS,
      resolveIdentityPolicy: () => ({ kind: 'authorized' as const, actor: {}, authoritySnapshot: {} }),
      createMatter: () => ({ unknown: true }),
    } }))
    await outcome.dispatch({
      matterId: 'draft:draft-1', revisionId: 'draft-revision:1', actionType: 'create-matter',
      actionScope: 'revision', payload: { goal: 'g', deliverable: 'd', responsibleParty: 'r' }, origin: 'renderer-action',
    })
    const state = await (await handleSageServiceRequest(
      new Request('dsh-app://app/.sage/state', { method: 'GET' }),
      { callerBinding: { correlation: 'c-003' }, providers: outcome } as never,
    )).json() as { service: { command: { outcome: string, retryable: boolean } } }
    expect(state.service.command).toMatchObject({ outcome: 'unknown', retryable: false })
  })
})
