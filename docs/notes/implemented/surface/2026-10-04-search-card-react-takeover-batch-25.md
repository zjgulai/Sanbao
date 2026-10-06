# Batch 25 / P4 首片：搜索卡（panel-search）React 接管

- 日期：2026-10-04
- 状态：本地完成（未 commit、未 push）
- 依据：[ADR-0261](../../../adr/ADR-0261.md)（D7 strangler；P4 其余面板逐片迁移）

## Problem

P4 开工。侦察结论（面板清单＋驱动 spec 归类＋分批切法）：

- 剩余 legacy 渲染面＝搜索（`panel-search`）、能力面板群（capability 名册/模型卡/工作区采纳·列表·变更/文件候选·引用·用量/修订草案卡＋写回确认卡/readout 叶子）、设置群（偏好卡＋用户菜单/退出检查·引导·环境/settings leaves/知识·可见范围·插件·诊断/反馈/身份投影）、顶栏与运行时状态卡、matter 面板残余壳级 spec。
- **反馈块嵌在「关于与诊断」卡内**（与 `diagnostics-*` 同卡）——单独切会裂卡（反例见 D3 侦察），并入设置群批次。
- 分批：**25＝搜索（本批）**；26＝能力面板群（capability-surface 8＋model-config-readout 6）；27＝工作区族（workspace-adoption 9＋mutation 7＋file-reference 7）；28＝修订草案卡＋写回确认卡（14）；29＝设置群（preferences 16＋settings-leaves 6＋exit/guide/env 4＋readout 9＋feedback 3，最大，或再分）；收尾＝壳级 spec 复核＋legacy 内联脚本退役评估。

## Decision

1. **区域槽** `search`：**无投影切片**的客户端本地面——只发布就绪事实 `{kind:'read'}`；容器＝`sage-search-card` article（补 `#sage-region-search`＋`data-region-state`）；探针扩至**十四区域**（search 期望恒 `read`：legacy 发布＋React 应用双证）。**负控跑抓到 fail-closed 分支提前 return 漏发布**（`search region state is unavailable, expected read`）→ 三条 fallback 路径（route-denial／invalid-payload／catch）一并发布（搜索就绪与投影无关）。
2. **下行桥 +1（70 总计）**：`runSearch(query)` → `{kind:'read', outcome} | {kind:'notice', notice}`——查询裁剪、空守卫句（'先写关键词再搜索。'）、拒绝句（'搜索被拒绝：code。'）、不可读句（'搜索没有返回可读结果。'）全留 wire；**结果保留在 React 本地态直到下一次搜索**（legacy 语义：2s 轮询不重渲搜索结果）；in-flight 守卫双份（wire 保「至多一个查询」单家语义，React 拥有按钮 disabled 与同 tick 双击去重）。
3. **React 拥有**：输入态与 Enter 触发、两区渲染（字段标签映射 标题/交付/责任/项目）、会话三态句分离（可用 N 条/没有命中/不可用——US-087 三句不混）、hasMore 句、note 派生句、拒绝时清空上一读。测试重分工：删除 `search-surface.spec.ts`（5 测）；新 `search-region-bridge.spec.ts`（4：就绪发布＋零写入哨兵、精确体＋结果透传、守卫与拒绝/不可读句、静态字词＋6 id 反向源码钉）＋ jsdom `product-app/search-region.spec.tsx`（6：两区渲染只读、三句分离、hasMore＋空守卫、in-flight 去重、Enter、拒绝清空）。

## Verification

- 红：旧驱动 5/5 具名红。
- 绿：新聚焦 10/10（桥 4＋jsdom 6）；全量首跑 2 红＝**两个 fail-closed 负控跑**（上）→ 修复后 `177 files / 1618 passed / 1 skipped / 0 failed`（净 +5＝删 5、增 10，对账一致）；窗口 spec 18/18（**十四区域**一致）；`npx tsc --build` 退出 0；bundle 417,045 字节（批 24＝411,675）；gate quick 27/27、objects 84/84、0 skip。
- §1.6：`b25-search-focus.html`（冻结载荷＋fetch stub＋分级交互：切搜索视图→原生 setter 填词→点击搜索）`READY {h:813, matters:2, sessions:2, hasMore 句, horizontalFree:true}`；`b25-search-1440.png`/`b25-search-660.png` 已人工回看（两区命中、tag 式字段标注、660 三行折行无溢出）——本批回看无缺陷。

## Alternatives considered

| 方案 | 结论 |
| --- | --- |
| 反馈块随本批一起切 | 否决：嵌在「关于与诊断」卡内（与 diagnostics-* 同卡），单独切会裂卡；归设置群批次整卡迁。 |
| 搜索结果走区域消息（publishRegion） | 否决：结果是那一次显式 POST 的客户端本地产物，不是投影事实；动作回包与终端读页/锚点定位先例同式。 |
| in-flight 守卫只留 React | 采纳双份：wire 保留「同一时刻至多一个查询」的单家语义（Enter 与按钮共享），React 负责可观察的 disabled 与去重。 |
| fail-closed 时 search 区域态改期望 unavailable | 否决：搜索卡与投影无关（客户端本地面），就绪事实应恒发布——修发布路径而不是放宽期望。 |

## Consequences

- P4 首片完成（1/约 6 片）；`renderer.ts` 4,112→4,041 行（−71）；新增 `search-view.tsx`（136 行）；下行桥 70 动作、探针十四区域。
- 余下：P4-2 能力面板群、P4-3 工作区族、P4-4 修订草案卡、P4-5 设置群、收尾（壳级 spec 复核＋legacy 内联脚本退役评估）。
- 未决：本批未 commit、未 push；批次 19–25 **七个改动集併存未提交**。
