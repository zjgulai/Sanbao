# deepseek-harness 0.2.0-rc.2 升级差异总账（0.1.5-rc.2 → 0.2.0-rc.2）

> 日期：2026-10-02 · 状态：**对比总账（证据家）**——决策与方案见 [升级设计 spec](../superpowers/specs/2026-10-02-harness-0.2.0-upgrade-design.md)，施工任务见 [实施计划](../superpowers/plans/2026-10-02-harness-0.2.0-upgrade.md)。
> 输入：上游 tag `dsh-v0.2.0-rc.2`（`639ed015397290b3745d163aafe02ffee4aa3f84`，2026-09-29 发布）对照当前 pin `fb2c4b9e698e30edb738bca4cf0618587db7d203`（0.1.5-rc.2）。调查方法：上游树 diff（浅克隆内 `git diff/ls-tree/show/grep`）、npm 顶层存续矩阵（对 seed 全部 41 个依赖逐一探测——38 个 `@deepseek-ai/dsh-*` 探 `@0.2.0-rc.2`，cordis 族按自身版本线单独核）、三路并行专项差异调查（boot/host、运行时服务、上游发布注记）+ 关键接缝亲手核验。写作期间对 Sage 仓**零代码改动**；对参照检出做过一次浅 `git fetch --depth=1 refs/tags/dsh-v0.2.0-rc.2`（仅写 `FETCH_HEAD`，未建本地 ref、未动 HEAD/工作树）。
> 口径：本总账按 **Sage 消费面收窄**，不逐读上游全部新增注记（`.agents/notes` 新增 272 篇、`docs/` 新增 210 项）；未覆盖项在 §7 显式登记。**未做运行时验证**（无安装、无构建）——「装不装得上」由实施计划的 K3 用隔离根实测取证。
> 历史范式：本文件对标 [research/11](11-upstream-2.0.10-delta.md)+[research/13](13-upgrade-2.0.10-execution-plan.md) 在 2.0.10 迁移中的分工（delta 与执行方案分家）。

## 0. 一句话

这是一次**整代升级**：横跨 3 周与 0.1.6/0.1.7 中间线，`@deepseek-ai/*` 命名空间 **289 → 338** 个包（新增 59 / 移除 10 / 版本变化 271），上游桌面架构从「FD3/FD4 字节管道」整体换轨到「Node 子进程 + 共享 Web 应用 + 本机 URL」，发布纪律改为**包间精确版本对齐**，session 数据格式换代 **v3 → v4**，`settings.yaml` 全局设置退场，且 **0.1.5→0.1.7 窗口没有官方 upgrade guide**——迁移只能靠本总账反向拼装。对 Sage 而言好消息是：编译器接缝极窄（5 个被调用符号全部存活、两个关键包 src 零改动），坏消息是 **FD 传输的参照系被上游删除**（Sage 协议必须完成自有权），且 fixtures/goldens 与 PMAP 源面存在跨工作流的重锚与语义迁移。

## 1. 基线与证据

- **版本时间线**（npm publish time，`@deepseek-ai/dsh-app-boot` 读数）：0.1.5-rc.2 `2026-09-10` → 0.1.6-alpha.1 `09-15` → 0.1.5-rc.3 `09-22` → 0.1.7-rc.1 `09-23` → 0.1.7-rc.2 `09-24` → 0.2.0-rc.1 `09-28` → **0.2.0-rc.2 `09-29`**（本总账写作时 3 天新鲜度）。
- **npm 存续矩阵**：seed 的 38 个 `@deepseek-ai/dsh-*` 依赖在 `@0.2.0-rc.2` 全部存在；**唯一例外 `@deepseek-ai/dsh-code-runtime`（MISSING，已被整体删除）**。cordis 族按自身版本线存在（`4.0.4` / `group 1.0.4` / `include 1.0.9`，实测）。矩阵同时证明：`dsh-ptc-runtime`、`dsh-ptc-runtime-node`、`dsh-session-format-v3-to-v4`、`dsh-workspace-changes`、`dsh-agent-preset`、`dsh-agent-preset-registry` 在 0.2.0-rc.2 均已发布。
- **两个未发布包的 override 仍需保留**：`@deepseek-ai/dsh-type-meta` / `@deepseek-ai/dsh-user-interaction` 在 npm 依旧 404（实测），且两版本树内均无字面引用——`pnpm-workspace.yaml` 的 `npm:empty-npm-package@1.0.0` override 按原样保留（K3 隔离安装时复核无 404 即可）。
- **参照检出的落点说明**：本机证据文件（包清单 diff 脚本、三份专项报告）在 `Sage/.scratch/harness-version-diff/`（工作台，未入库）；本总账的每一条结论在下方都有树内锚点（文件路径 + 639ed01 侧行号），不依赖该工作台存活。

