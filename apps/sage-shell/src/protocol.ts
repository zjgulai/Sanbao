/** Versioned control messages and framed request/response bytes for the Sage shell host transport. */

import { types as utilTypes } from 'node:util'

/** Protocol version shared with the Electron shell. */
export const SHELL_HOST_PROTOCOL_VERSION = 5 as const

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

// Single source of the frame kind vocabulary: the E.2 policy document publishes these into
// the stable protocol contract digest, and sage-shell-pin freezes the literals (ADR-0195).
// The frame unions below must stay in sync; encoders/decoders reference them by name.
export const SHELL_REQUEST_FRAME_KINDS = ['start', 'data', 'end', 'cancel'] as const
export const SHELL_RESPONSE_FRAME_KINDS = ['start', 'data', 'end', 'error'] as const

const PROFILE_GENERATION = /^[a-z0-9][a-z0-9-]{0,63}$/u
const RAW_SHA256 = /^[0-9a-f]{64}$/u

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
} | {
  readonly type: 'bridge-call'
  readonly callId: string
  readonly endpoint: string
  readonly payload: readonly unknown[]
}

/** Why the live registry observation is unavailable (WT-02C.2E.3). */
export type RuntimeEffectiveUnavailableReason =
  | 'registry-service-absent'
  | 'invalid-roster'
  | 'observation-failed'

/** One live roster row as main may store it; display metadata is deliberately dropped. */
export interface RuntimeEffectivePresetRow {
  readonly id: string
  readonly isDefault: boolean
  readonly broken?: string
}

/** Runtime-effective facts of the live dsh registry, carried by the protocol v5 ready event. */
export type RuntimeEffectiveObservation =
  | {
    readonly kind: 'observed'
    readonly defaultPresetId: string
    readonly presets: readonly RuntimeEffectivePresetRow[]
  }
  | { readonly kind: 'unavailable'; readonly reason: RuntimeEffectiveUnavailableReason }

const RUNTIME_EFFECTIVE_ID_MAX_LENGTH = 64
const RUNTIME_EFFECTIVE_BROKEN_MAX_LENGTH = 512
const RUNTIME_EFFECTIVE_ROSTER_MAX_LENGTH = 64
const RUNTIME_EFFECTIVE_OBSERVED_KEYS = ['kind', 'defaultPresetId', 'presets'] as const
const RUNTIME_EFFECTIVE_UNAVAILABLE_KEYS = ['kind', 'reason'] as const
const RUNTIME_EFFECTIVE_REASONS = ['registry-service-absent', 'invalid-roster', 'observation-failed'] as const

function isBoundedLiteral(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value !== '' && value === value.trim()
    && !value.includes('\u0000') && value.length <= maxLength
}

function snapshotPresetRows(value: unknown): RuntimeEffectivePresetRow[] | undefined {
  if (utilTypes.isProxy(value) || !Array.isArray(value)
    || value.length === 0 || value.length > RUNTIME_EFFECTIVE_ROSTER_MAX_LENGTH) return undefined
  const rows: RuntimeEffectivePresetRow[] = []
  for (const item of value) {
    const record = snapshotPlainDataRecord(item)
    if (record === undefined) return undefined
    const hasBroken = Object.hasOwn(record, 'broken')
    if (!hasExactKeys(record, hasBroken ? ['id', 'isDefault', 'broken'] : ['id', 'isDefault'])) return undefined
    if (!isBoundedLiteral(record.id, RUNTIME_EFFECTIVE_ID_MAX_LENGTH)
      || typeof record.isDefault !== 'boolean'
      || (hasBroken && !isBoundedLiteral(record.broken, RUNTIME_EFFECTIVE_BROKEN_MAX_LENGTH))) {
      return undefined
    }
    rows.push(Object.freeze({
      id: record.id,
      isDefault: record.isDefault,
      ...(hasBroken ? { broken: record.broken as string } : {}),
    }))
  }
  return rows
}

/**
 * Validate one runtime-effective observation exactly: unique bounded ids, and exactly
 * one row flagged default that is the reported `defaultPresetId` (a dangling default is
 * indistinguishable from a garbled payload, so both fail closed).
 */
