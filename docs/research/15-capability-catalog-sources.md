# 研究结论：能力目录五切片数据源盘点与统一 schema（S0b）

- 日期：2026-09-19
- 状态：concluded
- 归属计划：[docs/plans/2026-09-19-capability-hub.md](../plans/2026-09-19-capability-hub.md) S0b
- 取证范围：`packages/capabilities/{dsh-overseas-skills,dsh-wanzh-hulian}`、
  `packages/surfaces/{dsh-role-matrix-local,dsh-newapp-local,dsh-skill-center-local}`

## 一、五切片盘点（事实表）

| 切片 | 数据源（唯一家） | 条目 | 关键字段 | 运行时通道 |
| --- | --- | --- | --- | --- |
| 技能（三条线） | `dsh-overseas-skills`：manifest/*.json（生成进 `lib/catalog.js`）+ `~/.dsh/skills/<name>/SKILL.md` frontmatter（安装态之家，ADR-0041） | 223+138+16 | name/title(中文)/category/subcategory/summaryZh/toolGap/installed/modelEnabled/scenario/icon | `/api/dsh-overseas-skills/{list,fullstack-list,generic-list,org}` |
| MCP 工具 | `dsh-wanzh-hulian/lib/business-meta.js`（单一数据源，头注释自述） | 101 | name(业务名)/desc(何时用)/scene/readWrite/example | `/api/dsh-wanzh-hulian/mcp-servers`（实时抓取优先、静态保底） |
| 岗位 | `~/.dsh/.agent-presets/agt-*/{preset.yml,manifest.json}`（扫描已装 preset，非 hardcode） | 50 | id/agt/title/plane/domain/subset(技能id[])/lifecycleStatus/productionAuthorized/flows/scenarios | `/api/dsh-role-matrix/list` |
| 产品 | 各产品目录自声明 `product.json`（productRoots 默认 `[]`，多数装机为空） | 装机相关 | id/name/summary/status(draft\|ready)/preset/features[] | `/api/dsh-newapp/products` |
| 业务系统 | `dsh-newapp-local/src/catalog/{systems,role-map,reachability}.json` 三文件三家，读时 join | 31 | slug/name/kind/tags/primary(岗位)/reachable/loginRequired | `/api/dsh-newapp/systems` |

补充事实：连接注册表（`~/.dsh/integrations/wanzh-hulian/{connections,mcp-servers}.json`，
默认 3 连接 + 4 服务器，代码内默认 + 用户态覆盖合并）与 probe 分派是**第六个潜在切片**
（kind: connection），但连接的操作是「配置/重授权」而非「执行能力」，建议首期只收
`enabled` 状态与跳转动作，不深挖。

## 二、批判性评审要点（设计 schema 前必须钉住的四件事）

1. **五个切片已经统一走 loopback HTTP 只读通道**——无一例外。聚合层复用这条通道即可，
   不需要任何新的数据搬运机制。这是最重要的架构事实：**聚合层是纯 client 端的读侧
   组合，零 host 改动起步**。
2. **跨包 HTTP 读有先例且有契约化模式**：newapp 的 launcher 读
   `/api/dsh-role-matrix/list` 做 preset 校验，并把该依赖声明为 `COMPOSED_SOURCES`
   发布在 health 上（`dsh-newapp-local/src/routes.ts:74-81`）。聚合层照抄这个模式：
   把消费的路由清单声明为契约数据，漂移可发现。
3. **action 是最难归一的字段，不能是字符串**。各切片的执行机制完全不同：技能执行走
   `dsh:skill-execute` 事件、岗位/供给预填走 `setDraft`、面板切换走视图激活、系统打开
   走 open-system slug、连接跳转走路由。必须判别联合（discriminated union），
   由命令面板的 dispatcher 按 type 分发。
4. **status 无法完全归一，只能归一「可用性」**。reachable/loginRequired/lifecycleStatus/
   draft-ready/modelEnabled 各是各的语义，强行归一会丢信息。方案：归一化
   `availability` 四态（命令面板只需要知道「能不能执行」），原生状态放
   `nativeStatus` 供详情展示。

## 三、统一 schema（设计稿，S2 实现的契约）

```ts
export type CapabilityKind =
  | 'skill'          // line: overseas | fullstack | generic
  | 'mcp-tool'
  | 'role'
  | 'product'
  | 'system'
  | 'connection'

