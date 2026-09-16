# 当前产品形态与架构审计快照

- 快照日期：2026-09-16
- Git 锚：`main@af5f2ede6092a38fcb7d119571667771004bf416`
- 用途：为目标 Spec、基座迁移和分阶段 tickets 提供当前形态输入
- 证据性质：代码/文档/Git/profile 的 E0–E2 审查；不是当前 live UX、clean-machine 或生产验收

## 1. 系统定义

LUTE Agentic System 是 DeepSeek Harness Desktop 的二开产品平台，而非一个独立插件。它把 pinned DSH runtime、Desktop shell fork、本地能力包、profile、产品 surfaces、治理门禁和 offline DMG 装配成一个可扩展系统。

```text
Pinned base
  Harness runtime tgz closure
    + Desktop shell / patches
      + profile dependencies / bundles / cordis.patch
        ├─ Host services: Agent, Session, Tools, MCP, Credentials, WebServer
        ├─ Client services: Connection RPC, Slots, Locale, Theme
        ├─ Product capabilities and surfaces
        ├─ Local state / session / audit / indexes
        └─ Packaging / signing / installer / DMG / release evidence
```

目录的五组分类是治理归属，不是纯技术层：Capabilities 可以带 UI，Surfaces 可以注册 tools，Infra 可以形成独立多用户产品，根包则承载发布控制面。

## 2. 三种产品清单必须分开

| 清单 | 数量/状态 | 含义 |
| --- | --- | --- |
| Release / HEAD managed baseline | 25 个受管单元 | 根包 + 24 个已跟踪 package；是架构比较基线 |
| Dirty candidate catalog | 26 个单元 | 加上整包未跟踪的 `dsh-settings-shell-local`；尚不可视为交付 |
| Live profile | 取决于本机 bundles/profile/skills | 能证明当前机器的挂载与运行候选，不能证明 clean source 或 DMG |

Fullstack 也必须分为四个集合：release 30、HEAD 70、dirty catalog 138、live preset whitelist 89。四者分别表示历史出货、已提交能力、当前候选 catalog 和本机选择；任何 UI、文档或验收都应显示集合名与分母。

## 3. HEAD 的 25 个受管单元

### 3.1 Capabilities（7）

| 单元 | 产品职责 | 关键依赖 | 当前重点风险 |
| --- | --- | --- | --- |
| `dsh-browser-local` | 浏览器连接、快照与 `browser_*` tools | WebServer、Agent lifecycle、WebSocket token、浏览器扩展 | 直接监听 `agent/session-start`；上游 event 迁移高风险 |
| `dsh-deepresearch-local` | 研究规划、用户确认、多 Agent 执行、报告与 overlay | SQLite、subagents、search/fetch、client slots | 长任务恢复、provider/tool 失败和 dialog/a11y |
| `dsh-loopx-plugin` | `/loopx`、GoalBar、Goal 驱动与被动续跑 | Python/LoopX CLI、Agent inbox/lifecycle、session binding | 邻接 AgentLoop 内部；child env 与供应链未闭合 |
| `dsh-overseas-skills` | 出海/Fullstack 技能发现、开关与 preset | Skills registry、Settings slots、manifest、file watcher | 138/89 射程、第三方 intake、并发 dirty 候选 |
| `dsh-overseas-tools` | Exa 搜索 host tool | Credentials、Tools、外部 API | credential/network error 边界与固定依赖 |
| `dsh-paper2skills` | 1338 paper cards 的构建时导入、分类和安装 | 构建脚本、manifest、Skill consumers | 属供应链能力，不应被描述为 runtime 产品包 |
| `dsh-wanzh-hulian` | Settings 万物互联、知识库、MCP/API/native tools | Credentials、MCP client、Tools、WebServer、远程服务 | Shopify host、MCP provenance、OAuth、持久化与请求限制 |

### 3.2 Surfaces（7）

| 单元 | 产品职责 | 关键依赖 | 当前重点风险 |
| --- | --- | --- | --- |
| `dsh-agent-team-gui-local` | Members/Teams、Team/Solo、Run Center/Insights | Agent/Session、Connection RPC、slots、provider、持久化 | internal lifecycle/RPC、管理动作错误恢复 |
| `dsh-algo-skills-local` | 算法技能、4-plane、领域/岗位/paper cards | preset manifests、p2s skills、WebServer、watcher | 多集合口径、发现性能、状态真实性 |
| `dsh-my-quotes` | “我说”搜索、复制、重分类与 AI refine | Sessions、LLM、本地派生索引、zstd disk reader | 默认扫描/存全文、无 opt-in/clear/retention、模型出站披露 |
| `dsh-newapp-local` | Products / Systems 新应用抽屉 | product roots、role roster、sessions、agentPresets 双通道 | Reload 只刷新 Products；Systems 无一致 retry |
| `dsh-role-matrix-local` | 50-role 两级矩阵、搜索与详情 | WebServer、preset manifest、sidebar DOM injection | DOM anchor、能力成熟度和营销口径 |
| `dsh-skill-center-local` | Browse/Developer、开关、创建、移入废纸篓 | Skills、filesystem、workspace、paired/loopback boundary | telemetry 事实漂移、dialog/tabs/focus/a11y |
| `dsh-task-board-local` | Conversation Task Board 与任务 tools | Tools、Skills、Sessions、WebServer、项目 JSON | 并发持久化、session/slot 兼容和状态恢复 |

