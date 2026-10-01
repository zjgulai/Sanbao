# WT-02B.2E · 真实 Organization Policy Provider（本地 policy 文件）+ identity 会话端口 + Authority Runtime 组装（设计）

日期：2026-10-02 · 状态：设计已由用户逐节确认（2026-10-02），spec 待评审 · 上游：[ADR-0163](../../adr/ADR-0163.md) / [ADR-0164](../../adr/ADR-0164.md)、[organization mapping 内核迁移](../../notes/implemented/security/2026-10-02-wt02b2d-organization-mapping.md)（ADR-0186）、[Identity / Policy Resolver 架构记录](../../notes/proposed/architecture/2026-09-28-identity-policy-resolver.md)、[真实身份与 Authority 数据治理](../../notes/proposed/architecture/2026-09-28-real-identity-and-authority-data-governance.md)、[执行计划](../../plans/2026-09-24-sage-self-owned-desktop-execution-plan.md)

## 1. 目标与切片

WT-02B.2D 之后内核已迁移：`IdentityAssertion` 以 `identityHandle` 索引、`ActionAuthorizationRequest` 携带 `requestedOrganizationRef` 非权威线索、`authorize()` 以诚实性语义检查 provider 作答（答非所问 → `policy-organization-mismatch`）。但生产链路仍缺三件：

1. 没有任何真实 Organization Policy 源——生产 `resolveIdentityPolicy` 恒 fail-closed；
2. 没有真实 identity 端口——vault 只有 `identityHandle`，缺会话引用 / issuer 出处 / 时效（内核 assertion 需要）；
3. 没有 resolver 生产组装点（`createIdentityPolicyResolver` 只在测试中组装过）。

本票交付三者，让 resolver 从「纯内核」变为**可真实 resolve**。用户四决策（2026-10-02 逐题确认）：**policy 源 = 本地 JSON 文件**；**membership = instance-operator 单成员**；**范围 = provider + identity 端口 + 组装**（pipeline step-2 的 intent→请求组装语义留给 WT-02D.2）；**供给 = 手动配置 + 文档样例**。

端到端证据在本票落在**集成测试层**（真 vault + 真文件 + 真内核），不接 dispatch / command pipeline。零持久化、零日志、零网络。

## 2. Policy 文件合同

### 2.1 路径与供给

- 路径：`$SAGE_ROOT/organization-policy.json`（`paths.ts` 按既有 `activeProfileFile` 单文件模式增 `ORGANIZATION_POLICY_FILE` 常量与 `SagePaths.organizationPolicyFile` 字段）。与 `cordis.local.patch.yml` 同级——实例级可变配置，**不进不可变 generation**。
- 供给：手动创建（Note 内嵌完整样例与操作者说明）。未供给 → provider 抛错（`policy-provider-unavailable`，fail closed 如实状态）。
- 读取语义：**每次 resolve 重新读文件**（文件即真相；改策略无需重启）。~1 KiB 级同步读，主线程成本可忽略。
- 只读纪律：provider 只经注入的 `readFileBytes` 读 `policyPath` 一个路径；不列目录、不写、不访问网络。

### 2.2 Schema（严格 exact-shape，未知键拒绝）

```json
{
  "schemaVersion": "sage.organization-policy.v1",
  "organizationId": "organization:sage",
  "policy": { "identity": "policy:local", "version": "1" },
  "validFrom": "2026-10-01T00:00:00Z",
  "expiresAt": "2027-10-01T00:00:00Z",
  "membership": { "mode": "instance-operator", "roleRefs": ["role:owner"] },
  "grants": [
    { "roleRef": "role:owner", "operation": "business-matter.start-attempt",
      "actionScope": "catalog.prepare-draft", "effectClass": "local-write", "requiresDecision": false }
  ]
}
```

