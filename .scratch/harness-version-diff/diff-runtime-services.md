# deepseek-harness 版本差异报告 · 运行时服务面

- 基线：`fb2c4b9e`（0.1.5-rc.2）→ `639ed01`（tag `dsh-v0.2.0-rc.2`，0.2.0-rc.2）
- 检出：`/Users/lute/project/Sage/vendor/dsh-desktop/deepseek-harness`（只读；`git diff` / `git show` / `git grep`）
- 行号约定：**除注明外所有文件路径 + 行号均指向 639ed01 侧**；`git diff` 引用的旧侧行为已逐条注明
- 伴随既有产物（同目录，前序调查）：`inventory-diff.txt`（全仓包清单 diff）、`npm-existence.txt`（npm 存在性探测）
- 射程：12 项运行时服务面（连接/RPC、client 模块与槽位、SDK 协议、settings、session、credentials、hooks、mcp、skill、interaction、ptc-runtime、workflow）

## 分类结论总览

| 项 | 判定 | 一句话 |
|---|---|---|
| 1 connection | **breaking + 需迁移** | handler 增 `peer` 参、返回值换代、二进制附件帧、`?fixture` 载体删除、`installConnection` 新入口、转发事件 `connection/request` |
| 2 client modules/ui-slots | **需迁移** | `clientModuleHost`→`clientModules`；ui-slots 新增 Component Factory；ui-primitives 若干重命名 + OnboardingSurface 迁出 |
| 3 sdk | 行为变化/近无变化 | protocol wire 与 client 库源文件零改动；server 换装 `dsh-llm-deepseek-api-key` |
| 4 settings | **breaking（settings-file 消失）** | settings-file 删除、`SettingsProvider/installSection` 删除，改为 Loader profile patch + `dsh-config-editor`；`settings.yaml` 一次性导入 |
| 5 session | **需迁移** | 会话格式 V3→V4；catalog 需子会话证据；持久化重启迁移与拒绝规则 |
| 6 credentials | 行为变化 + 新增包 | `credentials` seam 未动；authorization 增 `commit()`；新增 deepseek-account(-platform) |
| 7 hooks/hook-protocol | 行为变化（小 API 收紧） | `runHook` 改吃 `Pick<ShellExecutor, resolve+execute>` 而非整个 `ShellExecutor` |
| 8 mcp | **需迁移** | MCP SDK 换名 `@modelcontextprotocol/client@2.0.0`；`createMcpToolDefinition` 导出；新增 `dsh-mcp-resources` |
| 9 skill | 行为变化（向后兼容） | `SkillSummary.path` 上移；磁盘技能路径改为 realpath |
| 10 interaction | 需迁移（permission）+ 新增能力 | permission-presets 换 `TypertRemoteService` 且删 settings 命名空间；user-questions 大扩（定时等待/投影） |
| 11 code-runtime → ptc | **breaking（包整体替换）** | `dsh-code-runtime`/`-worker-thread` 删除；替代物 `@deepseek-ai/dsh-ptc-runtime` + `dsh-ptc-runtime-node`（worker 线程 → 独立 Node 进程） |
| 12 workflow | **需迁移** | `dsh-workflow-worker-thread` → `dsh-workflow-ptc`；tool-workflow 增后台运行 |

---

## 1. packages/client/connection（host↔renderer / host 启动）

规模：`git diff --stat` 24 文件，+934/−6200（含 1782 行 fixture 测试删除）。锚点：

