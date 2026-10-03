import { describe, expect, it } from 'vitest'

import { renderSageDocument } from '../src/product/renderer.js'
import { bootSagePage, statePayload } from './support/sage-page.js'

/**
 * Ticket 015 (US-031~038/040/042): the artifact cards and the one side-preview chrome.
 *
 * What lives here: every card state has its own words; Office is a card without a preview claim;
 * the preview panel says 未打开 until an explicit open; observe/open clicks carry the chosen matter
 * context; nothing claims the model read an artifact.
 */

const card = (over: Record<string, unknown> = {}) => ({
  artifactId: 'art-1',
  name: 'report.md',
  kind: 'markdown',
  bytes: 2048,
  version: 'v7',
  state: 'ready',
  source: 'changes-observed',
  observedAt: '2026-10-02T20:00:00.000Z',
  ...over,
})

const artifacts = (cards: readonly unknown[], preview: Record<string, unknown> = { state: 'closed' }) => ({
  state: 'read', cards, preview,
})

describe('artifact cards (015)', () => {
  it('renders each card state with its own words, and Office keeps a card without a preview claim', async () => {
    const payload = statePayload({
      artifacts: artifacts([
        card({ artifactId: 'a-1', name: 'ok.md', state: 'ready' }),
        card({ artifactId: 'a-2', name: 'gone.txt', kind: 'text', state: 'absent' }),
        card({ artifactId: 'a-3', name: 'shaky.json', kind: 'code', state: 'unconfirmed' }),
        card({ artifactId: 'a-4', name: 'q3.xlsx', kind: 'office', state: 'ready' }),
        card({ artifactId: 'a-5', name: 'raw.bin', kind: 'binary', state: 'ready' }),
      ]),
      workspaces: { source: 'workspace-follow', state: 'read', reason: null, entries: [{ workspaceId: 'ws-1', path: '/work', title: 'work' }], order: [], archivedSessions: 0, frames: 0, unapplied: 0 },
    })
    const harness = await bootSagePage(payload)
    const rows = harness.node('artifact-cards').children
    expect(rows).toHaveLength(5)
    const textOf = (id: string) => rows.find((row) => row.dataset.artifactCard === id)?.textContent ?? ''
    expect(textOf('a-1')).toContain('就绪（版本已核验）')
    expect(textOf('a-1')).toContain('ok.md')
    expect(textOf('a-2')).toContain('观察时不存在')
    expect(textOf('a-3')).toContain('未能核验（保留上一次观察）')
    expect(textOf('a-4')).toContain('本版无内置预览（不自动转换；不把可下载写成可预览）')
    expect(textOf('a-5')).toContain('本版不支持该格式')
    const actionsOf = (id: string) => rows.find((row) => row.dataset.artifactCard === id)?.children
      .filter((child) => child.tagName === 'button')
      .map((child) => child.textContent) ?? []
    expect(actionsOf('a-1')).toEqual(['打开预览（该版本）'])
    expect(actionsOf('a-4')).toEqual([])
    expect(actionsOf('a-5')).toEqual([])
    const all = harness.node('artifact-cards').textContent + harness.node('artifact-note').textContent
    for (const banned of ['已读取', '已使用', '模型已看到', '已验收']) {
      expect(all, banned).not.toContain(banned)
    }
    expect(harness.node('artifact-note').textContent).toContain('5 张产物卡')
  })

  it('keeps the preview panel 未打开 until an explicit open — cards alone claim nothing', async () => {
    const harness = await bootSagePage(statePayload({ artifacts: artifacts([card()]) }))
    expect(harness.node('artifact-preview').dataset.previewState).toBe('closed')
    expect(harness.node('artifact-preview-note').textContent).toContain('未打开：卡片出现不会创建或加载预览。')
    expect(harness.node('artifact-retry').hidden).toBe(true)
    expect(harness.node('artifact-close').hidden).toBe(true)
  })

  it('mirrors the preview states: opening, ready (with close), failed (retry only when retryable)', async () => {
    const opening = await bootSagePage(statePayload({ artifacts: artifacts([card()], { state: 'opening', artifactId: 'art-1', name: 'report.md' }) }))
    expect(opening.node('artifact-preview-note').textContent).toContain('正在按卡片版本读取内容…')
    expect(opening.node('artifact-close').hidden).toBe(false)

    const ready = await bootSagePage(statePayload({ artifacts: artifacts([card()], { state: 'ready', artifactId: 'art-1', name: 'report.md', kind: 'markdown', version: 'v7' }) }))
    expect(ready.node('artifact-preview-note').textContent).toContain('已在右侧容器打开：report.md（v7）。')
    expect(ready.node('artifact-close').hidden).toBe(false)
    expect(ready.node('artifact-retry').hidden).toBe(true)

    const failed = await bootSagePage(statePayload({ artifacts: artifacts([card()], { state: 'failed', artifactId: 'art-1', name: 'report.md', code: 'artifact-version-changed', retryable: true }) }))
    expect(failed.node('artifact-preview-note').textContent).toContain('打开失败：文件在打开前已变化（不会切到新版本）。（可对同一版本重试）')
    expect(failed.node('artifact-retry').hidden).toBe(false)
    expect(failed.node('artifact-close').hidden).toBe(false)

    const frozen = await bootSagePage(statePayload({ artifacts: artifacts([card()], { state: 'failed', artifactId: 'art-1', name: 'report.md', code: 'artifact-not-text', retryable: false }) }))
    expect(frozen.node('artifact-retry').hidden).toBe(true)
  })

  it('gives 超限 and 解析失败 two distinct sentences (016) — and never one for the other', async () => {
    const tooLarge = await bootSagePage(statePayload({ artifacts: artifacts([card({ kind: 'csv', name: 'big.csv' })], { state: 'failed', artifactId: 'art-1', name: 'big.csv', code: 'artifact-too-large', retryable: true }) }))
    const over = tooLarge.node('artifact-preview-note').textContent
    expect(over).toContain('超出本版预览上限：文件超出实测处理上限，未解析显示')
    expect(over).not.toContain('解析失败')

    const broken = await bootSagePage(statePayload({ artifacts: artifacts([card({ kind: 'csv', name: 'broken.csv' })], { state: 'failed', artifactId: 'art-1', name: 'broken.csv', code: 'artifact-csv-parse-failed', retryable: false }) }))
    const parse = broken.node('artifact-preview-note').textContent
    expect(parse).toContain('CSV 解析失败：结构无法解析，未显示表格（这不是"空文件"）')
    expect(parse).not.toContain('超出本版预览上限')
  })

  it('observe uses the chosen matter context, refuses locally without one, and the sentence survives the poll', async () => {
    const payload = statePayload({
      artifacts: artifacts([]),
      state: 'observed',
      observed: 3,
      cards: 2,
      workspaces: { source: 'workspace-follow', state: 'read', reason: null, entries: [{ workspaceId: 'ws-1', path: '/work', title: 'work' }], order: [], archivedSessions: 0, frames: 0, unapplied: 0 },
    })
    const harness = await bootSagePage(payload)
    harness.node('artifact-observe').dispatch('click')
    await harness.settle()
    expect(harness.requests).toHaveLength(0)
    expect(harness.node('artifact-note').textContent).toContain('先在上面选好事项与工作区')

    harness.node('link-matter').value = 'receipt:1'
    harness.node('link-workspace').value = 'ws-1'
    harness.node('artifact-observe').dispatch('click')
    await harness.refresh()
    expect(harness.requests[0]).toEqual({ path: '/.sage/artifacts/observe', body: { matterRef: 'receipt:1', workspaceRoot: '/work' } })
    expect(harness.node('artifact-note').textContent).toContain('已观察 3 条文件变化线索，核验后现有 2 张产物卡。')
    // The poll must not overwrite the local sentence.
    harness.setPayload(statePayload({ artifacts: artifacts([]) }))
    await harness.refresh()
    expect(harness.node('artifact-note').textContent).toContain('已观察 3 条')
  })

  it('open posts the card id and nothing else; retry and close post empty bodies', async () => {
    const harness = await bootSagePage(statePayload({ artifacts: artifacts([card({ artifactId: 'a-open' })]) }))
    const row = harness.node('artifact-cards').children[0]!
    const open = row.children.find((child) => child.tagName === 'button')!
    harness.node('artifact-cards').dispatch('click', { target: open })
    await harness.refresh()
    expect(harness.requests[0]).toEqual({ path: '/.sage/artifacts/open', body: { artifactId: 'a-open' } })

    harness.setPayload(statePayload({ artifacts: artifacts([card()], { state: 'failed', artifactId: 'art-1', name: 'report.md', code: 'artifact-version-changed', retryable: true }) }))
    await harness.refresh()
    harness.node('artifact-retry').dispatch('click')
    await harness.refresh()
    expect(harness.requests[1]).toEqual({ path: '/.sage/artifacts/retry', body: {} })
    harness.node('artifact-close').dispatch('click')
    await harness.refresh()
    expect(harness.requests[2]).toEqual({ path: '/.sage/artifacts/close', body: {} })
  })

  it('names no filesystem path in the static document', () => {
    const document = renderSageDocument()
    expect(document).not.toContain('/Users/')
    expect(document).toContain('产物卡与侧面预览')
  })
})
