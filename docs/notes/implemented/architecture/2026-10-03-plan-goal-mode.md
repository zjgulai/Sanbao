# 039 目标/计划模式：服务投影只读、具名切换与「不回执不改显示、不写默认」

> 决策与规则见 [ADR-0239](../../../adr/ADR-0239.md)。

## Problem

FW-036/US-192~194：模式状态由服务投影给出；界面切换是具名请求，**回执生效后才显示为新
模式**；**事项内切换不写全局默认**（默认只在设置页明确修改）；**计划模式输出进入方案预览**；
**退出计划不留下"已执行"暗示**。基座事实（pin 包 `dsh-plan-mode`）：`ctx.planMode.get(agent)`
=投影裁剪视图 `{active, pending?}`（`plan` 投影折叠日志，空日志 fold 为 inactive）；
`set(agent, active)` 返回基座自己的词 `committed|queued|cancelled|noop`（开轮期选择 pending，
下一步被接受的 pre-step 才落日志）；`exit_plan_mode` 经 user-questions 呈 plan-review
（detail=方案 markdown，intent.approve 命名通过项；034 中继已镜像）。

## Decision

- 桥面 +`session/plan-mode`（read：`agents.get`→`planMode.get`；缺席=provider-unavailable，
  无活代理=`bridge-session-not-live`，形状不符=unreadable；pending 缺席归一 false）与
  +`session/plan-mode-switch`（write：四结果词原样过桥，非四值=unreadable）；消费登记
  +`planMode`+`agents`；host 表 deliberate +2。
- `main/plan-mode.ts`：read=投影状态（no-session/unavailable 各留名）；switch=具名请求+
  **后读视图**（失败=view:null+viewCode，回执仍 settled 如实）；family 三族
  applied/pending/unchanged；**只触这两个端点、不写任何默认、事项间零泄漏**。
- 渲染面：互斥两钮（实际模式「（当前）」；pending 目标「（下一步生效）」）；注记区分
  current/pending/未接线/no-session；回执三族文案；**退出计划=「退出不等于方案已执行」**；
  plan-review 卡渲染方案预览+「接受方案不等于执行其中动作」（提交仍同卡）。
- 模式级审批/团队策略/自动执行与设置页默认写面首版不做。

## Alternatives considered

切换写设置页默认（否：US-193）；只读 command/run 投影推 pending（否：controller-pending 不在
日志，get 才含）；桥端折叠四词为单态（否：回执词是基座的，三族映射归 store）；无活会话假装
inactive（否：恢复会话可能 active，假默认=编造）；plan 输出另建 Sage 卡（否：事实通道是
user-questions，第二个家必漂）。

## Consequences

- 机器断言：事项 A 切换不影响新事项默认（他事项/新事项读取各自独立、no-session 依旧）；
  回执三族可区分且未生效显示实际（view active:false/pending:true）；plan-review 预览呈现且
  接受≠执行。
- §1.6：1440/660 两宽亲看——「目标模式（当前）」高亮＋「计划模式」；pending 页「目标模式
  （当前）」＋「计划模式（下一步生效）」＋「切换已登记…当前实际为目标模式。」；plan-review
  卡 96 字符方案预览＋接受≠执行注记；flow DOM `MODE [{"active":true}]` 恰一条。
- 已知未闭：真实 plan-mode 装载与 set 真调用未跑；production 缺 provider 呈"未接线"诚实态；
  设置页默认写面后置。
