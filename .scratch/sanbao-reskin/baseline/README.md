# 001 开工基线 · 门禁读数与文件所有权交集

- 工单：`.scratch/sanbao-reskin/tickets/001-*.md`
- 时间：2026-09-19
- 目的：让后续 31 张工单的「gate 绿」具备**可归因性**。没有基线，红到底是换皮改的还是
  别人在制品造成的，无法分辨。

## 1. 门禁基线读数

### 1.1 quick 模式（`node scripts/gate.mjs --mode quick --json`）

| 指标 | 读数 |
| --- | --- |
| 退出码 | **1** |
| 总项数 | 100 |
| 通过 | 96 |
| 失败 | **1** |
| 跳过 | 3 |
| 对象级 | expected 2458 / discovered 2456 / checked 2287 / skippedObjects 170 / failedObjects 1 |

原始输出：`gate-quick.json`（91,717 B）。stderr 为空。

**quick 模式不覆盖的 8 项**（`summary.notCovered`）：
`gate-concurrency-selftest`、`scripts-runnable`、`release-published`、`patch-anchors`、
`staging-freshness`、`worktable-fence`、`theme-tokens`、`theme-tokens-selftest`。

> ⚠ 其中 **`theme-tokens` 与 `patch-anchors` 正是工单 007 / 011 / 012 的命门**。
> 只跑 quick 建立基线等于没测到换皮最可能改红的两项，因此 full 模式基线是必需的。

### 1.2 full 模式（`node scripts/gate.mjs --mode full --json`）

原始输出：`gate-full.json`。**quick 绿不等于 full 绿**，两张表并排看：

| 指标 | quick | full |
| --- | --- | --- |
| 退出码 | 1 | **1** |
| 总项数 | 100 | **108** |
| 通过 | 96 | 102 |
| 失败 | 1 | **3** |
| 跳过 | 3 | 3 |
| `notCovered` | 8 项 | **`[]`** |
| 对象级 | 2458 / 2456 / 2287 / 170 / 1 | 2466 / 2464 / 2293 / 170 / 3 |

full 比 quick 多的 8 项全部被执行，`notCovered` 归零——**这就是 §1.1 结尾那道警告的闭合**：
`theme-tokens`、`patch-anchors` 这两项工单 007/011/012 的命门在基线上是**绿的**，
后续任何一次把它们改红都可归因到换皮本身。

**full 新增的两条红**（quick 只有 `profile-bundle-sync` 一条）：

| 门禁 | 违规原文（`violations[0]`） | 归因 |
| --- | --- | --- |
| `gate-concurrency-selftest` | 聚合并发见证失败（退出码 1） | 见 §2.2，**已定性：并发会话在 17:23:37 提交** |
| `release-published` | v2.2.0/v2.3.0/v2.3.1/v2.3.3/v2.4.0/v2.4.1 有入库清单且有 tag，但 GitHub Releases 上没有它 | 见 §2.3，**本会话自己造成** |

`profile-bundle-sync` 在两种模式下报的是**同一条** violation（不只是 note 里那句 bundle 计数）：

```
dsh-newapp-local: 装载点的 lib/index.js 与仓库源字节不一致
（应用会跑旧产物；用 tmp+mv 语义同步，见 node scripts/sync-profile.mjs --apply --loadpoint）
```

所以 §2 的归因对 full 同样成立，不是 quick 特有的读数。

### 1.3 跳过项：full 下的实际读数

三条在 quick 与 full 下都是 skip，但**跳过的性质不同**，必须分开记：

| 门禁 | full 读数 | 性质 |
| --- | --- | --- |
| `live-presets` | 期望 1789 / 发现 1789 / 核对 1621 / 失败 0，168 条 `typedSkip=disabled-preset-row` | **做了核对**却计 skip（宿主平台禁用行）——工单 022 落这张表，判据可用 |
| `resource-path-reachability` | 已核实 **0** 棵树、未核实 1 棵（`/Applications/DSH Desktop.app`）；扫描 745 个 `.js` 命中 **0** 条路径候选 | **射程为空** |
| `dmg-layout-doc` | 本机既没有挂载的交付卷，也没有未打 tag 的 payload——**未校验任何卷内清单** | **扫描面为空** |

> ⚠ 后两条正是 P-15（空扫描面 ≠ 合规）的形状。工单 017 / 026 的验收判据写着
> 「`resource-path-reachability` / `dmg-layout-doc` 绿」——**这两项在基线上从没量过任何东西**，
> 换皮把它们改不动，它们也不会把换皮改红。那两张工单开工时必须各自补出**主动证据**
> （017：造一棵有路径候选的树让它非空；026：挂载交付卷再跑），不能拿 skip 当通过。


