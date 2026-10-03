/** Ticket 014 (US-071~076/083): the attachment chain, from a picked file to a sent message.
 *
 * Three rules carry the acceptance, and all three come from the base's own contracts:
 *
 * - **Selection makes a candidate, nothing more** (US-071). Picking seals the exact bytes
 *   (`sha256` + length) in main and produces an item; no upload happens until the confirm act.
 * - **Upload is streamed and content-addressed** (US-072/073). Main hands ordered bounded chunks to
 *   the host's `fileUploads.uploadStream` (ADR-0216's queue on that side); the receipt carries the
 *   store's own `attachmentId` — the sha256 of exactly the stored bytes — so "content verified" is
 *   this device's digest matching the receipt, not a claim. The machine path never crosses any
 *   projection; only the display name, the byte count, and the digest do.
 * - **A receipt is same-session authority** (US-083). The upload runs on the session the send will
 *   use; the base refuses a receipt staged for another session at prompt time. Every record here is
 *   run-local — reopening reads the durable log instead (US-076).
 */
import { createHash } from 'node:crypto'
import { createReadStream, statSync } from 'node:fs'
import { basename } from 'node:path'

import type {
  AttachmentControlOutcome,
  AttachmentItem,
  AttachmentPickOutcome,
  AttachmentStage,
  AttachmentStatus,
  AttachmentUploadOutcome,
} from '../appservice/contracts.js'
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENT_CHUNK_BYTES } from '../protocol.js'
import type { BridgeCaller } from './workspace-adoption.js'

const MAX_ITEMS = 16
const MAX_PICKED_PER_DIALOG = 8

export interface StoredAttachment {
  readonly receiptId: string
  readonly attachmentId: string
  readonly name: string
  readonly bytes: number
}

interface AttachmentRecord {
  readonly itemId: string
  /** Main-only: the picked file's location. Never part of any projection. */
  readonly path: string
  name: string
  readonly bytes: number
  /** The sealed version's digest: content never regenerates; a changed source must be re-picked. */
  readonly sha256: string
  readonly pickedAt: string
  stage: AttachmentStage
  code: string | null
  sentBytes: number
  matterRef: string | null
  sessionId: string | null
  /** Run-local authority from the base's fileUploads; never projected, never persisted. */
  receiptId: string | null
  attachmentId: string | null
  uploadId: string | null
  sentRequestId: string | null
}

export interface AttachmentsStore {
  readonly pick: () => Promise<AttachmentPickOutcome>
  readonly upload: (input: { readonly itemId: string, readonly matterRef: string, readonly workspaceRoot: string }) => Promise<AttachmentUploadOutcome>
  readonly cancel: (input: { readonly itemId: string }) => Promise<AttachmentControlOutcome>
  readonly snapshot: (matterRef: string | null) => AttachmentStatus
  /** The stored-but-unsent items of one matter, in pick order — what the next send carries. */
  readonly storedFor: (matterRef: string) => readonly StoredAttachment[]
  readonly markSent: (receiptIds: readonly string[], requestId: string) => void
}

export interface AttachmentStoreDeps {
  readonly callBridge: BridgeCaller
  /** The system file dialog (injected from main); `null` is the user's own cancellation. */
  readonly pickFiles: () => Promise<readonly string[] | null>
  /** The same explicit act that creates a session for a resume serves the upload's session too. */
  readonly ensureSession: (matterRef: string, workspaceRoot: string) => Promise<{ readonly ok: true, readonly sessionId: string } | { readonly ok: false, readonly code: string }>
  readonly now: () => string
  readonly nextId: () => string
}

function asAnswer(value: unknown): { readonly ok: true, readonly result: unknown } | { readonly ok: false, readonly code: string } {
  if (value !== null && typeof value === 'object' && (value as { ok?: unknown }).ok === true) {
    return { ok: true, result: (value as { result?: unknown }).result }
  }
  if (value !== null && typeof value === 'object' && (value as { ok?: unknown }).ok === false
    && typeof (value as { code?: unknown }).code === 'string') {
    return { ok: false, code: (value as { code: string }).code }
  }
  return { ok: false, code: 'bridge-answer-unrecognised' }
}

function readString(value: unknown, key: string): string | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const candidate = (value as Record<string, unknown>)[key]
  return typeof candidate === 'string' && candidate !== '' ? candidate : undefined
}

function isPickablePath(value: unknown): value is string {
  return typeof value === 'string' && value !== '' && value.startsWith('/')
    && !value.includes('\u0000') && value.length <= 4096
}

