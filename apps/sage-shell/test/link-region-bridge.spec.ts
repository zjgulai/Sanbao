import { afterEach, describe, expect, it } from 'vitest'

import { renderSageDocument } from '../src/product/renderer.js'
import { bootSagePage, setLinkSelection, statePayload } from './support/sage-page.js'

/**
 * Batch 20 / P3 (ADR-0261 strangler): the link card (`#link-*`, the selector cluster) is owned by
 * the React app. The legacy script publishes its region slice through `__SAGE_APP_SET_REGION__`,
 * exposes the three named acts through `__SAGE_LEGACY_ACTIONS__` (exact bodies and refusal text),
 * and reads every action's matter/workspace context from the selection React pushes through the
 * `__SAGE_APP_SET_LINK_SELECTION__` up-bridge — it must not read the card's DOM anymore.
 * Rendering is pinned in `test/product-app/link-region.spec.tsx`.
 */

interface RegionMessage {
  readonly kind: string
  readonly [key: string]: unknown
}

interface RegionSink {
  readonly byRegion: Array<{ region: string, message: RegionMessage }>
  readonly restore: () => void
}

interface LegacyActionsShape {
  addLink?: (matterRef: string, workspaceRef: string) => Promise<string | null>
  removeLink?: (matterRef: string, workspaceRef: string) => Promise<void>
  setDefaultLink?: (matterRef: string, workspaceRef: string) => Promise<void>
  createPlan?: (title: string, stepsText: string) => Promise<string | null>
}

let sink: RegionSink | undefined
let restoreActions: (() => void) | undefined

afterEach(() => {
  sink?.restore()
  sink = undefined
  restoreActions?.()
  restoreActions = undefined
})

function installRegionSink(): void {
  const byRegion: Array<{ region: string, message: RegionMessage }> = []
  const target = globalThis as { __SAGE_APP_SET_REGION__?: unknown }
  const previous = target.__SAGE_APP_SET_REGION__
  target.__SAGE_APP_SET_REGION__ = (region: string, message: RegionMessage): void => { byRegion.push({ region, message }) }
  sink = {
    byRegion,
    restore: () => {
      if (previous === undefined) delete target.__SAGE_APP_SET_REGION__
      else target.__SAGE_APP_SET_REGION__ = previous
    },
  }
}

function lastFor(region: string): RegionMessage | undefined {
  return sink?.byRegion.filter((entry) => entry.region === region).at(-1)?.message
}

function legacyActions(): LegacyActionsShape {
  const bridge = (globalThis as unknown as { __SAGE_LEGACY_ACTIONS__?: LegacyActionsShape }).__SAGE_LEGACY_ACTIONS__
  expect(bridge, 'legacy down-bridge must be installed at boot').toBeDefined()
  return bridge!
}

const draft = (overrides: Record<string, unknown> = {}) => ({
  draftId: 'draft-1',
  fields: { goal: '季度复盘对外化', deliverable: '对外说明', responsibility: 'role:owner', projectRef: '' },
  clarification: '',
  history: [],
  status: 'converted',
  matterRef: 'receipt:1',
  complete: true,
  createdAt: '2026-10-02T12:00:00.000Z',
  updatedAt: '2026-10-02T12:00:00.000Z',
  ...overrides,
})

const workspaces = {
  source: 'workspace-follow', state: 'read', reason: null,
  entries: [
    { workspaceId: 'ws-1', title: '经营分析', path: '/Users/someone/a', sessionCount: 0, createdAt: 'x', updatedAt: 'x' },
    { workspaceId: 'ws-2', title: '产品资料', path: '/Users/someone/b', sessionCount: 0, createdAt: 'x', updatedAt: 'x' },
  ],
  order: ['ws-1', 'ws-2'], archivedSessions: 0, frames: 1, unapplied: 0,
}

const linkState = {
  state: 'read',
  links: [
    { matterRef: 'receipt:1', workspaceRef: 'ws-1', workspacePath: '/Users/someone/a', linkedAt: '2026-10-02T12:00:00.000Z', isDefault: true },
  ],
  trail: [
    { linkId: 'link-op-1', at: '2026-10-02T12:00:00.000Z', action: 'linked', matterRef: 'receipt:1', workspaceRef: 'ws-1', actorRef: 'session:verified' },
  ],
}