- **宿主 RPC handler 签名 breaking**：`ConnectionRpcHandler` 新增第 4 参 `peer: PeerScope`，返回类型从 `ConnectionRpcResult<unknown>` 改为 `ConnectionRpcHandlerResult`（`{ok:true;value;attachments?}`）：`src/rpc.ts:127-135`、`:31-38`（`ConnectionRpcAttachment`）、`:119-121`（`PeerAdmission`）。`HostConnectionHandle` 新增 `admit()`：`src/rpc.ts:213-222`。
- **rpc-host 行为**：`HostConnectionService` 持有 `operator: PeerScope`（`src/rpc-host.ts:65`），`admit()` 通过即冒名 operator（`:110`）；成功结果若带 `attachments` 改走 multipart 响应（`metadata` + `bytes-N`）：`:295-310`。
- **新 Cordis 事件（waterfall）**：`connection/request`，可在 bridge 前拦截/包裹共享 API 请求：`src/index.ts:60-68`；apply 中 `admit`+`waterfall`：`src/index.ts:149-155`。
- **新增 `OperatorPeer`**（scope 化的 peer 身份，`scopeTarget(peer)` 事件寻址）：`src/operator-peer.ts`（新增 33 行）；`src/index.ts:41` 导出；依赖新增 `@deepseek-ai/dsh-scope`、`@deepseek-ai/dsh-typert-protocol`，重导出 `PeerId/PeerScope/RemoteInvocation`（`src/index.ts:39`）。
- **浏览器 fixture 载体整体删除**：`src/client/fixture.ts`（4037 行）与 `?fixture` 查询分支消失；`apply()` 不再据此分流。改为显式组合入口 `installConnection(ctx, options)`，`ClientTransportHooks` 增 `rpc?`（进程内直连，替代 HTTP）与 `streamBaseUrl?`（跨 origin shell）：`src/client/index.ts:85`、`:106`、`:205`、`:317`。`RpcFetch` 入参放宽为 `string|URL`（文档相对路由）、`RpcStreamOpen` 增 `uplink`：`src/client/rpc.ts`（diff 上方）。
- **browser-auth 兜底 URL 语义变化**：`authenticatedUrl()` 不再把 path/search/hash 归零（保留 authority 与挂载路径），303 重定向 `Location: /` → `./`：`src/browser-auth.ts:216-268`（diff 段）。
- **http-bridge 稳健性**：断连后不再写 chunk、背压等待加 `res.destroyed` 判断（multipart 取消竞态）：`src/http-bridge.ts`（diff 段）。

## 2. packages/client/modules · store · ui-primitives · ui-slots（renderer 参照面）

- **modules（服务改名 + 新入口控制器）**：`clientModuleHost` → `clientModules`（源 `src/index.ts:9`，Context 声明 `:47`，注册 `:620`）。新增页面侧 `ClientEntries`（`src/client/entries.ts`，247 行）：按 Host manifest 做 entry 对账/重试/代码替换，暴露 `ClientEntryState` 可观察快照；新增 `entry-lifecycle.ts`。**bundle 注册契约变化**：`ClientBundleRegistration` 增 `chunk?: string`，工厂参数变为 `ClientBundleRequire`（`.async()` 解析包内动态 chunk）：`src/client/manifest.ts:305-330`；`system.ts` 增 `chunkId/chunkUrl` 解析（diff 段）。`WebBootEntry.url` 语义明确为“文档相对”。
- **store**：`src/contract.ts:77-82` 仅 `clearPersisted()` 文档句改动（显式清理，作用域销毁不再调用）；无行为变化。
- **ui-primitives（导出面大量变动）**：删除 `OnboardingSurface`（迁往新包 `dsh-client-ui-settings-account/src/client/OnboardingSurface.tsx`，见 web-app 依赖新增）；`Menu` 拆分出 `MenuSurface/MenuGroup/MenuItemButton`；图标改双尺寸导出（`PermissionIcon*Medium/Regular`、`ReferenceIcon*`、`LinkIcon*`）；新增 `SegmentedControl/SegmentedTabs/Checkbox/PathLabel/ShortcutKeys/TextShimmer/ImageLightbox/MarkdownDelegate/SettingsForm 家族/plugin-artwork/guide-artwork/useModalLayer/focus/input-modality`：`src/index.ts`（全文件 diff）。
- **ui-slots（新增 Component Factory 一等模型）**：`SlotFactoryMap`/`SlotScopeTargetMap` 声明合并、`SlotFactoryDef`/`FactoryLocalSlotDef`、注册面 `registerFactory`、渲染面 `renderFactorySlot`/`useFactorySlot`、注入面 `PropsRenderFactories`、live 拓扑 `LiveFactoryNode/LiveCompositionNode`：`src/index.ts`（522 行增改，节选见 grep）。渲染 host 契约增 `reportFactoryError/factoryStoreOf/retainFactoryStore`：`src/renderer.ts:165+`；`SlotScopeAdapter.resolve(key)` → `bindingSource(target)`（`src/renderer.ts:88-99`）。普通 Slot 的四种组合形态与 store seat 不变（README 判定“五 share“）。

