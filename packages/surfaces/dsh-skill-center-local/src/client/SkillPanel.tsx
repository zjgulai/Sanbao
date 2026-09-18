/**
 * Skill center panel (browser half): a center-column view (the shell's `main`
 * keyed slot, not an overlay) with a business-domain browsing view (search +
 * domain chips + human-readable cards) and a collapsed developer mode holding
 * the original source-grouped management list plus the create form.
 *
 * Talks to the host route family through SkillApi.
 */

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { SkillApi, type ListPayload, type SkillEntry } from './api.ts'
import { DOMAIN_OTHER, DOMAINS, domainOf } from './business-domains.ts'
import { zh } from './locales.ts'
import { tt } from './panel-helpers.ts'
import type { PromptDelivery } from './prefill-draft.ts'
import css from './skill-panel.module.css'

/** Panel props: the API client and the close callback. */
export interface SkillPanelProps {
  api: SkillApi
  /** 离开本视图（回到会话）。S3 起本面板是中心列视图而非浮层，没有「关闭」只有「离开」。 */
  onExit: () => void
  /**
   * 把提示词交付给用户（草稿优先、剪贴板兜底），由 apply 用共享 `deliverPrompt` 供给。
   * 面板自己不知道通道细节——它只报告成败。
   */
  runSkill: (prompt: string) => Promise<PromptDelivery>
}

type Tab = 'list' | 'create'

/** Human-readable summary: user_summary first, description excerpt fallback. */
function cardSummary(skill: SkillEntry): string {
  if (skill.userSummary !== undefined && skill.userSummary.trim() !== '') return skill.userSummary
  const excerpt = skill.description.replace(/\s+/g, ' ').trim()
  return excerpt.length > 60 ? `${excerpt.slice(0, 60)}…` : excerpt
}

/** Source level -> localized label. */
function sourceLabel(level: string): string {
  const key = `source.${level}` as keyof typeof zh
  return key in zh ? tt(key) : level
}

/** Marks shown next to a skill (model/user invocable). */
function invokableMarks(skill: SkillEntry): string {
  const marks: string[] = []
  if (skill.modelInvocable) marks.push(tt('list.mark.model'))
  if (skill.userInvocable) marks.push(tt('list.mark.user'))
  return marks.join(' / ')
}

