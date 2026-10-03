# 007 暂停期新输入只登记不唤醒

> 决策与规则见 [ADR-0231](../../../adr/ADR-0231.md)。

## Problem

FW-003/US-020/021：暂停态发送只登记（"已收到，尚未执行"）且**不唤醒 Agent**；查看/编辑/移除
不唤醒；发送与继续并发按队列版本对账，不悄悄把未含内容送入执行。006 已落基础（设备本地
待继续、stop 排空分账、resume 按序派发），缺口：派发中无冻结（编辑竞改已派发文本）、resume
只读一次快照（间隙编辑/新增不生效）、re-pause 竞态无状态、无版本号。

## Decision

- 暂停态发送 `deferred`+零桥调用；带附件整体拒绝（014 寿命语义）。
- 状态机加 `dispatching`：先冻结再 prompt；编辑/移除期间 `item-frozen`；拒绝回 pending、
  成功才 submitted；渲染只读标签。
- resume 每轮重读活清单取下一 pending；每轮先查暂停位，重暂停止步 → 新态 `interrupted`。
- 记录带单调 `revision`；resume 收束后按权威队列快照**只增记**折叠（absent 保持 submitted；
  `absent:'consumed'` 保留给 stop）；快照缺失带 code。
- 渲染：deferred/interrupted 两句 + 五态行标签；D3 卡「继续（派发待继续项）」入口不变。

## Alternatives considered

不冻结（await 期间编辑窗口真实存在）、按旧快照派发（间隙编辑被静默跳过）、重暂停后派完
（唤醒）、resume 沿用 absent=consumed（误冻用户等待中的输入——本轮测试当场红过）。

## Consequences

- 机器断言：零桥调用（发送/查看/编辑/移除）；冻结拒编辑；下一项派编辑后文本；interrupted
  后不再发送；resume 后 occurrence 增记 + revision 单调。
- §1.6：D3 卡五态 + 两句以真实页面两宽实测；DOM 读数逐项核。
- 已知未闭：多 resume 去重与跨设备同步后置；真机未跑。
