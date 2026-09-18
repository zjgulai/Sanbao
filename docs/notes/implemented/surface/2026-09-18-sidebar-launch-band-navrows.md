# 启动带去按钮化：侧边栏最重的两个入口降级成两条同轴导航行

- 日期：2026-09-18
- 状态：implemented（P0；P1–P3 未开始）
- 对应 ADR：[ADR-0124](../../../adr/ADR-0124.md)
- 相关：ADR-0079（同列同行轴与「清单即判据」，本条把射程扩到官方行并退役它豁免的 `split` 列）、
  ADR-0032（`position` 三态的第一个消费方）、ADR-0019（官方 UI 改写锚禁止钉哈希）、
  ADR-0078（改完怎么生效：本条生效同样要重启应用）、总账 P-02（仪器假绿）/ P-07（一条事实多个家）

## Problem

用户的诉求是两句具体的话：「将 左边侧边栏的 新会话 和 新应用 统一调小，颜色也不搭」。
取证后，两个现象各有物理成因，**都不是尺寸问题**：

**一、视觉权重倒挂。** 官方「新建会话」是这条列上最重的元素——38px 高、抬升底色、
`.5px` 边框、14px/500 字重、6px 内距、内容居中；而同一列的会话行与工作区行都是 30–36px 的
**无壳文本行**。全列使用频率最低的两个动作（启动动作）扛着最重的形态。

**二、「颜色不搭」是双轨色系的症状。** 官方按钮走 neutral 系
（`--dsw-alias-button-elevated-fill` + `--dsw-alias-border-l3`），自建「新应用」行走 `--lute-brand`
品牌绿实底。同一列里两套色系各管一段，且没有任何一处规定这一列的颜色该由谁管。

**三、参照面。** 实测四款同类产品（Codex 随 `/Applications/ChatGPT.app` 分发 v153.0.8010.36、
Qoder CN、Minimax Design、Accio）：**四款的启动动作全是 chrome-free 文本行**，行距 30–38pt；
侧边栏宽**实测 252–280pt、DSH 279pt**（原文估算 175–300pt / 350pt，2026-09-18 证伪）。「按钮形态」在这类产品里没有先例。

## Decision

用户在看过研究与五条方案（spec.md D1–D5）后下令「同意 开始 P0」，并追加一条前提：
「可以换 slot/结构选择器方案，**保持和基座模型的兼容性是前提**」。P0 落地的是
「**把两个启动入口从按钮降级成行**」，交付如下。

> **2026-09-18 订正**：上文「逐条批准」是记录时的高估——「同意 开始 P0」是 P0（启动带）的口头放行，
> 不是对 spec.md D1–D5 的逐项签字（用户本轮指出「还没形成统一的共识方案」，证伪了这个措辞）。
> 四带与编号的逐项裁决见 `.scratch/sidebar-research/N1-decision-ticket.md`（S/T 十项），冻结在
> [ADR-0125](../../../adr/ADR-0125.md)。

**代码（3 个包 + 1 份共享源）**

1. `shared/client/sidebar-entry-core.ts`：删 `applySplitGeometry()` 与 `SPLIT_COLLAPSED_LIMIT`；
   核心只写/撤 `data-lute-navrow` 标记，**不写任何内联几何**。收起阈值常量保留 60px
   （导出名 `STACKED_COLLAPSED_LIMIT`）。生成副本由 `node scripts/sync-shared.mjs --write` 同步（20 份）。
2. `packages/surfaces/dsh-newapp-local/src/client/sidebar-entry.ts`：`position: 'stacked'`。
3. `.../newapp.module.css`：新增官方按钮的属性锚规则
   `button[class*="newSession"][data-lute-navrow]`（去壳 + 行轴 + `font: var(--dsw-font-xs-13)`）、
   其 `:hover`、`svg{width:24px;height:24px;padding:3px}`，以及自建行的
   `.entry[data-split='collapsed']` rail 度量（36×36）。分组品牌 token 块保留（D6：行本身不用品牌实底）。

**判据（本条最可复用的部分）**

4. `scripts/gates/sidebar-row-axis.mjs`：注册表 newapp 行 → `position:'stacked'` / `column:'nav-band'`；
   列注册表 `logo-split` → `nav-band`（轴 = `border-box` + `width:100%` + `margin-inline:0` +
   `padding-inline:10px`）；新增 `RESTYLED_SHELL_ROWS` + 判据四扫描**被插件改写的官方行**。
5. 同文件的 `ruleBody()` 修掉一个真实缺陷：分组选择器续行（`.root,\n.entry {`）会被误读为
   `.entry` 的声明块（负向后顾 `(?<!,)` 挡住：只有**行首**的选择器才是某条规则自己的选择器），否则判据会在错误的一段文本上判绿。
6. `scripts/gates/sidebar-row-axis.test.mjs` 18 条自测，新增 4 条：分组选择器续行、
   改写规则轴漂移、核心停止写标记、属性锚改名——**每条都是「实现坏掉时必须判红」的反向自测**。

**测试与探针**

7. `packages/surfaces/dsh-role-matrix-local/tests/sidebar-entry-stacked.spec.ts`
   （`git mv` 自 `sidebar-entry-split.spec.ts` 并重写）：断言标记写入/撤回、60px 阈值排他性、
   无内联样式、卸载还原。
8. 删除 `packages/surfaces/dsh-newapp-local/tests/sidebar-entry-split.spec.ts`：它与上一条
   是对同一份逐字节副本（`sync-shared` 守）写两遍契约，属 P-07。
