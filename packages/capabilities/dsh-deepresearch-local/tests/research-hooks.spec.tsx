// @vitest-environment jsdom

import { useCallback, useState } from 'react'
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useResearchLibrary } from '../src/client/use-research-library.ts'
import { useReportExport, useResearchWorkspace } from '../src/client/use-research-workspace.ts'
import type { ResearchViewApi } from '../src/client/view-types.ts'
import { ResearchId, ResearchQuestionId, type ResearchProject } from '../src/types.ts'

const t = (key: string) => key

function project(patch: Partial<ResearchProject> = {}): ResearchProject {
  return {
    id: ResearchId('research-a'), title: 'Alpha', question: 'Which evidence?',
    goal: 'Original goal', constraints: 'Official sources', seedText: '', depth: 'standard',
    phase: 'awaiting_plan_confirm', planConfirmed: false, runState: 'idle',
    questions: [{
      id: ResearchQuestionId('q-a'), text: 'First question', dependsOn: [], status: 'pending', gaps: [], handoff: '',
      criteria: [{ id: 'c-a', text: 'Two sources', status: 'missing', summary: '', gap: '', warning: '', verification: '', toolCount: 0 }],
    }],
    evidence: [], conclusions: [], limitations: [], report: null,
    budget: { maxSearches: 25, maxFetches: 200, searchesUsed: 0, fetchesUsed: 0 },
    progress: { running: 0, waiting: 0, scouts: [] }, createdAt: 1, updatedAt: 10,
    ...patch,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

// Only the remote boundary is doubled: hooks, React state, hydration and timers are real.
function api(patch: Partial<ResearchViewApi> = {}): ResearchViewApi {
  const unexpected = async (): Promise<never> => { throw new Error('Unexpected remote operation') }
  return {
    list: async () => [], get: async () => null, start: unexpected, updatePlan: unexpected,
    confirmPlan: unexpected, complete: unexpected, fail: unexpected, resume: unexpected,
    writeReport: unexpected, delete: unexpected, subscribeProgress: () => () => undefined,
    ...patch,
  }
}

async function tick(ms = 0) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms) })
}

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('useReportExport', () => {
  it('copies report text and clears the success notice after 3000ms', async () => {
    const writeText = vi.fn(async () => undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const { result } = renderHook(() => useReportExport({ project: project({ report: 'Report body' }), accepted: [], t }))
    act(() => { result.current.handleExport('md') })
    await act(async () => {})
    expect(writeText).toHaveBeenCalledExactlyOnceWith('# Alpha\n\nReport body\n\n## 引用来源与证据链\n')
    expect(result.current.copyNotice).toBe('report.exportSuccess')
    await tick(2999)
    expect(result.current.copyNotice).toBe('report.exportSuccess')
    await tick(1)
    expect(result.current.copyNotice).toBeNull()
  })

  it('does not report clipboard rejection as success', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: async () => { throw new Error('Clipboard denied') } } })
    const { result } = renderHook(() => useReportExport({ project: project({ report: 'Report body' }), accepted: [], t }))
    act(() => { result.current.handleExport('mindmap') })
    await act(async () => {})
    expect(result.current.copyNotice).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not copy when no report exists', () => {
    const writeText = vi.fn(async () => undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const { result } = renderHook(() => useReportExport({ project: project(), accepted: [], t }))
    act(() => { result.current.handleExport('html') })
    expect(writeText).not.toHaveBeenCalled()
    expect(result.current.copyNotice).toBeNull()
  })
})

