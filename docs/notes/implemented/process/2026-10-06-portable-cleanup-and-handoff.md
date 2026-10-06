# 可回退清理、跨仓资源收纳与异机 Codex 交接

- 日期：2026-10-06
- 状态：已完成（本机侧）——保全 / 收纳 / 删除 / 文档与门禁均已有收据；**工作区已提交并推送（2026-10-07，见文末「提交与推送收据」）**；异机侧验证一律标注「待新机验证」
- 决策：[ADR-0272](../../../adr/ADR-0272.md)；边界规格：[迁移清理规格](../../../specs/2026-10-06-portable-handoff-cleanup-spec.md)
- 执行账本（仓外，非依赖）：`Sage-recovery-20261006-cleanup/`（保全脚本、逐 worktree 收据、删除报告、仪器测试输出）

## Problem

用户决定把 Sage 移交给**另一台电脑的 Codex** 继续开发，并要求：深度清理旧 LUTE 签名链残留、`vendor/` 与仓内无用文件 / 缓存 / worktree / 包 / 发布物；把主项目依赖的其他项目资源**收纳进主仓**；整理待办并把文档更新到最新状态。

盘点的关键事实（2026-10-06）：

- **35 个关联 worktree**（33 个目录在盘约 8.5 GiB + 2 个已失效注册），多数回链仍指向搬迁前的 Magpie-Horch 路径；`git -C <树> status` 对相当一部分直接报 "not a git repository"。
- 主仓工作区有 **133 个未提交条目**（含 8 个已暂存测试删除、43 个未暂存修改、64 个未跟踪条目）；HEAD `63e2302`。**这些未提交实现才是交接主体**，只交 HEAD 会漏掉批次 19–26、ADR-0268~0271 与全部收纳成果。
- 跨仓默认入口：surface root 解析与 crawl 只按「Sage 同级 Sanbao 快照仓」布局；设计回路的工单 / 规格 / 判者在仓外；品牌源 SVG 在仓外。
- `packaging-sage/staging/` 留有陈旧锁（owner pid 6775 已退出，producer 临时目录已自清）；旧 LUTE 证书仍被 legacy 装配 / 品牌重签消费。
- 清理仪器自身有缺口：`cleanup-inventory` 把「git 扫描失败」与「无引用」压成同一读数——对不存在的仓库实测给出 `suggested`（会建议删除不可读对象），且射程缺 `packaging-sage/`、不看 untracked。

## Decision

按 [ADR-0272](../../../adr/ADR-0272.md) D1–D7 执行「先保全、再消融、后移除」，本轮已完成：

