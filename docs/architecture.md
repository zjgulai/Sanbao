# LUTE Agentic System · 架构与基座契约

本页是**有序地图**：只写组合、能力归属、扩展点与门禁契约；类型定义、逐包细节、决策理由一律在被链接的文档里（分层规则见根 [AGENTS.md](../AGENTS.md)）。

## 0. 仓库构成与门禁（2026-09-11 起）

| 层 | 位置 | 说明 |
| --- | --- | --- |
| 基座参照系 | `vendor/dsh-desktop/deepseek-harness/` | 上游源码参照系，pin 到 `fb2c4b9e`（`vendor/dsh-desktop.pin` 的 `harness-submodule`；运行时以 `harness-runtime-source` 为准 = 0.1.5-rc.2 物化），**只读、不参与构建**（[ADR-0008](adr/ADR-0008.md)） |
| 壳层 fork | `vendor/dsh-desktop/` | 嵌套仓库，pin 见 `vendor/dsh-desktop.pin`；改 pin 与行为变更分开提交 |
| 运行时来源 | `vendor/dsh-desktop/dsh-plugin-desktop/node_modules`（0.1.5-rc.2 物化，270/270 tgz） | 打包与 profile 实际使用的运行时产物；`vendor/dsh-runtime/0.1.2-rc.1/*.tgz` **仅作 2.0.5 回滚对照**保留，不再被构建消费（见 pin 注释与 [research/13](research/13-upgrade-2.0.10-execution-plan.md) §7-§8） |
| 二开插件 | `packages/<能力组>/<包>/` | 28 个受管包（`package-files-coverage` 门禁读数）按能力归入 5 组（[ADR-0011](adr/ADR-0011.md)）。**二期迁移已完成且兼容分支已退役**：`package-layout.mjs` 只认 `packages/<组>/<包>` 一种布局（2026-09-11 G7，此前「历史平铺」分支已无对象） |
| 自有薄壳 | `apps/lute-shell/` | LUTE 自有的 Electron 薄壳，用 npm 上的 harness 运行时启动 cordis host（脱离 `vendor/dsh-desktop` fork）；**不在 package collector 射程内**（`package-layout.mjs` 只下钻 `packages/<五组>/`），版本与治理事实由独立门禁守，详见 [ADR-0139](adr/ADR-0139.md) |
| 出海技能创作源 | `~/project/81-Skills/`（**仓库外**） | 81 个中文名原文，经 `dsh-overseas-skills/scripts/import-81skills.mjs` 转换后安装进 `~/.dsh/skills/`。2026-09-11 迁出仓库，与同包其余 3 个 importer（accio / marketing / fullstack）的「源在仓库外」设计一致 |
| 门禁 | `scripts/gate.mjs` | 单命令聚合校验，退出码即契约（[ADR-0014](adr/ADR-0014.md)） |

**归档出工作树的资产不在仓库内**：按 [ADR-0013](adr/ADR-0013.md) 的「归档出工作树」档，根层游离件（旧 bundle、预览 HTML 群、已完成的补丁项目等）移至 `~/project/_archive/Magpie-Horch-<日期>/`，**该目录内的 `README.md` 是归档索引**（逐项列来源与去向）；仓库内不再保留副本，回溯时去那里找。刻意**未**归档的两项也记在该索引里：`dsh-rootoutlet-heal/`（白屏手册 §6.1 的运行时回滚基线）与 `.dsh-types/`（ADR-0017 的生成物）。

门禁契约（`pnpm run gate` / `pnpm run gate:full`）：

