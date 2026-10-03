import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { createUnavailableFirstService } from '../src/appservice/composition.js'
import { handleSageServiceRequest } from '../src/appservice/route-skeleton.js'
import { createSessionEdits } from '../src/main/session-edits.js'

/**
 * Ticket 036 (US-185~187) at the module and route seams.
 *
 * The acceptance lines: an edit produces versions while the original stays untouched; the resend
 * rides the SAME command entry with one identity per version (repeat clicks converge, never
 * parallel); an unknown outcome offers verification only — no auto retry and no way back into the
 * resendable queue until an explicit check confirms it never landed.
 */

const cleanups: Array<() => Promise<void>> = []

afterEach(async () => {
  let cleanup = cleanups.pop()
  while (cleanup !== undefined) {
    await cleanup()
    cleanup = cleanups.pop()
  }
})

async function harness(options: { readonly bindings?: boolean } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'sage-edits-'))
  cleanups.push(() => rm(dir, { recursive: true, force: true }))
  const bindingsFile = join(dir, 'sessions', 'bindings.json')
  if (options.bindings !== false) {
    await writeFile(bindingsFile, JSON.stringify({ 'matter:1': 'session-1' }), { mode: 0o600 }).catch(async () => {
      const { mkdir } = await import('node:fs/promises')
      await mkdir(join(dir, 'sessions'), { recursive: true })
      await writeFile(bindingsFile, JSON.stringify({ 'matter:1': 'session-1' }), { mode: 0o600 })
    })
  }
  const transcript = [
    { role: 'user' as const, text: '原来的要求', source: 'echo' as const, messageRef: 'req-original-1' },
    { role: 'assistant' as const, text: '答复', source: 'history' as const },
  ]
  const sends: Array<{ matterRef: string, workspaceRoot: string, text: string, requestId: string }> = []
  const sendResponses: Array<unknown> = []
  const bridgeCalls: Array<{ endpoint: string, payload: unknown }> = []
  const pageResponses: Array<unknown> = []
  let idCounter = 0
  const store = createSessionEdits({
    now: () => '2026-10-03T12:00:00.000Z',
    nextId: () => `id-${String(++idCounter)}`,
    transcriptOf: () => transcript,
    send: async (input) => {
      sends.push({ ...input })
      return (sendResponses.shift() ?? { state: 'accepted' }) as { state: string, code?: string }
    },
    callBridge: async (endpoint, payload = []) => {
      bridgeCalls.push({ endpoint, payload })
      return pageResponses.shift() ?? { ok: true, result: { records: [], hasMore: false } }
    },
    bindingsFile,
  })
  return { store, sends, sendResponses, bridgeCalls, pageResponses, transcript }
}

const userMessage = (rpcId: string) => ({ type: 'event', event: { seq: 5, type: 'user/message', data: { source: { kind: 'user', rpcId }, message: { content: [{ type: 'text', text: 'x' }] } } } })

