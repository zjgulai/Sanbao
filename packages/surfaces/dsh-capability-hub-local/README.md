# dsh-capability-hub-local

LUTE **能力中枢**：把本机已经发布的五个能力切片聚合成一个可搜索的调度面
（Cmd/Ctrl+K 命令面板），挂在 `shell.overlay` 上。

本包**不拥有任何事实**（ADR-0009）：每个条目都是对既有 loopback 路由的一次实时
只读投影，没有第二份存储、没有缓存落盘、不写任何切片的数据。

## 它解决什么

能力图谱此前被侧栏入口行切碎：技能住扩展中心、工具住万物互联、岗位住岗位矩阵、
产品与系统住新应用抽屉——各有各的搜索框、卡片语法与空态。用户的问题从来不是
「这个功能住在哪个入口」，而是「我想干 X，从哪进」。命令面板是那个统一答案。

背景与方案：[docs/plans/2026-09-19-capability-hub.md](../../../docs/plans/2026-09-19-capability-hub.md)；
数据源盘点与 schema 定稿：[docs/research/15-capability-catalog-sources.md](../../../docs/research/15-capability-catalog-sources.md)。

## 消费的跨包契约（COMPOSED_SOURCES）

七条只读路由，全部是别的包已经发布的接口。某条路由 404 = 对应包未安装，
记为空切片（`missing`），**不是错误**：

| 切片 | 路由 | 拥有方 |
| --- | --- | --- |
| 技能（三线） | `/api/dsh-overseas-skills/{list,fullstack-list,generic-list}` | `dsh-overseas-skills` |
| MCP 工具 | `/api/dsh-wanzh-hulian/mcp-servers` | `dsh-wanzh-hulian` |
| 岗位 | `/api/dsh-role-matrix/list` | `dsh-role-matrix-local` |
| 产品 | `/api/dsh-newapp/products` | `dsh-newapp-local` |
| 业务系统 | `/api/dsh-newapp/systems` | `dsh-newapp-local` |

清单的单一事实源是 `src/client/catalog.ts` 的 `CAPABILITY_ROUTES`。响应形状由
`tests/mappers.spec.ts` 用逐字段取自各 handler 构造代码的样本冻结——上游改形状时
测试先红，这是漂移警报。

## 执行通道（不发明新机制）

| action | 通道 | 既有先例 |
| --- | --- | --- |
| `execute-skill` | 回到会话（`layout.selectPanel(null)` + `dsh:view-change`(chat)）＋ 共享 `deliverPrompt`（草稿优先／剪贴板兜底） | skill-center `SkillPanel.executeSkillPrompt`（同一条实现） |
| `prefill-draft` | 同上（`conversation.input.shell(id).actions.setDraft`） | role-matrix hero 供给卡 |
| `open-panel` | 目标已注册为 `main` 面板 key → 官方 `selectPanel(key)`；否则回退 `dsh:view-change` 广播**并出声** | 基座 `DesktopLayoutState` 自己的判据（`slots.entries('main')`） |
| `open-system` | POST `/api/dsh-newapp/open-system`（只发 slug，从不发地址） | newapp `SystemsSection` |

交付通道的实现是 `shared/client/prefill-draft.ts`（`prefillDraft` + `deliverPrompt`）的
生成副本，与岗位矩阵、技能中心共用同一份事实。预填不可用时降级剪贴板**并上报原因**，
绝不静默。

`open-panel` 的 key 判据刻意与基座**同源**（`ctx.slots.entries('main')`），不抄「哪些面
已迁移」的清单——那份清单每迁一个面就腐烂一次。目标面尚未迁到 keyed slot 时（当前是
岗位矩阵）回退广播，而广播可能没有听者，所以回退**必须出声**：静默的死点击比报错难查。
`dsh:skill-execute` 已于 2026-09-19 删除（全仓 + 基座零听者，见 ADR-0130 D6）。

## 设计 token

面板样式消费 `--lute-space-{1..5}` / `--lute-radius-{row,card,chip}` /
`--lute-brand-line`（`shared/client/lute-tokens.ts`，apply 期幂等注入），颜色只写
`var(--dsw-alias-*, <亮色真实读数>)`，字体用官方 font shorthand——与家族同一套
token 纪律。注入缺失时消费面走 fallback，视觉不塌。

## 交互

- **Cmd/Ctrl+K** 唤起／关闭（修饰键组合在任何焦点下都生效，这正是命令面板的意义）。
- `↑` `↓` 选择，`Enter` 执行，`Esc` 关闭。
- 模态是 `<dialog showModal()>`：top layer，全文件零 z-index（D4：凡模态一律 dialog）。
- 取数只在打开时发生一次，刷新按钮强制重取；**刻意不轮询**——`/list` 已被胶囊
  组件每 2 秒轮询，聚合层不叠负担。

## 安全模型

本包不注册任何 host 路由、不读文件系统、不碰凭证。它只从浏览器向同源 loopback
路由发 GET（各路由自带 loopback 围栏与配对设备放行），以及向 `open-system` 发
一次带 slug 的 POST（该路由自己校验 slug 词表，未知 slug 拒绝——它不是 URL 开启器）。

## Model Experience

本包不注册工具、不改系统提示、不进模型上下文。它是纯客户端的读侧聚合，对模型的
请求内容与 token 数没有任何影响。

## Known Limitations and Deferred Work

- **只有快捷键入口**：面板目前没有可见入口（不加侧栏行是 D2 侧栏收敛决策的直接
  结果）。可见入口按计划落在 S4 的 hero 橱窗——hero 是命令面板的静态投影。
- **岗位动作是「打开面板」而非预填**：岗位的一句话预填需要从 manifest 派生，
  S0b 开放风险 #3 要求与 hero 供给卡的既有拼装对齐，不造第二套。
- **中英混排搜索未实测**：评分是子串 > tag > 摘要 > 子序列的简单方案（S0b 开放
  风险 #1）；实测不满意再换算法，`searchItems` 接口不变。
- **`open-panel` 仍走 `dsh:view-change`**：S3 把 workbench 面板迁到基座 `main`
  keyed slot 后，这里换成 `selectPanel`——只有 dispatcher 一处需要改。
- **每工具示例口令未下发**：上游 `dsh-wanzh-hulian` 的 `staticToolMetaFor` 丢弃了
  26 条手写每工具 example（如「店铺里有哪些商品？」），只留服务器级 example。本包因此
  合成工具专属提示词（`请用「业务名」：何时用`），并前向兼容 `tool.example`——上游一旦
  暴露该字段即自动生效，无需改本包。
- **停用技能仍可经面板执行**：面板如实显示「已停用」徽标但不阻断执行（预填后模型不会
  自动调用该技能）。是否阻断是产品决策，未擅自定。
- **官方 `/` 命令浮层与本面板并存**：官方 popupSelect（`conversation.input.overlay`）
  也在展示技能命令。两个能力入口的关系（合并/分工）是 S4 的设计议题。
- **生效语义**：宿主在引导期对插件 client bundle 做快照（`/plugins/??…&rev=<引导期哈希>`），
  改 `lib/client.js` 后 **Cmd+R 不生效，必须重启应用**（2026-09-19 实测；与诊断技能里
  「loader 包装可 Cmd+R 重载」的通用说法不符）。

## 命令

```sh
pnpm --filter dsh-capability-hub-local typecheck
pnpm --filter dsh-capability-hub-local test
pnpm --filter dsh-capability-hub-local build
```
