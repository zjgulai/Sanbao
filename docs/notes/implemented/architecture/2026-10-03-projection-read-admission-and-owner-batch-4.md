# UI 接线收敛第四批：projection read admission 与 request-scoped owner

- 日期：2026-10-03
- 状态：implemented locally, not committed
- 对应决策：[ADR-0251](../../../adr/ADR-0251.md)
- 范围：READ-01、READ-02；13 条 read-only route 的统一 admission 与读取 owner 收口

## Problem

第三批已经建立显式事项选择、main-owned ActiveContext 和 session-family protected-effect admission，但 authority matrix 中 13 条 read-only route 仍各自直达 provider。读取不会产生外部写入，不代表它没有权限边界：文件候选、会话历史、锚点、终端、artifact、edit diff 与 run log 都可能暴露事项或工作区数据；`/.sage/state` 还是多事项聚合，`/.sage/search` 同时跨事项和全局 session/search。若只保护写路由，Application Service 仍存在一条绕过 projection-read policy 的平行数据路径。

旧 main 还以 `currentMatterRef()` 从“最新 converted draft”推断当前事项。draft recency 是设备级排序事实，不是当前请求的选择、读取授权或 object scope；另一个窗口、列表重排、draft conversion 或一次无关读取都可能让 provider 在调用方不知情时切到另一事项。即便把 13 条 route 机械套进同名函数，只要 provider 仍从这份全局 recency 取 owner，统一入口也会是假绿。

同时，现有 OIDC session、instance-local Organization Policy 与 action resolver 只证明 authentication 和 action grant。当前没有能精确绑定 organization + matter/object + read operation 的 production projection-read policy。fixture、列表可见性、action grant、ActiveContext 旧快照或 provider 存在都不能补这项 authority。

## Decision

### D1 · 13 条 read-only route 统一进入一个 async projection-read admission seam

以下 route 不再各自决定是否可以调用 raw provider，而是统一提交具名 read operation、request candidate 与 main-owned callback，由同一个 admission seam 先核对 caller、request-scoped context/candidate 和独立 read policy，只有明确 allowed 才在受控 scope 内调用 provider。13 条 route 对应 15 个 operation：

1. `GET /.sage/state` → `state.read`；
2. `POST /.sage/workspace/files/candidates` → `workspace.files.list-candidates`；
3. `POST /.sage/workspace/files/reference` → `workspace.files.create-reference`；
4. `POST /.sage/workspace/files/use` → `workspace.files.use-reference`；
5. `POST /.sage/session/history` → `session.history.list | session.history.detail`；
6. `POST /.sage/session/anchors` → `session.anchors.read | session.anchors.locate`；
7. `POST /.sage/session/terminal-read` → `session.terminal.read`；
8. `POST /.sage/search` → `search.query`；
9. `POST /.sage/artifacts/observe` → `artifacts.observe`；
10. `POST /.sage/artifacts/open` → `artifacts.open`；
11. `POST /.sage/artifacts/retry` → `artifacts.retry`；
12. `POST /.sage/edit-drafts/diff` → `edit-drafts.diff`；
13. `POST /.sage/run-log` → `run-log.read`。

顺序固定为 `caller → initial context → independent read policy → fresh scope → candidate match → pre-read freshness → raw read → runtime decode → post-read freshness`。raw value 在 post-read freshness 通过且 token 与 pre-read 一致前不得返回；读期间发生漂移时丢弃已读值。缺 caller/context/policy、provider 抛错、结果畸形或 policy 无法证明 object scope 时统一 fail closed；read 前失败时 raw provider 调用数必须为 0。admission 不把 denied 改成 unavailable，也不从 operation 名推断权限。

### D2 · production 缺 matter/object-bound read policy，统一接线后仍 unavailable-first

本批只关闭 read-only route 绕过统一入口的结构缺口，不铸造真实读取权。production 仍没有能回答“当前 session 是否可对这个 matter/object 执行这个 projection read operation”的 provider，因此所有需要该 authority 的读取在 raw provider 前稳定 unavailable/blocked。

现有 Identity / Policy resolver 的 action request、`external-read` effect class、instance-operator role、事项列表行和 action authorization 都不能被复用成 projection-read allow。fixture 只可在显式 fixture verification 中提供可见状态，不能满足 read policy、不能产生 actor/object scope，也不能成为 production completion evidence。

### D3 · provider 的 current matter 只来自 request-scoped ActiveContext

Electron main 新增 `projectionReadScope.run/current` 所有的 `AsyncLocalStorage` request scope。admission 在一次被允许的 read callback 周围建立不可跨请求复用的 `ProjectionReadScope`；main/index 中需要“当前事项”的 provider 只能读取这个 scope 内已经绑定的 ActiveContext facts。scope 缺失、inactive、candidate 不匹配或请求结束后再次读取都必须拒绝。

`currentMatterRef()` 的“最新 converted draft”推断不再是 read owner，也不得作为 scope 缺失时的 fallback。GET、search、列表排序、draft conversion、Host observation 或上一次请求都不能隐式激活、替换或续借 ActiveContext。ActiveContext 仍只由第三批的显式 selection owner 改变；read admission 只消费 request-scoped snapshot，不写 context。

### D4 · `state` 与 `search` 不能借单一 active matter 越界放行

