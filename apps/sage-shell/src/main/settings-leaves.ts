/** Ticket 046 (US-209~219): the eleven leaf settings pages, read-only, each with its source.
 *
 * Every row names where its fact comes from — a mounting observation, a configuration fact, or a
 * local record — and every row without such a fact says `unavailable` **with a reason**. The
 * registry is the whole surface: a leaf that is not listed here has no page, and no page offers a
 * write entry (there is no write port for any of them).
 *
 * The workspace-index leaf is deliberately sourced from the folded registry observation: reading
 * it must never trigger a full filesystem scan (D-090 / US-219).
 */
import type { SettingsLeaf } from '../appservice/contracts.js'

/** The eleven leaves, in the order the settings family presents them. */
export const SETTINGS_LEAF_IDS = [
  'desktop-pet',
  'memory',
  'data-import',
  'hooks',
  'computer-use',
  'mobile',
  'connection',
  'security',
  'network',
  'workspace-index',
  'task-monitor',
] as const

export type SettingsLeafId = (typeof SETTINGS_LEAF_IDS)[number]

export interface SettingsLeafFacts {
  /** The host observation, as main's snapshot reports it. */
  readonly host: { readonly kind: 'active' | 'unavailable' }
  /** The instance policy's organization id, when the file was read. */
  readonly organizationRef: string | null
  /** How many workspaces the folded registry reported (a metadata read, never a scan). */
  readonly workspaceCount: number
  /** Whether that fold was actually read (an unread fold is `unavailable`, not zero). */
  readonly workspaceFoldRead: boolean
}

const TITLES: Readonly<Record<SettingsLeafId, string>> = {
  'desktop-pet': '桌面宠物',
  'memory': '记忆',
  'data-import': '数据导入',
  'hooks': '钩子',
  'computer-use': '电脑操控',
  'mobile': '移动端',
  'connection': '连接',
  'security': '安全',
  'network': '网络',
  'workspace-index': '工作区索引',
  'task-monitor': '任务监控',
}

/**
 * Build the eleven rows. Only three leaves have a real source today (连接/安全/工作区索引); the
 * rest are `unavailable` with `provider-not-wired` — say unwired, never "disabled".
 */
export function listSettingsLeaves(facts: SettingsLeafFacts): readonly SettingsLeaf[] {
  return SETTINGS_LEAF_IDS.map((leafId): SettingsLeaf => {
    const title = TITLES[leafId]
    if (leafId === 'connection') {
      return facts.host.kind === 'active'
        ? { leafId, title, state: 'read', source: '运行时启动观察', note: 'Host 本次启动处于活跃世代；连接细节以运行时清单页为准。', writeEntry: null }
        : { leafId, title, state: 'unavailable', source: '运行时启动观察', note: '未核验：本次运行还没有活跃的 Host 世代。', writeEntry: null }
    }
    if (leafId === 'security') {
      return facts.organizationRef === null
        ? { leafId, title, state: 'unavailable', source: '实例策略文件', note: '未核验：还没有读到实例策略，组织范围与授权都无从显示。', writeEntry: null }
        : { leafId, title, state: 'read', source: '实例策略文件', note: `实例策略已读：组织 ${facts.organizationRef}；治理写面在后续版本。`, writeEntry: null }
    }
    if (leafId === 'workspace-index') {
      return facts.workspaceFoldRead
        ? { leafId, title, state: 'read', source: '工作区登记观察（follow 折叠）', note: `登记里有 ${String(facts.workspaceCount)} 个工作区；本页只读这一份观察，不触发全量扫描。`, writeEntry: null }
        : { leafId, title, state: 'unavailable', source: '工作区登记观察（follow 折叠）', note: '未核验：还没有读到工作区登记观察。', writeEntry: null }
    }
    return {
      leafId,
      title,
      state: 'unavailable',
      source: '无 provider',
      note: '未接线：这一版没有这一项的数据来源，也没有任何配置入口——没接线就是没接线，不改写成停用结论。',
      writeEntry: null,
    }
  })
}
