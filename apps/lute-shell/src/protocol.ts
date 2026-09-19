/** Versioned control messages and framed request/response bytes for the lute shell host transport. */

/** Protocol version shared with the Electron shell. */
export const SHELL_HOST_PROTOCOL_VERSION = 3 as const

/** Child descriptor that receives Electron request frames. */
export const SHELL_REQUEST_PIPE_FD = 3

/** Child descriptor that emits Host response frames. */
export const SHELL_RESPONSE_PIPE_FD = 4

/** Child descriptor reserved for Node's lifecycle IPC channel. */
export const SHELL_CONTROL_IPC_FD = 5

/** Maximum raw body bytes carried by one data frame. */
export const SHELL_PIPE_CHUNK_BYTES = 64 * 1024

export const FRAME_MAGIC = 0x44534833
export const FRAME_HEADER_BYTES = 13
export const MAX_CONTROL_PAYLOAD_BYTES = 1024 * 1024

const REQUEST_FRAME_START = 1
const REQUEST_FRAME_DATA = 2
const REQUEST_FRAME_END = 3
const REQUEST_FRAME_CANCEL = 4

const RESPONSE_FRAME_START = 1
const RESPONSE_FRAME_DATA = 2
const RESPONSE_FRAME_END = 3
const RESPONSE_FRAME_ERROR = 4

/** Metadata that precedes one optional request body on the request pipe. */
export interface HostRequestStart {
  readonly url: string
  readonly method: string
  readonly headers: readonly [string, string][]
  readonly hasBody: boolean
}

/** One validated request-pipe frame. */
export type HostRequestFrame = {
  readonly type: 'start'
  readonly streamId: number
  readonly url: string
  readonly method: string
  readonly headers: readonly [string, string][]
  readonly hasBody: boolean
} | {
  readonly type: 'data'
  readonly streamId: number
  readonly data: Buffer
} | {
  readonly type: 'end' | 'cancel'
  readonly streamId: number
}

/** One decoded response-pipe frame. */
export type HostResponseFrame = {
  readonly type: 'start'
  readonly streamId: number
  readonly status: number
  readonly headers: readonly [string, string][]
  readonly hasBody: boolean
} | {
  readonly type: 'data'
  readonly streamId: number
  readonly data: Buffer
} | {
  readonly type: 'end'
  readonly streamId: number
} | {
  readonly type: 'error'
  readonly streamId: number
  readonly message: string
}

/** Commands retained on Node IPC because they do not carry Fetch payload bytes. */
export type HostCommand = {
  readonly type: 'shutdown'
}

