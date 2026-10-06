# Sanbao → Sage 集成票据

- 日期：2026-10-05
- 状态：执行基线
- 规格：[206 状态集成规格](../specs/2026-10-05-sanbao-in-sage-integration-spec.md)
- 权威进度：[tracked state matrix](../specs/2026-09-27-sanbao-to-sage-ui-state-map.json)

## 执行原则

- 每一行只有一个 owner ticket；跨层实现仍由该票负责把 UI、Application Service、Host、Electron、视觉五维证据闭合。
- 票据文字是范围与依赖，不是完成状态。进度只能读取 tracked matrix 的逐行事实与派生 summary。
- 先做主链和共享合同，功能族再并行；同一个 main 装配点、route authority、global gate 和 DMG 发布链接点必须串行。
- 默认窗口必须使用真实 Sage 投影和 intent；prototype host、Pages、fixture、ignored evidence、旧 renderer 都不能关闭票据。
- 本轮已明确授权 `com.lute.sage` / `0.1.0` / arm64 的 **Sage 专属本机自签、仅内测 DMG**；该授权不包含 Developer ID、公证、公开发布、更新源、commit 或 push，也不授权读取凭据、调用付费模型或写生产数据。内测 DMG 只证明当次安装包和核心路径，不自动关闭任一 206 状态行。

## 并行批次

| 批次 | 可并行工作 | 串行汇合点 |
|---|---|---|
| A 基线 | T01 界面壳、T02 bootstrap/身份、T03 workspace/read policy、矩阵治理 | 默认 BrowserWindow 与 route authority |
| B 主链 | T04 durable matter、T05 首条真实消息、T06 追加/停止/恢复 | Application Service composition、session custody |
| C 功能族 | T07–T13 按 owner 行独立推进；T13 设置 74 行可拆 UI/偏好/系统反馈子批 | main-owned DTO/intent、共享 theme/preferences |
| D 收敛 | T14 206 行审计、真实窗口与构建验证 | global gate 接点与 Sage DMG 发布链 |
| E 内测打包 | DMG-00–05 可与主链并行；DMG-06 等待 T03–T06 与 T13-A 核心设置主链 | 首装 profile、签名封口、挂载复制、冷启动/再启动 |

依赖图：

```text
T01 ─┐
T02 ─┼─> T03 ─> T04 ─> T05 ─> T06 ─┬─> T07..T13 ─> T14
     └───────────────────────────────┘

T02 ─> DMG-00..05 ─┐
T03..T06 + T13-A ──┴─> DMG-06 内测安装包验收
```

## Task T01

- 名称：默认产品壳与首屏读取
- 矩阵 owner：4 行
- 依赖：无

验收：默认只出现一个 Sage 产品主窗；完整侧栏、首页、composer 与会话容器不依赖 Sanbao sibling/dist；`GET /.sage/state` 的成功、denial、非 JSON、超时和失效分别呈现；草稿不因 pending/refusal/导航丢失；CSP、sandbox、FramePolicy 不放宽。真实默认窗口证据关闭 `ui/electronAcceptance/visualAcceptance`，不能用额外 probe 窗口替代。

## Task T02

- 名称：系统 bootstrap、身份状态与偏好入口
- 矩阵 owner：0 行；共享前置
- 依赖：T01

验收：local-system route 只返回批准的 runtime/auth status 与必要显示偏好；不泄漏姓名、token、raw subject、session、路径或配置值；ready/uncontaminated frame、generation 和身份失效 fail closed；登录只在用户显式动作后开始，登出立即撤回旧投影。它不是业务读取授权。

## Task T03

- 名称：工作区、搜索与独立 projection-read authority
- 矩阵 owner：8 行
- 依赖：T02

验收：workspace 列表、adoption、active context 和 search 使用 main 解析后的真实 scope；路径和 matterRef 不能由 UI 自报；取消、无权、不存在不泄漏额外事实；stale generation/revision 时下游读取为零；真实工作区为空就显示真空态，不生成示例项。

## Task T04

