/**
 * 右栏本页的标签体：**本会话实际做过什么**。
 *
 * 空白会话里这里是空的；AI 一开始调用工具、产出资源，对应的一栏才出现（参照
 * Qoder 的右侧栏）。数据来自会话事件流的折叠（`session-activity.ts`），经登记的
 * `hooks.sessionActivity` 隔间以 `useSessionActivity(selector)` 传进来——本组件
 * 不做订阅，也不读 session 对象。
 *
 * 环境信息一栏例外：它描述的是**工作区状态**（会话没动过它也可能有未提交改动），
 * 因此单独经宿主半的 loopback 路由取一次 git 状态；但**本会话什么都没做过时它也不出现**
 * （页面的主题是「本会话做过什么」，空白会话里连它也不该在）。
 */
import React, { useEffect, useMemo, useState } from 'react'
import css from '../../styles/sidebar.module.css'
import { fetchGitStatus } from './git-api'
import type { ActivityItem, ActivitySection, SessionActivity } from './session-activity'
import { SECTION_ICONS } from './session-activity'

/** 折叠记忆的落点（一页一份，不跨形态共享）。 */
const COLLAPSED_KEY = 'dsh-qoder-sidebar:collapsed'

function readCollapsed(): Set<string> {
  try {
    const raw = window.localStorage.getItem(COLLAPSED_KEY)
    if (raw === null) return new Set()
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? new Set(parsed.filter((v): v is string => typeof v === 'string')) : new Set()
  } catch {
    return new Set()
  }
}

function writeCollapsed(collapsed: Set<string>): void {
  try {
    window.localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsed]))
  } catch {
    // 存储不可用（隐私模式/配额满）只影响「记住折叠」，不影响本次会话的折叠行为。
  }
}

const EMPTY_ACTIVITY: SessionActivity = { sections: [] }
/** 没有注入面时的兜底选择器（形状与 `use<Name>` 一致，但恒定空）。 */
function noActivity<T>(selector: (activity: SessionActivity) => T): T {
  return selector(EMPTY_ACTIVITY)
}

export interface SidebarBodyProps {
  /** 原生渲染器按登记的 `hooks.sessionActivity` 绑出来的选择器钩子。 */
  useSessionActivity?: <T>(selector: (activity: SessionActivity) => T) => T
}

/** 环境信息栏：git 状态折出来的行（没有可说的就返回 null）。 */
function envSectionFrom(status: Awaited<ReturnType<typeof fetchGitStatus>>): ActivitySection | null {
  if (status === undefined) return null
  const diverged = status.ahead > 0 || status.behind > 0
  if (status.uncommittedFiles === 0 && !diverged) return null
  const items: ActivityItem[] = []
  if (status.uncommittedFiles > 0) items.push({ label: `${status.uncommittedFiles} 个未提交改动`, meta: '工作区' })
  items.push({ label: status.branch, meta: '分支' })
  if (status.ahead > 0) items.push({ label: `领先远端 ${status.ahead}`, meta: '待推送' })
  if (status.behind > 0) items.push({ label: `落后远端 ${status.behind}`, meta: '待拉取' })
  if (status.lastCommit !== undefined) items.push({ label: status.lastCommit.message, meta: status.lastCommit.hash.slice(0, 7) })
  return { id: 'env', icon: SECTION_ICONS.env, label: '环境信息', items }
}

/** 一栏的表头 + 可折叠内容。 */
function Section(props: {
  section: ActivitySection
  expanded: boolean
  onToggle: () => void
  children: React.ReactNode
}): JSX.Element {
  const { section, expanded, onToggle, children } = props
  const bodyId = `dsh-qoder-sidebar-body-${section.id}`
  return (
    <section className={css.section} data-section={section.id} data-expanded={expanded ? 'true' : 'false'}>
      <button
        type="button"
        className={css.sectionHeader}
        aria-expanded={expanded}
        aria-controls={bodyId}
        onClick={onToggle}
      >
        <span className={css.sectionIcon} aria-hidden="true" dangerouslySetInnerHTML={{ __html: section.icon }} />
        <span className={css.sectionLabel}>{section.label}</span>
        <span className={css.sectionCount}>{section.items.length}</span>
        <span className={css.sectionChevron} aria-hidden="true">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 4l4 4-4 4" />
          </svg>
        </span>
      </button>
      <div className={css.sectionBody} id={bodyId}>
        <div className={css.sectionBodyInner}>{children}</div>
      </div>
    </section>
  )
}

export function SidebarBody({ useSessionActivity }: SidebarBodyProps): JSX.Element {
  const [collapsed, setCollapsed] = useState<Set<string>>(readCollapsed)
  const [env, setEnv] = useState<ActivitySection | null>(null)
  const useActivity = useSessionActivity ?? noActivity
  const activity = useActivity((value) => value)

  useEffect(() => {
    let live = true
    const load = async (): Promise<void> => {
      const section = envSectionFrom(await fetchGitStatus())
      if (live) setEnv(section)
    }
    void load()
    const timer = window.setInterval(() => { void load() }, 10000)
    return () => {
      live = false
      window.clearInterval(timer)
    }
  }, [])

  const sections = useMemo(() => {
    // 空白会话（本会话没有任何活动）里这一页什么都没有——包括环境信息。
    if (env === null || activity.sections.length === 0) return activity.sections
    return [env, ...activity.sections]
  }, [activity, env])

  const toggle = (id: string): void => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      writeCollapsed(next)
      return next
    })
  }

  return (
    <div className={css.sidebar} data-dsh-part="qoder-sidebar" data-section-count={sections.length}>
      {sections.map((section) => (
        <Section
          key={section.id}
          section={section}
          expanded={!collapsed.has(section.id)}
          onToggle={() => toggle(section.id)}
        >
          <ul className={css.rows}>
            {section.items.map((item, index) => (
              <li key={`${item.label}-${index}`} className={css.row} data-state={item.state ?? 'summary'}>
                {item.state === undefined ? null : <span className={css.rowDot} aria-hidden="true" />}
                <span className={css.rowLabel} title={item.label}>{item.label}</span>
                {item.meta !== undefined && item.meta !== '' ? <span className={css.rowMeta}>{item.meta}</span> : null}
              </li>
            ))}
          </ul>
        </Section>
      ))}
    </div>
  )
}
