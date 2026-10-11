---
title: T09 产物与工具结果批（逆向放大装配）
doc_type: architecture
module: sage-shell
topic: t09-artifact-tool-results-batch
status: stable
created: 2026-10-11
updated: 2026-10-11
owner: self
source: ai
---

# T09 产物与工具结果批（逆向放大装配）

## Problem

R15：合成榜第 3 名。五伞（A03/A04/A05/M03/M05/P12）在账本中除 A04 一个交叉叶（QB1-20）外无可辨认叶；用户指令（2026-10-11）要求信息不足时直接逆向本机 Qoder.app 0.4.4 并应用 rea。

## Decision

按 [ADR-0314](../../../adr/ADR-0314.md) 实施。侦察链：rea `analyze-javascript-application`（integrity-policy record-and-continue，183MB Evidence）+ app.asar 全解包（209M/1131 资源）→ UI 事实线/接线行为线 → Sage 兼容设计 → 完备性批评（修正 7 处过度表述）。用户裁定五项后落装：A03/A04 类型分派与标签、A05 三态与失败码句子、M03 只读终端面板与网络命名归一、M05 session-log 半边装配与 typed 视图、P12 chrome 平台化。

## Alternatives considered

见 ADR-0314 备选表（多窗/全权 renderer 不迁、版本历史不装、插件声明源头不采用、双写否决、caller-binding 不顺手改、PTY 不装）。

## Consequences

- 会话页两新面（工具结果/集成终端）；产物卡不支持态具名；独立预览窗平台化 chrome；矩阵 102→108。
- 设计输入档案：`/tmp/qoder-asar`（解包）、`/tmp/qoder-rea-digest.json`（压缩摘要）——本机临时件，结论已带版本戳固化入 ADR/本记录。

## Verification

真实运行（2026-10-11）：

- tsc `--build` 0 错 + `scripts/build-renderer.mjs` 双 bundle 产出（窗口探针前置构建通过）。
- 全量套件：**2010 passed | 1 skipped**（新增：session-channel 折叠两例、artifact-preview 文本族 too-large、artifact-window chrome 两例、desktop-session 终端/工具结果两例、desktop-session-view display-only 一例）。
- 矩阵 `--write`/`--check-source` + 门禁 + 自测全 PASS（206 行）。
- 提交前四透镜对抗评审：17 审（去重发现）→ **16 确认（1 被反驳剔除）** + 完备性批评 5 项，全部修复并各配用例/case：
  ① composition 求值序（toolResults 移至 sessionChannel 之后——修复前仅靠 runMonitor 顺带读兜底且封套内两槽可能跨两次 read）；
  ② 终端输出页竞态（页随 terminalId 身份化 + 请求序号 token——迟到响应既不挂错行也不覆盖当前页）；
  ③ 失败码→句子映射覆盖全部已知拒绝码（art-too-large/not-text 等不再裸码）；
  ④ 工具结果文本=会话内容类边界入档（与 assistant 正文同敏感级，结构化字段纪律不变）；
  ⑤ 工具结果行标题去重（title==tool 时不再「bash · bash」）；
  ⑥ 卡标签去掉「（可用系统应用打开）」——sage-shell 无系统打开路径，未验证能力不钉进出货面；
  ⑦ 终端 read 的 route 具名 unavailable 码透传不压平；
  ⑧ 装配守卫新增「同请求取折」钉死用例；
  ⑨ 工具结果行不再渲染日志时间（event.time 单位无证据钉住，不造纪元日期）；
  ⑩ 有界口径统一为**字符**（文档「8192 字节」系单位笔误，实现与内核同界）；
  ⑪ 断流未对账时 declarations 归空——部分折叠不作为可认领结果出货；
  ⑫ link/table 字段渲染补断言 + 走查手册补链接条目说明；
  ⑬ reconcile 合并 openToolCalls 改并集（对账后到达的结果仍知其工具名）。
- 待真机：工具结果自然到达、终端真实输出、独立窗口观感——走查手册第 17 步；本记录不升格。
