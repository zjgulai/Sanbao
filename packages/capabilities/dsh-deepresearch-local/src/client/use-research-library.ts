/** Library state, route loading and remote mutation coordination. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ResearchId, type ResearchPhase, type ResearchProject, type ResearchStartRequest } from '../types.ts'
import { hydrateResearchProject } from './project-hydrate.ts'
import { messageOf, type PendingDelete, type PhaseFilter, type Translate } from './research-view-model.ts'
import type { ResearchViewApi } from './view-types.ts'

type ResearchLibraryOptions = {
  api: ResearchViewApi
  t: Translate
  projectId?: string | null
  onSelectProject?: (id: string | null) => void
}

export function useResearchLibrary({ api, t, projectId, onSelectProject }: ResearchLibraryOptions) {
  const [projects, setProjects] = useState<readonly ResearchProject[]>([])
  const [selected, setSelected] = useState<ResearchProject | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<PhaseFilter>('all')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [sort, setSort] = useState<'recent' | 'title'>('recent')
  const [composerOpen, setComposerOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [projectLoading, setProjectLoading] = useState(false)

  const openProject = useCallback((project: ResearchProject | null) => {
    setSelected(project === null ? null : hydrateResearchProject(project))
    onSelectProject?.(project?.id ?? null)
  }, [onSelectProject])

  const apiRef = useRef(api)
  apiRef.current = api
  const refresh = useCallback(async (nextQuery: string) => {
    setError(null)
    try {
      const next = (await apiRef.current.list(nextQuery)).map(hydrateResearchProject)
      setProjects(next)
      setSelected(current => {
        if (current === null) return null
        const listed = next.find((item: ResearchProject) => item.id === current.id)
        return listed !== undefined && listed.updatedAt > current.updatedAt ? listed : current
      })
    } catch (cause) {
      setError(messageOf(cause))
    }
  }, [])
  useEffect(() => {
    if (selected !== null) return
    const timer = window.setTimeout(() => { void refresh(query) }, query === '' ? 0 : 250)
    return () => { window.clearTimeout(timer) }
  }, [query, refresh, selected])
  useEffect(() => {
    if (projectId === undefined) return
    if (projectId === null) { setSelected(null); setProjectLoading(false); return }
    const listed = projects.find(item => item.id === projectId)
    if (listed !== undefined) {
      setSelected(current => current?.id === listed.id && current.updatedAt >= listed.updatedAt ? current : hydrateResearchProject(listed))
      setProjectLoading(false)
      return
    }
    let active = true
    setProjectLoading(true)
    void apiRef.current.get(ResearchId(projectId)).then(project => {
      if (!active) return
      if (project === null) {
        setSelected(null)
        setError(t('empty.noMatch'))
      } else {
        setSelected(hydrateResearchProject(project))
      }
      setProjectLoading(false)
    }, (cause: unknown) => {
      if (active) {
        setError(messageOf(cause))
        setProjectLoading(false)
      }
    })
    return () => { active = false }
  }, [projectId, projects, t])

  const requestDelete = useCallback((target: PendingDelete) => { setError(null); setPendingDelete(target) }, [])
  const confirmDelete = useCallback(async () => {
    if (pendingDelete === null || deleteBusy) return
    setDeleteBusy(true)
    setError(null)
    try {
      await api.delete(pendingDelete.id)
      if (selected?.id === pendingDelete.id) openProject(null)
      setPendingDelete(null)
      await refresh(query)
    } catch (cause) {
      setError(messageOf(cause))
    } finally {
      setDeleteBusy(false)
    }
  }, [api, deleteBusy, openProject, pendingDelete, query, refresh, selected?.id])

  const visible = useMemo(() => {
    const phaseMatch = (phase: ResearchPhase) => filter === 'all' || filter === 'planning' && ['planning', 'awaiting_plan_confirm'].includes(phase) || filter === 'investigating' && ['investigating', 'ready_for_report', 'writing'].includes(phase) || filter === 'done' && ['done', 'incomplete'].includes(phase)
    const filtered = projects.filter(project => phaseMatch(project.phase))
    return sort === 'title' ? filtered.toSorted((left, right) => left.title.localeCompare(right.title)) : filtered.toSorted((left, right) => right.updatedAt - left.updatedAt)
  }, [filter, projects, sort])

  const updateSelected = useCallback((project: ResearchProject) => {
    const next = hydrateResearchProject(project)
    setSelected(current => current?.id === next.id && current.updatedAt === next.updatedAt ? current : next)
    setProjects(current => current.map(item => item.id === next.id ? next : item))
  }, [])

  const createProject = async (request: ResearchStartRequest) => {
    const project = await api.start(request)
    setComposerOpen(false)
    await refresh(query)
    openProject(project)
  }

  return {
    projects, selected, query, setQuery, filter, setFilter, viewMode, setViewMode, sort, setSort,
    composerOpen, setComposerOpen, busy, setBusy, error, setError,
    pendingDelete, setPendingDelete, deleteBusy, projectLoading, visible,
    openProject, refresh, requestDelete, confirmDelete, updateSelected, createProject,
  }
}