describe('the sent-message edit store (ticket 036)', () => {
  it('saves versions while the original text stays untouched (US-185)', async () => {
    const h = await harness()
    const first = h.store.save({ matterRef: 'matter:1', messageRef: 'req-original-1', text: '改过的要求 v1' })
    expect(first).toMatchObject({ state: 'saved', record: { messageRef: 'req-original-1', originalText: '原来的要求', activeVersion: 1 } })
    const second = h.store.save({ matterRef: 'matter:1', messageRef: 'req-original-1', text: '再改一版 v2' })
    expect(second).toMatchObject({ state: 'saved', record: { originalText: '原来的要求', activeVersion: 2 } })
    if (second.state !== 'saved') return
    expect(second.record.versions.map((version) => [version.version, version.text])).toEqual([[1, '改过的要求 v1'], [2, '再改一版 v2']])
    // 保存只动版本链：零桥调用。
    expect(h.bridgeCalls).toEqual([])
    expect(h.sends).toEqual([])
  })

  it('refuses bad saves: unknown message, blank text, oversize text', async () => {
    const h = await harness()
    expect(h.store.save({ matterRef: 'matter:1', messageRef: 'req-missing', text: 'x' })).toEqual({ state: 'refused', code: 'edit-message-not-found' })
    expect(h.store.save({ matterRef: 'matter:1', messageRef: 'req-original-1', text: '   ' })).toEqual({ state: 'refused', code: 'edit-text-invalid' })
    expect(h.store.save({ matterRef: 'matter:1', messageRef: 'req-original-1', text: 'x'.repeat(16_385) })).toEqual({ state: 'refused', code: 'edit-text-invalid' })
    expect(h.sends).toEqual([])
  })

  it('resends through the same send entry with one identity per version; repeat clicks converge, the original is never re-sent (US-186)', async () => {
    const h = await harness()
    h.store.save({ matterRef: 'matter:1', messageRef: 'req-original-1', text: '第一版编辑' })
    const first = await h.store.resend({ matterRef: 'matter:1', editId: 'edit-id-1', workspaceRoot: '/w' })
    expect(first).toMatchObject({ state: 'recorded', version: { version: 1, submission: 'accepted' } })
    expect(h.sends).toHaveLength(1)
    expect(h.sends[0]).toMatchObject({ text: '第一版编辑', workspaceRoot: '/w' })
    expect(h.sends[0]?.requestId).toBe('edit-id-1-v1')
    // 原消息标识从不作为重发身份出现（原消息不重复派发）。
    expect(h.sends[0]?.requestId).not.toBe('req-original-1')

    const repeat = await h.store.resend({ matterRef: 'matter:1', editId: 'edit-id-1', workspaceRoot: '/w' })
    expect(repeat).toEqual(first)
    expect(h.sends).toHaveLength(1)

    // 新版本用新身份；同版本重复点击仍不二次派发。
    h.store.save({ matterRef: 'matter:1', messageRef: 'req-original-1', text: '第二版编辑' })
    await h.store.resend({ matterRef: 'matter:1', editId: 'edit-id-1', workspaceRoot: '/w' })
    expect(h.sends).toHaveLength(2)
    expect(h.sends[1]?.requestId).toBe('edit-id-1-v2')
    expect(h.sends[1]?.text).toBe('第二版编辑')
  })

  it('refuses a second resend while one is in flight (重复点击不并行发起)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sage-edits-gate-'))
    cleanups.push(() => rm(dir, { recursive: true, force: true }))
    const bindingsFile = join(dir, 'bindings.json')
    await writeFile(bindingsFile, JSON.stringify({ 'matter:1': 'session-1' }), { mode: 0o600 })
    const gateSends: string[] = []
    let releaseGate: () => void = () => {}
    const gateStore = createSessionEdits({
      now: () => 't',
      nextId: () => 'g-1',
      transcriptOf: () => [{ role: 'user', text: '原来的要求', source: 'echo', messageRef: 'req-original-1' }],
      send: (input) => {
        gateSends.push(input.requestId)
        return new Promise((resolve) => { releaseGate = () => resolve({ state: 'accepted' }) })
      },
      callBridge: async () => ({ ok: true, result: { records: [], hasMore: false } }),
      bindingsFile,
    })
    gateStore.save({ matterRef: 'matter:1', messageRef: 'req-original-1', text: 'v1' })
    const inflight = gateStore.resend({ matterRef: 'matter:1', editId: 'edit-g-1', workspaceRoot: '/w' })
    const second = await gateStore.resend({ matterRef: 'matter:1', editId: 'edit-g-1', workspaceRoot: '/w' })
    expect(second).toEqual({ state: 'refused', code: 'edit-inflight' })
    expect(gateSends).toEqual(['edit-g-1-v1'])
    releaseGate()
    await expect(inflight).resolves.toMatchObject({ state: 'recorded', version: { submission: 'accepted' } })
  })

  it('unknown stays unknown: verify-only, no auto retry, and the version is not back in the resend queue (US-187)', async () => {
    const h = await harness()
    h.store.save({ matterRef: 'matter:1', messageRef: 'req-original-1', text: 'v1' })
    h.sendResponses.push({ state: 'refused', code: 'bridge-host-not-ready' })
    const outcome = await h.store.resend({ matterRef: 'matter:1', editId: 'edit-id-1', workspaceRoot: '/w' })
    expect(outcome).toMatchObject({ state: 'recorded', version: { submission: 'unknown', code: 'bridge-host-not-ready' } })
    // 复核前不可再发：不给重试、不放回可重发队列。
    expect(await h.store.resend({ matterRef: 'matter:1', editId: 'edit-id-1', workspaceRoot: '/w' })).toEqual({ state: 'refused', code: 'edit-verify-required' })
    expect(h.sends).toHaveLength(1)

    // 核对：窗口无该身份 → not-delivered（只有显式核对之后才可再次显式重发）。
    const checked = await h.store.verify({ matterRef: 'matter:1', editId: 'edit-id-1' })
    expect(checked).toMatchObject({ state: 'checked', version: { submission: 'not-delivered' } })
    expect(h.bridgeCalls.map((call) => call.endpoint)).toEqual(['session/page'])
    h.sendResponses.push({ state: 'accepted' })
    const again = await h.store.resend({ matterRef: 'matter:1', editId: 'edit-id-1', workspaceRoot: '/w' })
    expect(again).toMatchObject({ state: 'recorded', version: { submission: 'accepted' } })
    expect(h.sends).toHaveLength(2)
    // 同一版本仍是同一身份（基座按 rpcId 去重）。
    expect(h.sends[1]?.requestId).toBe(h.sends[0]?.requestId)
  })

  it('verify finds the landed identity (effective) or keeps an admitted version accepted', async () => {
    const h = await harness()
    h.store.save({ matterRef: 'matter:1', messageRef: 'req-original-1', text: 'v1' })
    await h.store.resend({ matterRef: 'matter:1', editId: 'edit-id-1', workspaceRoot: '/w' })
    h.pageResponses.push({ ok: true, result: { records: [userMessage('edit-id-1-v1')], hasMore: false } })
    const landed = await h.store.verify({ matterRef: 'matter:1', editId: 'edit-id-1' })
    expect(landed).toMatchObject({ state: 'checked', version: { submission: 'effective' }, code: null })

    const h2 = await harness()
    h2.store.save({ matterRef: 'matter:1', messageRef: 'req-original-1', text: 'v1' })
    await h2.store.resend({ matterRef: 'matter:1', editId: 'edit-id-1', workspaceRoot: '/w' })
    h2.pageResponses.push({ ok: true, result: { records: [], hasMore: false } })
    const waiting = await h2.store.verify({ matterRef: 'matter:1', editId: 'edit-id-1' })
    expect(waiting).toMatchObject({ state: 'checked', version: { submission: 'accepted' }, code: 'edit-version-not-visible' })

    // 不存在的记录没有可核对的东西。
    await expect(h2.store.verify({ matterRef: 'matter:1', editId: 'edit-nope' })).resolves.toEqual({ state: 'refused', code: 'edit-not-found' })
  })

  it('a paused resend is refused outright so no half-kept identity is parked (FW-002 boundary)', async () => {
    const h = await harness()
    h.store.save({ matterRef: 'matter:1', messageRef: 'req-original-1', text: 'v1' })
    h.sendResponses.push({ state: 'deferred' })
    expect(await h.store.resend({ matterRef: 'matter:1', editId: 'edit-id-1', workspaceRoot: '/w' })).toEqual({ state: 'refused', code: 'edit-paused' })
    // 版本回到未提交（没有伪装成已接收）。
    expect(h.store.status('matter:1').records[0]?.versions[0]).toMatchObject({ submission: 'unsent', submittedAt: null, code: 'edit-paused' })
  })
})

