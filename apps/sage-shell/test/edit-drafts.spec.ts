import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { createActionConfirmationStore } from '../src/appservice/action-confirmations.js'
import type { FileReferenceRecord } from '../src/appservice/contracts.js'
import { createEditDrafts } from '../src/main/edit-drafts.js'

/**
 * Ticket 027, the edit drafts (US-140~145) — S5: real bytes on a local temporary directory.
 *
 * The bridge substitute below reads the *actual* file, so every claim in this file is about real
 * content: generating a draft reads and touches nothing, a diff is computed by Sage from the two
 * versions' bytes, and a writeback reaches the source only through the executor port — which
 * production does not wire. The file's bytes are compared before and after every step.
 */

const roots: string[] = []
afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true })
})

/** The opaque freshness token of the test filesystem: mtime+size, compared, never parsed. */
const versionOf = (absolutePath: string): string => {
  const stat = statSync(absolutePath)
  return `${Math.round(stat.mtimeMs)}:${stat.size}`
}

function fixture(initial: string, relative = 'notes/plan.md') {
  const root = mkdtempSync(join(tmpdir(), 'sage-edit-draft-'))
  roots.push(root)
  mkdirSync(join(root, 'notes'), { recursive: true })
  const absolute = join(root, relative)
  writeFileSync(absolute, initial)
  const calls: Array<{ endpoint: string, payload: readonly unknown[] }> = []
  const call = async (endpoint: string, payload: readonly unknown[] = []): Promise<unknown> => {
    calls.push({ endpoint, payload })
    const request = (payload[0] ?? {}) as Record<string, unknown>
    const absolutePath = join(String(request.workspaceRoot), String(request.path))
    if (endpoint === 'workspaceFiles/stat') {
      try {
        return { ok: true, result: { absolutePath, version: versionOf(absolutePath), bytes: statSync(absolutePath).size } }
      } catch {
        return { ok: false, code: 'bridge-file-not-found' }
      }
    }
    if (endpoint === 'workspaceFiles/read') {
      const text = readFileSync(absolutePath, 'utf8')
      const lines = text.split('\n')
      if (text.endsWith('\n')) lines.pop()
      const range = (request.range ?? {}) as { offset?: number, limit?: number }
      const offset = range.offset ?? 1
      const limit = range.limit ?? lines.length
      const page = lines.slice(offset - 1, offset - 1 + limit)
      return {
        ok: true,
        result: { absolutePath, version: versionOf(absolutePath), text: page.join('\n'), lines: page.length, eof: offset - 1 + page.length >= lines.length },
      }
    }
    return { ok: false, code: 'bridge-answer-unrecognised' }
  }
  const reference = (overrides: Partial<FileReferenceRecord> = {}): FileReferenceRecord => ({
    referenceId: 'ref-1',
    matterRef: 'matter:1',
    workspaceRoot: root,
    path: relative,
    absolutePath: absolute,
    version: versionOf(absolute),
    bytes: statSync(absolute).size,
    createdAt: '2026-10-02T12:00:00.000Z',
    lastUse: 'unused',
    ...overrides,
  })
  return { root, absolute, call, calls, reference }
}

type Fixture = ReturnType<typeof fixture>

interface ExecutorCall {
  readonly matterRef: string
  readonly path: string
  readonly absolutePath: string
  readonly targetVersion: string
  readonly proposedText: string
}

function deps(f: Fixture, overrides: {
  readonly references?: readonly FileReferenceRecord[]
  readonly executeWriteback?: (request: ExecutorCall) => Promise<
    { readonly receiptRef: string } | { readonly outcome: 'unknown', readonly code: string } | { readonly denied: string }>
} = {}) {
  let tick = 0
  return {
    now: () => `2026-10-02T21:00:0${tick}.000Z`,
    nextId: () => `draft-${tick += 1}`,
    references: () => overrides.references ?? [f.reference()],
    confirmations: {
      store: createActionConfirmationStore({ now: () => '2026-10-02T21:00:00.000Z', nextId: () => `cf-${tick += 1}` }),
      facts: () => ({ environmentRef: null }),
    },
    ...(overrides.executeWriteback === undefined ? {} : { executeWriteback: overrides.executeWriteback }),
  }
}

const bytesOf = (path: string): string => readFileSync(path).toString('base64')

