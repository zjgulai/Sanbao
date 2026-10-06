# deepseek-harness fb2c4b9e → 639ed01（0.1.5-rc.2 → 0.2.0-rc.2）boot / host / 执行链 逐项差异报告

> 只读调查。对照仓：`/Users/lute/project/Sage/vendor/dsh-desktop/deepseek-harness`（浅克隆，未 fetch、未改 ref）。
> 基线 `fb2c4b9e`，目标 `639ed015397290b3745d163aafe02ffee4aa3f84`（tag `dsh-v0.2.0-rc.2`）。
> 行号锚点一律指向 639ed01 侧（Sage 侧锚点除外，另行注明）。整体规模：6098 文件变更；本射程 469 文件 / +49243 / −10725。
> 分类：**breaking**（调用方必须改）/ **需迁移**（不改会静默降级或丢失能力）/ **行为变化（兼容）** / **无变化**。

---

## 0. 结论速览

| # | 项 | 分类 |
|---|---|---|
| 1 | `apps/desktop-host/src/wire.ts` 整文件删除；FD3/FD4 字节管道协议消失，改用 Node IPC + 本机 HTTP URL | **breaking**（对以 wire.ts 为参照的协议实现）；需迁移 |
| 2 | `DESKTOP_HOST_PROTOCOL_VERSION` 语义改为“桌面 release 生命周期代数”，3 → 4，位置迁至 `apps/desktop/src/host-protocol.ts` | **breaking（语义）** |
| 3 | bundle/base 的 `hmr`/`config-editor`/`plugin-manager`/`settings` 等行新增 `!!js "!ctx.get('profileContext')"` 门禁 | **需迁移**（不提供 profileContext 的宿主会丢失 settings/hmr 等） |
| 4 | app-boot 启动审计由“任一启用条目未激活即失败”改为“仅 required 白名单致命，其余警告” | **行为变化（不兼容语义）** |
| 5 | `watchUserPatches`/`UserPatchWatchOptions` 删除 → `reconcileProfilePatches`；`patchReload` 概念整体退场 | **breaking（API/契约）** |
| 6 | profile 兼容性准入（DSH peer 校验 + `compatibility.json` 豁免 + `skippedBundles` 跳过而非失败） | **需迁移** |
| 7 | `assertEntriesLoaded`/`assertEntriesActivated`/`healProfilesModuleFallback`/`DEFAULT_PROFILE_PATCH_RELOAD` 等 API 删除 | **breaking（API）** |
| 8 | bundle 清单：base ±13/−4 包；web-app ±51/−3 包；`dsh.bundle.patch` 支持有序文件数组 | **需迁移** |
| 9 | api-gateway 新增双向 uplink（`item`/`end` 帧、`gateway/uplink-overflow`/`gateway/protocol`、`RemoteStreamHandle`） | **行为变化（向后兼容）** |
| 10 | gateway `TypertGatewayWireStream.open` 签名加参、`TypertGateway` 加 `hasLiveClient()`、`PeerScope` 引入 | **breaking（接口实现方）** |
| 11 | plugin-inventory `AgentPresetPluginGroup.trust` 删除；新增 `meta`/`managementAvailable` | **breaking（类型）/ 行为变化** |
| 12 | frontend-static `<base href="/">` → `"./"`；webserver multipart 响应不再 gzip | **行为变化（兼容）** |
| 13 | launch-environment / cmdline 源码零变化；engines 不变（`^22.19.0 \|\| >=24.0.0`） | **无变化** |

---

## 1. apps/desktop-host（关键项）

### 1.1 文件级变化

