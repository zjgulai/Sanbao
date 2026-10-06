# deepseek-harness 0.1.5-rc.2 → 0.2.0-rc.2：上游发布注记 / 迁移文档 / 消费方影响面

只读调查。基线：pin `fb2c4b9e`（2026-09-10，tag `dsh-v0.1.5-rc.2`）→ 目标 `639ed015397290b3745d163aafe02ffee4aa3f84`（2026-09-29，tag `dsh-v0.2.0-rc.2`，commit subject「Merge pull request #5479 from deepseek-harness/worktree/release-dsh-0.2.0-rc.2」）。
仓库：`/Users/lute/project/Sage/vendor/dsh-desktop/deepseek-harness`（浅克隆，`git diff/ls-tree/show` 可用；未 fetch、未改任何文件）。
注意：该窗口跨约 3 周、**跨了中间版本**（注记里出现 `0.1.6-alpha.1` 的报障、upgrade-guide 目录名为 `v0.1.7-rc.2`，根 `package.json` 从 `0.1.5-rc.2` 跳到 `0.2.0-rc.2`），因此这不是一个 tag 到相邻 tag 的 diff，而是 0.1.5→（0.1.6/0.1.7 线）→0.2.0 的合并差量。

规模（本次实测，`git diff --name-status`）：
- `.agents/notes/`：1480 项（816 新增 / 631 修改 / 18 删除 / 13 重命名）；去掉 `.i18n.yaml`、`.zh.md` 重复件后新增注记 272 篇，其中文件名日期 ≥ 2026-09-17 的 106 篇。
- `docs/`：492 项（210 新增 / 279 修改 / 3 删除）。
- 关键结论：**这个窗口不存在一篇「release notes」注记**；上游的消费方迁移文档体系是本次新增的 `docs/upgrade-guide/` + 一条 AGENTS.md 强制规则（见 §1）。真正的「release notes」要从两份 upgrade guide、persistence-changes 记录和分散的 Agent Note 里拼。

---

## §0 官方叙事：0.2.0 的主题是什么

从新增文档无法读到一篇统一宣言，但从可验证的变化归纳出的主题是三条（按证据强度排序）：

1. **把「安装 / 发布面」重做成显式契约**：DSH 包之间的 `workspace:^`（caret）改为 `workspace:*`（精确版本），vendor/native 改 `workspace:~`；实验包由「白名单公开」翻转为「默认全部公开、私有无名单为空」；新增 `verify-default-product-isolation`、`verify-packed-install`、`docs/dependency-catalog.json` 一整套「装出来的东西必须与声明一致」的门禁。官方随后把这一步的动机写在 `2026-09-22-workspace-release-ranges.md`：消费者需要「精确跟随同一个 release」。（证据：§2-A）
2. **Session 数据格式走到 V4 并建立「持久化类型变更必须双语登记」的制度**：`SESSION_FORMAT_VERSION` 3→4，新增 `docs/persistence-changes/` 全套记录 + 一次性迁移命令 `pnpm run migrate:sessions-to-v4`，AGENTS.md 增加两条硬规则（persistence-type acknowledgement、breaking change 必须写 upgrade guide）。（证据：§2-B、§1）
3. **配置、插件与可选能力的「profile 单一所有权」收口**：全局 `$DSH_HOME/settings.yaml` 被删除（一次性导入 active profile）；profile 模块解析规则被写成一篇可一句话复述的规范（拦截层 `$DSH_HOME/profiles/node_modules`）；Schedule 从 Web 组合里移除、变成官方 optional bundle。（证据：§2-C、§2-D）

对 Sage 最直白的一句话：**这是一次「消费面收紧 + 数据格式换代 + 迁移文档制度化」的大版本；包与包、宿主与插件、旧设置文件的耦合都被显式化，跨版本混搭不再被容忍。**

---

## §1 上游给消费方的迁移文档机制（本次新增）