describe('the edits route (ticket 036)', () => {
  it('parses exactly, forwards, and keeps an unwired family honest', async () => {
    const seen: unknown[] = []
    const providers = createUnavailableFirstService(null, {
      sessionEditsSave: (request) => { seen.push({ save: request }); return { state: 'refused', code: 'marker-save' } },
      sessionEditsResend: async (request) => { seen.push({ resend: request }); return { state: 'refused', code: 'marker-resend' } },
      sessionEditsVerify: async (request) => { seen.push({ verify: request }); return { state: 'refused', code: 'marker-verify' } },
    })
    const post = (body: unknown) => handleSageServiceRequest(
      new Request('dsh-app://app/.sage/session/edits', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      { callerBinding: { correlation: 'c-036' }, providers } as never,
    )
    expect(await (await post({ action: 'save', messageRef: 'r-1', text: 't' })).json()).toMatchObject({ code: 'marker-save' })
    expect(await (await post({ action: 'resend', editId: 'e-1', workspaceRoot: '/w' })).json()).toMatchObject({ code: 'marker-resend' })
    expect(await (await post({ action: 'verify', editId: 'e-1' })).json()).toMatchObject({ code: 'marker-verify' })
    expect(seen).toEqual([
      { save: { action: 'save', messageRef: 'r-1', text: 't' } },
      { resend: { action: 'resend', editId: 'e-1', workspaceRoot: '/w' } },
      { verify: { action: 'verify', editId: 'e-1' } },
    ])
    expect((await post({ action: 'save', messageRef: 'r-1' })).status).toBe(400)
    expect((await post({ action: 'save', messageRef: '', text: 't' })).status).toBe(400)
    // 超出请求体上限的载荷在传输层就被挡（413），连解析都到不了；模块层另有 16,384 上限拒绝。
    expect((await post({ action: 'save', messageRef: 'r-1', text: 'x'.repeat(16_385) })).status).toBe(413)
    expect((await post({ action: 'resend', editId: 'e-1', extra: 1 })).status).toBe(400)
    expect((await post({ action: 'verify', editId: 'e-1', extra: 1 })).status).toBe(400)
    expect((await post({ action: 'nope' })).status).toBe(400)

    const unwired = createUnavailableFirstService(null, {})
    const postUnwired = (body: unknown) => handleSageServiceRequest(
      new Request('dsh-app://app/.sage/session/edits', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      { callerBinding: { correlation: 'c-036' }, providers: unwired } as never,
    )
    expect(await (await postUnwired({ action: 'save', messageRef: 'r-1', text: 't' })).json()).toMatchObject({ code: 'session-edits-unavailable' })
    expect(await (await postUnwired({ action: 'resend', editId: 'e-1' })).json()).toMatchObject({ code: 'session-edits-unavailable' })
    expect(await (await postUnwired({ action: 'verify', editId: 'e-1' })).json()).toMatchObject({ code: 'session-edits-unavailable' })
  })
})