- `D apps/desktop-host/src/wire.ts`（184 行整文件删除）
- `D apps/desktop-host/config/desktop.cordis.patch.yml`（34 行删除；宿主不再自持桌面 patch 文件）
- `D→A` `apps/desktop-host/src/index.ts`（671 行变更；旧 122→… 新仅 122 行且**无任何 export**）
- 新增：`src/cli.ts`、`office-engine.ts`、`office.ts`、`platform-session.ts`、`quit-inspection.ts`、`update-tasks.ts`、`windows-cli-signals.ts`
- `package.json`：`"private": true`（**不是 npm 包**），`files: ["lib/index.js","lib/cli.js"]`

### 1.2 被删除的 6 个参照常量（Sage `protocol.ts` 的来源）

旧 `wire.ts`（fb2c4b9e 侧）导出/持有：
`DESKTOP_HOST_PROTOCOL_VERSION=3`(:4)、`DESKTOP_REQUEST_PIPE_FD=3`(:7)、`DESKTOP_RESPONSE_PIPE_FD=4`(:10)、`DESKTOP_PIPE_CHUNK_BYTES=64*1024`(:13)、私有 `FRAME_MAGIC=0x44534833`(:15)、`FRAME_HEADER_BYTES=13`(:16)、`MAX_CONTROL_PAYLOAD_BYTES=1MiB`(:17)、`DesktopHostRequestFrame`(:32)、`encodeDesktopResponseStart/Data/End/Error`(:83/:95/:100/:105)、`DesktopHostRequestDecoder`(:110)。

Sage 侧镜像（只读引用，未受本次上游删除影响）：`/Users/lute/project/Sage/apps/sage-shell/src/protocol.ts:6`（version=4，Sage 自有编号）、`:9` FD3、`:12` FD4、`:15` FD5（Node IPC）、`:18` 64KiB、`:20` `FRAME_MAGIC=0x44534833`、`:21` 13 字节头、`:22` 1MiB。
→ 上游 0.2.0 在 TS 源码内已**完全不含** `PIPE_FD/PIPE_CHUNK/FRAME_MAGIC/44534833`（全仓 grep 仅命中无关 Python 文档）；Sage 的管道帧实现从此是**独立发明，无上游可对齐**。

### 1.3 传输语义变化（最重要）

- 旧：Electron 壳 fork 子进程，`stdio: ['ignore','pipe','pipe','pipe','pipe','ipc']`（fb2c4b9e `apps/desktop/src/host-process.ts:112`），FD3 收请求帧、FD4 发响应帧；ready 帧 = `{type:'ready', protocolVersion, dshVersion}`（旧 `index.ts:409`）。
- 新：`stdio: ['ignore','pipe','pipe','ipc']`（639ed01 `apps/desktop/src/host-process.ts:200`）；宿主**启动一个本机 Web 服务**并把 URL 报给壳：
  - `apps/desktop-host/src/index.ts:6` `import { runProfile } from '@deepseek-ai/dsh/profile-boot'`（来自 `@deepseek-ai/dsh` 的 `./profile-boot` 子路径，`apps/cli/package.json` exports）
  - `:25-31` `runProfile({ ..., profile: 'desktop', args: ['--no-open','--port','19387'] })`——**端口 19387 硬编码**
  - `:104` `process.send({ type:'ready', url, injections: ctx.webServer.collectIndexInjections() })`
  - `:117` `{ type:'fatal', message, diagnostic }`（`diagnostic` 为 `util.inspect` 截断至 64KiB，`:108`）
  - 壳侧校验 URL 必须为 loopback（`host-process.ts:75-77`），ready 只带 `url`（`:9-10`、`:212`）
- IPC 生命周期消息（`process.send`/`on('message')`）现为：`shutdown`→`shutdown-complete`(:55-57)、`quit-inspection`(:62-76)、`update-tasks` inspect/lock/unlock(:78-88)、`platform-session`(:101)。
- `DESKTOP_HOST_PROTOCOL_VERSION` 迁至 `apps/desktop/src/host-protocol.ts:4`，值 **4**，注释改为 “Lifecycle protocol generation recorded in Desktop release metadata”——不再是管道帧版本。
- 旧导出 `runDesktopHost`(旧 :278)、`DesktopHostFetchCommand`、`DesktopHostController`、`DesktopHostEvent` 全部消失；新 `index.ts` 无 export，仅 `import.meta.main` 自执行。

