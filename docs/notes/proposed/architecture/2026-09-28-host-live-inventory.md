# Host Live Inventory 架构与交接

- 日期：2026-09-28
- 状态：WT-02C.2B revision 17 已在当前未提交工作树关闭官方 smoke 与 `sage-shell-pin` 验收接缝；核心源码、隔离真实 Host、全量回归与 Sage quick gate 均已通过，C2C / C2D / C3 / WT-02D 和产品接线仍未开始
- ADR：[ADR-0168](../../../adr/ADR-0168.md)
- 关联：[ADR-0165 · Sage Compatibility Authority](../../../adr/ADR-0165.md)、[ADR-0166 · Compatibility 双层 exact-digest](../../../adr/ADR-0166.md)、[ADR-0167 · Runtime Artifact Attestation](../../../adr/ADR-0167.md)
- 实现：[runtime-inventory.ts](../../../../apps/sage-shell/src/main/runtime-inventory.ts)、[host-process.ts](../../../../apps/sage-shell/src/main/host-process.ts)、[protocol.ts](../../../../apps/sage-shell/src/protocol.ts)、[host/index.ts](../../../../apps/sage-shell/src/host/index.ts)、[paths.ts](../../../../apps/sage-shell/src/profile/paths.ts)
- 测试：[runtime-inventory.spec.ts](../../../../apps/sage-shell/test/runtime-inventory.spec.ts)、[host-process.spec.ts](../../../../apps/sage-shell/test/host-process.spec.ts)、[protocol.spec.ts](../../../../apps/sage-shell/test/protocol.spec.ts)、[host-entry.spec.ts](../../../../apps/sage-shell/test/host-entry.spec.ts)

## Problem

安装时 `RuntimeArtifactAttestationV1` 只能证明 profile 激活前观察到的 package、lock、`node_modules` bytes、executable bit、logical path、symlink topology 与 installer metadata。它没有当前进程的 boot identity、runtime epoch、Loader 生命周期或 observation window，因而不能回答“此刻哪个 Host child 正在使用哪个 receipt-sealed generation”。

原有 protocol v3 的 Host `ready` 只有 protocol 与 DSH/Harness version；Electron main 没有可读取的 runtime snapshot，也没有 ready 后 Loader transition 的失效信号。仅保存最后一条 ready 会把瞬时事件误当成持续事实；扫描 C2A tree 期间若 active pointer 或 Host child 已切换，又可能组合出跨时点的混合证据。

与此同时，尚未接产品的 Compatibility V2 把 `activeGeneration` 定义为 number，和 profile 的真实 string generation 不一致，并接受 `runtimeGeneration = 0`。在 C2B 进入 composition 前必须修正这条接缝，同时保持 V1 migration evidence 完全冻结。

本批只建立 boot-scoped Host live projection。它没有 C2C external capability descriptor、C2D Registry / Adapter mapping、C3 evaluation evidence 或 WT-02D trusted composition 所需输入，因此不得构造完整 `RuntimeInventoryEvidenceV2` 或连接产品 resolver。

## Decision

### 1. Host protocol v4 只传被观察事实

Host 到 Electron main 的 `ready` event 使用 exact shape：

```ts
interface HostReadyV4 {
  readonly type: 'ready'
  readonly protocolVersion: 4
  readonly dshVersion: string
  readonly profileGeneration: string
  readonly manifestSha256: string // raw 64-char lowercase hex
  readonly loaderPhase: 'active'
}
```

另新增唯一 exact event `{ type: 'runtime-invalidated' }`。Host 不得在 ready 中加入 `bootId`、runtime generation、authority digest、Matrix、Registry、health 或 compatibility outcome。unknown key、错误 protocol、非 canonical manifest、错误 generation grammar、非 active Loader phase、accessor、Proxy 或 non-plain object 一律拒绝。

`runShellHost()` 只有在 Harness boot 完成、Loader settle 且 entry ACTIVE audit 通过后才返回。启动期内部状态变化不产生 invalidation；Electron main 收到 ready 并显式 arm 后，任一后续 Cordis `internal/status` transition 只发送一次 `runtime-invalidated`。dispose 重复调用也不能重复产生可复用状态。

### 2. Electron main 拥有 boot 与 runtime epoch

每个 `ShellHostProcess` 构造时创建一个 main-owned namespaced UUID boot identity，并以 `runtimeGeneration = 1` 开始。公开的 `readSnapshot()` 只返回以下冻结 union：