| 字段 | 规则 | 违规 |
| --- | --- | --- |
| `schemaVersion` | 精确 `'sage.organization-policy.v1'` | invalid |
| `organizationId` | exact string（非空、`value === value.trim()`） | invalid |
| `policy.identity` / `policy.version` | exact string；**文件不含 digest**（digest 由 provider 计算，作者不可伪造） | invalid |
| `validFrom` / `expiresAt` | exact ISO UTC timestamp（regex + `Date.parse` + `toISOString()` 往返一致） | invalid |
| `membership.mode` | 精确 `'instance-operator'`（其他值一律拒绝，不做前向兼容猜测） | invalid |
| `membership.roleRefs` | 非空数组、逐项 exact string、无重复 | invalid |
| `grants` | 数组（**允许为空**＝全部拒绝的显式锁定配置）；逐项 exact object 五键；`effectClass ∈` 五枚举（`local-read/local-write/external-read/external-write/privileged`）；`requiresDecision` 为 boolean；(`roleRef`,`operation`,`actionScope`) 三元组无重复 | invalid |
| 未知键（顶层与嵌套） | 拒绝 | invalid |
| 文件大小 | ≤ 256 KiB（`MAX_POLICY_BYTES`） | invalid |

时间戳字段的形状校验只做格式；**有效期语义检查（是否 active）由内核 `isActive` 执行**（`policy-not-active`），provider 不重复判定。`roleRefs` 中声明但未在 `grants` 出现的角色合法（该角色无任何 operation；且 grants 可引用未声明角色——内核自然过滤）。

### 2.3 信号二分（映射内核错误码）

provider `resolve(request)` 的返回契约（对齐内核端口 `(request) => unknown`）：

| 情形 | provider 信号 | 内核结果码 |
| --- | --- | --- |
| 文件缺失 / 不可读（ENOENT、权限、其他 I/O） | **throw**（稳定消息，内核丢弃不回显） | `policy-provider-unavailable` |
| 文件存在但超限 / JSON 坏 / schema 违规 | **返回 `null`** | `policy-snapshot-invalid` |
| 合法 | 返回 snapshot 对象（见 §2.5） | 进入内核后续检查 |

### 2.4 digest 规范

canonical 投影（键序显式、无空格；列表排序使 digest 对文件书写顺序不敏感）：

```text
canonical = JSON.stringify({
  schemaVersion, organizationId,
  policy: { identity, version },
  validFrom, expiresAt,
  membership: { mode, roleRefs: sorted(roleRefs) },
  grants: sorted(grants, by roleRef, then operation, then actionScope)
          .map(({roleRef, operation, actionScope, effectClass, requiresDecision}) =>
               ({roleRef, operation, actionScope, effectClass, requiresDecision})),
})
digest = 'urn:sage:organization-policy:sha256:' + sha256hex(utf8(canonical))
```

排序比较沿用 PMAP 的 code-unit 比较（`a < b ? -1 : a > b ? 1 : 0`）。golden 手写期望值对拍（§5）。

### 2.5 membership 语义（instance-operator，精确如实）

文件声明「本实例的操作者持有这些岗位」。resolve 时 provider 把**请求方** `identityHandle` 绑定到声明的 `roleRefs`：

```text
roleAssignments = sorted(roleRefs).map(roleRef => ({ identityHandle: request.identityHandle, roleRef }))
```

**如实限制（写入 Note 与 ADR）**：v1 无法区分多成员——任何通过已配置 IdP 验证的登录在本实例均被视作操作者；逐主体区分需要持久化身份映射，被 retention 门禁止（[治理记录](../../notes/proposed/architecture/2026-09-28-real-identity-and-authority-data-governance.md) §6），留未来形态。文件里零身份材料（无 raw subject、无映射、无 handle）。

provider 不使用请求中的 `requiredRoleRef` / `operation` / `actionPolicy`（成员绑定 + 原文透传）；组织诚实性由内核检查（§3.5 矩阵）。

### 2.6 Snapshot 构造

```text
{
  policy: { identity, version, digest },          // digest 为 §2.4 计算值
  organizationId,                                  // 文件原文
  validFrom, expiresAt,                            // 文件原文
  roleAssignments,                                 // §2.5 绑定
  grants,                                          // 排序后的规范化五键对象
}
```

