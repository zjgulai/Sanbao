# Changelog

本项目遵循语义化版本，版本号 = git tag = 打包版本（1.x 序列；历史 v0.1.0 视为早期实验）。

## [Unreleased] - 2026-09-14

## [2.5.0] - 2026-09-18（DSH 基座 2.0.5→2.0.10 / runtime 0.1.5-rc.2 迁移）

### 基座迁移

- **38 个补丁锚点全量重锚**（`packaging/verify-patches-v2.sh` 38 锚 ALL VERIFIED）：上游这一跳同时改了
  打包形态与运行时层，锚点行号全变。P0-2v2 改挂 `profile-channel-admission`（2.0.10 把它从 `main.ts`
  拆了出来）；锚集 v3 把**内容哈希文件名** glob 化——原先钉哈希的锚点在上游改一次构建后即静默失配，
  这类空转被消除。权威登记簿为 [`dsh-patches/patches-manifest-v3.md`](dsh-patches/patches-manifest-v3.md)。
- **打包形态从 ASAR 改为目录**（上游 #973 全平台 no-ASAR）：补丁面由「事后改写 `app.asar.unpacked`」
  变成「源码直接编译产出」。路径常量收敛到唯一家 `scripts/lib/app-resources.mjs`——no-ASAR ⇄ ASAR
  双形态探测，**形态缺失时中止而不是静默跳过**（静默跳过就是假绿），11 处运行时引用接到它
  （[ADR-0073](docs/adr/ADR-0073.md)）。
- **运行时 0.1.5-rc.2 物化 270/270**。过程中证伪一条路：`npm pack` 重打包的字节 ≠ git blob，
  hash 校验 184 全败——正解是走 git promisor 惰性拉取。源码构建五步全绿，dist 面补丁由编译直接产出。
- **上游换名的三个消费面**（[ADR-0116](docs/adr/ADR-0116.md)）：`@deepseek-ai/dsh-persona` 的配置键
  `text` → `prefix`（必填）。后果不是「人格没生效」而是**整棵 preset 树载入失败**。新增门禁
  `preset-config-schema`，按**插件自己的 `Config`** 判——只调一次会漏「旧键还在、新键有默认值」，
  故另加**键集判据**（实测 schemastery 并不拒未知键）；两个 legacy 生成器同批改掉，否则重跑会把
  已修好的预设再写坏。
- **官方 UI 锚改按关系定位**：2.0.10 的 hero 标题没有类名（`headlineText` 已移除），插件里那条隐藏
  规则根本没生成，而**没有任何判据在读**它。改为在角标父容器里认「唯一的有文字叶子兄弟」；
  0 或 ≥2 候选**不猜**，报 `degraded:<code>`。声明文件 `ui-anchors.json` 成为唯一家，插件与门禁
  双向断言（记录见 [13 号计划](docs/research/13-upgrade-2.0.10-execution-plan.md) §18）。
- 标题栏摘除 `v2.0.5` 版本串；beta 变体 30 文件三方对齐，机器判定 `181 shared source files are aligned`。

### 出货面

- **技能面不携带 `__pycache__`**（[ADR-0112](docs/adr/ADR-0112.md)）：`.pyc` 的 `co_filename` 里钉着
  构建机绝对路径，是**文本守卫读不到的二进制载体**。改为拷贝 filter + 校验判据双机制：修复前
  `--check` 判红 26 条目，修复后 0；出口树 `find -name '*.pyc'` 为 0。
- 出货架构声明 **arm64**。x64 缺口单列：`fs-ext` 的 darwin-x64 prebuild 不在场，补齐需
  `MACOS_UNIVERSAL_NATIVE_ENTRIES` 与 `--dir --universal` 适配，**不阻塞本版**，登记下轮。
- 读数：`DSH_BASELINE=2.0.10` / `DSH_RUNTIME=0.1.5-rc.2` / `ARCH=arm64` / `SOURCE_DIRTY=0`
  （`packaging/release/2.5.0/VERSION`；该目录按 `.gitignore` 不入库）。

### 文档与研究

- `docs/research/11-13`：上游 2.0.10 差异剖析 / 插件升级与重复矩阵 / 升级执行方案与执行记录（§7–§18）。
- ADR-0097–0116 为本次升级的决策链。

