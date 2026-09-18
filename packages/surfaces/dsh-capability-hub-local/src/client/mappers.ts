/**
 * 五切片 mapper：既有 loopback 路由响应 → `CapabilityItem[]`。
 *
 * ## 契约冻结（S0b 决策，docs/research/15-capability-catalog-sources.md）
 *
 * 各路由的响应形状目前是**无类型约定**——上游包改形状时，本模块是第一现场。
 * 每个 mapper 都是纯函数，配套 `tests/mappers.spec.ts` 用逐字段冻结的样本响应
 * 锁形状：上游改形状时测试先红（漂移警报），绝不静默漂移。样本取自各路由
 * handler 的真实构造代码（文件路径写在各 mapper 注释里）。
 *
 * ## 防御姿势
 *
 * 聚合层对切片只发起 GET、只读响应：每一层都探测（数组/函数检查）而非假设，
 * 形状不对产出空数组（missing=false, error=说明）——一个切片的形状漂移不拖垮
 * 整个命令面板。这与「可选服务的读法：失败态按最保守结论走」同一纪律。
 * @module dsh-capability-hub-local/client/mappers
 */
import type { CapabilityItem, SkillLine } from './types.ts'

/** 技能行（itemRecord，`dsh-overseas-skills/lib/index.js` 的 itemRecord()）。 */
interface SkillItemRecord {
  name?: string
  title?: string
  icon?: string
  description?: string
  descriptionZh?: string
  modelEnabled?: boolean
  toolGap?: string
  installed?: boolean
  template?: { lead?: string } | string | null
}

/** /list 家族响应（handleList/handleFullstackList/handleGenericList）。 */
interface SkillsListResponse {
  ok?: boolean
  scenarios?: unknown[]
  groups?: Array<{
    key?: string
    title?: string
    scenario?: string
    icon?: string
    items?: SkillItemRecord[]
  }>
}

/**
 * 技能三线的统一 mapper。
 * @param body - /api/dsh-overseas-skills/{list,fullstack-list,generic-list} 响应 JSON。
 * @param line - 技能线。
 * @param route - 取数路由（写入 source 溯源）。
 * @returns 投影条目；形状不对时为空数组。
 */
export function mapSkills(body: unknown, line: SkillLine, route: string): CapabilityItem[] {
  const response = body as SkillsListResponse | undefined
  if (response === null || typeof response !== 'object' || !Array.isArray(response.groups)) return []
  const slice = `skill-${line}`
  const items: CapabilityItem[] = []
  for (const group of response.groups) {
    if (group === null || typeof group !== 'object' || !Array.isArray(group.items)) continue
    const groupTags = [group.key, group.title, group.scenario]
      .filter((value): value is string => typeof value === 'string' && value !== '')
      .map((value) => value.toLowerCase())
    for (const record of group.items) {
      if (record === null || typeof record !== 'object' || typeof record.name !== 'string' || record.name === '') continue
      const title = typeof record.title === 'string' && record.title !== '' ? record.title : record.name
      const summary = typeof record.descriptionZh === 'string' && record.descriptionZh !== ''
        ? record.descriptionZh
        : (typeof record.description === 'string' ? record.description : '')
      const installed = record.installed === true
      const modelEnabled = record.modelEnabled === true
      // 可用性三态：未安装 = absent；装了但模型开关关着 = disabled；其余 ready。
      // toolGap 是供给告警不是执行障碍，放 nativeStatus。
      const availability = !installed ? 'absent' : (!modelEnabled ? 'disabled' : 'ready')
      const lead = typeof record.template === 'object' && record.template !== null
        ? record.template.lead
        : undefined
      const prompt = typeof lead === 'string' && lead !== '' ? lead : `使用技能 /${record.name}`
      items.push({
        id: record.name,
        kind: 'skill',
        line,
        title,
        summary,
        tags: [...groupTags, title.toLowerCase(), record.name.toLowerCase()],
        availability,
        nativeStatus: typeof record.toolGap === 'string' && record.toolGap !== '' ? record.toolGap : undefined,
        action: { type: 'execute-skill', skillName: record.name, prompt },
        source: { slice, route },
      })
    }
  }
  return items
}

/** toolMeta（`dsh-wanzh-hulian/lib/business-meta.js` 的 staticToolMetaFor 结构）。 */
interface ToolMeta {
  tools?: Array<{
    name?: string
    description?: string
    businessName?: string
    businessDesc?: string
    scene?: string
    readWrite?: string
    /** 每工具示例口令。上游静态保底当前**不下发**该字段（只下发服务器级 example），
     *  这里保留读取以便上游暴露后自动生效——见 README 的 Known Limitations。 */
    example?: string
  }>
  scenes?: string[]
  example?: string
  source?: string
}

/** /mcp-servers 响应（`dsh-wanzh-hulian/lib/index.js` 的 disposeMcpList handler）。 */
interface McpServersResponse {
  ok?: boolean
  servers?: Array<{
    id?: string
    name?: string
    enabled?: boolean
    state?: { enabled?: boolean; status?: string } | null
    toolMeta?: ToolMeta | null
  }>
}

