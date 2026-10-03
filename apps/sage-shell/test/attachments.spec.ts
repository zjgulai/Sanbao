import { createHash } from 'node:crypto'
import { chmodSync, truncateSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { createAttachments, type AttachmentsStore } from '../src/main/attachments.js'
import { MAX_ATTACHMENT_BYTES } from '../src/protocol.js'

/**
 * Ticket 014 (US-071~076/083): the attachment chain on main's side.
 *
 * The fake bridge mirrors the host's own queue shape: begin mints an id, chunks stream into it,
 * commit consumes and content-addresses, abort ends it. What these tests bind: selection is sealed
 * and upload is a separate act; the receipt's digest must equal the sealed digest (source-changed
 * otherwise); a retry carries the SAME sealed version; the machine path appears in no projection.
 */

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
  let cleanup = cleanups.pop()
  while (cleanup !== undefined) {
    await cleanup()
    cleanup = cleanups.pop()
  }
})

interface FakeUpload {
  chunks: Buffer[]
  final: boolean
  aborted: boolean
  name: string | undefined
  sessionId: string
  waiters: Array<() => void>
}

interface FakeBridge {
  readonly calls: Array<{ readonly endpoint: string, readonly payload: readonly unknown[] }>
  readonly uploads: Map<string, FakeUpload>
  readonly call: (endpoint: string, payload?: readonly unknown[]) => Promise<unknown>
  failChunkAt: (n: number) => void
  gateChunks: () => () => void
}

function makeFakeBridge(): FakeBridge {
  let counter = 0
  let chunkCalls = 0
  let failAt: number | null = null
  let gate: Promise<void> | null = null
  let releaseGate: (() => void) | null = null
  const uploads = new Map<string, FakeUpload>()
  const calls: Array<{ readonly endpoint: string, readonly payload: readonly unknown[] }> = []
  const call = async (endpoint: string, payload: readonly unknown[] = []): Promise<unknown> => {
    calls.push({ endpoint, payload })
    if (endpoint === 'session/create') return { ok: true, result: { sessionId: 'session-1' } }
    if (endpoint === 'attachment/upload-begin') {
      const input = payload[0] as { readonly sessionId: string, readonly name?: string, readonly bytes: number }
      const uploadId = `u-${++counter}`
      uploads.set(uploadId, { chunks: [], final: false, aborted: false, name: input.name, sessionId: input.sessionId, waiters: [] })
      return { ok: true, result: { uploadId } }
    }
    if (endpoint === 'attachment/upload-chunk') {
      const input = payload[0] as { readonly uploadId: string, readonly data: string, readonly final: boolean }
      chunkCalls += 1
      if (failAt !== null && chunkCalls >= failAt) {
        failAt = null
        return { ok: false, code: 'bridge-provider-failed' }
      }
      if (gate !== null) await gate
      const upload = uploads.get(input.uploadId)
      if (upload === undefined || upload.aborted) return { ok: false, code: 'bridge-upload-unknown' }
      upload.chunks.push(Buffer.from(input.data, 'base64'))
      if (input.final) upload.final = true
      upload.waiters.splice(0).forEach((wake) => { wake() })
      return { ok: true, result: { accepted: true } }
    }
    if (endpoint === 'attachment/upload-commit') {
      const input = payload[0] as { readonly uploadId: string }
      const upload = uploads.get(input.uploadId)
      if (upload === undefined) return { ok: false, code: 'bridge-upload-unknown' }
      while (!upload.final && !upload.aborted) {
        await new Promise<void>((resolve) => { upload.waiters.push(resolve) })
      }
      if (upload.aborted) return { ok: false, code: 'bridge-upload-cancelled' }
      const bytes = Buffer.concat(upload.chunks)
      return {
        ok: true,
        result: {
          receiptId: `receipt-${input.uploadId}`,
          file: { attachmentId: createHash('sha256').update(bytes).digest('hex'), name: upload.name ?? 'file', bytes: bytes.byteLength },
        },
      }
    }
    if (endpoint === 'attachment/upload-abort') {
      const upload = uploads.get((payload[0] as { readonly uploadId: string }).uploadId)
      if (upload !== undefined) {
        upload.aborted = true
        upload.waiters.splice(0).forEach((wake) => { wake() })
      }
      return { ok: true, result: { cancelled: true } }
    }
    return { ok: false, code: 'bridge-endpoint-unsupported' }
  }
  return {
    call,
    calls,
    uploads,
    failChunkAt: (n: number) => { failAt = n },
    gateChunks: () => {
      gate = new Promise<void>((resolve) => { releaseGate = resolve })
      const open = (): void => {
        const release = releaseGate
        gate = null
        releaseGate = null
        release?.()
      }
      return open
    },
  }
}

