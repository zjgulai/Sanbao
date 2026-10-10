---
title: 矩阵 T13-A 记账迁移第一批
doc_type: process
module: sanbao-integration
topic: state-matrix-implementing-migration
status: stable
created: 2026-10-10
updated: 2026-10-11
owner: self
source: ai
---

# 矩阵 T13-A 记账迁移第一批：9 行 pending→implementing 与三处记账修正

## Problem

tracked 矩阵（`docs/specs/2026-09-27-sanbao-to-sage-ui-state-map.json`）的 `delivery.ui` 落后于仓库实现事实：T13 外观族 8 行与 T03 搜索 1 行的 desktop UI 已实现并接线，但矩阵仍记 `pending`；另有 4 条既有 `implementing` 行仍引用 `.birdview/` 未跟踪证据或带 `(7/7)` 计数后缀的测试路径，违反「一份事实一个家」与证据可追溯性；`docs/specs/2026-10-05-sanbao-in-sage-integration-spec.md` §7 仍写「矩阵 gate 未接入全局门禁」，与 `scripts/gate.mjs` 的实际注册状态不符。

## Decision

第一批记账迁移（零功能改动、零状态升级）：

1. **9 行 `delivery.ui.status: pending→implementing`**：
   - T13 外观族 8 行（`QDR.P06.settings.appearance.{default,color-mode.open,language.open,font-style.open,content-width.open,file-icons.open,icon-appearance.open,terminal-theme.open}`）：Sage desktop 已实现 8 项原生 select + GET/POST 权威回读，打包态 DMG-06 首存/重启验收通过。证据引用改为 tracked 路径：`apps/sage-shell/test/product-app/desktop-settings-view.spec.tsx` 与 `docs/notes/implemented/packaging/2026-10-10-dmg-chain-first-real-run.md`，`countsAsVerification:false`（保持 `implementing`，不升 `verified`）。
   - `QDR.P02.search.empty`（T03，B1 漏迁行，与候选 CSV 第 4 行一致）：补真实 blocker 文案（read-only route + 生产拒绝逐字渲染 + 零虚构命中）与 candidate 级证据引用，kind 沿用既有 `candidate-untracked` 约定。
   - 入口行 `QDR.P06.settings.appearance.entry` **不动**：其语义是「设置总入口的外观导航项」（discovery），需单独重解释后另行迁移。
2. **B4 证据换引（4 行，不升状态）**：`QDR.P01.home.workspace`、`QDR.S01.session.running`、`QDR.S08.reply.interrupted`、`QDR.S08.reply.continued` 的 `.birdview/...` 引用与 `read-policy-allowed-path.spec.ts (7/7)` 计数后缀，换成 tracked 路径 `desktop-session.spec.tsx`、`desktop-session-view.spec.tsx`、`desktop-page.spec.tsx`、去后缀的 `read-policy-allowed-path.spec.ts`。`QDR.P01.home.workspace` 的 blocker 文案同步纠偏：删去无证据支撑的「(T03/A, ADR-0268) verified」措辞，改为与 tracked 测试覆盖一致的表述。
3. **B5 文档同步**：spec §7 改为「矩阵 gate 已注册于 `scripts/gate.mjs` 的 Sage scope（`sage-sanbao-state-matrix` 与 `-selftest`），2026-10-10 起随 `pnpm run gate` 运行」。

**为什么零用户裁决即可迁移**：[Sanbao → Sage 集成票据](../../../plans/2026-10-05-sanbao-in-sage-integration-tickets.md) 允许「每次进度变化修改 tracked row、提供符合规格的证据、由派生 summary 与独立 gate 重新验证」；`implementing` 状态本身无证据强约束（`countsAsVerification:false` 即可），只有升 `verified`/`integrated` 才触发严格判据。本批严格不升 `verified`/`integrated`，不动 `applicationService`（保持 `blocked`）与其他维度，不改 `source`/`prototype`/`legacyUi00Review` 字段与任何 PIN。

## Alternatives considered

