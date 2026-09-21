# Deep Research：产物同步基线与终审修复

## Problem

[DA-07 源码拆分](2026-09-21-research-view-separation.md) 以已有 SOURCE 为保真对象，但旧 `lib/client.js` 并非该源码的最新产物。真实构建激活了尚未出货的入口、表单与导出行为，不能把整个 diff 归为行为保持。用户明确批准同步当前已提交 SOURCE，同时修复终审发现；决策编号为 [ADR-0156](../../../adr/ADR-0156.md)。

## Decision

### 独立的产物同步基线

- 源码基线为 `274e7932c240c6546f889ccce2f3366cbc21e116`；该提交的 `src/client/index.ts` 已仅注册 `shell.overlay`，在 host 有 `provide` 时提供 `deepresearch-workbench.open`。旧 shipped client 仍注册 `sidebar.footer.action` 与 overlay。当前 entry 源文件保持逐字不变，不重加 sidebar。
- 同步保留现有预算/来源选择、问题增删编辑、Markdown/HTML/mindmap 导出能力。本批不是这些能力的重新设计，也不是旧 bundle 的行为保持重构。
- Host 同步既有源码中的空事件数组守卫、可选 `fetchProviders` 读取、evaluator draft/report 异步写回 catch；这些 Host 源码不改。原动态导入与五个 Typert 产物不变证据继续保留。

### 三项缺陷与对应判据

1. HTML 的 title（TITLE/H1）与 report 在插值前统一转义 `& < > " '`，report 转义后才把换行变 `<br/>`。JSDOM DOMParser 使用纯假 payload，验证 breakout/script/img handler 只成为文本、无可执行注入节点、字面 `&`/`&amp;` 和空行保留；Markdown/mindmap 输出逐字不变。
2. 包内部纯函数 `removePlanQuestion` 对幸存问题删除等于被删位置的依赖，较大索引减一；真实 PlanStep 点击接入该函数。真实 ResearchView 点击及 `api.updatePlan` payload 验证删除 A、B、后置无关 D 三种情况，另验输入数组/对象/依赖数组不被修改。不扩展至原有空问题过滤行为。
3. CSS token 改为 `calc(2147480000 + 1000)` / `calc(2147480000 + 1100)`，保留原意图 2147481000 / 2147481100，不改共享 preset/vendor 或另定层级。`tests/client-artifact.ts` 执行实际 factory，以 stub document 捕获 `style.textContent`，再由 JSDOM CSSOM 解析 token 与固定定位 z-index 消费规则，检查偏移、先后关系及低于 Settings。JSDOM 不计算 custom-property z-index；精确整数由解析出的 calc 操作数相加验证，不冒充浏览器 computed style。

`tests/build.spec.ts` 每次运行真实 manifest build，再执行新 factory/apply，完整提供 React、react/jsx-runtime、UI primitives 三个实际外部模块，断言 overlay-only、可选 workbench 的 open 改变同一 store/路由以及 disposal。共享测试 helper 同时供既有 view 视觉测试使用，数值覆盖由 source 字符串升级为实际 shipped CSS。Host 子进程改用 `scripts/lib/real-node.mjs` 的 command+env，且各导入须打印 `DEEPRESEARCH-IMPORT-OK:<export>`，防止退出 0/空输出假绿。

## Alternatives considered

- 恢复旧 sidebar 或回退已批准能力：偏离用户指定的 SOURCE 基线，不采用。
- 手工修改 lib、改变 Lightning CSS/preset、另选小 z-index：不能证明源→产物链或改变既定层级，不采用。
- HTML 仅移除 script：漏掉 title breakout、事件属性与其它 markup；此导出本就是纯文本排版，应转义全部文本。
- 删除问题仅 filter 或直接清空所有依赖：分别导致目标错位或丢失合法依赖；按原索引映射。
- 顺修 clipboard、轮询 rejection、跨 effect 互斥或 blank-question filtering：不在此次许可范围，原行为保留。

## Consequences

全部操作限定 worktree `agent-general-purpose-ddc7a3f1`，没有提交/推送，没有修改 app/profile、4177 预览、CI/LoopX/沙箱或 pinned base。

### 实际命令与输出（2026-09-21）

包目录 `packages/capabilities/dsh-deepresearch-local` 执行；直接调用已安装二进制，无 pnpm bootstrap。

