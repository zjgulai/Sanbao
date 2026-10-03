# UI 接线第五批：correction submit protected-effect admission

- 日期：2026-10-03
- 状态：implemented locally（未提交、未推送）
- ADR：[ADR-0252](../../../adr/ADR-0252.md)
- 相关：[ADR-0251](../../../adr/ADR-0251.md)、[ADR-0174](../../../adr/ADR-0174.md)
- 范围：AUTH-02C，仅 `POST /.sage/corrections` 的 `submit`

## Problem

第四批完成 projection read admission 后，protected-effect 仍有 25 条 direct-provider bypass。`POST /.sage/corrections` 是其中边界最小的一条：只有 `submit` 一个 operation，body 已有显式 `matterRef`，但 Application Service 仍可直接调用 `correctionCreate`。这样只要 raw provider 存在，route 就会绕过 caller、ActiveContext、Identity / Policy、target、Compatibility、Registry、preflight、persistence 与 dispatch 的固定 admission 顺序。

现有 correction raw owner 也不能直接充当 production dispatch。它先调用 `deps.send`，随后才把 correction record 写入内存列表；若发送已发生而后续进程、响应或记录失败，就没有 dispatch 前已持久化的 operation / idempotency identity，也没有可收口 `outcome-unknown` 的 durable evidence。这不满足 [ADR-0174](../../../adr/ADR-0174.md) 的 durable-before-dispatch 与 reconciliation 边界。已有 domain tests 只能证明“新文本只发送一次、原文不覆盖、receipt 如何呈现”的局部语义，不能证明 production authority 或可靠副作用。

请求目前还携带 `workspaceRoot`。renderer 自报的机器路径既不是事项 authority，也不是 trusted root；若它进入 protected intent 或影响授权，会重新建立不受信 root 绕路。

## Decision

### D1 · 只关闭 corrections submit 这一条 bypass

本批只把 `POST /.sage/corrections` 的 `submit` 迁入既有 async protected-effect admission，稳定 operation 为 `session.correction.submit`。candidate 只使用 `{ kind: 'matter', matterRef }`；intent payload 只包含 `originalText`、可选 `originalAt` 与 `text`。

`workspaceRoot` 可以暂时留在现有 transport body 以维持兼容，但它不是 authority、不得进入 intent payload、不得传给 authority ports，也不得作为 dispatch 的可信路径。未来需要 root 时只能由 main 根据 fresh ActiveContext、default matter-workspace link、workspace fold 与 FramePolicy 重新取得并核对。

### D2 · production 继续 unavailable-first，raw provider 与 send 都不得触达

本批不补造 Identity / Policy、target、Compatibility、Registry、preflight、durable persistence 或 dispatch provider。production 缺后续 port 或 dispatch 时返回稳定的 `protected-effect-*` refusal；unavailable、denied、stale 与任何 admission 异常都必须在 `correctionCreate` 前停止。因此 raw correction provider 调用数为 0，其下游 `deps.send` 调用数也为 0。

接线完成只证明此 route 不再绕过 admission，不证明 correction 已发送、已受理、已排队或已生效。当前不得出现 production “发送成功”或“更正已提交”的可用声明。

### D3 · 现有 raw owner 不作为合法 dispatch / persistence 实现

现有 raw owner 的顺序是先 `send`、后追加 correction record，不能满足 durable operation / idempotency identity 先于外部副作用建立的要求。本批保留它作为隔离的 domain semantics 实现与测试对象，但 Application Service 不再从 product route 调用它。

未来若恢复真实 correction dispatch，必须另行提供：由 Sage-owned service 持久化的 scoped request key、canonical intent digest、operation / idempotency identity、dispatch 前 authority freshness barrier、窄 Capability Adapter port，以及对 response loss 的 `outcome-unknown` / reconciliation 合同。不得把“raw provider 已存在”解释为这些前置已经具备。

### D4 · authority truth 只移动一个分子

route 总数与 classification 分母保持不变；protected-effect admission 从 10 条增至 11 条，direct-provider bypass 从 25 条降至 24 条。其余 24 条仍是显式 backlog，不能因本 route 变绿而按 route-level 结果合并宣布 object scope、action family 或完整 protected-effect 已收口。

本批不修改视觉 / IA，不引入 dependency，不改 package / lockfile，不 commit、不 push。

## Alternatives considered

| 方案 | 结论 |
| --- | --- |
| 保留 `correctionCreate` direct-provider path，只在 UI 上标记“受保护” | 否决。显示文案不构成 authority，raw provider 仍可绕过固定 admission 顺序。 |
| 只要 `matterRef` 匹配 ActiveContext 就调用 raw owner | 否决。context 不是 standing authority，且后续 Identity / Policy、Compatibility、Registry、preflight、persistence 与 dispatch 仍缺。 |
| 把 body 的 `workspaceRoot` 作为 trusted root | 否决。renderer 自报路径不是 authority；可信 root 必须由 main 从 fresh context 与 stores 重算。 |
| 直接把现有 raw owner 接成 dispatch port | 否决。它先发送后记录，没有 durable-before-dispatch、operation identity 或 `outcome-unknown` reconciliation。 |
| 同批迁移 action-items、projects 或其他多 operation route | 否决。它们包含不同 object scope 与 authority 需求，会让 route-level green 掩盖未证明的 operation-level 边界。 |
| 同批进入视觉迁移或新增前端 dependency | 否决。AUTH-02C 只收口一条 effect bypass；视觉 / IA 与技术栈仍按各自前置和票据推进。 |

## Consequences

- `POST /.sage/corrections` 只有一个合法产品入口：`session.correction.submit` protected-effect admission；raw provider bypass 被关闭。
- production 当前仍会稳定 refusal，`correctionCreate` 与 `deps.send` 都不会被调用；这是预期的 fail-closed 结果，不是功能回退。
- `workspaceRoot` 不再参与 intent 或 authority。transport 字段的后续移除可单独处理，但不得在此期间获得安全含义。
- raw owner 的 correction link / receipt 语义测试仍有价值，但只证明隔离 domain behavior；真实 dispatch 仍需 durable persistence、idempotency 与 reconciliation 前置。
- authority matrix 应显示 11 条 protected admission、24 条 bypass；其余 bypass 与 object-scope 缺口保持可见。
- 本地改动留在共享 dirty integration worktree，未提交、未推送；不构成发布、视觉迁移或 production correction 可用验收。

## Verification

- 实现前定向 Red（并行实施组记录）：correction 仍直达 raw provider 时，2 个 spec 共 7 failed / 6 passed；matrix 为 2 failed / 4 passed；authority gate selftest 为 5 failed / 12 passed。
- 实现后合流定向：7 files / 96 tests passed，覆盖 exact operation / matter candidate、`workspaceRoot` exclusion、无 context、candidate/frame drift、all-pre-dispatch-allowed 但缺 dispatch，以及 raw provider / downstream send 零调用。
- route authority mutation selftest：17/17 passed；覆盖 admission 删除、raw fallback、operation drift、candidate drift 与 `workspaceRoot` 泄入。
- Sage Shell：typecheck、build 通过；完整测试 178 files，1512 passed / 1 skipped。
- 仓根：`pnpm run test:gate` 209/209 passed；`pnpm run gate` 27/27 passed，其中 authority truth 为 58 routes、11 admitted protected routes、24 registered bypasses。
- 上述均为本地源码与测试证据；未运行真实 correction dispatch、真实 Identity / Policy / Registry provider、发布或 production 验收。