- **AGENTS.md 新规则**（`639ed01:AGENTS.md`）：L9「Acknowledge [declared persistence-type changes]」；L11「Record each externally perceptible breaking change immediately in an [upgrade guide]」。这是上游第一次把「对外可见破坏性变更」变成强制留痕。
- **upgrade-guide 目录**：`docs/upgrade-guide/` 在旧树**完全不存在**；新树只有 `v0.1.7-rc.2/` 两个条目：
  - `docs/upgrade-guide/v0.1.7-rc.2/schedule-optional-bundle/guide.md`（`## Change` / `## Migration`）
  - `docs/upgrade-guide/v0.1.7-rc.2/transcript-view-legacy-normal/guide.md`
- **格式与维护规则**：`.agents/skills/dsh-create-upgrade-guide/SKILL.md`——`## Scope` 列出必须写 guide 的面（dsh 命令/flags/profile 名；cordis.yml/patch/overlay/settings 键；持久化用户数据；TS/Python SDK、JSON-RPC、HTTP、ACP 消息；已发布包名与入口点）；`## Location` 规定目录名 = 写 guide 时的根 `package.json` version，「描述该 release 到下一个 release 的升级」；`## Maintenance` 规定版本 bump 后旧目录冻结、guide 不得跨 release；`## Format` 规定 ≤500 词、只有 `## Change` + `## Migration` 两节，由 `verify-upgrade-guides` 门禁强制（`package.json` 新增 `verify-upgrade-guides` 脚本）。
- **判断**：`docs/upgrade-guide/` 只覆盖 0.1.7-rc.2→下一个 release 这一步；0.1.5-rc.2 之后、0.1.7-rc.2 之前（含 Session V4、settings.yaml 删除、Agent Teams 合并等）**没有对应 guide**，只能靠 Agent Note + persistence-changes 反向拼装。Sage 升级时必须接受「迁移文档不完整」这一现实。
- **消费方文档资产（新增）**：
  - `docs/dependency-catalog.json`：对 `@deepseek-ai/dsh@latest` 做一次真实 npm 安装（hoisted、npm 11.17.0、node 24.19.0、darwin-arm64，capturedAt 2026-09-12）后的完整依赖树记录；文件头 `"version": "0.1.5-rc.1"`。可作为「上游期望的安装形态」参照。
  - `docs/cookbook/reviewing-persistence-type-changes.md`（新增）：改持久化类型前的必读 cookbook。
  - `docs/persistence-changes/`（新增整套）：`README.md`、`historical-formats/{v0..v3}`、`releases/`（26 个 alpha/RC tag 的历史快照 + `manifest.json`）、`finalized/v4.json`。

---

## §2 消费方影响清单（按影响面排序）

### A. 依赖与发布面（对 Sage 影响最大）

1. **DSH 包之间的已发布依赖范围由 caret 变成精确版本。**
   - 证据：`.agents/notes/implemented/process/2026-09-22-workspace-release-ranges.md` `## Decision`——「Every workspace consumer uses `workspace:*` for DSH targets and `workspace:~` for targets under `vendor/` or in the `native/system` package family … Packing substitutes the target package's current version … DSH references remain exact.」
   - 门禁：`scripts/check-workspace-constraints.ts:579`（`Require exact DSH ranges…`）与 `:594-601`（`@deepseek-ai/dsh*` → `workspace:*`，vendor/native → `workspace:~`）。
   - 后果（官方原话）：修改后的 `2026-08-10-npm-release-sequences.md` `### Workspace-internal references use the workspace: protocol`——「Published DSH peers therefore require the matching release instead of admitting later compatible versions.」
   - **消费方提示**：0.2.0-rc.2 起，任何 `@deepseek-ai/dsh-*` 包在 npm 上互相引用都是精确版本。Sage 若混装不同 release 的 `@deepseek-ai/*`（例如只升部分包、或依赖树里存在旧版传递依赖），peer/dep 解析会直接冲突。升级必须整组对齐。
