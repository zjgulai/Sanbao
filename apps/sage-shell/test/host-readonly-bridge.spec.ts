import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { PassThrough } from 'node:stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }))

vi.mock('node:child_process', () => ({ spawn: spawnMock }))

import { ShellHostProcess } from '../src/main/host-process.js'
import {
  HostRequestDecoder,
  SHELL_HOST_PROTOCOL_VERSION,
  encodeRequestStart,
  isHostCommand,
  isHostEvent,
} from '../src/protocol.js'
import { BRIDGE_ENDPOINTS, resolveBridgeCall, resolveBridgeStreamCall } from '../src/host/bridge-endpoints.js'
import { createAttachmentUploads } from '../src/host/attachment-uploads.js'
import { USER_QUESTIONS_RELAY_SERVICE } from '../src/host/user-questions-relay.js'
import { APPROVAL_RELAY_SERVICE } from '../src/host/approval-relay.js'
import type { HostRuntime } from '../src/main/runtime.js'

class FakeChild extends EventEmitter {
  readonly stdout = new PassThrough()
  readonly stderr = new PassThrough()
  readonly requestPipe = new PassThrough()
  readonly responsePipe = new PassThrough()
  readonly stdio = [null, this.stdout, this.stderr, this.requestPipe, this.responsePipe]
  connected = true
  readonly send = vi.fn()
  readonly kill = vi.fn()
}

const runtime: HostRuntime = {
  node: '/opt/node',
  entry: '/profile/sage-host/host/index.js',
  sageRoot: '/sage',
  profileDir: '/sage/profiles/sage-dev',
  expectedProfileGeneration: 'sage-dev',
  expectedManifestSha256: 'a'.repeat(64),
  env: {},
}

const ready = {
  type: 'ready' as const,
  protocolVersion: SHELL_HOST_PROTOCOL_VERSION,
  dshVersion: '0.2.0-rc.2',
  profileGeneration: runtime.expectedProfileGeneration,
  manifestSha256: runtime.expectedManifestSha256,
  loaderPhase: 'active' as const,
  runtimeEffective: {
    kind: 'observed' as const,
    defaultPresetId: 'standard',
    presets: [
      { id: 'standard', isDefault: true },
      { id: 'cordis', isDefault: false },
    ],
  },
}

function createHost(): { child: FakeChild; host: ShellHostProcess } {
  const child = new FakeChild()
  spawnMock.mockReturnValueOnce(child)
  return { child, host: new ShellHostProcess(runtime) }
}

async function startReady(): Promise<{ child: FakeChild; host: ShellHostProcess }> {
  const fixture = createHost()
  const started = fixture.host.start()
  fixture.child.emit('message', ready)
  await started
  return fixture
}

function bridgeFrames(child: FakeChild): Record<string, unknown>[] {
  return child.send.mock.calls
    .map(([message]) => message as Record<string, unknown>)
    .filter((message) => message.type === 'bridge-call')
}

describe('main-side read-only bridge', () => {
  beforeEach(() => {
    spawnMock.mockReset()
  })

  it('refuses before the transport when the Host has not booted', async () => {
    const { child, host } = createHost()
    await expect(host.bridgeCall('settings/describe')).rejects.toMatchObject({ code: 'bridge-host-not-ready' })
    expect(child.send).not.toHaveBeenCalled()
  })

  it('refuses a call whenever the Host is no longer the live generation, even though the child object still exists', async () => {
    // A booted child is not the same thing as an active generation: after an invalidation or a
    // dropped IPC channel the object is still around, and a read-only call must not be sent into it.
    const invalidated = await startReady()
    invalidated.child.emit('message', { type: 'runtime-invalidated' })
    await expect(invalidated.host.bridgeCall('settings/describe')).rejects.toMatchObject({ code: 'bridge-host-not-ready' })
    expect(invalidated.child.send).not.toHaveBeenCalled()

    const disconnected = await startReady()
    disconnected.child.connected = false
    await expect(disconnected.host.bridgeCall('settings/describe')).rejects.toMatchObject({ code: 'bridge-host-not-ready' })
    expect(disconnected.child.send).not.toHaveBeenCalled()

    await expect(disconnected.host.bridgeCall('secure/read-all')).rejects.toMatchObject({ code: 'bridge-endpoint-unsupported' })
    expect(disconnected.child.send).not.toHaveBeenCalled()
  })

  it('sends exactly one frame that the Host-side validator accepts, and resolves with the answered result', async () => {
    const { child, host } = await startReady()
    const call = host.bridgeCall('settings/describe')

    const frames = bridgeFrames(child)
    expect(frames).toHaveLength(1)
    const frame = frames[0]
    expect(frame).toMatchObject({ type: 'bridge-call', endpoint: 'settings/describe', payload: [] })
    // The producer and the consumer must agree on the same frame shape: what main emits has to pass
    // the validator the Host runs on it, otherwise every call would be refused as an invalid command.
    expect(isHostCommand(frame)).toBe(true)
    expect(typeof frame?.callId).toBe('string')

    const answer = { type: 'bridge-result', callId: frame?.callId, ok: true as const, result: { namespaces: [] } }
    expect(isHostEvent(answer)).toBe(true)
    child.emit('message', answer)
    await expect(call).resolves.toEqual({ namespaces: [] })
    expect(bridgeFrames(child)).toHaveLength(1)
  })

  it('refuses an endpoint outside the allowlist before touching the transport', async () => {
    const { child, host } = await startReady()
    await expect(host.bridgeCall('session/unsupported')).rejects.toMatchObject({ code: 'bridge-endpoint-unsupported' })
    expect(bridgeFrames(child)).toEqual([])
    expect(child.send).not.toHaveBeenCalled()
  })

  it.each([
    ['disconnect', (child: FakeChild) => { child.connected = false; child.emit('disconnect') }],
    ['exit', (child: FakeChild) => { child.emit('exit', 1) }],
  ])('reports %s during an unanswered call as lost instead of resolving', async (_reason, trigger) => {
    const { child, host } = await startReady()
    const call = host.bridgeCall('settings/describe')
    const callId = bridgeFrames(child)[0]?.callId
    trigger(child)
    await expect(call).rejects.toMatchObject({ code: 'bridge-host-lost' })
    child.emit('message', { type: 'bridge-result', callId, ok: true, result: { namespaces: [] } })
    await expect(call).rejects.toMatchObject({ code: 'bridge-host-lost' })
  })

  it('carries a refusal code back instead of a result', async () => {
    const { child, host } = await startReady()
    const call = host.bridgeCall('settings/describe')
    const callId = bridgeFrames(child)[0]?.callId
    child.emit('message', { type: 'bridge-result', callId, ok: false as const, code: 'bridge-provider-unavailable' })
    await expect(call).rejects.toMatchObject({ code: 'bridge-provider-unavailable' })
  })
})

