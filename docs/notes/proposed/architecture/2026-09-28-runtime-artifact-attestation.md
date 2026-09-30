# Runtime Artifact Attestation 架构与交接

- 日期：2026-09-28
- 状态：WT-02C.2A 已在当前未提交工作树实现并完成本地验证；后续 WT-02C.2B 已另行建立 boot-scoped Host live projection，但 C2A 仍只证明安装后内容，不代表完整 runtime inventory、Compatibility Authority 或产品调用链完成
- ADR：[ADR-0167](../../../adr/ADR-0167.md)
- 关联：[ADR-0165 · Sage Compatibility Authority](../../../adr/ADR-0165.md)、[ADR-0166 · Compatibility 双层 exact-digest](../../../adr/ADR-0166.md)
- 实现：[runtime-artifact-attestation.ts](../../../../apps/sage-shell/src/profile/runtime-artifact-attestation.ts)、[materialize.ts](../../../../apps/sage-shell/src/profile/materialize.ts)
- 测试：[runtime-artifact-attestation.spec.ts](../../../../apps/sage-shell/test/runtime-artifact-attestation.spec.ts)、[materialize.spec.ts](../../../../apps/sage-shell/test/materialize.spec.ts)

## Problem

原有 Sage profile receipt 只封存 copy-plan owned files。`pnpm install` 在 staging 内形成的真实 `node_modules` 可能包含 virtual store files、hardlinks、package symlinks、`.bin` links、可执行位和机器相关 installer metadata；这些事实既不能由依赖声明推导，也不能由 Host ready、package version、插件自报 metadata 或 Compatibility fixture 替代。

因此待激活 generation 存在一个证据缺口：Sage 能证明「计划复制了什么」，却不能重算「安装后实际运行的 bytes 与 link topology 是什么」。如果在 active pointer 切换后才发现漂移，旧 generation 的原子回退边界已经被跨越；如果把机器路径、时间或最终 receipt 混进 portable digest，又会失去跨 generation 可比较性或形成自引用。

本 Note 的问题边界仅为 WT-02C.2A：在 materialization transaction 内建立最小安装事实。它不解决 installer sandbox、artifact 来源签名、Registry allowlist、Matrix 发布、boot freshness、health、availability、semantic compatibility、Identity / Policy 或 execution authority。

## Decision

### 1. Portable subject：`InstalledArtifactSetV1`

`InstalledArtifactSetV1` 使用以下 exact wire shape：

```ts
interface InstalledArtifactSetV1 {
  readonly schemaVersion: 'sage.installed-artifact-set.v1'
  readonly canonicalizationVersion: 'sage.runtime-artifact-attestation-canonical-json.v1'
  readonly rootPackage: { readonly path: 'package.json'; readonly sha256: string }
  readonly rootLockfile: { readonly path: 'pnpm-lock.yaml'; readonly sha256: string }
  readonly entries: readonly (
    | { readonly kind: 'file'; readonly path: string; readonly sha256: string; readonly executable: boolean }
    | { readonly kind: 'symlink'; readonly path: string; readonly target: string }
  )[]
}
```

规则如下：

- `rootPackage` 与 `rootLockfile` 分别绑定 profile 根 `package.json`、`pnpm-lock.yaml` 的实际 SHA-256；
- entry path 一律是 generation-relative、以 `node_modules/` 开头的 portable path，不写绝对路径、generation 名、uid/gid、inode 或时间；
- regular file 以 bounded streaming read 计算实际 bytes 的 SHA-256，并记录任意 execute bit 是否存在；
- hardlink 不按 inode 去重。source、alias 与其他 logical path 各自读取并产生一行，因此移除、改名或替换任一逻辑路径都会改变 subject；
- directory 不产生 row，只用于遍历和扫描前后稳定性校验；
- symlink row 保存原始 relative target，而不是解析后的机器绝对路径。target 必须非绝对、词法和物理上仍位于 attested `node_modules`，且非 dangling / cyclic；
- socket、FIFO、device 等特殊节点一律拒绝。

canonicalization 先 exact-parse，再按 `schemaVersion → canonicalizationVersion → rootPackage → rootLockfile → entries` 固定字段顺序重建；file row 固定为 `kind → path → sha256 → executable`，symlink row 固定为 `kind → path → target`。entries 以 code-unit 顺序排序，使用 UTF-8 `JSON.stringify()` bytes 计算 `sha256:<64-lowercase-hex>`。调用方输入不被修改，返回 inspection 与 nested artifact set 被冻结。

### 2. Installer metadata 独立绑定

portable set 只精确排除：

- `node_modules/.modules.yaml`
- `node_modules/.pnpm-workspace-state-v1.json`

排除表是 versioned exact path set，不是 glob。`.modules.yaml.bak`、嵌套的近似名称或未来未知 metadata 不会被静默排除。两个精确对象若存在，其真实 bytes digest 按 path 排序后进入 `sage.installer-metadata-set.v1` canonical subject，并形成 `installerMetadataDigest`。

这样可以同时满足两件事：机器 store path、pruned time 等内容不会污染跨 generation 的 `artifactSetDigest`；installer metadata 的增删改仍会改变本次 attestation，不能被忽略。

