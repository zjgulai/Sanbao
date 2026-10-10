# target requirement 组件身份语法对齐运行时（首个真实发布件封存）

- 日期：2026-10-10
- 决策：[ADR-0280](../../../adr/ADR-0280.md)
- 状态：已实施（语法对齐 + 首个真实发布件封存；bundle 与端口接线属后续票）。

## Problem

ADR-0278 的发布件只用夹具 descriptor 验证过。首次用真实重观测 descriptor（`urn:sage:runtime-descriptor:sha256:e1c7a8b4…`）调 `buildSessionPromptPublication` 时，C2.2T 内核以 `requirement-entry-invalid` 拒收：V1 的 `COMPONENT_IDENTITY` 钉死「冒号后必须以 `sage` 开头」（夹具 `provider:sage-fixture` 时代的锚定），而运行时侧真实身份是 `provider:deepseek-official`、`model:deepseek-official/deepseek-flash`、`agent:@deepseek-ai/dsh-agent`、`preset:set`。同一个稳定对的两半对身份语法各说各话——V2 descriptor/语义侧一直接受裸字符串，V1 侧拒绝每一条真实身份。

## Decision

1. `COMPONENT_IDENTITY` 对齐运行时：`^[a-z][a-z0-9._-]{0,31}:@?[a-z0-9][a-z0-9._@/-]*$`（小写 kind、`@?` 开头余段、允许 `/` 与 `@`；长度 128；垃圾仍拒绝）。
2. `POLICY_IDENTITY` 不动（Sage 治理命名空间；已发布两份策略文档在语法内）；两类语法分职写进代码注释。
3. 真实发布件封存：稳定对 `urn:sage:target-semantic:sha256:3da420a7…` × `urn:sage:runtime-descriptor:sha256:e1c7a8b4…`；模型面严格精确钉真实生效（`model:deepseek-official/deepseek-flash @0.2.0-rc.2`）；产物仓外 `/Users/pray/tmp/reobs-publication.json`。
4. requirement spec 新增真实身份接受用例 + 垃圾拒绝用例（夹具不得再掩盖此类假设）。
5. 首发 `effectiveAt` 保持 `2026-10-11T00:00:00Z`（生效前求值答 `requirement-not-effective` 属设计）。

## Alternatives considered

- 改运行时身份为 `:sage…`：运行时身份已被 E 线 goldens 冻结，改它等于改全部已冻结读数——本末倒置。
- V1 组件身份也放宽为裸字符串：security 内核保留有界语法拒绝垃圾；对齐的是可表达性，不是放弃校验。
- 只修不测：P-03——夹具假设必须由测试拦住。
- 一并放宽 POLICY_IDENTITY：无真实输入要求，且会抹掉治理命名空间的区分。

## Consequences

- requirement 可逐字命名真实运行时组件；发布件从夹具验证升级为真实重观测验证。
- 稳定对可直接进入矩阵规则发布（bundle/加载/端口=后续票）。
- 未闭：bundle 与端口、Registry 首方 entry 裁决、persist/dispatch、真实登录与真机首条消息。

## Verification

证据（2026-10-10）：`node scripts/test.mjs run test/compatibility-target-requirement.spec.ts` **6/6**（含新「真实身份逐字接受 + 垃圾拒绝」用例）；`test/session-prompt-publication.spec.ts`、`test/target-requirement-candidate.spec.ts` 回归 13/13 全绿；`apps/sage-shell` typecheck 0；真实组合命令退出 0——`SEALED OK`，`targetSemanticDigest = urn:sage:target-semantic:sha256:3da420a7…`、`runtimeDescriptorDigest = urn:sage:runtime-descriptor:sha256:e1c7a8b4…`（descriptor 由 `~/tmp/sage-reobs-root` 真实重观测产生，见 [DMG 链首跑 note](../packaging/2026-10-10-dmg-chain-first-real-run.md)）；`apps/sage-shell` 全量套件 **205 文件 / 1854 通过 / 1 skip（exit 0）**；`pnpm run gate` **32/32（objects 315/315，0 skip，退出码 0）**。未运行：bundle 落盘（发布票）。