describe('generating an edit draft (US-140) reads the source and changes nothing', () => {
  it('reads one stat and one bounded page; the file bytes are identical afterwards', async () => {
    const f = fixture('第一行\n第二行\n第三行\n')
    const drafts = createEditDrafts(f.call, deps(f))
    const before = bytesOf(f.absolute)
    const outcome = await drafts.create({ referenceId: 'ref-1', matterRef: 'matter:1' })
    expect(outcome.state).toBe('created')
    if (outcome.state !== 'created') return
    const draft = outcome.draft
    expect(draft).toMatchObject({
      draftId: 'draft-1',
      matterRef: 'matter:1',
      path: 'notes/plan.md',
      name: 'plan.md',
      basedVersion: f.reference().version,
      generatedBy: 'file-observation',
      sourceCharacters: '第一行\n第二行\n第三行'.length,
      proposedCharacters: '第一行\n第二行\n第三行'.length,
      sourceState: 'unchanged',
      writeback: { state: 'none' },
    })
    // Diff written nothing, read only the declared calls.
    expect(f.calls.map((entry) => entry.endpoint)).toEqual(['workspaceFiles/stat', 'workspaceFiles/read'])
    expect(f.calls[1]?.payload).toEqual([{ workspaceRoot: f.root, path: 'notes/plan.md', range: { offset: 1, limit: 400 } }])
    // The view is a pinned, controlled shape: the user's own working copy travels, the machine
    // root, the source snapshot and any payload-shaped field never do.
    expect(Object.keys(draft).sort()).toEqual([
      'basedVersion', 'createdAt', 'draftId', 'generatedBy', 'matterRef', 'name', 'path',
      'proposedCharacters', 'proposedText', 'sourceCharacters', 'sourceState', 'updatedAt', 'writeback',
    ])
    expect(draft.proposedText).toBe('第一行\n第二行\n第三行')
    const text = JSON.stringify(draft)
    expect(text).not.toContain(f.root)
    for (const banned of ['workspaceRoot', 'absolutePath', 'basedText', 'payload', 'arguments', 'toolInput']) {
      expect(text, banned).not.toContain(banned)
    }
    expect(bytesOf(f.absolute)).toBe(before)
  })

  it('refuses a stale reference, an unknown reference and an oversized source without writing', async () => {
    const f = fixture('老内容\n')
    const staleRef = f.reference({ version: 'stale-token:1' })
    const store = createEditDrafts(f.call, deps(f, { references: [staleRef] }))
    expect(await store.create({ referenceId: 'ref-1', matterRef: 'matter:1' })).toMatchObject({ state: 'refused', code: 'source-changed' })
    expect(await store.create({ referenceId: 'ref-9', matterRef: 'matter:1' })).toMatchObject({ state: 'refused', code: 'reference-not-found' })
    expect(f.calls.every((entry) => entry.endpoint === 'workspaceFiles/stat')).toBe(true)

    const big = Array.from({ length: 401 }, (_, index) => `行 ${String(index + 1)}`).join('\n')
    writeFileSync(f.absolute, big)
    const tooLarge = createEditDrafts(f.call, deps(f))
    expect(await tooLarge.create({ referenceId: 'ref-1', matterRef: 'matter:1' })).toMatchObject({ state: 'refused', code: 'draft-source-too-large' })
    expect(bytesOf(f.absolute)).toBe(Buffer.from(big, 'utf8').toString('base64'))
  })
})

describe('the version-bound diff (US-141)', () => {
  it('compares the draft against the version it was based on and labels both versions', async () => {
    const f = fixture('keep\nold line\ntail\n')
    const drafts = createEditDrafts(f.call, deps(f))
    await drafts.create({ referenceId: 'ref-1', matterRef: 'matter:1' })
    drafts.update({ draftId: 'draft-1', proposedText: 'keep\nnew line\nadded\ntail\n' })
    const before = bytesOf(f.absolute)
    const outcome = await drafts.diff({ draftId: 'draft-1' })
    expect(outcome.state).toBe('read')
    if (outcome.state !== 'read') return
    expect(outcome.diff).toMatchObject({
      draftId: 'draft-1',
      basedVersion: f.reference().version,
      currentVersion: f.reference().version,
      sourceChanged: false,
      addedLines: 2,
      removedLines: 1,
      truncated: false,
    })
    expect(outcome.diff.lines).toContainEqual({ kind: 'remove', text: 'old line' })
    expect(outcome.diff.lines).toContainEqual({ kind: 'add', text: 'new line' })
    expect(outcome.diff.lines).toContainEqual({ kind: 'add', text: 'added' })
    expect(outcome.diff.lines).toContainEqual({ kind: 'context', text: 'keep' })
    // Diffing is read-only, and the based version never moves.
    expect(bytesOf(f.absolute)).toBe(before)
    expect((await drafts.list()).drafts[0]?.basedVersion).toBe(outcome.diff.basedVersion)
  })

  it('marks a moved source without rewriting the based version, and the diff still holds', async () => {
    const f = fixture('alpha\nbeta\n')
    const drafts = createEditDrafts(f.call, deps(f))
    await drafts.create({ referenceId: 'ref-1', matterRef: 'matter:1' })
    drafts.update({ draftId: 'draft-1', proposedText: 'alpha\nbeta changed\n' })
    const basedVersion = f.reference().version
    writeFileSync(f.absolute, 'alpha\nbeta\ngamma\n')
    const outcome = await drafts.diff({ draftId: 'draft-1' })
    if (outcome.state !== 'read') throw new Error('expected read')
    expect(outcome.diff.sourceChanged).toBe(true)
    expect(outcome.diff.currentVersion).not.toBe(basedVersion)
    expect(outcome.diff.basedVersion).toBe(basedVersion)
    const listed = (await drafts.list()).drafts[0]
    expect(listed).toMatchObject({ basedVersion, sourceState: 'changed' })
    // The new source bytes stay in main: the view carries the draft's own copy, never the file's.
    expect(JSON.stringify(listed)).not.toContain('gamma')
    expect(listed?.proposedText).toBe('alpha\nbeta changed\n')
  })
})

