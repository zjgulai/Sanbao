# WT-02D.0.1 · main-owned `/.sage/*` route skeleton 落地

- 日期：2026-10-01
- 状态：五任务全部落地并验收（T1 `7bfefa9` / T2 `29ac3dd` / T3 `571a4c4` / T4 `847dceb` / T5 本票）
- 决策：[ADR-0179](../../../adr/ADR-0179.md)
- 相关：[WT-02D Application Service 边界](../../proposed/architecture/2026-09-30-application-service-boundary.md)（revision 37，[ADR-0174](../../../adr/ADR-0174.md)）、[ADR-0178](../../../adr/ADR-0178.md)、设计 spec [2026-10-01-wt02d01-main-sage-route-skeleton-design.md](../../../superpowers/specs/2026-10-01-wt02d01-main-sage-route-skeleton-design.md)

## Problem

revision 37 已把 Application Service 的边界、authority 顺序和失败语义定死，但源码一行未动：`/.sage/state` 与 `/.sage/actions` 仍由 Host 子进程的 `createSageCapabilityHandler`（`src/adapter/handler.ts`）响应。projection-read 是泄漏真实经营数据的风险路径，action 是跳过 Identity/Policy 的正门。WT-02D.0.1 是唯一编排边的第一笔源码：把 `/.sage/*` 精确截在 Electron main，以 unavailable-first 骨架启动，并用机器可判定的方式守住进程边界。

本票（T5）要回答的问题是：五裁决 D1–D5 的实现能否逐条通过 spec §7 的五条验收，并把决策留痕（Note + ADR-0179）与账本再生收口成可提交的一票。

## Decision

五项裁决（设计 spec §2，用户 A/A/A/A/A 拍板）与实现形态：

- **D1 回滚门**：`main/index.ts` 的 `protocol.handle` 分流——`shouldUseAppService(pathname, enabled)` 为真且 `SAGE_APP_SERVICE !== 'off'` 时走 appservice（on 态，默认）；off 态原样转发 `host.fetch`。开关启动时读一次，运行中不变（与探针实证的「settings 不热加载」一致）。Host 旧 handler 0.1 期间暂留，删除属 WT-02D.1 收口。
- **D2 纯函数内核**：`src/appservice/` 四文件（route-skeleton / composition / errors / contracts），零 Electron import，由 D5 的 import firewall 门禁静态守边界；`main/index.ts` 只做接线。
- **D3 state 双字段**：state 响应在 P0-2 runtime availability 字段之外内嵌新 `service` 字段（`unavailable` + 可枚举 reason + opaque correlation）；renderer 现有消费不破（既有 product-state/view-state/route 测试不改断言全绿）。
- **D4 caller binding 接线位**：`main/appservice-binding.ts` 的 `verifySageServiceCaller` 做 origin 校验 + FramePolicy generation 单帧事实检查，返回 opaque `CallerBinding`（不含 frameId/processId 等 transport identity）。binding 失败 = 403；成功 → 继续到 unavailable 响应。完整逐步重验（command 顺序 1–10）属 0.2。
- **D5 import firewall**：`scripts/gates/sage-appservice-import-firewall.mjs` + selftest 负例（fixture 写 electron import 判红、空射程判红），注册进 `pnpm run gate` 两项。gate 23→25 项。

spec §7 五条验收读数（2026-10-01，命令原始输出抄录）：

