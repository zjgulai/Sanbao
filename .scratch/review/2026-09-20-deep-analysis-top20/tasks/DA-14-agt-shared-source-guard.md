# DA-14 · AGT 共享源改动 → 50 全量重生成护栏

- 优先级：P1
- 状态：`done`（2026-09-21 结算，随本批提交入库）
- 依赖：无
- 估算：M
- 来源：docs/architecture.md §3 引 research/16 §3.6；报告 TOP20 #14

## Problem

architecture.md §3 原文：「**AGT 共享源（含 ROSTER.md）任何改动 = 存量 50 全量重生成**，动它们之前先读 research/16 §3.6」。
目前这条是**阅读纪律**：如果只改共享源而不重跑 `scripts/role-presets/generate.mjs`，产物与源不一致不会有任何东西报错（P-03 形态）。

## 动作

1. 把「共享源 hash 变化 → 必须重生成」做成判据：`generate.mjs --check` 或独立 gate 比较共享源指纹与已生成产物的记录；
2. 判据红时必须点名「哪个共享文件变了、需要重生成 50 条还是 53 条」；
3. 更新 P-03 相邻记录与 research/16 §3.6 的互链。

## 验收

- 构造共享源单文件改动、不重跑生成器：门禁判红并点名；
- 重跑生成器后绿；`live-presets` 身份账本（56 preset）一致；
- 判据自带恒真桩突变用例。

## 注意

MGT 与 AGT 共享源相互独立（architecture.md §3），护栏要分别判两个命名空间。

## 结算（2026-09-21）

- 护栏落地为**生成器的 `--check` 模式**（重算走生成器自己的 load 函数 = 与生成同一条路，比对逻辑在
  `scripts/role-presets/source-freshness.mjs` 纯函数——P-07：不给「共享源是哪几个文件」造第二个家）：
  `node scripts/role-presets/generate.mjs --check`（0=一致 / 1=漂移点名 / 2=读数不可用，不写盘）。
- 门禁 `gate:role-preset-source-freshness` + selftest 已注册（quick 121 项）。
- 验收读数：真机绿（AGT 50 条 + MGT 3 条，各自 source-hash 一致）；
  **负例重放**：材料副本里只改 `ROSTER.md` 一个文件、不重生成 → `✗ [AGT] 50/50 条产物与共享源不一致——共享源已变：roster…需重跑全量重生成（AGT 本机 50 条 / 设计存量 50 条）`，MGT 保持绿（命名空间独立判，符合注意项）；恢复后 exit 0。
- 恒真桩突变：把「点名漂移」摘掉（`violations.length = 0` 形态）时 5/9 用例红（本模块 7 用例 + 判据内嵌断言）。
- P-03 账、architecture.md §3、research/16 §3.6 三处互链已更新。