### 1.4 新增宿主能力（0.2.0 侧）

`cli.ts:1-40`：打包 CLI 入口（`dsh.cmd`/`dsh` 脚本指向 `lib/cli.js`），`runCli({ manageDesktopProfile: true, packageManager: { ELECTRON_RUN_AS_NODE } })`；`office-engine.ts`：注册 Node module hooks 解析打包 Office 引擎；`quit-inspection.ts`/`update-tasks.ts`：退出前可中断任务/定时任务检查；`platform-session.ts`：把账号 provider 会话经 IPC 发给壳（不上送凭据到 renderer）。

---

## 2. packages/boot/app-boot（@deepseek-ai/dsh-app-boot）

### 2.1 导出 API（639ed01 `src/index.ts`）

新增导出：`readProfilePatches`、`resolveTelemetryPatch`、`ProfileContext`、`ProfilePnpmInvocation`(:20)、`sanitizeProfile`(:21)、`getDshRuntimeVersion`/`evaluatePluginCompatibility`/`pluginCompatibilityWarning`/`PluginCompatibility`(:22)、`PROFILE_COMPATIBILITY_FILENAME`/`readProfileCompatibility`/`readProfileVersionExemptions`/`setProfileVersionExemption`(:23-26)、`prepareProfileEntries`/`prepareProfilePatches`(:28)、`readPluginMeta`(:29)、`generateConfigSchema`/`ConfigSchemaDump`(:30)、`createConfigProjector`/`LOADER_EXPRESSION_SCHEMA`(:31)、`isNativeConfigSchema`(:32)、`readProfilePlugins`/`reconcileProfilePlugins`/`writeProfileBundles` 与类型(:35-38)、`PluginPackages`/`PluginPackage`(:85-89)、`reconcileProfilePatches`(:273)、`StartupError`(:801)、`auditStartupEntries`(:925)、`FailLoudEvent`(:588)。
profile.ts 导出集变化(:56-85)：**删除** `DEFAULT_PROFILE_PATCH_RELOAD`、`healProfilesModuleFallback`、`ProfileModuleFallbackOptions`；**新增** `OPTIONAL_BUNDLES`、`bundlePatchFiles`、`bundlePatchPaths`、`createRuntimeResolution`、`removeLinkProjections`、`reportSkippedBundles`、`SkippedBundle`、`LinkedRoot`、`RuntimeResolution*`。`DEFAULT_PROFILE_BUNDLES` 仍为 `['@deepseek-ai/dsh-base']`（`profile.ts:203`）。
**删除**：`watchUserPatches`/`UserPatchWatchOptions`（旧 :228/:250）、`assertEntriesLoaded`/`assertEntriesActivated`（旧 :688/:722；全仓 0 引用）。
新模块级声明：`Context.dshHomePath`（保留）与事件 `'app-boot/config-reload'`（`index.ts:48-55`）。
包 `package.json` 新增子路径导出 `./worker/profile-resolution-bootstrap`；新增依赖 `ajv`、`semver`、`@eslint-community/regexpp`、`node-addon-require-builtin`。

### 2.2 boot 阶段与失败策略（行为变化）

- `boot()`(:972) 签名不变（5 参），内部新增：启动日志收集器（warn/error 记录挂到 StartupError）、`stage` 双标签、最深 cause 遍历防环。
- 审计策略变更：旧 `assertEntriesActivated` 对**任何**启用未激活条目抛错；新 `auditStartupEntries`(:925) 仅对 `requiredStartupEntryIds`(:746-754 **`agent-loop`/`webserver`/`modules`/`connection`/`headless-runner`/`acp`/`sdk-jsonrpc-server`**)+bootstrap Include 抛 `StartupError`(:801)，其余仅 stderr 警告。required 条目缺失/显式 disabled 不影响启动。README 给出完整失败矩阵（`README.md` “Startup and reload failures” 一节）。
- 禁用表达式抛错 = 条目失败（不是 disabled）；卸载时不再重复 required 审计。