## 2. 三条红逐一归因

### 2.1 `profile-bundle-sync` —— 与换皮无关，但会让**每一张工单**验收不了

`profile-bundle-sync` 报：`dsh-newapp-local: 装载点的 lib/index.js 与仓库源字节不一致`。

实测：

| 侧 | 大小 | sha1 | mtime |
| --- | --- | --- | --- |
| 仓库 `lib/index.js` | 71,273 B | `15384703…` | 09-19 **05:16** |
| 装载点（4 份，彼此一致） | 71,272 B | `778df0f5…` | 09-13 **12:22** |

首个差异在**第 1842 行 / 字符 54101**，内容全部落在 `src/catalog/reachability.json` 烘焙进
产物的部分：

```
- var probedOn = "2026-09-13";     ← 装载点（旧）
+ var probedOn = "2026-09-18";     ← 仓库侧（新）
- "ms": 250,                        ← 探测延迟
+ "ms": 306,
```

**结论：与换皮零关系。** 是一次可达性探测重跑（09-13 → 09-18）后仓库侧重新构建了产物，
但没有同步到 live 装载点。`lib/` 本身被 `packages/surfaces/dsh-newapp-local/.gitignore:2`
排除，不在版本管理内。

**方向已确认：仓库侧是权威、装载点是滞后**，不是「别人在制品 vs 我这边的新改动」：
带 `probedOn: 2026-09-18` 的 `src/catalog/reachability.json` 已在提交 `1940c29` 里，
`git status` 对该文件干净；漂移只发生在**派生产物没重新同步**这一环。
所以方案 A 是「把已入库的权威字节推给还跑着旧构建的 app」，**不覆盖任何未提交工作**。

#### 这条红对计划的实际影响（比它本身重要）

`reachability.json` 是一个**会被探测工具反复重写的源文件**，而它被烘焙进 `lib/index.js`
参与装载点字节比对。这意味着：**任何人每重跑一次探测，`profile-bundle-sync` 就会红一次**，
与换皮无关。若不在 32 张工单开工前处理掉，每一张的「gate 全绿」验收都不可达。

三个候选处置（**均未执行，需拍板**）：

| 方案 | 做法 | 代价 |
| --- | --- | --- |
| A 同步装载点 | `node scripts/sync-profile.mjs --apply --loadpoint` | 改动**正在运行的 app** 的装载内容；§2.1 已确认是纯前进同步，剩下的只是时机——需避开并发会话正在做装机验证的窗口 |
| B 把探测日期移出比对面 | `probedOn`/`ms` 不参与装载点字节一致性 | 要改 `profile-bundle-sync` 判据本身，属门禁语义变更 |
| C 记录为已知噪声 | 每张工单验收时显式豁免这一项并写明理由 | 与 ADR-0014「exemptions 只减不增、当前为 `[]`」冲突，且豁免会腐烂 |

**本工单不自行处置。** 理由：A 的时机要挑（动 live 装载点，B 是门禁语义变更属独立决策，
C 与既有红线冲突）。**换皮工单的验收判据因此按 §2.4 的口径写。**

#### 18:57 复读：这条红自己长出了新违规（§2.4 的比对规则当场生效）

关掉本工单前按 §2.4 重跑一次 quick（`gate-quick-rerun.json`，18:57:25 落盘；
建线那次是 17:18:45，间隔 1 小时 39 分）。总数没变
（100 / 96 pass / 3 skip / 1 fail），但**唯一那条红的 `violations` 从 1 条长到 3 条、
`failedObjects` 从 1 变 2**：

```
dsh-newapp-local:      装载点的 lib/index.js 与仓库源字节不一致        ← §2.1 原那条
dsh-role-matrix-local: 装载点的 lib/client.js 与仓库源字节不一致        ← 新
dsh-role-matrix-local: 装载点的 lib/index.js 与仓库源字节不一致         ← 新
```

归因（不猜，量时间戳）：

| 侧 | `lib/index.js` | 时刻 |
| --- | --- | --- |
| 仓库 `packages/surfaces/dsh-role-matrix-local/` | 33,113 B | **09-19 18:31** |
| 装载点（4 份，彼此一致） | 32,772 B | 09-13 12:21 |