- **等 T13/T03 完成后一次性升 `verified`**：拒绝——记账必须反映当下实现事实；`pending` 与真实状态不符会让矩阵失去进度导航价值，且违反「先记账后验收」的增量节奏。
- **把这 9 行直接升 `verified`**：拒绝——`verified` 需要 `countsAsVerification:true` 的 tracked 证据并通过门禁校验；本批按票据边界只做状态纠偏，升级是下一批的独立动作。
- **保留 `.birdview/` 引用并标注 untracked**：拒绝——候选 CSV 本就是未跟踪输入（`countsAsVerification:false` 的降级证据）；既有 4 行已有 tracked 等价测试可换引，保留会长期污染可追溯性。`QDR.P02.search.empty` 保留一处 `.birdview` live-result 引用，因其只有候选级证据，kind 已如实标注 `candidate-untracked`。

## Consequences

- `summary.delivery.ui` 从 `{"implementing":4,"pending":202}` 变为 `{"implementing":13,"pending":193}`，由生成器 `--check` 与矩阵门禁的 summary-drift 判据双重校验。
- 矩阵中 `.birdview` 字符串仅剩两处：`migration.candidate.path`（生成器写入的 provenance 事实，非证据引用）与 `QDR.P02.search.empty` 的 `candidate-untracked` live-result 引用；无绝对路径、无带计数 ref。
- 后续待办：B3（blocked service 行的处理）待用户裁决；`appearance.entry` 入口语义重解释；`implementing→verified` 升级政策待裁决。
- 功能代码零改动；本批只触及 tracked JSON 的 `delivery.ui` 与 `blockers` 字段及两份文档。

## Verification

- `node scripts/gen-sage-sanbao-state-matrix.mjs --check` → `sage-sanbao-state-matrix generator check: PASS (206 rows; integrated 0)`，exit 0
- `node scripts/gates/sage-sanbao-state-matrix.mjs` → `sage-sanbao-state-matrix: PASS (206 rows; integrated 0)`，exit 0
- `pnpm run gate` → 32/32 项通过，exit 0（含 `sage-sanbao-state-matrix` 与 `-selftest`）
- 机械校验：全部 path 形态 evidence ref 均为 git-tracked（`git ls-files --error-unmatch` 逐一通过）；交付引用中无 `(N/N)` 计数后缀（B1 行从候选 CSV 第 4 行迁入时同步去掉了原文的 `desktop-search.spec.tsx (8/8)` 计数后缀，仅保留路径）；与迁移前快照 diff 确认 `source`/`prototype`/`legacyUi00Review`/`policy`/`migration` 逐字节不变，`summary` 仅按派生规则重算（4→13 implementing / 202→193 pending），其余改动仅限 `delivery.ui.status`、`delivery.ui.evidenceRefs` 与 `delivery.blockers`。

## 第二批（2026-10-10）：appearance.entry 单行迁移 pending→implementing

ADR-0283 D3 重述入口语义（账号菜单 → 外观与显示表单，无独立设置导航级）后，为 `QDR.P06.settings.appearance.entry` 补句级证据并迁 `delivery.ui.status: pending→implementing`。evidenceRefs（全部 `countsAsVerification:false`）：tracked 测试 `apps/sage-shell/test/product-app/desktop-page.spec.tsx`（账号菜单两级入口断言「账号与设置→账号与设置页→外观与显示」）与 `desktop-settings-view.spec.tsx`（8 项 select 权威渲染），live 读数 `docs/notes/implemented/packaging/evidence/2026-10-10-dmg06-v2-acceptance-result.json`（DMG-06 `sage.packaged-acceptance.v1 passed=true`，live check 经账号菜单进入设置，见 `apps/sage-shell/test/support/desktop-live-check.mjs`）。blocker 改为与 implementing 相称：入口已实现、两级交互均有 tracked 测试与打包 live 读数；hostIntegration/visualAcceptance 仍 pending。`summary.delivery.ui` 由 `deriveSummary` 原函数重算写回（5→6 implementing、193→192 pending）。验证：`node scripts/gen-sage-sanbao-state-matrix.mjs --check` → PASS (206 rows; integrated 0) exit 0；`node scripts/gates/sage-sanbao-state-matrix.mjs` → PASS (206 rows; integrated 0) exit 0；`node --test scripts/gates/sage-sanbao-state-matrix.test.mjs` → 13 tests / 13 pass / 0 fail。未闭：implementing→verified 升级政策仍待裁决。

