import { randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { createUnavailableFirstService } from '../src/appservice/composition.js'
import { handleSageServiceRequest } from '../src/appservice/route-skeleton.js'
import { createActionItems } from '../src/main/action-items.js'
import { createMatterProjects } from '../src/main/matter-projects.js'
import { createPendingInputs } from '../src/main/pending-inputs.js'
import { createSageFixtureViewState } from '../src/product/view-state.js'

/**
 * Ticket 028 at the S1 routes (US-146~149).
 *
 * Store-level correction receipt progression remains covered by action-items.spec.ts. At the S1
 * route, correction submission stays unavailable-first until the full protected-effect authority
 * chain and dispatch bridge exist. Project grouping remains local and changes nothing but itself.
 */

const dirs: string[] = []
afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true })
})

function harness(options: { readonly wired?: boolean } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'sage-action-item-'))
  dirs.push(dir)
  let tick = 0
  const pending = createPendingInputs({
    pendingDir: dir,
    now: () => '2026-10-03T09:00:00.000Z',
    nextId: () => `pi-${tick += 1}`,
    randomKey: () => randomBytes(32),
  })
  const sends: Array<{ matterRef: string, workspaceRoot: string, text: string }> = []
  let paused = false
  const actionItems = createActionItems({
    now: () => `2026-10-03T09:00:0${tick}.000Z`,
    nextId: () => `ai-${tick += 1}`,
    send: async (request) => {
      sends.push(request)
      if (paused) {
        const item = pending.enqueue(request.matterRef, request.text)
        return { state: 'deferred', itemId: item.itemId }
      }
      return { state: 'accepted', requestId: 'rq-1' }
    },
    pendingStateOf: (matterRef, itemId) => pending.snapshot(matterRef).items.find((entry) => entry.itemId === itemId)?.state,
  })
  const projects = createMatterProjects({ now: () => '2026-10-03T09:01:00.000Z', nextId: () => `pj-${tick += 1}` })
  const providers = createUnavailableFirstService(null, options.wired === false ? {} : {
    fixtureProjection: createSageFixtureViewState,
    draftList: () => ({
      state: 'unlocked',
      drafts: [{
        draftId: 'draft-1',
        fields: { goal: '季度复盘', deliverable: '对外说明', responsibility: 'role:owner', projectRef: '' },
        clarification: '', history: [], status: 'editing', matterRef: null, attempt: null, complete: true,
        createdAt: 't', updatedAt: 't',
      }] as never,
    }),
    matterLinks: () => ({ state: 'read', links: [], trail: [] }),
    actionItems: actionItems.list,
    actionItemCreate: actionItems.createItem,
    actionItemUpdate: actionItems.updateItem,
    actionItemStart: actionItems.start,
    actionItemComplete: actionItems.complete,
    correctionCreate: actionItems.submitCorrection,
    projects: projects.list,
    projectCreate: projects.create,
    projectAssign: projects.assign,
    projectUnassign: projects.unassign,
  })
  const post = (path: string, body: unknown) => handleSageServiceRequest(
    new Request(`dsh-app://app${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    { callerBinding: { correlation: 'c-028' }, providers } as never,
  )
  const readState = async () => (await (await providers.readState()).json()) as Record<string, unknown>
  return { post, readState, sends, pending, setPaused: (next: boolean) => { paused = next } }
}

describe('the action-item routes (ticket 028)', () => {
  it('walks create → start → complete with exact bodies and sends nothing', async () => {
    const h = harness()
    const created = await (await h.post('/.sage/action-items', { action: 'create', matterRef: 'matter:1', title: '补齐季度数据', note: '先对账' })).json() as { state: string, item: { actionId: string } }
    expect(created.state).toBe('ok')
    const actionId = created.item.actionId

    expect(await (await h.post('/.sage/action-items', { action: 'start', actionId })).json())
      .toMatchObject({ state: 'ok', item: { state: 'in-progress', records: [{ recordNo: 1, basis: { revision: 1, title: '补齐季度数据' } }] } })
    expect(await (await h.post('/.sage/action-items', { action: 'complete', actionId })).json())
      .toMatchObject({ state: 'ok', item: { state: 'done' } })
    expect(h.sends).toEqual([])

    const state = await h.readState() as { actionItems: { items: Array<{ state: string }> } }
    expect(state.actionItems.items[0]?.state).toBe('done')
  })

  it('keeps correction submission unavailable-first instead of bypassing admission into the queue store', async () => {
    const h = harness()
    h.setPaused(true)
    const outcome = await (await h.post('/.sage/corrections', {
      matterRef: 'matter:1',
      workspaceRoot: '/Users/someone/project',
      originalText: '原要求：先出季度对账单',
      originalAt: '2026-10-03T08:00:00.000Z',
      text: '更正副本：先出季度对账单（财务口径）',
    })).json()
    expect(outcome).toEqual({ state: 'refused', code: 'protected-effect-unavailable' })
    expect(h.sends).toEqual([])
    expect(h.pending.snapshot('matter:1').items).toEqual([])
    const state = await h.readState() as { actionItems: { corrections: unknown[] } }
    expect(state.actionItems.corrections).toEqual([])
  })

  it('keeps every unwired act honest and parses the bodies exactly', async () => {
    const unwired = harness({ wired: false })
    const refused: Array<[string, unknown, string]> = [
      ['/.sage/action-items', { action: 'create', matterRef: 'matter:1', title: 'x' }, 'action-items-unavailable'],
      ['/.sage/corrections', { matterRef: 'matter:1', workspaceRoot: '/w', originalText: 'x', text: 'y' }, 'protected-effect-unavailable'],
      ['/.sage/projects', { action: 'create', name: 'A' }, 'projects-unavailable'],
    ]
    for (const [path, body, code] of refused) {
      expect(await (await unwired.post(path, body)).json(), path).toMatchObject({ state: 'refused', code })
    }
    const state = await unwired.readState()
    expect(state.actionItems).toEqual({ state: 'unavailable', items: [], corrections: [] })
    expect(state.projects).toEqual({ state: 'unavailable', projects: [], trail: [] })

    const h = harness()
    const bad: Array<[string, unknown]> = [
      ['/.sage/action-items', { action: 'create', matterRef: 'matter:1', title: '' }],
      ['/.sage/action-items', { action: 'create', matterRef: 'matter:1', title: 'x', extra: 1 }],
      ['/.sage/action-items', { action: 'update', actionId: 'a', }],
      ['/.sage/action-items', { action: 'start', actionId: '' }],
      ['/.sage/action-items', { action: 'explode', actionId: 'a' }],
      ['/.sage/corrections', { matterRef: 'matter:1', workspaceRoot: '/w', originalText: 'x' }],
      ['/.sage/corrections', { matterRef: 'matter:1', workspaceRoot: '/w', originalText: 'x', text: 'y', extra: 1 }],
      ['/.sage/projects', { action: 'create', name: '   ' }],
      ['/.sage/projects', { action: 'assign', matterRef: 'matter:1' }],
      ['/.sage/projects', { action: 'assign', matterRefs: ['a'], projectRef: 'p' }],
    ]
    for (const [path, body] of bad) {
      expect((await h.post(path, body)).status, `${path} ${JSON.stringify(body)}`).toBe(400)
    }
  })

  it('an assignment changes nothing but itself — not the matter, not responsibility, not visibility (US-149)', async () => {
    const h = harness()
    const before = await h.readState()

    const created = await (await h.post('/.sage/projects', { action: 'create', name: '2026 增长项目' })).json() as { state: string, projects: { projects: Array<{ projectRef: string }> } }
    expect(created.state).toBe('ok')
    const projectRef = created.projects.projects[0]!.projectRef
    expect(await (await h.post('/.sage/projects', { action: 'assign', matterRef: 'matter:1', projectRef })).json())
      .toMatchObject({ state: 'ok' })

    const after = await h.readState()
    for (const slot of ['matter', 'draft', 'matterLinks', 'readout', 'sessionChannel', 'workspaces', 'actionItems']) {
      expect(JSON.stringify(after[slot]), slot).toBe(JSON.stringify(before[slot]))
    }
    // The draft still carries its own responsibility; the grouping never rewrites it.
    const draft = after.draft as { drafts: Array<{ fields: { responsibility: string } }> }
    expect(draft.drafts[0]?.fields.responsibility).toBe('role:owner')
    // Only the project slot moved: the summary references the matter and the trail keeps the act.
    const projects = after.projects as { projects: Array<{ matterRefs: string[] }>, trail: Array<{ action: string, matterRef: string }> }
    expect(projects.projects[0]?.matterRefs).toEqual(['matter:1'])
    expect(projects.trail.at(-1)).toMatchObject({ action: 'assign', matterRef: 'matter:1' })
  })
})
