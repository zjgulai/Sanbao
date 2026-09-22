# DA-10 · 自动更新路线第一步（「现在就能做且不白做」的两步）

- 优先级：P1
- 状态：`local-done`（2026-09-21 批次 E 结算：两步落地 `ff4d721`/`bf7438a`；Developer ID 决策＝暂不采购，见结算）
- 依赖：Developer ID 采购（独立跟踪）
- 估算：M
- 来源：docs/plans/2026-09-13-auto-update-route.md；报告 TOP20 #10

## Problem

该计划文档记录了自动更新路线的完整约束：**待 Developer ID**；换签名身份的代价（安装器身份变了 → TCC 权限需再重授一次）；公证链、feed 与信任链、灰度/回滚；并明确划出「**现在就能做且不白做**」的两步（先行的结构与清单面工作）。
当前状态：两步未排期，Developer ID 采购决策未落。

## 动作

1. 重读该计划 §「现在就能做的两步」，把它们拆成可执行任务并排进下一工作窗口；
2. Developer ID 采购与切换成本（TCC 重授一次）作为独立决策项提请用户；
3. 两步落地时各自的判据进 `gate --list`（可离线判的部分先行）。

## 验收

- 两步各自完成并留下真实读数；
- 若启动身份切换：产出 TCC 重授清单（哪些权限、怎么重授、客户通告文案）成文；
- 计划文档更新「已完成 / 未决」状态。

## 注意

不要提前实现依赖 Developer ID 的部分（会白做两次）；先做与身份无关的结构面。

## 排期裁决（2026-09-21）

用户拍板：**下一轮先做「结构两步」**（与签名身份无关的部分，见计划文档 §「现在就能做的两步」）；
Developer ID 采购作为独立决策项另行跟踪，本轮不动依赖它的部分（工单注意：不要提前实现依赖 Developer ID 的部分）。

## 结算（2026-09-21，批次 E）

**两步都已落地并留下读数；Developer ID 决策已提请并拍板「暂不采购」。**

### 1. 第一步：feed `latest.json` 管道（提交 `ff4d721`，ADR-0151）

- 契约：`schema_version` + 10 个固定字段、固定顺序、snake_case、未知字段判违规（为将来的
  Ed25519 签名字段留一次公开 schema 变更口）；六字段逐字段派生自 `release/<版本>.sha256`，
  `min_os` 读产物 Info.plist（缺键即中止打包），`channel`/`notes` 走发布环境变量。
- 派生器 `scripts/lib/update-feed.mjs`（写前自校验）+ `sign-and-dmg.sh` §7.5 生成、§8 随归档
  `uchg` 锁并回读；2.5.0 按真实清单**回填**一份快照，使判据自落地即有真射程。
- 判据 `gate:update-feed` + `update-feed-selftest`（22 用例含恒真桩突变）：最新版本必须已有
  feed（更老缺失＝机制引入前的历史，豁免），射程为空 / 读不到正文 / JSON 读不成一律判红点名。
- 档案侧：`release-verify.sh` 核对 sha256/dmg/version（无 feed 如实记「机制引入前」）、
  F1/F2/F3 三例 14/14、`release-restore.sh` 纳入、SOP 三处同批更新。
- **实现期门禁抓到一次真接线 bug**：`readIfExists` 对缺失返回 `''` 被当成「有 feed」，
  7 个版本各报一条假红 → 改用 `readRepoText`（缺失返回 `null`）。「空内容」与「没有文件」是两个读数。

### 2. 第二步：更新器骨架（提交 `bf7438a`，ADR-0152）

- 包 `packages/platform/dsh-update-local`（host-only）：版本口径 = app Info.plist 的
  `CFBundleVersion` 后缀（`2.0.10-lute.2.5.0` → `2.5.0`）；**八态判定**
  （update-available / up-to-date / feed-behind / channel-mismatch / feed-unreadable /
  feed-invalid / current-unreadable / current-not-lute），读不到绝不折叠成「已是最新」；
  工具 `upd_check` 只读，启动检查延后 20s、离线只记日志；**无下载、无写盘、无安装路径**。