describe('host-side read-only bridge', () => {
  it('runs only allowlisted endpoints and never reads a secret value back', async () => {
    // The mounted settings controller is expected to hand over a redacted view: names and states only.
    const describe = vi.fn(async () => ({
      namespaces: [{ ns: 'credentials', items: [{ name: 'apiKeyEnv', state: 'configured' }] }],
    }))
    const ctx = { get: vi.fn(() => ({ describe })) }
    // The whole surface, kinds included: adding an endpoint (or changing a kind) is a deliberate
    // edit here, never something that rides along with an unrelated change.
    expect(Object.entries(BRIDGE_ENDPOINTS)).toEqual([
      ['settings/describe', 'read'],
      ['directory/pick', 'interactive'],
      ['workspace/create', 'write'],
      ['workspace/rename', 'write'],
      ['workspace/delete', 'write'],
      ['workspace/insert-before', 'write'],
      ['workspace/follow', 'stream'],
      ['workspaceFiles/list', 'read'],
      ['workspaceFiles/stat', 'read'],
      ['workspaceFiles/read', 'read'],
      ['workspaceFiles/readBytes', 'read'],
      ['workspaceFiles/readAll', 'read'],
      ['workspaceFiles/changes', 'stream'],
      ['session/create', 'write'],
      ['session/prompt', 'write'],
      ['session/page', 'read'],
      ['session/follow', 'stream'],
      ['session/cancel', 'write'],
      ['session/queue-remove', 'write'],
      ['session/queue-edit', 'write'],
      ['session/control', 'stream'],
      ['session/search', 'read'],
      ['session/fork', 'write'],
      ['session/questions', 'read'],
      ['session/answer', 'write'],
      ['session/plan-mode', 'read'],
      ['session/plan-mode-switch', 'write'],
      ['session/approvals', 'read'],
      ['session/approve', 'write'],
      ['session/approval-withdraw', 'write'],
      ['session/terminals', 'read'],
      ['session/terminal-read', 'read'],
      ['skills/snapshot', 'read'],
      ['attachment/upload-begin', 'write'],
      ['attachment/upload-chunk', 'write'],
      ['attachment/upload-commit', 'write'],
      ['attachment/upload-abort', 'write'],
    ])

    const outcome = await resolveBridgeCall(ctx, 'settings/describe')
    expect(outcome).toEqual({
      ok: true,
      result: { namespaces: [{ ns: 'credentials', items: [{ name: 'apiKeyEnv', state: 'configured' }] }] },
    })
    expect(JSON.stringify(outcome)).not.toMatch(/\bsk-[A-Za-z0-9]/u)
    expect(ctx.get).toHaveBeenCalledWith('settingsController')
    expect(describe).toHaveBeenCalledTimes(1)
  })

  it('refuses a non-allowlisted endpoint without touching any provider', async () => {
    const ctx = { get: vi.fn() }
    await expect(resolveBridgeCall(ctx, 'credentials/describe')).resolves.toMatchObject({
      ok: false,
      code: 'bridge-endpoint-unsupported',
    })
    expect(ctx.get).not.toHaveBeenCalled()
  })

  it('declares every handled endpoint in the allowlist (008 regression: a handler whose name never entered the map is dead at runtime)', () => {
    // The allowlist gate runs before any handler, so a handler branch missing from the map can
    // never execute — the 008 queue-edit endpoint lived exactly there while every fake-bridge
    // test stayed green. This guard reads the source the way the runtime reads the map.
    const source = readFileSync(new URL('../src/host/bridge-endpoints.ts', import.meta.url), 'utf8')
    const handled = [...source.matchAll(/endpoint === '([^']+)'/gu)].map((match) => match[1]!)
    expect(handled.length).toBeGreaterThan(20)
    for (const endpoint of handled) {
      expect(Object.hasOwn(BRIDGE_ENDPOINTS, endpoint), `${endpoint} has a handler but no allowlist entry`).toBe(true)
    }
  })

  it('reads the mounted skills catalog through the base registry — bounded, and honest about completeness', async () => {
    const snapshot = vi.fn(async () => ({
      skills: [
        { name: 'alpha', description: 'd', source: 'user', provider: 'fs', invocation: { modelInvocable: true, userInvocable: true } },
        { name: 42 },
        { name: 'beta', invocation: { modelInvocable: true, userInvocable: false } },
      ],
      complete: false,
    }))
    const ctx = { get: vi.fn((name: string) => (name === 'skills' ? { snapshot } : undefined)) }
    await expect(resolveBridgeCall(ctx, 'skills/snapshot')).resolves.toEqual({
      ok: true,
      result: {
        skills: [
          { name: 'alpha', description: 'd', source: 'user', provider: 'fs', modelInvocable: true, userInvocable: true },
          { name: 'beta', description: null, source: null, provider: null, modelInvocable: true, userInvocable: false },
        ],
        complete: false,
      },
    })
    await expect(resolveBridgeCall({ get: () => undefined }, 'skills/snapshot')).resolves.toMatchObject({ code: 'bridge-provider-unavailable' })
    await expect(resolveBridgeCall(ctx, 'skills/snapshot', [{}])).resolves.toMatchObject({ code: 'bridge-payload-invalid' })
  })

  it('reads pending clarifications from the relay and answers through it', async () => {
    const list = vi.fn((sessionId: string) => ({ pending: [{ requestId: 'q-1', sessionId, questions: [], raisedAt: 't' }] }))
    const answer = vi.fn(() => ({ ok: true as const }))
    // The provider name is bound to the relay module's constant: a literal drifting from it fails here.
    const ctx = { get: vi.fn((name: string) => (name === USER_QUESTIONS_RELAY_SERVICE ? { list, answer } : undefined)) }

    await expect(resolveBridgeCall(ctx, 'session/questions', [{ sessionId: 's-1' }]))
      .resolves.toEqual({ ok: true, result: { pending: [{ requestId: 'q-1', sessionId: 's-1', questions: [], raisedAt: 't' }] } })
    expect(list).toHaveBeenCalledWith('s-1')

    await expect(resolveBridgeCall(ctx, 'session/answer', [{ requestId: 'q-1', answers: [{ id: 'a', selected: ['保持当前范围'] }] }]))
      .resolves.toEqual({ ok: true, result: { accepted: true } })
    expect(answer).toHaveBeenCalledWith('q-1', [{ id: 'a', selected: ['保持当前范围'] }])

    // The relay's own refusal code crosses unchanged — not-found is the honest "no longer waiting".
    answer.mockReturnValueOnce({ ok: false, code: 'question-not-found' })
    await expect(resolveBridgeCall(ctx, 'session/answer', [{ requestId: 'q-1', answers: [] }]))
      .resolves.toEqual({ ok: false, code: 'question-not-found' })

    // Payload discipline and relay availability keep the same one-hop refusals as every endpoint.
    await expect(resolveBridgeCall(ctx, 'session/questions', [{ sessionId: 's-1', extra: 1 }])).resolves.toMatchObject({ code: 'bridge-payload-invalid' })
    await expect(resolveBridgeCall(ctx, 'session/questions', [])).resolves.toMatchObject({ code: 'bridge-payload-invalid' })
    await expect(resolveBridgeCall(ctx, 'session/answer', [{ requestId: 'q-1' }])).resolves.toMatchObject({ code: 'bridge-payload-invalid' })
    await expect(resolveBridgeCall(ctx, 'session/answer', [{ requestId: 'q-1', answers: 'yes' }])).resolves.toMatchObject({ code: 'bridge-payload-invalid' })
    await expect(resolveBridgeCall({ get: () => undefined }, 'session/questions', [{ sessionId: 's-1' }]))
      .resolves.toMatchObject({ code: 'question-relay-unavailable' })
    await expect(resolveBridgeCall({ get: () => undefined }, 'session/answer', [{ requestId: 'q-1', answers: [] }]))
      .resolves.toMatchObject({ code: 'question-relay-unavailable' })
  })

  it('reads the plan-mode projection for the live agent and carries the base\'s own switch outcome', async () => {
    const agent = { id: 's-1', session: { append: vi.fn() } }
    const get = vi.fn(() => ({ active: true }))
    const set = vi.fn(() => 'queued')
    const agents = { get: vi.fn((sessionId: string) => (sessionId === 's-1' ? agent : undefined)) }
    const ctx = {
      get: vi.fn((name: string) => (name === 'planMode' ? { get, set } : name === 'agents' ? agents : undefined)),
    }

    await expect(resolveBridgeCall(ctx, 'session/plan-mode', [{ sessionId: 's-1' }]))
      .resolves.toEqual({ ok: true, result: { active: true, pending: false } })
    expect(agents.get).toHaveBeenCalledWith('s-1')
    expect(get).toHaveBeenCalledWith(agent)

    // `pending` rides only while a selection awaits the next accepted pre-step; normalize it.
    get.mockReturnValueOnce({ active: false, pending: true })
    await expect(resolveBridgeCall(ctx, 'session/plan-mode', [{ sessionId: 's-1' }]))
      .resolves.toEqual({ ok: true, result: { active: false, pending: true } })

    await expect(resolveBridgeCall(ctx, 'session/plan-mode-switch', [{ sessionId: 's-1', active: true }]))
      .resolves.toEqual({ ok: true, result: { outcome: 'queued' } })
    expect(set).toHaveBeenCalledWith(agent, true)

    // Every declared outcome crosses verbatim — the receipt is the base's, not a reinterpretation.
    for (const outcome of ['committed', 'queued', 'cancelled', 'noop'] as const) {
      set.mockReturnValueOnce(outcome)
      await expect(resolveBridgeCall(ctx, 'session/plan-mode-switch', [{ sessionId: 's-1', active: false }]))
        .resolves.toEqual({ ok: true, result: { outcome } })
    }

    // Named refusals: no live agent is never a manufactured "inactive"; unreadable shapes never guess.
    await expect(resolveBridgeCall(ctx, 'session/plan-mode', [{ sessionId: 's-unknown' }]))
      .resolves.toMatchObject({ code: 'bridge-session-not-live' })
    await expect(resolveBridgeCall(ctx, 'session/plan-mode-switch', [{ sessionId: 's-unknown', active: true }]))
      .resolves.toMatchObject({ code: 'bridge-session-not-live' })
    get.mockReturnValueOnce({ active: 'yes' })
    await expect(resolveBridgeCall(ctx, 'session/plan-mode', [{ sessionId: 's-1' }]))
      .resolves.toMatchObject({ code: 'bridge-plan-mode-unreadable' })
    set.mockReturnValueOnce('applied')
    await expect(resolveBridgeCall(ctx, 'session/plan-mode-switch', [{ sessionId: 's-1', active: true }]))
      .resolves.toMatchObject({ code: 'bridge-plan-mode-unreadable' })

    // Payload discipline and provider availability keep the one-hop refusals of every endpoint.
    await expect(resolveBridgeCall({ get: () => undefined }, 'session/plan-mode', [{ sessionId: 's-1' }]))
      .resolves.toMatchObject({ code: 'bridge-provider-unavailable' })
    await expect(resolveBridgeCall({ get: (name: string) => (name === 'planMode' ? { get, set } : undefined) }, 'session/plan-mode', [{ sessionId: 's-1' }]))
      .resolves.toMatchObject({ code: 'bridge-provider-unavailable' })
    await expect(resolveBridgeCall(ctx, 'session/plan-mode', [{ sessionId: 's-1', extra: 1 }]))
      .resolves.toMatchObject({ code: 'bridge-payload-invalid' })
    await expect(resolveBridgeCall(ctx, 'session/plan-mode-switch', [{ sessionId: 's-1', active: 'on' }]))
      .resolves.toMatchObject({ code: 'bridge-payload-invalid' })
    await expect(resolveBridgeCall(ctx, 'session/plan-mode-switch', [{ sessionId: 's-1' }]))
      .resolves.toMatchObject({ code: 'bridge-payload-invalid' })
  })

  it('reads and decides approval waits through the relay — the decision word is the caller\'s, the vocabulary is the relay\'s', async () => {
    const list = vi.fn((sessionId: string) => ({ pending: [{ requestId: 'appr-1', sessionId, toolName: 'mcp__shell__run', callId: null, reason: null, withdrawable: true, raisedAt: 't' }] }))
    const answer = vi.fn((_requestId: string, _outcome: unknown) => ({ ok: true as const }))
    const withdraw = vi.fn(() => ({ ok: true as const }))
    // The provider name is bound to the relay module's constant: a literal drifting from it fails here.
    const ctx = { get: vi.fn((name: string) => (name === APPROVAL_RELAY_SERVICE ? { list, answer, withdraw } : undefined)) }

    await expect(resolveBridgeCall(ctx, 'session/approvals', [{ sessionId: 's-1' }]))
      .resolves.toEqual({ ok: true, result: { pending: [{ requestId: 'appr-1', sessionId: 's-1', toolName: 'mcp__shell__run', callId: null, reason: null, withdrawable: true, raisedAt: 't' }] } })
    expect(list).toHaveBeenCalledWith('s-1')

    await expect(resolveBridgeCall(ctx, 'session/approve', [{ requestId: 'appr-1', outcome: 'allowed-once' }]))
      .resolves.toEqual({ ok: true, result: { accepted: true } })
    expect(answer).toHaveBeenCalledWith('appr-1', 'allowed-once')

    // The relay's own refusal codes cross unchanged — invalid outcome and not-found stay visible.
    answer.mockReturnValueOnce({ ok: false, code: 'approval-outcome-invalid' })
    await expect(resolveBridgeCall(ctx, 'session/approve', [{ requestId: 'appr-1', outcome: 'approved' }]))
      .resolves.toEqual({ ok: false, code: 'approval-outcome-invalid' })
    await expect(resolveBridgeCall(ctx, 'session/approval-withdraw', [{ requestId: 'appr-1' }]))
      .resolves.toEqual({ ok: true, result: { withdrawn: true } })
    expect(withdraw).toHaveBeenCalledWith('appr-1')
    withdraw.mockReturnValueOnce({ ok: false, code: 'approval-not-found' })
    await expect(resolveBridgeCall(ctx, 'session/approval-withdraw', [{ requestId: 'gone' }]))
      .resolves.toEqual({ ok: false, code: 'approval-not-found' })

    // Payload discipline and relay availability keep the same one-hop refusals as every endpoint.
    await expect(resolveBridgeCall(ctx, 'session/approvals', [{ sessionId: 's-1', extra: 1 }])).resolves.toMatchObject({ code: 'bridge-payload-invalid' })
    await expect(resolveBridgeCall(ctx, 'session/approve', [{ requestId: 'appr-1' }])).resolves.toMatchObject({ code: 'bridge-payload-invalid' })
    await expect(resolveBridgeCall(ctx, 'session/approval-withdraw', [{ requestId: 'appr-1', outcome: 'allowed-once' }])).resolves.toMatchObject({ code: 'bridge-payload-invalid' })
    await expect(resolveBridgeCall({ get: () => undefined }, 'session/approvals', [{ sessionId: 's-1' }])).resolves.toMatchObject({ code: 'approval-relay-unavailable' })
    await expect(resolveBridgeCall({ get: () => undefined }, 'session/approve', [{ requestId: 'appr-1', outcome: 'rejected' }])).resolves.toMatchObject({ code: 'approval-relay-unavailable' })
    await expect(resolveBridgeCall({ get: () => undefined }, 'session/approval-withdraw', [{ requestId: 'appr-1' }])).resolves.toMatchObject({ code: 'approval-relay-unavailable' })
  })

  it('lists owner-scoped terminals (no pid) and pages bounded scrollback through the registry', async () => {
    const agent = { id: 's-1' }
    const list = vi.fn(() => [
      { sessionId: 't-1', name: '构建', type: 'bash', pid: 4242, status: { kind: 'running' } },
      { sessionId: 't-2', type: 'bash', status: { kind: 'exited', exitCode: 1, signal: null } },
    ])
    const read = vi.fn(() => ({ text: 'x'.repeat(70_000), totalLines: 9, lineBegin: 0, lineEnd: 9, truncated: true }))
    const agents = { get: vi.fn((sessionId: string) => (sessionId === 's-1' ? agent : undefined)) }
    const ctx = { get: vi.fn((name: string) => (name === 'terminals' ? { list, read } : name === 'agents' ? agents : undefined)) }

    const listed = await resolveBridgeCall(ctx, 'session/terminals', [{ sessionId: 's-1' }])
    expect(listed).toEqual({
      ok: true,
      result: {
        terminals: [
          { terminalId: 't-1', name: '构建', type: 'bash', status: { kind: 'running' } },
          { terminalId: 't-2', name: null, type: 'bash', status: { kind: 'exited', exitCode: 1, signal: null } },
        ],
      },
    })
    // Never a pid or a path in the projection.
    expect(JSON.stringify(listed)).not.toContain('4242')
    expect(list).toHaveBeenCalledWith(agent)

    const page = await resolveBridgeCall(ctx, 'session/terminal-read', [{ sessionId: 's-1', terminalId: 't-1', offset: 0, count: 50 }])
    expect(page).toMatchObject({ ok: true, result: { totalLines: 9, lineBegin: 0, lineEnd: 9, truncated: true } })
    const pageText = (page as { result: { text: string } }).result.text
    expect(pageText).toHaveLength(65_536)
    expect(read).toHaveBeenCalledWith(agent, 't-1', { offset: 0, count: 50 })

    // Named refusals: no live agent, no provider, unreadable results, payload discipline.
    await expect(resolveBridgeCall(ctx, 'session/terminals', [{ sessionId: 's-none' }])).resolves.toMatchObject({ code: 'bridge-session-not-live' })
    await expect(resolveBridgeCall({ get: () => undefined }, 'session/terminals', [{ sessionId: 's-1' }])).resolves.toMatchObject({ code: 'bridge-provider-unavailable' })
    await expect(resolveBridgeCall({ get: (name: string) => (name === 'terminals' ? { list, read } : undefined) }, 'session/terminals', [{ sessionId: 's-1' }])).resolves.toMatchObject({ code: 'bridge-provider-unavailable' })
    list.mockReturnValueOnce('nope' as never)
    await expect(resolveBridgeCall(ctx, 'session/terminals', [{ sessionId: 's-1' }])).resolves.toMatchObject({ code: 'bridge-terminal-unreadable' })
    read.mockReturnValueOnce({ text: 42 } as never)
    await expect(resolveBridgeCall(ctx, 'session/terminal-read', [{ sessionId: 's-1', terminalId: 't-1' }])).resolves.toMatchObject({ code: 'bridge-terminal-unreadable' })
    await expect(resolveBridgeCall(ctx, 'session/terminals', [{ sessionId: 's-1', extra: 1 }])).resolves.toMatchObject({ code: 'bridge-payload-invalid' })
    await expect(resolveBridgeCall(ctx, 'session/terminal-read', [{ sessionId: 's-1' }])).resolves.toMatchObject({ code: 'bridge-payload-invalid' })
    await expect(resolveBridgeCall(ctx, 'session/terminal-read', [{ sessionId: 's-1', terminalId: 't-1', offset: -1, count: 10 }])).resolves.toMatchObject({ code: 'bridge-payload-invalid' })
  })

  it('normalizes a missing provider, a throwing provider, and a result that cannot cross unchanged', async () => {
    await expect(resolveBridgeCall({ get: () => undefined }, 'settings/describe')).resolves.toMatchObject({
      code: 'bridge-provider-unavailable',
    })
    await expect(resolveBridgeCall({ get: () => ({ describe: 'not-a-function' }) }, 'settings/describe'))
      .resolves.toMatchObject({ code: 'bridge-provider-unavailable' })
    await expect(resolveBridgeCall({ get: () => ({ describe: async () => { throw new Error('boom') } }) }, 'settings/describe'))
      .resolves.toMatchObject({ code: 'bridge-provider-failed' })

    // JSON would drop each of these silently and Electron would see a plausible-but-narrower view.
    const refused = [
      ['a function', () => ({ fn: () => {} })],
      ['undefined', () => ({ items: undefined })],
      ['a Date object', () => ({ at: new Date(0) })],
      ['a class instance', () => ({ view: new (class { constructor() { this.x = 1 } })() })],
      ['a symbol key', () => ({ [Symbol('ns')]: 'models' })],
      ['a non-finite number', () => ({ ratio: Number.NaN })],
      ['a bigint', () => ({ count: 1n })],
      ['a cycle', () => { const value: Record<string, unknown> = {}; value.self = value; return value }],
    ] as const
    for (const [label, build] of refused) {
      const outcome = await resolveBridgeCall({ get: () => ({ describe: async () => build() }) }, 'settings/describe')
      expect(outcome, label).toMatchObject({ ok: false, code: 'bridge-result-not-plain-data' })
    }
  })

  it('accepts the plain-data shapes a redacted settings view actually uses', async () => {
    const value = {
      namespaces: [{ ns: 'models', items: [{ name: 'apiKeyEnv', state: 'configured', port: 43120, enabled: true, note: null }] }],
    }
    await expect(resolveBridgeCall({ get: () => ({ describe: async () => value }) }, 'settings/describe'))
      .resolves.toEqual({ ok: true, result: value })
  })
})

