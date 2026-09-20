# DA-14 · AGT 共享源改动 → 50 全量重生成护栏

- 优先级：P1
- 状态：`open`
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