1. **只读保全（先于任何删除）**：`preserve.py` 对每个 worktree 用临时 index（`read-tree` → `update-index --refresh` → `diff-index`）取真实差异，产出 `tracked-changes.patch`、`untracked.tar.gz`、`ignored-notable.tar.gz` 与唯一提交判定。pilot 抓到并修正了仪器自身的假阳性：**未刷新的 diff-index 会把内容相同的文件报成 M**（3457 个假 M 配 0 字节补丁）——先 `update-index --refresh` 再取数才可信。
2. **Sanbao 原型收纳**：`vendor/sanbao-prototype/`（含 `.git`，排除 node_modules / .playwright-cli / output；HEAD `b861d046`）+ `vendor/sanbao-prototype.pin`（catalog `9eaf593a…` / ledger `0244bd8b…` / _site main `7364bd11…`）。surface 解析（`apps/sage-shell/src/main/sanbao-surface-root.ts`）与 crawl 的候选新增仓内副本——env 覆盖最先、兄弟仓降为历史回退；`sanbao-surface-root.spec.ts` 6/6 通过。**可再生成性实证**：`node scripts/gen-sage-sanbao-state-matrix.mjs --source-root vendor/sanbao-prototype --check-source` → `PASS (206 rows)`。
3. **设计回路收纳**：`docs/design-loop/`（工单 001–050、LOOP.md、规格、合同、ADR 与术语表快照，共 68 文件）+ `scripts/design-loop/verify_ticket.mjs`（原默认 worktree 为用户机器绝对路径，已改宿主仓相对入口；`node --check` 通过，无 `/Users` 残留）。收纳后 211 条相对链接按新布局**机械重写**（正文未改），全树 2561 条相对链接复测 **0 坏链**（与门禁同一判据）。
4. **品牌源收纳**：`assets/sanbao-logo-kit/A_StarSail_Product_symbol.svg`（SHA-256 `9a90f439…` 与生成器 `expectedSourceSha256` 逐字节一致）+ 来源说明；manifest 批准状态不变。位置说明：初版放在 `assets/sage/source/` 被 `sage-assets-generated` 的「目录 ↔ manifest 精确对账」判红（该目录只允许 manifest 列出的条目），已移出。
5. **清理仪器加固**：`cleanup-inventory` 的引用扫描改为「失败与无引用分形」（失败落 `unknown`，阻断删除建议）、射程纳入 `--untracked` 与 `packaging-sage/`；不可用仓库负控由 `suggested` 改判 `unknown`；`node --test scripts/lib/cleanup-inventory.test.mjs` 全绿。
6. **缓存判定（消融 + 三问）**：对 7 个候选跑加固后的读数——`.dsh-types`、`.dsh-root-brand-preview`、`.ua`、`.birdview`、`.scratch`、`vendor/dsh-worktable` 均被承诺 / 引用拦下（证据面）；唯一无承诺无引用者为 `.composer-preview`（225 MB）。
7. **`.dsh-types` 消融得到一个诚实的红**：`--apply` 重建只有 158 文件 / 0.68 MB（原 3947 文件 / 26.95 MB）——当前 vendor 运行时只提供 2 个 DSH 包 tgz、157 处缺口；「可重建」在今天的输入下**不成立**。已恢复原目录并归类为**不得删除**；缺口登记在本文 Consequences。

边界遵守：旧 LUTE 私钥未导出未删除；`packaging-sage/staging` 陈旧锁只登记不清理；未 commit / push；外部仓（Magpie-Horch、Sanbao、设计目录）全程只读。

## Alternatives considered

- **整目录复制到新机**：拒绝——失效回链、缓存与不可解释的混合状态会一起搬走（[规格](../../../specs/2026-10-06-portable-handoff-cleanup-spec.md) §3）。
- **「无 import 即删除」批量清场**：拒绝——P-49 实证会清掉承诺面 / 证据面；本轮 7 个候选里 6 个正是被这套读数拦下。
- **保留兄弟仓依赖，文档指路**：拒绝——异机没有这些目录；默认入口必须在仓内可解析。
- **删除旧签名身份与陈旧锁**：拒绝——用户裁决「退役但保留回退」；锁属他人流程，释放需 owner 动作。

## Consequences

- 本机 worktree 与缓存回收的逐项收据见文末追加段；恢复集是**回退入口**，不是运行依赖，不随仓库迁移。
- `vendor/sanbao-prototype` 成为 surface / 矩阵的本地权威来源；上游（私有 `sanbao_ui`）出新版按 pin 约定 bump 并重跑 `--check-source`。
- `.dsh-types` 的重建缺口（157 处，来自运行时不提供 tgz）如实保留；legacy 类型检查继续依赖现存副本。
- 三条「未动边界」（legacy `packages/` 减重与解耦、陈旧打包锁、旧 LUTE 身份）已于 2026-10-07 单列处理，收据见文末「另列任务收据」；决策见 [ADR-0273](../../../adr/ADR-0273.md)（packages 解耦/减重）。仍需另行安排：`.birdview` / `.scratch` 的深度归档审计、legacy 源码整体退役（前提与步骤见 [ADR-0273](../../../adr/ADR-0273.md) D4）。
- 本轮不改 Harness pin、不放宽任何门禁、不把清理读数写成产品验收。

## 给下一台电脑的 Codex：恢复与续作清单