## 3. packages/sdk（协议 wire）

- **`packages/sdk/protocol`：src 零改动**（`src/index.ts`、`transport.ts`、`types.ts` 均未出现在 diff；仅 README/package.json 版本与 specifier 变化）。行分帧 JSON-RPC 传输、方法/通知类型表不变 → **wire 形状 clean**。
- `packages/sdk/client`：`src/api.ts`、`src/client.ts` 仅去掉冗余双断言（`as unknown as X` → `as X`），无逻辑变化。
- `packages/sdk/server`：`src/server.ts:18` 适配器包换名 `@deepseek-ai/dsh-llm-deepseek` → `@deepseek-ai/dsh-llm-deepseek-api-key`；fallback 挂载改 `ctx.plugin(LlmDeepSeek)`（不再传 `{}`）：`:154`；`subagent.finished` 的 `lastAssistantMessage` 改为拷贝数组（`:121-127`，wire 字段不变）。package.json 依赖名同步替换。

## 4. packages/settings（settings-file 去向）

- **`@deepseek-ai/dsh-settings-file` 整包删除**（`FileSettingsProvider extends SettingsProvider` 371 行 + 5 个测试文件）。去向：**不是换名**——文件持久化职责拆给新包 `@deepseek-ai/dsh-config-editor`（`packages/boot/config-editor`，0.2.0 新增），设置服务改为“Loader profile patch 派生表单”。
- **`dsh-settings` 重写为 `SettingsForms`**：`src/index.ts:223`（`export class SettingsForms extends Service`）；旧 `SettingsProvider`（abstract，含 `installSection()`/`SettingsRegisterOptions`/`SettingsSectionHooks`/`SettingsUpdateSource`）全部移除；命名空间注册模式被弃。表单直接投影各 profile entry 的 `.volatile()` Config 字段（`describe()` `:302`、revision 冲突 `SettingsConflictError` `:45`、路径编辑 `SettingsPathOp` `:81`）。
- **一次性迁移**：harness home 内旧 `settings.yaml` 在 Loader 落定后被导入并改名 `settings.yaml.imported`；旧 section 按映射表落到新 entry id（`ui-developer-tools`→`ui-settings`、`ui-onboarding`→`ui-settings-general`、`shell`→平台 shell executor）：`src/index.ts:200-207`、`:241-250`；README:35。运行组合不接受的 section 只留在改名文件里。
- bundle 挂载：base 里 `id: settings` 从 `dsh-settings-file` 换成 `dsh-settings`（`:101-103`）并新增 `config-editor` 行（`:97-99`）（`packages/bundle/base/cordis.patch.yml`）。

## 5. packages/session（V3→V4 与会话持久化）

