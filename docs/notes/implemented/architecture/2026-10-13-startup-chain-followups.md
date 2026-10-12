---
title: 启动链补遗：单实例锁与 admission 具名容忍（ADR-0338）
doc_type: architecture
module: sage-shell
topic: startup-chain-followups
status: stable
created: 2026-10-13
updated: 2026-10-13
owner: self
source: ai
---

# 启动链补遗：单实例锁与 admission 具名容忍（ADR-0338）

## Problem

ADR-0335 的两条具名遗留：（1）无单实例锁——同根双实例会互见对方的自愈/事务面（实例 B 可能清掉 A 的在途 staging）；（2）admission 仍拒绝 `.DS_Store`（Finder 闲逛留痕）与 pre-0335 世代根级 Chromium 遗留（`Local State` 等），升级用户的遗留根在指针缺失时被拒装。

## Decision

按 [ADR-0338](../../../adr/ADR-0338.md) 实施：packaged-only 单实例锁（configure 后、自愈前取锁，按已配置 userData 分根；第二实例具名 stdout + `app.exit(0)` 零触根；`second-instance` 聚焦既有主窗）；admission 具名容忍（`.DS_Store` 任意层 + 六个根级 Chromium 遗留名，名单外/根外/符号链接全部保持拒绝）。

## Alternatives considered

见 ADR-0338 备选表（全世代加锁、按默认 userData 加锁、通配名单、自动清除——逐条否决）。

关键一票：**锁必须在 `configureElectronPaths` 之后取**——按已配置 userData 分根，Sage 根 / dev 根 / 探针根互不干扰（实测误配默认根时，两个不同根实例按设计正确放行，反证分根语义）。

## Consequences

- 同根第二实例零副作用退出；升级用户的垃圾遗留根可正常安装。
- dev / 探针 spec 不加锁：同根顺序双进程语义（主题/密度 restart 探针）不变。
- 实测教训（诚实披露）：漏 `SAGE_ROOT` 的「第二实例」验证会以真实根启动并升级真实根 profile——事务正确且可自愈（对应 app 版本再次启动时模板差异换位回），无损坏。

## Verification

真实运行（2026-10-13，staging Sage.app）：

- 单实例：首实例 scratch 根启动（`reconcile unchanged → host ready`）；同根第二实例 → stdout `second instance refused`，exit 0，首实例进程不受影响；不同根（默认根）实例按设计并行放行（锁分根语义反证）。
- admission 容忍：fresh 根预置 `.DS_Store` + `Local State` + `DevToolsActivePort` + 悬挂 `SingletonLock` 符号链接 → `reconcile unchanged → bundled profile installed → host ready`（修正前此根=「not pristine」拒装）。
- spec：`bundled-profile.spec.ts` 9/9（含容忍正例 + 「harness 下的 `Local State` 仍拒」负例）；全套件 2147 passed（1 skip）；`pnpm run gate` 退出 0。
- v16 DMG 验收记录另见 packaging note（若随批出包）。