`git status --porcelain packages/surfaces/dsh-role-matrix-local` **干净**，
18:31 那次重建不是本会话做的（本会话从未碰过这个包）。
形状与 §2.1 完全一样：**源已入库、派生产物已重建、装载点没跟上**，只是换了个包。

> 这次复读的价值不在那条红，而在于它把 §2.1 的预测**当场量实了**：
> 「每重跑一次构建就多一条红」不是推演——建线后 1 小时 39 分内就多出一个包、两条违规。
> 因此 §2.4 那条「必须逐字比对 violation」不是形式要求，是本计划唯一能防止
> 「装载点漂移」和「换皮改红」混在一起的机制。

### 2.2 `gate-concurrency-selftest` —— **已定性：别人在写这棵树**，不是门禁副作用

违规原文：`聚合并发见证失败（退出码 1）`。

| 跑法 | 读数 |
| --- | --- |
| 随 full gate 聚合跑 | **红** |
| 单独复跑 2 轮（`node --test scripts/lib/repo-attest-concurrency.test.mjs`） | **绿**，98,031 ms |

定性靠时间戳，不靠推测：

| 时刻 | 事件 |
| --- | --- |
| 17:13:56 | 本会话提交 `5b02641`（32 张工单） |
| **17:23:37** | **并发会话提交 `73d7270`（`scripts/gates/lute-shell-pin.mjs` + 其 test，+126/-8）** |
| 17:31:59 | `gate-full.json` 落盘，即本轮 full gate 的终点 |

`17:23:37` 落在被见证窗口内。一次 `git commit` 同时移动 HEAD、refs、index 与 tracked 内容——
而这正是见证快照逐项比对的那几面（tracked / untracked / 声明根 / ignored 区域 / HEAD / refs / index）。
所以这条红说的是「**被见证的仓库确实在变**」，与
`scripts/lib/repo-attest-concurrency.test.mjs:44-49` 写明的失败边界完全同形
（该文件的头注释记录：这台机器上两次 10 轮判红都是这个成因，且「两处判红都判对了」）。

**顺带量到的一条仪器缺口（本计划不修，只登记）**：

1. `gate.mjs:270` 的前置安静度探测只覆盖约 6 秒（3 次快照、间隔 3 秒），
   而被见证的是 10 轮 ≈ 十几分钟的窗口——**探测窗比观测窗短三个数量级**，
   在这台多会话机器上它必然反复判红。红本身是对的，但探测给的是「起跑时安静」，
   判的却是「全程安静」。
2. 包装层 `runNodeTestFile` 用 `/^\s*✖/` 从子进程输出里提失败行，这次没提到任何一行，
   于是违规降级成通用的「聚合并发见证失败（退出码 1）」，**点名不到是谁移动的仓库**。
   本次实测 Node v26 在管道下确实会打印 `✖` 与 `AssertionError`
   （`/tmp/tapchk` 上验过），所以提不到行的原因**未复现**——这条按未解记着，
   它只影响可读性（退出码 1 的判定方向是对的），不影响判据。

出路是现成的：`DSH_ATTEST_REPO=<clean clone>` 指向独占副本跑，本工作树永远给不出稳定的并发读数。

### 2.3 `release-published` —— **本会话自己造成的**，不是存量债

违规原文：`v2.2.0 / v2.3.0 / v2.3.1 / v2.3.3 / v2.4.0 / v2.4.1 有入库清单且有 tag，但 GitHub Releases 上没有它`。

成因链条（如实记，不推给别人）：

1. 本会话按用户指令把远端从 `zjgulai/lute-dsh-platform` 换成 `zjgulai/Sanbao`，删掉了旧远端；
2. `gh release list` 从 git remote 解析仓库 → 门禁的「分发面」读数从一个有 13 条 Release 的仓库
   切到了一个当时有 0 条的仓库；
3. 于是 6 个在射程版本**同时**从「已发布」翻成「没有分发面」。

> 这条红的价值在于：它证明门禁量的确实是**分发面本身**而不是「我们记得发过」。
> 换仓库这种在 git 侧看似无害的动作，会被 `release-published` 立刻抓住——这正是 ADR-0076
> 前四环齐、第五环缺那次教训的机制化。射程判据在 `scripts/gates/release-publish-scope.mjs`：
> 清单 ∩ tag，`2.3.2 / 2.5.0` 有清单无 tag 按 ADR-0058 自动出局。

**处置**：按 SOP §6 逐版迁移到 Sanbao，资产用本地产物。字节先过闸再说发：