- **格式版本 3 → 4**：`session-format-catalog/src/generated.ts:17`（`currentVersion: 4`）、`currentEncoder: releasedV4SessionFormatCodec`（`:25`）、新增迁移边 `sessionFormatV3ToV4`（`:30`）。
- **新增 `session-format-v3-to-v4`**（350 行 README + ~1500 行实现/测试）。对消费方有意义的转换（README「V3-to-V4 specification」）：
  - `tool/result`：`message.role: 'user'` → `'tool'`，`toolCallId` 上移到 message 级，`isError` 上移，wrapper 拆除（`src/tool-role.ts liftToolResult`）；畸形 wrapper 报格式错误、嵌套结果拒绝发布继任文件。
  - 未知内容 tag 命名空间化 `plugin:<原 type>`；带自带 `deferLoading` 的请求工具定义**拒绝迁移**（该字段仅 V4 定义）。
  - 消息 source 词汇迁移（`src/sources.ts` 消息 walker）；证据化中断回合闭合；父目录事实补记。
  - **恢复需要子会话证据**：`createStage()` 无 `childFacts` 绑定即拒绝（空数组=显式声明无子会话）；`createSessionFormatCatalogWithChildren(childFacts)` 为新入口（`session-format-catalog/src/children.ts`、`src/index.ts:4-6`、`historical.ts` 导出 `historicalSessionFormatCatalog`）。
- **`session-persistence-jsonl`**：新增 `src/catalog-migration.ts prepareCatalogFacts()`（只收直接子会话描述符，校验物理见证）；prepared 日志带 `validateRelatedSources()`，子集成员变化或子文件 revision 变化即失效（`src/index.ts:127`、`:590`、`:640-660`）；历史（v3）在列出的 revision 上加 `historicalCorpusRevision` 后缀（`:458`、`:485`）；读路径对 `JsonlGenerationSourceChangedError` 重试一次（`:348-356`）。
- **`session-persistence`**：`SessionPersistence.identity`（symbol）新增（`src/index.ts:137`）；接口其余不变。
- **`session-format-v0-to-v1`**：`migration.ts` 把字面 `provenance` 键改为常量拼接（`LEGACY_ASSISTANT_SOURCE_KEY`），仍读同一 legacy 键；v1→v2/v2→v3 仅注释与命名刷新。**旧版迁移 spec 行为不变**。
- `session-log-deepseek`/`session-projection-cache`（含新 v7 opaque 会话 fixture）/`session-telemetry*` 有各自增量，不改变 v3→v4 结论。

## 6. packages/credentials

- **`dsh-credentials` seam：src 零改动** → resolve/set/describe 契约不变（仅 package.json specifier/version）。
- `dsh-authorization`：`AuthorizationSession` 新增 `commit(record: CredentialRecord): Promise<void>`（`src/index.ts:100`）；flow 自己提交凭证、提交受理后取消等待完成（`committing` 门闩，`:400-406`、cancel 路径 `:259-262`）。**实现 Authorization flow 的消费方需实现 `commit`**。
- `credentials-local`：仅删除“与 settings-file 对称”的 jscpd 注释；逻辑零变化。
- **新增 `@deepseek-ai/dsh-deepseek-account`**（账号服务定义：登录状态、浏览器登录启停、登出、bonus、token 拒绝、`deepseek-account/*` 事件）与 **`@deepseek-ai/dsh-deepseek-account-platform`**（Platform provider：五头 `x-client-*`、OAuth 设备身份、平台会话快照、401/40003 失效处理）。base 新增 `authorization` 与 `deepseek-account` 行（`packages/bundle/base/cordis.patch.yml:109-115`），`llm-deepseek` 行拆为 `llm-deepseek-api-key` + `llm-deepseek-account`。

## 7. packages/hooks/hook-protocol

- `runner.ts:65-90`：`runHook(bash: Pick<ShellExecutor,'resolve'|'execute'>)`（原 `ShellExecutor`），执行改 `(await bash.execute(bash.resolve(request))).result()`（原 `bash.run(...)`）——**ShellExecutor seam 换代后的最小适配**；wire 编解码/合并逻辑不变。
- `invariant.ts:77` 加 `no-deprecated` 注释（`session.snapshotEvents()` 已弃用，暂缓迁移）——**弃用信号，非现行 break**。

## 8. packages/mcp