2. **实验包默认全部发布（白名单翻转）。**
   - 证据：`.agents/notes/implemented/process/2026-09-12-publish-all-experimental-packages.md` `## Decision`（「Every current package under `packages/experimental/` publishes … The publication denylist … contains no directories.」）；`.agents/notes/implemented/process/2026-09-12-experimental-publication-denylist.md` `## Decision`（`PRIVATE_EXPERIMENTAL_PACKAGE_DIRECTORIES` 拥有私有例外，当前为空）。
   - 代码证据：`scripts/release/families.ts:322-328`——`DshFamily.patterns` 从 `packages/!(experimental)/*/package.json` + `PUBLIC_EXPERIMENTAL_PACKAGE_DIRECTORIES` 改为 `packages/*/*/package.json`、`apps/*/package.json`；`import { PUBLIC_EXPERIMENTAL_PACKAGE_DIRECTORIES }` 被删除（旧文件 `scripts/experimental-package-policy.ts` 的 allowlist 用法退场）。
   - AGENTS.md 措辞同步翻转：`639ed01:AGENTS.md:69`「experimental/ pre-stable prototypes; **public by default with explicit private exceptions**」。
   - **消费方提示**：npm 公共面显著扩大（`dsh-experimental-*` 大批转公开，包括 inspector、auto-review、browser-use/computer-use provider、ptc-runtime-python、webworker-*、schedule-bundle、voice-input 等）；但「experimental」仍是 pre-stable 承诺边界，不等于可依赖。
3. **默认安装的依赖闭包被显式限定**：`verify-default-product-isolation` 把实验包挡在默认产品之外（新 `process/2026-09-12-default-product-experimental-isolation.md`），唯一例外是 `OPTIONAL_BUNDLES` 里的官方可选 bundle（其依赖图会随每次 `dsh` 安装下载，见 `process/2026-09-15-shipped-optional-bundles.md` `## Decision`）。
4. **tag / dist-tag 机制未变**：`dsh` family 仍「一个 family 一个共享版本」、tag 前缀 `dsh-v`（`families.ts:328`、`:351-353`），预发布 dist-tag 由 `override distTagForVersion` 决定（rc → `next`，alpha/canary → 同名；`families.ts:355-362`，与旧版一致）。**没有出现 version baseline 编号变化或 tag 命名迁移。**
5. **根 `package.json`（`package.json:3`）**：`version` `0.1.5-rc.2`→`0.2.0-rc.2`；`engines.node` 保持 `^22.19.0 || >=24.0.0`、`packageManager: pnpm@11.7.0` 保持、`workspaces` globs 保持（含 `vendor/*`、`packages/*/*`、`native/system*`、`apps/*`、`website`）。新增脚本：`migrate:sessions-to-v4`、`start:web`、`verify-upgrade-guides`、`verify-default-product-isolation`、`verify-client-route-resolution`、`verify-persistence-changes/releases/formats`、`gen/verify-dependency-catalog`、`verify-package-meta`；devDependencies 全部从 `workspace:^` 换成 `workspace:*`（与 A1 一致）。
   - 另有本机开发体验变化（非契约）：`build:lib:host` 追加 `pnpm --filter @deepseek-ai/dsh-desktop run bundle`；`make web|dev-web|desktop|dev-desktop|build`；`pnpm-workspace.yaml` 删除 `linkWorkspacePackages: true`，pi-ai 0.85.1→0.87.1、node-addon 0.1.4→0.1.6、新增 trycua/office kit 例外与若干 patch。

### B. Session 数据格式 V4（数据兼容性）