## 2. 版本与包面

### 2.1 计数与谱系

| 面 | old（0.1.5-rc.2） | new（0.2.0-rc.2） | 备注 |
|---|---|---|---|
| `@deepseek-ai/*` 命名空间 | 289 | 338 | 新增 59 / 移除 10 / 版本变化 271 |
| 全仓 package.json 路径 | 297 | 351 | 含 fixtures/templates |
| cordis 族 | cordis `4.0.2` / group `1.0.2` / include `1.0.7` | cordis **`4.0.4`** / group `1.0.4` / include `1.0.9` | 独立版本线；另有 loader `1.0.5`、hmr `1.0.19`、timer `1.1.6`、schemastery `3.18.4`、cosmokit `1.8.5` |
| engines / packageManager | node `^22.19.0 \|\| >=24.0.0` / pnpm `11.7.0` | **不变** | clean |
| tag 机制 | `dsh-v` 前缀、一个 family 一个共享版本 | **不变**（`families.ts`：仅 publish set 变化） | clean |

### 2.2 移除包（10）与去向

| 移除 | 去向 / 后果 |
|---|---|
| `dsh-code-runtime`、`dsh-code-runtime-worker-thread` | → `dsh-ptc-runtime` + `dsh-ptc-runtime-node`（§4.5） |
| `dsh-workflow-worker-thread` | → `dsh-workflow-ptc`（§4.6） |
| `dsh-settings-file` | **非换名**：文件持久化拆给新包 `dsh-config-editor`；设置服务改 `SettingsForms`（§4.3） |
| `dsh-agent-presets` | → `dsh-agent-preset` + `dsh-agent-preset-registry`（web-app 侧） |
| `dsh-experimental-agent-team-web-profile` | 双包合并的牺牲品：**选中它的旧 profile 启动直接失败、无自动改写、无 guide**（Sage seed 未选中） |
| `dsh-e2b`、`dsh-fs-e2b`、`dsh-subprocess-e2b` | e2b 家族整体退场 |
| `dsh-experimental-code-runtime-python` | → `dsh-experimental-ptc-runtime-python` |

（另有 `dsh-tool-present` 路径从 `fs/` 迁至 `deliverables/`，包名不变。）

### 2.3 与 Sage 相关的新增（摘）

`dsh-ptc-runtime(-node)`、`dsh-session-format-v3-to-v4`、`dsh-workspace-changes`、`dsh-agent-preset(-registry)`、`dsh-config-editor`、`dsh-hmr`、`dsh-plugin-manager`、`dsh-otel`、`dsh-mcp-resources`、`dsh-deepseek-account(-platform)`、`dsh-llm-deepseek-account`/`dsh-llm-deepseek-api-key`、ssh 家族 ×4、`dsh-browser-use`/`dsh-computer-use`、`dsh-util-code-language`、`dsh-lazy-require`、`dsh-office-to-pdf`、`dsh-skill-office`、`dsh-tool-workspace-dependencies`、API 控制器 ×3（account/job/terminal）。

### 2.4 发布纪律变化（对消费方是契约）

- **包间精确版本**：`workspace:^` → `workspace:*`（vendor/native 用 `workspace:~`），发布后表现为「精确 pin」——官方原话：*published DSH peers require the matching release*（`.agents/notes/implemented/process/2026-09-22-workspace-release-ranges.md`）。**Sage 必须整组对齐，不允许混装 release**（与 `sage-shell-pin` 门禁的两侧同版要求同向）。
- **实验包默认全公开**（白名单翻转，`2026-09-12-publish-all-experimental-packages.md`）；但默认产品依赖闭包显式隔离实验包（`verify-default-product-isolation`）。
- **可选 bundle 清单**（Agent Teams / voice / auto-review / schedule）：安装的运行时依赖、默认关。

## 3. 执行链与传输（boot / host / bundle）

### 3.1 FD3/FD4 传输被上游整体删除（结构级）

