# UI 接线第八批：attachment cancel protected-effect admission

- 日期：2026-10-04
- 状态：implemented and locally verified（用户已确认并完成 AUTH-02E；改动未提交）
- ADR：[ADR-0255](../../../adr/ADR-0255.md)
- 相关：[Application Service 边界](../../proposed/architecture/2026-09-30-application-service-boundary.md)、[ADR-0174](../../../adr/ADR-0174.md)、[第六批 attachment upload admission](2026-10-03-attachment-upload-admission-batch-6.md)、[ADR-0253](../../../adr/ADR-0253.md)
- 范围：AUTH-02E，仅 `POST /.sage/attachments/cancel`

## Problem

第六批关闭 attachment upload bypass 后，`POST /.sage/attachments/cancel` 仍可从 Application Service 直接调用 raw `attachmentsCancel` provider。当前 raw owner 以 caller 提交的 `itemId` 查找 run-local record，随后把 record stage 改为 `cancelled`；若 record 已持有 `uploadId`，它还会调用 Host `attachment/upload-abort`。因此这条 route 虽然只接收一个短字段，仍可能同时产生本地状态变化与外部 Host 副作用。

`itemId` 不是事项、会话、身份或对象所有权证明。当前请求没有 `matterRef`，run-local record 也不构成 main-owned trusted target；若仅凭 `itemId` 或“当前有 active session”调用 raw owner，Application Service 就会跳过 caller binding、Identity / Policy、可信对象解析、Compatibility、Registry / preflight、durable operation、dispatch freshness 与 receipt / reconciliation 的固定顺序。

取消还具有独立的未知结果边界：Host 可能已经收到 `attachment/upload-abort`，而 main 在取得响应前断线或退出。现有 raw owner 只有内存状态，没有 service-issued durable operation / idempotency identity、可查询 receipt 或 `outcome-unknown` reconciliation，不能直接作为 production cancel dispatch。

## Decision

### D1 · 只关闭 attachment cancel 这一条 bypass

本批只把 `POST /.sage/attachments/cancel` 迁入既有 async protected-effect admission。稳定 operation 为 `session.attachment.cancel`，candidate 固定为 `{ kind: 'active-session' }`，intent payload 只包含 `{ itemId: request.itemId }`。

`active-session` 只要求命令绑定 main 当前解析出的 session scope；它不证明该 session 拥有 `itemId`，也不把 run-local record、UI stage 或历史 upload admission 变成 trusted target。`itemId` 只是未来 main-owned object resolver 查找候选对象的 opaque clue，不得从它反推 `matterRef`、workspace、frame、upload identity、actor 或 authority。

### D2 · production 保持 unavailable-first，raw cancel 与 Host abort 零调用

本批不补造真实 Identity / Policy、attachment object resolver、Compatibility、Registry mapping、preflight、durable persistence 或 cancel dispatch provider。缺 ActiveContext、caller / session / authority 不可验证、任何 freshness 漂移，或所有 pre-dispatch authority 均通过但 persistence / dispatch 仍缺失时，都必须在 raw owner 前返回稳定 unavailable / denied / stale refusal。

因此 production 当前的 raw `attachmentsCancel` 调用数为 0；raw owner 后面的 run-local record mutation、`abortOpen()` 与 Host `attachment/upload-abort` 也必须保持 0 调用。接线完成只证明 direct-provider bypass 已关闭，不证明附件已经取消、上传已停止、Host 已确认 abort 或用户可以在 production 使用 cancel。

### D3 · 真实 cancel 需要 trusted object resolution 与 durable reconciliation

未来恢复真实 attachment cancel 时，main 必须用当前 caller / session、fresh workspace / frame 与 exact sealed attachment record 解析可信对象，并证明该对象仍属于本次允许取消的 operation scope。对象解析不能信任 caller 自报的 matter、path、digest、uploadId、receiptId 或 stage。

真实 dispatch 还必须具备 service-issued scoped request key、canonical intent digest、durable operation / idempotency identity、dispatch 前 freshness barrier、窄 Adapter / Host cancel port、可查询的 cancel receipt，以及 response loss 后只针对同一 operation 的 `outcome-unknown` reconciliation。若底层 abort 不能提供可验证收口，production cancel 继续 unavailable；不得把 transport abort、UI stage 变化或本地 record 改写当作远端取消 receipt。

### D4 · authority truth 只移动一个分子

route 总数与 classification 分母保持不变；protected-effect admission 从 12 条增至 13 条，全部 violation 从 23 条降至 22 条，其中 direct-provider bypass 从 18 条降至 17 条。其余 route 继续按 operation 与 object scope 独立收口，不能因本 route 变绿而宣布 attachment family、真实 cancel 或完整 protected-effect 已完成。