### 3.3 Platform（7）

| 单元 | 产品职责 | 关键依赖 | 当前重点风险 |
| --- | --- | --- | --- |
| `dsh-auto-compact-local` | `compact_now` 与空闲压缩 | Agents、Tools、timer、preset compaction | lifecycle 与取消时序 |
| `dsh-cost-guard-local` | 扫描、预算、判定与 cost ledger | sessionController、events、pricing | session vocabulary、价格事实源、错误恢复 |
| `dsh-file-upload-local` | Composer Files/Skills/Apps 附件 | Agent cwd、filesystem、WebServer、LoopX | 文件 containment、权限和 clean-up |
| `dsh-rename-conversations` | 会话标题探测与改名 | sessionController | official rename API 漂移和批量错误 |
| `dsh-root-brand-local` | Sidebar/Hero 品牌 slot 与 fallback | UI slots、CSS module selector | 上游 DOM/module rename 导致静默消失 |
| `dsh-theme-local` | light/dark/system 与 token 持久化 | Locale/theme、localStorage、CSS fallback | token contraction、module/DOM 漂移 |
| `dsh-ui-polish-local` | 聊天宽度的被动 UI 调整 | client CSS | CSS scope 与宿主页面回归 |

### 3.4 Contract（2）

| 单元 | 产品职责 | 关键依赖 | 当前重点风险 |
| --- | --- | --- | --- |
| `dsh-preset-lint-local` | 启动扫描与 watcher，发现 preset 违规 | filesystem、bundled linter、preset roots | watcher 射程、worker/PTC vocabulary |
| `dsh-skill-subset` | 按 preset 控制 skill 注册/可见性 | Skills registry、本地 skill root | catalog/selected/enabled 三态混淆 |

### 3.5 Infra（2）

| 单元 | 产品职责 | 关键依赖 | 当前重点风险 |
| --- | --- | --- | --- |
| 根包 `lute-agentic-system` | catalog、gates、profile/preset、assemble、release、DMG | pinned vendor、live snapshot、scripts、manifests | clean source、gate 真实性、artifact/release 字节链 |
| `dsh-team-hub` | LAN gateway、登录、admin、成员代理 DSH | HTTP/WS、internal RPC/events、session/audit/config | 默认 `0.0.0.0`、无 TLS 正式模式、route default-deny、文档漂移 |

### 3.6 Dirty candidate：Settings Shell（第 26 单元）

`dsh-settings-shell-local` 试图统一 Settings navigation/grouping，但当前整包未跟踪，`package.json` 导出 `lib`，而候选 `.gitignore` 忽略 `lib`。本机存在构建产物或 live mount 不能证明 clean checkout 可构建。

其全局 CSS 选择器命中所有 `[role="dialog"][aria-modal="true"]`，可能把 Skill Center、Deep Research 等非 Settings dialog 强制改成 Settings 尺寸。必须先给真正的 Settings panel 添加自有 marker，再将全部 CSS 限域，并用非 Settings modal 作为负控。

## 4. 用户旅程与断点

### 4.1 安装与首启

```text
DMG → installer → App → TCC → profile → Provider → reload/restart → first task
```

当前缺一个统一 Health Center 来解释版本、签名、TCC、Provider、profile、package loadpoint、连接和 reload/restart。用户必须跨 README、Settings 和日志推断状态。

### 4.2 发现与启动

```text
New App / Role Matrix / Algo Skills / Skill Center
  → 选择 Product / System / Role / Skill / Team
    → Composer / Session
```

当前信息架构以技术包/入口为中心，Product、System、Role、Skill、Preset、Team 的关系缺少单一成熟度账本。建议围绕“找到方式—配置可用—执行恢复”重组，并保持各 surface 的治理边界。

### 4.3 配置与连接

```text
Settings → credential/config → host service → external probe → state presentation
```

必须区分：Declared、Installed、Loaded、Configured、Connected、Outcome-verified。API route 存在、credential 已保存或 probe HTTP 200 都不能单独等于“可用”。

### 4.4 执行与恢复

```text
Session / Preset / Team / Browser / Research / Tools
  → Run Center / Task Board / Cost Guard / diagnostics
    → retry / cancel / compact / rollback / support bundle
```