describe('bridge frames only exist on the Node IPC channel', () => {
  it('rejects a bridge-shaped frame on the request byte pipe', () => {
    const decoder = new HostRequestDecoder()
    const start = encodeRequestStart(1, { url: 'dsh-app://app/index.html', method: 'GET', headers: [], hasBody: false })
    expect(decoder.push(start)).toEqual([{
      type: 'start',
      streamId: 1,
      url: 'dsh-app://app/index.html',
      method: 'GET',
      headers: [],
      hasBody: false,
    }])
    // Type byte 9 is not part of the request pipe union, so no byte-pipe frame can name a bridge call.
    const forged = Buffer.alloc(start.byteLength)
    start.copy(forged)
    forged.writeUInt8(9, 4)
    expect(() => decoder.push(forged)).toThrow(/unknown Electron request frame type 9/u)
  })

  it('keeps bridge-call out of every shape the render side can submit', () => {
    expect(isHostCommand({ type: 'bridge-call', callId: 'x'.repeat(8), endpoint: 'settings/describe', payload: [] })).toBe(true)
    expect(isHostCommand({ type: 'bridge-call', callId: 'x'.repeat(8), endpoint: 'session/unsupported', payload: [] })).toBe(false)
    expect(isHostCommand({
      type: 'bridge-call',
      callId: 'x'.repeat(8),
      endpoint: 'settings/describe',
      payload: [],
      smuggled: true,
    })).toBe(false)
    expect(isHostCommand({ type: 'bridge-call', callId: 'no-colon-ok', endpoint: 'settings/../describe', payload: [] })).toBe(false)
    expect(isHostCommand({ type: 'bridge-call', callId: 'no-colon-ok', endpoint: 'settings/describe', payload: { ns: 'models' } })).toBe(false)
  })
})

