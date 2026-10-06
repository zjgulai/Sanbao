import { afterEach, describe, expect, it } from 'vitest'

import { renderSageDocument } from '../src/product/renderer.js'
import { bootSagePage, statePayload, setLinkSelection } from './support/sage-page.js'

/**
 * Batch 17 / P3 (ADR-0261 strangler): the run-monitor card (`#monitor-*`, `#run-log-*`) and the
 * artifact card (`#artifact-*`) are owned by the React app. The legacy script publishes their
 * region slices through `__SAGE_APP_SET_REGION__` and exposes the wire actions through
 * `__SAGE_LEGACY_ACTIONS__` (run-log cursor, observe/preview requests, refusal-code text); it
 * must not write either card's DOM anymore. Rendering is pinned in
 * `test/product-app/monitor-artifact.spec.tsx`.
 */

interface RegionMessage {
  readonly kind: string
  readonly [key: string]: unknown
}

interface RegionSink {
  readonly byRegion: Array<{ region: string, message: RegionMessage }>
  readonly restore: () => void
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

interface LegacyActionsShape {
  runLogOpen?: (path: string) => Promise<{ lines: unknown[], append: boolean, notice: string }>
  runLogContinue?: () => Promise<{ lines: unknown[], append: boolean, notice: string }>
  observeArtifacts?: () => Promise<string>
  retryArtifactPreview?: () => Promise<void>
  closeArtifactPreview?: () => Promise<void>
  setArtifactFullscreen?: (on: boolean) => Promise<void>
  artifactWindow?: (action: 'open' | 'close') => Promise<string>
}

function legacyActions(): LegacyActionsShape {
  const bridge = (globalThis as unknown as { __SAGE_LEGACY_ACTIONS__?: LegacyActionsShape }).__SAGE_LEGACY_ACTIONS__
  expect(bridge, 'legacy down-bridge must be installed at boot').toBeDefined()
  return bridge!
}

const workspaces = {
  source: 'workspace-follow', state: 'read', reason: null,
  entries: [{ workspaceId: 'ws-1', title: '经营分析', path: '/Users/someone/project', sessionCount: 0, createdAt: 'x', updatedAt: 'x' }],
  order: ['ws-1'], archivedSessions: 0, frames: 1, unapplied: 0,
}

const runMonitorRead = {
  state: 'read', matterRef: 'matter:1',
  steps: { state: 'running', lastTurnEnd: null, observedRecords: 4, reason: null },
  budget: {
    reserved: { state: 'unknown', reason: 'usage-provider-unavailable' },
    consumed: { state: 'unknown', reason: 'usage-provider-unavailable' },
    billed: { state: 'unknown', reason: 'usage-provider-unavailable' },
  },
  device: { state: 'unknown', reason: 'device-binding-unavailable' },
  background: { state: 'unknown', reason: 'background-host-unavailable' },
  context: { state: 'unknown', reason: 'context-usage-unavailable', compaction: 'unknown' },
}

const card = (overrides: Record<string, unknown> = {}) => ({ artifactId: 'art-1', name: 'report.md', kind: 'markdown', bytes: 10, version: 'v7', state: 'ready', source: 'changes-observed', observedAt: 't', ...overrides })
const artifacts = (cards: unknown[], preview: Record<string, unknown> = { state: 'closed' }) => ({ state: 'read', cards, preview })

describe('run-monitor region bridge (batch 17)', () => {
  it('publishes the run-monitor slice and leaves the card DOM untouched', async () => {
    installRegionSink()
    const page = await bootSagePage(statePayload({ runMonitor: runMonitorRead }))
    expect(lastFor('run-monitor')).toEqual({ kind: 'read', slot: runMonitorRead })
    expect(page.node('monitor-steps').textContent).toBe('')
    expect(page.node('monitor-budget-reserved').textContent).toBe('')
    expect(page.node('run-log-rows').children).toHaveLength(0)
    expect(page.node('run-log-note').textContent).toBe('')

    const down = await bootSagePage(statePayload({}))
    expect(lastFor('run-monitor')).toEqual({ kind: 'unavailable' })
    expect(down.node('monitor-steps').textContent).toBe('')
  })

  it('keeps the ticket-031 words and control roster pinned on the static first frame', () => {
    const document = renderSageDocument()
    const cardSlice = document.slice(
      document.indexOf('class="sage-card sage-run-monitor-card"'),
      document.indexOf('class="sage-plan-section"'),
    )
    expect(cardSlice).toContain('四轴')
    expect(cardSlice).toContain('各自独立')
    expect(cardSlice).toContain('不以零代替未知')
    expect(cardSlice).toContain('离线不等于运行取消、也不等于被其他设备接管')
    expect(cardSlice).toContain('折叠或关闭这个面板不会取消运行')
    expect(cardSlice).toContain('不进入普通对话同步')
    expect(cardSlice).toContain('本版无导出入口')
    const labels = (cardSlice.match(/<button[^>]*>([^<]*)</gu) ?? []).map((tag) => tag.replace(/<button[^>]*>|</g, ''))
    expect(labels).toEqual(['收起面板', '读取运行日志', '继续读取（游标）'])
    expect(document).toContain('id="sage-region-run-monitor"')
  })

  it('walks the bounded cursor through the down-bridge: open, append, rotate, reset', async () => {
    const route: Record<string, unknown> = {
      state: 'read', path: 'logs/run.log', version: 'v:30', fromLine: 1, nextLine: 3,
      lines: [{ no: 1, text: '第 1 行' }, { no: 2, text: '第 2 行' }], eof: true, truncatedLines: 0, rotation: null,
    }
    const page = await bootSagePage(statePayload({
      workspaces,
      matterLinks: { state: 'read', links: [{ matterRef: 'matter:1', workspaceRef: 'ws-1', workspacePath: '/Users/someone/project', linkedAt: 'x', isDefault: true }], trail: [] },
      runMonitor: runMonitorRead,
    }), { '/.sage/run-log': route })
    setLinkSelection('matter:1', 'ws-1')
    const actions = legacyActions()

    const open = await actions.runLogOpen!('logs/run.log')
    await page.settle()
    expect(page.requests[0]).toEqual({ path: '/.sage/run-log', body: { workspaceRoot: '/Users/someone/project', path: 'logs/run.log' } })
    expect(open.append).toBe(false)
    expect(open.lines).toHaveLength(2)
    expect(open.notice).toContain('已读到第 2 行')
    expect(open.notice).toContain('已到文件末尾')
    expect(page.node('run-log-rows').children).toHaveLength(0)

    Object.assign(route, { fromLine: 3, nextLine: 4, lines: [{ no: 3, text: '第 3 行' }], eof: true })
    const next = await actions.runLogContinue!()
    await page.settle()
    expect(page.requests[1]).toEqual({
      path: '/.sage/run-log',
      body: { workspaceRoot: '/Users/someone/project', path: 'logs/run.log', fromLine: 3, expectVersion: 'v:30' },
    })
    expect(next.append).toBe(true)
    expect(next.lines).toHaveLength(1)
    expect(next.notice).toContain('已读到第 3 行')

    Object.assign(route, { version: 'v:9', fromLine: 4, nextLine: 4, lines: [], rotation: 'file-rotated' })
    const rotated = await actions.runLogContinue!()
    await page.settle()
    expect(rotated.notice).toContain('轮转或截断')
    expect(rotated.notice).toContain('不重复、不漏标')

    const afterReset = await actions.runLogContinue!()
    expect(afterReset.notice).toContain('先「读取运行日志」')
    expect(page.requests).toHaveLength(3)
  })

  it('keeps the run-log preconditions honest through the down-bridge', async () => {
    const page = await bootSagePage(statePayload({
      workspaces,
      matterLinks: { state: 'read', links: [{ matterRef: 'matter:1', workspaceRef: 'ws-1', workspacePath: '/Users/someone/project', linkedAt: 'x', isDefault: true }], trail: [] },
      runMonitor: runMonitorRead,
    }))
    const actions = legacyActions()
    const noContext = await actions.runLogOpen!('logs/run.log')
    expect(noContext.notice).toContain('先在「事项 ↔ 工作区关联」里选好事项与工作区')
    expect(page.requests).toHaveLength(0)

    setLinkSelection('matter:1', 'ws-1')
    const noPath = await actions.runLogOpen!('   ')
    expect(noPath.notice).toContain('先写日志文件在工作区内的相对路径')
    expect(page.requests).toHaveLength(0)
  })
})

describe('artifact region bridge (batch 17)', () => {
  it('publishes the artifacts slice and leaves the card DOM untouched', async () => {
    installRegionSink()
    const page = await bootSagePage(statePayload({ artifacts: artifacts([card()]) }))
    expect(lastFor('artifacts')).toEqual({ kind: 'cards', cards: [card()], preview: { state: 'closed' } })
    expect(page.node('artifact-cards').children).toHaveLength(0)
    expect(page.node('artifact-note').textContent).toBe('')
    expect(page.node('artifact-preview-note').textContent).toBe('')
    expect(page.node('artifact-expand').hidden).toBe(false)

    const unknown = await bootSagePage(statePayload({}))
    expect(lastFor('artifacts')).toEqual({ kind: 'unavailable' })
    expect(unknown.node('artifact-cards').children).toHaveLength(0)
  })

  it('keeps the artifact card roster and the no-filesystem-path pin on the static first frame', () => {
    const document = renderSageDocument()
    expect(document).toContain('id="sage-region-artifacts"')
    expect(document).not.toContain('/Users/')
    expect(document).toContain('产物卡与侧面预览')
  })

  it('runs observe, retry, close, fullscreen and window through the down-bridge with exact bodies', async () => {
    const page = await bootSagePage(statePayload({
      workspaces,
      artifacts: artifacts([card({ artifactId: 'a-open' })]),
    }), {
      '/.sage/artifacts/observe': { state: 'observed', observed: 3, cards: 2 },
      '/.sage/artifacts/window': { state: 'opened' },
    })
    const actions = legacyActions()

    const refused = await actions.observeArtifacts!()
    expect(refused).toContain('先在上面选好事项与工作区')
    expect(page.requests).toHaveLength(0)

    setLinkSelection('receipt:1', 'ws-1')
    const observed = await actions.observeArtifacts!()
    await page.settle()
    expect(page.requests[0]).toEqual({ path: '/.sage/artifacts/observe', body: { matterRef: 'receipt:1', workspaceRoot: '/Users/someone/project' } })
    expect(observed).toContain('已观察 3 条文件变化线索，核验后现有 2 张产物卡。')

    await actions.retryArtifactPreview!()
    await actions.closeArtifactPreview!()
    await page.settle()
    expect(page.requests[1]).toEqual({ path: '/.sage/artifacts/retry', body: {} })
    expect(page.requests[2]).toEqual({ path: '/.sage/artifacts/close', body: {} })

    await actions.setArtifactFullscreen!(true)
    await page.settle()
    expect(page.requests[3]).toEqual({ path: '/.sage/artifacts/fullscreen', body: { on: true } })

    const opened = await actions.artifactWindow!('open')
    await page.settle()
    expect(page.requests[4]).toEqual({ path: '/.sage/artifacts/window', body: { action: 'open' } })
    expect(opened).toContain('已在独立窗口打开（同一版本引用；未重读、未重跑生成）。')
  })

  it('maps window refusals to the honest notice through the down-bridge', async () => {
    await bootSagePage(statePayload({ artifacts: artifacts([card()]) }), {
      '/.sage/artifacts/window': { state: 'refused', code: 'artifact-preview-not-open' },
    })
    const notice = await legacyActions().artifactWindow!('open')
    expect(notice).toContain('先打开预览（按版本），独立窗口只对已打开的产物生效。')
  })
})
