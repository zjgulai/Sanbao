# Batch 17 / P3 第二片：运行监控卡与产物卡 React 接管

- 日期：2026-10-04
- 状态：本地完成（未 commit、未 push）
- 依据：[ADR-0261](../../../adr/ADR-0261.md)（D7 strangler；P3 卡片群逐卡迁移）

## Problem

运行监控卡（D8：四轴事实 + 折叠本地态 + 运行日志有界游标走查）与产物卡（D4：观察卡、按版本预览面板全状态镜像、六个显式入口）仍由内联脚本渲染。两个卡的 wire 语义与跨卡上下文纠缠：run-log 与 observe 都经 `currentSendContext()` 读取「关联卡」的两个 select 值与 workspaces 条目；游标状态（`runLogCursor`）、轮转重置、拒绝码→文案表、按钮 pending 全部是 legacy DOM 写入；ticket 031/015/016/044/033 的行为面由 4 个 fake-DOM spec 压住（run-monitor-renderer、artifact-surface、artifact-window-renderer、deliverable-renderer 的 expand 段）。

## Decision

1. **区域桥新增两槽**：`publishRegion('run-monitor', {kind:'read', slot} | {kind:'unavailable'})` 与 `publishRegion('artifacts', {kind:'cards', cards, preview} | {kind:'unavailable'})`；两个 `article` 作 React root 容器（`#sage-region-run-monitor`/`#sage-region-artifacts`＋`data-region-state`）。
2. **下行动作桥扩展**（wire 语义仍是唯一解释家）：`runLogOpen(path)`/`runLogContinue()` 返回 `{lines, append, notice}`（游标、轮转重置、preconditions、拒绝码文案、refresh 全在 legacy）；`observeArtifacts()` 返回 notice 文本或 null（`currentSendContext` 预检与 outcome 文案在 legacy）；`retryArtifactPreview()`/`closeArtifactPreview()` 空体 POST；`setArtifactFullscreen(on)`；`artifactWindow(action)` 返回 notice（拒绝码表在 legacy）。路径 trim 移进 action（原 listener 语义）。
3. **React 拥有**：DOM、每入口 pending/disabled、本地 notice 显示时机、运行日志行的 append/替换应用、折叠本地态（保持“posts nothing 且跨 poll 存活”）、预览面板全状态镜像（closed/opening/ready+expanded/window/failed+retryable）与按钮 hidden/data 属性；`ARTIFACT_KIND_LABEL`/失败分句表作为视图文案随组件走。legacy 的「本地 notice 期间冻结 payload preview 句」守卫以 effect 复刻。
4. **探针扩展**：`regionFacts` 增 `runMonitor`/`artifacts` 两槽，期望值从同一 payload 推导（runMonitor.state==='read'→`read`；artifacts 为对象→`cards`），窗口 spec 头条断言四区域两侧一致。
5. **测试重分工**：4 个 legacy 渲染 spec 删除，覆盖重安置——新 `test/monitor-artifact-bridge.spec.ts`（静态 pin＋两槽发布＋9 个下行动作的请求体/返回文案/游标走查/轮转/preconditions）＋`test/product-app/monitor-artifact.spec.tsx`（两卡全状态渲染、折叠本地态、日志 append、六入口、焦点回收、notice 优先级）。

## Verification

- 红：bridge 8/8 具名红（sink 无消息、静态帧缺区域标记、无下行桥、游标断言）；jsdom 模块缺失红；真实窗口探针红（`run-monitor region state is null, expected unavailable`、`artifacts region state is null, expected cards`）。
- 绿：聚焦 16/16（bridge 8＋jsdom 8）＋batch-16 两 spec 回归绿；窗口头条绿（四区域态两侧一致）；全量 `1622 passed / 1 skipped / 0 failed`；gate quick 27/27、objects 84/84、0 skip；bundle 263,419 字节（守卫上限内）。
- 可见证据：`b17-cards-1440.png`（聚焦视图，D4 四卡＋预览面板 ready 态＋D8 四轴事实＋日志块）已人工回看。
- 过程修正三处：bridge spec 的 preconditions 用例漏了 workspaces 夹具（真实原因：`currentSendContext` 需要条目）；jsdom 断言辅助误对 NodeList 调 `.find`；`runLogOpen` 的 trim 必须在 action 内（原 listener 语义）——三处都在本批内修净并复绿。

## Alternatives considered

| 方案 | 结论 |
| --- | --- |
| 游标/轮转状态机搬入 React | 否决：游标读取依赖 legacy 的跨卡上下文（关联卡 select 值），搬一半必分裂；留在 wire 侧最干净。 |
| React 直接复用 `currentSendContext` 的等价逻辑 | 否决：会把「关联卡的选中事实」变成两个家；P4 关联卡迁移时一并收口。 |
| 保留 4 个 legacy 渲染 spec 继续驱动 fake DOM | 否决：区域 DOM 归 React 后 legacy 无可驱动对象；覆盖改由 bridge（wire 面）＋jsdom（DOM 面）＋窗口探针（真实面）三层承接。 |
| 把 KIND_LABEL/失败分句留在 legacy 经桥回传 | 否决：那是视图文案不是 wire 语义；随组件走（P2/P3 的处理口径一致）。 |

## Consequences

- P3 已完成 4/13 卡（sites、tool-results、run-monitor、artifacts）；`renderer.ts` 7,034→6,833 行（−201），新增 `monitor-view.tsx`、`artifact-view.tsx`。
- 下行桥现覆盖 9 个动作；后续卡片（列表/草案/会话/侧聊/关联/行动项/管理/分组/方案）继续沿用。
- 删除了 4 个 legacy spec 文件（覆盖已重安置，见 Verification）；测试总数持平（1622）。
- 未决：P3 其余 9 卡与 P4；本批未 commit、未 push。