## [2.4.1] - 2026-09-14（出货预设的行级闭合：修掉 2.4.0 带出去的那条本机装配行）

本版是**缺陷修复版**：2.4.0 装完后打开 DSH，「结伴 · 达人与联盟合作」这个 preset 加载失败——
载荷里 `presets/agt-033` 带着一条本机装配行，而出货 profile 里没有那个包。判据与安装器两头都修
（[ADR-0084](docs/adr/ADR-0084.md)）。出货技能面与 2.4.0 逐名相同，预设 51 条不变、内容少那一条行。

- **出货预设的行级闭合判据：2.4.0 把一条本机装配行发给了客户**（[ADR-0084](docs/adr/ADR-0084.md)）。
  客户装完 2.4.0 后打开 DSH，**「结伴 · 达人与联盟合作」这个 preset 加载失败**——payload 里
  `presets/agt-033/agent.cordis.yml` 带着 ADR-0061 的本机装配行 `dsh-kol-hunter-local`，
  而出货 profile 里没有这个包（ADR-0056 要求剥掉）。原有的守卫看不见它：那条判据先在**本机**
  profile 的 `file:` 依赖里算「外部产品名」，而装配那一刻本机那半事实早已被上一次安装抹掉，
  于是脚本**如实**报告「✓ 出货面没有本机装配的外部产品」。改为**正向闭合**：
  `packaging/scripts/check-preset-rows.mjs` 判「出货副本里每一条插件行能不能在**出货面**里解析」，
  未登记又解析不到的行 → 装配中止并点名到「文件 + 行 + 包名」；已评审的本机装配行登记在
  `packaging/local-only-preset-rows.json`（登记即权威，**不看本机此刻装没装**）并从出货副本剥掉。
  实测：真实的 2.4.0 字节 51 个预设 / 1582 条行 → 恰好 1 条违规、零误报；反向自测 15 条，
  含「同一份字节、只换解析面 ⇒ 结论相反」的一对用例。**并补上同一根因的另一半**：`install.sh` 第 5/6 步原先对 presets 用 `cp -Rn`（合并、不覆盖已有），
  于是**已装 2.4.0 的机器即使拿到干净的下一位版本也收不到修正**。改为：载荷里的预设按**产品内容**处理
  （有差异先备份到 `.agent-presets.pre-lute-<stamp>` 再整体替换、内容一致就不动、失败可回滚），
  **载荷里没有的预设一律不动**；技能那一半保持合并不覆盖（技能文件里住着用户状态）。自测 7 条挂在
  门禁 `installer-preset-update-selftest`。**本版就是交付它的那一版**：装在 2.4.0 上的机器直接装
  本版即可，那个坏文件会被替换，旧副本留在 `~/.dsh/.agent-presets.pre-lute-<时间戳>/`（端到端实测：
  真 load 里那份 install.sh 对真实的坏文件跑一遍 → 命中 19 行→18 行、注释一起走、客户自建预设原样、备份里旧副本还在）。
- **`scripts-runnable` 超时带上机器读数**：超时上限（180s）对机器负载敏感——实测有一次平时 3 秒的
  包测试在杀毒扫盘时顶到 180s 报「退出码 124」，与「代码真的坏了」在输出上完全同形。现在超时会附带
  当时的 load 均值、核数与占 CPU 最高的几个进程；`ps` 读不到时**明写「取不到 ≠ 机器空闲」**。
  处置是**加读数、不放宽超时**（放宽会把真缺陷一起放过去）。
- **安装手册补一条：安装期间不要打开 DSH Desktop**（[`packaging/INSTALL-GUIDE.md`](packaging/INSTALL-GUIDE.md)
  §3 第 5 步写规范、§9 对照表放反向处置）。安装器只在动手前退过一次实例，管不住之后被重新打开，
  而 1/6~3/6 正在**替换应用本体**——此时启动会读到写了一半的文件。
  依据：2026-09-14 装机实测，安装 13:18:27 开始、13:21 收尾，DSH 在 13:20:58 被重新打开，
  落在收尾段（只读校验）；`find -newermt 13:20:58` 为空说明 bundle 启动后未被再写，本次代价为零。
