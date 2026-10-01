# AGENTS.md · Sage

本仓库是 Sage 桌面产品的活动开发仓。Harness 保留为能力运行时与历史兼容边界，不再拥有产品壳；旧插件、旧发布链和历史证据默认隔离。以下是**每个会话都要在上下文里的常驻规则**，每条只给结论与归属地；详细内容一律在被链接的文档里，不要在此复述。

## 基座与红线

- **基座只 pin 不改**：`deepseek-harness` 与 `vendor/dsh-desktop` 均为 pin 的只读参照（[ADR-0008](docs/adr/ADR-0008.md)）；补丁与 pin 的实际契约在 `vendor/dsh-desktop.pin`，改 pin 必须与行为变更分开提交。
- **版本跟进走观察窗**：上游新稳定版先观察 2 周，仅红线触发才跟进（[ADR-0006](docs/adr/ADR-0006.md)）。
- 架构红线（凭证不落仓库、不碰 shadows-shipped-ui slot、编辑工具会打破 `file:` 硬链接须 tmp+mv 同步、**官方 UI 改写锚禁止钉哈希**）见 [docs/architecture.md](docs/architecture.md) 第 2 节。

## 改动的验收方式

- **一条命令给 Sage 证据**：`pnpm run gate`（提交前）与 `pnpm run gate:full`（推送前）只跑 Sage BASE allowlist；退出码即契约，门禁契约表见 [docs/architecture.md](docs/architecture.md) 第 0 节。历史平台、旧插件与发布链只能显式运行 `pnpm run gate:legacy*`，其结果不得冒充 Sage 验收。
- **门禁是硬门槛**：契约级校验一律阻塞；存量未达标的包登记在 `scripts/gates/exemptions.json`，该文件**只减不增、到期即拒绝**（[ADR-0014](docs/adr/ADR-0014.md)）。
- **不接受口头验收**：改动必须给出真实命令输出（Red/Green、构建、浏览器验收），未跑就写「未运行」。
- **开工前先读复发故障总账**：[docs/pitfalls-playbook.md](docs/pitfalls-playbook.md) 按**根因**列出会复发的故障（未验证的事实被钉进出货面、仪器假绿、「知道」没有变成「拦住」、写了但从没跑到、隔着解释器写字面量、把平台行为当常量、一条事实多个家、用纪律守只有机制能守住的东西、挂死主线程的观测悖论——所有仪器都要过故障现场，症状层修复被当成根除〔P-52，2026-09 黑屏事故〕）。每条点名了拦它的**门禁名**，由门禁 `pitfalls-playbook` 守着，不会腐烂；改完一类缺陷就往里加一条。
- **挂死/卡死类故障先建旁路再排查**：CPU 100%+、inspector 超时、console 零输出、rAF 不跑四签名同时成立 = 渲染主线程被微任务级联饿死——禁止跳到 JIT/CLI/版本玄学；旁路取证手册在 `~/.agents/skills/dsh-desktop-diagnostics/SKILL.md`（铸 cookie + 独立 Chrome + 预启用 Debugger 的 pause 中断）。改共享层 `shared/client/sidebar-entry-core.ts` 的 observer 时必须维持不变量：**对被观察子树的写操作，移动一次后不得再满足移动条件**。

## 活动仓与续作边界

