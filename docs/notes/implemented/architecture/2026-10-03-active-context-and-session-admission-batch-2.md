# UI 接线收敛第二批：活动事项上下文、session effect admission 与 UI 合同

- 日期：2026-10-03
- 状态：implemented locally, not committed
- 对应决策：[ADR-0249](../../../adr/ADR-0249.md)
- 范围：CONV-03、CTX-01A、AUTH-02A（session core）、UI-TEST-01

## Problem

第一批已经固定 57 条 `/.sage/*` route 的 authority 真值，并让 exact nested `matter` payload 真正驱动 DOM；但 35 条 protected-effect route 仍绕过统一 authority。第二批选择其中风险最明确的 `session/send`、`session/stop`、`session/resume` 作为第一条异步 effect 切片时，又暴露了三个不能靠“把旧 provider 包一层”解决的问题：

1. main 仍用“最新 converted draft”推断当前事项，renderer 又可随请求提交 `matterRef` 与 `workspaceRoot`；两者都不是可复用的 active context authority。
2. 现有 `runCommand` 是同步业务命令管线，不能安全承载需要持久化后再异步 dispatch、且 dispatch 后失败不得自动重试的 session effect。
3. 旧 route 测试把“raw provider 被调用”当成功，正好会阻止 unavailable-first 收口；UI 侧也缺 tab/panel 双向 ARIA、Escape 焦点回收、CSP 负约束和 wire→DOM 多字段同源证据。

Qoder 最终 dirty tree 已另行冻结并在一次性重建环境回放：typecheck、9 files / 130 targeted tests、169 files / 1381 full tests（1 skip）及 25/25 旧基线 gate 均通过。这只证明其补丁可复现，不解决 Ticket 018 的 credential/authority 绕过和 Ticket 019 的假 apply/内存态问题，因此仍不能整包吸收。

## Decision

### D1 · 活动事项上下文只在 Electron main 拥有，当前默认不激活

新增纯内存 `createActiveMatterContext()` kernel，把 actor scope、matter、revision、workspace、可信 root、session、context generation 与 frame generation 作为一个不可变 snapshot 管理。activate、replace、invalidate 都采用 compare-and-swap；任何 generation、事项、工作区、revision、actor、session 或 frame 漂移都具名拒绝且不改变状态。

公开 projection 不含 actor、session 与绝对路径。第二批没有新增 renderer activation route，也没有从最新 converted draft、Host observation 或 UI payload 推断 active context；production 启动后因此保持 inactive。Frame contamination 会 CAS invalidate 已有 snapshot。

### D2 · session core 建立独立异步 admission，固定顺序且 dispatch 后绝不自动重发

新增 `admitProtectedEffect()`，顺序固定为：

`caller → context → candidate-match → identity-policy → target → compatibility → registry → preflight → persistence → dispatch`

任一步 provider 缺失、抛错、畸形、拒绝或 stale 都折叠为稳定、脱敏的 unavailable/denied/stale；dispatch 调用前失败保证 dispatch 次数为 0。只有 durable persistence 返回 operation/dispatch refs 后才能 dispatch；dispatch 一旦被调用，throw、畸形或 unknown 都变成 `protected-effect-outcome-unknown` 且 `retryable:false`，没有自动重发路径。

### D3 · 第一条真实 route 切片只接 send/stop/resume，并故意停在缺失 authority provider 前

`sendSessionPrompt`、`stopSession`、`resumeSession` 不再直接调用 raw session provider，而是把候选 matter 与最小 payload 送入 admission。renderer 提交的 `workspaceRoot` 不进入 authority payload，也不成为 dispatch target。

Electron main 每个请求只注入已验证 caller binding、当前 FramePolicy 与 main-owned active context；identity/policy、target、compatibility、Registry、preflight、persistence 和 dispatch 尚未接齐，因此三条 route 稳定返回 `protected-effect-unavailable`。即使旧 raw provider 已装配，测试也要求调用次数为 0。这个结果是安全接线完成、真实功能仍不可用，不是功能绿灯。

route truth matrix 仍保持 57 条分母与四分类不变，但 authority 读数更新为：2 条 `runCommand` compliant、3 条 protected admission compliant-but-unavailable、32 条 protected bypass violation。gate 同时验证 matrix 字段、composition helper 真实调用和一枚移除 admission 的反向突变。

### D4 · UI-TEST-01 只加固 Sage-owned renderer 合同，不进入视觉/IA 迁移

