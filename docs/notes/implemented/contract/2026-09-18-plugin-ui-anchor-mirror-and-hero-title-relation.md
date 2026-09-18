# 插件对官方 UI 的依赖成为可判读的声明；hero 标题按关系定位

- 日期：2026-09-18
- ADR：[ADR-0118](../../../adr/ADR-0118.md)
- 生命周期：implemented
- 类别：contract

## Problem

用户报「新会话对话框上方还有『探索未至之境』」。查下去不是一处文案没改，而是**三层射程同时为空**。

**一、上游把标题的类名拿掉了。** 2.0.10 的 `HeroShell.module.css` 局部名里**没有 `headlineText`**（实测：局部名是 `root, stack, headline, titleGroup, previewBadge, fishHitbox, fish, body, workspaceRow, …`）。产物 JSX 显示标题变成了 `span.titleGroup` 里一个**无类名**的 span：

```jsx
div.headline
  span.fishHitbox          ← 品牌座位（公开 slot conversation.hero.brand.mark）
  span.titleGroup
    span                   ← 无类名！t("hero.headline") = 探索未至之境
    span.previewBadge      ← 预览版
```

插件按类名隐藏标题的那条规则因此**根本没生成**。活应用读数：

```
document.documentElement.dataset.dshRootBrandAnchors
  = "degraded:heroHeadlineText,statsLineRoot"
generatedAnchorCss = ".sro9dq_headline { grid-template-columns: auto !important; }"   // 对 flex 无效
```

同一根因还有第二个伤亡：`StatsLine.module.css` 在 2.0.10 里**整个模块不存在**（上游换成胶囊式的 `StatsPills.module.css`），统计条折叠早已是死规则。

**二、镜子一直在喊，没人读。** 插件的 `degraded` 自报与 Console warn 一直正常工作。**没有任何判据在读它**：门禁零 acceptance 接线、发布 SOP §0 无实况验收、品牌探针最后一次留下产物是装机**之前**。

**三、探针自己也会死，而且死得安静。** 同一支探针在新基座上**第一步就 exit 3**：它按旧结构找 `StatsLine.module.css`，模块已不存在。它没有断言跑到，也没有任何检查项要求跑它——「没跑」与「跑了且绿」在读数上同形。

**四、真实产物接缝整段静默。** `test/official-artifacts.ts` 的路径常量钉在 2.0.5 的 asar 布局（`app.asar.unpacked/…`），2.0.10 是 no-ASAR 普通目录。5 个用例 `describe.skipIf` 掉，`pnpm test` 报 `9 passed / 5 skipped`——**被跳过的正是唯一量真产物的两条支线**。全仓只有这一处没接 `scripts/lib/app-resources.mjs`。

## Decision

### 一、声明与代码：一份家，双向可查

包根 `ui-anchors.json` 是插件上游依赖的**唯一家**（`id` / `moduleId` / `localName` / `purpose`）：插件源码 import 它做运行时定位，门禁读它做产物核对。`ANCHOR_KEYS`（编译期词汇）与清单 id 在模块初始化时**双向**断言，不一致即抛——「规则存在但永远解析不到」是静默方向，必须由机制拦住，不能靠纪律。

### 二、标题按关系定位，不按名字

`hero-title.ts`：解析出唯一声明的锚（`previewBadge`）→ 找到角标 → 取**它父容器里唯一的、有文字的叶子兄弟**作为标题 → inline `display:none` + `dsh-rb-hidden` 标记。这条关系不含任何类名。

找不到时**不猜**：候选 0 或多于 1 → 不隐藏新的东西，报 `degraded:<code>`（`badge-detached` / `no-candidate` / `ambiguous`）。**此前已正向识别并隐藏的元素保持隐藏**——它是结构唯一时被识别出来的，事后歧义不构成撤销识别的理由。`idle`（hero 未挂载）不是缺陷，不判 degraded：把它算成缺陷会让读数长期发红，而长期发红的读数会被无视。

