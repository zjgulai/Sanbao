# Batch 16 / P3 首片：网页成果卡与工具结果卡 React 接管

- 日期：2026-10-04
- 状态：本地完成（未 commit、未 push）
- 依据：[ADR-0261](../../../adr/ADR-0261.md)（D7 strangler；P3「已接线操作面」卡片群逐卡迁移、每批 2–3 卡）

## Problem

「已接线操作面」卡片群里，网页成果目录（D11，`#site-rows`/`#site-note`）与 typed 工具结果（D10，`#tool-result-rows`/`#tool-result-note`）仍由内联脚本渲染，ticket 033 的行为面（拒绝类型点名、脱敏键值、两个显式入口：校验外链与按版本预览、`已托管≠上线` 的目录语义、本地 notice 优先级）全部压在 legacy DOM 写入与容器级 click 委托上。P3 要求逐卡把 DOM 权移交 React，同时不得改变 id/类名/data 属性/文案与两条动作的线上契约（`/.sage/external-link`、`/.sage/artifacts/open` 的请求体与拒绝码文案）。P2 只建立了单个 `__SAGE_APP_SET_MATTER__` 通道；P3 会连续迁卡，桥面必须在第二批之前泛化，否则每卡一枚 window 函数。

## Decision

1. **区域桥泛化**：`__SAGE_APP_SET_MATTER__` 退役，改为 `window.__SAGE_APP_SET_REGION__(region, message)`；P2 的 matter 通道并入其中（region = `matter`/`sites`/`tool-results`，后续卡片沿用）。store 泛化为 `createAppBridgeStore`（`regions` 记录 + `view`），`matter-bridge.ts` → `bridge.ts`。P2 的两枚 bridge 合同 spec 与 jsdom spec 随迁（sink 按 region 过滤），语义不变。
2. **下行动作桥**：新增 `window.__SAGE_LEGACY_ACTIONS__`（`openArtifact(artifactId)`、`openExternalLink(url): Promise<string>`）。职责切法：**React 拥有 DOM、按钮 pending/disabled 与本地 notice 的显示时机；legacy 拥有请求、拒绝码→文案映射、notice 最终文本与 refresh 触发**。旧代码里 `openArtifactFromButton` 的 DOM 管理拆成数据动作 `openArtifact`；external-link 流程原样搬成返回值版本（含 catch 兜底句），DOM 写入与 `toolResultsLocalNotice` 变量删除。
3. **卡片根容器**：两张卡的 `article` 本身作为 React root 容器（`id="sage-region-sites"`/`id="sage-region-tool-results"`、`data-sage-region`、初始 `data-region-state="unavailable"`），服务端首帧保持 fail-closed 静态形态；React 挂载后整段替换内容并在容器上维护 `data-region-state`（`cards`/`unavailable`/`results`）。
4. **文档形状保真**：rows/note/字段组件逐项复刻 legacy 写出的 class 与 data 属性（`sage-tool-text`/`sage-tool-kv`/`sage-tool-table`（含 legacy 的 tbody-表头形状）/`sage-tool-link`/`sage-tool-image`、`data-tool-action="open-link"`+`data-link-url`、`data-artifact-action="open"`+`data-artifact-id`、拒绝行无入口）；notice 优先级＝`localNotice ?? payload note`，动作开始时清空本地 notice（与 legacy 时序一致）。
5. **探针区域态断言**：窗口探针在 stateProbe 之后读取两个区域的 `data-region-state`，期望值**从同一 payload 推导**（artifacts 为对象 → `cards`；toolResults.state==='read' → `results`，否则 `unavailable`），并同时要求两个区域都已落定（等待上限 4s）。窗口 spec 在头条测试断言两侧一致。

## Verification

- 红：bridge 5/5 具名红（sink 无消息、静态帧缺区域标记、无下行桥）；jsdom 模块缺失红；真实窗口探针红（`sites region state is null, expected cards`、`tool-results region state is null, expected unavailable`——期望值由真 payload 推导，fixture 下 artifacts 已知、toolResults 未接线）。日志＝`.birdview/evidence/ui-decision-01-p3-2026-10-04/red-*`。
- 绿：聚焦 30/30（bridge 5＋jsdom 8＋deliverable 保留片 2＋P2 三 spec 15）；窗口头条测试绿（区域态两侧一致）；全量 `1622 passed / 1 skipped / 0 failed`；gate quick 27/27、objects 84/84、0 skip；bundle 246,658 字节（守卫上限内）。
- 可见证据：`b16-cards-1440.png`（两卡渲染，含脱敏键值、拒绝行、两个入口按钮、目录两行与空态语义）已人工回看。**教训入账**：整页高截屏（`--window-size=1440,9668`）下方内容未被合成器绘制、`scrollIntoView` 后截屏读到未绘制区域（连续两张全空）；改用「聚焦视图」配方——注入 CSS 隐藏同面板兄弟 section 与侧栏/顶栏后 1280×1400 截屏，稳定拿到目标区。probe 与 UI 结构断言不受影响（真实窗口探针为几何主判据）。
- 过程小坑：新组件里写 `globalThis.__SAGE_LEGACY_ACTIONS__` 在 tsc 下报 TS7017（Window 增强不覆盖 `typeof globalThis`），改 `window.__SAGE_LEGACY_ACTIONS__`；heredoc 多行块替换两次静默不匹配，改用**行级单行替换＋断言 count==1** 完成。

## Alternatives considered

| 方案 | 结论 |
| --- | --- |
| 每卡一枚 `__SAGE_APP_SET_<REGION>__` | 否决：P3 还剩约 10 卡，通道会线性膨胀；趁只有一个消费者时泛化。 |
| React 直接发 `/.sage/external-link` 并自带拒绝码表 | 否决：拒绝码→文案是 wire 语义，legacy 仍是唯一解释家；两套文案会在 P4 前分叉。 |
| 只把 rows 列表交给 React、卡头/文案留服务端 | 否决：同一卡两个 owner；行级 root 也无法承担 notice 的重渲染。 |
| 手写容器属性同步（事件里 setAttribute + setState） | 否决：与 P2 相同——绕过渲染路径会与 vdom 去同步。 |

## Consequences

- P3 前两卡完成接管；`renderer.ts` 7,205→7,034 行（−171），新增 `sites-view.tsx`（99 行）、`tool-results-view.tsx`（202 行）、`bridge.ts`（125 行，替代 62 行的 matter-bridge）。
- 桥面成形：上（区域消息）下（legacy 动作）两向都已是按区域/按动作泛化的通道，后续卡片迁移只加 region key 与组件。
- 已知的过渡态重复：卡头/说明文案在 component-renderer（首帧）与 React（运行期）各有一份；P4 退役 legacy 区域渲染时一并收敛（与 P2 相同口径）。
- 未决：P3 其余卡片（列表/草案/会话/侧聊/产物/关联/行动项/管理/分组/监控/方案），其中会话卡最长；本批未 commit、未 push。
