# UI 接线收敛第一批：来源冻结、57-route truth matrix 与 matter payload → DOM

- 日期：2026-10-03
- 状态：implemented locally, not committed
- 对应决策：[ADR-0248](../../../adr/ADR-0248.md)
- 范围：CONV-01、CONV-02、AUTH-01、UI-WIRE-01

## Problem

Qoder 已经把 UIX 001–050 的大部分实现写进 `qoder/ui-wiring`，但当前事实分成四层：

1. `6654d75`：Qoder 接线前的 main 基线；
2. `f6faba7`：47 张票的已推送提交；
3. `eeff896`：本地已提交的 Ticket 004；
4. `eeff896` 之上的混合 dirty tree：Ticket 018 与 019 共用文件、仍持续变化，不能按文件整包归票。

同时，`eeff896` 的产品面存在两个会制造假绿的断点：

- 57 条 `/.sage/*` route 只有 `/.sage/actions` 与 `/.sage/draft/convert` 进入统一 `runCommand`；其余 protected-effect route 直接调用 provider、走 prepare-only 或 auth-special 路径，但此前没有一张完整、可门禁的 authority 事实表。
- main 已经在 exact nested service envelope 中提供 `matter`，renderer 却仍显示编译期 fixture；旧 Electron probe 只看预烘焙标记，因此即使 payload 从未驱动 DOM 也会绿。

这一批必须先把来源、authority 缺口和 payload→DOM 接缝变成可证伪事实，不能用视觉换壳、fixture、历史绿灯或 Qoder dirty bytes 掩盖未闭环能力。

## Decision

### D1 · Qoder 来源按四层冻结，dirty 只作 observation

以 `eeff8967190815c7b5018f7d11b748818d487d37` 创建隔离 integration worktree。原 Qoder worktree 全程只读，读取统一设置 `GIT_OPTIONAL_LOCKS=0`，禁止 add、stash、reset、checkout、restore、clean、test、gate 与 mutation。

ignored 证据目录 `.birdview/provenance/2026-10-03-qoder-freeze/` 保存 immutable refs、before/after status/index/stash、full-index dirty patch、untracked 普通文件字节与 hash、四层来源表及 001–050 reverse index。双采样 fingerprint 相同才标记 `captureRejected=false`。本次稳定窗口内 fingerprint 为 `94f7593c…b762c9`，staged patch 为空，观察到 9 个 untracked 文件；这个结果只证明一次稳定快照，不把 Ticket 018/019 升格为可应用 patch。

### D2 · AUTH-01 固定 57-route truth matrix，但不把 truth gate 冒充安全门

新增 `route-authority-matrix.json`，逐路由登记 method、四分类、policy profile、operations、caller binding、active context、provider、persistence、runtime level、`runCommand` 事实、unsupported operations 与 current authority。

固定读数为：

- 13 `read-only`
- 5 `local-preference`
- 37 `protected-effect`
- 2 `unsupported`
- 2 条 protected route 实际进入 `runCommand`
- 35 条 protected route 明确登记 `currentAuthority.status = "violation"`

`CB1` 只登记为 partial：已有 exact Sage app URL、Origin 存在时比对、frame 未 contaminated；仍缺 Origin 必须存在、frame ready、active session 与 read policy。

新 gate 只判“矩阵是否忠于源码”。绿色结果必须同时写明 35 条 bypass 仍是 violation；它不是 exemption，也不是 AUTH-02 已完成。路由、method、provider、classification、runCommand source fact、CB1 或 mixed unsupported 漂移都会判红。

### D3 · UI-WIRE-01 只接受 exact nested envelope，matter 成为 DOM 唯一事项来源

production HTML 的 `renderSageWorkspace()` 默认从 fixture 改为 `null`，首屏只显示 unavailable。客户端 refresh 只接受同时具备 `service`、`matter`、`runtime` 的 nested envelope；旧 flat/off payload 明确退场。

`matter` 四态的行为固定为：

- `null`：unavailable，清空旧 ID、revision、goal 与 action previews；
- `fixture`：只显示 route payload 中的 fixture 值；
- `live`：只显示 live payload 中的真实值；
- malformed：fail closed 为 invalid，并清空旧值。

动态 action surface 只用 `createElement` + `textContent` 生成只读 preview，不创建 button，不发 POST，不提交 `ActionIntent`。Electron probe 必须等待 `/.sage/state` 的 fixture payload 真正改写 DOM，并核对 fixture goal；预烘焙 fixture 不再能使它假绿。

### D4 · 第一批不进入行为迁移与视觉换壳

