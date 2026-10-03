import { describe, expect, it } from 'vitest'

import { renderSageDocument } from '../src/product/renderer.js'
import { bootSagePage, statePayload, type FakeElement } from './support/sage-page.js'

/**
 * Ticket 012 (write half), the row surface.
 *
 * The shipped document's own `<script>` runs against the shared page harness: rows, their
 * controls and the deletion sentence are checked where they actually live, so the wording
 * cannot drift from the module under test.
 */

const listOf = (items: Array<{ workspaceId: string, title: string, path: string, sessionCount?: number }>) => ({
  source: 'workspace-follow', state: 'read', reason: null,
  entries: items.map((item) => ({ ...item, sessionCount: item.sessionCount ?? 0, createdAt: '2026-10-02T00:00:00Z', updatedAt: '2026-10-02T00:00:00Z' })),
  order: items.map((item) => item.workspaceId), archivedSessions: 0, frames: 1, unapplied: 0,
})

const twoRows = listOf([
  { workspaceId: 'ws-1', title: '经营分析', path: '/Users/someone/analysis' },
  { workspaceId: 'ws-2', title: '产品资料', path: '/Users/someone/product' },
])

describe('the workspace rows carry their own controls', () => {
  it('builds one row per entry with rename input, 上移 and 移除登记, and disables 上移 only on the first', async () => {
    const harness = await bootSagePage(statePayload({ workspaces: twoRows }))
    expect(harness.node('workspace-rows').children).toHaveLength(2)
    const [first, second] = harness.node('workspace-rows').children
    expect(first?.dataset.workspaceId).toBe('ws-1')
    expect(first?.querySelector('[data-workspace-rename-input]')?.value).toBe('经营分析')
    const actionsOf = (row: FakeElement): string[] => row.querySelectorAll('[data-workspace-action]').map((button) => button.dataset.workspaceAction ?? '')
    expect(actionsOf(first!)).toEqual(['rename', 'up', 'delete'])
    expect(first?.closest('[data-workspace-id]')).toBe(first)
    const upOf = (row: FakeElement): FakeElement => row.querySelectorAll('[data-workspace-action]').find((button) => button.dataset.workspaceAction === 'up')!
    expect(upOf(first!).disabled).toBe(true)
    expect(upOf(second!).disabled).toBe(false)
    expect(second?.querySelector('[data-workspace-action]')?.dataset.workspaceAction).toBe('rename')
    expect(harness.node('workspace-list-note').textContent).toContain('2 个工作区')
  })

  it('posts a rename with the typed title, a reorder with the row above, and a delete for exactly one registration', async () => {
    const harness = await bootSagePage(statePayload({ workspaces: twoRows }))
    const [first, second] = harness.node('workspace-rows').children

    const renameButton = first!.querySelectorAll('[data-workspace-action]').find((button) => button.dataset.workspaceAction === 'rename')!
    first!.querySelector('[data-workspace-rename-input]')!.value = '季度经营'
    harness.node('workspace-rows').dispatch('click', { target: renameButton })
    expect(renameButton.disabled).toBe(true)
    await harness.refresh()
    expect(harness.requests).toEqual([
      { path: '/.sage/workspace/mutate', body: { kind: 'rename', workspaceId: 'ws-1', title: '季度经营' } },
    ])

    const upButton = second!.querySelectorAll('[data-workspace-action]').find((button) => button.dataset.workspaceAction === 'up')!
    harness.node('workspace-rows').dispatch('click', { target: upButton })
    await harness.refresh()
    expect(harness.requests[1]).toEqual({
      path: '/.sage/workspace/mutate',
      body: { kind: 'reorder', workspaceId: 'ws-2', beforeWorkspaceId: 'ws-1' },
    })

    const deleteButton = first!.querySelectorAll('[data-workspace-action]').find((button) => button.dataset.workspaceAction === 'delete')!
    harness.node('workspace-rows').dispatch('click', { target: deleteButton })
    await harness.refresh()
    expect(harness.requests[2]).toEqual({
      path: '/.sage/workspace/mutate',
      body: { kind: 'delete', workspaceId: 'ws-1' },
    })

    // A disabled control (the first row's 上移) and a target outside any control are both inert.
    const firstUp = first!.querySelectorAll('[data-workspace-action]').find((button) => button.dataset.workspaceAction === 'up')!
    expect(firstUp.disabled).toBe(true)
    harness.node('workspace-rows').dispatch('click', { target: firstUp })
    harness.node('workspace-rows').dispatch('click', { target: {} })
    await harness.refresh()
    expect(harness.requests).toHaveLength(3)
  })

  it('keeps the DOM and the typed name when the poll reports the same rows', async () => {
    const harness = await bootSagePage(statePayload({ workspaces: twoRows }))
    const input = harness.node('workspace-rows').children[0]!.querySelector('[data-workspace-rename-input]')!
    input.value = '正在输入的名字'
    await harness.refresh()
    expect(harness.node('workspace-rows').children[0]?.querySelector('[data-workspace-rename-input]')?.value).toBe('正在输入的名字')

    // A real change rebuilds the rows, and a refused mutation re-arms every control.
    harness.setPayload(statePayload({
      workspaces: listOf([{ workspaceId: 'ws-1', title: '经营分析', path: '/Users/someone/analysis' }]),
      workspaceMutation: { state: 'refused', kind: 'rename', code: 'bridge-workspace-name-conflict' },
    }))
    await harness.refresh()
    expect(harness.node('workspace-rows').children).toHaveLength(1)
    expect(harness.node('workspace-mutation-note').textContent).toContain('已被另一个工作区使用')
  })
})

