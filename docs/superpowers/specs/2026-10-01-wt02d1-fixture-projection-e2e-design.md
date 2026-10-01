# WT-02D.1 · fixture / blocked 只读 E2E 与 route 收口（设计）

日期：2026-10-01 · 状态：设计已获用户确认（R1/R2/R3） · 上游：[ADR-0174](../../adr/ADR-0174.md)（Application Service 边界）、[WT-02D 边界记录](../../notes/proposed/architecture/2026-09-30-application-service-boundary.md)（revision 37 分批门 §9 D.1 行）、[ADR-0179](../../adr/ADR-0179.md)（0.1 route skeleton）、[ADR-0180](../../adr/ADR-0180.md)（HOST_LIB_FILES 对拍）、[ADR-0181](../../adr/ADR-0181.md)（0.2 command pipeline）、[Sage UI 一致性合同](../../specs/2026-09-27-sanbao-to-sage-ui-consistency-contract.md)

## 1. 目标与切片

WT-02D.0.2 之后，main-owned `/.sage/*` 已具备 unavailable-first 骨架与步骤 2–10 typed 管道，但**公开的 matter 投影形状尚未经过任何服务面冻结**，0.1 note 移交的 Host 旧 `/.sage` handler 与 `SAGE_APP_SERVICE=off` 回退仍在（双 owner 残留）。本票交付：

1. **Route 收口**：删除 Host 旧 `/.sage` handler 与 `SAGE_APP_SERVICE=off` 回退，main 成为 `/.sage/*` 唯一 owner（ADR-0174 第 1 条合同兑现）。
2. **fixture 投影槽**：`/.sage/state` 增加 `matter: SageMatterViewState | null` —— 显式 fixture 模式填 `createSageFixtureViewState()`（复用已存在的 UI-02/03 公开 shape，`projectionSource=fixture` 持续可见）；production 缺 authority 稳定 `null`，**不构造 placeholder**。
3. **双层 E2E**：服务级（fixture 开/关、shape、zero-side-effect 端口断言）+ 真实 Electron 实弹（fixture 模式启动 app，经真实协议断言关闭门）。

本票关闭门（[边界记录 §9 D.1 行](../../notes/proposed/architecture/2026-09-30-application-service-boundary.md)）：fixture/live 同 shape、fixture 标识持续可见、production 缺 authority 仍 unavailable、无 store mutation / Adapter invoke。

## 2. 裁决（用户确认）与默认项

- **R1 纯服务端**：本票不做 renderer 改造 —— matter/动作区的 payload 驱动渲染属 UI-01（Wave 24，「UI-01 只在 Application Service public shape 冻结后开始」）。renderer 现有消费不破（matter 槽为响应新增字段，两形守卫与 renderRuntime 不受影响）。
- **R2 并入删除**：0.1 note 移交的「Host 旧 handler 删除」并入本票；`SAGE_APP_SERVICE` off 回退一并退场（该回退实弹从未被真实验证——0.1 验收 2 退回 spec 断言，收口消除「从没跑到」的路径）。回滚靠 git revert。
- **R3 双层 E2E**：服务级测试 + 真实 Electron 实弹（临时 SAGE_ROOT，前后快照断言零写入；真实协议断言 `projectionSource=fixture` 与 `matter` 槽）。
- **默认项（随票落地）**：① fixture 进入机制 = env 显式开关 `SAGE_FIXTURE_PROJECTION=1`（启动读一次，与既有 env 开关同款；production 默认不可达）；② 槽位语义 = `matter: null` 即稳定不可用，`SageMatterViewState.matter` 为必填字段、不允许伪造空 matter。

## 3. 公开 shape 扩展（contracts）

`SageServiceState`（`src/appservice/contracts.ts`）扩展为：

```ts
interface SageServiceState {
  readonly service: ServiceStatus
  readonly matter: SageMatterViewState | null   // 新增：唯一 matter 投影槽
  readonly runtime: SageViewState | null
}
```

- `SageMatterViewState` 复用 `src/product/view-state.ts` 既有公开 shape（schema `sage.matter-view.v1`，含 `projectionSource` / compatibility / authorization / availability / actionability / denialReason 正交轴）——**fixture/live 同 shape** 由此在类型面成立。
- import 方向：`appservice → product/view-state.js` 为**公开契约消费**，不在 firewall 的 `renderer 实现路径` 类（规则射程仅 `renderer` / `product/renderer` / `product/component-renderer`）；本票不新增 firewall 类别，但补一条定向断言测试（fixture 组合不触达 store / adapter 端口）。
- `matter` 为 `null` 时，`service.reason` 维持现有稳定原因；renderer 不消费该槽（R1）。

