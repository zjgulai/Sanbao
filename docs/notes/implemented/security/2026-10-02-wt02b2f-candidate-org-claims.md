# WT-02B.2F · candidate org claims 提取（Logto organizations scope → registry candidateOrgRefs）

日期：2026-10-02 · 分类：security · 关联 ADR：[ADR-0189](../../../adr/ADR-0189.md)

## Problem

WT-02B.2C 交付的 identity registry 条目含 `candidateOrgRefs` 但恒空，明确留给「organization mapping 之后」的票（`NOTES`：candidate org claims 不在 2C）。2A 治理语义：candidate 只是**查找提示**——「用户选择和 identity mapping 返回的 candidate organization 都只是意图 / 查找线索；只有 Organization Policy Provider 能证明 membership / role / grant」。队列「3-1-2」的 ③ 即补上真实 IdP 侧的候选提取。

## Decision

用户四裁决（2026-10-02 逐题确认）：真实登录探针取证 / 租户无 org 空候选如实 / 坏 claim 非阻断 / 原样 IdP org ID。落地：

1. **Scope 与 claim**：`OIDC_SCOPES` 增 `urn:logto:scope:organizations`（Logto 事实：该 scope 使 `organization_data`（object[]）**默认进 ID token**；userinfo 仅是不透明 token 的备选路径，本票不取）。**Live 探针首要验证点：Logto 是否接受该 scope**——已通过（见读数）。
2. **提取（`extractCandidateOrgRefs`，oidc-adapter 导出纯函数）**：缺失 → `[]`；**严格全弃**（非数组 / 条目非对象 / `id` 非 exact 非空 trim 串 / 条目 >64 / id >128 字符 → 整组为空，不部分信任）；通过 → 去重保序的**原样 IdP org ID**；**只取 `id`**（最小子集，其余字段丢弃）。**非阻断**：claim 坏不失败登录（提示数据不升格为认证门槛）。
3. **Registry**：`resolve({issuer, subject, candidateOrgRefs})`——miss 铸 handle + 存候选；hit handle 复用、候选 **replace**（latest login = IdP 最新真相；数组等值时保持同一 entry 对象；存储为 detached 副本）。仍 runtime-only / 零持久化 / 零日志 / 不达 renderer。
4. **接线**：`oidc-runtime.ts` 依赖类型更新；`main/index.ts` 直通不变；内核 / provider 零消费候选（不变）。
5. **验证载体**：新增可复用登录探针 `test/support/login-probe.mjs`（plain Node 组装真 transport：global fetch / macOS `open` / node http loopback / crypto + **真 adapter + 真 registry**），浏览器点一次登录；只打印非秘密读数（登录状态 / 候选计数 / handle 是否铸出），不打印 tokens、subjects 或 refs。

## Alternatives considered

| 方案 | 结论 |
| --- | --- |
| claim 形状坏时 fail-closed 登录阻断 | 否决；提示数据坏形状不应升格为认证门槛（非阻断→空候选）。 |
| candidate 规范化为 `organization:<id>` 前缀形 | 否决；前缀语义是自造的，IdP↔Sage org 映射留给未来映射层。 |
| 仅 fixture 测试（不做真实登录探针） | 否决；scope 是否被真实 Logto 接受是本票最大风险，必须有真实读数。 |
| userinfo / access-token 路径取 org 数据 | 否决（本票）；JWT 路径下 ID token 默认携带 claim，userinfo 仅不透明 token 需要；探针若显示缺 claim 再评估 resource。 |

## Consequences

- **真实读数**：`npm run typecheck` 0 error；全量 **58 files / 573 tests 全 PASS**（adapter 14→19：流程 2 + 提取矩阵 3；registry 5 重写含 replace/detach 语义）；`npx tsc` 构建通过；`npm run smoke` PASS；仓根 `pnpm run gate` **25/25**。
- **变异验证四组**（改源→红→还原后复核）：M1 严格全弃改部分信任 → 红；M2 去重删除 → 红；M3 registry hit 不 replace → 红；M4 条目数上限移除 → 红；四组还原后 19/19 + 5/5。
- **Live 探针读数（2026-10-02，真实 Logto + 浏览器登录）**：`login: ok (PrayChow)`——**scope 被 Logto 接受**（关键风险退役）；`session: active`；`candidates: 0`——**租户当前无 organization，空候选如实**（用户裁决不造数；有 org 后自然生效）；`handle: minted`。
- **边界**：候选仍仅为查找提示（内核 / provider / resolver 零消费）；runtime-only 零持久化；不进 renderer / Host / logs / 事件；不做 org-selection UX；不做 IdP↔Sage org 映射；不做 userinfo 路径；不读 `.credentials.yaml`。
- **遗留登记**：org-selection UX 与 IdP↔Sage org 映射（未来票）；候选消费到 `requestedOrganizationRef` 线索的接线（WT-02D.2 范围）；userinfo 路径（仅在 ID token 缺 claim 时才需要）。