- 判据：先跑桩实现拿 **51 红 / 2 绿**，再换真实现 **28/28**；交叉钉（消费侧 `lib/feed.js` 对钉
  生产侧**派生出来的 feed 的键序** + 同一张突变表 + 真实回填快照放行）；`typecheck` 收口两处
  JSDoc 契约（`ok:false` 被放宽成 boolean）。
- **真机读数**（`node scripts/live-check.mjs`，本机 `2.0.10-lute.2.5.0 → LUTE 2.5.0`）：
  回填快照 `up-to-date`、构造更高版本 `update-available`、构造更低版本 `feed-behind`、
  坏形状 `feed-invalid`（点名 sha256）、404 与真 Releases latest 都是 `feed-unreadable（HTTP 404）`
  ——机制后第一版才会上传那个附件，这条正是「读不到 ≠ 最新」的第一现场。
- 装配：profile 本地（ADR-0061）——`file:` 声明 + `dsh.profile.bundles` + vendor/装载点两处副本，
  装载点零漂移；profile 清单改动两行（改前备份 `package.json.bak-pre-dsh-update-20260921`）。

### 3. Developer ID 决策（动作 2）

**用户 2026-09-21 拍板：暂不采购，维持自签。** 含义：人工交付继续，更新器停在「检查 + 提示」
这一版；③④⑤⑥⑦ 全部挂起，重启条件是出现外部客户或跨机分发需求。代价已如实登记在计划 §0 与
「未决」一节（换身份时点越晚，需重授三项 TCC 的用户面越大）。

### 4. 验收对表

| 验收项 | 读数 |
| --- | --- |
| 两步各自完成并留下真实读数 | ① quick 门禁 `update-feed`/`update-feed-selftest` 绿（123 项基线）；② `live-check` 六态全符合预期，`node --test` 28/28 |
| 若启动身份切换 → 产出 TCC 重授清单 | **未启动**（决策：暂不采购），故不产出——不提前做依赖它的部分 |
| 计划文档更新「已完成 / 未决」 | 已更新：§5 表格两行 + 新增「未决」一节（含本次决策与重启条件） |

### 5. 未验收（如实）

- 更新器**在 app 内的实际装载**未读——需重启应用（本会话不动用户的运行实例）；
  重启后 `upd_check` 应能报出 `feed-unreadable（HTTP 404）`（真 Releases 尚无该附件）。
- 与 DA-06 的实机绿读数、DA-21 的实机读数同批欠着：都需要 app 带 `--remote-debugging-port=9333`
  重启且屏幕可见。

### 6. CI 验收更正与续跑（2026-09-21）

`274e793` 的 CI 与此前 `b19be38` 虽同为 20 个失败检查，内部违例却增加：
`scripts-runnable` 64→65，`release-verify-selftest` 11→14。**失败检查名集合相同不能证明零新增红**；
上轮汇报的无条件「零新增红」撤回，以下两项继续留作验收缺口。

- 更新包：在不带 `node_modules` 的临时仓库布局中，以 TypeScript 5.6.3 执行该包 `tsconfig.json`，
  重现 `TS2688: Cannot find type definition file for 'node'`（exit 2）；在同一副本运行
  `pnpm install --offline --frozen-lockfile --ignore-scripts` 后，同一 typecheck exit 0，
  `node --test test/update.spec.mjs` 为 28/28。工作流只装根包依赖，本仓不是 workspace。
  用户已批准 **full job 仅补该包的锁文件安装**；尚不能用本地实验代替远端 CI 通过。
- 发布自测：`mktemp -d -t lute-release-verify` 缺少 GNU 模板所需的尾部 `X`，且创建失败未中止。
  用拒绝所有 `rm/mkdir/cp/chflags` 的临时边界桩，模拟 `mktemp` 失败，真实脚本继续执行并试图使用
  `/pkg/scripts/release-verify.sh`，14 项都报 rc 127。该模拟无根路径写入；根因是沙箱创建失败后仍执行，
  不是 feed 被实际检验后失败。修复必须先阻断该路径，再恢复 F1–F3 的有效执行。
