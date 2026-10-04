# UI-DECISION-01 决策包：Sage renderer 技术栈（decided：采用 B）

- 日期：2026-10-04
- 状态：decided（2026-10-04 用户裁决「同意B,P1开工」：采用 B＝React 19＋esbuild＋jsdom；P1 基础设施已授权开工）
- 决策记录：[ADR-0261](../../../adr/ADR-0261.md)（accepted，2026-10-04）
- 范围：UI-DECISION-01（tickets §11 后续顺序第①项）。本包给出决策论证与文件级计划；裁决前「不授权任何代码、依赖或 lockfile 变更」的限制已被 2026-10-04 裁决与 P1 授权取代
- 依据：[UI 一致性合同](../../../specs/2026-09-27-sanbao-to-sage-ui-consistency-contract.md)「UI-01 开工前必须重新确认」与 §6 决策 6、[ADR-0254](../../../adr/ADR-0254.md) D5、批次 7–13 的既有实现事实

## Problem

framework-free renderer 已到 **renderer.ts 7,433 行 + component-renderer.ts 866 行**（内联 client script 与全部 CSS 都在单一模板里）；批次 12/13 的每次视觉改动都要在这份巨型模板内做外科手术，复杂焦点、可组合工作台与后续 13 个 adapt 状态的逐条迁移会持续放大该成本。ADR-0254 D5 已明确：进入复杂可组合或可写工作台前必须重新完成 renderer 技术决策；合同要求「选择 React 及具体版本，或给出不采用 React 的同等可维护方案」，并列出构建工具、package/lockfile、CSP/asset、测试环境的精确文件范围。

## 事实基线（决策用现状盘点）

- **交付链**：`tsc` → `lib/` → `materialize`（`profile/layout.ts` 的 `HOST_LIB_FILES` 17 个文件复制进 profile）→ Host `createAssetHandler` **只服务 `/index.html` 单文档**（其余 404）；文档带 `SAGE_DOCUMENT_CSP`（`default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self'; frame-src 'none'; …`），client script 以内联形式运行——**现制 CSP 已容许内联脚本，这决定了下述"零 CSP 变更"路径可行**。
- **测试栈**：`node scripts/test.mjs run`（Electron 43.3.0 运行时内跑 vitest 4.1.11）＋两套真实 Electron 窗口探针；typecheck `tsc --noEmit`；TypeScript 5.6.3 钉死；`sage-product-boundary` 等 27 项门禁扫描 `src/**`。
- **既有守护**：`/.sage/*` 安全合同、fail-closed 首帧 HTML、单一事实家（ViewState/ActionIntent 只由 Application Service 产生）、`theme-tokens.ts` 唯一 token owner、fixture/projectionSource 边界。
- **现状成本证据**：批次 12（视觉标度）与批次 13（导航六项）都只能通过精确字符串手术完成；评审对模板字面量的历史坑（反引号注释、`\n` 转义、失败构建仍 emit）继续成立。

## Alternatives considered

| 方案 | 结论 |
| --- | --- |
| **A. 继续 framework-free（现状）** | 零依赖/零构建链变更、全部既有守护不动；但 7.4k 行模板继续膨胀，批次 12/13 已实证精细视觉改动成本高，合同判定「不适合 206 状态规模、复杂焦点管理和可组合工作台」。 |
| **B. Sage-owned React + esbuild（推荐，合同方向）** | 组件模型与 Sanbao 原型证据同构、可组合、焦点/状态管理成熟；代价＝新增 5 个依赖（react/react-dom/@types×2/esbuild）＋1 个组件测试环境（jsdom）、构建链加一步。 |
| C. 其他自研组件层（lit/solid 等） | 否决：相对 B 无更低维护成本，且离原型组件模型的证据链更远。 |

## Decision（采用的 B 与合同七项必答）

