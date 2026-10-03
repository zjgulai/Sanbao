import { describe, expect, it } from 'vitest'

import { createAttachmentUploads } from '../src/host/attachment-uploads.js'
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENT_CHUNK_BYTES } from '../src/protocol.js'

/**
 * Ticket 014 (US-072/073/074): the host-side queue one `fileUploads.uploadStream` consumes.
 *
 * The registry is transport-level: ordered bounded chunks in, one byte-for-byte stream out. The
 * receipt is the base's; these tests only prove the queue never reorders, never aggregates beyond
 * what the consumer has taken, and settles every way out (commit / abort / host stop).
 */

function uploads() {
  let counter = 0
  return createAttachmentUploads(() => `upload-${++counter}`)
}

async function collect(data: AsyncIterable<Uint8Array>): Promise<Buffer> {
  const parts: Buffer[] = []
  for await (const chunk of data) parts.push(Buffer.from(chunk))
  return Buffer.concat(parts)
}

describe('the upload registry', () => {
  it('mints one id per begin and refuses sizes over the declared bound', () => {
    const registry = uploads()
    expect(registry.begin({ sessionId: 's-1', bytes: 3 })).toEqual({ ok: true, uploadId: 'upload-1' })
    expect(registry.begin({ sessionId: 's-1', bytes: MAX_ATTACHMENT_BYTES + 1 }))
      .toEqual({ ok: false, code: 'bridge-attachment-too-large' })
    expect(registry.begin({ sessionId: '', bytes: 1 })).toEqual({ ok: false, code: 'bridge-payload-invalid' })
    expect(registry.begin({ sessionId: 's-1', bytes: 1.5 })).toEqual({ ok: false, code: 'bridge-payload-invalid' })
  })

  it('streams chunks in order into the consumer, only ending on the final piece', async () => {
    const registry = uploads()
    const begun = registry.begin({ sessionId: 's-1', name: 'a.bin', bytes: 6 })
    if (!begun.ok) throw new Error('begin refused')
    const commit = registry.commit(begun.uploadId, (input) => collect(input.data))
    // Chunks arrive while the commit call owns the consumer — the streaming shape the bridge uses.
    expect(registry.pushChunk({ uploadId: begun.uploadId, seq: 0, data: Buffer.from('abc'), final: false })).toEqual({ ok: true })
    expect(registry.pushChunk({ uploadId: begun.uploadId, seq: 1, data: Buffer.from('def'), final: true })).toEqual({ ok: true })
    const outcome = await commit
    expect(outcome).toEqual({ ok: true, value: Buffer.from('abcdef') })
  })

  it('refuses a gap, a piece for an ended session, and a final piece of the wrong length', async () => {
    const registry = uploads()
    const begun = registry.begin({ sessionId: 's-1', bytes: 3 })
    if (!begun.ok) throw new Error('begin refused')
    expect(registry.pushChunk({ uploadId: begun.uploadId, seq: 1, data: Buffer.from('a'), final: false }))
      .toEqual({ ok: false, code: 'bridge-upload-order' })
    expect(registry.pushChunk({ uploadId: begun.uploadId, seq: 0, data: Buffer.alloc(MAX_ATTACHMENT_CHUNK_BYTES + 1), final: false }))
      .toEqual({ ok: false, code: 'bridge-payload-invalid' })
    // A short final piece is refused before any state moves: the declared version must arrive exactly.
    expect(registry.pushChunk({ uploadId: begun.uploadId, seq: 0, data: Buffer.from('ab'), final: true }))
      .toEqual({ ok: false, code: 'bridge-upload-length-mismatch' })
    expect(registry.pushChunk({ uploadId: `${begun.uploadId}-x`, seq: 0, data: Buffer.from('a'), final: false }))
      .toEqual({ ok: false, code: 'bridge-upload-unknown' })
  })

  it('abort wakes a waiting consumer and settles the commit as its own refusal', async () => {
    const registry = uploads()
    const begun = registry.begin({ sessionId: 's-1', bytes: 2 })
    if (!begun.ok) throw new Error('begin refused')
    const commit = registry.commit(begun.uploadId, (input) => collect(input.data))
    expect(registry.abort(begun.uploadId)).toEqual({ ok: true })
    await expect(commit).resolves.toEqual({ ok: false, code: 'bridge-upload-cancelled' })
    expect(registry.abort(begun.uploadId)).toEqual({ ok: false, code: 'bridge-upload-unknown' })
  })

  it('close fails every open session so an in-flight commit settles before teardown', async () => {
    const registry = uploads()
    const begun = registry.begin({ sessionId: 's-1', bytes: 2 })
    if (!begun.ok) throw new Error('begin refused')
    const commit = registry.commit(begun.uploadId, (input) => collect(input.data))
    registry.close()
    await expect(commit).resolves.toEqual({ ok: false, code: 'bridge-host-stopping' })
  })

  it('hands the base its own request fields: session id and display name travel with the stream', async () => {
    const registry = uploads()
    const begun = registry.begin({ sessionId: 's-9', name: 'notes.txt', bytes: 1 })
    if (!begun.ok) throw new Error('begin refused')
    const seen: Array<{ sessionId: string, name: string | undefined, aborted: boolean }> = []
    const commit = registry.commit(begun.uploadId, async (input) => {
      seen.push({ sessionId: input.sessionId, name: input.name, aborted: input.signal.aborted })
      return collect(input.data)
    })
    registry.pushChunk({ uploadId: begun.uploadId, seq: 0, data: Buffer.from('x'), final: true })
    await expect(commit).resolves.toEqual({ ok: true, value: Buffer.from('x') })
    expect(seen).toEqual([{ sessionId: 's-9', name: 'notes.txt', aborted: false }])
  })
})