`/.sage/state` 是多事项和设备级 aggregate，不等于某一个 active matter 的最小 projection；`/.sage/search` 同时跨事项并触及全局 session/search 空间。当前 read policy 尚未定义集合查询、结果逐项裁剪、not-found/denied anti-oracle 和全局非事项数据分类，因此 production 保持二者 unavailable/blocked，不因已有 ActiveContext 或统一 seam 就调用原 provider。production state 只调用专门的 `readBlockedState` 形成不含真实 matter 数据的安全 envelope，不调用 raw `readState`；search 返回既有稳定 `search-unavailable`，不调用 raw search provider。显式 `SAGE_FIXTURE_PROJECTION=1` 是唯一例外：它只为本地 fixture window probe 调用 state projection，并保持 `projectionSource=fixture`、全部 action blocked；这个验证 bypass 不进入 production read authority。

未来若要开放，必须分别给出 aggregate/search policy、query scope、逐对象 authorization/redaction、分页与 anti-oracle 合同；不得把“active matter allowed”扩张成“所有 state/search 结果 allowed”。

### D5 · 入口统一不等于读取功能完成

authority truth 的 13 条 read-only 分母保持不变；本批改变的是它们必须进入统一 admission、缺真实 policy 时 raw provider 零调用。Green 只允许表述为“bypass 已收口且 unavailable-first 可验证”，不能写成“真实事项读取已可用”。本批不引入 dependency、不改 package/lockfile、不进入视觉迁移，也不 commit、不 push。

## Verification

- projection-read admission kernel 定向回归：1 file / 43 tests passed；覆盖 15 个 operation、固定顺序、缺口/异常/畸形 fail closed、read 前零调用、runtime decode、post-read drift 丢弃结果与稳定脱敏错误。
- request-scoped owner 定向回归：1 file / 4 tests passed；覆盖 frozen copy、重叠 async 隔离、nested throw 恢复 outer 与 async reject 后恢复 `undefined`。
- 第四批聚焦组合回归：6 files / 107 tests passed；包含 13 route / 15 operation 的 blocked 与 accepted callback、production runner、fixture/production route、main assembly 与 request scope。
- `apps/sage-shell` 全量：178 files passed；1509 tests passed、1 skipped；`typecheck` 与 `build` 均通过。
- real Electron fixture window：使用仓库 `scripts/test.mjs` Electron harness 定向运行 1 file / 2 tests passed；显式 fixture state 可见、action blocked、Sage root 零写入，negative control 会把 canary 写入判红。
- authority gate 自测：13/13 passed；缺 wrapper、matrix 假登记、main assembly 被替换、request owner 回退为 `currentMatterRef` 都会判红。源码中 `currentMatterRef` / newest-converted-draft read owner 命中为 0（门禁自身的负向字面量除外）。
- 根级 `pnpm run test:gate`：205/205 passed；`pnpm run gate`：27/27 checks、84/84 objects passed，0 skipped / 0 failed；route authority 读数为 58/58，其中 13 条 read-only route 已统一 admission，同时如实保留 25 条 protected-effect bypass violation。
- `docs/adr/decisions.json` 已由生成器重建为 251 篇 ADR、669 条 machine-readable decision；`git diff --check` 通过。以上均是当前 dirty integration worktree 的本地证据，未 commit、未 push。

## Alternatives considered

| 方案 | 结论 |
| --- | --- |
| read-only route 继续直调 provider | 否决。没有外部写入不等于没有数据访问权限；会形成绕过 Application Service read policy 的平行路径。 |
| 复用 action authorization 或 `external-read` grant | 否决。action grant 与 projection read policy 分权，且当前 request/grant 没有 matter/object-bound read scope。 |
| 用最新 converted draft 继续提供 current matter | 否决。recency 是设备级事实，不是 request-scoped selection 或 authority，会在并发窗口、重排和转换后串读。 |
| ActiveContext 一旦存在就允许所有 read route | 否决。context 是已建立事实的协调 owner，不是 standing authority；每次读取仍需 fresh read policy 与 candidate match。 |
| 用 active matter 放行整个 state/search | 否决。二者包含跨事项或全局数据，单对象 scope 不能自然扩张为集合权限。 |
| 把 fixture state bypass 当成 production allow | 否决。显式 fixture 只证明 parser/renderer/blocked UX，不证明 caller、identity、policy 或 object authorization。 |

## Consequences

- 13 条 read-only route 有同一个 admission owner；后续新增 read route 若不登记 operation 并进入该 seam，应由 authority matrix/gate 判为 bypass。
- production 在真实 matter/object-bound read policy 落地前会比旧行为更保守：相关 surface 显示 unavailable/blocked，raw provider 不运行；这是权限收口，不是功能回归修复完成。
- read provider 不再通过 newest converted draft 获得隐式 current matter；它只能在一次 admitted callback 内读取 request-scoped ActiveContext，结束即失效。
- `state` 与 `search` 留在显式 blocked backlog，等待集合级 policy、逐对象裁剪/redaction 和 anti-oracle 合同，不能被单事项 read provider顺带打开。
- 后续真实 provider 仍需完成 caller binding、active session、organization membership/role、matter/object scope、freshness/revocation、timeout、redaction 与 denied/not-found anti-oracle；local identity、fixture、历史 context 与 action grant均不得补齐。
- 本批改动只写入当前 dirty integration worktree，未提交、未推送，也不构成发布或生产验收。