### 2.3 profile 装载与准入（新增）

- `bundlePatchFiles`/`bundlePatchPaths`（`profile.ts:48-68`）：`dsh.bundle.patch` 现可为**有序字符串数组**。
- `loadProfileDirectory`（`profile.ts:650-686`）：bundle 解析/清单/兼容性/补丁加载失败 → 记入 `skippedBundles` 并**继续**（不再抛错）；`reportSkippedBundles`(`:106`) 每次启动打印一次。manifest 与用户 patch 错误仍抛。
- 兼容性：`getDshRuntimeVersion`（`plugin-compatibility.ts:44`）对每个插件的 DSH peer 范围做单版本校验；豁免文件 `compatibility.json`（`profile-compatibility.ts:10`，`readProfileCompatibility:62`、`readProfileVersionExemptions:99`、`setProfileVersionExemption:113`）。`prepareProfilePatches`/`prepareProfileEntries`（`compatibility-preflight.ts`，187 行）在组合边界拒止；被拒普通行变 `disabled: true`。
- `loadProfile` 中 `removeLinkProjections` 取代旧 `healProfilesModuleFallback`（`profile.ts:717-719`）；运行时解析改为“从安装与 bundle 依赖图计算单一 runtime resolution，经 Node ESM/CJS resolver 安装，不再建 fallback 链接”。
- `sanitizeProfile`（`profile-sanitize.ts:18`）：重命名 profile `cordis.patch.yml` 为 `.bak-<时间戳>` 并恢复 bundle 列表，供桌面原生致命恢复使用。
- `patchReload` 整体退场：`DshProfileManifest` 只剩 `bundles?: string[]`（`packages/util/package-manifest/src/types.ts:74-77`），无 `patchReload` 字段。**含 `patchReload` 的存量 profile manifest 不会报错，该键被静默忽略**（读取路径 `manifest.dsh?.profile?.bundles ?? []`）。
- 重载：`reconcileProfilePatches`(`index.ts:273`) 取代 watchUserPatches——由调用方重算整组补丁后再次提交，比对“新增失败”并 `emit('app-boot/config-reload')`；不再由 app-boot 监听单文件。

### 2.4 新配置/元数据导出

`config-schema/`（新增 7 文件：collect/document/index/native/pattern/projector/types，projector.ts 455 行）：`generateConfigSchema` 产出 JSON Schema 2020-12，配 `--dump-config-schema`。`package-meta.ts:1-172`：`readPluginMeta` 读取 `package.json` locale/icon 显示元数据（不 import 插件）。`profile-resolution/resolver.ts`（934 行）为运行时解析实现。

---

## 3. packages/boot 新增包与 cmdline

| 包 | 状态 | 进入 bundle/base？ | 公开面 |
|---|---|---|---|
| `@deepseek-ai/dsh-hmr`（`packages/boot/hmr`） | 新增（590 行 index + watch-config） | **是**（base deps；`cordis.patch.yml:28` 行 `id: hmr` 改指它，替换 `@deepseek-ai/cordis-plugin-hmr`） | `HmrConfig`(:51)、`Reload`(:80)、default `Hmr`(:590) |
| `@deepseek-ai/dsh-config-editor` | 新增 | **是**（base deps；`:97` 行 `id: config-editor`） | `ConfigEditor`(:26)、default(:157)；`static inject=['loader','profileContext']`(:27) |
| `@deepseek-ai/dsh-plugin-manager` | 新增（index 804 / operations 640 行） | **是**（base deps；`:20` 行 `id: plugin-manager` + `:16` 行 `tool-plugin-manager/tools`） | default `PluginManager`(:804)、`parseInstallSpec`(:37)、`classifyInstallFailure`(:36)、子路径 `./tools`、`./types`、`./registry`、`./typert`、`./remote`、`./operations` |
| `@deepseek-ai/dsh-cmdline` | 保留 | 否（launcher 库） | **src 零变化**；仅 package.json 版本与 peer 范围 |

