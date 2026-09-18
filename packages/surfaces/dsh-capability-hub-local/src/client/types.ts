/**
 * 统一能力目录的类型契约（S0b 定稿，docs/research/15-capability-catalog-sources.md）。
 *
 * 一个 `CapabilityItem` 是五个能力切片之一的**只读投影**：技能（三线）、MCP 工具、
 * 岗位、产品、业务系统。聚合层不拥有任何事实——每个字段都来自既有 loopback 路由
 * 的实时读数，路由响应的形状由 mapper 单测冻结（上游改形状时测试先红，这是漂移
 * 警报，不是静默漂移）。
 * @module dsh-capability-hub-local/client/types
 */

/** 能力切片。 */
export type CapabilityKind =
  | 'skill'
  | 'mcp-tool'
  | 'role'
  | 'product'
  | 'system'

/** 技能线（仅 kind: 'skill' 有）。 */
export type SkillLine = 'overseas' | 'fullstack' | 'generic'

/**
 * 归一化的可用性。命令面板只需要知道「能不能执行」；各切片的原生状态语义
 * （reachable / loginRequired / lifecycleStatus / draft-ready…）放
 * {@link CapabilityItem.nativeStatus} 供详情展示——强行全归一会丢信息。
 */
export type CapabilityAvailability =
  | 'ready'
  | 'degraded'
  | 'disabled'
  | 'absent'

/**
 * 执行动作。判别联合：五个切片的执行机制完全不同（事件 / 预填 / 视图切换 /
 * 开系统），字符串方案无法承载——由 dispatcher 按 `type` 分发。
 */
export type CapabilityAction =
  | { type: 'execute-skill'; skillName: string; prompt: string }
  | { type: 'prefill-draft'; prompt: string }
  | { type: 'open-panel'; view: 'chat' | 'applications' | 'extensions' | 'roles' }
  | { type: 'open-system'; slug: string }

/** 一个可搜索、可执行的能力条目。 */
export interface CapabilityItem {
  /** 切片内唯一：技能 name / 岗位 preset id / `<dir>::<productId>` / 系统 slug。 */
  id: string
  kind: CapabilityKind
  /** 归属技能线（仅 skill）。 */
  line?: SkillLine
  /** 展示名：中文名 / 业务名优先于工具名。 */
  title: string
  /** 人话摘要（何时用）。 */
  summary: string
  /** 搜索/分组词（场景、细分、plane、tags），统一小写。 */
  tags: string[]
  availability: CapabilityAvailability
  /** 原生状态语义，供详情展示。 */
  nativeStatus?: string
  action: CapabilityAction
  /** 溯源：来自哪个切片的哪条路由。 */
  source: { slice: string; route: string }
}

/** 一个切片的取数结果。 */
export interface SliceResult {
  /** 切片名（source.slice 同值）。 */
  slice: string
  items: CapabilityItem[]
  /** 路由不存在（404）或包未安装：空切片，非错误。 */
  missing: boolean
  /** 取数失败（非 404）：错误描述。 */
  error?: string
}

/** 整个目录的取数结果。 */
export interface CatalogResult {
  slices: SliceResult[]
  fetchedAt: number
}

/** fetch 响应，收窄到本包实际读的四项（全局 `fetch` 结构上满足）。 */
export interface FetchResponse {
  ok: boolean
  status: number
  json(): Promise<unknown>
}

/**
 * fetch 的可注入面（测试替身入口）。
 *
 * 取数与执行两侧共用同一个类型：目录取数要 `signal`（面板关闭时中止在途请求），
 * `open-system` 要 `method`/`headers`/`body`。分成两个类型会让「全局 fetch 同时
 * 满足两者」这件事在类型上说不通。
 */
export type FetchLike = (route: string, init?: {
  method?: string
  headers?: Record<string, string>
  body?: string
  signal?: AbortSignal
}) => Promise<FetchResponse>

