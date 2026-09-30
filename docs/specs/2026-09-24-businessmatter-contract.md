# BusinessMatter 领域与权威事件存储合同

- 初始日期：2026-09-24
- WT-01 更新：2026-09-27
- WT-02A.0 更新：2026-09-27
- WT-02A.1 更新：2026-09-27
- WT-02A.2 更新：2026-09-27
- WT-02A.3A 更新：2026-09-27
- WT-02A.3B 更新：2026-09-28
- WT-02B.1 更新：2026-09-28
- WT-02B.2A 更新：2026-09-28
- WT-02C.0 更新：2026-09-28
- WT-02C.1 更新：2026-09-28
- WT-02C.1A 更新：2026-09-28
- WT-02C.1B 更新：2026-09-28
- 状态：WT-01 纯内存领域内核、WT-02A.1 纯领域 codec / strict rehydrator、WT-02A.2 Sage-owned file-backed SQLite store、WT-02A.3A 进程级对抗、WT-02A.3B POSIX 路径边界、WT-02B.1 Identity / Policy Resolver security kernel、WT-02C.1 fixed-fixture resolver 与 WT-02C.1B MatrixV2 / stable-key resolver kernel 已在当前未提交工作树实现并通过对应本地自动化验证，尚不是 `HEAD` / 提交基线；WT-02B.2A 与 WT-02C.1A 仍只是治理合同；WT-02B.1 仍只输出内存中不可变的 runtime `AuthoritySnapshot` provenance，完整 WT-02B、真实 provider、产品接线和持久化 authority 仍未完成；WT-02A.3B 只证明测试临时 Sage root 内的固定路径与可观察 boundary mismatch fail-closed，产品数据根接线、same-UID 持久 filesystem capability 与生产数据门仍未关闭；仍未接入 renderer、Capability Adapter、Host、DSH、真实 profile 或外部动作
- WT-02C 边界：WT-02C.0 已完成治理决策；WT-02C.1 保留 fixed-fixture v1 resolver，WT-02C.1A 决定双层合同，WT-02C.1B 已在独立 security kernel 实现 MatrixV2 / stable-full digest derivation、binding validation 与 no-v1-fallback；以上仍不证明 matrix 发布 provenance、trusted provider / clock、可信 live runtime inventory、Capability Registry、`CompatibilityEvaluationEvidence` 持久化、Application Service、插件授权或真实产品调用
- 术语基线：[根术语表](../../CONTEXT.md)
- 决策输入：[ADR-0159](../adr/ADR-0159.md)、[ADR-0161](../adr/ADR-0161.md)、[ADR-0163](../adr/ADR-0163.md)、[ADR-0164](../adr/ADR-0164.md)、[ADR-0165](../adr/ADR-0165.md)、[ADR-0166](../adr/ADR-0166.md)、[权威事件存储交接](../notes/proposed/architecture/2026-09-27-business-matter-event-store.md)、[Identity / Policy Resolver 交接](../notes/proposed/architecture/2026-09-28-identity-policy-resolver.md)、[真实身份与 Authority 数据治理](../notes/proposed/architecture/2026-09-28-real-identity-and-authority-data-governance.md)、[Compatibility Authority](../notes/proposed/architecture/2026-09-28-compatibility-authority.md)、[Sage 自有桌面端执行方案](../plans/2026-09-24-sage-self-owned-desktop-execution-plan.md)
- 恢复来源：迁移前候选合同由恢复集 Git blob `50ff4acd4b4999808255877945ce5ed5447ededf` 单文件恢复后更新；原始 SHA-256 为 `731d22dcf231977c429e92d619bfb4dd32aa4426f446afde472c5e585afd3c32`

## 1. 范围与非范围

`BusinessMatter` 是代码和契约中的英文类型名；面向业务与中文界面的规范名称是“经营事项”。它是一次可追溯经营交付的领域根：把范围及其版本、证据及未知、可比较选项、依赖就绪度、人工决定、活动尝试、产物、回执与经验引用放在同一条追加式事实链上。

WT-01 只实现纯内存领域合同与投影：

- WT-01 的受信输入是由领域 command API 产生的追加式内存事件链；`projectBusinessMatter()` 只从该受信链生成当前 projection，不解析或验证持久化 bytes，也不是 strict rehydrator。
- 每次转换返回新的 `BusinessMatter`，不修改调用方持有的旧事件链。
- 源码没有文件、网络、数据库、Electron、Cordis、模型、工具或环境变量 I/O。
- 测试数据全部是固定 fixture，不读取真实业务资料、旧 DSH、profile 或用户目录。

WT-01 不实现：

- Sage 页面、路由、API、Capability Adapter、Host 或 DSH 接线；
- 事实存储、加密、访问控制、删除、导出、并发控制或跨进程恢复；
- 真实身份认证、组织权限或审批系统；
- 真实模型、Agent、Preset、Capability 探测，或任何外部读写动作；
- P0-3B 旧资料导入、profile/materialization、Bundle ID、打包或发布。

因此，WT-01 的自动化绿灯只能证明领域合同在内存中的行为，不证明产品闭环、外部动作、人工身份、GUI 或生产验收。

WT-02A.0 只接受并记录第 9 节的持久化合同。WT-02A.1 已在当前未提交工作树新增 v1 纯领域 codec、strict rehydrator 与对抗测试。WT-02A.2 已在同一未提交工作树新增测试临时 Sage root 内的单 connection file-backed SQLite store：它实现 schema identity、typed load / append、资源预检、`recordedAt`、SHA-256 digest / fingerprint、顺序 CAS、幂等账和单事务批次；不实现通用 migration，也不接产品运行时。WT-02A.3A 已在临时数据库内验证真实 `SQLITE_BUSY`、两个独立进程的 CAS、事务中点故障、ACK 丢失、hard kill / reopen 与直接数据库篡改。WT-02A.3B 已在测试创建的临时 Sage root 内验证固定路径派生、legacy root 隔离、symlink / hardlink、owner / mode、sidecar、父目录替换、事务中漂移与 outcome-unknown；受 Node path-only API 限制，same-UID swap-open-restore 与真实产品 data root 仍是生产门。`accepted` ADR、本合同或自动化绿灯本身都不证明物理断电、产品接线或生产验收。

WT-02B.1 只建立独立 security kernel：revision 9 从测试 Identity Provider 与 Organization Policy Provider 获取主体、过渡 organization、岗位和操作授权事实，并输出 canonical `HumanRoleRef` 与不可变的 `AuthoritySnapshot` provenance。revision 10 已决定真实产品的 IdP 只证明 `(issuer, subject)`，identity mapping 只给内部 handle / candidate org，Organization Policy Provider 独占 active membership、岗位和操作授权；当前 assertion organization 必须在 WT-02B.2B 接真实 provider 前迁移。调用方只能提交 session、待核验岗位、operation 和 action policy，不能自报 organization、actor 或 subject；UI、HTTP body、插件、Host、OS 用户或既有 `HumanRoleRef` 也不能成为认证或授权证据。它不复制或替代 `BusinessMatter` 对 revision、action policy、decision、attempt、artifact 和 receipt 的领域判断，也不修改 v1 event schema。真实 provider、identity authority、PII / retention、Application Service、Capability Adapter 与新 UI 接线仍属于后续集成门。

WT-02C.0 只记录 Compatibility Authority 合同，不修改本文件所描述的 v1 event shape 或领域 API。它把当前 caller-supplied `ExecutionSnapshot` / `CompatibilityDecision` 明确限定为纯领域内部 DTO 和测试 fixture 形态；生产调用方不得直接构造它们。WT-02C.1 已在独立 security module 实现 fixed-fixture 纯 resolver，但没有接到本领域对象或产品入口。未来只能由 WT-02D Application Service 将受信 target、main-owned inventory 与 immutable matrix 经纯 resolver 得到的 resolution 转换为领域 DTO，并在同一受控调用链中立即执行 command；在此之前，源码调用方仍可直接构造测试 DTO，真实产品边界仍未形成。

## 2. 领域权威、身份与不可变量

