import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { createActionConfirmationStore } from '../src/appservice/action-confirmations.js'
import { createUnavailableFirstService } from '../src/appservice/composition.js'
import { handleSageServiceRequest } from '../src/appservice/route-skeleton.js'
import type { FileReferenceRecord } from '../src/appservice/contracts.js'
import { createEditDrafts } from '../src/main/edit-drafts.js'
import { renderSageDocument } from '../src/product/renderer.js'

/**
 * Ticket 027 at the S1 routes (US-140~145).
 *
 * Exact bodies, honest refusals while the family is unwired, the writeback gate before any step,
 * and the negative space the ticket names: no version-control entry, no download/export effect,
 * and no raw-payload field anywhere in the projection.
 */

const roots: string[] = []
afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true })
})

const versionOf = (absolutePath: string): string => {
  const stat = statSync(absolutePath)
  return `${Math.round(stat.mtimeMs)}:${stat.size}`
}

function fixture(initial = '一行\n二行\n') {
  const root = mkdtempSync(join(tmpdir(), 'sage-edit-draft-route-'))
  roots.push(root)
  mkdirSync(join(root, 'notes'), { recursive: true })
  const absolute = join(root, 'notes/plan.md')
  writeFileSync(absolute, initial)
  const call = async (endpoint: string, payload: readonly unknown[] = []): Promise<unknown> => {
    const request = (payload[0] ?? {}) as Record<string, unknown>
    const absolutePath = join(String(request.workspaceRoot), String(request.path))
    if (endpoint === 'workspaceFiles/stat') {
      return { ok: true, result: { absolutePath, version: versionOf(absolutePath), bytes: statSync(absolutePath).size } }
    }
    if (endpoint === 'workspaceFiles/read') {
      const text = readFileSync(absolutePath, 'utf8')
      const lines = text.split('\n')
      if (text.endsWith('\n')) lines.pop()
      return { ok: true, result: { absolutePath, version: versionOf(absolutePath), text: lines.join('\n'), lines: lines.length, eof: true } }
    }
    return { ok: false, code: 'bridge-answer-unrecognised' }
  }
  const reference: FileReferenceRecord = {
    referenceId: 'ref-1', matterRef: 'matter:1', workspaceRoot: root, path: 'notes/plan.md', absolutePath: absolute,
    version: versionOf(absolute), bytes: statSync(absolute).size,
    createdAt: '2026-10-02T12:00:00.000Z', lastUse: 'unused',
  }
  return { root, absolute, call, reference }
}