export function isRuntimeEffectiveObservation(value: unknown): value is RuntimeEffectiveObservation {
  const candidate = snapshotPlainDataRecord(value)
  if (candidate === undefined) return false
  if (candidate.kind === 'unavailable') {
    return hasExactKeys(candidate, [...RUNTIME_EFFECTIVE_UNAVAILABLE_KEYS])
      && RUNTIME_EFFECTIVE_REASONS.includes(candidate.reason as RuntimeEffectiveUnavailableReason)
  }
  if (candidate.kind !== 'observed' || !hasExactKeys(candidate, [...RUNTIME_EFFECTIVE_OBSERVED_KEYS])) return false
  if (!isBoundedLiteral(candidate.defaultPresetId, RUNTIME_EFFECTIVE_ID_MAX_LENGTH)) return false
  const rows = snapshotPresetRows(candidate.presets)
  if (rows === undefined) return false
  const ids = new Set<string>()
  let flagged: string | undefined
  for (const row of rows) {
    if (ids.has(row.id)) return false
    ids.add(row.id)
    if (row.isDefault) {
      if (flagged !== undefined) return false
      flagged = row.id
    }
  }
  return flagged === candidate.defaultPresetId
}

/** Lifecycle events retained on Node IPC. */
export type HostEvent = {
  readonly type: 'ready'
  readonly protocolVersion: typeof SHELL_HOST_PROTOCOL_VERSION
  readonly dshVersion: string
  readonly profileGeneration: string
  readonly manifestSha256: string
  readonly loaderPhase: 'active'
  /** Runtime-effective registry facts observed from the live dsh runtime (v5; WT-02C.2E.3). */
  readonly runtimeEffective: RuntimeEffectiveObservation
} | {
  readonly type: 'runtime-invalidated'
} | {
  readonly type: 'fatal'
  readonly message: string
} | {
  readonly type: 'bridge-result'
  readonly callId: string
  readonly ok: true
  readonly result: unknown
} | {
  readonly type: 'bridge-result'
  readonly callId: string
  readonly ok: false
  readonly code: string
} | {
  /** One frame of a stream endpoint. `seq` is the Host's own ordering and must be strictly
   *  increasing per call; a consumer may therefore drop duplicates and out-of-order frames. */
  readonly type: 'bridge-frame'
  readonly callId: string
  readonly seq: number
  readonly frame: unknown
}

/**
 * Endpoints the main→Host controlled-method bridge may invoke, each carrying its own kind.
 * One home for both halves (P-07): the Electron side refuses anything outside this map before
 * sending, and the Host side refuses again before touching a service.
 *
 * - `read` reads state and changes nothing;
 * - `interactive` asks the user (the host may open a picker, so it can block on a person);
 * - `write` changes local state and must be named explicitly — never inferred from a verb;
 * - `stream` pushes frames until the read's own bound ends it.
 *
 * ADR-0203: the map is the bridge's whole surface. `directoryPicker/createDirectory` is
 * deliberately absent: the first release adopts existing directories only.
 * ADR-0205: endpoint names map 1:1 onto the base's Remote owners, so `workspace/insert-before`
 * is the base's own `workspaceController.insertBefore` and nothing else.
 */
