// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ResearchView } from '../src/client/ResearchView.tsx'
import { removePlanQuestion, reportExportContent, type EditableQuestion } from '../src/client/research-view-model.ts'
import type { ResearchViewApi } from '../src/client/view-types.ts'
import { zh, type DeepResearchKey } from '../src/client/locales.ts'
import { ResearchEvidenceId, ResearchId, ResearchQuestionId, type ResearchProject } from '../src/types.ts'
import { DEFAULT_THEME_STUDIO_SETTINGS, THEME_IDS } from '../../../platform/dsh-theme-local/src/theme-settings.ts'
import { buildThemeTokenOverrides } from '../../../platform/dsh-theme-local/src/client/theme-tokens.ts'
import { expectModalLayers, materializeClient } from './client-artifact.ts'

const t = (key: DeepResearchKey, params?: Record<string, unknown>) =>
  Object.entries(params ?? {}).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), zh[key])

function project(partial: Partial<ResearchProject> & Pick<ResearchProject, 'id' | 'title' | 'question' | 'phase'>): ResearchProject {
  return {
    goal: '',
    constraints: '',
    seedText: '',
    depth: 'standard',
    planConfirmed: false,
    runState: 'idle',
    questions: [],
    evidence: [],
    conclusions: [],
    limitations: [],
    report: null,
    budget: { maxSearches: 25, maxFetches: 200, searchesUsed: 0, fetchesUsed: 0 },
    progress: { running: 0, waiting: 0, scouts: [] },
    createdAt: 1,
    updatedAt: 1,
    ...partial,
  }
}

function props(api: Partial<ResearchViewApi>): Parameters<typeof ResearchView>[0] {
  return {
    list: vi.fn(async () => []),
    get: vi.fn(async () => null),
    start: vi.fn(),
    updatePlan: vi.fn(),
    confirmPlan: vi.fn(),
    complete: vi.fn(),
    fail: vi.fn(),
    resume: vi.fn(),
    writeReport: vi.fn(),
    delete: vi.fn(),
    subscribeProgress: () => () => undefined,
    ...api,
    t,
  }
}

afterEach(cleanup)

const visualCss = [
  readFileSync(resolve(process.cwd(), 'src/client/overlay.module.css'), 'utf8'),
  readFileSync(resolve(process.cwd(), 'src/client/views.module.css'), 'utf8'),
  readFileSync(resolve(process.cwd(), 'src/client/sidebar-entry.module.css'), 'utf8'),
].join('\n')
const researchViewSource = [
  'ResearchView.tsx',
  'ResearchComposer.tsx',
  'ResearchWorkspace.tsx',
  'research-view-model.ts', // Includes the moved HTML export presentation.
].map(file => readFileSync(resolve(process.cwd(), 'src/client', file), 'utf8')).join('\n')

