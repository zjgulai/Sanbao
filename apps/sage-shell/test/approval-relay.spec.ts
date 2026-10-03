import { describe, expect, it, vi } from 'vitest'

import {
  APPROVAL_RELAY_SERVICE,
  createApprovalRelay,
  installApprovalRelay,
} from '../src/host/approval-relay.js'

/**
 * Ticket 041 at the relay core: the shell's answerer for `approval/request`.
 *
 * The acceptance lines: a wait exists exactly while its waterfall is blocked on the relay (the
 * pending list is that truth); the ONLY outcomes this relay can produce from a user action are
 * the base's closed vocabulary — `allowed-once` (the one-shot grant) and `rejected`, plus the
 * withdraw path's `cancelled` — never anything else, and never a manufactured grant; abort and
 * teardown settle `cancelled` instead of leaving a tool blocked; and only agent-bonded requests
 * are claimed (agent id IS the session id).
 */

const request = (overrides: Record<string, unknown> = {}) => ({
  agent: { id: 'session-1' },
  toolName: 'mcp__shell__run',
  callId: 'call-1',
  reason: '该工具将执行受控命令',
  ...overrides,
}) as Parameters<ReturnType<typeof createApprovalRelay>['claim']>[0]

function makeRelay() {
  let counter = 0
  return createApprovalRelay({ now: () => '2026-10-03T12:00:00.000Z', mintId: () => `appr-${String(++counter)}` })
}

describe('the approval relay (ticket 041)', () => {
  it('claims an agent-bonded request, lists it with scope and source, and resolves the user decision', async () => {
    const relay = makeRelay()
    const claimed = relay.claim(request())
    expect(claimed).toBeDefined()
    expect(relay.list('session-1').pending).toEqual([
      {
        requestId: 'appr-1',
        sessionId: 'session-1',
        toolName: 'mcp__shell__run',
        callId: 'call-1',
        reason: '该工具将执行受控命令',
        withdrawable: true,
        raisedAt: '2026-10-03T12:00:00.000Z',
      },
    ])
    expect(relay.list('other-session').pending).toEqual([])

    expect(relay.answer('appr-1', 'allowed-once')).toEqual({ ok: true })
    await expect(claimed).resolves.toBe('allowed-once')
    // A resolved wait is no longer pending, and answering again is not-found — never a replay.
    expect(relay.list('session-1').pending).toEqual([])
    expect(relay.answer('appr-1', 'allowed-once')).toEqual({ ok: false, code: 'approval-not-found' })
  })

  it('delegates requests it cannot own, and refuses every non-decision word', async () => {
    const relay = makeRelay()
    expect(relay.claim(request({ agent: undefined }))).toBeUndefined()
    expect(relay.claim(request({ agent: { id: '' } }))).toBeUndefined()
    expect(relay.claim(request({ toolName: undefined }))).toBeUndefined()
    expect(relay.claim(request({ toolName: '   ' }))).toBeUndefined()

    const claimed = relay.claim(request())
    expect(claimed).toBeDefined()
    // Rogue values can never ride the waterfall out of this relay.
    expect(relay.answer('appr-1', 'approved')).toEqual({ ok: false, code: 'approval-outcome-invalid' })
    expect(relay.answer('appr-1', 'cancelled')).toEqual({ ok: false, code: 'approval-outcome-invalid' })
    expect(relay.answer('appr-1', undefined)).toEqual({ ok: false, code: 'approval-outcome-invalid' })
    expect(relay.list('session-1').pending).toHaveLength(1)
    expect(relay.answer('appr-1', 'rejected')).toEqual({ ok: true })
    await expect(claimed).resolves.toBe('rejected')
  })

  it('withdraws by resolving the closed cancelled outcome — the tool stays undespatched', async () => {
    const relay = makeRelay()
    const claimed = relay.claim(request())
    expect(relay.withdraw('appr-1')).toEqual({ ok: true })
    await expect(claimed).resolves.toBe('cancelled')
    expect(relay.list('session-1').pending).toEqual([])
    // A withdraw is not an answer: nothing can be answered after it.
    expect(relay.answer('appr-1', 'allowed-once')).toEqual({ ok: false, code: 'approval-not-found' })
    expect(relay.withdraw('appr-1')).toEqual({ ok: false, code: 'approval-not-found' })
  })

  it('an asker-side abort settles the wait cancelled and drops the entry', async () => {
    const relay = makeRelay()
    const preAborted = new AbortController()
    preAborted.abort()
    const before = relay.claim(request({ signal: preAborted.signal }))
    await expect(before).resolves.toBe('cancelled')
    expect(relay.list('session-1').pending).toEqual([])

    const controller = new AbortController()
    const during = relay.claim(request({ signal: controller.signal }))
    expect(relay.list('session-1').pending).toHaveLength(1)
    controller.abort()
    await expect(during).resolves.toBe('cancelled')
    expect(relay.list('session-1').pending).toEqual([])
    expect(relay.answer('appr-1', 'allowed-once')).toEqual({ ok: false, code: 'approval-not-found' })
  })

  it('teardown settles every pending wait cancelled — fail closed, never a grant', async () => {
    const relay = makeRelay()
    const first = relay.claim(request())
    const second = relay.claim(request({ toolName: 'mcp__shell__write' }))
    relay.dispose()
    await expect(first).resolves.toBe('cancelled')
    await expect(second).resolves.toBe('cancelled')
    expect(relay.list('session-1').pending).toEqual([])
  })

  it('installs with prepend and provides the service name the bridge reads', async () => {
    const relay = makeRelay()
    const provide = vi.fn()
    installApprovalRelay({ provide, on: vi.fn() } as never, relay)
    expect(provide).toHaveBeenCalledWith(APPROVAL_RELAY_SERVICE, relay)
    // Re-run the installer against a capturing ctx to inspect the listener contract.
    const captured: { name: string, listener: (request: unknown, next: () => Promise<string>) => Promise<string>, options?: { prepend?: boolean } }[] = []
    const capturingCtx = {
      provide: vi.fn(),
      on: (name: string, listener: (request: unknown, next: () => Promise<string>) => Promise<string>, options?: { prepend?: boolean }) => {
        captured.push({ name, listener, options })
        return name
      },
    }
    installApprovalRelay(capturingCtx as never, relay)
    expect(captured).toHaveLength(1)
    expect(captured[0]?.name).toBe('approval/request')
    expect(captured[0]?.options).toEqual({ prepend: true })

    // The listener claims ours and delegates the rest — never both.
    const ours = captured[0]!.listener(request(), () => Promise.resolve('unavailable'))
    expect(relay.list('session-1').pending).toHaveLength(1)
    expect(await captured[0]!.listener(request({ agent: undefined }), () => Promise.resolve('unavailable'))).toBe('unavailable')
    expect(relay.answer('appr-1', 'rejected')).toEqual({ ok: true })
    await expect(ours).resolves.toBe('rejected')
  })
})