describe('controlled-method bridge: pick and adoption (ticket 010, ADR-0203)', () => {
  it('keeps the endpoint map frozen, typed, and free of the directory-creating call', () => {
    expect(Object.isFrozen(BRIDGE_ENDPOINTS)).toBe(true)
    expect(Object.values(BRIDGE_ENDPOINTS).every((kind) => kind === 'read' || kind === 'interactive' || kind === 'write' || kind === 'stream')).toBe(true)
    // 首版只采纳已有目录：创建目录的调用不得因为"顺手"而出现在桥面上。
    expect(Object.hasOwn(BRIDGE_ENDPOINTS, 'directoryPicker/createDirectory')).toBe(false)
  })

  it('treats a cancelled pick as a fact, never as a failure', async () => {
    const cancelled = await resolveBridgeCall({ get: () => ({ pick: async () => null }) }, 'directory/pick')
    expect(cancelled).toEqual({ ok: true, result: { path: null } })

    const picked = await resolveBridgeCall({ get: () => ({ pick: async () => '/Users/someone/project' }) }, 'directory/pick')
    expect(picked).toEqual({ ok: true, result: { path: '/Users/someone/project' } })
  })

  it('refuses a picker answer that is not an adoptable absolute path', async () => {
    for (const value of ['relative/path', '', '   ', '/tmp/\u0000x', 42, { path: '/tmp' }]) {
      const refused = await resolveBridgeCall({ get: () => ({ pick: async () => value }) }, 'directory/pick')
      expect(refused).toMatchObject({ ok: false })
    }
  })

  it('refuses a pick without a provider, a payload, or when the provider throws', async () => {
    expect(await resolveBridgeCall({ get: () => undefined }, 'directory/pick')).toMatchObject({ ok: false, code: 'bridge-provider-unavailable' })
    expect(await resolveBridgeCall({ get: () => ({ pick: async () => null }) }, 'directory/pick', ['extra']))
      .toMatchObject({ ok: false, code: 'bridge-payload-invalid' })
    expect(await resolveBridgeCall({ get: () => ({ pick: async () => { throw new Error('boom') } }) }, 'directory/pick'))
      .toMatchObject({ ok: false, code: 'bridge-provider-failed' })
  })

  it('requires exactly one { path } argument for adoption and validates the path here too', async () => {
    const registry = { create: async ({ path }: { path: string }) => ({ workspace: { workspaceId: 'ws-1', path, title: 'project', createdAt: '2026-10-02T00:00:00Z' } }) }
    const ctx = { get: () => registry }

    expect(await resolveBridgeCall(ctx, 'workspace/create')).toMatchObject({ ok: false, code: 'bridge-payload-invalid' })
    expect(await resolveBridgeCall(ctx, 'workspace/create', [{ path: '/a' }, { path: '/b' }]))
      .toMatchObject({ ok: false, code: 'bridge-payload-invalid' })
    expect(await resolveBridgeCall(ctx, 'workspace/create', ['/a'])).toMatchObject({ ok: false, code: 'bridge-payload-invalid' })
    expect(await resolveBridgeCall(ctx, 'workspace/create', [{ path: 'relative' }]))
      .toMatchObject({ ok: false, code: 'bridge-path-invalid' })

    const adopted = await resolveBridgeCall(ctx, 'workspace/create', [{ path: '/Users/someone/project' }])
    expect(adopted).toMatchObject({ ok: true })
  })

  it('refuses an adoption result that could not cross unchanged', async () => {
    const instance = new (class Workspace { readonly workspaceId = 'ws-1' })()
    const ctx = { get: () => ({ create: async () => ({ workspace: instance }) }) }
    expect(await resolveBridgeCall(ctx, 'workspace/create', [{ path: '/Users/someone/project' }]))
      .toMatchObject({ ok: false, code: 'bridge-result-not-plain-data' })
  })
})

