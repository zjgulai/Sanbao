# 037 回复操作与后续建议：投影动作清单、确定失败判据与只填不发的建议

> 决策与规则见 [ADR-0237](../../../adr/ADR-0237.md)。

## Problem

FW-035/US-188：回复操作区只提供已核实动作（复制、引用、仅确定失败时重试）；「后续建议」点击
只填入输入区、不自动发送。取证发现跨票真实缺陷：基座 `turn/end` 是**对象**
（`{kind: completed|blocked|max-tokens|aborted|error}`），而 005 fold/009 history 只认字符串，
真实运行恒落 `'ended'`——「确定失败」不可判，fakes 喂字符串故全绿（与 034 queue-edit 同类假绿）。

## Decision

- `turnEndKind` 归一（字符串原样/对象取 kind/其余 ended）；005 fold、009 history、031 监控、
  侧聊统一使用。
- `SessionChannelStatus.reply = {text, endKind, failed, actions}`：无文本空清单；有文本恒
  copy+quote；**retry 仅 `endKind==='error'`**；渲染面只画清单按钮（不本地自判）。
- 流断撤回 retry、保留 copy/quote，改给核对（只刷新零写）；重试走同一发送入口（最近一条
  用户行文本、新身份），在途不并行，未确认→只给核对。
- 后续建议=最新方案 ready 步骤（≤3）chips；点击只填输入区零请求；未接线/无可推进具名负空间。
- 本地反馈（复制/引用/建议/核对句）经 local-notice 变量守护，不被 2s 轮询冲掉。

## Alternatives considered

保留字符串解析（否：确定失败不可判）；渲染面本地判断（否：动作须来自投影事实）；流断连
copy/quote 也撤（否：文本事实不因流断作废）；未知后自动重试（否：US-187/021 三态）；
静态固定建议文案（否：无后端依据宁缺不演）。

## Consequences

- 机器断言：未知（流断）态无重试钮、只给核对；建议点击后输入区有内容且零请求。
- 跨票修复随行（005/009/031/侧聊）；spec：reply-actions（词表/折叠/reply 事实/aborted 非失败）
  ＋reply-actions-renderer（复制诚实/引用跨轮询/未知撤回/建议只填不发/负空间）。
- §1.6：确定失败态动作行＋2 chips；DOM 读数含跨轮询保留与 `retry[absent] audit[present]`。
- 已知未闭：评价/分支与建议的模型来源后置；真机未跑。
