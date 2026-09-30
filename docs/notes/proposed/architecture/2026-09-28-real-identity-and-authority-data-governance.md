# 真实身份与 Authority 数据治理

- 日期：2026-09-28
- 状态：WT-02B.2A revision 10 已确认并落档；真实 provider、vault、schema、持久化与产品接线均未实现
- ADR：[ADR-0164](../../../adr/ADR-0164.md)
- 前置安全边界：[ADR-0163](../../../adr/ADR-0163.md) · [Identity / Policy Resolver](2026-09-28-identity-policy-resolver.md)
- 领域合同：[BusinessMatter 领域与权威事件存储合同](../../../specs/2026-09-24-businessmatter-contract.md)
- 阶段计划：[Sage 自有桌面端执行方案](../../../plans/2026-09-24-sage-self-owned-desktop-execution-plan.md)

## Problem

WT-02B.1 已证明一个纯、provider-neutral、fail-closed 的 Identity / Policy Resolver 可以把 authentication、organization authorization 与 `BusinessMatter` decision 分开，但它仍只是内存 kernel。仓库没有真实 OIDC client、callback、token vault、session broker、组织目录或 Policy Provider；测试 assertion 不是登录，结构相同的 `HumanRoleRef` 也不是身份。

当前 runtime `AuthoritySnapshot` 包含原始 provider subject 与 `sessionId`。它适合一次在线求值，却不适合直接进入长期事件。现有 v1 event 虽无专门身份字段，自由文本、`roleRef` 与 artifact locator 仍可能携带 PII；event store 同时没有 retention、purge、export、backup、delete propagation 或 restore 防复活合同。若直接接账号或保存 snapshot，会把运行时凭证、可关联身份和未治理的经营数据锁进追加式事实链。