### 三、退役统计条折叠

上游把它换成了另一种设计（胶囊），保留等于永久留一个解析不到的锚。规则、清单条目、`stats-line.spec.ts` 一并删除。

### 四、新门禁：声明 × 产物

`plugin-ui-anchor-drift`：对每条声明在每份产物里解析一次，能算出**唯一**类名才算通过。射程复用 `patch-anchor-scope.mjs`（装机 app ∪ 未打 tag 的 staging 树）。三条判据细节：

- **两种红必须可区分**：「上游改了名字」（0 候选）与「前缀形态超出认识的字符集」（含连字符，如归档里实测到的 `U-8p4G_root`）报不同的原因——压成一句会把定位工作丢给下一个读报错的人。
- **射程为空报 skip**，不报 pass；分母守恒 `expected = checked + skipped + failed`。
- **独立实现**：门禁按同一套规则自己算一遍，不调用插件的解析器（拿被测代码验被测代码会两边一起错）。

### 五、接缝改硬前置 + 探针进 SOP

插件测试的官方产物路径的家改回 `scripts/lib/app-resources.mjs`（双形态探测）；当前基座产物读不到就**判红**，不再 `skipIf`。另加一条断言：`officialLocaleValue(bundle, 'hero.preview') === OFFICIAL_PREVIEW_TEXT`——上游改文案后角标改写会静默失效，这条必须有人守。

发布 SOP §0 增加必跑项：本版触及的 UI 面逐条跑绿，品牌面为必跑。

## Alternatives considered

- **只重锚（`headlineText` → `titleGroup`）**：那只是把同一份版本知识换成新值，上游下次改结构照样静默失手。
- **按类名找标题（`titleGroup > span:first-child`）**：仍钉在上游的类名与子元素顺序上；而本次的事实恰恰是**官方把标题的类名拿掉了**。
- **类名无关的结构降级（失手时隐藏 hero 行所有文字叶子）**：失手时不知道哪个是角标，可能把 `预览版` 一起隐藏。已经有门禁与实况验收挡住那种状态，不值得用「隐藏不该隐藏的东西」去换。
- **让门禁调用插件自己的解析器**：自证式断言。
- **把包测试接进 `pnpm run gate`**：会改变「门禁对所有包意味着什么」，单独决策（本轮只把**锚的解析**接进去）。
- **删掉 release 历史版本目录**：前置是「仓库外归档持有同一份 DMG」，核对结果**否定**（归档里只有上游基座 DMG），因此一个未删。

## Consequences

- 门禁 `plugin-ui-anchor-drift` 红→绿两次读数都留档：修复前 `[expected=8, checked=4, failed=4]`（两个产物各两条，原因可区分）；修复后 `[checked=1, failed=0]`（staging 退役后只剩装机 app 一个面）。
- 整门：`ok 87/90 项通过（mode=quick，跳过 3；objects: expected=2305, checked=2144, skipped=161, failed=0）`，退出码 0。
- 插件测试：`22 passed / 0 skipped`（修复前 9 passed / 5 skipped）。
- 实况验收：`root-brand-live-anchors.mjs` **21/21 PASS**（真实 Chromium + 本机官方 CSS，含「结构不唯一时不猜」「卸载还原」）。
- 磁盘：staging 构建树 5.1G → 164K（`.freeze-*` 指纹与装配日志保留，它们被 ADR-0073 引用）。
- **已知边界**：包测试不在门禁与 CI 射程内（只在 `pnpm --filter dsh-root-brand test` 下跑）——这是下一项独立决定。
- **未验证**：没有 commit / push；没有重装 DMG 做端到端验收；`hero.headline` 的文案依赖由测试守住，不进 `ui-anchors.json`（清单只管类名）。
- **未做**：release 历史版本目录、profile/app 备份的清理（前置结论见上）；`packaging/staging/` 之外的残留未动。
