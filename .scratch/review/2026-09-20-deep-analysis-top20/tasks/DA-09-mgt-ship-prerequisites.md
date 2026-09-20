# DA-09 · MGT 管理层出货前置条件推进（或复核边界并记录）

- 优先级：P1
- 状态：`open`
- 依赖：需要用户裁决
- 估算：M
- 来源：docs/architecture.md §3 岗位 Preset 体系；ADR-0129；报告 TOP20 #9

## Problem

architecture.md §3 明写：管理层（MGT-001~003）当前姿态为「**评估载体 + 本机装配**——profile 可加载、限 MGT-EVAL 与人在环演练、未授权 Shadow/生产、出货面 exclude 档」；**出货前置** = MGT-EVAL-A/B 通过 + R0 对照臂结论 + 另立 ADR。
即：要么推进三项前置进入可出货状态，要么在文档中复核「未授权 Shadow/生产」边界仍然成立并保持 exclude。

## 动作

1. 与用户确认方向：本季度是否要出货 MGT；
2. 若出货：按 ADR-0129 清单启动 MGT-EVAL-A/B，设计 R0 对照臂，结论落 Note，另立出货 ADR；
3. 若不出货：复核 exclude 档仍被 `packaging/scripts/select-presets.mjs` 覆盖，并在 §3 刷新一段「复核于 yyyy-mm-dd」。

## 验收

- 出货方向：MGT-EVAL-A/B 报告 + R0 结论落 `docs/notes/`，新 ADR 编号登记；
- 维持方向：一条命令证明 MGT 条目不出现在出货 preset 面（select-presets 读数）；
- 两种方向都更新 architecture.md §3 的「当前形态」日期。

## 注意

这是需要用户拍板的分叉项，先问再动；MGT 材料侧对应 D-065/D-066，勿绕过。
