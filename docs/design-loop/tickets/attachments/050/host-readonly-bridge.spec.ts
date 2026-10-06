import { EventEmitter } from 'node:events'
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
import { READONLY_BRIDGE_ENDPOINTS, resolveReadOnlyCall } from '../src/host/readonly-bridge.js'
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
    await expect(host.callReadOnly('settings/describe')).rejects.toMatchObject({ code: 'bridge-host-not-ready' })
    expect(child.send).not.toHaveBeenCalled()
  })

  it('sends exactly one frame that the Host-side validator accepts, and resolves with the answered result', async () => {
    const { child, host } = await startReady()
    const call = host.callReadOnly('settings/describe')

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
    await expect(host.callReadOnly('session/prompt')).rejects.toMatchObject({ code: 'bridge-endpoint-unsupported' })
    expect(bridgeFrames(child)).toEqual([])
    expect(child.send).not.toHaveBeenCalled()
  })

  it.each([
    ['disconnect', (child: FakeChild) => { child.connected = false; child.emit('disconnect') }],
    ['exit', (child: FakeChild) => { child.emit('exit', 1) }],
  ])('reports %s during an unanswered call as lost instead of resolving', async (_reason, trigger) => {
    const { child, host } = await startReady()
    const call = host.callReadOnly('settings/describe')
    const callId = bridgeFrames(child)[0]?.callId
    trigger(child)
    await expect(call).rejects.toMatchObject({ code: 'bridge-host-lost' })
    child.emit('message', { type: 'bridge-result', callId, ok: true, result: { namespaces: [] } })
    await expect(call).rejects.toMatchObject({ code: 'bridge-host-lost' })
  })

  it('carries a refusal code back instead of a result', async () => {
    const { child, host } = await startReady()
    const call = host.callReadOnly('settings/describe')
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
    expect([...READONLY_BRIDGE_ENDPOINTS]).toEqual(['settings/describe'])

    const outcome = await resolveReadOnlyCall(ctx, 'settings/describe')
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
    await expect(resolveReadOnlyCall(ctx, 'credentials/describe')).resolves.toMatchObject({
      ok: false,
      code: 'bridge-endpoint-unsupported',
    })
    expect(ctx.get).not.toHaveBeenCalled()
  })

  it('normalizes a missing provider, a throwing provider, and a result that cannot cross unchanged', async () => {
    await expect(resolveReadOnlyCall({ get: () => undefined }, 'settings/describe')).resolves.toMatchObject({
      code: 'bridge-provider-unavailable',
    })
    await expect(resolveReadOnlyCall({ get: () => ({ describe: 'not-a-function' }) }, 'settings/describe'))
      .resolves.toMatchObject({ code: 'bridge-provider-unavailable' })
    await expect(resolveReadOnlyCall({ get: () => ({ describe: async () => { throw new Error('boom') } }) }, 'settings/describe'))
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
      const outcome = await resolveReadOnlyCall({ get: () => ({ describe: async () => build() }) }, 'settings/describe')
      expect(outcome, label).toMatchObject({ ok: false, code: 'bridge-result-not-plain-data' })
    }
  })

  it('accepts the plain-data shapes a redacted settings view actually uses', async () => {
    const value = {
      namespaces: [{ ns: 'models', items: [{ name: 'apiKeyEnv', state: 'configured', port: 43120, enabled: true, note: null }] }],
    }
    await expect(resolveReadOnlyCall({ get: () => ({ describe: async () => value }) }, 'settings/describe'))
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
    expect(isHostCommand({ type: 'bridge-call', callId: 'x'.repeat(8), endpoint: 'session/prompt', payload: [] })).toBe(false)
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