- 本机 Docker daemon 未运行，Linux 实测未运行；不得用 `chflags` 恒成功桩冒充恢复产物的锁定保证。

本地修复及验收已落，见 [验收入口 Note](../../../../docs/notes/implemented/contract/2026-09-21-acceptance-entrypoints.md)
与 [ADR-0154](../../../../docs/adr/ADR-0154.md)：full job 在门禁前单独锁文件安装更新包；沙箱失败停止
及可移植模板已修复，安全自测纳入原发布门禁。本地 CI/沙箱 35/35、发布自测 14/14；在实际隔离工作区
安装更新包依赖后 typecheck exit 0、28/28。独立评审规格/质量通过。
远端新 CI 与前述 DSH 实机读数仍未运行，本地通过不覆盖这两项缺口。

### 7. 集成后完整门禁的逐项归因（2026-09-21 夜 → 09-22）

基线（`274e793` 主树，未含本批）：`{"total":131,"passed":124,"skipped":3,"failed":4}`。
集成后（`1734914..82f1361` 四个提交）：`{"total":131,"passed":127,"skipped":3,"failed":1}`。

| 项 | 基线读数 | 集成后 | 归因 |
| --- | --- | --- | --- |
| `gate-concurrency-selftest` | 抛 `RepoSnapshotError`：untracked 射程被折叠成目录 `.qoder/worktrees/…` | 通过（10 轮 ×2 lane 零差异） | **本批修掉的存量缺陷**（`e7306c2` 把工具工作区排除出射程） |
| `profile-bundle-sync` | 4 个包装载点字节漂移 | 27/27 达标 | 本批「核验后同步」，非判据放宽 |
| `scripts-runnable` | theme 陈旧断言 + carousel 缺依赖 + task-board TS18048 | 达标 | 本批最小修复 |
| `repo-attest-selftest` | 527ms 快速失败（同一 `.qoder/worktrees` 原因） | **退出码 124** | **墙钟预算，非代码缺陷**：单独复跑 9/9 全绿、139.5s。见 `689f7bf` |

最后一项红值得单记：`runScript` 已为「超时 ≠ 判红」准备了当场机器读数 `note`，
聚合层 `runNodeTestFile` 把它丢了，于是超时被写成「反向自测失败」。
判据本身没失败，是**仪器没读到结论**（总账 P-21 的修法自己复发了一次）。

**环境事实（未处理，需用户拍板）**：09-21 观察到 `dsh-newapp-local` 的四组父进程为 init 的 vitest 树，另有一个被 init 领养的独立 worker；五个高 CPU worker 的工作目录相同。
这能解释当时 CPU 前五名被占满，不能仅凭同时发生就断言它是见证耗时超出 120s 的唯一原因；未做清理后的对照实验。清进程属机器级动作，不在本批擅自执行。

**处置（2026-09-22，用户当日拍板后执行）**：`ps` 实测共 **41 个**进程（4 棵树各 1 父 + 9 worker，另加 1 个被 init 领养的独立 worker），
起跑 09-21 11:53–12:28，工作目录同为 `packages/surfaces/dsh-newapp-local`，五个 worker 各占 ~95–99% CPU。
`kill -TERM` 后 4 秒**全部存活**（忙循环不处理信号），改 `kill -9` 才清掉；复核 vitest 进程数 **41 → 0**，
`load averages` 10.04 → 4.59（1/5/15 分钟均值随采样窗口回落）。**动作只针对这一批 09-21 的 vitest 残留**，未触碰其他进程。
清完当场**仍不静**：`Notes.app`（pid 54460，父进程 init）独占 ~100% CPU，Kaspersky `kavd` 45%、`logd` 34% 仍在——
所以「机器干净」这个前提**不成立**，后续墙钟类读数依旧带噪声，只是比 5 核被吃满时好。

