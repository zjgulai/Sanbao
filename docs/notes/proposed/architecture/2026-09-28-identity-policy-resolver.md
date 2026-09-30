# Identity / Policy Resolver 架构与交接

- 日期：2026-09-28
- 状态：WT-02B.1 架构已确认；本文定义 kernel 与后续接线边界，不作为真实 provider、产品调用链或完整 WT-02B 的完成证据
- ADR：[ADR-0163](../../../adr/ADR-0163.md)
- 领域合同：[BusinessMatter 领域与权威事件存储合同](../../../specs/2026-09-24-businessmatter-contract.md)
- 执行计划：[Sage 自有桌面端执行方案](../../../plans/2026-09-24-sage-self-owned-desktop-execution-plan.md)

## Problem

`BusinessMatter` 已经拥有 revision、action policy、decision、attempt、artifact 与 receipt 的领域规则，也能通过严格重放防止磁盘字节绕过这些规则；但它的 `HumanRoleRef` 只表达一个结构性的岗位引用。结构相同不等于真实主体相同，更不能证明该主体属于某个组织、当前仍持有该岗位、获得了某项操作授权，或者授权来自哪一版政策。

当前仓库也没有真实 Identity Provider、登录 session、组织目录或 policy authority。以下信号都不能直接升级为人类身份：

- renderer、HTTP body 或插件提交的 `roleRef` / `subjectId`；
- Harness / Cordis connection、MCP client identity 或能力 identity / version / digest；
- macOS uid、文件 owner、进程 identity 或 `dsh-app://app` origin；
- 测试 fixture、测试 provider 或 TypeScript 类型断言。

若未来新 UI 直接把这些字段送给 `recordDecision()` 或 `recordReceipt()`，产品会把「调用者声称是谁」误作「受信系统证明是谁」。因此 WT-02B 必须在 UI / Application Service 与领域命令之间建立明确的信任边界，同时保持 `BusinessMatter` 的纯领域与可重放语义。

官方模型支持这种分层：