本决策遵循 native app 与 federation 的官方边界：[RFC 8252](https://www.rfc-editor.org/rfc/rfc8252)、[OAuth 2.0 Security Best Current Practice / RFC 9700](https://www.rfc-editor.org/rfc/rfc9700)、[OpenID Connect Core](https://openid.net/specs/openid-connect-core-1_0.html)、[OAuth Token Revocation / RFC 7009](https://www.rfc-editor.org/rfc/rfc7009) 与 [NIST SP 800-63-4](https://pages.nist.gov/800-63-4/)。这些协议只提供认证与 token 生命周期基础，不自动授予 Sage 组织岗位或业务操作权限。

## Decision

### 1. 目标信任链

```text
system browser OIDC + PKCE
  → Electron main identity session / token vault
  → Sage-owned identity registry（internal identity handle + candidate org refs；不证明 membership）
  → Organization Policy Provider（唯一证明 active membership / role / grant）
  → identity vault mint scoped random subjectRef
  → Identity / Policy Resolver
  → Runtime AuthoritySnapshot（单次调用，短生命周期）
  → WT-02D Application Service 再执行 BusinessMatter 领域重验
  → 未来最小 Persistable AuthorityEvidence（不可重放为权限）
```

| 责任 | 唯一 owner | 明确不拥有 |
| --- | --- | --- |
| 外部主体认证 | allowlisted OIDC Identity Provider | Sage 岗位、grant、事项审批 |
| token 与本机 session 生命周期 | Electron main + OS-backed vault | renderer、Host、Harness、插件、event store |
| 外部主体到内部 identity / 候选组织引用 | Sage-owned identity registry | active membership、role、operation grant |
| active organization membership、role、grant | Organization Policy Provider | 登录、token、事项 decision |
| scoped pseudonym | identity vault（Policy 已证明 scope 后生成） | membership、role、grant、登录 |
| exact policy 求值 | Identity / Policy Resolver | 领域命令、事件写入、审批创建 |
| revision、decision、attempt、receipt | `BusinessMatter` | token、session、组织目录查询 |
| 编排与 enforcement | 未来 WT-02D Application Service | 自造第二套 identity / policy / domain 规则 |

Identity Provider 只证明精确 `(issuer, subject)`。email、display name、tenant domain、group claim、macOS uid、Keychain item、profile、UI、Host、Harness connection 或插件 identity 都不能直接成为 `organizationId`、`roleRef` 或 grant。用户选择和 identity mapping 返回的 candidate organization 都只是意图 / 查找线索；只有 Organization Policy Provider 能证明当前 membership、role 与 grant。

这部分明确修订 ADR-0163 D1 / D3 的产品目标。当前 WT-02B.1 kernel 仍要求 Identity assertion 带 organization 并与 policy organization 精确相等，因此只能继续作为 test-only 过渡接口；WT-02B.2B 接真实 provider 前必须迁移 provider / resolver contract，不能把 OIDC organization / tenant claim 直接喂给产品调用链当 authority。

### 2. Native OIDC 与 token 生命周期

- 使用系统浏览器 Authorization Code + PKCE；Sage desktop 是 public client，不内置 client secret，不使用 embedded WebView 登录。
- adapter 必须精确验证 issuer metadata、签名 / JWK、audience / client ID、redirect URI、state、nonce、PKCE、时间与一次性 callback；近似 issuer、宽松 redirect 或未知 key fail closed。
- access token 与 ID token 仅驻留 Electron main 内存；refresh token 仅进入 main-owned、OS-backed encrypted vault。Chromium `sessionData` 不是登录 session 或 token vault。
- Sage session reference 是随机、非 bearer、非秘密的内部引用；renderer 不得选择或提交它，未来 Application Service 从 main-owned active session 注入。
- logout、账户移除、refresh failure、provider revoke、切换账号 / organization 与系统唤醒都会废弃 runtime snapshot，并触发重新验证。撤销端点失败时本地凭证仍立即清除，产品状态显示 unavailable / signed-out，不使用旧 session 降级。
- issuer URL、desktop public client ID、redirect 方式、audience / scopes、refresh rotation、revocation 能力和账户生命周期是 WT-02B.2B 的真实部署输入；缺少任一项时不得用测试 JWT 或 fake provider 冒充产品登录。

### 3. 标识与数据位置矩阵

| 数据 | memory | identity vault | BusinessMatter / authority event | security log | 结论 |
| --- | --- | --- | --- | --- | --- |
| access token / ID token | Electron main 当前请求 | 禁止 | 禁止 | 禁止 | 退出、过期或撤销即清除 |
| refresh token | 仅解密使用期间 | OS-backed encrypted vault | 禁止 | 禁止 | logout / account removal 立即删除 |
| cookie / bearer session secret | 如协议确需，仅 main | 仅协议明确要求且加密 | 禁止 | 禁止 | 不进入 renderer / profile / Host / Harness / plugin |
| raw provider `(issuer, subject)` | 当前认证与 mapping 求值 | 可删除映射 | 禁止 raw subject | 默认禁止 | issuer 本身可作为 versioned provenance，subject 不进入长期事实 |
| opaque `subjectRef` | 允许 | 高熵随机 mapping 结果 | 最小 evidence 允许 | 仅受控 pseudonymous ref | Policy 证明 scope 后按 organization / audience 生成并查重；仍是个人数据 |
| email / name / phone / employee ID | 默认不取；展示确需时短存 | 仅具名目的、独立 retention | 禁止 | 禁止 | 不作 identity key 或授权依据 |
|完整 claims / organization assignments | 当前求值最小子集 | provider / policy owner 管理 | 禁止复制 | 禁止 raw dump | 只留最小 evaluation evidence |
| non-secret `authenticationEventRef` | 允许 | 可索引 | 最小 evidence 允许 | 可受控引用 | 不具有 bearer 能力、不可重新授权 |
| `sessionId` / runtime session reference | 单次 main 调用允许 | 禁止长期保存 | 禁止 | 禁止 | 与 token、subject 和长期证据分离 |
| provider raw error / response | 当前错误归类允许 | 禁止 | 禁止 | 只记稳定错误码 | 防止 token、claims 或 PII 泄漏 |

### 4. Runtime AuthoritySnapshot 与 Persistable AuthorityEvidence

`Runtime AuthoritySnapshot` 是单次在线求值结果，只在受信 main / Application Service 调用链内使用。它可以包含当前精确匹配所需的 raw provider subject、session reference、identity / policy validity 与 action context，但不能进入 renderer、日志、profile、Host、Harness、插件、SQLite、event、artifact、export 或 backup；过期、撤销、logout 或调用结束后不可重用。

未来 `Persistable AuthorityEvidence` 只能包含：

- 唯一 `authorityEvaluationId`；
- Policy Provider 已证明 scope 后由 vault 生成并查重的高熵随机 `subjectRef`，按 organization / audience 隔离；
- issuer identity / version / digest 与固定 audience；
- organization ref、核验后的 role ref；
- operation、`actionScope`、`effectClass`、`requiresDecision`；
- policy identity / version / digest；
- `evaluatedAt` 与 identity / policy 有效期边界；
- 非秘密、不可用于重新授权的 `authenticationEventRef`；
- 覆盖本次主体、岗位、操作与有效期的最小 policy evaluation evidence 或其可验证签名 / digest。

明确禁止持久化 `sessionId`、token、cookie、raw provider subject、姓名、邮箱、手机号、员工号、完整 claims、完整组织目录 / assignments、可重放 identity assertion / policy cache 和 provider 原始错误。`AuthorityEvidence` 只解释「当时为何允许」，永远不是授权缓存。

`subjectRef` 禁止由 raw `(issuer, subject)` 做无密钥 deterministic hash；否则删除 mapping 后仍可重算并重新关联。rotation、provider migration、organization merge / split 必须在一个受控事务或具补偿的 maintenance workflow 中维持 scope 内唯一性：要么原子迁移所有受治理引用，要么保留 versioned old→new mapping，直到引用迁移和删除回执均完成；旧 ref 与 mapping 在此之前继续受同一 retention、hold、export 与 purge 规则约束。mapping 已完成 purge 后，同一外部主体再次注册也必须生成新的随机 ref，不能恢复或重用旧 ref。

policy identity / version / digest 必须指向同期限可解释的 evidence。优先由 Policy Provider 产生本次求值的最小 canonical evidence；只有无法做到时，才在独立受限 archive 按 digest 保存 canonical policy，并单独治理其中的 subject assignment PII。不得只留下一个无法还原含义的 digest，也不得把完整组织目录复制到每个事项事件。

### 5. Offline 与撤销失败矩阵

| 场景 | projection read | mutation / decision / attempt / receipt | external / privileged side effect | 结果 |
| --- | --- | --- | --- | --- |
| identity + policy 在线、新鲜、精确匹配 | 允许 | 继续进入领域重验 | 副作用前再次求值 | resolver allowed 不等于领域批准 |
| provider / network unavailable | authority-scoped projection 拒绝 | 拒绝 | 拒绝 | 显示 unavailable，不匿名或 admin 降级 |
| identity / policy expired | authority-scoped projection 拒绝 | 拒绝 | 拒绝 | 必须重新认证 / 拉取政策 |
| logout / account disabled / token revoked | authority-scoped projection 拒绝并启动缓存清理 | 拒绝 | 拒绝 | 清本地 token、session、runtime snapshot 与受控 cache |
| role removed / policy revoked | authority-scoped projection 拒绝 | 拒绝 | 拒绝 | 旧 `AuthorityEvidence` 仅保留历史解释，不授予读取 |
| organization 切换 | 原 organization projection 立即拒绝 | 拒绝到新 mapping + policy 完成 | 拒绝 | 原子废弃旧 session context 与 org-scoped cache |
| 长任务已开始、即将写入或产生外部副作用 | 已渲染 authority 数据停止继续读取；仅显示非敏感 unavailable 状态 | 边界前重新求值 | 边界前重新求值 | 新求值失败则停止并留非敏感失败事实 |
| 未来显式 offline `local-read` 例外 | 仅批准的 public / local-only allowlist | 不适用 | 不适用 | 需数据分类、organization scope、最大陈旧时间、logout / revoke 清理、显式 UI 与 owner；本批不开启 |

本批没有 offline projection registry 或 allowlist，因此上述例外当前为空，实际 enforcement 是对所有 authority-scoped projection 默认拒绝。未来由产品与安全 owner 共同批准 registry 条目，WT-02D Application Service 执行 scope / staleness / session gate，renderer 只显示结果和清晰的 offline / unavailable 状态；未登记类型不能靠名称中的「非敏感」自行放行。

### 6. Retention matrix 模板与生产门

具体期限不能凭空写成 30 / 90 / 365 天。产品 / 合规 owner 必须在真实数据进入前逐类批准：

| 数据类别 | 处理目的 / owner | 起算事件 | 期限 | legal hold authority / 上限 | purge / export | backup 上限 | 删除传播目标 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| token / runtime session | 待定；原则为短生命周期 | logout / expiry / revoke | 不跨必要生命周期 | 不适用 | 立即清除；不导出 | 不进 backup | memory、vault、runtime cache |
| identity mapping | 待产品 / 合规 owner | account removal / relationship end | 待批准 | 有效 hold 时隔离、禁止产品访问并记 pending deletion；具名、限定范围、可到期 | 无 hold 则删除 / crypto-shred；hold 解除后立即幂等 purge；导出范围待定 | 待批准 | vault、索引、cache、backup catalog |
| AuthorityEvidence + policy evidence | 审计目的待批准 | matter conclusion / policy expiry 等待定 | 待批准且同期限 | 具名、可审计、可解除 | 成对 purge / export | 待批准 | event/audit store、projection、index、backup |
| denied authorization security log | 安全检测 owner 待定 | log creation | 独立短期限待批准 | 具名、有限 | 稳定错误码；不得含 raw token/claims | 默认不备份或独立上限 | log store、telemetry、export |
| artifact / 自由文本经营数据 | 业务 owner 待定 | matter / contract lifecycle 待定 | 待批准 | 具名、有限 | artifact delete 或 whole-stream purge | 待批准 | blob、locator、search/vector index、export、backup |

在该 matrix 获得批准且 enforcement、演练和 receipt 可验证前：

- 不向当前事件流写入真实身份或敏感经营数据；
- 不声称支持用户数据删除、可携带导出或 backup deletion；
- 不声称 pseudonym 已匿名化；
- 不用 accepted ADR 或 quick gate 替代生产合规验收。

### 7. 删除传播与恢复

1. account removal 立即调用 provider revocation（若支持）并清除本地 token、session、runtime snapshot；远端撤销失败不能保留本地登录。
2. token、runtime session 与 authorization cache 永远立即清除，不受 legal hold 保留。identity mapping、evidence 与 artifact 若无有效 hold，则删除 mapping / sidecar 或按合同 purge；若存在具名、合法、限定范围且未到期的 hold，则从产品访问面隔离、禁止用于认证 / 授权，并在 deletion ledger 记录 pending deletion。
3. 删除或隔离关联 projection、索引、search/vector cache、artifact/blob、telemetry、用户生成 export 和临时文件。
4. 对不含 raw PII 的追加式事实，按 retention 合同保留或 purge；若自由文本 / locator 已含 PII，不改写单行或伪造 hash chain，只走另行授权、幂等、可恢复、具 receipt 的 whole-stream purge / crypto-shredding。
5. deletion ledger / tombstone 记录目标集合和非 PII 结果；删除回执至少区分 `revoked`、`held-pending-purge`、`purged` 与 `propagation-incomplete`，任一传播目标失败时不得标记删除完成。
6. backup catalog 记录最长可恢复窗口；restore 后、重新开放数据前先重放 deletion ledger，防止已删除主体或事项复活。
7. legal hold 只能由具名 authority 基于记录的合法目的设立，必须限定数据类别 / subject / organization / 时间范围并可审计、到期或解除；不得静默覆盖删除请求。解除或到期后，pending deletion 与超过 retention 的数据立即进入幂等 purge。

### 8. 后续独立票

| Ticket | 只负责 | 前置 / 禁止 |
| --- | --- | --- |
| WT-02B.2B | 真实 OIDC adapter、system-browser callback、main-owned vault、refresh rotation / revocation、session lifecycle，并把 WT-02B.1 的 assertion organization 过渡接口迁移为 Policy Provider 独占 membership authority | 先给真实 issuer/client/redirect/audience/scopes、mapping/Policy owner、账户生命周期与 vault capability；不改 BusinessMatter v1，不接受 OIDC organization claim 授权 |
| WT-02B.3 | `Runtime AuthoritySnapshot → Persistable AuthorityEvidence` 纯转换、schema/version、maintenance lifecycle | 另行决定扩展 v1、schema v2 或独立 audit store；不把 snapshot 原样序列化 |
| WT-02C.0 | revision-bound compatibility target、runtime inventory、matrix owner 与 `matrixId` provenance 决策 | caller-supplied `equivalent`、Host 观测或历史插件装配不是 authority |
| WT-02C.1 | 纯 compatibility registry kernel 与对抗测试 | 受信 immutable matrix provider 才能产出 outcome；不接 UI / Host / BusinessMatter |
| WT-02D | 唯一 Application Service 编排 identity / policy → compatibility → BusinessMatter → Capability Adapter，并 enforcement 经独立批准的 offline projection registry | UI / Host / plugin 只提交意图或受控结果，不能直写事件、自报 authority 或自行判断「非敏感」 |

## Alternatives considered

### Sage-owned Identity Broker

长期可以统一多 IdP、passkey、账户合并、session epoch 与撤销，但当前会新增服务端、凭证、运维和安全责任。首版采用标准外部 OIDC；broker 保留为真实多租户需求出现后的独立决策。

### Device-local authority

Keychain 中的设备凭证适合作为明确标识的 local / personal 或开发模式，不是企业主体证明。它不能在 OIDC 不可用时静默接管真实账号或组织岗位。

### 直接保存 provider pairwise subject

实现简单，但把长期审计绑定到 provider 生命周期并扩大关联面。采用 Sage-owned opaque `subjectRef`，把 provider 映射放进可删除 vault。

### 原样保存 AuthoritySnapshot

拒绝。runtime snapshot 与审计 evidence 的字段、生命周期和删除义务不同；原样序列化会持久化 raw subject、`sessionId` 和不必要 provider 数据。

### Offline 使用缓存政策继续写入

拒绝。账号、岗位或政策撤销后仍可能产生不可逆副作用。首版只读，任何受保护行为在线重新求值；未来例外另立 allowlist 和撤销窗口。

### 统一固定 retention 天数

拒绝。处理目的、法定留存、legal hold、backup 与数据 owner 未定时，一个统一数字只是伪精确。未批准前维持真实数据写入门。

## Consequences

- 真实登录不会污染 renderer、Harness、插件或 `BusinessMatter`；token 只在 Electron main 的受控生命周期中存在。
- 组织授权仍由 Organization Policy 独占，换 IdP 或合并账号不会把 email / tenant claim 变成岗位事实。
- 长期审计保留当时授权的最小、可解释依据，同时不能被重放为当前权限。
- 首版 offline 行为更保守：网络或 authority 不可用时不能继续写入或产生副作用，但失败状态明确、可恢复且不会越权。
- 当前没有 retention matrix、删除传播实现和真实 provider，所以 WT-02B.2A 只能标记为治理落档；它不关闭完整 WT-02B、数据生产门或 P0-5。
- 新 UI 和插件的最终路径保持不变：WT-02D Application Service 注入受信身份和政策，完成 compatibility 与领域重验后，才允许 Capability Adapter 执行受控动作。

## Verification

本决策批完成的可验证结果只有：ADR / Note / 合同 / 计划 / agent 必读入口一致，机器账本可由 ADR 再生成，文档链接与 Sage quick gate 通过，且精确差异证明 v1、domain、codec、store、security source、main、product、Host、profile、package、lockfile、UI 与插件零改动。

任何真实 OIDC 登录、vault 读写、组织授权、`AuthorityEvidence` persistence、purge、backup restore 或产品调用链的完成声明，都必须由后续独立票给出源码、自动化与运行证据。
