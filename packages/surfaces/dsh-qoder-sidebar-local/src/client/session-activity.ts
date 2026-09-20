/**
 * 会话活动折叠：把**本会话自己的事件流**折成右栏那几栏「产物」。
 *
 * 参照形态（Qoder 的右侧栏）不是常驻看板：**空白会话里什么都没有**，AI 开始调用
 * 工具、产出资源时，一栏一栏地出现。所以数据不能取「机器上有什么」（git 状态、
 * 技能清单、进程表），只能取**这个会话做过什么**——事件流是唯一权威源。
 *
 * 事件形状（原生 `SessionEvent`，见 dsh-session 的 types）是**信封**：
 *   `{ type, seq, time, data }` —— 负载在 `data` 里，不在事件对象本身上。
 * 折叠读的四种负载：
 *   · `tool/call`   —— `data: { callId, name, arguments }`（arguments 是模型给的原始 JSON 串）
 *   · `tool/result` —— `data.message.source.callId` 回填成败（`data.error` 或 `content[0].isError`）
 *   · `user/message`—— 人给的图片/文件块 → 来源
 *   · `deliverables/presented` —— 工具显式交付的文件 → 产出
 *
 * 折叠结果按「有内容的栏才出现」输出（见 `SessionActivity.sections`），空会话返回空数组。
 */

/** 事件窗口里的一格（与 `SessionEventWindow.entries` 同形，不引它的类型：本包不依赖该包）。 */
export interface ActivityEventEntry {
  readonly type: string
  readonly event?: {
    readonly type?: string
    /** 信封里的负载（原生 `SessionEvent.data`）；形状由事件类型决定。 */
    readonly data?: { readonly [key: string]: unknown }
  }
}

/** 一栏里的一行。 */
export interface ActivityItem {
  readonly label: string
  readonly meta?: string
  readonly state?: 'running' | 'done' | 'error'
}

/** 有内容的一栏。 */
export interface ActivitySection {
  readonly id: string
  /** 18px 网格的图标源码（与左栏/设置页同一批图标风格）。 */
  readonly icon: string
  readonly label: string
  readonly items: readonly ActivityItem[]
}

/** 一次折叠的产物：只有非空的栏。 */
export interface SessionActivity {
  readonly sections: readonly ActivitySection[]
}

/** 只读可订阅源（本包不引 `dsh-client-store` 的类型，形状够用即可）。 */
export interface ActivitySource {
  getSnapshot(): SessionActivity
  subscribe(listener: () => void): () => void
}

const ICON_ENV = '<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="3"/><path d="M8 1v3M8 12v3M1 8h3M12 8h3"/></svg>'
const ICON_PROCS = '<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3v2M8 11v2M3 8h2M11 8h2M4.93 4.93l1.41 1.41M9.66 9.66l1.41 1.41M4.93 11.07l1.41-1.41M9.66 6.34l1.41-1.41"/></svg>'
const ICON_SKILLS = '<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2l-3 6h3l-2 6 3-6h-3z"/></svg>'
const ICON_OUTPUTS = '<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 4.5l4.5-2.5 4.5 2.5v5l-4.5 2.5-4.5-2.5v-5z"/><path d="M8 7v5"/></svg>'
const ICON_WEB = '<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="7" cy="7" r="4.4"/><path d="M10.4 10.4L14 14"/></svg>'
const ICON_SOURCES = '<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 3h8v10H4z"/><path d="M4 3v10a2 2 0 002 2h6"/></svg>'

/** 栏的固定次序（与参照形态一致）。 */
const SECTIONS = [
  { id: 'env', icon: ICON_ENV, label: '环境信息' },
  { id: 'background-procs', icon: ICON_PROCS, label: '后台进程' },
  { id: 'skills-mcp', icon: ICON_SKILLS, label: '技能与 MCP' },
  { id: 'outputs', icon: ICON_OUTPUTS, label: '产出' },
  { id: 'web-search', icon: ICON_WEB, label: '网页查阅' },
  { id: 'sources', icon: ICON_SOURCES, label: '来源' },
] as const

type SectionId = (typeof SECTIONS)[number]['id']

/** 写文件的工具名（产出栏）。 */
const WRITE_TOOLS = new Set(['write', 'edit', 'multi_edit', 'str_replace_editor', 'apply_patch', 'create_file'])
/** 联网工具名（网页查阅栏）。 */
const WEB_TOOLS = new Set(['web_search', 'web_fetch'])
/** 起进程的工具名（后台进程栏）。 */
const SHELL_TOOLS = new Set(['bash', 'shell', 'run_command', 'exec'])
/** 任务的工具名（后台进程栏：它们操作的就是那些 job）。 */
const JOB_TOOLS = new Set(['job_list', 'job_output', 'job_kill', 'job_wait'])