9. `scripts/geometry-probe.mjs`（真实 Chrome 布局探针）与 `scripts/reconcile-probe.mjs`
   （真实 React 18 环境探针）随契约更新，**并修掉两处「把环境当常量」的缺陷**（见 Consequences）。

## Alternatives considered

1. **只调小按钮尺寸**（38px→30px、14px→13px）。否决：形态差异才是成因，缩小后的圆角实底块
   仍是这条列唯一的「按钮」，四款参照产品在启动位上没有按钮。
2. **保留按钮但两处都用品牌绿**。否决：会让这条列成为品牌色最重的一块，与「品牌色只做状态」相反，
   且深浅两主题都要重算对比度。
3. **把两个启动动作收进「工作台▸」折叠组**。否决（对 P0）：新建会话是一级动作，收起来等于
   首屏少一条最重要的路。折叠组方案留给 P1，用来收任务板/SSH/技能中心/岗位矩阵。
4. **两行统一 30pt**。否决：与同列既有两行（36px）脱族，且 ADR-0079 的行轴判据会当场判红——
   要动就得三行同改，另立决策。
5. **给 newapp 保留一份 stacked 契约测试**（而不是删）。否决：同一条事实两个家（P-07）。

## Consequences

**验证证据（均为真实执行读数）**

| 仪器 | 读数 |
|---|---|
| `scripts/gates/sidebar-row-axis.test.mjs` | `tests 18 / pass 18 / fail 0` |
| `geometry-probe.mjs`（真实 Chrome） | **33/33**；官方按钮 `border=none` `bg=rgba(0,0,0,0)` `radius=8px` `justify-content=flex-start`；两行同 36px / 同宽 256px / 同左缘 12px / 标签同偏 42px；启动带行进量 40+40=80px，工作区下移 34px，`region` 574→540 等高吸收 |
| `reconcile-probe.mjs`（真实 React 18.3.1） | **31/31**；含 S3 换节点后标记重施、S5 收起/展开撤立、S7 卸载后 `cssText=""` |
| `packages/surfaces/dsh-newapp-local` vitest | `Test Files 15 passed` / `Tests 173 passed` |
| 三个包构建 | `tsdown` 退出码 0（`lib/client.js` 与类型声明重建） |
| `pnpm run gate`（quick） | 修掉 `profile-bundle-sync` 的 6 条装载点漂移后复跑 |

**两个在本次取证中暴露的仪器缺陷（都已修，且是同类根因）**

1. **探针把「包布局」当常量。** `geometry-probe.mjs` 与 `reconcile-probe.mjs` 都硬编码了
   `Contents/Resources/app.asar.unpacked/…`；文档摘要早把这条路记成「存在」，但实际包布局已变成
   `Contents/Resources/app/node_modules/…`（文档与探针同时过期）。两处改成候选列表（新路径优先、
   旧路径兜底、全都不在则大声退出 2），而不是改成一个新的硬编码常量。
2. **探针把「类名哈希形状」当常量。** 侧边栏样式表的提取正则钉死了 `x-` 前缀的哈希形状
   （`/"(\\.x-[A-Za-z0-9_-]+_root\\{…/`），而 2.0 重建去掉了 `x-` 前缀，于是探针报
   「在官方 bundle 里定位不到侧边栏样式表」——**这是一条诚实的失败**（它没有降级成绿），
   但仪器的射程因此归零。改为两种形状都认。
3. **夹具没冻结动效，量到的是中间态。** 行规则带 `transition: background 180ms`，探针挂载后立刻
   读 `getComputedStyle().backgroundColor`，读到的是**从挂载前底色插值出来的中间值**
   （`rgba(0,0,0,0.03)` 而不是 `rgba(0,0,0,0)`），而 `border`/`radius` 没有 transition 所以当场
   就是终值——两者不同步，看起来像「改写的规则只生效了一半」。这正是 P-02 的形态：**判据没错、
   实现没错，读数在时间维度上错**。夹具改为全局冻结 `transition/animation`，因为在这里被测的是
   几何与终态样式，不是动效。
4. **一条断言的前提被上游样式表改掉了。** 旧断言「容器总高同幅增加」假设侧边栏 root 随内容长高；
   2.0 的 root 是 `height:100%`，于是它恒等失真（700 → 700）。改为断言**补偿机制**：
   `flex:1` 的 `regionArea` 等高收缩 34px。**断言的前提属于上游样式表，前提没了就得重写判据，
   而不是放宽容差让旧判据继续绿。**

**残余风险 / 未完成**

- 「改写官方行」现在依赖 `newSession` 类名存活；基座升级改名会让改写**静默失效到看起来还行**。
  D5 的断言只保证「锚写在核心源码里」，保证不了上游类名不变。
- 生效需重启应用（ADR-0078）：装载点已按 tmp+mv 同步，**真实应用内的浅色/深色截图尚未取**
  （重启会中断当前会话，留给用户重启后复核）。
- ~~侧边栏宽度 350pt → 280/290/300pt 三选一**未决**~~ —— **2026-09-18 作废**：实测 279pt ≈ 基座契约默认 280，DSH 不在参照带之外，「收窄」这个需求不存在。原前提是截图文范围估算。
- P1（「工作台▸」折叠组、砍 `99+` 徽标）、P2（置顶区、搜索行、工作区次级信息）、
  P3（系统带、四带契约 + 门禁）**均未开始**。
- 同步装载点时另外 3 个包（`@etony668/dsh-task-board`、`dsh-overseas-skills`、`dsh-wanzh-hulian`）
  也存在产物漂移——它们是别的工作流已构建但未同步的产物，本次只推产物、**未改其源码**。