**清理后的门禁读数（对照，不作因果断言）**：同日晚些时候的 `pnpm run gate:full --json` 得
**132 项：129 通过 / 3 跳过 / 0 失败**，exit 0，耗时约 18 分钟（上一轮同口径为 1404.97 秒）。
跳过项仍是 `live-presets`、`resource-path-reachability`、`dmg-layout-doc`；`gate-concurrency-selftest`、
`repo-attest-selftest`、`run-script-selftest`、`scripts-runnable` 均通过，且本轮**全程未写工作树**，
未出现上轮那种「因外部写入而跳过见证」的情况。耗时差异当中混着 Notes.app 占核与任务构成变化，
**未做单变量对照，不写成「清进程让门禁变快」**。

### 8. 推送前复验与远端验收（2026-09-22）

- 先前 `/tmp/sanbao-pushfull.uFA1c2` 虽 exit 0，实际为 132 项：128 通过、4 跳过；
  `gate-concurrency-selftest` 因本会话同时修改 `MASTER-TODO.md` 而跳过。453 秒不是完成十轮见证的耗时，该轮不作为并发验收证据。
- 停止本会话对工作树的写入后运行 `pnpm run gate:full --json`，得到 132 项：129 通过、3 跳过、0 失败、exit 0，耗时 1404.97 秒。
  `repo-attest-selftest`、`gate-concurrency-selftest`、`run-script-selftest`、`scripts-runnable` 均通过；
  3 个跳过仍为 `live-presets`、`resource-path-reachability`、`dmg-layout-doc`，不写成全部验收通过。
  原始报告：`/tmp/sanbao-integration-verify.CTU3Ju/full.json`，stderr 同目录，启动 HEAD 为 `4788320e921843e16726fb7248eb967cbbb50cf1`。
- 仅将已批准的 7 个提交 `1734914` 至 `4788320` 推送至 Sanbao/main，远端 SHA 已回读一致；
  Laya 与其他会话的未提交文件不在该推送内。
