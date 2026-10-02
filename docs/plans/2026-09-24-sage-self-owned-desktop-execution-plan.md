---
title: Sage 自有桌面端执行方案
status: wt-02d0-1-frame-policy-revision-41-adopted-uncommitted
date: 2026-09-24
---

# Sage 自有桌面端执行方案

> 产品决策：[ADR-0159](../adr/ADR-0159.md) · 存储决策：[ADR-0161](../adr/ADR-0161.md) · 身份治理：[ADR-0163](../adr/ADR-0163.md)、[ADR-0164](../adr/ADR-0164.md) · 兼容性治理：[ADR-0165](../adr/ADR-0165.md)、[ADR-0166](../adr/ADR-0166.md)、[ADR-0172](../adr/ADR-0172.md)、[ADR-0173](../adr/ADR-0173.md) · 安装事实治理：[ADR-0167](../adr/ADR-0167.md) · Host 活态治理：[ADR-0168](../adr/ADR-0168.md) · External Capability / seam：[ADR-0169](../adr/ADR-0169.md)、[ADR-0170](../adr/ADR-0170.md) · Registry 治理：[ADR-0171](../adr/ADR-0171.md) · 设计树：[Sage 自有桌面壳设计树](../notes/proposed/architecture/2026-09-24-sage-self-owned-desktop-design-tree.md) · 存储交接：[BusinessMatter 权威事件存储](../notes/proposed/architecture/2026-09-27-business-matter-event-store.md) · 兼容性交接：[Compatibility Authority](../notes/proposed/architecture/2026-09-28-compatibility-authority.md) · Target 治理交接：[Compatibility Target 治理](../notes/proposed/architecture/2026-09-29-compatibility-target-governance.md) · 安装事实交接：[Runtime Artifact Attestation](../notes/proposed/architecture/2026-09-28-runtime-artifact-attestation.md) · Host 活态交接：[Host Live Inventory](../notes/proposed/architecture/2026-09-28-host-live-inventory.md) · Registry 交接：[Capability Registry 治理](../notes/proposed/architecture/2026-09-29-capability-registry-governance.md)

> Application Service 治理：[ADR-0174](../adr/ADR-0174.md) · 交接：[WT-02D Application Service 边界](../notes/proposed/architecture/2026-09-30-application-service-boundary.md)

## 目标与边界

目标不是把 DSH Desktop 改字，而是交付由 Sage 自己拥有窗口、路由、交互、产品状态和发布身份的桌面端。Harness 保留为可替换能力运行时；Sanbao 原型只提供产品交互合同；外部参照项目只提供经审查的输入。

P0-1 与 P0-2 已获用户在 Birdview 的明确文件级确认并完成本地源码验证；P0-3A 的 Sage 资料根与受控 generation 已获得确认并完成本地验证。真实旧资料导入、资产、DMG 或发布仍必须以各自的 Birdview 精确范围和确认推进。

本轮明确不做：

- 不修改 `vendor/**`、`deepseek-harness`、pin、当前 `/Applications/DSH Desktop.app`、`~/.dsh/profiles/desktop` 或 Sanbao 外部源仓。
- 不将 Sanbao 原型、官网、Career、AI组织变革或 JEV 以仓库外 `file:` 依赖、iframe 或 WebView 置入 Sage 运行时。
- 不删除旧 App、旧资料、历史 DMG、release manifest 或未知未跟踪项。
- 不将 Harness、DeepSeek、Lute 等真实第三方或历史技术事实从许可证、依赖、vendor pin 或证据记录中抹除。

## 当前事实与目标形态

```text
当前：LUTE Electron host → 上游 dsh-web-frontend / client slot → DSH UI

目标：Sage Shell → Sage renderer / 经营事项状态 → Capability Adapter → Harness runtime
                    ↑                                  ↓
           Sage 派生图标与字标                  受控工具、审批、产物、回执
```

| 责任 | 当前可复用事实 | Sage 目标 | 不能直接沿用 |
| --- | --- | --- | --- |
| 桌面运行时 | Electron 安全窗口、私有协议、子进程、FD3 / FD4、凭证清洗和拆机阶梯 | `apps/sage-shell` 的 Host 基线 | `dsh-web-frontend`、上游 Composer slot、默认 DSH onboarding |
| 产品交互 | Sanbao 原型的页面、状态、触发、退出与 fixture | Sage 自有 renderer 的验收合同 | 外部原型源码、第二套导航、静态按钮冒充真实 Host |
| 主图形 | A StarSail Product symbol 几何、同源深浅色调性 | 清洗后的 Sage symbol、AppIconset、Sage lockup | `SanBao` 路径字标、概念图、manifest、生成记录 |
| 能力与组织 | Harness agent / plugin / Cordis；Career 与 AI组织变革的事项/角色语义；Jev 的受控判断 | Capability / Connector / Jev Adapter | DSH profile 注入、未标定自动行动、把候选资产视作功能 |
| 发布与迁移 | 旧 DSH 仅作迁移来源 | Sage 自有 Bundle ID、资料根、签名、更新与 DMG | 旧 DSH 安装器、旧 Bundle ID、原地破坏式迁移 |

## 分期 Todo 与验收门

### P0-0｜保护边界与可审阅计划

- [x] 记录品牌、产品边界、身份策略和清理规则：ADR-0159、设计树、术语表。
- [x] 更新 Birdview 至 Sage 迁移 revision；P0-1 的精确文件范围保存在本机按需生成的 `.birdview/activity-sage-shell.html`，不作为跨机器 tracked 依据。
- [x] 建立只读迁移台账：原型 206 状态按“参考 / 已实现 / 未实现 / 不适用”标注；不复制原型源码。
- [x] 建立只读清理清单：每个候选包含 owner、来源、用途、保留期、恢复位置、`retain/archive/delete` 建议；未知项默认 `retain`。
- [x] 用户已在 Birdview 对 P0-1 的文件范围作出明确确认；实施仍不改 App、真实 profile、资料或发布物。

**通过条件：** 计划、ADR / Note、Birdview 与下列台账可相互链接；无产品代码、profile、App 或发布物被改写。

#### P0-0 台账 A：Sanbao 原型迁移基线（只读）

来源是 `/Users/lute/project/Sanbao/repository-snapshot/apps/sanbao-prototype`。该工作树本身有未提交和未跟踪改动，因此它只作为**交互合同输入**，不作为 Sage 的运行时依赖或可直接复制的源码。

`node scripts/check-interaction-contract.mjs --json` 于 2026-09-24 返回 `PASS`：59 个组、206 条状态；其中 `observed` 123、`entry-observed` 28、`static-only` 55，且 206/206 均有 trigger、exit / recovery 与 evidence。这个读数证明目录自洽，**不证明 Sage 已实现任何一个界面或能力**。

| 台账状态 | 数量 / 范围 | 当前结论 | 后续动作 |
| --- | --- | --- | --- |
| `参考` | 206 / 206 | 全部是外部原型的状态、触发、退出和证据合同。 | P0-2 / P0-5 按状态逐条建立 Sage 目标、Adapter 契约与测试。 |
| `仓库基线已实现（Sage）` | 自有静态 renderer + availability Adapter | P0-2 产品边界已进入当前仓库基线；尚未与经营事项、真实能力或 GUI 实机闭环接线。不得把 Host / DSH 现有能力算入。 | 保持产品边界，后续只经 Application Service 与 Capability Adapter 接入。 |
| `当前工作树已实现、未提交` | WT-01 纯内存 `BusinessMatter`：创建、证据、运行、澄清/审批、产物/回执、失败/重试六段 | 领域源码、测试与合同在当前工作树通过本地验证，但仍为未跟踪/未提交内容，不是 `HEAD` 或其他 checkout 可用的仓库基线。WT-01 本身不含持久化、原型 UI、真实能力或实机闭环；当前 store 状态见下一行。 | 保留当前差异；未经另行授权不提交，并按 P0-5 分层推进。 |
| `当前工作树已实现、未提交` | WT-02A.0 权威事件存储合同 + WT-02A.1 strict codec / rehydrator + WT-02A.2 SQLite store + WT-02A.3A 进程级对抗 + WT-02A.3B POSIX 路径边界 | 决策、纯领域 v1 codec / strict replay、测试临时 Sage root 内的 store、独立进程 / 故障 / 篡改验证，以及固定路径 / owner / mode / link / 可观察替换隔离已实现；产品运行时接线、真实数据根与 same-UID 持久 capability 未实现。 | 继续完成 WT-02B 真实身份/授权与 WT-02C compatibility 实现批；进入产品数据根前必须另行决策 Node path-only residual。 |
| `当前工作树已实现、未提交` | WT-02B.1 Identity / Policy Resolver security kernel | revision 9 已建立受信 identity / organization policy provider 端口、精确授权解析与不可变 `AuthoritySnapshot` provenance；调用方只提供 session、待核验岗位、operation / action policy，当前测试 assertion 的 organization / subject 来自 Identity Provider，岗位 / grant 只来自 Policy Provider。revision 10 已将 assertion organization 明确为待迁移的 test-only 过渡接口，不能接真实产品。 | WT-02B.2B 接真实 provider 前迁移为 Organization Policy 独占 active membership / role / grant authority；完整 WT-02B 继续未关闭。 |
| `当前工作树已落档、未提交` | WT-02B.2A 真实身份与 Authority 数据治理 | revision 10 只固定系统浏览器 OIDC + PKCE、Organization Policy 独占 membership / role / grant、main-owned token vault、高熵随机 scoped `subjectRef`、authority-scoped offline 默认拒绝、runtime `AuthoritySnapshot` / persistable `AuthorityEvidence` 分层，以及 retention、hold 隔离、pending deletion、delete propagation / backup restore 门。 | 不宣称 provider、vault、resolver 迁移、offline registry、schema 或 persistence 已实现；按 WT-02B.2B、WT-02B.3、WT-02C.2A～2D、WT-02C.3、WT-02D 独立推进。 |
| `当前工作树已落档、未提交` | WT-02C.0 Compatibility Authority | revision 11 只固定 revision-bound target、Electron main-owned composite runtime inventory、Sage Compatibility Authority 的 immutable content-addressed matrix、唯一精确命中 / fail-closed outcome、compatibility / availability 分层与 WT-02D 唯一编排入口。 | WT-02C.1 已按独立批实现 fixed-fixture kernel；可信 inventory、Capability Registry、插件兼容、Application Service 与产品调用仍按 WT-02C.2A～2D、WT-02C.3、WT-02D 独立推进。 |
| `当前工作树已实现、未提交` | WT-02C.1 fixed-fixture Compatibility Resolver kernel | revision 12 已建立 exact parser、canonical target / inventory / matrix digest、显式 inventory / matrix 半开生命周期、revocation、唯一 digest-pair rule 与稳定 fail-closed code；只消费 materialized provider result 和显式 evaluation time。 | v1 继续冻结为 migration evidence；revision 14 已在独立 V2 合同实现 MatrixV2 / resolver migration，但两者都不证明 trusted provider / clock 或产品 authority。 |
| `当前工作树已落档、未提交` | WT-02C.1A full evidence / stable semantic 分层合同 | revision 13 只固定 `targetSemanticDigest + runtimeDescriptorDigest` 的稳定 exact lookup、`targetEvidenceDigest + inventoryEvidenceDigest` 的单次完整证据、MatrixV2 版本边界、trusted derivation 与后续 owner。 | 源码 0 文件；不宣称 MatrixV2、ResolverV2、provider、Registry、evaluation evidence、Application Service 或产品接线已经实现。 |
| `当前工作树已实现、未提交` | WT-02C.1B MatrixV2 / stable-key resolver migration | revision 14 已在独立 kernel 实现四层 exact digest、stable/full binding、MatrixV2 唯一 stable-pair resolution、v1/v2 隔离与 no-fallback，并保留 v1 frozen contract。 | 不宣称 trusted provider / clock、C2A～2D、C3 evidence、WT-02D、产品授权或真实动作已完成。 |
| `当前工作树已实现、未提交` | WT-02C.2A runtime artifact attestation | revision 15 已在 profile materialization transaction 内重算并封存 root package / lock 与真实 `node_modules` bytes、executable bit、logical path、受限 relative symlink topology、installer metadata，并在激活前 fresh verify、纳入 receipt、失败回滚。 | 只证明 materialization-time content observation；不宣称 provenance、boot freshness、Registry、Matrix、availability、compatibility、execution authority 或产品接线已完成。 |
| `当前工作树已实现、验收门已闭环、未提交` | WT-02C.2B Host live inventory projection | revision 16 建立 protocol v4、main-owned boot/runtime epoch、双 Host/profile observation、receipt-sealed C2A fresh verify、固定 30 秒窗口与 V2 string generation；revision 17 已让官方 smoke 精确绑定 v4 ready/profile/Loader，并把 lifecycle v4 与 upstream DSH3 v3 frame 六常量分职。 | 继续保持本投影只证明一次 boot-scoped Host observation；external capability、Registry、完整 runtime inventory、compatibility evaluation、execution authority 与产品接线仍须由 C2C / C2D / C3 / WT-02D 独立实现。 |
| `当前工作树已实现、终验通过、未提交` | WT-02C.2C.1 local pure descriptor / canonicalization kernel | revision 19 已实现 candidate descriptor exact parser、五类独立 digest、pinned bridge / SDK / tool-effective contract、hostile-input refusal、独立 encoder / 手写 expected body 与 strict import firewall；v1 仅支持 `local-stdio + interpreter-entrypoint`，typed policy URN 仍只是 candidate reference。 | C2C.2～C2C.5 继续完成同代 observation、实际 artifact / policy provenance、availability 与 main-owned provider；不得把本行外推为真实 MCP evidence、Registry、UI 或插件已接入。 |
| `当前工作树已实现、未提交` | WT-02C.2C.3 local artifact observer | revision 24 已在显式 artifact root 内按 static execution manifest 扫描 package / lock 与五类 component closure，重算 bytes / executable / safe-link evidence，拒绝动态 shell / PATH / environment、越界 symlink、root expansion、读取漂移与超限；返回 candidate artifact subject 与 launch / artifact evidence refs，不写绝对路径。 | 只证明受控本地 root 的一次安全观察；不证明 producer provenance、bridge seam、live MCP、trusted clock、C2C.5 provider、Registry approval、Adapter、UI 或插件可用。 |
| `当前工作树已实现、终验通过、未提交` | WT-02C.2C.4 bounded availability / preflight contract | revision 25 已实现无 I/O 的四轴 exact contract、descriptor / evidence 与 host / connection generation binding、半开 freshness、candidate preflight port shape、deep freeze 与 fail-closed denial；`availability=available` 仍不产生 action authority，`actionability` 固定为 `blocked`。 | 只证明边界合同；不证明真实 operation preflight、C2D Adapter mapping、Identity / Policy、Registry、live MCP、插件或产品接线。 |
| `当前工作树已实现、定向验收通过、未提交` | WT-02C.2T Compatibility Target Requirements | revision 26 治理合同已在 revision 27 落成独立无 I/O `compatibility-target-requirement.ts`：exact parser、canonicalization、typed content digest、immutable snapshot 与 app-bundled trusted provider；`30 files / 354 tests` 通过，未改 v1 event。 | 只提供 stable requirement lookup；真实 current-revision provenance、MatrixV2 provider、Application Service 与产品接线仍 pending。 |
| `当前工作树已实现、未提交` | WT-02C.2M app-bundled MatrixV2 provider | revision 28 新增无 I/O `compatibility-matrix-provider.ts`：历史 canonical matrix bytes、独立 append-only revocation source、stable-pair lookup、显式历史回取、bundle/source content ID、deep freeze 与 resolver adapter；定向边界纳入全量测试。 | 仅关闭 app-bundled provider contract；不产生真实 Matrix Authority 发布、trusted clock、C2C.2/C2C.5 evidence、C2D.2 Registry、C2E inventory、C3 persistence 或产品接线。 |
| `当前工作树已实现、未提交` | WT-02C.2C.5 aggregate evidence kernel | revision 23 已实现无 I/O 的 evidence exact binding、descriptor / provenance / host / connection 同代校验、content digest、半开 freshness、deep freeze 与 fail-closed denial；输入里的 typed provenance 仍是 caller reference，不是实际扫描证明。 | 正式 bridge seam、artifact observer、availability / preflight 与 Electron-main provider composition 仍 pending；本行不产生 verified descriptor、Registry approval、Adapter mapping、availability 或产品接线。 |
| `当前工作树已实现、未提交` | WT-02C.2D.1 Capability Registry pure kernel | revision 22 已实现无 I/O、immutable、fail-closed 的四态 Registry snapshot / digest / transition kernel，以及 exact hostile parser 与 9 组对抗测试；只消费 caller 提供的 candidate / verified descriptor reference，不接 provider、real entry、Adapter、插件或 UI。 | C2D.2 bundled provider / real entry 仍 pending；没有 C2C.5 verified descriptor/provider 与真实 Adapter mapping，不产生生产 `approved` 或 `adapterMappingDigest`。 |
| `当前工作树已实现、未提交` | WT-02C.3.2 CompatibilityEvaluationEvidence persistence | revision 31 已把独立 evidence sidecar 接入既有 Sage-owned SQLite adapter；append 与 BusinessMatter event / receipt 同事务，失败闭锁；retention、legal-hold、purge、export、restore 与 operation-id recovery 已覆盖，v1 event schema 未改。 | 只关闭本地 persistence contract；不代表真实 provider、trusted clock、Application Service、Capability Adapter、UI、插件、MCP、真实数据根或产品 action 已接入。 |
| `当前工作树已落档、未提交` | WT-02D.0-ARCH Application Service boundary | revision 37 只固定 Electron-main 唯一 command / projection owner、未来 main-owned `/.sage/*` route、projection-read / action authorization 分层、固定 authority 顺序、unavailable-first composition、幂等 / 取消 / 重试 / `outcome-unknown` 与 `.0.1/.1/.2` 分批门。 | 当前 Host-owned route 与所有源码保持原状；`.0.1` skeleton、`.1` fixture/blocked E2E 与 `.2` production command path 均需另票确认。 |
| `不适用` | 0（尚未裁定） | 不能因“像旧桌面”就提前丢弃任何原型状态。 | 在产品范围评审后逐条注明原因。 |