/** 单行标签的最长字符数。 */
const MAX_LABEL = 72
/** 每栏最多列出的行数（多出的折成一行计数）。 */
const MAX_ITEMS = 8

/** 截断长文案（命令行、URL）。 */
function clip(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim()
  return oneLine.length > MAX_LABEL ? `${oneLine.slice(0, MAX_LABEL)}…` : oneLine
}

/** 从模型给的原始 JSON 串里取一个字符串字段。 */
function argString(argsRaw: string, keys: readonly string[]): string | undefined {
  try {
    const parsed: unknown = JSON.parse(argsRaw)
    if (parsed === null || typeof parsed !== 'object') return undefined
    for (const key of keys) {
      const value = (parsed as Record<string, unknown>)[key]
      if (typeof value === 'string' && value !== '') return value
    }
  } catch {
    // 模型给的参数不是合法 JSON（流式截断/手写）时没有可读字段可取：落回工具名。
  }
  return undefined
}

/** `web_search` 的查询词（`queries[]` 或 `query`）。 */
function searchQuery(argsRaw: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(argsRaw)
    if (parsed === null || typeof parsed !== 'object') return undefined
    const record = parsed as Record<string, unknown>
    if (Array.isArray(record['queries'])) {
      const joined = record['queries'].filter((q): q is string => typeof q === 'string').join('、')
      if (joined !== '') return joined
    }
    if (typeof record['query'] === 'string') return record['query']
  } catch {
    // 同上：没有可读查询词就不猜。
  }
  return undefined
}

/** 从标题、网址或路径里取一个短名（来源栏用）。 */
function shortName(raw: string): string {
  const withoutQuery = raw.split('?')[0] ?? raw
  const parts = withoutQuery.split('/').filter((part) => part !== '')
  return parts.length === 0 ? raw : (parts[parts.length - 1] ?? raw)
}

/** 一栏的累积器。 */
interface Bucket {
  readonly items: ActivityItem[]
  readonly seen: Set<string>
  overflow: number
}

function add(bucket: Bucket, item: ActivityItem): void {
  if (bucket.seen.has(item.label)) return
  bucket.seen.add(item.label)
  if (bucket.items.length >= MAX_ITEMS) {
    bucket.overflow += 1
    return
  }
  bucket.items.push(item)
}

/**
 * 把一个会话的事件窗口折成「有内容的栏」。
 * @param entries - 事件窗口的条目（只读；`transient` 条目忽略）。
 * @returns 只有非空栏的活动视图；空白会话得到 `{ sections: [] }`。
 */
