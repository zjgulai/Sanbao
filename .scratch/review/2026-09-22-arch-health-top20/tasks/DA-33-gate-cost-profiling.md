# DA-33 · gate 耗时画像 + CI 两档射程漂移监控

- 优先级：P2
- 状态：`open`
- 依赖：无
- 估算：S
- 来源：df9c661（射程快照判据修复）之后的延续；113 项判据无耗时分档

## Problem

完整门禁 113 项全绿，但无耗时画像：哪些判据贵、哪些便宜、CI 两档（push/PR 或 quick/full）
的射程差异是否随时间漂移——df9c661 修的是「判据把同侪字节当改动」的机制，两档本身的
**耗时与射程漂移**没有监控。慢判据不可见 = CI 时间预算悄悄恶化没人管。

## 动作

1. 本地跑一轮 `gate` 与 `gate:full`，逐项记录耗时（判据框架若无耗时输出则加 timing 汇总行）；
2. 产出画像：耗时 Top10 / 总时长 / 两档差值；识别可并行的贵判据（登记，不实施）；
3. 若判据框架加 timing：改动本身过门禁 + 三态语义不变（skip 计数不得受影响）。

## 验收

- 耗时画像读数落盘（一轮快照 + 命令）；
- 框架改动（若有）红绿复验，113 项结论与改前一致；
- 贵判据清单与并行化建议登记（实施另开工单）。

## 2026-09-23 预检

`node scripts/gate.mjs --list --json` 实测135个注册项：quick 127、full 135。
full-only 8项：gate-concurrency-selftest、scripts-runnable、release-published、patch-anchors、
staging-freshness、worktable-fence、theme-tokens、theme-tokens-selftest。
这只是射程读数，不是135项已执行。

`gate-result.mjs:182-204` 的 runGateChecks 没有耗时字段；本轮计划初稿“复用既有duration”
的假设撤回。不能把其他报告里的duration_ms推定成当前门禁字段。先用外部单调时钟记录
整轮耗时，逐项画像仍需有测试的仪器补齐，未测部分不填估计数。
full会运行包build并可能改写已跟踪产物，不能在共享主树为测耗时而直接启动。

## 2026-09-23 R4 首轮画像（quick，AV 竞争环境）

**仪器**：`runGateChecks` 增 `durationMs` 逐项计时（可注入 `now`，34/34 自测绿，
三态语义与摘要不变）。注册项随 `wanzh-host-contract` 接线变为 **136**：
quick 128、full 136（full-only 仍 8）。

**读数**（`node scripts/gate.mjs --mode quick --json`，2026-09-23 03:43）：

- 墙钟 1420.59s（user 90.67 / sys 47.21）；逐项 durationMs 求和 = 1420s，仪器自洽；
- 环境：load 前 16.45 后 15.80（10 核）；期间 kavd 206%、fileproviderd 112%——
  本轮是 **AV 竞争下界画像**，不是干净基线；
- 结论：128 项 124 绿 3 skip（live-presets、resource-path-reachability、dmg-layout-doc）
  1 红 = **repo-attest-selftest**：墙钟预算 1200s 耗尽（exit 124），门禁自带判词
  「不能按代码缺陷读」，已单独复跑归因（见下）。

**Top12（durationMs，含竞争放大）**：
repo-attest-selftest 1200065（超时杀）、release-artifacts-intact 37750、
object-store-hygiene 32749、setup-app-locator 16863、
package-files-coverage-selftest 13717、brand-icons-selftest 10741、
brand-replay-selftest 8671、changed-packages-selftest 8457、
repo-snapshot-selftest 8262、skill-lines 6648、
destructive-preset-skill-transactions 5765、boot-wordmark-selftest 4832。

**待办**：① ~~repo-attest-selftest 单独复跑读数~~ **已完成**：`node --test scripts/lib/repo-attest.test.mjs` 单独跑 **9/9 绿、exit 0、240.3s**（六条结束路径每条 ~22s，仍处 load≈15 环境）——门禁内 1200s 超时系 kavd/fileproviderd 竞争放大 ~8 倍，归因闭环，非代码缺陷；② 干净环境（AV 安静窗）重跑
quick 一轮取可比基线；③ full 档必须在隔离副本跑（不能共享主树），尚未执行。


## 注意

- 多会话同机：耗时读数注明当时的 load（参考 09-22 环境 load 4.59）；
- pnpm 输出整段缓冲别当卡死（已知坑）。