| 校验项 | 阻塞 | 依据 |
| --- | --- | --- |
| `package-identity` | 是 | 每个受管 `package.json` 必含 `luteOrigin` / `luteOwner` / `lutePublish`（ADR-0012） |
| `pin-consistency` | 是 | `vendor/dsh-desktop.pin` 的 `harness-submodule` 必须等于子模块实际 HEAD（ADR-0008） |
| `lute-shell-pin` | 是 | 薄壳（`apps/lute-shell/`）的版本与治理事实：壳 devDeps 与 seed deps 两侧的 `@deepseek-ai/*` 都必须**非空、精确、同名包同版本**（npm `latest` tag 指向旧线，range 会静默漂移）；壳 `devDependencies.electron` 精确且等于 `vendor/dsh-desktop/dsh-plugin-desktop` 的同名 pin（参照缺失则跳过并进 note）；7 个帧协议常量不漂移于 submodule 参照，治理三字段取 `self`/`lute`/`false`，seed 用户层剥注释后恰为 `[]`，12 个 test fixture 保持被跟踪（[ADR-0139](adr/ADR-0139.md)） |
| `gitignore-whitelist` | 是 | 白名单条目必须指向真实路径，禁止幽灵条目（ADR-0013） |
| `adr-index` | 是 | ADR 编号连续、索引与文件一致（ADR-0015） |
| `adr-note-links` | 是 | ADR 的「决策记录」链接可达，且 Note 正文回引该 ADR 编号（ADR-0015） |
| `mutation-fixture-selftest` | 是 | mutation test 只在自有临时 `repo/home/profile/tmp` 内写入；prepare/commit、路径 containment 与 cleanup ownership 必须通过反向自测（[ADR-0097](adr/ADR-0097.md)） |
| `settings-shell-criteria-selftest` | 是 | Settings AX 只用 188px nav 与 28×28px close 独立校准；目标按钮不得参与 scale。合法 zoom、目标尺寸、锚冲突/缺失、错窗、权限和 timeout 由纯函数与 mutation 负控验证（[ADR-0098](adr/ADR-0098.md)） |
| `exemptions-frozen` | 是 | 豁免条目只减不增、期限不延后、到期即失败（ADR-0014） |
| `profile-files-sync` | 是 | profile 副本必须与包 `package.json` 的 `files` 清单一致：清单声明但源码无（陈旧清单）、源码有而副本缺（真缺件）都失败。盯 `node_modules`（真实装载点）；`vendor` 侧由既有 `profile-metadata-sync` 负责（见 `docs/notes/implemented/contract/2026-09-11-preset-lint-and-profile-files-sync.md`）。
**期望集**（分母）由 `gates/profile-coverage.mjs` 从「这份 profile 声明了什么」按**完整相对路径**推出，不是由「目标里恰好有什么」推出：坏 JSON 直接判红、期望集里的包在目标缺失判红、只允许「profile 根整体不存在」一种 skip（[ADR-0102](adr/ADR-0102.md)）。`profile-metadata-sync` / `profile-files-sync` / `profile-bundle-sync` 三面共用同一个期望集、各自结账 |
| `plugin-entry-contract` | 是 | 带 `dsh.bundle.patch` 的候选包：入口**按清单解析**（`exports['.']` 条件目标 → `main`）并跟随 `export * from` 转出口；候选分 `plugin-apply` / `plugin-service` / `library` / `unresolved` **四态且四态都进分母**，后两种判红。`apply` 型核对 inject 名单与**未加 `try` 防护**的 `ctx.<服务>` 属性访问；Service 型核对 `inject` 是否为 `static` 字段（[ADR-0102](adr/ADR-0102.md)，总账 P-02）。`plugin-entry-contract-selftest` 是它的反向自测 |
| `changed-packages` | 是 | 本次改动涉及的受管包必须已有 `typecheck` 与 `test`（ADR-0014）。射程 = `merge-base(HEAD, 基线)..HEAD` 与 staged / unstaged / untracked 求并集，rename 同时映射旧、新路径；基线按「CI 事件 SHA（`DSH_GATE_BASE_SHA`，须可达且确为 merge-base）→ 分支 upstream → `origin/main`」解析，**不含本地 `main`**（与 HEAD 常是同一对象，落回它就是自比较）；基线不可解析一律判红。根治理文件变更按已登记规则归类，工作区级的把射程扩到全部包（[ADR-0102](adr/ADR-0102.md)，总账 P-02） |
| `package-files-coverage` | 是 | **交付清单侧**（与上面两项的**装载点侧**互补，不是同一个判据）：包里运行时模块图上的每个文件都必须在 `files` 射程内。`pnpm` 对 `file:` 依赖按 `files` 物化，所以缺件命中的是**全新安装**而不只是发布面，而全新安装没有同步步骤可补救（[ADR-0101](adr/ADR-0101.md)，总账 P-24）。判定器与真实 `npm pack` 对全部受管包逐文件校准；`package-files-coverage-selftest` 是它的反向自测 |
| `skill-lines` | 是 | 三条技能线（出海 / AI全栈 / 通用）各自的验证器必须判绿。此前 `verify_static.mjs` 只写在 SOP §4 与 `pipeline.sh` 里、**不在 `pnpm run gate` 射程内**——规则只活在文档与人的自觉里（[ADR-0085](adr/ADR-0085.md)，总账 P-20）。本项与 `skill-runtime-preconditions` 是「装得上 / 跑得起来 / **挂得上**」三个不同问题各自的调用点；环境不在本机时跳过并写明（P-21） |