本批不修改 `attachments/pick`、既有 upload admission、workspace routes、renderer / UI、main attachment owner、Host bridge、protected-effect kernel、dependency、package 或 lockfile；不实现真实 object resolver、dispatch、receipt 或 reconciliation，不运行或声明真实 cancel E2E，不 commit、不 push。

## Alternatives considered

| 方案 | 结论 |
| --- | --- |
| 保留 raw `attachmentsCancel`，把 cancel 当作本地 UI 状态变化 | 否决。raw owner 会修改 run-local record，且可能调用 Host `attachment/upload-abort`；它是 protected effect。 |
| 有 active session 就直接调用 raw owner | 否决。session context 不是 standing authority，也不能证明 `itemId` 的对象归属或当前可取消状态。 |
| 从 `itemId`、run-local record 或 upload UI stage 推导 matter / trusted target | 否决。这些都是候选线索或局部状态，不是 main-owned fresh object resolution。 |
| 给 cancel body 补一个 caller-supplied `matterRef` 并机械复用 upload admission | 否决。自报 matter 不能证明对象归属；真实 cancel 需要按 exact sealed object 与当前 operation 重算 target。 |
| 将当前 raw owner 直接作为 cancel dispatch / receipt provider | 否决。内存 record 与 Host abort response 没有 durable operation、idempotency、receipt lookup 或未知结果收口。 |
| 同批迁移 `attachments/pick` 或重写附件 UI | 否决。pick 涉及 OS dialog、device / frame 与 candidate minting；UI 迁移也有独立 ticket 和验收面。 |

## Consequences

- `POST /.sage/attachments/cancel` 的唯一合法产品路径是 `session.attachment.cancel` protected-effect admission；raw provider bypass 被关闭。
- production 在真实 object resolver、authority、persistence 与 dispatch ports 缺失时返回稳定 refusal；run-local mutation 与 Host abort 不可达。
- `itemId` 保持 opaque、non-authoritative clue；`active-session` 只约束当前 session scope，不证明对象所有权、matter 绑定或取消结果。
- 真实 cancel 继续等待 durable operation / idempotency、exact object target、dispatch freshness、receipt 与 `outcome-unknown` reconciliation。
- authority matrix 的目标 truth 为 13 条 protected admission、22 条 violation、其中 17 条 direct-provider bypass；剩余接线任务仍保持显式未完成。
- 本批不构成 attachment cancel 可用、UI/UX 复刻、provider 接通、发布、commit 或 push 证明。

## Verification

2026-10-04 在活动仓 `main` 完成以下本地验证；这些结果只证明 direct-provider bypass 已关闭，不是 production cancel E2E：

- Red：先运行含新增断言的 Sage Shell 测试，得到 `7 failed / 1520 passed / 1 skipped`；失败均来自旧 cancel 直达 provider 行为与旧 authority 计数，没有编译或无关失败。
- focused Green：`protected-session-effects`、`app-service-wiring`、`route-authority-matrix` 共 `3 files / 42 tests` 全部通过；exact intent 固定为 `session.attachment.cancel` + `{ kind: 'active-session' }` + `{ itemId }`，拒绝、stale 与 all-pre-dispatch-allowed-but-dispatch-missing 路径均证明 raw `attachmentsCancel` 为 0 调用。
- mutation / source-fact：`node --test scripts/gates/sage-route-authority.test.mjs` 为 `30/30` 通过；覆盖 admission 删除、raw fallback、operation / candidate / payload 漂移、`itemId` 删除或扩张、matrix 假绿、protectedAdmission / context 漂移。
- 编译：Sage Shell `typecheck` 与 `build` 均通过。
- 完整 Sage Shell：首轮并行执行仅 `business-matter-event-store-process.spec.ts` 的 5 个 child-ready case 在 10 秒超时；该文件隔离重跑 `20/20` 通过，随后完整套件重跑为 `179 files / 1527 passed / 1 skipped / 0 failed`。因此该首轮失败按并发负载瞬态记录，没有通过放宽超时或修改无关代码换绿。
- 仓根 gate：`pnpm run test:gate` 为 `222/222` 通过；`pnpm run gate` 为 `27/27` 通过，其中 authority gate 精确核对 `58 routes / 13 read-only admitted / 13 protected-effect admitted / 22 violations / 17 direct-provider bypasses`。
- Electron 窗口级回归：`sage-fixture-projection-window` 与 `sage-frame-policy-window` 为 `2 files / 3 tests` 通过；本批没有新增真实 cancel UI/E2E。
- 工作区边界：`git diff --check` 通过；staged 为空；`package.json`、`pnpm-lock.yaml` 与 `apps/sage-shell/package.json` 无改动。既有 UI-IA-01 未提交 checkpoint 与未知 `.scratch/harness-version-diff/` 均保留，未归入 AUTH-02E。
- 未执行 commit、push、merge、发布或 production provider 验收。
