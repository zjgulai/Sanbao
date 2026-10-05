import { afterEach, describe, expect, it, vi } from 'vitest'
import { classifyDesktopState } from '../src/product/app/desktop/client.js'
import { parseDesktopSession, submitDesktopSession } from '../src/product/app/desktop/session.js'
import { createUnavailableFirstService } from '../src/appservice/composition.js'
import { handleSageServiceRequest } from '../src/appservice/route-skeleton.js'
import { desktopSessionPayload } from './support/desktop-session-fixture.js'

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

function session() {
  const parsed = parseDesktopSession(desktopSessionPayload())
  expect(parsed).not.toBeNull()
  return parsed!
}

describe('desktop session projection binding', () => {
  it('keeps only the current service-bound transcript and request candidate', () => {
    const parsed = session()
    expect(parsed.title).toBe('核对清单')
    expect(parsed.context).toEqual({ matterRef: 'matter:one', revisionRef: 'revision:one', workspaceRef: 'workspace:one', workspaceRoot: '/controlled/workspace', contextGeneration: 3, frameGeneration: 5, sessionId: 'session:one' })
    expect(parsed.messages).toEqual([{ role: 'user', text: '实际问题' }, { role: 'assistant', text: '实际回复' }])
    expect(parsed.execution).toBe('idle')
    expect(parsed.canSubmit).toBe(true)
    expect(JSON.stringify(parsed)).not.toContain('private-actor')
    expect(classifyDesktopState(desktopSessionPayload())).toMatchObject({ kind: 'read', session: parsed })
  })

  it('rejects fixtures, wrong context and missing or ambiguous workspace bindings', () => {
    const base = desktopSessionPayload()
    for (const value of [
      { ...base, matter: { ...base.matter, projectionSource: 'fixture' } },
      { ...base, activeContext: { ...base.activeContext, matterId: 'other' } },
      { ...base, activeContext: { ...base.activeContext, revisionId: 'other' } },
      { ...base, activeContext: { ...base.activeContext, contextGeneration: -1 } },
      { ...base, activeContext: { state: 'inactive', contextGeneration: 3 } },
      { ...base, workspaces: { ...base.workspaces, entries: [] } },
      { ...base, workspaces: { ...base.workspaces, entries: [...base.workspaces.entries, ...base.workspaces.entries] } },
      { ...base, matterLinks: { ...base.matterLinks, links: [] } },
      { ...base, sessionChannel: { ...base.sessionChannel, state: 'unavailable' } },
      { ...base, sessionChannel: { ...base.sessionChannel, execution: 'running' } },
      { ...base, sessionChannel: { ...base.sessionChannel, transcript: [{ role: 'system', text: 'bad' }] } },
      { ...base, service: { ...base.service, auth: { status: 'signed-out', displayName: null } } },
    ]) expect(parseDesktopSession(value)).toBeNull()
  })

  it('does not turn a readable session into permission to submit when actionability is blocked', () => {
    const base = desktopSessionPayload()
    const parsed = parseDesktopSession({ ...base, matter: { ...base.matter, actionability: 'blocked', denialReason: 'authorization-required' } })
    expect(parsed?.canSubmit).toBe(false)
    expect(parsed?.messages).toHaveLength(2)
  })

  it('supports no-session without inventing a session reference or messages', () => {
    const base = desktopSessionPayload()
    const input = { ...base, sessionChannel: { ...base.sessionChannel, state: 'no-session', sessionId: null, transcript: [], lastTurnEnd: null } }
    expect(parseDesktopSession(input)).toMatchObject({ context: { sessionId: null }, messages: [] })
    expect(parseDesktopSession({ ...input, sessionChannel: { ...input.sessionChannel, transcript: base.sessionChannel.transcript } })).toBeNull()
  })
})