1. **contract 回归（on/off 两态）**：`cd apps/sage-shell && npm run test` → `Test Files  45 passed (45)` / `Tests  417 passed (417)`；`SAGE_APP_SERVICE=off npm run test` → 同读数 `Test Files  45 passed (45)` / `Tests  417 passed (417)`。
2. **off 态回退**：实弹冒烟（`SAGE_APP_SERVICE=off npm run dev`，30s 观察窗）**未达成 host ready**——但 on 态 `npm run dev` 在同一检查点同样失败（`sage shell: host sent an invalid IPC event`），且不带 electron 的 `npm run smoke` 也失败：根因是**既有物化缺陷**（见 Consequences），与本票改动无关、两态无差异。off 态证据退回 `appservice-fallback.spec.ts`：`off 态：任何 pathname 都不走 appservice（回退 Host）` ✓（3/3 通过，含 on 态正反两态）。禁止伪造实弹读数，如实登记。
3. **fail closed**：`appservice-composition.spec.ts` 4/4 通过——`state 返回 service.unavailable + identity-unavailable + 内嵌 runtime + no-store` ✓、`runtime 缺席时内嵌 null（不伪造 P0-2 字段）` ✓、`dispatch 503 + 脱敏错误体（无 stack/message 键）` ✓、`两次 readState 的 correlation 不同（新鲜求值，无原地抬升）` ✓。
4. **Host 只剩窄 port**：`grep -rn "host.fetch" apps/sage-shell/src/main/index.ts` → 唯一命中 `82:    return host.fetch(request)`，位于 `shouldUseAppService` 早退分支（L74）之后的非 `/.sage` 路径；on 态 `/.sage/*` 不进 `host.fetch` 由 fallback.spec on 态断言守住。
5. **无 fixture production fallback**：`grep -rn "fixture" apps/sage-shell/src/appservice/` → 零命中（grep exit 1）。

终验：`node scripts/gate.mjs` → `25/25 项通过（mode=quick；objects: expected=25, discovered=25, checked=25, skipped=0, failed=0）`，含新增 `sage-appservice-import-firewall` 与 `-selftest` 两项及 adr-index / adr-note-links / adr-agent-records 三项硬校验全绿。

## Alternatives considered

- **直接切换（无开关，出事 git-revert 回滚）**：否决——回滚窗口内 projection/action 已暴露且无运行时护栏；`SAGE_APP_SERVICE=off` 提供显式维护态，回退动作可审计、不必动代码。
- **双写（main 与 Host 同时响应 `/.sage/*`）**：否决——违反唯一 owner（ADR-0174 第 1 条），两套响应会漂移出第二 authority。
- **内核写死 main（`appservice/` 直接 import Electron）**：否决——无法用静态 import 扫描守进程边界，内核退化为不可单测的 main 代码；纯函数 + 注入 ports 让 firewall 有明确射程。
- **独立子进程承载 appservice**：否决——0.1 没有 provider 可隔离，进程边界收益为零；0.2 若引入真实 Identity/Policy provider 再评估隔离，本票不预付接缝成本。
- **binding 完整复刻 rev40 command 顺序 1–10**：否决——0.1 无对手方可验（无真实 command 求值链），完整复刻只能造 fixture 自证；落 origin + generation 接线位，403/继续二值可被 fallback/binding spec 真实断言。
- **firewall 只写测试不进门禁**：否决——「知道≠拦住」（pitfalls-playbook P-03）；不进 `pnpm run gate` 的检查会随时间腐烂，负例 selftest + 阻塞 gate 项才能守住。

## Consequences