- `apps/desktop-host/src/wire.ts`（6 个 framing 常量所在）在 0.2.0 **整文件删除**；全仓已无 `DESKTOP_REQUEST_PIPE_FD` / `0x44534833`（`git grep` 零命中）。
- 上游新架构：desktop 以「Node 子进程跑共享 Web 应用 + 本机 HTTP URL（默认端口 `19387`）+ Node IPC 做生命周期」（`apps/desktop/src/host-process.ts`）；`apps/desktop/src/host-protocol.ts` 由 215 行帧协议缩为 4 行 release 元数据（`DESKTOP_HOST_PROTOCOL_VERSION = 4`，语义改为生命周期代数）。
- **对 Sage**：Sage 的 FD3/FD4 管道两端（main 侧 `host-process.ts` 与 host 侧 `src/host/`）全部自持，运行时无需跟随；断的只是**门禁参照源**与 ADR-0139「移植上游 desktop-host」的标注。处置见 spec D2。

### 3.2 app-boot API 与 boot() 语义

- **移除**：`watchUserPatches` / `UserPatchWatchOptions` / `assertEntriesLoaded` / `assertEntriesActivated` / `healProfilesModuleFallback` / `DEFAULT_PROFILE_PATCH_RELOAD`（profile 级 `patchReload` 契约退场——0.2.0 的 `profile.ts` 不再消费该字段；**Sage seed 的 `dsh.profile.patchReload: "live"` 需在 K3 核对为新忽略还是判红**）。
- **新增/替换**：`reconcileProfilePatches`、`StartupError`、`auditStartupEntries`（仅 7 个 required id 判致命，其余警告）、`prepareProfileEntries` / `prepareProfilePatches`（compatibility-preflight）、`sanitizeProfile`、`evaluatePluginCompatibility`、`readProfilePatches`、config-schema 投影面。
- **Sage 实际调用面全部存活**（亲手核验）：`boot` / `loadLayeredEnv` / `loadProfileDirectory` / `loadOverlayPatches` / `composeEntries` 五个符号在 0.2.0 均导出且**签名不变**；`boot()` 参数形态不变（`binName, absoluteConfigPath, patches?, prepare?, bareModuleBaseUrl?`），新增内部 startup 日志收集与 activation audit（`auditStartupEntries` 在 loader settle 后跑，失败抛 `StartupError` 并携带 startup 日志）。
- **profile 准入收紧**：DSH peer 范围强校验 + `compatibility.json` 豁免；不合格 bundle **跳过并记 `skippedBundles`**（不再抛错）；`dsh.bundle.patch` 支持有序文件数组（web-app 借此拆出 `presets/*`）。
- **新 `profileContext` 行门禁**：base 的 `settings`/`hmr`/`config-editor`/`plugin-manager`/`deepseek-account` 等行挂 `disabled: !!js "!ctx.get('profileContext')"`——**非 dsh CLI 启动器（含 Sage 自组 profile）不提供该服务时这些行全部自动关闭**。对 Sage：默认面收窄（Sage 不消费这些 UI/账号面）；K6 需实测确认行面与 seed 期望一致。

### 3.3 bundle 成员 diff

- **bundle/base**：84 → 93 依赖。移除 `cordis-plugin-hmr`、`dsh-llm-deepseek`、`dsh-settings-file`、`dsh-workflow-worker-thread`；新增 `dsh-hmr`、`dsh-authorization`、`dsh-compaction-image-offload`、`dsh-config-editor`、`dsh-deepseek-account-platform`、`dsh-llm-deepseek-account`、`dsh-llm-deepseek-api-key`、`dsh-mcp-resources`、`dsh-otel`、`dsh-plugin-manager`、`dsh-ptc-runtime-node`、`dsh-settings`、`dsh-workflow-ptc`。行为项：spill-policy `maxInlineBytes` → `maxInlineTokens: 12500`；`tool-ralph` 默认 `disabled: true`；telemetry 域名变更。
- **bundle/web-app**：80 → 127 依赖。移除 `dsh-agent-presets`、`dsh-client-ui-schedule`、`dsh-code-runtime-worker-thread`；新增约 51 项（API 控制器、`dsh-terminal(-bash)` 与 `tool-*` 工具栈、client UI settings 拆件、`dsh-persona`/`dsh-plan-mode`/`dsh-office-to-pdf`、`dsh-tool-cordis`、`dsh-plugin-manager`、`dsh-skill-filesystem`、`dsh-workflow-ptc`、`dsh-workspace-changes` 等）。**Sage renderer 自持 document、不消费上游前端资产**（`src/host/assets.ts` 注释即契约），web-app 增量对 Sage 产品面基本惰性；但仍需 K6 复核 overlay 面。
- **overlay 有效性（亲手核验）**：Sage overlay 引用的 8 个插件 id（`web-startup`/`webserver`/`web-runtime`/`client-hmr`/`open-in-app`/`ui-open-in-app`/`directory-picker`/`connection`）在 0.2.0 的 bundle 定义中**全部存活**；两个 insert 包名（`dsh-host-directory-picker-browse`、`dsh-client-ui-directory-picker-browse`）在 0.2.0 均存在。

