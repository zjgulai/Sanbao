/**
 * mapper 契约冻结测试。
 *
 * 样本响应逐字段取自各路由 handler 的真实构造代码（不是想象的形状）：
 * - 技能三线：`dsh-overseas-skills/lib/index.js` 的 handleList / itemRecord
 * - MCP 工具：`dsh-wanzh-hulian/lib/index.js` 的 disposeMcpList handler + business-meta.js
 * - 岗位：`dsh-role-matrix-local/src/collect.ts` 的 MatrixPayload
 * - 产品：`dsh-newapp-local/src/products.ts` 的 ScanReport
 * - 系统：`dsh-newapp-local/src/systems.ts` 的 loadSystems
 *
 * 上游改形状时这些测试先红——这是漂移警报，不是可删的冗余断言。
 */
import { describe, expect, it } from 'vitest'
import { mapMcpTools, mapProducts, mapRoles, mapSkills, mapSystems } from '../src/client/mappers.ts'

const ROUTE = '/api/test-route'

describe('mapSkills', () => {
  /** /list 家族的真实形状：groups 是扁平视图，三线都有；scenarios 只有出海线有。 */
  const body = (items: unknown[], line = '出海'): unknown => ({
    ok: true,
    scenarios: line === '出海' ? [{ key: 'a-market', title: '市场与选品', icon: '', subs: [] }] : [],
    groups: [{ key: 'a1-sourcing', title: '选品洞察', scenario: line, icon: '', items }],
  })

  it('映射一条已安装且模型开关打开的技能为 ready', () => {
    const items = mapSkills(body([{
      name: 'amazon-product-research',
      title: '亚马逊选品研究',
      icon: '',
      description: 'Research a product line',
      descriptionZh: '用数据判断一个品值不值得做',
      modelEnabled: true,
      toolGap: '',
      installed: true,
      template: { lead: '请帮我做选品研究：' },
    }]), 'overseas', ROUTE)

    expect(items).toEqual([{
      id: 'amazon-product-research',
      kind: 'skill',
      line: 'overseas',
      title: '亚马逊选品研究',
      summary: '用数据判断一个品值不值得做',
      tags: ['a1-sourcing', '选品洞察', '出海', '亚马逊选品研究', 'amazon-product-research'],
      availability: 'ready',
      nativeStatus: undefined,
      action: { type: 'execute-skill', skillName: 'amazon-product-research', prompt: '请帮我做选品研究：' },
      source: { slice: 'skill-overseas', route: ROUTE },
    }])
  })

  it('未安装 = absent，装了但模型开关关着 = disabled', () => {
    const items = mapSkills(body([
      { name: 'not-installed', title: '未装的技能', installed: false, modelEnabled: false },
      { name: 'installed-off', title: '装了但关着', installed: true, modelEnabled: false },
    ]), 'overseas', ROUTE)

    expect(items.map((item) => item.availability)).toEqual(['absent', 'disabled'])
  })

  it('toolGap 进 nativeStatus，不当执行障碍', () => {
    const items = mapSkills(body([{
      name: 'tool-backed', title: '工具型技能', installed: true, modelEnabled: true,
      toolGap: '未接入外部工具（安装后启用）',
    }]), 'overseas', ROUTE)

    expect(items[0]?.availability).toBe('ready')
    expect(items[0]?.nativeStatus).toBe('未接入外部工具（安装后启用）')
  })

  it('没有 template 时回落到「使用技能 /name」，没有中文摘要时回落到英文 description', () => {
    const items = mapSkills(body([
      { name: 'plain-skill', title: '', installed: true, modelEnabled: true, description: 'English only' },
    ]), 'generic', ROUTE)

    expect(items[0]?.title).toBe('plain-skill')
    expect(items[0]?.summary).toBe('English only')
    expect(items[0]?.action).toEqual({ type: 'execute-skill', skillName: 'plain-skill', prompt: '使用技能 /plain-skill' })
    expect(items[0]?.line).toBe('generic')
  })

  it('形状漂移（groups 不是数组 / 条目缺 name）产出空数组而不是抛', () => {
    expect(mapSkills({ ok: true, groups: 'nope' }, 'overseas', ROUTE)).toEqual([])
    expect(mapSkills(undefined, 'overseas', ROUTE)).toEqual([])
    expect(mapSkills(body([{ title: '没有 name' }]), 'overseas', ROUTE)).toEqual([])
  })
})