## 第三批（2026-10-10）：会话区已实现交互族 8 行 pending→implementing

从 192 行 pending 中逐行打开被引用测试核实断言后，迁 8 行已有句级证据的会话区行 `delivery.ui.status: pending→implementing`；全部 evidenceRefs 为 `kind: tracked-test`、路径形态、无 `(N/N)` 计数后缀、`countsAsVerification:false`（不升 `verified`）。迁移行清单（row id · 证据 ref · 核实要点）：

1. `QDR.S02.clarification.waiting` · `apps/sage-shell/test/product-app/session-region.spec.tsx` + `apps/sage-shell/test/clarifications.spec.ts` · session-region 断言待答卡渲染（问题、选项、自定义输入、提交经 bridge）与「共 1 个待回答的澄清提问」句；clarifications.spec 断言 pending 卡读取与回执只写一次。
2. `QDR.S02.clarification.custom` · 同上两文件 · session-region 断言 `[data-clarification-custom]` 填入自定义文本随提交载荷发出（`custom: '补充口径'`）；clarifications.spec US-179 断言 custom 与选项同权随同一次回答写入、不触 matter 字段。
3. `QDR.S02.clarification.submitted` · `apps/sage-shell/test/session-history.spec.ts` + `apps/sage-shell/test/clarifications.spec.ts` · session-history US-180 断言运行历史只读回读中已回答问题携带 recorded answer（selected+custom、answered:true）；clarifications.spec 断言 accepted→effective 仅由持久工具结果落定。输入区恢复等交互瞬态未单独断言，已写入 blocker。
4. `QDR.O02.goal.mode.active` · `apps/sage-shell/test/product-app/session-region.spec.tsx` + `apps/sage-shell/test/plan-mode.spec.ts` · session-region 断言目标按钮 `data-plan-mode-state="active"`、「目标模式（当前）」标记与「当前：目标模式。」句；plan-mode.spec 断言模式投影读取与单一名请求切换。
5. `QDR.O02.plan.mode.active` · 同上两文件 · session-region 断言「计划模式（当前）」与「计划模式（下一步生效）」两级标记、切换只出方案不执行的边界句。
6. `QDR.P14.terminal.entry` · `apps/sage-shell/test/product-app/session-region.spec.tsx` + `apps/sage-shell/test/session-region-bridge.spec.ts` · session-region 断言终端清单只读渲染与有界输出打开/关闭（关闭纯本地零请求）；bridge spec 断言终端 act 经 down-bridge 精确载荷。原观察只证入口按钮可见，面板布局/标签/错误状态未核验已写入 blocker。
7. `QDR.P01.anchor.preview` · `apps/sage-shell/test/product-app/session-region.spec.tsx` + `apps/sage-shell/test/session-anchors.spec.ts` · session-region 断言锚点短预览浮层、显式定位（一次具名读取）与收起；session-anchors.spec 断言倒序读取、有界预览与定位（US-183/184）。
8. `QDR.M01.reply.actions` · `apps/sage-shell/test/product-app/session-region.spec.tsx` · 断言回复动作只提供已核实动作（copy/quote/确定失败重试）与后续建议 chip（只填输入不发送、零 bridge 调用）。原产品观察中的评价/回复分支/更多操作未实现，blocker 明示不冒充对齐。

核实后跳过的候选行及原因：`QDR.P16.review.summary`（任务回顾卡）——Sage run-monitor 卡是四轴监控+运行日志，无回顾卡面，同名近似不覆盖；`QDR.S01.session.streaming`——desktop-session-view 断言字面 Markdown 保留与 pre-wrap，无流式逐步出现/视区推进断言；`QDR.S10.context.usage`——run-monitor context 轴仅有 unknown 措辞断言，无占用提示数值面；`QDR.OBS01.usage.open`——无用量浮层实现；`QDR.OBS04.user.menu.open` / `QDR.OBS04.appearance.menu.open`——Sage 账号菜单无快捷外观子菜单；`QDR.M02.file.writing` / `QDR.M02.edit.expanded`——无工具过程行渲染断言；`QDR.A01.changes.created` / `QDR.A01.diff.created` / `QDR.A01.diff.modified`——无本轮变更摘要与 diff 审阅 UI；`QDR.P14.preview.html`——artifact-preview 覆盖 html kind 的容器内预览，非原产品的内置浏览器面（地址栏+双层标签），同名近似；`QDR.A02.output.html`——产物卡断言为文件卡状态词，无 HTML 产物卡+打开方式选择面；`QDR.P03.list.empty` / `QDR.P03.create.empty`——自动化页只有 outstanding 占位文案断言，无空列表/新建表单 UI；`QDR.M01.reply.completed`——无计划正文+成功/耗时/迭代信息完成态断言。以上全部维持 pending。