```ts
interface ShellHostActiveRuntimeSnapshot {
  readonly kind: 'active'
  readonly bootId: string
  readonly runtimeGeneration: number
  readonly activeGeneration: string
  readonly manifestSha256: string
  readonly loaderPhase: 'active'
  readonly hostProtocolVersion: string
  readonly harnessVersion: string
}

interface ShellHostUnavailableRuntimeSnapshot {
  readonly kind: 'unavailable'
  readonly bootId: string
  readonly runtimeGeneration: number
  readonly reason: 'not-ready' | 'invalidated' | 'fatal' | 'exit' | 'disconnect' | 'stopped'
}
```

Host process 启动前是 `not-ready`。只有 ready 的 `profileGeneration` 与 `manifestSha256` 同 main 启动参数中的 expected facts 精确一致，才能把当前 epoch 变为 active。首次 `runtime-invalidated`、fatal、exit、disconnect 或 stop 同步推进 runtime generation 并冻结 unavailable snapshot；迟到的 ready、重复 teardown event 或旧 child 消息不能复活该 epoch。

`bootId` 标识 child lifetime，`runtimeGeneration` 标识该 child 内 main 观察状态的单调 epoch；二者都不是插件、Host 或 renderer 可提交的输入，也不是授权 token。

### 3. Active profile 暴露 receipt-sealed attestation row

`readActiveProfile()` 继续完整验证 active pointer、generation containment、profile receipt canonical shape、manifest digest 与每一 receipt file 的实际 SHA-256，并额外在返回值中暴露可选的 `runtimeArtifactAttestationSha256`。该值只来自 receipt 的固定 `runtime-artifact-attestation.json` row，不能来自旁路文件、自报字段或调用方参数。

pre-C2A generation 没有这个 row 时仍能被现有一般读路径打开；C2B provider 返回 `artifact-attestation-missing`，不写文件、不切 pointer、不回填历史 attestation。

### 4. Projection 采用稳定的双 Host / 双 profile 观察

`createHostLiveInventoryProjectionProvider({ paths, host, clock }).read()` 的顺序固定为：

```text
Host snapshot A
  → receipt-verified active profile A
  → Host/profile generation + manifest binding
  → receipt-sealed attestation file/mode/SHA binding
  → C2A fresh artifact attestation verification
  → receipt-verified active profile B
  → Host snapshot B
  → A/B exact stability comparison
  → trusted main clock（最后一步）
```

任何步骤失败都返回冻结的 `unavailable`，不会抛出 profile 路径、artifact 内容或底层 secret-bearing error。Host A 尚未 active 时不访问 profile 或 clock；完整扫描与第二次快照稳定之前不调用 clock。

### 5. Canonical `HostLiveInventoryProjectionV1`

available projection 精确包含：

```ts
interface HostLiveInventoryProjectionV1 {
  readonly schemaVersion: 'sage.host-live-inventory-projection.v1'
  readonly canonicalizationVersion: 'sage.host-live-inventory-projection-canonical-json.v1'
  readonly bootId: string
  readonly runtimeGeneration: number
  readonly activeGeneration: string
  readonly manifestSha256: string
  readonly loaderPhase: 'active'
  readonly hostProtocolVersion: string
  readonly harnessVersion: string
  readonly ownedProfileDigest: string
  readonly artifactSetDigest: string
  readonly installerMetadataDigest: string
  readonly artifactAttestationDigest: string
  readonly observedAt: string
  readonly expiresAt: string
  readonly projectionDigest: string
}
```

canonical body 固定按上述字段顺序、排除 `projectionDigest` 后使用 UTF-8 `JSON.stringify()` bytes；digest 为 `sha256:<64-lowercase-hex>`。`observedAt` 只在全部观察稳定后由 trusted clock 取得，`expiresAt = observedAt + 30s`，有效区间为半开 `[observedAt, expiresAt)`。provider 记住最后一次成功时间；时钟回退返回 `clock-regressed`，不能复用或延长旧 projection。

projection 与 result 均 deep-freeze，且 provider 不修改 caller-owned port 或 snapshot。projection 不含 absolute path、文件内容、PID、token、session、用户身份、Matrix、Registry、capability placeholder、health/liveness placeholder、compatibility outcome 或 execution authority。

### 6. Stable unavailable codes

调用方只能基于下列稳定 code 分支，`reason` 是不含路径与底层异常的固定说明：

| Code | 含义 |
| --- | --- |
| `host-not-active` | Host 尚未 ready。 |
| `host-runtime-invalidated` | Host snapshot 无效、生命周期已失效或观察期间 runtime epoch 漂移。 |
| `active-profile-unavailable` | active pointer / receipt / generation 无法通过既有验证。 |
| `host-profile-mismatch` | Host A 与 active profile 的 generation 或 manifest 不一致。 |
| `artifact-attestation-missing` | receipt 中没有 C2A attestation row。 |
| `artifact-attestation-unsealed` | attestation file 的 receipt SHA、类型或 `0600` seal 不成立。 |
| `artifact-attestation-invalid` | fresh C2A verify 发现 installed tree / binding 漂移。 |
| `active-profile-changed` | profile A 与 B 在完整观察期间发生变化。 |
| `clock-unavailable` | trusted clock 抛错或返回非 canonical time。 |
| `clock-regressed` | trusted observation time 早于本 provider 上次成功时间。 |