当前各能力有自己的错误和重试语义；缺少跨产品的 async error、cancel/dispose、retry、partial success 和 support bundle 模式。

## 5. 状态、数据与信任边界

| 状态/数据 | 权威面 | 主要消费者 | 风险 |
| --- | --- | --- | --- |
| Vendor pin/runtime tgz | `vendor/dsh-desktop.pin` + runtime manifest | shell、package deps、DMG | 只换一层导致 runtime 双实例/类型分裂 |
| Profile dependencies/bundles/patch | profile + generator/sync | all host/client packages | live profile 与 clean source 分叉 |
| Credentials | DSH credentials service | Wanzh、Overseas Tools、MCP | 未验证 host、跨 server/env 泄漏 |
| Sessions | official Session APIs + disk format | Teams、Task Board、Quotes、Cost、preset refs | 同步 reader、V2/V3、旁路 parser 与 rollback |
| Local JSON/SQLite/index | 各 package | Research、Team Hub、Task Board、Quotes | 非原子写、schema 漂移、隐私/删除 |
| Skills/catalog/preset | manifests + registry + filesystem | Skill Center、Algo、Roles、Fullstack | catalog/whitelist/enabled/approved 混淆 |
| Release artifacts | source/payload/app tar/DMG/tag/manifest | installer、feed、customer | 测 staging 不测 final、版本重制、机器状态取件 |

## 6. 横切架构热点

### P0

- Shopify host 与 credential exfiltration；本批 `SEC-RT-001` 处理本地契约。
- 所有 destructive path 的 canonical containment 与 batch transaction。
- 第三方技能/MCP/LoopX 的 immutable provenance、digest、license、approval 和 offline closure。
- Team Hub 产品信任区与 unknown route default-deny。
- Gate 三态、真实分母、checked=0、mutation 校准与工作树零副作用。
- Settings Shell clean-checkout 构建与 CSS ownership。
- My Quotes opt-in/clear/retention/model-transfer boundary。

### P1

- Health Center + capability maturity ledger。
- New App Products/Systems 同步 refresh/retry。
- 跨 surface dialog/tabs/focus/keyboard/live-region 契约。
- Team Hub Admin Promise error handling 和危险操作确认。
- Fullstack 138/89 的 progressive disclosure、virtualization 和性能预算。
- Session、RPC、event、MCP、PTC 的上游兼容 adapters。

### P2

- 版本/包数/bundle/能力状态从 manifest/catalog 自动生成。
- 默认脱敏 support bundle 与 outcome metrics。
- 明确 Paper2Skills 的供应链定位、Team Hub 的产品/商业定位。
- SKU、授权、更新权益、SLA、第三方许可证和数据责任。

## 7. 上游迁移最敏感的 seams

| Seam | 当前直接耦合 | 迁移失败表现 |
| --- | --- | --- |
| Runtime closure | 242 个带 digest 的 tgz、Desktop resolutions、各包 lock/tarball | Cordis service 双实例、编译/运行类型分裂 |
| Patch behavior | verifier 覆盖 38 个 marker | marker 存在但执行路径不可达、bundle anchor 漂移 |
| Agent lifecycle/inbox | Browser、LoopX、Teams、Auto Compact | 漏驱动、重复副作用、取消/恢复错误 |
| Session APIs/disk | official API + My Quotes/preset direct readers | 静默停更、数据双根、回滚不可读 |
| Client slots/RPC | Settings/conversation slots、`rpc.call`、generation fallback | UI 无入口、scope/props 错、重连失效 |
| MCP/Tools/Credentials/WebServer | Wanzh 直接服务注入 | 工具缺席、OAuth/header/env 漂移、权限旁路 |
| Profile/packaging | file deps、hardlinks、embedded profile、app tar | 本机绿、DMG 缺件或装载旧字节 |
| Signing/TCC | bundle identity、签名封条、最终 bytes | Gatekeeper/TCC/Keychain 重新授权或失效 |

详见 [上游基座兼容与迁移方案](UPSTREAM-BASELINE-AND-MIGRATION.md)。

## 8. 当前证据与未验证项

已验证：Git/remote/tag/dirty 状态、目录/manifest/package 架构、关键调用路径、pin、现有 SOP 与本地目标 package 的 unit/typecheck。

未验证：

- 当前运行中 DSH 的像素、键盘、focus、reload、RPC、tools 和 network；
- clean checkout 的 26 单元候选构建；
- paired upstream canary、patch replay、Session migration；
- exact final DMG fresh/N-1/rollback、Developer ID/notary/staple/Gatekeeper；
- GitHub CI/ruleset、public download bytes、客户 canary 和生产接受。

以上未验证项必须保持各自证据层级，不能被本地测试或本机 profile 推断替代。