export const BRIDGE_ENDPOINTS: Readonly<Record<string, 'read' | 'interactive' | 'write' | 'stream'>> = Object.freeze({
  'settings/describe': 'read',
  'directory/pick': 'interactive',
  'workspace/create': 'write',
  'workspace/rename': 'write',
  // `workspace/delete` removes the registration only: the base keeps the directory and its logs.
  'workspace/delete': 'write',
  'workspace/insert-before': 'write',
  'workspace/follow': 'stream',
  // Ticket 013: reads over the base's `workspaceFiles` service. The scope's workspaceRoot is
  // resolved from a live session, never minted here (ADR-0207).
  'workspaceFiles/list': 'read',
  'workspaceFiles/stat': 'read',
  'workspaceFiles/read': 'read',
  // Ticket 015: the content port for artifact previews — raw byte windows, whole files, and the
  // bounded observation feed that surfaces file changes as clues (never an OS watch).
  'workspaceFiles/readBytes': 'read',
  'workspaceFiles/readAll': 'read',
  'workspaceFiles/changes': 'stream',
  // Ticket 005: the session channel over the base's `sessionController`. `prompt` is a write
  // (it admits input to the agent inbox); `page` is the cold history read that reconciles the
  // final state; `follow` streams durable events and live assistant frames.
  'session/create': 'write',
  'session/prompt': 'write',
  'session/page': 'read',
  'session/follow': 'stream',
  // Ticket 006: stop cancels the active turn; the queue drain removes still-pending occurrences
  // so a paused Sage leaves nothing in the inbox that a later kick could consume; `control`
  // carries the authoritative queue snapshot.
  'session/cancel': 'write',
  'session/queue-remove': 'write',
  'session/queue-edit': 'write',
  'session/control': 'stream',
  // Ticket 021: session content search — a read. The provider is checked before the call so a
  // deployment without `sessionQuery` answers a named "unavailable", never an empty result.
  'session/search': 'read',
  // Ticket 024: fork one completed-turn prefix into a child session (the side chat's carrier).
  'session/fork': 'write',
  // Ticket 034: the clarification relay. `questions` reads the host relay's live pending batches
  // (a question exists exactly while the base's `ask()` waterfall is blocked on it); `answer`
  // resolves that waterfall with the user's selection. Both answer the relay, never the model.
  'session/questions': 'read',
  'session/answer': 'write',
  // Ticket 039: plan/goal collaboration mode. `plan-mode` reads the cropped projection view
  // (`{active, pending}`) through `ctx.planMode` for the live agent; `plan-mode-switch` is one
  // named selection whose receipt is the base's own outcome (committed / queued / cancelled /
  // noop) — a queued selection only takes force at the next accepted pre-step.
  'session/plan-mode': 'read',
  'session/plan-mode-switch': 'write',
  // Ticket 041: the approval relay. `approvals` reads the live pending waits (a wait exists
  // exactly while the base's `approval/request` waterfall is blocked on it); `approve` resolves
  // one with exactly the user's decision (`allowed-once` is the base's sole grant — the relay
  // never manufactures one); `approval-withdraw` aborts the asker's own signal, so the wait
  // settles `cancelled` and a late answer is discarded — never converted into an approval.
  'session/approvals': 'read',
  'session/approve': 'write',
  'session/approval-withdraw': 'write',
  // Ticket 043: the integrated terminal, READ-ONLY. `terminals` lists the owner's live PTY
  // sessions (bounded snapshots); `terminal-read` pages the retained scrollback. No write
  // endpoint exists at all — no spawn/kill/signal/send — so 打开/关闭面板 cannot affect a run
  // and terminal output can never enter the conversation or the artifact list.
  'session/terminals': 'read',
  'session/terminal-read': 'read',
  // Ticket 038: the mounted skills catalog (`ctx.skills.snapshot`) — bounded summaries plus the
  // discovery-completeness flag; this is the ONLY read the input-area selector rides.
  'skills/snapshot': 'read',
  // Ticket 014: the attachment upload chain over the base's `fileUploads` service. One upload is a
  // named sequence — begin mints the upload id, ordered chunks carry the sealed bytes, commit runs
  // the base's own `uploadStream` and answers the receipt, abort cancels before/while it runs.
  'attachment/upload-begin': 'write',
  'attachment/upload-chunk': 'write',
  'attachment/upload-commit': 'write',
  'attachment/upload-abort': 'write',
})

/** A stream endpoint may push at most this many frames; crossing it ends the stream with a refusal
 *  instead of letting one subscription grow without bound. */
export const MAX_BRIDGE_STREAM_FRAMES = 256

/** Ticket 014: attachment upload bounds, one home for both halves of the bridge. A candidate at or
 *  below {@link MAX_ATTACHMENT_BYTES} travels in ordered {@link MAX_ATTACHMENT_CHUNK_BYTES} chunks;
 *  the host refuses a declared size or a chunk beyond these, main refuses before sending one. */
export const MAX_ATTACHMENT_BYTES = 64 * 1024 * 1024
export const MAX_ATTACHMENT_CHUNK_BYTES = 128 * 1024

/** How long a stream read waits for the next frame before reporting what it has (ADR-0206).
 *  The base's follow generations never end by themselves, so without this window a read would
 *  answer only when its caller's timeout fired. */
export const BRIDGE_STREAM_QUIET_MS = 150