生命周期失效优先于时间窗。即使旧 projection 的 `expiresAt` 尚未到达，只要 Host snapshot 已 invalidated，消费者也必须重新读取并得到 unavailable；不得把 projection 当成可离线携带的 bearer credential。

### 7. Compatibility V2 接缝校准

`RuntimeInventoryEvidenceBodyV2.activeGeneration` 使用和 Sage profile 一致的 string grammar：`^[a-z0-9][a-z0-9-]{0,63}$`。number、空串、大写、underscore、slash、前导 hyphen 或超长值拒绝；`runtimeGeneration` 必须是 positive safe integer，0 拒绝。

该变化只影响尚未接产品的 V2 inventory evidence contract 与两条相关 golden。Compatibility V1 source prefix、canonical bytes、digest namespace 与全部 V1 goldens保持不变；V2 也不增加向 V1 fallback。

### 8. Authority 与后续 owner

| 事实或决策 | 当前 owner / 状态 | C2B 不提供的结论 |
| --- | --- | --- |
| installed content 与 generation attestation | C2A `RuntimeArtifactAttestationV1` | 不证明当前 boot 正在使用 |
| boot/profile/Loader observation | C2B `HostLiveInventoryProjectionV1` | 不证明 external capability、Registry 或 compatibility |
| external MCP / capability artifact、contract、health/preflight | WT-02C.2C，pending | 不由本地 Host 或 `node_modules` placeholder 推断 |
| allowlist、descriptor provenance、Adapter mapping、revoke | WT-02C.2D，pending | digest 相同不等于获产品批准 |
| 完整 `RuntimeInventoryEvidenceV2` composition | WT-02D trusted provider composition，pending | C2B projection 不自行填充缺项 |
| Matrix lifecycle 与 compatibility outcome | Compatibility Authority / Resolver | Host 不产生 `equivalent` |
| evaluation persistence | WT-02C.3，pending | projection 不是历史 evaluation evidence |
| identity、policy、decision 与真实副作用 | 独立 authority / Application Service，pending | projection 不是 authorization token |

本批不修改 `BusinessMatter` v1 event schema、codec、store 或 rehydration，也不新增 live inventory event。若未来 C3 / WT-02D 需要持久化引用，必须另行定义 schema、retention、freshness 与 replay 语义。

## Alternatives considered

### 只信任 Host ready

拒绝。ready 是一个瞬时信号；没有 main-owned boot/epoch 与 post-ready invalidation 时，Loader 或 child 已变化仍可能沿用旧结论。

### 由 Host 自报 boot ID 或完整 inventory

拒绝。被观察对象不能铸造观察 authority；Host 不拥有 active pointer、receipt、C2A sealed binding、Registry 或产品政策。

### 只观察一次 profile 与 Host

拒绝。fresh artifact scan 有实际耗时；扫描期间 pointer 或 child 切换会把两个时点拼成一个看似完整的结果。采用 A/B 双观察并在最后取时钟。

### 给旧 generation 自动 backfill attestation

拒绝。事后扫描无法证明当时 activation transaction 内的 bytes，也无法恢复原本 receipt seal；backfill 会伪造历史证据。

### 本批直接产出完整 RuntimeInventoryEvidenceV2

拒绝。C2C/C2D/WT-02D 的 required facts 与 provenance 尚不存在；使用空值、默认 digest 或 health/liveness placeholder 会把 unknown 伪装成 verified。

### 保留 numeric generation

拒绝。真实 generation 是有 grammar 的 string；映射为 number 会丢失 identity。V2 尚未接产品，本批是低成本修正窗口，V1 则继续冻结。

## Consequences

- Host runtime 现在有可同步读取、冻结且生命周期敏感的 main-owned snapshot；late event 与重复 teardown 不会复活或重复推进已失效 epoch。
- live projection 同时绑定 receipt-sealed profile 与 fresh C2A observation，且扫描中的 profile / Host 漂移具名 fail closed。
- pre-C2A generation 仍保持一般可读；只有要求 C2B 证据的路径 unavailable，迁移不会破坏旧资料。
- 固定 30 秒窗口限制一次 observation 的可复用时间，但每次 `read()` 仍需 fresh artifact scan；它不是 cache、SLO 或性能承诺。
- same-UID 主动攻击者与 pathname-based TOCTOU 仍是 residual。双 Host/profile snapshot、receipt seal 与 C2A no-follow/double observation 能检测可观察漂移，但不替代 fd-relative sandbox 或独立权限边界。
- C2B 结束后仍不能接产品 resolver：external capability evidence、Registry / revoke、完整 inventory composition、evaluation evidence、Identity / Policy、Application Service 与真实动作全部保持 pending。