- **先读本机活动仓基线**：开工前阅读 [本机活动仓基线](docs/notes/implemented/process/2026-09-27-local-active-repository-baseline.md)、[ADR-0160](docs/adr/ADR-0160.md) 与任务相关 ADR。恢复集不是活动依赖；不得整包回灌旧施工内容。
- **UI 工作先读一致性合同**：任何 Sage renderer、工作台、设计 token、Application Service 投影或 Sanbao 交互迁移任务，先读取 [Sanbao → Sage UI 一致性合同](docs/specs/2026-09-27-sanbao-to-sage-ui-consistency-contract.md) 及其[机器可读状态映射](docs/specs/2026-09-27-sanbao-to-sage-ui-state-map.json)；外部原型只作证据输入，不是运行时依赖或完成声明。
- **身份、授权与数据治理工作先读安全边界**：任何 identity provider、组织岗位授权、Application Service、`BusinessMatter` actor / decision / receipt、`AuthoritySnapshot`、retention 或删除传播工作，先读取 [Identity / Policy Resolver 架构记录](docs/notes/proposed/architecture/2026-09-28-identity-policy-resolver.md)、[ADR-0163](docs/adr/ADR-0163.md)、[真实身份与 Authority 数据治理记录](docs/notes/proposed/architecture/2026-09-28-real-identity-and-authority-data-governance.md)与 [ADR-0164](docs/adr/ADR-0164.md)；结构相同的 `HumanRoleRef`、UI / 插件自报身份和测试 provider 都不是真实身份依据。
- **真实身份接入默认最小化并 fail closed**：Sage native app 只走系统浏览器 OIDC Authorization Code + PKCE；Identity Provider 只证明认证，Sage-owned mapping 只产生内部 identity handle、候选 organization ref 与高熵随机 scoped `subjectRef`，Organization Policy 独占 active membership、岗位和 grant authority；禁止用 raw subject 的无密钥 deterministic hash 生成 pseudonym。token、session、raw provider subject 不得进入 renderer、Host、Harness、插件、事件、日志、导出或备份；offline 对 authority-scoped projection 默认拒绝，未来只有独立批准的 public / local-only allowlist 可只读，所有受保护命令必须在线重新求值且失败即拒绝。token / session 始终立即清除；有效 legal hold 只能把 mapping / evidence 隔离并登记 pending deletion，解除后幂等 purge。retention / legal hold 尚未确认时禁止持久化真实身份或敏感经营数据；治理文档落档不等于真实 provider、产品接线或产品验收完成。
- **兼容性与插件融合先读 Compatibility Authority**：任何 compatibility target、runtime inventory、matrix、Capability Registry、插件 descriptor、Host live observation、Application Service 或 UI 兼容状态工作，先读取 [Compatibility Authority 架构记录](docs/notes/proposed/architecture/2026-09-28-compatibility-authority.md)、[ADR-0165](docs/adr/ADR-0165.md) 与 [ADR-0166](docs/adr/ADR-0166.md)。只有 Sage-owned authority 可产生 `equivalent`；profile receipt、Host / Loader ready、插件 / MCP 自报、package version、进程存在、工具数量和 fixture 都只是局部事实或 observation。完整 `targetDigest` / `inventoryDigest` 只证明当次实例，app-bundled matrix 只匹配由受信 security kernel 重算的 `targetSemanticDigest` / `runtimeDescriptorDigest`；禁止按 matter、revision 或 boot 动态铸造 matrix。UI、插件、Host 与模型不得提交 `outcome`、`matrixId`、`executionSnapshot`、authoritative full / stable digest，也不得把自报 digest 当作 authority；它们可以提供候选 metadata / digest observation，由 main-owned provider 绑定并验证 provenance。真实登录等待期间只允许纯 kernel、fixture / blocked projection 与 inventory 开发，真实业务 mutation 和外部副作用继续 fail closed。
- **Runtime artifact attestation 只证明安装时内容**：任何 profile materialization、installed artifact、runtime inventory 或相关 digest 工作，先读取 [Runtime Artifact Attestation 架构记录](docs/notes/proposed/architecture/2026-09-28-runtime-artifact-attestation.md) 与 [ADR-0167](docs/adr/ADR-0167.md)。C2A 的 `artifactSetDigest` / `artifactAttestationDigest` 只证明激活前观察到的 bytes、executable bit、logical path、symlink topology 与 installer metadata binding；不证明 producer provenance、Capability Registry、Matrix、boot freshness、availability、compatibility 或 execution authority。boot drift 归 WT-02C.2B，外部 capability 归 WT-02C.2C，Registry / revoke 归 WT-02C.2D；不得把安装时 attestation 冒充 live runtime inventory。
- **Host live projection 只证明一次 boot observation**：任何 Host protocol、Loader lifecycle、runtime epoch、active profile / receipt binding、inventory freshness 或 projection digest 工作，先读取 [Host Live Inventory 架构记录](docs/notes/proposed/architecture/2026-09-28-host-live-inventory.md) 与 [ADR-0168](docs/adr/ADR-0168.md)。`HostLiveInventoryProjectionV1` 必须由 Electron main 以双 Host/profile 快照、receipt-sealed C2A fresh verify 与最后取时钟产生；ready 后 Loader transition、fatal、exit、disconnect 或 stop 立即失效。它不是完整 `RuntimeInventoryEvidenceV2`，也不证明 external capability、Registry / revoke、Matrix compatibility、availability、Identity / Policy 或 execution authority；禁止用 placeholder 补齐 C2C/C2D/C3/WT-02D 缺项。
- **External capability evidence 必须同执行连接、完整分页并可失效**：任何外部 MCP descriptor、artifact closure、tool-contract digest、`tools/list` observation、health / preflight、`list_changed` 或 capability availability 工作，先读取 [External Capability Evidence 架构记录](docs/notes/proposed/architecture/2026-09-28-external-capability-evidence.md)、[ADR-0169](docs/adr/ADR-0169.md) 与 [ADR-0170](docs/adr/ADR-0170.md)。当前 `WT-02C.2C.5 revision 23` 只提供无 I/O 的 aggregate evidence kernel，`WT-02C.2C.3 revision 24` 另提供仅针对显式 local artifact root / static execution manifest 的 bounded observer，`WT-02C.2C.4 revision 25` 再提供四轴 availability / preflight 边界合同：前者绑定 caller 已提供的 descriptor / provenance / C2B host / 同代 connection 与显式 freshness，不扫描实际 bytes、不过桥、不读系统时钟；中者才读取受控 root 的实际 bytes / executable bit / safe links 并输出 pathless candidate evidence；后者只重算 caller-supplied availability / candidate port 结构，`actionability` 永远为 `blocked`，不证明真实 operation、Identity / Policy 或 Registry。正式 provider 仍必须等待 bridge-owned seam、完整分页、artifact provenance、availability / preflight 与 trusted clock。Host / MCP bridge 只提供同一 connection generation 的 raw observation；Electron main 负责 exact parse、完整有界分页、artifact / effective contract 重算、C2B binding、trusted clock 与失效，但不能替 C2D Registry 审批或替 Matrix 产生 `equivalent`。tool annotations、名称、描述、进程存活、连接成功、工具数量、单页 list、历史调用和插件自报都不是 effect / permission / compatibility authority；C2C 不调用真实业务工具，secret、raw command 与机器路径不得进入 descriptor、evidence、日志或 denial reason。C2C seam 只能由 bridge-owned 正式 release / 可复现 fork 提供，禁止 Sage 另开第二连接、从 `ctx.tools` 反推或 patch `node_modules`。
- **Capability Registry 先治理、后接线**：任何 Registry、allowlist、descriptor provenance、Adapter operation mapping、enable/disable/revoke 或 capability approval 工作，先读取 [Capability Registry 治理记录](docs/notes/proposed/architecture/2026-09-29-capability-registry-governance.md) 与 [ADR-0171](docs/adr/ADR-0171.md)。Registry 只由 Sage product/security governance 拥有 `candidate | approved | disabled | revoked` 四态与 immutable snapshot；`mounted / observed / enabled / compatible / authorized / available` 保持正交。WT-02C.2D.1 的 pure kernel 只消费 caller-supplied candidate / verified descriptor reference，不能证明 provider provenance、real entry 或执行权。没有 C2C.5 verified descriptor/provider、真实 Adapter mapping、owner approval 与可追溯 provenance，不得产生生产 `approved` entry 或 `adapterMappingDigest`；C2D.0 / C2D.1 治理与内核都不等于 Registry provider、插件启用、产品授权或真实动作。
- **Application Service 是唯一产品编排入口**：任何 `/.sage/*` route、`ViewState` / `ActionIntent`、projection read policy、Identity / Policy + Compatibility + Registry + BusinessMatter 编排、idempotency / cancel / retry / receipt / `outcome-unknown` 工作，先读取 [WT-02D Application Service 边界](docs/notes/proposed/architecture/2026-09-30-application-service-boundary.md) 与 [ADR-0174](docs/adr/ADR-0174.md)。目标形态由 Electron main 精确终止业务 route，只经窄 port 访问 Host / Capability Adapter；renderer、Host、插件与模型不得成为平行 command / projection owner。production 缺任一真实 authority 时必须 unavailable-first，不得用 fixture、placeholder、Host ready 或历史绿灯补齐。revision 37 只落治理文档；WT-02D.0.1 已由 Electron main 拦截 `/.sage/*`（[ADR-0179](docs/adr/ADR-0179.md)：unavailable-first；command 2–10 属 0.2），[ADR-0184](docs/adr/ADR-0184.md) 后 `/.sage/*` **恒由 main 终止**——`SAGE_APP_SERVICE=off` 回退与 Host 旧 `/.sage` 面已退场（main 唯一 owner），matter 投影槽经 `SAGE_FIXTURE_PROJECTION=1` 显式 fixture 开关填充、production 恒 `null` 且禁止 placeholder；renderer / Host 不再是这条 route 的 owner。
- **仓根必须动态发现**：代码、测试和维护命令使用 `git rev-parse --show-toplevel`、`import.meta.url` 或脚本自身位置；禁止新增用户机器绝对仓路径。历史证据和故意验证绝对路径会判红的 fixture 除外。
- **历史能力默认隔离**：受控浏览器、legacy 门禁、Laya、旧插件与旧 DMG 发布链只有在单独任务明确启用时才进入改动和验证射程；`pnpm run gate` 不运行这些检查，需用 `pnpm run gate:legacy*` 显式进入；accepted ADR 不等于实现已进入当前基线。
- **不明改动不擅自归属**：继续旧任务前核对 branch / status / diff / untracked 和任务记录；不以 reset、清理或放宽判据换取绿灯。