- **SDK 换代**：`@modelcontextprotocol/sdk ^1.12.0` → **`@modelcontextprotocol/client 2.0.0`**（`packages/mcp/mcp-client/package.json`）；transport 导入路径改 `@modelcontextprotocol/client(/stdio)`（`src/transport.ts`，`as Transport` 断言删除）。
- **工具直挂契约**：手写“uncached tools/list + 游标重复检测”删除，改 SDK 聚合分页 `client.listTools(undefined,{cacheMode:'refresh'})` 与 `client.callTool(...,{toolDefinition})`（`src/tools.ts:123`、`:138`）；新导出 `createMcpToolDefinition(ctx, McpToolDefinitionOptions)`（`:196`、`:225`，注册/生命周期归调用方）与 `McpToolDefinitionOptions`；`ToolDefinition.finalizeContent` 钩子被改名 `projectContent`（`packages/core/tools/src/index.ts:246`，旧名见 fb2c4b9e 同文件 239 行）——**顺带的核心工具定义 API 变更，凡定义了 rich 投影的工具都要改名**。
- **新配置**：`maxInstructionBytes`（默认 32768，`src/connection.ts:48`），服务器 instructions 按字节上限归因为 prompt 文本；连接代次在失败关停未确认时**停止重连**避免进程叠加（`src/connection.ts settleFailedGeneration`）。
- **新包 `@deepseek-ai/dsh-mcp-resources`**：`McpResourceRuntime`（`src/index.ts:47`，`register(server, provider)` `:80`）+ 三个共享工具；mcp-client 经 `server-context.ts:28 registerServerContext()` 发布 resources/instructions；base 新增 `mcp-resources` 行（`base/cordis.patch.yml:492-493`）。

## 9. packages/skill

- `dsh-skill`：`SkillSummary` 新增 `path?`（`src/index.ts:58-59`），原 `SkillCandidate/SkillDefinition` 上的 `path` 上移汇聚（`toSummary` 透传）——字段搬家，向后兼容读取。
- `dsh-skill-filesystem`：`readSkillText` 返回 `SkillText{path,content}` 并对磁盘路径做 **`realpath` 归一**（`src/index.ts:12`、`:846-855`、`:862+`）——报告给消费方的技能路径变为符号链接解析后的真实路径；目录扫描/`watchFile` watcher/frontmatter 解析规则不变。
- `tool-skill`：仅工具 description 文案变化（`src/index.ts` diff 单行）。
- 新增 `skill-office`（docx/pptx/xlsx 三个 SKILL.md 素材 + 校验脚本）与 `tool-workspace-dependencies`（工作区依赖工具）——新能力，不属于旧契约迁移。

## 10. packages/interaction

- **user-questions（大扩，新增能力为主）**：改 `TypertRemoteService`（`src/index.ts:79`）；新增会话投影 `userQuestions`（`src/projection.ts`，状态 `open|continued`）、前台定时等待 `askTimed()`（`src/index.ts:234`、`src/timed-wait.ts`、`TIMED_WAIT_PARAMETER`）、续答 `answer(agent,callId,answer)`（`:165`）；新增消息 source `user-question-reply` 与回复排队/释放；**新增限制**：调用 agent 必须是精确存活的 root（`CALLER_NOT_LIVE`/`DELEGATED_CALLER`，`src/index.ts:131-142`）。
- **permission-presets（重做）**：`PermissionPresetService` → `TypertRemoteService`（`src/index.ts:180`）；`presets`/`defaultPreset` 变必填 Config，`defaultPreset` 为 `Volatile<string|undefined>`（`:171`）——**旧 `settings.installSection('permission', …)` 用户设置路径删除**（`PERMISSION_SETTINGS_NAMESPACE` 在新树已无引用）；保留名新增 `AUTO_PRESET='auto'`（`:82`）由 Auto review 集成同步准入；读侧 = 进程 catalog + 仅当前值的 `permissions` 投影（旧 `PermissionSelect` → `PermissionSelection`，新增 `PermissionCatalog`）。
- **user-approval**：新增声明合并 `MessageSourceMap['user-approval']`（`src/index.ts:14-15`）并把策略变更消息 source 从 `{kind:'plugin',plugin:'user-approval'}` 改为 `{kind:'user-approval'}`（`:193`）——**持久化 source 形状变化，与第 5 项 message-source 迁移呼应**；`ApprovalRequestEvent` 增 `displayReason`（仅展示，不入审计事件，`src/types.ts:73`）。