| 经营事项阶段 | 原型合同候选 | 台账状态 | Sage 处理原则 |
| --- | --- | --- | --- |
| 创建 | `QDR.P13.create.empty`、`QDR.P13.create.ready`、`QDR.P01.home.workspace` | 当前工作树 WT-01 领域内核已实现、未提交；产品 UI 未实现 | 创建只产生事项、目标和责任角色，不复刻“工作区即领域对象”。 |
| 证据 / 澄清 | `QDR.S02.clarification.waiting`、`custom`、`submitted` | 当前工作树 WT-01 领域内核已实现、未提交；产品 UI 未实现 | revision 快照、显式未知与澄清事件留痕；UI 仍待后续批次。 |
| 运行活动 | `QDR.S01.session.running`、`streaming` | 当前工作树 WT-01 attempt 合同已实现、未提交；能力接线未实现 | 版本快照、兼容矩阵和单 active attempt 已受控；尚未连接 Adapter 或模型。 |
| 审批 | `QDR.S04.scope.unexpanded` | 当前工作树 WT-01 decision 合同已实现、未提交；真实身份/权限未实现 | 精确 revision/actionScope 的批准、拒绝、撤回和过期受控；不声称真实鉴权。 |
| 产物 / 回执 | `QDR.M02.file.writing`、`QDR.A02.output.html`、`QDR.M01.reply.completed` | 当前工作树 WT-01 领域内核已实现、未提交；真实消费未实现 | artifact 与人工责任角色 receipt 分离；不把产物存在当业务完成。 |
| 失败 / 重试 | `QDR.S08.reply.interrupted`、`continued`、`QDR.S05.scope.unexpanded` | 当前工作树 WT-01 领域内核已实现、未提交；实机恢复未实现 | 保留失败 attempt，复核后使用新 attempt；停止输出不算成功。 |

#### P0-0 台账 B：清理与历史发布基线（只读）

清理按“承诺 → 引用 → 体积”排序。体积只有在前两项均为否时才可作为候选排序依据；本表**不执行删除**。

| 候选 | owner / 当前证据 | 建议 | 保留期与恢复门 |
| --- | --- | --- | --- |
| `packaging/release/**`（约 7.2 GiB）及根 `release/*.sha256` | 发布治理；本地有 14 份 `SHA256SUMS`，且被发布门禁与 ADR-0058 / ADR-0067 引用。 | `retain`，不进入删除名单。 | 至少保留至 Sage 发布链完成且有新的版本策略 ADR；仅能以外部归档、哈希复核、恢复演练和单独用户决策改变。 |
| `packaging/release/.archive/**`、`*.replaced-*` | 发布历史；同样带清单。归档中的同名 DMG 哈希不等同当前正式版本，不能擅自视为重复副本。 | `retain`。 | 与主发布物同门；先说明它们分别对应哪次发布 / 恢复事件，才可提出归档变更。 |
| `packaging/.app-cache`（约 561 MiB） | 打包流水线缓存；当前被 `scripts/lib/repo-snapshot.mjs` 引用。 | `review`，不是现在的删除项。 | 需先在隔离构建中验证缓存失效 / 重建与发布验收；可由 `assemble` 重建时才评估。 |
| `.birdview/**`（约 79 MiB） | 本轮计划可再生视图；工具读数没有承诺 / 跟踪引用。 | `retain` 至本轮 P0-1 确认；之后可 `archive` 或重新生成。 | 恢复命令为 Birdview render；不得在待确认期间清掉本轮范围证据。 |
| `dsh-patches/UI-UX-audit-patch.tar.gz`（约 312 KiB） | 补丁治理；为受跟踪文件，且个别文件候选会漏掉父目录级装配语义。 | `review`，不得根据“零字节目录读数”删除。 | 先做全路径与装配产物审计；确认不被任何补丁、资料或历史追溯需要后，才能单独授权归档 / 删除。 |
| `.qoder/worktrees/**`（约 637 MiB）、`.scratch/**`、`packages/.onboarding-preview/**` 与当前未跟踪项 | 其他工具或并行任务所有；当前归属未知。 | `retain`。 | 由所有者确认；本任务不触碰。 |
| `vendor/**`、`deepseek-harness`、许可证与 pin | 上游事实、许可证与可重放基座。 | `retain`。 | 不属于品牌清理或磁盘清理范围。 |

注意：当前工作树有一份未提交的 `scripts/lib/cleanup-inventory.mjs`。它对目录候选可给出有用的只读读数，但对**单个文件**会把体积读成 0，且无法感知父目录级的装配关系；因此本台账没有把它的 `suggested` 直接等同为可删除结论。

### P0-1｜原子源码壳迁移与运行时守卫

**计划改动面（确认前不写）：**

| 当前路径 | 目标路径 / 动作 | 原因 |
| --- | --- | --- |
| `apps/lute-shell/` | `apps/sage-shell/`（一次 `git mv`） | 避免长期存在两套产品壳；保留 Git 历史。 |
| `apps/sage-shell/src/main/*`、`src/host/*`、`src/protocol.ts`、`src/profile/*` | 保留协议、子进程、凭证清洗、物化和拆机语义；改 package、壳内说明与可见诊断命名 | Harness 是运行时，不是可见产品面。 |
| `.gitignore`、`scripts/gate.mjs`、`scripts/gates/sage-shell-pin.mjs` 与测试 | 同步改为 `sage-shell-pin`，保留精确 pin、7 个 wire 常量和 fixture 契约 | 防止目录迁移后门禁继续读旧路径而假绿。 |
| `scripts/gates/service-consumption.json` | 将两条 Host 服务消费登记同步至新目录 | 防止服务消费门禁将新路径视为漏登记、旧路径视为陈旧条目。 |
| ADR / Note、`docs/adr/README.md`、`docs/adr/decisions.json`、`.birdview/architecture.json` | 同步受控决策、索引与文件范围 | 避免新壳和旧路径双写事实。 |
| `docs/architecture.md`、`AGENTS.md` | **本批不写**；两者已有未知未提交改动，待源码迁移验收后另开受控文档批 | 不把未知脏改动归属、覆盖或混入目录迁移。 |

**P0-1 兼容裁决：** `PROFILE_LABEL='lute-shell'`、`HOST_DIR_NAME='lute-host'`、`LUTE_SHELL_*` 与 `DSH_HOME` 决定真实 profile、host 入口、子进程继承环境和资料位置。它们由 P0-3 的复制、校验、回滚迁移统一处理；本批不得改名、别名化、物化或启动真实 profile。`luteOwner: 'lute'` 同样保留，它是全仓治理 schema 而非产品可见品牌。

**通过条件：** 目录无复制残留；`sage-shell-pin` 和对应 selftest 读取新路径；`apps/sage-shell` 的 typecheck、test、build 可运行；原有 wire / host 退出语义回归通过；`docs/architecture.md` 与 `AGENTS.md` 在本批保持未触碰；真实 profile / App 未被 materialize 或启动。

**P0-1 实际结果（2026-09-24）：** 目录、package、可见诊断、`.gitignore`、`sage-shell-pin`、服务消费登记和直接文档链接已同步；`typecheck`、12 个测试文件 / 125 个测试、build、19 个 pin selftest、docs link 检查和差异检查均通过。`pnpm run gate` 的 Sage 相关检查通过，但总体仍因本批未触碰的 `profile-bundle-sync`（`dsh-qoder-sidebar-local` 的安装点产物漂移）与 `role-preset-source-freshness`（MGT 角色产物漂移）退出 1；它们不作为 P0-1 完成或 Sage runtime 的证据。

### P0-2｜Sage 自有 renderer 与唯一 Capability Adapter

- [x] 在 `apps/sage-shell/src/product/` 建立自有静态页面、受控状态和错误/恢复页；P0-2 的持久化边界明确为仅进程内存，不写 localStorage、profile 或业务资料。
- [x] 在 `apps/sage-shell/src/adapter/` 建立唯一 Capability Adapter。现有 HostEvent 只表达子进程 `ready/fatal`，不是产品事件；Adapter 因此只投影 Cordis `connection` 服务能否解析的 `ready / unavailable / recovering`，并且只接受 `retry`。
- [x] 将 `src/host/assets.ts` 的上游 `dsh-web-frontend` 服务、`composer-adapter.ts` / `composer-view.ts` 的上游客户端改写、通用 `/api`、raw stream、plugins 与默认 onboarding carousel 退出 Sage 产品装配面；仅固定 `GET /.sage/state` 和 `POST /.sage/actions` 可到达 Adapter。
- [x] 不迁移 `dsh-onboarding-carousel` 到 Sage；后续只能以 Sage 自有实现重建后进入产品。

**通过条件：** Sage renderer 不加载上游 frontend / Conversation slot；Adapter 有状态、未知 action 和失败恢复测试；页面不直读 Cordis / 私有 DOM。

**P0-2 实际结果（2026-09-24）：** 已新增产品 contracts / memory store / static renderer 与 Adapter contracts / availability probe / typed handler；`/.sage/*` 只接受无端口、无凭据、无 query/fragment 的精确 `dsh-app://app` + Origin，未知 action、额外字段、错误 method/content-type、超限 body 和旧上游路由均拒绝。action body 按 `Uint8Array.byteLength` 分块读取，4 KiB 后早停；HWM=0 的毒性第三块反例保证不会退回整包 `request.text()`。页面请求以 `AbortController` 的 5 秒 deadline 回落到可重新检查状态。`src/host/index.ts` 不再读取 `clientModules`、gateway 或泛 API，唯一 `ctx.get('connection')` 位于 Adapter。旧 Composer、stream、frontend fixture、preview fixture 与 onboarding 装配已退出工作树；seed / lock 的上游依赖暂留，因其删除需要独立依赖图审计。新增 `sage-product-boundary` 与 worktree-aware `service-consumption` 守卫，避免未暂存的新 Adapter 消费点在提交前隐形。`typecheck`、12 个测试文件 / 58 条测试、build、37 条专用门禁反例和差异检查均通过；总 `pnpm run gate` 仅因本批未触碰的 Qoder 装载点字节漂移与 MGT 预设产物陈旧退出 1。真实 profile、App、Electron / GUI、资料迁移、品牌资产、BusinessMatter 和发布仍未运行，均不是本批交付证据。

### P0-3｜身份、资料隔离与可回滚导入

- [x] **P0-3A：** 将默认 profile / Host / Electron 数据根迁到 Sage 专属位置；Harness 子进程仅接收 Sage `harness/` 作为 `DSH_HOME`，并清除继承的旧 Shell / DSH 控制变量。
- [x] **P0-3A：** 以 staging、hash receipt、不可变 generation 和原子 `profile-current.json` 启用取代最终 profile 直接覆盖；Host 只接受当前激活 generation。
- [x] **P0-3A：** 覆盖新装、generation 失败、指针保留、符号链接、安装期与激活后文件篡改，以及 fixture-only 导入成功 / 失败清理 / allowlist / 回执校验。真实旧资料不进入测试。
- [ ] **P0-3B：** 在用户确认旧资料来源目录、资料类别、allowlist、回滚验收和 TCC 边界后，才实现真实旧 DSH 的复制 → 暂存 → 校验 → 原子启用 / 回滚；全程不原地改写 `~/.dsh`。
- [ ] 指定 Sage 的精确反向域名 Bundle ID、Apple Team / Developer ID 归属；这是 P1 打包输入，不能臆定。

**P0-3A 本地结果（2026-09-24）：** `SagePaths` 默认根为 `~/Library/Application Support/Sage`，Electron 的 userData / sessionData / logs / crashDumps 在 ready 前切到 Sage 路径；profile 在 `harness/profiles/.sage-generations/` 内受控物化、指针启用并在启动时重验收据。`typecheck`、14 个测试文件 / 76 个测试、build、3 个脚本语法检查和 `sage-data-isolation` 的 10 条反例均通过。真实 profile、旧 DSH、Electron GUI、TCC、安装 App 与 Bundle ID 均未运行。

**全仓门禁结果（2026-09-24）：** `pnpm run gate` 以退出码 `1` 结束，132 项中 127 项通过。与本批直接相关的 `sage-shell-pin`、`sage-shell-pin-selftest`、`sage-product-boundary`、`sage-product-boundary-selftest`、`sage-data-isolation`、`sage-data-isolation-selftest`，以及 `adr-note-links`、`docs-link-integrity` 均通过。总门禁仅保留两项既有、未在本批改写的失败：`profile-bundle-sync` 的 `dsh-qoder-sidebar-local` 装载点产物与仓库源字节不一致，和 `role-preset-source-freshness` 的 MGT 角色产物 3/3 与共享源不一致；它们未被修正、未被纳入 Sage 完成证据。`live-presets`、`resource-path-reachability`、`dmg-layout-doc` 为跳过项。故 P0-3A 的范围内验证为通过，而全仓门禁状态仍为 `FAIL`。

**P0-3B / P1 通过条件：** Sage 与旧 DSH 可并存；Sage 冷启动不读取旧资料根；真实导入失败不会损伤旧资料；TCC / 访问授权差异、Bundle ID 与发布身份均有单独实证。

### P0-4｜Sage 资产供应链与可见品牌清零

- [ ] 从 `A_StarSail_Product_symbol.svg` 仅提取图形几何，生成仓内 Sage 派生资产：plain、dark、light、AppIconset 和 `Sage.icns`。
- [ ] 重制 Sage 文字 lockup；禁止对路径化 `SanBao` 字标作文本替换。
- [ ] 建立资产 manifest：源路径、源哈希、派生哈希、用途、可见面、批准人、权属 / 商标状态和发布日期门。
- [ ] 增加用户可见面负向断言：窗口标题、Dock / Finder、启动、空态、侧栏、设置、错误框、安装器、产品页不出现 `DeepSeek|Harness|shark|Preview|Sanbao|Lute`。

**通过条件：** 图形和 wordmark 都来自 Sage 派生资产；可见面扫描、DOM / 截图、菜单和原生元数据均通过；公开发布前资产门若未批准则明确阻断。

### P0-5｜经营事项首个真实闭环

