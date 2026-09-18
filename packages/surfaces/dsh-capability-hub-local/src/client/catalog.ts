/**
 * 能力目录聚合器：并发取五切片路由，产出 `CatalogResult`。
 *
 * ## 取数纪律（S0b 决策）
 *
 * - **不加轮询**：`/api/dsh-overseas-skills/list` 已被胶囊组件每 2 秒轮询，聚合层
 *   打开命令面板时取一次、手动刷新再取——不叠负担。
 * - **404 是正常态**：某切片的包未安装（如 productRoots 为空、role-matrix 缺席）
 *   时该路由不存在，记 `missing`（空切片），不是错误。
 * - **单切片失败不拖垮面板**：每个切片独立 try/catch，失败记 error，其余照常。
 * - **MCP 慢路由可容忍**：`/mcp-servers` 实时抓取可能慢，fetch 带 AbortSignal
 *   由调用方决定等不等。
 * @module dsh-capability-hub-local/client/catalog
 */
import { mapMcpTools, mapProducts, mapRoles, mapSkills, mapSystems } from './mappers.ts'
import type { CatalogResult, FetchLike, SliceResult } from './types.ts'

/** 聚合层消费的全部路由（也是 COMPOSED_SOURCES 契约清单的单一事实源）。 */
export const CAPABILITY_ROUTES = {
  overseasSkills: '/api/dsh-overseas-skills/list',
  fullstackSkills: '/api/dsh-overseas-skills/fullstack-list',
  genericSkills: '/api/dsh-overseas-skills/generic-list',
  mcpServers: '/api/dsh-wanzh-hulian/mcp-servers',
  roles: '/api/dsh-role-matrix/list',
  products: '/api/dsh-newapp/products',
  systems: '/api/dsh-newapp/systems',
} as const

/** fetch 的可注入面（定义在 types.ts：取数与执行两侧共用同一个类型）。 */
export type { FetchLike }

/**
 * 取一个路由并映射为一个切片结果。
 * @param fetchLike - fetch 实现。
 * @param route - 路由。
 * @param map - 响应映射函数。
 * @param slice - 切片名。
 * @param signal - 取消信号。
 */
async function fetchSlice(
  fetchLike: FetchLike,
  route: string,
  slice: string,
  map: (body: unknown, route: string) => SliceResult['items'],
  signal?: AbortSignal,
): Promise<SliceResult> {
  try {
    const response = await fetchLike(route, { signal })
    if (response.status === 404) return { slice, items: [], missing: true }
    if (!response.ok) return { slice, items: [], missing: false, error: `HTTP ${response.status}` }
    const body = await response.json()
    return { slice, items: map(body, route), missing: false }
  } catch (error) {
    if (signal?.aborted === true) return { slice, items: [], missing: false, error: 'aborted' }
    return { slice, items: [], missing: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * 并发取全部能力切片。
 * @param fetchLike - fetch 实现（浏览器即全局 fetch）。
 * @param signal - 取消信号（面板关闭时可中止在途请求）。
 * @returns 聚合结果（永不抛出）。
 */
export async function fetchCatalog(fetchLike: FetchLike, signal?: AbortSignal): Promise<CatalogResult> {
  const slices = await Promise.all([
    fetchSlice(fetchLike, CAPABILITY_ROUTES.overseasSkills, 'skill', (body, route) => mapSkills(body, 'overseas', route), signal),
    fetchSlice(fetchLike, CAPABILITY_ROUTES.fullstackSkills, 'skill', (body, route) => mapSkills(body, 'fullstack', route), signal),
    fetchSlice(fetchLike, CAPABILITY_ROUTES.genericSkills, 'skill', (body, route) => mapSkills(body, 'generic', route), signal),
    fetchSlice(fetchLike, CAPABILITY_ROUTES.mcpServers, 'mcp-tool', (body, route) => mapMcpTools(body, route), signal),
    fetchSlice(fetchLike, CAPABILITY_ROUTES.roles, 'role', (body, route) => mapRoles(body, route), signal),
    fetchSlice(fetchLike, CAPABILITY_ROUTES.products, 'product', (body, route) => mapProducts(body, route), signal),
    fetchSlice(fetchLike, CAPABILITY_ROUTES.systems, 'system', (body, route) => mapSystems(body, route), signal),
  ])
  return { slices: mergeSkillSlices(slices), fetchedAt: Date.now() }
}

/**
 * 把三条技能线路由的切片合并为一个 `skill` 切片（line 留在条目上）。
 * @param slices - 原始切片列表。
 * @returns 合并后的列表。
 */
function mergeSkillSlices(slices: SliceResult[]): SliceResult[] {
  const skillSlices = slices.filter((slice) => slice.slice === 'skill')
  const rest = slices.filter((slice) => slice.slice !== 'skill')
  const items = skillSlices.flatMap((slice) => slice.items)
  const missing = skillSlices.every((slice) => slice.missing)
  const errors = skillSlices.map((slice) => slice.error).filter((error): error is string => error !== undefined)
  return [...rest, { slice: 'skill', items, missing, error: errors.length > 0 ? errors.join('; ') : undefined }]
}

/**
 * 目录的会话级缓存：打开面板时若已有结果则直接用，刷新按钮强制重取。
 * 刻意不设 TTL——新鲜度由用户手势（再次打开 / 刷新）决定，不猜。
 */
export class CapabilityCatalog {
  private result: CatalogResult | undefined

  /**
   * 当前缓存（不取数）。
   * @returns 缓存的结果，未取过时 undefined。
   */
  current(): CatalogResult | undefined {
    return this.result
  }

  /**
   * 取目录：有缓存且非强制时复用。
   * @param fetchLike - fetch 实现。
   * @param options - `force` 强制重取；`signal` 取消信号。
   * @returns 聚合结果。
   */
  async load(fetchLike: FetchLike, options: { force?: boolean; signal?: AbortSignal } = {}): Promise<CatalogResult> {
    if (this.result !== undefined && options.force !== true) return this.result
    const result = await fetchCatalog(fetchLike, options.signal)
    if (options.signal?.aborted !== true) this.result = result
    return result
  }

  /** 丢弃缓存（dispose 时调用，防跨会话陈旧）。 */
  invalidate(): void {
    this.result = undefined
  }
}