- [NIST SP 800-63-4](https://pages.nist.gov/800-63-4/)分别定义 identity proofing、authentication 与 federation 的过程和保障要求；
- [NIST SP 800-162](https://csrc.nist.gov/pubs/sp/800/162/upd2/final)将 authorization 描述为 subject、object、requested operation 与环境属性对政策的求值；
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html)允许 client 验证认证服务对 end-user identity 的 claims，但这些 claims 不自动表达 Sage 的组织岗位或业务操作权限。

## Decision

### 1. 责任分为三层

| 层 | 负责 | 不负责 |
| --- | --- | --- |
| Identity Provider | 验证 session、subject、audience、organization 和有效期，产出可信 identity assertion | 不授予 Sage 组织岗位或操作权限，不产生事项审批 |
| Organization Policy Provider + Resolver | 作为 subject → role 与 role → operation / action scope 的唯一 authority，以 `roleAssignments + grants` 提供版本化组织政策并对请求上下文求值 | 不登录用户，不执行领域命令，不写事件 |
| `BusinessMatter` | 校验 revision、action policy、decision 生命周期、attempt、receipt actor / evidence 与事项阶段 | 不验证 token / session，不查询组织目录，不决定主体是否真实持有岗位 |

未来 WT-02D 的 Application Service 是 orchestration / enforcement point：它从受信 provider 取得断言和政策，调用 resolver，只有 allowed 才继续调用领域命令；领域命令仍须独立通过自身不变量。任何层都不能因为上游成功而跳过本层验证。

### 2. WT-02B.1 只建立独立 security kernel

kernel 位于 `apps/sage-shell/src/security/identity-policy.ts`，与 aggregate 和未来 Application Service 分开。首批要求：

1. provider / request 输入从不可信边界进入，先做 exact runtime shape 与语义验证；
2. identity 或 policy 缺失、无效、过期、audience / session 不一致、policy organization 与可信 identity assertion organization 不一致、岗位未授权、operation 被拒绝、action policy / context 不匹配时默认拒绝；
3. `issuer`、`subject`、固定 `audience`、`session`、`organization`、`role`、`operation`、`actionScope`、`effectClass` 和 policy identity / version / digest 都采用精确匹配，不做前缀、大小写或模糊兼容；
4. 五种 `effectClass` 和 `requiresDecision` 是两个正交维度，resolver 不根据副作用等级暗推审批；
5. 成功时输出规范化 actor 和不可变 authority provenance；失败只返回稳定、可判别的拒绝结果，不抛泄漏 provider 细节的原始异常；
6. kernel 不访问文件、数据库、网络或全局 profile，不执行 `recordDecision()`、`startAttempt()` 或 `recordReceipt()`。

调用请求只携带 `sessionId`、`requiredRoleRef`、`operation` 和 `actionPolicy`；不接受 caller 自报 `audience`、`organizationId`、`actor` 或 `subjectId`。其中 `sessionId` 只是让受信 Identity Provider 查找并验证既有 session 的 opaque handle，不能被解释为 subject、token、岗位或授权证明；固定 audience 由 resolver composition 注入，organization 来自验证后的 identity assertion。未来这四项请求必须由受信 Application Service 从登录上下文和业务意图组装，renderer 不能靠填写任意 session 获权。

Organization Policy Snapshot 必须把 `roleAssignments`（subject → role）与 `grants`（role → operation / exact action policy）分开；resolver 先验证主体拥有精确岗位，再验证该岗位拥有精确 operation、`actionScope`、`effectClass` 与 `requiresDecision`。Identity assertion 不携带 role claim，避免岗位出现第二份事实源。重复的 subject / role assignment，以及同一 role / operation / action scope 的重复或互相冲突 grant 都使整个 Policy Snapshot 无效，不能靠数组顺序选一个继续。

这里的测试 provider 只是可控输入边界，用来证明 resolver 对可信与恶意形状的行为；它不等同生产登录系统。

### 3. allowed 与领域 decision 不同

`allowed` 的语义只有：

> 在某一时刻，指定 identity authority 与 policy authority 提供的事实允许这个主体，以该组织岗位，对这个 operation / action scope 继续尝试执行领域命令。

它不表示：

- 事项已经获得业务审批；
- `requiresDecision` 已满足；
- 历史 decision 仍未撤销或过期；
- attempt 可以开始或 receipt 可以接受；
- 结果已经持久化或具有不可抵赖性。

这些结论必须分别由 `BusinessMatter` 命令、严格重放、event store，以及未来更强的签名 / 外部 anchor 能力给出。

### 4. 长期采用最小可审计 AuthoritySnapshot

长期方向已经确定：decision / receipt 的事实链应能解释「当时为什么允许这个主体代表该岗位执行」。最小快照至少需要覆盖以下语义：

- issuer identity / version / digest、稳定 subject、audience 与 session；
- organization 与经 policy `roleAssignments` 授权的 role；
- policy identity、version 与 digest；
- operation、`actionScope`、`effectClass`、`requiresDecision`；
- 本次求值时间和有效期边界。

快照是当时授权依据，不是实时权限缓存；后续审计应能区分「当时合法」与「现在仍有权限」。它也不应保存原始 token、凭证、完整组织资料或不必要 PII。

WT-02B.1 **不修改 v1 event schema**。原因不是放弃审计，而是以下前提尚未决定：

1. 真实 provider 及其稳定 subject 语义；
2. issuer / tenant / organization 的映射；
3. session 与 token 生命周期、撤销和离线语义；
4. PII 最小化、retention、purge、export、backup 与删除传播；
5. AuthoritySnapshot 是扩展 v1 还是进入 schema v2。

本批让 resolver 先输出不可变 provenance。真实来源和数据治理确定后，再单独授权事件 schema 与迁移策略。

### 5. 本批禁止跨越的边界

WT-02B.1 不授权：

- 选择或连接 OIDC、企业 SSO、系统账户、邮箱、手机号或其他真实登录；
- 修改 `BusinessMatter` v1 event、codec、rehydration 或 SQLite store；
- 接入 product、renderer、新 UI、Capability Adapter、Host 或 main process；
- 读取、迁移或复用旧 DSH / Harness 账号、profile、JEV、历史插件和旧数据根；
- 写入真实业务资料或把 kernel 测试称为 P0-5 产品闭环；
- 新增 dependency、修改 package / lockfile、commit、push 或发布。

## Alternatives considered

### 继续信任 HumanRoleRef

拒绝。它适合作为领域引用，不是 authentication credential。只比对 `roleRef` 会允许任意调用者构造同形主体。

### 把 authorization 放进 BusinessMatter

拒绝。组织目录、session、issuer 与 policy lifecycle 会污染领域层；事件重放也会依赖外部可变状态，无法维持确定性。

### 由 Application Service 临时判断

拒绝。WT-02D 尚未实施；把判断散落在 orchestration 中会出现多份策略实现，且更难证明 UI / adapter 没有绕过。

### 立即选择 OIDC 或某个企业目录

拒绝。OIDC 是可能的 authentication / federation 适配方式，不是组织 authorization 的完整答案。部署方式、组织目录、离线策略和账户生命周期尚未决策，kernel 应先保持 provider-neutral。

### 立即修改 v1 事件并持久化 subject

拒绝。追加式事实无法轻易撤回；在 subject 稳定性和 PII / retention 未定前写入，会提前锁死隐私与兼容边界。

### 永远只保存 allow / deny

拒绝。没有版本化授权依据，policy 变化后无法解释历史 decision / receipt，也无法形成 AgenticOS 所需的审计链。

## Consequences

- 新 UI 与插件未来只有一条正确路径：Application Service 注入受信身份与政策 → resolver 求值 → 领域命令重验 → event store 持久化。任何直接调用领域命令的产品路径都应被视为边界违规。
- `BusinessMatter` 保持可独立测试和严格重放；组织授权保持 provider-neutral、可替换、默认拒绝。
- WT-02B.1 的完成标准只能写成「kernel 和合同通过」；真实 provider、产品接线与 AuthoritySnapshot 持久化必须分别给证据。
- security kernel 会增加一层明确的失败状态。产品层必须如实展示 unavailable / denied / expired 等状态，不能静默降级为匿名、默认管理员或只读成功。
- 未来若真实 provider 无法给出稳定 issuer / subject、版本化 policy 或撤销语义，应阻断产品接线，不得用 `roleRef`、邮箱或 display name 补洞。

## Verification

WT-02B.1 的实现验证至少包括：

1. 先证明测试在 resolver 源码缺失时真实 Red，再实现最小 Green；
2. identity / policy unavailable、invalid、expired；audience / session mismatch；policy organization 与可信 assertion organization mismatch；role not held；operation denied；action policy / context mismatch；
3. 未知或近似 action scope、未知 effect class、policy identity / version / digest 缺失；
4. hostile object、extra fields、accessor / Proxy 和输入突变均 fail closed；
5. 精确成功路径输出规范化、不可变 provenance；调用前后输入保持不变；
6. `effectClass` 与 `requiresDecision` 正交；
7. `BusinessMatter`、strict rehydration、product / adapter / handler 边界回归；
8. typecheck、build、Sage Shell 全量测试、`sage-product-boundary` 与 Sage quick gate；
9. 最终 diff 证明没有修改 v1 event schema、store、product、adapter、Host、profile、package 或 lockfile。

通过上述验证仍只关闭 WT-02B.1。完整 WT-02B 的剩余门是：真实 Identity Provider、Organization Policy Provider、失败与撤销语义、PII / retention 决策，以及 WT-02D Application Service 的受信接线。