1. **writer 换代**：`packages/core/session/src/types.ts`（`639ed01`）第 89 行 `SESSION_FORMAT_VERSION = 4`（旧树第 88 行为 3）——即 0.1.5-rc.2 写 V3、0.2.0-rc.2 写 V4。
2. **正式记录**：`docs/persistence-changes/2026-09-16-session-format-v4.md`——`## Summary` 明确「Advances the declared SessionHeader.version from 3 to 4 for the finalized V4 writer」；`## Declaration` 里 `SessionHeader` 与十余个 event root（`tool/result`、`assistant/message`、`turn/end`、`request/header`…）全部 `decision: version-bump`；新增 `event:developer/message`。
3. **发布状态要小心读**：`docs/session-format-status.md`——`latestFinalizedVersion: 4`（L32，内部基线已定稿）但 `latestReleasedVersion: 3`、`evidenceTag: dsh-v0.1.5-alpha.1`（L45-46）。文档同时写明「An alpha, beta, or release-candidate product publication establishes released Session-format obligations … A missing release record is not evidence of non-publication」——即**上游大概率会把 0.2.0-rc.2 作为首个 V4 已发布格式**，判断时不要以「记录还没推进」当作没发布。
4. **迁移路径与工具**：`scripts/migrate-sessions-to-v4.ts`（文件头注释：`One-time contributor command to publish V4 successors through JSONL persistence`）——`pnpm run migrate:sessions-to-v4 [--sessions-dir PATH] [--jobs N]`，默认 `~/.dsh/sessions`，V4 Session 只读打开，失败不阻塞后续；产物为「与历史 generation 并列发布 V4 successor」，不改写已提交生成（`.agents/notes/implemented/architecture/2026-08-31-released-session-format-migrations.md` 新增 `### Adjacent version ownership` 与 V3→V4 段落）。
5. **消费方含义**：只读旧日志可自动相邻迁移；**旧 reader 会拒绝新日志**（V4 专属事件/角色）。下游若自己解析 JSONL（Sage 的 session 读路径）必须把 V3→V4 的差异（tool-role 与 developer-role 引入、`turn/end.reason` 新增 `forked`、parent catalog 补全）纳入解析器；`docs/persistence-changes/README.md` `## Compatibility rules` 是判定表。

### C. 配置与设置（旧文件消失）

1. **`$DSH_HOME/settings.yaml` 被删除**：`.agents/notes/implemented/architecture/2026-09-19-profile-owned-live-configuration.md` `## Decision`——「The removed `$DSH_HOME/settings.yaml` is imported once into the active profile … The file is renamed to `settings.yaml.imported` before the first write, so the import never repeats」；表单写入目标是 active profile 的 `cordis.patch.yml`（含 section id → entry id 映射：`ui-developer-tools`→`ui-settings`、`ui-onboarding`→`ui-settings-general`、`shell`→平台 shell executor）。
   - **消费方提示**：任何按 `settings.yaml` 读写设置的外壳（含自研工具/脚本）都会静默失配；0.2.0 起设置是 profile 级 Cordis 配置，且「写入会把整条 entry 的完整 config 存进 profile，锁住后续 bundle 默认值变更」（同注记 `## Decision` 后半段：如 `permission.presets`、`agent-loop.agents`、`web-search-deepseek.apiKeyEnv`）。
2. **profile 模块解析规则规范化**：`.agents/notes/implemented/architecture/2026-09-19-profile-resolution-lookup-order.md` `### Part 1: Resolution rules`——ancestor `node_modules` 链、拦截层 `$DSH_HOME/profiles/node_modules`、linked root 的 peer 拦截；`## 记录` 同时说明「Profile load removes, once, the projections the link backend of **the dsh 0.1.5 releases** wrote into a profile（`<profile>/.dsh-module-fallback/node_modules` 下的 symlink）」——即**升级会一次性清理 0.1.5 时代写入 profile 的旧投影目录**。
3. `docs/subsystems/boot.md`（新子系统页）定义了新的 Plugin Manager / ConfigEditor / HMR 面（`PluginEntryId`、`BundleInfo`、`ChangeResult.changed` 的 `applied|restart-required|overridden|failed`、`InstallBundleOptions.enabled` 默认 true、pnpm 退出码/超时分类等）——外壳读 Plugin Manager 的接口语义以这篇为准。
4. **默认行为变化（隐私相关）**：`.agents/notes/implemented/architecture/2026-09-14-session-log-upload-default.md` `## Decision`——`session-log-deepseek.Config.enabled` **默认 true**（旧为 opt-in）：符合条件的请求会把 canonical log 后缀（含 message 文本、工具参数与结果、workspace 路径、feedback）上传到解析出的 DeepSeek endpoint；可用 profile 写入关闭（home patch / CLI overlay 会拒绝冲突写）。OTel 独立（另有 `2026-09-24-bounded-session-log-upload.md`、`2026-09-25-session-log-otel-byte-limits.md`）。**下游若直接复用该插件默认值，需要显式评估。**

### D. 插件 / 宿主运行时（外壳与第三方插件）