三者均 `publishConfig.access: public`（可上 npm）。base 中它们与 `hmr`/`settings` 一样带 `disabled: !!js "!ctx.get('profileContext')"` 门禁；`profileContext` 由 launcher 提供（`apps/cli/src/profile-boot.ts:287-298` 提供，`app-boot/src/profile-context.ts:29-36` 声明）。
→ **Sage 现状**：`apps/sage-shell/src/host/composition.ts:50` 用 `loadProfileDirectory` 自组 profile、不提供 `profileContext`，`config/shell.cordis.patch.yml` 也未兜住这些行 → 0.2.0 下 hmr/config-editor/plugin-manager/settings 都会是 disabled。

---

## 4. bundle/base 与 bundle/web-app（Sage seed 直装的两个 bundle）

### 4.1 bundle/base（`@deepseek-ai/dsh-base`）

依赖集合：**新增 13** `dsh-authorization`、`dsh-compaction-image-offload`、`dsh-config-editor`、`dsh-deepseek-account-platform`、`dsh-hmr`、`dsh-llm-deepseek-account`、`dsh-llm-deepseek-api-key`、`dsh-mcp-resources`、`dsh-otel`、`dsh-plugin-manager`、`dsh-ptc-runtime-node`、`dsh-settings`、`dsh-workflow-ptc`；**删除 4** `cordis-plugin-hmr`、`dsh-llm-deepseek`、`dsh-settings-file`、`dsh-workflow-worker-thread`（`packages/settings/settings-file` 包整包删除）。
`cordis.patch.yml` 行级变化：
- `:16-22` 新增 `tool-plugin-manager`/`plugin-manager`（profileContext 门禁）；`:28-33` hmr 换包、`root: ['.']`→`[]`、注释改为“配置默认热重载、模块根 opt-in”
- `:97-104` `config-editor` + `settings`（`dsh-settings-file`→`dsh-settings`，均 profileContext 门禁）
- `:109-115` 新增 `authorization`；新增 `deepseek-account`（`desktopPlatform` 门禁用 profileContext 名 `desktop`）
- `:188` 新增 `otel`；`:211` telemetry URL 改 `https://dsh-otel-collector.deepseeksvc.com/v1/logs`；`session-telemetry-otel` 新增 `maxRequestBytes: 4000000`，注释：串行请求、1s 传输超时 + 1.5s 看门狗、3s 外层关停
- `:390-397` `workflow-worker-thread` → `ptc-runtime`(`dsh-ptc-runtime-node`) + `workflow-ptc`
- `:410` spill-policy `maxInlineBytes: 50000` → **`maxInlineTokens: 12500`**
- `:427` 新增 `image-offload`；`:447` `tool-ralph` 默认 `disabled: true`；`:492` 新增 `mcp-resources`
- `:528` `llm-deepseek` → `llm-deepseek-api-key`，另增 `llm-deepseek-account`

### 4.2 bundle/web-app（`@deepseek-ai/dsh-web-app`）