/** Lifecycle events retained on Node IPC. */
export type HostEvent = {
  readonly type: 'ready'
  readonly protocolVersion: typeof SHELL_HOST_PROTOCOL_VERSION
  readonly dshVersion: string
} | {
  readonly type: 'fatal'
  readonly message: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isHeaders(value: unknown): value is readonly [string, string][] {
  return Array.isArray(value) && value.every(header => Array.isArray(header) && header.length === 2
    && typeof header[0] === 'string' && typeof header[1] === 'string')
}

function assertStreamId(streamId: number): void {
  if (!Number.isInteger(streamId) || streamId < 1 || streamId > 0xffff_ffff) {
    throw new Error(`lute shell: invalid pipe stream id ${String(streamId)}`)
  }
}

function encodeFrame(type: number, streamId: number, payload: Buffer): Buffer {
  assertStreamId(streamId)
  // 2 is the data frame on both pipes; the two directions share one byte limit.
  const limit = type === 2 ? SHELL_PIPE_CHUNK_BYTES : MAX_CONTROL_PAYLOAD_BYTES
  if (payload.byteLength > limit) {
    throw new Error(`lute shell: pipe frame exceeds the ${String(limit)}-byte limit`)
  }
  const frame = Buffer.allocUnsafe(FRAME_HEADER_BYTES + payload.byteLength)
  frame.writeUInt32BE(FRAME_MAGIC, 0)
  frame.writeUInt8(type, 4)
  frame.writeUInt32BE(streamId, 5)
  frame.writeUInt32BE(payload.byteLength, 9)
  payload.copy(frame, FRAME_HEADER_BYTES)
  return frame
}

function encodeJsonFrame(type: number, streamId: number, value: unknown): Buffer {
  return encodeFrame(type, streamId, Buffer.from(JSON.stringify(value), 'utf8'))
}

/** Encode the metadata opening one request stream. */
export function encodeRequestStart(streamId: number, request: HostRequestStart): Buffer {
  return encodeJsonFrame(REQUEST_FRAME_START, streamId, request)
}

/** Encode one bounded raw request-body chunk. */
export function encodeRequestData(streamId: number, data: Uint8Array): Buffer {
  return encodeFrame(REQUEST_FRAME_DATA, streamId, Buffer.from(data))
}

/** Encode normal request-body completion. */
export function encodeRequestEnd(streamId: number): Buffer {
  return encodeFrame(REQUEST_FRAME_END, streamId, Buffer.alloc(0))
}

/** Encode cancellation of one request and its response. */
export function encodeRequestCancel(streamId: number): Buffer {
  return encodeFrame(REQUEST_FRAME_CANCEL, streamId, Buffer.alloc(0))
}

/** Encode response metadata before any body frames. */
export function encodeResponseStart(
  streamId: number,
  response: {
    readonly status: number
    readonly headers: readonly [string, string][]
    readonly hasBody: boolean
  },
): Buffer {
  return encodeJsonFrame(RESPONSE_FRAME_START, streamId, response)
}

/** Encode one bounded raw response-body chunk. */
export function encodeResponseData(streamId: number, data: Uint8Array): Buffer {
  return encodeFrame(RESPONSE_FRAME_DATA, streamId, Buffer.from(data))
}

/** Encode normal response completion. */
export function encodeResponseEnd(streamId: number): Buffer {
  return encodeFrame(RESPONSE_FRAME_END, streamId, Buffer.alloc(0))
}

/** Encode one response failure without exposing an Error object across processes. */
export function encodeResponseError(streamId: number, message: string): Buffer {
  return encodeJsonFrame(RESPONSE_FRAME_ERROR, streamId, { message })
}

/** Incrementally decode validated request frames from the Electron byte pipe. */
export class HostRequestDecoder {
  private buffer: Buffer = Buffer.alloc(0)

  /** Append bytes and return every complete request frame. */
  push(chunk: Buffer): HostRequestFrame[] {
    this.buffer = this.buffer.byteLength === 0 ? chunk : Buffer.concat([this.buffer, chunk])
    const frames: HostRequestFrame[] = []
    for (;;) {
      const frame = this.next()
      if (frame === undefined) return frames
      frames.push(frame)
    }
  }

  /** Reject EOF that splits a frame. */
  finish(): void {
    if (this.buffer.byteLength !== 0) throw new Error('lute shell: Electron request pipe ended inside a frame')
  }

  private next(): HostRequestFrame | undefined {
    if (this.buffer.byteLength < FRAME_HEADER_BYTES) return undefined
    if (this.buffer.readUInt32BE(0) !== FRAME_MAGIC) throw new Error('lute shell: invalid Electron request frame marker')
    const rawType = this.buffer.readUInt8(4)
    const streamId = this.buffer.readUInt32BE(5)
    const payloadLength = this.buffer.readUInt32BE(9)
    assertStreamId(streamId)
    const limit = rawType === REQUEST_FRAME_DATA ? SHELL_PIPE_CHUNK_BYTES : MAX_CONTROL_PAYLOAD_BYTES
    if (payloadLength > limit) {
      throw new Error(`lute shell: Electron request frame exceeds the ${String(limit)}-byte limit`)
    }
    const frameLength = FRAME_HEADER_BYTES + payloadLength
    if (this.buffer.byteLength < frameLength) return undefined
    const payload = this.buffer.subarray(FRAME_HEADER_BYTES, frameLength)
    this.buffer = this.buffer.subarray(frameLength)
    switch (rawType) {
      case REQUEST_FRAME_START:
        return this.parseStart(streamId, payload)
      case REQUEST_FRAME_DATA:
        return { type: 'data', streamId, data: payload }
      case REQUEST_FRAME_END:
        if (payloadLength !== 0) throw new Error('lute shell: Electron request end frame carried a payload')
        return { type: 'end', streamId }
      case REQUEST_FRAME_CANCEL:
        if (payloadLength !== 0) throw new Error('lute shell: Electron request cancel frame carried a payload')
        return { type: 'cancel', streamId }
      default:
        throw new Error(`lute shell: unknown Electron request frame type ${String(rawType)}`)
    }
  }

  private parseStart(streamId: number, payload: Buffer): HostRequestFrame {
    let value: unknown
    try {
      value = JSON.parse(payload.toString('utf8')) as unknown
    } catch (error) {
      throw new Error(`lute shell: Electron request start payload is not JSON: ${error instanceof Error ? error.message : String(error)}`)
    }
    if (!isRecord(value) || typeof value.url !== 'string' || typeof value.method !== 'string'
      || !isHeaders(value.headers) || typeof value.hasBody !== 'boolean') {
      throw new Error('lute shell: invalid Electron request start payload')
    }
    return {
      type: 'start',
      streamId,
      url: value.url,
      method: value.method,
      headers: value.headers,
      hasBody: value.hasBody,
    }
  }
}

/** Incrementally decode validated response frames from the Host byte pipe. */
export class HostResponseDecoder {
  private buffer: Buffer = Buffer.alloc(0)

  /** Append bytes and return every complete response frame. */
  push(chunk: Buffer): HostResponseFrame[] {
    this.buffer = this.buffer.byteLength === 0 ? chunk : Buffer.concat([this.buffer, chunk])
    const frames: HostResponseFrame[] = []
    for (;;) {
      const frame = this.next()
      if (frame === undefined) return frames
      frames.push(frame)
    }
  }

  /** Reject EOF that splits a frame. */
  finish(): void {
    if (this.buffer.byteLength !== 0) throw new Error('lute shell: Host response pipe ended inside a frame')
  }

  private next(): HostResponseFrame | undefined {
    if (this.buffer.byteLength < FRAME_HEADER_BYTES) return undefined
    if (this.buffer.readUInt32BE(0) !== FRAME_MAGIC) throw new Error('lute shell: invalid Host response frame marker')
    const rawType = this.buffer.readUInt8(4)
    const streamId = this.buffer.readUInt32BE(5)
    const payloadLength = this.buffer.readUInt32BE(9)
    assertStreamId(streamId)
    const limit = rawType === RESPONSE_FRAME_DATA ? SHELL_PIPE_CHUNK_BYTES : MAX_CONTROL_PAYLOAD_BYTES
    if (payloadLength > limit) {
      throw new Error(`lute shell: Host response frame exceeds the ${String(limit)}-byte limit`)
    }
    const frameLength = FRAME_HEADER_BYTES + payloadLength
    if (this.buffer.byteLength < frameLength) return undefined
    const payload = this.buffer.subarray(FRAME_HEADER_BYTES, frameLength)
    this.buffer = this.buffer.subarray(frameLength)
    switch (rawType) {
      case RESPONSE_FRAME_START:
        return this.parseStart(streamId, payload)
      case RESPONSE_FRAME_DATA:
        return { type: 'data', streamId, data: payload }
      case RESPONSE_FRAME_END:
        if (payloadLength !== 0) throw new Error('lute shell: Host response end frame carried a payload')
        return { type: 'end', streamId }
      case RESPONSE_FRAME_ERROR:
        return this.parseError(streamId, payload)
      default:
        throw new Error(`lute shell: unknown Host response frame type ${String(rawType)}`)
    }
  }

  private parseStart(streamId: number, payload: Buffer): HostResponseFrame {
    const value = this.parseJson(payload, 'start')
    if (!isRecord(value) || !Number.isInteger(value.status) || (value.status as number) < 100
      || (value.status as number) > 599 || !isHeaders(value.headers) || typeof value.hasBody !== 'boolean') {
      throw new Error('lute shell: invalid Host response start payload')
    }
    return {
      type: 'start',
      streamId,
      status: value.status as number,
      headers: value.headers,
      hasBody: value.hasBody,
    }
  }

  private parseError(streamId: number, payload: Buffer): HostResponseFrame {
    const value = this.parseJson(payload, 'error')
    if (!isRecord(value) || typeof value.message !== 'string') {
      throw new Error('lute shell: invalid Host response error payload')
    }
    return { type: 'error', streamId, message: value.message }
  }

  private parseJson(payload: Buffer, subject: string): unknown {
    try {
      return JSON.parse(payload.toString('utf8')) as unknown
    } catch (error) {
      throw new Error(`lute shell: Host response ${subject} payload is not JSON: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

export function isHostCommand(message: unknown): message is HostCommand {
  return typeof message === 'object' && message !== null && 'type' in message
    && (message as Record<string, unknown>).type === 'shutdown'
}

export function isHostEvent(message: unknown): message is HostEvent {
  if (typeof message !== 'object' || message === null || !('type' in message)) return false
  const candidate = message as Record<string, unknown>
  switch (candidate.type) {
    case 'ready':
      return candidate.protocolVersion === SHELL_HOST_PROTOCOL_VERSION && typeof candidate.dshVersion === 'string'
    case 'fatal':
      return typeof candidate.message === 'string'
    default:
      return false
  }
}