## Verification

本节只记录最终实际执行的命令与结果；施工计划、历史 Green 或单一 focused suite 不冒充完成证据。

- Compatibility V2 有效 Red 为合法 string generation 被拒绝、numeric generation 仍被接受：`2 failed / 36 passed`；实现后 `test/compatibility.spec.ts` 为 `38/38`，其中既有 V1 定向回归 `12/12`。独立 reference encoder 重算两条受影响 V2 inventory evidence golden，与源码逐字一致；V1 source prefix / canonical bytes / digest namespace / goldens保持冻结。
- Host lifecycle / protocol 有效 Red 为 `11 failed / 23 passed`；实现后 Host/projection 相关五文件为 `49/49`。Projection 先因 production module 缺失取得 Red，收紧 exact Host、A/B stability、golden 与 clock 上界后为 `5 failed / 12`，最终 `test/runtime-inventory.spec.ts` 为 `12/12`。
- 三线合拢后的相邻回归为 `11 files / 130 tests`；`pnpm --dir apps/sage-shell test` 为 `24 files / 305 tests`；strict `typecheck` 与 `build` 均通过。
- 第一次隔离真实链路在 materialize 成功后 fail closed：最小 `sage-host` 只复制 `profile/paths.js`，而该文件曾为读取 receipt row 引入未复制的 C2A scanner，child 因 `ERR_MODULE_NOT_FOUND` 无法 ready。修复保留在授权的 `paths.ts`：Host 最小包继续不依赖 scanner，并由 integration test 把本地 receipt row literal 与 producer filename 绑定。
- 修复后使用临时 `SAGE_ROOT` 完成 frozen materialize → real Host ready → live projection → stop invalidation：安装 `505 packages`，ready 回报 protocol `4`，profile generation 为 UUID，`bootId` 使用 `sage-host:` namespace，runtime generation 为 `1`，projection digest 使用 `sha256:`，freshness 为 `30000 ms`；stop 后读取结果为 `host-runtime-invalidated`。本机一次样本耗时为 materialize `23783 ms`、Host ready `2752 ms`、projection `8542 ms`，这些都不是产品常量或 SLO；临时根已回收，未读取或修改 live Sage root。
- `node scripts/gates/adr-agent-records.mjs --write` / `--check` 通过；ADR / docs-links tests 为 `31/31`。
- revision 16 的终态 `pnpm run gate` 为 `22/23`：当时唯一失败是 `sage-shell-pin` 要求 `SHELL_HOST_PROTOCOL_VERSION=4` 等于 pinned vendor 的 `DESKTOP_HOST_PROTOCOL_VERSION=3`；官方 smoke 也仍显式断言 `protocolVersion === 3`。这两处都在 revision 16 的 23 文件授权范围之外，因此该 activity 正确以 failed 结束，没有放宽、跳过或静默改写门禁。
- revision 17 只关闭上述验收接缝。`sage-shell-pin` 现在独立要求 Sage lifecycle v4，并继续逐值 pin 上游 DSH3 v3 的六个 FD3/FD4 framing 常量；selftest 以有效 Red 证明旧实现无法表达该分职，Green 后为 `22/22`。`scripts/gate.mjs` 的 remediation 同步说明两类版本的 owner，不再把 lifecycle 错指给 vendor。
- 同一临时 `SAGE_ROOT` 的官方 smoke 从“仅旧 v3 断言失败”转为全绿：exact parser 接受 protocol v4 ready，并逐项核对 active profile generation、manifest SHA-256 与 `loaderPhase: "active"`；原有产品页面、API 隔离、路径穿越和 shutdown 断言全部保留。该临时根只用于 revision 17 隔离验收，验收后已回收；未读取或修改 live Sage root。
- revision 17 复验结果：`pnpm --dir apps/sage-shell test` 为 `24 files / 305 tests`，strict `typecheck` 与 `build` 通过；ADR 派生账本为 `168` 篇 ADR / `253` 条 machine-readable decisions，ADR / docs-links tests 为 `31/31`；`pnpm run gate` 为 `23/23`，无 skip、无 failed。
- 当前 staged area 为空；revision 17 源码、门禁、文档和 Birdview 变化均未暂存、未提交、未推送。WT-02C.2B 的实现与验收门已经闭环，但它仍只证明 boot-scoped Host observation；C2C、C2D、C3、WT-02D、Application Service、UI、插件与真实动作继续 pending。