describe('bridge service names come from the base’s own declarations (ADR-0205)', () => {
  it('reaches the base’s Remote owner names and nothing that merely sounds right', async () => {
    // The defect this guards: the bridge once asked for `workspaceRegistry` / `directoryPicker`,
    // names that no package declares — every endpoint answered `bridge-provider-unavailable` in
    // production while the unit fakes (which ignore the name) stayed green.
    const asked: string[] = []
    const ctx = {
      get: (name: string) => {
        asked.push(name)
        if (name === 'settingsController') return { describe: async () => ({ namespaces: [] }) }
        if (name === 'directoryPickerController') return { pick: async () => null }
        if (name === 'workspaceController') return { find: undefined, create: async () => ({ workspace: { workspaceId: 'ws-1' } }) }
        return undefined
      },
    }
    await resolveBridgeCall(ctx, 'settings/describe')
    await resolveBridgeCall(ctx, 'directory/pick')
    await resolveBridgeCall(ctx, 'workspace/create', [{ path: '/Users/someone/project' }])
    expect(asked).toEqual(['settingsController', 'directoryPickerController', 'workspaceController'])

    // A context that mounts the near-miss names answers unavailable — it must never "find" them.
    const wrong = { get: (name: string) => (name === 'workspaceRegistry' || name === 'directoryPicker' ? { create: async () => ({}), pick: async () => null } : undefined) }
    expect(await resolveBridgeCall(wrong, 'workspace/create', [{ path: '/Users/someone/project' }]))
      .toMatchObject({ ok: false, code: 'bridge-provider-unavailable' })
    expect(await resolveBridgeCall(wrong, 'directory/pick')).toMatchObject({ ok: false, code: 'bridge-provider-unavailable' })
  })

  it('hands a cancellation signal to pick and aborts it once the call is over', async () => {
    let seen: unknown
    let abortedDuringCall: boolean | undefined
    const ctx = {
      get: () => ({
        pick: async (signal: AbortSignal) => {
          seen = signal
          abortedDuringCall = signal.aborted
          return '/Users/someone/project'
        },
      }),
    }
    await resolveBridgeCall(ctx, 'directory/pick')
    expect(seen).toBeInstanceOf(AbortSignal)
    // While the picker is answering nothing may be cancelled; the signal dies with the call.
    expect(abortedDuringCall).toBe(false)
    expect((seen as AbortSignal).aborted).toBe(true)
  })

  it('maps the base’s own refusal codes and refuses to read a code off an unmarked error', async () => {
    const remoteError = (code: string) => Object.assign(new Error('refused'), { isDSHRemoteError: true, code })
    const withRename = (thrown: unknown) => ({
      get: () => ({ rename: async () => { throw thrown } }),
    })
    const renamed = (ctx: { get: () => unknown }) => resolveBridgeCall(ctx, 'workspace/rename', [{ workspaceId: 'ws-1', title: 'x' }])
    const mapped = [
      ['workspace/name-conflict', 'bridge-workspace-name-conflict'],
      ['workspace/not-found', 'bridge-workspace-unknown'],
      ['workspace/move-invalid', 'bridge-workspace-reorder-invalid'],
      ['workspace/invalid-path', 'bridge-workspace-path-rejected'],
      ['workspace/something-new', 'bridge-provider-failed'],
    ] as const
    for (const [code, expected] of mapped) {
      expect(await renamed(withRename(remoteError(code))), code).toMatchObject({ ok: false, code: expected })
    }
    // A plain Error carrying a code is not the base's vocabulary: the marker is the test, so a
    // thrown object cannot dress itself up as one of the base's refusals.
    expect(await renamed(withRename(Object.assign(new Error('boom'), { code: 'workspace/name-conflict' }))))
      .toMatchObject({ ok: false, code: 'bridge-provider-failed' })
  })
})

describe('controlled-method bridge: workspace mutations (ticket 012 write half)', () => {
  const controller = (overrides: Record<string, unknown> = {}) => ({
    get: () => ({
      create: async () => ({ workspace: { workspaceId: 'ws-1' }, created: true }),
      rename: async () => ({ workspace: { workspaceId: 'ws-1', title: 'renamed' } }),
      delete: async () => ({ deleted: true }),
      insertBefore: async () => ({ workspaceIds: ['ws-2', 'ws-1'] }),
      ...overrides,
    }),
  })

  it('renames only with exactly { workspaceId, title } and refuses blank or oversized titles here', async () => {
    const seen: unknown[] = []
    const ctx = { get: () => ({ rename: async (input: unknown) => { seen.push(input); return { workspace: { workspaceId: 'ws-1', title: 'new name' } } } }) }
    expect(await resolveBridgeCall(ctx, 'workspace/rename', [{ workspaceId: 'ws-1', title: 'new name' }]))
      .toEqual({ ok: true, result: { workspace: { workspaceId: 'ws-1', title: 'new name' } } })
    expect(seen).toEqual([{ workspaceId: 'ws-1', title: 'new name' }])

    const refused = [
      [{ workspaceId: 'ws-1' }],
      [{ title: 'x' }],
      [{ workspaceId: 'ws-1', title: '' }],
      [{ workspaceId: 'ws-1', title: '   ' }],
      [{ workspaceId: 'ws-1', title: ' padded ' }],
      [{ workspaceId: 'ws-1', title: 'x'.repeat(201) }],
      [{ workspaceId: 'ws-1', title: 'x', extra: 1 }],
      [{ workspaceId: '', title: 'x' }],
      [],
      ['ws-1'],
    ]
    for (const payload of refused) {
      expect(await resolveBridgeCall(controller(), 'workspace/rename', payload), JSON.stringify(payload))
        .toMatchObject({ ok: false })
    }
    // A blank title is the payload's fault, not the provider's; the provider is never reached.
    expect(await resolveBridgeCall({ get: () => { throw new Error('must not be reached') } }, 'workspace/rename', [{ workspaceId: 'ws-1', title: '' }]))
      .toMatchObject({ ok: false, code: 'bridge-workspace-title-invalid' })
  })

  it('deletes by registration id only, and nothing about the directory reaches the call', async () => {
    const seen: unknown[] = []
    const ctx = { get: () => ({ delete: async (input: unknown) => { seen.push(input); return { deleted: true } } }) }
    expect(await resolveBridgeCall(ctx, 'workspace/delete', [{ workspaceId: 'ws-1' }])).toEqual({ ok: true, result: { deleted: true } })
    // The base's delete retains files and sessions; the bridge can only ask for what the base
    // declares, and this payload is the whole of it — no flag, no path, no "purge".
    expect(seen).toEqual([{ workspaceId: 'ws-1' }])

    expect(await resolveBridgeCall(controller(), 'workspace/delete', [])).toMatchObject({ ok: false, code: 'bridge-payload-invalid' })
    expect(await resolveBridgeCall(controller(), 'workspace/delete', [{ workspaceId: 'ws-1', purge: true }]))
      .toMatchObject({ ok: false, code: 'bridge-payload-invalid' })
    expect(await resolveBridgeCall(controller(), 'workspace/delete', [{ workspaceId: 7 }]))
      .toMatchObject({ ok: false, code: 'bridge-workspace-ref-invalid' })
  })

  it('reorders with an optional anchor, refusing a self-anchor and an unknown extra member', async () => {
    const seen: unknown[] = []
    const ctx = { get: () => ({ insertBefore: async (input: unknown) => { seen.push(input); return { workspaceIds: ['ws-1', 'ws-2'] } } }) }
    expect(await resolveBridgeCall(ctx, 'workspace/insert-before', [{ workspaceId: 'ws-2', beforeWorkspaceId: 'ws-1' }]))
      .toEqual({ ok: true, result: { workspaceIds: ['ws-1', 'ws-2'] } })
    expect(seen).toEqual([{ workspaceId: 'ws-2', beforeWorkspaceId: 'ws-1' }])

    // Without an anchor the base appends; the request object carries no key for it at all.
    seen.length = 0
    expect(await resolveBridgeCall(ctx, 'workspace/insert-before', [{ workspaceId: 'ws-2' }])).toMatchObject({ ok: true })
    expect(seen).toEqual([{ workspaceId: 'ws-2' }])

    expect(await resolveBridgeCall(ctx, 'workspace/insert-before', [{ workspaceId: 'ws-1', beforeWorkspaceId: 'ws-1' }]))
      .toMatchObject({ ok: false, code: 'bridge-workspace-ref-invalid' })
    // An explicit null anchor is a ref slot holding an unusable value: appending is expressed by
    // omitting the key, which is what the base's own request type declares.
    expect(await resolveBridgeCall(ctx, 'workspace/insert-before', [{ workspaceId: 'ws-1', beforeWorkspaceId: null }]))
      .toMatchObject({ ok: false, code: 'bridge-workspace-ref-invalid' })
    expect(await resolveBridgeCall(ctx, 'workspace/insert-before', [{ workspaceId: 'ws-1', beforeWorkspaceId: 'ws-2', force: true }]))
      .toMatchObject({ ok: false, code: 'bridge-payload-invalid' })
  })

  it('refuses every mutation when the provider is missing or the answer cannot cross', async () => {
    const missing = { get: () => undefined }
    expect(await resolveBridgeCall(missing, 'workspace/rename', [{ workspaceId: 'ws-1', title: 'x' }]))
      .toMatchObject({ ok: false, code: 'bridge-provider-unavailable' })
    expect(await resolveBridgeCall(missing, 'workspace/delete', [{ workspaceId: 'ws-1' }]))
      .toMatchObject({ ok: false, code: 'bridge-provider-unavailable' })
    expect(await resolveBridgeCall(missing, 'workspace/insert-before', [{ workspaceId: 'ws-1' }]))
      .toMatchObject({ ok: false, code: 'bridge-provider-unavailable' })

    const instance = new (class Workspace { readonly workspaceId = 'ws-1' })()
    expect(await resolveBridgeCall({ get: () => ({ rename: async () => ({ workspace: instance }) }) }, 'workspace/rename', [{ workspaceId: 'ws-1', title: 'x' }]))
      .toMatchObject({ ok: false, code: 'bridge-result-not-plain-data' })
    expect(await resolveBridgeCall({ get: () => ({ delete: async () => ({ deleted: () => true }) }) }, 'workspace/delete', [{ workspaceId: 'ws-1' }]))
      .toMatchObject({ ok: false, code: 'bridge-result-not-plain-data' })
  })
})

