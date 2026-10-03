# 041 外部授权等待：中继作答、封闭词表与「失效不兑现、不伪造已批准」

> 决策与规则见 [ADR-0241](../../../adr/ADR-0241.md)。

## Problem

FW-037/US-197~199：权限申请/外部授权以待确认态显示范围与来源；未获授权不派发依赖动作；
等待显示原因与撤回入口，不显示为失败也不显示为已批准；设备离线或授权过期使等待失效并需
重新申请；旧等待不自动兑现为执行条件。原产品证据（Sanbao S03：`PermissionCard`/
`waiting-permission`）。基座事实 pin 包 `dsh-user-approval`：`approval.request()` 走 agent
作用域 waterfall——要求开轮，audit 对写会话日志，**封闭词表** `allowed-once | rejected |
cancelled | unavailable`（allowed-once 唯一授权；缺答者/抛错=unavailable；signal 中止=
cancelled；非词表归一 unavailable）；会话级 `approval/policy`。

## Decision

- `host/approval-relay.ts`（镜像 034）：`prepend:true` 认领带 agent 请求；`provide('sageApprovalRelay')`；
  桥 +`session/approvals`(read)/`session/approve`(write)/`session/approval-withdraw`(write)；
  消费登记 +`sageApprovalRelay`；HOST_LIB_FILES 登记。
- **答=恰两个用户决定词**（`allowed-once` 仅此一次 / `rejected`），其余拒
  `approval-outcome-invalid`——中继从不制造授权；**撤回=封闭词 `cancelled`** 一条具名写
  （答后/撤后 not-found；dispose 全 cancelled fail-closed；asker signal 中止同归 cancelled）。
- `main/approvals.ts`：`accepted`（提交成功）→**仅凭日志同 id `approval/decided`** 转
  `effective`；`cancelled`/`unavailable`/暂停下消失=`lapsed`（**回执 outcome 归 null**，句
  「需重新申请；不代表已批准」）；未确认=`unknown`（只给核对）；暂停/无会话/非等待中具名拒答。
- 渲染面：等待卡（工具/来源/调用＋[批准（仅此一次）][拒绝][撤回等待]）＋「等待≠失败，
  也≠已批准」＋提交后「未生效前不显示为已批准」；lapsed 句；unknown 只给核对（零 POST）。
- 首版不做：多级审批与策略下发（§7.1/§7.3）、`approval/policy` 写、凭据读取；真机后置。

## Alternatives considered

signal.abort 撤回（否：relay 无 controller，且 `cancelled` 词表内可答、可测）；提交即显已批准
（否：US-198）；lapsed 回带原词（否：不得读作批准）；不做撤回（否：US-198 明令）；自建审批队列
（否：基座 audit 对+waterfall 即事实通道）。

## Consequences

- 机器断言：①未获授权依赖动作不派发且界面阻断（等待卡＋阻断注记；中继从不产授权）；
  ②失效需重新申请（lapsed 三来源，均不回带批准）；③撤回具名且有回执。
- §1.6：1440/660 两宽——等待卡三要素＋三按钮；lapsed「需重新申请；旧等待不会自动兑现为
  执行条件」；unknown＋[核对（重新读取）]；effective「已批准（仅此一次，有日志证据）。」；
  flow 页点击批准恰一条 POST（matterRef/requestId/outcome 正确）＋「未生效前不显示为已批准」句。
- 已知未闭：真实 `ctx.approval.request` 真机链路未跑；真实 tool-ask 来源与 policy 读面后置；
  matter 投影生产恒 null（同族 fixture 投影边界）。