1. **out-of-tree 插件的 peer 规则**：`.agents/notes/implemented/architecture/2026-09-18-profile-plugin-host-runtime-instances.md` `## Decision`——宿主运行时中「跨实例身份敏感」的包（`@deepseek-ai/dsh-scope`、`@deepseek-ai/dsh-mcp-client`）在第三方插件里必须声明为 `peerDependencies`（+ `devDependencies`）而**不能**放 `dependencies`，否则 profile 会加载第二份模块、scope tag 按模块身份比较失败，出现 issue #4573 的「第二个 Agent 创建被拒」。`## Consequences` 还点名三个兄弟 provider 仍用 dependency 方式（issue #4628 跟踪）。
2. **Agent Teams 双包合并带动一次无解的兼容缺口**：`.agents/notes/implemented/architecture/2026-09-18-agent-teams-single-bundle.md` `## Consequences`——`@deepseek-ai/dsh-experimental-agent-team-web-profile` 从 workspace 与 release family 移除；「Existing profiles that select the removed Web bundle have an upgrade compatibility gap: **startup fails** when that package cannot be resolved. Bundle composition provides no automatic rewrite of those saved selections.」**这条破坏性变更没有 upgrade guide**（应该在 Sage 升级检查清单里显式处理旧 profile 的 `dsh.profile.bundles`）。
3. **Schedule 移出 Web 组合（有 guide）**：`docs/upgrade-guide/v0.1.7-rc.2/schedule-optional-bundle/guide.md` `## Change`——Web composition 不再携带 `time-context`/`schedule`/`ui-schedule`；由 `@deepseek-ai/dsh-experimental-schedule-bundle`（Plugins 页 Official 组「Automation tasks」，默认关）插入；旧 profile 按 id 开启过 Schedule 的会丢功能：loader 警告 `patch: entry schedule not found`、`schedule_*` 工具与页面消失、提醒停发（磁盘数据保留）。`## Migration` 给出 3 步（打开 bundle / 清理多余 `disabled: false` override / 重启确认日志无警告）。实现侧：`.agents/notes/implemented/architecture/2026-09-24-schedule-opt-in-optional-bundle.md`。
4. **可选 bundle 的官方清单与语义**：`.agents/notes/implemented/architecture/2026-09-21-experimental-capabilities-as-optional-bundles.md` `## Decision`——`OPTIONAL_BUNDLES` = Agent Teams、voice input、Auto review、Schedule；它们是**安装的运行时依赖**（默认关、不可卸载）；browser-use/computer-use provider 仍保持显式安装（约 85 MB / 21 包不进默认图）。

### E. CLI / 产品面（影响外壳调用方式）

1. `docs/architecture.md` `**Application launch**` / 应用段落 diff：profile 可用 `dsh <name>` 简写（`dsh web`）；**`plugin` 成为管理命令名**，名为 plugin 的 profile 必须写 `--profile plugin`。
2. HMR 语义改写：`docs/architecture.md` diff——「YAML controls HMR: base enables config-only `dsh-hmr`; headless, SDK and ACP disable it; `sdk-minimal` omits it. Profile patches override these defaults.」
3. Desktop（上游自家壳）架构换轨：`docs/architecture.md` diff——Electron Node mode、Host 走「shared CLI profile runner + 完整 Web application」、Web 拥有 RPC/streams、默认端口 **19387**（profile 可改）；`package.json` 描述 RPC 从「versioned framed byte pipes + `dsh-app://`」迁走。对 Sage 是参照而非直接接口，但说明 Host/Client 耦合面在变。
4. Web 路由挂载契约收紧：`.agents/notes/implemented/architecture/2026-09-17-web-feature-routes-and-route-gate.md` `## Decision`——feature 路由改为 document-relative（`OPEN_IN_APP_*_PATH`/`*_ROUTE` 等），新增 `verify-client-route-resolution` 门禁。对任何在反代/前缀挂载下跑 Web 面的消费者有直接影响。
5. transcriptView 默认展示变化（有 guide）：`docs/upgrade-guide/v0.1.7-rc.2/transcript-view-legacy-normal/guide.md` `## Change`——保存值 `normal` 在 Desktop/Web 显示为 `detailed`；非 Desktop Web（npm `dsh web`）缺失/`null`/非法值显示 `detailed`，Desktop 仍 `standard`；`## Migration` 一步改回 Standard。

