/** Codemini-aligned Deep Research library and its project/delete presentation. */

import { IconChevronLeftOutline14 as IconArrowLeft, IconCloseOutline16 as IconX, IconDataOutline16 as IconLayoutGrid, IconListPenOutline16 as IconList, IconLoadingOutline16 as IconLoading, IconPlusOutline16 as IconPlus, IconSparkle16 as IconBolt } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ResearchProject } from '../types.ts'
import type { ResearchViewApi } from './view-types.ts'
import type { DeepResearchKey } from './locales.ts'
import { ResearchComposer } from './ResearchComposer.tsx'
import { ResearchWorkspace } from './ResearchWorkspace.tsx'
import { formatDate, phaseLabel, splitEmoji, type PendingDelete, type PhaseFilter, type Translate } from './research-view-model.ts'
import { useResearchLibrary } from './use-research-library.ts'
import css from './views.module.css'

/** Props for the global Deep Research workspace surface. */
type ResearchViewProps = ResearchViewApi & {
  t: Translate
  projectId?: string | null
  onSelectProject?: (id: string | null) => void
  onClose?: () => void
}

/** Render the research library, reviewable plan, live investigation board, and report. */
export function ResearchView({ t, projectId, onSelectProject, onClose, ...api }: ResearchViewProps) {
  const {
    selected, query, setQuery, filter, setFilter, viewMode, setViewMode, sort, setSort,
    composerOpen, setComposerOpen, busy, setBusy, error, setError,
    pendingDelete, setPendingDelete, deleteBusy, projectLoading, visible,
    openProject, requestDelete, confirmDelete, updateSelected, createProject,
  } = useResearchLibrary({ api, t, projectId, onSelectProject })

  if (projectId !== undefined && projectId !== null && selected === null && projectLoading) {
    return <div className={css.shell}><div className={css.content}><div className={css.projectLoading} role="status"><IconLoading className={css.spinner} size={16} /><span>{t('phase.planning')}</span></div></div></div>
  }
  if (selected !== null) return <div className={css.shell}>
    <ResearchWorkspace project={selected} api={api} t={t} onChange={updateSelected} onBack={() => { openProject(null) }} onDelete={() => { requestDelete({ id: selected.id, title: selected.title }) }} error={error} setError={setError} />
    {pendingDelete === null ? null : <DeleteConfirmDialog pending={pendingDelete} busy={deleteBusy} t={t} onCancel={() => { if (!deleteBusy) setPendingDelete(null) }} onConfirm={() => { void confirmDelete() }} />}
  </div>

  const filters: ReadonlyArray<readonly [PhaseFilter, DeepResearchKey]> = [['all', 'filter.all'], ['planning', 'filter.planning'], ['investigating', 'filter.investigating'], ['done', 'filter.done']]
  return <div className={css.shell}><div className={css.content}>
    <span data-deepresearch-view="" hidden />
    {onClose === undefined ? null : (
      <div className={css.libraryTopBar}>
        <button className={css.backButton} type="button" aria-label={t('library.backAria')} onClick={onClose}>
          <IconArrowLeft size={15} />
          {t('library.back')}
        </button>
      </div>
    )}
    <div className={css.toolbar}><div className={css.filters} aria-label={t('library.filterAria')}>{filters.map(([id, key]) => <button key={id} className={filter === id ? css.activeChip : css.chip} type="button" aria-current={filter === id ? 'page' : undefined} onClick={() => { setFilter(id) }}>{t(key)}</button>)}</div><div className={css.toolbarActions}><input className={css.search} value={query} onChange={event => { setQuery(event.target.value) }} placeholder={t('toolbar.search')} aria-label={t('toolbar.searchAria')} /><select className={css.select} value={sort} onChange={event => { setSort(event.target.value as 'recent' | 'title') }} aria-label={t('toolbar.sortAria')}><option value="recent">{t('toolbar.sortRecent')}</option><option value="title">{t('toolbar.sortTitle')}</option></select><div className={css.viewToggle}><button className={css.iconButton} type="button" aria-label={t('toolbar.gridView')} aria-pressed={viewMode === 'grid'} data-active={viewMode === 'grid'} onClick={() => { setViewMode('grid') }}><IconLayoutGrid size={16} /></button><button className={css.iconButton} type="button" aria-label={t('toolbar.listView')} aria-pressed={viewMode === 'list'} data-active={viewMode === 'list'} onClick={() => { setViewMode('list') }}><IconList size={16} /></button></div><button className={css.primaryButton} type="button" onClick={() => { setError(null); setComposerOpen(true) }}><IconPlus size={15} />{t('action.start')}</button></div></div>
    <section className={css.library}><header className={css.libraryTitle}><div><h2>{t('library.title')}</h2><p>{t('library.projectCount', { count: visible.length })}</p></div></header>
      {error === null || composerOpen ? null : <div className={css.error} role="alert">{error}</div>}
      {visible.length === 0 ? <div className={css.emptyState}><span aria-hidden="true"><IconBolt size={22} /></span><strong>{query === '' ? t('empty.none') : t('empty.noMatch')}</strong><p>{query === '' ? t('empty.hintStart') : t('empty.hintNoMatch')}</p>{query === '' ? <button className={css.primaryButton} type="button" onClick={() => { setComposerOpen(true) }}><IconPlus size={15} />{t('action.start')}</button> : null}</div> : <div className={viewMode === 'grid' ? css.projectGrid : css.projectList}>{viewMode === 'grid' ? <button className={css.createCard} type="button" onClick={() => { setComposerOpen(true) }}><span><IconPlus size={22} /></span><strong>{t('action.startShort')}</strong></button> : null}{visible.map(project => <ProjectCard key={project.id} project={project} list={viewMode === 'list'} t={t} onOpen={() => { openProject(project) }} onDelete={() => { requestDelete({ id: project.id, title: project.title }) }} />)}</div>}
    </section>
  </div>{composerOpen ? <ResearchComposer busy={busy} error={error} setBusy={setBusy} t={t} onClose={() => { if (!busy) setComposerOpen(false) }} onCreate={createProject} setError={setError} /> : null}{pendingDelete === null ? null : <DeleteConfirmDialog pending={pendingDelete} busy={deleteBusy} t={t} onCancel={() => { if (!deleteBusy) setPendingDelete(null) }} onConfirm={() => { void confirmDelete() }} />}</div>
}