/** Toggle/delete actions shared by both card variants. */
function useCardActions(skill: SkillEntry, api: SkillApi, onChanged: () => void): {
  busy: boolean
  error: string | undefined
  toggle(): void
  remove(): void
} {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const busyRef = useRef(false)

  const toggle = async (): Promise<void> => {
    if (busyRef.current) return
    const path = skill.path
    if (path === undefined) return
    busyRef.current = true
    setBusy(true)
    setError(undefined)
    try {
      await api.setEnabled(skill.name, path, !skill.modelInvocable)
      onChanged()
    } catch (err) {
      setError(tt('list.toggleFailed', { error: err instanceof Error ? err.message : String(err) }))
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  const remove = async (): Promise<void> => {
    const path = skill.path
    if (path === undefined) return
    if (!window.confirm(tt('list.deleteConfirm', { name: skill.name }))) return
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError(undefined)
    try {
      await api.remove(skill.name, path)
      onChanged()
    } catch (err) {
      setError(tt('list.deleteFailed', { error: err instanceof Error ? err.message : String(err) }))
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  return { busy, error, toggle: () => { void toggle() }, remove: () => { void remove() } }
}

/**
 * 触发技能执行：离开面板，再把提示词交给共享交付通道。
 *
 * 两处旧机制在这轮一起退役：
 * - `dsh:view-change`(chat)：它的听者是注入形态本身（S3 起本面板由 `activePanelId`
 *   决定显隐），照旧广播的话提示词交付了、面板还盖着中心列。离开只能走 onExit。
 * - `dsh:skill-execute`：2026-09-19 实测**全仓 + 基座零听者**，删掉（能力中枢的
 *   dispatcher 里那处广播同批删除）。交付事实由 `deliverPrompt` 的返回值承载。
 */
async function executeSkillPrompt(
  skill: SkillEntry,
  customPrompt: string | undefined,
  onExit: () => void,
  runSkill: (prompt: string) => Promise<PromptDelivery>,
): Promise<PromptDelivery> {
  const prompt = customPrompt && customPrompt.trim() !== ''
    ? customPrompt.trim()
    : (skill.userTry && skill.userTry.trim() !== '' ? skill.userTry.trim() : `使用技能 /${skill.name}`)

  onExit()
  const outcome = await runSkill(prompt)
  if (!outcome.ok) {
    // 两级通道都失败时 deliverPrompt 只返回原因；面板此刻已卸载，界面上没有位置能
    // 报告，所以至少让日志出声（家族纪律：永不静默）。
    console.warn(`[skill-center-local] 执行「${skill.name}」未能交付提示词：${outcome.reason}`)
  }
  return outcome
}

/** One business-view skill card: Chinese title first, human summary, guided try line, direct execution input. */
function BusinessCard({ skill, api, onChanged, onExit, runSkill }: { skill: SkillEntry; api: SkillApi; onChanged: () => void; onExit: () => void; runSkill: (prompt: string) => Promise<PromptDelivery> }): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const [runInput, setRunInput] = useState('')
  const [ranNotice, setRanNotice] = useState(false)
  const actions = useCardActions(skill, api, onChanged)
  const displayName = skill.title !== undefined && skill.title.trim() !== '' ? skill.title : skill.name
  const summary = cardSummary(skill)
  const showNameSub = skill.title !== undefined && skill.title.trim() !== '' && skill.title !== skill.name

  const handleRun = (): void => {
    void (async () => {
      const outcome = await executeSkillPrompt(skill, runInput, onExit, runSkill)
      // 「已发送到会话！」只在真的交付成功时才成立——两级通道都失败时说这句话是撒谎。
      if (!outcome.ok) return
      setRanNotice(true)
      setTimeout(() => { setRanNotice(false) }, 2500)
    })()
  }

  return (
    <article
      className={css.skill}
      data-dsh-part="skill-row"
      onClick={() => {
        // Touch fallback (no hover): tapping the card toggles the actions row.
        if (window.matchMedia('(hover: none)').matches) setExpanded((value) => !value)
      }}
    >
      <header className={css.skillHeader}>
        <span className={css.skillName}>{displayName}</span>
        {!skill.modelInvocable && <span className={`${css.badge} ${css.badgeDisabled}`}>{tt('list.disabledShort')}</span>}
        {skill.linked === true && <span className={css.badge}>{tt('list.linked')}</span>}
        <span className={css.cardActions} data-expanded={expanded || undefined} onClick={(event) => { event.stopPropagation() }}>
          {skill.path !== undefined && (
            <button
              type="button"
              className={css.switch}
              role="switch"
              aria-checked={skill.modelInvocable}
              title={skill.modelInvocable ? tt('list.enabled') : tt('list.disabled')}
              disabled={actions.busy}
              onClick={actions.toggle}
            >
              <span className={css.switchTrack}><span className={css.switchThumb} /></span>
            </button>
          )}
          {skill.path !== undefined && skill.linked !== true && (
            <button type="button" className={css.deleteButton} disabled={actions.busy} onClick={actions.remove}>
              {tt('list.delete')}
            </button>
          )}
        </span>
      </header>
      {showNameSub && <div className={css.skillNameSub}>{skill.name}</div>}
      <p className={css.skillDesc}>{summary}</p>
      {skill.userTry !== undefined && skill.userTry.trim() !== '' && (
        <p className={css.skillTry}><span className={css.tryLabel}>{tt('list.try')}</span>「{skill.userTry}」</p>
      )}
      <div className={css.skillMeta}>
        <span>{tt('list.sourceLabel')}：{sourceLabel(skill.level)}</span>
        {(skill.modelInvocable || skill.userInvocable) && (
          <span className={css.metaMarks}>{tt('list.invokable', { marks: invokableMarks(skill) })}</span>
        )}
      </div>

      <div className={css.skillRunRow} onClick={(e) => { e.stopPropagation() }}>
        <div className={css.skillRunInputRow}>
          <input
            type="text"
            className={css.skillRunInput}
            placeholder={tt('card.runParamPlaceholder')}
            value={runInput}
            onChange={(e) => { setRunInput(e.target.value) }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleRun()
              }
            }}
          />
          <button
            type="button"
            className={css.skillRunBtn}
            onClick={handleRun}
          >
            {tt('card.run')}
          </button>
        </div>
        {ranNotice && <div className={css.skillRunSuccess}>{tt('card.runSuccess')}</div>}
      </div>

      {actions.error !== undefined && <p className={css.feedback}>{actions.error}</p>}
    </article>
  )
}

/** One developer-view card: original name-first layout with always-visible controls. */
function DevCard({ skill, api, onChanged }: { skill: SkillEntry; api: SkillApi; onChanged: () => void }): React.JSX.Element {
  const actions = useCardActions(skill, api, onChanged)
  return (
    <article className={css.skill} data-dsh-part="skill-row">
      <header className={css.skillHeader}>
        <span className={css.skillName}>{skill.name}</span>
        {skill.provider !== undefined && <span className={css.badge}>{skill.provider}</span>}
        {skill.linked === true && <span className={css.badge}>{tt('list.linked')}</span>}
        {(skill.modelInvocable || skill.userInvocable) && (
          <span className={`${css.badge} ${css.badgeInvokable}`}>{tt('list.invokable', { marks: invokableMarks(skill) })}</span>
        )}
        {skill.path !== undefined && (
          <button
            type="button"
            className={css.switch}
            role="switch"
            aria-checked={skill.modelInvocable}
            title={skill.modelInvocable ? tt('list.enabled') : tt('list.disabled')}
            disabled={actions.busy}
            onClick={actions.toggle}
          >
            <span className={css.switchTrack}><span className={css.switchThumb} /></span>
          </button>
        )}
        {skill.path !== undefined && skill.linked !== true && (
          <button type="button" className={css.deleteButton} disabled={actions.busy} onClick={actions.remove}>
            {tt('list.delete')}
          </button>
        )}
      </header>
      <p className={css.skillDesc}>{skill.description}</p>
      {skill.whenToUse !== undefined && skill.whenToUse !== '' && (
        <p className={css.skillWhen}>{tt('list.when', { when: skill.whenToUse })}</p>
      )}
      {skill.path !== undefined && <div className={css.skillPath}>{skill.path}</div>}
      {actions.error !== undefined && <p className={css.feedback}>{actions.error}</p>}
    </article>
  )
}

/** Flat list of all skills from the grouped payload. */
function flattenSkills(payload: ListPayload): SkillEntry[] {
  const out: SkillEntry[] = []
  for (const group of payload.groups) out.push(...group.skills)
  return out
}

/** The business browsing view (default). */
function BrowseTab({ api, refreshTick, onExit, runSkill }: { api: SkillApi; refreshTick: number; onExit: () => void; runSkill: (prompt: string) => Promise<PromptDelivery> }): React.JSX.Element {
  const [payload, setPayload] = useState<ListPayload | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [query, setQuery] = useState('')
  const [domain, setDomain] = useState<string>('all')
  const loadSeq = useRef(0)

  const load = async (): Promise<void> => {
    const seq = ++loadSeq.current
    try {
      const next = await api.list()
      if (seq !== loadSeq.current) return
      setPayload(next)
      setError(undefined)
    } catch (err) {
      if (seq !== loadSeq.current) return
      setError(tt('list.loadFailed', { error: err instanceof Error ? err.message : String(err) }))
    }
  }

  useEffect(() => { void load() }, [api, refreshTick])

  const skills = useMemo(() => flattenSkills(payload ?? { cwd: '', projectRoots: [], complete: true, groups: [] }), [payload])

  // Collapsed-by-default "other" group (2026-09-10): ~184/265 installed skills
  // are unmapped-to-business-domain helpers; collapsing their group keeps the
  // browse view honest about what the business skills actually are. The
  // user's expand choice persists across panel opens.
  const [otherExpanded, setOtherExpanded] = useState<boolean>(() => {
    try { return window.localStorage.getItem('dsh-skill-center:other-expanded') === '1' } catch { return false }
  })
  const toggleOther = (): void => {
    setOtherExpanded((value) => {
      try { window.localStorage.setItem('dsh-skill-center:other-expanded', value ? '0' : '1') } catch { /* storage unavailable: session-only */ }
      return !value
    })
  }
  const total = skills.length

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return skills.filter((skill) => {
      if (domain !== 'all' && domainOf(skill.name) !== domain) return false
      if (q === '') return true
      const haystack = `${skill.name} ${skill.title ?? ''} ${skill.description} ${skill.userSummary ?? ''} ${skill.whenToUse ?? ''}`.toLowerCase()
      return haystack.includes(q)
    })
  }, [skills, query, domain])

  const grouped = useMemo(() => {
    const byDomain = new Map<string, SkillEntry[]>()
    for (const skill of filtered) {
      const key = domainOf(skill.name)
      const list = byDomain.get(key) ?? []
      list.push(skill)
      byDomain.set(key, list)
    }
    const order = [...DOMAINS.map((item) => item.key), DOMAIN_OTHER]
    return order
      .map((key) => ({ key, skills: byDomain.get(key) ?? [] }))
      .filter((group) => group.skills.length > 0)
  }, [filtered])

  if (error !== undefined && payload === undefined) return <div className={css.status}>{error}</div>
  if (payload === undefined) return <div className={css.status}>{tt('list.loading')}</div>
  if (total === 0) return <div className={css.status}>{tt('list.empty')}</div>

  return (
    <div className={css.browse}>
      <div className={css.searchRow}>
        <input
          type="search"
          className={css.searchInput}
          placeholder={tt('search.placeholder')}
          value={query}
          onChange={(event) => { setQuery(event.target.value) }}
          aria-label={tt('search.placeholder')}
        />
        <span className={css.totalCount}>{tt('list.count', { count: String(total) })}</span>
      </div>
      <div className={css.chips} role="tablist" aria-label={tt('panel.title')}>
        <button type="button" className={`${css.chip} ${domain === 'all' ? css.chipActive : ''}`} onClick={() => { setDomain('all') }}>
          {tt('domain.all')}
        </button>
        {DOMAINS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`${css.chip} ${domain === item.key ? css.chipActive : ''}`}
            onClick={() => { setDomain(domain === item.key ? 'all' : item.key) }}
          >
            <span aria-hidden="true">{item.icon}</span>
            {tt(`domain.${item.key}` as keyof typeof zh)}
          </button>
        ))}
      </div>
      {error !== undefined && <p className={css.feedback}>{error}</p>}
      {filtered.length === 0 ? (
        <div className={css.status}>{tt('search.empty')}</div>
      ) : (
        grouped.map((group) => {
          const domainItem = DOMAINS.find((item) => item.key === group.key)
          const title = group.key === DOMAIN_OTHER ? tt('domain.other') : tt(`domain.${group.key}` as keyof typeof zh)
          const collapsed = group.key === DOMAIN_OTHER && !otherExpanded
          return (
            <section key={group.key} className={css.group}>
              <h3 className={css.groupTitle}>
                {domainItem !== undefined && <span className={css.domainIcon} aria-hidden="true">{domainItem.icon}</span>}
                {title}
                <span className={css.count}>{tt('list.count', { count: String(group.skills.length) })}</span>
                {group.key === DOMAIN_OTHER && (
                  <button type="button" className={css.collapseToggle} onClick={toggleOther} aria-expanded={otherExpanded}>
                    {otherExpanded ? tt('domain.otherCollapse') : tt('domain.otherExpand')}
                  </button>
                )}
              </h3>
              {!collapsed && (
                <div className={css.grid}>
                  {group.skills.map((skill) => (
                    <BusinessCard key={skill.name} skill={skill} api={api} onChanged={() => { void load() }} onExit={onExit} runSkill={runSkill} />
                  ))}
                </div>
              )}
              {collapsed && <p className={css.groupHint}>{tt('domain.otherHint')}</p>}
            </section>
          )
        })
      )}
    </div>
  )
}

