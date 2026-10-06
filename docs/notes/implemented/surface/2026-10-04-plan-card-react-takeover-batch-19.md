# Batch 19 / P3 第四片：方案卡 React 接管（候选行、步骤就绪与执行确认卡）

- 日期：2026-10-04
- 状态：本地完成（未 commit、未 push）
- 依据：[ADR-0261](../../../adr/ADR-0261.md)（D7 strangler；P3 卡片群逐卡迁移）

## Problem

方案卡（D9）仍由内联脚本渲染：候选行（草稿/已接受回执标签＋「接受方案（只记回执）」按钮）、创建表单（标题＋每行一条步骤）、每步就绪名册（ready 才给「准备执行确认卡」入口，未就绪/未知＝阻断）、单张步骤执行确认卡（对象/动作/范围/资源/时间/前提/费用）与结果句级联（settled/not-ready/unknown/confirmation-* 拒绝码）。该卡自包含：`prepare-step`/`execute-step` 的请求体、拒绝码与文案留在 legacy 即可，创建/接受读关联卡选择本属该面（沿批次 18 的组合切法，D2 关联卡改期到选择器簇专项批不阻塞本卡）。

## Decision

1. **区域桥新增一槽**：`plans`（`{kind:'read', slot:{plans, lastStepRun}}`/`{kind:'unavailable'}`）；`sage-plan-card` article 作 React root 容器（`#sage-region-plans`＋`data-region-state`）。`plansOf` 的槽解析留在 legacy（唯一的 wire 解释家）。
2. **下行桥 +4 动作**：`createPlan(title, stepsText)`→notice|null（`#link-matter` 读取、trim、按行拆分去空在动作内；两个先决句逐字保留）；`acceptPlan(planId)`→void；`prepareStep(planId, stepNo)`→`{kind:'prepared', card}`/`{kind:'notice', notice}`/`{kind:'quiet'}`（`step-premise-unknown`/`step-not-ready`/兜底三类拒绝句逐字保留）；`executeStep(planId, stepNo, confirmationId)`→`{kind:'run', run}`/`{kind:'settled'}`/`{kind:'notice', notice}`/`{kind:'quiet'}`（响应随行携带投影即先按其渲染；`plans-unavailable` 专属句）。
3. **React 拥有**：候选行渲染与当前方案选择（默认最后一条，行点击切换，accept 按钮 `stopPropagation`）、步骤名册与 ready 门槛、`pendingStep` 确认卡（字段文本与 legacy 逐字一致）、结果句级联 `runText`（projection 优先、执行响应覆盖兜底、cancel/prepare 清空）、create/accept/prepare/execute 四路 pending 与全部 notice 时机。
4. **探针扩到七区域**：`regionFacts` 增 `plans`，期望值从同一 payload 推导（`state==='read'`→`read` 否则 `unavailable`）；窗口 spec evidence 类型同步。
5. **测试重分工**：`test/plan-renderer.spec.ts` 只保留退出检查/引导/环境（4 测，头注更新）；方案卡覆盖重安置为 `test/plan-region-bridge.spec.ts`（5：发布哨兵＋静态文案名册＋create/accept＋prepare/execute 精确体＋阻断与未接线句）＋`test/product-app/plan-region.spec.tsx`（3：行/就绪/选择/unavailable 与空态、确认卡全字段与结果句、创建表单与本地句保持）。

## Verification

- 红：bridge 5/5 具名红＋jsdom 模块缺失红＋真实探针红（`plans region state is null, expected unavailable`）。
- 绿：聚焦 23/23（bridge 5＋jsdom 3＋plan-renderer 3＋plan-surface 5＋plans 7）；全量 `188 files / 1631 passed / 1 skipped / 0 failed`（含窗口 spec 18/18：七区域态两侧一致）；gate quick 27/27、objects 84/84、0 skip；`npx tsc --build` 退出 0 后重建 bundle 295,623 字节（批 18 为 283,722）；`b19-plan-1440.png` 与 `b19-plan-660.png` 已人工回看（行选择切换、「未就绪/未知（阻断——不派发）」无执行入口、确认卡七字段与「暂不可得…不冒充数字」、660 宽无横向溢出）。
- 过程修正（仪器类）：假 DOM 不解析静态 `hidden` 属性（`plan-step-card.hidden` 恒为 false）→ 「legacy 未触碰」哨兵改用从未被写过的字段文本（`plan-step-target` 为空串）。

## Alternatives considered

| 方案 | 结论 |
| --- | --- |
| 结果句继续由 legacy 写（仅迁静态结构） | 否决：结果句读投影＋本地拒绝句，与 pending/notice 时机耦合；React 持有这一句才能与批次 18 的切法一致。 |
| `prepareStep` 接收 React 侧已拆分的步骤数组 | 否决：拆分/trim 是输入规范化（批次 17/18 先例：规范化留在动作内）；传原始 textarea 文本。 |
| execute 响应中的 run 直接丢弃（等下一轮 poll） | 部分采纳：投影仍是唯一读数，但保留响应 run 作显示兜底（legacy 原语义「先按其渲染」）。 |
| 保留 plan-renderer 的方案卡 4 测（双驱动） | 否决：区域 DOM 归 React 后 fake DOM 无可驱动对象；覆盖面由 bridge/jsdom/探针三层承接。 |

## Consequences

- P3 已完成 7/13 卡（sites、tool-results、run-monitor、artifacts、side-chats、action-items、plans）；`renderer.ts` 6,475→6,295 行（−180），新增 `plan-view.tsx`；下行桥现覆盖 23 个动作。
- 余下卡片：列表（D0）、草案（D1）、会话（D3，最长）、关联（D2，建议与 D0/D7/D12 合成选择器簇专项批）、管理（D7）、分组（D12）；随后 P4 面板与 legacy 内联脚本退役。
- 未决：本批未 commit、未 push；等用户授权后随推送前 `gate:full` 复核。