| 身份 | 最小语义 | 不可变规则 |
| --- | --- | --- |
| `matterId` | 一条经营事项的稳定身份。 | 不因重试、换模型、换 Agent、换 Preset 或 runtime generation 而改变。 |
| `revisionId` | 范围、权限边界、数据目的地、证据、未知、选项、依赖、经验引用和动作政策的快照。 | 只能由 `revision-entered` 创建；任何边界变化都创建新 revision，并保留 `predecessorRevisionId`。 |
| `eventId` | 追加事实或导致状态变化的事件身份。 | 全事项唯一；重复即拒绝，不能覆盖旧事件。 |
| `attemptId` | 针对一个 revision 的一次运行或重试。 | 绑定动作政策、decision 引用、Provider/Model/Agent/Preset/Capability 版本快照和兼容矩阵结果；重试必须使用新 ID。 |
| `decisionId` | 对一个 revision 下精确 `actionScope` 的人工批准或拒绝。 | 缺失、错 revision、错 scope、被撤回、被拒绝或已过期都不能授权动作。 |
| `artifactId` | 一次成功结束 attempt 形成的候选产物。 | 绑定 producing attempt；产物存在不等于事项完成。 |
| `receiptId` | 责任人对一个 artifact 的接受或拒绝回执。 | 只有接受回执可形成 `completed`；拒绝回执进入失败/重试并保留原产物。 |
| `experienceRef` | 既有经验的不可变引用。 | 只进入新 revision；不能事后附加或改写旧 revision。 |

创建事件只产生 `matterId`、目标和人工责任角色，不制造空 revision、attempt、decision、artifact 或 receipt。首次进入证据必须同时给出非空范围、权限边界、数据目的地、显式数组，以及至少一条证据或一个显式未知；否则整个事件被拒绝。

所有旧 revision、失败 attempt、拒绝/撤回 decision、artifact 和 receipt 均保留。后追加事件的 `occurredAt` 不得早于日志末事件，证据观察时间不得晚于创建它的 revision 事件。任何函数失败都抛出带稳定 `code` 的 `BusinessMatterError`，调用方原事件链不变。

## 3. Revision 快照合同

每个 revision 固定以下事实：

- `scope`：本 revision 允许交付的业务范围；
- `permissionBoundary`：本 revision 的权限边界；
- `dataDestination`：数据和产物的目标边界；
- `evidence[]`：带来源、观察时间和 `supported | insufficient | contradicted` 状态的证据；
- `unknowns[]`：显式未决项；空数组表示已声明“无未决项”，不是字段缺失；
- `options[]`：显式选项集合，可为空；
- `dependencies[]`：`ready | blocked | unknown`；
- `experienceRefs[]`：来源 revision/event 与 `adopted | adapted | rejected` 关系；
- `actionPolicies[]`：精确 `actionScope` 的效果分类与决定要求。

进入运行前必须同时满足：至少一条 `supported` 证据、没有未解决 unknown、所有依赖均为 `ready`、每个拟运行 action 都存在政策、执行身份快照完整、兼容矩阵结果为 `equivalent`，以及所有 `requiresDecision` 动作持有匹配且有效的批准。

业务范围、权限边界、数据目的地或动作效果分类变化一律通过新 revision 表达。WT-01 不提供原地更新 revision 的 API。

## 4. 六段状态机

阶段是事件投影，不是页面路由。未列出的转换一律 fail-closed。

| 段 | 合法入口与出口 | 核心不可变量 |
| --- | --- | --- |
| 1. `created` | 创建后只能进入 `evidence`。 | 没有 revision 就不能运行。 |
| 2. `evidence` | 可进入 `running` 或 `clarification`；失败复核后也回到此段。 | revision 是不可变快照；证据不足、未知或依赖未就绪时不能创建 attempt。 |
| 3. `running` | 可进入 `clarification`、`artifact-receipt` 或 `failed-retry`。 | 同时只能有一个 active attempt；运行身份不能原地替换。 |
| 4. `clarification` | 匹配批准后可进入 `running`；补充事实时创建新 revision 回 `evidence`；拒绝进入 `failed-retry`。 | 未答复不是批准；decision 必须精确绑定 revision 和 actionScope。 |
| 5. `artifact-receipt` | 接受回执形成 `completed`；拒绝进入 `failed-retry`；完成后的新要求用新 revision 回 `evidence`。 | artifact 不是 receipt；receipt 必须带结论、人工角色与证据引用。 |
| 6. `failed-retry` | 同 revision 重新核对后回 `evidence`，或创建新 revision，或形成 `stopped`。 | 失败事实与旧 attempt 永不删除；重试使用新 attemptId。 |

```text
created → evidence
evidence → running | clarification
running → clarification | artifact-receipt | failed-retry
clarification → evidence(new revision) | running | failed-retry
artifact-receipt → completed | failed-retry | evidence(new revision after completion)
failed-retry → evidence(reconfirmed/new revision) | stopped
```

`completed` 与 `stopped` 是当前 revision 的结论，不增加第七或第八阶段。后续工作必须通过新 revision 回到证据段。

## 5. 已确认的 D2–D5 决策

### D2｜动作政策是两个独立维度

每个 `actionScope` 同时声明：

1. `effectClass`：`local-read | local-write | external-read | external-write | privileged`；
2. `requiresDecision`：是否必须持有人工批准。

领域层不从效果类别暗推授权，也不从“已选择 Agent/Preset”“Adapter ready”“模型已输出”暗推批准。未知效果类别直接拒绝；需决定动作缺少、错配、拒绝、撤回或过期 decision 均不得创建 attempt。

### D3｜WT-01 只使用进程内存

事件数组是测试切片内的权威事实，不写 localStorage、profile、generation、旧 `~/.dsh`、文件或数据库。该决定故意避免在 P0-3B 和事实保留策略未确认前制造错误持久化边界。

这是 WT-01 的历史阶段约束，不把 P0-3B 变成新的 Sage-owned event store 前置依赖。ADR-0161 只允许建立与旧 DSH 隔离的新库；它既不读取或解除 P0-3B，也不关闭 retention、purge、export、backup 等真实数据生产门。

### D4｜回执责任只做结构约束

`recordReceipt()` 要求 actor 为 `human`，且 `roleRef` 与事项责任角色一致。它只证明领域记录中的角色引用一致，**不证明登录身份、签名真实性、组织授权或不可抵赖性**。真实认证与授权系统仍是后续集成门。

### D5｜执行身份与兼容矩阵 fail-closed

每个 attempt 固定 Provider、Model、Agent、Preset 与每项 Capability 的 `identity + version + digest`，以及 `matrixId + outcome + reason`：

- `equivalent`：允许对同一 revision 创建新的 attempt；
- `requires-new-revision`：当前 revision 不得运行，调用方必须创建新 revision；
- `unknown`、缺少 identity/version/digest、缺少 matrixId/reason：全部阻断。

attempt 已开始后不能原地替换模型、Agent、Preset 或 Capability。必须先以 `execution-snapshot-changed` 结束旧 attempt，重新核对当前 revision，再以新 `attemptId` 和完整快照启动；旧 attempt 保留为失败事实。

上述规则是 `BusinessMatter` 的最后一道领域门，不是 Compatibility Authority。当前 `CompatibilityDecision` 的对象形状不携带可信来源；手写 `equivalent` 只允许用于领域 fixture 或受控内部测试，不能成为生产产品 API。生产路径必须遵守 [ADR-0165](../adr/ADR-0165.md)：调用方只提交 intent，Application Service 从当前 revision 取得 target、从 Electron main 取得可信 inventory、从 immutable matrix provider 取得规则并调用纯 resolver；只有该 resolution 才能被转换为当前 v1 DTO。Host ready、profile receipt、Loader/MCP observation、package/SemVer 或 live probe 都不能自动产生 `equivalent`。

## 6. 纯领域 API 与责任边界

| API | 领域效果 |
| --- | --- |
| `createBusinessMatter()` | 追加创建事件，不创建空 revision。 |
| `enterEvidence()` | 校验完整快照，追加新 revision，并关联 predecessor。 |
| `requestClarification()` | 从 evidence/running 进入澄清；运行中的 attempt 被保留为 blocked。 |
| `recordDecision()` / `revokeDecision()` | 记录批准、拒绝或执行前撤回；不执行动作。 |
| `startAttempt()` | 在全部证据、政策、decision、版本和兼容门通过后创建 attempt。 |
| `failAttempt()` | 保留失败来源、原因和影响，进入失败/重试。 |
| `reconfirmRevision()` | 只在同 revision 仍等价且证据就绪时回到 evidence。 |
| `recordArtifact()` | 结束 active attempt 并记录候选产物；不产生完成结论。 |
| `recordReceipt()` | 记录责任人接受/拒绝；只有接受形成完成结论。 |
| `stopMatter()` | 只从失败/重试形成 stopped。 |
| `projectBusinessMatter()` | 从由领域命令路径产生的受信事件链重建当前 projection；没有隐藏持久状态。它不是磁盘输入的 runtime decoder 或严格 rehydrator。 |
| `encodeBusinessMatterEvents()` | 将领域 factory 产生的受信 aggregate 编码为 v1 内存 envelope；不写文件或数据库。 |
| `rehydrateBusinessMatter()` | 从 `unknown` 开始验证 envelope、payload 与 event-specific runtime shape，再逐事件复用 public command API 重放并核对完整事件。 |