退出码：`0` 全部通过 · `1` 存在失败校验 · `2` 用法错误。`--list` 输出全部校验项名称。
跳过（skip）是**第三态**：日常模式下不改变退出码，但汇总行会独立成句地点名「未核对 N 项（不是通过）」；
**发布前那一次运行**用 `pnpm run gate:strict`（= `--require-no-skip`），skip 计为非零退出（P-17 / ADR-0148）。

## 1. DSH 基座事实（发行线 LUTE 2.5.0 = DSH 2.0.10 / runtime 0.1.5-rc.2；生产机现状**未核实**）

> 2026-09-21 更新（深度分析 TOP20 · DA-05）：发行线已到 **LUTE 2.5.0**——
> `packaging/release/2.5.0/VERSION` 读数 `DSH_BASELINE=2.0.10 / DSH_RUNTIME=0.1.5-rc.2`
> （2026-09-18 发布）；源码 pin 见 `vendor/dsh-desktop.pin`（`upstream-tag: v2.0.10` /
> `lute-branch: lute-v2.0.10`，checked-at 2026-09-17）。该窗口 **38 个补丁锚点全量重锚**
> （`verify-patches-v2.sh` 38 锚 ALL VERIFIED；登记簿
> [`dsh-patches/patches-manifest-v3.md`](../dsh-patches/patches-manifest-v3.md)），打包形态从 ASAR 改目录、
> 运行时 0.1.5-rc.2 物化 270/270（CHANGELOG 2.5.0）。
> **生产机（2026-09-10 观察为 2.0.4/alpha.1 的那台）现状未核实**（DA-12）：本仓与本研究机都没有
> 到那台机器的读数通道（无 SSH/远程面），按 P-01 写「未验证」而不是「应该升了」——拿到读数前
> 本行不做出货级断言；升级计划与滞留差异见 [research/09](research/09-audit-architecture.md) C 类与
> [research/10](research/10-debt-solution.md) 段 C。
> 旧的 2026-09-10 快照保留为历史引用：发行线 2.0.0 = DSH 2.0.5 / runtime 0.1.2-rc.1、35 补丁重锚、
> smoke 37/37。

- Skill 契约：`name` 必须英文 kebab（加载与运行时双重校验）；目录一层扫描；`.system` 跳过；frontmatter 首行必须是且仅是一个 `---`（重复 `---` 会静默忽略技能，见诊断案例 12）。
- 插件：`dsh.bundle` + profile `file:` 硬链接安装；bundles 列表注册。
- 设置页：`settings.section` Slot（id/order/label/locale）。Settings Shell 只有在 ARIA/DOM parser 唯一确认
  panel 后才添加 `data-dsh-settings-shell-root`，所有二开样式只消费该 marker；实况几何按
  [ADR-0098](adr/ADR-0098.md) 使用与目标控件不相交的 upstream 锚校准。