- 名称：首页 durable matter 创建与 custody
- 矩阵 owner：0 行；主链前置
- 依赖：T03

验收：draft create/update/prepare/convert 的 authority 在写前完成；真实 createMatter custody 与 idempotency receipt 落地；确认前不转换，重复/过期/输入变化拒绝；`outcome-unknown` 禁止盲重试；新进程可读回已受理事实；只清除被明确受理且仍未改变的提交版本。

## Task T05

- 名称：首条真实消息与真实回复
- 矩阵 owner：0 行；主链前置
- 依赖：T04、真实 runtime/Compatibility/Registry/Adapter authority

验收：任一 authority 缺失时 prompt provider 调用为零；UI 只提交 main-sealed context 和 service-issued operation identity；200 denial 不算 accepted；真实 stream、message history、usage/tool facts 均来自投影；进程边界替身只算合同测试，最终成功必须绑定一条获授权的真实模型调用与脱敏 session/operation 证据。

## Task T06

- 名称：会话追加、停止、恢复与 unknown 对账
- 矩阵 owner：16 行
- 依赖：T05

验收：连续双击只派发一次；draft/submit/generation 状态分离；停止回执不冒充 turn 已结束；迟到结果不能覆盖新会话或新输入；Host/窗口重启不重复 prompt；unknown 只能核对或显式处理，不能自动重放。覆盖 streaming、completed、interrupted、continued、HTML 预览及相应错误/拒绝态。

## Task T07

- 名称：澄清、审批、计划、队列
- 矩阵 owner：8 行
- 依赖：T03、T06 合同稳定

验收：question/approval/version/queue ref 全由服务签发；单次确认、迟到撤回、过期拒绝和不重复派发有负例；原生卡片状态来自投影，不用本地翻牌。覆盖 S02–S06 相关状态。

## Task T08

- 名称：历史、搜索、编辑、侧聊与分组
- 矩阵 owner：7 行
- 依赖：T03、T06 合同稳定

验收：历史与搜索每次按当前 authority 重新准入；编辑/重发生成新受控 operation；侧聊、项目、讨论、我的工作和批量动作不扩大主会话 scope；重启可恢复、撤权立即失效。

## Task T09

- 名称：文件、附件、工具、产物与预览
- 矩阵 owner：18 行
- 依赖：T03、T06 合同稳定

验收：opaque item ID 与 sealed target resolution；Host/file I/O deny-before-provider；取消、过期、symlink/path traversal 和错误 MIME 均拒绝；真实产物用受控预览，不暴露任意文件路径；图片/HTML/diff/tool result 的来源与生命周期可追溯。

## Task T10

- 名称：模型、插件、Agent、MCP、用量与运行监控
- 矩阵 owner：51 行
- 依赖：T02、T03、T06 合同稳定

验收：installed/configured/enabled/connected/available/compatible/authorized 分开；secret 零回显；MCP observation 同一 execution connection、完整分页、可失效；Compatibility/Registry 只能由 Sage authority 给结论；用量和运行监控来自真实后端计数，不用静态数字。该票不得顺便安装、启用或批准插件。

## Task T11

- 名称：自动化
- 矩阵 owner：3 行
- 依赖：T03、T06 合同稳定、受控 schedule adapter

验收：创建、保存、暂停、执行和记录拥有独立 intent、authority 与幂等回执；无 provider 时明确 blocked，不在 renderer 伪造 timer；重启后状态与执行记录可读回；真实副作用仍需显式授权。

## Task T12

- 名称：知识、站点与协作
- 矩阵 owner：17 行
- 依赖：T03、T06 合同稳定、独立存储/发布 provider

验收：知识库、Repo Wiki、站点与协作对象来自真实存储、权限和版本；创建、筛选、打开与发布分别准入；发布只能由显式授权动作触发；空态、错误、撤权和版本冲突均可触发验证。

## Task T13

- 名称：设置、身份、外观与系统反馈
- 矩阵 owner：74 行
- 依赖：T02；涉及业务/Host 的叶子另依赖 T03/T06

设置是最大功能族，按下列互不冒充的子批并行：