## 4. fixture 模式（composition）

- `createUnavailableFirstService(runtime, options)` 增 `fixtureProjection?: () => SageMatterViewState`（注入式，main 接线按 env 组装）；`readState` 的 `matter` = 注入则 `fixtureProjection()`、否则 `null`。
- fixture 路径**零 store / 零 adapter / 零网络**：组合对象不含任何 capability、store、resolver port；matter 值只来自纯函数 `createSageFixtureViewState()`。
- fixture 只影响 `matter` 槽：`service` / `runtime` / auth 子对象与 0.2 行为完全不变；`/.sage/actions` 管道不变（仍 retry-only、production 九 port fail-closed → `identity-unavailable`）。
- production（无 env）= `matter: null`，与 0.1 的 unavailable-first 连续；**禁止任何隐式回退**。

## 5. Route 收口（删除清单）

| 面 | 动作 |
| --- | --- |
| `src/main/index.ts` | 删 `SAGE_APP_SERVICE` off 分支；`/.sage/*` 恒走 appservice（main 唯一 owner） |
| `src/appservice/route-skeleton.ts` | `shouldUseAppService(pathname, enabled)` 收敛为 `isSageServicePath(pathname)`（无开关参数） |
| `src/host/index.ts` | 删 `routeRequest` 的 `'sage'` 分支与 `createSageCapabilityHandler` 接线（assets/rejected 保留） |
| `src/adapter/handler.ts`、`src/adapter/capability-adapter.ts`（如确认仅此一处消费） | 删除；相关 spec 删除或改写为收口断言 |
| `src/profile/layout.ts` | `HOST_LIB_FILES` 同步移除已删模块（对拍守卫必须继续绿） |
| `src/appservice-fallback` 相关测试 | `appservice-fallback.spec.ts` 改写为「无开关：所有 `/.sage/*` 恒 main-owned、Host 不再有 sage 面」的收口断言 |

不动的面：renderer（R1）、`/.sage/actions` 传输合同、0.2 管道九 port、frame policy、auth。

## 6. 文件结构

```
apps/sage-shell/src/appservice/contracts.ts        # 扩展：matter 槽
apps/sage-shell/src/appservice/composition.ts      # 扩展：fixtureProjection 注入
apps/sage-shell/src/appservice/route-skeleton.ts   # 收敛：isSageServicePath
apps/sage-shell/src/main/index.ts                  # 接线：env 开关 + 删 off 分支
apps/sage-shell/src/host/index.ts                  # 删 sage 分支
apps/sage-shell/src/adapter/handler.ts             # 删除
apps/sage-shell/src/adapter/capability-adapter.ts  # 删除（如无其他消费者）
apps/sage-shell/src/profile/layout.ts              # HOST_LIB_FILES 同步
apps/sage-shell/test/                              # 服务级测试 + 收口改写 + 实弹 E2E spec
apps/sage-shell/scripts/                           # 实弹 E2E 入口（如需要）
```

## 7. 测试与验收

**服务级（vitest）**：
1. fixture 开：`readState().matter` = fixture ViewState（`projectionSource=fixture`、`actionability=blocked`、`denialReason=fixture-only`）；fixture 关：`matter === null` 且 `service` 语义不变。
2. shape 冻结：fixture 值与 `SageMatterViewState` 校验函数/测试比对（同 shape 断言）。
3. zero-side-effect：fixture 组合对象无 capability / store / resolver 引用（结构断言 + spy 负控）。
4. route 收口：无开关谓词、Host 旧面不存在（host-entry / fallback 改写断言）。

**真实 Electron 实弹**（关闭门唯一证据，扩展既有 real-window probe 模式）：
1. `SAGE_FIXTURE_PROJECTION=1` + 临时 `SAGE_ROOT` 启动真实 app → 经真实协议 `GET /.sage/state` 断言 `matter.projectionSource === 'fixture'` 且 `data-projection-source="fixture"` 在文档中可见。
2. 同一临时根在会话前后做文件快照对比 → **零写入**（store 未被打开/未变更）。
3. 负控：故意让 fixture 路径写一个文件 → 快照断言变红（证明快照真的能红）。
4. 收口后 `npm run smoke` 18/18 与全量测试保持绿；`pnpm run gate` 25/25。

## 8. 不做（边界）

- renderer matter/动作区的 payload 驱动渲染（UI-01）；真实经营数据、live 投影、真实 action、新 intent、插件启用、provider 接线（D.2 及 C 线）；`/.sage/actions` 传输合同扩展；Wave 24 的 UI 技术选型。
