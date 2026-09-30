# WT-02D Application Service 边界

- 日期：2026-09-30
- 状态：WT-02D.0-ARCH revision 37 已确认并落档；源码、测试与运行时接线尚未实施
- 决策：[ADR-0174](../../../adr/ADR-0174.md)
- 相关：[Sage UI 一致性合同](../../../specs/2026-09-27-sanbao-to-sage-ui-consistency-contract.md)、[BusinessMatter 合同](../../../specs/2026-09-24-businessmatter-contract.md)、[ADR-0163](../../../adr/ADR-0163.md)、[ADR-0165](../../../adr/ADR-0165.md)、[ADR-0171](../../../adr/ADR-0171.md)、[ADR-0173](../../../adr/ADR-0173.md)

## Problem

Sage 已分别建立 `BusinessMatter` 领域核与本地事件存储、Identity / Policy Resolver、Compatibility Resolver、Runtime Inventory 证据、Capability Registry kernel、CompatibilityEvaluationEvidence，以及 renderer-facing `SageMatterViewState` / `SageActionPreview`。这些能力当前仍是分离的局部合同；没有一个受信产品边界负责把它们按固定顺序组合，也没有 production `ActionIntent` 提交入口。

当前运行时仍由 Electron main 的 `protocol.handle()` 把 `dsh-app://app/*` 请求整体转发给 Host child；Host 内的 `routeRequest()` 再把 `GET /.sage/state` 与 `POST /.sage/actions` 交给 `SageCapabilityAdapter`。现有 action 只接受 `{ "type": "retry" }`，语义是重新检查 runtime availability，不是经营事项命令。与此同时，UI-02 / UI-03 已能显示 fixture `ViewState` 和只读 action preview，但它们没有提交函数、没有服务签发的幂等身份，也不能成为 authority。

若下一步直接在 renderer、Host、插件或某个 route handler 中拼接 provider，会产生多条产品调用链：读取 projection 的路径可能泄漏真实经营数据，动作路径可能跳过 identity / policy、compatibility、domain decision 或 evidence append；网络断开、取消和重试也可能把“没有收到回执”误写成“没有执行”。因此必须先固定唯一 owner、进程边界、公开端口、authority 顺序和失败语义，再写任何 Application Service 源码。

本记录依据当前源码与以下 Electron 官方边界：main process 拥有应用生命周期与 native capability；renderer 按 Web 安全模型运行；custom protocol handler 在 main process 注册；context isolation / sandbox 下只能暴露窄、逐方法校验的能力，不能把宽泛 IPC 或 Electron API 交给 renderer。

