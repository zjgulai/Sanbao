/**
 * 命令面板的搜索与评分。
 *
 * 刻意不引 fuzzy 库（依赖纪律）：中英混排（技能中文标题 + 英文场景 key）下，
 * 子串命中 + 子序列兜底的简单评分已够第一版；中英混合查询的真实表现是 S0b
 * 开放风险 #1，实测不满意再换算法，接口不变。
 * @module dsh-capability-hub-local/client/search
 */
import type { CapabilityItem, CapabilityKind } from './types.ts'

/** 一个命中结果：条目 + 得分。 */
export interface ScoredItem {
  item: CapabilityItem
  score: number
}

/**
 * 空查询时的切片展示优先级。
 *
 * 这不是审美排序，是「用户想干 X」的命中概率排序：技能是主要能力面（377 条），
 * 岗位是任务的入口（50 条），产品与系统是去处，MCP 工具最底层——它们是模型调用的
 * 对象，用户直接搜工具的频率最低。**不能沿用取数顺序**：那等于让 `Promise.all`
 * 的返回顺序决定信息架构（实测首屏 50 条全是工具，技能一条都看不见）。
 */
const KIND_ORDER: readonly CapabilityKind[] = ['skill', 'role', 'product', 'system', 'mcp-tool']

/** 空查询时每个切片最多展示几条（五个切片 × 10 = 单屏上限）。 */
const DEFAULT_PER_KIND = 10

/**
 * 空查询的默认视图：按切片优先级分块，每块取前 N 条。
 *
 * 目录有约 560 条而单屏只渲染 50 条，所以「默认展示什么」本身就是信息架构决策：
 * 分块保证五个切片都可见（用户一眼看到能力图谱有哪几类），而不是被最大的切片淹没。
 * @param items - 全部条目（目录原序）。
 * @param perKind - 每切片条数上限。
 * @returns 分块后的条目。
 */
export function defaultView(items: readonly CapabilityItem[], perKind: number = DEFAULT_PER_KIND): CapabilityItem[] {
  const buckets = new Map<CapabilityKind, CapabilityItem[]>()
  for (const item of items) {
    const bucket = buckets.get(item.kind)
    if (bucket === undefined) buckets.set(item.kind, [item])
    else bucket.push(item)
  }
  const view: CapabilityItem[] = []
  for (const kind of KIND_ORDER) {
    const bucket = buckets.get(kind)
    if (bucket === undefined) continue
    for (const item of bucket.slice(0, perKind)) view.push(item)
  }
  return view
}

/**
 * 对条目列表打分过滤。
 *
 * 空查询走 {@link defaultView}（分块默认视图）；有查询时评分（降序稳定）：
 * 标题子串 100 > tag 全等 60 > tag 子串 40 > 摘要子串 20 > 标题子序列 10。
 * @param items - 候选条目。
 * @param query - 用户查询（任意大小写/首尾空白）。
 * @returns 命中列表（空查询时 score 全为 0，顺序即默认视图顺序）。
 */
export function searchItems(items: readonly CapabilityItem[], query: string): ScoredItem[] {
  const normalized = query.trim().toLowerCase()
  if (normalized === '') return defaultView(items).map((item) => ({ item, score: 0 }))
  const scored: ScoredItem[] = []
  for (const item of items) {
    const title = item.title.toLowerCase()
    let score = 0
    if (title.includes(normalized)) score = 100
    else if (item.tags.includes(normalized)) score = 60
    else if (item.tags.some((tag) => tag.includes(normalized))) score = 40
    else if (item.summary.toLowerCase().includes(normalized)) score = 20
    else if (isSubsequence(normalized, title)) score = 10
    if (score > 0) scored.push({ item, score })
  }
  return scored.sort((a, b) => b.score - a.score)
}

/**
 * `needle` 是否是 `haystack` 的子序列（保序不保连续）。
 * @param needle - 查询（已归一化）。
 * @param haystack - 目标（已归一化）。
 */
function isSubsequence(needle: string, haystack: string): boolean {
  let cursor = 0
  for (const char of haystack) {
    if (cursor < needle.length && char === needle[cursor]) cursor += 1
  }
  return cursor === needle.length
}