/** The developer management view (source-grouped list + create form). */
function DevTab({ api, refreshTick, onCwd }: { api: SkillApi; refreshTick: number; onCwd: (cwd: string) => void }): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('list')
  const [payload, setPayload] = useState<ListPayload | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const loadSeq = useRef(0)

  const load = async (): Promise<void> => {
    const seq = ++loadSeq.current
    try {
      const next = await api.list()
      if (seq !== loadSeq.current) return
      setPayload(next)
      onCwd(next.cwd)
      setCwd(next.cwd)
      setError(undefined)
    } catch (err) {
      if (seq !== loadSeq.current) return
      setError(tt('list.loadFailed', { error: err instanceof Error ? err.message : String(err) }))
    }
  }

  useEffect(() => { void load() }, [api, refreshTick])

  const [cwd, setCwd] = useState<string | undefined>(undefined)

  if (tab === 'create') {
    return (
      <div>
        <div className={css.tabs} data-dsh-part="tab-bar" role="tablist">
          <button type="button" role="tab" className={css.tab} aria-selected={false} onClick={() => { setTab('list') }}>
            {tt('tab.list')}
          </button>
          <button type="button" role="tab" className={`${css.tab} ${css.tabActive}`} aria-selected onClick={() => { setTab('create') }}>
            {tt('tab.create')}
          </button>
        </div>
        <CreateTab api={api} cwd={cwd} />
      </div>
    )
  }
  if (error !== undefined && payload === undefined) return <div className={css.status}>{error}</div>
  if (payload === undefined) return <div className={css.status}>{tt('list.loading')}</div>
  if (payload.groups.length === 0) return <div className={css.status}>{tt('list.empty')}</div>

  return (
    <div>
      <div className={css.tabs} data-dsh-part="tab-bar" role="tablist">
        <button type="button" role="tab" className={`${css.tab} ${css.tabActive}`} aria-selected onClick={() => { setTab('list') }}>
          {tt('tab.list')}
        </button>
        <button type="button" role="tab" className={css.tab} aria-selected={false} onClick={() => { setTab('create') }}>
          {tt('tab.create')}
        </button>
      </div>
      {error !== undefined && <p className={css.feedback}>{error}</p>}
      {payload.groups.map((group) => {
        const groupKey = `group.${group.key}` as keyof typeof zh
        const hintKey = `groupHint.${group.key}` as keyof typeof zh
        const title = groupKey in zh ? tt(groupKey) : group.title
        const hint = hintKey in zh ? tt(hintKey) : group.hint
        return (
          <section key={group.key} className={css.group}>
            <h3 className={css.groupTitle}>
              {title}
              <span className={css.count}>{tt('list.count', { count: String(group.skills.length) })}</span>
            </h3>
            {hint !== '' && <p className={css.groupHint}>{hint}</p>}
            {group.skills.map((skill) => (
              <DevCard key={skill.name} skill={skill} api={api} onChanged={() => { void load() }} />
            ))}
          </section>
        )
      })}
    </div>
  )
}