describe('the deletion sentence (US-064)', () => {
  it('says the registration is gone and that the directory was not deleted', async () => {
    const h = await bootSagePage(statePayload({
      workspaces: twoRows,
      workspaceMutation: { state: 'settled', kind: 'delete', workspaceId: 'ws-1' },
    }))
    const sentence = h.node('workspace-mutation-note').textContent
    expect(sentence).toContain('移除登记')
    expect(sentence).toContain('磁盘上的目录与其中的文件没有被删除')
    expect(sentence).toContain('ws-1')
    // The sentence may not offer a second reading: no "目录已删除"-style claim can appear.
    expect(sentence).not.toMatch(/目录已删除|已删除目录|内容已删除/u)
  })

  it('words a settled rename and reorder without touching the deletion sentence', async () => {
    const renamed = await bootSagePage(statePayload({ workspaces: twoRows, workspaceMutation: { state: 'settled', kind: 'rename', workspaceId: 'ws-1', title: '季度经营' } }))
    expect(renamed.node('workspace-mutation-note').textContent).toContain('已重命名：季度经营')
    expect(renamed.node('workspace-mutation-note').textContent).toContain('目录位置不变')

    const reordered = await bootSagePage(statePayload({ workspaces: twoRows, workspaceMutation: { state: 'settled', kind: 'reorder', order: ['ws-2', 'ws-1'] } }))
    expect(reordered.node('workspace-mutation-note').textContent).toContain('已调整顺序')
    expect(reordered.node('workspace-mutation-note').textContent).toContain('2 个登记')
  })

  it('words each refusal from its machine code and falls back for an unknown one', async () => {
    const cases: Array<[string, string]> = [
      ['workspace-mutation-unavailable', '还没有接上工作区变更的能力'],
      ['bridge-workspace-unknown', '已不在登记里'],
      ['bridge-workspace-title-invalid', '不能为空'],
      ['bridge-workspace-reorder-invalid', '顺序未改变'],
      ['bridge-provider-failed', '运行时拒绝了这次变更'],
    ]
    for (const [code, phrase] of cases) {
      const h = await bootSagePage(statePayload({ workspaces: twoRows, workspaceMutation: { state: 'refused', kind: 'delete', code } }))
      expect(h.node('workspace-mutation-note').textContent, code).toContain(phrase)
    }
    const unknown = await bootSagePage(statePayload({ workspaces: twoRows, workspaceMutation: { state: 'refused', kind: 'delete', code: 'brand-new-code' } }))
    expect(unknown.node('workspace-mutation-note').textContent).toContain('变更请求没有完成')
  })

  it('states the de-registration semantics in the card before any mutation runs, and ships no delete-your-files control', async () => {
    const document = renderSageDocument()
    const card = document.slice(
      document.indexOf('class="sage-card sage-workspace-adoption"'),
      document.indexOf('class="sage-card sage-file-references"'),
    )
    expect(card).toContain('不等于删除目录')
    expect(card).toContain('目录和其中的文件都留在磁盘上')
    // Still exactly one static button in the card; every mutation control is built per row.
    const buttons = [...card.matchAll(/<button[^>]*>([^<]*)</gu)].map((match) => match[1])
    expect(buttons).toEqual(['选择已有目录'])
  })
})
