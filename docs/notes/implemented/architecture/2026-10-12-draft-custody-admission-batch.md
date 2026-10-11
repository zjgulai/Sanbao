---
title: L1-C 草案保管四命令收口：第三 admission 家族
doc_type: architecture
module: sage-shell
topic: draft-custody-admission-batch
status: stable
created: 2026-10-12
updated: 2026-10-12
owner: self
source: ai
---

# L1-C 草案保管四命令收口：第三 admission 家族

## Problem

draft create/update/cancel/reconcile 四路由直连（violation）；转换路属确认流水线（另案）。

## Decision

按 [ADR-0323](../../../adr/ADR-0323.md)：新 draft-custody 家族（五步面 + 四 detail kind）＋表四行＋真 dispatch 端口（含 reconcile 三态裁决与 commit/note 回写）＋四路由收口；convert 路留族外、commit/note 双职共用闭包；门禁翻转 16/10/19。

## Alternatives considered

见 ADR-0323 备选表（并入 matter 家族、convert 一并收口、reconcile 走错误码面——逐条否决）。

## Consequences

- 三家族并立；direct 违规 14→10；余量：C2 prepare-only 三路由、D2/E1 续波。

## Verification

真实运行（2026-10-12）：

- tsc 0 错；新增内核与 dispatch 双 spec 各 4 例；四处既有 spec 按新事实改写（表钉扩十八行；identity-default/convert-custody/draft-store 路由经真 dispatch 端口，convert 路双职闭包恢复）；全量 **2075 passed | 1 skipped**。
- route-authority：路径集 +4、判据 16/10/19、矩阵四行翻转、三族识别扩展；selftest 56/56；`pnpm run gate` 退出码见提交记录。
