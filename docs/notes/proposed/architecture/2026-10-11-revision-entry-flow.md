# 「进入 revision」流设计裁决

- 日期：2026-10-11
- 状态：proposed（用户已裁决七项；实现第一批——runner/注册/钩子——已落地并挂 [ADR-0290](../../../adr/ADR-0290.md)；选择流编排与全新 matter 端到端属下一刀）
- 来源：R1 只读侦察报告（2026-10-11）＋ 用户裁决
- 相关：[ADR-0288](../../../adr/ADR-0288.md)、[ADR-0289](../../../adr/ADR-0289.md)、[Application Service 边界](2026-09-30-application-service-boundary.md)

## 背景

十步链已真实闭合（ADR-0289），但真实 matter 无法过 persist：`revision:1` 的 actionPolicies 为空数组（`matter-custody.ts` 创建时写死），且产品侧没有任何流创建 revision。域构造器 `enterEvidence`（写 `revision-entered`）与 `startAttempt` 前置（supported 证据、actionPolicies 声明、current revision）齐备但无产品触发者。

## 七项裁决（用户 2026-10-11 确认）

1. **进入路径 = A 收窄版**：新受保护操作 `session.prepare`（`effectClass: local-write`），走 caller→context→candidate→identity + 专属 persist；跳过 target/compat/registry/preflight（本地审计写不触碰外部世界）。一次用户意图可依次触发 prepare→send，两者均完整准入。否决 B（链前隐式写，破坏「链内每步只读」）与 C（custody 扩展稀释 Application Service 唯一编排入口）。
2. **supported 证据 = 用户显式输入即见证**：进入操作把用户显式文本（或 UI 声明意图）记为 `{source: 'user-input', status: 'supported'}`；升格者是 main-owned 进入操作，不是 UI。反面登记：语义偏薄，但对一次会话运行，用户的显式输入就是该支持。
3. **actionPolicies 权威 = requirement 快照为准 + grant 一致性**：内容（actionScope/effectClass）取 requirement 的 actionRequirements；identity grant 独立授权（管「谁可以做」）；两者逐字段一致才放行，不一致 fail closed。requiresDecision 随 requirement 声明（当前 false）。
4. **revisionId = 服务签发 `revision:sage.<uuid>`**：每进入一次一个新 uuid，不由 UI 提供（与 ADR-0288 requestId 先例一致）。
5. **落盘 = 普通 append**（appendId 幂等，custody 模式）；`revision-entered` 不进 `appendWithCompatibilityEvidence`——兼容证据属于外部效果评估。
6. **clarification 强制新 revision = 本批不做**：当前 requirement `requiresDecision=false`，域规则在该路径不可达；不为不可达路径造流。
7. **确认卡 = 无**：local-write 不配确认卡；用户自己的首次输入就是确认。

## 实现批内的余项（裁决已定，细节批内落）

- `session.prepare` 的 grant 条目与 route/DTO 形状（服务签发 input，不含 authority 字段）。
- persist 端口形态：与 `session-prompt-persistence` 平行的小端口（写 revision-entered；不做 attempt 语义）。
- prepare 与 send 的编排位：composition 内串行触发（同一次用户 POST 或 renderer 两次调用——批内侦察 renderer 现状后定）。
- 测试路径：域构造历史 + 真实 store 的端到端（沿 ADR-0289 端到端 spec 模式）。

## 后续票位

1. 本流实现批（主链；解锁真实 matter 过十步链）。
2. 回合收口流（accepted 后的 attempt 收口；重复 send 前置）。
3. 真实模型调用验收（T05-A1；需要单独授权）。