### F. 子系统文档新增（读代码前的入口）

`docs/subsystems/` 新增：`boot`、`browser-use`、`computer-use`、`deliverables`、`mcp`、`office-to-pdf`、`otel`、`product-telemetry`、`ptc-runtime`、`ssh`、`voice-input`；删除 `code-runtime`（被 `ptc-runtime` 取代）。包分组新增 `host/`、`client/`、`mcp/`、`jobs/`、`goal/`、`schedule/`、`ssh/`、`ptc-runtime/`、`sandbox/`、`deliverables/`、`workspace/`、`attachment/`、`session-query/`、`storage/`、`extensions/`、`runtime-diagnostics/` 等（`639ed01:AGENTS.md:69` 区域与旧版对照）。

---

## §3 升级清单线索（给 Sage 的可执行清单草案）

按「必须先做」排序，全部可在上述证据里找到出处：

1. **版本对齐冻结**：确定一次性对齐的 release（0.2.0-rc.2）并锁定整组 `@deepseek-ai/*`；检查依赖树里是否存在其它 release 的传递依赖（A1：精度 pin + peer 恒等版本）。
2. **Session 数据**：确认 Sage 是否自己解析 JSONL/投影缓存；引入 V3→V4 语义（tool-role、developer-role、`turn/end` forked reason、parent catalog 补全）。若目标机器上有 V3 数据且需要在新 writer 下追加，先跑 `migrate:sessions-to-v4` 演练（B2/B4/B5）。
3. **设置迁移**：全仓搜索 `settings.yaml` 读写与 `$DSH_HOME` 全局设置假设；改为 profile 级 Cordis 配置/Plugin Manager 面（C1、C3）。
4. **旧 profile 清理**：检查 `profiles/*/cordis.patch.yml` 里按 id 的 `schedule`/`time-context`/`ui-schedule` override，以及 `dsh.profile.bundles` 里是否含已删除的 `@deepseek-ai/dsh-experimental-agent-team-web-profile`（启动会直接失败）；Schedule 开关迁移到 optional bundle（D2/D3）。
5. **插件依赖声明体检**：所有自研/外挂插件的 manifest，确认 `dsh-scope`、`dsh-mcp-client` 等宿主运行时包在 `peerDependencies` 而非 `dependencies`（D1）。
6. **默认行为审计**：session-log 上传默认开启（C4）；transcriptView 展示变化（E5）；HMR 是否还可用（E2）。
7. **接口面复查**：Plugin Manager / ConfigEditor / HMR 的新面（C3，`docs/subsystems/boot.md`）；Web 路由改动若 Sage 反代（E4）；`dsh <name>` / `plugin` 命令行（E1）。
8. **发布 note 缺口**：0.1.5-rc.2→0.1.7-rc.2 区间**没有 upgrade guide**，不要因为 `docs/upgrade-guide/` 只有两条就推断「破坏性变化只有两条」（§1）。

---

## §4 Clean items（查了但判定无消费方影响）

- `engines.node`、`packageManager`、根 `workspaces` globs：**未变**（见 §2-A5）。
- `scripts/release/families.ts` 的 version baseline / tag 命名 / dist-tag：**未变**，唯一变更是 publish set patterns（已计入 A2）。
- 根 `README.md` diff：仅改 Discord 链接、加 bibtex 引用、加一行 dev 命令说明——无消费方影响。
- `.agents/notes` 中 09-11～09-16 的大批内部施工注记（CI/发布基建、翻译配对、Windows 签名、benchmark、UI 细调）与 `.i18n.yaml`/`.zh.md` 重复件：跳过，无消费方影响。
- `docs/ui-radius.md`、website/VitePress 相关、`docs/dependency-catalog.json` 之外的生成目录（tool/config/client 三个 catalog）：内部生成物，无迁移含义。
- Windows 专属（EV 签名、`windows-observational-ready`、Wine gate、ACL 强制完整性）：Sage 当前平台不涉及。
- 测试基建类新增（`observation-waits-on-observed-state`、`spreadsheet-selection-by-keyboard`、snapshot fixture 等）：不改变产品契约。
- `pnpm-workspace.yaml` 的依赖版本 bump（pi-ai 0.85.1→0.87.1、node-addon 0.1.4→0.1.6、新 libreoffice-kit/trycua 例外）：仓库内构建输入，消费者只见最终发布物；`linkWorkspacePackages: true` 删除仅影响仓库本地链接行为。
- 本次未逐篇读完的 816 篇新增注记中，按文件名与关键词筛出的其余条目（`session-pin-and-sidebar-archive`、`chat-navigation-performance`、`focus-ring-brand-primary`、`window-drag-coverage-contract`、`desktop-close-to-background`、`compaction`、`todo`、`lsp`、`terminal` 等 UI/功能细项）：属产品自身行为，未发现需要 Sage 侧行动项。