### 3. Generation attestation：`RuntimeArtifactAttestationV1`

persisted attestation 只有以下八个 keys：

```ts
interface RuntimeArtifactAttestationV1 {
  readonly schemaVersion: 'sage.runtime-artifact-attestation.v1'
  readonly canonicalizationVersion: 'sage.runtime-artifact-attestation-canonical-json.v1'
  readonly producerContractVersion: 'sage.runtime-artifact-attestation-producer.v1'
  readonly generation: string
  readonly ownedProfileDigest: string
  readonly artifactSetDigest: string
  readonly installerMetadataDigest: string
  readonly artifactAttestationDigest: string
}
```

`artifactAttestationDigest` 是前七个 body fields 按固定字段顺序 canonicalize 后的 SHA-256。`generation` 绑定本次 immutable generation；`ownedProfileDigest` 绑定 install 前 snapshot 的 copy-plan owned files；另外两个 digest 分别绑定 portable artifact set 与 instance-specific installer metadata。

attestation 明确不包含 `observedAt`、absolute path、final receipt digest、provenance、Registry approval、Matrix identity / outcome、availability、health 或 execution authority。最终 receipt digest 不进入 attestation，是为了避免「receipt 封存 attestation、attestation 又绑定 receipt」的自引用；未来 full inventory evidence 应同时引用 final `manifestSha256` 与 `artifactAttestationDigest`。

### 4. 扫描、sealed write 与 fresh verify

`node_modules` root 必须是当前 profile 内的真实目录，不能是 symlink。regular file 的安全读取顺序为：

1. `lstat` 并确认 regular file；
2. `open(O_RDONLY | O_NOFOLLOW)`；
3. 比对 path stat 与 opened handle stat；
4. 使用 64 KiB buffer 顺序 hash，不把完整 artifact 读入内存；
5. read 后再次比较 handle 与 path 的 device、inode、mode、nlink、size、mtime、ctime。

directory 扫描在递归前后比较 stat 与排序后的 entry names；symlink 在 `readlink`、lexical containment、`realpath` physical containment 与第二次 `lstat/readlink` 后才进入 subject。公开 `inspectInstalledArtifactSet()` 连续扫描两次并比较 portable set 与 metadata；materializer 的 create 与紧接其后的 verify 各执行一次完整观察，形成 activation 前的独立双观察。任何 bytes、mode、path、entry set、link target、metadata 或 I/O 漂移都 fail closed，并以 `RuntimeArtifactAttestationError.code` 提供稳定分类。

写入使用固定文件名 `runtime-artifact-attestation.json`、exclusive `wx` create、`0600` mode、fsync 与关闭后 mode/type 复核。verify 要求 persisted bytes 正好等于 canonical pretty JSON、拒绝 unknown key / wrong shape，重算 `artifactAttestationDigest`，核对 generation、owned profile 与可选 expected digest，再 fresh scan 比较 artifact / metadata digests。

### 5. Materialization transaction 顺序

生产顺序固定为：

```text
copy / compose
  → snapshot copy-plan owned files
  → pnpm install
  → verify owned files unchanged
  → compute ownedProfileDigest
  → create runtime artifact attestation
  → fresh verify runtime artifact attestation
  → add attestation file to profile receipt inputs
  → write and verify profile receipt
  → rename staging to immutable generation
  → atomically switch active pointer
```

attestation 文件作为普通 sealed file 进入现有 receipt，因此后续修改其 persisted bytes 会破坏 receipt。create / verify / receipt 任一步失败都发生在 rename 与 pointer 之前：transaction 不切 active pointer，并在 `finally` 清理 staging，旧 active generation 保持可读。rename 成功后若 pointer 写入失败，新 generation 会保留以便恢复；这不等于 pointer 已切换，也不允许返回成功。

### 6. Authority 与后续 owner

| 事实或决策 | 当前 owner / 状态 | C2A 不提供的结论 |
| --- | --- | --- |
| portable installed content | WT-02C.2A `InstalledArtifactSetV1` | 不证明 artifact 从谁发布或审核 |
| one-generation materialization observation | WT-02C.2A `RuntimeArtifactAttestationV1` + profile receipt | 不证明 active boot 正在使用它 |
| boot-scoped Host observation / freshness | WT-02C.2B 已在当前未提交工作树实现；见 [Host Live Inventory](2026-09-28-host-live-inventory.md) | 不由安装时文件扫描推断，也不等于完整 runtime inventory |
| external MCP / capability artifact 与 tool contract | WT-02C.2C，pending | 不由本地 `node_modules` 完整覆盖 |
| allowlist、descriptor provenance、Adapter mapping、revoke | WT-02C.2D Capability Registry，pending | digest 相同不等于已获产品批准 |
| Matrix lifecycle、exact rule 与 compatibility outcome | Sage Compatibility Authority / Resolver；trusted composition pending | C2A 不产生 `equivalent` |
| evaluation evidence persistence | WT-02C.3，pending | attestation 不等于历史 compatibility evidence |
| Application Service 与真实副作用前 fresh authority | WT-02D，pending | attestation 不是 authorization token |