1. **传输（2026-10-07 更新：已提交推送，优先克隆）**：
   - 推荐 `git clone`（origin 为私有 `github.com/zjgulai/Sanbao`，需要访问凭据）——`origin/main` 顶端即完整基线（批次 19–26、清理 / 收纳、解耦 / 减重全在内），克隆后工作区干净。
   - **克隆拿不到的本地重物**（受 `.gitignore` 管，按需恢复）：`vendor/` 三个嵌套检出（按各自 `.pin` 从上游恢复，dsh-desktop 含子模块）、`apps/sage-shell/node_modules` 与根依赖（重装）、`packages/**` 的 node_modules（逐包 `pnpm install --frozen-lockfile`）、`.dsh-types`（`node scripts/dsh-types.mjs --apply` 重建）、被忽略的 `.birdview` 证据等。要求一条不漏时改用整目录复制（`rsync -aH` 保留硬链接最优）。
   - 仓外恢复集 `Sage-recovery-20261006-cleanup/` **不随交接**（回退用，非运行依赖）。
2. **环境**：macOS arm64；Node `^22.19 || >=24`、pnpm；`cd apps/sage-shell && pnpm install`（壳独立安装，根包无 workspace）；需要 DMG 链路时另读 `packaging-sage/` 与 [ADR-0271](../../../adr/ADR-0271.md)。
3. **首日验证**（全部要给真实退出码）：`pnpm run gate`（32/32 预期）→ `pnpm run test:gate`（246 用例预期）→ `cd apps/sage-shell && node scripts/test.mjs run test/sanbao-surface-root.spec.ts` → `node scripts/gen-sage-sanbao-state-matrix.mjs --source-root vendor/sanbao-prototype --check-source` → `node scripts/dev` 或 `node apps/sage-shell/scripts/dev-debug.mjs` 打开默认桌面做可见性烟测。
4. **工作区纪律**：2026-10-07 已提交并推送——工作区应为**干净树**；开工先 `git status` 与 `git log -1` 对齐 `origin/main`（不要沿用旧 SHA 63e2302 的假设）。**禁止 reset / clean** 丢弃历史；远端若被他人推进，先取回再续作。
5. **待办顺序**：先 [集成票据](../../../plans/2026-10-05-sanbao-in-sage-integration-tickets.md) 的 T03 补真实读取正例与 search / opaque resolver → T04 durable matter → T05 首条真实消息 → T06 生命周期 → T07–T13 → T14 全量收敛（进度只读 [tracked matrix](../../../specs/2026-09-27-sanbao-to-sage-ui-state-map.json)）；DMG-06 等核心主链可用后推进。
6. **不得依赖**：仓外恢复集、旧 worktree、Sage 同级的 Sanbao / 设计仓目录、真实用户 profile、旧 LUTE 私钥；surface 与生成器一律走仓内副本（`vendor/sanbao-prototype`）。

## 删除阶段收据（2026-10-06/07 跨午夜执行）

- **预检**：37 项全部通过（0 拒绝）——23 个含独有物的 worktree 均有非空 patch / tar；无 `uchg`；探测（`find -newer`，排除 node_modules / .git）显示 24 小时内无写入。
- **执行**：37/37 完成——32 个注册目录删除并注销（9 个 clean + 23 个含独有物已保全）、2 个失效注册仅注销 admin 目录、3 个仓内未注册孤儿删除（其源码型 tar 已在恢复集）；`git worktree list` 现仅剩主工作树；**Magpie-Horch 侧注册未动**（该仓只读）。逐项清单见恢复集 `removal-apply.log` 与 `removal-report.json`。
- **缓存**：`.composer-preview`（225 MB，唯一无承诺无引用候选）删除，删除前清单见 `composer-preview-inventory.txt`；`.dsh-types` 消融为红、已恢复原目录（见上文第 7 条）；`.ua`、`.dsh-root-brand-preview`、`.birdview`、`.scratch`、`vendor/dsh-worktable` 均被承诺（gate-scope / ADR 决策）或引用拦下，保留。
- **噪声**：根 / `vendor` / `assets` 三处 `.DS_Store` 删除。
- **尺寸读数**：主仓 `du -sk` 6.44 GiB → **5.43 GiB**；主仓外 worktree 条目合计约 8.5 GiB 被回收；系统卷可用 440 GiB → 458 GiB（含其他会话释放，不作单独归因）。
- **未动边界（三条均于 2026-10-07 另列处理，收据见文末）**：LUTE 证书 / 私钥——退役处置包已交付、仍未移除；`packaging-sage/staging` 陈旧锁——已按合同恢复路径释放；legacy `packages/`——已完成加载解耦与减重（源码保留）；无任何 commit / push。