export function foldSessionActivity(entries: readonly ActivityEventEntry[]): SessionActivity {
  const buckets = new Map<SectionId, Bucket>()
  const bucket = (id: SectionId): Bucket => {
    const existing = buckets.get(id)
    if (existing !== undefined) return existing
    const created: Bucket = { items: [], seen: new Set(), overflow: 0 }
    buckets.set(id, created)
    return created
  }
  /** callId → 它在哪一栏的哪一行（结果回来时回填状态）。 */
  const pending = new Map<string, ActivityItem[]>()

  for (const entry of entries) {
    if (entry.type !== 'event' || entry.event === undefined) continue
    const event = entry.event
    const data = event['data']
    if (data === undefined) continue
    switch (event['type']) {
      case 'tool/call': {
        const callId = typeof data['callId'] === 'string' ? data['callId'] : undefined
        const name = typeof data['name'] === 'string' ? data['name'] : ''
        const rawArgs = typeof data['arguments'] === 'string' ? data['arguments'] : '{}'
        const placed: ActivityItem[] = []

        if (WEB_TOOLS.has(name)) {
          const label = name === 'web_fetch'
            ? `读取 ${clip(argString(rawArgs, ['url']) ?? '网页')}`
            : `搜索 ${clip(searchQuery(rawArgs) ?? '关键词')}`
          const item: ActivityItem = { label, meta: name === 'web_fetch' ? '抓取' : '搜索', state: 'running' }
          add(bucket('web-search'), item)
          placed.push(item)
        } else if (WRITE_TOOLS.has(name)) {
          const path = argString(rawArgs, ['file_path', 'path', 'file', 'target_file'])
          const item: ActivityItem = { label: clip(path ?? name), meta: '文件', state: 'running' }
          add(bucket('outputs'), item)
          placed.push(item)
        } else if (SHELL_TOOLS.has(name) || JOB_TOOLS.has(name)) {
          const command = name === 'bash' ? argString(rawArgs, ['command', 'cmd']) : undefined
          const item: ActivityItem = { label: clip(command ?? name), meta: '命令', state: 'running' }
          add(bucket('background-procs'), item)
          placed.push(item)
        } else if (name === 'skill' || name.startsWith('mcp__') || name.includes('__')) {
          const skill = argString(rawArgs, ['name', 'skill', 'command'])
          const item: ActivityItem = { label: clip(skill ?? name), meta: name.startsWith('mcp__') ? 'MCP' : '技能', state: 'running' }
          add(bucket('skills-mcp'), item)
          placed.push(item)
        }

        if (callId !== undefined && placed.length > 0) pending.set(callId, placed)
        break
      }
      case 'tool/result': {
        const message = data['message'] as { source?: { callId?: unknown }; content?: readonly unknown[] } | undefined
        const callId = typeof message?.source?.callId === 'string' ? message.source.callId : undefined
        if (callId === undefined) break
        const items = pending.get(callId)
        if (items === undefined) break
        pending.delete(callId)
        const block = message?.content?.[0] as { isError?: unknown } | undefined
        const failed = data['error'] !== undefined || block?.isError === true
        for (const item of items) {
          const next: ActivityItem = { ...item, state: failed ? 'error' : 'done' }
          const index = items.indexOf(item)
          items[index] = next
          replaceItem(buckets, item.label, next)
        }
        break
      }
      case 'deliverables/presented': {
        const files = data['files']
        if (!Array.isArray(files)) break
        for (const file of files) {
          const path = file !== null && typeof file === 'object' && typeof (file as { path?: unknown }).path === 'string'
            ? (file as { path: string }).path
            : undefined
          if (path !== undefined) add(bucket('outputs'), { label: clip(path), meta: '交付', state: 'done' })
        }
        break
      }
      case 'user/message': {
        const content = data['content']
        if (!Array.isArray(content)) break
        for (const block of content) {
          if (block === null || typeof block !== 'object') continue
          const kind = (block as { type?: unknown }).type
          if (kind !== 'image' && kind !== 'file') continue
          const record = block as { name?: unknown; url?: unknown; path?: unknown }
          const raw = [record.name, record.path, record.url].find((value): value is string => typeof value === 'string' && value !== '')
          add(bucket('sources'), { label: clip(raw === undefined ? (kind === 'image' ? '图片' : '文件') : shortName(raw)), meta: kind === 'image' ? '图片' : '文件' })
        }
        break
      }
      default:
        break
    }
  }

  const sections: ActivitySection[] = []
  for (const definition of SECTIONS) {
    if (definition.id === 'env') continue // 环境信息来自 git 状态，由视图层补（见 activity-body）
    const filled = buckets.get(definition.id)
    if (filled === undefined || filled.items.length === 0) continue
    const items = filled.overflow > 0
      ? [...filled.items, { label: `还有 ${filled.overflow} 条`, meta: '' }]
      : filled.items
    sections.push({ id: definition.id, icon: definition.icon, label: definition.label, items })
  }
  return { sections }
}

/** 结果回来时把同一行换成终态（按标签定位，标签在同一栏内唯一）。 */
function replaceItem(buckets: Map<SectionId, Bucket>, label: string, next: ActivityItem): void {
  for (const filled of buckets.values()) {
    const index = filled.items.findIndex((item) => item.label === label)
    if (index >= 0) {
      filled.items[index] = next
      return
    }
  }
}

/** 栏的图标（视图层画表头用；`env` 不在折叠输出里，由视图层按 git 状态补）。 */
export const SECTION_ICONS: { readonly [id in SectionId]: string } = {
  env: ICON_ENV,
  'background-procs': ICON_PROCS,
  'skills-mcp': ICON_SKILLS,
  outputs: ICON_OUTPUTS,
  'web-search': ICON_WEB,
  sources: ICON_SOURCES,
}

/**
 * 包一层带记忆的源：窗口没变（`revision` 相同）就不重算，快照引用保持稳定。
 * @param window - 原生的事件窗口源。
 * @returns 折叠后的活动源，可交给注册的 `hooks` 隔间。
 */
export function activitySource(window: {
  getSnapshot(): { entries: readonly ActivityEventEntry[]; revision?: unknown }
  subscribe(listener: () => void): () => void
}): ActivitySource {
  let cache: { revision: unknown; value: SessionActivity } | undefined
  return {
    getSnapshot(): SessionActivity {
      const snapshot = window.getSnapshot()
      if (cache !== undefined && cache.revision === snapshot.revision) return cache.value
      const value = foldSessionActivity(snapshot.entries)
      cache = { revision: snapshot.revision, value }
      return value
    },
    subscribe(listener: () => void): () => void {
      return window.subscribe(listener)
    },
  }
}
