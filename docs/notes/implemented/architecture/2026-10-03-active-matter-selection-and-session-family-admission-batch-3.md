# UI 接线收敛第三批：显式事项选择与 session-family admission

- 日期：2026-10-03
- 状态：implemented locally, not committed
- 对应决策：[ADR-0250](../../../adr/ADR-0250.md)
- 范围：CTX-01B、CTX-02 安全切片、AUTH-02B、最小显式选择 UI

## Problem

第二批建立了 main-owned ActiveContext 与异步 protected-effect admission，但 production context 默认 inactive，产品没有明确的选择 owner；同时 pending、queue、clarification、edits、plan-mode 与 approval 七组 session-family 写 route 仍可直达 raw provider。若直接用 GET、首次 send、matter link 或最新 draft 激活事项，就会把读取、发送与选择混成副作用；若只把 renderer 的 `matterId`、路径或已登录身份写进 context，又会把 candidate、认证或列表可见性冒充读取授权。

即使 context 曾经合法，identity session、current revision、默认 matter-workspace link、workspace fold 和 FramePolicy 也会在下一次 effect 前漂移。只核对旧 snapshot generation 不能证明当次请求仍有同一身份、事项版本和可信 root。

## Decision

### D1 · 只有显式 POST 可以选择事项，candidate 严格只有两个字段

新增 `POST /.sage/context/select`。body 只接受 `matterId` 与 `expectedContextGeneration`，多字段、畸形值、错误 method/content-type 或缺 caller binding 都在 provider 前拒绝。GET state、matter list render、send、link、draft recency 和 Host observation 均不会调用 selection kernel。

选择 kernel 依固定顺序重读 active identity session、独立 matter read authorization、formal current revision、default workspace link、fresh workspace fold 与 FramePolicy，最后才对 ActiveContext 做一次 CAS `select`。公开 projection 只包含 matter/revision/workspace reference 及 context/frame generation，不包含 actor、session 或绝对路径。

### D2 · 认证与事项读取授权继续分家；production 真实选择有意 unavailable

identity session port 只提供随机 `sessionRef`；独立 `authorizeMatterRead` 的 allowed 结果才可提供 `actorScopeRef`。当前 production 尚无可证明的 projection read-policy provider，因此 main 显式注入 unavailable port，真实点击稳定得到 `active-context-unavailable`，不会从 identity handle、事项列表可见性或 local draft 推断 read grant。

这表示 route、kernel 与 UI 已接线，但真实产品选择仍未获授权；不可把这一批绿色写成“事项切换可用”。未来接入 read-policy provider 时必须另行证明 I/O、freshness、timeout、组织岗位 authority 与 anti-oracle 行为。

### D3 · admitted session effect 每次重新核对 context 关键事实

在进入后续 identity/policy 等 authority port 前，main 重新核对：

1. request caller binding；
2. vault 当前 `sessionRef` 与 `identityHandle` 对应 snapshot 的 session/actor；
3. BusinessMatter store 中当前 revision；
4. matter link store 中唯一默认 workspace 及可信 path；
5. fresh workspace fold 中同一 workspace/path；
6. ready、未污染且 generation 相同的 FramePolicy；
7. ActiveContext 最终 CAS match。

任一 provider 缺失或读取失败返回 unavailable；身份、revision、默认 link、workspace/path、frame 或 candidate 漂移返回 stale。两者都在 raw provider 前停止。logout、frame contamination、当前 workspace registration 删除、当前默认 link 移除或改绑会使 context 失效。

### D4 · 七组 session-family 写 route 迁入既有异步 admission

pending edit/remove、queue edit/remove、clarification answer、edits save/resend/verify、plan-mode switch、approval answer/withdraw 不再调用 raw provider；它们使用稳定 operation 名与 `matter | active-session` candidate，并只携带 authority-free payload。renderer 可提交的 resend `workspaceRoot` 不进入 admission payload。

至此 session-family 共十条 route 使用 protected admission：第二批的 send/stop/resume 加本批七组 route。完整 identity/policy、target、Compatibility、Registry、preflight、durable persistence 与 dispatch 仍未接齐，所以 outcome 继续是 `protected-effect-unavailable`，raw providers 必须零调用。