/**
 * MCP 工具业务清单 mapper。
 * @param body - /api/dsh-wanzh-hulian/mcp-servers 响应 JSON。
 * @param route - 取数路由。
 * @returns 投影条目；形状不对时为空数组。
 */
export function mapMcpTools(body: unknown, route: string): CapabilityItem[] {
  const response = body as McpServersResponse | undefined
  if (response === null || typeof response !== 'object' || !Array.isArray(response.servers)) return []
  const items: CapabilityItem[] = []
  for (const server of response.servers) {
    if (server === null || typeof server !== 'object' || typeof server.id !== 'string' || server.id === '') continue
    const toolMeta = server.toolMeta
    if (toolMeta === null || typeof toolMeta !== 'object' || !Array.isArray(toolMeta.tools)) continue
    // 状态读 state（实时）优先于 enabled（声明）；两者都可缺。
    const enabled = (server.state !== null && server.state !== undefined && typeof server.state === 'object'
      ? server.state.enabled === true
      : server.enabled !== false)
    const serverLabel = typeof server.name === 'string' && server.name !== '' ? server.name : server.id
    for (const tool of toolMeta.tools) {
      if (tool === null || typeof tool !== 'object' || typeof tool.name !== 'string' || tool.name === '') continue
      const title = typeof tool.businessName === 'string' && tool.businessName !== '' ? tool.businessName : tool.name
      const summary = typeof tool.businessDesc === 'string' && tool.businessDesc !== ''
        ? tool.businessDesc
        : (typeof tool.description === 'string' ? tool.description : '')
      const scene = typeof tool.scene === 'string' ? tool.scene.toLowerCase() : ''
      // 提示词必须**工具专属**：服务器级 `toolMeta.example` 是整台服务器的样例口令，
      // 拿它当每个工具的执行句会让 101 个工具预填同一句话（浏览器验收实测到的缺陷）。
      // 每工具 example 优先（上游暴露即生效），否则由业务名 + 何时用合成。
      const prompt = typeof tool.example === 'string' && tool.example !== ''
        ? tool.example
        : `请用「${title}」${summary === '' ? '' : `：${summary}`}`
      items.push({
        id: `${server.id}::${tool.name}`,
        kind: 'mcp-tool',
        title,
        summary,
        // 去重：serverLabel 与 server.id 常常同值（服务器没有独立显示名时），
        // 重复 tag 会让「tag 全等」评分白占两个位次。
        tags: [...new Set([serverLabel.toLowerCase(), server.id.toLowerCase(), scene, title.toLowerCase()].filter((tag) => tag !== ''))],
        availability: enabled ? 'ready' : 'disabled',
        nativeStatus: tool.readWrite === 'write' || tool.readWrite === 'execute' ? `readWrite:${tool.readWrite}` : undefined,
        action: { type: 'prefill-draft', prompt },
        source: { slice: 'mcp-tool', route },
      })
    }
  }
  return items
}

/** RoleCard（`dsh-role-matrix-local/src/collect.ts` 的 collectRoleMatrix 产物）。 */
interface RoleCardLike {
  id?: string
  agt?: string
  alias?: string
  title?: string
  name?: string
  description?: string
  planeName?: string
  domainName?: string
  lifecycleStatus?: string
  productionAuthorized?: boolean
  degraded?: boolean
}

/** /list 响应（MatrixPayload：planes[].domains[].roles[]）。 */
interface RoleMatrixResponse {
  root?: string
  scannedAt?: string
  planes?: Array<{ domains?: Array<{ roles?: RoleCardLike[] }> }>
  totals?: { roles?: number; degraded?: number }
}

/**
 * 岗位矩阵 mapper。
 * @param body - /api/dsh-role-matrix/list 响应 JSON。
 * @param route - 取数路由。
 * @returns 投影条目；形状不对时为空数组。
 */
export function mapRoles(body: unknown, route: string): CapabilityItem[] {
  const response = body as RoleMatrixResponse | undefined
  if (response === null || typeof response !== 'object' || !Array.isArray(response.planes)) return []
  const items: CapabilityItem[] = []
  for (const plane of response.planes) {
    if (plane === null || typeof plane !== 'object' || !Array.isArray(plane.domains)) continue
    for (const domain of plane.domains) {
      if (domain === null || typeof domain !== 'object' || !Array.isArray(domain.roles)) continue
      for (const role of domain.roles) {
        if (role === null || typeof role !== 'object' || typeof role.id !== 'string' || role.id === '') continue
        const title = typeof role.title === 'string' && role.title !== '' ? role.title : role.id
        const summary = typeof role.description === 'string' ? role.description : ''
        const tags = [role.planeName, role.domainName, role.alias, title]
          .filter((value): value is string => typeof value === 'string' && value !== '')
          .map((value) => value.toLowerCase())
        // 首版动作是打开岗位矩阵（预填 prompt 拼装是 S0b 开放风险 #3，留待与
        // hero SupplyCard 既有逻辑对齐，不造第二套拼装）。
        items.push({
          id: role.id,
          kind: 'role',
          title,
          summary,
          tags: [...new Set(tags)],
          availability: role.degraded === true ? 'degraded' : 'ready',
          nativeStatus: typeof role.lifecycleStatus === 'string' && role.lifecycleStatus !== '' ? role.lifecycleStatus : undefined,
          action: { type: 'open-panel', view: 'roles' },
          source: { slice: 'role', route },
        })
      }
    }
  }
  return items
}