1. **选型与版本**：`react@19.x`、`react-dom@19.x`；`@types/react`、`@types/react-dom` 随 react 主版本；bundler＝`esbuild`；组件测试环境＝`jsdom`。**各包精确版本在实施票开工时按 registry 现查钉死**（本包不联网锁值；锁定动作属实施票的 Red/Green 范围）。
2. **构建工具**：新脚本 `apps/sage-shell/scripts/build-renderer.mjs`（esbuild JS API），入口 `src/product/app/main.tsx`，**单文件输出**（无 code-splitting、无 dev server、不引入 Vite）；`build` 链＝`tsc` 后运行本脚本把实现产物写回 `lib/product/app-bundle.js`（`.d.ts` 由 tsc 从同形状占位模块产出）；源码侧保留占位 `src/product/app-bundle.ts`（`export const SAGE_APP_BUNDLE = ''`）让 `tsc --noEmit`、vitest 直读与门禁在无构建产物时也成立。
3. **CSP / asset loading（首切片内联，零 CSP 变更）**：bundle 以 `export const SAGE_APP_BUNDLE = "<JSON 转义后的单文件脚本>"` 产出，由 `renderSageDocument()` 把其内联进同一文档；**`SAGE_DOCUMENT_CSP` 与 `createAssetHandler` 均不改**。未来若出现体积/调试需求，另开「服务化」票（届时才动 CSP `script-src 'self'` 与 assets 路由）。
4. **测试环境**：既有 Electron-vitest＋两套窗口探针＋Fake DOM 壳合同测试原样保留为集成/结构层；React 组件级测试新增 `test/product-app/**`（该目录 `environment: 'jsdom'`）；**Fake DOM 不接 React**——逐区迁移期间，真实 Electron 窗口探针是可视/行为主判据，每区迁移必须有探针断言与 1440 截图回看。
5. **token/主题/组件/fixture 边界**：`theme-tokens.ts` 仍是唯一 token owner，React 只消费 `--sage-*`/`--sage-density-*` 与既有 class；不引入 CSS-in-JS 第二色彩/间距家；fixture 边界（`SAGE_FIXTURE_PROJECTION`/stage 选择、source badge、fail-closed 首帧）不动。
6. **`renderSageDocument()` 迁移保真**：最终收缩为「文档骨架＋CSP＋内联 bundle＋fail-closed 首帧 HTML＋挂载点 `#sage-app-root`」；`/.sage/*` 接缝、首帧 unavailability、`data-sage-theme/density` 根属性与严格校验顺序全部保持；迁移期间同一区域**单一 owner**（见下）。
7. **Birdview 文件级计划**：P1 票内同步更新 `.birdview/architecture.json` 的 renderer ownership，并先出文件级计划再动产品源码；本包已给出下述精确文件范围。

## 分阶段迁移（strangler；每区单一 owner；每阶段一个小批）

- **P1 基础设施**（不接管任何现有区域）：依赖＋构建脚本＋占位模块＋挂载点＋守卫 spec（bundle 存在/尺寸上限/无 `eval`）；窗口探针与全量套件保持全绿。
- **P2 事项工作台区（main+rail）**：React 接管该区 DOM；legacy client script 停止写该区（由同一 payload 桥接注入）；工作台全部 id/ARIA/几何断言原样保留（窗口探针逐项回归）。
- **P3「已接线操作面」卡片群**：逐卡迁移（每批 2–3 卡），fail-closed 文案与 id 不变。
- **P4 其余面板**：按六项导航逐面板迁移，legacy 内联脚本退役。

**回滚**：逐阶段单提交可回滚（无运行期开关）；回滚不触碰 ViewState、路由、authority 与 CSP。

## 精确文件范围（P1 首票）