## 3. 运行时链路

### 3.1 vault 会话语境扩展（`src/main/token-vault.ts`）

```ts
export interface VaultSession {
  readonly accessToken: string
  readonly idToken: string
  readonly displayName: string | null
  readonly identityHandle: string
  readonly issuer: string          // 新增：exact verified iss（非秘密出处）
  readonly authenticatedAt: string // 新增：本地接受时刻 ISO UTC
  readonly expiresAt: string       // 新增：verified id_token exp 的 ISO UTC
}

export interface VaultIdentitySession {   // 新增：main 内部会话语境
  readonly sessionRef: string
  readonly identityHandle: string
  readonly issuer: string
  readonly authenticatedAt: string
  readonly expiresAt: string
}

export function createTokenVault(options: { readonly mintSessionRef: () => string }): TokenVault
```

- `sessionRef`：**随机、非 bearer、非秘密**的会话引用，`signIn` 被接受时经注入 `mintSessionRef` 铸一次（新 signIn → 新 ref；`beginPending`/被 supersede 的 signIn 不铸）。
- `authenticatedAt` = 本地接受时刻（deviation 说明：不用 token `iat`，避开 IdP 时钟偏差导致 `authenticatedAt > evaluatedAt` 的假 `identity-not-active`）。
- `expiresAt` = verified `claims.exp`（内核已保证为有限数）。
- 访问器：`identityHandle()` 与新的会话语境重叠 → **合并为 `identitySession(): VaultIdentitySession | null`**（2C 表面小改，登记 Note）。`snapshot()` 不变（零泄漏）。
- 三新字段均非秘密（issuer 出处、会话时序）；token 本体零读取出口不变。

### 3.2 adapter 扩展（`src/main/oidc-adapter.ts`）

verified claims 后 `signIn` 携带 `issuer: claims.iss`、`authenticatedAt: new Date(deps.now()).toISOString()`、`expiresAt: new Date(claims.exp * 1000).toISOString()`。既有守卫（iss/sub string check）不变。

### 3.3 policy provider（`src/main/organization-policy.ts`，新增）

纯内核风格（零 fs import；对齐 PMAP 的注入纪律）：

```ts
export const ORGANIZATION_POLICY_SCHEMA = 'sage.organization-policy.v1' as const
export interface LocalOrganizationPolicyProvider {
  readonly resolve: (request: PolicyProviderRequest) => unknown
}
export function createLocalOrganizationPolicyProvider(input: {
  readonly policyPath: string
  readonly readFileBytes: (absolutePath: string) => Buffer   // main 注入 readFileSync
}): LocalOrganizationPolicyProvider
```

职责：§2.2 校验、§2.4 digest、§2.5 绑定、§2.6 构造、§2.3 信号二分。**不可信输入是文件内容**（request 由内核组装并被内核校验、冻结，provider 直接使用其 `identityHandle` 绑定）；对文件解析内容沿用内核/PMAP 同款 exact-record 守卫纪律（own-property descriptor、枚举断言、列表逐项校验）。`EFFECT_CLASSES` 按本仓既有多模块各自定义本地冻结元组的模式（domain / kernel / registry / compatibility 均如此），不新增跨模块运行时导入。

### 3.4 identity 端口 + 组装（`src/main/authority-runtime.ts`，新增）

```ts
export const SAGE_DESKTOP_AUDIENCE = 'sage-desktop'
export interface SageAuthorityRuntime {
  readonly resolve: (request: unknown) => IdentityPolicyResolution
}
export function createSageAuthorityRuntime(input: {
  readonly vault: TokenVault
  readonly policyPath: string
  readonly readFileBytes: (absolutePath: string) => Buffer
  readonly now: () => string   // ISO UTC；production 注入系统时钟
}): SageAuthorityRuntime
```