function ProjectCard({ project, list, t, onOpen, onDelete }: { project: ResearchProject; list: boolean; t: Translate; onOpen: () => void; onDelete: () => void }) { const [emoji, title] = splitEmoji(project.title); return <article className={css.projectCard} data-list={list || undefined}><button className={css.cardOpen} type="button" onClick={onOpen} aria-label={t('card.openAria', { title: project.title })} /><div className={css.cardEmoji}>{emoji || <IconBolt size={25} />}</div><div className={css.cardInfo}><h3>{title}</h3><p>{project.goal || project.question}</p><div><span className={css.phase} data-phase={project.runState === 'paused' ? 'aborted' : project.phase}>{phaseLabel(project, t)}</span><span>{t('card.evidence', { count: project.evidence.length, date: formatDate(project.updatedAt) })}</span></div></div><button className={css.deleteButton} type="button" aria-label={t('workspace.delete')} onClick={event => { event.stopPropagation(); onDelete() }}><IconX size={15} /></button></article> }

function DeleteConfirmDialog({ pending, busy, t, onCancel, onConfirm }: { pending: PendingDelete; busy: boolean; t: Translate; onCancel: () => void; onConfirm: () => void }) {
  const [, title] = splitEmoji(pending.title)
  const name = title || pending.title
  return <div className={css.confirmBackdrop} role="presentation" onClick={() => { if (!busy) onCancel() }}>
    <div className={css.confirmCard} role="dialog" aria-modal="true" aria-labelledby="delete-research-title" onClick={event => { event.stopPropagation() }}>
      <span className={css.confirmMark} aria-hidden="true" />
      <h3 id="delete-research-title">{t('delete.title')}</h3>
      <p>{t('delete.body', { title: name })}</p>
      <div className={css.confirmActions}>
        <button className={css.confirmCancel} type="button" disabled={busy} onClick={onCancel}>{t('action.cancel')}</button>
        <button className={css.confirmDelete} type="button" disabled={busy} onClick={onConfirm}>{busy ? <IconLoading className={css.spinner} size={14} /> : null}{t('delete.confirm')}</button>
      </div>
    </div>
  </div>
}
