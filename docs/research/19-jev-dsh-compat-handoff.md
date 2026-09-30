# JEV × DSH 兼容性插件交接（JEV 仓 → Sage 仓）

> 日期：2026-09-27 · 状态：**交接输入件（Sage 侧采纳与否待定）** · 来源：JEV 仓 `docs/deployment/sage-handoff.md` 同内容迁入（JEV 侧保留为撰写记录；后续更新以 JEV 侧为源、向本文件同步）
> 数据源：JEV 侧会话对两侧仓库的只读核对（JEV 侧契约细节见文末指针表）；写作期间对 Sage 仓**全程只读**，迁入时未改写正文事实。
> 纪律声明：本文是**盘点与交接**，不是授权、不是施工单。挂载、装配、宿主配置变更按本仓流程逐项批准；Sage 侧若采纳其中任何决策，按本仓规则落 `docs/notes/` + ADR 登记——**本文本身不是决策记录**。
> 路径写法：文中 `~/project/JEV` 指 JEV 仓本机位置；Sage 侧文件按本仓根相对路径书写。代码/命令请按仓规动态发现仓根（[AGENTS.md](../../AGENTS.md)），不要把本文中的路径当默认值。

## 0. 一句话

JEV 提供"判断层"能力（16 条判断 + 脱敏/出境纪律 + 已在真实材料上跑通的日报闭环）。它与 DSH 的相容面共 **六处**：**两处 Sage 已在用**（HTTP 客户端、出境边界门），**四处待集成**（MCP 工具面、浏览器只读试点、技能按需加载、闭环 CLI 的宿主入口）。

## 1. 盘点总表

| # | 相容面 | JEV 侧 | 宿主 / Sage 侧 | 现状 | 细节的家 |
|---|---|---|---|---|---|
| 1 | 判断服务（HTTP） | `src/{engine,registry,outbound,egress}/`、`judgments/*`（16 条，全部 `calibrated:false`） | `scripts/jev/*`（HTTP 直连；[ADR-0138](../adr/ADR-0138.md)） | **已成立**（Sage 侧为 legacy 门） | 两侧各自 |
| 2 | MCP 工具面 `mcp-jev` | `src/mcp/{server,main}.ts`（bin `jev-judgments`） | profile 挂载 `@deepseek-ai/dsh-mcp-client` | **现行 profile 接线已丢失；重装块已备** | JEV `tickets/005` |
| 3 | 浏览器（桥 ↔ 扩展 ↔ 试点） | 只读试点提案 + 本地采集器 + 就绪检查器 | `packages/capabilities/dsh-browser-local` + 扩展产物 v0.1.3 | **从未握手**；JEV 侧用户已决定"先不安装" | JEV `tickets/006/007`、`host-seams.md` |
| 4 | 技能按需加载 | 影子建议层（只读、恒 dry-run）+ preset 草案 | `packages/contract/dsh-skill-subset` / `dsh-skill-center-local` / `dsh-preset-lint-local` | **白名单未拍板**；机制证据齐 | JEV `tickets/008/009`、`host-seams.md` |
| 5 | 闭环 CLI 的宿主入口 | `scripts/intelligence-digest.ts`（dry-run / shadow + 批准文件） | 宿主今天**发现不到它** | **三路线待选（A/B/C）** | JEV `tickets/005`「复核二」 |
| 6 | 出境 / 凭据纪律 | 白名单脱敏 + 占位符 + egress 日志 + **人写**批准文件 | ADR-0138 D2 门（出境源必须 git-tracked）+ 凭据链 | **两侧各自成立、尚未对表** | 两侧各自 |

## 2. 逐项

### 2.1 判断服务（HTTP）——Sage 已在用