### 3.4 clean（已核验无变化）

`launch-environment` 整包 src 零 diff；`cmdline` src 零 diff；`home-paths` 解析规则不变；`engines`/`packageManager`/workspaces globs 不变；`webserver` 导出面不变；`loadOverlayPatches` 函数体逐行等价。

## 4. 运行时服务面

### 4.1 connection（host↔renderer）

- RPC handler **签名 breaking**：`ConnectionRpcHandler` 增第 4 参 `peer: PeerScope`，返回改 `ConnectionRpcHandlerResult`（`{ok:true;value;attachments?}`）；`HostConnectionHandle` 新增 `admit()`；成功结果可携带 **multipart 二进制附件帧**（`packages/client/connection/src/rpc.ts:127`、`:213-222`）。
- 新 Cordis 事件 `connection/request`（waterfall，bridge 前拦截共享 API 请求）；新 `OperatorPeer`（scope 化身份）。
- 浏览器 fixture 载体整包删除（`src/client/fixture.ts` 4037 行 + `?fixture` 分支），改显式组合入口 `installConnection(ctx, options)`。
- 浏览器兜底 `authenticatedUrl()` 不再归零 path/search/hash（保留挂载路径），303 `Location: /` → `./`。

### 4.2 client modules / ui-slots / ui-primitives（renderer 参照面）

`clientModuleHost` 服务改名 `clientModules`；新增 `ClientEntries` 对账面；`ui-slots` 新增 **Component Factory 一等模型**（`registerFactory`/`renderFactorySlot`/live 拓扑）；`ui-primitives` 批量变动（`OnboardingSurface` 迁出、`Menu` 拆分、图标双尺寸导出、新增 `SegmentedControl`/`SettingsForm` 家族等）。**对 Sage 自持 renderer 无直接依赖**，登记为后续「Sage UI 是否消费上游 client 栈」研究输入。

### 4.3 settings

`dsh-settings-file` 整包删除；`SettingsProvider`/`installSection`/`SettingsSectionHooks`/`SettingsRegisterOptions` 删除，`dsh-settings` 重写为 **`SettingsForms`**（直接投影各 profile entry 的 Config 字段；`SettingsConflictError`、`SettingsPathOp`）。`$DSH_HOME/settings.yaml` 在 Loader 落定后**一次性导入** active profile 的 `cordis.patch.yml` 并改名 `settings.yaml.imported`；旧 section 按映射表落新 entry id（`ui-developer-tools`→`ui-settings`、`ui-onboarding`→`ui-settings-general`）。写路径改由 `dsh-config-editor`（新包）承接。

### 4.4 session（数据格式 v3 → v4）

- writer 换代：`SESSION_FORMAT_VERSION = 4`；新包 `dsh-session-format-v3-to-v4`（`dsh.sessionFormatMigration` 声明，v2→v3→v4 迁移链）。
- 关键转换：`tool/result` 的 `role: 'user'→'tool'`、`toolCallId`/`isError` 上移、wrapper 拆除；未知 tag 命名空间化 `plugin:<原 type>`；**父会话迁移需要子会话证据**（`createStage()` 无 `childFacts` 即拒绝，空数组为显式声明）；带 `deferLoading` 的请求工具定义拒绝迁移。
- 工具：`pnpm run migrate:sessions-to-v4 [--sessions-dir]`（默认 `~/.dsh/sessions`），产物为「与历史 generation 并列的 V4 successor」，不改写已提交代；**旧 reader 拒绝新日志**。
- 发布状态读法：`latestReleasedVersion: 3` 但文档明确「RC 发布即产生已发布格式义务」——按 0.2.0-rc.2 为**首个 V4 已发布格式**对待。

### 4.5 code-runtime → ptc-runtime（包整体替换）

