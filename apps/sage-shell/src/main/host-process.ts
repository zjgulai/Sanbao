/** Host child lifecycle and streaming custom-protocol carrier. */

import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { Readable, Writable } from 'node:stream'
import {
  HostResponseDecoder,
  SHELL_HOST_PROTOCOL_VERSION,
  SHELL_PIPE_CHUNK_BYTES,
  SHELL_REQUEST_PIPE_FD,
  SHELL_RESPONSE_PIPE_FD,
  encodeRequestCancel,
  encodeRequestData,
  encodeRequestEnd,
  encodeRequestStart,
  isHostEvent,
  type HostCommand,
  type HostEvent,
  type HostResponseFrame,
  type RuntimeEffectiveObservation,
} from '../protocol.js'
import type { HostRuntime } from './runtime.js'

interface PendingResponse {
  readonly resolve: (response: Response) => void
  readonly reject: (error: Error) => void
  responseStarted: boolean
  uploadOpen: boolean
  controller?: ReadableStreamDefaultController<Uint8Array>
  requestReader?: ReadableStreamDefaultReader<Uint8Array>
  removeAbort?: () => void
}

function errorOf(reason: unknown, fallback: string): Error {
  return reason instanceof Error ? reason : new Error(fallback)
}

/** Freeze the validated observation so no consumer can mutate the stored snapshot. */
function freezeObservation(value: RuntimeEffectiveObservation): RuntimeEffectiveObservation {
  if (value.kind === 'observed') {
    for (const row of value.presets) Object.freeze(row)
    Object.freeze(value.presets)
  }
  return Object.freeze(value)
}

