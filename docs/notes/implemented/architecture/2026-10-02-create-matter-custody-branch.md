# 建项的落点：托管侧动作，独立分支，缺托管方就报未就绪

- 状态：implemented（隔离工作树 `qoder/ui-wiring`@`6654d75` 已实现并通过自验，未提交）
- 关联：工单 `docs/tickets/002-*`（仓外设计集，本 Note 覆盖其"建项落点"一刀）、[ADR-0201](../../../adr/ADR-0201.md)、[ADR-0200](../../../adr/ADR-0200.md)、仓外设计集的 ADR-0005（`Sage-ui-wiring-design/docs/adr/0005-all-formal-matters-hosted.md`，不在本仓）
- 说明：002 的完整验收仍未达成；本刀解决"建项请求落在哪里、以什么码结束"。

## Problem

现有 10 步管线的前提是**事项已存在**（第 3 步严格重放当前修订，第 4–8 步围绕当前修订判目标/兼容/注册/预检）。建项时事项不存在：

- 若照旧走第 3 步，`not-found` 会被映射成 `policy-denied`——把"还没有这条事项"说成"你没有权限"，是假话；
- 若顺手往本地执行库 append 一条，就违反了仓外 ADR-0005 的明文禁令（"服务端不可用时不得在本机偷偷创建一条同身份的正式事项再事后合并"）。

## Decision

- `runCommand` 在第 2 步通过后按 `actionType === 'create-matter'` 走**独立创建分支**：第 3–10 步对它不适用。
- 创建端口 `createMatter` 缺席或缺席式拒绝 → `persistence-unavailable@create`（`retryable: true`）；渲染面按 001 的三态纪律归入 `not-ready`（只给缺项说明，不给重试）。
- 创建分支**不碰本地执行库**：不 append、也不 rehydrate（后者避免"读过一次就当作存在"）。
- `ACTION_AUTHORITY_TABLE` 增 `create-matter`（`matter.create` / `external-write` / `requiresDecision:false`）——作用是让第 2 步能组装出可评估的请求，**不是授权**；放行仍取决于组织策略里的 grant。

## Alternatives considered

- 用草案 id 冒充 matterId 走第 3 步：否决（说假话 + 混淆草案与正式事项两类对象）。
- 本机先建后合并：否决（ADR-0005 明文禁止）。
- 不登记、继续以 `invalid-request` 结束：否决（那是"本票还没做"的码，与真实原因不符）。
- 现在自造一个本地托管实现：否决（托管是服务端职责）。

## Consequences

- 建项请求第一次有真实的终态语义：要么托管方回执（`CommandAccepted`），要么"托管方还没接"的可重试未就绪。
- 写侧注册表 1 → 2 条；后续动作按同一纪律逐条登记，每条都要先说清"在哪一步落、由谁落"。
- 新测试用 `vi.fn` 包住真实 rehydrate 端口并断言**未被调用**，同时断言本地库目录未被创建——两条一起才排掉"偷偷建一条"的两种写法。
