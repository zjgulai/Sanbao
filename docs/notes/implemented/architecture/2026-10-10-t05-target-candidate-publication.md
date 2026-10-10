# T05 中段：session.prompt 首发 target 的候选生成线与发布流程（第一刀）

- 日期：2026-10-10
- 决策：[ADR-0276](../../../adr/ADR-0276.md)
- 状态：已实施（候选生成线与发布流程设计；owner 数据裁决与发布接线属后续票）。

## Problem

T05 的第 5–6 步（target / compatibility）卡点不是接线：运行时侧 descriptor 生产者真实存在（WT-02C.2E 线，稳定对 `58c7d999…`/`6ec53b31…` 与 13 项 goldens 由真机探针固化），真正缺的是 target 侧治理数据——immutable target requirement 快照与按稳定对键控的矩阵物理制品（E.3 已把重发义务登记给真实 Matrix Authority 发布票）。`ownerDecision{decisionId,ownerId,decidedAt,reason}` 与矩阵 issuer/有效期是 product/security governance 的裁决字段；但其中可机械推导的部分（组件钉、语义摘要、配对字节）应先落成候选，让裁决变成「审批具体字节」。

## Decision

1. **候选生成模块**（`src/main/target-requirement-candidate.ts`，纯函数）：从观测 descriptor 逐字段复制四组件与 capabilities；`protocol/launch/overlay` 取自 descriptor；`permission/data-destination` 摘要= 域分离 canonical 策略清单摘要（保持清单顺序）；`actionPolicies` 由调用方提供的 actionRequirements 转换；产出容器 `sage.target-requirement-candidate.v1`，携带 `observedRuntimeDescriptorDigest`，**不含 owner 决策字段**。
2. **seal 只在裁决后**：`sealCandidateTargetRequirement(candidate, decision)` 应用决策三字段并走 C2.2T 内核 `sealCompatibilityTargetRequirement`——内核校验是唯一门。（内核语义附带一条被测试抓住的硬规则：**决策时刻不得晚于 effectiveAt**。）
3. **发布流程（设计）**：候选生成（E 线 descriptor + 物化 profile）→ owner 裁决 → seal requirement + seal matrix（规则= 配对候选 `targetSemanticDigest` 与**重观测**的 `runtimeDescriptorDigest`）→ 随壳加载（bundle 位置与加载面属发布票）→ providers 装配接 `resolveTarget`/`resolveCompatibility` → 撤销源与有效期管理。descriptor 移动即候选作废。
4. **首发范围**：`session.prompt`（external-write / 无决定门），capabilities 为空。
5. **本刀不接端口、不改 route 事实**；模块由测试真实跑通（含端到端 `equivalent` 闭环）。

## Owner 数据裁决清单（交付用户逐项裁决）

1. **requirement 标识与时窗**：建议 `requirement:sage-session-prompt` / `1.0.0`；`effectiveAt`= 裁决生效时刻（须 ≥ `decidedAt`）；`expiresAt` 建议 +1 年。
2. **actionRequirements**：首发仅 `{session.prompt, external-write, requiresDecision:false}`（与 `ACTION_AUTHORITY_TABLE['session.send']` 一致）——确认或调整。
3. **策略清单**：`permissionRequirements` / `dataBoundaryRequirements` 各条目的 identity/version/digest（首发建议最小集：本机会话数据边界；命名沿用 `permission:sage.*` / `data-boundary:sage.*` 形式）——逐项裁决。
4. **组件批准**：provider/model/agent/preset 四行的 identity/version/三摘要在发布时由 E 线**重观测**固化（候选复制即批准出货代）；其中 **model 面**（`agent-default-model` 层叠行的哪个身份被批准）需产品裁决。
5. **矩阵规则与发布**：`ruleId`/`outcome`/`reasonCode`/`reason` 文案、矩阵 issuer、validFrom/expiresAt、撤销源节奏——逐项裁决；物理重发按 E.3 登记的「真实 Matrix Authority 发布票」执行。
6. **capabilities**：首发 `[]`（内部阶段无外部能力）——确认。

## Alternatives considered

- 直接写死首发数据（含虚构 ownerDecision）：伪造裁决字段，禁止。
- 先接端口后补数据：恒 unavailable 的接线 + placeholder 滑移，P-04 家族。
- fixture 快照冒充发布：测试绿灯冒充产品事实，禁止。
- 一次性脚本：推导规则需版本化、被测试与内核演进咬住，放 `src/main/` 纯模块。
- 首发纳入外部 capabilities：C2C.5 无真实 provider，`[]` 是诚实声明。

## Consequences

- 候选→裁决→seal→解析器 `equivalent` 闭环被端到端测试咬住；配对随 descriptor 移动立即失配（`no-matching-rule`，无回退）。
- 真实侧只剩：owner 数据裁决（清单已交付）与发布接线（bundle/加载/provider 装配/撤销）。
- 未闭：准入端口（target/compat/registry/preflight/persist/dispatch）、C2D.2A registry provider、真实登录与真机首条消息；T05 不因本刀标记完成。

## Verification

证据（2026-10-10）：`target-requirement-candidate.spec.ts` **5/5**——组件/能力逐字段复制、语义摘要体核验且随 descriptor 移动、策略清单摘要确定且顺序敏感、seal 前无 ownerDecision 且内核 parse roundtrip 全等、端到端（sealed 候选 + 观测 descriptor 经矩阵规则判 `equivalent`，descriptor 移动判 `no-matching-rule`）；`apps/sage-shell` typecheck 0；全量套件 203 文件 / 1847 通过 / 1 skip（exit 0）；`pnpm run gate` 32/32（objects 313/313，0 skip，退出码 0）。未运行：真实发布（属 owner 裁决与发布票）；实机探针（本刀无路由/接线面）。