describe('workspace file reads over the bridge (ticket 013, ADR-0207)', () => {
  /** A context carrying a session store whose live session names the workspace root.
   *  An explicitly provided `sessions: undefined` means "this host has no session service". */
  const contextWith = (overrides: {
    sessions?: unknown
    files?: unknown
  } = {}) => {
    const asked: string[] = []
    return {
      asked,
      ctx: {
        get: (name: string) => {
          asked.push(name)
          if (name === 'sessions') {
            return Object.hasOwn(overrides, 'sessions')
              ? overrides.sessions
              : { list: () => [{ header: { id: 'session-1', cwd: '/Users/someone/project' } }] }
          }
          if (name === 'workspaceFiles') {
            return overrides.files ?? {
              list: async () => ({ path: '', entries: [], truncated: false }),
              stat: async () => ({ absolutePath: '/Users/someone/project/a.md', version: 'v1', bytes: 3 }),
              read: async () => ({ absolutePath: '/Users/someone/project/a.md', version: 'v1', offset: 1, text: 'abc', lines: 1, eof: true }),
            }
          }
          return undefined
        },
      },
    }
  }

  it('hands the service a scope built from a live session, and aborts the signal afterwards', async () => {
    const seen: unknown[] = []
    let signal: AbortSignal | undefined
    const files = {
      stat: async (scope: unknown, path: unknown, given: AbortSignal) => {
        seen.push([scope, path])
        signal = given
        return { absolutePath: '/Users/someone/project/a.md', version: 'v1' }
      },
    }
    const { ctx, asked } = contextWith({ files })
    const outcome = await resolveBridgeCall(ctx, 'workspaceFiles/stat', [{ workspaceRoot: '/Users/someone/project', path: 'a.md' }])
    expect(outcome).toEqual({ ok: true, result: { absolutePath: '/Users/someone/project/a.md', version: 'v1' } })
    // The scope is the session's own identity plus the requested root; nothing here mints one.
    expect(seen).toEqual([[{ sessionId: 'session-1', workspaceRoot: '/Users/someone/project' }, 'a.md']])
    expect(asked).toEqual(['workspaceFiles', 'sessions'])
    expect(signal?.aborted).toBe(true)
  })

  it('refuses with its own code when no live session is bound to that root', async () => {
    // The defect class this guards (P-60): a scope is not something to fabricate — a shell with no
    // session for the workspace says so, and the file service is never touched.
    let touched = 0
    const files = { stat: async () => { touched += 1; return {} } }
    const nothingBound = contextWith({ sessions: { list: () => [{ header: { id: 'session-2', cwd: '/Users/elsewhere' } }] }, files })
    expect(await resolveBridgeCall(nothingBound.ctx, 'workspaceFiles/stat', [{ workspaceRoot: '/Users/someone/project', path: 'a.md' }]))
      .toMatchObject({ ok: false, code: 'bridge-file-scope-unavailable' })
    expect(await resolveBridgeCall(contextWith({ sessions: undefined, files }).ctx, 'workspaceFiles/stat', [{ workspaceRoot: '/Users/someone/project', path: 'a.md' }]))
      .toMatchObject({ ok: false, code: 'bridge-file-scope-unavailable' })
    const noSessionsService = { get: (name: string) => (name === 'workspaceFiles' ? files : undefined) }
    expect(await resolveBridgeCall(noSessionsService, 'workspaceFiles/stat', [{ workspaceRoot: '/Users/someone/project', path: 'a.md' }]))
      .toMatchObject({ ok: false, code: 'bridge-file-scope-unavailable' })
    expect(touched).toBe(0)
  })

  it('validates the endpoint payloads and the page range before reaching the provider', async () => {
    const { ctx } = contextWith()
    const cases: Array<[string, readonly unknown[]]> = [
      ['workspaceFiles/list', []],
      ['workspaceFiles/list', [{ workspaceRoot: 'relative/root', path: 'a.md' }]],
      ['workspaceFiles/list', [{ workspaceRoot: '/root', path: '' , extra: 1 }]],
      ['workspaceFiles/stat', [{ workspaceRoot: '/root', path: 7 }]],
      ['workspaceFiles/read', [{ workspaceRoot: '/root', path: 'a.md', range: { offset: 1, limit: 5, cap: 9 } }]],
      ['workspaceFiles/read', [{ workspaceRoot: '/root', path: 'a.md', range: { offset: -1 } }]],
      ['workspaceFiles/read', [{ workspaceRoot: '/root', path: 'a.md', range: 'lines 1-5' }]],
    ]
    for (const [endpoint, payload] of cases) {
      expect(await resolveBridgeCall(ctx, endpoint, payload), `${endpoint} ${JSON.stringify(payload)}`)
        .toMatchObject({ ok: false, code: 'bridge-payload-invalid' })
    }
  })

  it('passes the page range through, keeps the file refusals distinct, and refuses a missing provider', async () => {
    const seen: unknown[] = []
    const files = { read: async (_scope: unknown, _path: unknown, range: unknown) => { seen.push(range); return { version: 'v1', text: 'x' } } }
    const { ctx } = contextWith({ files })
    expect(await resolveBridgeCall(ctx, 'workspaceFiles/read', [{ workspaceRoot: '/Users/someone/project', path: 'a.md', range: { offset: 2, limit: 3 } }])).toMatchObject({ ok: true })
    expect(seen).toEqual([{ offset: 2, limit: 3 }])

    const remoteError = (code: string) => Object.assign(new Error('refused'), { isDSHRemoteError: true, code })
    const mapped: Array<[string, string]> = [
      ['workspace-file/not-found', 'bridge-file-not-found'],
      ['workspace-file/outside-workspace', 'bridge-file-outside-workspace'],
      ['workspace-file/too-large', 'bridge-file-too-large'],
      ['workspace-file/not-text', 'bridge-file-not-text'],
      ['workspace-file/not-regular-file', 'bridge-file-not-regular'],
      ['workspace-file/not-directory', 'bridge-file-not-directory'],
    ]
    for (const [code, expected] of mapped) {
      const throwing = contextWith({ files: { list: async () => { throw remoteError(code) } } })
      expect(await resolveBridgeCall(throwing.ctx, 'workspaceFiles/list', [{ workspaceRoot: '/Users/someone/project', path: '' }]), code)
        .toMatchObject({ ok: false, code: expected })
    }

    const noProvider = contextWith({ files: undefined })
    const bare = { get: (name: string) => (name === 'sessions' ? noProvider.ctx.get('sessions') : undefined) }
    expect(await resolveBridgeCall(bare, 'workspaceFiles/list', [{ workspaceRoot: '/Users/someone/project', path: '' }]))
      .toMatchObject({ ok: false, code: 'bridge-provider-unavailable' })
  })
})