describe('mapMcpTools', () => {
  /** /mcp-servers 的真实形状：servers[].toolMeta.tools[]，toolMeta 有静态保底。 */
  const body = (servers: unknown[]): unknown => ({ ok: true, oauthState: { authed: true }, health: {}, servers })

  const server = (overrides: Record<string, unknown> = {}): unknown => ({
    id: 'apify',
    name: 'Apify',
    enabled: true,
    transport: 'streamable-http',
    state: { id: 'apify', enabled: true, status: 'ok' },
    toolMeta: {
      tools: [{
        name: 'actor-run',
        description: '',
        businessName: '跑一个 Actor',
        businessDesc: '执行指定的 Actor 任务',
        scene: '数据采集',
        readWrite: 'execute',
      }],
      scenes: ['数据采集'],
      example: '帮我用 Apify 采集这些页面',
      source: 'static',
      fetchedAt: 0,
    },
    ...overrides,
  })

  it('映射一条工具为 prefill-draft，提示词是工具专属的（不是服务器级样例口令）', () => {
    const items = mapMcpTools(body([server()]), ROUTE)

    expect(items).toEqual([{
      id: 'apify::actor-run',
      kind: 'mcp-tool',
      title: '跑一个 Actor',
      summary: '执行指定的 Actor 任务',
      tags: ['apify', '数据采集', '跑一个 actor'],
      availability: 'ready',
      nativeStatus: 'readWrite:execute',
      action: { type: 'prefill-draft', prompt: '请用「跑一个 Actor」：执行指定的 Actor 任务' },
      source: { slice: 'mcp-tool', route: ROUTE },
    }])
  })

  it('上游给了每工具 example 就用它（前向兼容，不改本包即可升级文案）', () => {
    const items = mapMcpTools(body([server({
      toolMeta: { tools: [{ name: 'get_orders', businessName: '查订单列表', businessDesc: '列出订单', scene: '订单', example: '帮我查店铺最近 10 个订单' }], example: '服务器级口令' },
    })]), ROUTE)

    expect(items[0]?.action).toEqual({ type: 'prefill-draft', prompt: '帮我查店铺最近 10 个订单' })
  })

  it('同一服务器的两个工具提示词必须不同（回归：曾让 101 个工具共用一句服务器级 example）', () => {
    const items = mapMcpTools(body([server({
      toolMeta: {
        tools: [
          { name: 'get_products', businessName: '查商品列表', businessDesc: '列出商品', scene: '商品' },
          { name: 'get_orders', businessName: '查订单列表', businessDesc: '列出订单', scene: '订单' },
        ],
        example: '帮我查店铺最近 10 个订单',
      },
    })]), ROUTE)

    const prompts = items.map((item) => (item.action.type === 'prefill-draft' ? item.action.prompt : ''))
    expect(prompts).toEqual(['请用「查商品列表」：列出商品', '请用「查订单列表」：列出订单'])
    expect(new Set(prompts).size).toBe(2)
  })

  it('实时状态优先于声明：state.enabled=false 即 disabled', () => {
    const items = mapMcpTools(body([server({ state: { id: 'apify', enabled: false, status: 'error' } })]), ROUTE)
    expect(items[0]?.availability).toBe('disabled')
  })

  it('只读工具不带 readWrite 标注', () => {
    const items = mapMcpTools(body([server({
      toolMeta: { tools: [{ name: 'search', businessName: '搜索', businessDesc: '查', scene: '检索', readWrite: 'read' }], example: '' },
    })]), ROUTE)

    expect(items[0]?.nativeStatus).toBeUndefined()
    expect(items[0]?.action).toEqual({ type: 'prefill-draft', prompt: '请用「搜索」：查' })
  })

  it('toolMeta 为 null（服务器未挂载）时该服务器不产条目', () => {
    expect(mapMcpTools(body([server({ toolMeta: null })]), ROUTE)).toEqual([])
  })

  it('形状漂移产出空数组', () => {
    expect(mapMcpTools({ ok: true }, ROUTE)).toEqual([])
    expect(mapMcpTools(null, ROUTE)).toEqual([])
  })
})

describe('mapRoles', () => {
  /** /list 的真实形状：planes[].domains[].roles[]（MatrixPayload）。 */
  const body = (roles: unknown[]): unknown => ({
    root: '/Users/x/.dsh/.agent-presets',
    scannedAt: '2026-09-19T00:00:00.000Z',
    planes: [{ id: 'PLN-OPS', name: '运营面', domains: [{ id: 'DOM-02', name: '账号', roles }] }],
    totals: { roles: roles.length, planes: 1, domains: 1, degraded: 0 },
  })

  it('映射一个岗位，动作是打开岗位矩阵', () => {
    const items = mapRoles(body([{
      id: 'agt-027', agt: 'AGT-027', alias: '账号健康官', title: '账号健康官',
      description: '盯账号健康度与申诉', planeName: '运营面', domainName: '账号',
      lifecycleStatus: 'production', productionAuthorized: true, degraded: false,
    }]), ROUTE)

    expect(items).toEqual([{
      id: 'agt-027',
      kind: 'role',
      title: '账号健康官',
      summary: '盯账号健康度与申诉',
      tags: ['运营面', '账号', '账号健康官'],
      availability: 'ready',
      nativeStatus: 'production',
      action: { type: 'open-panel', view: 'roles' },
      source: { slice: 'role', route: ROUTE },
    }])
  })

  it('manifest 残缺（degraded）如实标注，不假装健康', () => {
    const items = mapRoles(body([{ id: 'agt-001', title: '某岗', degraded: true }]), ROUTE)
    expect(items[0]?.availability).toBe('degraded')
  })

  it('planes 缺失或 roles 不是数组时产出空数组', () => {
    expect(mapRoles({ root: '/x' }, ROUTE)).toEqual([])
    expect(mapRoles({ planes: [{ domains: [{ roles: 'nope' }] }] }, ROUTE)).toEqual([])
  })
})