- [Electron Process Model](https://www.electronjs.org/docs/latest/tutorial/process-model)
- [Electron protocol API](https://www.electronjs.org/docs/latest/api/protocol)
- [Electron Context Isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation)
- [Electron Security](https://www.electronjs.org/docs/latest/tutorial/security)

## Decision

### 1. Electron main 独占产品编排与 `/.sage/*` 业务 route

WT-02D 的 Application Service 由 Electron main 拥有，是经营事项 command 与安全 projection 的唯一产品入口。目标形态中，`protocol.handle()` 在 main 精确终止 `/.sage/*` 业务 route；renderer、Host、插件、模型和 Capability Adapter 都不能注册平行业务 route，也不能直接调用领域 command 或写 event store。

main 可以通过窄、类型化、可取消的内部 port 向 Host 请求 capability observation、availability preflight 或 operation invocation，但不得把 raw Cordis `Context`、MCP client、Host connection、通用 `fetch`、filesystem handle 或 Electron API 暴露给 Application Service 的调用者。Host 只执行内部 port 请求，不拥有产品 action policy、事项 revision、compatibility outcome 或 completion 判定。

当前 Host-owned `GET /.sage/state` 与 `POST /.sage/actions` 在 revision 37 保持原状。route 迁移属于 WT-02D.0.1；在其源码、回归和 rollback 门完成前，不把文档目标误报为 runtime 事实。

### 2. 两个产品端口：projection read 与 command submission

Application Service 对产品面只暴露两类窄端口：

| 端口 | 输入 | 输出 | 明确不做 |
| --- | --- | --- | --- |
| Projection read | 受限 projection query、main 注入的 active caller / session context、取消信号 | 脱敏 `ViewState` 或稳定 unavailable / denied 结果 | query / body 不接受 caller 自选 session reference，不签发 action authority、不返回 provider raw output、不执行外部动作 |
| Command submission | exact `ActionIntent` envelope、非权威 transport `requestId`、取消信号 | service-issued operation / idempotency identity 与稳定 command receipt | 不接受 caller 自报 actor、outcome、matrix、digest、execution snapshot 或 completed |

公开 `ViewState` 沿用现有正交轴：`projectionSource`、compatibility、authorization、availability、actionability 与 denial reason 分开表达。fixture 与 live 使用同一公开 shape，但 production composition 禁止用 fixture 填补缺失 authority；`projectionSource=fixture` 必须持续可见，且永远不计入生产完成证据。

`ActionIntent` 只描述用户或产品希望发生的动作，至少精确绑定 `matterId`、调用方看到的 `revisionId`、action type / `actionScope`、允许的 typed payload 与产品 provenance `origin`。该 `origin` 只是审计与产品来源提示，不是 transport caller identity、认证或授权输入；main 必须从调用方不能在 body 中自报的 transport / sender 事实独立建立 caller binding。Intent 不得携带 `HumanRoleRef`、organization、grant、`AuthoritySnapshot`、compatibility outcome、`matrixId`、target / inventory digest、Registry approval、Adapter mapping、execution snapshot、artifact/receipt 结论或幂等 authority。当前 `SageActionPreview` 仍是 `submissionState=not-submitted` 的只读投影，不自动升级为 intent。

### 3. Projection read policy 与 action authorization 分离

读取真实经营事项 projection 也是数据访问，必须由独立的 projection-read policy 明确授权；不能因为 action 是 `external-read`、当前用户能看到按钮、Host ready，或某个 action grant 通过，就推导其可读取全部事项。每次 projection read 先由 main 验证 transport caller binding，再由 main 注入当前 active、non-bearer session context；renderer 的 query / body 不得选择、替换或提交 session reference。随后才以独立 read policy 授权最小 store lookup / projection / redaction。missing / unverifiable caller binding、缺 active session、policy / identity / store unavailable 都 unavailable-first；未授权 caller 的 denied / not-found 不得枚举 matter 是否存在。

Action authorization 每次命令都重新求值，并精确绑定当前 matter / revision / action policy。先前 projection 上显示的 `authorized`、历史 decision、历史 `equivalent`、preview 或 service receipt 都不是 standing authority。projection read 失败不触发 command；command 成功也不扩大后续 projection 范围。

在真实 projection-read policy 尚未实现前，WT-02D.0.1 的 production projection 只能 unavailable-first；WT-02D.1 可使用显式 fixture / blocked E2E，但不能读取真实业务数据。

### 4. Import firewall 与依赖方向

依赖只能沿下列方向流动：

```text
Sage renderer
  → public ViewState / ActionIntent transport contract
  → Electron-main route adapter
  → Application Service
     → projection-read policy / Identity & Policy ports
     → BusinessMatter strict rehydrate + domain command port
     → trusted target / runtime inventory / matrix + resolver ports
     → Capability Registry / availability-preflight ports
     → main-owned store / evidence transaction port
     → narrow Capability Adapter port
  → redacted ViewState / command receipt
```

- renderer 与 component code 不得 import `domain/` command、`security/` kernel、`persistence/`、`main/`、`host/` 或 raw Adapter implementation；只消费公开 DTO 与 transport client。
- Host、Harness、插件与 MCP bridge 不得 import product route、Application Service、BusinessMatter store、Identity / Policy 或 Compatibility Authority；只实现 observation / preflight / invocation port。
- Application Service 不得 import renderer / component code、raw Cordis `Context`、raw MCP client、plugin package 或 vendor internals；所有外部能力经 capability port 注入。
- 领域核不 import Electron、Host、security provider、clock、network、filesystem 或 compatibility runtime；其 deterministic replay 边界保持不变。
- persistence 不决定身份、compatibility 或产品 action；它只按已验证的 typed command / evidence transaction 执行原子写入与恢复。

这些边界后续必须由 import-boundary 测试和 route ownership 测试守住，不能只依赖目录约定。

### 5. Command 固定顺序

所有可能写入事项、产生外部调用或跨 privileged boundary 的 `ActionIntent` 采用同一顺序；这是对 [ADR-0165](../../../adr/ADR-0165.md) 第 8 条既有顺序的细化，不删除或后移其 strict rehydrate 前的 initial Identity / Policy access precheck。任一步失败立即停止，后续 authority 不运行，外部 Adapter 不被调用：

1. main route 以 main 侧可验证、调用方不能在 body 中自报的 transport / sender 事实建立 caller binding，再校验 method、content type、body budget、schema 与额外字段；missing / unverifiable caller binding 一律 fail closed，`ActionIntent.origin` 与不受信 header 都不能替代它。具体证明机制必须由 `.0.1` 针对仓库 pin 的 Electron 版本实现并测试，revision 37 不宣称当前 Host-owned route 已满足。caller `requestId` 只建立冲突边界，不提供 authority。
2. 解析当前 app session，并以最小请求上下文执行 initial matter-load / access Identity / Policy precheck；该检查只授权定位并载入请求指向的事项，不授予 action authority，也不能替代 target 生成后的 fresh action-scoped evaluation。provider unavailable、读取被拒绝或 scope 不匹配时 fail closed。
3. 从 main-owned store strict rehydrate 当前 `BusinessMatter`，核对 `matterId`、current `revisionId`、action type / scope 与当前领域状态；stale revision 不自动迁移。
4. 由受信 target requirement / target provider 根据当前事项 revision 与 action policy 生成 target；调用方不能提交或修改 target。
5. 使用当前 action policy 重新执行 fresh Identity / Organization Policy evaluation，得到短生命周期 `AuthoritySnapshot`；初始 session lookup 或旧 projection 不替代本次求值。
6. 取得 trusted clock、完整 main-owned runtime inventory、当前 immutable MatrixV2 与 revocation source，运行纯 Compatibility Resolver；只有唯一精确 `equivalent` 继续，`unknown` 与 `requires-new-revision` 都阻断。
7. 读取 immutable Capability Registry snapshot，解析精确 operation → Adapter mapping，并执行 fresh availability / no-side-effect preflight；approved、compatible、authorized、available 四个结论互不替代。
8. 让 `BusinessMatter` 对 current revision、`requiresDecision`、decision lifecycle、attempt / receipt 状态和责任角色再次执行领域重验。
9. 紧邻任何 authority-scoped 持久写入前，重新核验 current caller / session、fresh action-scoped Identity / Policy、current matter revision / operation state；由 trusted provider 按 current revision / action policy 重新生成或核验 target requirement / target evidence 的 provenance、effective / expiry / revoke 状态，并以 current inventory、matrix lifecycle / revocation 重跑 Compatibility Resolver；随后再核验 Registry mapping 与 no-side-effect availability preflight。任一漂移、拒绝、`unknown`、`requires-new-revision` 或不可用都 fail closed。随后在 main-owned transaction boundary 持久化 service-issued operation identity、经 WT-02B.3 批准转换的最小且不可重放 `Persistable AuthorityEvidence`、本次实际使用的 CompatibilityEvaluationEvidence、领域 event / attempt 准备事实与可审计 receipt。绝不持久化 runtime `AuthoritySnapshot`、raw subject、token、session 或完整 claims；任何 append / commit 不确定都不调用外部 Adapter。
10. 紧邻真实 Adapter dispatch 前，再次核验 current caller / session、fresh action-scoped Identity / Policy、current matter revision / operation state；重新生成或核验 current target requirement / target evidence 的 provenance、effective / expiry / revoke 状态，以 current inventory / matrix / revocation 重跑 Compatibility Resolver，并重新核验 Registry mapping 与 availability preflight。步骤 4～7 或步骤 9 的结果都不是 standing authority。若结果漂移，或产生 `unknown` / `requires-new-revision`，旧 preparation 不得 dispatch；任何新 target / authority / compatibility evidence binding 必须先 durable，随后才可经窄 Capability Adapter port 调用真实 operation。结果必须归一为 artifact、failure、receipt 或 `outcome-unknown`，再由领域与 store 收口。模型回复结束、Host response 结束或 artifact 存在都不等于事项 completed。

步骤 9 与 10 之间的外部副作用无法靠单个 SQLite transaction 自动原子化。WT-02D.2 必须使用 Adapter 的 operation idempotency / query-by-operation 或另行批准的 outbox / prepare-dispatch / reconciliation 合同；能力不提供可验证收口机制时，production action 保持 unavailable。

### 6. Unavailable-first composition

Application Service 必须能在 provider 尚未装配时安全启动，但其默认能力是返回稳定 unavailable，不是构造 placeholder：

- 缺 projection-read policy、Identity / Policy provider、trusted clock、target、完整 runtime inventory、MatrixV2 / revocation、Registry real entry、Adapter mapping、preflight、store/evidence port 中任一项，相关 live projection 或 action 即 unavailable / blocked。
- 不允许用 fixture、空 digest、默认 matrix、Host ready、package version、历史 `equivalent`、工具数量、测试 provider 或 caller 自报数据补齐 production authority。
- provider 恢复只允许下一次新鲜 read / command 重新求值；不能原地抬升已经返回的 projection 或 receipt。
- 初始化异常与 provider failure 必须被收敛为稳定、脱敏的 service error；不得把 raw exception、stack、path 或 provider payload 传给 renderer。

### 7. Idempotency、取消、重试与 `outcome-unknown`

**Idempotency。** renderer 提供的 `requestId` 只用于关联重发，不是 authority。每次请求先验证 main-side transport caller binding；它只证明本次请求来自允许的产品面，不进入 durable replay namespace。fresh Identity / Policy 产生的稳定、opaque Sage-internal actor / subject scope（不得使用 raw subject、token、session、BrowserWindow、frame 或其他易变 transport identity）与 organization、matter、`requestId` 组成 replay lookup / uniqueness key。该 key 命中的记录不可变绑定 canonical intent digest：digest 相同返回原 operation / receipt，digest 不同返回 conflict。不同 actor、organization 或 matter scope 的同文字 `requestId` 不得碰撞、别名或互相返回 receipt。Application Service 再从 scoped request key + canonical intent digest 派生并持久化 operation / idempotency identity；Adapter idempotency key 只能由 service 从该 identity 派生并通过窄 port 传递，插件或 renderer 不能选择。

**取消。** transport abort 在 durable dispatch 之前可以终止并返回 `cancelled-before-dispatch`；一旦 durable dispatch 已建立或请求已交给 Adapter，socket / window / renderer 断开只表示调用方不再等待，不能声明 operation 已取消。若 capability 支持取消，必须以同一 operation identity 发起显式、可审计的 cancel，并以 receipt 证明结果。领域 `stop-attempt` 是独立 ActionIntent，不等于 `AbortSignal`。

**重试。** 现有 `retry-capability` 只重新检查 availability，不重放业务 action。已知 pre-dispatch failure 可用同一 `requestId` 安全重取既有 receipt；领域 failure 后的业务重试必须创建新的、显式确认的 attempt。`stale-revision`、`requires-new-revision`、policy denied 或 decision required 不得隐式重试。

**Outcome unknown。** Adapter 已可能接收 operation 但响应丢失、进程退出或 commit acknowledgement 不确定时，必须持久化并返回 `outcome-unknown`。该状态禁止自动再次 dispatch。receipt lookup 与严格无副作用的本地 status query 每次都重新验证当前 caller binding 与最小 read / access policy，并保持 anti-oracle 响应；历史 operation identity 不授予读取权。任何会调用 Adapter query / cancel、append 后续 receipt、推进领域状态、重新 dispatch 或由人工裁定结果的 reconciliation，都必须作为具名 reconciliation `ActionIntent` 或受治理的 system principal 操作，重新走 fresh action-scoped Identity / Policy、compatibility / Registry / preflight、领域重验与 durable transaction。只读 query 永远不能自动把 unknown 改成 resolved；没有证据时不能把它降格为 failed、cancelled 或 not-run。

### 8. 稳定错误与 receipt 边界

产品面只接收稳定、可枚举、脱敏的错误类别，例如 invalid intent、projection denied / unavailable、identity unavailable、policy denied、stale revision、decision required、compatibility unknown、requires new revision、Registry / capability unavailable、persistence unavailable、cancelled before dispatch、conflict 与 outcome unknown。每个错误只携带安全的 stage、是否可重试、是否需要新 revision / decision，以及 service correlation / operation reference；不得携带 token、session、raw subject、claim、秘密、机器绝对路径、stack、raw Host/MCP error、matrix bytes、完整 digest 或未分类 payload。对未获 read / access authorization 的 caller，denied / not-found 结果不得泄漏 matter、operation 或 receipt 是否存在。

Application Service receipt 只证明某个 exact intent 在某个阶段的处理事实：blocked 表示未 dispatch，accepted 表示 durable preconditions 已建立，artifact / failure / reconciliation receipt 表示相应证据已持久化。它不自动代表 `BusinessMatter.completed`；事项完成仍只由领域规则与责任人的业务 receipt 决定。

### 9. 分批实施门

| Ticket | 允许内容 | 关闭门 | 明确不包含 |
| --- | --- | --- | --- |
| WT-02D.0-ARCH（本批） | 本记录、ADR、常驻规则、执行计划与派生 ledger | 六文件 docs-only diff、链接/ADR/Birdview/门禁通过 | 源码、测试、route、UI、provider、真实数据、action |
| WT-02D.0.1 | main-owned port / route skeleton、unavailable-first composition、import firewall | 当前 `/.sage/*` contract 回归、缺 provider 全部 fail closed、Host 只剩窄 port、无 fixture production fallback | live BusinessMatter action、真实 provider、插件启用 |
| WT-02D.1 | 零真实数据、零外部副作用的 fixture / blocked read-only E2E | fixture/live 同 shape、fixture 标识持续可见、production 缺 authority 仍 unavailable、无 store mutation / Adapter invoke | 真实经营数据、真实 action、真实插件 |
| WT-02D.2 | 首个经单独确认的 production command path | 真实 Identity / Policy、WT-02B.3 最小 `Persistable AuthorityEvidence` schema / governance / persistence、C2/C3、Registry real entry、trusted clock、数据治理、idempotency/cancel/reconciliation 与独立 E2E 全部通过 | 扩成多 capability、多业务域或发布证明 |

任何后续 ticket 都需新的 Birdview 文件级计划与用户确认。revision 37 的文档授权不自动授权 `.0.1`、`.1` 或 `.2`。

## Alternatives considered

| 方案 | 结论 |
| --- | --- |
| 保留 Host-owned `/.sage/*`，在 Host 内直接调用 domain/security/store | 否决；Host 拥有 raw runtime `Context`，会同时成为产品路由、authority 与业务状态 owner，破坏 main / renderer 信任边界。 |
| renderer 直接调用多个 provider，再把“已验证”结果提交给 main | 否决；renderer 不受信，且 provider 顺序、freshness、原子性和审计无法统一。 |
| 每个插件注册自己的 command route | 否决；插件会绕过 Identity / Policy、Compatibility、Registry、domain decision 和 receipt 边界。 |
| 用当前 `SageActionPreview` 直接作为 command | 否决；preview 明确 `not-submitted`，缺 service-issued operation identity 与 fresh authority。 |
| projection read 复用 action grant，或把“只读”默认视为安全 | 否决；读取真实经营数据仍涉及组织 membership、数据最小化与可能的数据出境，必须独立授权。 |
| provider 未完成时用 fixture / placeholder 维持产品可用 | 否决；会把测试形状伪装成 production authority，造成不可审计放行。 |
| transport 超时后直接重试 Adapter | 否决；首次调用可能已经产生副作用，盲重试会制造重复动作。 |
| revision 37 同时实现 skeleton | 否决；当前六文件计划只授权治理合同，源码与 route 迁移必须按 `.0.1` 独立确认。 |

## Consequences

- 正面：renderer、Host、插件和模型都只有窄输入面，无法自报 authority 或绕过唯一产品编排入口。
- 正面：projection-read、action authorization、compatibility、Registry、availability 与领域 decision 保持可分别审计；任一缺失都以稳定 unavailable / blocked 呈现。
- 正面：取消、重试和响应丢失不再被压成一个失败布尔值；`outcome-unknown` 会阻断盲目重复副作用。
- 正面：现有 fixture UI 可以继续并行验证公开 shape，同时 production composition 对 fixture 保持硬隔离。
- 代价：真实产品动作必须等待 Identity / Policy、C2E、Registry real entry、C3 evidence composition、trusted clock、数据治理与 Adapter reconciliation 全部就绪；局部 kernel 全绿不能提前接线。
- 代价：Electron main 将承担 route termination、composition 和 orchestration，需要避免同步 I/O 或 CPU-heavy 工作阻塞 main；具体 offload 方式在实现 ticket 中按真实负载决定。
- 代价：需要新增可执行的 import / route / ordering / idempotency / cancellation / reconciliation 判据；本记录本身只是约束，不是机制。
- 边界：revision 37 只证明 Application Service 架构治理已落档。当前 Host-owned route、源码、测试、v1 event、UI、插件、provider、真实数据、GUI、发布与业务闭环均未改变，也未被验收。