- **复发故障总账加 P-17**「三态读数在聚合处被压回两态」：`gate:full` 打印
  `ok 54/55 项通过（mode=full，跳过 1）`且退出码 0，而其中一项明写着「本项**未核对任何版本**」。
  单项诚实、汇总有损，而常驻规则写的正是「退出码即契约」——规则本身在教人读那个有损投影（P-02 的
  同一根因在**聚合层**复发）。条目里如实写明**拦住聚合层的那一步尚未落地**（[`docs/pitfalls-playbook.md`](docs/pitfalls-playbook.md)）。

## [2.4.0] - 2026-09-14（底本收敛与「拦住」补齐：出货面零变化，门禁首次 full 55/55）

决策留痕：[ADR-0076](docs/adr/ADR-0076.md) · [ADR-0078](docs/adr/ADR-0078.md) · [ADR-0080](docs/adr/ADR-0080.md) ·
[ADR-0081](docs/adr/ADR-0081.md) · [ADR-0083](docs/adr/ADR-0083.md)。

### 产品面（客户可见的行为变化只有一条）
- **开关重写不再改写键序**（ADR-0083）：算法技能页把某张卡开→关，磁盘上**不再被改写键序**。
  全量 1390 张卡里含 `rebase_*` 字段的 **145 张**每张都会漂移，而键序**没有任何读者**——
  除了字节比对没人看得见。补了三条**不依赖本机语料**的纯函数单测。
- **分类底本收敛 1338 → 1390**：精选线 **52 张卡**接入产品侧 `classification.json`，`card-facets.json`
  随动重算，新增唯一 writer `append-selected-line.mjs`，**不新造任何分类事实**（每条带 `_provenance`）。
  出货技能面**零变化**（349 条，与 2.3.3 逐名相同）。

### 发布与守卫
- **发布链的最后一环**（ADR-0076）：入库版本必须有公开分发面——本版起新版本同步上 Releases。
- **图标有两个家**（ADR-0081）：Finder 的 `icon.icns` 对了 **≠** Dock 的图标对了。
- **「在不在跑」收成一家**（ADR-0080）：原先守白屏红线的那条判据在实例真在跑时返回空，**守了等于没守**。
- **`file:` 依赖的基准**（ADR-0078）：把相对路径拿去对 `cwd` 判断，导致 23 个依赖**全部**被跳过、门禁恒绿。
- 另修若干 JSDoc/类型说谎、死指针与恒真断言。

### 门禁
- `pnpm run gate`（quick）**49/49**、`pnpm run gate:full` **55/55** —— 本仓库首次 full 模式全绿。

### 交付形态与已知缺口
- 只发 DMG；入库清单 [`release/2.4.0.sha256`](release/2.4.0.sha256)（build `20260914-112858`，
  源提交 `3a07e0d`，`source_dirty=0`），DMG SHA256 `24a09cb4…`。
- **已知缺口**（如实登记）：换底 **52/53**（第 53 张卡的 slug 命名决策未做）；venue 词表**已投递未接读**；
  S12 的 13 组变异自测**不在门禁射程内**。

## [2.3.3] - 2026-09-13（HMR 生产守卫：白屏机制修复 + 可观测性）

决策留痕：[ADR-0065](docs/adr/ADR-0065.md) · Note [2026-09-13-hmr-production-guard](docs/notes/implemented/architecture/2026-09-13-hmr-production-guard.md)。

- **白屏根因修复（G1）**：`dsh-client-hmr` host 侧加生产守卫——非 dev 模式（`process.defaultApp !== true` 且无 `DSH_DEV=1`）下 poll 到 bundle 变化只更新 watch 基线、不 re-hash、不推 rebuilt 帧。
  根因：运行中替换 `/Applications` app bundle → 宿主推 rebuilt 帧 → 生产 renderer 无 dev:web runtime 热更崩溃 → 整窗白屏（`Cmd+R` 可恢复）。
