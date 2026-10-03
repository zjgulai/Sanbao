# 048 反馈入口：文本＋结构化诊断的封闭载荷与「未知只核对、不重提交」

> 决策与规则见 [ADR-0245](../../../adr/ADR-0245.md)。

## Problem

FW-040/US-223/224：反馈只提交用户输入文本与结构化诊断（code/stage/correlation），不自动附
日志、原始堆栈、机器路径或凭据；回执区分已接收与结果未知；未知只给核对同一提交、不重复提交。
Sage 无任何反馈接收端；`service.correlation` 为既有服务事实。

## Decision

- `main/feedback.ts`：sink 端口（生产未接线=unavailable 缺项）；payload 键集封闭断言；
  text≤4000/诊断≤128 先验；accepted/unknown（记录）/refused（不记录）；verify 只读记录零派发。
- 路由 `/.sage/feedback` {action submit|verify} 精确键；名册 +2；033 守护 +1；027 守护
  deliberate 更新（钉 feedback-submit 唯一例外）。
- 渲染面（关于与诊断卡）：文本/诊断码/阶段＋提交＋注记句；未知回执只给 [核对同一提交]。
- 日志上传/崩溃上报/工单集成首版不做。

## Alternatives considered

自动附诊断快照（否：US-223 封闭键集）；本地落盘 sink（否：机制发明）；未知给重试（否：US-224）；
拒绝也记录（否：未受理无回执）；放 governance 面板（否：O13 语义位）。

## Consequences

- 机器断言：①载荷不含凭据/机器路径/原始堆栈（键集+deepEqual+注入突变红）；②未知不重复提交
  （verify 零派发、未知只给核对）。
- §1.6：1440/660 反馈块三要素＋注记句；flow 恰一条 submit POST（含 corr-048）＋已接收句。
- 已知未闭：真实 sink 不存在；回执进程内（持久化后置）。
