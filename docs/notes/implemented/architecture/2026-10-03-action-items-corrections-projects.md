# 028 行动项、要求更正与项目汇总

> 决策与规则见 [ADR-0226](../../../adr/ADR-0226.md)。

## Problem

FW-029/US-146~149：行动项属于事项、可分派与跟踪，不等同交付项/待办请求/工具调用/一次运行
（D-012/060）；执行记录可回看并关联当时依据；「另补要求更正」以关联原要求的消息＋生效回执表达、
不覆盖不重放（D-057）；项目只做归属与汇总、不自动改变主责/可见范围/事项事实（D-007/016/089）。
验收：①更正可追溯到原要求与生效回执；②项目汇总不自动共享或改变主责（有断言）。基座无这三个
概念（Sage 自建）；可复用的真实读数=005 的发送受理结果与 006 的队列项状态
（submitted=仍在队列、consumed=已取走）。

## Decision

- `main/action-items.ts`：行动项状态机 open→in-progress→done；完成=纯状态变更（不追记录、不发
  消息、不触其他存储，有断言）；登记执行冻结 {revision,title,note} 快照；update 只 bump revision；
  done 后 start 拒绝 `action-done`；视图九键钉住（无 receipt/delivery/toolCall/run 词汇）。
- 更正：`submitCorrection` 只发新文本（同一发送路径，一次一封，原要求绝不重发）；回执三态按真实
  读数升级——accepted→已接收（受理≠生效）、deferred+队列状态→待应用、队列 consumed→已生效、
  refused 原码记录不重试；original {text,at} 留存于同一视图。
- `main/matter-projects.ts`：项目只有 name+refs；事项最多一个、变更=move 留 trail；汇总按 ref
  引用同一记录；归属变化读态逐槽 byte-equal（matter/draft 主责/links/readout 不动，仅 projects 变）。
- 路由 `/.sage/action-items` `/.sage/corrections` `/.sage/projects`；槽 `actionItems`/`projects`。
- 页面：事项面板 D6 卡（行内 start/complete、记录列表、更正选择原要求+编辑副本+回执徽章、项目
  创建/归属/解除+汇总），文案明说四类对象互不替代与"归属不改变主责/可见范围/事实"。

## Alternatives considered

- 完成补"成功"记录：否决（伪造执行，D-060 点名）。
- 更正编辑原消息本体：否决（D-057 保留原消息、关联新要求）。
- 自动重试未生效更正：否决（不重放未知结果）。
- accepted 当已生效：否决（D-012 接收≠生效）。
- 项目存事项快照：否决（复制事实，D-089 汇总引用同一记录）。

## Consequences

- 两条验收的机器断言：更正追溯链（route 层用真 pending store 驱动 deferred→queued→consumed 的
  回执升级）；归属仅动自身（readState 逐槽比对 byte-equal + draft.responsibility 原样）。
- 语义区分断言：完成零副作用；视图键钉住；文案（4 类互不替代、完成≠交付验收、受理≠生效）。
- 已知未闭：三对象本运行（持久化后置）；分派给他人/项目权限后置；真机未跑。