| 版本 | 本地 DMG sha256 vs `release/<v>.sha256` |
| --- | --- |
| 2.2.0 / 2.3.0 / 2.3.1 / 2.3.3 / 2.4.0 / 2.4.1 | **6/6 MATCH** |

`v2.4.1` 作为示踪弹先走，落地后反查 GitHub 侧资产摘要：
`sha256:2112fa8d4de5edf77cf4c44b070c87b3761bb333419fe81cb632cecd0343aa59`
——与清单同值，即「本地字节 → 入库清单 → 分发面资产」三段同一哈希，这才是这条红的闭合证据。

**本工单收口时（18:58）的状态：进行中，未闭合。**
6 个在射程版本里 v2.4.1 + v2.2.0 已发布并核对，v2.3.0 正在上传，v2.3.1 / v2.3.3 / v2.4.0 排队。
迁移与旧仓删除的完整收据、以及这次执行漏掉 `--latest=false` 那条自伤，
都写在 [.scratch/release-surface-migration/README.md](../../release-surface-migration/README.md)
（那里是这件事的家）。**本工单不为这条红发通过证**——§2.4 已把它列为「必须绿」项，
收尾时以 `pnpm run gate:full` 的实际读数为准。

### 2.4 对后续 31 张工单「gate 绿」的可操作口径

基线三条红不能都写成「无关，跳过」——那等于把 P-02（仪器假绿）写进验收标准。定口径如下：

| 门禁 | 工单验收时怎么写 |
| --- | --- |
| `release-published` | §2.3 的迁移完成后必须**绿**；红就是本次改动造成的 |
| `profile-bundle-sync` | 允许红，但必须逐字比对 violation 是否仍是 §2.1 那一条；**变了就是新的**，必须归因后才能继续 |
| `gate-concurrency-selftest` | 本工作树**给不出稳定读数**（§2.2）。工单验收时写「无读数：多会话同写一棵树」，不得写成通过；要真拿读数就在 `DSH_ATTEST_REPO=<clean clone>` 上跑 |


## 3. 文件所有权交集

### 3.1 与并发会话

**开工时刻（18:0x 读数）**

| 项 | 读数 |
| --- | --- |
| 工单落点（去重） | 68 个路径 |
| 并发会话当前未提交改动 | `scripts/gates/lute-shell-pin.mjs`、`scripts/gates/lute-shell-pin.test.mjs` |
| **硬交集** | **空集** ✓ |

**复核时刻（18:3x–18:4x，两次读数）——同一事实一直在动，按最后一次写**

18:3x：并发会话的未提交面是 ADR-0138（Jev / SkillOpt）那批 —— `CONTEXT.md` +17 行、
`docs/adr/README.md` +1 行、`docs/adr/decisions.json` +75 行、`docs/adr/ADR-0138.md` 未跟踪。
18:4x 再读：**他们已经提交了**（`4aae682` 18:36:12），未提交面换成了
`package.json`（M）与 `scripts/jev/**`、`scripts/lib/jev-credentials*.mjs`（未跟踪）。

> 这就是这张基线最该记下的一件事：**「谁在写什么」在本机器上是分钟级轮换的**。
> 任何一次「现在没有交集」的结论，保质期都短于一张工单的开工时间。
> 所以约定不写成读数，写成动作：**每次提交前重跑 `git status --porcelain`**，
> 而不是一次判定吃到底。

先说清一件事：**32 张工单的落点里没有任何一张指向 `CONTEXT.md` / `docs/adr/*` / `package.json`**
（已 grep 确认）。所以交集不是「两张工单抢同一文件」，而是**本计划的常规动作会走进同一条写入通道**：

| 通道 | 为什么会撞上 |
| --- | --- |
| AGENTS.md 要求「非机械改动必须留痕」→ 开工单可能新开 ADR/Note | 新开 ADR 必然重算 `decisions.json`、补 `docs/adr/README.md` 行 |
| `adr-agent-records.mjs --write` 从**全部** ADR 源码重算派生账本 | 对方 ADR 还在未跟踪态时跑 `--write`，产出的账本**不含那一条**，提交上去就是静默抹掉对方的派生物 |
| 新增依赖 → `package.json` | 对方此刻正 M 着它；换皮若要加依赖必须等或只碰自己那行 |