- [x] WT-01（当前工作树、未提交）：定义 `BusinessMatter` 的范围、revision、证据、未知、选项、依赖、动作双轴政策、人工决定、执行版本快照、产物、回执和经验引用。
- [x] WT-01（当前工作树、未提交）：以追加事件和纯投影实现六段领域状态：创建 → 证据 → 运行 → 澄清 / 审批 → 产物 / 回执 → 失败 / 重试；仅进程内存，不接产品或运行时。
- [x] WT-02A.0（当前工作树、未提交）：接受 [ADR-0161](../adr/ADR-0161.md) 与[权威事件存储合同](../specs/2026-09-24-businessmatter-contract.md#9-wt-02a-权威事件存储合同)，固定权威 owner、backend 与信任边界；仅文档，不写 store 源码，具体决策见 ADR 与 handoff。
- [x] WT-02A.1（当前工作树、未提交）：实现纯领域 v1 codec / strict rehydrator，以 exact envelope、fatal payload decode、全部 11 类事件 payload 的严格结构校验、public command replay、exact event equality、canonical v1 payload bytes 核对和 private provenance 让伪造 receipt、未知 schema、版本缺口和语义错配具名拒绝；不引入 I/O。
- [x] WT-02A.2（当前工作树、未提交）：在测试临时 Sage root 内实现 app-owned、单 `DatabaseSync` connection 的 file-backed SQLite event store、连续 `streamVersion`、事务批次、幂等账、typed load / append、显式资源配置、`recordedAt` 与 SHA-256 digest / fingerprint；测试经 pinned Electron Node mode 运行，不接产品数据根或真实资料。
- [x] WT-02A.3A（当前工作树、未提交）：完成独立进程 C-01 / C-02、真实 `SQLITE_BUSY`、批内 / head / ledger 故障回滚、commit 后 ACK 丢失、hard-exit / reopen、直接数据库篡改隔离与 outcome-unknown quarantine。
- [x] WT-02A.3B（当前工作树、未提交）：从完整 `SagePaths` 固定派生数据库，在测试临时 Sage root 内完成 legacy 隔离、symlink / hardlink、owner / mode、sidecar、父目录与事务中可观察路径漂移的 fail-closed 反例；不读取或迁移旧 DSH 资料。真实产品数据根与 same-UID 持久 capability 继续作为生产门。
- [x] WT-02B.1（revision 9 当前工作树已实现、未提交）：建立独立 security kernel；调用方请求只含 `sessionId`、`requiredRoleRef`、`operation`、`actionPolicy`，固定 audience 由 composition 注入。当前测试 assertion 的主体 / 组织来自 trusted Identity Provider，岗位 assignment 与精确 grant 只来自 Organization Policy Provider；输出 canonical `HumanRoleRef` 和不可变 `AuthoritySnapshot` provenance，不接受 UI 或既有 `HumanRoleRef` 自报，不修改 v1 event schema，不接产品调用链。revision 10 已将 assertion organization 定义为接真实 provider 前必须迁移的过渡接口。
- [x] WT-02B.2A（revision 10 当前工作树仅文档治理落档、未提交）：固定系统浏览器 OIDC Authorization Code + PKCE、Sage-owned identity mapping 只给 identity handle / candidate org、Organization Policy 独占 active membership / role / grant、Electron main-owned token vault、Policy 已证明 scope 后生成并查重的高熵随机 `subjectRef`、authority-scoped offline 默认拒绝，以及 runtime `AuthoritySnapshot` / persistable `AuthorityEvidence`、retention、hold 隔离 / pending deletion、delete propagation / backup restore 的分层合同；不修改源码或 v1 event schema。
- [ ] WT-02B.2B：在真实 issuer metadata、native public client registration、redirect URI、audience / scopes、组织映射 owner、Policy Provider authority、账户生命周期和 OS vault capability 齐备后，实现系统浏览器 OIDC adapter、main-owned token vault、refresh rotation / revocation 与 fail-closed session lifecycle，并把 WT-02B.1 assertion organization 迁移为 Policy Provider 独占 membership authority；不使用 embedded WebView，不在客户端内置 secret。
- [ ] WT-02B.3：实现受信的 runtime `AuthoritySnapshot` → persistable `AuthorityEvidence` 转换，并另行确认 schema / version、retention enforcement、legal hold、purge、export、delete propagation、deletion ledger 与 backup restore；本批不预设扩展 v1 或升级 schema。
- [ ] WT-02B（完整）：只有真实 identity / policy authority、token / session 生命周期、最小 authority 持久化与端到端拒绝 / 允许证据均完成后，才可关闭；领域中的 human role 结构匹配和治理文档都不冒充这些能力。
- [x] WT-02C.0（revision 11 当前工作树仅文档治理落档、未提交）：确定 revision-bound compatibility target、Electron main-owned composite runtime inventory、`Sage Compatibility Authority` matrix owner、canonical matrix bytes 的 content-addressed `matrixId`、exact single-match / fail-closed outcome、compatibility / availability 分层、当前 v1 strict replay 边界与 UI/plugin authority 禁区；真实登录等待期间只开放纯 kernel、fixture/blocked UI 和 inventory 开发，不允许真实 mutation 或副作用。
- [x] WT-02C.1（revision 12 当前工作树已实现、未提交）：建立独立、无 I/O 的纯 `CompatibilityResolver`、canonical target / inventory / matrix content addressing 与 materialized `available | unavailable` provider result contract；fixed fixture 下只有唯一精确 digest-pair rule 可产生 outcome，未知、重复、冲突、歧义、过期、撤销、provider failure 或不完整 identity / version / digest 默认拒绝。可信 provider composition、live inventory 与产品接线仍未实现。
- [x] WT-02C.1A（revision 13 当前工作树仅文档治理落档、未提交）：以 [ADR-0166](../adr/ADR-0166.md) 固定 full evidence / stable semantic 双层 exact-digest、字段分类、受信 derivation、MatrixV2 / v1 隔离、future evaluation binding 与 C2A～C2D / C3 / WT-02D owner；本批只改八个治理文件，源码、测试、package、lockfile、v1 event schema 与产品接线均为 0。
- [x] WT-02C.1B（revision 14 当前工作树已实现、未提交）：以新 schema、`sage.compatibility-canonical-json.v2` 与类型隔离的 digest namespace 实现 MatrixV2 / stable-key resolver migration；四层摘要由 exact-parsed canonical subject 重算，transient-only 变化只改变 full digest，action / policy / artifact / contract / behavior configuration 变化同时改变 stable 与重新绑定的 full digest；伪造摘要、stable/full binding mismatch、current revision mismatch、unknown version、v2 miss、duplicate / conflict / ambiguity、过期 / 撤销与 provider failure 默认拒绝，不调用或 fallback 到 C1。可信 provider / clock、C2A～2D、C3 与 WT-02D 仍未实现。
- [x] WT-02C.2A（revision 15 当前工作树已实现、未提交）：在 profile 激活前生成并 fresh verify [Runtime Artifact Attestation](../notes/proposed/architecture/2026-09-28-runtime-artifact-attestation.md)，覆盖 root package / lock、实际 `node_modules` file bytes / executable bit、hardlink logical path、受限 relative symlink topology 与独立 installer metadata；固定 `0600` attestation 纳入现有 receipt，失败不切 active pointer。不修改 v1 event schema，也不冒充 provenance、live inventory、compatibility 或 execution authority。
- [x] WT-02C.2B（revision 16 核心 + revision 17 验收门已闭环、未提交）：建立 [Host Live Inventory projection](../notes/proposed/architecture/2026-09-28-host-live-inventory.md)，绑定 main-owned boot/runtime epoch、active generation/receipt、receipt-sealed C2A fresh verify、Loader lifecycle 与固定 30 秒 freshness；Host/profile/artifact/clock 漂移 fail closed，旧 generation 不回填。revision 17 已让官方 smoke 使用 exact v4 Host event 并核对 generation / manifest / Loader binding，`sage-shell-pin` 独立守 lifecycle v4 与 upstream DSH3 v3 frame 六常量。它不构造完整 `RuntimeInventoryEvidenceV2`，也不接 resolver、产品、UI 或插件。
- [x] WT-02C.2C.0（revision 18 当前工作树仅文档治理落档、未提交）：以 [ADR-0169](../adr/ADR-0169.md) 与 [External Capability Evidence 记录](../notes/proposed/architecture/2026-09-28-external-capability-evidence.md)固定 Electron-main owner、stable descriptor / boot observation 分层、实际 artifact closure、同一执行 connection generation 的完整有界 `tools/list` 分页、normalized effective contract、`list_changed` / reconnect / drift 失效，以及 transport / discovery / contract / preflight 分职。本批源码、测试、v1 event、真实 MCP I/O、插件启用、UI 与产品接线均为 0。
- [x] WT-02C.2C.1（revision 19 当前工作树已实现、未提交）：pure descriptor / canonicalization kernel 覆盖 exact parse、五类类型隔离 digest、pinned bridge / SDK、手写 normalized expected body + independent reference encoder / golden、hostile fixtures、deep freeze / detach 与 strict import firewall；v1 只接受 `local-stdio + interpreter-entrypoint`，policy URN 只证明 candidate namespace / digest shape，不连接 Host / MCP，也不证明实际 artifact / policy provenance。
- [x] WT-02C.2C.3（revision 24 当前工作树已实现、未提交）：在调用方明确给出的 artifact root 内解析 static execution manifest，严格要求 `package.json`、`pnpm-lock.yaml` 与 `bridge / sdk / launcher / interpreter / server-entrypoint` 五类目录，扫描 bytes / executable bit / safe relative symlink，执行双 stat 漂移检查、`O_NOFOLLOW`、物理 root containment、条目 / 字节上限与 pathless evidence；动态 shell / PATH / env / secret、root expansion、越界链接、特殊文件和读取失败均 fail closed。不接 live Sage root、Host、MCP、Registry、Adapter、UI 或插件。
- [x] C2C-SEAM-DECISION（revision 20，2026-09-29，当前工作树未提交）：只读核对 pinned `@deepseek-ai/dsh-mcp-client@0.1.5-rc.2` 的公开 API 与实际发布包，决定唯一目标为 bridge-owned 正式受控只读 seam。bridge 继续拥有 Client / transport / pagination / list_changed / reconnect / close / registry swap；Sage 不从 `ctx.tools` 反推、不另开第二连接，不改 `node_modules`、vendor、解析 store 或 runtime monkey patch。没有正式 bridge release / 可复现 fork 与 lockfile 证据前，C2C.2 保持 `pending / blocked`。
- [ ] WT-02C.2C.2：等待正式 bridge seam 后，实现同一 bridge connection generation 的 raw observation seam；完整有界分页、list-changed / reconnect / close invalidation，只用隔离 fake MCP server，禁止业务 `tools/call`。
  - [x] WT-02C.2C.2 seam contract preflight（revision 32）：在 formal seam 发布前先固定 Sage-owned list-only port 的 connection generation、opaque cursor、完整 snapshot、page/tool/bytes/deadline bounds、duplicate raw-name 与 invalidation fail-closed 合同；只用隔离 fake connection，零 `tools/call`。这只是 readiness contract，不关闭 formal C2C.2 的 `pending / blocked`。
  - [x] WT-02C.2C.2 seam-intake gate（revision 33）：只读复核 ADR-0170、seed package/lock pin 与公开导出；未发现 formal bridge release / 可复现 fork / observation port，C2C.2 继续 pending/blocked，不改依赖或运行时。
  - [x] WT-02C.2C.4（revision 25 当前工作树已实现、未提交）：以无 I/O pure kernel 固定 transport、discovery、contract 与 operation preflight 四轴，绑定 descriptor / evidence 与同代 host / connection generation，执行半开 freshness 和 exact candidate port shape；`availability=available` 不抬升 action authority，`actionability` 固定 `blocked`，真实 preflight 仍等待 C2D Adapter operation mapping 与 Identity / Policy。
- [x] WT-02C.2C.5 aggregate kernel（revision 23 当前工作树已实现、未提交）：无 I/O exact-parse 并绑定 caller-supplied descriptor / provenance / C2B host / 同代 connection，重算 evidence digest，执行半开 freshness、deep freeze 与 fail-closed refusal；不扫描实际 artifact、不访问 bridge/MCP、不读系统时钟，也不产生 verified descriptor、Registry approval 或 availability。
- [ ] WT-02C.2C.5 provider：等待 C2C.2 bridge-owned seam、C2C.3 artifact observer 与 C2C.4 availability / preflight 后，由 Electron main 汇合真实 evidence 与受信 clock；仍不构造完整 runtime inventory 或 matrix outcome。
- [x] WT-02C.2D.0（revision 21）：已固定 Registry owner、`candidate | approved | disabled | revoked` 生命周期、immutable snapshot、descriptor provenance、Adapter operation mapping、enable/disable/revoke 与 fail-closed 边界；本票源码为 0、没有 real entry。
- [x] WT-02C.2D.1（revision 22 当前工作树已实现、未提交）：实现 exact、immutable、无 I/O 的 Registry kernel；canonical entry / snapshot digest、四态迁移、duplicate/conflict、descriptor / operation / approval gate、revoked 终态与 hostile input 全部 fail closed。只接受 caller-supplied candidate / verified descriptor reference，不产生 provider provenance 或 real entry。
- [ ] WT-02C.2D.2：接 app-bundled provider / 真实 entry；product/security owner 拥有 canonical allowlist。真实 entry 只能引用 C2C.5 verified descriptor/provider 与真实 Adapter mapping。
- [x] WT-02C.2T governance（revision 26 当前工作树仅文档治理落档、未提交）：以 ADR-0172 固定独立 `sage.compatibility-target-requirement.v1` immutable requirement registry、stable/full target 分层、exact requirements、current-revision binding 与 append-only snapshot；不修改 v1 event schema，不从 goal、自由文本、UI selection 或 action body 猜 target。
- [x] WT-02C.2T implementation（revision 27 当前工作树已实现、未提交）：新增无 I/O `apps/sage-shell/src/security/compatibility-target-requirement.ts` 与定向测试；exact parser / canonicalizer、typed requirement / snapshot digest、append-only snapshot shape、active / revoked / effective / expiry 处理、精确 action lookup、bundled provider、deep freeze 与 hostile / I/O firewall 均通过。只消费已发布 requirement snapshot，不生成真实 target provenance、不修改 v1 event。
- [x] WT-02C.2M（revision 28 当前工作树已实现、未提交）：新增无 I/O `apps/sage-shell/src/security/compatibility-matrix-provider.ts` 与定向测试；bundle 只保留 canonical MatrixV2 历史字节，独立 revocation source 具备 source ID、provenance 与 supersedes lineage；provider 按显式 stable pair / evaluatedAt 选择唯一矩阵，支持显式历史 matrixId 回取，重叠 / 缺失 / 篡改 / hostile 输入 fail closed，并通过显式 adapter 映射到现有 resolver result。没有内置 fixture、文件 / 网络 / 时钟 / Host / MCP / Registry / UI / 插件 I/O，不修改 v1 event。
- [ ] WT-02C.2E-PMAP：为 Provider / Model / Agent / Preset 建立受信 inventory producers，禁止 placeholder descriptor / digest。
- [ ] WT-02C.2E.0 / .1 / .2：依次固定完整 inventory 合同、实现 producer adapters、建立 Electron-main `RuntimeInventoryProvider` composition，汇合 C2A/B/C/D、PMAP、trusted clock 与 instance authority；任一缺项返回 unavailable，也禁止 WT-02D 临时拼或改写 authority。
- [x] WT-02C.3.0（revision 29 当前工作树仅文档治理落档、未提交）：以 [ADR-0173](../adr/ADR-0173.md) 固定独立 `sage.compatibility-evaluation-evidence.v1` 旁路 schema、stable/full pair、matter/revision/action、matrix/rule/outcome、provider / revocation provenance、historical matrix artifact reference、strict replay、同事务原子性与 retention / legal-hold / purge / export / restore 边界；不修改 v1 event schema，不实现 codec 或 persistence。
- [x] WT-02C.3.1（revision 30 当前工作树已实现、未提交）：按 revision 29 合同实现无 I/O pure exact codec；canonical bytes、digest、strict replay 只验证封存 historical artifact，不调用当前 matrix 重新求值。新增 `apps/sage-shell/src/security/compatibility-evaluation-evidence.ts` 与定向测试；未接 persistence、provider、Application Service、UI、插件或 v1 event。
- [x] WT-02C.3.2（revision 31 当前工作树已实现、未提交）：在 `.3.0` 数据治理与 `.3.1` codec 通过后接同一 Sage-owned SQLite adapter 的 compatibility evidence sidecar；evidence append 与 BusinessMatter attempt 同事务提交，失败返回 `compatibility-evidence-unavailable` 并阻断 attempt；覆盖 retention、legal hold、purge、export、restore 与 operation-id recovery。未修改 v1 event schema，未接 provider、Application Service、UI、插件或真实 action。
- [x] WT-02D.0-ARCH（revision 37 当前工作树仅文档治理落档、未提交）：以 [ADR-0174](../adr/ADR-0174.md) 固定 Electron-main Application Service 的唯一 command / projection ownership、未来 main-owned `/.sage/*` route、main ↔ Host 窄 port、import firewall、projection read / action authorization 分层、固定 authority 顺序、unavailable-first composition、幂等 / cancel / retry / receipt / `outcome-unknown` 与稳定脱敏错误；当前 Host-owned route、源码、测试、v1 event、UI、插件和真实 action 均未修改。
- [x] WT-02D.0.1-PREFLIGHT（revision 38 = NO-GO）：[ADR-0175](../adr/ADR-0175.md) 与 [Electron caller-binding preflight](../notes/proposed/architecture/2026-09-30-electron-caller-binding.md) 已在 pinned Electron 43.3.0 取得可重复读数；入口 cancellation gate 局部成立，但 caller 导航、销毁与 explicit renderer abort 均不能 abort 已进入 handler 的 Request，因此没有迁移 production route。
- [x] WT-02D.0.1-IPC-PREFLIGHT（revision 39 = NO-GO）：[ADR-0176](../adr/ADR-0176.md) 与 [IPC/preload caller-binding preflight](../notes/proposed/architecture/2026-09-30-electron-ipc-caller-binding.md) 已证明 direct IPC sender / lifecycle / cancel 局部合同，但 same-origin child 可借用 top bridge 并被 main 识别为 current main-frame sender；未修改 production route 或源码。
- [x] WT-02D.0.1-SINGLE-FRAME-PREFLIGHT（revision 40 = PASS 预检局部）：[ADR-0177](../adr/ADR-0177.md) 与 [single-frame caller-binding preflight](../notes/proposed/architecture/2026-09-30-electron-single-frame-caller-binding.md) 已确认候选不变量「Sage privileged renderer 禁止 nested browsing context；出现 child 即污染当前 document generation，直到 clean top cross-document reload」；全部 child 形态 fail closed、clean reload 唯一恢复、control 窗口仍复现 revision 39 反例；未修改 production route 或源码。
- [x] WT-02D.0.1-FRAME-POLICY（revision 41 当前工作树已实现、未提交）：[ADR-0178](../adr/ADR-0178.md) 采纳帧禁用不变量为 production 合同并落地防御层——`src/main/frame-policy.ts` generation 污染状态机、`src/main/window.ts` 唯一 privileged 窗口工厂（显式 `webviewTag:false` / `nodeIntegrationInSubFrames:false`、unowned 顶层导航就地拒绝）、`SAGE_DOCUMENT_CSP` 并积层；真实窗口 probe（含负控变异）与 399 项测试全绿。未引入 preload / IPC bridge；嵌内容出路定为独立非特权 WebContentsView。
- [ ] WT-02D.0.1 / .1 / .2（blocked）：revision 38 browser-fetch 与 revision 39 IPC/preload 候选为 NO-GO；revision 41 已把帧禁用防御层落进 production，但 preload / IPC bridge、`.sage/*` route 迁移与 Application Service composition 仍须另票（bridge 票的 IPC entry / durable barrier 必须检查 `isTrustedGeneration()`）；same-origin caller principal 合并或 Electron pin 变更仍须另建 Birdview 计划、决策与用户确认。
- [ ] UI-01：只在 Application Service 的公开 `ViewState / ActionIntent` shape 冻结后建立 Sage-owned fixture/blocked renderer；fixture 来源永久可见、零真实 mutation、零插件启用，不能冒充 live 产品闭环。
- [ ] WT-02E：在隔离数据根完成产品 E2E、失败恢复与人工回执；P0-3B 真实旧资料导入仍保持独立阻断。
- [ ] 将项目、任务、会话、浏览器、文件和自动化作为工作台能力接到该事项，而不是反过来让 DSH 聊天成为领域中心。
- [ ] Jev 仅以可选、审阅优先、可审计的 Judgment Adapter 接入；不作为首闭环的自动动作授权。

**产品北极星：** 最终产品面是新的 Sage UI，不是 DSH 聊天壳。进入 WT-02D 后，UI 只经 Application Service 提交意图、读取 projection；插件可以随产品开发按批次渐进接入，但每个插件必须先登记 identity / version / digest，经 Capability Adapter、compatibility、policy / decision、失败恢复与 receipt 边界，不能直接写权威事件表或成为第二份业务状态。这样才能一边接新 UI、一边增加插件，而不重新形成旧壳耦合。

**WT-01 实际结果（2026-09-27）：** 当前工作树新增 `apps/sage-shell/src/domain/business-matter.ts`、`test/business-matter.spec.ts` 和[领域合同](../specs/2026-09-24-businessmatter-contract.md)，三者仍未跟踪/未提交，不是 `HEAD` 或其他 checkout 的能力。定向测试 29/29、Sage Shell 全量测试 106/106、typecheck、build、Sage quick gate 23/23 与两类差异检查为当日本地读数。正反例证明经 command API 产生的事件链运行时不可变且时间单调，未来证据、证据不足、一般性澄清未落新 revision、decision 错配/过期/撤回、未知版本矩阵、运行身份中途切换、工具失败与“只有 artifact”都不能伪造完成；接受 receipt 只做事项责任人工角色的结构匹配，不冒充真实认证。

**WT-02A.0 实际结果（2026-09-27）：** 用户确认其独立 Birdview session 的 revision 11 六文件文档批（不是本次 WT-02C.0 revision 11）；决策、合同和 handoff 已写入当前工作树但未提交。运行时快照与 projector 对抗探针见[权威事件存储交接](../notes/proposed/architecture/2026-09-27-business-matter-event-store.md)。本批没有新增 codec、数据库、migration、product / adapter / Host / profile / lockfile 改动，也没有解除 P0-3B；验证读数不能外推为 WT-02A.1～02A.3 已完成。

**WT-02A.1 实际结果（2026-09-27）：** 在用户确认的 revision 4 四文件代码范围内，新增 `business-matter-codec.ts` 与 rehydration spec，并收紧 `recordReceipt()` 只接受 current latest pending artifact。Red 先证明 codec 缺失、旧 artifact 错配、copied-Symbol provenance、accessor / Proxy envelope、nested payload shape、非真实 UTC 日期和 canonical payload 缺口；Green 后独立审查未发现本批 P0/P1 阻断。定向 2 文件 / 67 测试、Sage Shell 全量 16 文件 / 144 测试、typecheck、build、Sage quick gate 23/23 与差异检查通过。该批本身没有 I/O、数据库、product / Adapter / Host / profile / lockfile、JEV 或 UI 改动；后续 WT-02A.2 已在 persistence 边界补入资源配置和命名结果，没有把这些责任倒灌进领域 codec。

**WT-02A.2 实际结果（2026-09-27）：** 在用户确认的 revision 5 七文件范围内，新增单一 persistence adapter、store spec 与 pinned Electron Vitest 启动器，并将 package `test` 入口切到 `node scripts/test.mjs run`。测试临时 Sage root 内已覆盖 exact schema / PRAGMA、typed load / append、正常 close / reopen、顺序 CAS、appendId replay / conflict、event ID、batch clock、SHA-256 golden vector、候选 / 已存资源上限、`invalid-request` / `blocked` 零写入，以及 hostile Proxy、index accessor、`slice` / `byteLength` shadow 和 replay-integrity 回归。实际执行 `rtk pnpm --dir apps/sage-shell test test/business-matter-event-store.spec.ts`、`rtk pnpm --dir apps/sage-shell test`、`rtk pnpm --dir apps/sage-shell typecheck`、`rtk pnpm --dir apps/sage-shell build`、`rtk pnpm run gate` 与差异检查；store spec 1 文件 / 15 测试、Sage Shell 全量 17 文件 / 159 测试、typecheck、build、Sage quick gate 23/23 均通过。测试由 Electron 43.3.0 以 `ELECTRON_RUN_AS_NODE=1` 运行 Node 24.18.1 / SQLite 3.53.1。没有新增 dependency 或 lockfile 改动，也没有 product / Adapter / Host / profile / renderer、JEV、旧插件或真实资料接线；全部仍未提交。

**WT-02A.3A 实际结果（2026-09-27）：** 在用户确认的 revision 6 五文件范围内，新增独立 process adversarial spec，并只在现有 store 的 rollback failure 与 post-COMMIT uncertain 两处增加 best-effort quarantine。有效 Red 证明 ROLLBACK 与最终 close 同时失败会泄漏 raw exception；Green 后 `append()` 返回 `commit-unknown`，旧 store 对 `load/append` 均 fail closed 为 `store-closed`。真实证据覆盖两个独立进程的 C-01 / C-02、BEGIN / COMMIT `SQLITE_BUSY`、同一 K=2 批第二条和 head / ledger trigger 回滚、mid-transaction 与 post-COMMIT/pre-ACK `SIGKILL`、原 `appendId` replay，以及全字段 / BLOB raw snapshot 下的直接篡改不修复。process spec 19/19、核心四文件 101/101、Sage Shell 全量 18 文件 / 180 测试、typecheck、build、quick gate 23/23 与差异检查通过，两条独立审查均为 P0=0、P1=0、P2=0。没有新增 dependency / lockfile，也没有 product / Adapter / Host / profile / renderer、JEV、旧插件或真实资料接线；物理断电与 WT-02A.3B 路径 / 权限仍未证明，全部改动仍未提交。

**WT-02A.3B 当前结果（2026-09-28）：** 用户确认的 revision 8 已完成门禁闭环。revision 7 的固定路径、POSIX snapshot 边界、事务中漂移分类与 sidecar churn 保持不变；revision 8 新增 profile 层的 lexical / physical legacy-root 单一只读 preflight，目录创建和 event store 共同复用，persistence 不再持有重复 `.dsh` 规则。新增回归先得到 1 项真实 Red，再转为 profile + path 40/40；三份 store spec 70/70、Sage Shell 全量 19 文件 / 217 测试、显式 strict spec 编译、typecheck、build、`sage-data-isolation` 10/10 与 Sage quick gate 23/23 均通过。公开入口、固定路径、POSIX snapshot 边界、事务中漂移分类、当前验证读数和剩余风险的唯一完整事实源是[权威事件存储交接](../notes/proposed/architecture/2026-09-27-business-matter-event-store.md#wt-02a3b路径所有权与权限反例已实现当前未提交)。本批没有 product / Adapter / Host / renderer、JEV、旧插件或真实资料接线；产品真实数据根与 same-UID 持久 capability 仍未关闭，全部改动仍未提交。

**WT-02B.1 已确认范围（2026-09-28）：** 用户确认 Birdview revision 9，采用独立 security kernel，并选择长期可审计的 `AuthoritySnapshot` 方向。本批只允许受信 identity / policy provider 端口、fail-closed 解析、不可变 provenance、定向测试和对应事实文档。调用方没有 organization / actor / subject 输入面；固定 audience 由 resolver composition 注入，revision 9 的测试 Identity Provider assertion 提供 session / subject / organization 但不提供 role，Policy Provider 以 subject → role assignment 和 role → exact operation / action policy grant 作为唯一岗位 / 操作 authority，重复或冲突 snapshot fail-closed。revision 10 已把 assertion organization 定义为 test-only 过渡接口，真实产品改由 Policy Provider 独占 active membership / role / grant，并要求 WT-02B.2B 先迁移。Resolver 不执行领域命令，不复制 current revision、action policy、decision、attempt 或 receipt 规则。长期目标是从 runtime snapshot 派生最小持久 evidence，但本批不修改 v1 event schema。真实 provider、identity authority、PII / retention、Application Service、Capability Adapter、新 UI / Host 与外部动作仍 pending。源码与测试完成状态只按本批实际执行结果更新，完整 WT-02B 保持未完成。

**WT-02B.1 当前结果（2026-09-28）：** 当前未提交工作树新增 `src/security/identity-policy.ts` 与 13 项对抗测试，并同步 ADR-0163、架构 Note、合同、计划、索引和 agent 必读入口。初始 Red 为 resolver 源码缺失，信任边界收紧时又以 8 failed / 2 passed 证明旧的 caller organization / IdP role 模型不可接受；最终定向 13/13、resolver + 领域 / strict rehydration 80/80、产品 / Adapter / handler 边界 11/11、Sage 产品边界 5/5、Sage Shell 全量 20 文件 / 230 测试、严格 spec 编译、typecheck、build、ADR / docs-links 自测 31/31、Sage quick gate 23/23 与两类 diff check 均通过。独立交叉审查为 P0=0、P1=0；补充回归还证明 resolver 不修改输入，且输入后续突变不能污染已生成的 frozen `AuthoritySnapshot`。本批没有修改 v1 domain event、codec、store、product、Adapter、Host、profile、package 或 lockfile，也没有接真实 provider、UI、插件或真实数据；完整 WT-02B 和 P0-5 继续未完成。

**WT-02B.2A 当前结果（2026-09-28）：** 用户确认 Birdview revision 10 后，当前未提交工作树只完成七文件治理落档；本执行计划和[领域合同](../specs/2026-09-24-businessmatter-contract.md#105-wt-02b2a-runtime-authoritysnapshot-与-persistable-authorityevidence)记录 runtime / persistence 分层、允许与禁止字段、Policy Provider 独占 organization membership、WT-02B.1 过渡接口迁移、高熵随机 scoped pseudonym、authority-scoped offline 默认拒绝、token vault、retention / legal hold 隔离、pending deletion、delete propagation / backup restore 门，其余决策由 ADR-0164 与对应 Note 持有。该结果没有新增或修改 Identity Provider adapter、token vault、security / domain / codec / store 源码、v1 event schema、offline registry、UI、Host、profile、package、lockfile、插件或真实数据；真实 OIDC、resolver 接口迁移、`AuthorityEvidence` 转换 / 持久化、compatibility registry 与 WT-02D 编排仍 pending。

**WT-02C.0 当前结果（2026-09-28）：** 用户确认 Birdview revision 11 后，当前未提交工作树只完成十文件治理落档。[ADR-0165](../adr/ADR-0165.md) 与 [Compatibility Authority 架构记录](../notes/proposed/architecture/2026-09-28-compatibility-authority.md)固定四责任分离、revision-bound target、artifact attestation + boot-scoped observation 的 main-owned runtime inventory、app-bundled immutable matrix、canonical bytes 内容寻址 `matrixId`、唯一精确命中 / fail-closed outcome、compatibility / availability 分层、UI/plugin authority 禁区与 WT-02D 唯一编排顺序；同时明确当前 v1 strict replay 只重放持久化 DTO，`matrixId` 只标识 matrix bytes，不证明 target/inventory/evaluation provenance，该缺口由 WT-02C.3 单独关闭；ADR-0162 D2 校准为“每侧精确 pin、两侧同名同版、仅双方共同消费才要求双侧登记，runtime-only 可 seed-only 但进入 lock / inventory evidence”。该结果没有修改源码、测试、v1 event schema、数据库、package / lockfile、profile、Host、renderer、插件、本机装配或真实数据；resolver、可信 inventory、CompatibilityEvaluationEvidence、Capability Registry、Application Service、插件兼容、真实登录与产品调用仍 pending。

**WT-02C.1 当前结果（2026-09-28）：** 用户确认 Birdview revision 12 后，当前未提交工作树新增 `src/security/compatibility.ts` 与 `test/compatibility.spec.ts`，并只在 Compatibility Authority Note、本领域合同和本执行计划同步事实。测试先以 resolver module 缺失取得有效 Red；随后 fixed fixture 覆盖 exact / hostile parsing、与 locale 无关的 canonical set ordering、target / inventory / matrix SHA-256 内容地址、current revision binding、唯一 exact rule、显式 semantic-change、零命中、duplicate / conflict / ambiguity、digest / matrix ID mismatch、matrix lifecycle / revocation、materialized provider unavailable / malformed、输入不变、结果冻结、确定性和无 I/O import boundary。实现不修改 `BusinessMatter`、v1 event / codec / store、Identity / Policy、product、Adapter、Host、profile、package / lockfile、UI 或插件；`available` result 的真实发布 provenance、安装后 attestation、boot-scoped live inventory、Capability Registry、`CompatibilityEvaluationEvidence`、WT-02D DTO 转换 / 编排与任何真实动作继续 pending。最终自动化读数以本批 Birdview terminal event 和交付汇报为准。

**WT-02C.1A 当前结果（2026-09-28）：** 用户确认 Birdview revision 13 后，当前未提交工作树以 [ADR-0166](../adr/ADR-0166.md) 前向细化 ADR-0165，明确完整 evidence digest 保留 matter / revision / generation / boot / observation 与 provenance，稳定 `targetSemanticDigest + runtimeDescriptorDigest` 只用于预发布 MatrixV2 的唯一 exact lookup；stable pair 不是执行 authority，也不能替代 current revision、identity / policy、fresh inventory、revocation、availability 或 capability preflight。C1 v1 冻结为 fixed-fixture / migration evidence，WT-02C.1B 才实现新 schema / namespace / resolver migration；本批源码、测试、v1 event schema、package、lockfile、Host、profile、product、Adapter、UI 与插件改动均为 0。最终文档门禁、quick gate 与 Birdview 读数以本批实际交付汇报为准。

**WT-02C.1B 当前结果（2026-09-28）：** 用户确认 Birdview revision 14 后，本批实际差异严格限制为 `src/security/compatibility.ts`、`test/compatibility.spec.ts` 与 Compatibility Authority Note、本领域合同、本执行计划五个文件；没有新增 source / test 文件或修改 package / lockfile、领域层、event / codec / store、Identity / Policy、Host、profile、product、Adapter、UI 或插件。Red 命令 `pnpm --dir apps/sage-shell test test/compatibility.spec.ts` 退出 1：v1 12/12 通过，v2 15/15 仅因 V2 API 缺失失败；Green 后另补 exact-version 正向 grammar 与复合失败优先级对抗回归。最终验证为 v1 12/12、v2 17/17、compatibility 29/29、相邻 109/109、全量 259/259、产品边界 7/7、文档 31/31、quick gate 23/23（0 skip），strict compile、typecheck、build 与差异检查通过，独立复审 P0/P1/P2 均为 0。生产代码只在冻结 v1 第 1124 行后追加；该 prefix 施工前后 SHA-256 相同。10 个 V2 golden 由不 import / call 生产实现的独立 reference encoder 复算并逐字 10/10 一致。成功 resolution 在内存中冻结 `matrixId / matchedRuleId`、stable pair、full pair、exact action 与 evaluation time；它不携带或冻结完整 matrix / rule artifact，仍不是 trusted providers / clock、C2A～2D、C3 persistence、WT-02D composition、产品 / UI / 插件授权或真实数据证据，全部改动尚未提交。

**WT-02C.2A 当前结果（2026-09-28）：** 用户确认 Birdview revision 15 后，本批新增独立 runtime artifact attestation kernel 与 10 项 kernel 对抗测试，只在 `materializeProfile()` 的 activation transaction 内接入 create → fresh verify → receipt seal；materialize 集成 suite 另新增 post-create receipt failure 回滚，总定向 2 文件 / 21 测试。相邻 profile / Host 5 文件 / 31 测试、Sage Shell 全量 22 文件 / 271 测试、ADR / docs-links 31/31、quick gate 23/23（0 skip）、strict source/spec compile、typecheck 与 build 均已通过；隔离真实 materialization 使用默认 frozen pnpm install 安装 505 packages，扫描 24,567 regular files / 10 symlinks / 276M，完成 pointer、receipt 与 `0600` 验证并回收临时根。generation / owned binding、persisted digest forgery 与 mode drift 已有自动化反例；扫描函数内部恰逢同 UID 并发改写没有使用不稳定竞态做自动化注入，继续作为明确 TOCTOU residual。完整 wire shape、扫描顺序、rollback、单机读数与 residual risk 的唯一事实源是 [Runtime Artifact Attestation 架构记录](../notes/proposed/architecture/2026-09-28-runtime-artifact-attestation.md)。本批不修改 package / lockfile、v1 event / codec / store、Identity / Policy、Host、product、Adapter、UI 或插件；C2B～2D、C3、WT-02D 与 P0-5 继续未完成，全部改动尚未提交。

**WT-02C.2B 当前结果（2026-09-28）：** 用户确认 Birdview revision 16 后，本批新增独立 `runtime-inventory.ts` / spec 与 `host-process.spec.ts`，把 Sage Host IPC lifecycle protocol 升至 v4，并在既有 Host/profile 边界追加 main-owned boot/runtime snapshot、ready 后 Loader / process lifecycle invalidation、receipt-sealed C2A fresh verification、双 Host/profile stability 和最后取 trusted clock；FD3/FD4 DSH3 v3 frame 与六个 framing 常量保持不变。V2 `activeGeneration` 同时从 number 校准为真实 generation string，`runtimeGeneration=0` 拒绝；V1 canonical contract 保持冻结。有效 Red 分别来自 V2 2 failed / 36 passed、Host lifecycle 11 failed / 23 passed、projection production module 缺失及随后五项收紧反例；根任务联合回归 11 files / 130 tests、Sage Shell 全量 24 files / 305 tests、strict typecheck、build 与 ADR/docs 31/31 通过。第一次隔离真实启动暴露 `paths.js` 错引未分发 C2A scanner，已在授权的 `paths.ts` 中解除运行时依赖；修复后 materialize → Host ready → projection → stop invalidation 通过。ADR-0168 已前向澄清 lifecycle v4 / frame v3 分职；独立审查确认核心 Host/projection 无 P0/P1/P2，但既有官方 smoke 与 `sage-shell-pin` 尚未落实该分职，quick gate 为 22/23，故 revision 16 只能记为“核心源码完成、集成门禁未闭环”。完整 wire、稳定失败码、真实链路与 remaining boundary 的唯一事实源是 [Host Live Inventory 架构记录](../notes/proposed/architecture/2026-09-28-host-live-inventory.md)。本批不越权修改范围外 smoke / pin，也不修改 `main/index.ts`、package / lockfile、v1 event / codec / store、Identity / Policy、product、Adapter、UI 或插件；C2C、C2D、C3、WT-02D 与 P0-5 继续未完成，全部改动尚未提交。

**WT-02C.2B revision 17 门禁收口结果（2026-09-28）：** 本批只修正 revision 16 的验收接缝与对应治理事实。官方 smoke 复用 `isHostEvent` 和 `SHELL_HOST_PROTOCOL_VERSION`，不再仅凭 `message.type` 或写死 v3 接受 ready；隔离 profile 中逐项验证 protocol v4、active generation、manifest SHA-256、Loader active、产品/API 隔离与 clean shutdown。`sage-shell-pin` 独立要求 Sage lifecycle v4，同时继续逐值 pin upstream DSH3 v3 的六个 FD3/FD4 framing 常量；selftest 有效 Red 后为 `22/22`。最终 Sage Shell 全量为 `24 files / 305 tests`，strict typecheck 与 build 通过；ADR 派生账本为 `168` 篇 / `253` 条 decisions，ADR / docs-links 为 `31/31`；quick gate 为 `23/23`，无 skip、无 failed。ADR-0139 的历史 7 常量 equality 保留，并在人读正文、machine-readable constraints 与索引中标注只有 lifecycle 一项由 ADR-0168 前向取代。源码、门禁、文档和 Birdview 均未暂存、未提交、未推送；C2C、C2D、C3、WT-02D、Application Service、UI、插件与真实动作继续 pending。

**CP-18A 精确 checkpoint candidate（2026-09-28）：** 施工前只读审计确认 `main`、`HEAD=origin/main(local tracking)=8f89c906353a996df21887092b730fea692057d6`、ahead/behind `0/0`、index 为空；未执行 fetch，因此不把本地 tracking ref 冒充实时 GitHub 远端。revision 18 写入前共有 `63` 个 Git-visible 路径（`25 tracked unstaged + 38 untracked`），排序后的 path-set SHA-256 为 `446cc19b84ec31effca10e408d653cd72e7dd024283a734dcbee36a548a09bd6`，全部都有 UI-00、WT-01、WT-02A/B/C 或 revision 17 provenance，当前没有 Git-visible 排除项。revision 18 只新增下面 manifest 中的 ADR-0169 与 External Capability Evidence Note，其余五个治理入口本来已在 63 路径内；因此本批冻结的终态 candidate 是以下 `65` 路径（`25 tracked unstaged + 40 untracked`），path-set SHA-256 为 `78aa536f54e19e80c6d44ecd264077d1f48b8ca05240dab350fed88017506c09`：

```text
AGENTS.md
apps/sage-shell/package.json
apps/sage-shell/scripts/smoke.mjs
apps/sage-shell/scripts/test.mjs
apps/sage-shell/seed/package.json
apps/sage-shell/seed/pnpm-lock.yaml
apps/sage-shell/src/domain/business-matter-codec.ts
apps/sage-shell/src/domain/business-matter.ts
apps/sage-shell/src/host/composition.ts
apps/sage-shell/src/host/index.ts
apps/sage-shell/src/main/host-process.ts
apps/sage-shell/src/main/runtime-inventory.ts
apps/sage-shell/src/main/runtime.ts
apps/sage-shell/src/persistence/business-matter-event-store.ts
apps/sage-shell/src/profile/materialize.ts
apps/sage-shell/src/profile/paths.ts
apps/sage-shell/src/profile/runtime-artifact-attestation.ts
apps/sage-shell/src/protocol.ts
apps/sage-shell/src/security/compatibility.ts
apps/sage-shell/src/security/identity-policy.ts
apps/sage-shell/test/business-matter-event-store-path.spec.ts
apps/sage-shell/test/business-matter-event-store-process.spec.ts
apps/sage-shell/test/business-matter-event-store.spec.ts
apps/sage-shell/test/business-matter-rehydration.spec.ts
apps/sage-shell/test/business-matter.spec.ts
apps/sage-shell/test/compatibility.spec.ts
apps/sage-shell/test/composition.spec.ts
apps/sage-shell/test/fixtures/local-overlay.patch.yml
apps/sage-shell/test/host-entry.spec.ts
apps/sage-shell/test/host-process.spec.ts
apps/sage-shell/test/identity-policy.spec.ts
apps/sage-shell/test/materialize.spec.ts
apps/sage-shell/test/profile-paths.spec.ts
apps/sage-shell/test/protocol.spec.ts
apps/sage-shell/test/runtime-artifact-attestation.spec.ts
apps/sage-shell/test/runtime-inventory.spec.ts
apps/sage-shell/test/runtime.spec.ts
docs/adr/ADR-0139.md
docs/adr/ADR-0161.md
docs/adr/ADR-0162.md
docs/adr/ADR-0163.md
docs/adr/ADR-0164.md
docs/adr/ADR-0165.md
docs/adr/ADR-0166.md
docs/adr/ADR-0167.md
docs/adr/ADR-0168.md
docs/adr/ADR-0169.md
docs/adr/README.md
docs/adr/decisions.json
docs/notes/proposed/architecture/2026-09-27-business-matter-event-store.md
docs/notes/proposed/architecture/2026-09-27-capability-mounting-contract.md
docs/notes/proposed/architecture/2026-09-28-compatibility-authority.md
docs/notes/proposed/architecture/2026-09-28-external-capability-evidence.md
docs/notes/proposed/architecture/2026-09-28-host-live-inventory.md
docs/notes/proposed/architecture/2026-09-28-identity-policy-resolver.md
docs/notes/proposed/architecture/2026-09-28-real-identity-and-authority-data-governance.md
docs/notes/proposed/architecture/2026-09-28-runtime-artifact-attestation.md
docs/plans/2026-09-24-sage-self-owned-desktop-execution-plan.md
docs/research/19-jev-dsh-compat-handoff.md
docs/specs/2026-09-24-businessmatter-contract.md
docs/specs/2026-09-27-sanbao-to-sage-ui-consistency-contract.md
docs/specs/2026-09-27-sanbao-to-sage-ui-state-map.json
scripts/gate.mjs
scripts/gates/sage-shell-pin.mjs
scripts/gates/sage-shell-pin.test.mjs
```

`.birdview/**`（含 revision 18 map / activity / HTML）是被 `.gitignore` 排除的本机可再生展示物，不进入 checkpoint；实例侧 local patch、Jev state/egress、凭据、live Sage root、`node_modules`、`dist`、`apps/sage-shell/lib`、日志、临时 `SAGE_ROOT`、legacy profile/release/vendor、UI/插件源码和任何 worktree 也明确排除。`docs/adr/decisions.json` 是受跟踪派生账本、seed lock 是依赖解析事实、`local-overlay.patch.yml` 是测试 fixture，三者均必须留在 candidate。由于本批禁止 stage/commit，当前不存在 staged tree 或 commit object；这里冻结的是未来 checkpoint 的精确 path set，不宣称已经提交。

**WT-02C.2C.0 revision 18 当前结果（2026-09-28）：** 用户确认 Wave 18A 后，本批只新增 [ADR-0169](../adr/ADR-0169.md) 与 [External Capability Evidence 记录](../notes/proposed/architecture/2026-09-28-external-capability-evidence.md)，并更新 AGENTS 必读入口、ADR 索引/派生账本、Compatibility Authority 状态与本计划。合同要求 external capability 的 raw observation 来自同一执行 MCP connection generation 的完整有界分页，由 Electron main exact parse、重算并绑定 C2B / trusted clock；artifact subject 覆盖实际 bridge/SDK/launcher/interpreter/server/dependency closure 与结构化非秘密行为配置；tool annotations、名称、描述、进程/连接、工具数量、单页 list 与历史调用都不构成权限、兼容性或 availability authority。`list_changed`、reconnect/close、Host/profile/artifact/config drift 与 expiry 会立即失效旧 evidence。验证实际通过：ADR 派生账本 `169` 篇 / `261` 条 decisions，ADR / docs-links `31/31`，pin selftest `22/22`，Sage Shell `24 files / 305 tests`、typecheck、build，quick gate `23/23`，strict gate `23/23` 且 no-skip，Birdview examples、`87/87` tests 与 typecheck；同一临时 `SAGE_ROOT` 下 materialize 安装 `505` packages 并返回 `0`，随后 official smoke `17/17`，临时根已删除且没有 Host 残留。终态仍为 `65` 个 Git-visible 路径、index 为空，path-set SHA-256 仍为 `78aa536f54e19e80c6d44ecd264077d1f48b8ca05240dab350fed88017506c09`。该结果没有修改任何 UI/插件或其他源码、测试、package/lockfile、v1 event schema、Host/profile/runtime kernel，也没有连接真实 MCP、执行 `tools/list / tools/call`、启用插件、创建 worktree、暂存、提交或推送。

## Revision 19 完成后：剩余未实施事项的目标、tickets 与闭环路线

### 总目标

| 目标 | 要解决的问题 | 可验收终态 | 不能外推为 |
| --- | --- | --- | --- |
| G1 · Trusted External Capability Evidence | C2C.1 已冻结 local pure candidate descriptor，但 Sage 仍不知道外部 capability 实际执行的 artifact closure、同代完整工具合同及 observation 是否仍有效 | C2C.2～C2C.5 完成 same-generation observation、artifact/policy provenance observer、availability/preflight 与 main-owned aggregate provider | Registry 已批准、compatible、authorized 或可执行 |
| G2 · Sage-owned Capability Registry | mounted / observed / enabled 仍可能被误当成产品批准 | C2D.0～C2D.2 固定 product/security owner、immutable snapshot、descriptor provenance、operation mapping、disable/revoke | 某个事项 revision 已获授权 |
| G3 · Complete Compatibility Authority | target、matrix、PMAP 与完整 runtime inventory 的真实 producer 尚未补齐，C3 也未保存历史 evaluation evidence | C2T、C2M、C2E-PMAP、C2E 与 C3 共同产生 stable/full pair、matrix/rule/outcome、时间、provenance/revocation 的可追溯证据 | identity、人工 decision、availability 或 preflight 已通过 |
| G4 · Single Application Service | renderer、Host、插件或模型仍可能绕过权威编排 | WT-02D 让 Electron main 成为唯一 command/projection 入口，并以窄 port 调 Host Capability Adapter | UI 或 fixture 已经是生产闭环 |
| G5 · New UI + progressive plugins | 新 UI 与插件需要并行演进，但不能再次形成旧壳直连 | UI 只消费 Application Service；插件逐个经过 descriptor → Registry → Matrix → Adapter → policy/decision/preflight | 历史插件可直接恢复启用 |
| G6 · First real business loop | VOC / Shopify ABI 仍未形成真实、可审计的事项闭环 | 在隔离数据根完成创建 → 证据 → 澄清/审批 → attempt → artifact/failure → 人工 receipt → retry | 两个业务域一次性都已上线 |

### 依赖主线与并行边界

```text
WT-02C.2C.1 ✓ local pure
      │
      ├───────────────┬──────────────────┐
      ▼               ▼                  ▼
C2C-SEAM         WT-02C.2C.3       WT-02C.2D.0
      │               │                  │
      ▼               │                  ▼
WT-02C.2C.2            │             WT-02C.2D.1
      └───────┬───────┘                  │
              ▼                          │
         WT-02C.2C.4 ◄───────────────────┘
              │
              ▼
         WT-02C.2C.5 ─────────────► WT-02C.2D.2
              │
              ▼
        C2T + C2M + C2E-PMAP
              │
              ▼
         WT-02C.2E
              │
              ▼
    WT-02C.3.0 → .3.1 → .3.2
              │
              ▼
 WT-02D.0-ARCH → .0.1 → .1 → .2
              │
              ▼
      UI-01 / first approved plugin / WT-02E
```

当前固定 `main` 单线开发且禁止 worktree；因此 sub-agent 只并行做只读审计、官方资料核对、测试设计与独立验收，项目文件写入按 ticket 串行。C2D pure kernel、C3 pure codec 与 Application Service ports 在各自合同冻结后可以成为独立源码批，但不能在未冻结 DTO 时同时写入、最后再拼接。

### Wave 19A · WT-02C.2C.1 pure descriptor / canonicalization kernel（revision 19 当前工作树已完成、未提交）

**目标：** 冻结 C2C 与 C2D 共用的 candidate descriptor DTO、exact parser、canonical subject、独立 digest namespace 与稳定错误边界；它只处理调用方提供的候选结构，不做任何 I/O。

**精确项目文件：**

```text
apps/sage-shell/src/security/external-capability.ts
apps/sage-shell/test/external-capability.spec.ts
docs/notes/proposed/architecture/2026-09-28-external-capability-evidence.md
docs/notes/proposed/architecture/2026-09-28-compatibility-authority.md
docs/plans/2026-09-24-sage-self-owned-desktop-execution-plan.md
```

`.birdview/architecture-sage-wave1-r19.json`、`.birdview/activity-sage-c2c1-r19.jsonl` 与对应 HTML 是 ignored、本机可再生展示物，不进入 Git checkpoint。除非实现证明 ADR-0169 本身存在新决策，否则不改 ADR、AGENTS、package/lockfile、Host、profile、runtime inventory、domain/event/store、Identity/Policy、product、Adapter、UI 或插件。

**开发 Todo：**

- [x] 定义 `ExternalCapabilityDescriptorV1` 及 artifact subject、structured launch contract、normalized effective tool contract、bridge contract 的 exact DTO。
- [x] 五类 body / digest 使用相互隔离的 schema 与 URN：artifact、launch、bridge、tool contract、descriptor；artifact components 以封闭逻辑 role 表达，禁止把机器路径当 identity。
- [x] 使用独立 `sage.external-capability-canonical-json.v1` 与类型隔离的 descriptor digest namespace；任何调用方自报 digest 都必须重算。
- [x] exact parse 拒绝 unknown keys、Proxy、accessor、symbol key、非普通 prototype、cycle、重复 tool/artifact role 与错误 namespace/version。
- [x] 固定字段三分法：stable semantic 被纳入 digest；合法 `title/icons/annotations` 按 pinned exact shape 校验后丢弃且不影响 digest；未知 annotation / presentation 类型错误为 invalid，`_meta` 或未登记 tool extension 为 extension-unsupported。
- [x] object key 使用 locale-independent code-unit order；工具 / artifact component 集合按稳定 key 排序；除明确 set-like 字段外保持数组顺序，不做 JSON Schema 语义等价推断。
- [x] 区分 absent 与 empty description、raw output schema 的三态 bridge enforcement、`taskSupport` effective value、candidate protocol revision 与 bridge contract identity。
- [x] 首版 external MCP capability 拒绝空 tool set；若未来需要 tool-less capability，必须通过新 schema / 独立决策开放，不能隐式接受。
- [x] 在 pure kernel 内实现与精确 pinned `dsh-mcp-client@0.1.5-rc.2` 行为一致的最小 output-schema enforcement 判定器，并由不 import vendor / production encoder 的交叉 golden 锁定；不信任调用方自报 `enforced / fallback`。
- [x] v1 只接受 `local-stdio + interpreter-entrypoint` 和五个封闭 artifact role；`direct-exec` 固定拒绝。argument / environment / protocol policy 使用类型隔离 URN，但本批只证明 candidate namespace / digest shape，不证明 policy body 或 provenance。
- [x] exact 结构拒绝 raw command/env、home/cwd、绝对机器路径、credential URL 与动态 shell/PATH 字段进入返回值、reason 或 canonical bytes；typed policy URN 指向内容是否含 secret 仍待 C2C.3 / C2C.5 验证。
- [x] secret/path 禁区由 exact 结构和允许字段控制，不对普通 schema 文案做脆弱 substring 扫描；例如 schema 中合法描述 `token` 或示例路径不会因此被误判。
- [x] 返回结果递归冻结，且不修改调用方输入；production 模块只 import `node:crypto` / `node:util`，不 import Host、MCP client、filesystem、network、clock 或 global state。

**测试 Todo / Definition of Done：**

- [x] 先让 focused spec 因 production module 缺失取得有效 Red，再做 minimal Green；测试工具错误不算产品 Red。
- [x] 独立 reference encoder 不 import、不调用 production encoder，并以手写 normalized expected bodies 与五类固定 golden vectors 交叉校验。
- [x] 覆盖 key / tool / component reorder 稳定、required / enum / schema array order 保留、presentation-only 不变量，以及 artifact/tool/launch/protocol/capability semantic 变化改变 digest。
- [x] 覆盖 forged digest、wrong namespace/version、unknown extension、duplicate、Proxy/accessor/prototype/cycle、absent/empty、secret/path/raw-command 与输入不变、deep-freeze。
- [x] 运行 focused `19/19`、相邻 compatibility / artifact / runtime-inventory `79/79`、Sage Shell full `25 files / 324 tests`、typecheck、build、quick gate `23/23`、strict gate `23/23`（no-skip）、`git diff --check`、精确路径审计和独立 P0/P1/P2 复审（0/0）。
- [x] Birdview 在所有实际验证完成后进入 `completed`；最终结论只能是“local pure kernel complete”，不能写成 MCP 已接入、插件已批准或产品可用。

### Wave 19B · C2C observation / artifact 两条线

1. `C2C-SEAM-DECISION`：只做架构决策，核对 pinned bridge 已有完整分页 / list-changed 能力与公开 `ConnectionHandle` 缺口；选择受控只读 observation port 或 Sage-owned wrapper。不得改 vendor pin / `node_modules`，也不得另开第二条连接。
2. `WT-02C.2C.2`：只连隔离 fake MCP server，证明第一页无 cursor、后续 cursor 原样传递、完整有界分页、raw tool name 跨页唯一、page/tool/byte/deadline 上限与 `list_changed` / reconnect / close 即时失效；`tools/call` 调用数必须为 0。
3. `WT-02C.2C.3`：从 typed execution manifest 验证 bridge/SDK/launcher/interpreter/server/dependency closure、bytes、executable bit 与 safe link topology；动态 PATH、shell `-c`、command substitution、raw env、secret/path 混合一律 unavailable。

两条源码线可以并行设计测试，但在 main 上串行写入和验收。历史 Jev 的 `/bin/zsh -c "source <credential> ..."` 合同按 ADR-0169 必须判 unavailable；真实接入前另做 Sage-owned structured launcher / credential handoff，不能为兼容旧配置放宽 C2C.3。

### Wave 20 · Capability Registry pure control plane

- `WT-02C.2D.0`：先固定 Registry owner、candidate/approved/disabled/revoked 状态、immutable snapshot、descriptor provenance、operation → Adapter mapping 与 revoke 历史；本票源码为 0。
- `WT-02C.2D.1`：实现 exact、immutable、无 I/O 的 Registry kernel；duplicate/conflict/unregistered/disabled/revoked/unknown version 全部 fail closed，fixture 永远不能冒充 real entry。
- `WT-02C.2C.4`：建立 transport / discovery / contract / operation-preflight 四轴合同；fake preflight 只验证 port，真实 preflight 继续等 C2D mapping、Identity/Policy 与数据出境边界。

Registry 不得把 mounted、observed、enabled、approved、compatible、authorized、available 压成单状态，也不得在真实 Adapter operation 不存在时铸造 `adapterMappingDigest`。

### Wave 21 · External evidence aggregate 与 Registry provider

- `WT-02C.2C.5`：由 Electron main 汇合 C2B、descriptor、same-generation snapshot、artifact、lifecycle 与 trusted clock；双快照 / epoch / generation 不稳定、drift、expiry 或 clock rollback 都返回 unavailable，不构造完整 inventory、不调用 Resolver。
- `WT-02C.2D.2A`：建立 app-bundled Registry provider infrastructure；没有 approved entry 时，`available-empty` 是合法基础设施状态。
- `WT-02C.2D.2B`：只有 verified descriptor、产品/安全批准与真实 Adapter operation mapping 齐备后才加入第一个 real entry；这一步仍不启用插件、不执行真实 action。

### Wave 22 · 补齐 production authority producers 与完整 inventory

- `WT-02C.2T`：在单独决策 schema v2 或 immutable requirement registry 后建立 trusted target provider；禁止从自由文本推导 target。
- `WT-02C.2M`：建立 immutable MatrixV2 provider、historical matrix bytes 与 append-only revocation source；real `equivalent` rule 必须有 Sage Compatibility Authority 审批证据。
- `WT-02C.2E-PMAP`：补齐 Provider / Model / Agent / Preset 的受信 producer。
- `WT-02C.2E.0/.1/.2`：先固定合同，再实现 adapters，最后在 Electron main 汇合 C2A/B/C/D、PMAP、trusted clock 与 instance authority，同时生成 stable runtime descriptor 和 full inventory evidence；任何必要事实缺失都 unavailable，禁止 placeholder。

### Wave 23 · CompatibilityEvaluationEvidence 与 Application Service 基础

- `WT-02C.3.0`：决定 exact schema、独立 audit store 或 event schema v2、与 attempt append 的原子性 / 补偿、historical matrix lookup、retention/legal hold/purge/export/restore 与失败恢复。
- `WT-02C.3.1`：实现无 I/O exact codec，绑定 stable/full pair、matter/revision/action、matrix/rule/outcome、evaluation time、resolver contract、provider/revocation；历史回放禁止用当前 matrix 重算。
- `WT-02C.3.2`：在 `.3.0` 数据治理与原子性决策通过后做同一 SQLite adapter 的 sidecar persistence；持久化失败不得继续 attempt，并验证 lifecycle / legal-hold / purge / export / restore / recovery。
- `WT-02D.0-ARCH`（revision 37 已落档、未提交）：以 [ADR-0174](../adr/ADR-0174.md) 与 [Application Service 边界](../notes/proposed/architecture/2026-09-30-application-service-boundary.md) 固定 Electron-main ownership、`/.sage/*` route termination、main ↔ Host 窄 port、import firewall、`ViewState / ActionIntent`、projection-read policy、authority ordering、unavailable-first、idempotency / cancellation / retry / receipt / `outcome-unknown`；本批源码与 runtime route 为 0 改动。
- `WT-02D.0.1-PREFLIGHT`（revision 38 = NO-GO）：按 [ADR-0175](../adr/ADR-0175.md) 对当前 Electron pin 做隔离 caller-binding probe；入口 gate 可取消未授权来源，但已放行 handler 不随 caller 导航、销毁或 explicit renderer abort，因此 `.0.1` 保持 blocked。
- `WT-02D.0.1-IPC-PREFLIGHT`（revision 39 = NO-GO）：按 [ADR-0176](../adr/ADR-0176.md) 记录 IPC/preload candidate 的 top-bridge bypass；direct sender 与 lifecycle/cancel 的局部正证据不解除 `.0.1` 阻断。
- `WT-02D.0.1-SINGLE-FRAME-PREFLIGHT`（revision 40 = PASS 预检局部）：按 [ADR-0177](../adr/ADR-0177.md) 确认帧禁用候选不变量并在真实 Electron 43.3.0 取得完整正读数；该 PASS 只解除 transport 候选层面的反例，production 采纳与 route 迁移仍须另票。
- `WT-02D.0.1-FRAME-POLICY`（revision 41 已实现、未提交）：按 [ADR-0178](../adr/ADR-0178.md) 把帧禁用防御层落进 production shell（唯一窗口工厂 + generation 污染状态机 + strict CSP 并积层）；bridge 票的 IPC entry / durable barrier 必须检查 `isTrustedGeneration()`。
- `WT-02D.0.1`（blocked）：下一票是 preload / IPC bridge 与 `.sage/*` route 迁移；须先按 ADR-0174 确认 unavailable-first composition 的 authority 缺口处理，并另建 Birdview 计划单独确认；未获确认前不实现 production skeleton。
- `WT-02D.1`：实现零真实数据、零副作用的只读 fixture/blocked E2E；fixture/live 共用公开 shape，但 `projectionSource=fixture` 永久可见。

### Wave 24 · Sage-owned UI 只读融合

UI-01 只在 Application Service public shape 冻结后开始。先单独决定 renderer 技术 / 版本、build tool、package/lockfile、CSP、测试环境与 semantic token owner；保留现有 fail-closed 页和 `/.sage/*` 安全合同。最小交付是 Sage-owned 三栏经营事项工作台，展示 `created / evidence / clarification / running / artifact-receipt / failed-retry` 六种只读 fixture 阶段，并把 compatibility、authorization、availability、actionability 明确分开。

验收包括 keyboard/focus/Escape、窄宽恢复、light/dark、reduced motion、component/page screenshot baseline 与人工视觉复核；这批零真实 mutation、零插件启用，也不能计为产品闭环。

### Wave 25 · 真实 Identity、首个 approved capability 与业务闭环

- `WT-02B.2B` 等 issuer metadata、native public client registration、redirect URI、audience/scopes、identity mapping owner、Organization Policy Provider、账户生命周期与 OS vault capability 齐备后，再实现系统浏览器 OIDC + PKCE、token vault、refresh rotation/revocation 与 fail-closed session lifecycle。
- `WT-02B.3` 先实现受信 converter；真实 persistence 继续等待 schema/store、retention、legal hold、purge/export、deletion ledger、delete propagation 与 backup restore 决策。
- 首个插件依次经过 `candidate manifest → verified C2C descriptor → C2D approved entry → immutable MatrixV2 rule → Adapter operation mapping → WT-02D read-only observation → fresh identity/policy/decision/preflight → real operation → artifact/failure/receipt → revoke/disable/recovery`，不得复用历史“已安装/曾运行”状态跳级。
- 首个真实业务闭环先选一个只读、可撤销、无外部 mutation 的单一查询动作。VOC 与 Shopify ABI 各自作为 connector/capability ticket，先关闭一个再复制方法到另一个，避免首闭环同时承载两个业务域。

真实 OIDC、真实 MCP 与真实经营数据是三道独立等待门：任何 fixture、fake server、Green gate、Host ready 或 accepted ADR 都不能互相替代。

### 每个源码 ticket 的统一“开发—测试—验收—闭环”

1. **Checkpoint：** 复核 branch、HEAD、status、index、精确 path set，声明允许与禁止文件。
2. **Birdview planned：** 展示模块、关系、目标文件、风险、验证命令和未解决问题；未经确认不写源码。
3. **Red：** 先用最小失败测试证明真实缺口；instrumentation / import / environment 错误不算产品 Red。
4. **Minimal Green：** 只实现当前 ticket，不顺手接下一层 authority，不新增 dependency，除非另行确认。
5. **Focused：** ticket tests、hostile cases、independent goldens / reference encoder。
6. **Adjacent：** 相关 security、Host/profile、domain 与 import-boundary 回归。
7. **Repository：** Sage Shell full test、typecheck、build、quick gate、strict gate、`git diff --check`、secret/path 与精确文件审计。
8. **Independent acceptance：** sub-agent 按 P0/P1/P2 复审范围、失败边界、fixture/真实证据分层和实际 diff。
9. **Birdview completed：** 只记录实际文件、命令、exit code、未验证项；不提前关闭下一 ticket。
10. **Stop：** 默认不暂存、不提交、不推送；下一源码批重新 checkpoint，并等待新的精确范围确认。

### Revision 19 收口与下一门

用户已确认并实施 `WT-02C.2C.1` 的五个项目文件与三个 ignored Birdview 产物。本批只关闭 local pure candidate kernel；没有连接 MCP、运行 `tools/list / tools/call`、扫描 live artifact、启用插件或写 UI，也没有暂存、提交或推送。下一唯一入口是需单独授权的 `C2C-SEAM-DECISION`：先决定如何从同一执行 connection generation 暴露受控只读 observation，禁止 main 另开第二连接、禁止修改 vendor pin / `node_modules`，不得自动进入 C2C.2 或 C2D real provider。

### Revision 20：C2C-SEAM-DECISION 已收口，C2C.2 等待正式 seam

用户从 revision 19 断点恢复后，本批只完成 bridge seam 的事实核对与架构决策：当前 pinned bridge 的公开包没有 raw `Client`、完整分页 snapshot 或 generation observation API，`ConnectionHandle` 只有 `ready / dispose`；因此采用 bridge-owned 正式受控只读 seam，拒绝 registry hash、第二连接、公共 `apply` wrapper 和直接 node_modules patch。后续正式 seam 发布与 lockfile 更新必须另开源码 ticket；在此之前 `WT-02C.2C.2` 保持 `pending / blocked`，不连接真实 MCP、不启用插件、不写 UI、不改 v1 event schema。

### Revision 21：WT-02C.2D.0 Registry governance 已收口，C2D.1 / .2 等待真实输入

用户从 revision 20 断点恢复后，本批只固定 [ADR-0171](../adr/ADR-0171.md) 与 [Capability Registry 治理记录](../notes/proposed/architecture/2026-09-29-capability-registry-governance.md)：Sage product/security governance 独占 `candidate | approved | disabled | revoked` 四态和 immutable content-addressed snapshot；entry 必须绑定 C2C verified descriptor/provenance、精确 Adapter operation mapping、owner approval 与生命周期；`mounted / observed / enabled / compatible / authorized / available` 保持正交。每次状态迁移产生新 snapshot，`revoked` 不原地恢复。

本票源码为 0，没有 Registry provider、real entry、Adapter、插件启用、真实 MCP、UI、Identity / Policy、Compatibility、C3、Application Service 或 v1 event schema 变更。C2C.2 仍因正式 bridge seam 保持 `pending / blocked`；C2D.1 只能在该治理合同下实现 pure kernel，C2D.2 / real entry 还必须等待 C2C.5 verified descriptor/provider 与真实 Adapter mapping。

### Revision 22：WT-02C.2D.1 pure Registry kernel 已完成，provider 仍隔离

用户从 revision 21 断点恢复后，本批只实现 `apps/sage-shell/src/security/capability-registry.ts` 与对应 hostile-input 测试。内核在内存中 exact-parse entry / snapshot / transition，重建固定 canonical JSON，计算类型隔离的 entry / snapshot digest，并以新的 immutable snapshot 表达 `candidate → approved / disabled / revoked` 迁移；`revoked` 为终态，duplicate、conflict、未验证 descriptor、缺 operation mapping、缺 owner approval、过期与未知字段均 fail closed。时间校验使用纯字符串 / 日历规则，不读取系统时钟。

本批只消费调用方给出的 candidate / C2C.5 verified descriptor reference；没有 provider、真实 artifact / policy provenance、Registry entry、Adapter、MCP / Host I/O、插件启用、UI、Application Service、v1 event schema、package 或 lockfile 变更。`approved` fixture 仅证明内核状态门，不是生产批准或可执行授权。C2D.2 bundled provider / real entry 仍必须等待 C2C.5 verified descriptor、真实 Adapter mapping 与独立 owner approval。

本地 focused security run 已通过 `26 files / 333 tests`（包含 Registry 9 tests），随后必须继续跑 typecheck、build、Sage quick / strict gate、ADR / docs links、Birdview validate / render 与 `git diff --check`；本批保持 index 为空，不提交、不推送。

### Revision 23：WT-02C.2C.5 aggregate evidence kernel 已完成，production provider 仍阻断

本批在上一断点选择最小安全入口，只新增 `apps/sage-shell/src/security/external-capability-evidence.ts` 与 `apps/sage-shell/test/external-capability-evidence.spec.ts`，并同步本计划、Compatibility Authority、External Capability Evidence 记录和 agent 必读边界。内核对 descriptor / provenance / C2B host / 同代 connection 做 exact binding，重算 content digest，拒绝 generation drift、tampered digest、invalid connection / provenance，并对显式时间执行 `[observedAt, expiresAt)` freshness；返回值 detached、deep-frozen，production import 只保留 `node:crypto` 与 `node:util`。

这不是 production provider：typed artifact / launch / tool evidence URN、`source: c2c5` 与 descriptor digest 仍是 caller-supplied reference，未扫描真实 bytes，未连接 bridge / MCP，未执行完整分页，未监听 reconnect / `list_changed`，未读取系统时钟，也没有创建 Registry entry、Adapter mapping、authorization、availability、插件或 UI。C2C.2、C2C.3、C2C.4 与正式 C2C.5 provider 仍按真实输入单独推进；C2D.2 不能把本批 candidate 当作 verified descriptor。

当前批次保持 main、无 worktree、index 为空；不修改 v1 event schema、package / lockfile、Host/profile、bridge/vendor、Registry、Adapter、Application Service、UI 或插件，不提交、不推送。P0-5 仍未通过。

### Revision 24：WT-02C.2C.3 local artifact observer 已完成，真实 provenance 仍阻断

本批在不等待正式 bridge seam 的前提下实现最小、可独立验收的 artifact observation 入口：新增 `apps/sage-shell/src/security/external-capability-artifact-observer.ts` 与对应 hostile-input / filesystem fixture 测试。observer 只接受调用方显式给出的 artifact root 和 exact static execution manifest；root 形状固定为 `package.json`、`pnpm-lock.yaml`、`components/{bridge,sdk,launcher,interpreter,server-entrypoint}`，组件目录递归扫描并重算每个实际文件的 SHA-256、executable bit 与相对 symlink topology，使用 `O_NOFOLLOW`、开前/开后 fingerprint、目录名复核、物理 root containment 与 4096 条目 / 64 MiB / 64 KiB 读取上限。输出只包含 pathless candidate artifact subject、manifest digest、launch evidence digest 与 artifact evidence digest。

manifest 只允许 `local-stdio + interpreter-entrypoint`、五个封闭 logical role、pinned-relative entrypoint、empty environment、disabled shell、static literals；observer 只接受绝对 root，且对文件与递归目录都做前后 fingerprint 复核。unknown key、动态 shell / PATH / env、绝对路径、root expansion、越界或不可解析 symlink、特殊文件、并发内容漂移和超限均 fail closed。测试覆盖成功观察、内容变化、escaped / in-root symlink、root expansion、unsafe launch、unknown manifest field、Proxy / exotic input 与 production import firewall。

这一步只证明受控本地 fixture / artifact root 的一次安全观察，不证明 producer provenance、真实 bridge connection、MCP `tools/list`、trusted clock、C2C.5 provider、Registry approval、Adapter mapping、插件启用、UI 或产品动作。所有源码 / 测试 / 文档仍在当前 `main` 未提交工作树，index 为空；没有修改 v1 event schema、package / lockfile、Host/profile、vendor、真实 Sage root，也没有暂存、提交或推送。

### Revision 25：WT-02C.2C.4 bounded availability / preflight contract 已完成，真实执行权仍阻断

本批在 C2C.2 正式 bridge seam 仍关闭的前提下，选择可独立验收的纯合同入口：新增 `apps/sage-shell/src/security/external-capability-availability.ts` 与 `apps/sage-shell/test/external-capability-availability.spec.ts`。内核将 transport、discovery、contract、operation preflight 固定为四个正交状态轴，exact-parse 调用方输入，绑定 descriptor / evidence digest 与同代 host / connection generation，执行 `[observedAt, expiresAt)` 半开 freshness，并返回 detached、deep-frozen、content-addressed record。

只有 `connected + complete + valid` 推导 `availabilityState: available`；operation preflight 的 `not-requested / port-valid / blocked / expired / invalid` 不改变该 availability 结论。`port-valid` 只接受结构正确的 caller-supplied candidate port digest，不证明 C2D Adapter operation mapping、Identity / Policy、数据出境边界、Registry approval 或真实动作；`actionability` 在所有结果中固定为 `blocked`。host / connection generation drift、unknown key、Proxy / exotic record、非法 preflight shape、digest tamper 与 freshness 越界均 fail closed，错误不携带秘密。

focused availability tests `6/6`、typecheck、build、Sage full test、quick / strict gate、diff check 与 Birdview 产物门禁用于本批验收。生产内核只 import `node:crypto` / `node:util`，不访问 filesystem、network、clock、Host、MCP、bridge、Registry、Adapter、provider、UI 或 plugin，不修改 v1 event schema、package / lockfile，不暂存、不提交、不推送。C2C.2 formal seam、正式 C2C.5 provider、C2D.2 real entry 与产品接线继续 `pending / blocked`。

### Revision 26：WT-02C.2T target requirement governance 已完成，provider 仍待实现

本批在 C2C.2 formal bridge seam 与 C2C.5 production provider 仍关闭的前提下，先完成 target provider 的唯一治理入口：新增 [ADR-0172](../adr/ADR-0172.md) 与 [Compatibility Target 治理记录](../notes/proposed/architecture/2026-09-29-compatibility-target-governance.md)，并同步 Compatibility Authority、ADR README / 派生账本和本计划。决策采用 Sage-owned immutable requirement registry，使用独立 `sage.compatibility-target-requirement.v1` schema，不修改 v1 event；stable target semantic 只包含 exact action/effect/decision、permission/data-boundary 与 Provider/Model/Agent/Preset/Capability requirements，matter/revision/resource/time/provenance 只进入 full target evidence。

requirements 必须 exact、可重算、可追溯；SemVer range、wildcard、mutable alias、自由文本推导、UI selection、工具名、package display name、普通调用方 digest、未分类字段和缺 provenance 均 fail closed。full target 在 stable lookup 前绑定 current revision，snapshot 只允许 append-only publish / revoke，禁止 `latest`、原地编辑、按 matter / boot 动态铸造 stable key 或 revoked entry 原地恢复。

这是治理批，不是 target provider 实现：源码 / 测试 / package / lockfile / v1 event / UI / plugin / real data 改动为 0；没有读取真实数据根、连接 MCP、执行 `tools/list` / `tools/call`、接 Registry / Adapter、暂存、提交或推送。下一票是 WT-02C.2T pure parser / trusted provider，仍必须在其自身 Birdview 范围中单独验收。

### Revision 27：WT-02C.2T pure target kernel / bundled provider 已完成，真实 provenance 仍未接入

本批把 revision 26 的治理合同落成独立安全内核：新增 `apps/sage-shell/src/security/compatibility-target-requirement.ts` 与 `apps/sage-shell/test/compatibility-target-requirement.spec.ts`。内核使用独立 `sage.compatibility-target-requirement.v1` snapshot、`sage.compatibility-target-requirement-entry.v1` entry 和 `sage.compatibility-target-requirement-canonical-json.v1` canonicalization；对 action / effect / decision、permission / data-boundary、Provider / Model / Agent / Preset / Capability exact requirement、owner decision、effective / expiry / revoke 做 exact parse，按 canonical bytes 重算 typed digest，拒绝 unknown / range / wildcard / mutable alias / matter-revision leakage / duplicate / malformed lifecycle。

`createBundledCompatibilityTargetProvider()` 只接受已经 sealed、内容寻址且 immutable 的 app-bundled snapshot；resolve 需要显式 requirement ID、action scope 与 evaluatedAt，只返回当前有效且声明了该 action 的 stable requirement，未生效、过期、撤销、缺失、未声明 action、非法 request 或 snapshot 不可用均 fail closed。内核不读取文件、网络、Host、MCP、系统时钟或全局状态，不创建 real target evidence，也不接受 current revision、provider provenance 或普通调用方 digest 作为 authority；这些仍由 Application Service / trusted provider 另票验收。

本批通过定向及 Sage Shell 全量测试（30 个文件 / 354 个测试），并将在本批 Birdview 活动记录中同步 typecheck、build、test、quick / strict gate、diff check 与 render 结果。当前工作树仍未暂存、未提交、未推送；下一步依赖 C2C.2 formal seam、C2C.5 production evidence、C2D.2 real Registry entry 与后续 Application Service。

### Revision 28：WT-02C.2M app-bundled MatrixV2 provider 已完成，生产 authority 仍未接入

本批新增 `apps/sage-shell/src/security/compatibility-matrix-provider.ts` 与 `apps/sage-shell/test/compatibility-matrix-provider.spec.ts`。provider 将 MatrixV2 canonical bytes 作为不可变、内容寻址的历史 artifact 集保存；artifact 必须重新 canonicalize、重算 `matrixId`，bundle 以独立 bundle ID 封存并拒绝重复或篡改。稳定查找只接受显式 `targetSemanticDigest + runtimeDescriptorDigest + evaluatedAt`，可选 `matrixId` 仅用于审计 / 历史回取；没有唯一候选、存在重叠、stable pair 不匹配或请求非法均返回 typed unavailable，不使用 latest、range、wildcard 或 v1 fallback。

revocation source 作为独立输入保存，使用自己的 schema / canonicalization / source ID、source provenance、创建时间和 `supersedesSourceId` lineage；provider 返回 revocation source identity，只有通过显式 `toCompatibilityMatrixV2ProviderResult()` 才映射为现有 resolver 可消费的最小结果，避免把来源证明静默丢失。源码无 filesystem、network、clock、Host、MCP、Registry、Adapter、UI 或 plugin I/O；没有内置 fixture、不会把测试矩阵写入 production provider，也没有修改 v1 event schema。

本批 Sage Shell 全量测试为 `31 files / 360 tests`，typecheck 与 diff check 已通过；后续继续执行 build、quick / strict gate、Birdview validate / render。当前工作树仍未暂存、未提交、未推送。该票只关闭 app-bundled MatrixV2 provider contract，不能表述为 trusted Matrix Authority release、真实 revocation publication、C2C.2/C2C.5 production evidence、C2D.2 Registry、C2E inventory、C3 evidence 或 WT-02D 产品接线。

### Revision 29：WT-02C.3.0 CompatibilityEvaluationEvidence 治理已完成，codec / persistence 仍未实现

本批新增 [ADR-0173](../adr/ADR-0173.md)，并同步 Compatibility Authority 记录、ADR README / 派生账本和本计划。决策将 `CompatibilityEvaluationEvidence` 固定为独立的 `sage.compatibility-evaluation-evidence.v1` 旁路 schema 与独立 canonicalization / digest namespace，保持 `BusinessMatter` v1 event、v1 codec 与 hash chain 冻结。evidence 必须绑定 evaluation / attempt、matter / revision / action、stable/full 四层 digest、`matrixId + matchedRuleId + outcome + reasonCode/reason`、`evaluatedAt`、resolver contract、当时的 target / inventory / matrix provider provenance、历史 matrix canonical artifact reference 与 revocation source / lineage；raw token、claim、secret、机器绝对路径和未分类 caller / plugin 自报字段禁止进入。

历史 matrix 只能按 immutable content-addressed reference 取回并验证 canonical bytes、matrix ID、bundle lineage 与 revocation source；strict replay 只验证封存的 evidence / historical subject，返回原始 outcome / reason / provenance，不调用当前 target、runtime、MatrixV2、Registry、Identity / Policy provider，不使用当前时间，也不产生新的 action authorization。artifact 缺失或篡改时返回 `historical-artifact-unavailable` / `evidence-corrupt`，不使用当前 matrix 重算历史。

原子性采用 Sage main-owned SQLite transaction / adapter boundary：evidence append、attempt / decision receipt 与 compatibility gate 一起 durable commit；任一失败返回 `compatibility-evidence-unavailable` 并阻断 action。跨 store 若无法共享事务，必须另立 outbox / prepare-commit / compensation ADR，禁止 best-effort 补写或先执行后审计。retention、legal hold、purge、export、restore 支持 `active`、`retention-expired`、`legal-hold`、`deletion-pending`、`purged`，不预设全局 TTL；legal hold 只暂停 purge，purge 不改写 append-only event hash chain，备份或关联 artifact 未处理时不得报告完成。

本批源码、测试、package / lockfile、v1 event、provider、trusted clock、store、UI、插件与真实 action 改动为 0；未读取真实数据根、未连接 MCP、未执行 `tools/list` / `tools/call`、未接 Application Service、未暂存、未提交、未推送。下一唯一源码入口是 `WT-02C.3.1` pure exact codec，随后才是经单独确认的 `.3.2` persistence。

### Revision 30：WT-02C.3.1 CompatibilityEvaluationEvidence pure exact codec 已完成，persistence 仍未接入

本批按 revision 29 的独立旁路合同新增 `apps/sage-shell/src/security/compatibility-evaluation-evidence.ts` 与 `apps/sage-shell/test/compatibility-evaluation-evidence.spec.ts`。codec 使用独立 `sage.compatibility-evaluation-evidence.v1` canonical JSON 与 typed SHA-256 digest，执行 exact parse、deep-freeze、sealed evidence round-trip、unknown / malformed / digest mismatch / lifecycle / provenance 拒绝，并保留 stable/full pair、matter / revision / action、matrix / rule / outcome / reason、evaluation time、resolver contract、provider / revocation lineage 与 historical matrix artifact reference。

strict replay 只接受封存 evidence 与 caller-supplied historical MatrixV2 canonical bytes；重新验证 canonical bytes、matrix ID、artifact reference、bundle / revocation lineage、evaluatedAt 时点有效性、稳定 pair、唯一 rule、outcome 与 reason，不调用当前 matrix、target、runtime、Registry、Identity / Policy provider，不读取当前时间，也不产生 action authorization。artifact 缺失、篡改、过期、撤销、规则漂移、outcome / reason 漂移和 `purged` / `deletion-pending` evidence 均 fail closed。

该模块仅依赖 Node 标准 `crypto` / `util` 与既有纯 compatibility canonicalizer；没有 filesystem、network、Host、MCP、clock、store、provider、Application Service、UI、plugin 或 v1 event I/O。定向测试覆盖 codec、strict replay、historical artifact / revocation drift、lifecycle 与 import firewall；本批不实现 persistence，因此 `WT-02C.3.2` 仍需独立确认。

本批当前工作树未暂存、未提交、未推送；既有 dirty / untracked 基线保持不动。最终验收必须以本批 Birdview activity 的实际 full test、typecheck、build、quick / strict gate、diff check 与 render 结果为准。

### Revision 31：WT-02C.3.2 CompatibilityEvaluationEvidence persistence 已完成，产品接线仍未实现

本批按 revision 29 的独立旁路合同和 revision 30 的 pure codec，新增 `apps/sage-shell/src/persistence/compatibility-evaluation-evidence-store.ts` 与 `apps/sage-shell/test/compatibility-evaluation-evidence-store.spec.ts`，并扩展 `apps/sage-shell/src/persistence/business-matter-event-store.ts`。evidence sidecar 与既有 `BusinessMatter` v1 event 表共用 Sage-owned SQLite adapter；新增的 evidence / operation-receipt 表只承载独立 schema、canonical bytes、历史 matrix / revocation bytes、lifecycle 与 operation receipt，不改变 v1 event、append 表或 hash chain。旧的三张 v1 表可在首次打开时以同一个 `BEGIN IMMEDIATE` 添加 sidecar，迁移失败仍 fail closed。

`appendWithCompatibilityEvidence()` 先执行 C3.1 strict replay / matter binding，再把 BusinessMatter event、append receipt 与 evidence row 放入同一事务；任何 evidence 校验、重复或写入失败都回滚并返回 `compatibility-evidence-unavailable`，不会留下已执行但无 evidence 的 attempt。maintenance port 提供 load、export、restore、lifecycle transition、legal-hold、purge 与 operation-id recovery；export / restore 携带并验证 schema、digest、lineage 与 lifecycle，purge 仅在非 hold 的 `retention-expired` / `deletion-pending` 状态清空 sidecar bytes、标记 `purged` 并净化已有 export receipt，不重写 append-only event hash chain。

本批没有接真实 provider、trusted clock、Application Service、Capability Adapter、UI、插件、MCP、真实数据根或产品 action；`deletion-pending` 只保留可审计的 sealed metadata，加载时仍须验证封存 evidence / historical artifact，不能用当前 matrix 重算。focused persistence、Sage Shell full test（`33 files / 370 tests`）、typecheck、build、`test:gate`、quick gate、full strict gate 与 `git diff --check` 均以实际命令验收；当前工作树仍未暂存、未提交、未推送。

### Revision 32：WT-02C.2C.2 seam contract preflight 已完成，formal bridge seam 仍 blocked

本批新增 `apps/sage-shell/src/security/external-capability-observation-contract.ts` 与 `apps/sage-shell/test/external-capability-observation-contract.spec.ts`。它只定义并执行未来 bridge-owned、list-only observation port 的合同：同一 `connectionGeneration`、第一面无 cursor、后续 opaque cursor 原样传递、全部页完成后才形成 detached snapshot、raw tool name 跨页唯一、page/tool/canonical-byte/deadline 上限，以及 list-changed / transport close / reconnect / dispose / source failure 的 fail-closed 失效；稳定错误 code 不携带原始异常、秘密或路径。

测试使用隔离 fake connection，覆盖完整双页收集、重复/空 cursor、duplicate name、page/tool/byte/deadline bounds、malformed page、source error、list-changed invalidation 与 zero `tools/call`。生产模块无 bridge/MCP、filesystem、network、clock、Host、Registry、Adapter、provider、UI 或插件 I/O，不改 package / lockfile、v1 event schema 或 vendor。该票只关闭 seam readiness contract，不能称为 formal `WT-02C.2C.2` production observation；后者继续等待 bridge 正式 release / 可复现 fork 与真实 fake-server evidence。

本批当前工作树未暂存、未提交、未推送；既有 dirty / untracked 基线保持不动。验收以 revision 32 Birdview activity 的实际 focused/full test、typecheck、build、quick / strict gate、diff check 与 validate/render 读数为准。

### Revision 33：WT-02C.2C.2 seam-intake gate 已完成，formal bridge seam 仍 blocked

本批没有把 revision 32 的 Sage-owned contract preflight 误升级为真实 MCP observation。只读复核 ADR-0170、`apps/sage-shell/seed/package.json`、`apps/sage-shell/seed/pnpm-lock.yaml` 与现有关闭条件后确认：`@deepseek-ai/dsh-mcp-client` 仍精确 pin `0.1.5-rc.2`，没有新的 bridge 正式 release、可复现 fork、raw `Client` / transport / pagination / `list_changed` / generation observation port 或 Sage 可绑定的正式只读 seam。

因此本批只完成证据与门禁同步，不更新 dependency specifier / lockfile，不修改 `node_modules`、vendor、解析 store 或 runtime monkey patch，不另开 MCP connection，不运行真实 `tools/list` / `tools/call`，不启用插件、不接 Registry / Adapter / UI / Application Service，也不改 v1 event schema。C2C.2 production observation 继续 `pending / blocked`；重新进入实现前必须同时具备正式 seam、隔离 fake MCP server、完整有界分页、同代绑定、失效传播和零 `tools/call` 证据。

本批仅修改 Compatibility Authority 记录与本执行计划；revision 33 Birdview activity 记录了 status/index、pin/seam evidence scan、docs-link、quick / strict gate、diff check 与 validate/render 的实际结果。源码、测试、package、lockfile、vendor、UI、插件和生产数据均未改动；当前工作树仍未暂存、未提交、未推送。

**P0-5 仍未通过：** WT-01、WT-02A.1、WT-02A.2、WT-02A.3A 与 WT-02A.3B 只证明纯内存领域合同、strict codec / rehydrator、测试临时 Sage root 内的 file-backed store、进程级对抗和 POSIX snapshot 路径边界；WT-02B.1 只证明内存 security kernel 的 authority 解析，WT-02B.2A、WT-02C.0 与 WT-02C.1A 只证明治理决策已落档，WT-02C.1 与 WT-02C.1B 只证明 fixed-fixture v1/v2 compatibility kernels，WT-02C.2A 只证明 materialization-time installed content，WT-02C.2B 只证明独立 boot-scoped Host observation，WT-02C.2C.1 只证明 caller candidate descriptor 的纯结构、canonicalization 与 digest，WT-02C.2D.0 只证明 Registry governance contract；WT-02C.3.2 只把 evidence sidecar 接入本地 Sage-owned SQLite，不代表 production provider 或产品编排。它们均不证明真实登录、组织目录、token vault、可信 MatrixV2 发布、same-generation MCP observation、实际 artifact / policy provenance、`ExternalCapabilityEvidence`、Capability Registry provider / real entry、完整 `RuntimeInventoryEvidenceV2` / production `CompatibilityEvaluationEvidence` composition 或可信产品 composition。产品 / 真机数据根、same-UID 持久 capability、真实 identity / policy provider、PII / retention enforcement、Capability Adapter、Application Service、模型/工具、外部动作、新 UI、插件运行时、GUI、加密、真实数据根的 purge / export / backup restore 均未接入。不得将本批文档、测试读数、quick gate、`SIGKILL/reopen`、内存 `AuthoritySnapshot`、fixed fixture `equivalent`、stable pair、artifact attestation、Host projection、typed policy URN、插件装配或 accepted ADR 表述为真实产品数据已持久化、真实身份系统、插件兼容、产品授权、物理断电 durability、产品闭环或实机验收。

**P0-5 最终通过条件：** 一条经单独确认的隔离产品 / 真机流程能从创建事项走到可验证回执，并能在审批拒绝、工具失败和重试中保留事实链；其余未实现状态继续显式标注。

### P0-6｜内部工程验收

- [ ] `pnpm --dir apps/sage-shell typecheck`、`test`、`build`。
- [ ] `sage-shell-pin`、Adapter、资料导入、资产 manifest、可见品牌扫描和事项状态机的定向测试。
- [ ] 隔离 profile / 数据根的 host smoke、Electron 冷启动、首闭环与失败重试实机验收。
- [ ] `pnpm run gate`、`pnpm run gate:full`；任何现有红项与 Sage 新红项分开记录。
- [ ] Birdview 记录计划与实际文件、命令、退出码、未验证项；内部版不打 DMG。

**通过条件：** 上述每项都有实际命令、退出码和范围证据；未做的 GUI / 迁移 / 签名项标为 `UNVERIFIABLE` 或 `not-run`，不以计划替代绿灯。

### P1｜可分发 Sage.app（另批确认）

- [ ] 新建 Sage 专属 assemble、安装、签名、公证、更新和回滚链；不套用 `DSH Desktop.app` 命名、安装器或 feed 假设。
- [ ] 完成 Developer ID、notarization、Gatekeeper、TCC、升级与数据迁移演练。
- [ ] 为受控浏览器、native directory picker、preset、连接器和更新器逐项建立 Sage 主进程适配与兼容矩阵。
- [ ] 完成公开资产权属 / 商标 / 视觉发行门后，才生成外部分发 DMG。

## 清理与退役策略

| 对象 | P0 操作 | 删除前门 |
| --- | --- | --- |
| 当前 DSH Desktop.app 与 `~/.dsh` | 只读导入来源，保留 | Sage 新装、导入、回滚、关键能力与用户确认均通过 |
| `packaging/release/**`、`.archive/**`、历史 manifest | 只读盘点，默认保留 | 恢复副本、校验和、版本策略 ADR、明确删除名单与单独授权 |
| Sanbao 外部原型 / 图标源仓 | 只读输入，不作为依赖 | 不适用；Sage 只管理仓内派生资产 |
| `apps/lute-shell/` | P0-1 原子重命名，不复制 | `sage-shell-pin`、构建和 host 回归通过 |
| 上游品牌补丁 / UI | 不删除；与 Sage 代码分离 | Sage 自有 UI 与迁移链通过后，另批逐项评估 |

## 每批 Birdview 交付格式

每一批开始前必须展示：模块、当前 / 目标文件、意图、不可触碰范围、验证命令和仍未知事项。每批结束后只记录实际修改、实际命令与退出码。示例批次顺序：P0-1（源码迁移）→ P0-2（自有 renderer / Adapter）→ P0-3（隔离与导入）→ P0-4（资产与可见面）→ P0-5（首闭环）→ P0-6（工程验收）。

P0-3A 已完成；P0-3B 继续阻断。用户已将当前未提交工作树中的 WT-01 纯内存领域核、WT-02A.0 存储决策批、WT-02A.1 strict rehydration、WT-02A.2 SQLite store、WT-02A.3A 进程级对抗与 WT-02A.3B POSIX 路径边界确认为和资料迁移隔离的例外；它们都不授权读取或改写真实 `~/.dsh`、当前 App、product / Adapter / Host / profile、lockfile、资料或发布物，也不授权提交。迁移主线的下一步仍只能先以 Birdview 展示 **P0-3B 的真实旧资料导入范围**。P0-5 已确认 WT-02B.1 revision 9、WT-02B.2A revision 10、WT-02C.0 revision 11、WT-02C.1 revision 12、WT-02C.1A revision 13、WT-02C.1B revision 14、WT-02C.2A revision 15、WT-02C.2B revision 16 / 17、WT-02C.2C.0 revision 18 与 WT-02C.2C.1 revision 19；revision 10、11、13 与 18 只授权治理文档落档，revision 12 授权 fixed-fixture v1 kernel，revision 14 授权 MatrixV2 / stable-key local kernel，revision 15 授权 materialization-time runtime artifact attestation，revision 16 授权 boot-scoped Host live projection，revision 17 只关闭其 smoke / pin 验收接缝，revision 19 只授权 local pure candidate descriptor / canonicalization kernel。它们均不覆盖真实 provider / trusted clock composition、token vault / session runtime、`AuthorityEvidence` / `CompatibilityEvaluationEvidence` 转换或持久化、v1 event schema、production external capability provider、Capability Registry、Application Service、UI、插件、资料或提交。WT-02C.1B 已实现 local kernel migration，WT-02C.2A 已实现安装时内容 attestation，WT-02C.2B 已实现并通过独立 Host live projection 验收，C2C.0 只完成治理合同，C2C.1 已实现 local pure candidate kernel；C2C.2～.5、C2D、C2E、C3 与 WT-02D 仍 pending，不能接产品。WT-02B.2B、WT-02B.3、WT-02C.2C.2～.5、WT-02C.2D、WT-02C.2E、WT-02C.3 与 WT-02D 必须依据各自真实输入、实际证据和精确 Birdview 范围推进。进入真实产品数据根前还必须单独决策 WT-02A.3B 已记录的 Node path-only residual。

当前覆盖修正（WT-02C.3.2 revision 31）：C3.2 的本地 evidence sidecar persistence、同事务 append、失败闭锁、lifecycle / legal-hold / purge / export / restore / recovery 已完成并通过本批门禁；尚未完成的是 C2C.2～.5 production observation/provider、C2D.2 real entry、C2E 完整 inventory composition、真实 provider / trusted clock、Application Service、Capability Adapter、UI、插件、真实数据根和产品 action。

用户另行确认 WT-02C.2B revision 17 门禁收口；其授权只覆盖官方 smoke 的 exact v4 ready/profile binding、`sage-shell-pin` 的 lifecycle v4 / DSH3 v3 framing 分职、自测、准确 remediation 与 ADR / Note / 计划 / Birdview 事实同步。该确认不扩大到 C2C、C2D、C3、WT-02D、Application Service、UI、插件、真实资料、发布、暂存、提交或推送。

用户随后确认 Wave 18A：CP-18A 只展示未来 checkpoint 的精确 path set，R17-DOC-SYNC 只校准当前事实，WT-02C.2C.0 revision 18 只固定 external capability evidence 治理合同；不修改 UI/插件或其他源码，不连接或启用插件，不创建 worktree，不暂存、不提交、不推送。

用户随后确认实施 WT-02C.2C.1 revision 19；授权仅覆盖上述五个项目文件与 ignored Birdview 产物，不连接 MCP、不运行 `tools/list / tools/call`、不启用插件、不写 UI、不修改 ADR/package/lockfile/Host/profile/runtime inventory/domain/store/Identity/Policy/product/Adapter，也不暂存、提交或推送。

### Revision 34：UI-01 Sage 工作台接线首批

本批将“尽快切入 UI/UX 接线”收敛为四个可独立验收的 tickets：

- `UI-01A`：用 Sage-owned component renderer 把单一 runtime 状态卡升级为工作台壳。沿用现有无框架静态 renderer，新增总览、经营事项、能力、治理四个本地 tab 与三栏信息层级；Sanbao 只提供交互和视觉合同，不复制其源码。
- `UI-01B`：保留唯一真实接线 `GET /.sage/state` 与 `POST /.sage/actions` retry。runtime 状态、fixture projection、external capability blocked 和 actionability 分开呈现，禁止把 Host ready、fixture 或历史安装状态伪装成业务授权。
- `UI-01C`：补齐 renderer contract tests，锁定导航、fixture/blocked 标识、Sage 品牌边界、reduced-motion / focus 线索、超时 fallback 与无上游/插件依赖。
- `UI-01D`：执行 focused/full test、typecheck、build、quick/strict gate、diff check、Birdview validate/render 与独立范围复审；完成后仍不暂存、不提交、不推送。

本批实际允许的文件只有 `apps/sage-shell/src/product/component-renderer.ts`、`apps/sage-shell/src/product/renderer.ts`、`apps/sage-shell/test/product-state.spec.ts` 以及对应 Birdview activity。明确不触碰 `main` / `Host` / `security` / `persistence` / v1 event schema、真实 ActionIntent、Application Service、MCP、插件、Sanbao 外部源码、package/lockfile、vendor、真实业务数据和发布物。UI-02 才评估真实 ViewState / ActionIntent adapter 与 React 或其他构建依赖；在 WT-02D Application Service 未就绪前，本批不产生业务写入。

#### UI-01 之后的阶段性 tickets（只规划，不在 revision 34 越界执行）

| Ticket | 目标 | 前置条件 | 交付与关闭门 |
| --- | --- | --- | --- |
| `UI-02` ViewState adapter seam | 将 BusinessMatter 的只读 `ViewState` 投影到当前工作台，保持 runtime、compatibility、availability、authority、actionability 分轴 | WT-02D Application Service 的 read-only port、稳定 ViewState schema、独立 UI adapter review | fixture 与 live projection 双层测试；禁止 renderer 直接读 store / Host / connection；无业务写入 |
| `UI-03` ActionIntent preview | 在界面中展示“可提交 / 被阻断 / 需确认”的 ActionIntent 预览，不执行真实动作 | WT-02D action contract、Identity/Policy 与 Compatibility preflight 有真实输入 | origin、authority、revision、idempotency、denialReason 全量显示；默认 fail closed；没有隐式 retry |
| `UI-04` C2C observation surface | 把 verified external capability 的只读观察接到能力页和事项证据页 | 正式 bridge seam、隔离 fake MCP server、C2C.2～.5 provider evidence | same-generation、分页、失效传播、零 `tools/call` 证据；没有插件启用或 mutation |
| `UI-05` first read-only business loop | 先选一个 VOC 或 Shopify ABI 只读查询，完成“事项 → 证据 → 兼容性 → 预览 → 回执” | UI-02/03、C2D real entry、C3 evidence composition、明确业务数据边界 | 独立 fixture 与受控真机各一套；失败、拒绝、过期、重试均留证；不把 fixture 当生产绿灯 |
| `UI-06` Sanbao parity hardening | 只吸收 Sanbao 的密度、导航、focus/Escape、reduced-motion、responsive 交互，不复制源码或状态 | UI-05 首闭环稳定，产品 token owner 与 accessibility review | keyboard/mobile/browser smoke；视觉差异记录；不增加外部依赖 |
| `UI-07` plugin contribution lane | 在首个 read-only 闭环后，按 candidate → descriptor → registry → adapter → preflight 顺序接入一个插件 | C2C/C2D/C3 全链路真实证据、owner approval、撤销与恢复演练 | 独立 worktree/线程、可撤销、可回滚；任何历史安装状态都不自动复用 |

阶段目标是先让 Sage 有一个“能看清事实、边界和下一步”的工作台，再让它在受控的 `ViewState → ActionIntent preview → Application Service` 链路上逐步拥有真实能力；每一阶段都要重新 checkpoint、Birdview planned/confirmed、focused/adjacent/repository gates、独立验收和 completed 记录。UI-01 完成不代表 P0-5、真实登录、MCP、插件或业务闭环完成。

### Revision 35：UI-02 ViewState adapter seam 完成，Application Service 仍未接入

本批把 UI-02 拆成可在 WT-02D 尚未落地时安全执行的 UI-02A～UI-02D：

- `UI-02A` 新增 `apps/sage-shell/src/product/view-state.ts`，定义 `sage.matter-view.v1` 的只读公开 shape，并把受信 `BusinessMatterProjection` 投影为事项身份、阶段、证据/未知/依赖计数、decision、attempt、artifact、receipt 摘要。
- `UI-02B` 让 component renderer 消费同一 ViewState shape 的显式 fixture；`projectionSource`、compatibility、authorization、availability、actionability 与 denial reason 分轴展示，fixture 默认始终 blocked。
- `UI-02C` 增加 hostile contract tests，证明 renderer-facing projection 不泄漏 `executionSnapshot`、digest、locator、resolver input 或 authority record，并拒绝没有 denial reason 的 blocked 状态和未知 action。
- `UI-02D` 通过 focused/full test、typecheck、build、quick/strict gate、diff check 与 Birdview validate/render；不接 Application Service、真实 ActionIntent、Host/store/resolver、MCP、插件或真实业务数据。

本批没有把 `SageViewState` runtime availability 替换成 BusinessMatter projection，也没有把 `/.sage/state` / `/.sage/actions` 扩展为业务命令。真正的 live ViewState 仍必须由 WT-02D Application Service 产生；真实 action 仍需等 UI-03 的 preview 合同与 Identity/Policy、Compatibility、Availability 的真实输入。当前 fixture 只证明 UI 接线形状，不证明产品闭环或生产授权。

### Revision 36：UI-03A ActionIntent preview contract 完成，提交线路仍关闭

本批把 UI-03 收敛为只读的 ActionIntent preview seam：扩展 `SageActionProjection` 以携带显式 `revisionId` 与 `actionScope`，新增 `apps/sage-shell/src/product/action-preview.ts` 的 `sage.action-preview.v1` contract，并让 component renderer 在经营事项页展示动作类型、origin、fixture/live provenance、revision、scope、授权/可用性/兼容性、actionability、denial reason、幂等键状态与 `submissionState=not-submitted`。fixture 的回答澄清、开始执行、能力重试均保持 blocked；能力重试不隐式绑定当前 revision，避免把 UI 预览误当成可执行授权。

本批没有创建 `ActionIntent` 提交函数、按钮或 endpoint，没有生成幂等键，没有 POST/fetch、事件写入、Application Service、Identity/Policy、Compatibility/Availability provider、Adapter、Host、MCP、插件或真实业务数据接线；没有修改 v1 event schema、package/lockfile、Sanbao 源码或发布物。`apps/sage-shell/test/action-preview.spec.ts` 与既有 ViewState / renderer tests 锁定缺失动作、缺失阻断理由、fixture provenance、冻结对象和 not-submitted 边界。

本批工作树仍未暂存、未提交、未推送；既有 dirty / untracked 基线保持不动。UI-04（C2C observation surface）与 UI-05（首个只读业务闭环）仍等待正式 bridge seam、C2D real entry、C3 evidence composition 与 WT-02D Application Service；下一批不得把本批 preview 读数当成真实授权或生产动作证据。

### Revision 37：WT-02D.0-ARCH Application Service 边界已落档，运行时仍未迁移

本批只以六个治理文件冻结 Electron-main Application Service 合同：它是 BusinessMatter command 与安全 projection 的唯一产品入口；目标形态由 main 精确终止 `/.sage/*`，通过窄 port 调 Host / Capability Adapter，并以 projection-read policy 与 fresh action authorization 两条独立权限线保持最小数据访问。renderer、Host、插件和模型只能提交意图或 observation，不能提交 actor、authority、compatibility outcome、matrix/digest、execution snapshot、Registry approval 或 completion。

真实 command 的完整 normative ordering 只以 [ADR-0174](../adr/ADR-0174.md) 第 4 条与 [Application Service 边界](../notes/proposed/architecture/2026-09-30-application-service-boundary.md) 第 5 节为准；它细化但不改写 ADR-0165，并保留载入前的 initial access precheck 与 target 生成后的 fresh action authorization。缺任何真实 caller binding 或 authority 时 production composition 都 unavailable-first，fixture、placeholder、Host ready、历史 `equivalent` 和测试 provider 不能补齐。

本批同时固定 service-issued operation idempotency、dispatch 前后不同的 cancellation 语义、availability retry 与业务 retry 分离、回执丢失时 `outcome-unknown` 禁止自动重放，以及稳定脱敏错误 / receipt 不冒充 `BusinessMatter.completed`。`.0.1` route / port skeleton、`.1` fixture / blocked read-only E2E 和 `.2` production command path 均未获源码授权，必须另票推进。

实际项目文件严格为 `AGENTS.md`、`docs/adr/ADR-0174.md`、ADR 索引 / 派生 ledger、Application Service Note 与本执行计划；当前 Host-owned `GET /.sage/state` / `POST /.sage/actions`、源码、测试、package / lockfile、v1 event、UI、插件、provider、真实数据和外部 action 均未修改。本批仍未暂存、未提交、未推送。

### Revision 38：WT-02D.0.1 caller-binding preflight = NO-GO，production route 仍未迁移

本批在真实 Electron 43.3.0 browser process 中完成隔离 probe。`onBeforeRequest` 能在 `protocol.handle` 前放行指定 Session / WebContents / current main frame，并取消 subframe、其他窗口、opaque frame、`Session.fetch`、main-frame navigation 与不同 partition；但 trusted 请求进入 handler 后，caller 导航、WebContents 销毁与 explicit renderer abort 都没有在 2 秒内触发 `Request.signal` abort。完整方法与读数以 [Electron caller-binding preflight](../notes/proposed/architecture/2026-09-30-electron-caller-binding.md) 为唯一事实源，规范后果以 [ADR-0175](../adr/ADR-0175.md) 为准。

因此 revision 38 只关闭预检并记录 NO-GO：`.0.1` production skeleton、route migration、Application Service、Host narrow port、provider、store、Adapter、UI action 与真实副作用均未实施。IPC / preload、Electron pin 升级或其他 transport 必须另票计划和确认；当前 Host-owned route 保持不变。

本批项目文件严格为两个隔离 probe 文件、ADR-0175、对应 Note、ADR 索引 / 派生 ledger与本执行计划；production `src/**`、package / lockfile、Electron pin、legacy 与 release 为 0 改动。本批仍未暂存、未提交、未推送。

### Revision 39：WT-02D.0.1 IPC/preload caller-binding preflight = NO-GO，production route 仍未迁移

本批在真实 Electron 43.3.0 browser process 中验证 sandboxed preload + IPC candidate。具名 read / action / cancel、direct child-frame sender guard、其他 WebContents / Session / origin、forged payload、navigation、same-document navigation、destroy、renderer-process-gone、explicit cancel 与 post-dispatch `outcome-unknown` 均取得可重复局部读数；但普通 same-origin child 能调用 `top.sageIpcProbe.beginOperation()`，main 观察到的仍是合格 current main-frame sender，并创建 operation。完整方法与矩阵以 [IPC/preload caller-binding preflight](../notes/proposed/architecture/2026-09-30-electron-ipc-caller-binding.md) 为唯一事实源，规范后果以 [ADR-0176](../adr/ADR-0176.md) 为准。

因此 revision 39 只关闭预检并记录 NO-GO：WT-02D.0.1、`.1`、`.2` 继续 blocked。将 same-origin descendant 视为同一 principal、禁止 production frame、改变 bridge / renderer 拓扑、采用其他 transport 或升级 Electron pin，均必须另票计划和确认；不能从 direct IPC 的局部正证据直接进入 production skeleton。

本批项目文件严格为三份 test-only IPC/preload 文件、ADR-0176、对应 Note、ADR 索引 / 派生 ledger 与本执行计划；production `src/**`、当前 `/.sage/*` route、Host、Application Service、provider、store、Adapter、UI、package / lockfile、Electron pin、vendor、legacy 与 release 为 0 改动。本批仍未暂存、未提交、未推送。

### Revision 40：WT-02D.0.1 single-frame caller-binding preflight = PASS（预检局部），production route 仍未迁移

用户确认本票按八文件 single-frame preflight 执行，并接受候选不变量：Sage privileged renderer 禁止 nested browsing context；出现 child 即污染当前 document generation，直到 clean top cross-document reload。本批在真实 Electron 43.3.0 browser process 中验证该不变量：main-owned frame 观察 + document generation 污染状态机 + IPC entry / durable barrier 双重核验，对 parser / dynamic / about:blank / srcdoc / data / blob / sandbox-opaque / nested / early-call-remove 全部 child 形态 fail closed；child 移除与 same-document navigation 不洗白；唯一恢复路径是 main-owned clean top cross-document reload；干净单帧 baseline 的 read / action 正常完成。control 窗口（不启用 single-frame 判定）仍复现 revision 39 的 top-bridge allow，证明 PASS 来自帧禁用判定本身。断点恢复时修复了两处 harness 缺陷（可嵌入子页 CSP `frame-ancestors`、sticky-contamination tripwire 豁免），并以污染不粘滞变异完成负控（raw child 转 no-go / exit 2、外层 test 变红）。完整方法与矩阵以 [single-frame caller-binding preflight](../notes/proposed/architecture/2026-09-30-electron-single-frame-caller-binding.md) 为唯一事实源，规范后果以 [ADR-0177](../adr/ADR-0177.md) 为准。

因此 revision 40 只关闭预检并记录 PASS（预检局部）：该不变量是本票候选，不是已采纳 production 合同。WT-02D.0.1、`.1`、`.2` 继续 blocked；production 采纳（production CSP、导航图、embedding 政策与 UX 影响）、same-origin caller principal 合并、替代 transport 或 Electron pin 变更，均必须另票计划和确认；不能从预检 PASS 直接进入 production skeleton 或 route 迁移。

本批项目文件严格为三份 test-only 文件（probe、preload、外层 spec）、ADR-0177、对应 Note、ADR 索引 / 派生 ledger 与本执行计划；production `src/**`、当前 `/.sage/*` route、Host、Application Service、provider、store、Adapter、UI、package / lockfile、Electron pin、vendor、legacy 与 release 为 0 改动。本批仍未暂存、未提交、未推送。

### Revision 41：WT-02D.0.1-FRAME-POLICY 帧禁用不变量 production 采纳（防御层落地，无 bridge）

用户逐项拍板：采纳帧禁用不变量为 production 合同；射程为骨架票（防御层先落地，不引入 preload / IPC bridge）；strict CSP 随票下发；未来嵌内容场景定为合同（独立非特权 WebContentsView，实现后置）。本批把防御层落进 production shell：`src/main/frame-policy.ts` 纯状态机（零 Electron import，Node 侧 12 例单测）+ `src/main/window.ts` 唯一 privileged 窗口工厂（显式 `webviewTag:false` / `nodeIntegrationInSubFrames:false`、window-open deny、scheme 栅栏、`attachFramePolicy` 全事件接线、`loadTrustedUrl` 唯一受信导航入口）+ `src/main/index.ts` 污染 stdout tripwire + `SAGE_DOCUMENT_CSP` 经 asset handler 下发（`default-src 'none'`，仅 inline script/style 与 same-origin fetch；CSP 是并积层，不是不变量的替代）。

真实窗口 probe（`test/support/sage-frame-policy-window-probe.mjs`，对 `tsc --build` 后的 `lib/` production 产物取证）取得关键读数：文档在 strict CSP 下功能完好（inline script 运行、inline style 生效、same-origin fetch 404）；被 CSP 拦截加载的 iframe 仍触发 `frame-created` tripwire 并污染 generation 1；child 移除后污染粘滞；`window.open` 返回 null、webview inert；**renderer 发起的顶层导航被 `will-frame-navigate` preventDefault 就地拒绝（URL 保持不变）——这是 revision 40 probe 未实测过的点**；main-owned clean reload 恢复 generation 2 trusted。负控变异（污染不粘滞）下 raw probe 转非 pass、外层 `test/sage-frame-policy-window.spec.ts` 红；恢复后回绿。验证命令：`pnpm --dir apps/sage-shell test`（41 files / 399 tests）、`pnpm --dir apps/sage-shell typecheck`、`pnpm run gate`（23/23）。完整方法与读数以 [Sage privileged renderer 帧禁用防御层落地](../notes/implemented/security/2026-09-30-sage-frame-policy.md) 为唯一事实源，规范后果以 [ADR-0178](../adr/ADR-0178.md) 为准。

因此 revision 41 只落地防御层：WT-02D.0.1 的 preload / IPC bridge、`.sage/*` route 迁移与 Application Service composition 继续 blocked；bridge 票的 IPC entry / durable barrier 必须检查 `isTrustedGeneration()` 并在 durable boundary 前重验，且须按 ADR-0174 确认 unavailable-first composition 的 authority 缺口处理后另票确认。产品 UI 引入 SPA 路由时须保持 same-document 不洗白语义。

本批项目文件：production 新增 `apps/sage-shell/src/main/frame-policy.ts`、`apps/sage-shell/src/main/window.ts`、`apps/sage-shell/test/support/sage-frame-policy-window-probe.mjs`，修改 `src/main/index.ts`、`src/product/contracts.ts`、`src/host/assets.ts`、`test/assets.spec.ts`，新增 `test/frame-policy.spec.ts`、`test/sage-frame-policy-window.spec.ts`、ADR-0178、对应 Note、ADR 索引 / 派生 ledger 与本执行计划；package / lockfile、Electron pin、vendor、legacy 与 release 为 0 改动。本批仍未暂存、未提交、未推送。

### Revision 42：WT-02D 线收口至 WT-02D.1（fixture 槽冻结 + route 单 owner + 双层 E2E）

Revision 41 之后，D 线经独立票据推进并全部落地（本计划未逐条记录，以 git 与各 ADR / Note 为唯一事实源）：WT-02D.0.1 route skeleton（[ADR-0179](../adr/ADR-0179.md)）、HOST_LIB_FILES 补全与对拍守卫（[ADR-0180](../adr/ADR-0180.md)）、WT-02D.0.2 command pipeline 步骤 2–10（[ADR-0181](../adr/ADR-0181.md)）、WT-02B.2B 真实 OIDC 登录链路及验收修复（[ADR-0183](../adr/ADR-0183.md)）。revision 38–41 的 preload / IPC bridge 路线被 0179 的 main-owned route skeleton 路线取代；本计划前述「WT-02D.0.1 blocked」条目以 revision 42 起失效。

本票 WT-02D.1（[ADR-0184](../adr/ADR-0184.md)）交付：① **route 收口**——Host 旧 `/.sage` handler、`src/adapter/` 三件套与 `SAGE_APP_SERVICE=off` 回退退场（main 唯一 owner 兑现；Host 对 `/.sage` 显式 404），传递性死代码 `src/product/state.ts` 同批删除；② **matter 槽冻结**——`SageServiceState.matter: SageMatterViewState | null`，fixture 模式经 `SAGE_FIXTURE_PROJECTION=1` 填 `createSageFixtureViewState()`、production 恒 `null` 禁止 placeholder；③ **单一装配点** `src/main/app-service.ts`（main 与实弹 probe 共用）；④ **双层 E2E**：服务级 + 真实窗口 probe（真实协议读 fixture payload、`data-projection-source` 可见、指定 Sage root 快照零写入），负控 canary 判红；⑤ 门禁合同随票修订（sage-product-boundary 退场文件 RETIRED + `ctx.get(` 全域禁；sage-service-consumption 显式 `allowEmptyRegistry` + 扫描器对工作树已删文件优雅跳过）。读数：sage-shell 54 files / 533 tests 全 PASS、typecheck 0、smoke PASS、仓根 gate 25/25。

D 链下一项 = WT-02D.2（blocked：真实 Identity / Policy、WT-02B.3 最小 `PersistableAuthorityEvidence`、C2/C3、Registry real entry、trusted clock、数据治理、idempotency / cancel / reconciliation 全部通过后才可开始）；C 链前沿 = C2C.2 bridge seam（外部阻塞，仅可例行复核）/ C2E-PMAP + C2E（可推进）。用户已排定后续顺序：C/D 线之后进入 2B 后半（identity handle → organization mapping）。

### Revision 43：C2E 线收口（PMAP.1 换装适配 + E.2 遗留合并）

C2E 线经两票落地（本计划不再重复其细节，以 git 与各 ADR / Note 为唯一事实源）：① [ADR-0192](../adr/ADR-0192.md) 内核 0.2.0-rc.2 换装后登记的全部 PMAP 源面失效，由 **WT-02C.2E-PMAP.1**（[ADR-0194](../adr/ADR-0194.md)）收口——preset=声明行模型、provider/model=`agent-default-model` 层叠行配置、`preset:set` 源包迁 `dsh-agent-preset-registry`、overlay 为组成必需层；真实 generation 双跑 7 行全 observed、零写入。② **WT-02C.2E.2 遗留合并清点**（[ADR-0195](../adr/ADR-0195.md)）：帧名称表单源化并纳入 sage-shell-pin 冻结（③，机制守替代评审守）；能力 canonical 与 C2D.1 内核核查无重叠（⑤ 关闭）；④ 被 ADR-0194 覆盖；①（default preset 运行时判定）阻塞于 Host protocol 扩展票；②（host/harness 分包 artifact 粒度）待语义裁决后重发 matrix；⑥（health/liveness 增强）阻塞于 C2C.4/.5 真实 provider；⑦（`runtimeInventory` 消费者）移交 D.2 接线；⑧（registrySnapshot 变更检测）阻塞于 C2D.2A。C 链前沿更新为：C2C.2 bridge seam（外部阻塞）/ C2D.2A registry provider / 上述 ①②⑥⑧ 的独立票。
