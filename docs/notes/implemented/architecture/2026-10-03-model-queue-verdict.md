# 042 模型排队三态：日志事实折叠、就绪无计时器与「超时=结果未知、不重复提交」

> 决策与规则见 [ADR-0242](../../../adr/ADR-0242.md)。

## Problem

FW-037/US-200~202：排队中/就绪/重试三态来自服务事实并与错误三态不混用；排队与重试不重复
提交；就绪不由界面计时器推断；超时显示结果未知并只给核对入口。原产品证据（Sanbao S05，
static-only）：`ModelQueueSegment` queued/retrying/ready 分支、`modelQueue.estimatedWait`——未实测。
基座事实 pin 包 `dsh-llm-retry`：`llm/retry`（重试排定：retryId/turn/step/provider/retry/
maxRetries/delayMs/failure）＋`llm/retry-started`（等待成功、尝试开始前的转换）。

## Decision

- `main/model-queue.ts` 纯读（唯一桥调用=一次有界 `session/page`）：折叠 llm/retry×retry-started
  ＋轮次开合＋其后 assistant/message——未匹配＋轮开=**排队等待**；匹配无消息=**重试进行中**；
  匹配后出消息=**已恢复（就绪）**；轮闭无恢复证据=**结果未知（verifyOnly＋reason）**。
- `delayMs` 只作服务事实展示（不倒计）；ready 判据=日志转换（llm/retry-started＋消息）。
- 与错误三态分家：文案不出现「请重试」「确定失败」；waiting 明说"不是失败，也不是需要重复提交"。
- 零写结构断言：调用表恰 `['session/page']`；unknown 的核对=只读重读零 POST。
- 首版不做排队优先级/跨账号配额调度/自动故障切换；S05 原产品实测后置（不人为触发限流）。

## Alternatives considered

`estimatedWait` 倒计时（否：US-201）；超时并入确定失败（否：US-200/201）；未知态给重试按钮
（否：重试仅针对确定失败）；自建队列状态机（否：第二个家）；idle 显示空面板（否：idle 成句）。

## Consequences

- 机器断言：①排队/重试期间零提交；②超时=unknown＋verifyOnly 只给核对；③就绪可追溯服务事实。
- §1.6：1440/660 两宽——注记「服务端安排 4000 ms 后继续，原因 server_error——就绪只看日志
  事实，不用界面倒计时。」＋两行「第 N/3 次·服务端延迟 X ms｜提供方·原因｜等待中（服务端安排）」；
  unknown flow DOM `POSTS []`＋「核对=只读，不会重复提交任何请求」。
- 已知未闭：S05 真实态未采集；真实 llm/retry 真机出现未跑；优先级/配额/故障切换后置。