describe('the attachment bridge endpoints (ticket 014)', () => {
  const fileUploads = (over: Partial<{ uploadStream: unknown }> = {}) => ({
    uploadStream: over.uploadStream ?? (async (request: { readonly sessionId: string, readonly data: AsyncIterable<Uint8Array>, readonly name?: string }) => {
      const parts: Buffer[] = []
      for await (const chunk of request.data) parts.push(Buffer.from(chunk))
      const bytes = Buffer.concat(parts)
      return {
        receiptId: 'receipt-1',
        file: { attachmentId: createHash('sha256').update(bytes).digest('hex'), name: request.name ?? 'file', bytes: bytes.byteLength },
      }
    }),
  })
  const ctxWithUploads = (service: unknown) => ({ get: (name: string) => (name === 'fileUploads' ? service : undefined) })
  const registry = () => createAttachmentUploads(() => 'up-1')

  it('streams a declared version through uploadStream and hands the receipt back plain', async () => {
    const seen: Array<{ sessionId: string, name: string | undefined }> = []
    const service = fileUploads({
      uploadStream: async (request: { sessionId: string, name?: string, data: AsyncIterable<Uint8Array> }) => {
        seen.push({ sessionId: request.sessionId, name: request.name })
        const parts: Buffer[] = []
        for await (const chunk of request.data) parts.push(Buffer.from(chunk))
        const bytes = Buffer.concat(parts)
        return { receiptId: 'receipt-9', file: { attachmentId: createHash('sha256').update(bytes).digest('hex'), name: 'n.bin', bytes: bytes.byteLength } }
      },
    })
    const uploads = registry()
    const ctx = ctxWithUploads(service)

    const begun = await resolveBridgeCall(ctx, 'attachment/upload-begin', [{ sessionId: 's-1', name: 'n.bin', bytes: 3 }], { uploads })
    expect(begun).toEqual({ ok: true, result: { uploadId: 'up-1' } })
    const commit = resolveBridgeCall(ctx, 'attachment/upload-commit', [{ uploadId: 'up-1' }], { uploads })
    expect(await resolveBridgeCall(ctx, 'attachment/upload-chunk', [{ uploadId: 'up-1', seq: 0, data: Buffer.from('abc').toString('base64'), final: true }], { uploads }))
      .toEqual({ ok: true, result: { accepted: true } })
    const outcome = await commit
    expect(outcome).toMatchObject({ ok: true })
    expect((outcome as { result: { receiptId: string, file: { bytes: number } } }).result).toMatchObject({ receiptId: 'receipt-9', file: { bytes: 3 } })
    expect(seen).toEqual([{ sessionId: 's-1', name: 'n.bin' }])
  })

  it('refuses a non-canonical chunk, a gap, and an unknown upload id before the provider is reached', async () => {
    const uploads = registry()
    const ctx = ctxWithUploads(fileUploads())
    await resolveBridgeCall(ctx, 'attachment/upload-begin', [{ sessionId: 's-1', bytes: 3 }], { uploads })
    expect(await resolveBridgeCall(ctx, 'attachment/upload-chunk', [{ uploadId: 'up-1', seq: 0, data: '!!!!', final: true }], { uploads }))
      .toMatchObject({ ok: false, code: 'bridge-payload-invalid' })
    expect(await resolveBridgeCall(ctx, 'attachment/upload-chunk', [{ uploadId: 'up-1', seq: 1, data: Buffer.from('abc').toString('base64'), final: true }], { uploads }))
      .toMatchObject({ ok: false, code: 'bridge-upload-order' })
    expect(await resolveBridgeCall(ctx, 'attachment/upload-chunk', [{ uploadId: 'other', seq: 0, data: Buffer.from('abc').toString('base64'), final: true }], { uploads }))
      .toMatchObject({ ok: false, code: 'bridge-upload-unknown' })
    // Bounds the base declared: a declared size over the limit never mints an id.
    expect(await resolveBridgeCall(ctx, 'attachment/upload-begin', [{ sessionId: 's-1', bytes: 64 * 1024 * 1024 + 1 }], { uploads }))
      .toMatchObject({ ok: false, code: 'bridge-attachment-too-large' })
  })

  it('abort ends the in-flight commit as its own refusal', async () => {
    const uploads = registry()
    const ctx = ctxWithUploads(fileUploads())
    await resolveBridgeCall(ctx, 'attachment/upload-begin', [{ sessionId: 's-1', bytes: 9 }], { uploads })
    const commit = resolveBridgeCall(ctx, 'attachment/upload-commit', [{ uploadId: 'up-1' }], { uploads })
    expect(await resolveBridgeCall(ctx, 'attachment/upload-abort', [{ uploadId: 'up-1' }], { uploads }))
      .toEqual({ ok: true, result: { cancelled: true } })
    await expect(commit).resolves.toEqual({ ok: false, code: 'bridge-upload-cancelled' })
  })

  it('answers unavailable when the service or the per-boot registry is missing', async () => {
    const uploads = registry()
    const bare = { get: () => undefined }
    expect(await resolveBridgeCall(bare, 'attachment/upload-begin', [{ sessionId: 's-1', bytes: 1 }], { uploads }))
      .toMatchObject({ ok: false, code: 'bridge-provider-unavailable' })
    expect(await resolveBridgeCall(bare, 'attachment/upload-begin', [{ sessionId: 's-1', bytes: 1 }]))
      .toMatchObject({ ok: false, code: 'bridge-provider-unavailable' })
  })

  it('prompt: receipts become the base file parts; malformed receipt lists are refused unforwarded', async () => {
    const seen: unknown[] = []
    const sessions = {
      prompt: async (input: unknown) => {
        seen.push(input)
        return { accepted: true }
      },
    }
    const ctx = { get: (name: string) => (name === 'sessionController' ? sessions : undefined) }
    const base = { requestId: 'req-1', sessionId: 's-1', mode: 'queue' }
    expect(await resolveBridgeCall(ctx, 'session/prompt', [{ ...base, text: '', receipts: ['receipt-1'] }]))
      .toMatchObject({ ok: true })
    expect(seen[0]).toMatchObject({ content: [{ type: 'file', receiptId: 'receipt-1' }] })
    expect(await resolveBridgeCall(ctx, 'session/prompt', [{ ...base, text: '看一下', receipts: ['receipt-1'] }]))
      .toMatchObject({ ok: true })
    expect(seen[1]).toMatchObject({ content: [{ type: 'text', text: '看一下' }, { type: 'file', receiptId: 'receipt-1' }] })

    for (const payload of [
      { ...base, text: '', receipts: [] },
      { ...base, text: 'x', receipts: [1] },
      { ...base, text: 'x', receipts: Array.from({ length: 17 }, () => 'r') },
      { ...base, text: '' },
    ]) {
      expect(await resolveBridgeCall(ctx, 'session/prompt', [payload]), JSON.stringify(payload).slice(0, 40))
        .toMatchObject({ ok: false, code: 'bridge-payload-invalid' })
    }
    expect(seen).toHaveLength(2)
  })

  it('keeps the base attachment-invalid refusal its own code', async () => {
    const remote = Object.assign(new Error('File was not uploaded for this session.'), { isDSHRemoteError: true, code: 'session/attachment-invalid' })
    const sessions = { prompt: async () => { throw remote } }
    const ctx = { get: (name: string) => (name === 'sessionController' ? sessions : undefined) }
    expect(await resolveBridgeCall(ctx, 'session/prompt', [{ requestId: 'req-1', sessionId: 's-1', mode: 'queue', text: 'x', receipts: ['receipt-1'] }]))
      .toEqual({ ok: false, code: 'bridge-attachment-invalid' })
  })
})