## 决策与文档

- **非机械改动必须留痕**：同一次提交附一篇决策记录 Note（`docs/notes/{lifecycle}/{class}/yyyy-mm-dd-topic.md`，必备 `## Problem` / `## Decision` / `## Alternatives considered` / `## Consequences`），对应 ADR 编号登记在 `docs/adr/`（[ADR-0015](docs/adr/ADR-0015.md)）。
- **一份事实只有一个家**：同一结论只写一处，其余位置留相对 Markdown 链接；链接可达性由门禁校验（[ADR-0009](docs/adr/ADR-0009.md)）。
- 文档分层：本文件（常驻规则）→ [docs/architecture.md](docs/architecture.md)（有序地图）→ `docs/notes/`（决策）→ 各能力组 README（包契约）。索引见 [docs/README.md](docs/README.md)。

## 目录与归属

- 插件按能力归入 5 组：`capabilities/` `surfaces/` `platform/` `contract/` `infra/`（[ADR-0011](docs/adr/ADR-0011.md)）。
- 包的治理性质写在 `package.json` 的 `luteOrigin` / `luteOwner` / `lutePublish` 三字段里，`npm-pinned` 的包不在本仓库内（[ADR-0010](docs/adr/ADR-0010.md)、[ADR-0012](docs/adr/ADR-0012.md)）。
- 当前重构分期与本次范围见 [.scratch/lute-refactor/spec.md](.scratch/lute-refactor/spec.md)。

