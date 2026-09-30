import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }))

vi.mock('node:child_process', () => ({ spawn: spawnMock }))

import { ShellHostProcess } from '../src/main/host-process.js'
import { SHELL_HOST_PROTOCOL_VERSION } from '../src/protocol.js'
import type { HostRuntime } from '../src/main/runtime.js'

class FakeChild extends EventEmitter {
  readonly stdout = new PassThrough()
  readonly stderr = new PassThrough()
  readonly requestPipe = new PassThrough()
  readonly responsePipe = new PassThrough()
  readonly stdio = [null, this.stdout, this.stderr, this.requestPipe, this.responsePipe]
  connected = true
  readonly send = vi.fn((message: unknown) => {
    if ((message as { type?: unknown }).type === 'shutdown') {
      this.connected = false
      queueMicrotask(() => { this.emit('exit', 0) })
    }
  })
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
  dshVersion: '0.1.5-rc.2',
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

beforeEach(() => {
  spawnMock.mockReset()
})

describe('ShellHostProcess live snapshot', () => {
  it('uses a main-owned namespaced UUID and publishes an exact frozen active snapshot', async () => {
    const { child, host } = createHost()
    const initial = host.readSnapshot()

    expect(initial).toEqual({
      kind: 'unavailable',
      bootId: expect.stringMatching(/^sage-host:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u),
      runtimeGeneration: 1,
      reason: 'not-ready',
    })
    expect(Object.isFrozen(initial)).toBe(true)

    const started = host.start()
    child.emit('message', ready)
    await expect(started).resolves.toEqual(ready)

    const active = host.readSnapshot()
    expect(active).toEqual({
      kind: 'active',
      bootId: initial.bootId,
      runtimeGeneration: 1,
      activeGeneration: 'sage-dev',
      manifestSha256: 'a'.repeat(64),
      loaderPhase: 'active',
      hostProtocolVersion: '4',
      harnessVersion: '0.1.5-rc.2',
    })
    expect(Object.isFrozen(active)).toBe(true)
    expect(Object.keys(active)).toEqual([
      'kind',
      'bootId',
      'runtimeGeneration',
      'activeGeneration',
      'manifestSha256',
      'loaderPhase',
      'hostProtocolVersion',
      'harnessVersion',
    ])
  })

  it('binds ready to the expected profile facts and never reuses an invalidated epoch', async () => {
    const { child, host } = createHost()
    const started = host.start()

    child.emit('message', { ...ready, profileGeneration: 'stale-generation' })

    await expect(started).rejects.toThrow(/profile generation/u)
    expect(host.readSnapshot()).toMatchObject({
      kind: 'unavailable',
      runtimeGeneration: 2,
      reason: 'fatal',
    })
    child.emit('message', ready)
    expect(host.readSnapshot()).toMatchObject({
      kind: 'unavailable',
      runtimeGeneration: 2,
      reason: 'fatal',
    })
  })

  it('rejects a ready event bound to a different active-profile manifest', async () => {
    const { child, host } = createHost()
    const started = host.start()

    child.emit('message', { ...ready, manifestSha256: 'b'.repeat(64) })

    await expect(started).rejects.toThrow(/manifest digest/u)
    expect(host.readSnapshot()).toMatchObject({
      kind: 'unavailable',
      runtimeGeneration: 2,
      reason: 'fatal',
    })
  })

  it('rejects invalidation before ready and cannot consume a later ready event', async () => {
    const { child, host } = createHost()
    const started = host.start()

    child.emit('message', { type: 'runtime-invalidated' })

    await expect(started).rejects.toThrow(/invalidated before ready/u)
    const invalidated = host.readSnapshot()
    child.emit('message', ready)
    expect(host.readSnapshot()).toBe(invalidated)
  })

  it('invalidates once and cannot be revived by a late ready or teardown noise', async () => {
    const { child, host } = await startReady()

    child.emit('message', { type: 'runtime-invalidated' })
    const invalidated = host.readSnapshot()
    expect(invalidated).toMatchObject({
      kind: 'unavailable',
      runtimeGeneration: 2,
      reason: 'invalidated',
    })
    expect(Object.isFrozen(invalidated)).toBe(true)

    child.emit('message', ready)
    child.emit('disconnect')
    child.emit('exit', 0)
    expect(host.readSnapshot()).toBe(invalidated)
  })

  it.each([
    ['fatal', (child: FakeChild) => { child.emit('message', { type: 'fatal', message: 'boom' }) }],
    ['disconnect', (child: FakeChild) => { child.connected = false; child.emit('disconnect') }],
    ['exit', (child: FakeChild) => { child.emit('exit', 1) }],
  ] as const)('marks a ready child unavailable on %s', async (reason, trigger) => {
    const { child, host } = await startReady()

    trigger(child)

    expect(host.readSnapshot()).toMatchObject({
      kind: 'unavailable',
      runtimeGeneration: 2,
      reason,
    })
  })

  it('marks stop unavailable synchronously and keeps that state after child exit', async () => {
    const { host } = await startReady()

    const stopped = host.stop()
    const snapshot = host.readSnapshot()
    expect(snapshot).toMatchObject({
      kind: 'unavailable',
      runtimeGeneration: 2,
      reason: 'stopped',
    })
    await stopped
    expect(host.readSnapshot()).toBe(snapshot)
  })

  it('cannot spawn a new child after stop made the lifecycle terminal', async () => {
    const { host } = createHost()

    await host.stop()

    await expect(host.start()).rejects.toThrow(/cannot be reused/u)
    expect(spawnMock).not.toHaveBeenCalled()
    expect(host.readSnapshot()).toMatchObject({
      kind: 'unavailable',
      runtimeGeneration: 2,
      reason: 'stopped',
    })
  })
})