/** The create form (developer mode). */
function CreateTab({ api, cwd }: { api: SkillApi; cwd: string | undefined }): React.JSX.Element {
  const [root, setRoot] = useState<'user' | 'project'>('user')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [whenToUse, setWhenToUse] = useState('')
  const [content, setContent] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ text: string; ok: boolean } | undefined>(undefined)

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (name.trim() === '' || description.trim() === '' || content.trim() === '') {
      setFeedback({ text: tt('create.empty'), ok: false })
      return
    }
    setBusy(true)
    try {
      const result = await api.create({ root, name: name.trim(), description: description.trim(), whenToUse: whenToUse.trim() || undefined, content, cwd: cwd ?? '' })
      setFeedback({ text: tt('create.created', { path: result.path }), ok: true })
      setName('')
      setDescription('')
      setWhenToUse('')
      setContent('')
    } catch (err) {
      setFeedback({ text: tt('create.failed', { error: err instanceof Error ? err.message : String(err) }), ok: false })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className={css.form} onSubmit={(event) => { void submit(event) }}>
      <label className={css.formLabel}>
        {tt('create.root')}
        <select className={css.formInput} value={root} onChange={(event) => { setRoot(event.target.value as 'user' | 'project') }}>
          <option value="user">{tt('create.root.user')}</option>
          <option value="project">{tt('create.root.project')}</option>
        </select>
      </label>
      <label className={css.formLabel}>
        {tt('create.name')}
        <input className={css.formInput} value={name} placeholder={tt('create.namePlaceholder')} onChange={(event) => { setName(event.target.value) }} />
      </label>
      <label className={css.formLabel}>
        {tt('create.description')}
        <input className={css.formInput} value={description} onChange={(event) => { setDescription(event.target.value) }} />
      </label>
      <label className={css.formLabel}>
        {tt('create.whenToUse')}
        <input className={css.formInput} value={whenToUse} onChange={(event) => { setWhenToUse(event.target.value) }} />
      </label>
      <label className={css.formLabel}>
        {tt('create.content')}
        <textarea className={`${css.formInput} ${css.formTextarea}`} value={content} onChange={(event) => { setContent(event.target.value) }} />
      </label>
      <button type="submit" className={css.formButton} disabled={busy}>{tt('create.submit')}</button>
      {feedback !== undefined && (
        <p className={feedback.ok ? `${css.feedback} ${css.feedbackOk}` : css.feedback}>{feedback.text}</p>
      )}
      <p className={css.note}>{tt('create.note')}</p>
    </form>
  )
}

