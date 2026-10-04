import { describe, expect, it } from 'vitest'

import { renderSageDocument } from '../src/product/renderer.js'
import { bootSagePage, statePayload, type FakeElement } from './support/sage-page.js'

/**
 * Ticket 013, the reference surface (US-077~082).
 *
 * The shipped document's own `<script>` runs against the shared page harness, so the card's
 * sentences and its three controls are checked where they actually live.
 */

const workspace = { workspaceId: 'ws-1', title: '经营分析', path: '/Users/someone/project', sessionCount: 0, createdAt: '2026-10-02T00:00:00Z', updatedAt: '2026-10-02T00:00:00Z' }
const workspaces = { source: 'workspace-follow', state: 'read', reason: null, entries: [workspace], order: ['ws-1'], archivedSessions: 0, frames: 1, unapplied: 0 }

const candidates = {
  state: 'read',
  code: null,
  path: 'notes',
  truncated: false,
  entries: [{ name: 'plan.md', path: 'notes/plan.md', bytes: 42 }],
}

const reference = {
  referenceId: 'ref-1',
  workspaceRoot: '/Users/someone/project',
  path: 'notes/plan.md',
  absolutePath: '/Users/someone/project/notes/plan.md',
  version: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  bytes: 42,
  createdAt: '2026-10-02T12:00:00.000Z',
  lastUse: 'unused',
}

const buttons = (row: FakeElement): string[] => row.querySelectorAll('[data-file-action]').map((button) => button.dataset.fileAction ?? '')