本批不修改 `BusinessMatter` v1 event schema、codec、store 或 rehydration，也不新增 attestation event。若未来 C3 / WT-02D 需要把摘要投影到领域或审计事件，必须另行定义 schema、owner、retention 与 migration，不能在 v1 payload 中临时塞字段。

## Alternatives considered

### 只使用 root package 与 lockfile

拒绝。声明输入不能证明 install scripts、pnpm layout 或本地 mutation 后的真实 runtime bytes。

### 全树 tarball 或单个 recursive hash

拒绝。若直接纳入绝对路径、目录 metadata、inode 或时间，stable identity 会随机器漂移；若缺少显式 row schema，又无法审计某一 bytes、mode 或 link topology 为什么变化。

### hardlink 按 inode 合并

拒绝。portable subject 的观察单位是 generation-relative logical path；inode 不 portable，合并还会漏掉 alias 被改名、移除或替换。

### 跟随或全面拒绝 symlink

都拒绝。跟随会抹掉 topology 并扩大逃逸风险；全面拒绝与 pnpm 合法 virtual store / `.bin` links 不兼容。采用 raw relative target + lexical/physical containment + dangling/cycle rejection。

### 把 pnpm metadata 混入 portable set或完全忽略

都拒绝。前者把机器路径与时间铸入 stable subject；后者使 instance metadata 漂移不可见。采用精确排除并单独绑定。

### 在 attestation 中绑定最终 receipt

拒绝。receipt 必须封存 attestation 文件，反向绑定会产生自引用。未来 inventory evidence 同时引用两者。

### 运行时由 Host / plugin 自报

拒绝。自报缺少 activation 前 failure boundary，也把 C2A owner 从 Sage materializer 错移到被观察对象。Host live facts属于 C2B，外部 capability 属于 C2C。

## Consequences

- profile activation 现在有明确的 C2A fail-closed gate；package、lock、file、logical path、executable、symlink 与 installer metadata 漂移都能被重算发现。
- 同一 portable tree 在不同 generation 得到相同 `artifactSetDigest`，但 generation 或 owned profile 变化会产生不同 `artifactAttestationDigest`；stable content 与 instance evidence 不再混淆。
- 大型 pnpm tree 需要两次顺序观察。hash 使用固定 64 KiB buffer，内存有界；时间成本随文件数量、bytes 与 filesystem 性能变化。
- same-UID 主动对手仍是 residual：当前 no-follow file open、handle/path stat、directory entry double-check 与双观察可以阻断已观察到的替换，但 Node pathname-based recursion 不是 fd-relative sandbox，不能宣称消除所有 TOCTOU。
- installer 的 profile 外副作用仍是 residual：网络、用户目录、系统配置、全局 cache 或其他路径不在 C2A subject 中。未来必须由 sandbox、Policy、provenance 和产品部署边界控制。
- digest 只证明 canonical content identity；没有受信 producer / Registry / Matrix / boot observation 时，任何 caller 都不能把它升级为 provenance、availability、compatibility 或 execution authority。
- C2B 已另行建立独立 Host live projection；C2C、C2D、C3 与 WT-02D 仍保持 pending。C2A Green 与 C2B projection 都不会让现有 Compatibility V1 / V2 fixture 自动成为产品 authority。

## Verification

当前未提交工作树的实际验证结果：

- focused runtime-artifact-attestation 与 materialize suites：`21/21` 通过；其中逐项覆盖 generation / owned-profile binding mismatch、persisted digest forgery、`0600` mode drift，以及 attestation 已创建后 receipt 写入失败时旧 pointer / generation 保留与 staging 清理；
- 相邻 profile / Host suites：`31/31` 通过；Sage Shell 全量：`22 files / 271 tests` 通过；
- Sage Shell strict `typecheck` 与 `build` 通过；
- ADR / docs-links 自测：`31/31` 通过；Sage quick gate：`23/23` 通过且 `0 skip`；
- 在隔离临时 Sage root 执行真实 frozen materialize：安装 `505 packages`，attested `24,567 files / 10 symlinks / 276M`；
- 该次端到端 materialize 总耗时 `89.42s`，其中 pnpm install `70.2s`；active pointer、profile receipt、attestation `0600` regular file 与 digest binding 均复验通过；
- 隔离临时根已回收，没有读取或修改 live Sage root，也没有暂存、提交、推送或发布。

生产实现包含 file / directory 前后 snapshot 与 create / verify 双观察，但测试没有使用不稳定的调度竞态去伪造“扫描函数执行到一半恰好并发改写”的自动化覆盖；该场景仍按上文 same-UID / pathname TOCTOU residual 处理，不能由 `21/21` 外推为完整对抗同 UID 主动攻击者。

这些数字只描述 2026-09-28 当前机器、当前依赖图与当前工作树的一次验证样本。`505`、`24,567`、`10`、`276M`、`89.42s`、`70.2s` 以及该次生成的任何 digest 都不是稳定产品常量、兼容阈值、SLO、release manifest 或 production acceptance；依赖、filesystem、cache 和机器变化时必须重新实测。
