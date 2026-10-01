# WT-02D.0.1 · main-owned `/.sage/*` route skeleton 设计

- 日期：2026-10-01
- 状态：设计已与用户对齐（五项裁决 A/A/A/A/A）；待用户审阅本 spec 后进入 writing-plans
- 上游合同：[WT-02D Application Service 边界（revision 37）](../../notes/proposed/architecture/2026-09-30-application-service-boundary.md)、[ADR-0174](../../adr/ADR-0174.md)
- 前置预检：[ADR-0175（route preflight，rev 38）](../../adr/ADR-0175.md)、[ADR-0176（IPC/preload，rev 39）](../../adr/ADR-0176.md)、[ADR-0177（single-frame，rev 40）](../../adr/ADR-0177.md)、[ADR-0178（帧禁用不变量）](../../adr/ADR-0178.md) 全部 PASS

## 1. 问题

revision 37 已把 Application Service 的边界、authority 顺序和失败语义定死，但源码一行未写：`/.sage/state` 与 `/.sage/actions` 仍由 Host 子进程的 `createSageCapabilityHandler`（`src/adapter/handler.ts`）响应。projection-read 是泄漏真实经营数据的风险路径，action 是跳过 Identity/Policy 的正门。WT-02D.0.1 是唯一编排边的第一笔源码：把 `/.sage/*` 精确截在 Electron main，以 unavailable-first 骨架启动，并用机器可判定的方式守住进程边界。

## 2. 已确认决策（五项裁决）

| # | 裁决 | 内容 |
| --- | --- | --- |
| D1 | 回滚门 | main 截获 + `SAGE_APP_SERVICE=off` 环境开关回退（默认 on）。off = 显式维护态：`/.sage/*` 原样转发 Host 旧路径。回归 = 开关两态各跑 contract 测试。Host 旧 handler 0.1 期间暂留，删除属 WT-02D.1 收口 |
| D2 | 内核形态 | 纯函数内核 + 注入 ports，新目录 `src/appservice/`，**不 import Electron**；`main/index.ts` 只做接线。单测 `node --test`（sage-shell 现有 runner） |
| D3 | state 合同 | 新 `service` 字段（`unavailable` + 可枚举 reason + opaque correlation）**内嵌** P0-2 runtime availability 字段（main 投影 `ShellHostActiveRuntimeSnapshot`）。renderer 现有消费不破 |
| D4 | caller binding 深度 | 0.1 落 origin 校验 + `verifyCaller` port 的**接线位**（复用 main 已有的 FramePolicy generation 状态做单帧事实检查）；完整逐步重验（command 顺序 1–10）属 0.2。binding 失败 = 403，成功 → 继续到 unavailable 响应 |
| D5 | import firewall | 静态 import 扫描测试（断言 `src/appservice/**/*.ts` 不 import electron/renderer/Cordis/MCP plugin/packages/vendor）**注册进 `pnpm run gate`**：新 gate 项 `sage-appservice-import-firewall` + selftest 负例（总账 P-03：知道≠拦住） |

## 3. 组件设计

```text
apps/sage-shell/src/
├── appservice/                    ← 新（D2：零 Electron import）
│   ├── route-skeleton.ts          入口分发：method/content-type/body-budget/未知路径
│   ├── composition.ts             provider 注入表（0.1 全 undefined）→ unavailable-first
│   ├── errors.ts                  可枚举错误类别 + 脱敏（revision 37 §8 的子集）
│   └── contracts.ts               SageServiceStatus / ServiceUnavailableReason / CallerBinding 类型
├── main/
│   ├── appservice-binding.ts      ← 新：verifyCaller 接线（origin + 单帧 generation 检查）
│   └── index.ts                   改：protocol.handle 分流 /.sage/* → appservice（on）| host（off）
└── adapter/handler.ts             不动（off 态回退目标，删除属 0.1 之后）
```

### 3.1 route-skeleton.ts（纯函数）

`handleSageServiceRequest(request, deps): Promise<Response>`

- deps = `{ callerBinding: CallerBinding | null, providers: ServiceProviders }`——main 接线时注入，单测直造。
- 校验链（照 revision 37 §5 步骤 1 的骨架子集）：callerBinding 为 null → 403；method 不符 → 405 + allow；content-type 非 JSON → 415；`content-length` 超 `MAX_SAGE_ACTION_BYTES`（沿用 4KiB）→ 413；流式 body 超限 → 413；未知 `/.sage/*` 子路径 → 404。
- 校验通过后**不执行任何业务**：state → `providers.readState()`；actions → `providers.dispatch()`。composition 提供 unavailable-first 实现（见 3.2）。schema 校验（parseRetryIntent 同型）保留：未知 action intent → 400 `invalid-intent`（可枚举错误类别的第一次落地）。

### 3.2 composition.ts

`createUnavailableFirstService(runtimeSnapshot): ServiceProviders`

- `readState()`：返回 `{ service: { status: 'unavailable', reason: 'identity-unavailable', correlation }, runtime: <P0-2 形状> }`。reason 固定 `identity-unavailable`——0.1 唯一真实缺项是 Identity/Policy provider（其余 provider 装配后 reason 由 0.2 的求值链产出）。
- `dispatch()`：503 + `{ error: 'identity-unavailable', retryable: false }`（revision 37 §8：稳定、脱敏、可枚举）。
- **禁止 placeholder**：不构造空 digest、默认 matrix、假 authority；provider 恢复只允许下一次新鲜求值（本票无恢复路径，合同先行）。
- runtime 投影：main 把 `ShellHostProcess` 的 snapshot 传入（available → P0-2 ready 形状；unavailable → reason 映射）。此为 D3 的「内嵌」实现位。

### 3.3 errors.ts

