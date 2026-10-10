# 第 10 步 dispatch：十步链端到端闭合

- 日期：2026-10-11
- 决策：[ADR-0289](../../../adr/ADR-0289.md)
- 状态：已实施（契约三态 + 共享再核验 + 端口重跑 + 通道调用 + 归一化 + route 映射 + 两处缺陷修复 + 门禁）；回合收口流登记后续批。

## Problem

链路停在第 10 步前。通道（`sessionSend`）是 accepted/deferred/refused 三态，而 admission 的 dispatch 结果只有 receipt/outcome-unknown，三态带不回去；边界文档 item 10 要求派发前再核验并复核 Registry mapping 与 availability。实施中暴露两处真实缺陷：① 上一批的 `evidence` 在内核逐字段重建 fact 时被丢——端口直测与 pin 都不可见，端到端 spec 首先抓到（否则真实 sends 全部在 persist fail closed）；② 共享再核验把 `frame.generation` 与 `contextGeneration` 相比（fixture 同值掩盖），正确不变量是 fresh-vs-fresh。

## Decision

1. 契约三态：receipt{+detail 闭集} / refused{code} / not-dispatched（可重试，内核映射回 admission unavailable）/ outcome-unknown；malformed detail 保守 unknown。
2. 共享再核验单一家（`session-prompt-reverify.ts`，含 frame fresh-vs-fresh 修正）+ target/registry/preflight 同实例重跑与 ref 相等 + 通道调用后置 + 归一化。
3. 路由映射 detail→accepted/deferred；无 detail 保守 outcome-unknown；renderer 禁重试规则不变。
4. seam 证据存续修复 + 内核级断言 + 门禁 pin/突变。
5. v1 不写域收口：attempt 派发后保持 active，第二次 send 诚实阻断；回合收口流登记。

## Alternatives considered

- receiptRef 字符串编码 / 调用前失败→unknown / 三端口第二实现 / 同批域收口——逐条理由见 [ADR-0289](../../../adr/ADR-0289.md) 备选表。

## Consequences

- 十步链首次真实闭合：端到端路由返回 accepted{sessionId, requestId, mode}；第二次 send 在 persist 处 fail closed（已测试明证）。
- 上一批 seam 缺陷与 frame 不变量缺陷修复并被断言与门禁钉住。
- 未闭：回合收口流、WT-02B.3、host-lifecycle、撤销运营、「进入 revision」流（R1 报告已呈报）。

## Verification

证据（2026-10-11，全部真实执行；未跑的照实写）：

- **dispatch spec**：`test/session-prompt-dispatch.spec.ts` **5/5**——单元（accepted/deferred 归一化与调用参数、通道 refused 码、抛错 unknown、六类调用前漂移一律 not-dispatched 且通道零调用）；内核级（receipt+detail 存续、refused 码、not-dispatched→可重试 unavailable、outcome-unknown、malformed detail 保守 unknown、**persist 实际收到 admitted evidence**）；**端到端**：真实 sqlite + 全真装配 POST `/.sage/session/send` → `accepted{sessionId:'session:sage.e2e', requestId:'channel:request-1', mode:'queue'}`，通道恰一次调用；同 matter 第二次 POST → `protected-effect-unavailable` 且通道零追加调用（active-attempt 诚实阻断）。
- **家族回归**：7 文件 **53/53**（target/compat/registry/preflight/persistence/attempt-store/身份路由）。
- **门禁自测**：`node --test scripts/gates/sage-route-authority.test.mjs` **46/46**（新增 dispatch 七条具名突变：un-gate / seam 丢证据 / detail 守卫移除 / refused 吞码 / not-dispatched 破坏 / 路由 detail 丢弃 / 三元组 ref 比较移除 / 闭包写注入；persist/reverify pin 迁移后复绿）。
- **typecheck**：0。
- **全量套件**：213 文件 / 1896 通过 / 1 skip（exit 0）。
- **门禁**：`pnpm run gate` 32/32（objects 319/319，exit 0）。
- 未运行：本批不动 publications，produce 未重跑。