## 11. packages/code-runtime → packages/ptc-runtime（移除包去向，任务重点）

**0.2.0 中 `packages/code-runtime/` 整族删除**（`dsh-code-runtime` 137+131 行、`dsh-code-runtime-worker-thread` 561+424+420+179+68 行，共 −4865），`packages/experimental/code-runtime-python` 也改名为 `ptc-runtime-python`。**新树已无任何 `dsh-code-runtime` 引用**（`git grep` 全 packages 零命中）。

替代物：

| 0.1.5 | 0.2.0 承接 | 关键差异 |
|---|---|---|
| `@deepseek-ai/dsh-code-runtime`（seam，`ctx.codeRuntime`，`CodeRuntime` 抽象类） | `@deepseek-ai/dsh-ptc-runtime`（`ctx.ptcRuntime`，`PtcRuntime` 抽象类，`ptc-runtime/src/index.ts:104`） | 新增 `resolve(request) → PtcRunSpec` 两段式（`:143`），`run(spec)` 只吃已解析输入（`:150`）；类型改名 `CodeRun*`→`PtcRun*` 并新增 `PtcRunSpec/PtcRunSandbox/PtcRunFailure`（`src/types.ts:73-144`）；`language/isolation` 降级为诊断描述符 |
| `@deepseek-ai/dsh-code-runtime-worker-thread`（`WorkerThreadCodeRuntime`，Node worker 线程） | `@deepseek-ai/dsh-ptc-runtime-node`（`NodePtcRuntime`，`ptc-runtime-node/src/index.ts:52`） | **每次调用起一个全新受管 Node 进程**（README Summary），套用 Session 文件沙箱策略（Bash 同级）；配置新增/公开 `timeoutMs/maxTimeoutMs/maxOutputBytes/maxOldGenerationSizeMb/maxMessageBytes/maxPendingCalls/graceMs/nodeExecutable/bootstrapPath`；`new Process(...)`/launch/channel/json-wire/output-ledger 新模块 |
| bundle 行 `code-runtime → dsh-code-runtime-worker-thread`（web-app 与 headless 各自挂） | base 统一挂 `ptc-runtime → dsh-ptc-runtime-node`（`packages/bundle/base/cordis.patch.yml:390-391`；web-app 删除该行、headless 删除行与依赖） | 三个 bundle 的挂载点归一 |
| `dsh-experimental-code-runtime-python` | `dsh-experimental-ptc-runtime-python`（CPython 子进程后端，`ctx.ptcRuntime`） | 同 seam 改名 |

- bundle 依赖名集（工作区名级 diff）：base 移除 `dsh-workflow-worker-thread`、`dsh-settings-file`、`dsh-llm-deepseek`、`cordis-plugin-hmr`，新增 `dsh-ptc-runtime-node`、`dsh-workflow-ptc`、`dsh-settings`、`dsh-config-editor`、`dsh-authorization`、`dsh-deepseek-account-platform`、`dsh-llm-deepseek-api-key`、`dsh-llm-deepseek-account`、`dsh-mcp-resources`、`dsh-hmr`、`dsh-plugin-manager`、`dsh-otel`、`dsh-compaction-image-offload`；web-app 移除 `dsh-code-runtime-worker-thread`、`dsh-agent-presets`（→`dsh-agent-preset`+`dsh-agent-preset-registry`）、`dsh-client-ui-schedule`。
- npm 侧证据（`npm-existence.txt`）：`@deepseek-ai/dsh-ptc-runtime`、`@deepseek-ai/dsh-ptc-runtime-node` 在 0.2.0-rc.2 **存在**；`@deepseek-ai/dsh-code-runtime` **MISSING**。
- **对 Sage 的直接动作**：seed 直钉 `apps/sage-shell/seed/package.json:32` `@deepseek-ai/dsh-code-runtime@0.1.5-rc.2` → 替换为 `@deepseek-ai/dsh-ptc-runtime@0.2.0-rc.2`；worker 提供方（`dsh-ptc-runtime-node`）随 bundle/base 传递。消费面代码若 import `CodeRuntime/CodeRunRequest/CodeRunResult/WorkerThreadCodeRuntime/ctx.codeRuntime` 需全量改名。