## 门禁与修复（2026-10-07）

- **收口读数**：`pnpm run gate` 最终 **32/32**（checked=313、skipped=0、failed=0）；`pnpm run test:gate` **246/246**；`node --test scripts/lib/cleanup-inventory.test.mjs` **15/15**；`node --test scripts/gates/node-interpreter.test.mjs` **9/9**；`generate-sage-assets --check` 与矩阵 `--check-source` 独立复跑通过。主仓工作树增量核验：无新增跟踪文件删除（18 个未暂存删除与会话起点逐项一致），新增未跟踪条目恰为本次收纳与文档成果。
- **修掉两个红**（均由收口跑抓出，红→绿都有复证）：
  1. `sage-assets-generated`：品牌源初版放在 `assets/sage/source/`，撞上「目录 ↔ manifest 精确对账」判红——已移出到 `assets/sanbao-logo-kit/`，`--check` 转绿（见 Decision 第 4 条）。
  2. `node-interpreter`（`test:gate` 同步红）：未提交批里的 `scripts/gates/sage-packaging-contracts.test.mjs:87` 直接以 `process.execPath` 起子进程（pnpm 下它是宿主 Electron，子进程「退出码 0 且无输出」）——按 ADR-0040 改走 `scripts/lib/real-node.mjs` 的 `nodeCommand()`；单测 9/9、自测 246/246 转绿。
- **一处间歇红（如实登记，不猜修）**：整仓壳测试并发下 `test/business-matter-event-store-process.spec.ts` 的 SIGKILL 计时用例可失败（三次整跑：绿 / 红 4 例 / 绿；单独复跑 20/20 绿）。签名：`setTimeout(10)` 类时序断言 + 系统 load 6–8；再次出现先查负载与测试并行度，勿改断言。
- 外部 worktree 槽位（`~/.codex/worktrees/*`、`~/.qoder/worktrees/sage-ui-wiring`）在树本体删除后仅剩 0 字节 `.codex-worktree-name` 标记；已按「仅含空标记才删」的安全断言清除 21 个空槽位。

## 另列任务收据（2026-10-07）

用户将三条「未动边界」单列为任务并要求处理；packages 解耦 / 减重的决策入 [ADR-0273](../../../adr/ADR-0273.md)。

### ① 陈旧输入锁：按合同正式释放（完成）

- 合同依据：`packaging-sage/lib/input-lock.mjs` 的恢复路径——先确认无 producer / assembler / producer-contract 进程，再**人工移除该锁目录**（锁「永不自动释放」是设计）。
- 执行读数：owner.json 归档至恢复集 `stale-input-lock-owner.json`（owner=producer、pid 6775、acquiredAt 2026-10-06T13:06:58Z；pid 实测 stale/ESRCH）；无相关进程、无句柄；精确移除锁目录；官方 `run --operation probe -- /usr/bin/true` 获取→释放探针 **rc=0**、事后锁目录无残留；`packaging-sage/staging/` 现为空。

### ② 旧 LUTE 身份：退役处置包（完成；未移除）