async function tempFile(name: string, content: string | Buffer): Promise<{ root: string, path: string }> {
  const root = await mkdtemp(join(tmpdir(), 'sage-att-'))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  const path = join(root, name)
  writeFileSync(path, content)
  return { root, path }
}

function makeStore(bridge: FakeBridge, pickResult: readonly string[] | null): { instance: AttachmentsStore, ensured: Array<{ matterRef: string, workspaceRoot: string }> } {
  let counter = 0
  const ensured: Array<{ matterRef: string, workspaceRoot: string }> = []
  const instance = createAttachments({
    callBridge: bridge.call,
    pickFiles: async () => pickResult,
    ensureSession: async (matterRef, workspaceRoot) => {
      ensured.push({ matterRef, workspaceRoot })
      return { ok: true, sessionId: 'session-1' }
    },
    now: () => '2026-10-02T12:00:00.000Z',
    nextId: () => String(++counter),
  })
  return { instance, ensured }
}

async function pickedItem(instance: AttachmentsStore): Promise<string> {
  const outcome = await instance.pick()
  if (outcome.state !== 'picked' || outcome.items.length === 0) throw new Error('pick did not produce a candidate')
  return outcome.items[0]!.itemId
}

describe('picking seals a candidate and uploads nothing', () => {
  it('seals the exact bytes, projects no machine path, and refuses a directory', async () => {
    const bridge = makeFakeBridge()
    const { root, path } = await tempFile('notes.txt', 'hello attachment')
    const directory = await mkdtemp(join(tmpdir(), 'sage-att-dir-'))
    cleanups.push(() => rm(directory, { recursive: true, force: true }))
    const { instance } = makeStore(bridge, [path, directory])

    const outcome = await instance.pick()
    expect(outcome.state).toBe('picked')
    if (outcome.state !== 'picked') throw new Error('pick refused')
    expect(outcome.items).toHaveLength(1)
    expect(outcome.items[0]).toMatchObject({ name: 'notes.txt', bytes: 16, stage: 'candidate', sentBytes: null, code: null })
    expect(outcome.refused).toEqual([{ name: directory.split('/').pop(), code: 'attachment-not-regular-file' }])
    // A candidate is a candidate: no bridge endpoint was touched by the pick itself.
    expect(bridge.calls).toEqual([])
    // The machine path exists in no projection — only the name and the byte count cross.
    const snapshot = JSON.stringify(instance.snapshot(null))
    expect(snapshot).not.toContain(path)
    expect(snapshot).not.toContain(root)
  })

  it('treats a cancelled dialog as a fact and an oversize file as its own refusal', async () => {
    const bridge = makeFakeBridge()
    const { instance: cancelled } = makeStore(bridge, null)
    await expect(cancelled.pick()).resolves.toEqual({ state: 'cancelled' })

    const { path } = await tempFile('big.bin', '')
    truncateSync(path, MAX_ATTACHMENT_BYTES + 1)
    const { instance } = makeStore(bridge, [path])
    const outcome = await instance.pick()
    if (outcome.state !== 'picked') throw new Error('pick refused')
    expect(outcome.items).toEqual([])
    expect(outcome.refused).toEqual([{ name: 'big.bin', code: 'attachment-too-large' }])
    expect(bridge.calls).toEqual([])
  })

  it('reports an unreadable source without sealing anything into a candidate', async () => {
    const bridge = makeFakeBridge()
    const { path } = await tempFile('locked.bin', 'secret')
    chmodSync(path, 0o000)
    cleanups.push(async () => { chmodSync(path, 0o600) })
    const { instance } = makeStore(bridge, [path])
    const outcome = await instance.pick()
    if (outcome.state !== 'picked') throw new Error('pick refused')
    expect(outcome.items).toHaveLength(0)
    expect(outcome.refused).toEqual([{ name: 'locked.bin', code: 'attachment-source-unreadable' }])
    expect(bridge.calls).toEqual([])
  })
})