依赖集合：**新增 51**（含 `dsh-agent-instructions`、`dsh-agent-preset`、`dsh-agent-preset-registry`、`dsh-api-job-controller`、`dsh-api-terminal-controller`、`dsh-api-account-controller`、`dsh-client-ui-plugin-manager`、`dsh-client-ui-sidebar-browser`、`dsh-client-ui-sidebar-terminal`、`dsh-client-product-analytics`、`dsh-host-product-telemetry-otel`、`dsh-office-to-pdf`、`dsh-persona`、`dsh-terminal*`、`dsh-tool-*` 一批、`dsh-workflow-ptc`、`dsh-workspace-changes` 等）；**删除 3** `dsh-agent-presets`、`dsh-client-ui-schedule`、`dsh-code-runtime-worker-thread`。
`cordis.patch.yml` 关键行：`:45` desktop-product-telemetry、`:57` product-analytics（均 `profileContext?.name !== 'desktop'` 才 disabled）、`:126` job-controller、`:130` terminal-controller、`:140` account-controller、`:156` cordis-inspect-providers、`:269` office-to-pdf、`:278` ui-sidebar-browser（desktop 专属）、`:282` ui-sidebar-terminal、`:300` ui-plugin-manager、`:339` workspace-changes、`:562` `agent-presets` → `agent-preset-registry`。`code-runtime` 行删除；`ui-schedule` 行删除（并入 experimental schedule bundle）。
**清单结构变更（需迁移）**：`package.json` 中 `dsh.bundle.patch` 从字符串变为**有序数组**：`./cordis.patch.yml` + `presets/{standard,ptc,minimal,cordis}.patch.yml`（新增 presets 目录，每个 preset 一个声明文件）；exports 新增 `"./presets/*.patch.yml"`。
`src/index.ts:284-296`：web readiness 前先 `auditStartupEntries(connectionCtx.root, 'dsh web', ()=>{})`。
README 明确：shipped composition 不再携带 `time-context`/`schedule`/`ui-schedule` 行；桌面产品分析 30s 批量、退出 2s 排空。

---

## 5. host 三包

### 5.1 packages/host/webserver（U）
- 导出面**零变化**（:19-20、:39-59、:125、:365 对位一致）；`collectIndexInjections` 旧版已存在。
- `src/index.ts:98`：响应 `content-type` 为 `multipart/form-data` 时**跳过 gzip**（过滤函数返回 true）——新增行为，兼容。
- `src/injections.ts:23`：仅注释措辞（`/plugins/...` → `plugins/...`）。

### 5.2 packages/host/plugin-inventory（U/需迁移）
- `pluginEntryId` 由私有改为导出（`src/index.ts:24`）；新增独立 `readPluginInventory(ctx)`（`:70-110`），Remote `list()` 改为调用它。
- `types.ts`：`PluginInventoryEntry.meta?`(:22) 新增；`AgentPresetPluginRow.meta?`(:38) 新增；`PluginInventorySnapshot.managementAvailable?`(:68) 新增；**`AgentPresetPluginGroup.trust` 删除**（:55 区域，旧字段 `'system'|'user'`）。
- 新依赖：`pluginPackages`（`dsh-app-boot` 的 `ctx.pluginPackages.metaOf`）与 `pluginManager` 服务探测；peerDep `dsh-agent-presets` → `dsh-agent-preset-registry`。
- 注：README 的 preset 段落仍写 `trust`（`README.md` 内文未同步类型删除），属上游文档滞后——按类型为准。

### 5.3 packages/host/frontend-static（U）
- `src/index.ts:119`：注入的文档 base 由 `<base href="/">` 改为 **`<base href="./">`**——冻结“页面被加载时的入口目录”，同一 index 可同时服务根挂载与前缀代理挂载；README 补充说明。其余导出与 fallback/403/404/405 语义不变。

---

## 6. packages/api/gateway（@deepseek-ai/dsh-api-gateway）

### 6.1 Host 侧接口（breaking for 实现方）

