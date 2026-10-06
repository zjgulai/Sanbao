# Batch 23 / P3 第八片：草案卡（D1）React 接管

- 日期：2026-10-04
- 状态：本地完成（未 commit、未 push）
- 依据：[ADR-0261](../../../adr/ADR-0261.md)（D7 strangler；P3 卡片群逐卡迁移）

## Problem

草案卡（D1）是 P3 余下两卡中最大的一张（批次 22 侦察实测≈P2 事项工作台区体量），仍由内联脚本渲染全部行为：设备本地草案流水线（发送→整理字段→保存→确认建项）、身份驱动的责任默认值机制（提交注/撤回/不覆盖输入三条规则＋四种注记文案）、创建尝试三态（unknown/pending/failed）与「核对同一请求／取消未提交的确认」、单张执行前确认卡（ticket 025：单次兑现、失卡三拒码、结果三态）、已建项回执列表、站点起步模板面板（ticket 040：只读来源＋只填输入），以及与 `plan-renderer` 退出检查的跨卡未保存链（`unsavedDraftFields` 读字段镜像的全量未保存清单）。

## Decision

1. **区域桥新槽** `draft`：`{kind:'locked', siteTemplates?}`／`{kind:'unavailable', siteTemplates?}`／`{kind:'read', slot:{drafts?, auth?, siteTemplates?}}`——模板目录在三态下都可独立搭载（与 legacy 的两个存储槽相互独立的语义一致：草案存储锁定/未接线不影响目录可读）。容器＝`sage-draft-card` article（`#sage-region-draft`＋`data-region-state`）。
2. **下行桥 +6 动作（40 总计）**：`sendDraft(rawInput)`→`notice|null`、`saveDraft(draftId, fields, clarification, selectedEntryIds)`、`reconcileDraft`、`cancelDraftAttempt`、`prepareDraftConfirm`→`{kind:'prepared',card}｜{kind:'notice',text}`、`executeDraftConvert(draftId, confirmationId)`→`{kind:'ok'}｜{kind:'notice',text}`。请求体、拒码表（confirmation-stale/-consumed/-required 的 `draftConfirmationNotice` 文案）、刷新与 `lastStatePayload` 读取全留 wire 侧。
3. **上行桥 +1 通道**：`__SAGE_APP_SET_DRAFT_FIELDS__(fields)`——五个字段值逐击键镜像到 legacy（`draftFieldMirror`），退出检查的 `unsavedDraftFields` 链路（plan-renderer 退出清单的实际未保存项）改读镜像，不再读卡内 DOM。第三条上行通道（继 LINK_SELECTION、MATTER_LIST_FILTER）。
4. **React 拥有**：发送/保存的本地前置拒绝（空白输入不调服务）、字段重同步的**陈旧语义**（仅当 `draft.updatedAt` 变化才回写，轮询不擦正在输入）、身份默认值机制（revision＝`updatedAt|authStatus|authName`；仅在字段为空或等于上次注入值时可注入/撤回，已保存值优先，四种注记文案）、前史勾选覆写表（随每条区域消息清空——对齐 legacy 重渲行为）、尝试三态文案与核对/取消按钮可见性、确认卡的门控（pending/unknown 挡建项、failed 重新开放）与**单次兑现**（卡在 POST 前清除、convert 通道生效后经 effect 清挂卡，任何路径不留悬空卡）、模板填入（非空追加＋注记）与目录三态注记。
5. **测试重分工**：三枚旧驱动 spec 删除（`draft-surface` 17 测＋`draft-identity-default-renderer` 6 测＋`site-templates-renderer` 4 测＝27 测）；新 `draft-region-bridge.spec.ts`（5：三态发布＋目录随行、静态钉〔ticket-002/025/040 文案与控件名册〕、六动作精确体、不可铸卡同一句话、退出检查镜像链）＋ jsdom `product-app/draft-region.spec.tsx`（22：草案面 6＋尝试 3＋确认卡 5＋身份默认 5＋模板 3）；`plan-renderer.spec.ts` 退出检查测改用 `setDraftFields`（sage-page 新助手）。探针扩到十二区域。
6. **过程修正（仪器）**：`regionMessage` 的兜底值若为行内新对象，键在该对象上的 effect 会每渲染重跑——历史勾选清空 effect 因此进入死循环（聚焦跑挂死 >5 分钟、输出 0 字节）。修法：模块级常量 `DRAFT_UNAVAILABLE` 作兜底（对象恒等稳定）。