---

## §5 深读清单（本次精读的注记/文档，证据按此文引用）

1. `docs/upgrade-guide/v0.1.7-rc.2/schedule-optional-bundle/guide.md`（全文）
2. `docs/upgrade-guide/v0.1.7-rc.2/transcript-view-legacy-normal/guide.md`（全文）
3. `.agents/skills/dsh-create-upgrade-guide/SKILL.md`（全文）
4. `639ed01:AGENTS.md` diff（L9/L11/L69/L131 区域）
5. `.agents/notes/implemented/process/2026-09-22-workspace-release-ranges.md`（全文）
6. `scripts/check-workspace-constraints.ts:575-608`（新树）
7. `.agents/notes/implemented/process/2026-08-10-npm-release-sequences.md` diff（`### Workspace-internal references…`）
8. `.agents/notes/implemented/process/2026-08-26-published-dependency-faces.md` diff
9. `.agents/notes/implemented/process/2026-09-12-publish-all-experimental-packages.md`（全文）
10. `.agents/notes/implemented/process/2026-09-12-experimental-publication-denylist.md`（全文）
11. `.agents/notes/implemented/process/2026-09-12-default-product-experimental-isolation.md`（全文）
12. `.agents/notes/implemented/process/2026-09-15-shipped-optional-bundles.md`（全文）
13. `scripts/release/families.ts` + `families.spec.ts` diff（新树 L322-362）
14. `docs/session-format-status.md`（全文 + diff）
15. `docs/persistence-changes/README.md` + `2026-09-16-session-format-v4.md`（`## Declaration` 全文）
16. `scripts/migrate-sessions-to-v4.ts`（文件头/接口）
17. `.agents/notes/implemented/architecture/2026-08-31-released-session-format-migrations.md` diff
18. `.agents/notes/implemented/architecture/2026-09-19-profile-owned-live-configuration.md`（全文）
19. `.agents/notes/implemented/architecture/2026-09-19-profile-resolution-lookup-order.md`（Part 1 全文）
20. `.agents/notes/implemented/architecture/2026-09-18-profile-plugin-host-runtime-instances.md`（全文）
21. `.agents/notes/implemented/architecture/2026-09-18-agent-teams-single-bundle.md`（全文）
22. `.agents/notes/implemented/architecture/2026-09-21-experimental-capabilities-as-optional-bundles.md`（全文）
23. `.agents/notes/implemented/architecture/2026-09-24-schedule-opt-in-optional-bundle.md`（全文）
24. `.agents/notes/implemented/architecture/2026-09-14-session-log-upload-default.md`（全文）
25. `.agents/notes/implemented/architecture/2026-09-17-web-feature-routes-and-route-gate.md`（`## Decision`）
26. `.agents/notes/implemented/architecture/2026-09-19-remote-duplex-stream.md`（`## Problem` 现状表）
27. `.agents/notes/implemented/architecture/2026-09-09-deprecate-synchronous-session-event-reads.md`（`## Decision`）
28. `.agents/notes/implemented/feature/2026-09-28-desktop-login-shell-environment.md`、`process/2026-09-22-desktop-main-bundle-after-workspace-tsdown.md`（`## Decision`）
29. `docs/subsystems/boot.md`（管理记录节）
30. `docs/architecture.md`、`docs/development.md`、`package.json`、`pnpm-workspace.yaml` diff

（注：`.agents/notes` 与 `docs/` 中的 `.i18n.yaml` / `.zh.md` 一律视为 `.md` 主件的重复件，未单独阅读。）