- **JEV 侧**：`JudgmentEngine` + 弹性传输（硬超时 5 s、连续 5 次失败开熔断、冷却 30 s；JEV ADR-0003）+ 出境脱敏（白名单 + 占位符 + `~/.local/state/jev-dsh/egress/` 请求日志）。判断注册表 16 条、四组（compliance / adintel / compaction / loop），**每一条 `calibrated:false`**——任何 `judge` 结果的 `action` 恒为 `"uncalibrated"`。
- **Sage 侧**：`scripts/jev/{client,questions,samples,corpus-review,scorecard,triage,egress-boundary}.mjs` + 三个 legacy 门（`jev-tier15-freshness` / `jev-egress-boundary` / `jev-residuals`），`scripts/gates/exemptions.json` 为空；残差 5 条（2 条 open：thresholds 未标定、project-skill 重复，见 `scripts/gates/jev.residuals.json`）。凭据链 `LUTE_JEV_API_KEY` → `~/.dsh/.credentials.yaml` refs → repo `.env` → `$DSH_HOME/.env`。
- **共性红线（两侧都已踩过）**：模型串**必须带补丁位**——`jev-1.13.0` 有效，`jev-1.13` 会被拒且整批全灭（JEV 侧 2026-09-27 真实调用实测）。Sage 的 `questions.mjs` 已钉 `jev-1.13.0`；这是一枚**跨仓共用常量**，模型升级时要两边同步。
- **待办**：无。可选项：把"模型串联动"写进某一侧的门（避免一次升级只改一边）。

### 2.2 MCP 工具面 `mcp-jev`——重装块已备、接线未装

- **形态**：JEV 的 stdio MCP server，server name `jev-judgments`，**恒定两个工具**：`list_judgments` 与 `judge`（JEV ADR-0002：加领域不加工具，控制宿主上下文占用）。env：`JEV_JUDGMENTS_DIR`（默认包内 `judgments/`）、`JEV_STATE_DIR`（默认 `~/.local/state/jev-dsh`）、`TYPESAFE_API_KEY`（缺了直接 `exit 1`，**无 dry-run 模式**）。
- **现状**：2026-09-19 曾端到端验证；此后 profile 改写中接线丢失（现行 `cordis.patch.yml` 无 `mcp-jev`，09-19 备份也不存在；`~/.dsh/integrations`、`storages/dsh.sqlite`、应用数据目录均无）。本仓 `.scratch/review/2026-09-22-arch-health-top20/HANDOFF-CODEX.md`（[本仓记录](../../.scratch/review/2026-09-22-arch-health-top20/HANDOFF-CODEX.md)）也记过同一缺失（`/6 mcp-jev` insert 丢了、未恢复、无授权）。
- **重装块（可直接应用，已对现行安装校准）**：在 JEV `tickets/005`「重装 mcp-jev」节（含备份/预飞/验证通道五步）。**三个不可省的细节**：① 必须 `insert:` 包装（否则条目被当"覆盖条目"静默丢弃）；② 凭证必须 **spawn 时 source**（基座会清洗子进程环境里的凭证形状变量）；③ node 用**绝对路径**（Finder 启动的 app 没有 PATH）。基座 `@deepseek-ai/dsh-mcp-client@0.1.5-rc.2` 仍在（profile 与应用侧各一份、同版）。
- **验证通道**：进程 `pgrep -f "JEV/src/mcp/main.ts"`；宿主日志（注意数据目录已随 productName 改为 Sanbao）里 `mcp-client(jev)` 零告警；被调过 → `~/.local/state/jev-dsh/egress/payloads-*.jsonl` 出现请求行；端到端调一次 `mcp__jev__list_judgments`（只读）。
- **给 Sage 的决策**：装在**哪个 runtime**——legacy profile（[AGENTS.md](../../AGENTS.md) 明确"不得把 `~/.dsh` 当作 Sage 运行时"、`~/.dsh` 装配走 ADR-0061 的 profile 本地装配），还是等 Sage 自己的**插件装配契约**（AGENTS.md 自认"尚未建立"）。这是本交接里**第一个该定的事**：它决定后面每一项的落点。

### 2.3 浏览器（桥 ↔ 扩展 ↔ 只读试点）——从未握手；"先不安装"是 JEV 侧用户 2026-09-27 的决定