describe('the upload is a separate act with a same-version retry', () => {
  it('streams ordered chunks and accepts only the receipt whose digest matches the seal', async () => {
    const bridge = makeFakeBridge()
    const { path } = await tempFile('report.bin', Buffer.from('abcdefghij'))
    const { instance, ensured } = makeStore(bridge, [path])
    const itemId = await pickedItem(instance)

    const uploaded = await instance.upload({ itemId, matterRef: 'receipt:1', workspaceRoot: '/work' })
    expect(uploaded).toMatchObject({ state: 'stored', item: { stage: 'stored', name: 'report.bin', bytes: 10, code: null } })
    expect(ensured).toEqual([{ matterRef: 'receipt:1', workspaceRoot: '/work' }])

    // The chunk stream carried exactly the sealed bytes, in order, with the final flag on the last.
    const chunkCalls = bridge.calls.filter((entry) => entry.endpoint === 'attachment/upload-chunk')
    const reassembled = Buffer.concat(chunkCalls.map((entry) => Buffer.from((entry.payload[0] as { data: string }).data, 'base64')))
    expect(reassembled.toString('utf8')).toBe('abcdefghij')
    expect(chunkCalls.map((entry) => (entry.payload[0] as { seq: number }).seq)).toEqual([0])
    expect((chunkCalls[0]!.payload[0] as { final: boolean }).final).toBe(true)
    const digest = createHash('sha256').update(reassembled).digest('hex')
    expect(instance.snapshot('receipt:1').items[0]).toMatchObject({ stage: 'stored' })
    // The send-ready set carries that digest as its attachment identity.
    expect(instance.storedFor('receipt:1')).toEqual([
      { receiptId: 'receipt-u-1', attachmentId: digest, name: 'report.bin', bytes: 10 },
    ])
    // No bridge payload ever names the machine path.
    expect(JSON.stringify(bridge.calls)).not.toContain(path)
  })

  it('retries the SAME sealed version after a partial failure — the bytes are not regenerated', async () => {
    const bridge = makeFakeBridge()
    const content = Buffer.alloc(200 * 1024, 5)
    const { path } = await tempFile('same.bin', content)
    const { instance } = makeStore(bridge, [path])
    const itemId = await pickedItem(instance)

    // The second chunk of the first attempt fails: a genuinely partial upload.
    bridge.failChunkAt(2)
    const failed = await instance.upload({ itemId, matterRef: 'receipt:1', workspaceRoot: '/work' })
    expect(failed).toMatchObject({ state: 'refused', code: 'bridge-provider-failed' })
    expect(instance.snapshot('receipt:1').items[0]).toMatchObject({ stage: 'failed' })

    const retried = await instance.upload({ itemId, matterRef: 'receipt:1', workspaceRoot: '/work' })
    expect(retried).toMatchObject({ state: 'stored', item: { stage: 'stored' } })
    const attempts = [...bridge.uploads.values()].filter((upload) => upload.chunks.length > 0)
    expect(attempts).toHaveLength(2)
    // Attempt one sent exactly the first chunk; attempt two sent the identical bytes (same seal),
    // and the accepted version's digest is the seal — nothing was regenerated in between.
    expect(attempts[0]!.chunks).toEqual([attempts[1]!.chunks[0]])
    expect(Buffer.concat(attempts[1]!.chunks)).toEqual(content)
    expect(instance.storedFor('receipt:1')[0]!.attachmentId).toBe(createHash('sha256').update(content).digest('hex'))
  })

  it('marks a source that changed between pick and upload, and blocks the upload until a re-pick', async () => {
    const bridge = makeFakeBridge()
    const { path } = await tempFile('v1.bin', 'first version')
    // A second candidate whose replacement is the SAME length: the chunk bounds cannot see it —
    // only the receipt's content address against the seal can.
    const { path: sameLength } = await tempFile('v2.bin', 'AAAAA version')
    const { instance } = makeStore(bridge, [path, sameLength])
    const picked = await instance.pick()
    if (picked.state !== 'picked' || picked.items.length !== 2) throw new Error('pick refused')
    const itemId = picked.items[0]!.itemId
    const sameLengthId = picked.items[1]!.itemId

    // The source changes before the upload act: the receipt would address other bytes than the seal.
    writeFileSync(path, 'second version!')
    writeFileSync(sameLength, 'BBBBB version')
    const uploaded = await instance.upload({ itemId, matterRef: 'receipt:1', workspaceRoot: '/work' })
    expect(uploaded).toMatchObject({ state: 'refused', code: 'attachment-source-changed' })
    const uploadedSameLength = await instance.upload({ itemId: sameLengthId, matterRef: 'receipt:1', workspaceRoot: '/work' })
    expect(uploadedSameLength).toMatchObject({ state: 'refused', code: 'attachment-source-changed' })
    expect(instance.snapshot('receipt:1').items).toHaveLength(2)
    for (const item of instance.snapshot('receipt:1').items) {
      expect(item).toMatchObject({ stage: 'source-changed' })
    }
    // No half-state: it is not stored, not sendable, and a further upload is refused outright.
    expect(instance.storedFor('receipt:1')).toEqual([])
    await expect(instance.upload({ itemId, matterRef: 'receipt:1', workspaceRoot: '/work' }))
      .resolves.toMatchObject({ state: 'refused', code: 'attachment-source-changed' })
  })

  it('cancels an in-flight upload through the abort endpoint and freezes the item', async () => {
    const bridge = makeFakeBridge()
    const { path } = await tempFile('cancel.bin', Buffer.alloc(256 * 1024, 7))
    const { instance } = makeStore(bridge, [path])
    const itemId = await pickedItem(instance)

    // Hold every chunk answer until the cancel lands so the upload is genuinely in flight.
    const releaseChunks = bridge.gateChunks()
    const inFlight = instance.upload({ itemId, matterRef: 'receipt:1', workspaceRoot: '/work' })
    await new Promise((resolve) => setTimeout(resolve, 0))
    const cancelled = await instance.cancel({ itemId })
    expect(cancelled).toEqual({ state: 'cancelled', itemId })
    releaseChunks()
    const settled = await inFlight
    expect(settled).toMatchObject({ state: 'refused', code: 'attachment-upload-cancelled' })
    expect(instance.snapshot('receipt:1').items[0]).toMatchObject({ stage: 'cancelled' })
    expect(bridge.calls.some((entry) => entry.endpoint === 'attachment/upload-abort')).toBe(true)
    expect(instance.storedFor('receipt:1')).toEqual([])
  })

  it('keeps a sent item frozen and markSent only touches the receipts it was given', async () => {
    const bridge = makeFakeBridge()
    const { path } = await tempFile('send.bin', 'sent-once')
    const { instance } = makeStore(bridge, [path])
    const itemId = await pickedItem(instance)
    const uploaded = await instance.upload({ itemId, matterRef: 'receipt:1', workspaceRoot: '/work' })
    if (uploaded.state !== 'stored') throw new Error('upload refused')
    instance.markSent(['receipt-u-1'], 'req-1')
    expect(instance.snapshot('receipt:1').items[0]).toMatchObject({ stage: 'sent' })
    expect(instance.storedFor('receipt:1')).toEqual([])
    await expect(instance.upload({ itemId, matterRef: 'receipt:1', workspaceRoot: '/work' }))
      .resolves.toMatchObject({ state: 'refused', code: 'attachment-frozen' })
    await expect(instance.cancel({ itemId })).resolves.toMatchObject({ state: 'refused', code: 'attachment-frozen' })
  })

  it('shows candidates from any context but records only under their own matter', async () => {
    const bridge = makeFakeBridge()
    const { path } = await tempFile('scope.bin', 'scoped')
    const { instance } = makeStore(bridge, [path])
    const itemId = await pickedItem(instance)
    await instance.upload({ itemId, matterRef: 'receipt:1', workspaceRoot: '/work' })
    expect(instance.snapshot('receipt:1').items).toHaveLength(1)
    expect(instance.snapshot('receipt:2').items).toHaveLength(0)
    expect(instance.snapshot(null).items).toHaveLength(0)
  })
})