可枚举类别（0.1 落三类）：`invalid-intent`（400）、`identity-unavailable`（503 state/actions）、403/404/405/413/415 transport 层。每类只携带 `stage/retryable/correlation`；禁止 raw exception、stack、path、provider payload（负例测试断言错误体不含 `stack`/`message` 键）。

### 3.4 main/appservice-binding.ts

`verifySageServiceCaller(url, request, framePolicy): CallerBinding | null`

- 复用 `isExactSageAppUrl` + origin 校验（自 `adapter/handler.ts` 的 `isTrustedSageRequest` 迁移语义，实现留在 main 侧）。
- 单帧事实：检查 FramePolicy 当前 generation 非 contaminated 且该请求来自唯一 trusted window 的 current main frame（0.1 用 `window.webContents.mainFrame` 等价事实；rev 40 的完整 senderFrame 校验属 0.2 的 command 路径）。
- 返回 opaque `CallerBinding`（`{ correlation }`）——不含 frameId/processId 等 transport identity（revision 37 §7：transport identity 不进 durable namespace）。

### 3.5 main/index.ts 接线

```ts
protocol.handle(SCHEME, (request) => {
  const route = routeSchemeRequest(new URL(request.url))
  if (route.target === 'reject') return 404
  const url = new URL(request.url)
  if (appServiceEnabled && url.pathname.startsWith('/.sage/')) {
    return appService.handle(url, request, { framePolicy, hostSnapshot })
  }
  return host.fetch(request)
})
```

`appServiceEnabled = process.env.SAGE_APP_SERVICE !== 'off'`（启动时读一次；运行中不变——与探针实证的「settings 不热加载」一致，环境语义同理）。

## 4. import firewall（D5）

- `scripts/gates/sage-appservice-import-firewall.mjs`：递归读 `apps/sage-shell/src/appservice/**/*.ts` 源码，正则扫描 import/require 来源，命中即判红：`electron`、`../renderer`、`../product/component-renderer`、`../product/renderer`、`cordis`、`packages/`、`vendor/`、`node_modules`。空射程（目录无文件）判红（分母=0 不是绿，总账 P-02）。
- `scripts/gates/sage-appservice-import-firewall.test.mjs`：负例——在 fixture 目录写一个含 `import { app } from 'electron'` 的假文件，断言 checker 判红；写干净文件断言绿；空目录判红。
- `scripts/gate.mjs` 注册两项（仿 `sage-product-boundary` 的注册对形态）：`sage-appservice-import-firewall`（阻塞）+ `-selftest`。
- 正例文件本身（`src/appservice/*.ts`）天然是绿样本——0.1 实现完成即自证。

## 5. 测试设计

| 面 | 测试 | 断言要点 |
| --- | --- | --- |
| route-skeleton | `test/appservice-route-skeleton.spec.ts`（node --test，纯函数直调） | 403/405/415/413/404/400 六类拒绝 + 通过后走 provider；body-budget 流式截断 |
| composition | `test/appservice-composition.spec.ts` | unavailable-first：state 含 `service.status='unavailable'` 与 `reason='identity-unavailable'` 且 **runtime 字段形状 = P0-2**；dispatch 503 + 脱敏错误体（无 stack/message 键） |
| binding | `test/appservice-binding.spec.ts` | origin 不符 → null；合格 origin + clean generation → non-null；contaminated generation → null（FramePolicy stub） |
| 回归（on 态） | 现有 `product-state.spec.ts` / `view-state.spec.ts` / `route.spec.ts` 不改断言全绿 | 「当前 `/.sage/*` contract 回归」验收 |
| 回滚（off 态） | `test/appservice-fallback.spec.ts` | `SAGE_APP_SERVICE=off` 时 main 分流回 host.fetch（对 host 的 stub 断言被调用）；on 时 appservice 被调用（正反两态都测——不会红的检查不是检查） |
| firewall | gate 两项（§4） | 判红能力负例 + 空射程判红 |
| 既有全量 | `pnpm run gate`（23→25 项）+ sage-shell test 全绿 | L4 回归 |

类型合同：`SageServiceStatus` 等类型进 `appservice/contracts.ts`，与 `product/contracts.ts` 的 P0-2 类型并列（renderer 侧 import 类型允许——firewall 只禁 main 侧实现依赖，类型是合同的一部分；正则是 `from '../renderer|component-renderer|renderer.js'` 这类实现路径，`product/contracts` 的类型 import 在允许清单）。

## 6. 明确不做（票面边界，revision 37 §9）

- 无 live BusinessMatter action、无真实 provider、无插件启用。
- command 固定顺序的步骤 2–10（Identity/Policy 求值、strict rehydrate、target、Compatibility、Registry、idempotency/receipt）——0.1 只有步骤 1 的骨架与稳定拒绝。
- Host 旧 handler 删除、`/.dsh`/`/.sanbao` 路由调整——不在射程。
- fixture/blocked E2E（WT-02D.1）；production command（WT-02D.2）。

## 7. 验收（revision 37 §9 WT-02D.0.1 行）

1. 当前 `/.sage/*` contract 回归：on/off 两态下既有 product-state/view-state/route 测试全绿。
2. 缺 provider 全部 fail closed：state 返回 `service.status='unavailable'` + `identity-unavailable`；dispatch 503；无 placeholder（脱敏断言）。
3. Host 只剩窄 port：on 态下 `/.sage/*` 不进 host.fetch（fallback.spec 断言）；`routeRequest` 在 Host 内对 `/.sage` 的分支保留仅服务 off 态。
4. 无 fixture production fallback：composition 无任何 fixture 注入口（providers 只能由 main 接线注入真实 snapshot）。
5. import firewall 由门禁守住：`pnpm run gate` 含两项新 gate，负例可红。