describe('existing session routes from the desktop', () => {
  it('posts the exact send candidate and treats accepted as inbox acknowledgement only', async () => {
    const seen: unknown[] = []
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      seen.push([url, init.method, JSON.parse(String(init.body))])
      return Response.json({ state: 'accepted', sessionId: 'session:one', requestId: 'request:one', mode: 'queue' })
    })
    expect(await submitDesktopSession(session(), { kind: 'send', text: '问题' })).toEqual({ kind: 'accepted', sessionId: 'session:one', requestId: 'request:one' })
    expect(seen).toEqual([['/.sage/session/send', 'POST', { matterRef: 'matter:one', workspaceRoot: '/controlled/workspace', text: '问题', mode: 'queue' }]])
  })

  it('retains the distinction between deferred and accepted', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ state: 'deferred', itemId: 'pending:one' }))
    expect(await submitDesktopSession(session(), { kind: 'send', text: '问题' })).toEqual({ kind: 'deferred', itemId: 'pending:one' })
  })

  it('uses real route and composition refusal without calling the raw session provider', async () => {
    const raw = vi.fn()
    const providers = createUnavailableFirstService(null, { sessionSend: raw, sessionStop: raw, sessionResume: raw })
    vi.stubGlobal('fetch', (url: string, init: RequestInit) => handleSageServiceRequest(new Request(`dsh-app://app${url}`, init), { callerBinding: { correlation: 'read:one' }, providers }))
    expect(await submitDesktopSession(session(), { kind: 'send', text: '问题' })).toEqual({ kind: 'refused', code: 'protected-effect-unavailable' })
    expect(raw).not.toHaveBeenCalled()
  })

  it('does not send missing-context, blank, blocked or oversized requests', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    expect(await submitDesktopSession(null, { kind: 'send', text: '问题' })).toEqual({ kind: 'refused', code: 'session-context-unavailable' })
    expect(await submitDesktopSession(session(), { kind: 'send', text: '  ' })).toEqual({ kind: 'refused', code: 'invalid-session-request' })
    expect(await submitDesktopSession({ ...session(), canSubmit: false }, { kind: 'send', text: '问题' })).toEqual({ kind: 'refused', code: 'session-context-unavailable' })
    expect(await submitDesktopSession(session(), { kind: 'send', text: '中'.repeat(2000) })).toEqual({ kind: 'refused', code: 'request-too-large' })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('never treats unknown refusals, wrong-session receipts or transport loss as a safe retry', async () => {
    for (const response of [
      { state: 'refused', code: 'protected-effect-outcome-unknown' },
      { state: 'refused', code: 'unexpected-private-detail' },
      { state: 'accepted', sessionId: 'other', requestId: 'request:one', mode: 'queue' },
      { state: 'accepted' },
    ]) {
      vi.stubGlobal('fetch', async () => Response.json(response))
      expect(await submitDesktopSession(session(), { kind: 'send', text: '问题' })).toEqual({ kind: 'unknown' })
    }
    vi.stubGlobal('fetch', async () => { throw new Error('private-timeout') })
    expect(await submitDesktopSession(session(), { kind: 'send', text: '问题' })).toEqual({ kind: 'unknown' })
  })

  it('accepts a determinate stop/resume receipt whose queue reconciliation is unavailable', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ state: 'stopped', paused: true, drained: [], consumed: [], dispatched: [], code: 'queue-read-unavailable' }))
    expect(await submitDesktopSession({ ...session(), execution: 'executing' as const }, { kind: 'stop' })).toEqual({ kind: 'settled', action: 'stop', interrupted: false })
    vi.stubGlobal('fetch', async () => Response.json({ state: 'resumed', paused: false, drained: [], consumed: [], dispatched: [], code: 'queue-read-unavailable' }))
    expect(await submitDesktopSession({ ...session(), paused: true }, { kind: 'resume' })).toEqual({ kind: 'settled', action: 'resume', interrupted: false })
    vi.stubGlobal('fetch', async () => Response.json({ state: 'stopped', paused: true, drained: [], consumed: [], dispatched: [], code: 42 }))
    expect(await submitDesktopSession({ ...session(), execution: 'executing' as const }, { kind: 'stop' })).toEqual({ kind: 'unknown' })
  })

  it('keeps stop/resume receipts separate from execution state and uses the exact routes', async () => {
    const seen: unknown[] = []
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      seen.push([url, JSON.parse(String(init.body))])
      return Response.json({ state: url.endsWith('stop') ? 'stopped' : 'resumed', paused: url.endsWith('stop'), drained: [], consumed: [], dispatched: [], code: null })
    })
    const running = { ...session(), execution: 'executing' as const }
    expect(await submitDesktopSession(running, { kind: 'stop' })).toEqual({ kind: 'settled', action: 'stop', interrupted: false })
    expect(await submitDesktopSession({ ...session(), paused: true }, { kind: 'resume' })).toEqual({ kind: 'settled', action: 'resume', interrupted: false })
    expect(seen).toEqual([['/.sage/session/stop', { matterRef: 'matter:one' }], ['/.sage/session/resume', { matterRef: 'matter:one', workspaceRoot: '/controlled/workspace' }]])
  })
})