export type CapabilityAvailability =
  | 'ready'      // 可立即执行
  | 'degraded'   // 可执行但有告警（系统不可达 / 需登录 / 工具过期待重授权）
  | 'disabled'   // 存在但被关（modelEnabled=false / enabled=false）
  | 'absent'     // 声明了但未安装（toolGap / 未安装技能）

export type CapabilityAction =
  | { type: 'execute-skill'; skillName: string; prompt?: string }  // dsh:skill-execute
  | { type: 'prefill-draft'; prompt: string }                      // setDraft 预填不发送
  | { type: 'open-panel'; panel: string }                           // 视图激活；S3 后走 selectPanel
  | { type: 'open-system'; slug: string }                           // open-system 路由
  | { type: 'open-route'; route: string }                           // 跳详情/设置（岗位详情、连接配置）

export interface CapabilityItem {
  /** 切片内唯一：skill name / mcp__<server>__<tool> / agt-NNN / <dir>::<productId> / slug / connection id */
  id: string
  kind: CapabilityKind
  /** 归属线（仅 skill 有）：overseas | fullstack | generic */
  line?: 'overseas' | 'fullstack' | 'generic'
  /** 展示名：中文名/业务名优先于工具名 */
  title: string
  /** 人话摘要（何时用），截断归 UI */
  summary: string
  /** 搜索/分组词：场景、细分、plane、tags，统一小写 */
  tags: string[]
  availability: CapabilityAvailability
  /** 原生状态语义（reachable/loginRequired/lifecycleStatus/draft-ready…），供详情展示 */
  nativeStatus?: string
  action: CapabilityAction
  /** 溯源：来自哪个切片的哪条路由（调试与契约自检用） */
  source: { slice: string; route: string }
}
```

## 四、聚合层架构（结论）

- **形态**：新包 `dsh-capability-hub-local`（surfaces 组），client 半区纯读组合：
  并发 fetch 五条既有路由 → 每切片一个**纯函数 mapper**（路由响应 → `CapabilityItem[]`）
  → 内存缓存（打开命令面板时取一次 + 手动刷新，**不加轮询**——`/list` 已有胶囊组件
  2 秒轮询，聚合层不叠负担）。
- **契约冻结**：各路由响应形状目前是无类型约定——mapper 单测冻结每条路由的样本响应，
  上游改形状时测试先红（漂移警报，不是静默漂移）。`COMPOSED_SOURCES` 模式照 newapp
  先例声明。
- **不动各家存储**：与 role-matrix capabilities.ts 的既有论断一致（请求时读 manifest
  使漂移在结构上不可能），聚合层对切片只发起 GET。
- **规模核对**：223+138+16 技能 + 101 工具 + 50 岗位 + 31 系统 + 连接/产品（装机相关）
  ≈ 560 条，命令面板前端 fuzzy 过滤无压力；分页不需要。
- **空切片语义**：productRoots 默认空 → 产品切片常为空数组，命令面板按
  「无此切片」处理（不显示空分组），复用扩展中心既有空态设计。

## 五、风险与开放点（S2 开工前需拍板或验证）

1. **搜索词语言混排**：技能 title 是中文、scenario key 是英文（如 `a-market-sourcing`），
   tags 归一时把英文 key 与中文标题都收进 tags，fuzzy 对中英混合查询的表现需要实测。
2. **MCP 工具实时抓取的延迟**：`/mcp-servers` 实时抓取 streamable-http 服务器可能慢，
   聚合层首取应接受 `source:"static"` 保底数据（UI 本来就有此降级），标注
   `availability:'degraded'` 不阻塞面板。
3. **岗位 action 的 prompt 构造**：岗位卡没有现成「一句话预填」字段，需要从
   manifest 的 mission/record 派生或按模板拼装——S2 实现时与 hero SupplyCard 的
   既有 prefill 逻辑对齐，避免第二套拼装。