describe('useResearchLibrary', () => {
  it('debounces search for 250ms, cancels superseded timers and reads the latest API', async () => {
    const queries: string[] = []
    const first = api({ list: async query => { queries.push(`first:${query}`); return [project()] } })
    const second = api({ list: async query => { queries.push(`second:${query}`); return [project({ title: 'Search result' })] } })
    const { result, rerender, unmount } = renderHook(({ remote }) => useResearchLibrary({ api: remote, t }), { initialProps: { remote: first } })
    await tick()
    expect(result.current.visible.map(item => item.title)).toEqual(['Alpha'])
    act(() => { result.current.setQuery('a') })
    await tick(249)
    expect(queries).toEqual(['first:'])
    act(() => { result.current.setQuery('ab') })
    rerender({ remote: second })
    await tick(249)
    expect(result.current.visible[0]?.title).toBe('Alpha')
    await tick(1)
    expect(queries).toEqual(['first:', 'second:ab'])
    expect(result.current.visible[0]?.title).toBe('Search result')
    act(() => { result.current.setQuery('cancelled') })
    unmount()
    await tick(250)
    expect(queries).toEqual(['first:', 'second:ab'])
  })

  it('stops automatic library searching while a project is selected', async () => {
    const list = vi.fn(async () => [project()])
    const { result } = renderHook(() => useResearchLibrary({ api: api({ list }), t }))
    await tick()
    act(() => { result.current.openProject(project()); result.current.setQuery('later') })
    await tick(500)
    expect(list).toHaveBeenCalledTimes(1)
    act(() => { result.current.openProject(null) })
    await tick(250)
    expect(list).toHaveBeenLastCalledWith('later')
    expect(result.current.visible).toHaveLength(1)
  })

  it('refreshes selected data only for strictly newer list timestamps', async () => {
    let rows = [project()]
    const remote = api({ list: async () => rows })
    const { result } = renderHook(() => useResearchLibrary({ api: remote, t }))
    await tick()
    act(() => { result.current.openProject(project()) })
    const original = result.current.selected
    for (const updatedAt of [9, 10]) {
      rows = [project({ updatedAt, title: 'Not newer' })]
      await act(async () => { await result.current.refresh('') })
      expect(result.current.selected).toBe(original)
    }
    rows = [project({ updatedAt: 11, title: 'Newer' })]
    await act(async () => { await result.current.refresh('') })
    expect(result.current.selected?.title).toBe('Newer')
    rows = []
    await act(async () => { await result.current.refresh('') })
    expect(result.current.selected?.title).toBe('Newer')
  })

  it('retains selected identity on equal update timestamps but updates the library row', async () => {
    const remote = api({ list: async () => [project()] })
    const { result } = renderHook(() => useResearchLibrary({ api: remote, t }))
    await tick()
    act(() => { result.current.openProject(project()) })
    const original = result.current.selected
    act(() => { result.current.updateSelected(project({ title: 'Same timestamp' })) })
    expect(result.current.selected).toBe(original)
    expect(result.current.visible[0]?.title).toBe('Same timestamp')
    act(() => { result.current.updateSelected(project({ title: 'Older push', updatedAt: 9 })) })
    expect(result.current.selected?.title).toBe('Older push')
  })

  it('filters phase groups and sorts without changing the library order', async () => {
    const remote = api({ list: async () => [
      project({ title: 'Zulu', phase: 'planning' }),
      project({ id: ResearchId('research-b'), title: 'Beta', phase: 'writing', updatedAt: 20 }),
      project({ id: ResearchId('research-c'), title: 'Alpha', phase: 'incomplete', updatedAt: 30 }),
    ] })
    const { result } = renderHook(() => useResearchLibrary({ api: remote, t }))
    await tick()
    expect(result.current.visible.map(item => item.title)).toEqual(['Alpha', 'Beta', 'Zulu'])
    act(() => { result.current.setFilter('investigating') })
    expect(result.current.visible.map(item => item.title)).toEqual(['Beta'])
    act(() => { result.current.setFilter('done') })
    expect(result.current.visible.map(item => item.title)).toEqual(['Alpha'])
    act(() => { result.current.setFilter('planning') })
    expect(result.current.visible.map(item => item.title)).toEqual(['Zulu'])
    act(() => { result.current.setFilter('all'); result.current.setSort('title') })
    expect(result.current.visible.map(item => item.title)).toEqual(['Alpha', 'Beta', 'Zulu'])
    expect(result.current.projects.map(item => item.title)).toEqual(['Zulu', 'Beta', 'Alpha'])
  })

  it('ignores a superseded route result and clears loading when the route returns to the library', async () => {
    const a = deferred<ResearchProject | null>()
    const b = deferred<ResearchProject | null>()
    const remote = api({ get: id => id === 'research-a' ? a.promise : b.promise })
    const { result, rerender } = renderHook(({ id }: { id: string | null }) => useResearchLibrary({ api: remote, t, projectId: id }), { initialProps: { id: 'research-a' as string | null } })
    expect(result.current.projectLoading).toBe(true)
    rerender({ id: 'research-b' })
    await act(async () => { a.resolve(project()) })
    expect(result.current.selected).toBeNull()
    expect(result.current.projectLoading).toBe(true)
    rerender({ id: null })
    await act(async () => { b.reject(new Error('Late route failure')) })
    expect(result.current.selected).toBeNull()
    expect(result.current.projectLoading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('shows route misses and request failures without leaving loading stuck', async () => {
    const remote = api({ get: async id => { if (id === 'missing') return null; throw new Error('Offline') } })
    const { result, rerender } = renderHook(({ id }) => useResearchLibrary({ api: remote, t, projectId: id }), { initialProps: { id: 'missing' } })
    await act(async () => {})
    expect(result.current.error).toBe('empty.noMatch')
    expect(result.current.projectLoading).toBe(false)
    rerender({ id: 'broken' })
    await act(async () => {})
    expect(result.current.error).toBe('Offline')
    expect(result.current.projectLoading).toBe(false)
  })

  it('prefers a listed route project without replacing a fresher selection', async () => {
    const get = vi.fn(async () => null)
    let rows = [project()]
    const remote = api({ get, list: async () => rows })
    const { result, rerender } = renderHook(({ id }: { id?: string }) => useResearchLibrary({ api: remote, t, projectId: id }), { initialProps: {} })
    await tick()
    act(() => { result.current.openProject(project({ updatedAt: 30, title: 'Fresh selection' })) })
    rerender({ id: 'research-a' })
    expect(result.current.selected?.title).toBe('Fresh selection')
    rows = [project({ updatedAt: 31, title: 'Fresh list' })]
    await act(async () => { await result.current.refresh('') })
    expect(result.current.selected?.title).toBe('Fresh list')
    expect(get).not.toHaveBeenCalled()
  })

  it('retains the delete dialog and selection on failure, then deletes and refreshes on retry', async () => {
    const removal = deferred<{ deleted: boolean }>()
    const remove = vi.fn<ResearchViewApi['delete']>(() => removal.promise)
    let rows = [project()]
    const onSelectProject = vi.fn()
    const remote = api({ list: async () => rows, delete: remove })
    const { result } = renderHook(() => useResearchLibrary({ api: remote, t, onSelectProject }))
    await tick()
    act(() => { result.current.openProject(project()); result.current.requestDelete({ id: ResearchId('research-a'), title: 'Alpha' }) })
    act(() => { void result.current.confirmDelete() })
    expect(result.current.deleteBusy).toBe(true)
    await act(async () => { await result.current.confirmDelete() })
    expect(remove).toHaveBeenCalledTimes(1)
    await act(async () => { removal.reject(new Error('Delete denied')) })
    expect(result.current.error).toBe('Delete denied')
    expect(result.current.deleteBusy).toBe(false)
    expect(result.current.pendingDelete?.title).toBe('Alpha')
    expect(result.current.selected?.id).toBe('research-a')
    rows = []
    remove.mockResolvedValue({ deleted: true })
    await act(async () => { await result.current.confirmDelete() })
    expect(result.current.selected).toBeNull()
    expect(result.current.pendingDelete).toBeNull()
    expect(result.current.visible).toEqual([])
    expect(result.current.error).toBeNull()
    expect(onSelectProject).toHaveBeenLastCalledWith(null)
  })

  it('creates through start, closes the composer, refreshes the query, then selects the returned project', async () => {
    const started = deferred<ResearchProject>()
    const queries: string[] = []
    const remote = api({ start: () => started.promise, list: async query => { queries.push(query); return [] } })
    const { result } = renderHook(() => useResearchLibrary({ api: remote, t }))
    act(() => { result.current.setComposerOpen(true); result.current.setQuery('Alpha') })
    let creating!: Promise<void>
    act(() => { creating = result.current.createProject({ question: 'Which evidence?', goal: '', constraints: '', seedText: '', depth: 'standard', questions: [] }) })
    expect(result.current.composerOpen).toBe(true)
    await act(async () => { started.resolve(project()); await creating })
    expect(result.current.composerOpen).toBe(false)
    expect(result.current.selected?.id).toBe('research-a')
    expect(queries).toEqual(['Alpha'])
  })
})

function workspace(remote: ResearchViewApi, initial = project()) {
  const changes = vi.fn()
  const hook = renderHook(({ remote }) => {
    const [current, setCurrent] = useState(initial)
    const [error, setError] = useState<string | null>('Old error')
    const onChange = useCallback((next: ResearchProject) => { changes(next); setCurrent(next) }, [])
    const state = useResearchWorkspace({ project: current, api: remote, t, onChange, setError })
    return { ...state, current, error }
  }, { initialProps: { remote } })
  return { ...hook, changes }
}

describe('useResearchWorkspace', () => {
  it('subscribes to matching changed timestamps, replaces subscriptions and ignores disposed listeners', () => {
    const listeners: Array<(next: ResearchProject) => void> = []
    const active = new Set<(next: ResearchProject) => void>()
    const subscribeProgress = (listener: (next: ResearchProject) => void) => {
      listeners.push(listener); active.add(listener)
      return () => { active.delete(listener) }
    }
    const { result, rerender, unmount } = workspace(api({ subscribeProgress }))
    const first = listeners[0]!
    act(() => { first(project({ id: ResearchId('other'), updatedAt: 11 })); first(project({ title: 'Equal timestamp' })) })
    expect(result.current.current.title).toBe('Alpha')
    act(() => { first(project({ title: 'Changed', updatedAt: 11 })) })
    expect(result.current.current.title).toBe('Changed')
    rerender({ remote: api({ subscribeProgress: listener => subscribeProgress(listener) }) })
    expect(active.size).toBe(1)
    act(() => { first(project({ title: 'Disposed', updatedAt: 12 })) })
    expect(result.current.current.title).toBe('Changed')
    act(() => { listeners.at(-1)!(project({ title: 'Older but different', updatedAt: 9 })) })
    expect(result.current.current.title).toBe('Older but different')
    unmount()
    expect(active.size).toBe(0)
  })

  it('polls running projects immediately and every 2500ms without overlapping a pending request', async () => {
    const pending = deferred<ResearchProject | null>()
    const get = vi.fn<ResearchViewApi['get']>(() => pending.promise)
    const { result, unmount, changes } = workspace(api({ get }), project({ runState: 'running' }))
    expect(get).toHaveBeenCalledTimes(1)
    await tick(7500)
    expect(get).toHaveBeenCalledTimes(1)
    await act(async () => { pending.resolve(null) })
    await tick(2499)
    expect(get).toHaveBeenCalledTimes(1)
    const late = deferred<ResearchProject | null>()
    get.mockImplementation(() => late.promise)
    await tick(1)
    expect(get).toHaveBeenCalledTimes(2)
    expect(get).toHaveBeenLastCalledWith(ResearchId('research-a'))
    expect(result.current.current.title).toBe('Alpha')
    unmount()
    await act(async () => { late.resolve(project({ updatedAt: 11, title: 'Late after unmount' })) })
    await tick(10000)
    expect(changes).not.toHaveBeenCalled()
    expect(get).toHaveBeenCalledTimes(2)
  })

  it('does not poll idle or paused projects and ignores an in-flight result after pausing', async () => {
    const pending = deferred<ResearchProject | null>()
    const get = vi.fn(() => pending.promise)
    const onChange = vi.fn()
    const setError = vi.fn()
    const remote = api({ get })
    const { rerender } = renderHook(({ current }) => useResearchWorkspace({ project: current, api: remote, t, onChange, setError }), { initialProps: { current: project() } })
    await tick(5000)
    expect(get).not.toHaveBeenCalled()
    rerender({ current: project({ runState: 'running' }) })
    expect(get).toHaveBeenCalledTimes(1)
    rerender({ current: project({ runState: 'paused' }) })
    await act(async () => { pending.resolve(project({ updatedAt: 12 })) })
    await tick(5000)
    expect(get).toHaveBeenCalledTimes(1)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('applies a polled project to state and switches to the report step on completion', async () => {
    const pending = deferred<ResearchProject | null>()
    const { result } = workspace(api({ get: () => pending.promise }), project({ phase: 'investigating', runState: 'running', planConfirmed: true }))
    await act(async () => { pending.resolve(project({ phase: 'done', planConfirmed: true, report: 'Finished', updatedAt: 11 })) })
    expect(result.current.current.report).toBe('Finished')
    expect(result.current.activeStep).toBe('report')
  })

  it('retains draft edits after a failed save and normalizes only the submitted request', async () => {
    const updatePlan = vi.fn<ResearchViewApi['updatePlan']>(async () => { throw new Error('Save denied') })
    const { result } = workspace(api({ updatePlan }))
    act(() => {
      result.current.setGoal('  Edited goal  ')
      result.current.setQuestions([
        { text: '  Kept  ', criteria: ['  Proof  ', ' '], dependsOn: [] },
        { text: ' ', criteria: ['Proof'], dependsOn: [] },
        { text: 'No criteria', criteria: [' '], dependsOn: [] },
      ])
    })
    act(() => { result.current.savePlan() })
    expect(result.current.busy).toBe(true)
    expect(result.current.error).toBeNull()
    await act(async () => {})
    expect(updatePlan).toHaveBeenLastCalledWith({ id: ResearchId('research-a'), goal: 'Edited goal', constraints: 'Official sources', depth: 'standard', questions: [{ text: 'Kept', criteria: ['Proof'], dependsOn: [] }] })
    expect(result.current.goal).toBe('  Edited goal  ')
    expect(result.current.questions).toHaveLength(3)
    expect(result.current.current.goal).toBe('Original goal')
    expect(result.current.error).toBe('Save denied')
    expect(result.current.busy).toBe(false)
  })

  it('waits for save before confirming its returned id, blocks duplicate confirmation and advances focus', async () => {
    const saved = deferred<ResearchProject>()
    const confirmed = deferred<ResearchProject>()
    const confirmPlan = vi.fn(() => confirmed.promise)
    const { result } = workspace(api({ updatePlan: () => saved.promise, confirmPlan }))
    act(() => { result.current.setGoal('Edited') })
    act(() => { void result.current.confirmAndStart() })
    expect(result.current.busy).toBe(true)
    expect(result.current.error).toBeNull()
    await act(async () => { await result.current.confirmAndStart() })
    expect(confirmPlan).not.toHaveBeenCalled()
    await act(async () => { saved.resolve(project({ id: ResearchId('saved-id'), goal: 'Edited', updatedAt: 11 })) })
    expect(confirmPlan).toHaveBeenCalledExactlyOnceWith(ResearchId('saved-id'))
    expect(result.current.current.goal).toBe('Original goal')
    await act(async () => { confirmed.resolve(project({ goal: 'Edited', phase: 'investigating', planConfirmed: true, updatedAt: 12 })) })
    expect(result.current.current.goal).toBe('Edited')
    expect(result.current.activeStep).toBe('investigate')
    expect(result.current.busy).toBe(false)
  })

  it.each(['save', 'confirm'] as const)('retains the draft and plan focus when %s fails during confirmation', async stage => {
    const confirmPlan = vi.fn(async () => { throw new Error('Confirm denied') })
    const { result, changes } = workspace(api({
      updatePlan: async () => { if (stage === 'save') throw new Error('Save denied'); return project({ updatedAt: 11 }) },
      confirmPlan,
    }))
    act(() => { result.current.setGoal('Unsaved local goal') })
    await act(async () => { await result.current.confirmAndStart() })
    expect(result.current.goal).toBe('Unsaved local goal')
    expect(result.current.activeStep).toBe('plan')
    expect(result.current.error).toBe(stage === 'save' ? 'Save denied' : 'Confirm denied')
    expect(result.current.busy).toBe(false)
    expect(changes).not.toHaveBeenCalled()
    expect(confirmPlan).toHaveBeenCalledTimes(stage === 'save' ? 0 : 1)
  })

  it.each(['stopRun', 'resumeRun', 'rewriteReport'] as const)('retains state and releases busy when %s fails', async action => {
    const failed = async () => { throw new Error('Mutation denied') }
    const fail = vi.fn(failed)
    const resume = vi.fn(failed)
    const writeReport = vi.fn(failed)
    const { result, changes } = workspace(api({ fail, resume, writeReport }), project({ phase: 'investigating', planConfirmed: true, runState: 'paused' }))
    act(() => { result.current[action]() })
    expect(result.current.busy).toBe(true)
    expect(result.current.error).toBeNull()
    await act(async () => {})
    expect(result.current.busy).toBe(false)
    expect(result.current.error).toBe('Mutation denied')
    expect(result.current.activeStep).toBe('investigate')
    expect(result.current.current.runState).toBe('paused')
    expect(changes).not.toHaveBeenCalled()
    if (action === 'stopRun') expect(fail).toHaveBeenCalledExactlyOnceWith(ResearchId('research-a'), 'investigate.stopReason', true)
    if (action === 'resumeRun') expect(resume).toHaveBeenCalledExactlyOnceWith(ResearchId('research-a'))
    if (action === 'rewriteReport') expect(writeReport).toHaveBeenCalledExactlyOnceWith(ResearchId('research-a'))
  })

  it('resets drafts only on existing dependency changes and preserves a reachable manual focus', () => {
    const remote = api()
    const onChange = vi.fn()
    const setError = vi.fn()
    const initial = project({ planConfirmed: true, phase: 'done', report: 'Report' })
    const { result, rerender } = renderHook(({ current }) => useResearchWorkspace({ project: current, api: remote, t, onChange, setError }), { initialProps: { current: initial } })
    act(() => { result.current.setGoal('Local edit'); result.current.setFocus('plan') })
    rerender({ current: { ...initial, questions: [] } })
    expect(result.current.goal).toBe('Local edit')
    expect(result.current.questions).toHaveLength(1)
    expect(result.current.activeStep).toBe('plan')
    rerender({ current: { ...initial, questions: [], updatedAt: 11 } })
    expect(result.current.goal).toBe('Original goal')
    expect(result.current.questions).toEqual([])
    expect(result.current.activeStep).toBe('plan')
    rerender({ current: project({ phase: 'investigating', planConfirmed: true, updatedAt: 12 }) })
    expect(result.current.activeStep).toBe('investigate')
    rerender({ current: project({ phase: 'writing', planConfirmed: true, updatedAt: 13 }) })
    expect(result.current.activeStep).toBe('report')
    rerender({ current: project({ id: ResearchId('new-plan'), goal: 'New goal', updatedAt: 14 }) })
    expect(result.current.goal).toBe('New goal')
    expect(result.current.activeStep).toBe('plan')
  })
})