`summary.delivery.ui` 由生成器 `deriveSummary` 原函数重算写回（6→14 implementing、192→184 pending、verified 8 不变）；重写方式为 `node scripts/gen-sage-sanbao-state-matrix.mjs --source-root vendor/sanbao-prototype --write`（源根 HEAD `b861d046` 与 PIN 一致），随后 `--check-source` PASS。与迁移前快照 diff 审计确认：改动仅限 8 行的 `delivery.ui.status` / `delivery.ui.evidenceRefs` / `delivery.blockers` 与派生 summary；`source`/`prototype`/`legacyUi00Review`/`policy`/`migration`/行序逐字节不变。blocker 全部改写为与 implementing 相称的余留项（真实服务链、未实现子面、hostIntegration/visualAcceptance 仍 pending），未自造已解决事实。

验证：`node scripts/gen-sage-sanbao-state-matrix.mjs --check` → `sage-sanbao-state-matrix generator check: PASS (206 rows; integrated 0)` exit 0；`node scripts/gates/sage-sanbao-state-matrix.mjs` → `sage-sanbao-state-matrix: PASS (206 rows; integrated 0)` exit 0；`node --test scripts/gates/sage-sanbao-state-matrix.test.mjs` → 13 tests / 13 pass / 0 fail exit 0；被引用 6 个路径逐一 `git ls-files --error-unmatch` 通过。未闭：implementing→verified 升级政策仍待裁决。

## 第四批（2026-10-11）：输入区上下文族 4 行 pending→implementing

从 184 行 pending（排除 90 行 `scope.unexpanded` 与第三批已核实跳过的 16 行）的 113 个候选中逐行打开被引用测试核实断言后，迁 4 行已有句级证据的输入区上下文行 `delivery.ui.status: pending→implementing`；全部 evidenceRefs 为 `kind: tracked-test`、路径形态、无 `(N/N)` 计数后缀、`countsAsVerification:false`（不升 `verified`）。迁移行清单（row id · 证据 ref · 核实要点）：

1. `QDR.O01.context.menu.open` · `apps/sage-shell/test/product-app/desktop-page.spec.tsx` · 断言「添加上下文」菜单打开后六项（目标/计划/站点/工作区文件/插件/技能）可见、菜单标注不可用、ArrowDown 键盘移动、Escape 关闭、焦点恢复到 opener 且草稿不丢；另一断言选「工作区文件：不可用」不添加假 chip、零请求。原产品观察的「五项菜单」在 Sage 为六项（多「工作区文件」）；子层选择面已由对应行单独记账，已写入 blocker。
2. `QDR.O02.skills.menu.open` · `apps/sage-shell/test/product-app/session-region.spec.tsx` + `apps/sage-shell/test/input-selections.spec.ts` · session-region 断言只读技能清单渲染（名称、来源·provider 标签、「可选用（本入口）」/「仅模型可调用（本入口不可选）」）、选用经 `selectInputRef('skill', …)` 下桥、清除与不在清单内的具名拒绝；input-selections.spec（ticket 038）断言清单为实际挂载投影、unavailable-first、选择按当前投影校验、单请求有界携带且不写启用状态。原产品「搜索框+子菜单」形态未复刻（Sage 为清单+chip），搜索过滤/执行/禁用态无断言，已写入 blocker。
3. `QDR.O02.plugins.menu.open` · 同上两文件 · session-region 断言插件清单渲染「已挂载（组合内实际存在）·v1.2.0」、选用经 `selectInputRef('plugin', …)`、chip「已选：插件 …（随下一次发送携带；不改变启用状态，也不代表已获得能力）」；plugins 组合未接线时单行如实说明、不以空列表冒充。原产品「搜索框+四项+管理/探索入口」与搜索过滤无实现断言，已写入 blocker。
4. `QDR.O02.sites.templates.open` · `apps/sage-shell/test/product-app/draft-region.spec.tsx` + `apps/sage-shell/test/site-templates.spec.ts` · draft-region「site starting-template panel」断言目录条目渲染（名称、来源·版本、prompt 缺失行「本入口不可用」）、「使用（填入草案输入）」只填 `#draft-input`、零 down-bridge 调用、「不建站不写配置」与「选模板不等于已建站」边界句、目录 unavailable/空态的具名说明；site-templates.spec（ticket 040/195-196）断言目录只读投影、坏条目具名拒绝、协议级结构断言「无任何站点创建请求面」。原产品「6 分类 tab、默认落地页 10 项」分类面与「插入站点 chip」形态未实现，已写入 blocker。