- **Host 旧 handler 暂留至 0.1 后收口**：`src/adapter/handler.ts` 与 Host 内 `routeRequest` 的 `/.sage` 分支保留，仅服务 off 态；删除属 WT-02D.1，删除前 off 态是唯一回退通道。
- **caller binding 完整度留 0.2**：骨架期 binding 结果是 403/继续二值；command 顺序步骤 2–10（Identity/Policy 求值、strict rehydrate、target、Compatibility、Registry、idempotency/receipt）未实现，与 revision 37 §9 的分批一致。
- **gate 23→25 项**（+`sage-appservice-import-firewall`、`+selftest`）；decisions.json 经 `node scripts/gates/adr-agent-records.mjs --write` 再生，ADR-0179 机器可读决策块含 D1–D5。
- **既有物化缺陷（本票发现、非本票引入，登记待后续票）**：`src/product/renderer.ts` 自 `7bf1d91` 起 import `./component-renderer.js`，但 `src/profile/layout.ts` 的 `HOST_LIB_FILES` 未登记该文件——重新 materialize 的 generation 缺 `product/component-renderer.js`，host 启动即 `ERR_MODULE_NOT_FOUND`；而盘上旧 generation（`bee8a015`）发出 protocol v3 `ready`（3 字段），当前 lib 期望 v4（6 字段）判 `invalid IPC event`。结果：当前任何 generation 都无法 live 启动（`npm run smoke` / on/off 两态 `npm run dev` 同败），off 态实弹验收因此受阻。本票验收 2 退回 fallback.spec 断言并如实登记；修复（补 `HOST_LIB_FILES` + 重新物化 + smoke 实弹收口）需另票，不混入本 docs 票。诊断期间运行过 `pnpm run materialize`，active profile 已切到新生成 `2d1b09f9`（用户数据侧变更，如实登记；旧 generation 未删）。
- **T4 Minor 遗留**：`main/index.ts` handle 回调内局部 `const runtime = toSageViewState(...)` 遮蔽外层 `runtime`（HostRuntime），语义无害但可读性差；本票为 docs-only 未顺手改（改则须复跑全量测试且归入源码票），留后续源码票一并消解。

## Fix wave（2026-10-01，终审 findings 修复，追加式）

终审返回三条可动 finding，本 wave 一票修复（commit 见 git log；HIGH-2 根 AGENTS.md 更新不在本 wave，留控制器呈报）：

- **HIGH-1 renderer 嵌套解析**：`src/product/renderer.ts` 嵌入 JS 原先假定扁平 P0-2 形状（`labels[state.status]`）；on 态 appservice 返回嵌套 `{service, runtime}` 导致 runtime 卡片永久 fallback。修复为解析层兼容两形：`payload.runtime !== undefined ? payload.runtime : payload`（嵌套 `runtime: null` 时交给 render 的既有 safe-check 落 fallback，不伪造状态）。测试接缝选「真实驱动嵌入渲染路径」：新 `test/renderer-state-parse.spec.ts` 从 `renderSageDocument()` 提取真实 `<script>` 源码，以 DOM/fetch stub 执行，断言嵌套/扁平/`runtime:null` 三形各自的 runtime 文案与 badge/dot 状态——被测对象即出货字符串本身，无重复解析逻辑可漂移。
- **MEDIUM firewall 引号/形态绕过**：Task 1 Minor deferred 的「FORBIDDEN 正则仅匹配单引号 specifier」已消解——`scripts/gates/sage-appservice-import-firewall.mjs` 重写为 specifier 提取式（from / 副作用 import / 动态 import / require 四形态统一提取，引号 `['"]` 归一，再按 electron、`@deepseek-ai/*`、`packages/`、`vendor/`、`node_modules/`、renderer 实现路径分类判红）。selftest 补双引号 from、副作用 `import 'electron'`、动态 `import('electron')` 三条负例及「副作用 import 合法来源不误伤」正例（6/6）。附带修复：旧第二条 renderer 正则实际匹配不了 `'../renderer.js'` / `'../product/renderer.js'`（尾缀 `'\.js'` 错位），新分类规则一并闭合。
- **LOW transport no-store**：`src/appservice/route-skeleton.ts` 的 403/404/405/413/415 统一走 `transportDenial()`，补 `cache-control: no-store`（与 P0-2 adapter 的 `json()` 形态对齐；400/503 经 `serviceJson` 本就带）。route-skeleton spec 相应补 header 断言。
- **不动项**：`parseIntent` 仅 retry 与 `MAX_SAGE_ACTION_BYTES` 双家判定为终审误判/有意（P0-2 现状合同与 Host 侧对称），未改动。

修复后全量读数：`npm run typecheck` 0 error；`npm run test` → `Test Files  46 passed (46)` / `Tests  420 passed (420)`（较 T5 增 1 文件 3 测试）；`node scripts/gate.mjs` → `25/25 项通过`。上节 Consequences 中「T1 Minor deferred 引号绕过」条目自本 wave 起失效。