经 public command API 或当前 `rehydrateBusinessMatter()` verified path 之外，运行时、模型、工具、Adapter、UI 或 artifact 都不得直接生成 receipt 或 `completed`。`projectBusinessMatter()` 只接受由 module-private factory registry 登记的 aggregate，仍不构成磁盘输入 decoder。

## 7. WT-01 / WT-02A.1 场景与反例

正向场景是“商品内容到上架准备”：责任人创建事项，证据 revision 将动作限定为生成待审内容包，执行身份和等价矩阵被快照到 attempt，运行生成候选 artifact，最后由事项责任角色写入人工接受 receipt。该链不执行上架，也不把内容包存在误写为已上架或已授权。

自动化反例覆盖：

- 空证据且无显式未知时拒绝 revision；
- unknown 或 blocked/unknown dependency 阻断 attempt；
- 未知 effect class 阻断；五种已知 effect class 可与 `requiresDecision` 独立组合；
- decision 缺失、前序 revision 错配、过期、撤回和拒绝均 fail-closed；
- 兼容结果 unknown / requires-new-revision、以及任一版本摘要缺失均阻断；
- active attempt 不能原地切换执行身份；显式失败、复核、新 attempt 保留完整旧链；
- 经领域 command API 产生的事件链在运行时深度冻结，事件时间单调追加且拒绝未来证据；一般性澄清必须形成新 revision，不能不落事实就直接重跑；
- artifact 没有接受 receipt 时不得完成；`recordReceipt()` 会拒绝错误人工角色；
- rejected receipt 后复核并产生新 artifact 时，旧 artifact 不能冒充当前 latest pending artifact 获得接受回执；
- 工具失败后不能追加成功 artifact/receipt；拒绝回执进入失败/重试；
- `stopped` 只能从失败/重试产生。

WT-02A.1 另覆盖：复制可枚举 Symbol 不能伪造可信 aggregate；未知 type/schema、版本缺口、重复 event ID、matter identity 错配、非法 UTF-8 / JSON、非 exact envelope、accessor / revoked Proxy，以及全部 11 类事件 payload 的字段集合、嵌套容器、数组成员和 UTC 时间畸形均具名 fail-closed；两条独立合法历史覆盖全部 11 类事件，并经 public command replay、完整事件 equality 与 canonical v1 payload bytes 核对后才接受。

## 8. 本地验证证据

2026-09-27 已执行：

| 命令 | 结果 | 证明范围 |
| --- | --- | --- |
| `pnpm --dir apps/sage-shell exec vitest run test/business-matter.spec.ts` | PASS，1 文件 / 29 测试 | WT-01 正向链、运行时不可变性与对抗性反例。 |
| `pnpm --dir apps/sage-shell typecheck` | PASS | 领域源码符合现有严格 TypeScript 配置。 |
| `pnpm --dir apps/sage-shell test` | PASS，15 文件 / 106 测试 | Sage Shell 现有单元回归与 WT-01 同时通过。 |
| `pnpm --dir apps/sage-shell build` | PASS | TypeScript 可构建；不等同 GUI、Electron 或生产验收。 |
| `pnpm run gate` | PASS，quick scope 23/23 | Sage 质量、产品边界、数据隔离、文档链接和 ADR 索引门通过；不是 full/legacy gate。 |
| `git diff --check` / `git diff --cached --check` | PASS / PASS | 未暂存 WT-01 差异与用户既有暂存差异均无 whitespace error。 |

验证前还执行了红测：在领域源码不存在时，定向测试以“找不到 `business-matter.js`”退出 1；实现后才转绿。以上均为本地源码验证；未运行 `gate:full`、Electron、GUI、真实模型/工具、持久化、旧资料导入或外部动作。

WT-02A.1 revision 4 的独立读数：初始 Red 证明 codec 缺失且旧 artifact 可冒充当前 artifact；随后对抗审查依次发现 copied-Symbol provenance、unknown/accessor envelope、event-specific nested payload shape、非真实 UTC 日期与 canonical payload 缺口，均先以失败测试复现后修正。最终定向 `business-matter.spec.ts + business-matter-rehydration.spec.ts` 为 2 文件 / 67 测试通过，Sage Shell 全量为 16 文件 / 144 测试通过，typecheck、build、Sage quick gate 23/23 与差异检查通过。该证据只证明纯领域 codec / rehydration，不证明 SQLite、digest、事务、崩溃恢复或产品闭环。

WT-02A.2 revision 5 的独立读数：store spec 为 1 文件 / 15 测试通过，包含 exact schema、PRAGMA / capability 回读、普通 close / reopen、顺序 CAS、append 幂等、digest / fingerprint golden vector、候选与已存流资源上限、`invalid-request` / `blocked` 零写入，以及 hostile Proxy、index accessor、`slice` / `byteLength` shadow 与 replay-integrity 回归；Sage Shell 全量为 17 文件 / 159 测试通过，typecheck、build、Sage quick gate 23/23 与差异检查通过。测试由 Electron 43.3.0 以 `ELECTRON_RUN_AS_NODE=1` 运行 Node 24.18.1 / SQLite 3.53.1；没有新增 dependency 或 lockfile 改动。该证据只证明测试临时 Sage root 内的单 connection file-backed store，不证明 GUI、产品 main-process 接线、真实资料、两个 connection 的并发、真实 busy、kill / ACK-loss、物理断电 durability 或 P0-5 产品闭环。

WT-02A.3A revision 6 的独立读数：process spec 为 1 文件 / 19 测试通过，覆盖真实 BEGIN / COMMIT `SQLITE_BUSY`、两个独立 Electron Node-mode 进程的 C-01 / C-02、同一 K=2 批第二条 event 与 stream head / append ledger 的真实 SQLite trigger 回滚、事务中途和 COMMIT 后 ACK 前 `SIGKILL`、原 `appendId` replay、受控 COMMIT / ROLLBACK / close 异常分类，以及三张 authority table 全字段 / BLOB hex 快照下的直接篡改隔离。有效 Red 证明 ROLLBACK 与最终 close 同时失败会泄漏 raw exception；生产侧仅在两个 outcome-unknown 边界增加 best-effort quarantine，使调用方得到 `commit-unknown` 且旧 store fail closed。最终核心四文件为 101/101、Sage Shell 全量为 18 文件 / 180 测试，typecheck、build、Sage quick gate 23/23 与差异检查通过；两条独立审查均为 P0=0、P1=0、P2=0。该证据不证明物理断电或真实 I/O 故障；test-only prototype seam 只证明错误分类，路径 / symlink / hardlink / permission 留给 WT-02A.3B。

