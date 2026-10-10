# 第 9 步 persistence：证据入链、域 authored attempt 与同事务原子落盘

- 日期：2026-10-11
- 决策：[ADR-0288](../../../adr/ADR-0288.md)
- 状态：已实施（证据封存 + 事实扩形 + 域 attempt + 原子落盘 + 再核验 + 身份缺陷修复 + 门禁事实与突变）；dispatch 与 WT-02B.3 授权证据持久化属后续批。

## Problem

第 8 步闭链后链路停在 persistence 前。侦察确认家底齐备（域 `attempt-started` 词汇与构造器、证据内核与 store 同事务 append 均存在未接线；WT-02B.3 未批准故不写身份证据），但两处结构问题挡路：① 兼容事实只带不透明 evaluationRef，证据含 issuedAt 墙钟无法事后逐字节重建；② 组合层 `intent.requestId = caller correlation`，而生产 correlation 恒为 `caller:session-core`——同一 caller 每个请求同一 attemptId（域必拒），且冒号违反证据 id 词法（本批在真实 spec 中首先暴露：`evaluation:sage.request:fixture` 被内核拒）。

## Decision

1. 用户裁决证据入链：兼容事实扩 `evidence`（评估时刻封存、字段逐项有家、单一家 `matrixBytesReference`）；persist 从同一发布件重建 historicalMatrix。
2. 事件载荷由域 `startAttempt` authored（状态机 + revision policy 校验）；`executionSnapshot` 取 requirement 声明面、digest 列 = artifactDigest；`compatibility` 面取证据；事件 + 证据经 `appendWithCompatibilityEvidence` 同事务落盘，appendId 幂等。
3. 写入前再核验便宜真实子集（context/identity/frame/store 重读 digest/current/availability）；移动=stale、缺失=unavailable；全量重跑留 host-lifecycle 票。
4. 身份缺陷修复：`requestId = randomUUID()`（每请求唯一）；correlation 保持原义；门禁具名拦截回退。
5. commit-unknown/冲突/重复 id/阻塞/非法一律 unavailable（无证明提交绝不派发）；replayed 幂等 allowed。

## Alternatives considered

- 每请求 holder 旁路 / persist 事后重建证据 / 域外自撰载荷 / 沿用 requestId=correlation / 空 events 仅证据 / 同批写 WT-02B.3 授权证据——逐条理由见 [ADR-0288](../../../adr/ADR-0288.md) 备选表。

## Consequences

- 链路真实推进到第 9 步；停在 dispatch（absent），路由级仍 `protected-effect-unavailable`。
- 首次真实持久副作用：attempt + 评估证据同事务、可重开复核、可严格重放（测试闭环实证）。
- 未闭：dispatch、WT-02B.3、host-lifecycle 失效、撤销运营、产品侧「进入 revision」流。

## Verification

证据（2026-10-10/11，全部真实执行；未跑的照实写）：

- **端口 spec（真实 sqlite 端到端）**：`test/session-prompt-persistence.spec.ts` **4/4**——happy：域构造历史（create → revision entered 声明 session.prompt policy）落临时 store，证据经真实编解码自 reobs 夹具 + 测试本地矩阵封存，端口再核验→域 authored attempt→同事务落盘；重开复核：域投影含 attempt 且 executionSnapshot 与 requirement 声明面一致、证据可载且严格重放 outcome=equivalent。drift：context/session/frame/digest/availability/证据缺失/证据伪造共 11 个拒答分支全部 fail closed（stale×5 / unavailable×6），且拒绝后**零写入**（回流 attempts=0、证据 not-found）。outcomes：六种 append 结果全映射 unavailable（每例 appendAttempt 恰一次调用）。
- **门禁自测**：`node --test scripts/gates/sage-route-authority.test.mjs` **45/45**（新增七条具名红：ungate 接线 / requestId 回退到 correlation（旧缺陷回归钉）/ 证据丢弃 / digest 复核移除 / 域作者绕开 / commit-unknown 放行 / 第二写路径；过程中自测再次抓到两条自伤——pin 被注释词面误伤、突变文本保留 pin 子串——均已修正）。
- **typecheck**：0。
- **全量套件**：212 文件 / 1891 通过 / 1 skip（exit 0）（经 `scripts/test.mjs` 的 Electron 运行时——store 的钉版运行时要求，plain-node vitest 会正确拒绝开库）。
- **门禁**：`pnpm run gate` **32/32（objects 319/319，exit 0）**；首跑 31/32 为 `electron-single-frame-caller-binding` 高负载时序红（已登记 flake 家族第三次出现；裸跑全量 212/1892 exit 0，复跑门禁全绿）——非本刀回归。
- 未运行：本批不动 publications，produce 未重跑。
