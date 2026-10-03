/** Ticket 014: one host-side attachment upload session — the queue one `fileUploads.uploadStream`
 *  call consumes while the bridge keeps pushing chunks into it.
 *
 * The base's `uploadStream` takes an `AsyncIterable<Uint8Array>` and "must not retain the complete
 * sequence in memory" — so this registry never aggregates the upload either: chunks are enqueued in
 * order, the iterable drains them as the store pulls, and the queue holds at most what the pushing
 * side has sent but the consumer has not taken yet.
 *
 * One upload lives in the host process only. Nothing here survives a host restart, and nothing here
 * is authority: the receipt is minted by the base's `fileUploads`, not by this queue.
 */
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENT_CHUNK_BYTES } from '../protocol.js'

const MAX_UPLOAD_SESSIONS = 8

export type UploadBeginOutcome =
  | { readonly ok: true, readonly uploadId: string }
  | { readonly ok: false, readonly code: string }

export type UploadStepOutcome =
  | { readonly ok: true }
  | { readonly ok: false, readonly code: string }

type UploadSession = {
  readonly sessionId: string
  readonly name: string | undefined
  readonly declaredBytes: number
  queue: Uint8Array[]
  nextSeq: number
  receivedBytes: number
  ended: boolean
  failure: { readonly code: string } | null
  wake: (() => void) | null
  readonly cancellation: AbortController
  committed: boolean
}

export interface UploadCommitInput {
  readonly data: AsyncIterable<Uint8Array>
  readonly signal: AbortSignal
  readonly sessionId: string
  readonly name: string | undefined
}

export interface AttachmentUploads {
  begin(input: { readonly sessionId: string, readonly name?: string, readonly bytes: number }): UploadBeginOutcome
  pushChunk(input: { readonly uploadId: string, readonly seq: number, readonly data: Uint8Array, readonly final: boolean }): UploadStepOutcome
  /**
   * Run one upload to completion: the caller supplies the provider call and this registry supplies
   * the byte iterable it consumes. Chunks may still be arriving while this runs.
   */
  commit(uploadId: string, run: (input: UploadCommitInput) => Promise<unknown>): Promise<UploadCommitOutcome>
  abort(uploadId: string): UploadStepOutcome
  /** Fail every open session and wake every waiter; in-flight commits settle as refused. */
  close(): void
}

export type UploadCommitOutcome =
  | { readonly ok: true, readonly value: unknown }
  | { readonly ok: false, readonly code: string }

function boundedSessionId(value: unknown): value is string {
  return typeof value === 'string' && value !== '' && value === value.trim()
    && !value.includes('\u0000') && value.length <= 256
}

function boundedName(value: unknown): value is string {
  return typeof value === 'string' && value !== '' && value === value.trim()
    && !value.includes('\u0000') && value.length <= 255
}

export function createAttachmentUploads(randomId: () => string): AttachmentUploads {
  const sessions = new Map<string, UploadSession>()

  const wake = (session: UploadSession): void => {
    const waiter = session.wake
    session.wake = null
    waiter?.()
  }

  const consume = async function* (session: UploadSession): AsyncGenerator<Uint8Array> {
    for (;;) {
      if (session.failure !== null) throw new Error(`sage shell: upload ${session.failure.code}`)
      const first = session.queue.shift()
      if (first !== undefined) {
        yield first
        continue
      }
      if (session.ended) return
      await new Promise<void>((resolve) => { session.wake = resolve })
    }
  }

  return {
    begin(input) {
      if (!boundedSessionId(input.sessionId)) return { ok: false, code: 'bridge-payload-invalid' }
      if (input.name !== undefined && !boundedName(input.name)) return { ok: false, code: 'bridge-payload-invalid' }
      if (!Number.isSafeInteger(input.bytes) || input.bytes < 0) return { ok: false, code: 'bridge-payload-invalid' }
      if (input.bytes > MAX_ATTACHMENT_BYTES) return { ok: false, code: 'bridge-attachment-too-large' }
      if (sessions.size >= MAX_UPLOAD_SESSIONS) return { ok: false, code: 'bridge-upload-busy' }
      const uploadId = randomId()
      sessions.set(uploadId, {
        sessionId: input.sessionId,
        name: input.name,
        declaredBytes: input.bytes,
        queue: [],
        nextSeq: 0,
        receivedBytes: 0,
        ended: false,
        failure: null,
        wake: null,
        cancellation: new AbortController(),
        committed: false,
      })
      return { ok: true, uploadId }
    },

    pushChunk(input) {
      const session = sessions.get(input.uploadId)
      if (session === undefined) return { ok: false, code: 'bridge-upload-unknown' }
      if (session.failure !== null) return { ok: false, code: session.failure.code }
      if (session.ended) return { ok: false, code: 'bridge-upload-ended' }
      // Ordered, bounded chunks: a gap or an oversize piece is a broken producer, not a retryable state.
      if (input.seq !== session.nextSeq) return { ok: false, code: 'bridge-upload-order' }
      if (input.data.byteLength === 0 || input.data.byteLength > MAX_ATTACHMENT_CHUNK_BYTES) {
        return { ok: false, code: 'bridge-payload-invalid' }
      }
      const total = session.receivedBytes + input.data.byteLength
      if (total > session.declaredBytes || total > MAX_ATTACHMENT_BYTES) {
        return { ok: false, code: 'bridge-attachment-too-large' }
      }
      // The declared version must arrive exactly; a short final chunk is refused before any state moves.
      if (input.final && total !== session.declaredBytes) {
        return { ok: false, code: 'bridge-upload-length-mismatch' }
      }
      session.nextSeq += 1
      session.receivedBytes = total
      if (input.final) session.ended = true
      session.queue.push(input.data)
      wake(session)
      return { ok: true }
    },

    async commit(uploadId, run) {
      const session = sessions.get(uploadId)
      if (session === undefined) return { ok: false, code: 'bridge-upload-unknown' }
      if (session.committed) return { ok: false, code: 'bridge-upload-committed' }
      session.committed = true
      try {
        const value = await run({
          data: consume(session),
          signal: session.cancellation.signal,
          sessionId: session.sessionId,
          name: session.name,
        })
        if (session.failure !== null) return { ok: false, code: session.failure.code }
        return { ok: true, value }
      } catch (error) {
        if (session.failure !== null) return { ok: false, code: session.failure.code }
        throw error
      } finally {
        sessions.delete(uploadId)
      }
    },

    abort(uploadId) {
      const session = sessions.get(uploadId)
      if (session === undefined) return { ok: false, code: 'bridge-upload-unknown' }
      session.failure = { code: 'bridge-upload-cancelled' }
      session.cancellation.abort()
      wake(session)
      return { ok: true }
    },

    close() {
      for (const session of sessions.values()) {
        session.failure = { code: 'bridge-host-stopping' }
        session.cancellation.abort()
        wake(session)
      }
      sessions.clear()
    },
  }
}