> ⚠ 真正的危险不是文本冲突（git 会报），而是**派生物被静默算错**：`decisions.json` 是
> `--write` 生成的，两份账本的差异不会有任何一行报错提示「你少算了 ADR-0138」。
> 这正是 §1.2 那类 P-02 形状。约定：跑 `--write` 前 `git status --porcelain docs/adr/` 必须干净；
> 不干净就**等对方提交**或让对方先跑。

**判定：工单落点交集为空；治理写入通道有实交集，且是「静默错」而非「会报错」的那种。**
`git add -A` / `git commit -a` 在 32 张工单里一律禁用——那会把对方未完成的工作直接带走。
提交一律走 `git commit -- <显式路径>`，且提交前 `git status` 复核入仓面。

### 3.2 但有一个热点风险：`scripts/gate.mjs`

`scripts/gate.mjs` 是 **108 项**的门禁注册表，且并发会话**今日 16:36 刚在其中新增**
`lute-shell-pin`（提交 `7008c42`）。换皮工单里有三张必须往同一张表追加注册：

| 工单 | 追加的门禁 |
| --- | --- |
| 003 | 派生物与名源一致性判据 |
| 012 | `brand-token-single-source` |
| 020 | `brand-name-leak` |

**处置约定**：这三张开工前必须 `git pull` 后重新确认 `gate.mjs` 的当前形态，
追加改动保持为**最小 append-only hunk**（只在表尾加条目，不重排、不改既有项），
把冲突面压到最小。

### 3.3 内部热点：`brand-replay.sh`

6 张工单落点在 `dsh-patches/brand-replay.sh`：005、006、016、017、018、025。
它同时是 S-C 接缝的载体，**这是设计意图**（复用既有接缝、不新建资产写入通道），
但意味着这 6 张之间必须串行或按区段划分，不能并行改同一张表。

## 4. worktree 不适用性复核（工单要求确认的三条理由）

| # | 理由 | 复核结果 |
| --- | --- | --- |
| 1 | `vendor/dsh-desktop/` 是 gitignored 嵌套仓，worktree 拿不到 | ✓ 存在，且 `git check-ignore` 确认被忽略 |
| 2 | `packaging/.app-cache/` 是真实 bundle 字节，`patch-anchors`/`theme-tokens` 门禁要读它 | ✓ 存在，且被忽略 |
| 3 | `~/.dsh/skills/lute-brand-icons` 在仓库外，是现状头像与 `layer-icons` 的家 | ✓ 存在（工单 022 后停止新增依赖，043 之外的引用见残留 R5） |

**结论：本计划在主树推进，配合 §3.2/§3.3 的串行约定；不开 worktree。**

## 5. 本工单产出与边界

**产出**

- 本文件（§1 quick + full 双读数、§2 三条红逐一归因 + 一次复读、§2.4 后续工单验收口径、
  §3 所有权交集三次读数、§4 worktree 判定）
- `gate-quick.json`（91,717 B，17:18:45）—— 建线读数
- `gate-full.json`（98,325 B，17:31:59）—— full 建线读数
- `gate-quick-rerun.json`（92,353 B，18:57:25）—— 收口前按 §2.4 的复读，§2.1 末尾那条新红的证据

> **与工单卡面的一处偏差**：卡面写的是 `.scratch/sanbao-reskin/baseline.md`（单文件），
> 实际落在 `baseline/README.md`（目录）。原因是三份原始 JSON 必须与结论文档同处一地才能反查，
> 单文件形态放不下；目录里的 `README.md` 在 GitHub 上自动渲染，可读性不降。

**未做（刻意的）**

- 未修 §2.1 的红、未同步 live 装载点（时机需避开并发装机验证）
- 未在 clean clone 上复跑 §2.2（定性靠时间戳已足够，见 §2.4 的写口）
- 未闭合 §2.3（迁移仍在上传，见 §2.3 末与 release-surface-migration 收据）
- 未触碰并发会话的任何文件；本工单没改一行生产代码

**基线的结论性判断**：换皮最可能改红的 `theme-tokens` / `patch-anchors` 在 full 基线上是绿的，
`live-presets` 的 1621 条核对是有实效的（虽计 skip）；唯一不能自证的是
`resource-path-reachability` 与 `dmg-layout-doc`——**两项射程为空**，
工单 017 / 026 不得把它们的 skip 当作通过（§1.3）。

**开下一张工单前的两个前提**

1. §2.3 的迁移跑完，`gate:full` 里 `release-published` 转绿（这是本会话欠的，不是存量债）；
2. 每次提交前重跑 `git status --porcelain`（§3.1 的结论是动作不是读数）。

