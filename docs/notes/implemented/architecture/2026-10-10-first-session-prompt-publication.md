# 首个 session.prompt target 发布件：owner 裁决落地

- 日期：2026-10-10
- 决策：[ADR-0278](../../../adr/ADR-0278.md)
- 状态：已实施（发布件与其内容；真实重观测、bundle 与端口接线属下一步）。

## Problem

ADR-0276 交付的 owner 数据裁决清单里有两项实质产品裁决：(1) 模型面语义——requirement 的模型组件按 schema 只能精确钉，而模型同时是用户设置项；(2) permission / data-boundary 摘要必须指向真实的 canonical 文档，而仓内尚无该文档形态。没有这两项裁决，首发 requirement 无法有内容；策略摘要若用任意常量，等于「不知道批准了什么」。

## Decision

1. **模型面严格精确钉**（用户裁决）：组件逐字段取自发布时重观测的 descriptor；模型/行为配置变化使 `targetSemanticDigest` 与稳定对移动——矩阵失配、fail closed、必须重发布后才能继续 session.prompt。
2. **策略文档 canonical 化**（用户裁决按最小声明发布）：新形态 `sage.target-policy-document.v1`（固定键序 canonical JSON、digest 命名空间 `urn:sage:target-policy-document:v1:`）；两份首发文档逐字采用裁决声明——`permission:sage.session-prompt`=「实例操作员（role:owner）可发起 session.prompt。」；`data-boundary:sage.model-egress`=「消息文本可发送至用户配置的模型提供方；产物与记录留存本机 Sage 数据根。」；措辞演进=新版本+新摘要。
3. **首发发布计划**：`requirement:sage-session-prompt` v1.0.0、有效窗 `2026-10-11T00:00:00Z`–`2027-10-11T00:00:00Z`、action 仅 `session.prompt`（external-write/无决定门）、决策三元 `decision:sage-t05-first-session-prompt`/`owner:sage-product`/`2026-10-10T09:00:00Z`（≤ effectiveAt）、提议规则 `rule:sage-session-prompt-v1`。
4. **模块** `src/main/session-prompt-publication.ts`：`buildSessionPromptPublication(descriptor)` = 策略引用 → 候选线 → `sealCandidateTargetRequirement`（C2.2T 内核唯一校验门）。descriptor 是输入（发布必须重观测）；本批不跑真实观测、不落 bundle、不接端口。
5. **门禁**：owner 内容事实（两条声明逐字、标识版本、action 元组、决策三元、封存路径）＋五条具名突变。

## Alternatives considered

- 模型面用范围/通配：schema 无 range，且违反精确钉纪律。
- 策略摘要占位：不可审计；D2 的存在正是为了消除它。
- 泛化/英文措辞：裁决声明是产品事实，逐字入文档。
- 本批跑重观测+落 bundle：真实观测与 bundle/接线是独立一步，避免把重 I/O 混进内容批。
- 运行时读钟作决策时刻：发布必须确定性；内核强制 decision ≤ effectiveAt。

## Consequences

- 首发发布件内容 100% 由裁决决定且可审计；组合路径被测试端到端咬住（fixture descriptor 下 seal+parse 全等、确定性、模型面移动→摘要移动）。
- 真实侧下一步=重观测 → `buildSessionPromptPublication(真实 descriptor)` → 落 bundle → 接 `resolveTarget`/`resolveCompatibility`；Registry entry（session.prompt 的 approved entry 仍缺）与 persist/dispatch 之后收口。
- 未闭：真实重观测与 bundle、端口接线、Registry entry、persist/dispatch、真实登录与真机首条消息；T05 不因本刀标记完成。

## Verification

证据（2026-10-10）：`session-prompt-publication.spec.ts` **3/3**——两份策略摘要经测试**独立重算**（手工 canonical 字面量 + node:crypto）逐字相等、发布件 seal+parse 全等且与计划常量逐字段匹配、严格模型面（`sealed.model === descriptor.model`）、同 descriptor 两次发布逐字节确定、模型面移动→`targetSemanticDigest` 与稳定对同步移动；门禁自测 `node --test scripts/gates/sage-route-authority.test.mjs` **40/40**（含新五条具名突变）；`apps/sage-shell` typecheck 0；全量套件 205 文件 / 1853 通过 / 1 skip（exit 0）；`pnpm run gate` 32/32（objects 313/313，0 skip，退出码 0）。未运行：真实重观测与 bundle 落盘（属下一步）；实机探针（本刀无路由/接线面）。
