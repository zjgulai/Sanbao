/**
 * S3 的 slot 承载组件：扩展中心从「centerCol DOM 挂载 + 抽屉」迁到基座的
 * `main` keyed slot（中心列视图）+ `sidebar.panellist`（官方导航行）。
 *
 * 两个组件都只吃 inject face 与官方 owner props——不碰 ctx、不碰 DOM 注入、
 * 不自管显隐（显隐由 `activePanelId === key` 决定，这是 keyed slot 的语义）。
 */
import { useEffect, useState } from 'react'
import type { SkillApi } from './api.ts'
import { tt } from './panel-helpers.ts'
import type { PromptDelivery } from './prefill-draft.ts'
import css from './skill-panel.module.css'
import { SkillPanel } from './SkillPanel.tsx'

/** `main` keyed 面板的 inject face。 */
export interface ExtensionsPanelFace {
  api: SkillApi
  onExit: () => void
  /** 提示词交付通道（共享 `deliverPrompt`，由 apply 供给）。 */
  runSkill: (prompt: string) => Promise<PromptDelivery>
}

/** 中心列视图：扩展中心整页。 */
export function ExtensionsPanel({ api, onExit, runSkill }: ExtensionsPanelFace): React.JSX.Element {
  return <SkillPanel api={api} onExit={onExit} runSkill={runSkill} />
}

/** `sidebar.panellist` 行的 owner props（基座契约：图标尺寸 + 激活态）。 */
export interface PanelIconOwnerProps {
  size: number
  active: boolean
}

/** 图标行的 inject face：总数只取一次（行只挂载一次，不轮询）。 */
export interface PanelIconFace {
  loadTotal: () => Promise<number | undefined>
}

/**
 * 侧栏导航行的图标位。行壳（标签/激活底色/点击 selectPanel）是官方的，
 * 这里只画 glyph 与计数徽标——徽标是这行唯一自绘的部分。
 */
export function ExtensionsPanelIcon({ size, loadTotal }: PanelIconOwnerProps & PanelIconFace): React.JSX.Element {
  const [total, setTotal] = useState<number | undefined>(undefined)
  useEffect(() => {
    let alive = true
    loadTotal().then((value) => { if (alive) setTotal(value) }).catch(() => { if (alive) setTotal(undefined) })
    return () => { alive = false }
  }, [loadTotal])

  return (
    <span className={css.panelIconWrap} title={tt('entry.tooltip')}>
      <svg
        viewBox="0 0 16 16"
        width={size}
        height={size}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M7.2 4.6 4.9 2.3a1.6 1.6 0 0 0-2.3 0l-.3.3a1.6 1.6 0 0 0 0 2.3l2.3 2.3a1.6 1.6 0 0 0 2.3 0l.3-.3a1.6 1.6 0 0 0 0-2.3z" />
        <path d="m7.9 5.3 3.4-3.4a2.3 2.3 0 0 1 3.3 0l.5.5a2.3 2.3 0 0 1 0 3.3L11.7 9a2.3 2.3 0 0 1-3.3 0l-.5-.5a2.3 2.3 0 0 1 0-3.3z" />
        <path d="M11.2 8.6 9.9 9.9a1.6 1.6 0 0 1-2.3 0l-2.2-2.2a2.3 2.3 0 0 1 0-2.3L6.7 4.1" />
        <path d="M10.6 13.4H3.8a1.4 1.4 0 0 1-1.4-1.4V5.3" />
      </svg>
      {typeof total === 'number' && total > 0
        ? <span className={css.entryBadge} data-dsh-part="entry-badge">{total > 99 ? '99+' : String(total)}</span>
        : null}
    </span>
  )
}