- 组装 `createIdentityPolicyResolver({ audience: SAGE_DESKTOP_AUDIENCE, resolveIdentity, resolvePolicy, now })`。
- `resolveIdentity`：`vault.identitySession()` 为 null → throw（→ `identity-provider-unavailable`）；否则返回 assertion：
  - `issuer: { identity: session.issuer, version: '1', digest: 'urn:sage:issuer-identity:sha256:' + sha256hex(session.issuer) }`——`version '1'` 为该 identity 记录版本（本仓首次落 v1；语义写入 Note）；
  - `identityHandle: session.identityHandle`；`audience: SAGE_DESKTOP_AUDIENCE`；
  - `sessionId: session.sessionRef`（**返回值取活动会话**，不回声调用方线索——调用方持有过期 ref 时内核 `identity-session-mismatch` 如实命中）；
  - `authenticatedAt` / `expiresAt` 取会话语境。
- `resolvePolicy`：直接转发 `localOrganizationPolicyProvider.resolve`。

### 3.5 失败码矩阵（全走既有内核错误码集合，零新增）

| 场景 | 结果码 |
| --- | --- |
| 未登录 / 无活动会话 | `identity-provider-unavailable` |
| 调用方 sessionRef 线索 ≠ 活动会话 | `identity-session-mismatch` |
| id_token 已过期（evaluatedAt ≥ expiresAt） | `identity-not-active` |
| policy 文件缺失 / 不可读 | `policy-provider-unavailable` |
| 文件存在但 JSON/schema 坏 / 超限 | `policy-snapshot-invalid` |
| 组织线索 ≠ 文件组织（答非所问） | `policy-organization-mismatch` |
| policy 过期 / 未生效 | `policy-not-active` |
| 岗位未持有 / operation / actionScope / effectClass / requiresDecision 不匹配 | 既有 `policy-*` 系列 |

### 3.6 接线边界

- `main/index.ts` 只改 vault 构造（注入 `mintSessionRef: () => randomBytes(32).toString('base64url')`）。
- **不接 dispatch**：`createSageAuthorityRuntime` 本票不进入 `main/index.ts` 构造（无真实消费者；intent→请求组装属 D.2，接上即为死代码）。
- `paths.ts` 增 `organizationPolicyFile`，被集成测试消费（按约定放置文件）并锚定操作者文档路径。

## 4. 文件结构

```text
apps/sage-shell/src/main/organization-policy.ts     # 新增：本地 policy provider（纯内核，注入读取）
apps/sage-shell/src/main/authority-runtime.ts       # 新增：identity 会话端口 + 内核组装
apps/sage-shell/src/main/token-vault.ts             # 扩展：会话语境五字段 + mintSessionRef + identitySession()
apps/sage-shell/src/main/oidc-adapter.ts            # 扩展：signIn 携带 issuer / authenticatedAt / expiresAt
apps/sage-shell/src/main/index.ts                   # 构造器接线（mintSessionRef）
apps/sage-shell/src/profile/paths.ts                # 增 ORGANIZATION_POLICY_FILE + organizationPolicyFile
apps/sage-shell/test/organization-policy.spec.ts    # 新增
apps/sage-shell/test/authority-runtime.spec.ts      # 新增（集成）
apps/sage-shell/test/token-vault.spec.ts            # 更新（构造器 / payload / identitySession / ref 易主）
apps/sage-shell/test/oidc-adapter.spec.ts           # 更新（三新字段落库断言）
apps/sage-shell/test/appservice-route-fixture.spec.ts  # 更新（构造器）
```

## 5. 测试与验收

**`organization-policy.spec.ts`（单元）**
1. 合法文件 → snapshot：`roleAssignments` 绑请求方 handle（不同请求 handle → 绑各自）；grants 排序规范化；`policy.digest` 手写 golden；`organizationId` / 时效原文透传；
2. digest 顺序不敏感：roleRefs 与 grants 书写顺序交换 → digest 相同；
3. 缺失 / 不可读（注入 readFileBytes 抛错）→ throw；
4. 坏 JSON / 超限 → null；
5. schema 违规逐项 → null（未知顶层与嵌套键、schemaVersion 错、空串与未 trim、坏时间戳、mode 非 instance-operator、roleRefs 空 / 重复 / 非 string、grants 非对象 / 枚举错 / requiresDecision 非 boolean / 三元组重复）；
6. 新鲜度：改写文件（改 version）→ 同 provider 下一次 resolve 得到新 digest（无缓存）；
7. 只读断言：`readFileBytes` 只收到 `policyPath` 一个路径。