- **宿主包（本仓有）**：`packages/capabilities/dsh-browser-local`——注册 11 个 `browser_*` 工具（snapshot/click/type/press/scroll/navigate/back/forward/reload/get_text/wait），经 **token 鉴权的 WebSocket 桥** `/ext/bridge` 派发 `tool.call`；升级后进入 pending，**只收 `hello` 帧**、超时踢、通过后进唯一活跃槽位；token 来自 config / `DSH_EXT_TOKEN`，否则生成到 `~/.dsh/ext-bridge-token`（0600）；发现端点在 `/ext/bridge-config`（仅 loopback；返回 `ws://127.0.0.1:<webServer.port>/ext/bridge`）。`cordis.patch.yml` 插入 `bridge-browser`（`@yuxianglin/dsh-bridge-browser`），参数 `toolTimeoutMs 90000`、`snapshotMaxChars 32000`、`maxInteractiveItems 60`。**注意：JEV 检查器里的端口 43120 只是按旧 DSH Desktop 实测钉的常量；权威是发现端点，不是常量。**
- **扩展侧（本机两份都有）**：可加载产物 `~/.dsh/browser-extension/`（v0.1.3，`background.js` sha256 前缀 `1672060fe8e3426d`）+ 全源码 `~/.dsh/dsh-browser/extensions/dsh-browser/`（含 `src/tests/dist`）。装法（官方 README）：Chrome → 加载已解压 → 指向产物 → 打开侧边栏自动发现桥 URL；token 在 loopback + `chrome-extension://` 源可免贴。
- **源码级契约（已核对，可直接用）**：元素编号跨快照**稳定**（弱引用双注册表）；过期编号**fail-closed**（明确文案中止、无位置回退）；快照视图有 `version` 字段但**路由层与能力协商都不校验**；扩展侧**没有**遮挡/可见性/pointer-events 的执行前检查；导航会清空编号状态。快照文本带 `UNTRUSTED_PAGE_CONTENT` 边界标记。JEV 的 `browser-preview.ts` schema 与上游 `SnapshotView` 字段级一致。
- **本机实测状态**：保留日志里 `bridge.listening` 197 次，但 **`hello.ok=0`、零 `browser_*` 调用**——**从未握手**；就绪检查一条命令（在 JEV 仓内跑）：`node .scratch/jev-practical-migration/check-browser-gate-readiness.mjs`（收据 `browser-gate-readiness.json`）。
- **只读试点提案（JEV 侧已写好，可直接采用/改写）**：只读四工具（snapshot / get_text / wait / scroll）、≤8 步、仅 `momcozy.com` 公开页、**页面由用户自己打开**（不需要导航工具）、逐步证据（captureId + snapshotHash + index + 返回 + 时间戳）、任一步失败即停不重试；点击类与跨站导航**明确留到下一道门**。全文与 9 项就绪清单在 JEV `tickets/007`；现场步骤与故障分支在 JEV `batch-runbook.md` §7。
- **给 Sage 的决策**：① 在哪个 runtime 装扩展（决定桥的装配与端口）；② 9 项清单里"原子遮挡/感知检查"两侧都不存在——提案的做法是用**只读工具选择**绕开它的失败模式，接受与否要明确；③ 试点挪到 Sage 还是留在旧 DSH 环境。

### 2.4 技能按需加载——机制证据齐、白名单未拍板

- **宿主组件（本仓）**：`packages/contract/dsh-skill-subset`（白名单 + `hideOthers`；`respectFileFlags` 默认 false——**注意：默认值会让文件开关失效**；运行时注册必须带非空 `source`，2026-09-16 有 89 条技能踩过"注册成功、调用即炸"）、`dsh-skill-center-local`（附带逐字保留其余行的原子改写器）、`dsh-preset-lint-local`（preset 校验器）。
- **关键实测（2026-09-26，工具 `measure-skill-catalog.mjs`，收据 `skill-catalog-baseline.json` 在 JEV 侧）**：`~/.dsh/skills` 下 SKILL.md 共 **1,806**；`disable-model-invocation` 裸 `true` 201 / 裸 `false` 147 / **带引号 `"true"` 1,390** / 带引号 `"false"` 18 / 无键 50 ⇒ **模型可见 1,605、真正关闭 201**。两个解析器都**不认带引号的布尔** ⇒ **1,408 个"想关没关上"的技能今天仍可见**；可见面 description ≈ **217,228 字符**（≈54k tokens）。`user-invocable` 无任何 false。
- **JEV 侧**：影子建议层 `src/intelligence/{skill-suggestion,skill-questions}.ts` + `scripts/intelligence-skills.ts`（只读文件、**恒 dry-run**、无真实调用入口）；preset 路线草案 `009-preset-draft/agent.cordis.yml`（宿主自带校验器正/负控已过：草案 exit 0、乱填技能名被点名拒绝）。两份独立证据：目录测量收据 + 运行时探针 `runtime-skill-probe.json`（0.1.5-rc.2 材料化包：允许/拒绝路径 + dispose 清理）。
- **杠杆提示**：009 的真正杠杆可能不在"新增白名单 preset"，而在**把 1,408 个带引号布尔改对**（或修解析器）——两条路线的批准范围完全不同。
- **给 Sage 的决策**：路线（preset 白名单 vs 修写法/解析器）、名单、是否允许写宿主目录、观测窗口与净收益阈值（无净收益即按回滚清单还原）。

