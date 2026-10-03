# 008 会话内队列：queue/steer 与待处理项变更

> 决策与规则见 [ADR-0232](../../../adr/ADR-0232.md)。

## Problem

FW-020/US-025~030：发送可选 queue/steer（steer=下一步骤边界插入，不得写"已打断当前步骤"）；
待处理项可查看/修改/移除，被消费时按 `queue-item-not-found` 如实提示"已开始处理"（不静默
丢弃、不重复提交）；队列呈现以基座权威快照为准（queued|steering|context）；暂停态只显示
待继续；首版无定时/循环自动化入口。基座已具：prompt mode:'steer'（桥已过白名单）、
`sessionController.updateQueue`（remove/edit/steer）、`session/control` 的 queues 帧、
`session/queue-item-not-found` 远程码。

## Decision

- `send` 增 mode（默认 queue）；路由 3–4 键精确体；ack 回显 mode；渲染「发送方式」只在选
  steer 时携带；暂停态 steer 同权只登记（零桥调用）。
- `read` 增一次有界 session/control 快照读：`queue.occurrences {queueItemId,position,
  requestId,preview≤140}`；缺席=unavailable（不以空列表冒充）；不由本地 echo 推导。
- host 桥：updateQueue 声明扩 edit 文本块；新增 `session/queue-edit` 端点；
  `session/queue-item-not-found → bridge-queue-item-not-found`。
- `queueItem` 通道：裁剪校验（queue-edit-invalid/queue-no-session）；被消费→
  `queue-item-not-found`→渲染句「已开始处理……不重复提交」；一次点击恰一条请求。
- 暂停态队列行不渲染；steer 文案只承诺步骤边界；全页无"已打断"。
- 负空间：文案明示无定时/循环自动化；控件名册钉住 [保存修改][移除]。

## Alternatives considered

本地 echo 推导队列（US-028 否决）；"已打断"措辞（US-026 否决）；整条消息透传（preview 有界
即可）；通用 action 端点（逐动作命名先例）；读取失败显示空列表（缺席≠空）。

## Consequences

- 机器断言：消费竞态具名句+恰一条请求；placement/preview 直取帧、流断=unavailable；
  负空间双断言（文案+名册）。
- 005/006 deliberate 更新：ack 回显 mode、read 多一次 control 快照读；端口名册 +1。
- §1.6：D3 卡发送方式 steer、三位置队列行、「已开始处理」句两宽实测；DOM 逐项核。
- 已知未闭：定时/循环自动化与队列项 steer 搬移后置；真机未跑。