WT-02A.3B revision 7/8 的规范边界：公开入口不再接受 `databasePath`，而从完整 `SagePaths` 固定派生唯一相对目录和数据库名；真实 OS home 与传入 home 通过 profile 单一策略双重校验 legacy `~/.dsh` 的 lexical path 与 symlink physical target，目录创建和 store 复用同一只读 preflight。root / data / store 目录要求当前 uid、`0700`、canonical path 和稳定 identity，数据库要求 `0600`、regular file、单 hardlink，并使用 bigint `dev/ino`。path 反例覆盖伪造 home、root / ancestor symlink、symlinked legacy root 的物理目标、错误 owner/mode、数据库与 sidecar symlink/hardlink/orphan、父目录替换、`clock()` 内首写前漂移与 COMMIT 后漂移；失败路径不做应用层 pathname cleanup，数据库及仍存在的 recovery 文件交给 maintenance，SQLite 自身 rollback / close 是否删除或改变 sidecar 不在该保证内。完整实施与验证读数只维护在[权威事件存储交接](../notes/proposed/architecture/2026-09-27-business-matter-event-store.md#wt-02a3b路径所有权与权限反例已实现当前未提交)中。Node `DatabaseSync(path)` 不接收已验证 fd，因此 same-UID swap-open-restore 只能缩小和检测可观察窗口，不能宣称彻底消除。该批仍未提交，且不证明真实 Application Support root、ACL/TCC/App Sandbox、安装包身份或物理断电。

## 9. WT-02A 权威事件存储合同

本节是 `BusinessMatter` 持久化语义的规范性 home。[ADR-0161](../adr/ADR-0161.md) 记录选择及理由，[权威事件存储交接](../notes/proposed/architecture/2026-09-27-business-matter-event-store.md) 记录实施顺序、实际 v1 物理 schema 和对抗测试矩阵；两者不得各自改写本节的领域语义。

### 9.1 信任与数据边界

存储 owner、backend 选型及被拒方案以 [ADR-0161](../adr/ADR-0161.md) 为事实 home；运行时探针、物理 schema 和数据库配置以[权威事件存储交接](../notes/proposed/architecture/2026-09-27-business-matter-event-store.md)为实施输入。本合同只约束调用者可观察的信任边界：

- 所有持久化输入必须经第 9.4 节 strict rehydration，renderer、Harness / DSH session persistence、Host、Capability Adapter、profile generation 与 projection 均不得绕过它直接改变领域状态。
- WT-02A 不读取、转换或导入真实旧 DSH 资料；P0-3B 继续独立阻断。
- 测试只能写自己创建的临时 Sage root；未关闭第 9.7 节生产门前不得写入真实敏感经营数据。

### 9.2 持久化 envelope

每条 committed event 必须拥有以下存储层字段；领域事件不得自行提供或覆盖 `streamVersion`、`recordedAt` 和 digest：

| 字段 | 合同 |
| --- | --- |
| `matterId` | stream identity；必须与 payload 中的事项身份一致。 |
| `streamVersion` | 从 1 开始连续递增的唯一因果顺序；同一事项内不可缺口、重复或倒序。 |
| `eventId` | 同一事项内唯一；重用相同 ID 但不同事件永远冲突。 |
| `eventType` | 选择对应 runtime codec；未知类型不得忽略。 |
| `eventSchemaVersion` | 正整数；未知版本返回 `unsupported-schema`。 |
| `occurredAt` | 业务发生时间；保持 WT-01 的非递减规则，但不作为并发顺序或数据库 CAS。 |
| `recordedAt` | store 接收并持久化的时间；不覆盖 `occurredAt`。 |
| `payloadBytes` | 版本化 codec 产生并实际写入的精确 bytes；原始历史 bytes 不做原地 migration。 |
| `previousDigest` / `eventDigest` | 基于实际 envelope / payload bytes 的连续完整性链；第一条允许空 predecessor。 |

`streamVersion` 是重放的唯一排序依据。读取时不得按 `occurredAt` 或 `recordedAt` 重新排序；相同时间戳不影响版本顺序。schema 演进只允许纯 read-time upcaster 或生成可验证的新存储版本，禁止静默改写历史 payload 或补默认值改变业务语义。

v1 的 committed-event digest 使用以下无歧义 framing；`u64be` 是无符号 64-bit big-endian，`text(x)` 和 `lp(bytes)` 都先写 8-byte 长度，再写原始 bytes：

```text
text(x)   = u64be(byteLength(UTF8(x))) || UTF8(x)
lp(bytes) = u64be(bytes.length) || bytes

text("sage/business-matter/committed-event-digest/v1")
text(matterId)
u64be(streamVersion)
text(eventId)
text(eventType)
u64be(eventSchemaVersion)
text(occurredAt)
text(recordedAt)
lp(payloadBytes)
lp(previousDigest ?? zero-length bytes)
```

对完整 framed bytes 计算 SHA-256，数据库保存 raw 32 bytes；非首事件的 `previousDigest` 必须正好 32 bytes。两条 golden vector 共用以下事件：`matterId=matter:golden`、`eventId=event:create`、`eventType=matter-created`、`eventSchemaVersion=1`、`occurredAt=2026-09-27T00:00:00Z`，`payloadBytes` 是下列单行 JSON 的精确 UTF-8 bytes：

```json
{"type":"matter-created","eventId":"event:create","matterId":"matter:golden","occurredAt":"2026-09-27T00:00:00Z","goal":"golden","responsibleParty":{"kind":"human","roleRef":"role:owner"}}
```

在 `streamVersion=1`、`recordedAt=2026-09-27T00:00:01Z`、空 predecessor 下，committed-event digest 是 `1cd8f929a096b8d64603ea4b963d1eed7dd386d644e0a8b3a448c8166bf58c88`。

### 9.3 Load 合同

load 至少区分：

```ts
type LoadResult =
  | { readonly kind: 'not-found' }
  | {
      readonly kind: 'loaded'
      readonly version: number
      readonly matter: BusinessMatter
    }
  | {
      readonly kind: 'blocked'
      readonly reason:
        | 'corrupt'
        | 'unsupported-schema'
        | 'stream-too-large'
        | 'payload-too-large'
        | 'key-unavailable'
        | 'io-unavailable'
      readonly diagnostic?: BusinessMatterEventStoreDiagnostic
    }
```

不存在、损坏、不支持 schema、未来密钥缺失与 I/O 不可用不得统一返回空事项。发现已存 committed stream 损坏时，该事项进入只读隔离：保留原始 bytes 和诊断信息，禁止继续 append、自动截尾、覆盖、跳过坏事件或“修复”为默认状态。store open 时发现数据库 identity、版本或对象形状不匹配属于 store 级 `schema-mismatch`，不得伪装成某一事项的 `not-found` 或 `blocked`。

### 9.4 Strict rehydration 合同

磁盘输入依次通过以下边界，顺序不可交换或跳过：

1. 验证 storage envelope、连续 `streamVersion`、matter identity、event ID 唯一性和 digest chain；
2. 依据 `eventType + eventSchemaVersion` 对不可信 payload bytes 做 runtime decode；
3. 从空状态逐事件执行完整领域语义重放，重验创建唯一性、revision predecessor、decision scope / 生命周期、attempt 生命周期、执行身份与兼容矩阵、artifact 所属、receipt actor / evidence refs、结论和时间规则；
4. 只有完整链合法，领域模块内部 factory 才能创建并在 module-private registry 登记 `BusinessMatter`；storage 不导入、枚举或伪造 provenance；
5. verified aggregate 才能进入 projection。

当前 `projectBusinessMatter()` 只投影受信事件，不能充当步骤 1～4。以下事件流必须整体拒绝：没有 artifact 的 accepted receipt、责任角色错配、空 evidence refs、未知 schema、版本缺口、matter / revision 引用错配、第二个创建事件、非法或回拨时间、digest 破坏，以及任何在命令入口中原本会失败的转换。

WT-02A.1 revision 4 已实现其中不依赖存储的部分：v1 envelope 含 `matterId / streamVersion / eventId / eventType / eventSchemaVersion / occurredAt / payloadBytes`，输入从 `unknown` 经 exact envelope、fatal UTF-8 / JSON、全部事件 payload 的严格结构校验、public command semantic replay、完整事件 equality 与 canonical v1 payload bytes 核对后才进入 projection；拒绝结果保留可推导的 `eventIndex / streamVersion / eventId / field / domainCode` 上下文。canonical v1 指当前 TypeScript domain event 构造顺序经 `JSON.stringify()` 产生的 UTF-8 bytes；引入跨语言 producer、schema v2 或迁移器前必须先把该规则升级为显式 serializer 合同。

WT-02A.2 revision 5 已将该入口接到受限的 file-backed store：读取先校验 exact storage envelope、连续版本、payload 上限与 digest chain，再进入 WT-02A.1 codec / semantic replay；append 在 materialize 当前流或读取 hostile 候选容器前完成可安全推导的 shape、版本和资源预检。每次真正新提交只读取一次显式注入的 `clock`，同批 event `recordedAt`、stream `created_at / updated_at` 与 append ledger `committed_at` 共用该 UTC 值；replay、冲突、坏请求和已存流阻断均不读取 clock。当前实现仍只证明单 connection，WT-02A.3 的进程级对抗边界不变。

WT-02A.3A revision 6 已补足临时数据库范围内的进程级证据：并发胜负由 SQLite transaction / unique constraint 裁决，不依赖进程内 mutex；失败读取和 append 不自动修复或改写损坏 authority rows；结果未知时隔离原 store。WT-02A.3B revision 7 已补上相同临时 Sage root 内的 POSIX 路径 / ownership / permission snapshot 与可观察替换隔离。真实产品 data root、same-UID 持久 capability、物理断电与 product main-process 接线仍在本合同之外。

### 9.5 Append、并发与幂等合同

```ts
type ExpectedVersion =
  | { readonly kind: 'not-exists' }
  | { readonly kind: 'exact'; readonly value: number }

interface AppendRequest {
  readonly matterId: string
  readonly expectedVersion: ExpectedVersion
  readonly appendId: string
  readonly events: readonly EncodedNewEvent[]
}
```

request fingerprint 使用与第 9.2 节相同的 `text / lp / u64be` 定义，固定顺序为：

```text
text("sage/business-matter/append-request-fingerprint/v1")
text(request.matterId)
text("not-exists" | "exact")
[u64be(expectedVersion.value) only when kind == "exact"]
u64be(events.length)

for each ordered event:
  text(eventId)
  text(eventType)
  u64be(eventSchemaVersion)
  text(occurredAt)
  lp(payloadBytes)
```

fingerprint 不包含 `appendId`、冗余的 `event.matterId`，也不包含 store 分配的 `streamVersion`、`recordedAt`、`previousDigest` 或 `eventDigest`。使用第 9.2 节同一 golden event、`expectedVersion=not-exists`、单事件有序批次时，SHA-256 fingerprint 是 `daaeb8cfb4ab215f4658ad1501dc989269a41ed9cba028f92373591983485d7a`。

候选批次的 empty、shape、codec / schema、semantic 或资源限制错误必须返回 `invalid-request`，附具名 `reason` 和可安全推导的事件坐标，且 authority tables 零写入。候选批内重复 event ID 属于 `invalid-request`；与已存事件重用 event ID 返回顶层 `duplicate-event-id`。当前已存 committed stream 的同类错误返回 `blocked`，不得把调用方的坏候选批次冒充为已存 stream 损坏。

- 同一 `(matterId, appendId)` 且 fingerprint 相同：返回第一次提交的原始版本范围，结果为 `replayed`；即使 stream 已继续推进也不能转成 version conflict。
- 同一 key、不同 fingerprint：`idempotency-conflict`，零写入。
- 不同 key 重用 event ID：`duplicate-event-id`，整批零写入。
- `not-exists` 只用于创建；`exact(N)` 只在当前 committed version 恰为 N 时成功。
- version conflict 后不得自动重放原命令；调用方必须重新 load 并重新执行领域判断。
- K 条事件一次获得 `N+1..N+K`，事件、stream head 和幂等提交记录在同一数据库事务内全有或全无。
- commit 返回后才允许 `appended`；commit 结果不确定时只能返回 `commit-unknown`，调用方使用原 `appendId` 查询或重试。
- 只有真正的新提交读取一次注入的 clock；同一批次的 `recordedAt`、stream timestamps 和 append `committedAt` 必须相同。`replayed`、任何 conflict、`invalid-request` 或 `blocked` 不得读取 clock。
- 一个事项内线性化；WT-02A 不宣称跨事项事务或全局事件顺序。

正常业务端口禁止 `save`、`upsert`、`replaceEvents`、`deleteEvent`、`forceAppend` 和 `expectedVersion: any`。projection、snapshot、索引、通知、模型或 artifact I/O 不得在 append 事务中执行，也不得成为第二份权威状态。

### 9.6 并发与 durability 验收边界

具体 SQLite journal、synchronous、transaction 与 capability-probe 基线由 [ADR-0161](../adr/ADR-0161.md) 和[权威事件存储交接](../notes/proposed/architecture/2026-09-27-business-matter-event-store.md)持有。本合同只要求：数据库事务和唯一约束最终必须能在两个独立 connection / process 的竞争测试中裁决 CAS；单进程 Promise queue、内存 mutex 或时间戳检查不能作为并发证明。WT-02A.3A 已完成该竞争、真实 `SQLITE_BUSY`、动态事务故障、ACK 丢失及 hard kill / reopen 的本地自动化验证；WT-02A.3B 已完成临时 Sage root 内的 POSIX snapshot boundary 与可观察路径漂移反例，但 same-UID 持久 filesystem capability 和真实产品数据根仍未关闭。普通单元测试、`SIGKILL`、`fullfsync=ON` 回读或 SQLite 文档均不等于真实物理断电验收。

### 9.7 完整性、安全与生产门

- digest chain 只用于 corruption detection / tamper evidence。任何能修改数据库的本机主体都可能重写 payload 和整条 hash chain；没有独立密钥、authenticated encryption、签名或外部 anchor 时不得称为防篡改或不可抵赖。
- artifact 的 `locator + digest` 仍只是业务记录。event store 不保证对应 blob 已 durable、未被替换或与事件原子提交；后续由独立 artifact store 与 outbox / reconciliation 解决。
- 普通业务端口不提供物理删除。purge、export、完整性审计和恢复属于独立 maintenance port，必须有权限、幂等、崩溃和备份传播合同。
- 应用级 authenticated encryption、Keychain、retention、physical purge、portable export、encrypted backup、删除传播、多设备同步与 schema migration 工具尚未实现。

关闭上述生产门之前，WT-02A 只能称为本机开发期持久化基础，不能承载真实敏感经营数据，也不能称为 production-ready、已加密、不可篡改或已满足删除要求。

### 9.8 实施状态边界

WT-02A.1～02A.3B 的顺序与完成状态以[执行计划](../plans/2026-09-24-sage-self-owned-desktop-execution-plan.md#p0-5经营事项首个真实闭环)为事实 home，具体实现与对抗矩阵见[权威事件存储交接](../notes/proposed/architecture/2026-09-27-business-matter-event-store.md)。WT-02A.3B 当前工作树的本地完成不等于 `HEAD` 基线、真实产品数据根或产品接线，也不关闭已记录的 Node path-only residual。每一步必须另行确认 Birdview 文件范围；本节通过文档门禁只能证明合同被记录，没有源码、测试、构建和对应层级读数时不得标为完成。

## 10. WT-02B.1 Identity / Policy Resolver 合同

WT-02B.1 是 `BusinessMatter` 之外的独立 security kernel。它解决“谁经哪个权威来源、代表哪个组织和岗位、依据哪版政策，可以请求哪个操作”的问题；它不把领域对象改造成认证系统，也不让 renderer、Adapter 或插件成为第二个授权事实源。

以下 10.1～10.4 同时记录 revision 9 已实现接口与 revision 10 的产品迁移边界：当前 `TrustedIdentityAssertion.organizationId` 仍是测试 kernel 的过渡输入，不是后续产品 authority。ADR-0164 部分修订 ADR-0163 D1 / D3 / D5：真实 Identity Provider 只证明 `(issuer, subject)` 与认证状态；identity mapping 只产生内部 identity handle、候选 organization ref 和后续 scoped pseudonym；Organization Policy Provider 独占 active organization membership、role 与 grant authority。WT-02B.2B 接真实 provider 前必须迁移现有接口，不能把 OIDC tenant / organization / group claim 当作成员资格证明。

### 10.1 受信来源与请求边界

- 公开装配形态是 `createIdentityPolicyResolver({ audience, resolveIdentity, resolvePolicy, now }).resolve(unknown)`；所有不可信调用方输入先经过 exact runtime shape 校验，再允许触发 provider。
- Resolver composition 固定注入非空 audience、Identity Provider、Organization Policy Provider 和可信 clock；调用方请求只能包含 `sessionId`、`requiredRoleRef`、`operation` 与完整 `actionPolicy`。额外字段、accessor、Proxy 或缺失字段均作为无效请求拒绝，调用方没有 organization、actor 或 subject 输入面。
- revision 9 的测试 Identity Provider 当前返回 `issuer`、`subjectId`、`audience`、`sessionId`、`organizationId`、`authenticatedAt` 与 `expiresAt`。其中 `organizationId` 仅是过渡接口的精确匹配输入，不得进入真实产品 adapter；audience 必须精确匹配 composition 固定值，session 必须精确匹配请求，身份必须在可信 clock 的解析时刻有效。
- Organization Policy Provider 的 snapshot 将 `roleAssignments`（subject → role）与 `grants`（role → 精确 operation / `actionScope` / `effectClass` / `requiresDecision`）分开；它是岗位和操作授权的唯一 authority。重复 assignment，以及同 role + operation + `actionScope` 的重复或冲突 grant 均使整个 snapshot fail-closed。
- UI、HTTP body、模型、插件、Host、macOS uid、文件 owner、Cordis connection 和既有 `HumanRoleRef` 均不是可信身份或岗位来源。`requiredRoleRef`、operation 与 action policy 只是待核验请求，不是权限证据；revision 9 中 organization / subject 暂由测试 assertion 提供，但产品目标中 IdP 只证明 subject，organization membership、岗位和 grant 均只能由 Organization Policy Provider 提供。
- identity assertion、policy organization、subject assignment、required role、operation、`actionScope`、`effectClass`、`requiresDecision` 以及 policy identity / version / digest 必须精确匹配；不得以前缀、大小写归一、近似名称、默认组织或默认岗位扩大权限。
- 任一 provider 不可用、输出结构无效、identity / policy 未生效或过期时一律 fail-closed，并返回稳定 denial code，不泄漏可被误当作 authority 的半成品。
- Resolver 只消费本次授权判断所需的最小上下文；它不读取 profile、数据库、旧 DSH 资料、renderer 状态或插件私有状态。

### 10.2 与 BusinessMatter 的双门关系

Resolver 的允许结果不等于领域命令获准执行。未来 WT-02D Application Service 必须同时满足两套独立判断：

1. 产品目标中的 Resolver 用 Identity Provider 证明的 external subject、Sage-owned mapping 的内部 identity handle / candidate organization，以及 Policy Provider 唯一证明的 active organization membership / role assignment / grant，证明当前 session 可以请求精确 role、operation 与 action policy；revision 9 assertion organization 在 WT-02B.2B 迁移前不能接入产品；
2. `BusinessMatter` 继续独立检查 current revision、`actionPolicies`、`requiresDecision`、decision 生命周期、attempt 状态和 receipt 责任角色。

Resolver 的 canonical `HumanRoleRef` 只能由已核验的 policy assignment / grant 形成，不能回显调用方自报 actor。Resolver 不创建、批准、撤回或选择 decision，不判断某个 action 是否已进入 revision，不执行领域命令或外部动作，也不生成 receipt / `completed`。`BusinessMatter` 也不从 `HumanRoleRef` 反推认证主体、组织成员关系或签名真实性。任一门失败，调用链都必须停止；两边通过也只授权对应的精确意图，不产生通配权限。

### 10.3 `AuthoritySnapshot` provenance

允许结果必须携带不可变 `AuthoritySnapshot`，至少保留本次裁决所依据的：

- identity issuer、固定 audience、session 与稳定 subject reference；
- Policy Provider 核验的 active organization membership 与 role；revision 9 测试 assertion organization 只用于当前 kernel 精确匹配，不进入未来持久 evidence；
- 精确 operation 和完整 action policy（`actionScope`、`effectClass`、`requiresDecision`）；
- policy identity、version 与 digest；
- identity authentication / expiry、policy valid-from / expiry 和本次解析时间。

snapshot 是授权来源证明，不是新的领域事件，也不是 UI 可编辑状态。实现必须让返回对象及其嵌套集合不可变，不能把 provider 的可变对象引用原样泄漏给调用方。失败结果不得携带可被误当作有效 authority 的半成品 snapshot。

长期目标是在审计链中持久化由 runtime snapshot 派生、满足最小化原则的 `AuthorityEvidence`，使 decision / receipt 能回答“由谁、代表哪个组织岗位、依据哪版政策”而不依赖可变目录；不是把 `AuthoritySnapshot` 原样序列化。WT-02B.1 **不修改 v1 event schema**，也不把 subject、session 或其他可能的 PII 写入当前追加式事件流；在 identity authority、PII 最小化、retention、purge 和删除传播完成决策前，任何内存 snapshot 都不得宣称已经形成持久、不可抵赖的审计证据。

### 10.4 状态与剩余门

revision 9 已在当前未提交工作树实现 security kernel、对抗测试和对应事实文档。初始 Red 证明 resolver 源码缺失，第二次边界 Red 以 8 failed / 2 passed 暴露 caller organization 与 IdP role 的双重权威模型；最终请求面已收窄并由 Organization Policy 独占岗位 / grant authority，但 assertion organization 仍保留为测试 kernel 的过渡匹配字段。根代理复验结果为定向 13/13、resolver + 领域 / strict rehydration 80/80、产品 / Adapter / handler 边界 11/11、产品边界 5/5、Sage Shell 全量 20 文件 / 230 测试、严格 spec 编译、typecheck、build、ADR / docs-links 31/31、Sage quick gate 23/23 与两类 diff check 通过，交叉审查 P0=0、P1=0。revision 10 决定真实产品由 Policy Provider 独占 membership authority，所以上述历史绿灯不覆盖 WT-02B.2B 的接口迁移。

这些读数只关闭 WT-02B.1 的本地 kernel 批。真实 Identity Provider、Organization Policy Provider、登录 / federation、组织目录、密钥或签名、PII / retention、WT-02D Application Service、Capability Adapter、新 UI、Host、profile、真实产品数据根和外部动作仍未接入。只有 provider authority、产品调用链、持久化策略与端到端拒绝 / 允许证据均另行确认并通过后，完整 WT-02B 才能标为完成。

### 10.5 WT-02B.2A Runtime AuthoritySnapshot 与 Persistable AuthorityEvidence

WT-02B.2A 固定两个不同生命周期、不同数据面的合同。本节只记录已确认的治理边界，不新增 runtime type，不修改 v1 event schema，也不表示真实 provider、登录、token vault、组织目录或持久审计已经实现。

`Runtime AuthoritySnapshot` 是一次在线授权求值的短生命周期、main-process-only 结果。它可以在当前请求内包含解析和精确匹配所必需的 provider subject、session reference、identity / policy validity 与最小 provider 字段，但只能用于当前受信调用链继续做领域重验；它不得进入 renderer、日志、profile、Host、Harness、插件、SQLite、BusinessMatter event、artifact、导出或备份。logout、账户移除、identity / policy 过期或撤销后，它立即失效，不得被缓存或重放为当前权限。

`Persistable AuthorityEvidence` 是未来由受信转换器从一次成功求值中派生的最小、不可用于重新授权的审计事实。它不是 runtime snapshot 的序列化副本。未来持久化只允许以下字段类别，且具体 schema、事件版本和 maintenance port 仍须 WT-02B.3 单独确认：

- 唯一 `authorityEvaluationId`、在 Policy Provider 已证明的组织 / audience scope 内由 identity vault 生成并查重的高熵随机 `subjectRef`；
- issuer identity / version / digest、固定 audience、organization ref、核验后的 role ref；
- 精确 operation 与 action policy：`actionScope`、`effectClass`、`requiresDecision`；
- policy identity / version / digest，以及与裁决结论同期限保存的最小 policy evaluation evidence；
- `evaluatedAt`、identity / policy 有效期边界，以及不具 bearer 能力的 `authenticationEventRef`。

以下内容禁止进入长期事实：`sessionId`、access token、ID token、refresh token、cookie、原始 provider subject、姓名、邮箱、手机号、员工号、完整 claims、完整组织目录或 assignments、可重放的 identity assertion / policy cache，以及 provider 原始错误响应。`subjectRef` 只是 pseudonym，不是匿名化；禁止由 raw subject 做可逆编码或无密钥 deterministic hash，否则删除 mapping 后仍可重算关联。生成器必须在 scope 内做唯一性检查；rotation / provider migration / organization merge 或 split 必须原子迁移受治理引用，或以 versioned mapping 保持旧 ref 的 retention / hold / purge 边界直到迁移回执完成。原始 `(issuer, subject)` 到 `subjectRef` 的映射只能位于可删除的 identity vault，不能回流到追加式事项事件。

policy evidence 与对应 authority evidence 必须作为一个可解释单元治理：不得只保留 `allowed` 结论而提前删除解释它的 policy identity / version / digest 和最小求值依据，也不得以“审计需要”为由无限期保留完整政策目录。两者采用同一 retention / legal-hold / purge 边界；超过期限后按批准的删除合同共同处置。

### 10.6 Offline、撤销与 token vault 门

- 首版 offline 是只读上限，不是默认读取许可。当前没有 offline projection registry，因此所有 authority-scoped projection 在 provider / policy authority 不可达、过期、撤销、logout、账户禁用、organization 切换或 role 移除时都拒绝读取；未来只有由产品与安全 owner 独立批准、登记数据分类、organization scope、最大陈旧时间、logout / revoke 清理、UI 状态和 owner 的 public / local-only projection 才能例外。任何领域 mutation、decision、attempt、receipt、`local-write`、`external-read`、`external-write` 或 `privileged` 意图都必须在线取得新鲜 identity 与 policy 求值并 fail-closed。
- 长任务在每个外部副作用、持久写入和 privileged 边界前重新求值。历史 `AuthorityEvidence` 只能解释当时为什么允许，不能作为当前 authority 重放。
- access token 与 ID token 只允许驻留 Electron main process 内存；refresh token 只允许进入 main-owned、OS-backed encrypted vault。Sage 内部 session reference 必须是非 bearer、非秘密引用，仅凭该值不能登录或调用远端资源。
- logout、账户移除和 provider 侧撤销必须立即清除本地 token、runtime session、runtime snapshot 与 authorization cache；这些运行时凭证不受 legal hold 保留。identity mapping / evidence 的删除或 hold 隔离按下一节执行；任一清理步骤失败都不得继续以旧 session 降级运行。真实 adapter 还必须实现 authorization code + PKCE、精确 redirect / issuer / audience / state / nonce 校验、refresh rotation 与撤销，但这些属于 WT-02B.2B 源码批，不是本节完成事实。

### 10.7 Retention、legal hold、删除传播与恢复门

在产品 / 合规 owner 批准 retention matrix 前，Sage 不得把真实身份或敏感经营数据写入当前事件流。matrix 必须按数据类别明确处理目的、owner、起算点、保留期限、legal hold、purge、export、backup 期限和删除目标；本合同不臆定 30 / 90 / 365 天。

- 账户删除立即撤销和清除 token / session / runtime snapshot / authorization cache；这些数据不受 legal hold。没有有效 hold 时，identity mapping、可关联 sidecar 与到期 evidence 进入删除传播；存在具名、合法、限定范围且未到期的 hold 时，只能转入与产品路径隔离的 hold store，禁止用于登录、读取或授权，并在 deletion ledger 记录 `held-pending-purge`。
- legal hold 必须记录 authority、合法目的、数据类别 / subject / organization / 时间范围、到期与解除，不能无限期存在或静默把删除请求标为完成。hold 解除或到期后立即执行幂等 purge；删除回执至少区分 `revoked`、`held-pending-purge`、`purged` 与 `propagation-incomplete`。
- 若自由文本、artifact locator 或既有 payload 已含 PII，不得改写单个追加事件或伪造 hash chain 连续性；只能通过另行授权、幂等、可恢复且保留审计回执的 whole-stream purge / crypto-shredding 路径处置。
- 删除必须传播至 projection、索引、导出、cache、artifact、identity vault 与 backup catalog。backup restore 在数据重新可用前必须重放 deletion ledger / tombstone；不能让已删除主体或事项因恢复而复活。
- retention、purge、export、legal hold、deletion ledger、backup restore 与恢复演练都属于独立 maintenance port 和生产验收门。WT-02B.2A 的文档落档不关闭第 9.7 节的数据生产门。

## 11. WT-02C.0 Compatibility Authority 合同

WT-02C.0 将 compatibility 从“调用方提交一个结构合法的结论”提升为四个分离责任，但本批仍是纯治理决策：

| 责任 | 唯一 owner | 最小合同 |
| --- | --- | --- |
| `CompatibilityTargetProvider` | Sage product/security governance | 从 current matter/revision 产生绑定 canonical revision digest、精确 action policies、permission/data boundary 与完整 runtime requirements 的不可变 target。 |
| `RuntimeInventoryProvider` | Electron main | 将 active generation/receipt、安装后 artifact attestation、影响行为的配置、Host/Provider/Model/Agent/Preset/Capability observation 与 boot/runtime generation 组合成 canonical inventory。 |
| `CompatibilityMatrixProvider` | `Sage Compatibility Authority` | 提供 app-bundled immutable matrix；`matrixId` 是 canonical matrix bytes 的 SHA-256 内容地址，修正产生新 ID，撤销单独留痕。 |
| `CompatibilityResolver` | 独立 security kernel | 纯、确定性、无 I/O；只在可信 target/inventory/matrix 唯一精确命中时返回 `equivalent`。 |

### 11.1 Target 与 inventory 不能由调用方自报

- target 必须绑定 `matterId + revisionId + revisionDigest`、精确 `actionScopes`、效果 / 决定要求、permission boundary、data destination 与 Provider / Model / Agent / Preset / Capability requirements；revision 或安全相关语义变化产生新 target digest。
- inventory 必须同时具有 immutable artifact attestation 与 boot-scoped live observation，并绑定 active profile generation、receipt、配置、boot ID、runtime generation、观察时间与 canonical digest。任一事实缺失、冲突或无法验证即为 `unknown`。
- UI、插件、Host、模型、HTTP body、URL/query 和 action handler 不得提交 target、inventory、`outcome`、`matrixId`、`reason`、`executionSnapshot`、authoritative `targetDigest` / `inventoryDigest` 或“兼容”布尔值，也不得把自报 digest 当作 authority；它们可以提供候选 metadata / digest observation，由 main-owned provider 绑定并验证 provenance。
- 继承的 DSH entry、local overlay、Loader active、MCP tool registration、进程存在和 package version 都只能作为候选或 observation；只有进入 Sage-owned Capability Registry allowlist 并具有明确 Adapter mapping 的条目，才可能成为产品 capability。

### 11.2 Outcome、历史与 availability

- `equivalent` 只在 target、inventory、matrix provenance 完整，matrix 未过期 / 撤销，且恰好一条规则覆盖全部 identity、version、digest、contract、scope、effect、permission 与 data-boundary 时产生。
- 已知语义变化返回 `requires-new-revision`；缺失、未知、未登记、未验证、重复、冲突、歧义、多个规则命中、provider 不可用、过期或撤销返回 `unknown`。后二者都阻断。
- compatibility 只回答 artifact / contract 对 revision target 的语义关系；availability 仍需在每个真实副作用、持久写入与 privileged 边界前执行 fresh preflight。历史 `equivalent` 不是当前健康或权限。
- 当前 v1 strict replay 只重放持久化的 `ExecutionSnapshot` / `CompatibilityDecision` DTO，不查询 matrix，也不证明 target / inventory / matched rule provenance。`matrixId` 只标识 immutable matrix bytes，不标识一次 evaluation；未来必须以独立 `CompatibilityEvaluationEvidence` 绑定当时 target、inventory、matched rule 与 outcome，并单独确认 schema / retention。历史审计不得使用当前 matrix 重新求值并改写旧 outcome；`reconfirmRevision()` 不授予下一次 attempt 的 standing compatibility。

### 11.3 登录等待期间的并行边界

真实 OIDC 尚未接入时，WT-02C.1 已先完成纯 resolver；UI fixture / blocked projection、capability descriptor、artifact attestation 和 inventory adapter 仍可并行开发。test provider、fixture target 或 development-unsealed artifact 只能形成测试证据，不能授权真实业务 mutation、decision、attempt、receipt、敏感数据读取、外部 API mutation 或工具副作用。

产品编排必须等待 WT-02D，并固定为：

```text
ActionIntent
  → identity / policy
  → strict rehydrate current revision
  → target
  → fresh identity / policy evaluation
  → runtime inventory
  → matrix / resolver
  → BusinessMatter
  → event store
  → Capability Adapter preflight / execute
  → artifact / failure / receipt
```

第 11.1～11.3 节记录 WT-02C.0 治理合同；第 11.4 节记录 revision 12 v1 fixed-fixture resolver；第 11.5 节记录 revision 13 双层合同；第 11.6 节记录 revision 14 当前工作树的 MatrixV2 kernel。可信 matrix 发布 composition、trusted provider / clock、live runtime inventory、Capability Registry、`CompatibilityEvaluationEvidence`、Application Service、插件授权与端到端产品调用均未实现；完整事实、备选方案和后续 tickets 见 [Compatibility Authority 架构记录](../notes/proposed/architecture/2026-09-28-compatibility-authority.md)。

### 11.4 WT-02C.1 与当前领域 DTO 的边界

WT-02C.1 已在当前未提交工作树新增独立、同步、确定性且无 I/O 的 `CompatibilityResolver`。它消费 current revision binding、fixed fixture target / inventory、显式 `evaluatedAt` 和已经 materialize 的 matrix provider result；执行 exact shape、canonical digest / matrix ID、matrix 生命周期 / revocation、duplicate / conflict / ambiguity 与唯一 digest-pair rule 检查。它的 `CompatibilityResolution` 使用稳定 typed `code`，与本文件当前三字段 `CompatibilityDecision` 保持不同类型。

这项实现没有改变 `BusinessMatter`：

- `startAttempt()` / `reconfirmRevision()` 仍只做现有领域 invariant，不导入 compatibility security kernel；
- 当前 v1 event、codec、store 与 strict replay shape 均未改变，也未新增 `CompatibilityEvaluationEvidence`；
- renderer、Host、插件或普通调用方仍不能把 C1 resolution 直接转换为 `CompatibilityDecision`；
- 只有未来 WT-02D Application Service 在受信 target provider、main-owned inventory、app-bundled matrix provider 和 fresh authority chain 全部成立时，才可把当次已验证的 resolution 转为领域 DTO 并立即调用 command。

C1 测试中的 target、inventory、matrix 与 `equivalent` 都是固定 fixture 证据。它不证明 matrix artifact 来自可信发布链，也不证明当前 boot / generation、真实 capability、插件、外部工具或业务数据可用；这些门仍分别属于 WT-02C.2A～2D、WT-02C.3 与 WT-02D。

当前 rule 直接绑定完整 `targetDigest + inventoryDigest`，而完整 digest 又分别包含具体 matter / revision 与 boot / observation identity，所以它只能证明 per-instance fixture pair 的精确 fail-closed 行为，不能直接作为 app-bundled matrix 的长期产品 key。WT-02C.1A 已决定 full evidence digest 与 stable semantic / descriptor digest 的分层及 MatrixV2 版本边界；WT-02C.1B 已完成独立 kernel 的 v2 migration。在 trusted providers / C2A～2D / C3 / WT-02D 关闭前仍禁止产品接线或 per-instance dynamic matrix；C2B、C2C、C2D 只提供各自受信输入，不拥有这项匹配政策。

### 11.5 WT-02C.1A full evidence / stable semantic 分层合同

WT-02C.1A 只约束 compatibility authority 的输入、匹配键和未来 evaluation binding，不修改 `BusinessMatter` 当前三字段 `CompatibilityDecision`、v1 event / codec / store 或 strict replay：

- `targetSemanticDigest` 只覆盖可跨事项实例复用的 action、permission / data policy 与 runtime requirement 语义；`targetEvidenceDigest` 继续绑定具体 matter、current revision、exact instance boundary 与 target provider provenance；
- `runtimeDescriptorDigest` 只覆盖稳定、行为相关且已验证的 artifact / tree、contract、configuration、Registry 与 Adapter mapping；`inventoryEvidenceDigest` 继续绑定 active generation / receipt、materialization instance、boot / runtime generation、observation window、attestation 与 main-owned observation provenance；
- MatrixV2 只对 `targetSemanticDigest + runtimeDescriptorDigest` 做唯一 exact match，但 resolver 必须先验证 full evidence、current revision、freshness、matrix lifecycle / revocation 与 stable/full binding；stable pair 不能替代 full evidence，也不能成为 execution / replay authority；
- stable / full digest 必须由 security kernel 从 exact-parsed、受信 provider 输出重算。UI、Host、Harness、插件、MCP server、模型和普通调用方不得提交 authoritative digest、outcome 或“兼容”布尔值；
- C1 v1 合同冻结为 fixed-fixture / migration evidence；MatrixV2 使用新 schema、canonicalization version 与类型隔离的 URN，不静默重解释 v1，也不在 v2 miss 时 fallback 到 C1；
- 未来 `CompatibilityEvaluationEvidence` 至少绑定 matter / revision / action scope、stable pair、full pair、`matrixId`、`matchedRuleId`、outcome、evaluation time 与当时 provenance / revocation。本节只冻结关系，schema、retention、event / store 与 strict replay 仍属于 WT-02C.3。

完整字段分类、owner、备选方案和风险以 [ADR-0166](../adr/ADR-0166.md) 与 [Compatibility Authority 架构记录](../notes/proposed/architecture/2026-09-28-compatibility-authority.md#11-wt-02c1a-双层-exact-digest-合同revision-13当前工作树未提交) 为准。WT-02C.1A 没有实现 MatrixV2、ResolverV2、provider、Capability Registry、Application Service、UI、插件授权、真实数据或外部副作用。

### 11.6 WT-02C.1B 与当前领域 DTO 的边界

WT-02C.1B 已在当前未提交工作树实现 MatrixV2 canonical contracts、stable/full digest derivation、binding validation、unique stable-pair resolution、v1/v2 isolation 与 no-fallback。它没有修改当前三字段 `CompatibilityDecision`、v1 event / codec / store 或 strict replay，也没有定义或持久化 `CompatibilityEvaluationEvidence`。

ResolverV2 output 仍是 security-kernel-owned internal result。renderer、Host、plugin 或 ordinary caller 不能把 stable pair 或 resolution 直接转为 domain DTO；未来只有 WT-02D 在 trusted providers / clock、C2A～2D 与 fresh identity / policy chain 成立时，才可执行受信转换并立即调用领域 command。

测试中的 MatrixV2、descriptor、evidence 和 `equivalent` 都是 fixed fixture / kernel evidence，不证明 matrix artifact release provenance、live boot / runtime、Registry allowlist、provider truth、capability availability、product authorization、real data 或 external side effects。revision 14 的成功结果只在内存中冻结 `evaluatedAt`、exact action、`matrixId / matchedRuleId`、stable pair、full pair 与 matrix provider provenance；它没有携带或冻结完整 matrix / rule artifact，也不是持久化审计记录。

当前本地源码验证为 compatibility spec v1 12/12、v2 17/17、完整 29/29，strict spec compile，相邻 security/domain 4 files / 109 tests、产品 / Adapter / handler 3 files / 11 tests、产品边界 7/7、Sage Shell 全量 21 files / 259 tests、typecheck 与 build、ADR/docs-links 31/31、Sage quick gate 23/23（0 skip）及差异检查通过，最终独立复审为 P0=0、P1=0、P2=0。新增回归锁定 exact SemVer / calendar version 正向 grammar，以及 exact parse → 四层 digest → cross-link → current / action → provider 的复合失败优先级。10 个 V2 golden 另由不调用生产实现的独立 reference encoder 逐字段复算并 10/10 一致。这些读数只关闭 local kernel batch，不是 `HEAD`、trusted provider、C2、C3、WT-02D 或产品验收。

## 12. 后续集成门

WT-01 在当前未提交工作树完成的是领域内核，WT-02A.0 完成的是存储合同，WT-02A.1 完成的是纯领域 v1 codec / strict rehydrator，WT-02A.2 完成的是测试临时 Sage root 内的单 connection file-backed store，WT-02A.3A 完成的是临时数据库上的进程级对抗验证，WT-02A.3B 完成的是同一临时边界内的 POSIX 路径硬化与可观察漂移隔离；WT-02B.1 完成的是纯 security kernel、对抗测试与内存 `AuthoritySnapshot` provenance，WT-02B.2A 完成的只是身份与长期审计数据治理落档，均不等于真实身份系统或完整 WT-02B。它们都不是 `HEAD` 基线或 P0-5 产品闭环。下一批源码、renderer、Adapter 或真实动作必须重新确认文件范围，并继续解决：

1. 在产品接线前决定 same-UID 持久 filesystem capability 的处理方式，并在真实 Sage data root 复验 WT-02A.3B；随后再关闭加密、访问控制、保留、删除、导出与备份生产门；
2. WT-02B.2B：在 issuer metadata、native public client registration、redirect URI、audience / scopes、组织映射 owner、Policy Provider authority、账户生命周期和 OS vault capability 均有真实部署输入后，实现系统浏览器 OIDC Authorization Code + PKCE adapter、main-owned token vault、撤销与 fail-closed session 生命周期，并把 assertion organization 过渡接口迁移为 Policy Provider 独占 membership authority；
3. WT-02B.3：定义 runtime `AuthoritySnapshot` → persistable `AuthorityEvidence` 的受信转换、schema / version、retention enforcement、legal hold、purge、export、delete propagation 与 backup restore；该批另行决定扩展 v1 还是升级 schema，本批不修改 v1；
4. WT-02C.0 已落档 revision-bound target、main-owned runtime inventory、matrix owner / content-addressed `matrixId`、fail-closed outcome、compatibility / availability 分层与 UI/plugin 边界；WT-02C.1 保留 fixed-fixture v1 resolver，WT-02C.1A 已落档 full evidence / stable semantic 分层合同，WT-02C.1B 已实现 local MatrixV2 kernel migration；trusted available result / provider composition 仍 pending。WT-02C.2A～2C 分别补齐安装后 artifact attestation、boot-scoped Host inventory 与外部 MCP capability descriptor / contract digest / health；WT-02C.2D 建立 product/security-owned Capability Registry canonical allowlist、descriptor provenance、Adapter mapping 与 revoke/fail-closed；WT-02C.3 单独定义 `CompatibilityEvaluationEvidence`、历史 matrix retention 与 schema / replay 边界；
5. WT-02D：建立唯一 Application Service，按 identity / policy → compatibility → BusinessMatter → Capability Adapter 顺序编排，并 enforcement 经独立批准的 offline projection registry；UI、Host、插件和模型只能提交意图或返回受控结果，不能直接写权威事件、自报 authority 或自行判断「非敏感」；
6. 外部动作的幂等、补偿、超时、重放和副作用验证；
7. 与 P0-3B 的资料来源和权限边界保持隔离。

在这些门被单独确认前，不得把 WT-01 的内存测试、WT-02A.0 的 accepted 文档、WT-02A.1 的 codec / rehydration 测试、WT-02A.2 的临时 file-backed store、WT-02A.3A 的进程级对抗、WT-02A.3B 的临时路径边界测试、WT-02B.1 的内存 authority 解析、WT-02B.2A / WT-02C.0 / WT-02C.1A 的治理文档、WT-02C.1 的 fixed-fixture v1 resolver 测试或 WT-02C.1B 的 local MatrixV2 kernel tests 称为真实登录 / 组织权限、token vault、可持久审计、产品数据已持久化、可信 MatrixV2 发布、可信 runtime inventory、Capability Registry、Application Service、产品 compatibility authority、真实上架、旧资料导入、GUI / 产品运行时集成、物理断电 durability 或 P0-5 产品验收。
