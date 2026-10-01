# WT-02C.2E.2 · RuntimeInventoryProvider 组合（实施计划）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付 main-owned `RuntimeInventoryProvider`：汇合 C2B 投影 + PMAP 静态证据 + active profile/instance authority + registry 端口 → 生成 stable `RuntimeDescriptorV2` 与 full `RuntimeInventoryEvidenceV2`（自验绑定、deep freeze、任一缺项具名 unavailable）。

**Architecture:** 单一新模块 `src/main/runtime-inventory-provider.ts`（端口全注入、零模块级 I/O）；本票定义四个 canonical policy 文档与七个 provenance 摘要；组件六映射（host/harness/provider/model/agent/preset）复用 PMAP urn 换形与既有 `compute*DigestV2` 重算绑定；main 接线并在 host ready 后单次 read + 一行 stdout。

**Tech Stack:** TypeScript（strict、exactOptionalPropertyTypes、零运行时依赖）；vitest via `node scripts/test.mjs run`（apps/sage-shell 下）。

**Spec:** [docs/superpowers/specs/2026-10-02-wt02c2e2-runtime-inventory-composition-design.md](../specs/2026-10-02-wt02c2e2-runtime-inventory-composition-design.md)（executor 必须同时读 spec——完备性面表、字段定义、登记遗留都在那里）。

## Global Constraints

- 提交节奏：票末 feat + docs 两批推送（无逐任务提交）；tsconfig 只含 `src/**`，测试不被 typecheck——调用点更新靠清单核对。
- 内核 `compatibility.ts` / `capability-registry.ts` / C2B `runtime-inventory.ts` / PMAP `runtime-inventory-pmap.ts` **零改动**（仅消费其导出）；零持久化/零日志/零网络新增；不读 `.credentials.yaml`。
- digest 纪律：所有字段级摘要统一 `sha256:` + 64 位小写 hex；PMAP 的 `urn:…:sha256:<hex>` → `sha256:<hex>` 仅换前缀不重算；canonical JSON = 显式键序 `JSON.stringify`（无空格）。
- goldens：canonical 串的手写 golden 以一次性脚本实算后固化为字面量（不落仓库脚本）；golden 必须能被 M1/M2 类变异判红。
- version 文法：V2 只收精确 SemVer（含 prerelease）或 `YYYY-MM-DD`；`4` 不合规 → host 组件用 `'4.0.0'`（协议主版本的正式 SemVer 形，协议变更须同步改此常量与 golden）。

---

### Task 1 · 组合 provider happy path（四文档 / 七摘要 / 六组件映射 / 自验 / freeze）

**Files:**
- Create: `apps/sage-shell/src/main/runtime-inventory-provider.ts`
- Create: `apps/sage-shell/test/runtime-inventory-provider.spec.ts`（本任务写 happy-path 部分；T2 同文件续写失败层）

**Interfaces（T2/T3/T4 消费）:**
- `createRuntimeInventoryProvider(input: { paths: SagePaths; hostProjection: HostLiveInventoryProjectionProvider; pmapFs: PmapFsPorts; readFileBytes: (absolutePath: string) => Buffer; registry?: RegistrySnapshotPort }): RuntimeInventoryProvider`
- `RuntimeInventoryProvider.read(): Promise<{ kind:'available'; descriptor: RuntimeDescriptorV2; evidence: RuntimeInventoryEvidenceV2 } | { kind:'unavailable'; code: RuntimeInventoryUnavailableCode; reason: string }>`（7 个 code 见 spec §2）
- `RegistrySnapshotPort = { readonly read: () => unknown }`（返回原始快照；provider 内部 `parseCapabilityRegistrySnapshot`（`security/capability-registry.js` 导出）校验后取 `snapshotId`）