- 新 [CI 35636234340](https://github.com/zjgulai/Sanbao/actions/runs/35636234340) 已完成：quick 为 88 通过 / 17 跳过 / 19 失败，full 为 90 通过 / 22 跳过 / 20 失败，两个 job 均失败。
  原始报告在 `/tmp/sanbao-ci-4788320.sY49ph/`；对照 [CI 35566626883](https://github.com/zjgulai/Sanbao/actions/runs/35566626883) 的 quick/full 报告（`/tmp/sanbao-ci-baseline.k0DAiR/`），只归一化 `duration_ms` 数字，其余违例原文保留。
- 具体变化：新增 `run-script-selftest` 在两档均通过；full 的 `scripts-runnable` 从 65 条违例降至 64 条，更新包的 `TS2688` 消失。Deep Research 的两条诊断仍为缺依赖，但截尾位置变成新抽离文件中的 `react` 缺失；不能将短尾文本比较当成完整编译错误集的无回归证明。
- 发布自测两档都从 14 条失败降至 2 条：V1–V8、F1–F3 和 R3 已不再报失败；R1/R2 变成 `rc=2 缺失:无 留档数=1`，说明不再是沙箱缺失的原路径。
  本机沙箱中仅令 `chflags` 返回 127，得到同样两条失败并打印「无法锁定」，证据 `/tmp/sanbao-restore-lock-proof.EAatSy/`；这是锁定能力缺失的诊断对照，不是 Linux 锁定成功的证明。未用恒成功锁定桩换绿。
- 除上述变化与耗时噪声外，已输出的违例原文及 skippedChecks 集合不变；旧 CI 的 vendor 未初始化、包级依赖缺失、Linux 缺 CoreText 等阻塞仍在。由于本轮授权的 CI 改动仅为更新包准备步骤，未擅自更换 runner、新增安装矩阵或降级判据。
- 两个 job 均在门禁步骤终止，后续 attestation 步骤未执行；远端验收尚未收口。
- CDP 9333 连接失败，DA-06 / DA-10 / DA-21 的三项实机读数仍未运行；未自行重启应用。

### 9. 第二窗口推送的远端验收（2026-09-22）

推送 `4788320..889c49c`（三个提交）后再推 `889c49c..9d9cc2a`（doc-only 一笔，登记推送读数）。
**第一次推送触发的 run `35683510320` 被第二次推送取代取消**（`cancelled`，两 job 均未跑完），
生效的是 [run 35683582821](https://github.com/zjgulai/Sanbao/actions/runs/35683582821)（HEAD `9d9cc2a`），
两个 job 仍为 failure——与历史各轮同形。报告已下载到 `/tmp/sanbao-ci-9d9cc2a.GVEwpS/`。

逐项对比（基线 `4788320` 的报告在 `/tmp/sanbao-ci-4788320.sY49ph/`，只归一化 `duration_ms` 与时钟类字面量）：

| 档 | 基线 total/pass/skip/fail | 本轮 | 有差异的判据 |
| --- | --- | --- | --- |
| full | 132 / 90 / 22 / 20 | 132 / 90 / 22 / 20 | **0 个**（`skippedChecks` 集合也相同） |
| quick | 124 / 88 / 17 / 19 | 124 / 87 / 18 / 19 | 1 个：`changed-packages` pass → **skip** |

- **full 档是强的「零新增红」**：状态与违例原文逐条相同，无增无减。
- **quick 档那一处变化不是失败，是覆盖收缩**：`changed-packages` 的 typedSkip 为
  `no-changes-in-range`（「改动射程为空——本项**未检查任何包**」）。即该轮 CI 的 quick
  没有核对任何改动包的治理规则，与基线（9 个包）不可比。
- **未解释的不一致 → 已查明（同一窗口内补记）**：同一轮 CI 的 full 档同一判据却是 pass（3 个包）。
  两档的 base 完全相同（报告 `note` 都是 `DSH_GATE_BASE_SHA@889c49ce（event-base-sha）`），
  差异在**工作树**：quick 是 `unstaged=0` → 射程为空 → skip；full 是 `unstaged=53` → 命中 3 个包 → pass。
  53 个跟踪文件从哪来？**门禁自己写的。**

  `scripts-runnable` 标着 `modes: ['full']`、排在判据表第 89 位，而 `changed-packages` 排第 92 位。
  前者按包执行 `typecheck → test → build`（`packageScriptOrder`，ADR-0055），它会真的跑 `build`；
  该判据自己的注释就写着「产物已入库：先 build 会用新字节盖掉它」。于是：
  **本机**（与入库产物同平台同工具链）重写后字节相同 → `git diff` 为空 → 射程干净；
  **CI 的 Linux runner** 上重写结果不同 → 53 个跟踪文件被判「已修改」→ 后置的 `changed-packages`
  把这份写入当成改动面 → 报 pass。

  结论修正：**full 档那条 `pass` 是假绿**——它核对的 3 个包是门禁自己刚弄脏的，不是这次推送改的；
  这次推送（`889c49c..9d9cc2a`）只动文档，正确读数就是 quick 档那个 `skip`。
  与 P-02（仪器假绿）同族，机制是新的：**同一门禁里靠前的判据写盘，靠后的判据把自己的尾气当读数**。
  同一现象也解释了本机两次 full 读数里 `changed-packages` 的 2→3 与 `permission-bits` 的 120→122。

  修法候选（未动，待拍板）：(a) 门禁启动时**快照射程**，后置判据复用同一份（无顺序耦合，推荐）；
  (b) 把这两个判据排到任何写盘判据之前（脆弱，将来加判据会再犯）；
  (c) `scripts-runnable` 改在临时副本里跑（最干净但最贵，且会改变该判据的语义）。
- 两次推送导致前一轮 run 被取消，是本次探针式对比的**结构性干扰**：本次实测读数只覆盖
  `9d9cc2a` 的那一段改动，代码提交那一段的 CI 覆盖被取消的运行带走了。下次要一次推完再取读数。
- 除上述一处外，两档其余判据与 `skippedChecks` 集合均与基线相同；旧 CI 的 vendor 未初始化、
  包级依赖缺失、Linux 缺 CoreText 等阻塞仍在，本轮**未擅自更换 runner、新增安装矩阵或降级判据**。