### 2.5 闭环 CLI 的宿主入口——三路线待选

- **JEV 侧**：`scripts/intelligence-digest.ts`（导入 → 六维判断 → 深挖 → 带原文证据日报）+ `src/intelligence/*` 与对应批准/核验工具链。**已在真实材料上完整跑通**：JEV `evidence/intelligence/momcozy-shadow-003/`（6/6 `answered`、深挖 `draft`、20 条 claims 全部 exact-span 定位、19 `supported`+1 `insufficient`，全部为真实调用——收据在 JEV `evidence/MANIFEST.md` 的「情报回环」段）。
- **问题**：宿主今天**发现不到它**——`src/mcp/server.ts` 只有两个判断工具（设计如此，见 §2.2）。所以"在宿主真实通路使用该闭环"需要一条路线：
  - **A（新增一个 MCP 工具包住闭环）**：如 `digest_preview`（只读 dry-run，只回摘要与本地路径，正文不出境）；shadow 仍必须**人写批准文件**（工具不得生成 `approved:true`——JEV 的"一次批准=一次运行"纪律）。**代价：改 JEV `src/` ⇒ 现行批准包作废、要重建一版并重跑核验**——对 Sage 而言就是一次普通的新开发。设计约束（材料按路径传、输出只回摘要、谁能触发）在 JEV `tickets/005`「若你选路线 A」节。
  - **B（不加代码）**：宿主用已有 shell/命令类工具跑 CLI，把"可发现/可调用/可追踪"落在宿主调用记录上——需要用户明确认可"宿主发起的 CLI 调用"算集成。
  - **C（收窄）**：只做"CLI 闭环 + 宿主可跑"的证据，MCP 工具化另立一票。
- **给 Sage 的决策**：选哪条；选 A 时把"材料怎么进、输出给什么、谁能触发"三个问题答完再动手。

### 2.6 出境 / 凭据纪律——两侧各自成立，集成时**必须对表**

- **JEV 侧**：状态白名单脱敏 + 占位符映射 + egress 请求日志（本地 0600，泄漏审计每次执行真跑校准）；真实调用前必须 dry-run + **用户写**批准文件（严格对象：多写字段会被点名拒绝）；**一次批准 = 一次运行**；额度与输出上限由程序强制。凭据只从**运行进程显式提供的环境或用户指定落点**内存取用，不展示、不复制、不落盘。
- **Sage 侧**：ADR-0138 D2 的运行时门——出境语料的**源必须 git-tracked**（存在 + 在某 git 仓内 + 被跟踪），已织入两个 loader；凭据链见 §2.1。残差登记在 `scripts/gates/jev.residuals.json`（**"tracked ≠ clean"** 是已登记的接受项）。
- **对表清单（集成前必须写清的三个问题）**：① 哪个进程读哪份凭据（JEV 用 `TYPESAFE_API_KEY`/`DEEPSEEK_API_KEY`，Sage 用 `LUTE_JEV_API_KEY` 链——**同一批文件的不同读法，不要双重读取**）；② 谁的 egress 记录是权威（JEV 的 CLI 自带 egress 日志；Sage 门的记录在跑批脚本侧）；③ Sage 的 BASE 门禁与 JEV 相关检查的归属——现状：Sage 的 jev 门全部是 **legacy-only**（`FORBIDDEN_IN_SAGE` 明确点名），"JEV 进 Sage BASE"要先有装配契约再谈。