**消费的既有导出（逐一核对签名，勿猜）：** `createHostLiveInventoryProjectionProvider`/`HostLiveInventoryProjectionProvider`（`main/runtime-inventory.js`）；`collectPmapEvidence`/`PmapFsPorts`/`PmapComponentEvidence`（`main/runtime-inventory-pmap.js`）；`readActiveProfile`、`ActiveProfile` 类型与 `LOCAL_PATCH_FILE`（`profile/paths.js`）；`overlayPath`（`profile/layout.js`）；`SHELL_HOST_PROTOCOL_VERSION`/`SHELL_REQUEST_PIPE_FD`/`SHELL_RESPONSE_PIPE_FD`/`SHELL_PIPE_CHUNK_BYTES`/`HostRequestFrame`/`HostEvent` 帧 kind（`protocol.js`）；`SHELL_LABEL`/`ROOT_CONFIG_CONTENT`（`host/composition.js`）；`DSH_LAUNCH_ENVIRONMENT_KEY`（`@deepseek-ai/dsh-launch-environment`）；`computeRuntimeDescriptorDigestV2`/`computeInventoryEvidenceDigestV2` 及 V2 类型（`security/compatibility.js`）。

- [ ] **Step 1: 写 happy-path spec（红）** — 测试夹具：tmp fixture 根（复刻 PMAP E.0 的 shipped presets + provider/model settings 组合，保证 provider/model/agent 行 observed；settings.json 形态给 provider/model）+ 形状真实的 host 快照 stub（`{kind:'active', bootId:'sage-host:<uuid4>', runtimeGeneration:1, activeGeneration:<fixture generation>, manifestSha256:<64hex>, loaderPhase:'active', hostProtocolVersion:'4', harnessVersion:'0.1.5-rc.2'}`）+ 真 C2B provider（`createHostLiveInventoryProjectionProvider` 注入 stub host + 固定 clock）+ fixture active profile 落盘（`profile-current.json` + `profile-manifest.json`（其 sha 写回指针）+ `runtime-artifact-attestation.json`（600 权限，receipt sha 写回指针）——**复用 C2B spec 的夹具构造方式**（`test/runtime-inventory.spec.ts`）保持一致）+ 合法 registry 快照 stub（以 `sealCapabilityRegistrySnapshot` 构造 approved 空快照即可）。断言（逐字段）：`kind==='available'`；descriptor 六组件逐字段（host version `'4.0.0'`、host/harness artifactDigest=artifactSetDigest 换形、model 三面=provider 三面、agent identity 拆包名、preset `preset:set` 的排序不敏感聚合）；四 policy/七摘要字段存在且为 `sha256:` 形；evidence 窗口 === C2B 窗口；`runtimeDescriptorDigest`/`inventoryEvidenceDigest` 由 `compute*` 重算相符；输出 deep freeze。
- [ ] **Step 2: 跑 → 红** — `node scripts/test.mjs run test/runtime-inventory-provider.spec.ts`（模块不存在）。
- [ ] **Step 3: 实现** — 模块骨架按 spec §2：类型 + 7 code + `UNAVAILABLE_REASONS` 文案表；四个 canonical 文档常量与摘要函数（spec §4.1–4.4；launchPolicy 的 envPolicy 对照 `main/runtime.ts` 的 scrub/注入语义：`{electronRunAsNode:'1', dshHome:'harness-home', ambientDshHome:'dropped', nodeBinary:'SAGE_NODE_BINARY ?? execPath'}`；overlay 文件经 `overlayPath(activeProfile.profileDir)`、local patch 经 `join(paths.root, LOCAL_PATCH_FILE)` 存在性+bytes sha）；七个 provenance 摘要（spec §4.5–4.11）；PMAP 完备性检查（spec §2.1 面表）+ 六组件映射（urn→sha256 helper `contentDigestOf(urn)` 断言 urn 形并切前缀）；registry 校验（`parseCapabilityRegistrySnapshot` KernelResult 形态解包）+ capabilities 映射（spec §5）；固定顺序编排 + `compute*` 自验（try/catch → `assembly-invalid`）+ 显式绑定断言 + `freezeDeep`。
- [ ] **Step 4: goldens 实算固化** — 以一次性 `node -e`（或 /tmp 脚本）对四文档与七个摘要的期望 canonical 串计算 sha256，把字面量写入 spec 的 golden 断言；再跑 → 绿。
- [ ] **Step 5: 绿 + typecheck** — spec 通过；`npm run typecheck` 0。

