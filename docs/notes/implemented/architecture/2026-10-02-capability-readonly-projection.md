# 030 落地：能力面读真观测，同时把"没接线"和"没读到"都说清楚

- 状态：implemented（隔离工作树 `qoder/ui-wiring`@`6654d75` 已实现并通过自验，未提交）
- 关联：工单 `docs/tickets/030-*`（仓外设计集）、US-155~US-158、[ADR-0199](../../../adr/ADR-0199.md)、[ADR-0174](../../../adr/ADR-0174.md)、[ADR-0168](../../../adr/ADR-0168.md)、[ADR-0171](../../../adr/ADR-0171.md)

## Problem

工单 030 要的是"能力目录、市场与 Agent 配置只读"，难点不在画页面，而在三件事的取证：

1. **有没有真数据**：能力/目录/市场在生产里没有 provider（C2C 正式 seam 未开、Registry 只有治理内核），但运行时**确实**给了一份真观测——protocol v5 `ready` 事件里的 `runtimeEffective`（默认 preset + 名册，含 `broken` 行），main 本来就持有它（inventory provider 在用）。
2. **三个词不能混**：已配置 ≠ 已启用 ≠ 可用。混法有两种，都常见：把名册里存在的行说成可用；把 `configured-not-enabled` 说成"已停用"。
3. **基座自由文本**：`broken` 是基座给的自由字符串（可能含机器路径），按既有纪律不能上屏。

## Decision

- 加第 4 个投影槽 `capability`（继 `service`/`matter`/`runtime` 之后），分类在 `appservice/composition.ts` 一次完成：`observed=false` 不带行、只带原因码（`observation-not-read` / `registry-service-absent` / `invalid-roster` / `observation-failed`）；`observed=true` 时每行 `state ∈ {enabled, configured-not-enabled}`，`broken` 文本就地丢弃、只留 `preset-failed-to-activate`。
- `external` 恒为 `{state:'not-wired', reason:'capability-registry-unavailable'}`——"外部能力/市场"这一维在生产里没有来源，界面照实说未接线。
- `main/index.ts` 接线：`runtimeEffective: () => { const o = host.readRuntimeEffective(); return isRuntimeEffectiveObservation(o) ? o : undefined }`——reader 返回 `unknown`，所以在接缝处重校验生产者自己的字节（P-56），不合格按未读出处理，绝不硬断言。
- 界面：能力面板新增只读名册（`#capability-source` / `#capability-rows` / `#capability-note`），行由脚本建 DOM，文案表在 renderer；无任何安装/启用/停用/撤销控件。

## Alternatives considered

- 透出基座 `broken` 文本：否决（路径风险 + 文案成第二真源）。
- 把市场渲染成空列表：否决（空列表读作"确实没有"，事实是"没有来源"）。
- 现在就造一个 Registry provider：否决（seam 未开，等于用占位冒充权威）。
- 让 renderer 自己判断三态：否决（分类应留在 main，001 已立规矩）。

## Consequences

- 能力面第一次有真数据（Agent preset 名册与未启用行来自运行时观测），并且对"外部能力"诚实地写"未接线"。
- 测试用**生产者 → 消费者**的路径：S1 路由产出的真实 payload 直接喂给渲染脚本（P-56 的写法），断言三态各行其是、未核验不写成已停用、投影里不出现基座原句/路径。
- 已知边界：`runtimeEffective` 绑在 Host 世代上，宿主被判定失效后界面回到"未核验"——后续票要在 UI 上继续区分"未核验"与"没有已配置项"（本票文案已分开：未核验给原因，空名册说"没有任何已配置项，这不等于已停用"）。
