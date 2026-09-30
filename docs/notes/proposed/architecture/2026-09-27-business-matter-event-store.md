# BusinessMatter 权威事件存储与严格重放交接

- 日期：2026-09-27
- 状态：WT-02A.0 决策与合同、WT-02A.1 pure codec / strict rehydrator、WT-02A.2 单 connection file-backed SQLite store、WT-02A.3A 进程级对抗与 WT-02A.3B POSIX 路径边界已在当前未提交工作树实现并通过对应本地验证；revision 8 已将 legacy-root 的 lexical / physical 隔离收敛到 profile 单一策略并恢复 Sage quick gate 23/23。WT-02A.3B 证据仅来自测试创建的临时 Sage root，产品数据根接线、same-UID 持久 filesystem capability 与生产数据门仍未关闭
- ADR：[ADR-0161](../../../adr/ADR-0161.md)
- 领域合同：[BusinessMatter 领域与权威事件存储合同](../../../specs/2026-09-24-businessmatter-contract.md)
- 执行计划：[Sage 自有桌面端执行方案](../../../plans/2026-09-24-sage-self-owned-desktop-execution-plan.md)

## Problem

WT-01 已把经营事项表达为追加事件和可重建投影，但它刻意停在进程内存。WT-02A.1 之前没有可信反序列化入口，WT-02A.2 之前没有数据库事务、并发冲突、幂等提交、崩溃恢复或损坏隔离；如果只把 `BusinessMatter.events` 写成 JSON，再反序列化后强制 cast 回领域类型，磁盘字节会绕过命令入口中的阶段、引用、责任角色和时间校验。

2026-09-27 的历史 Red 探针复现了该风险。探针从一个合法事项枚举内部 brand，随后构造含非法时间、缺失 artifact、空 evidence refs 和错误责任角色的 `accepted` receipt；修正前 projector 返回：

```json
{"stage":"artifact-receipt","conclusion":"completed","artifacts":0,"receipts":1,"actor":"role:not-owner"}
```

WT-02A.1 已关闭纯领域入口：aggregate provenance 改由 module-private `WeakSet` 登记，v1 codec 从 `unknown` 做 exact envelope、fatal decode、event-specific runtime shape、public command replay 与完整事件 equality；上述伪造链现在具名拒绝。WT-02A.2 已关闭测试临时 Sage root 内的单 connection 存储边界：exact schema、typed load / append、顺序 CAS、幂等账、digest chain、普通 close / reopen 与零写入失败路径均有自动化覆盖。WT-02A.3A 又关闭同一临时数据边界内的独立进程竞争、真实 busy、事务中点故障、commit 后 ACK 丢失、hard kill / reopen 与直接数据库篡改证据。WT-02A.3B 在相同临时根内固定数据库派生路径，并补上 owner、mode、symlink、hardlink、sidecar、父目录替换和事务中路径漂移的 fail-closed 证据；revision 8 又把 legacy-root 的 lexical / physical 检查收敛到 `profile/paths.ts`，目录创建与 store 共用同一只读 preflight。它没有把库接到产品 main process，也没有消除 `DatabaseSync(path)` 打开前后的 same-UID pathname replacement 窗口。

## Decision