### Task 2 · 失败与对抗层（缺项矩阵 / 成对反例 / 自验 / hostile）

**Files:**
- Modify: `apps/sage-shell/test/runtime-inventory-provider.spec.ts`（续写）
- （实现层若发现缺口随本任务补 `src/main/runtime-inventory-provider.ts`）

**Interfaces:** 同 T1；本任务只增断言不改接口。

- [ ] **Step 1: 缺项矩阵（红→绿）** — 逐端口操纵：C2B 投影 unavailable（含每类 C2B code 抽样）→ `host-projection-unavailable` 且 reason 含原 code；`readActiveProfile` 与投影漂移（改 fixture 指针 generation/manifest）→ `active-profile-unavailable`；PMAP 行缺失/非 observed（删 presets 目录、坏 settings）→ `pmap-incomplete`；overlay 文件不可读 → `policy-document-unavailable`；registry 端口缺席 → `registry-unavailable`；registry 快照非法（`parseCapabilityRegistrySnapshot` 拒绝）→ `registry-unavailable` 带 reason；approved 条目 `source!=='c2c5'` 或 descriptor 引用非法 → `capability-invalid`；C2B `harnessVersion` 非 SemVer（如 `'not-semver'`）→ **自验捕获 → `assembly-invalid`**（这是 M4 的判红目标）。
- [ ] **Step 2: 成对反例（spec §8.3）** — 同一夹具两次 read：**瞬态**（bootId / runtimeGeneration / observedAt / 指针 generation+receipt / activatedAt 各单变量）→ `runtimeDescriptorDigest` **不变** 且 `inventoryEvidenceDigest` **变**；**语义**（PMAP provider 包 bytes / settings model 值 / overlay patch bytes / local patch 出现 / presets roster 增删）→ **两者都变**。
- [ ] **Step 3: hostile 输入** — host 快照含 accessor/Proxy/额外键、registry 快照含 getter：零 getter 执行（计数断言）+ 对应 code。
- [ ] **Step 4: 绿 + typecheck + 全量** — 两文件 spec 通过；typecheck 0；`npm test` 全量绿。

### Task 3 · V2 resolver 消费 + 真实 generation 集成

**Files:**
- Create: `apps/sage-shell/test/runtime-inventory-consumption.spec.ts`

**Interfaces:** 消费 T1 的 provider；消费 `resolveCompatibilityV2`（`security/compatibility.js`）与 `compatibility.spec.ts` 既有 V2 fixture 构造（targetSemantic / targetEvidence / currentRevision / matrix provider result——照抄其构造方式，仅把 runtime 对替换为本票产物）。

- [ ] **Step 1: 消费测试（红→绿）** — 夹具：以 T1 happy-path 产物为 runtime 对；构建一条 `{ruleId, targetSemanticDigest:<fixture target>, runtimeDescriptorDigest:<产出 descriptor digest>, outcome:'equivalent', reasonCode, reason}` 的 MatrixV2 并 `computeCompatibilityMatrixIdV2` 封 id；`resolveCompatibilityV2` → `outcome==='equivalent'`；**反向**：evidence 窗口过期（时钟推进越过 expiresAt）→ resolver 拒绝（freshness）；descriptor 篡改一字节 → `runtime-descriptor-digest-mismatch`（内核拒绝，证明产物真实参与内核校验）。
- [ ] **Step 2: 真实 generation 集成（红→绿）** — 真实 `resolveSagePaths({home: homedir()})` + 真 fs 端口 + 形状真实 host stub（activeGeneration/manifestHash 取自 `readActiveProfile`；若为 null → 断言 `unavailable('active-profile-unavailable')`；断言真实形态、不静默跳过）：预期终局 code = 指针含 attestation sha 时 `registry-unavailable`、否则 `host-projection-unavailable`（按读取事实选择并断言，**记录真实读数**供 Note）。
- [ ] **Step 3: 绿 + 全量** — spec 通过；`npm test` 全量绿。

### Task 4 · main 接线 + live 证据 + 全量回归