async function exitsWithin(exit: Promise<void>, milliseconds: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => { resolve(false) }, milliseconds)
    timer.unref()
  })
  try {
    return await Promise.race([exit.then(() => true), timeout])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

/** Ready facts reported by one installed dsh child. */
export type HostReady = Extract<HostEvent, { readonly type: 'ready' }>

export type ShellHostUnavailableReason =
  | 'not-ready'
  | 'invalidated'
  | 'fatal'
  | 'exit'
  | 'disconnect'
  | 'stopped'

/** Main-owned live facts for the one active Host epoch. */
export interface ShellHostActiveRuntimeSnapshot {
  readonly kind: 'active'
  readonly bootId: string
  readonly runtimeGeneration: number
  readonly activeGeneration: string
  readonly manifestSha256: string
  readonly loaderPhase: 'active'
  readonly hostProtocolVersion: string
  readonly harnessVersion: string
}

/** Main-owned marker retained after a Host epoch becomes unusable. */
export interface ShellHostUnavailableRuntimeSnapshot {
  readonly kind: 'unavailable'
  readonly bootId: string
  readonly runtimeGeneration: number
  readonly reason: ShellHostUnavailableReason
}

/** Frozen snapshot consumed by the main-owned runtime inventory projection. */
export type ShellHostRuntimeSnapshot =
  | ShellHostActiveRuntimeSnapshot
  | ShellHostUnavailableRuntimeSnapshot

/** One dsh backend running as a plain-Node child process. */
export class ShellHostProcess {
  private child: ChildProcess | undefined
  private requestPipe: Writable | undefined
  private responsePipe: Readable | undefined
  private readonly responseDecoder = new HostResponseDecoder()
  private requestWriteTail: Promise<void> = Promise.resolve()
  private nextStreamId = 1
  private readonly pending = new Map<number, PendingResponse>()
  private readonly blockedResponses = new Set<number>()
  private readyResolve!: (ready: HostReady) => void
  private readyReject!: (error: Error) => void
  private readonly readyPromise = new Promise<HostReady>((resolve, reject) => {
    this.readyResolve = resolve
    this.readyReject = reject
  })
  private exitPromise: Promise<void> | undefined
  private stderr = ''
  private readonly bootId = `sage-host:${randomUUID()}`
  private runtimeGeneration = 1
  private snapshot: ShellHostRuntimeSnapshot
  private runtimeEffective: RuntimeEffectiveObservation | undefined
  private started = false
  private terminal = false
  private readyState: 'pending' | 'resolved' | 'rejected' = 'pending'

  /**
   * @param runtime - resolved node binary, host entry, profile directory, and scrubbed child environment.
   */
  constructor(private readonly runtime: HostRuntime) {
    this.snapshot = Object.freeze({
      kind: 'unavailable',
      bootId: this.bootId,
      runtimeGeneration: this.runtimeGeneration,
      reason: 'not-ready',
    })
  }

  /** Read the immutable current Host lifecycle snapshot. */
  readSnapshot(): ShellHostRuntimeSnapshot {
    return this.snapshot
  }

  /** Read the runtime-effective observation of the live Host epoch; undefined once the epoch is gone. */
  readRuntimeEffective(): unknown {
    return this.runtimeEffective
  }

  /** Start the child once and resolve only after its complete composition is active. */
  async start(): Promise<HostReady> {
    if (this.started) return this.readyPromise
    this.started = true
    if (this.terminal) {
      this.rejectReady(new Error('sage shell: host lifecycle cannot be reused'))
      return this.readyPromise
    }
    let child: ChildProcess
    try {
      child = spawn(this.runtime.node, [this.runtime.entry, this.runtime.sageRoot, this.runtime.profileDir], {
        cwd: this.runtime.profileDir,
        env: this.runtime.env,
        stdio: ['ignore', 'pipe', 'pipe', 'pipe', 'pipe', 'ipc'],
      })
    } catch (error) {
      this.fail(errorOf(error, 'sage shell: failed to spawn host'), 'fatal')
      return this.readyPromise
    }
    const requestPipe = child.stdio[SHELL_REQUEST_PIPE_FD]
    const responsePipe = child.stdio[SHELL_RESPONSE_PIPE_FD]
    if (!(requestPipe instanceof Writable) || !(responsePipe instanceof Readable)) {
      child.kill('SIGTERM')
      this.fail(new Error('sage shell: host did not expose the required byte pipes and IPC channel'), 'fatal')
      return this.readyPromise
    }
    this.child = child
    this.requestPipe = requestPipe
    this.responsePipe = responsePipe
    child.stderr?.setEncoding('utf8')
    child.stderr?.on('data', (chunk: string) => { this.stderr += chunk })
    child.stdout?.pipe(process.stdout)
    responsePipe.on('data', (chunk: Buffer) => { this.acceptResponseBytes(chunk) })
    responsePipe.once('end', () => {
      try {
        this.responseDecoder.finish()
        this.fail(new Error('sage shell: host response pipe ended'), 'fatal')
      } catch (error) {
        this.fail(errorOf(error, 'sage shell: host response pipe failed'), 'fatal')
      }
    })
    requestPipe.once('error', (error) => { this.fail(error, 'fatal') })
    responsePipe.once('error', (error) => { this.fail(error, 'fatal') })
    child.on('message', (message: unknown) => {
      if (!isHostEvent(message)) {
        this.fail(new Error('sage shell: host sent an invalid IPC event'), 'fatal')
        child.kill('SIGTERM')
        return
      }
      this.handleMessage(message)
    })
    child.once('error', (error) => { this.fail(error, 'fatal') })
    child.once('disconnect', () => {
      this.fail(new Error('sage shell: host IPC disconnected'), 'disconnect')
    })
    this.exitPromise = new Promise<void>((resolve) => {
      child.once('exit', (code) => {
        const suffix = this.stderr.trim() === '' ? '' : `: ${this.stderr.trim()}`
        if (code !== 0 && code !== null) this.fail(new Error(`sage shell: host exited with ${String(code)}${suffix}`), 'exit')
        else this.fail(new Error(`sage shell: host stopped${suffix}`), 'exit')
        resolve()
      })
    })
    return this.readyPromise
  }

  /** Forward one `dsh-app://app` request to the child without buffering its body. */
  async fetch(request: Request): Promise<Response> {
    await this.start()
    const child = this.child
    if (this.snapshot.kind !== 'active' || child === undefined || !child.connected || this.requestPipe === undefined) {
      throw new Error('sage shell: host is unavailable')
    }
    if (this.nextStreamId > 0xffff_ffff) throw new Error('sage shell: host exhausted its request stream ids')
    const streamId = this.nextStreamId++
    const method = request.method.toUpperCase()
    const hasBody = method !== 'GET' && method !== 'HEAD' && request.body !== null
    return new Promise<Response>((resolve, reject) => {
      const pending: PendingResponse = {
        resolve,
        reject,
        responseStarted: false,
        uploadOpen: hasBody,
      }
      const abort = (): void => {
        if (!this.pending.has(streamId)) return
        const error = errorOf(request.signal.reason, 'request aborted')
        pending.uploadOpen = false
        void pending.requestReader?.cancel(error).catch(() => undefined)
        this.enqueueRequestFrame(encodeRequestCancel(streamId)).catch((pipeError: unknown) => {
          this.fail(errorOf(pipeError, 'sage shell: request pipe failed'))
        })
        if (pending.controller === undefined) pending.reject(error)
        else pending.controller.error(error)
        this.finishPending(streamId, false)
      }
      if (request.signal.aborted) {
        reject(errorOf(request.signal.reason, 'request aborted'))
        return
      }
      request.signal.addEventListener('abort', abort, { once: true })
      pending.removeAbort = () => { request.signal.removeEventListener('abort', abort) }
      this.pending.set(streamId, pending)
      this.pumpRequest(streamId, request, hasBody).catch((error: unknown) => {
        this.failPending(streamId, errorOf(error, 'sage shell: request upload failed'))
      })
    })
  }

  /** Request graceful teardown, then wait for child exit. */
  async stop(): Promise<void> {
    this.invalidateSnapshot('stopped')
    const child = this.child
    if (child === undefined) return
    this.blockedResponses.clear()
    this.responsePipe?.resume()
    if (child.connected) this.send({ type: 'shutdown' })
    // Closing the parent-owned write end releases the Host's pending Windows pipe read.
    this.requestPipe?.destroy()
    const exited = this.exitPromise ?? Promise.resolve()
    if (!await exitsWithin(exited, 10_000)) child.kill('SIGTERM')
    if (!await exitsWithin(exited, 5_000)) {
      child.kill('SIGKILL')
      if (!await exitsWithin(exited, 5_000)) {
        throw new Error('sage shell: host did not exit after SIGKILL')
      }
    }
    this.child = undefined
    this.requestPipe = undefined
    this.responsePipe = undefined
  }

  private async pumpRequest(streamId: number, request: Request, hasBody: boolean): Promise<void> {
    await this.enqueueRequestFrame(encodeRequestStart(streamId, {
      url: request.url,
      method: request.method.toUpperCase(),
      headers: [...request.headers.entries()],
      hasBody,
    }))
    // A hasBody:false request must never be followed by an end frame; the Host treats a spurious end as fatal.
    if (!hasBody) return
    const body = request.body
    if (body === null) throw new Error('sage shell: request body disappeared before upload')
    const reader = body.getReader()
    const pending = this.pending.get(streamId)
    if (pending === undefined) {
      await reader.cancel()
      return
    }
    pending.requestReader = reader
    try {
      for (;;) {
        const next = await reader.read()
        if (next.done) break
        for (let offset = 0; offset < next.value.byteLength; offset += SHELL_PIPE_CHUNK_BYTES) {
          if (!this.pending.has(streamId)) return
          await this.enqueueRequestFrame(encodeRequestData(
            streamId,
            next.value.subarray(offset, offset + SHELL_PIPE_CHUNK_BYTES),
          ))
        }
      }
      const live = this.pending.get(streamId)
      if (live !== undefined) {
        await this.enqueueRequestFrame(encodeRequestEnd(streamId))
        live.uploadOpen = false
      }
    } finally {
      reader.releaseLock()
      const live = this.pending.get(streamId)
      if (live?.requestReader === reader) delete live.requestReader
    }
  }

  private enqueueRequestFrame(frame: Buffer): Promise<void> {
    const write = this.requestWriteTail.then(async () => {
      const pipe = this.requestPipe
      if (pipe === undefined || pipe.destroyed) throw new Error('sage shell: host request pipe is unavailable')
      if (!pipe.write(frame)) await once(pipe, 'drain')
    })
    this.requestWriteTail = write.catch(() => undefined)
    return write
  }

  private send(message: HostCommand): void {
    const child = this.child
    if (child === undefined || !child.connected) throw new Error('sage shell: host IPC is unavailable')
    child.send(message)
  }

  private acceptResponseBytes(chunk: Buffer): void {
    try {
      for (const frame of this.responseDecoder.push(chunk)) this.handleResponseFrame(frame)
    } catch (error) {
      this.fail(errorOf(error, 'sage shell: host response pipe failed'))
      this.child?.kill('SIGTERM')
    }
  }

  private handleResponseFrame(frame: HostResponseFrame): void {
    const pending = this.pending.get(frame.streamId)
    if (pending === undefined) {
      if (frame.streamId >= this.nextStreamId) {
        throw new Error(`sage shell: host responded for unknown stream ${String(frame.streamId)}`)
      }
      return
    }
    switch (frame.type) {
      case 'start': {
        if (pending.responseStarted) throw new Error(`sage shell: host started stream ${String(frame.streamId)} twice`)
        pending.responseStarted = true
        let body: ReadableStream<Uint8Array> | null = null
        if (frame.hasBody) {
          body = new ReadableStream<Uint8Array>({
            start: (controller) => { pending.controller = controller },
            pull: () => {
              this.blockedResponses.delete(frame.streamId)
              this.resumeResponsePipe()
            },
            cancel: (reason) => { this.cancelResponse(frame.streamId, reason) },
          })
        }
        pending.resolve(new Response(body, {
          status: frame.status,
          headers: new Headers(frame.headers.map(([name, value]) => [name, value] as [string, string])),
        }))
        return
      }
      case 'data': {
        const controller = pending.controller
        if (!pending.responseStarted || controller === undefined) {
          throw new Error(`sage shell: host sent body data before a body start for stream ${String(frame.streamId)}`)
        }
        controller.enqueue(frame.data)
        if ((controller.desiredSize ?? 0) <= 0) {
          this.blockedResponses.add(frame.streamId)
          this.responsePipe?.pause()
        }
        return
      }
      case 'end':
        if (!pending.responseStarted) {
          throw new Error(`sage shell: host ended stream ${String(frame.streamId)} before its response start`)
        }
        pending.controller?.close()
        this.finishPending(frame.streamId, true)
        return
      case 'error':
        this.failPending(frame.streamId, new Error(frame.message))
        return
      default:
        frame satisfies never
    }
  }

  private cancelResponse(streamId: number, reason: unknown): void {
    const pending = this.pending.get(streamId)
    if (pending === undefined) return
    pending.uploadOpen = false
    void pending.requestReader?.cancel(reason).catch(() => undefined)
    this.enqueueRequestFrame(encodeRequestCancel(streamId)).catch((error: unknown) => {
      this.fail(errorOf(error, 'sage shell: request pipe failed'))
    })
    this.finishPending(streamId, false)
  }

  private failPending(streamId: number, error: Error): void {
    const pending = this.pending.get(streamId)
    if (pending === undefined) return
    pending.uploadOpen = false
    void pending.requestReader?.cancel(error).catch(() => undefined)
    if (pending.controller === undefined) pending.reject(error)
    else pending.controller.error(error)
    this.enqueueRequestFrame(encodeRequestCancel(streamId)).catch((pipeError: unknown) => {
      this.fail(errorOf(pipeError, 'sage shell: request pipe failed'))
    })
    this.finishPending(streamId, false)
  }

  private finishPending(streamId: number, cancelOpenUpload: boolean): void {
    const pending = this.pending.get(streamId)
    if (pending === undefined) return
    if (cancelOpenUpload && pending.uploadOpen) {
      pending.uploadOpen = false
      void pending.requestReader?.cancel().catch(() => undefined)
      this.enqueueRequestFrame(encodeRequestCancel(streamId)).catch((error: unknown) => {
        this.fail(errorOf(error, 'sage shell: request pipe failed'))
      })
    }
    pending.removeAbort?.()
    this.pending.delete(streamId)
    this.blockedResponses.delete(streamId)
    this.resumeResponsePipe()
  }

  private resumeResponsePipe(): void {
    if (this.blockedResponses.size === 0) this.responsePipe?.resume()
  }

  private handleMessage(message: HostEvent): void {
    switch (message.type) {
      case 'ready': {
        if (this.terminal || this.readyState !== 'pending') return
        if (message.profileGeneration !== this.runtime.expectedProfileGeneration) {
          this.fail(new Error(
            `sage shell: host ready profile generation ${JSON.stringify(message.profileGeneration)} did not match ${JSON.stringify(this.runtime.expectedProfileGeneration)}`,
          ), 'fatal')
          this.child?.kill('SIGTERM')
          return
        }
        if (message.manifestSha256 !== this.runtime.expectedManifestSha256) {
          this.fail(new Error('sage shell: host ready manifest digest did not match the active profile'), 'fatal')
          this.child?.kill('SIGTERM')
          return
        }
        this.snapshot = Object.freeze({
          kind: 'active',
          bootId: this.bootId,
          runtimeGeneration: this.runtimeGeneration,
          activeGeneration: message.profileGeneration,
          manifestSha256: message.manifestSha256,
          loaderPhase: message.loaderPhase,
          hostProtocolVersion: String(message.protocolVersion),
          harnessVersion: message.dshVersion,
        })
        this.runtimeEffective = freezeObservation(message.runtimeEffective)
        this.readyState = 'resolved'
        this.readyResolve(message)
        return
      }
      case 'runtime-invalidated':
        if (this.readyState === 'pending') {
          this.fail(new Error('sage shell: host runtime invalidated before ready'), 'invalidated')
          this.child?.kill('SIGTERM')
        } else {
          this.invalidateSnapshot('invalidated')
        }
        return
      case 'fatal':
        this.fail(new Error(message.message), 'fatal')
        // A boot() rejection sends fatal without disconnecting; the open IPC channel keeps the child alive, so never rely on self-termination.
        this.child?.kill('SIGTERM')
        return
      default:
        message satisfies never
    }
  }

  private invalidateSnapshot(reason: ShellHostUnavailableReason): void {
    if (this.terminal) return
    this.terminal = true
    this.runtimeGeneration += 1
    this.runtimeEffective = undefined
    this.snapshot = Object.freeze({
      kind: 'unavailable',
      bootId: this.bootId,
      runtimeGeneration: this.runtimeGeneration,
      reason,
    })
  }

  private rejectReady(error: Error): void {
    if (this.readyState !== 'pending') return
    this.readyState = 'rejected'
    this.readyReject(error)
  }

  private fail(error: Error, reason: ShellHostUnavailableReason = 'fatal'): void {
    this.invalidateSnapshot(reason)
    this.rejectReady(error)
    for (const pending of this.pending.values()) {
      void pending.requestReader?.cancel(error).catch(() => undefined)
      if (pending.controller === undefined) pending.reject(error)
      else pending.controller.error(error)
      pending.removeAbort?.()
    }
    this.pending.clear()
    this.blockedResponses.clear()
    this.responsePipe?.resume()
  }
}