describe('the artifact content and observation endpoints (ticket 015)', () => {
  const ctxFor = (files: unknown) => {
    const sessions = { list: () => [{ header: { id: 'session-1', cwd: '/Users/someone/project' } }] }
    return { get: (name: string) => (name === 'sessions' ? sessions : name === 'workspaceFiles' ? files : undefined) }
  }
  it('passes byte windows through, reads whole files without a range, and streams change frames', async () => {
    const seen: Array<[string, unknown]> = []
    const files = {
      readBytes: async (_scope: unknown, path: unknown, range: unknown) => { seen.push(['readBytes', range]); return { absolutePath: path, version: 'v1', offset: 0, data: 'AAAA', eof: false, bytes: 9 } },
      readAll: async (_scope: unknown, path: unknown) => { seen.push(['readAll', null]); return { absolutePath: path, version: 'v1', offset: 0, data: 'BBBB', eof: true, bytes: 3 } },
    }
    const ctx = ctxFor(files)
    expect(await resolveBridgeCall(ctx, 'workspaceFiles/readBytes', [{ workspaceRoot: '/Users/someone/project', path: 'a.bin', range: { offset: 2, length: 4 } }]))
      .toMatchObject({ ok: true, result: { data: 'AAAA' } })
    expect(seen[0]).toEqual(['readBytes', { offset: 2, length: 4 }])
    expect(await resolveBridgeCall(ctx, 'workspaceFiles/readAll', [{ workspaceRoot: '/Users/someone/project', path: 'a.bin' }]))
      .toMatchObject({ ok: true, result: { data: 'BBBB' } })
    expect(seen[1]).toEqual(['readAll', null])

    const frames: unknown[] = []
    const changesCtx = ctxFor({ changes: () => (async function* () { yield { kind: 'ready' }; yield { kind: 'change', change: { absolutePath: '/Users/someone/project/a.md', version: 'v9' } } })() })
    const outcome = await resolveBridgeStreamCall(changesCtx, 'workspaceFiles/changes', [{ workspaceRoot: '/Users/someone/project' }], (frame) => { frames.push(frame); return true })
    expect(outcome).toEqual({ ok: true, result: { frames: 2 } })
    expect(frames).toEqual([{ kind: 'ready' }, { kind: 'change', change: { absolutePath: '/Users/someone/project/a.md', version: 'v9' } }])

    // No live session bound to the root: named refusal, provider never called.
    const bare = { get: (name: string) => (name === 'sessions' ? { list: () => [] } : { changes: () => (async function* () { yield { kind: 'ready' } })() }) }
    expect(await resolveBridgeStreamCall(bare, 'workspaceFiles/changes', [{ workspaceRoot: '/Users/someone/project' }], () => true))
      .toMatchObject({ ok: false, code: 'bridge-file-scope-unavailable' })
    expect(await resolveBridgeStreamCall({ get: () => undefined }, 'workspaceFiles/changes', [{ workspaceRoot: '/Users/x' }], () => true))
      .toMatchObject({ ok: false, code: 'bridge-provider-unavailable' })
  })
})

describe('the session search endpoint (ticket 021)', () => {
  it('checks the query engine first, forwards a bounded query, and keeps the missing engine named', async () => {
    const seen: Array<{ readonly query: string }> = []
    const withEngine = {
      get: (name: string) => (name === 'sessionQuery'
        ? { searchSessions: async () => ({ items: [], hasMore: false }) }
        : name === 'sessionController'
          ? { search: async (input: { readonly query: string }) => { seen.push(input); return { items: [{ sessionId: 's-1', snippet: 'x' }], hasMore: false } } }
          : undefined),
    }
    expect(await resolveBridgeCall(withEngine, 'session/search', [{ query: '  订单 ' }]))
      .toEqual({ ok: true, result: { items: [{ sessionId: 's-1', snippet: 'x' }], hasMore: false } })
    expect(seen).toEqual([{ query: '订单' }])

    // US-087: no engine mounted is the controller's own first check — a named state, not an empty page.
    const noEngine = { get: (name: string) => (name === 'sessionController' ? { search: async () => { throw new Error('must not be reached') } } : undefined) }
    expect(await resolveBridgeCall(noEngine, 'session/search', [{ query: '订单' }]))
      .toEqual({ ok: false, code: 'bridge-search-unavailable' })

    // The query bounds are enforced before any provider call.
    for (const query of ['', '   ', 'x'.repeat(501), 'a\u0000b']) {
      expect(await resolveBridgeCall(withEngine, 'session/search', [{ query }]), JSON.stringify(query).slice(0, 20))
        .toEqual({ ok: false, code: 'bridge-search-query-rejected' })
    }
    expect(seen).toHaveLength(1)
    expect(await resolveBridgeCall(withEngine, 'session/search', [{ query: '订单', extra: 1 }]))
      .toMatchObject({ ok: false, code: 'bridge-payload-invalid' })
    expect(await resolveBridgeCall({ get: () => undefined }, 'session/search', [{ query: '订单' }]))
      .toMatchObject({ ok: false, code: 'bridge-search-unavailable' })
    const noController = { get: (name: string) => (name === 'sessionQuery' ? {} : undefined) }
    expect(await resolveBridgeCall(noController, 'session/search', [{ query: '订单' }]))
      .toMatchObject({ ok: false, code: 'bridge-provider-unavailable' })
  })
})

describe('the session fork endpoint (ticket 024)', () => {
  it('forwards the source (and only a valid anchor), and keeps fork-unavailable named', async () => {
    const seen: unknown[] = []
    const ctx = { get: (name: string) => (name === 'sessionController' ? { fork: async (input: unknown) => { seen.push(input); return { sessionId: 'session-child-1' } } } : undefined) }
    expect(await resolveBridgeCall(ctx, 'session/fork', [{ sessionId: 'session-main' }])).toEqual({ ok: true, result: { sessionId: 'session-child-1' } })
    expect(seen).toEqual([{ sessionId: 'session-main' }])
    expect(await resolveBridgeCall(ctx, 'session/fork', [{ sessionId: 'session-main', atSeq: 7 }])).toMatchObject({ ok: true })
    expect(seen[1]).toEqual({ sessionId: 'session-main', atSeq: 7 })
    expect(await resolveBridgeCall(ctx, 'session/fork', [{ sessionId: 'session-main', atSeq: -1 }])).toEqual({ ok: false, code: 'bridge-payload-invalid' })
    expect(await resolveBridgeCall(ctx, 'session/fork', [{ sessionId: 'x'.repeat(257) }])).toMatchObject({ ok: false, code: 'bridge-workspace-ref-invalid' })
    expect(await resolveBridgeCall({ get: () => undefined }, 'session/fork', [{ sessionId: 'session-main' }])).toMatchObject({ ok: false, code: 'bridge-provider-unavailable' })
    const noTurn = { get: (name: string) => (name === 'sessionController' ? { fork: async () => { throw Object.assign(new Error('none'), { isDSHRemoteError: true, code: 'session/fork-unavailable' }) } } : undefined) }
    expect(await resolveBridgeCall(noTurn, 'session/fork', [{ sessionId: 'session-main' }])).toEqual({ ok: false, code: 'bridge-fork-unavailable' })
  })
})