**`authority-runtime.spec.ts`（集成：真 vault + 真文件 + 真内核）**
1. 未登录 → `identity-provider-unavailable`；
2. 登录（signIn 含新字段）→ resolve（sessionRef 线索＋组织线索＋role/operation/actionPolicy）→ authorized：`AuthoritySnapshot` 逐字段（issuer identity/version/digest、identityHandle、organizationId=文件、roleRef、operation、actionPolicy、policy digest、时效、evaluatedAt）；deep freeze；
3. 组织线索 ≠ 文件 → `policy-organization-mismatch`；
4. 旧 sessionRef（重新 signIn 后用前一个 ref）→ `identity-session-mismatch`；
5. `expiresAt` 已过（注入 now 控制）→ `identity-not-active`；
6. 文件缺失（登录态）→ `policy-provider-unavailable`；
7. signOut 后 → `identity-provider-unavailable`；文件热改 → 新 digest 生效；
8. 零写入：resolve 全程无 fs 写 / 无网络（注入面断言）＋ vault `snapshot()` 无泄漏字段。

**既有 spec 更新**
- `token-vault.spec.ts`：构造器注入、新 payload、`identitySession()` null / 五字段、新 signIn 换 ref、`snapshot()` 不变、signOut 清空；
- `oidc-adapter.spec.ts`：三新字段落库断言（issuer / expiresAt 源自 fixture token claims）；
- `appservice-route-fixture.spec.ts`：构造器适配。

**变异验证（≥3，改源→红→还原后逐行核对）**
- M1 provider 绑定换常量 handle → 集成 authorized 路径红；
- M2 digest 不排序（或 canonical 键序篡改）→ golden 红；
- M3 identity 端口 `sessionId` 回声调用方线索 → 旧 ref 用例红；
- M4 absent 与 invalid 混淆（缺失返回 null / 坏文件抛错）→ 矩阵用例红。

**收口**：`npm run typecheck && npm test && npx tsc && npm run smoke`（apps/sage-shell）；仓根 `pnpm run gate`；Note（`docs/notes/implemented/security/2026-10-02-wt02b2e-organization-policy-provider.md`，内嵌完整样例 + 操作者说明）+ ADR-0188 + ledger；feat + docs 两提交推送。

## 6. 边界（不做）

- **不接 dispatch / command pipeline**：intent→`ActionAuthorizationRequest` 组装与 step-2 端口接线属 WT-02D.2（retry 的 availability-only 语义未定义，不猜）；
- **candidate org claims**（Logto organizations scope）留队列 ③；
- **refresh rotation / revocation**：本票会话授权窗 ≤ id_token 寿命，过期即拒 → 重新登录；refresh 属后续票；
- 多成员 membership、管理 UI、供给自动化、admin 工具；
- `AuthorityEvidence` 持久化 / 转换（WT-02B.3，retention 门）；offline 例外（当前恒空）；
- 零持久化 / 零日志 / 零网络 / 不读 `.credentials.yaml`；不修改内核（`identity-policy.ts` 零改动）、v1 event schema、domain、store。

## 7. 遗留登记

| 项 | 归属 |
| --- | --- |
| intent→请求组装 + step-2 端口接线 | WT-02D.2 |
| candidate org claims 提取 | 队列 ③ |
| refresh rotation / revocation、账户生命周期 | 后续 B 线票 |
| 多成员 membership（需 retention 批准 + 管理面） | 未来形态 |
| 供给自动化 / 首启脚手架 | 产品裁决后 |
| `AuthorityEvidence` 转换与持久化 | WT-02B.3 |