- `src/types.ts`：`InvokeRemoteRequest` 新增 `uplink?: AsyncIterable<unknown>`(:22) 与 `peer?: PeerScope`(:24)（`PeerScope` 来自 `@deepseek-ai/dsh-typert-protocol`，`:7`）；`TypertGatewayWireStream.open` 签名加 `uplink`(:98)、`peer`(:99)；`TypertGateway` 新增 `hasLiveClient(): boolean`(:146)；错误码新增 `'gateway/protocol'`、`'gateway/uplink-overflow'`（`:135` 区域；同步进 `remote-error-codes.ts:30`/`:35`）。
- `src/index.ts`：`Config` 新增可选 `streamInboxBytes`(:150, 默认 262144，`:149` 注释)；`TypertGatewayService`(:199) 在 `appReady` 就绪后才注册升级路由（`:267 webCtx.get('appReady')`）；`hasLiveClient()`(:284)。`isRemoteJsonValue` 不再由 gateway 导出（迁至 `packages/typert/protocol/src/json-value.ts:12`），但 gateway **新增子路径导出 `./stream-protocol`**（package.json），可由该处获取。

### 6.2 线上协议（向后兼容的新增）

- `stream-protocol.ts`：客户端→服务端消息联合新增 `'item'`(:242) 与 `'end'`(:243)（原仅 `open`/`cancel`），`parseRemoteStreamClientMessage`(:266-279) 相应校验。`REMOTE_STREAM_MUX_PATH` 不变(:7)。
- `stream-server.ts`：`handleUpgrade(..., peer)`(:71)，每个 socket 绑定升级时准入的 Peer（`bindPeer` :410，scope 释放即关闭 socket）；每流 `UplinkInbox`(:309) 有界缓冲，超限抛 `gateway/uplink-overflow`(:336)，`end` 之后再来 `item` 抛 `gateway/protocol`(:328)；已结束流的 `item/end/cancel` 丢弃，重复 `open` 关 socket(:203)。下行语义不变。
- Client 面：`RemoteStreamMuxClient.open(..., uplink?)`（`client/stream-client.ts:99-103`）新增 uplink pump（`stop()` 中断阻塞读）；`client/index.ts` 生成方法返回 `RemoteStreamHandle`(:393/:424) 而非裸 AsyncIterable，新增 `ClientUplinkQueue`(:27)、`carrierFailure`(:819)、`cancelledFailure`(:829)；unary 调用不再在客户端执行 schema（交由 Host）。
- `client/remote-events.ts`：waterfall 目标解析支持 `TypertOwnedValue<Context>` 并在回复后释放(:192-200)；Context 解析保持同步。
- package.json：新增 `./stream-protocol` 子路径；`@deepseek-ai/dsh-client-connection` 由 devDep 升为 peerDep。

---

## 7. util 与根 package.json

- **packages/util/launch-environment：无变化**。`src/index.ts` diff 为 0 字节；导出集不变（`DSH_LAUNCH_ENVIRONMENT_KEY='launchEnvironment'` 等，:106）；仅版本号与 `workspace:^ → workspace:~`。
- **packages/util/home-paths**：DSH home 解析规则不变（configured > `$DSH_HOME` > `~/.dsh`，空值视为未设）；新增 `dshCachePath`（`src/index.ts:108`，`$DSH_HOME/cache/...`，不建目录）；README 增补。
- **根 package.json engines：无变化**（`^{...}`，:8-9：`"node": "^22.19.0 || >=24.0.0"`；packageManager `pnpm@11.7.0` 亦不变）。脚本层有大量 build/gate/verify 增改（如 `migrate:sessions-to-v4`，提示会话格式代际变化，属本射程之外的邻近信号）。

---

## 8. Clean items（本射程内确认无变化 / 无破坏性变化）