const BRIDGE_CALL_ID = /^[A-Za-z0-9_-]{1,64}$/u
const BRIDGE_ENDPOINT = /^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*$/u

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isHeaders(value: unknown): value is readonly [string, string][] {
  return Array.isArray(value) && value.every(header => Array.isArray(header) && header.length === 2
    && typeof header[0] === 'string' && typeof header[1] === 'string')
}

function assertStreamId(streamId: number): void {
  if (!Number.isInteger(streamId) || streamId < 1 || streamId > 0xffff_ffff) {
    throw new Error(`sage shell: invalid pipe stream id ${String(streamId)}`)
  }
}

function encodeFrame(type: number, streamId: number, payload: Buffer): Buffer {
  assertStreamId(streamId)
  // 2 is the data frame on both pipes; the two directions share one byte limit.
  const limit = type === 2 ? SHELL_PIPE_CHUNK_BYTES : MAX_CONTROL_PAYLOAD_BYTES
  if (payload.byteLength > limit) {
    throw new Error(`sage shell: pipe frame exceeds the ${String(limit)}-byte limit`)
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
    if (this.buffer.byteLength !== 0) throw new Error('sage shell: Electron request pipe ended inside a frame')
  }

  private next(): HostRequestFrame | undefined {
    if (this.buffer.byteLength < FRAME_HEADER_BYTES) return undefined
    if (this.buffer.readUInt32BE(0) !== FRAME_MAGIC) throw new Error('sage shell: invalid Electron request frame marker')
    const rawType = this.buffer.readUInt8(4)
    const streamId = this.buffer.readUInt32BE(5)
    const payloadLength = this.buffer.readUInt32BE(9)
    assertStreamId(streamId)
    const limit = rawType === REQUEST_FRAME_DATA ? SHELL_PIPE_CHUNK_BYTES : MAX_CONTROL_PAYLOAD_BYTES
    if (payloadLength > limit) {
      throw new Error(`sage shell: Electron request frame exceeds the ${String(limit)}-byte limit`)
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
        if (payloadLength !== 0) throw new Error('sage shell: Electron request end frame carried a payload')
        return { type: 'end', streamId }
      case REQUEST_FRAME_CANCEL:
        if (payloadLength !== 0) throw new Error('sage shell: Electron request cancel frame carried a payload')
        return { type: 'cancel', streamId }
      default:
        throw new Error(`sage shell: unknown Electron request frame type ${String(rawType)}`)
    }
  }

  private parseStart(streamId: number, payload: Buffer): HostRequestFrame {
    let value: unknown
    try {
      value = JSON.parse(payload.toString('utf8')) as unknown
    } catch (error) {
      throw new Error(`sage shell: Electron request start payload is not JSON: ${error instanceof Error ? error.message : String(error)}`)
    }
    if (!isRecord(value) || typeof value.url !== 'string' || typeof value.method !== 'string'
      || !isHeaders(value.headers) || typeof value.hasBody !== 'boolean') {
      throw new Error('sage shell: invalid Electron request start payload')
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
    if (this.buffer.byteLength !== 0) throw new Error('sage shell: Host response pipe ended inside a frame')
  }

  private next(): HostResponseFrame | undefined {
    if (this.buffer.byteLength < FRAME_HEADER_BYTES) return undefined
    if (this.buffer.readUInt32BE(0) !== FRAME_MAGIC) throw new Error('sage shell: invalid Host response frame marker')
    const rawType = this.buffer.readUInt8(4)
    const streamId = this.buffer.readUInt32BE(5)
    const payloadLength = this.buffer.readUInt32BE(9)
    assertStreamId(streamId)
    const limit = rawType === RESPONSE_FRAME_DATA ? SHELL_PIPE_CHUNK_BYTES : MAX_CONTROL_PAYLOAD_BYTES
    if (payloadLength > limit) {
      throw new Error(`sage shell: Host response frame exceeds the ${String(limit)}-byte limit`)
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
        if (payloadLength !== 0) throw new Error('sage shell: Host response end frame carried a payload')
        return { type: 'end', streamId }
      case RESPONSE_FRAME_ERROR:
        return this.parseError(streamId, payload)
      default:
        throw new Error(`sage shell: unknown Host response frame type ${String(rawType)}`)
    }
  }

  private parseStart(streamId: number, payload: Buffer): HostResponseFrame {
    const value = this.parseJson(payload, 'start')
    if (!isRecord(value) || !Number.isInteger(value.status) || (value.status as number) < 100
      || (value.status as number) > 599 || !isHeaders(value.headers) || typeof value.hasBody !== 'boolean') {
      throw new Error('sage shell: invalid Host response start payload')
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
      throw new Error('sage shell: invalid Host response error payload')
    }
    return { type: 'error', streamId, message: value.message }
  }

  private parseJson(payload: Buffer, subject: string): unknown {
    try {
      return JSON.parse(payload.toString('utf8')) as unknown
    } catch (error) {
      throw new Error(`sage shell: Host response ${subject} payload is not JSON: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

export function isHostCommand(message: unknown): message is HostCommand {
  if (typeof message === 'object' && message !== null && 'type' in message
    && (message as Record<string, unknown>).type === 'shutdown') return true
  const candidate = snapshotPlainDataRecord(message)
  if (candidate === undefined || candidate.type !== 'bridge-call') return false
  return hasExactKeys(candidate, ['type', 'callId', 'endpoint', 'payload'])
    && typeof candidate.callId === 'string' && BRIDGE_CALL_ID.test(candidate.callId)
    && typeof candidate.endpoint === 'string'
    && BRIDGE_ENDPOINT.test(candidate.endpoint)
    && Object.hasOwn(BRIDGE_ENDPOINTS, candidate.endpoint)
    && Array.isArray(candidate.payload) && candidate.payload.length <= 8
}

function snapshotPlainDataRecord(message: unknown): Record<string, unknown> | undefined {
  try {
    if (typeof message !== 'object' || message === null || utilTypes.isProxy(message)
      || Object.getPrototypeOf(message) !== Object.prototype) {
      return undefined
    }
    const descriptors = Object.getOwnPropertyDescriptors(message)
    const snapshot: Record<string, unknown> = Object.create(null)
    for (const key of Reflect.ownKeys(descriptors)) {
      if (typeof key !== 'string') return undefined
      const descriptor = descriptors[key]
      if (descriptor === undefined || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
        return undefined
      }
      snapshot[key] = descriptor.value
    }
    return snapshot
  } catch {
    return undefined
  }
}

function hasExactKeys(candidate: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(candidate)
  return keys.length === expected.length && keys.every(key => expected.includes(key))
}

export function isHostEvent(message: unknown): message is HostEvent {
  const candidate = snapshotPlainDataRecord(message)
  if (candidate === undefined) return false
  switch (candidate.type) {
    case 'ready':
      return hasExactKeys(candidate, [
        'type',
        'protocolVersion',
        'dshVersion',
        'profileGeneration',
        'manifestSha256',
        'loaderPhase',
        'runtimeEffective',
      ])
        && candidate.protocolVersion === SHELL_HOST_PROTOCOL_VERSION
        && typeof candidate.dshVersion === 'string'
        && typeof candidate.profileGeneration === 'string'
        && PROFILE_GENERATION.test(candidate.profileGeneration)
        && typeof candidate.manifestSha256 === 'string'
        && RAW_SHA256.test(candidate.manifestSha256)
        && candidate.loaderPhase === 'active'
        && isRuntimeEffectiveObservation(candidate.runtimeEffective)
    case 'runtime-invalidated':
      return hasExactKeys(candidate, ['type'])
    case 'fatal':
      return hasExactKeys(candidate, ['type', 'message']) && typeof candidate.message === 'string'
    case 'bridge-frame':
      return hasExactKeys(candidate, ['type', 'callId', 'seq', 'frame'])
        && typeof candidate.callId === 'string' && BRIDGE_CALL_ID.test(candidate.callId)
        && typeof candidate.seq === 'number' && Number.isSafeInteger(candidate.seq) && candidate.seq >= 0
    case 'bridge-result': {
      if (typeof candidate.callId !== 'string' || !BRIDGE_CALL_ID.test(candidate.callId)) return false
      // A success frame and a failure frame are different shapes: neither may smuggle the other's payload.
      if (hasExactKeys(candidate, ['type', 'callId', 'ok', 'result'])) return candidate.ok === true
      if (hasExactKeys(candidate, ['type', 'callId', 'ok', 'code'])) {
        return candidate.ok === false && typeof candidate.code === 'string'
      }
      return false
    }
    default:
      return false
  }
}
