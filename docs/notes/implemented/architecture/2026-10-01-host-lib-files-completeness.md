# HOST_LIB_FILES 补全与 host live 启动恢复

日期：2026-10-01 · 分类：architecture · 关联 ADR：[ADR-0180](../../../adr/ADR-0180.md)

## Problem

`src/profile/layout.ts` 的 `HOST_LIB_FILES` 注册表自 `7bf1d91` 起缺三个文件：`product/component-renderer.js`、`product/view-state.js`、`product/action-preview.js`。`product/renderer.ts` import `./component-renderer.js`，导致每次重新 materialize 的 generation 缺该文件，host 子进程启动即 `ERR_MODULE_NOT_FOUND`。叠加盘上旧 generation（`bee8a015`）物化自旧 lib、发 protocol v3 `ready`（当前 lib 期望 v4）判 `invalid IPC event`，结果：任何 generation 都无法 live 启动——WT-02D.0.1 的 on/off 两态实弹验收（验收 2）被迫退回 fallback.spec 断言，`npm run smoke` / `npm run dev` 同败。

根因属总账 P-04「写了但从没跑到」家族：`renderer.ts` 拆出 `component-renderer.ts` 时，`HOST_LIB_FILES` 注册表与编译输出之间没有任何对拍守卫，清单漂移静默发生。

## Decision

1. `HOST_LIB_FILES` 补登 `product/view-state.js`、`product/action-preview.js`、`product/component-renderer.js`（按依赖序：`component-renderer.js` 依赖前两者）。
2. 新增对拍守卫测试（`test/layout.spec.ts`「registers every built host-scope file from lib output」）：递归枚举 `lib/{host,product,adapter}` 全部 `.js` 编译产物，与 `HOST_LIB_FILES` 逐名双向对拍（漏登、多登均判红）。`profile/paths.js` 与 `protocol.js`（位于 `lib` 顶层/`lib/profile`，不在三个目录内）以显式白名单加入。该守卫使注册表漂移从此在 CI 层被拦住——机制取代纪律。
3. 不清理盘上三个旧 generation（`bee8a015` / `a20738b4` / `2d1b09f9`）：materialize 的指针语义是原子切换新 generation，旧 generation 留待 `runtime-artifact-attestation` 既有保留策略处置，本票不碰用户数据侧清理。

## Alternatives considered

- **只补清单不加守卫**：本次红即证明清单会漂移且静默——同型缺陷会复发（P-04 家族特征），拒绝。
- **守卫放 gate（mjs 层）**：tsc 编译输出只在 `apps/sage-shell` 内可预期存在，gate 层跑会耦合构建状态；vitest 守卫与 `node scripts/test.mjs run` 同批执行，覆盖同一提交面。
- **手动把三个文件拷进现有 generation**：generation 是不可变物化产物，手补破坏 manifest/digest 绑定（`runtime-artifact-attestation.json` 会失配），正确路径是修清单 + 重新物化。

## Consequences

- **host live 启动恢复**：新 generation `d73e1195` smoke 18/18 全 PASS——protocol v4 ready、generation/manifest digest 绑定、`/.sage/state` / `/.sage/actions` 实弹、路径遍历 403、干净关停（exit 0）。WT-02D.0.1 验收 2 的退回理由（「任何 generation 无法 live 启动」）已消除。
- 用户数据侧：active profile 指针切至 `d73e1195`（本次物化），与 2d1b09f9 一样是诊断/修复期间的正常切换，旧 generation 未删。
- `layout.spec.ts` 现依赖真实 `lib/` 编译产物存在（`npm run build` 后）；未构建的全新 clone 上该测试会红（提示先 build）——与仓内既有 smoke/dev 同前置，接受。