- **可观测性（G2）**：`electron-runtime-*.js` 恢复 `console-message` 转发（兼容新旧 Electron 事件签名），renderer 报错进宿主日志，不再静默。
- **流程预防**：`installer/install.sh` 新增 0b 步骤——替换 `/Applications` 前退出运行实例（15s 超时中止）；SOP 同步补检查项/红线/异常表/白屏三问。
- **打包基线**：新幂等脚本 `dsh-patches/runtime-guards/apply-fixes.sh` 接入 `assemble.sh` 强制重放、随包分发 `tools/runtime-guards/`；`verify-patches-v2.sh` 锚点 36→**38**（G1/G2）。
- 配套：`docs/dsh-desktop-white-screen-playbook.md` 增补案例 3（HMR 白屏）与速查卡 B1/B2 二分；`packaging/README.md`/`INSTALL-CARD.md` 同步至 2.3.x 现状；修复 `~/.dsh/skills/dsh-desktop-diagnostics/SKILL.md` 的 YAML frontmatter。

## [2.3.2] - 2026-09-13（**未发布**）

- 切出后即被取代：载荷内「用户需授权第三项：输入监控」的说法是错的——实际只需**辅助功能**与
  **屏幕录制**两项（依据：本机 TCC 库里 `kTCCServiceListenEvent` 一行记录都没有，而 `post_events`
  的判定是 `CGPreflightPostEventAccess()`）。17:45 重切为 2.3.3。
- 产物与入库清单都在（[`release/2.3.2.sha256`](release/2.3.2.sha256)，build `20260913-151032`，
  SHA256 `7756564e…`，2026-09-13 复核与产物一致），但**没有 tag**。按 [ADR-0058](docs/adr/ADR-0058.md)
  「清单入库 → 打 tag，tag 才担保得住字节」，**没有 tag 就不是发布版**：它不补 tag、不发 Release，
  也不进门禁 `release-published` 的射程。决策与理由见 [ADR-0076](docs/adr/ADR-0076.md)。
  这条记录的存在本身是刻意的——发布历史要的是**可核对的记录**，不是**连续的数字**。

## [2.3.1] - 2026-09-13

- 2.3.0 的补订版：build `20260913-125353`，清单 `release/2.3.1.sha256`（`source_commit=2534451`，`source_dirty=0`）。

## [2.3.0] - 2026-09-13

- **固定证书签名**（ADR-0063）：签名身份从 adhoc 改为自签 `LUTE Code Signing`，TCC 授权按证书 leaf 延续——「升级一次、重授一次」的终点；换签后首次升级需一次性重授（详见 SOP §5.5）。
- build `20260913-123942`，清单 `release/2.3.0.sha256`（`source_commit=2171218`，`source_dirty=0`）。

## [2.2.0] - 2026-09-12（出货面最小闭环 + 输入框下方能力导引）

决策留痕：[ADR-0056](docs/adr/ADR-0056.md) · Note [2026-09-12-shipping-surface](docs/notes/implemented/architecture/2026-09-12-shipping-surface.md)、
[2026-09-12-packaging-surface-hardening](docs/notes/implemented/architecture/2026-09-12-packaging-surface-hardening.md)。

### 出货面（打包 / 安装 / 门禁）
- **跨项目依赖移出产品面**：`dsh-kol-hunter-local` 从 profile 依赖与 bundles 移除（ADR-0033「本仓库不吞并产品代码」）。
  出货 profile 里的 `/Users/lute/project/KOL-Hunter` 绝对路径随之消失（该路径此前三处失守：vendor 抽取、`rewrite-file-deps` 前缀、`--check` 存在性判据）。
- **RootOutlet 白屏兜底进打包面（P0-9）**：该守卫原先只存在于开发机 `/Applications` 的 app 上，源码构建路径（`BASE=source`）发的是 pristine（`throw`）——**客户机的白屏兜底一直是缺的**。
  本次固化为 NM 补丁 + 锚点登记，`verify-patches-v2` 锚点 35→36。
- **技能交付面 1611 → 539**：只随包「被 preset / 仓库映射引用」的技能，并剔除受限许可（PolyForm Noncommercial）。
  选择在打包时现算（`scripts/select-skills.mjs`），不存第二份清单（ADR-0009）。
