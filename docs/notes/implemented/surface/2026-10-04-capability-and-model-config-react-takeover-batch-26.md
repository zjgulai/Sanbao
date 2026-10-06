# Batch 26 / P4 第二片：能力名册卡＋模型配置卡 React 接管

- 日期：2026-10-04
- 状态：本地完成（未 commit、未 push）
- 依据：[ADR-0261](../../../adr/ADR-0261.md)（D7 strangler；P4 其余面板逐片迁移）

## Problem

P4-2：`panel-capabilities` 的两张纯只读卡——「已配置的 Agent 运行时」（`capability-rows/note` ＋ 面板头部动态徽记 `capability-source`）与「模型配置」（`model-rows/model-test/model-note`）。侦察确认：两卡**零交互、零路由、零下行动作**（纯 payload→DOM）；两张 reason 映射表（capability 4 码、model-config 4 码）只被这两个函数消费；动态徽记在 article **之外**的面板标题行；与原 P4-1 判定的「state-runtime 卡」边界复核：该卡属 `panel-settings`（批 29），与本批无涉。两枚原 spec 均为「服务级＋DOM 级」双段结构——服务级段（7 测）必须保留。

## Decision

1. **区域槽** `capability`（article `#sage-region-capability`＋**头部徽记同区域第二容器** `#sage-region-capability-source`，两个 React 挂载读同一条区域消息——来源徽记与名册「一条事实两个视图」）与 `model-config`（`#sage-region-model-config`）；消息＝`{kind:'read', slot:{slice}} | {kind:'unavailable'}`（slice 原样，对象在即 read）。探针扩至**十七区域**；三条 fallback 路径（route-denial／invalid-payload／catch）一并发布（沿批 25 修复的形状：就绪/不可用事实与投影同步发布）。
2. **零下行动作**（69 动作不变）：两卡无请求、无写入口——「已配置／已启用／可用」「已保存／连通性／凭据」三分事实句、reason 注记表（两表随迁 React，legacy 删除）、徽记三态句（观察／尚未读到／等待）全由 React 从槽组装。
3. **测试重分工**：两枚旧 spec 各裁去 DOM 段并更名——`capability-surface.spec.ts`→`capability-projection.spec.ts`（4 服务级测）、`model-config-readout.spec.ts`→`model-config-projection.spec.ts`（3 服务级测）——服务级覆盖原位保留；新 `capability-model-bridge.spec.ts`（3：双槽发布＋零写入哨兵、静态字词＋9 个 id 反向源码钉＋两卡零控件切片＋**React 源零 fetch/零动作钉**、未观察 reason 随槽透传）＋ jsdom `product-app/capability-model.spec.tsx`（7：名册三事实分离、未核验不写「已停用」、运行时 reason 入表、徽记三态、模型行四标签、部分失败不成品、未读/空文档分离＋零控件）。
4. **原 spec 的「脚本 fetch 白名单」守卫处置**：其意图（能力面不得长出写路径）改以更强的两件钉承接——静态卡切片零 `<button|<form|<input>`＋`capability-view.tsx` 源级禁 `fetch(`/`__SAGE_LEGACY_ACTIONS__`/控件字面量。

## Verification

- 红/绿：新聚焦 10/10（桥 3＋jsdom 7；三处测试夹具修正——徽记与卡片共享 store、未读夹具 `connectivityTest:null`）；全量首跑即绿 `179 files / 1621 passed / 1 skipped / 0 failed`（净 +3＝删 14、留 7、增 10，对账一致）；窗口 spec 18/18（**十七区域**一致）；`npx tsc --build` 退出 0；bundle 425,159 字节（批 25＝417,045）；gate quick 27/27、objects 84/84、0 skip。
- §1.6：`b26-capability-focus.html`（冻结载荷＋fetch stub＋切能力视图）`READY {h:813, badge:'来源：运行时清单观察', presetRows:3, modelRows:2, horizontalFree:true}`；`b26-capability-1440.png`/`b26-capability-660.png` 已人工回看（徽记、三态标签〔已启用绿／未启用、需重启、缺凭据橙〕、390 宽折行无溢出）——本批回看无缺陷。

## Alternatives considered

| 方案 | 结论 |
| --- | --- |
| 动态徽记留 legacy（缩成 6 行 renderCapabilitySource） | 否决：徽记纯投影派生（无镜像、无跨区状态），随区域槽走才能让 legacy 对该面板零残留；同区域双容器是更干净的家。 |
| 徽记开第三个区域 | 否决：与名册同源同句族，同一条消息两容器即可；探针只读名册容器，少一个易腐读数。 |
| reason 映射表留 legacy、动作返回句子 | 否决：两卡本就零动作；表只此两处消费，随迁 React（显示句的家）并删 legacy 死码。 |
| 原「脚本 fetch 白名单」守卫原样保留 | 否决：接管后该脚本面不再渲染此卡，守卫词不达意；替换为「静态切零控件＋React 源零 fetch/零动作」两件钉（更强、指家更准）。 |

## Consequences

- P4 完成 2/6 片；`renderer.ts` 4,041→3,938 行（−103）；新增 `capability-view.tsx`（166 行，三导出：名册／徽记／模型卡）；下行桥 69 动作（不变）、探针十七区域。
- 余下：P4-3 工作区族、P4-4 修订草案卡、P4-5 设置群、收尾（壳级 spec 复核＋legacy 内联脚本退役评估）。
- 未决：本批未 commit、未 push；批次 19–26 **八个改动集併存未提交**。