## 12. packages/workflow

- **`dsh-workflow-worker-thread` 删除**（host/session/protocol/worker ~1300 行），新增 **`@deepseek-ai/dsh-workflow-ptc`**：脚本改为在 PTC Node 进程内运行“guest program”，hooks `agent()/parallel()/pipeline()/phase()/log()` 保留；**引擎不再有整体运行时限**（`timeoutMs: null`，仅 `syncTimeoutMs` 初段 VM 超时；README:47、`:61`）；load 时**拒绝非 TypeScript PTC provider**，Python PTC 组合须禁用 `workflow-ptc/tool-workflow/tool-ralph`（README:28）。配置：`provider/maxConcurrentAgents/maxTotalAgents/maxItemsPerCall/syncTimeoutMs`（README:40-45）。base 行 `workflow-worker-thread → workflow-ptc`（`base/cordis.patch.yml:388-393`）。
- **`dsh-workflow`（seam）**：仅注释更词（worker 语义→process/script，`src/index.ts:70-76`、`types.ts`、`runtime-types.ts`）；`WorkflowRun/WorkflowResult` 结构不变。
- **`dsh-tool-workflow`**：新增 `run_in_background`（默认 true，Config `enableRunInBackground`），后台运行注册为 `ctx.jobs` 的 `workflow` job 并即时返回 id，进度经 `src/record.ts` 的镜像流入 job output ring；前台路径语义不变。依赖 `ctx.jobs`（`dsh-jobs-local`+`dsh-tool-jobs`）。
- `tool-ralph` 在 base 默认 **disabled: true**（`base/cordis.patch.yml:447-449`），需要 overlay 显式恢复。

---

## 分类清单（clean items 与迁移项）

### A. Breaking（编译期/运行期直接断）

1. `ConnectionRpcHandler` 第 4 参 `peer` + 返回 `ConnectionRpcHandlerResult`（`packages/client/connection/src/rpc.ts:127`）；`HostConnectionHandle` 使用方若要新语义需接入 `admit()`。
2. `dsh-code-runtime`/`dsh-code-runtime-worker-thread` 包删除（无 0.2.0 发布）；`ctx.codeRuntime` → `ctx.ptcRuntime`，`CodeRuntime`→`PtcRuntime`，`CodeRunRequest/Result`→`PtcRunRequest/Result`+`PtcRunSpec`；`WorkerThreadCodeRuntime`→`NodePtcRuntime`。
3. `dsh-workflow-worker-thread` 删除 → `dsh-workflow-ptc`。
4. `dsh-settings-file` 删除；`SettingsProvider`/`installSection`/`SettingsSectionHooks`/`SettingsRegisterOptions` 删除（`SettingsForms` 取代）。
5. `ToolDefinition.finalizeContent` 改名 `projectContent`（`packages/core/tools/src/index.ts:246`）。
6. `clientModuleHost` 服务名删除 → `clientModules`（`packages/client/modules/src/index.ts:620`）。
7. ui-primitives `OnboardingSurface` 导出删除（迁往 `dsh-client-ui-settings-account`）；`Menu` 家族拆分、图标导出改名（Medium/Regular 双档）。

### B. 需迁移（配置/数据/调用点）