前四个工作台 tab 补齐与 panel 双向对应的 `id` / `aria-controls` / `aria-labelledby`；用户菜单支持 Escape 关闭、同步 `aria-expanded` 并把焦点还给触发器；`focus-visible` 覆盖 button/select/input/textarea，保留 reduced-motion。

安全与同源检查新增：Sage 品牌页面排除 Qoder/Sanbao/legacy transport/iframe/WebView/`file://` 入口；CSP 独立断言 frame/object/base/form 限制，并拒 `unsafe-eval`、remote/data/blob source；非法 nested payload 清除旧 matter；真实 Electron probe 同时核对 matterId、goal、revision 与 projectionSource。

这批没有选择 React、bundler 或新测试栈，没有新增 dependency，也没有复制 Sanbao/Qoder 页面。视觉迁移仍等待 UI-01 ADR 与逐状态语义对照。

## Verification

- 三个独立内核的 Red/Green 已分别留证：active context 8/8、protected-effect admission 44/44、UI 合同初始 3 条具名红后转绿。
- 汇流定向结果：session/context/admission 6 files / 84 tests passed；UI 5 files / 24 tests passed；route matrix 1 file / 5 tests passed；typecheck passed。
- route gate selftest 在汇流中先发现测试所用 route 名写错，修正后 9/9 通过；不把这次仪器错误归因给产品。
- Qoder final replay 的冻结摘要保存在 ignored BirdView provenance 中，只作来源证据，不进入产品出货物。
- `apps/sage-shell` typecheck 与 build 均通过；Integration full suite 为 171 files / 1402 passed / 1 skipped。
- 真实 Electron fixture window 2/2 通过：同一 protocol wire 的 matterId/goal/revision/source 与 DOM 一致，tab/panel ARIA 双向成立，菜单 Escape 关闭并归还焦点，657 CSS px 窄宽与 200% zoom 均无横向溢出；负控写入继续按预期 no-go。
- 仓根 `pnpm run gate` 为 27/27 passed、0 skipped、0 failed；其中 route authority 为 57/57 对账，明确报告 3 条 admitted-but-unavailable 与 32 条 remaining bypass。
- `git diff --check`、ADR machine-readable ledger、pitfalls playbook gate 与 BirdView examples validation 均通过。

## Alternatives considered

| 方案 | 结论 |
| --- | --- |
| 继续从最新 converted draft 推断当前事项 | 否决。历史/草案顺序不是活动上下文 authority，也无法绑定 revision、session、workspace 与 frame generation。 |
| 直接信任 route body 的 matterRef/workspaceRoot | 否决。renderer 只能提交 candidate intent，不能提交可信上下文或 target。 |
| 把异步 session effect 塞进同步 `runCommand` | 否决。会丢失 await 顺序、durable-before-dispatch 与 outcome-unknown/no-retry 边界。 |
| admission 通过后立即接回旧 raw provider | 否决。Identity/Policy、Compatibility、Registry、preflight 与 durable persistence 仍缺；接回会把“有 provider”冒充“有 authority”。 |
| 整包应用 Qoder Ticket 018/019 | 否决。回放绿色只证明补丁可运行；018 仍有 direct provider/credential baseURL 边界，019 仍没有真实 apply provider 与 durable record。 |
| 同批启动视觉换壳 | 否决。UI-01 的技术与语义前置尚未完成；本批只把现有 Sage renderer 的可访问性、安全和同源证据变硬。 |

## Consequences

- `session/send`、`session/stop`、`session/resume` 已退出 direct-provider bypass，但在真实 authority providers 与 active selection owner 落地前有意不可用。
- 32 条 protected-effect bypass、13 条 read-policy 缺口、partial CB1 与其他 session-family effect 仍是明确 backlog，不能从本批绿色外推为全量接线完成。
- 当前 active context 没有产品 activation owner；下一批必须先定义 main-owned selection/activation 事件及 logout、session rotation、workspace removal、matter switch 的失效策略，不能新增 renderer 自报 route 来填空。
- Qoder 018/019 进入独立重建队列，编号必须基于当前 ADR 索引重新 mint；本批不占用其旧草稿编号。
- UI 仍是现有 Sage-owned renderer，不是 Sanbao/Qoder 视觉迁移完成态；UI-01 仍是视觉批次硬前置。
- 新复发模式登记为 [P-62](../../../pitfalls-playbook.md)：异步 effect 不能因为“已经有同步 command pipeline”就被机械接入或直接透传 provider。