- 修改：`apps/sage-shell/package.json`（devDeps/scripts）、`apps/sage-shell/pnpm-lock.yaml`（现查修正：壳为独立 pnpm 项目，根 `pnpm-lock.yaml` 只承载根包、不改）、`apps/sage-shell/tsconfig.json`（纳入 `src/product/app/**`）、`src/profile/layout.ts`（`HOST_LIB_FILES` ＋`product/app-bundle.js`）、`src/product/renderer.ts`（挂载点＋内联 bundle）、`test/product-app/`（jsdom 环境登记）
- 新增：`src/product/app/main.tsx`（空壳根组件）、`src/product/app-bundle.ts`（占位）、`scripts/build-renderer.mjs`、`test/ui-decision-guards.spec.ts`（bundle 守卫）
- **不动**：`product/contracts.ts`（CSP）、`host/assets.ts`、`appservice/**`、`main/**`、`theme-tokens.ts` 语义、Host bridge 与 `/.sage/*` 全体

## 风险与裁决记录

- 风险：内联 bundle 抬高文档体积（React 19 生产构建预计 gzip 前 ~130–180KB，本地协议一次性加载可接受；体积上限进 P1 守卫 spec）；esbuild/react 供应链需过 `sage-product-boundary` 与依赖门禁；jsdom 与 Electron-vitest 双环境共存需要测试纪律（两类 spec 目录分离）。
- **裁决（2026-10-04，用户短语「同意B,P1开工」）**：① 采用 B（React+esbuild+jsdom），不维持 A；② P1（依赖与 lockfile 变更）就此开工，同日 mint [ADR-0261](../../../adr/ADR-0261.md)（accepted）并执行；③ P2 起点未显式裁决——按本包推荐（事项工作台区）留待 P2 开工前确认。

## Verification（2026-10-04，P1 执行记录）

- 红（三件仪器先落）：守卫 spec 4/4 具名红（`Cannot find module scripts/build-renderer.mjs`、`ENOENT lib/product/app-bundle.js`、文档缺 `id="sage-app-root"`、缺 `src/product/app`）；jsdom 冒烟 spec 红（`Cannot find package 'jsdom'`）；真实 Electron 窗口探针红（`React app did not mount under the strict CSP document`，exit 2）。日志＝`.birdview/evidence/ui-decision-01-p1-2026-10-04/red-*.log`（仓内 gitignore 目录）。
- 绿：依赖按 registry 现查 `-E` 钉死——react/react-dom/@types×2 19.3.0、esbuild 0.28.2、jsdom 30.1.1，全部 devDependencies；`pnpm build`＝tsc＋esbuild，产物 `lib/product/app-bundle.js` 222,131 字节，内联安全三项通过（无 `</script`、无 `eval(`、无 `new Function(`；含 `__SAGE_APP_MOUNTED__`）。
- 聚焦：守卫 4/4、jsdom 冒烟 1/1、fixture 窗口测试绿（探针在 fixture 与 unavailable 两种投影下各断言一次 `reactAppMounted`）。全量：`185 files / 1617 passed / 1 skipped / 0 failed`（P1 前为 183/1612/1）。gate：quick 27/27、objects 84/84、skipped=0。
- 全量首跑 1 红并修复：`layout.spec` 的 host-scope 补集守卫正确拦下 tsc 对 `product/app/**` 的原样 emit（裸运行时 import，故意不物化）——按语义把该子树排除出 host-scope walk 并注释留档。
- 改动未 commit、未 push（等待用户「提交」指示）。

## Consequences

- P1 按批次流程执行（红→绿→全量→探针→截图→gate）；不改任何现有区域的 owner，窗口探针与全量套件保持全绿。
- 依赖只入 `apps/sage-shell` 的 devDependencies（构建期/测试期），不进运行时 profile；精确版本按 registry 现查 `-E` 钉死（壳为独立 pnpm 项目，lockfile＝`apps/sage-shell/pnpm-lock.yaml`）。
- P2–P4 逐区迁移；同一区域单一 owner；每阶段单提交可回滚，回滚不触 ViewState、路由、authority 与 CSP。
- 未决：P2 起点确认、完整 Qoder UI/UX 13 个 adapt 状态的逐条迁移（继续按一致性合同推进）。