- **内部取证材料不随包**：`dsh-patches/` 整体退出出货 profile，只留校验 / 品牌 / 重写工具（决策 K10）。
- **机器路径守卫**：新增 `packaging/scripts/scan-machine-paths.mjs` + 只减不增基线，出货面出现新的构建机绝对路径即中止。
- **校验面修正**：冒烟断言改为布局无关（归组后的嵌套 vendor 对正确产物不再假红）；新增 `staging-freshness`（陈旧产物即红）；
  补丁锚点校验扩到打包面（`staging/*/app`）；安装器三处校验改为「收集失败 + 非零退出」（不再被 `|| true` 吞掉）；
  DMG 构建互斥锁移出 `release/`；升级前清点并保留自装插件清单；v1 校验脚本退役、不随包。

### 产品面
- **输入框下方能力导引**：移除输入框上方两胶囊；下方以横向列展示所选岗位的能力层级（列＝业务技能组，卡＝供给，边界如实标注）。
  数据由宿主路由现读现投影（ADR-0053），点击卡片经官方 `conversation.input.shell(id).actions.setDraft` 预填。

### 门禁
- `pnpm run gate` 17/17、`pnpm run gate:full` 22/22（新增 `profile-bundle-sync`、`patch-anchors` 的打包面目标、`staging-freshness`）。

### 交付形态
- **本版起只发 DMG**：`release/2.2.0/` 只有 `DSH-Desktop-LUTE-2.2.0-mac-arm64.dmg`（610 MB，
  SHA256 `e74fb6d0…`）+ `SHA256SUMS` + `VERSION` + `manifest.json`，**无 `.pkg`**。
  流水线、README 与灰度 SOP 里「pkg 为主交付」的说法已同步作废（细节见 [packaging/CHANGELOG.md](packaging/CHANGELOG.md)）。

### 已知缺口
- 载荷内含一处**未入库**的 `launcher.ts` 诊断探针（另一会话在飞），本 tag 里没有它；
  闭合需该改动定版后重跑装配并重打 tag。细节见 [packaging/CHANGELOG.md](packaging/CHANGELOG.md) 的「已知缺口」。

## [2.0.0] - 2026-09-10（DSH 基座 2.0.4→2.0.5 / runtime 0.1.2-rc.1 大版本迁移）

### 基座迁移
- 35 补丁全量重锚（verify-patches-v2 35 锚点 ALL VERIFIED）+ 品牌重放 ALL VERIFIED（含 Electron Helper 重命名回归修复）
- 30 bundles rc 化：6 生态插件最新版 + 16 本地 + 8 无依赖升级（pocket/im/modlens/modsearch/git-graph）
- P0-7v2/v2c 首启兜底 + setup-wizard 免向导（含发货级卡死修复：全新用户环境首启 healthy）
- dsh-overseas-skills files 清单修复（PR #1，全新安装整树失败）

### 打包与发布
- 流水线全套适配 2.0.5（assemble/brand-replay/smoke/rewrite/install，dmg+pkg 双格式 + SHA256 校验清单 + 构建竞态锁）
- 验证：smoke 37/37、打包产物真实启动 healthy、升级场景端到端（数据保留）

### 文档与研究
- docs/research/01-10 全链（基座盘点/上游侦察/差距分析/升级方案/验证矩阵/rc-eval 手册/补丁登记/复盘/四维审计/债务方案）
- ADR-0005（rc.1 迁移立项）/ ADR-0006（上游跟进策略）/ 灰度发布 SOP

## [1.2.2] - 2026-09-09（request extension 修复 + 品牌 app 图标）

### 修复（客户真机报障）
- **P0-8 补丁**：dsh-llm-pi-ai 的 pi-ai lazy import 改从 app.asar.unpacked 磁盘加载，
  绕开 asar 内 ESM 动态 import 缺陷（「DeepSeek request extension preparation failed」）
- **品牌 app 图标**：icon.icns 替换为 lute-brand-icons 生成引擎产出（程序员爸爸
  方形徽章）；brand-replay 新增 icns 锚点，verify-patches 锚点 31→32

## [1.2.1] - 2026-09-08（面板 UX 修复 + 双格式交付）

### 万物互联（dsh-wanzh-hulian）
- 知识库选择面板：top:32px 对齐顶栏（原被遮挡）；点击面板外自动关闭；关闭按钮点击区加大（30×28 触控友好）