## 3. 证据边界（读这份文档时请带着）

**已证**：
- JEV 判定 + 深挖闭环在真实材料上端到端成立（回执与哈希见 JEV `evidence/MANIFEST.md`「情报回环」段；未标定 ≠ 不可用，标定与否在每个判断的 `calibrated` 字段）。
- JEV 的降级语义（超时/熔断 → `degraded:true`、无 `value`、`action` 保持 escalate 语义），韧性参数落地于 MCP server 与 CLI。
- Sage 的 HTTP 客户端、三个 legacy 门、ADR-0138 的出境边界门（含反向测试）。
- 桥与扩展的**源码级**契约（编号稳定/失效 fail-closed/无 generation/无遮挡检查/快照 version 无人校验）。
- 技能目录测量（1,806 / 1,605 / 201 / 1,408）。

**未证（不要当已有）**：
- 扩展**真机握手**——本机日志从未出现 `hello.ok`；"安装实例与源码一致"从未对齐验证。
- 遮挡/感知/权限的**原子执行检查**——宿主与扩展两侧都没有；`executionAllowed:false` 仍是正确读数。
- 闭环经宿主**可发现可调用**（§2.5 路线未选、未做）。
- Sage 的**插件装配契约**——[AGENTS.md](../../AGENTS.md) 自认尚未建立；本交接的多项决策依赖它先落地。
- 两侧的阈值标定（全部 `calibrated:false`；JEV 侧同一事实，Sage 残差里也登记为 open）。

## 4. 给 Sage 的建议顺序

1. **先定插件装配契约**（AGENTS.md 的"尚未建立"项）——JEV 这类"判断层能力"以什么形态挂进 Sage（MCP client / 本地服务 / 其他）。这一项定了，2~5 的落点才有意义。
2. **装配 `mcp-jev`**（重装块已在 JEV `tickets/005`，三个坑照抄即可；宿主配置变更要单独批准）。
3. **浏览器**：定 runtime → 装扩展 → 过 9 项清单 → 跑只读试点（提案现成）。
4. **技能**：先在"preset 白名单"与"修 1,408 个带引号布尔"之间选路。
5. **闭环入口**：A/B/C 三选一；选 A 按 JEV `tickets/005` 的三个设计问题先答后做。
6. **对表出境/凭据**（§2.6 的三个问题），再谈任何跨仓自动化。

## 5. 参考指针（JEV 侧，均在 JEV 仓内）

| 主题 | 文件（相对 JEV 仓根） |
|---|---|
| DSH 宿主接缝全量核对（技能/浏览器/MCP 面/可见性机制） | `.scratch/jev-practical-migration/host-seams.md` |
| MCP 装配指南（含调试/监控/FAQ） | `docs/deployment/mcp-integration.md` |
| MCP 三路线与重装块 | `.scratch/jev-practical-migration/tickets/005-live-dsh-acceptance.md` |
| 浏览器试点提案与 9 项清单 | `.scratch/jev-practical-migration/tickets/007-browser-live.md` |
| 技能两票（影子建议 / 按需加载） | `.scratch/jev-practical-migration/tickets/008-skill-shadow.md`、`tickets/009-skill-on-demand.md` |
| 运行手册（现场步骤与故障分支） | `.scratch/jev-practical-migration/batch-runbook.md` |
| 闭环真实运行的回执与哈希 | `evidence/MANIFEST.md`「情报回环（intelligence）」段 + `evidence/intelligence/momcozy-shadow-003/` |
| JEV 判断总表与工具描述 | `docs/tools/{list_judgments,judge}.md` |

> 交接状态：本文件于 2026-09-27 由 JEV 侧会话迁入本仓（JEV 原稿：`~/project/JEV/docs/deployment/sage-handoff.md`；如两稿不一致，以 JEV 侧为源）。**JEV 侧未在本仓写入任何其它文件**；浏览器扩展的安装被 JEV 侧用户明确推迟（2026-09-27「先不安装」）；门③（浏览器试点）与门⑥（DSH 闭环）的后续动作，按本文 §4 的建议顺序由 Sage 侧决策。