1. 外观与可访问性：theme/density 请求值与生效值、键盘、focus、reduced-motion、320 CSS px reflow、第二进程恢复。
2. 身份与组织：登录/登出入口、最小身份投影、失效撤回；不得让 IdP 自报岗位/授权。
3. 模型、Runtime、Agent、MCP 设置：只消费 T10 的治理事实，不把 configured 当 available。
4. 快捷键、语音、通知、任务监控与通用偏好：保存与应用分开，错误/拒绝不写本地成功。
5. 系统反馈、更新与诊断：输出脱敏，外部发送和更新安装都需显式确认。

每个叶子必须有对应 row、DTO/intent、持久化 owner、重启行为和真实窗口证据。仅显示设置导航或静态表单不能关闭任何行。

## Task T14

- 名称：206 行全量收敛、构建与 DMG 前置验收
- 矩阵 owner：0 行；总体验收
- 依赖：所有 `required` 行的 owner ticket

验收：

- catalog、ledger、tracked matrix 两向等集；206 distinct IDs、59 groups，重复/缺失/外部 ID 为 0。
- 每个 required 行五维全 verified 且证据 tracked；每个 N/A 有 tracked 决策与 rationale；`integrated=required` 行数。
- 默认真实 BrowserWindow 覆盖正常、空、加载、错误、拒绝、撤权、离线、重启；截图逐状态/族人工回看，图片存在本身不算通过。
- 断开 route/adapter、denial 当 success、fixture/ignored evidence 升格、假 completed、重复 dispatch、summary 篡改均产生具名失败。
- generator check、矩阵 gate/test、相关 unit/integration、typecheck、build 与完整 Sage gate 给出真实退出码；skip 单列。
- T14 是 206 行长期全量收敛门，不是首个内部工程 DMG 的前置条件。内测 DMG 按下方独立工作流推进；Developer ID、公证、公开发布和更新器仍须另立公开发布票。旧 DSH DMG、旧发布链或本地 build 不能冒充 Sage DMG 完成。

## Workstream DMG-INTERNAL

- 目标：尽快得到可安装、可复验、明确标注内部工程状态的 `Sage 0.1.0 internal-arm64`。
- 已确认输入：Bundle ID `com.lute.sage`、版本 `0.1.0`、build `1`、Sage 专属本机自签、仅内测。
- `DMG-00`：固化上述输入与 arm64/内部边界。
- `DMG-01`：建立最小 production resource closure；不把测试、TypeScript、Vitest、第二份 Electron 或整仓 `node_modules` 塞入应用。
- `DMG-02`：在构建时真实 materialize 并验证 profile template；全新数据根只在完全 pristine 时原子安装，损坏或半成品一律 fail closed。
- `DMG-03`：Sage outer/helper bundle、Info.plist、`Sage.icns` 和隐私字段收敛。
- `DMG-04`：Sage 专属本机 identity，按叶到根签名并通过严格 seal 验证。
- `DMG-05`：生成、校验、挂载、复制 UDZO DMG，并记录 app/DMG hash 与构建清单。
- `DMG-06`：复制出的 app 以全新隔离根冷启动，再以同一根第二次启动；验证 Host ready、默认 desktop、T03–T06 主链与 T13-A 设置最小 smoke。

DMG-00–05 可以与 206 功能族并行；DMG-06 必须等待上述核心主链真实可用。任何内部 DMG 都必须在清单里报告当时矩阵的真实 `integrated / required` 读数，不得用“已经能打包”暗示 206/206 已集成。x64/universal、Developer ID、hardened runtime、公证、staple、Gatekeeper 公开分发与更新器均不属于本轮。

## 当前基线

tracked matrix 初始为 `integrated=0/206`。4 条 UI `implementing`、202 条 UI `pending`、206 条 Application Service `blocked` 只是首次候选迁移状态；ignored candidate 和其界面/会话临时状态表不能作为证据。后续每次进度变化必须修改 tracked row、提供符合规格的证据，并由派生 summary 与独立 gate 重新验证。