用户确认 [ADR-0161](../../../adr/ADR-0161.md)：Sage 使用 app-owned 的事务型 SQLite event store，Electron main process 是唯一正常写入口；`node:sqlite` 被隔离在内部 adapter 后。规范性 API、状态与安全边界以[领域合同第 9 节](../../../specs/2026-09-24-businessmatter-contract.md#9-wt-02a-权威事件存储合同)为唯一 home，本 Note 负责物理 schema、配置、实际文件、验证读数与交接检查。

### 运行时与数据库基线

当前已钉住并由 WT-02A.2 store spec 回读的运行时结果：

```json
{"electron":"43.3.0","node":"v24.18.1","sqlite":"3.53.1","nodeSqlite":"function"}
```

`apps/sage-shell/package.json` 的 `test` 入口为 `node scripts/test.mjs run`；启动器从已安装的 `electron` package 取得 executable，以 `ELECTRON_RUN_AS_NODE=1` 启动已安装 Vitest，并转发 argv、退出码与 `SIGHUP / SIGINT / SIGTERM`。因此 store 测试使用 Electron 43.3.0 内的 Node 24.18.1 / SQLite 3.53.1，而不是开发机独立 Node 22；该形态仍不是 Electron GUI 或产品 main-process 接线。

`node:sqlite` 在 Node 24.18.1 文档中仍标为 Stability 1.2，因此领域层、Application Service 和测试 fixture 都不得依赖其具体类；数据库模块只实现项目自有端口。仓库当前 Node 22 typings 不含 Node 24.18.1 runtime 已提供的 `enableDefensive` / `limits`，adapter 只在本地 structural shim 后调用，并对 capability 缺失或 PRAGMA 回读不一致 fail closed，没有扩写全局 module declaration。官方依据：

- [Node.js v24.18.1 `node:sqlite`](https://nodejs.org/download/release/v24.18.1/docs/api/sqlite.html)
- [SQLite database open flags](https://www.sqlite.org/c3ref/open.html)
- [SQLite transaction language](https://www.sqlite.org/lang_transaction.html)
- [SQLite atomic commit](https://www.sqlite.org/atomiccommit.html)
- [SQLite PRAGMA reference](https://www.sqlite.org/pragma.html)
- [SQLite corruption guidance](https://www.sqlite.org/howtocorrupt.html)
- [SQLite temporary files](https://www.sqlite.org/tempfiles.html)

首版数据库配置：

| 设置 | 决策 | 约束 |
| --- | --- | --- |
| schema identity | `application_id=0x53414745`（`1396787013`）、`user_version=1` | 仅新路径产生的空库可原子 bootstrap；identity、版本或对象形状不匹配一律 `schema-mismatch`。 |
| journal | `journal_mode=DELETE` | 一个正常写入口、低并发基线；暂不承担 WAL sidecar / checkpoint / backup 复杂度。 |
| durability | `synchronous=EXTRA` | commit 成功才允许 ACK；普通测试不冒充物理断电证明。 |
| macOS flush | `fullfsync=ON`，实际回读为 `1` | 只证明 pinned runtime 接受配置；不冒充物理断电与延迟预算。 |
| transaction | `BEGIN IMMEDIATE` | 提前取得写事务，冲突形成具名结果；禁止无界重试。 |
| schema safety | `foreign_keys=ON`、`trusted_schema=OFF`、defensive mode | 实际回读 `1 / 0`；extension loading 保持关闭。 |
| contention | 调用方显式注入有界正整数 `busyTimeoutMs`，设置后回读 `PRAGMA busy_timeout` | timeout / busy 与 version conflict 分开；回读成功不证明真实锁竞争。 |

`openBusinessMatterEventStore()` 不提供隐式 production 默认值，调用方必须显式给出完整 `SagePaths`、`maxStreamEvents`、`maxPayloadBytes`、`busyTimeoutMs` 与 `clock`。adapter 不接受数据库 pathname、SQLite URI 或任意 storage directory，而是固定派生 `<sageRoot>/data/business-matter/business-matter-v1.sqlite3`；传入 home 与操作系统真实 home 都参与旧 `~/.dsh` 隔离校验。`maxStreamEvents` 与 `maxPayloadBytes` 必须是正安全整数；`busyTimeoutMs` 还必须不超过 SQLite 的 32-bit 上限；无效配置在创建数据库文件前以 `invalid-config` 拒绝。每次真正的新 append 只调用一次 clock，同批 event `recordedAt`、stream `created_at / updated_at` 与 append ledger `committed_at` 共用该 UTC 时间；replay、conflict、坏请求和已存流阻断不读取 clock。测试中的 `DEFAULT_MAX_*` 只是 fixture helper，不是 adapter 的生产默认值。

### 数据库存储形态

WT-02A.2 实际 v1 schema 为 3 张 `STRICT` 表和 1 个唯一索引；源码会比较 `sqlite_schema` 的 exact 对象集合与归一化 SQL，不接受“名字相同、约束更少”的近似库：

```sql
CREATE TABLE business_matter_streams (
  matter_id       TEXT NOT NULL PRIMARY KEY,
  current_version INTEGER NOT NULL
    CHECK (current_version BETWEEN 1 AND 9007199254740991),
  head_digest     BLOB NOT NULL CHECK (length(head_digest) = 32),
  created_at      TEXT NOT NULL CHECK (length(created_at) > 0),
  updated_at      TEXT NOT NULL CHECK (length(updated_at) > 0)
) STRICT;

CREATE TABLE business_matter_events (
  matter_id            TEXT NOT NULL,
  stream_version       INTEGER NOT NULL
    CHECK (stream_version BETWEEN 1 AND 9007199254740991),
  event_id             TEXT NOT NULL CHECK (length(event_id) > 0),
  event_type           TEXT NOT NULL CHECK (length(event_type) > 0),
  event_schema_version INTEGER NOT NULL
    CHECK (event_schema_version BETWEEN 1 AND 9007199254740991),
  occurred_at          TEXT NOT NULL CHECK (length(occurred_at) > 0),
  recorded_at          TEXT NOT NULL CHECK (length(recorded_at) > 0),
  payload_bytes        BLOB NOT NULL CHECK (length(payload_bytes) > 0),
  previous_digest      BLOB,
  event_digest         BLOB NOT NULL CHECK (length(event_digest) = 32),
  PRIMARY KEY (matter_id, stream_version),
  FOREIGN KEY (matter_id) REFERENCES business_matter_streams(matter_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CHECK (
    (stream_version = 1 AND previous_digest IS NULL)
    OR
    (stream_version > 1 AND previous_digest IS NOT NULL
      AND length(previous_digest) = 32)
  )
) STRICT;

CREATE UNIQUE INDEX business_matter_events_event_id_uq
  ON business_matter_events(matter_id, event_id);

CREATE TABLE business_matter_appends (
  matter_id           TEXT NOT NULL,
  append_id           TEXT NOT NULL CHECK (length(append_id) > 0),
  request_fingerprint BLOB NOT NULL CHECK (length(request_fingerprint) = 32),
  first_version       INTEGER NOT NULL
    CHECK (first_version BETWEEN 1 AND 9007199254740991),
  last_version        INTEGER NOT NULL
    CHECK (last_version BETWEEN first_version AND 9007199254740991),
  committed_at        TEXT NOT NULL CHECK (length(committed_at) > 0),
  PRIMARY KEY (matter_id, append_id),
  FOREIGN KEY (matter_id) REFERENCES business_matter_streams(matter_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (matter_id, first_version)
    REFERENCES business_matter_events(matter_id, stream_version)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  FOREIGN KEY (matter_id, last_version)
    REFERENCES business_matter_events(matter_id, stream_version)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) STRICT;
```

只有 open 前路径不存在，且 SQLite 创建后 `application_id=0`、`user_version=0`、没有 user schema objects，adapter 才在一个 `BEGIN IMMEDIATE` 中创建上述对象并设置两个 header；任何既有空文件、外来 identity、未来版本或 schema shape 差异都返回 `schema-mismatch`。v1 不做隐式 migration、repair 或覆盖 bootstrap。

`payload_bytes` 是版本化 codec 产生的精确 bytes。digest 与 append fingerprint 的 domain tag、field order、length-prefix、u64 framing 和 golden vectors 以[领域合同第 9.2、9.5 节](../../../specs/2026-09-24-businessmatter-contract.md#9-wt-02a-权威事件存储合同)为规范性 home；实现由 `computeBusinessMatterCommittedEventDigest()` 与 `computeBusinessMatterAppendRequestFingerprint()` 固化并由 golden spec 逐字节验证。数据库保存 raw 32-byte SHA-256，不读取对象后用另一次 `JSON.stringify()` 重算。digest chain 用于 corruption detection 和 tamper evidence，不是签名。

### Append 事务顺序

一次 append 的线性化顺序固定为：

1. 在领域命令层生成候选事件和稳定 `appendId`；重试必须复用同一个 ID。
2. 在事务和 clock 之前对不可信 request / events / payload 做 descriptor-safe snapshot、`expectedVersion` 可达性、候选事件数与 payload bytes 预检；失败返回 `invalid-request`，不访问 hostile accessor，不写 authority tables。
3. 对规范化快照计算 request fingerprint，然后 `BEGIN IMMEDIATE`。
4. 先按 `(matterId, appendId)` 查幂等记录，并在返回 replay 前严格验证 committed stream：
   - key 存在且 fingerprint 相同：返回原 `firstVersion..lastVersion`，结果为 `replayed`；即使 stream 已继续推进也不能变成 version conflict。
   - key 存在但 fingerprint 不同：返回 `idempotency-conflict`，零写入。
5. 没有 replay record 时加载并严格验证当前 committed stream；损坏时阻断本事项写入。
6. 比较 `expectedVersion`：创建必须是 `not-exists`，既有事项必须是 `exact(N)`。
7. 对“当前事件 + 候选批次”执行 strict semantic replay；只有完整链合法才继续。
8. 读取一次 clock，分配连续 `streamVersion=N+1..N+K`，形成版本化 envelope 和 digest chain。
9. 插入整批事件、推进 stream head，并写入幂等提交记录；三个动作处于同一事务。
10. `COMMIT` 返回后才返回 `appended`。commit 结果不确定时返回专用状态；调用方只能使用原 `appendId` 查询 / 重试，不能生成新 key 盲写。
11. projection、snapshot、搜索索引和 UI 通知均在 commit 之后运行；它们失败不能回滚已提交事实，也不能变成第二个权威状态。

### Strict rehydration 顺序

`rehydrateBusinessMatter()` 不能等价为“解析 JSON + cast + 调 projector”。固定分成四个不可交换、不可跳过的边界：

1. **Storage envelope verification**：字段类型、matter identity、版本连续性、event ID 唯一性、schema version、digest / previous digest。
2. **Event codec**：按 `eventType + eventSchemaVersion` 把不可信 payload bytes 解码为具名候选事件；未知版本返回 `unsupported-schema`，不得跳过。
3. **Semantic replay**：从空状态逐事件执行完整领域转换，不复用只面向受信事件的宽松 projector。至少重验 revision predecessor、decision scope / status、attempt 生命周期、artifact 所属、receipt 责任角色 / evidence refs、结论与时间政策。
4. **Projection**：只有 verified aggregate 才能进入现有或收紧后的 projector；brand 由领域模块内部 factory 创建，storage adapter 不接触 brand symbol。

`streamVersion` 是唯一因果顺序。`occurredAt` 是业务发生时间，`recordedAt` 是 store 接收时间；两者都不能替代版本，也不得用于重排事件。WT-01 当前“后追加 `occurredAt` 不早于日志末事件”的规则保持不变；若未来支持离线导入或时钟回拨，必须走单独决策和输入通道。

**WT-02A.1 实施现状：** 当前未提交工作树已实现 v1 纯领域 envelope、九类稳定 codec error、fatal UTF-8 / JSON、exact own-data-property envelope、matter / event identity 与连续 `streamVersion`、全部 11 类事件 payload 的严格结构校验、public command replay、完整事件 equality、canonical v1 payload bytes 核对、可推导的错误坐标和 module-private WeakSet provenance。accessor、revoked Proxy、derived metadata、未知字段、非法 UTC 日期、非 canonical bytes 及 latest artifact 错配均有自动化反例。该纯领域层本身仍不拥有 storage `recordedAt`、digest、数据库读取或资源配置；这些责任由下述 WT-02A.2 adapter 在调用 codec 前后承担，不能倒灌进领域模块。

**WT-02A.2 实施现状：** 当前未提交工作树已新增单文件 `node:sqlite` adapter，并在测试临时 Sage root 内完成 exact bootstrap / schema identity、capability / PRAGMA 回读、typed load / append、正常 close / reopen、顺序 CAS、appendId replay / conflict、event ID 约束、batch clock、SHA-256 framing golden vector、候选与已存流资源上限、`invalid-request` / `blocked` 零写入和 close lifecycle。P1 对抗审查补入 hostile request Proxy、events index accessor、`Uint8Array.slice` / `byteLength` shadow、impossible exact version 先拒绝，以及 replay 前重验 persisted stream integrity 的回归。它仍是单 `DatabaseSync` connection；同时双连接、真实 busy、动态 COMMIT / transaction fault、ACK 丢失、hard kill / reopen、路径攻击和直接磁盘篡改未由本批证明。

### Typed 结果与禁止入口

端口至少区分：

```ts
type LoadResult =
  | { readonly kind: 'not-found' }
  | { readonly kind: 'loaded'; readonly version: number; readonly matter: BusinessMatter }
  | { readonly kind: 'blocked'; readonly reason:
      | 'corrupt'
      | 'unsupported-schema'
      | 'stream-too-large'
      | 'payload-too-large'
      | 'key-unavailable'
      | 'io-unavailable'; readonly diagnostic?: BusinessMatterEventStoreDiagnostic }

type AppendResult =
  | { readonly kind: 'appended'; readonly firstVersion: number; readonly lastVersion: number }
  | { readonly kind: 'replayed'; readonly firstVersion: number; readonly lastVersion: number }
  | { readonly kind: 'version-conflict'; readonly actualVersion: number | null }
  | { readonly kind: 'idempotency-conflict' }
  | { readonly kind: 'duplicate-event-id' }
  | { readonly kind: 'storage-busy' }
  | { readonly kind: 'commit-unknown' }
  | { readonly kind: 'invalid-request'; readonly reason: AppendInvalidRequestReason;
      readonly diagnostic?: BusinessMatterEventStoreDiagnostic }
  | { readonly kind: 'blocked'; readonly reason:
      | 'corrupt'
      | 'unsupported-schema'
      | 'stream-too-large'
      | 'payload-too-large'
      | 'io-unavailable'; readonly diagnostic?: BusinessMatterEventStoreDiagnostic }
```

`invalid-request` 专属于调用方候选批次：empty、shape / accessor / Proxy、codec / schema、semantic、候选资源限制和批内 duplicate 均在 clock 与 authority 写入前具名拒绝；批内 duplicate 使用 `invalid-request`，与已存 event ID 重用才使用顶层 `duplicate-event-id`。`blocked` 专属于当前已存 committed stream；同一类 codec、semantic、digest 或资源问题不得反过来污名化为调用方坏请求。公开入口为 `openBusinessMatterEventStore(options)`，返回项目自有 `BusinessMatterEventStore`；SQLite 类型不扩散到领域或 Application Service。

正常业务接口禁止出现：

```ts
save(matter)
upsert(matter)
replaceEvents(events)
deleteEvent(eventId)
forceAppend(events)
append({ expectedVersion: 'any' })
```

物理 purge、export、完整性审计和恢复是独立 maintenance port；在其权限和产品语义确认前不得留半成品 API。

## Alternatives considered

- **复用 profile generation / pointer**：拒绝。它适合不可变目录发布，没有 per-matter `expectedVersion`、append 幂等或事件语义；receipt 证明文件物化，不证明业务提交。
- **移植 `scripts/lib/preset-skill-transaction.mjs`**：拒绝直接 import。其 lock、durable intent、directory fsync、故障注入和 inspect-first recovery 值得借鉴，但它操作目录 replacement / rollback，不能物理撤销已提交业务事实。
- **自研 JSONL event store**：保留为 runtime capability probe 失败时的重新决策候选，不作为隐式 fallback。要达到同等语义必须自行实现跨进程锁、CAS、批次原子、幂等、恢复、校验和故障矩阵，代码与审计面显著大于 SQLite adapter。
- **Harness session persistence**：拒绝。它的 owner、生命周期与 schema 是 Harness session，不是 Sage 经营事项；将其用作权威库会重建被 ADR-0159 隔离的耦合。
- **第三方原生 SQLite 模块**：当前拒绝。它增加 lockfile、ABI rebuild、打包和签名边界，而固定 Electron 已提供需要的 SQLite 功能。
- **WAL**：当前拒绝。尚无并发吞吐数据支持其 checkpoint / sidecar 复杂度；后续必须通过可重复基准和恢复测试再决策。

## Consequences

### Positive

- WT-02A.2 已将 event stream、stream head 和幂等账收进同一 commit，并以顺序 CAS / replay 测试证明单 connection 语义。
- WT-02A.3A 已证明两个独立进程的竞争由数据库事务和唯一约束裁决，不依赖单进程 mutex；commit 后 ACK 丢失可用原 appendId 安全确认。
- 不存在、损坏、不支持 schema、I/O 不可用和未来密钥缺失不再退化为同一个空状态。
- DSH session、profile、projection 与 BusinessMatter 权威事实保持分离。
- 不增加 dependency 或 lockfile 改动，且后端 API 风险被收口在内部 adapter。

### Negative

- 实现不再是一个简单 repository class：WT-02A.1 已增加 v1 runtime codec、完整 semantic replay 与九类 codec typed errors；WT-02A.2 已增加 v1 schema identity、显式资源配置、digest chain 和 store typed results；WT-02A.3A 已增加真实多进程 / 故障证据与 outcome-unknown quarantine；WT-02A.3B 又增加固定路径派生和 POSIX path snapshot checks，未来 schema evolution 与更强 filesystem capability 仍需独立决策。
- `DatabaseSync` 会占用调用线程；事务必须短小，不能在事务中执行 projection、模型调用、artifact I/O 或大规模查询。
- rollback journal 在短写事务期间会限制读并发；当前接受该代价，除非基准证明需要 WAL。
- strict replay 的成本随事件数增长；WT-02A 不预先增加 snapshot。只有真实性能数据越过预算后，才能加入可丢弃、带 source-head digest 且可完整重建的缓存。

### Risks and gates

- **API 稳定性**：`node:sqlite` Stability 1.2。用 pin、capability probe、内部 adapter 和升级矩阵控制。
- **same-UID pathname 竞态**：Node 24.18.1 的 `DatabaseSync` 只接受 string、Buffer 或 URL path，不能从已验证 fd / dirfd 打开。当前 `O_NOFOLLOW`、`realpath`、`uid/mode/nlink` 与 `dev/ino` bigint 复核只能检测可观察漂移，不能把 path snapshot 变成持续 capability；不得宣称只有 Sage.app 能访问，或已完全消除 swap-open-restore。
- **SQLite recovery 文件**：一旦 SQLite 已观察数据库 pathname，失败路径不做应用层显式 pathname cleanup；数据库及仍存在的 rollback journal、WAL 或 SHM 交给 maintenance，SQLite 自身 rollback / close 是否删除或改变 sidecar 不在该保证内。
- **恶意本机修改**：SHA-256 chain 不能阻止能重写数据库的同用户进程重算整条链。应用级 authenticated encryption / external anchor 未实现前只声明损坏检测。
- **真实敏感数据**：encryption、Keychain、retention、purge、export、backup / 删除传播未决；这些门关闭前继续禁用真实经营数据。
- **artifact 一致性**：事件只记录 locator 与 digest 声明，不证明 blob 已 durable 或未被替换；后续用独立 artifact store + outbox / reconciliation 处理。
- **P0-3B**：真实旧 DSH 资料导入继续阻断，不得通过 event-store 实施顺带读取、转换或搬运。

## Execution handoff

### WT-02A.1｜Strict codec 与 rehydrator（已实现，当前未提交）

实际文件范围：

- `apps/sage-shell/src/domain/business-matter.ts`
- `apps/sage-shell/src/domain/business-matter-codec.ts`
- `apps/sage-shell/test/business-matter.spec.ts`
- `apps/sage-shell/test/business-matter-rehydration.spec.ts`

实际结果：

- 原 copied-Symbol / forged receipt 探针已转为具名拒绝，旧 artifact 也不能冒充 current latest pending artifact；
- `unknown` 输入依次经过 exact envelope、fatal payload decode、全部 11 类事件 payload 的严格结构校验、public command semantic replay、exact event equality 与 canonical v1 payload bytes 核对；
- 独立合法历史覆盖全部 11 类事件；未知 schema、版本缺口、identity/reference、非法时间、畸形 nested payload 与 derived metadata 均 fail closed；
- 定向 2 文件 / 67 测试、Sage Shell 全量 16 文件 / 144 测试、typecheck、build、Sage quick gate 23/23 与差异检查已通过；
- 没有引入 I/O、数据库依赖、lockfile、product、adapter、Host、profile、JEV 或 UI 改动。

### WT-02A.2｜SQLite event store（已实现，当前未提交）

实际文件范围：

- `apps/sage-shell/src/persistence/business-matter-event-store.ts`
- `apps/sage-shell/test/business-matter-event-store.spec.ts`
- `apps/sage-shell/scripts/test.mjs`
- `apps/sage-shell/package.json`
- `docs/specs/2026-09-24-businessmatter-contract.md`
- `docs/notes/proposed/architecture/2026-09-27-business-matter-event-store.md`
- `docs/plans/2026-09-24-sage-self-owned-desktop-execution-plan.md`

实际结果：

- `openBusinessMatterEventStore()` 暴露项目自有 `BusinessMatterEventStore`、typed load / append result、capabilities 与 close；SQLite 类只留在单一 persistence adapter 内；
- exact schema identity、3 张 `STRICT` 表、唯一索引、defensive / extension / PRAGMA capability 和 bootstrap / mismatch 均有实际回读或反例；
- create / append / load / normal close / reopen、expectedVersion、appendId replay / conflict、event ID、streamVersion、同批时间和三类 authority table 全有或全无均有单 connection 测试；
- 在持久化 load、append 当前流重放和候选 payload 写入前执行事件数与 `payloadBytes` 预检；候选越界返回 `invalid-request`，已存流越界返回 `blocked`，两者都有坐标且零写入；
- 两个独立 SHA-256 domain、u64 big-endian / length-prefixed framing 和 raw 32-byte 入库由 pure helper 与 golden vector 固定；
- hostile request Proxy、events index accessor、`slice` / `byteLength` shadow、impossible exact version 和 replay-integrity 反例均已补入；
- 定向 `rtk pnpm --dir apps/sage-shell test test/business-matter-event-store.spec.ts` 为 1 文件 / 15 测试通过；`rtk pnpm --dir apps/sage-shell test` 为 17 文件 / 159 测试通过；`rtk pnpm --dir apps/sage-shell typecheck`、`rtk pnpm --dir apps/sage-shell build` 与 `rtk pnpm run gate` 均通过，quick gate 为 23/23；
- 测试经 Electron 43.3.0 / `ELECTRON_RUN_AS_NODE=1` 运行 Node 24.18.1 / SQLite 3.53.1；没有新增 dependency 或 lockfile 改动；
- 数据库只写测试提供的临时 Sage root；没有接 product、Adapter、Host、profile、renderer、JEV、旧插件或真实资料。

### WT-02A.3A｜进程级对抗验证（已实现，当前未提交）

实际文件范围：

- `apps/sage-shell/src/persistence/business-matter-event-store.ts`
- `apps/sage-shell/test/business-matter-event-store-process.spec.ts`
- `docs/specs/2026-09-24-businessmatter-contract.md`
- `docs/notes/proposed/architecture/2026-09-27-business-matter-event-store.md`
- `docs/plans/2026-09-24-sage-self-owned-desktop-execution-plan.md`

实际结果：

- 两个独立 Electron Node-mode 进程分别验证 C-01 `exact(N)` 与 C-02 `not-exists`，READY / GO 同时放行后恰好一胜一 `version-conflict`，reopen 后 authority rows 只包含 winner；
- 真实 BEGIN / COMMIT `SQLITE_BUSY`、同一 K=2 批第二条 event、stream head 与 append ledger 的 SQLite trigger 故障均 fail closed；DROP trigger 后同一 store、同一 request 可重试；
- 事务中途 `SIGKILL` 后 reopen 没有半批；COMMIT 已成功但 ACK 前 `SIGKILL` 后，以原 `appendId` 重试得到 `replayed`；
- test-only prototype seam 只用于 Node API 无法稳定制造的 post-COMMIT、ROLLBACK 与 close 异常；有效 Red 暴露 raw close exception，生产侧仅在两个 outcome-unknown 边界增加 best-effort quarantine，结果统一为 `commit-unknown` 且旧 store `store-closed`；
- 三张 authority table 的 canonical snapshot 覆盖全部字段，BLOB 使用 hex；中间版本、payload、previous / head digest、orphan、未知 schema 与 append range 篡改在 repeated `load/append` 后逐行逐字节不变；
- process spec 19/19、核心四文件 101/101、Sage Shell 全量 18 文件 / 180 测试、typecheck、build、quick gate 23/23 与差异检查通过；两条独立审查均为 P0=0、P1=0、P2=0；
- 全部数据库只位于测试创建的临时 root；没有接 product、Adapter、Host、profile、renderer、JEV、旧插件或真实资料。

本批真实 `SIGKILL/reopen` 不证明物理断电、torn sector 或存储控制器缓存行为；prototype seam 只证明 fail-closed 分类，不冒充真实磁盘 I/O 故障。

最低 Red / Green 矩阵：

| ID | 场景 | 必须结果 |
| --- | --- | --- |
| R-01 | 注入 accepted receipt，但没有 artifact | strict replay 拒绝，不能形成 `completed`。 |
| R-02 | receipt actor 与 responsibleParty 不同 | `receipt-authority` / 具名语义错误。 |
| R-03 | 删除中间一个 streamVersion | `corrupt`，不得跳过缺口或自动截尾。 |
| R-04 | 修改一个 payload byte / previous digest | 完整性失败并保留原始字节供检查。 |
| R-05 | 未知 event schema version | `unsupported-schema`，不得忽略后继续投影。 |
| C-01 | 两个独立连接同时以 `exact(N)` append | 只允许一个 commit，另一个得到实际版本冲突。 |
| C-02 | 两个连接同时 `not-exists` 创建同一事项 | 一个成功、一个冲突，没有重复 stream。 |
| I-01 | 同 appendId、相同 fingerprint 重试 | 返回原版本范围，只存一份事件。 |
| I-02 | 同 appendId、不同 fingerprint | `idempotency-conflict`，第二次零写入。 |
| I-03 | 不同 appendId 重用 eventId | `duplicate-event-id`，整批零写入。 |
| A-01 | K 条事件写入第 i 条时注入故障 | 整个事务回滚，不能留下半批。 |
| A-02 | 幂等记录或 stream head 更新失败 | events、head、append record 一起回滚。 |
| A-03 | commit 成功、ACK 前 hard-exit | 原 appendId 重试得到 `replayed`。 |
| A-04 | projection / notification 在 commit 后失败 | 事件保持 committed，重新 load 可重建。 |
| P-01 | 路径逃逸、symlink、错误权限或非 app-owned root | 对可观察的 boundary mismatch fail closed；same-UID 持久 filesystem capability 与真实产品数据根另行验收。 |
| S-01 | snapshot / cache 损坏而 event stream 健康 | 丢弃缓存并完整 replay；cache 不能阻断事实恢复。 |

验证层次必须分开报告：纯 codec 测试、两个独立 SQLite connection 的并发测试、故障注入事务测试、子进程 kill / reopen、Sage Shell typecheck/test/build、quick gate。任何一层绿灯都不能替代真实断电、GUI、加密、旧资料导入或产品闭环证据。

revision 6 已覆盖 R-03～R-05、C-01～C-02、A-01～A-03 和直接 authority tamper；I-01～I-03 由 WT-02A.2 与 ACK-loss replay 共同覆盖。revision 7 又覆盖 P-01 的固定路径、legacy root、POSIX owner/mode/link、sidecar、父目录与事务中漂移反例；revision 8 补上 legacy symlink 物理目标的写入前拒绝，并移除 persistence 对 legacy 字面量与重复规则的持有，但保留上述 Node path-only residual。R-01～R-02 属于 WT-02A.1 strict replay。A-04 要到 WT-02D 的 post-commit consumer 接入后验证；S-01 要到存在可丢弃 snapshot / cache 后验证，当前不能以不存在的缓存伪造绿灯。

### WT-02A.3B｜路径、所有权与权限反例（已实现，当前未提交）

实际文件范围：

- `apps/sage-shell/src/persistence/business-matter-event-store.ts`
- `apps/sage-shell/src/profile/paths.ts`
- `apps/sage-shell/test/business-matter-event-store.spec.ts`
- `apps/sage-shell/test/business-matter-event-store-process.spec.ts`
- `apps/sage-shell/test/business-matter-event-store-path.spec.ts`
- `apps/sage-shell/test/profile-paths.spec.ts`
- `docs/specs/2026-09-24-businessmatter-contract.md`
- `docs/notes/proposed/architecture/2026-09-27-business-matter-event-store.md`
- `docs/plans/2026-09-24-sage-self-owned-desktop-execution-plan.md`

实际结果：

- store 只接收完整 `SagePaths`，固定派生 `data/business-matter/business-matter-v1.sqlite3`；真实 OS home 与传入 home 都通过 `profile/paths.ts` 的同一只读 preflight 参与 legacy `~/.dsh` lexical / physical 隔离，伪造 home 或 symlinked legacy root 不能把库落进真实旧根；
- Sage root、`data/` 与 `business-matter/` 要求当前 effective uid、mode `0700`、canonical physical path 与稳定 `dev/ino`；数据库要求 regular file、mode `0600`、单 hardlink，文件身份以 bigint 比较；新库以 `O_EXCL | O_NOFOLLOW` 预建；
- 既有 `-journal/-wal/-shm` 必须满足 sidecar 边界；orphan、symlink、hardlink、错误 mode 均在 SQLite open 前拒绝且不做应用层显式删除。SQLite 构造后的失败路径也不做应用层 pathname cleanup；数据库及仍存在的 recovery 文件留给 maintenance，但 SQLite 自身 rollback / close 可能删除或改变 sidecar；
- 首次初始化竞争不再把安全重检通过的 `O_EXCL/EEXIST` 直接误报为路径攻击；existing / creation-raced opener 在 `BEGIN IMMEDIATE` 的稳定快照中校验 schema，锁超时返回 `storage-busy`，已持锁 initializer 提交后可正常 reopen。既有 blank / foreign / future / mismatch 数据库仍拒绝，且在 exact schema 通过前不写入持久化 durability PRAGMA；foreign WAL 回归证明拒绝后 journal mode 保持 `wal`；
- `load`、append 首写前与 COMMIT 后复核 boundary。`clock()` 内替换 storage root 会先 rollback / quarantine 并抛 `storage-boundary-violation`；COMMIT 后才观察到漂移则返回 `commit-unknown`，恢复路径后原 `appendId` 得到 `replayed`；
- revision 8 新增 profile 回归先得到真实 Red：7 项中 1 项因未拒绝 symlinked legacy root 的物理目标而失败；实现单一策略后，profile + store path 定向 40/40，且被拒绝的 Sage root 在失败前保持不存在；
- 当前稳定源码的 path spec 33/33、core 17/17、process 20/20，三份 store 定向合计 70/70；Sage Shell 全量 19 文件 / 217 测试、四份相关 spec 的显式 strict TypeScript 编译、项目 typecheck 与 build 通过。`sage-data-isolation` selftest 10/10、Sage quick gate 23/23；门禁脚本未修改；
- 没有新增 dependency / lockfile，没有 product / Adapter / Host / profile / renderer、JEV、旧插件或真实资料接线；数据库仍只写测试创建的临时 Sage root。

残余边界：`DatabaseSync(path)` 不能消费预先验证的 fd；同一 UID 进程仍可在检查与 pathname open 之间做 swap-open-restore。`EEXIST → creation-raced` 分支已有安全重检，但尚缺一个确定性 file-layer seam 直接制造“首次观察 absent、随后 `O_EXCL` 返回 `EEXIST`”并命中该分支；现有独立进程用例主要证明 `existing` opener 的锁竞争。首次初始化也保留一个无法由现有固定文件合同区分的极窄窗口：creator 已创建文件但尚未 `BEGIN IMMEDIATE`，follower 初见 existing blank 并先取得锁时，仍可能按历史 blank 合同返回 `schema-mismatch`；若要求任意调度下都区分它，需要单 initializer、初始化 marker/lease 或 staging publish 的新协议，必须另批决策。当前复核缩小并检测可观察窗口，但不能证明持续 confinement。真实 Application Support root、ACL / TCC / App Sandbox、安装包身份、只读介质、物理断电与敏感数据门仍未验收。P-01 的产品级门因此继续保持 open，不能把本节表述为“只有 Sage 可访问”或“真实 data root 已安全”。

### 后续顺序

WT-02A 完成后才进入：

1. WT-02B：Identity / Policy Resolver；
2. WT-02C：Provider / Model / Agent / Preset / Capability compatibility registry；
3. WT-02D：Application Service 与 Capability Adapter 意图接口；
4. WT-02E：隔离数据根中的产品 E2E 与失败恢复。

P0-3B 始终是另一条真实旧资料导入主线，不能被 WT-02A～02E 顺带解除。