describe('writeback is a named action through its own confirmation (US-143)', () => {
  const prepared = async (f: Fixture, store: ReturnType<typeof createEditDrafts>) => {
    const outcome = await store.prepareWriteback({ draftId: 'draft-1' })
    expect(outcome.state).toBe('prepared')
    if (outcome.state !== 'prepared') throw new Error('expected prepared')
    return outcome
  }

  it('prepares a single card with the target version and the impact; nothing is written', async () => {
    const f = fixture('one\ntwo\n')
    const drafts = createEditDrafts(f.call, deps(f))
    await drafts.create({ referenceId: 'ref-1', matterRef: 'matter:1' })
    drafts.update({ draftId: 'draft-1', proposedText: 'one\ntwo\nthree\n' })
    const before = bytesOf(f.absolute)
    const outcome = await prepared(f, drafts)
    expect(outcome.card).toMatchObject({
      action: 'writeback-source-file',
      target: { matterRef: 'matter:1', draftId: 'draft-1', path: 'notes/plan.md' },
      targetVersion: f.reference().version,
      currentVersion: f.reference().version,
      impact: { addedLines: 1, removedLines: 0 },
      costEstimate: { state: 'unavailable', note: 'estimate-unavailable' },
      effect: 'not-yet-happened',
    })
    expect(typeof outcome.card.confirmationId).toBe('string')
    expect((await drafts.list()).drafts[0]?.writeback).toMatchObject({ state: 'prepared', targetVersion: f.reference().version })
    expect(bytesOf(f.absolute)).toBe(before)
  })

  it('refuses to prepare an unchanged draft and a draft whose source moved on', async () => {
    const f = fixture('same\n')
    const drafts = createEditDrafts(f.call, deps(f))
    await drafts.create({ referenceId: 'ref-1', matterRef: 'matter:1' })
    expect(await drafts.prepareWriteback({ draftId: 'draft-1' })).toMatchObject({ state: 'refused', code: 'draft-unchanged' })
    drafts.update({ draftId: 'draft-1', proposedText: 'changed\n' })
    writeFileSync(f.absolute, 'same but longer\n')
    expect(await drafts.prepareWriteback({ draftId: 'draft-1' })).toMatchObject({ state: 'refused', code: 'writeback-source-changed' })
  })

  it('writes nothing without the confirmation — and the unwired port never burns one', async () => {
    const f = fixture('a\n')
    const executes: ExecutorCall[] = []
    const depsObject = deps(f, { executeWriteback: async (request) => { executes.push(request); return { receiptRef: 'wb-1' } } })
    // The executor is read at call time: the test can unwire it to prove the port's absence does
    // not consume the confirmation, then wire it back with a mutable holder.
    const holder = { executeWriteback: depsObject.executeWriteback }
    const drafts = createEditDrafts(f.call, { ...depsObject, get executeWriteback() { return holder.executeWriteback } })
    await drafts.create({ referenceId: 'ref-1', matterRef: 'matter:1' })
    drafts.update({ draftId: 'draft-1', proposedText: 'b\n' })
    const card = (await prepared(f, drafts)).card
    const before = bytesOf(f.absolute)

    expect(await drafts.writeback({ draftId: 'draft-1' })).toMatchObject({ state: 'refused', code: 'confirmation-required' })
    expect(await drafts.writeback({ draftId: 'draft-1', confirmationId: 'never-minted' })).toMatchObject({ state: 'refused', code: 'confirmation-required' })
    expect(executes).toEqual([])
    expect(bytesOf(f.absolute)).toBe(before)

    // Unwired port: honest not-ready, and this confirmation stays unconsumed for later use.
    holder.executeWriteback = undefined as never
    expect(await drafts.writeback({ draftId: 'draft-1', confirmationId: card.confirmationId })).toMatchObject({ state: 'not-ready', code: 'writeback-unavailable' })
    expect(bytesOf(f.absolute)).toBe(before)

    holder.executeWriteback = depsObject.executeWriteback
    const written = await drafts.writeback({ draftId: 'draft-1', confirmationId: card.confirmationId })
    expect(written).toEqual({ state: 'written', draftId: 'draft-1', receiptRef: 'wb-1' })
    expect(executes).toEqual([{ matterRef: 'matter:1', path: 'notes/plan.md', absolutePath: f.absolute, targetVersion: card.targetVersion, proposedText: 'b\n' }])
    expect((await drafts.list()).drafts[0]?.writeback).toEqual({ state: 'written', receiptRef: 'wb-1' })
    // One confirmation, one dispatch: the second click is spent, and the executor ran once.
    expect(await drafts.writeback({ draftId: 'draft-1', confirmationId: card.confirmationId })).toMatchObject({ state: 'refused', code: 'confirmation-consumed' })
    expect(executes).toHaveLength(1)
  })

  it('an unknown executor outcome never reads as written, and a throwing executor is unknown too', async () => {
    const f = fixture('a\n')
    const drafts = createEditDrafts(f.call, deps(f, { executeWriteback: async () => ({ outcome: 'unknown' as const, code: 'writeback-executor-lost' }) }))
    await drafts.create({ referenceId: 'ref-1', matterRef: 'matter:1' })
    drafts.update({ draftId: 'draft-1', proposedText: 'b\n' })
    const card = (await prepared(f, drafts)).card
    expect(await drafts.writeback({ draftId: 'draft-1', confirmationId: card.confirmationId })).toEqual({ state: 'unknown', draftId: 'draft-1', code: 'writeback-executor-lost' })
    expect((await drafts.list()).drafts[0]?.writeback).toEqual({ state: 'unknown', code: 'writeback-executor-lost' })

    const f2 = fixture('a\n')
    const throwing = createEditDrafts(f2.call, deps(f2, { executeWriteback: async () => { throw new Error('boom') } }))
    await throwing.create({ referenceId: 'ref-1', matterRef: 'matter:1' })
    throwing.update({ draftId: 'draft-1', proposedText: 'b\n' })
    const card2 = (await throwing.prepareWriteback({ draftId: 'draft-1' }))
    if (card2.state !== 'prepared') throw new Error('expected prepared')
    expect(await throwing.writeback({ draftId: 'draft-1', confirmationId: card2.card.confirmationId })).toMatchObject({ state: 'unknown', code: 'writeback-executor-failed' })
  })

  it('a source change between prepare and confirm denies, and restoring the old bytes does not revive the card', async () => {
    const f = fixture('frozen\n')
    const executes: ExecutorCall[] = []
    const drafts = createEditDrafts(f.call, deps(f, { executeWriteback: async (request) => { executes.push(request); return { receiptRef: 'wb-1' } } }))
    await drafts.create({ referenceId: 'ref-1', matterRef: 'matter:1' })
    drafts.update({ draftId: 'draft-1', proposedText: 'thawed\n' })
    const card = (await prepared(f, drafts)).card
    const before = bytesOf(f.absolute)

    // The source moves on: the prepared card is dead the moment the check sees it.
    const original = statSync(f.absolute)
    writeFileSync(f.absolute, 'frozen\nmore\n')
    expect(await drafts.writeback({ draftId: 'draft-1', confirmationId: card.confirmationId })).toMatchObject({ state: 'refused', code: 'writeback-source-changed' })
    // Even the old bytes coming back with the old token do not revive it (US-126): the card was
    // retired when the change was seen, and the replay meets the spent-record answer. (The mtime
    // is restored at the token's own rounding — a truncated Date could miss by half a millisecond
    // and flake the replay.)
    writeFileSync(f.absolute, 'frozen\n')
    utimesSync(f.absolute, original.atime, new Date(Math.round(original.mtimeMs)))
    expect(versionOf(f.absolute), 'restored token must equal the based version').toBe(card.targetVersion)
    const replay = await drafts.writeback({ draftId: 'draft-1', confirmationId: card.confirmationId })
    expect(replay).toMatchObject({ state: 'refused', code: 'confirmation-stale' })
    expect(executes).toEqual([])
    expect(bytesOf(f.absolute)).toBe(before)
  })
})
