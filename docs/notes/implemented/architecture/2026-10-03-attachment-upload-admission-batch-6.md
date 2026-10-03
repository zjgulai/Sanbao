# UI 接线第六批：attachment upload protected-effect admission

- 日期：2026-10-03
- 状态：implemented and locally verified（用户已确认并完成 AUTH-02D；未提交）
- ADR：[ADR-0253](../../../adr/ADR-0253.md)
- 相关：[ADR-0174](../../../adr/ADR-0174.md)、[ADR-0217](../../../adr/ADR-0217.md)、[ADR-0249](../../../adr/ADR-0249.md)、[ADR-0252](../../../adr/ADR-0252.md)
- 范围：AUTH-02D，仅 `POST /.sage/attachments/upload`

## Problem

第五批完成 correction submit admission 后，protected-effect 仍有 24 条 direct-provider bypass。`POST /.sage/attachments/upload` 是其中边界最小且副作用风险明确的一条：route 只有 `upload` 一个 operation，body 已带显式 `matterRef`，但 Application Service 仍可把 `{ itemId, matterRef, workspaceRoot }` 原样交给 raw `attachmentsUpload`。只要 raw provider 存在，它就会绕过 caller、ActiveContext、Identity / Policy、trusted target、Compatibility、Registry、preflight、durable persistence 与 dispatch 的固定顺序。

现有 raw owner 也不能直接充当 production dispatch。附件 candidate 只保存在本次运行的内存记录中；`workspaceRoot` 来自 renderer 自报；上传先用二者取得 session，再创建 Host `attachment/upload-begin` 状态，并在首个 chunk 前启动 `attachment/upload-commit`。这条路径没有 Sage-owned durable scoped request key、canonical intent digest、operation / idempotency identity，也没有 dispatch 后 response loss 的 `outcome-unknown` / reconciliation 合同。因此，已有封存摘要、流式分块与同会话 receipt 语义只能证明隔离的 attachment owner 行为，不能证明 Application Service authority 或 exactly-once 副作用边界。

请求和 raw owner 还持有本机 `workspaceRoot`、封存路径、digest、bytes、session / upload / receipt facts 与 bridge endpoint 状态。这些数据对底层上传实现有局部意义，但都不是 caller 可以提交的 authority input；若把它们带进 protected intent，就会把 renderer 路径或下游执行事实误升格为 trusted target / authorization evidence。

## Decision

### D1 · 只关闭 attachment upload 这一条 bypass

本批只把 `POST /.sage/attachments/upload` 迁入既有 async protected-effect admission，稳定 operation 为 `session.attachment.upload`。candidate 精确为 `{ kind: 'matter', matterRef: request.matterRef }`；intent payload 只包含 `{ itemId: request.itemId }`。

`workspaceRoot`、本机 path、digest、bytes、sessionId、uploadId、receiptId、attachmentId、bridge endpoint / chunk / response 与其他 Host facts 均不得进入 intent、candidate 或 authority ports。`itemId` 只是未来 main-owned target resolver 查找已封存 candidate 的 opaque clue，不是 authority；未来 resolver 仍须把它重新绑定到 exact sealed record、当前 matter / session、fresh workspace / frame 与对应版本。

### D2 · production 保持 unavailable-first，所有 raw 副作用零调用

本批不补造 Identity / Policy、trusted attachment target、Compatibility、Registry、preflight、durable persistence 或 dispatch provider。无 ActiveContext、matter candidate 不匹配、任何 authority / revision / workspace / frame 漂移，或所有 pre-dispatch authority 均通过但 dispatch 仍缺失时，都必须在 raw owner 前返回稳定 unavailable / denied / stale refusal。

因此 production 当前的 `attachmentsUpload`、`ensureSession`、Host `attachment/upload-begin|chunk|commit|abort` 与本地文件 stream 调用数均为 0。接线完成只证明 direct-provider bypass 已关闭，不证明附件已上传、已存储、已产生 receipt、已随消息发送或可供模型使用。

### D3 · raw attachment owner 不作为合法 dispatch / persistence

现有 owner 的 run-local candidate、renderer-supplied root、Host begin / commit external state 与流式文件读取都位于 durable operation identity 之外。尤其是 `upload-begin` 已创建下游状态，`upload-commit` 又在首个 chunk 前启动 Host `uploadStream`；若外部副作用发生而响应或本地进程丢失，当前实现没有同一 operation 的 durable evidence 可供查询或 reconciliation，也不能安全自动重试。

未来恢复真实 attachment upload 必须另票提供：main-owned exact sealed-record target resolution、scoped request key、canonical intent digest、durable operation / idempotency identity、dispatch 前 freshness barrier、窄 Adapter / Host port，以及 response loss 后只核对同一 operation 的 `outcome-unknown` reconciliation。不得把 raw owner 已存在、Host ready、candidate digest 或历史上传测试解释为这些条件已经具备。

