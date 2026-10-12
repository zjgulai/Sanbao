---
title: profile 启动自愈：五类 kill 窗口收敛，electron 子树 admission（ADR-0335）
doc_type: architecture
module: sage-shell
topic: profile-boot-reconcile
status: stable
created: 2026-10-13
updated: 2026-10-13
owner: self
source: ai
---

# profile 启动自愈：五类 kill 窗口收敛，electron 子树 admission（ADR-0335）

## Problem

ADR-0332 文档化的 kill 窗口（`finally` 不跑）从未被修复：同 id 两次 rename 之间被 kill = 指针仍旧树缺失 → 启动失败退出（人工恢复）；fresh 装机窗口被 kill = pristine 门拒装且清理后仍拒（electron/** 必有 Chromium 文件）；new-id 窗口被 kill = 永久卡旧版（`refusing … generation already exists`）；提交后残骸与旧代际无限堆积（481MB/代）。审计确认零自愈、零 GC。

## Decision

按 [ADR-0335](../../../adr/ADR-0335.md) 实施：启动链改为 ensure → **configure → reconcile → admission → install**；新模块 `profile-reconcile.ts` 先算后落（提交失败 fail closed、清理 best-effort、全态幂等）；致命窗口回滚（唯一 receipt 匹配 displaced 回位）；无指针/被杀前滚的代际经**安装同套验证**后采纳（activatedAt 优先自死亡事务的 verify 指针）；GC keep-1；admission 对 `electron/**` 不下钻；`readActiveProfile` 拆出裸指针与就地验证两个导出。

## Alternatives considered

见 ADR-0335 备选表（前滚、删除恢复 pristine、admission 保持原位、只校 receipt sha、GC 全保留——逐条裁决）。

关键两票：**回滚而非前滚**（少一条恢复路径写指针的信任分支，常规重试天然收敛）；**采纳验证复用安装验证**（活动面不得有第二条信任路径）。

## Consequences

- 五类窗口收敛；致命窗口实测由「启动失败退出」变为 `rolled-back → existing → host ready`。
- 真实启动面次序与 admission 语义变化由 `desktop-entry.spec`（+2 次序断言）与 `bundled-profile.spec`（+1 admission 回归）钉住；`profile-reconcile.spec.ts` 17 例覆盖每窗口与 GC/平局/symlink/坏指针/健康根。
- 夹具抽到 `test/support/profile-fixtures.ts`（bundled-profile 与 reconcile 两 spec 共用一处）。
- 残余（文档化）：单实例锁未做（module docstring 记）；根级 pre-C1 Chromium 遗留与 `.DS_Store` 仍 fail closed（人工恢复，与现状同）。

## Verification

真实运行（2026-10-13）：

- `pnpm run build` tsc 0 错；全套件 2146 passed（1 skip）；`pnpm run gate` 退出 0。
- 新 spec 17 例 + 既有 profile/entry spec 全绿（31/31 定向）。
- **装机实测**（staging Sage.app + scratch root，逐态构造后启动，读 stdout 次序）：
  1. fresh：`reconcile unchanged → bundled profile installed → host ready`。
  2. W1（删指针+删代际+staging 残骸+Chromium 垃圾；修正前实测 = `refusing … not pristine` 启动失败）：`cleaned → installed → host ready`。
  3. W2 致命窗口（代际 mv 到 `displaced-live`；修正前 = 启动失败退出）：`rolled-back → existing → host ready`，代际回位、staging 清空。
  4. W3（删指针、树完好）：`adopted → existing → host ready`（不重拷）。
  5. W5（`cp` 代际到 displaced）：`cleaned → existing → host ready`，staging 清空。
  6. 健康根连启：`unchanged → existing → host ready`，无 churn。
- v15 DMG 验收记录另见 packaging note。
