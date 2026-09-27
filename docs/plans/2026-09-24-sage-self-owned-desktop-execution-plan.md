---
title: Sage 自有桌面端执行方案
status: p0-3a-local-verification-complete-root-gate-existing-failures
date: 2026-09-24
---

# Sage 自有桌面端执行方案

> 决策：[ADR-0159](../adr/ADR-0159.md) · 设计树：[Sage 自有桌面壳设计树](../notes/proposed/architecture/2026-09-24-sage-self-owned-desktop-design-tree.md)

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
| `已实现（Sage）` | 自有静态 renderer + availability Adapter | P0-2 源码、测试与产品边界门禁已通过；尚未完成隔离运行时验收，且没有事项状态机。不得把 Host / DSH 现有能力算入。 | P0-3 完成隔离物化后再登记运行时证据；P0-5 才实现业务闭环。 |
| `未实现（首闭环候选）` | 创建、澄清、运行、回执、失败恢复六段 | 见下表；它们是业务闭环的最小回归输入。 | P0-5 逐段实现并记录实际证据。 |
| `不适用` | 0（尚未裁定） | 不能因“像旧桌面”就提前丢弃任何原型状态。 | 在产品范围评审后逐条注明原因。 |

| 经营事项阶段 | 原型合同候选 | 台账状态 | Sage 处理原则 |
| --- | --- | --- | --- |
| 创建 | `QDR.P13.create.empty`、`QDR.P13.create.ready`、`QDR.P01.home.workspace` | 未实现 | 改为创建经营事项，不复刻工作区即领域对象。 |
| 证据 / 澄清 | `QDR.S02.clarification.waiting`、`custom`、`submitted` | 未实现 | 保留“待回答 → 提交 → 留痕”的语义，改为事项证据链。 |
| 运行活动 | `QDR.S01.session.running`、`streaming` | 未实现 | 由 Adapter 映射可解释运行状态，不直接消费上游聊天 DOM。 |
| 审批 | `QDR.S04.scope.unexpanded` | 研究输入 | 原型仅有静态线索；必须单独设计审批授权与拒绝恢复。 |
| 产物 / 回执 | `QDR.M02.file.writing`、`QDR.A02.output.html`、`QDR.M01.reply.completed` | 未实现 | 产物绑定到事项与证据，不把一次消息完成当作业务完成。 |
| 失败 / 重试 | `QDR.S08.reply.interrupted`、`continued`、`QDR.S05.scope.unexpanded` | 未实现 / 研究输入 | 要保留失败事实、重试次数和人工接管；不把停止输出算成功。 |

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

- [ ] 定义 `BusinessMatter` 的范围、版本、证据、未知、选项、依赖、授权、动作、产物、回执和经验字段。
- [ ] 用原型合同实现六段状态：创建 → 证据 → 运行 → 澄清 / 审批 → 产物 / 回执 → 失败 / 重试。
- [ ] 将项目、任务、会话、浏览器、文件和自动化作为工作台能力接到该事项，而不是反过来让 DSH 聊天成为领域中心。
- [ ] Jev 仅以可选、审阅优先、可审计的 Judgment Adapter 接入；不作为首闭环的自动动作授权。

**通过条件：** 一条隔离测试 / 真机流程能从创建事项走到可验证回执，并能在审批拒绝、工具失败和重试中保留事实链；其余原型状态明确标为未实现。

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

P0-3A 已完成。下一步只能先以 Birdview 展示 **P0-3B 的真实旧资料导入范围**：精确来源目录、资料类别 / allowlist、回滚验收与 TCC 边界；在该范围获得明确确认前，不读取或改写真实 `~/.dsh`、当前 App、profile、资料或发布物。