### D4 · authority truth 只移动一个分子

route 总数与 classification 分母保持不变；protected-effect admission 从 11 条增至 12 条，direct-provider bypass 从 24 条降至 23 条。其余 23 条继续逐 operation / object scope 收口，不能因本 route 变绿而宣布 attachment family 或完整 protected-effect 已完成。

本批不修改 `attachments/pick`、`attachments/cancel`、renderer、Host bridge、protected-effect kernel、dependency、package 或 lockfile；不运行或声明真实 upload E2E，不 commit、不 push。

## Alternatives considered

| 方案 | 结论 |
| --- | --- |
| 保留 raw `attachmentsUpload`，只依赖 pick 时的封存摘要和 UI stage | 否决。candidate integrity 与显示状态不构成 request-scoped authority，也不能阻止 Host / file I/O 副作用。 |
| `matterRef` 匹配 ActiveContext 后直接调用 raw owner | 否决。context 不是 standing authority，且 trusted attachment target、后续 authority、durable persistence 与 dispatch 仍缺。 |
| 把 `workspaceRoot` 或 candidate path 当 trusted target | 否决。renderer 自报 root 与本机 path 不是 authority；可信 target 必须由 main 从 fresh context、stores 与 sealed record 重算。 |
| 将现有 raw owner 接成 dispatch / persistence port | 否决。run-local candidate、begin / commit external state 与缺失 durable operation / reconciliation 无法满足 ADR-0174。 |
| 同批把 `pick` 和 `cancel` 一起迁入 | 否决。`pick` 涉及 OS dialog、device / frame 与候选铸造，`cancel` 的 object scope 也只有 opaque itemId；二者不能机械继承 matter-scoped upload admission。 |
| 以现有附件 domain / Host tests 作为真实 upload E2E | 否决。它们只证明隔离实现语义，不证明 production Application Service authority、真实 provider 或产品可用。 |

## Consequences

- `POST /.sage/attachments/upload` 的唯一合法产品路径是 `session.attachment.upload` protected-effect admission；raw provider bypass 被关闭。
- production 仍会稳定 refusal，raw upload、session creation、Host upload endpoints 与文件读取都不会被触达；这是预期的 fail-closed 结果，不是附件上传可用声明。
- `itemId` 保持非 authority clue；`workspaceRoot`、path、digest、bytes 和 bridge / Host facts 不进入 protected intent 或 authorization。
- raw owner 的封存版本、流式分块、摘要核验与同会话 receipt 测试仍有局部价值，但真实 dispatch 仍需 durable operation、idempotency、trusted target 与 reconciliation 前置。
- authority matrix 应显示 12 条 protected admission、23 条 bypass；剩余 bypass、`pick` / `cancel` 与真实 upload E2E 保持显式未完成。
- 本地改动留在现有 dirty integration checkout；本批不创建 worktree、不修改 renderer / Host / kernel / dependency / package / lockfile，不 commit、不 push，也不构成发布或 production attachment upload 验收。

## Verification

本批已按 Red→Green 执行并由 root 在合流后独立复跑：

- 行为 Red：旧实现的 5 个用例失败、95 个通过；失败均命中 direct raw upload provider 或缺失 exact admission observation。Green：AUTH-02D 与相邻 admission/parser/attachment/matrix 共 8 个文件、121 个用例全绿。
- exact intent 固定为 `session.attachment.upload` + request `matterRef` candidate + `{ itemId }` payload；行为测试直接证明 renderer `workspaceRoot` 不进入 intent。无 ActiveContext、wrong matter、revision/frame drift、后续 authority 缺失，以及 all-pre-dispatch-allowed 但缺 dispatch 均 fail closed。
- 所有上述路径都直接断言 raw `attachmentsUpload` 为 0 调用；`ensureSession`、Host upload endpoints 与 file stream 只位于该 raw owner 之后，因此从 Application Service 产品路径不可达。本批没有把隔离 raw owner 测试冒充 production upload E2E。
- authority Red：新 truth 对旧 gate baseline 精确产生 5 个 drift，旧 selftest 为 16/17；Green：matrix spec 7/7、source-fact/mutation selftest 23/23。最终 truth 为 58 routes、12 admitted、23 bypass，其中 18 条 direct-provider bypass。
- Sage Shell `typecheck` 与 `build` 均退出 0；完整测试 178 个文件、1517 passed / 1 skipped；仓根 `test:gate` 215/215；quick gate 27/27（84/84 objects）；`git diff --check` 通过，缓存区为空。
- 既有 3 条 legacy fixture activation warning 保持为隔离警告，不影响测试退出码；未运行真实 upload E2E，未 commit、push、merge 或发布。
