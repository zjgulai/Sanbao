# 009 冷历史与运行历史：逐运行详情与当时实际模型

> 决策与规则见 [ADR-0233](../../../adr/ADR-0233.md)。

## Problem

FW-021/US-024、US-097~101：不激活、不重发、不触发运行地回看既有会话——列出运行（进行中
与已结束）、按需展开逐运行详情，并如实标注该次运行**当时**实际模型（US-099，与当前选择
分开）；US-024 明令历史接点零副作用；US-100 读不到保持缺失、不得空白成功。基座已具：
`session/page`（records 为 `{type:'event',event:{seq,type,data}}`）、`request/header` 的
`data.header.config.{provider,model}` 快照、turn/start|end 组运行。

## Decision

- `main/session-history.ts` `list` 只调 `session/page`（throughSeq:-1、maxMessages 有界）；
  调 create/prompt 或重发上传即违反 US-024；no-session 绝不建会话。
- `runsOfRecords`：turn 组运行、未闭合 endSeq=null；newest-first、MAX_RUNS=50、
  hasMore 携 nextBeforeSeq 游标。
- `detail`：一次有界页后按 `seq≥runSeq 且<下一运行起点` 过滤；outputPreview≤2000
  （outputTruncated 自报）、userTexts≤4×300；失败=missing+code。
- 模型=该运行 request/header 快照拼接；null 不借今日默认；渲染句注明与本事项当前选择分开。
- 渲染面：历史区（read/more 游标按钮/rows/detail），显式动作才读、无自动轮询；
  missing 句自报缺失；空态另句。
- 端口名册 +2（sessionHistoryList/sessionHistoryDetail）。

## Alternatives considered

当前配置冒充历史模型（US-099 否决）；全量拉取本地切运行（无界读、与分页冲突）；
透传整段记录（US-098 逐运行窗口语义）；失败显空（US-100 否决）；打开即激活续读
（US-024 零副作用）。

## Consequences

- 机器断言：调用表仅 page；模型取快照且 null 保留；missing 贯穿通道与渲染。
- 005~008 守护未受影响；名册 deliberate 更新两处。
- §1.6：历史区文案、倒序行、模型徽章、展开详情、missing 句两宽实测；DOM 逐项核。
- 已知未闭：US-101 两次运行对照后置；跨会话历史、搜索、导出后置；真机未跑。