核实后跳过的候选及原因（全部维持 pending）：22 行 `QDR.P06.settings.*.entry` 设置导航入口——Sage 设置面只有「外观与显示」一节（`desktop-settings-view.spec.tsx` 仅 8 项 select、`desktop-page.spec.tsx` 只断言「账号与设置→账号与设置页→外观与显示」两级入口），无 24 项设置导航清单，同名近似不成立；2 行 `QDR.P13.create.empty/ready`——新建工作区空表单（源文件夹/名称/图标/颜色）与「选择目录后创建可用」无 renderer 断言，`desktop-page.spec.tsx` 的 T03-C adopt 入口是「接入已有目录」（`/.sage/workspace/adopt`，取消/拒绝/已接入三态），`workspace-adoption.spec.ts` 是同一链路的模块 seam，与「新建表单」不同面；`QDR.P14.sidepanel.entry`——Sage 侧栏 collapse/expand 是导航收起，非原产品会话工作台侧面板；`QDR.OBS02.knowledge.entry` / `QDR.OBS03.sites.entry`——`desktop-page.spec.tsx` 断言侧栏名称存在且点击后落到 outstanding 占位（「尚未接通」），入口可见成立但整行语义（进入目标页）未达成，维持 pending 更诚实；`QDR.P06.settings.mobile.partial`、`QDR.OBS04.appearance.*` 6 行——Sage 账号菜单无快捷外观子菜单（第三批已核）；P04 扩展市场/O08 MCP 表单/OBS02 知识中心/OBS03 站点各默认页与弹窗——无对应实现面。

`summary.delivery.ui` 由生成器 `deriveSummary` 原函数重算写回（14→18 implementing、184→180 pending、verified 8 不变）。写回方式与第三批一致：程序化改 4 行的 `delivery.ui.status`/`delivery.ui.evidenceRefs`/`delivery.blockers` 后，`node scripts/gen-sage-sanbao-state-matrix.mjs --source-root vendor/sanbao-prototype --write`（源根 HEAD `b861d046` 与 PIN 一致），随后 `--check-source` PASS。与迁移前快照 diff 审计确认：改动仅限 4 行的上述三字段与派生 summary；`source`/`prototype`/`legacyUi00Review`/`policy`/`migration`/行序/其余 202 行逐字节不变。blocker 全部改写为与 implementing 相称的余留项（已实现面的真实边界、未复刻的子形态、applicationService 仍 blocked、hostIntegration/visualAcceptance 仍 pending），未自造已解决事实。

验证：`node scripts/gen-sage-sanbao-state-matrix.mjs --check` → `sage-sanbao-state-matrix generator check: PASS (206 rows; integrated 0)` exit 0；`node scripts/gates/sage-sanbao-state-matrix.mjs` → `sage-sanbao-state-matrix: PASS (206 rows; integrated 0)` exit 0；`node --test scripts/gates/sage-sanbao-state-matrix.test.mjs` → 13 tests / 13 pass / 0 fail exit 0；被引用 5 个路径逐一 `git ls-files --error-unmatch` 通过（`desktop-page.spec.tsx`、`session-region.spec.tsx`、`input-selections.spec.ts`、`draft-region.spec.tsx`、`site-templates.spec.ts`）。未闭：implementing→verified 升级政策仍待裁决。