const payload = (overrides: Record<string, unknown> = {}) => statePayload({
  draft: { state: 'unlocked', drafts: [draft()] },
  workspaces,
  matterLinks: linkState,
  ...overrides,
})

describe('link region bridge (batch 20)', () => {
  it('publishes the link slice with options and leaves the card DOM untouched', async () => {
    installRegionSink()
    const page = await bootSagePage(payload())
    const slice = lastFor('link')
    expect(slice?.kind).toBe('read')
    const slot = slice?.slot as { links: unknown[], trail: unknown[], matters: unknown[], workspaces: unknown[] }
    expect(slot.links).toBe(linkState.links)
    expect(slot.trail).toBe(linkState.trail)
    expect(slot.matters).toEqual([{ value: 'receipt:1', label: '季度复盘对外化　receipt:1' }])
    expect(slot.workspaces).toEqual([
      { value: 'ws-1', label: '经营分析　/Users/someone/a' },
      { value: 'ws-2', label: '产品资料　/Users/someone/b' },
    ])
    expect(page.node('link-rows').children).toHaveLength(0)
    expect(page.node('link-note').textContent).toBe('')
    expect(page.node('link-trail').children).toHaveLength(0)

    const down = await bootSagePage(statePayload({}))
    expect(lastFor('link')).toEqual({ kind: 'unavailable' })
    expect(down.node('link-rows').children).toHaveLength(0)
  })

  it('keeps the ticket-011 words and control roster pinned on the static first frame', () => {
    const document = renderSageDocument()
    const slice = document.slice(
      document.indexOf('class="sage-card sage-link-card"'),
      document.indexOf('class="sage-card sage-action-items-card"'),
    )
    expect(slice).toContain('不读取、不上传任何资料内容')
    expect(slice).toContain('也不会把执行环境静默换成别的工作区')
    const labels = (slice.match(/<button[^>]*>([^<]*)</gu) ?? []).map((tag) => tag.replace(/<button[^>]*>|</g, ''))
    expect(labels).toEqual(['关联', '解除', '设为默认执行环境'])
    expect(document).toContain('id="sage-region-link"')
  })

  it('reads every action context from the selection up-bridge, not from the card DOM', async () => {
    const page = await bootSagePage(payload())
    const actions = legacyActions()

    // No selection yet: the create-plan precondition refuses before any request.
    expect(await actions.createPlan!('上架方案', '备料')).toContain('先在「事项 ↔ 工作区关联」里选好事项')
    expect(page.requests).toHaveLength(0)

    setLinkSelection('matter:9', 'ws-2')
    expect(await actions.createPlan!('上架方案', '备料')).toBeNull()
    await page.settle()
    expect(page.requests[0]).toEqual({ path: '/.sage/plans', body: { action: 'create', matterRef: 'matter:9', title: '上架方案', steps: ['备料'] } })
    // The fake DOM's select values never mattered: the card's own nodes stay untouched.
    expect(page.node('link-matter').children).toHaveLength(0)
  })

  it('runs the three named link acts through the down-bridge with exact bodies and notices', async () => {
    const page = await bootSagePage(payload())
    const actions = legacyActions()

    expect(await actions.addLink!('', '')).toContain('先选好事项与工作区：关联不会自动替你挑一个。')
    expect(await actions.removeLink!('', '')).toBeUndefined()
    expect(await actions.setDefaultLink!('', '')).toBeUndefined()
    expect(page.requests).toHaveLength(0)

    expect(await actions.addLink!('receipt:1', 'ws-2')).toBeNull()
    await actions.removeLink!('receipt:1', 'ws-2')
    await actions.setDefaultLink!('receipt:1', 'ws-2')
    await page.settle()
    expect(page.requests[0]).toEqual({ path: '/.sage/matter/link', body: { action: 'link', matterRef: 'receipt:1', workspaceRef: 'ws-2' } })
    expect(page.requests[1]).toEqual({ path: '/.sage/matter/link', body: { action: 'unlink', matterRef: 'receipt:1', workspaceRef: 'ws-2' } })
    expect(page.requests[2]).toEqual({ path: '/.sage/matter/link', body: { action: 'set-default', matterRef: 'receipt:1', workspaceRef: 'ws-2' } })
  })
})