**Files:**
- Modify: `apps/sage-shell/src/main/index.ts`（host ready 后构造 + 单次 read + stdout 行 + options 传递）
- Modify: `apps/sage-shell/src/main/app-service.ts`（`SageAppServiceOptions` 增 `readonly runtimeInventory?: Pick<RuntimeInventoryProvider, 'read'>`（透传槽，无行为变化））

- [ ] **Step 1: 接线实现** — `main/index.ts`：`host.start()` 成功后构造 `createRuntimeInventoryProvider({ paths, hostProjection: createHostLiveInventoryProjectionProvider({ paths, host, clock: { now: () => new Date().toISOString() } }), pmapFs: { readFileBytes: (p) => readFile(p), listDirectory: async (p) => (await readdir(p, { withFileTypes: true })).map((e) => ({ name: e.name, isDirectory: e.isDirectory(), isFile: e.isFile(), isSymbolicLink: e.isSymbolicLink() })), realpath: (p) => realpath(p) }（node:fs/promises）, readFileBytes: (p) => readFileSync(p) })`；`void runtimeInventory.read().then(r => { process.stdout.write(r.kind === 'available' ? 'sage shell: runtime inventory available\n' : \`sage shell: runtime inventory unavailable (${r.code})\n\`) }).catch(() => { process.stdout.write('sage shell: runtime inventory unavailable (assembly-invalid)\n') })`（不阻断启动、脱敏仅剩稳定行）；`createSageAppServiceProviders({ …, runtimeInventory })` 透传槽。
- [ ] **Step 2: typecheck + 全量** — `npm run typecheck && npm test` 全绿。
- [ ] **Step 3: live 验收** — `npx tsc && npx electron .`（后台，短时）：stdout 须出现 `sage shell: host ready…` 后一行 `sage shell: runtime inventory unavailable (registry-unavailable)`（若真实指针缺 attestation 则为其具名 code——按真实现场读数如实登记）；随后停掉实例。
- [ ] **Step 4: 全量回归** — `npm run typecheck && npm test && npx tsc && npm run smoke`（apps/sage-shell）；`pnpm run gate`（仓根）25/25。

### Task 5 · 变异 + 留痕 + 提交

- [ ] **Step 1: 变异 M1** — descriptor 混入瞬态字段（如 `host.identity` 拼接 bootId）→ 成对反例「瞬态只改 full」红；还原。
- [ ] **Step 2: 变异 M2** — registry 端口缺席时伪造空快照（吞掉 `registry-unavailable`）→ 缺项矩阵红；还原。
- [ ] **Step 3: 变异 M3** — overlay 摘要忽略 local patch（恒 null）→ 语义反例（local patch 出现 → 两者都变）红；还原。
- [ ] **Step 4: 变异 M4** — 跳过 `compute*` 自验（直接输出 body + 预置 digest）→ `harnessVersion 非 SemVer → assembly-invalid` 用例红；还原。
- [ ] **Step 5: 留痕** — Note `docs/notes/implemented/architecture/2026-10-02-wt02c2e2-runtime-inventory-composition.md`（Problem/Decision/Alternatives/Consequences + 真实读数〔消费测试/equivalent、真实 generation 终局 code、live stdout 行〕+ 变异记录 + 登记遗留⑦项）；ADR-0191 + `docs/adr/README.md` 行 + `node scripts/gates/adr-agent-records.mjs --write`。
- [ ] **Step 6: 提交** — `feat(sage): main-owned runtime inventory composition with stable descriptor and full evidence (WT-02C.2E.2)` + `docs(adr): ADR-0191 WT-02C.2E.2 with note`（含 spec/plan），`git push origin main`。

## 验证命令（收口）

```bash
cd apps/sage-shell && npm run typecheck && npm test && npx tsc && npm run smoke
cd /Users/lute/project/Sage && pnpm run gate
```

## 边界（不做）

C2D.2A registry provider、C2C.5 external provider、resolver/D.2 编排接线、matrix 发布、Host protocol 扩展、v1 改动、内核与 C2B/PMAP 既有行为零改动（仅消费）。
