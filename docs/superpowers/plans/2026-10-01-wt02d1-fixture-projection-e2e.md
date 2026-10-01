# WT-02D.1 · fixture / blocked 只读 E2E 与 route 收口（实施计划）

日期：2026-10-01 · 关联 spec：[2026-10-01-wt02d1-fixture-projection-e2e-design.md](../specs/2026-10-01-wt02d1-fixture-projection-e2e-design.md) · 上游：[ADR-0174](../../adr/ADR-0174.md) / [ADR-0179](../../adr/ADR-0179.md) / [ADR-0180](../../adr/ADR-0180.md) / [ADR-0181](../../adr/ADR-0181.md)

## 任务分解（串行，每任务红→绿→变异）

**T1 · matter 槽与 fixture 注入（contracts + composition）**
- `contracts.ts`：`SageServiceState` 增 `matter: SageMatterViewState | null`（type-only import 自 `product/view-state.js`）。
- `composition.ts`：`AuthServiceOptions` 旁新增 `fixtureProjection?: () => SageMatterViewState`；`readState` 组装 `matter`。
- 测试：extend `appservice-composition.spec.ts` —— fixture 注入时 `matter.projectionSource==='fixture'`、`actionability==='blocked'`、`denialReason==='fixture-only'`、action 预览全 blocked；未注入时 `matter===null` 且 service 语义与 0.2 不变。
- 变异：槽恒 `null` → 红；伪造非 fixture 值（`projectionSource:'live'`）→ 红（值必须来自 `createSageFixtureViewState()`）。

**T2 · route 收口（main 唯一 owner）**
- `main/index.ts`：删 `SAGE_APP_SERVICE` off 分支（`/.sage/*` 恒走 appservice）；新增 `SAGE_FIXTURE_PROJECTION==='1'` 启动读一次，为真时注入 `fixtureProjection: () => createSageFixtureViewState()`。
- `route-skeleton.ts`：`shouldUseAppService(pathname, enabled)` → `isSageServicePath(pathname)`（删 enabled 参数与其 spec 用例改写）。
- `host/index.ts`：删 `routeRequest` 的 `'sage'` 分支、`createSageCapabilityHandler` 接线与相关 import。
- 删除 `src/adapter/handler.ts`、`src/adapter/capability-adapter.ts`、`test/sage-handler.spec.ts`、`test/capability-adapter.spec.ts`（确认无其他消费者）；`layout.ts` HOST_LIB_FILES 同步删三行（`adapter/contracts.js` 保留与否按实际 import 判定）。
- `appservice-fallback.spec.ts` 改写：无开关谓词恒真（`/.sage/*` 恒 main-owned）；`host-entry.spec.ts`/`layout.spec.ts` 对拍断言随删除面更新。
- 变异：把谓词改回带开关 → 红；Host 分支残留 → host-entry 断言红。

**T3 · 服务级 shape 冻结与 zero-side-effect 断言**
- 新增定向断言：fixture 组合对象结构不含 capability/store/resolver 引用（如 `JSON.stringify(providers)` 无相关键 + 类型面）；`/.sage/actions` 在 fixture 模式下行为不变（dispatch → `identity-unavailable` typed denial）。
- 变异：给 fixture 组合塞一个假 capability port → 结构断言红。

**T4 · 真实 Electron 实弹（关闭门唯一证据）**
- 新增 `test/support/sage-fixture-projection-probe.mjs`：仿 `sage-frame-policy-window-probe.mjs` —— 临时 `SAGE_ROOT`（`mkdtemp`）→ materialize/前置按既有 probe 约定 → 启动真实窗口（`SAGE_FIXTURE_PROJECTION=1`）→ 经真实协议 `GET /.sage/state` 取 payload，读 `#state-*` 文档事实 → 临时根**前后文件快照对比**（路径 + size + mtimeMs + 内容 hash）→ stdout 打 `SAGE_FIXTURE_PROJECTION_RESULT {json}`。
- 新增 `test/sage-fixture-projection-window.spec.ts`：仿 `sage-frame-policy-window.spec.ts`（`tsc --build` 预构建、spawn electron、超时/输出上限、afterEach 清理）。
- 断言：`matter.projectionSource==='fixture'`、`data-projection-source="fixture"`、`service/runtime/auth` 与 0.2 行为一致、快照零新增/零变更。
- 负控：探针支持 `SAGE_FIXTURE_PROBE_MUTATE=1` 让 fixture 路径故意写一个文件 → 同一 spec 断言快照会红（证明快照能红），随后还原。

**T5 · 收口回归与留痕**
- 全量：`npm run test`、`npm run typecheck`、`npx tsc`、`npm run smoke`（18/18）、`pnpm run gate`（25/25，含 import firewall / HOST_LIB_FILES 对拍）。
- 留痕：Note（`docs/notes/implemented/architecture/2026-10-01-wt02d1-fixture-projection-e2e.md`，Problem/Decision/Alternatives/Consequences + 实测读数）+ ADR-0184 + `decisions.json` 再生 + 本 plan 与 spec 入库。
- 提交：代码/测试一批 + docs 一批（提交信息 `feat(sage): …` / `docs(adr): …`），推送需用户授权。

## 验证命令（收口）

```bash
cd apps/sage-shell && npm run typecheck && npm run test && npx tsc && npm run smoke
cd /Users/lute/project/Sage && pnpm run gate
```

## 边界（不做）

renderer 渲染改造（UI-01）、live 投影、真实数据、真实 action、新 intent、插件/provider 接线、`/.sage/actions` 合同扩展。