| 0.1.5 | 0.2.0 | 关键差异 |
|---|---|---|
| `dsh-code-runtime`（`ctx.codeRuntime`，`CodeRuntime` 抽象类） | `dsh-ptc-runtime`（`ctx.ptcRuntime`，`PtcRuntime`） | 新增 `resolve(request) → PtcRunSpec` 两段式；`CodeRun*` → `PtcRun*`；`language/isolation` 降为诊断描述符 |
| `dsh-code-runtime-worker-thread`（Node worker 线程） | `dsh-ptc-runtime-node`（`NodePtcRuntime`） | **每次调用起全新受管 Node 进程** + Session 文件沙箱；新增 timeout/输出/代际等配置面 |
| bundle 行：web-app/headless 各自挂 worker | base 统一挂 `ptc-runtime → dsh-ptc-runtime-node` | 挂载点归一 |

Sage seed 直钉 `dsh-code-runtime@0.1.5-rc.2`（`apps/sage-shell/seed/package.json:32`）→ 替换为 `dsh-ptc-runtime`（worker 由 base bundle 传递）。

### 4.6 workflow

`dsh-workflow-worker-thread` 删除 → `dsh-workflow-ptc`（脚本在 PTC Node 进程内运行 guest program；**引擎不再有整体运行时限**；load 时拒绝非 TypeScript PTC provider）；`dsh-tool-workflow` 新增 `run_in_background`（默认 true，注册为 `ctx.jobs` 的 job）；`dsh-workflow` seam 结构（`WorkflowRun/WorkflowResult`）不变。

### 4.7 mcp / credentials / hooks / skill / interaction

- **mcp**：SDK 换 `@modelcontextprotocol/client@2.0.0`；工具清单改 SDK 聚合分页；新导出 `createMcpToolDefinition`；**核心工具定义 API `finalizeContent` 改名 `projectContent`**（`packages/core/tools/src/index.ts:246`）；新包 `dsh-mcp-resources`。
- **credentials**：`dsh-credentials` seam 与 `credentials-local` 逻辑**零改动**（resolve/set/describe 契约不变）；`dsh-authorization` 新增 `commit(record)`；新包 `dsh-deepseek-account(-platform)`（账号登录/平台会话）。
- **hooks**：`runHook` 改吃 `Pick<ShellExecutor,'resolve'|'execute'>`（最小适配）；wire 编解码不变。
- **skill**：`SkillSummary.path` 上移、磁盘路径 realpath 归一；frontmatter 契约与目录扫描不变。
- **interaction**：user-questions 大扩（定时等待 `askTimed()`、会话投影、root-only 限制）；permission-presets 重做（`TypertRemoteService`、删 settings 命名空间、新增 `AUTO_PRESET='auto'`）；user-approval 消息 source 形状改 `{kind:'user-approval'}`（持久化 source 变化）。

### 4.8 clean（已核验无变化）

`sdk/protocol` 全部 src **wire 零改动**；`sdk/client`/`sdk/server` 协议面不变（server 内部换装 `dsh-llm-deepseek-api-key`）；`credentials` seam；`client/store` 行为；`hook-protocol` codec；`session-format` v0→v1/v1→v2/v2→v3 迁移 spec；`workflow` seam 结构；`mcp-client` config 字段名与工具命名规则。

## 5. 数据、配置与默认行为

- **持久化变更制度化**：上游新增 `docs/persistence-changes/`（每次持久化类型变更登记）+ AGENTS.md 强制规则（破坏性变更必须写 upgrade guide）。**0.1.5→0.1.7 窗口没有 guide**（`docs/upgrade-guide/` 自 v0.1.7-rc.2 才建立，仅 2 条），不要以 guide 数量推断破坏性变更数量。
- **profile 模块解析规则规范化**：ancestor chain + 拦截层 `$DSH_HOME/profiles/node_modules`；升级会**一次性清理 0.1.5 时代写入 profile 的旧投影目录**（`.dsh-module-fallback/node_modules` symlink）。
- **隐私相关默认行为翻转**：`session-log-deepseek.Config.enabled` **默认 true**（旧为 opt-in；上传含 message 文本、工具参数与结果、workspace 路径）；新增 OTel 与 client product analytics；遥测域名变更。→ Sage 产品默认面需显式决策（spec §3.7）。
- **可选 bundle**：Agent Teams / voice input / auto-review / schedule 为「安装的运行时依赖、默认关」；browser-use/computer-use provider 保持显式安装（约 85MB / 21 包不进默认图）。

## 6. Sage 骨架影响面（第一性原理）