describe('the local-reference card', () => {
  it('states the three rules in the card and keeps them visible before any interaction', () => {
    const document = renderSageDocument()
    const card = document.slice(
      document.indexOf('class="sage-card sage-file-references"'),
      document.indexOf('class="sage-card sage-edit-draft-card"'),
    )
    expect(card).toContain('建立引用不读取文件内容')
    expect(card).toContain('版本变了就阻断')
    expect(card).toContain('不会改读新内容，也不会换来源')
    expect(card).toContain('引用记录只存在于本次运行')
    // The only sentence about the source's fate says it is *not* claimed.
    expect(card).not.toMatch(/源文件已删除|文件已删除|已删除源文件/u)
  })

  it('fills the workspace select from the folded list and keeps the chosen one', async () => {
    const harness = await bootSagePage(statePayload({ workspaces }))
    const select = harness.node('file-workspace')
    expect(select.children).toHaveLength(1)
    expect(select.children[0]?.value).toBe('/Users/someone/project')
    expect(select.children[0]?.textContent).toContain('经营分析')

    harness.setPayload(statePayload({ workspaces }))
    await harness.refresh()
    expect(harness.node('file-workspace').children).toHaveLength(1)

    harness.setPayload(statePayload({ workspaces: { ...workspaces, entries: [], order: [] } }))
    await harness.refresh()
    expect(harness.node('file-workspace').children[0]?.textContent).toContain('还没有已采纳的工作区')
  })

  it('posts the workspace root and relative path when listing, and offers 引用此文件 per candidate only', async () => {
    const harness = await bootSagePage(statePayload({ workspaces }))
    const path = harness.node('file-path')
    path.value = 'notes'
    harness.node('file-list').dispatch('click')
    await harness.refresh()
    expect(harness.requests).toEqual([
      { path: '/.sage/workspace/files/candidates', body: { workspaceRoot: '/Users/someone/project', path: 'notes' } },
    ])

    harness.setPayload(statePayload({ workspaces, fileCandidates: candidates }))
    await harness.refresh()
    const rows = harness.node('file-candidates').children
    expect(rows).toHaveLength(1)
    expect(rows[0]?.dataset.candidatePath).toBe('notes/plan.md')
    expect(buttons(rows[0]!)).toEqual(['reference'])
    expect(harness.node('file-note').textContent).toContain('候选 1 个')

    const referenceButton = rows[0]!.querySelector('[data-file-action="reference"]')!
    // The handler is delegated on the list: the event is dispatched there with the button as target.
    harness.node('file-candidates').dispatch('click', { target: referenceButton })
    await harness.refresh()
    expect(harness.requests[1]).toEqual({
      path: '/.sage/workspace/files/reference',
      body: { workspaceRoot: '/Users/someone/project', path: 'notes/plan.md' },
    })
  })

  it('shows the creation version and posts exactly a referenceId when using', async () => {
    const harness = await bootSagePage(statePayload({ workspaces, fileReferences: [reference] }))
    const row = harness.node('file-references').children[0]!
    expect(row.dataset.referenceId).toBe('ref-1')
    expect(row.textContent).toContain('建立时版本 sha256:aaaaa…')
    // Ticket 027 added the second entry point (generate an edit draft from this reference).
    expect(buttons(row)).toEqual(['use', 'draft'])

    const useButton = row.querySelector('[data-file-action="use"]')!
    harness.node('file-references').dispatch('click', { target: useButton })
    await harness.refresh()
    expect(harness.requests).toEqual([{ path: '/.sage/workspace/files/use', body: { referenceId: 'ref-1' } }])
  })

  it('renders a live use as the read page, and a changed source as a block that keeps the old version', async () => {
    const harness = await bootSagePage(statePayload({ workspaces, fileReferences: [reference] }))
    harness.setPayload(statePayload({
      workspaces,
      fileReferences: [{ ...reference, lastUse: 'live' }],
      fileReferenceUse: { state: 'live', code: null, reference: { ...reference, lastUse: 'live' }, text: '第一行\n第二行' },
    }))
    await harness.refresh()
    expect(harness.node('file-use-note').textContent).toContain('已按建立时的版本读取')
    expect(harness.node('file-preview').textContent).toContain('第一行')
    expect(harness.node('file-preview').hidden).toBe(false)

    harness.setPayload(statePayload({
      workspaces,
      fileReferences: [{ ...reference, lastUse: 'stale' }],
      fileReferenceUse: { state: 'stale', code: 'source-changed', reference: { ...reference, lastUse: 'stale' }, text: null },
    }))
    await harness.refresh()
    const note = harness.node('file-use-note').textContent
    expect(note).toContain('源文件在这次取用前发生了变化，内容没有被读取')
    // The blocked sentence still names the version the reference holds, and no preview appears.
    expect(note).toContain('sha256:aaaaa…')
    expect(harness.node('file-preview').hidden).toBe(true)
    expect(harness.node('file-preview').textContent).toBe('')
    expect(harness.node('file-references').children[0]?.textContent).toContain('上次取用：已阻断')
  })

  it('words the unreadable source as an attempt fact, and each refusal from its code', async () => {
    const unreadable = await bootSagePage(statePayload({
      workspaces,
      fileReferences: [{ ...reference, lastUse: 'stale' }],
      fileReferenceUse: { state: 'stale', code: 'source-not-readable', reference: { ...reference, lastUse: 'stale' }, text: null },
    }))
    const note = unreadable.node('file-use-note').textContent
    expect(note).toContain('这次取不到原来的文件')
    expect(note).toContain('这不表示源文件已被删除，也没有改换来源')
    expect(note).not.toMatch(/源文件已删除|文件已删除|已删除源文件/u)

    const cases: Array<[string, string]> = [
      ['file-path-outside-workspace', '不会指向工作区外的文件'],
      ['bridge-file-scope-unavailable', '不伪造会话身份'],
      ['bridge-file-outside-workspace', '在工作区之外'],
      ['bridge-file-not-regular', '不是普通文件'],
      ['bridge-file-not-directory', '不是目录'],
      ['bridge-file-too-large', '超出读取上限'],
      ['bridge-file-not-text', '不是可读的 UTF-8 文本'],
    ]
    for (const [code, phrase] of cases) {
      const harness = await bootSagePage(statePayload({
        workspaces,
        fileCandidates: { state: 'refused', code, entries: [], truncated: false, path: '' },
      }))
      expect(harness.node('file-note').textContent, code).toContain(phrase)
    }
    const unknown = await bootSagePage(statePayload({
      workspaces,
      fileCandidates: { state: 'refused', code: 'brand-new-code', entries: [], truncated: false, path: '' },
    }))
    expect(unknown.node('file-note').textContent).toContain('读取候选时出错')
  })
})

describe('the card before any attempt', () => {
  it('says nothing where nothing was attempted, and still shows the creation version', async () => {
    const harness = await bootSagePage(statePayload({ workspaces, fileReferences: [reference] }))
    // No listing has run: the note may not claim a failure that never happened.
    expect(harness.node('file-note').textContent).toBe('')
    expect(harness.node('file-use-note').textContent).toBe('')
    expect(harness.node('file-preview').hidden).toBe(true)
    expect(harness.node('file-references').children).toHaveLength(1)
  })
})