1. 会话文件 V3→V4：读取即迁移（父会话迁移需子会话证据；拒绝规则按 v3-to-v4 README 的 refusal 章节）；持久化 revision 语义变化。
2. `settings.yaml` → profile patch：一次性导入并把旧 section 映射到新 entry id；此后写路径走 `dsh-config-editor`。
3. `permission.defaultPreset` 设置命名空间消失 → `defaultPreset` 为 volatile Config（写在 profile patch / 表单）。
4. `runHook` 调用方实现新的 `ShellExecutor.resolve/execute` 形态。
5. mcp-client 依赖 `@modelcontextprotocol/client@2.0.0`（同名依赖树换包）；工具清单改由 SDK 聚合（重复游标自检移除）。
6. `agent-presets` → `agent-preset` + `agent-preset-registry`（web-app 侧；preset 文件/引用需改）。
7. Sage seed `dsh-code-runtime` pin 替换（见 §11）。
8. `settings` 消费插件若曾用 `ctx.settings.installSection`，改为 `.volatile()` Config +（可选）`settings.configure({auto:false})`。

### C. 行为变化（向后兼容，但语义有变）

1. connection：`?fixture` 页面载体删除（改为 `installConnection({transport:{rpc}})` 组合）；`authenticatedUrl` 保留挂载路径、303 `Location: ./`；RPC 成功结果可携带 multipart 二进制附件。
2. authorization flow 提交语义（`commit()` 后取消等待完成）。
3. skill 磁盘路径为 realpath；`SkillSummary.path` 上移。
4. user-questions：新增投影/定时等待/root-only 限制；`user-approval` 消息 source 形状 `{kind:'user-approval'}`。
5. workflow：无整体时限；tool-workflow 默认暴露后台运行（需要 jobs 组合）。
6. mcp-client：instructions 字节上限；重连在“无法确认关停”时停止；`list_changed` 生命周期由 SDK 协商管理。
7. hook-protocol：`session.snapshotEvents()` 标记弃用（暂缓迁移）。
8. session-format v0→v1 迁移源键不再以字面 `provenance` 出现（同键同义）。

### D. 无变化的检查项（clean items）

- `packages/sdk/protocol` 全部 src（`src/index.ts`、`src/transport.ts`、`src/types.ts`）：**wire 零改动**；JSON-RPC 行分帧、方法表、通知类型、`serverInfo.version=0.0.1` 均不变。
- `packages/sdk/client` 库行为（仅类型断言清理）；`packages/sdk/server` 的协议/暴露面不变（只换内部挂载的适配器包名）。
- `packages/credentials/credentials`（Service Definition）src 未动：resolve/set/describe 契约不变。
- `packages/credentials/credentials-local` 逻辑未动（仅注释）。
- `packages/client/store` 行为未动（仅 `clearPersisted` 文档句）。
- `packages/hooks/hook-protocol` 的 matcher/stdin/exit-code/stdout codec/多 hook 合并未动。
- `packages/session/session-format-v1-to-v2`、`v2-to-v3` 迁移 spec 未动（注释/命名刷新）；`v0-to-v1` 语义等价（上 C.8）。
- `packages/skill/skill` 的 frontmatter 解析与 provider 契约未动（仅 summary 增 path）；`tool-skill` 仅文案。
- `packages/workflow/workflow` seam 结构（`WorkflowRun/WorkflowResult/WorkflowStartRequest`）未动。
- `packages/mcp/mcp-client` 的 config 字段名未变（仅新增 `maxInstructionBytes`）；工具命名规则（`publicToolName`、hash 去重）未变。
- `packages/session/session-format-catalog` 既有 codec 栈 v0–v3 与 `restoreCurrent*` 语义未动（仅加 v4 与 children/historical 新入口）。

## 未覆盖 / 边界说明

- 本报告只看 harness 内部 12 项路径；`packages/core/tools`（`projectContent` 改名）与 `bundle/base` 的 `spill-policy maxInlineBytes→maxInlineTokens`、OTel URL 变更属相邻面，仅登记未展开。
- 未做运行时验证（无安装、无构建、无真实 npm 安装）；npm 存在性引用既有 `npm-existence.txt`。
- `git log` 因浅克隆不可用，rename 判定基于树内容（package.json name + 全树 grep），未做相似度分析。