- 输入区：`conversation.input.*` / `sidebar.footer.action` / `shell.overlay`（ownerProps 以实测为准——历史教训：root 级 slot 无 inputActions）。
- 工具：`ctx.tools.register(defineTool(...))`；工具名 DeepSeek 契约（≤64 字符、[A-Za-z0-9_-]）；MCP 宿主直挂 `dsh-mcp-client`（ctx.plugin），工具名 `mcp__<server>__<raw>`（连字符原样保留）。
- 凭证：credentials 服务（resolve/set/describe），页面不回显；文件类配置 0600。
- 生效语义：宿主变更=重启；客户端变更=刷新；技能文件=watcher 热载；**MCP 挂载在宿主启动时解析凭据（token 必须先于重启写入凭据库）**。
- 同步语义：profile 副本同步一律 tmp+mv 原子替换（`cat >` 遇硬链接会双杀两文件）。**`file:` 依赖的副本是安装时刻的硬链接快照——安装之后新增的文件不会自动进去**，必须按 `files` 清单补（漏补的症状是「功能静默不生效 + 日志一句 warn」，2026-09-11 的 preset lint 全失效即此因）。
- **可选服务的读法**：`ctx.get(name, false)` 读不到就是 `undefined`（正常态）；**属性读 `ctx.<name>` 对未 inject 的服务会抛** `cannot get property "…" without inject`（cordis 的代理陷阱）。所以「可选」的判据一律包保护，且失败态按**最保守结论**走——栅栏读不到配对服务 = 拒绝，不是放行（[ADR-0038](adr/ADR-0038.md)；2026-09-12 实测：共享栅栏在生产里因此抛异常，被 webserver 兜成 400，其 `403` 分支不可达）。

## 2. 红线（改动前必读）