### D5 · 最小 UI 只表达明确选择和真实不可用，不启动视觉迁移

事项列表只为有效、非 archived 的 `matterRef` 增加“选择事项”；当前项显示 disabled“当前事项”。按钮只发送 exact candidate，成功后重新读取 authoritative state，本地不制造 active。缺失/畸形 `activeContext` 时按钮 disabled 并显示“未接线”；refused/invalid 显示稳定 code。

authority matrix 分母由 57 增为 58：13 read-only、5 local-preference、38 protected-effect、2 unsupported；protected 中 2 条经 `runCommand`、10 条经 protected admission、1 条是独立 context-selection、25 条仍为 bypass violation。gate 分别核对 admission 与 selection 的源码事实。本批未新增 dependency/lockfile，也未进入三栏 IA 或视觉换壳。

## Verification

- CTX kernel/selection、route、renderer、session admission 与 matrix 定向回归：6 files / 37 tests passed。
- production assembly 与 session admission 联合回归：2 files / 24 tests passed。
- renderer 相关回归：8 files / 47 tests passed。
- 七组旧测试的 raw-provider 预期已改为 exact parser、零 raw call 与 typed unavailable：7 files / 58 tests passed。第一次全量 suite 因这 8 个旧预期判红；修正测试合同后复跑通过，没有放宽 production 判据。
- `apps/sage-shell` typecheck、build 与全量 suite passed：174 files / 1424 passed / 1 skipped。suite 仍报告 3 个历史 fixture entry 未激活 warning，不属于本批新 failure。
- 仓根 `pnpm run test:gate` passed：202/202；`pnpm run gate` passed：27/27（84 objects，0 skipped，0 failed）。route authority gate 对账 58/58；10 个反向/漂移 selftests passed。
- 真实 Electron 43.3 fixture window probe passed：1 file / 2 tests；覆盖真实 protocol/window、fixture state、键盘/布局合同与 zero-write negative control。选择控件的 exact candidate 与不伪造 active 状态由 renderer 定向回归覆盖；production 仍因 read-policy authority 缺失而 unavailable。

## Alternatives considered

| 方案 | 结论 |
| --- | --- |
| GET state、首次 send 或 matter link 顺便激活 | 否决。读取/发送/关联不是用户明确选择，且会让重试、刷新产生隐式写。 |
| 使用最新 converted draft 作为当前事项 | 否决。draft recency 不是读取授权，也不能绑定 current revision、session、workspace 与 frame。 |
| identity handle 直接作为 actor scope | 否决。认证只证明“谁登录”，不能证明该主体可读某事项；actor scope 必须来自独立 read authorization。 |
| route body 同时提交 revision/session/root | 否决。renderer 只能提交 candidate，可信事实必须由 main fresh 重算。 |
| admission 通过后接回旧 raw provider | 否决。后续 authority 与 durable dispatch 仍缺，provider present 不等于 effect authorized。 |
| 同批重做视觉/IA 或引入 React | 否决。UI-01 技术与逐状态语义前置仍未完成；本批只补最小选择 affordance。 |

## Consequences

- Sage 已有唯一、显式、CAS-bound 的事项选择入口，但 production 因缺 read-policy provider 仍诚实不可用。
- session-family protected admission 从 3 条扩为 10 条，protected bypass 从 32 降为 25；这不代表真实 session mutation 已可执行。
- CTX-02 只关闭 admitted session-family 的 per-request fresh context/root 核对；attachment、file/log 等其余 route 的 trusted-root 收口仍是 backlog。
- `currentMatterRef()` 的 draft-recency 读取路径仍未全面迁移到 ActiveContext；在独立 read policy 落地前不能用 selection route 反向宣布所有 read surface 已同语境。
- 13 条 read-only route 的 read policy、partial CB1、25 条 protected bypass、pipeline step 4–10、Qoder 018/019 产品写入口与完整视觉/IA 迁移仍未完成。
- 新复发模式登记为 [P-63](../../../pitfalls-playbook.md)：认证/列表可见性/candidate 不能代替事项读取授权，也不能触发隐式 context 写。