/** DeclaredProduct（`dsh-newapp-local/src/products.ts` 的 parseProductDeclaration 产物）。 */
interface DeclaredProductLike {
  id?: string
  name?: string
  summary?: string
  status?: string
  statusReason?: string
  preset?: string
}

/** /products 响应（scanProducts 的 ScanReport + ok/owns）。 */
interface ProductsResponse {
  ok?: boolean
  cards?: Array<{ dir?: string; label?: string; products?: DeclaredProductLike[] }>
}

/**
 * 产品卡 mapper。
 * @param body - /api/dsh-newapp/products 响应 JSON。
 * @param route - 取数路由。
 * @returns 投影条目；形状不对时为空数组。
 */
export function mapProducts(body: unknown, route: string): CapabilityItem[] {
  const response = body as ProductsResponse | undefined
  if (response === null || typeof response !== 'object' || !Array.isArray(response.cards)) return []
  const items: CapabilityItem[] = []
  for (const card of response.cards) {
    if (card === null || typeof card !== 'object' || !Array.isArray(card.products)) continue
    const dirLabel = typeof card.label === 'string' && card.label !== '' ? card.label : (card.dir ?? '')
    for (const product of card.products) {
      if (product === null || typeof product !== 'object' || typeof product.id !== 'string' || product.id === '') continue
      const title = typeof product.name === 'string' && product.name !== '' ? product.name : product.id
      items.push({
        id: `${dirLabel}::${product.id}`,
        kind: 'product',
        title,
        summary: typeof product.summary === 'string' ? product.summary : '',
        tags: [dirLabel.toLowerCase(), title.toLowerCase(),
          ...(typeof product.preset === 'string' && product.preset !== '' ? [product.preset.toLowerCase()] : [])],
        // draft = 还没到能用的状态（statusReason 说明原因）；ready 才可开卡。
        availability: product.status === 'ready' ? 'ready' : 'degraded',
        nativeStatus: product.statusReason !== undefined && product.statusReason !== ''
          ? product.statusReason
          : (typeof product.status === 'string' && product.status !== '' ? `status:${product.status}` : undefined),
        action: { type: 'open-panel', view: 'applications' },
        source: { slice: 'product', route },
      })
    }
  }
  return items
}

/** CatalogSystem（`dsh-newapp-local/src/systems.ts` 的 loadSystems 产物）。 */
interface CatalogSystemLike {
  slug?: string
  name?: string
  desc?: string
  kind?: string
  tags?: string[]
  primary?: string
  reachable?: boolean
  loginRequired?: boolean
}

/** /systems 响应（loadSystems 的 SystemsPayload + openRoute）。 */
interface SystemsResponse {
  ok?: boolean
  systems?: CatalogSystemLike[]
}

/**
 * 业务系统 mapper。
 * @param body - /api/dsh-newapp/systems 响应 JSON。
 * @param route - 取数路由。
 * @returns 投影条目；形状不对时为空数组。
 */
export function mapSystems(body: unknown, route: string): CapabilityItem[] {
  const response = body as SystemsResponse | undefined
  if (response === null || typeof response !== 'object' || !Array.isArray(response.systems)) return []
  const items: CapabilityItem[] = []
  for (const system of response.systems) {
    if (system === null || typeof system !== 'object' || typeof system.slug !== 'string' || system.slug === '') continue
    const title = typeof system.name === 'string' && system.name !== '' ? system.name : system.slug
    const tags = [system.kind, ...(Array.isArray(system.tags) ? system.tags : []), system.primary]
      .filter((value): value is string => typeof value === 'string' && value !== '')
      .map((value) => value.toLowerCase())
    // 不可达 / 需登录都能打开（浏览器自己会说明），但执行前该知道：degraded。
    const availability = system.reachable === true && system.loginRequired !== true ? 'ready' : 'degraded'
    const nativeParts: string[] = []
    if (system.reachable !== true) nativeParts.push('不可达')
    if (system.loginRequired === true) nativeParts.push('需登录')
    items.push({
      id: system.slug,
      kind: 'system',
      title,
      summary: typeof system.desc === 'string' ? system.desc : '',
      tags: [...new Set([...tags, title.toLowerCase()])],
      availability,
      nativeStatus: nativeParts.length > 0 ? nativeParts.join(' · ') : undefined,
      action: { type: 'open-system', slug: system.slug },
      source: { slice: 'system', route },
    })
  }
  return items
}
