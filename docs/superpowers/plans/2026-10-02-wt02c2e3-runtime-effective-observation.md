# WT-02C.2E.3 执行计划：运行态有效观测（协议 v5）+ E.2 并入（tickets）

> 设计在 [spec](../specs/2026-10-02-wt02c2e3-runtime-effective-observation-design.md)；用户三裁决已录。提交节奏：票末 feat + docs 两批推送；内核 `compatibility.ts` / `capability-registry.ts` / C2B 语义零改动（仅字面量 v5 同步与消费）。

## T1 · 协议 v5 扫掠（机制改造，先行）

- [ ] Step 1：`src/protocol.ts` `SHELL_HOST_PROTOCOL_VERSION` 4→5（**只动版本**，先不动事件形状）。
- [ ] Step 2：跑全量 → 红列清点（version 字面量/门禁/smoke/fixtures 的完整扫掠面）。
- [ ] Step 3：逐项同步：`src/main/runtime-inventory.ts`（snapshot/projection `'4'→'5'`）、`scripts/gates/sage-shell-pin.mjs`（`SAGE_HOST_LIFECYCLE_PROTOCOL_VERSION='5'` + 文案/自测样本）、`scripts/smoke.mjs`（断言与文案）、test fixtures/specs（`test/support/*`、provider/consumption/window 探针）、`src/main/host-process.ts`（若有字面量）。
- [ ] Step 4：绿 + typecheck + 仓根 gate 25/25。

## T2 · host 侧观测 + ready 携带

- [ ] Step 1：写 `src/host/runtime-effective.ts` 单测（红）：缺服务→`registry-service-absent`；抛错→`observation-failed`；非法名册（空/重复/默认悬空）→`invalid-roster`；合法→observed（结构类型，禁 registry 包依赖）。
- [ ] Step 2：实现观察器（`ctx.get('agentPresets')` 结构读取 + 边界自验）；观察器与校验器同源在协议层（T3 复用）。
- [ ] Step 3：`runShellHost` 观测入 controller；`startHostProcess` 把 `runtimeEffective` 并入 `ready` 事件。
- [ ] Step 4：host 面绿（定向）。

## T3 · main 接收：深校验 + store + 端口

- [ ] Step 1：协议校验单测（红）：`isHostEvent` 深校验 `runtimeEffective`（Proxy/getter/多余键/重复 id/双默认/超界字符串全部拒）。
- [ ] Step 2：`ShellHostProcess`：ready 解析后存储；`invalidateSnapshot` 全路径清空；`readRuntimeEffective(): unknown` 端口 + 单测（ready 后可得、invalidated/fatal/exit 后 undefined）。
- [ ] Step 3：typecheck + 定向绿。

## T4 · E.2 并入：默认标记 + 第 8 code + goldens

- [ ] Step 1：provider spec 先改（红）：输入新增 `runtimeEffective` 端口；behavior 文档 `{defaultPresetId, members}`；缺项矩阵加 `runtime-effective-unavailable`（端口失败/默认不在名册）。
- [ ] Step 2：实现：读取置于组装前最后一步；`defaultPresetId ∈ member ids` 校验；`UNAVAILABLE_REASONS` 第 8 条；`src/main/index.ts` 接线真端口。
- [ ] Step 3：fixture/consumption 更新（快照 `'5'`、观测端口、真实分支阶段推导）；goldens 探针实算后重锚（含 v5 引发的 policy 文档变化）。
- [ ] Step 4：全量套件绿。

## T5 · 隔离验收

- [ ] Step 1：`npx tsc` 重建 → 隔离根重物化（v5）。
- [ ] Step 2：`scripts/smoke.mjs` 增补 `runtimeEffective` 断言（observed / default=standard / 4 presets / isDefault 恰一）→ 真机 v5 全绿。
- [ ] Step 3：全量套件 + typecheck + `pnpm run gate`（quick/full/strict 或按现行三层）。

## T6 · 留痕与提交

- [ ] Step 1：ADR-0196 + Note（读数/矩阵重发登记/操作者要点：旧 v4 generation 须重物化）。
- [ ] Step 2：spec 修订：E.2 设计（§2 codes→8、§3 表默认标记、§4.1/§4.4 字面量 v5）、PMAP 设计（默认标记行指向本票）、本 spec 状态去待评审。
- [ ] Step 3：执行计划 Revision 44 + `docs/adr/README.md` 行 + ledger `--write`。
- [ ] Step 4：feat + docs 两枚提交，push origin main。