1. 只用内置 alpha SDK（@deepseek-ai/*），不引入 npm 发布线（防双实例）。
2. 不碰壳内 UI 的 shadows-shipped-ui slot（替换风险）。
3. 凭证永不落仓库/日志/模型上下文；子进程环境经凭证擦洗。
4. 编辑工具会打破 file: 硬链接 inode——改后必须 tmp+mv 同步 profile。
5. 补丁（patch-cn-slash 等）锚点为精确原文，restore 会回滚全部补丁。
6. MCP 工具模型侧描述不可覆写（dsh-mcp-client 无钩子）——业务中文层走「技能速查表」桥接（宿主 ensure*Skill 幂等写入）。
7. **官方 UI 改写锚禁止钉哈希**：有足够公开 ARIA/DOM 语义时，由唯一 parser 确认节点后添加二开
   marker，CSS 只消费 marker（Settings 见 [ADR-0098](adr/ADR-0098.md)）；没有足够公开语义、必须命中
   私有 CSS 节点时，按 [ADR-0019](adr/ADR-0019.md) 在运行时用官方样式标签的包路径锚
   `style[data-plugin-css="<包路径>/<模块>.module.css"]` 加模块局部名负向断言算出完整类名。两条路径都
   禁止把 CSS-module 哈希前缀写进产品代码或测试断言，解析失败必须自报并降级，不能静默失效。

## 3. 模块地图

见 README.md「平台组成」。详细文档：
- 出海：`dsh-overseas-skills/docs/`（maintenance-sop、skill-taxonomy-v2=分类 v3 终审稿、recent-changes-2026-09-08…）
- 万物互联：`dsh-wanzh-hulian/docs/README.md`（产品形态总览 + 交付历史 + 方案；最新见 mcp-connections-2026-09-08.md）

### 工程运行时能力图谱（提案）

受管包身份、宿主、desktop profile 声明态与优先解耦接缝见 [机器可读图谱](architecture/subproject-capability-graph.json)；讨论边界和后续任务见 [提案 Note](notes/proposed/architecture/2026-09-24-subproject-capability-graph.md)，五条接缝的取证、回退与验证读数见 [关系卡](architecture/seam-relationship-cards.md)。目录墙仍是包数量与治理字段的唯一来源，图谱不替代运行态验收。

### 万物互联当前形态（2026-09-09）

- 四板块：MCP 连接（4 服务器）/ API 连接（预留）/ 企业应用（Shopify + Apify）/ 知识库（得到大脑）
- MCP 服务器：getnote（stdio 38 工具 ✅）、pixpix（streamable-http OAuth PKCE 37 工具 ⚠️ 过期待重授权）、shopify（stdio 14 工具 ⚠️ 待应用安装）、apify（streamable-http Bearer 12 工具 ✅ 全绿）
- 认证注入：stdio `envRefs`；streamable-http `headerRefs`（Apify 首创）；OAuth PKCE（PixPix）
- 工具业务清单：`lib/business-meta.js` 单一数据源（14/37/38/12），UI 静态保底 + 实时增强；ToolZone 场景分组/示例口令/读写执行徽标
- probe 注册表：getnote / shopify-shop-info（客户端凭据交换）/ apify-user-info
- 技能同步四件：getnote-brain、pixpix-ecommerce、shopify-store-ops、apify-mcp

### 出海技能体系当前形态（2026-09-09）

- 分类 v3：`manifest/taxonomy-v3.json` → 8 大场景 / 28 细分 / 222 条；AI全栈 8 组 / 29 条；胶囊卡随 v3 改名
- catalog 生成：`build_preset_catalog.py`（勿手改 lib/catalog.js）；pipeline.sh 8 阶段（阶段 8 tmp+mv 防硬链接双杀）
- 图标：lute-brand-icons 角色头像（manifest 176 条目），assign_lute_icons.py 合并写防抹自定义图标
- 新卡：agent-browser（浏览器自动化）、self-improvement（知识进）；契约三键覆盖 237/248

### 岗位 Preset 体系当前形态（2026-09-19）

- **双命名空间**：`agt-001~050`（执行面，4 组织平面 × 8 责任域，材料根 role-catalog）+ `mgt-001~003`（管理层决策权平面，投影平面 PLN-EXC / DOM-EXC，order 基座 0 置顶渲染，材料根 management-catalog）。生成器 `scripts/role-presets/generate.mjs` 双装载分支；MGT 共享源与 AGT 共享源相互独立——**AGT 共享源（含 ROSTER.md）任何改动 = 存量 50 全量重生成**，动它们之前先读 [research/16](research/16-organization-audit-53-roles.md) §3.6；该纪律自 2026-09-21 起有机制兜底：`gate:role-preset-source-freshness`（`node scripts/role-presets/generate.mjs --check`，AGT/MGT 分别判、漂移点名共享文件）
- 校验三件：`verify-lossless.mjs`（AGT 12 层 + MGT M1~M12/M-D/M-T0/M-O 层）、`scripts/gates/live-presets.mjs`（身份账本 56 preset）、`audit-organization.mjs`（组织一致性审计，只报告不阻塞）
- 管理层姿态：**评估载体 + 本机装配**——profile 可加载、限 MGT-EVAL 与人在环演练、未授权 Shadow/生产、出货面 exclude 档；出货前置 = MGT-EVAL-A/B 通过 + R0 对照臂结论 + 另立 ADR。决策与理由见 [ADR-0129](adr/ADR-0129.md)（材料侧对应 D-065/D-066）。**复核于 2026-09-21**（DA-09，方向 = 维持不出货）：`node packaging/scripts/select-presets.mjs --from ~/.dsh/.agent-presets --into <暂存> --config packaging/shipped-presets.json` 读数 = 出货 52 个（岗位 50 + 登记 2：lute-cordis/agent-fullstack），**mgt-001~003 与 bobo-cto 明确不发（4 个）**——exclude 档仍被覆盖、本季度不出货
