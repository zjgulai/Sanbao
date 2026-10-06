# Batch 24 / P3 收官：会话卡（D3）React 接管

- 日期：2026-10-04
- 状态：本地完成（未 commit、未 push）
- 依据：[ADR-0261](../../../adr/ADR-0261.md)（D7 strangler；P3 卡片群逐卡迁移）

## Problem

会话卡（D3）是卡片群最后且最长的一张：内联脚本的 `renderSessionChannel`（719 行）＋`renderTerminal`/`renderModelQueue`/`renderApprovals`/`renderAttachments` 四颗卫星＋约 20 组监听器，覆盖 65 个节点、15 枚 fake-DOM 驱动 spec（73 测）——事实行、模型排队、集成终端、输入与发送/停止/继续、引用选择、模式切换、附件（选择→上传→发送）、转录、回复操作、后续建议、待继续、队列、澄清、外部授权、锚点、编辑重发、历史运行。**批前组合声明为「单卡独批」**；侦察确认块间耦合（transcript 是枢纽：edits 点它、attachments 挂它、terminal 断言它；plan-mode 摸 clarification-cards；session-surface/pause-deferral/queue 三枚 spec 各跨两簇），任意中间切会在同卡内留临时缝并引发二次改道 ⇒ 维持单批整卡（沿批次 18/22 组合调整先例留痕）。

## Decision

1. **区域桥新槽** `session`：`sessionChannel` 为对象即 `kind:'read'`，否则 `unavailable`；slot＝**原样切片** `channel/history/anchors/edits/clarifications/approvals/planMode/selections/modelQueue/terminal/attachments`＋唯一的 wire 侧派生 `suggestions`（方案投影 ready 步骤标题，≤3；投影未接线为 `null`——不冒充空列表）。容器＝`sage-session-card` article（补齐 `#sage-region-session`，全卡群最后一张）；探针扩至**十三区域**。
2. **下行桥 +29 动作（69 总计）**：发送簇 `sendSession(text,mode)`（默认排队少 mode 键）/`stopSession`/`resumeSession`；附件 `pickAttachments`/`uploadAttachment`/`cancelAttachment`；待继续与队列 `editPendingItem`/`removePendingItem`/`editQueueItem`/`removeQueueItem`；历史 `readHistory(beforeSeq)`（含 US-097 自动展开一次的 auto-detail）/`readHistoryDetail`；锚点 `readAnchors`/`locateAnchor`（结构化回 `{kind:'located',previewText,notice}`——预览文本是视图面，句子仍单家）；编辑 `saveEdit`/`resendEdit`/`verifyEdit`；引用 `selectInputRef`/`clearInputRef`；澄清 `submitClarification(answers)`/`verifyClarification`；授权 `answerApproval`/`withdrawApproval`/`verifyApproval`；排队核对 `verifyModelQueue`；回复 `replyRetry`（末条用户文本由 wire 从 payload 取）/`auditReply`；模式 `setPlanMode`；终端 `openTerminal`（关闭是 React 纯本地零请求）。**无上行桥新增**。
3. **句子归属**：拒码/收据句与守卫句留 wire（动作返回 string）；投影派生的显示句由 React 从槽数据组装（与 legacy 逐字同句）；纯本地交互句（复制/引用/建议填入/关闭终端/锚点预览与关闭，以及空发送短路句——与 wire 守卫同句）在 React。**legacy 等价语义**：queue/pending/clarification 的输入与勾选、编辑/锚点的 transient 提示随**每条区域消息复位**（legacy 重建行即清）；而 action 产生的 `*LocalNotice` 类句子跨轮询持存（legacy 变量门），jsdom 以「新挂载取派生句」区分两类。
4. **测试重分工**：15 枚旧驱动 spec 删除（73 测）；`pending-surface.spec.ts` 中两枚**路由级**（不涉 DOM）保留为 `session-routes.spec.ts`；新 `session-region-bridge.spec.ts`（8：切片发布＋suggestions 派生、静态字词与 54 个 id 的**反向 `querySelector` 源码钉**、29 动作精确体与句子、假 DOM 零写入哨兵）＋ jsdom `product-app/session-region.spec.tsx`（40：按块全量移植）。
5. **过程修正（实现）**：块替换时把被复用的 `postAttachment` 一并删掉（ReferenceError——语法检查抓不到未定义引用，桥 spec 的附件动作用例抓到并修复）；**§1.6 截图回看抓到计划模式缺陷**：`active=false && pending=true` 时目标按钮误标「下一步生效」（legacy markOf 应为「（当前）」）——修复并补 jsdom 断言钉住四种组合，重拍两宽截图复核。

## Verification

- 红基线：15 文件 **71 failed | 2 passed（73）**；幸存两枚＝`pending-surface` 的路由级测试（不驱动 DOM），已迁移保留为 `session-routes.spec.ts`。
- 绿：新聚焦 48/48（桥 8＋jsdom 40，含修复后钉住的计划模式四组合）；全量首跑即 `176 files / 1613 passed / 1 skipped / 0 failed`（净 −23 项＝删 73、留 2、增 48），修复后复跑同绿；窗口 spec 18/18（**十三区域**一致）；`npx tsc --build` 退出 0；`build-renderer` bundle 411,675 字节（批 23 为 347,183）；gate quick 27/27、objects 84/84、0 skip（修复后复跑）。
- §1.6 证据（`b24-session-focus.html`，冻结载荷＋fetch stub＋分级交互）：页面 `READY {h:4257, w:1440, horizontalFree:true}`；两段交互在 title 读数与截图双证——锚点预览→定位（预览文本变「已定位：运行 @7——…」）、终端开输出（有界读页 `npm run build …`＋第 120–122/984 行注记）；`b24-session-1440.png`（4257 高）与 `b24-session-660.png`（4763 高，无横向溢出、控件正常折行）均人工回看；回看抓到计划模式标签缺陷→修复→重拍复核。

## Alternatives considered

| 方案 | 结论 |
| --- | --- |
| 把 D3 切成 2–3 个子批 | 否决：transcript 枢纽＋plan-mode×clarification 互摸＋三枚跨块 spec，任意中间切会在同卡内留临时缝（临时动作/二次改道）；单批整卡一次到位。 |
| slot 发「wire 解释后的视图」而非原样切片 | 采纳原样切片：65 节点逐一解释面远超收益，React 各块防御式解析＋自建显示句（与 25 条既有区域同式）；wire 只保留 suggestions 一个派生。 |
| locateAnchor 只回 notice 字符串 | 否决：定位同时更新预览文本（视图面），结构化回包让句子与视图各归其家。 |
| queue/pending 输入跨轮询保留（更「好用」） | 否决：legacy 每轮重建行即清，保真优先；由「消息即复位」jsdom 用例钉住。 |
| 复制走下行桥（后端统一） | 否决：legacy 复制＝纯本地 clipboard（零请求），保持零桥调用与本地失败句。 |

## Consequences

- **P3 卡片群收官：13/13**（sites、tool-results、run-monitor、artifacts、side-chats、action-items、plans、link、matter-admin、matter-groups、matter-list、draft、session）；`renderer.ts` 5,441→4,112 行（−1,329）；新增 `session-view.tsx`＋`session-bottom-view.tsx`；下行桥 69 动作、上行桥 3 通道；探针十三区域。
- 余下：**P4**（余下面板——搜索/自动化/知识/能力/设置各卡与偏好、反馈卡、修订草案卡等）与 legacy 内联脚本退役。
- 未决：本批未 commit、未 push；批次 19/20/21/22/23/24 **六个改动集併存未提交**。