**完全无变化**
1. `packages/util/launch-environment/src/index.ts`（0 diff；env var 契约稳定）
2. `packages/boot/cmdline/src/index.ts`（0 diff；仅 package.json peer 范围与 zh 文档措辞）
3. `packages/host/webserver` 公开导出面（`WebServer`、`WebRoute`、`WebUpgradeRoute`、`Config`、`renderIndexInjections`、`IndexInjection*` 全对位）
4. 根 `package.json` 的 `engines` 与 `packageManager`
5. app-boot `loadEnv`/`loadLayeredEnv`（env var 契约，函数体未进入任何 diff hunk）
6. `resolveConfigPath`、`loadOptionalPatches`、`loadOverlayPatches`、`renderConfigDump`、`mountRootInclude`(仅加第 5 参 `binName`)、`installFailLoud`、`addHarnessSourceSection`、`HARNESS_SOURCE_SECTION`、`FAIL_LOUD_RELEASE_TIMEOUT_MS` 保留
7. gateway `REMOTE_STREAM_MUX_PATH`、`websocketHeartbeatIntervalMs` 默认值(2000)、`gateway/*` 既有错误码、`TypertGatewayService`/`TypertGatewayError`/`Config` 主体导出面
8. home-paths 的 `resolveDshHome`/`dshHomePath`/显示与展开规则
9. bundle/base 的 `DEFAULT_PROFILE_BUNDLES`（仍 `['@deepseek-ai/dsh-base']`）

**有变化但不扣分（兼容）**
10. webserver gzip 过滤对 multipart 放行（新增例外）
11. frontend-static `<base href>` 由 `/` 改 `./`（对外语义按 README 解释为增强，单页根挂载行为不变）
12. plugin-inventory 新增字段（`meta`、`managementAvailable`）与新增导出（`pluginEntryId`、`readPluginInventory`）
13. gateway uplink 客户端 `item/end` 帧（旧客户端不下发即完全等价）
14. gateway `Config.streamInboxBytes`（可选，默认 262144）
15. `boot()` 五参签名未变；`loadProfileDirectory` 三+一参未变

---

## 9. 对 Sage 迁移的关键提示（均为上游事实的直接推论）

1. **wire 参照消失**：`apps/sage-shell/src/protocol.ts` 的 6 个常量已无上游对应物；Sage 管道帧属自有实现，须自担演进与验证（上游 0.2.0 宿主不再走管道）。
2. **profileContext 门禁**：不使用 `dsh` CLI 启动器（如 Sage shell 自组 profile）的宿主，base 的 `settings`/`hmr`/`config-editor`/`plugin-manager` 及桌面相关行会全部 disabled；要么提供 `profileContext`，要么在 overlay 中显式接管这些行。
3. **seed manifest**：`apps/sage-shell/seed/package.json` 的 `"patchReload": "live"` 在 0.2.0 被静默忽略（键已删除）；重载改由 `dsh-hmr` 插件 + `reconcileProfilePatches` 承担。
4. **bundle 成员/行变化**：seed 若继续锁 base+web-app，`dsh-settings-file`→`dsh-settings`、`llm-deepseek`→`llm-deepseek-api-key`、`workflow-worker-thread`→`ptc-runtime`+`workflow-ptc`、`spill-policy.maxInlineBytes`→`maxInlineTokens` 等改名必须在 patch/依赖层同步；`dsh.bundle.patch` 数组化后 bundle 解析路径也不同（`bundlePatchPaths`）。
5. **失败语义放宽**：启动不再“任一插件失败即死”，Sage 现有依赖“全绿才启动”的隐式假设不再由 app-boot 保证；若需要，须用 required 清单或自建审计。
6. **兼容性准入**：0.2.0 会对插件 DSH peer 范围做强校验，失败 bundle 被静默跳过（仅 `skippedBundles` + stderr 提示）；Sage 现用的一批 0.1.x 插件与 `workspace:~` 范围需逐包核对，否则可能整包被跳过。

---

### 证据方法备注
- 全部行号为 639ed01 侧；旧侧引用标注 fb2c4b9e 并写明“旧”。
- 关键命令：`git diff --stat <a> <b> -- <paths>`、`git diff <a> <b> -- <file>`、`git show <rev>:<path>`、`git grep -n <pat> <rev> -- <paths>`、`git ls-tree`。
- 未运行任何构建/测试；本报告仅为源码差异取证。