| 阶段 | 命令 | 实际输出 |
| --- | --- | --- |
| HTML RED → GREEN | `node node_modules/vitest/vitest.mjs run tests/view.spec.tsx --no-cache --configLoader runner -t 'report export'` | RED exit 1：expected 0 injected elements, got 6；1 failed / 1 passed。修复后 2 passed / exit 0 |
| 删除 RED | 同上 `-t 'deleting plan question'` | exit 1：删除 A 的 C dependsOn 实得 `[1]` 而非 `[0]`；删除 B 实得 `[1]` 而非 `[]`；2 failed / 1 passed |
| 删除 GREEN | 同上 `-t 'plan question'` | 4 passed / exit 0，含不可变输入断言 |
| CSS RED → GREEN | `node node_modules/vitest/vitest.mjs run tests/build.spec.ts --no-cache --configLoader runner` | RED exit 1：CSSOM 实得 `2147480000`，应为 `calc(2147480000 + 1000)`；factory/apply、Host 导入及 Typert 比较已执行。修复后 1 passed / exit 0 |
| 旧产物负对照 | 同上，临时只把 materializeClient 输入替为 `git show HEAD:…/lib/client.js` 输出 | exit 1：expected `shell.overlay`, received `sidebar.footer.action`；未修改产物，之后恢复测试为新 build 输入 |
| 强制编译与构建 | `node node_modules/typescript/bin/tsc -b --force --pretty false && npm run build && npm run verify` | exit 0；client 421.34 kB / map 798.07 kB / host index 110.39 kB / invariant 0.59 kB |
| 全 research suite | `node node_modules/vitest/vitest.mjs run --no-cache --configLoader runner` | 8 files / 84 tests passed / exit 0 |
| ADR 账本 | `node scripts/gates/adr-agent-records.mjs --write` 后同脚本检查（仓库根） | PASS：156 篇 / 35 篇有块 / 121 历史豁免 / 183 条 decision，豁免未增加 |
| 文档与解释器 | 直接调用现有 checkAdrIndex / checkAdrNoteLinks / checkDocsLinkIntegrity / checkPitfallsPlaybook / checkNodeInterpreter | 均 passed=true / violations=[]；node-interpreter 扫 273 脚本，另单独扫描 build.spec.ts 无违规；Note 四段齐全 |

补充类型检查使用 TypeScript API 加载 client files/options、仅在内存加入 tests/Node 类型并 noEmit，不改配置。
新的 build.spec.ts + client-artifact.ts 为 **0 diagnostics**。加入整份 view.spec.tsx 后有 **7 条存量诊断**：
旧 delete fixture 两处缺 deleted、旧残缺 question/scout fixture 三处、theme 包缺 ui-theme 类型两处；
与 `git show HEAD:…/tests/view.spec.tsx` 在同一编译设置下比较，诊断集合完全相同，新增诊断为 0。
首次辅助探针未补 Node 类型且 rootDir 模糊，报 23 条，属于探针设置错误；不计产品编译失败或 RED 证据。

测试 harness 修正不算产品 RED：第一版删除选择器误命中工作区删除按钮、遗漏 payload 的 constraints/depth，修正后才得到上表两条依赖断言失败；build spec 切到 JSDOM 后 import.meta.url 不再是 file URL，改用 import.meta.dirname 后才得到实际 CSS RED。

仍有已登记的 primitives `index.js.map` ENOENT 告警、tsdown external/noExternal 弃用告警与 zod 内联提示；未屏蔽或放宽校验。

最终 client SHA-256：`2a7e00cc710f0384a454882db4f650e0e0dec19ecf7209e8962796cf24c3d6ae`；map：`78d6b47fd18865de08d2fe87a67ee933a7c859273a901b7292f282ba942e90f8`。五个 `lib/typert.*` 与 HEAD 逐字节比较全部相同；完整动态导入由上述带阳性标记的 build 回归继续执行。

### 协调者复验与定向复审

协调者独立复跑最终 research suite **84/84**、强制 TypeScript 编译、`npm run build` 与 `npm run verify`，均 exit 0；保留前述依赖告警。

`node .scratch/da-07-preview/accept-review.mjs` 在实际 Chrome 中加载生成的 `lib/client.js`，使用内存 Remote/slot 适配器，最终 **8/8 PASS**：factory/apply 挂载、三种删题提交依赖、恶意 HTML 仅作文本、编译后两级弹窗的 computed z-index 精确为 2147481000/2147481100、计划→停止→恢复→报告→关闭完整流程、390px 无横向溢出且控制台无错误。构建完成后同一命令再次 8/8。此前同一组输入曾观测到删除前置题/依赖目标、HTML 注入、编译层级四项失败；修复后均关闭。

独立定向复审结论：规格/质量均 PASS，四项先前 Important finding 全部 ADDRESSED，修复差异中无新 Important/Critical 缺陷。产物同步的行为边界遵循用户明确批准，不再声称整个变更是纯重构。

本轮 GitHub CI、Linux 归档锁定与真实 DSH Desktop 仍未验证。此前全仓 full 为 113 pass / 6 skip / 12 fail，记录留在 [DA-07 Note](2026-09-21-research-view-separation.md#协调者验收补证2026-09-21)；这里的局部 GREEN 和复审通过不覆盖该失败记录，也不代表已可发布。修改保留在隔离工作区，未合入主树、未提交或推送。