type HubTab = 'skills' | 'mcp' | 'apps'

interface McpServerItem {
  id: string
  name: string
  description?: string
  status?: string
  enabled?: boolean
  tools?: Array<{ name: string; description?: string }>
}

/** MCP tab view: list and toggle MCP servers */
function McpTab(): React.JSX.Element {
  const [servers, setServers] = useState<McpServerItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    const fetchMcp = async (): Promise<void> => {
      try {
        const res = await fetch('/api/dsh-wanzh-hulian/mcp-servers')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json() as { ok: boolean; servers?: McpServerItem[] }
        if (!cancelled && data.ok && Array.isArray(data.servers)) {
          setServers(data.servers)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void fetchMcp()
    return () => { cancelled = true }
  }, [])

  if (loading) return <div className={css.status}>{tt('list.loading')}</div>
  if (error && servers.length === 0) {
    return (
      <div className={css.browse}>
        <div className={css.status}>{tt('list.loadFailed', { error })}</div>
      </div>
    )
  }

  return (
    <div className={css.browse}>
      <div className={css.totalCount}>{tt('list.count', { count: String(servers.length) })}</div>
      {servers.length === 0 ? (
        <div className={css.status}>{tt('search.empty')}</div>
      ) : (
        <div className={css.grid}>
          {servers.map((s) => (
            <article key={s.id} className={css.skill} data-dsh-part="skill-row">
              <header className={css.skillHeader}>
                <span className={css.skillName}>{s.name}</span>
                {s.status && <span className={`${css.badge} ${s.status === 'connected' ? css.badgeInvokable : ''}`}>{s.status}</span>}
              </header>
              {s.description && <p className={css.skillDesc}>{s.description}</p>}
              {Array.isArray(s.tools) && s.tools.length > 0 && (
                <div className={css.skillMeta}>
                  <span>工具 ({s.tools.length}): {s.tools.map(t => t.name).slice(0, 3).join(', ')}{s.tools.length > 3 ? '…' : ''}</span>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  )
}

/** Apps tab view: list registered desktop applications */
function AppsTab(): React.JSX.Element {
  return (
    <div className={css.browse}>
      <div className={css.totalCount}>已集成桌面应用 (2 个)</div>
      <div className={css.grid}>
        <article className={css.skill} data-dsh-part="skill-row">
          <header className={css.skillHeader}>
            <span className={css.skillName}>KOL-Hunter 海外红人挖掘</span>
            <span className={`${css.badge} ${css.badgeInvokable}`}>已集成</span>
          </header>
          <p className={css.skillDesc}>海外红人多维度搜索、建联与履约管理独立应用面板。</p>
          <div className={css.skillRunRow}>
            <button
              type="button"
              className={css.skillRunBtn}
              onClick={() => {
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('dsh:view-change', { detail: { view: 'applications' } }))
                }
              }}
            >
              打开应用
            </button>
          </div>
        </article>
        <article className={css.skill} data-dsh-part="skill-row">
          <header className={css.skillHeader}>
            <span className={css.skillName}>新应用工作台</span>
            <span className={`${css.badge} ${css.badgeInvokable}`}>系统内置</span>
          </header>
          <p className={css.skillDesc}>管理与运行各类业务独立插件与扩展容器。</p>
          <div className={css.skillRunRow}>
            <button
              type="button"
              className={css.skillRunBtn}
              onClick={() => {
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('dsh:view-change', { detail: { view: 'applications' } }))
                }
              }}
            >
              打开工作台
            </button>
          </div>
        </article>
      </div>
    </div>
  )
}

/** The extensions hub as a center-column page (main keyed slot). */
export function SkillPanel({ api, onExit, runSkill }: SkillPanelProps): React.JSX.Element {
  const [hubTab, setHubTab] = useState<HubTab>('skills')
  const [devMode, setDevMode] = useState(false)
  const [cwd, setCwd] = useState<string | undefined>(undefined)
  const [refreshTick, setRefreshTick] = useState(0)

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      // Typing in the create form must not leave the view: Escape there is
      // an editing gesture, not a navigation gesture.
      const target = event.target as HTMLElement | null
      if (target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return
      onExit()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onExit])

  return (
    <section className={css.panelPage} data-dsh-part="panel-page" aria-label={tt('panel.title')}>
      <header className={css.head} data-dsh-part="head">
        <button
          type="button"
          className={css.backBtn}
          onClick={onExit}
          aria-label="返回会话"
          data-dsh-part="back-to-chat"
        >
          ← 返回会话
        </button>
        <div className={css.headText}>
          <h2 className={css.headTitle}>{tt('panel.title')}</h2>
          <p className={css.headSubtitle}>{tt('panel.subtitle')}</p>
        </div>
        <button
          type="button"
          className={`${css.headButton} ${devMode ? css.headButtonActive : ''}`}
          title={tt('devMode.hint')}
          onClick={() => { setDevMode((value) => !value) }}
        >
          {tt('devMode.label')}
        </button>
        <button type="button" className={css.headButton} onClick={() => { setRefreshTick((tick) => tick + 1) }}>
          {tt('refresh')}
        </button>
      </header>

        {/* Three Technology Form Tabs */}
        {!devMode && (
          <div className={`${css.tabs} ${css.hubTabs}`} role="tablist" aria-label="扩展类型">
            <button
              type="button"
              role="tab"
              className={`${css.tab} ${hubTab === 'skills' ? css.tabActive : ''}`}
              aria-selected={hubTab === 'skills'}
              onClick={() => { setHubTab('skills') }}
            >
              {tt('tab.skills')}
            </button>
            <button
              type="button"
              role="tab"
              className={`${css.tab} ${hubTab === 'mcp' ? css.tabActive : ''}`}
              aria-selected={hubTab === 'mcp'}
              onClick={() => { setHubTab('mcp') }}
            >
              {tt('tab.mcp')}
            </button>
            <button
              type="button"
              role="tab"
              className={`${css.tab} ${hubTab === 'apps' ? css.tabActive : ''}`}
              aria-selected={hubTab === 'apps'}
              onClick={() => { setHubTab('apps') }}
            >
              {tt('tab.apps')}
            </button>
          </div>
        )}

        {devMode && <p className={css.devHint}>{tt('devMode.hint')}</p>}
        <div className={css.body}>
          {devMode ? (
            <DevTab api={api} refreshTick={refreshTick} onCwd={setCwd} />
          ) : (
            <>
              {hubTab === 'skills' && <BrowseTab api={api} refreshTick={refreshTick} onExit={onExit} runSkill={runSkill} />}
              {hubTab === 'mcp' && <McpTab />}
              {hubTab === 'apps' && <AppsTab />}
            </>
          )}
        </div>
      {typeof cwd === 'string' && cwd !== '' && devMode && (
        <footer className={css.foot}>{tt('cwd', { cwd })}</footer>
      )}
    </section>
  )
}
