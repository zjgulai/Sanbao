---
title: 审批写路径落装（B 批）· 阶段一：声明层与 kernel 六态
doc_type: architecture
module: sage-shell
topic: approval-write-path-stage-1
status: stable
created: 2026-10-11
updated: 2026-10-11
owner: self
source: ai
---

# 审批写路径落装（B 批）· 阶段一：声明层与 kernel 六态

## Problem

会话控制六 operation 恒 unavailable 的第一断点：`ACTION_AUTHORITY_TABLE` 未注册（identity 步对未注册操作一律 unavailable，五 port 同表过滤，dispatch 硬编码只认 session.send）。B 线设计经对抗反驳折入（推翻 6 处表述、补缺 10 项）。

## Decision

按 [ADR-0317](../../../adr/ADR-0317.md) 实施**阶段一**：表六行 + effectClass 裁定；kernel `SessionCoreDispatchDetail` 六态 + 守卫（畸形 → outcome-unknown）；表钉子扩十行。全批七阶段路线登记在 ADR D4（阶段二 publications 再封印=owner decision 需用户裁定）。

## Alternatives considered

见 ADR-0317 备选表（一次全落、composition 直连、复用 attempt 事件——逐条否决）。

## Consequences

- identity 步对六 op 真实求值：**已登录无 grant → denied**（不再 unavailable）；未登录仍 unavailable（fail closed）。
- 端到端生效待阶段二（publications 含新 scope）＋用户 policy grants；v4-final DMG 冻结于本阶段前，走查不受影响。

## 阶段二（当日落地）：publications 再封印

用户点名授权（六项 grant 清单 + first-party 自证机制）后执行：新模块 `session-controls-publication.ts` + runner `scripts/publish-session-controls.mjs`（默认 dry、`--write` 落地、代际守卫防重复扩展）。三条 permission 声明逐字采用所请文本；adapter/contract 摘要按固定 canonical 声明自算（first-party 路线，ADR-0283 D4 同构）。落地：requirement v2 `fa2b7cae…` / registry v2 `6d3434c5…` / matrix v2 `f5d8c7ce…`；re-observation fixture 同步刷新（descriptor 换面重算摘要 + evidence 自摘要重算）。runner 自检当场抓出并修复：URN 双重包装、同 scope 双 tuple、快照剥 digest 语义、descriptor/evidence 摘要重算。端到端生效待用户 policy grants（六 op 行）。

## 阶段三（当日落地）：dispatch 解硬编码 + 路由映射

- `session-prompt-dispatch.ts` 去 `session.send` 硬编码：七 op 共用前端（表查/证据/重验/三端口重跑），分支到六个 handler 端口（`approvalAnswer`/`approvalWithdraw`/`pendingUpdate`/`queueItemUpdate`，全部可选：缺一即该 op not-dispatched）。成功收据命名到操作：`receipt:session-approval-answer:<id>` 等；approval 收据**随 detail 过 kernel 守卫**（detail.requestId 与 receipt.requestId 强配，防伪收据）；抛错 → outcome-unknown。
- composition 四路由 dispatched 1:1 映射：recorded receipt / ok / state ok；错配或裸 dispatched → `protected-effect-outcome-unknown`。app-service 把四个 option 端口接进 dispatch；index.ts 接 `pendingUpdate`（pendingInputs.edit/remove）与 `queueItemUpdate`（sessionChannel.queueItem）。
- **链上真缺陷（e2e 抓出）**：revision.actionPolicies 若把 `session.approval` 声明 requiresDecision:true，startAttempt 要求先行 approved decision → persist 恒 unavailable（死锁）。裁定：table/grant 层（身份能力）与 revision 层（执行前提）是两个家；control 类 scope 在 revision 声明 executable，decision-capability 只由 grant 表达。
- e2e：approval.answer 过真身份（decision-capable grant）/真 requirement 快照/真 registry/persist（attempt 落 business-matter store）/dispatch，route 答 recorded receipt。

## 阶段四（当日落地）：控制类 op 的同步闭合

- 真缺陷（阶段三 e2e 暴露）：控制类 op 的 attempt 由 turn-close 永远收不了口（无回合）→ open attempt 锁死后续任意 attempt。新模块 `session-control-close.ts`（main-owned recorder，best-effort、事件 id 与 turn-close 同形 `attempt-succeeded:<id>` / `attempt-failed:<id>` 故不可能双闭）：receipt → succeeded；确定拒绝 → failed（code 入 reason）；unknown → 既有 dispatch-unknown marker，attempt 保持 open fail-closed，待 per-op reconcile（登记后续）。
- dispatch 发/收两路共用 `answerUnknown`/`closeControl` helper；app-service 装配 `recordControlClosed`；门禁增第 4 枚事实钉（recorder 装配 + 经 domain kernel 落事件）。e2e 加解锁证明：approval 连答两次均 recorded。

## 阶段五~七（收尾）

- 阶段五：无独立残留——四路由消费真实 provider 装配与 dispatched 收据映射在阶段三一并落地（含 index.ts 真身接线）。
- 阶段六：裁定无需 checker 专属分支——mode 词汇描述「进入准入体制」而非「恒拒绝」；四路由与 session.send 一族同桶，矩阵/checker 双语一致。
- 阶段七（用户裁定 code 集合推导）：`retryableForRefusal`（unavailable/null→可重试；denied/stale/outcome-unknown→否）与 `describeControlRefusal` 是 renderer 侧唯一家；approvals 卡与 pending/queue 行两处文案按拒绝族分叉；route 应答体保持 {state, code} 零扩面。**B 批完成。**

## Verification

真实运行（2026-10-11）：

- tsc 0 错；全量 **2038 passed | 1 skipped（227 文件）**（阶段七后，B 批完成）。
- 新增/扩展用例：kernel 六态 detail 正例逐条 carry；畸形 detail（缺 ref/空串/非串）→ outcome-unknown；表十行精确钉子 + 六行逐条映射；identity spec 六行裁定钉子。
- `pnpm run gate` 退出码见提交记录。