describe('mapProducts', () => {
  /** /products 的真实形状：ScanReport（cards[].products[]）。 */
  const body = (cards: unknown[]): unknown => ({
    ok: true,
    owns: 'nothing — this is a read of <dir>/product.json',
    scannedRoots: ['/work'],
    skipped: [],
    cards,
    unreadable: [],
    declaredCount: cards.length,
    undeclaredCount: 0,
    truncated: false,
  })

  it('映射一个 ready 产品，id 是 dir::productId', () => {
    const items = mapProducts(body([{
      dir: '/work/sourcing-desk', label: 'sourcing-desk',
      products: [{ id: 'desk', name: '选品工作台', summary: '一条龙选品', status: 'ready', preset: 'agt-027' }],
    }]), ROUTE)

    expect(items).toEqual([{
      id: 'sourcing-desk::desk',
      kind: 'product',
      title: '选品工作台',
      summary: '一条龙选品',
      tags: ['sourcing-desk', '选品工作台', 'agt-027'],
      availability: 'ready',
      nativeStatus: 'status:ready',
      action: { type: 'open-panel', view: 'applications' },
      source: { slice: 'product', route: ROUTE },
    }])
  })

  it('draft 产品是 degraded，statusReason 说明原因', () => {
    const items = mapProducts(body([{
      dir: '/work/half', label: 'half',
      products: [{ id: 'x', name: '半成品', status: 'draft', statusReason: '入口服务未实现' }],
    }]), ROUTE)

    expect(items[0]?.availability).toBe('degraded')
    expect(items[0]?.nativeStatus).toBe('入口服务未实现')
  })

  it('productRoots 为空（多数装机）时 cards 为空数组，不是错误', () => {
    expect(mapProducts(body([]), ROUTE)).toEqual([])
    expect(mapProducts({ ok: true, cards: [] }, ROUTE)).toEqual([])
  })
})

describe('mapSystems', () => {
  /** /systems 的真实形状：loadSystems 产物 + openRoute。 */
  const body = (systems: unknown[]): unknown => ({
    ok: true,
    owns: 'src/catalog/{systems,role-map,reachability}.json — joined at read time',
    source: 'https://lute-tlz-dddd.top/systems.html',
    probedOn: '2026-09-18',
    systems,
    coverage: { systems: systems.length, rolesTouched: 1, byKind: { docker: 1 } },
    openRoute: '/api/dsh-newapp/open-system',
  })

  it('映射一个可达系统，动作带 slug 而不是 URL（客户端从不发地址）', () => {
    const items = mapSystems(body([{
      slug: 'grafana', name: 'Grafana', nameEn: 'Grafana', desc: '监控看板',
      kind: 'docker', tags: ['ops'], cta: '打开', href: 'http://localhost:3000',
      host: 'localhost', primary: 'AGT-001', also: [], reachable: true, loginRequired: false,
    }]), ROUTE)

    expect(items).toEqual([{
      id: 'grafana',
      kind: 'system',
      title: 'Grafana',
      summary: '监控看板',
      tags: ['docker', 'ops', 'agt-001', 'grafana'],
      availability: 'ready',
      nativeStatus: undefined,
      action: { type: 'open-system', slug: 'grafana' },
      source: { slice: 'system', route: ROUTE },
    }])
  })

  it('不可达与需登录都是 degraded，且原因可见', () => {
    const items = mapSystems(body([
      { slug: 'down', name: '挂了的服务', desc: '', kind: 'docker', tags: [], reachable: false, loginRequired: false },
      { slug: 'locked', name: '要登录', desc: '', kind: 'static', tags: [], reachable: true, loginRequired: true },
    ]), ROUTE)

    expect(items[0]?.availability).toBe('degraded')
    expect(items[0]?.nativeStatus).toBe('不可达')
    expect(items[1]?.nativeStatus).toBe('需登录')
  })
})