### 打包
- dmg + pkg 双格式交付（pkg 双击向导面向无终端客户）

## [1.2.0] - 2026-09-08（测试闭环 + 业务侧更新）

### 测试闭环修复（发版前质量门：/代码评审 + /Bug 诊断）
- **P1 输入框打字抖动回归**：dsh-my-quotes 移除 `MutationObserver(document.body)` 反馈回路，改持久 `setInterval(2s)` 兜底
- **P2 CSS 属性化**：dsh-overseas-skills 85 处 + dsh-wanzh-hulian 39 处后代选择器 → `[data-plugin]` scoping
- **P3 临时文件治理**：.gitignore 排除 `*.bak-*` / `*.pre-*` / `dsh-team-hub/`，移除已追踪 `.bak-cn-slash`
- **P4 Spec 正确性**：readMcpServers 对称合并（保留非默认 id 自定义 MCP）；templates.js 缓存加 `kind` 字段

### 业务侧
- dsh-wanzh-hulian：新增 business-meta.js（MCP 卡片业务化）；ensureShopifySkill 模板
- dsh-overseas-skills：catalog / manifest / scripts 更新

### 打包
- assemble.sh 修复 profile.tar.gz `.DS_Store` 双落位不一致；dmg 1.2.0（661M，冒烟 33 项全绿 + 31 补丁锚点）

## [1.0.0] - 2026-09-06（基线发布）

首个基线版本：把 DSH 二次开发工作台整理为 monorepo 并首次发布。

### 出海技能体系
- 81-Skills 全量 81 技能接入（含 4 个加密技能明文补齐）；25 组 230 行卡片墙；LUTE 品牌图标；中文斜杠命令（6 处补丁）
- 技能卡片结构化引导：L1 人工 30 模板 + L2 自动解析 + L3 兜底（卡片墙 + 斜杠双入口）
- AI全栈技能 29 个（mattpocock 汉化稳定集）；AnySearch 接入；业务验收 Run 02 通过
- momcozy Product Schema（M9 真实数据采集 + 校验）

### 万物互联（dsh-wanzh-hulian）
- 设置页四板块（MCP/API/企业应用/知识库）；得到大脑连接 19 工具（含分类整理 12 个 + 真移动语义）
- 分类整理执行：第一阶段 132 条归档 + 第三阶段存量优化（0 失败）
- 知识库选择器（左栏入口 + 右停靠面板 v4；选库不选笔记契约）
- P2 OAuth/CLI 登录态通道；P3 MCP 板块基建（宿主直挂内置 dsh-mcp-client）
- P4 Shopify 连接（配置化 connections.json + 通用连接卡渲染器；安全审查通过，待凭证冒烟）

### 工程
- 指令审计 F1-F10；管线 8 阶段；preset 15 个 respectFileFlags

## [1.1.0] - 2026-09-07（功能扩展）

### 「我说」跨会话检索（dsh-my-quotes 插件）
- 侧边栏「我说」入口：聚合全部 DSH 会话中用户 ≥30 字消息，规则 9 类意图分类（可选 LLM 精分）
- 搜索 / 项目筛选 / 跳转原会话 / 复制全文 / 手动改类 / 重建索引；索引为派生品可重建
- 会话日志 zstd 拼接帧解码（复用官方 persistence 语义）；profile 插件注册走 package.json bundles（非 cordis.yml）

### 品牌资产
- lute-brand-icons 技能 + 57 枚方形徽章头像库（24 职业 + 12 家庭 + 14 通用 + 补充；参数化生成引擎 + manifest + 暗/浅总览）
- Agent 预设卡片头像：类人漫画（爸爸/妈妈/宝宝），品牌绿 #58B848 细描边方形徽章、头部占比 80-85%、暗/浅双主题适配

### UI 调整
- Session 日志按钮改名「log」并迁至侧边栏设置按钮同行右侧（克隆式 DOM 迁移 + 自愈）

### 文档
- patches-manifest 补齐：P0 7/7、UI/UX 统一、Agent Preset 品牌化、lute-brand-icons、我说、Session 日志迁移
- 新增 docs/dsh-desktop-white-screen-playbook.md 白屏排查手册
