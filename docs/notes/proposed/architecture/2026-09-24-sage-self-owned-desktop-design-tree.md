# Sage 自有桌面壳设计树

- 日期：2026-09-24
- 状态：P0-1 与 P0-2 已获 Birdview 文件级确认并完成本地源码/门禁迁移；资料迁移、品牌资产、业务闭环与发布阶段尚未实施
- ADR：[ADR-0159](../../../adr/ADR-0159.md)

## Problem

当前 DSH Desktop 的品牌补丁、profile 组合与薄壳原型分散在不同路径；上游 UI 仍可能作为默认界面露出。Sanbao 原型承载了目标交互，但它是独立的静态 SPA，不能直接作为 Magpie-Horch 的运行时依赖。继续把 Sage 定义为 DSH 的皮肤，会让产品交互、发布身份和能力边界长期受上游桌面壳约束。

## Decision

用户已确认以下顶层决策：

1. 对外品牌统一为英文 `Sage`、中文「三宝」；退役罗马字 `Sanbao`，仅保留历史和兼容迁移用途。
2. Sage Shell 自己拥有 Electron 窗口、导航、路由、交互与产品状态；Harness 仅作为可替换的能力运行时，通过 Capability Adapter 消费。
3. 首个端到端产品主线是跨境经营 AgenticOS；项目、任务、会话、浏览器、文件与自动化组成通用工作台底座，Jev 等内容增长能力以模块接入。
4. 产品 chrome、默认页面、引导、图标和营销面清除 DeepSeek/Harness 身份；真实模型/提供方名称及许可证、vendor pin 和历史证据保留其事实语义。
5. 原始草案曾考虑第一版保留现有 Bundle ID 和本地资料兼容身份；该选项已被后续技术核验否决并由下一段替代，不作为实施依据。

经技术核验后，身份“兼容”被具体化为**复制、校验、回滚的数据迁移**，而不是与旧 DSH 共用 Bundle ID、用户目录或更新链；否则 Sage 与旧 DSH 不能安全并存，也会继续携带原产品身份。

用户随后确认以下实施边界：

6. 以原子目录迁移将 `apps/lute-shell/` 收口为 `apps/sage-shell/`，不长期并行维护两套产品壳；旧 DSH Desktop 仅是迁移与回滚通道。
7. 首个闭环以“经营事项”为中心，覆盖创建、证据输入、运行活动、澄清/审批、产物回执和失败重试；原型的 206 条状态是迁移台账和验收输入，不等于 206 个已交付功能。
8. Sage 首版采用新的受控 Bundle ID 和独立数据根；旧 DSH 数据仅在首次启动时复制、校验和可回滚导入，旧 App 留存至验证完成。
9. 主图形采用 `/Users/lute/project/Sanbao/SanBao_Logo_Kit/svg/A_StarSail_Product_symbol.svg` 的几何；仅在 Sage 内派生无 `SanBao` 元数据的 symbol、深浅色版与 `.icns`。所有带 `SanBao` 路径字标的 lockup、概念图与生成记录禁止直接出货。
10. 第一阶段是内部工程验收版，不发 DMG；验收 Sage Shell 冷启动、首个闭环、用户可见面零原始品牌残留和真实 Host 行为。
11. 清理先产生“保留 / 归档 / 删除”清单，逐项确认后执行；旧 DSH App、数据和发布物在 Sage 迁移验收前不删除。
12. P0-2 的首个 Sage 页面是无新增依赖的静态 renderer，只能请求 `GET /.sage/state` 与 `POST /.sage/actions`；唯一 Capability Adapter 独占 `ctx.get('connection')`。两条路由仅接受精确的无端口、无凭据、无 query/fragment `dsh-app://app` 与同源 Origin；action 以 4 KiB 的原始字节分块早停，页面以 5 秒 `AbortController` deadline 回落到可重新检查状态。现有 `HostEvent` 只用于 child→Electron 生命周期，不被误作产品状态流；`ready / unavailable / recovering` 只表示 connection 服务可解析与重新检查，不宣称网络、模型、tool、stream、artifact 或业务能力已连通。P0-2 只使用进程内存，不写 localStorage、profile 或业务资料。

## Alternatives considered

- 继续以 DSH Desktop 的 slot 换皮承载产品：否决。它不能消除官方窗口、导航、首启和运行时 UI 对产品体验的控制。
- 一次性重写 agent runtime、桌面壳与全部业务能力：否决。会把能力迁移、数据迁移和产品验证耦合，无法形成可验证的首个闭环。
- 将 Sanbao 原型以仓库外 `file:` 依赖直接装入 Magpie-Horch：否决。原型是独立静态 SPA，且脏工作区的产物不应成为 Sage 运行时依赖。

## Consequences

- 后续方案必须以 Sage Shell、Capability Adapter、Harness Capability Runtime 和原型契约四个边界描述责任，不能再将“换皮”和“自有桌面产品”混称。
- 实施必须遵循 [完整执行方案](../../../plans/2026-09-24-sage-self-owned-desktop-execution-plan.md) 的分期、数据隔离、资产来源和删除门；每一代码批都先更新 Birdview 的文件级范围并取得确认。
- P0-1 的实际边界是 `apps/lute-shell/` → `apps/sage-shell/`、壳内 package / 可见诊断命名和仓库守卫同步；它刻意保留 `lute-shell` profile、`lute-host`、`LUTE_SHELL_*` 与 `DSH_HOME`，等待 P0-3 以复制、校验和回滚方式迁移。源码目录完成不证明 Sage 数据隔离、Sage renderer 或 Sage.app 已完成。
- Bundle ID 的精确反向域名、Apple Team / Developer ID 和公开资产权属仍是 P1 发布输入，不得由实现者臆定。
- 本记录不能作为“已完成 Sage.app”、资料导入或可分发发布物的证据；P0-1 / P0-2 的代码与门禁迁移证据由执行方案和 Birdview 事件保存，且不替代隔离运行时验收。
- P0-2 已移除上游 frontend / Composer / raw stream / plugins / 默认 onboarding 的**产品消费面**，并以 `sage-product-boundary` 和 `service-consumption` 守卫它；这不等于 seed / lock 依赖已删除，也不等于真实 profile、App、Electron / GUI、数据迁移、品牌资产或经营事项闭环已验收。P0-2 的本地源码证据由执行方案和 Birdview 事件保存。