## Legacy 产品矩阵与外部产品（仅显式旧平台任务适用）

- 以下规则只在用户明确进入旧 DSH profile / 旧插件任务时启用；Sage 当前使用独立数据根，尚未建立新的插件装配契约，不得把 `~/.dsh` 当作 Sage 运行时。
- **外部产品不进 legacy 出货 preset**：`scripts/role-presets/generate.mjs` 的 `PRODUCT_MOUNTS` 保持为空；任何 `file:` 指向仓库外的产品包都不得烘焙进 `agt-*` 旧出货组合（[ADR-0056](docs/adr/ADR-0056.md)）。
- **旧平台本机使用外部产品走 profile 本地装配**：在 `~/.dsh/profiles/<profile>/cordis.patch.yml` 里显式挂载，并确保包仍在 `dsh.profile.bundles`；装配只改旧运行时 profile，不进仓库出货物（[ADR-0061](docs/adr/ADR-0061.md)）。
- **新应用抽屉读取可选 host 服务须双通道探测**：`ctx.get('agentPresets')` 与 `connection.api.agentPresets` 都要试，以是否存在可调用 `select` 为准，不得假设单一载体（[ADR-0061](docs/adr/ADR-0061.md)）。

## Legacy 发布与 SOP（仅显式旧 DMG 任务适用）

- Sage.app 的装配、签名、公证与发布链尚未建立；不得把旧 DMG 通过当作 Sage 发布证据。
- **旧 DMG 打包发布按 legacy SOP 执行**：仅在用户明确进入旧发布任务时使用 [docs/sop/dmg-release.md](docs/sop/dmg-release.md)；关键红线（原子就位、清单入库、同号归档、机器路径只减不增）来自 [ADR-0056](docs/adr/ADR-0056.md) / [ADR-0057](docs/adr/ADR-0057.md) / [ADR-0058](docs/adr/ADR-0058.md)。