这一批不做 AUTH-02，不迁移 35 条 bypass，不补真实 Identity/Policy/Host provider，不接 Ticket 018/019 dirty bytes，不新增 dependency，不选择 React/bundler/test stack，也不宣称完成 Sanbao 视觉/IA 迁移。视觉迁移继续遵守 UI 一致性合同：Sanbao 只作只读证据，先完成 UI-01 技术决策与逐状态语义对照。

### D5 · 验收分为 source、mutation、DOM 与总门禁四层

- CONV-02 mutation：切断 `matterGroups` production assembly，具名 wiring test 必须判红；还原后无 `.judge-bak`。
- AUTH：57-row matrix Vitest、checker 反向 selftest、gate scope 与根 `test:gate`。
- UI：null/fixture/live/malformed、live→null、fixture→malformed、flat/off rejection、无按钮/无请求；另跑 Electron 真窗口。
- 汇流后：targeted、typecheck、build、full suite、Sage quick gate 与 BirdView validation；任何 skip、环境失败或未做视觉截图单独报告，不折算为通过。

## Verification

- provenance 双采样前后 fingerprint 均为 `94f7593c4654a97b81fc0d082d1bd6372a1ff9110787e5ea5e649ed521b762c9`，staged patch 为空，证据目录内所有文件 hash 复核通过；这只证明本次读取窗口稳定，不约束 Qoder 后续继续写入。
- mutation judge 临时切断 production `matterGroups` assembly 后，具名 wiring test 按预期判红；自动还原后 targeted、full suite 与 quick gate 全绿，且没有残留 `*.judge-bak`。
- 汇流后的 targeted suite 为 7 files / 63 tests passed；根 `test:gate` 为 200 tests passed；`apps/sage-shell` typecheck 与 build 均通过；full suite 为 166 files / 1340 tests passed / 1 个既有 skip；`pnpm run gate` 为 27/27 passed、0 skipped、0 failed。
- 真实浏览器宽屏与约 657 CSS px 窄屏均确认 `source=live`、目标与 revision 来自 route payload、action button 数为 0、无横向溢出；干净标签页 console 为 0 error / 0 warning。截图保存在 ignored 的 `.birdview/batch1-matter-live-desktop.png` 与 `.birdview/batch1-matter-live-narrow.png`，不作为出货物提交。
- authority gate 绿色仍同时报告 35 条 protected-effect violation；它证明 truth matrix 与源码一致，不证明这些 route 已完成 action-scoped authority。

## Alternatives considered

| 方案 | 结论 |
| --- | --- |
| 直接复制当前 Qoder dirty tree | 否决。018/019 已在共享文件交叉且 dirty tree 继续增长，文件级复制会丢失票据归属和来源边界。 |
| 让 authority gate 因 35 条已知 bypass 永久判红 | 否决。AUTH-01 的职责是固定事实与阻止假改绿；行为迁移属于 AUTH-02。永久红会把“已知缺口”与“矩阵漂移”混成一个不可用信号。 |
| 把 35 条 bypass 标成 compliant 以换取绿灯 | 否决。route 存在、provider 可调用或 main-owned 都不等于 action-scoped authority 已重新求值。 |
| 继续兼容 flat/off renderer payload | 否决。ADR-0184 已规定 `/.sage/*` 恒由 main 终止；保留双形状会让退役 Host payload继续掩盖 envelope 漂移。 |
| component renderer 继续默认 fixture | 否决。production 初始 HTML 会在任何 wire 发生前展示伪事项，并让窗口测试假绿。 |
| 先完成 Qoder 风格视觉迁移，再补接线 | 否决。第一批的目标是让状态与行为同源；视觉壳不能把 unavailable 包装成可用，也不能代替 UI-01 技术决策。 |

## Consequences

- Qoder 的 committed/local/dirty 来源现在可复核；Ticket 018/019 仍需从冻结 observation 独立重建，不能整包吸收。
- integration 的下一枚正式 ADR 使用当前 committed baseline 的连续编号 `ADR-0248`。Qoder dirty snapshot 中同名的 untracked Ticket 019 ADR 不是权威编号；Ticket 019 独立重建时必须基于当时最新索引重新 mint。
- 57-route 分母与源码漂移进入默认 Sage quick/full gate；默认 gate 总数从 25 增到 27。
- 35 个 protected bypass、13 个缺 route-level read policy 的 read-only route、partial CB1 都仍是下一批硬缺口；本记录没有把它们关闭。
- renderer 的 flat/off compatibility 被有意移除；所有合法状态夹具必须提供 exact nested envelope。
- 第一批只完成接线收敛前置与第一条真实 matter→DOM 线，不是完整视觉迁移，也不是生产真实 provider 验收。
- 长期复发模式已登记为 [P-61](../../../pitfalls-playbook.md)：预烘焙 fixture 会让“DOM 看起来正确”但 payload 从未驱动 renderer。
