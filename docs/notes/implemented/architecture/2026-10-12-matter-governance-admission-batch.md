---
title: L1-A 事项治理 admission 家族：五步面 + matter-admin 四 op 收口
doc_type: architecture
module: sage-shell
topic: matter-governance-admission-batch
status: stable
created: 2026-10-12
updated: 2026-10-12
owner: self
source: ai
---

# L1-A 事项治理 admission 家族：五步面 + matter-admin 四 op 收口

## Problem

22 条违规路由中 matter 家族是最大功能缺口（事项归档/恢复/批量/重命名路由直连、UI 零动作入口）。session-core kernel 十步固定序不适用于 local-write；ADR-0315 D2 预告须扩 protected-effect-admission family。

## Decision

按 [ADR-0320](../../../adr/ADR-0320.md) 实施：新家族模块 `matter-governance-admission.ts`（五步纯函数面，共享 kernel 守卫；session kernel 零改动）+ 表四行（matter.admin scope, local-write）+ 真 dispatch 端口 `matter-admin-dispatch.ts`（payload 守卫/漂移复检/provider 映射）+ composition 四路由收口（收据 1:1 映射 + 身份配对）+ 门禁事实有意翻转（22→21 bypasses / 16→15 direct / 13→14 admitted + 两族识别 + 两钉）。UI 真按钮排 L1-A.2。

## Alternatives considered

见 ADR-0320 备选表（十真 port、kernel 表驱动改造、独立 intent 册、batch 逐 target 配权——逐条否决/推迟）。

## Consequences

- 第二 protected-effect 家族成立；matter-admin 四 op 全链（identity 真 policy 三态验过）；route 面 matter-admin 转 compliant。
- 余量具名：L1-B groups 四 op；草稿/编辑稿/side-chats/workspace/plans/action-items 同型后续波；UI 动作入口 L1-A.2。

## Verification

真实运行（2026-10-12）：

- tsc 0 错；新增 spec：内核 6 例（五步路径/配对/逐级失败词表/守卫/坏 detail 四型/守卫函数）、dispatch 4 例（映射与拒绝/九种坏 payload/五种漂移/抛错）、surface 重写 + 2 例（真 policy 三态经真身份端口；错配收据→保守 unknown）；全量 **2059 passed | 1 skipped**。
- route-authority 门禁：矩阵行翻转 + 判据反转（21/15/14）+ 两族识别 + 两钉；selftest 56/56；`pnpm run gate` 退出码见提交记录。