/** Stream one sealing pass: bounded memory, digest and byte count of exactly these bytes. */
function sealFile(path: string): Promise<{ readonly sha256: string, readonly bytes: number }> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    let bytes = 0
    const stream = createReadStream(path, { highWaterMark: MAX_ATTACHMENT_CHUNK_BYTES })
    stream.on('data', (chunk) => { bytes += chunk.length; hash.update(chunk) })
    stream.on('error', reject)
    stream.on('end', () => { resolve({ sha256: hash.digest('hex'), bytes }) })
  })
}

export function createAttachments(deps: AttachmentStoreDeps): AttachmentsStore {
  const records: AttachmentRecord[] = []

  const project = (record: AttachmentRecord): AttachmentItem => ({
    itemId: record.itemId,
    name: record.name,
    bytes: record.bytes,
    stage: record.stage,
    sentBytes: record.stage === 'uploading' ? record.sentBytes : null,
    code: record.code,
  })

  const abortOpen = async (record: AttachmentRecord): Promise<void> => {
    if (record.uploadId === null) return
    const uploadId = record.uploadId
    record.uploadId = null
    try {
      await deps.callBridge('attachment/upload-abort', [{ uploadId }])
    } catch {
      // The host may be gone; the record's own state already says the upload is over.
    }
  }

  return {
    async pick() {
      let paths: readonly string[] | null
      try {
        paths = await deps.pickFiles()
      } catch {
        return { state: 'refused', code: 'attachment-pick-failed' }
      }
      if (paths === null) return { state: 'cancelled' }
      const items: AttachmentItem[] = []
      const refused: Array<{ name: string, code: string }> = []
      for (const path of paths.slice(0, MAX_PICKED_PER_DIALOG)) {
        const name = isPickablePath(path) ? basename(path) : '未命名'
        if (!isPickablePath(path)) {
          refused.push({ name, code: 'attachment-path-invalid' })
          continue
        }
        if (records.length >= MAX_ITEMS) {
          refused.push({ name, code: 'attachment-list-full' })
          continue
        }
        try {
          const info = statSync(path)
          if (!info.isFile()) {
            refused.push({ name, code: 'attachment-not-regular-file' })
            continue
          }
          if (info.size > MAX_ATTACHMENT_BYTES) {
            refused.push({ name, code: 'attachment-too-large' })
            continue
          }
          const sealed = await sealFile(path)
          if (sealed.bytes !== info.size) {
            // The file changed while it was being sealed: this is not a version we can name.
            refused.push({ name, code: 'attachment-source-changed' })
            continue
          }
          const record: AttachmentRecord = {
            itemId: `att-${deps.nextId()}`,
            path,
            name,
            bytes: sealed.bytes,
            sha256: sealed.sha256,
            pickedAt: deps.now(),
            stage: 'candidate',
            code: null,
            sentBytes: 0,
            matterRef: null,
            sessionId: null,
            receiptId: null,
            attachmentId: null,
            uploadId: null,
            sentRequestId: null,
          }
          records.push(record)
          items.push(project(record))
        } catch {
          refused.push({ name, code: 'attachment-source-unreadable' })
        }
      }
      return { state: 'picked', items, refused }
    },

    async upload(input) {
      const record = records.find((entry) => entry.itemId === input.itemId)
      if (record === undefined) return { state: 'refused', code: 'attachment-unknown' }
      if (record.stage === 'uploading') return { state: 'refused', code: 'attachment-uploading' }
      if (record.stage === 'source-changed') return { state: 'refused', code: 'attachment-source-changed' }
      if (record.stage === 'sent' || record.stage === 'cancelled') return { state: 'refused', code: 'attachment-frozen' }

      const session = await deps.ensureSession(input.matterRef, input.workspaceRoot)
      if (!session.ok) return { state: 'refused', code: session.code }
      const begun = asAnswer(await deps.callBridge('attachment/upload-begin', [{
        sessionId: session.sessionId,
        name: record.name,
        bytes: record.bytes,
      }]))
      if (!begun.ok) return { state: 'refused', code: begun.code }
      const uploadId = readString(begun.result, 'uploadId')
      if (uploadId === undefined) return { state: 'refused', code: 'bridge-answer-unrecognised' }

      record.stage = 'uploading'
      record.code = null
      record.sentBytes = 0
      record.matterRef = input.matterRef
      record.sessionId = session.sessionId
      record.uploadId = uploadId

      const failRecord = (stage: AttachmentStage, code: string): AttachmentUploadOutcome => {
        record.stage = stage
        record.code = code
        record.uploadId = null
        return { state: 'refused', code }
      }

      // The commit call is armed before the first chunk so the host's consumer streams: chunks are
      // enqueued while `uploadStream` pulls, and the queue never holds more than the piece in flight.
      const commitAnswer = deps
        .callBridge('attachment/upload-commit', [{ uploadId }])
        .then(asAnswer, () => ({ ok: false as const, code: 'bridge-host-not-ready' }))
      // `cancel()` may flip the stage while the loop runs; read it through a call so the compiler
      // does not assume the assignment above is the final word.
      const stageNow = (): AttachmentStage => record.stage

      try {
        const stream = createReadStream(record.path, { highWaterMark: MAX_ATTACHMENT_CHUNK_BYTES })
        let seq = 0
        for await (const chunk of stream) {
          if (stageNow() === 'cancelled') {
            await commitAnswer
            return { state: 'refused', code: 'attachment-upload-cancelled' }
          }
          const piece = chunk as Buffer
          const nextTotal = record.sentBytes + piece.byteLength
          if (nextTotal > record.bytes) {
            // More bytes than the sealed version: the source changed mid-flight; re-pick required.
            await abortOpen(record)
            await commitAnswer
            return failRecord('source-changed', 'attachment-source-changed')
          }
          const pushed = asAnswer(await deps.callBridge('attachment/upload-chunk', [{
            uploadId,
            seq,
            data: piece.toString('base64'),
            final: nextTotal === record.bytes,
          }]))
          if (!pushed.ok) {
            await abortOpen(record)
            await commitAnswer
            if (stageNow() === 'cancelled') return { state: 'refused', code: 'attachment-upload-cancelled' }
            return failRecord('failed', pushed.code)
          }
          seq += 1
          record.sentBytes = nextTotal
        }
        if (record.sentBytes !== record.bytes) {
          // Fewer bytes than sealed: same verdict — the source no longer matches this version.
          await abortOpen(record)
          await commitAnswer
          return failRecord('source-changed', 'attachment-source-changed')
        }
      } catch {
        await abortOpen(record)
        await commitAnswer
        return failRecord('failed', 'attachment-source-unreadable')
      }

      const receipt = await commitAnswer
      if (!receipt.ok) {
        if (stageNow() === 'cancelled') return { state: 'refused', code: 'attachment-upload-cancelled' }
        return failRecord('failed', receipt.code)
      }
      const receiptId = readString(receipt.result, 'receiptId')
      const file = receipt.result !== null && typeof receipt.result === 'object'
        ? (receipt.result as Record<string, unknown>).file
        : undefined
      const attachmentId = readString(file, 'attachmentId')
      const storedBytes = file !== null && typeof file === 'object' ? (file as Record<string, unknown>).bytes : undefined
      // Content-addressed integrity: the store's own id must be sha256 of exactly the sealed bytes.
      if (receiptId === undefined || attachmentId === undefined || typeof storedBytes !== 'number') {
        return failRecord('failed', 'bridge-answer-unrecognised')
      }
      if (attachmentId !== record.sha256 || storedBytes !== record.bytes) {
        return failRecord('source-changed', 'attachment-source-changed')
      }
      record.stage = 'stored'
      record.code = null
      record.receiptId = receiptId
      record.attachmentId = attachmentId
      record.name = readString(file, 'name') ?? record.name
      record.uploadId = null
      return { state: 'stored', item: project(record) }
    },

    async cancel(input) {
      const record = records.find((entry) => entry.itemId === input.itemId)
      if (record === undefined) return { state: 'refused', code: 'attachment-unknown' }
      if (record.stage === 'sent') return { state: 'refused', code: 'attachment-frozen' }
      record.stage = 'cancelled'
      record.code = null
      await abortOpen(record)
      return { state: 'cancelled', itemId: record.itemId }
    },

    snapshot(matterRef) {
      const items = records
        .filter((record) => record.matterRef === null || record.matterRef === matterRef)
        .map(project)
      return { state: 'read', items }
    },

    storedFor(matterRef) {
      const out: StoredAttachment[] = []
      for (const record of records) {
        if (record.stage !== 'stored' || record.matterRef !== matterRef) continue
        if (record.receiptId === null || record.attachmentId === null) continue
        out.push({ receiptId: record.receiptId, attachmentId: record.attachmentId, name: record.name, bytes: record.bytes })
      }
      return out
    },

    markSent(receiptIds, requestId) {
      const wanted = new Set(receiptIds)
      for (const record of records) {
        if (record.receiptId === null || !wanted.has(record.receiptId)) continue
        record.stage = 'sent'
        record.sentRequestId = requestId
      }
    },
  }
}