- 只读复核：系统唯一 codesigning 身份 `LUTE Code Signing`（SHA-1 `BA3372A39BF4FE09E467AB8565CFB3A0166BABBE`）；消费者全部在 legacy scope（`packaging/assemble.sh:393`、`build-setup-app.sh:49`、`refresh-app-brand.sh:40`、`tcc-grant-status-test.sh:18` 四处默认值 + `packaging/README.md` 文档）；Sage 产品链不依赖它（用当次临时身份）。
- 交付：[退役处置包（保留回退）](../../proposed/process/2026-10-07-lute-signing-decommission-runbook.md)——现状事实、保留理由、移除三前提、移除步骤与影响清单。**未导出、未删除**，维持「退役但保留回退」的用户裁决。

### ③ legacy packages：加载解耦 + 减重（完成；源码保留）

- **解耦**（[ADR-0273](../../../adr/ADR-0273.md) D1/D2）：`gate.mjs` 两处与 `role-brief-shape.mjs` 两处静态 import 改**容错 TLA**（缺源为 null），受影响的 legacy 检查运行期 fail-closed 并给出 `git checkout HEAD -- packages/` 恢复提示；Sage 域检查集合与断言零变化。
- **缺席消融**：整目录临时移开后，`gate --scope sage --list`＝32、`--scope legacy --list`＝156 均正常；role-brief 缺源给提示并非零退出；恢复后对 `packages/` 零差异。
- **减重**（D3）：删 30 个 `packages/**/node_modules` + 1 个 `eval/out`；单次 `du` **1.91 GiB → 112 MiB（Δ ≈ 1.80 GiB）**（逐目录逻辑合计 2.96 GiB 含硬链接重复计，不采用该数）；跟踪源码、`lib/**`（253 个 tracked 文件）与 30 份 `pnpm-lock.yaml` 全保留；重装＝逐包 `pnpm install --frozen-lockfile`；`.dsh-types` 落包内的链接随 node_modules 移除，重装后 `node scripts/dsh-types.mjs --apply` 重建。
- **未做（前提已记，ADR-0273 D4）**：legacy 源码整体退役须同批撤 `.gitignore` 三处白名单、退役或迁移相应 legacy 检查与 selftest、审查 `scripts/acceptance/*` 引用面。
- **验证**：减重后 `gate --list` 32、role-brief 单测 7/7、`pnpm run test:gate` **246/246**、逐点复跑通过；整门禁最终复跑 **32/32（rc=0，checked=313、skipped=0，`final-gate-5.log`）**。

### ④ 复核期新登记的间歇红（签名与条件）

- 壳测试套件（`sage-shell-quality` 内含 typecheck→build→test）在**系统高负载**下出现**轮换**的时序用例失败：一次是 `business-matter-event-store-process.spec.ts`（SIGKILL 计时，4 例），一次是 `sage-fixture-projection-window.spec.ts`（18 例中 1 例）；两者**单独复跑均全绿**（20/20、18/18），且同批全量门禁曾 32/32 全绿。签名：`setTimeout(10)` 级联 + 子进程/Electron 探针 + load 6–9。处置：不改断言；出现时先看负载与并发，再单跑对应 spec 分类。

## 提交与推送收据（2026-10-07）

- 授权：用户「commit + push」。提交内容＝本记录全部事项 ＋ 此前未提交的批次 19–26、设备入口 / 读策略 / 工作区接线、`packaging-sage` 内测链与门禁 / 测试改动（完整清单见 `git show --stat`）。
- 推送前勘验：`origin = https://github.com/zjgulai/Sanbao`（私有）；`git fetch` 后与本地**零分叉**（0/0）；暂存面经机密与大文件扫描无命中；被忽略物（`vendor/*` 检出、node_modules、`.birdview` 证据等）按设计不进提交。
- 提交前最近一次整门禁 **32/32**（`final-gate-5.log`）；其后仅有本收据与交接节的文字更新（链接惰性，无新链接目标）。
- 提交与推送的 HEAD **以 `origin/main` 顶端为准**（本节不写死 SHA：该值会随仓库重建 / 后续提交漂移，读 `git log` 即得）。