describe('Deep Research Codex visual contract', () => {
  it('uses the shared canvas, panel, and modal token hierarchy', () => {
    expect(visualCss).toContain('var(--dsw-alias-bg-base)')
    expect(visualCss).toContain('var(--dsw-alias-bg-layer-1)')
    expect(visualCss).toContain('var(--dsw-alias-bg-layer-2)')
    expect(visualCss).toContain('var(--dsw-alias-bg-overlay)')
    expect(visualCss).toContain('var(--dsw-alias-shadow-md)')
    expect(visualCss).not.toMatch(/#[0-9a-f]{3,8}/i)
    expect(visualCss).not.toContain('gradient')
  })

  it('keeps project cards on semantic surfaces in all three themes', () => {
    for (const themeId of THEME_IDS) {
      const tokens = buildThemeTokenOverrides({ ...DEFAULT_THEME_STUDIO_SETTINGS, themeId })
      expect(tokens['--dsw-alias-bg-layer-1']).toEqual({ light: 'var(--sanbao-panel)', dark: 'var(--sanbao-panel)' })
      expect(tokens['--dsw-alias-bg-layer-2']).toEqual({ light: 'var(--sanbao-inset)', dark: 'var(--sanbao-inset)' })
      expect(tokens['--dsw-alias-state-business-primary']).toEqual({ light: 'var(--sanbao-accent)', dark: 'var(--sanbao-accent)' })
      expect(tokens['--dsw-alias-state-business-tertiary']).toEqual({ light: 'var(--sanbao-selected)', dark: 'var(--sanbao-selected)' })
    }
    expect(visualCss).toContain('background: var(--dsw-alias-bg-layer-1)')
    expect(visualCss).toContain('background: var(--dsw-alias-bg-layer-2)')
    expect(visualCss).toContain('var(--dsw-alias-state-business-primary)')
    expect(visualCss).toContain('var(--dsw-alias-state-business-tertiary)')
    expect(researchViewSource).not.toContain(['CARD', 'TONES'].join('_'))
    expect(researchViewSource).not.toContain(['--card', 'tint'].join('-'))
    expect(researchViewSource).not.toMatch(/#[0-9a-f]{3,8}/i)
  })

  it('keeps controls accessible and motion consistent across themes and narrow screens', () => {
    expect(visualCss).toContain('180ms')
    expect(visualCss).toMatch(/:focus-visible/)
    expect(visualCss).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/)
    expect(visualCss).toContain('calc(100vw - 16px)')
    expect(visualCss).toContain('@media (max-width: 620px)')
  })

  it('uses emitted semantic modal layers below the Settings shell', () => {
    const { styles } = materializeClient(readFileSync(resolve(process.cwd(), 'lib/client.js'), 'utf8'))
    expectModalLayers(styles)
    expect(visualCss).toMatch(/z-index:\s*var\(--dsh-deepresearch-modal-layer\)/)
    expect(visualCss).toMatch(/z-index:\s*var\(--dsh-deepresearch-confirm-layer\)/)
    expect(visualCss).not.toMatch(/z-index:\s*(?:100|110)\b/)
  })
})

describe('Deep Research report export', () => {
  const hostileTitle = `</title></h1><script>window.exportInjected = true</script><img onerror="window.exportInjected = true"> & < > " '`
  const hostileReport = `<img onerror='window.exportInjected = true'><script>window.exportInjected = true</script> & &amp; < > " '\nsecond line\n\nlast line`
  const done = project({
    id: ResearchId('export-fixture'), title: hostileTitle, question: 'Question & <text>',
    goal: 'Goal & <text>', phase: 'done', report: hostileReport,
  })

  it('renders hostile HTML title and report as literal text with line breaks', () => {
    const html = reportExportContent(done, [], 'html')
    const doc = new DOMParser().parseFromString(html, 'text/html')
    expect(doc.querySelectorAll('script, img, [onerror], [onload]')).toHaveLength(0)
    expect(doc.querySelector('title')?.textContent).toBe(hostileTitle)
    expect(doc.querySelector('h1')?.textContent).toBe(hostileTitle)
    const body = doc.querySelector('body > div')!
    expect(body.querySelectorAll('*')).toHaveLength(3)
    expect(body.querySelectorAll('br')).toHaveLength(3)
    body.querySelectorAll('br').forEach(br => br.replaceWith('\n'))
    expect(body.textContent).toBe(hostileReport)
    for (const entity of ['&amp;', '&lt;', '&gt;', '&quot;', '&#39;']) expect(html).toContain(entity)
  })

  it('keeps Markdown and mindmap exports literal and unchanged', () => {
    expect(reportExportContent(done, [], 'md')).toBe(`# ${hostileTitle}\n\n${hostileReport}\n\n## 引用来源与证据链\n`)
    expect(reportExportContent(done, [], 'mindmap')).toBe(`# ${hostileTitle}\n## 核心目标\n- Goal & <text>\n## 调研子课题\n`)
  })
})

describe('Deep Research view', () => {
  it('submits an editable starter plan through the mounted API', async () => {
    const start = vi.fn<ResearchViewApi['start']>(() => new Promise<never>(() => undefined))
    const api = { list: vi.fn(async () => []), start }

    render(<ResearchView {...props(api)} />)
    fireEvent.click((await screen.findAllByRole('button', { name: /发起研究/ }))[0]!)
    fireEvent.change(screen.getByPlaceholderText('你想深入研究什么？'), { target: { value: '验证插件是否可运行' } })
    fireEvent.click(screen.getByRole('button', { name: '创建研究计划' }))

    await waitFor(() => { expect(start).toHaveBeenCalledOnce() })
    expect(start.mock.calls[0]?.[0]).toMatchObject({ question: '验证插件是否可运行', questions: [] })
  })

  it('saves and starts the private research runner', async () => {
    const draft = project({
      id: ResearchId('research-ui-flow'),
      title: '🔬 验证深度研究',
      question: 'DSH 插件如何完成深度研究？',
      goal: '给出有来源的结论',
      constraints: '优先官方来源',
      phase: 'awaiting_plan_confirm',
      questions: [{
        id: ResearchQuestionId('rq-1'), text: '核对运行链路', dependsOn: [], status: 'pending', gaps: [], handoff: '',
        criteria: [{ id: 'c1.1', text: '至少两个来源', status: 'missing', summary: '', gap: '', warning: '', verification: '', toolCount: 0 }],
      }],
    })
    const saved = { ...draft, updatedAt: 2 }
    const confirmed = { ...saved, phase: 'investigating' as const, planConfirmed: true, updatedAt: 3 }
    const api = {
      list: vi.fn(async () => [draft]), get: vi.fn(async () => confirmed),
      updatePlan: vi.fn(async () => saved), confirmPlan: vi.fn(async () => confirmed),
      start: vi.fn(), complete: vi.fn(), fail: vi.fn(), delete: vi.fn(),
    } 

    render(<ResearchView {...props(api)} />)
    fireEvent.click(await screen.findByRole('button', { name: '打开研究：🔬 验证深度研究' }))
    fireEvent.click(screen.getByRole('button', { name: '确认并开始' }))

    await waitFor(() => { expect(api.confirmPlan).toHaveBeenCalledOnce() })
    expect(api.updatePlan).toHaveBeenCalledOnce()
    expect(api.confirmPlan).toHaveBeenCalledWith(ResearchId('research-ui-flow'))
    expect(await screen.findByText('调查看板')).toBeTruthy()
  })

  it('shows depth on the plan page and names upstream dependencies', async () => {
    const draft = project({
      id: ResearchId('research-plan-deps'),
      title: '🔬 计划依赖',
      question: '依赖链如何展示？',
      goal: '核对依赖芯片',
      constraints: '只在创建时填写',
      depth: 'deep',
      phase: 'awaiting_plan_confirm',
      questions: [
        {
          id: ResearchQuestionId('rq-1'), text: '上游基线', dependsOn: [], status: 'pending', gaps: [], handoff: '',
          criteria: [{ id: 'c1.1', text: '先收齐事实', status: 'missing', summary: '', gap: '', warning: '', verification: '', toolCount: 0 }],
        },
        {
          id: ResearchQuestionId('rq-2'), text: '下游深挖', dependsOn: [ResearchQuestionId('rq-1')], status: 'pending', gaps: [], handoff: '',
          criteria: [{ id: 'c2.1', text: '基于上游结论', status: 'missing', summary: '', gap: '', warning: '', verification: '', toolCount: 0 }],
        },
      ],
    })
    const api = {
      list: vi.fn(async () => [draft]), get: vi.fn(async () => draft),
      updatePlan: vi.fn(), confirmPlan: vi.fn(), delete: vi.fn(),
    } 

    render(<ResearchView {...props(api)} />)
    fireEvent.click(await screen.findByRole('button', { name: '打开研究：🔬 计划依赖' }))
    expect(screen.getByText('研究深度 · 深入')).toBeTruthy()
    expect(screen.getByText('依赖')).toBeTruthy()
    expect(screen.getByText('需先完成 01 · 上游基线')).toBeTruthy()
    expect(screen.queryByDisplayValue('只在创建时填写')).toBeNull()
  })

  it('removes a plan question without mutating the original questions or dependency arrays', () => {
    const questions: EditableQuestion[] = [
      { text: 'A', criteria: ['A'], dependsOn: [] },
      { text: 'B', criteria: ['B'], dependsOn: [0] },
      { text: 'C', criteria: ['C'], dependsOn: [0, 1] },
      { text: 'D', criteria: ['D'] },
    ]
    const before = structuredClone(questions)
    for (const question of questions) { Object.freeze(question.dependsOn); Object.freeze(question) }
    Object.freeze(questions)
    const remaining = removePlanQuestion(questions, 0)
    expect(questions).toEqual(before)
    expect(remaining).toEqual([
      { text: 'B', criteria: ['B'], dependsOn: [] },
      { text: 'C', criteria: ['C'], dependsOn: [0] },
      { text: 'D', criteria: ['D'] },
    ])
    expect(remaining[1]?.dependsOn).not.toBe(questions[2]?.dependsOn)
  })

  it.each([
    { removed: 'A', index: 0, input: ['A', 'B', 'C'], surviving: ['B', 'C'], dependencies: [[], [0]] },
    { removed: 'B', index: 1, input: ['A', 'B', 'C'], surviving: ['A', 'C'], dependencies: [[], []] },
    { removed: 'D', index: 3, input: ['A', 'B', 'C', 'D'], surviving: ['A', 'B', 'C'], dependencies: [[], [], [1]] },
  ])('deleting plan question $removed preserves dependency targets in the submitted plan', async ({ removed, index, input, surviving, dependencies }) => {
    const draft = project({
      id: ResearchId('plan-delete-fixture'), title: 'Editable plan', question: 'Question', goal: 'Goal',
      phase: 'awaiting_plan_confirm',
      questions: input.map(text => ({
        id: ResearchQuestionId(text), text, dependsOn: text === 'C' ? [ResearchQuestionId('B')] : [],
        status: 'pending', gaps: [], handoff: '',
        criteria: [{ id: text, text: `Verify ${text}`, status: 'missing', summary: '', gap: '', warning: '', verification: '', toolCount: 0 }],
      })),
    })
    const updatePlan = vi.fn<ResearchViewApi['updatePlan']>(() => new Promise<never>(() => undefined))
    render(<ResearchView {...props({ list: async () => [draft], get: async () => draft, updatePlan })} />)
    fireEvent.click(await screen.findByRole('button', { name: '打开研究：Editable plan' }))
    const questionRow = screen.getByDisplayValue(removed).closest('section')!
    fireEvent.click(within(questionRow).getByRole('button', { name: t('plan.removeQuestion') }))
    fireEvent.click(screen.getByRole('button', { name: t('action.saveChanges') }))
    await waitFor(() => expect(updatePlan).toHaveBeenCalledOnce())
    expect(updatePlan.mock.calls[0]?.[0]).toEqual({
      id: draft.id, goal: draft.goal, constraints: draft.constraints, depth: draft.depth,
      questions: surviving.map((text, i) => ({ text, criteria: [`Verify ${text}`], dependsOn: dependencies[i] })),
    })
    if (index === 1) expect(screen.queryByText(/需先完成/)).toBeNull()
    else expect(screen.getByText(`需先完成 ${index === 0 ? '01' : '02'} · B`)).toBeTruthy()
  })

  it('keeps plan and investigate tabs reachable on completed projects', async () => {
    const done = project({
      id: ResearchId('research-done'),
      title: '🔬 已完成研究',
      question: '已完成？',
      goal: '目标',
      phase: 'done',
      planConfirmed: true,
      updatedAt: 2,
      questions: [{
        id: ResearchQuestionId('rq-1'), text: '子问题', dependsOn: [], status: 'covered', gaps: [], handoff: '',
        criteria: [{ id: 'c1.1', text: '标准', status: 'covered', summary: '', gap: '', warning: '', verification: 'PASS', toolCount: 3 }],
      }],
      evidence: [{
        id: ResearchEvidenceId('e1'), questionId: ResearchQuestionId('rq-1'), criterionIds: ['c1.1'],
        source: 'https://example.test/hooks-guide', claim: '类组件可按清单迁到 Hooks。', snippet: '片段',
        url: 'https://example.test/hooks-guide',
        sources: [
          { url: 'https://example.test/hooks-guide', snippet: '片段' },
          { url: 'https://example.test/hooks-guide', snippet: '重复' },
        ],
        confidence: 'high', status: 'accepted', createdAt: 1,
      }],
      limitations: ['权威页只落了页头，无法逐字复核。'],
      report: '# 综合报告\n\n这是摘要。',
      budget: { maxSearches: 25, maxFetches: 200, searchesUsed: 1, fetchesUsed: 1 },
    })
    const api = { list: vi.fn(async () => [done]), get: vi.fn(async () => done), delete: vi.fn() }

    render(<ResearchView {...props(api)} />)
    fireEvent.click(await screen.findByRole('button', { name: '打开研究：🔬 已完成研究' }))
    expect(screen.getByRole('button', { name: '3 报告' }).getAttribute('data-active')).toBe('true')
    expect(screen.getByRole('heading', { level: 3, name: '综合报告' })).toBeTruthy()
    expect(screen.queryByText('# 综合报告')).toBeNull()
    expect(screen.queryByText('限制与未解决问题')).toBeNull()
    expect(screen.queryByText('打开来源')).toBeNull()
    expect(screen.getByRole('heading', { name: /来源/ })).toBeTruthy()
    expect(screen.getAllByText('example.test').length).toBeGreaterThan(0)
    expect(screen.getByText('高')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '1 计划' }))
    expect(screen.getByRole('button', { name: '1 计划' }).getAttribute('data-active')).toBe('true')
    expect(screen.getByText('研究计划')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '2 调查' }))
    expect(screen.getByRole('button', { name: '2 调查' }).getAttribute('data-active')).toBe('true')
    expect(screen.getByText('调查看板')).toBeTruthy()
    expect(screen.getByText('限制与未解决问题')).toBeTruthy()
    expect(screen.getByText('权威页只落了页头，无法逐字复核。')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '深度研究' }))
    expect(screen.getByRole('heading', { name: '研究资料库' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '返回对话' })).toBeNull()
  })

  it('restores a project from the overlay route and returns to the library one layer at a time', async () => {
    const done = project({
      id: ResearchId('research-route'),
      title: '🔬 路由恢复',
      question: '刷新后还在吗？',
      phase: 'done',
      planConfirmed: true,
      updatedAt: 2,
      questions: [{
        id: ResearchQuestionId('rq-1'), text: '子问题', dependsOn: [], status: 'covered', gaps: [], handoff: '',
        criteria: [{ id: 'c1.1', text: '标准', status: 'covered', summary: '', gap: '', warning: '', verification: 'PASS', toolCount: 2 }],
      }],
      report: '报告正文',
      budget: { maxSearches: 25, maxFetches: 200, searchesUsed: 1, fetchesUsed: 1 },
    })
    const onSelectProject = vi.fn()
    const onClose = vi.fn()
    const api = { list: vi.fn(async () => [done]), get: vi.fn(async () => done), delete: vi.fn() }

    render(<ResearchView {...props(api)} projectId={done.id} onSelectProject={onSelectProject} onClose={onClose} />)
    expect(await screen.findByRole('button', { name: '深度研究' })).toBeTruthy()
    expect(screen.queryByText('返回对话')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '深度研究' }))
    expect(onSelectProject).toHaveBeenCalledWith(null)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('keeps a failed planning run on the plan step and shows its runner error', async () => {
    const failed = project({
      id: ResearchId('research-plan-failed'),
      title: '🔬 失败计划',
      question: '为什么失败？',
      phase: 'failed',
      updatedAt: 2,
      limitations: ['Runner failed: prompt variable "{{cwd}}" has no value'],
    })
    const api = { list: vi.fn(async () => [failed]), get: vi.fn(async () => failed), delete: vi.fn() }

    render(<ResearchView {...props(api)} />)
    fireEvent.click(await screen.findByRole('button', { name: '打开研究：🔬 失败计划' }))

    expect(screen.getByRole('button', { name: '1 计划' }).getAttribute('data-active')).toBe('true')
    expect(screen.getByRole('button', { name: '2 调查' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByText('研究计划生成失败')).toBeTruthy()
    expect(screen.getByText(/prompt variable/)).toBeTruthy()
  })

  it('renders waiting questions and live Scout cards from progress', async () => {
    const investigating = project({
      id: ResearchId('research-live'),
      title: '🔬 调查中',
      question: '回放如何取证？',
      goal: '有来源的结论',
      phase: 'investigating',
      runState: 'running',
      planConfirmed: true,
      questions: [
        {
          id: ResearchQuestionId('rq-1'), text: '事件契约', dependsOn: [], status: 'running', gaps: [], handoff: '',
          criteria: [{ id: 'c1.1', text: '找出输入', status: 'missing', summary: '', gap: '', warning: '', verification: '', toolCount: 2 }],
        },
        {
          id: ResearchQuestionId('rq-2'), text: '渲染对比', dependsOn: [ResearchQuestionId('rq-1')], status: 'pending', gaps: ['等上游'], handoff: '',
          criteria: [{ id: 'c2.1', text: '比较回放', status: 'missing', summary: '', gap: '等上游', warning: '', verification: '', toolCount: 0 }],
        },
      ],
      progress: {
        running: 1,
        waiting: 1,
        scouts: [
          {
            questionId: ResearchQuestionId('rq-1'), role: 'scout', status: 'running', waitingOn: [], toolsUsed: 2, toolsCap: 10,
            activity: 'Search: replay contract', tools: [{ name: 'research_web_search', detail: 'replay contract', status: 'done' }],
            scoutDraft: 'Searching…', evaluatorDraft: '', activeCriterionId: 'c1.1', activeCriterionText: '找出输入', dependencySummary: '', handoff: '',
          },
          {
            questionId: ResearchQuestionId('rq-2'), role: 'waiting', status: 'waiting', waitingOn: [ResearchQuestionId('rq-1')], toolsUsed: 0, toolsCap: 10,
            activity: 'Waiting on upstream sub-questions.', tools: [],
            scoutDraft: '', evaluatorDraft: '', activeCriterionId: '', activeCriterionText: '', dependencySummary: '', handoff: '',
          },
        ],
      },
    })
    const api = {
      list: vi.fn(async () => [investigating]), get: vi.fn(async () => investigating), fail: vi.fn(),
    } 

    render(<ResearchView {...props(api)} />)
    fireEvent.click(await screen.findByRole('button', { name: '打开研究：🔬 调查中' }))
    expect(screen.getByText(/调查进行中/)).toBeTruthy()
    expect(screen.getAllByText('等待依赖').length).toBeGreaterThan(0)
    expect(screen.getAllByText('事件契约').length).toBeGreaterThan(0)
    expect(screen.getAllByText('渲染对比').length).toBeGreaterThan(0)
    expect(screen.getByText(/等待上游/)).toBeTruthy()
    expect(screen.getByText('搜索')).toBeTruthy()
    expect(screen.getAllByText(/replay contract/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/2\/10/).length).toBeGreaterThan(0)
    expect(screen.getAllByText('找出输入').length).toBeGreaterThan(0)
    expect(screen.getAllByText('未覆盖').length).toBeGreaterThan(0)
    expect(screen.getByText('比较回放')).toBeTruthy()
    expect(screen.queryByText('等待上游子问题')).toBeNull()
  })

  it('asks for confirmation before deleting from the library card', async () => {
    const draft = project({
      id: ResearchId('research-delete-card'),
      title: '🔬 待删除',
      question: '要删掉吗？',
      phase: 'done',
      planConfirmed: true,
    })
    const api = {
      list: vi.fn(async () => [draft]),
      get: vi.fn(async () => draft),
      delete: vi.fn(async () => ({ ok: true })),
    } 

    render(<ResearchView {...props(api)} />)
    fireEvent.click(await screen.findByRole('button', { name: '删除' }))
    const dialog = screen.getByRole('dialog', { name: '删除研究' })
    expect(dialog).toBeTruthy()
    expect(dialog.textContent).toContain('「待删除」会从资料库里永久移除，包括计划和证据。')
    expect(api.delete).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.queryByRole('dialog', { name: '删除研究' })).toBeNull()
    expect(api.delete).not.toHaveBeenCalled()
  })

  it('deletes a project after confirmation from the workspace header', async () => {
    const draft = project({
      id: ResearchId('research-delete-workspace'),
      title: '🔬 工作区删除',
      question: '确认后删除',
      phase: 'done',
      planConfirmed: true,
      report: '报告',
    })
    const api = {
      list: vi.fn(async () => [draft]),
      get: vi.fn(async () => draft),
      delete: vi.fn(async () => ({ ok: true })),
    } 

    render(<ResearchView {...props(api)} />)
    fireEvent.click(await screen.findByRole('button', { name: '打开研究：🔬 工作区删除' }))
    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    fireEvent.click(screen.getAllByRole('button', { name: '删除' }).at(-1)!)

    await waitFor(() => { expect(api.delete).toHaveBeenCalledWith(ResearchId('research-delete-workspace')) })
    expect(await screen.findByRole('heading', { name: '研究资料库' })).toBeTruthy()
  })

  it('opens investigating projects when scout rows omit nested arrays', async () => {
    const investigating = project({
      id: ResearchId('research-scout-partial'),
      title: '🔬 Scout 缺字段',
      question: 'scout.tools 缺失还能打开吗？',
      phase: 'investigating',
      planConfirmed: true,
      questions: [{
        id: ResearchQuestionId('rq-1'), text: '子问题', dependsOn: [], status: 'running',
        criteria: [{ id: 'c1.1', text: '标准', status: 'missing', summary: '', gap: '', warning: '', verification: '', toolCount: 0 }],
      }],
      progress: {
        running: 1,
        waiting: 0,
        scouts: [{
          questionId: ResearchQuestionId('rq-1'),
          role: 'scout',
          status: 'running',
          waitingOn: [],
          toolsUsed: 1,
          toolsCap: 10,
          activity: 'Search',
        } as ResearchProject['progress']['scouts'][number]],
      },
    })
    const api = { list: vi.fn(async () => [investigating]), get: vi.fn(async () => investigating) }

    render(<ResearchView {...props(api)} />)
    fireEvent.click(await screen.findByRole('button', { name: '打开研究：🔬 Scout 缺字段' }))
    expect(screen.getByText('调查看板')).toBeTruthy()
    expect(screen.getByText('Search')).toBeTruthy()
  })

  it('opens investigating projects when progress is omitted entirely', async () => {
    const investigating = project({
      id: ResearchId('research-no-progress'),
      title: '🔬 调查缺字段',
      question: 'progress 被剥掉还能打开吗？',
      phase: 'investigating',
      planConfirmed: true,
      questions: [{
        id: ResearchQuestionId('rq-1'), text: '子问题', dependsOn: [], status: 'running',
        criteria: [{ id: 'c1.1', text: '标准', status: 'missing', summary: '', gap: '', warning: '', verification: '', toolCount: 0 }],
      }],
    })
    const stripped = { ...investigating, progress: undefined, questions: investigating.questions.map(item => ({ ...item, gaps: undefined })) } as unknown as ResearchProject
    const api = { list: vi.fn(async () => [stripped]), get: vi.fn(async () => stripped) }

    render(<ResearchView {...props(api)} />)
    fireEvent.click(await screen.findByRole('button', { name: '打开研究：🔬 调查缺字段' }))
    expect(screen.getByText('调查看板')).toBeTruthy()
    expect(screen.getAllByText(/子问题/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/0\/10 工具/).length).toBeGreaterThan(0)
  })

  it('surfaces partial and rejected criteria as live limitations', async () => {
    const investigating = project({
      id: ResearchId('research-limitations'),
      title: '🔬 限制呈现',
      question: '未完全覆盖怎么记？',
      phase: 'investigating',
      planConfirmed: true,
      questions: [{
        id: ResearchQuestionId('rq-1'), text: '事件契约', dependsOn: [], status: 'partial', gaps: [], handoff: '',
        criteria: [
          { id: 'c1.1', text: '找出输入', status: 'covered', summary: '日志驱动界面', gap: '', warning: '', verification: 'PASS', toolCount: 2 },
          { id: 'c1.2', text: '第二来源', status: 'partial', summary: '', gap: '缺第二来源', warning: '', verification: 'WARNING', toolCount: 4 },
          { id: 'c1.3', text: '排除过期文档', status: 'blocked', summary: '', gap: '', warning: '', verification: 'FAIL', toolCount: 3 },
          { id: 'c1.4', text: '还在查', status: 'missing', summary: '', gap: '', warning: '', verification: '', toolCount: 0 },
        ],
      }],
    })
    const api = { list: vi.fn(async () => [investigating]), get: vi.fn(async () => investigating) }

    render(<ResearchView {...props(api)} />)
    fireEvent.click(await screen.findByRole('button', { name: '打开研究：🔬 限制呈现' }))
    expect(screen.getByText('限制与未解决问题')).toBeTruthy()
    expect(screen.getAllByText('部分覆盖').length).toBeGreaterThan(0)
    expect(screen.getAllByText('受阻').length).toBeGreaterThan(0)
    expect(screen.getByText('缺第二来源')).toBeTruthy()
    expect(screen.getByText('核验未通过，该标准被拒绝。')).toBeTruthy()
    expect(screen.queryByText('该标准仍未覆盖。')).toBeNull()
  })
})