## Verification

- 红：三枚旧驱动 spec＋plan-renderer 对新代码 4 文件 27 具名红（`Tests 27 failed | 4 passed (31)`；唯一幸存＝draft-surface 的「轮询不擦输入」——React 版字段同步语义逐字对齐 legacy，属语义等价而非覆盖洞）。
- 绿：新聚焦 27/27（桥 5＋jsdom 22）；全量 `188 files / 1636 passed / 1 skipped / 0 failed`（含窗口 spec 18/18：十二区域态一致）；`npx tsc --build` 退出 0 后 `build-renderer` bundle 347,183 字节（批 22 为 327,608）；gate quick 27/27、objects 84/84、0 skip；`b23-draft-1440.png`/`b23-draft-660.png` 已人工回看（模板面板两式条目、责任默认「林一」注入＋四文案之已认证路径、保存后字段同步、前史勾选态、尝试确定失败注记、确认卡 7 字段与单次兑现双按钮、已建项回执行；660 无横向溢出，模板条与按钮正常折行）。
- 过程修正：死循环仪器修复（上）；测试修正三处——空白发送期望改为「不调动作＋本地注记」（组件短路口与 legacy 点击处理同式）、合并载荷用例改新挂载（同 `updatedAt` 正确跳过字段回写）、生成脚本 payload 顺序（被转换草案置末使当前草案不可确认，READY 永不达成）。

## Alternatives considered

| 方案 | 结论 |
| --- | --- |
| 身份默认值与三规则留在 legacy，发布时算好最终值 | 否决：注入/撤回/不覆盖输入三条规则与 React 拥有的字段态和已保存值耦合；legacy 看不到击键（镜像只服务退出检查，不回声），发布「最终值」会与正在输入的用户打架。改发布 `auth:{status,displayName}` 元组，守卫留在字段态的家。 |
| 退出检查反向拉取（legacy 在检查时向 React 查询字段值） | 否决：拉取会反转上行桥的既有方向（React 不暴露 getter），破坏「legacy 只读自己的镜像」的单向依赖；推模式与 LINK_SELECTION/MATTER_LIST_FILTER 两条通道同构。 |
| 前史勾选跨轮询保留 | 否决：legacy 重渲本是每轮按 `entry.selected` 重建勾选态，保留会改变既有行为；按消息清空覆写表即逐字复刻。 |
| 确认卡保留到 convert 响应再清除 | 否决：违背单次兑现（ticket 025）——stale/拒码路径会留下可再执行的悬空卡；POST 前清除保证任何结局都不悬空。 |
| 模板目录只挂 read 态 | 否决：legacy 草案存储与模板目录是独立槽，锁定/未接线下目录仍可读；三态随身携带目录保持该语义。 |

## Consequences

- P3 已完成 12/13 卡（sites、tool-results、run-monitor、artifacts、side-chats、action-items、plans、link、matter-admin、matter-groups、matter-list、draft）；`renderer.ts` 5,782→5,441 行（−341）；新增 `draft-view.tsx`；下行桥 40 动作、上行桥 3 通道；探针十二区域。
- 余下：D3 会话卡（最大，P3 最后一片）；随后 P4 面板与 legacy 内联脚本退役。
- 未决：本批未 commit、未 push；批次 19/20/21/22/23 五个改动集併存未提交。