function harness(options: { readonly wired?: boolean, readonly execute?: (request: { readonly absolutePath: string, readonly proposedText: string }) => Promise<{ readonly receiptRef: string }> } = {}) {
  const f = fixture()
  let tick = 0
  const writes: string[] = []
  const editDrafts = createEditDrafts(f.call, {
    now: () => '2026-10-02T21:00:00.000Z',
    nextId: () => `draft-${tick += 1}`,
    references: () => [f.reference],
    confirmations: {
      store: createActionConfirmationStore({ now: () => '2026-10-02T21:00:00.000Z', nextId: () => `cf-${tick += 1}` }),
      facts: () => ({ environmentRef: null }),
    },
    ...(options.execute === undefined ? {} : { executeWriteback: async (request) => {
      writes.push(request.absolutePath)
      // The test executor is the only writer, and it writes the real bytes of the proposal.
      writeFileSync(request.absolutePath, request.proposedText)
      return options.execute!(request)
    } }),
  })
  const providers = createUnavailableFirstService(null, options.wired === false ? {} : {
    runProjectionRead: async (_intent, read) => read({
      matterRef: 'matter:1', revisionRef: 'revision:1', workspaceRef: 'workspace:1',
      trustedWorkspaceRoot: f.root, sessionRef: 'session:1', actorScopeRef: 'actor:1',
      contextGeneration: 1, frameGeneration: 1,
    }).then((value) => ({ state: 'read' as const, correlation: 'edit-draft-test', value })),
    editDrafts: editDrafts.list,
    editDraftCreate: editDrafts.create,
    editDraftUpdate: editDrafts.update,
    editDraftDiff: editDrafts.diff,
    editDraftPrepareWriteback: editDrafts.prepareWriteback,
    editDraftWriteback: editDrafts.writeback,
  })
  const post = (path: string, body: unknown) => handleSageServiceRequest(
    new Request(`dsh-app://app${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    { callerBinding: { correlation: 'c-027' }, providers } as never,
  )
  return { f, post, providers, writes }
}

describe('the edit-draft routes (ticket 027)', () => {
  it('walks create → update → diff → prepare → writeback with the exact bodies, and the write lands only through the executor', async () => {
    const h = harness({ execute: async () => ({ receiptRef: 'wb-1' }) })
    const created = await (await h.post('/.sage/edit-drafts/create', { referenceId: 'ref-1' })).json() as { state: string, draft: { draftId: string } }
    expect(created.state).toBe('created')
    const draftId = created.draft.draftId

    expect(await (await h.post('/.sage/edit-drafts/update', { draftId, proposedText: '一行\n二行改了\n' })).json())
      .toMatchObject({ state: 'updated', draft: { proposedCharacters: '一行\n二行改了\n'.length } })

    const diff = await (await h.post('/.sage/edit-drafts/diff', { draftId })).json() as { state: string, diff: { addedLines: number, removedLines: number, sourceChanged: boolean } }
    expect(diff).toMatchObject({ state: 'read', diff: { addedLines: 1, removedLines: 1, sourceChanged: false } })

    const prepared = await (await h.post('/.sage/edit-drafts/prepare-writeback', { draftId })).json() as { state: string, card: { confirmationId: string, targetVersion: string, impact: { addedLines: number } } }
    expect(prepared).toMatchObject({ state: 'prepared', card: { targetVersion: h.f.reference.version, impact: { addedLines: 1 } } })

    const before = readFileSync(h.f.absolute).toString('base64')
    const written = await (await h.post('/.sage/edit-drafts/writeback', { draftId, confirmationId: prepared.card.confirmationId })).json()
    expect(written).toEqual({ state: 'written', draftId, receiptRef: 'wb-1' })
    expect(readFileSync(h.f.absolute, 'utf8')).toBe('一行\n二行改了\n')

    // One credential, one write: the replay never reaches the executor. The executor's own write
    // moved the file's version, so the version gate reports the changed source before the spent
    // credential is consulted — either way the replay is refused and nothing more is written.
    expect(await (await h.post('/.sage/edit-drafts/writeback', { draftId, confirmationId: prepared.card.confirmationId })).json())
      .toMatchObject({ state: 'refused', code: 'writeback-source-changed' })
    expect(h.writes).toHaveLength(1)
    expect(before).not.toBe(readFileSync(h.f.absolute).toString('base64'))
  })

  it('without a confirmation nothing reaches the executor and the file keeps its bytes', async () => {
    const h = harness({ execute: async () => ({ receiptRef: 'wb-1' }) })
    const created = await (await h.post('/.sage/edit-drafts/create', { referenceId: 'ref-1' })).json() as { draft: { draftId: string } }
    await h.post('/.sage/edit-drafts/update', { draftId: created.draft.draftId, proposedText: '一行\n二行改了\n' })
    await h.post('/.sage/edit-drafts/prepare-writeback', { draftId: created.draft.draftId })
    const before = readFileSync(h.f.absolute).toString('base64')
    expect(await (await h.post('/.sage/edit-drafts/writeback', { draftId: created.draft.draftId })).json())
      .toMatchObject({ state: 'refused', code: 'confirmation-required' })
    expect(h.writes).toEqual([])
    expect(readFileSync(h.f.absolute).toString('base64')).toBe(before)
  })

  it('keeps an unwired family honest: each verb refuses with its own code and the slot is unavailable', async () => {
    const h = harness({ wired: false })
    const cases: Array<[string, unknown]> = [
      ['/.sage/edit-drafts/create', { referenceId: 'ref-1' }],
      ['/.sage/edit-drafts/update', { draftId: 'draft-1', proposedText: 'x' }],
      ['/.sage/edit-drafts/diff', { draftId: 'draft-1' }],
      ['/.sage/edit-drafts/prepare-writeback', { draftId: 'draft-1' }],
      ['/.sage/edit-drafts/writeback', { draftId: 'draft-1', confirmationId: 'cf-1' }],
    ]
    for (const [path, body] of cases) {
      expect(await (await h.post(path, body)).json(), path).toMatchObject({ state: 'refused', code: 'edit-draft-unavailable' })
    }
    const state = await (await h.providers.readState()).json() as Record<string, unknown>
    expect(state.editDrafts).toEqual({ state: 'unavailable', drafts: [] })
  })

  it('parses every body exactly: extra keys, empty ids and mistyped fields are refused 400', async () => {
    const h = harness()
    const bad: Array<[string, unknown]> = [
      ['/.sage/edit-drafts/create', { referenceId: 'ref-1', matterRef: 'matter:1' }],
      ['/.sage/edit-drafts/create', { referenceId: '' }],
      ['/.sage/edit-drafts/update', { draftId: 'draft-1', proposedText: 7 }],
      ['/.sage/edit-drafts/update', { draftId: 'draft-1', proposedText: 'x', extra: 1 }],
      ['/.sage/edit-drafts/diff', { draftId: '' }],
      ['/.sage/edit-drafts/prepare-writeback', { draftId: 'draft-1', force: true }],
      ['/.sage/edit-drafts/writeback', { draftId: 'draft-1', confirmationId: '' }],
      ['/.sage/edit-drafts/writeback', { draftId: 'draft-1', confirmationId: 7 }],
    ]
    for (const [path, body] of bad) {
      const response = await h.post(path, body)
      expect(response.status, `${path} ${JSON.stringify(body)}`).toBe(400)
      expect(await response.json()).toMatchObject({ code: 'invalid-edit-draft-request' })
    }
    // update accepts an empty proposal (removing everything is an edit) — but nothing else is loose.
    expect((await h.post('/.sage/edit-drafts/update', { draftId: 'draft-1', proposedText: '' })).status).toBe(200)
  })

  it('projects controlled information only: no machine root, no snapshot bytes, no payload fields', async () => {
    const h = harness()
    await h.post('/.sage/edit-drafts/create', { referenceId: 'ref-1' })
    const state = await (await h.providers.readState()).json() as { editDrafts: unknown }
    const text = JSON.stringify(state.editDrafts)
    expect(text).not.toContain(h.f.root)
    for (const banned of ['workspaceRoot', 'absolutePath', 'basedText', 'payload', 'arguments', 'toolInput']) {
      expect(text, banned).not.toContain(banned)
    }
  })
})

describe('the negative space the ticket names (US-142/144/145)', () => {
  it('the edit-draft card carries no version-control, download or export entry', () => {
    const document = renderSageDocument()
    const card = document.slice(
      document.indexOf('class="sage-card sage-edit-draft-card"'),
      document.indexOf('id="panel-settings"'),
    )
    expect(card).toContain('修改稿存在不等于共享文件已更新')
    expect(card).toContain('确认不等于已回写')
    expect(card).toContain('下载与导出没有回写效果')
    // The interactive roster is pinned: five controls, all draft-flow, none version-control.
    const labels = (card.match(/<button[^>]*>([^<]*)</gu) ?? []).map((tag) => tag.replace(/<button[^>]*>|</gu, ''))
    expect(labels).toEqual(['保存修改稿', '查看 Diff（按所依据版本）', '准备回写（需单独确认）', '确认回写', '取消确认'])
    for (const word of ['提交', '推送', '分支', '下载', '导出', 'commit', 'push', 'branch', 'download']) {
      expect(labels.join('|'), word).not.toContain(word)
    }
  })

  it('the service skeleton has no version-control route and the module itself never writes a file', () => {
    // A git/export verb would need a path of its own in the route table; this pins that none exists.
    const skeleton = readFileSync(new URL('../src/appservice/route-skeleton.ts', import.meta.url), 'utf8')
    const servicePaths = skeleton.match(/'\/\.sage\/[a-z/-]*/gu) ?? []
    expect(servicePaths.filter((path) => /git|commit|worktree|export|download/u.test(path))).toEqual([])
    // Sage main never touches the source bytes itself: the only write path is the executor port,
    // so the module may not import a filesystem-capable module or spawn anything.
    const module = readFileSync(new URL('../src/main/edit-drafts.ts', import.meta.url), 'utf8')
    for (const banned of ['node:fs', 'node:child_process', 'writeFileSync', 'createWriteStream']) {
      expect(module, banned).not.toContain(banned)
    }
  })
})