| 面 | 结论 | 证据 | 处置 |
|---|---|---|---|
| 编译面（src import） | 仅 4 个运行时包 + cordis 族被 import；5 个调用符号全存活、签名不变；`launch-environment`/`cmdline` src 零 diff | §3.2/§3.4；`src/host/composition.ts`、`src/host/index.ts` | K3/K4 |
| host 移植面 | 两端自持，运行时无需跟随上游换轨；参照系消失 → 协议自有权 | §3.1 | K2（ADR） |
| overlay | 8 个 id 全存活；insert 包存在；新增 `profileContext` 门禁行面 | §3.3 | K6 复核 |
| seed | `dsh-code-runtime` 替换；`patchReload` 字段待核；两侧同版纪律 | §2.2/§3.2/§4.5 | K3 |
| fixtures/goldens | 触点：`test/{protocol,host-entry,host-process,materialize,compatibility,runtime-inventory,runtime-inventory-pmap,external-capability}.spec.ts`、`test/support/runtime-inventory-fixture.ts`（已随 7256f4f 入库，C2E.2 收口件）、`test/fixtures/profile*/node_modules/@deepseek-ai/dsh/package.json` ×2 等 20+ 处版本字符串，其中 `runtime-inventory.spec.ts` 的 canonical golden 与 C2E.2 的 13 条冻结字面量 golden（四文档 + 七摘要 + 稳定对）含 `harnessVersion` 冻结值 | grep 全量（§附录） | K5（golden 用真实生产者重算） |
| PMAP 源面 | `dsh-agent-presets/presets` 路径随包删除失效；`settings.yaml` 被一次性导入改名 → 静态读路径语义迁移 | `src/main/runtime-inventory-pmap.ts:51,55` vs §4.3/§2.2 | K7（**与 C2E.2 语义交叉**） |
| 门禁 | `pin-consistency`（K1）、`sage-shell-pin`（K2/K3）、`sage-shell-quality`（K4）、docs 门 | gate --list 24 项 | K1-K5 |
| 与在跑会话交叉 | **7365c577（C2E.2）已于 2026-10-02 收口**（origin/main=`7256f4f`、ADR-0191；其 4 个新/改文件已入库，K5/K7 对它的阻塞**已解除**，重锚射程须覆盖其 13 条 golden）；ddd80099（UI 接线）仍在跑：其 appservice/renderer 面与升级面基本不相交，但 **seal 开工前置仍为「两会话均收口」**（用户 2026-10-02 决策） | git log/status 实测 2026-10-02 | spec §4 |

## 7. 明确未做 / 登记

- 未逐读上游 `.agents/notes` 全部 272 篇新注记与 `docs/` 210 项——按「shell 消费方」关键词筛读；未覆盖项以包面/接口面 diff 兜底。
- 未运行任何安装/构建/测试（本轮交付为文档）；「依赖闭包可解」不视为已证明——K3 隔离装取证。
- `apps/desktop`（上游自家壳）只作参照，Sage 不消费其任何行为；legacy 链（`vendor/dsh-desktop` fork、旧 DMG 发布、旧 profile）不在本轮射程。
- Windows 专属变化（EV 签名、Wine gate、ACL）未评估；`packages/*` 二开插件的 `peerDependencies` 规则体检（`dsh-scope`/`dsh-mcp-client` 等宿主运行时包）与外置 `file:` tgz 老 pin（`dsh-wanzh-hulian` 等 3 包）登记为后续票（spec §8），不阻塞内核换装。
- `dsh-desktop.pin` 的 `harness-runtime-source` 行（legacy fork 的 0.1.5-rc.2 物化）与旧 DMG 链**不在本轮更新**——Sage 产品线运行时以 seed/npm 为准（K1 只动 `harness-submodule` 与 `checked-at`）。

## 附录：fixtures/版本字符串触点全量（2026-10-02 grep）

`apps/sage-shell/test/` 内 `0.1.5-rc.2` 引用：`protocol.spec.ts:153`、`host-entry.spec.ts:44`、`host-process.spec.ts:42,92`、`materialize.spec.ts:338`、`compatibility.spec.ts:120,1047`、`runtime-inventory.spec.ts:37`（**canonical golden，含 `harnessVersion`**）、`runtime-inventory-pmap.spec.ts:57,58,100,118`、`runtime-inventory-provider.spec.ts:157,167,203,210`（已随 7256f4f 入库）、`external-capability.spec.ts:88,126,141`、`test/support/runtime-inventory-fixture.ts:40,43,44,45`（已随 7256f4f 入库）、`test/fixtures/profile*/node_modules/@deepseek-ai/dsh/package.json` ×2。**golden 重锚必须用真实生产者重算，禁手改字面量。**
