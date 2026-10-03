# 025 动作级执行前确认：单卡、一次性凭据、逐次重验

> 决策与规则见 [ADR-0224](../../../adr/ADR-0224.md)。

## Problem

FW-023/US-124~128：外部效果动作要给**单张**执行前确认卡（对象/动作/资源/范围/时间/前提＋可得的
费用影响预估）；确认兑现该次派发的必要条件，派发前仍逐次重验；范围外新动作、前提或版本变化使旧
确认失效、需重新确认；确认≠效果已发生（结果按三态回执读回）；首版不做多级审批/代理审批/审批队列。
本仓此前的现状：`/.sage/actions` 派发口与草案「确认建项」（create-matter）都没有任何"先看一张卡"
的环节，建项单步直发。工单验收两条：范围外动作无法用旧确认放行（有断言）；卡不伪装成审批流程、
不产生多级路由。

## Decision

- 纯内核 `appservice/action-confirmations.ts`：`prepare` 铸 `confirmationId` 并生成单卡；记录绑定
  intent 指纹（matterId/revisionId/actionType/actionScope/payload 规范化；origin=传输元数据不入
  指纹）＋facts 指纹（`environmentRef`）。`consume` 恰好一次：未铸过=required、花过=consumed、
  指纹不符=stale 并**标死**（事实恢复不放行）。记录仅本运行（上限 64 淘汰最旧）。
- 组合层可选 `actionConfirmations`（store＋facts；absent=本票前形状）。接线时 `dispatch` 对非
  retry 意图在环境门（011）后先 consume，失败 `stage:'confirmation'`、`retryable:false`、流水线
  零步；`convertDraft` 在开 attempt 之前同样过门。两路径同一 store、同一 facts 家（main：事项
  默认执行环境；create-matter 目标 `draft:<id>` 无链接→null）。
- 路由：新增 `/.sage/actions/prepare`（裸精确 intent，retry 不可确认）与 `/.sage/draft/prepare-confirm`
  （main 与 convert 同一 builder 组装 custody intent）；`/.sage/actions` 加 `{intent, confirmationId}`
  信封（凭据旁挂，意图形状仍精确）；`/.sage/draft/convert` 体放宽为精确 `{draftId}` 或
  `{draftId, confirmationId}`（额外键仍 400）。
- 卡面：对象/动作/范围/资源/时间/前提；费用预估无来源时 `unavailable` 如实；`effect:'not-yet-happened'`
  机器标记；页面文案明说"确认不等于外部效果已发生、结果按回执三态呈现、变化需重新确认"，无审批/
  队列/代理字样（有断言），恰两控件（确认执行/取消确认），一级直连。
- 草案面改两步：「确认建项」→ prepare-confirm 取卡（跨 2s 轮询存活、只属其草案）；「确认执行」
  才带凭据发 convert；stale/consumed/required 转显式"重新确认"本地提示（沿既有 local-notice 守卫）；
  取消仅本地（凭据从未离开页面）。

## Alternatives considered

- 确认放流水线步内：否决（它是派发前置必要条件，沿 011 环境门先例；步内会与 3–10 fail-closed 纠缠）。
- confirmationId 塞进 intent：否决（意图形状精确、额外键即拒；凭据走旁挂信封）。
- 指纹含 origin：否决（origin 是渲染来源标记，不是动作身份）。
- 失效后事实回滚可复用：否决（US-126 点名不许沿用旧页面状态；标死更保守可测）。
- 卡状态投影进 readState：否决（卡是瞬态交互物，投影会伪装成持久事实）。

## Consequences

- 判者读数（`tools/verify_ticket.mjs --ticket 025`）：typecheck 0；本票 8 spec 件 85/85 绿；全量
  106 文件 997 过/1 跳过（既有项）；变异电池 **10/10** 全抓（首轮即满，无覆盖洞补测）；gate 以
  ADR/Note/decisions 三件套落档后复跑为绿（见账本 §6）。
- 验收两条机器断言：五种范围变化（payload/动作/matter/revision/scope）携旧卡一律 stale 且记录标死、
  流水线零步；卡面无审批词、恰两控件、单卡文案明说确认≠效果。
- 已知未闭：确认记录不持久（重启=required 需重开卡，保守诚实）；无费用估计器（如实 unavailable）；
  真机未跑；审批路由族（D-106~118）与 041 权限申请按各自票推进。
- 兼容性：store 未接线时 convertDraft/`.sage/actions` 保持旧形状（既有 002/001/011 测试原样通过）；
  新增端口 prepareActionConfirmation/prepareDraftConfirmation 已同步 closed 端口名册（appservice-composition
  的显式清单）。
