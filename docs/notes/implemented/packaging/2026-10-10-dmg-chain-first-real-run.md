# 内测 DMG 链首跑：三枚潜伏缺陷、版本单源与真实重观测

- 日期：2026-10-10
- 决策：[ADR-0279](../../../adr/ADR-0279.md)
- 状态：producer/装配/签发已真实通过（第八次重跑完成整条签发事务，见八追加）；dmg.sh 首执行暴露签名归一化残留（九追加，已修复，待重装配重签）；DMG 生成与 DMG-06 验收以本页后续读数为准。

## Problem

`packaging-sage/` 的 DMG-00~05 脚本与合同早已实施，但从未真跑过一次（`release/` 为空、DMG note 自述「真实 DMG 尚未验收」）。首跑按顺序暴露：① `pnpm-workspace.yaml` 的 `allowBuilds.esbuild` 占位符字符串（构建脚本批准门拒装；全新 clone/CI 同样翻车）；② 全仓零 `packageManager` 声明（隔离 HOME 的 corepack 回退最新版本，拉到布局不兼容的 pnpm；版本事实只活在 CI）；③ 闭包遍历器用宿主 Node 的 `builtinModules` 判定内建，`node:sqlite`（运行时 Node 24 内建）被误判为 npm 包；④ store 缺省前置：离线安装需先 `pnpm fetch` 补齐（本机 store 代际漂移，601 包集缺失）。

## Decision

1. `allowBuilds.esbuild: true`（按种子 `@deepseek-ai/dsh-subprocess-local: true` 先例格式）。
2. 根 / app / seed 三处钉 `packageManager: pnpm@11.8.0`（=CI `PNPM_VERSION`）。
3. `ci-workflow` 门禁新增逐字一致性检查（CI 钉值 ↔ 三处 `packageManager`）+ 突变自测——四份拷贝由一个机制守。
4. `runtime-graph.mjs` BUILTINS 显式登记运行时内建 `sqlite`（宿主 Node 22 列表没有它）+ 新增 pure 回归测试 `packaging-sage/tests/runtime-graph-builtins-test.mjs`；打包测试清单 12→13（层级 pure 7→8），两处自测钉子同步。
5. 本页同时登记真实重观测链路（与打包共用的隔离安装环境）：`apps/sage-shell/scripts/inventory-probe.mjs`（新，只读探针）——隔离根 materialize → Host（protocol v5）→ 生产组合读 inventory；`pnpm fetch` 为操作前置。

## Alternatives considered

- allowBuilds=false：把 esbuild 平台二进制校验推迟到构建期失败，与种子先例不一致——否决。
- 只修本机全局 pnpm、不改 manifest：隔离 HOME 各自解析版本，每个新环境重演——否决。
- 只用重跑成功作证、不加回归测试/门禁：P-03（修复必须变成拦住下一次的机制）——否决。
- 遍历器改用宿主 `getBuiltinModule` 探测：探测宿主能力，而闭包要匹配运行时能力——同样缺 `sqlite`——否决。

## Consequences

- 内测 DMG 链首次真实通过：producer 产出 production inputs（app-runtime + profile-template，receipt 绑定、27743 文件全 arm64）→ 契约测试 PASS → 装配 unsigned `Sage.app`（29892 文件）→ 签名计划验证（28 个 Mach-O，身份 `Sage Local Code Signing`）。签发步骤按设计需要用户过 SecurityAgent 信任弹窗（唯一交互前置）。
- 真实重观测首次跑通：隔离根 `~/tmp/sage-reobs-root`（generation `4e145a6b-0cfb-4206-b231-edb435c14be0`，601 包 2.8s——store 预热生效）→ 探针产出真实 descriptor/evidence；并首次用真实 descriptor 封存首个 target 发布件（详见 identity 语法对齐 note 与 ADR-0280）。
- 未闭：sign/dmg/acceptance 读数（用户交互）、DMG-06 主链依赖、`did not activate` 类告警的真机复查。

## 追加（2026-10-10 晚）：签发首执行又抓一枚首跑缺陷（bash 3.2 空数组）

用户执行 `sign-local.sh` 时崩于 line 37：macOS 自带 `/bin/bash` 3.2 在 `set -u` 下对**空数组**的 `"${arr[@]}"` 展开报 `unbound variable`——正常首跑没有 stale 恢复目录，恰好走空数组路径。全链 9 处同类展开（`sign-local.sh` / `assemble.sh` / `produce-inputs.sh` / `sign.sh`）统一改 bash 3.2 安全惯用法 `${arr[@]+"${arr[@]}"}`，四个脚本 `bash -n` 通过；新增纯合同守卫 `shell-scripts-bash32-safety-test.mjs`（扫描全部打包 shell 脚本的未防护 `[@]` 展开；负控实证：注入坏模式判红并点名 file:line，移除转绿）——打包清单 13→14、层级计数与自测同步。修复后由用户重跑签发命令，签发/DMG/验收读数以本页后续为准。

**再追加（2026-10-10 晚，第二次重跑）**：越过空数组路径后，签发崩于 `security import`：`MAC verification failed during PKCS12 import`。最小复现实证——PATH 上的 Homebrew OpenSSL 3.6.2 默认以 AES-256-CBC/SHA-256 写 PKCS#12，macOS `security import` 拒收（`modern.p12` 复现同一报错）；`openssl pkcs12 -export -legacy` 产物 `1 identity imported.`（exit 0）。修复：`sign-local.sh` 按版本门控 `-legacy`（LibreSSL 主机本就传统算法且无该旗标，不做假设）。

**三追加（2026-10-10 晚，第三次重跑）**：p12 导入成功后（`1 identity imported.`），签发倒在首个 `codesign`：`5348E9A9…: no identity found`——而此时 `find-identity -v -p codesigning` 两次解析均已通过。根因链：`set-keychain-settings -lut 300` 的 300 秒**空闲**锁在 sign.sh 的候选校验阶段（29k 文件拷贝与计划复核、其间零钥匙串访问）到期，codesign 取不到私钥即报该错（社区确证的 `no identity found` 两大主因=钥匙串锁定/无匹配私钥；后者被 `find-identity -v` 成功排除）。修复：空闲锁扩至 3600 秒（安全边界=脚本末尾的信任移除与临时材料删除，不是空闲锁）＋签发事务前再次 `unlock-keychain`。待用户第四次重跑读数。

**四追加（2026-10-10 晚，第四次重跑）**：同一报错在原地复现（换新证书 SHA-1，确定性失败）——空闲锁假设被证伪。决定性证据在 `codesign(1)` 手册「SIGNING IDENTITIES」节：**身份必须存放在调用用户钥匙串搜索列表上的钥匙串里**；`--keychain` 只做收窄搜索、不替代列表成员资格——而脚本按设计把临时钥匙串排除在搜索列表外（`assert-keychain-unlisted`），codesign 因此永远找不到它。修复：签名窗口内把临时钥匙串加入用户搜索列表（先把原列表规范化捕获到 `search-list-before.txt`），`recover` 全路径（成功/失败/崩溃）先恢复捕获列表再销毁钥匙串；畸形捕获拒绝改写并报错。纯测试新增两例（恢复捕获列表正例、畸形拒绝负例）并让 fakeSecurity 状态化；恢复套件 13/13 全绿。待用户第五次重跑读数。

**五追加（2026-10-10 晚，第五次重跑）**：搜索列表修复立竿见影——**28 个 Mach-O 全部签名成功**（含 helpers/frameworks/profile 原生模块），签后计划复核通过。随后倒在回执前的一步：`expected one designated requirement, observed 0`——终端可见的 `Executable=…` 单独一行证明此 macOS 对非 Apple 锚的签名**不再隐式生成 DR**（`code-evidence` 读 `codesign -d -r-` 的 `designated =>` 行得 0）。修复：外层 app 签名时显式 `--requirements "identifier "com.lute.sage" and certificate leaf = H"<leaf sha1>""`（内测构建=标识符绑定当次临时签名叶），回执自此有真实且可复验的 DR；helper/framework 不设（回执只核外层）。待用户第六次重跑读数。（更正：本节「不再隐式生成 DR」的结论与显式需求的修复已被七追加推翻与回退。）

**六追加（2026-10-10 晚，第六次重跑）**：28 目标签名再次全成，外层 app 显式需求被拒：`…: No such file or directory / invalid requirement specification`。本地 ad-hoc 探针（`-s -`，无需信任）钉死语法事实：`--requirements` 把参数当**文件路径**读——字符串两形态（裸串与 `designated =>` 前缀串）都以同一错误失败；文件形态成功（`replacing existing signature`），且 `codesign -d -r-` 能回读嵌入的 `designated => identifier "com.lute.sage" and certificate leaf = H"…"`（回读为小写十六进制，回执对比走回读值、大小写无碍）。修复：sign.sh 外层 app 分支把需求写入 `$work/outer-requirement.txt`（0600）后以文件路径传入。待用户第七次重跑读数。（更正：该修复已随七追加回退；`--requirements` 的字符串形态按文件路径解析这一语法事实仍成立，只是本链不需要它。）

**七追加（2026-10-10 晚，第七次重跑；根因更正）**：搜索列表窗口与文件形态的显式需求都已生效——**外层 app 签名成功、无任何报错**，但回执仍在 `expected one designated requirement, observed 0` 倒下。改用无信任 A/B 复刻定位（签名不需要信任，只需私钥可用：与 sign-local.sh 完全相同的 OpenSSL 自签配方 + 临时钥匙串 + 搜索列表成员 + 相同 codesign 旗标），钉死**根因在观测器，不在签名**：

- `codesign -d -r-` 的 dash 形式把 human-readable requirement 写到 **stdout**（stderr 只有 `Executable=` 头）；`signing-evidence.mjs` 只解析 stderr，**每一次**真实签名都被读成 0 条 DR；
- 真实身份**不传** `--requirements` 的对照组同样合成完整 DR（stdout 回读即 `designated => identifier "com.lute.sage" and certificate leaf = H"…"`；`Internal requirements count=1 size=92`）——五追加「此 macOS 不再隐式生成 DR」的结论**撤回**；六/七追加的显式 `--requirements` 修复随之**回退**（sign.sh 恢复原签名行，仅留防复陷注释）。

修复：`signing-evidence.mjs` 改读 stdout（保留 `{ run }` 注入点）；新增纯回归测试 `signing-evidence-test.mjs`（钉住：stderr 上的 DR 行必须不满足读取、两行判 2、空值判非法、参数保持 `-d -r-` 形态）；打包清单 14→15（pure 9→10），两处计数钉子同步。待用户第八次重跑读数；证据见 Verification。

**八追加（2026-10-10 晚，第八次重跑；签发链完成）**：DR 读流修复生效，**完整签发事务首次真实走通**：28 个 Mach-O 全部签名 → 候选计划复核 → 回执 `sage.local-signing-receipt.v2`（DR = `identifier "com.lute.sage" and certificate leaf = H"bb67cd1c…"`）→ `verify-signing-receipt`（逐 target 抽取 leaf cert 比对 SHA-256/SHA-1/CN、拒绝 runtime/timestamp/sandbox、plan digest 与 signed tree digest 复核）→ `signer verified: Sage Local Code Signing sha256:307f66ca…` → signed manifest → 原子换入 → 信任移除 + 临时钥匙串销毁 + 搜索列表还原（`signed … removed its trust and keychain`）。staging 落盘：签名 `Sage.app` + receipt + plan + manifest；无 `.sign.*`/`.local-signing.*` 残留；搜索列表 = `login.keychain-db`。

**九追加（2026-10-10 晚，dmg.sh 首执行；签名归一化残留）**：`dmg.sh --execute` 在 `verify-bundle` 的 **embedded profile template signing-normalized tree digest** 判据红：期望 `d21014e7…`（装配期从输入树记录），观测 `5e137a26…`（已签嵌入树）。根因（无信任复刻 + 对全部 13 个 profile-template 原生件逐一分类）：`codesign --remove-signature` 恢复签名外所有字节，但把 `__LINKEDIT` 的 `vmsize` 留在**签名期间的布局值**（签名尺寸参与该段的映射尺寸声明）；10/13 文件与输入仅此一字段有差（1–2 字节，可升可降；3 个恰好无差），文件尺寸恒等——旧归一化器只做 remove-signature 就哈希，于是「签名归一化摘要」在真实重签下不成立；原回归测试的合成夹具（`/usr/bin/true`，恰好不触发 vmsize 偏移）从未复现此形态（P-56 同族）。修复：归一化器在 remove-signature 后解析薄片 64 位 LE 的 Mach-O load commands，把 `__LINKEDIT.vmsize` 归零再哈希（fail-closed：非薄片/无 `__LINKEDIT` 直接拒绝；新增导出 `linkeditVmsizeOffset`）。**真实故障现场终验**：修复后 `digest(input/profile-template) == digest(已签嵌入式树)`（`1d766edd…`）、app runtime 两侧相等——dmg 判据的失败形态已消除；测试同步改薄 arm64 夹具（`process.execPath`）+ 新增「钉小 vmsize → 签名 → 移除，断言字段确实移动且摘要吸收之」用例。**注意**：元数据里的装配摘要由旧归一化器所写，修复后必须**重新装配**（记录新摘要）再重签，dmg 才可能通过。

## Verification

证据（2026-10-10，全部真实执行；未跑的步骤照实写）：

- **producer**：`bash packaging-sage/produce-inputs.sh --replace` 退出 0——`production inputs ready at packaging-sage/staging/input`；app-runtime 18M（1891 文件、graph 107 文件 / 34 直接包 / 95 symlink）、profile-template 481M（generation `sage-0-1-0-build-1-arm64`、manifest `0a70d47f…`、artifactSet `ec8ecea0…`、attestation `d07bdb7e…`、27743 文件）——首两次运行的失败与其根因（allowBuilds 占位符、corepack 版本回退）见 Problem。
- **契约测试**：`node packaging-sage/tests/producer-contract-test.mjs` 退出 0（`PASS produced runtime and profile validators` / `PASS bundled-profile install/reuse contract` / `PASS no signing or DMG execution`）。
- **装配**：`bash packaging-sage/assemble.sh --app-runtime … --profile-template …` 退出 0——`assembled unsigned Sage 0.1.0 (1) arm64 at packaging-sage/staging/Sage.app`（29892 文件，bundle identity 校验过）。
- **签名计划**：`bash packaging-sage/sign.sh --app packaging-sage/staging/Sage.app --plan` 退出 0——`signing plan verified against candidate inventory`（28 个 Mach-O），计划写入 `staging/Sage.app.signing-plan.tsv`；**签发执行未运行**（需要用户过 SecurityAgent，命令：`bash packaging-sage/sign-local.sh --app packaging-sage/staging/Sage.app --execute`）。
- **门禁**：`node --test scripts/gates/ci-workflow.test.mjs`（含版本单源用例）与 `node --test scripts/gates/sage-packaging-contracts.test.mjs`（13 项清单）全绿；`node packaging-sage/tests/run-contract-tests.mjs`——`pure contract suite: PASS (8/13 executed; platform/input/live not run)`。
- **重观测**：`SAGE_ROOT=~/tmp/sage-reobs-root pnpm run materialize` 退出 0（生成 generation `4e145a6b…`）；`node scripts/inventory-probe.mjs …` 退出 0——`inventory available: descriptor=urn:sage:runtime-descriptor:sha256:e1c7a8b4… evidence=urn:sage:inventory-evidence:sha256:d127d8bb…`。读法偏离手册一处：`resolveHostRuntime` 入参为 `activeProfile` 字段（探针以真实 API 为准）。
- **全量读数**：`apps/sage-shell` 全量套件 **205 文件 / 1854 通过 / 1 skip（exit 0）**；`pnpm run gate` **32/32（objects 315/315，0 skip，退出码 0）**——首跑新增的打包测试条目（12→13）与 `ci-workflow` 版本单源检查均在门禁内真实执行。
- **DR 解析更正（七追加）**：`node packaging-sage/tests/signing-evidence-test.mjs` 退出 0（stdout 正例 / stderr 负例 / 两行 / 空值 / 非零退出五用例）；修复后的 `designatedRequirement()` 对无信任自签身份的**真实**签名件端到端回读成功——`identifier "com.lute.sage" and certificate leaf = H"f969e12f746f89e6c5e525dd92881842b76e4a9c"`（A/B 复刻组 Mini 件）；`node packaging-sage/tests/run-contract-tests.mjs` → `pure contract suite: PASS (10/15 executed)`；`node --test scripts/gates/sage-packaging-contracts.test.mjs` **6/6**。
- **签发射出（第八次重跑，真实签名）**：28 个 Mach-O 及全部嵌套 bundle 签名完成 → 回执 → `signer verified: Sage Local Code Signing sha256:307f66ca…`（逐 target leaf cert、plan digest、signed tree digest 全核）→ signed manifest → 原子换入 → 信任移除 + 钥匙串销毁 + 搜索列表还原（退出 0）；DR 回读 `identifier "com.lute.sage" and certificate leaf = H"bb67cd1c…"` 与回执逐字一致。
- **归一化修复真实验证（九追加）**：`digest(input/profile-template) == digest(已签嵌入式树)`（`1d766edd…`）、app runtime 两侧相等；`node packaging-sage/tests/signing-normalized-tree-test.mjs` 退出 0（含 vmsize 残留用例）；`--replace` 重装配后（29892 文件，旧 receipt/plan 由事务清除）`node scripts/verify-bundle.mjs staging/Sage.app` 退出 0——新元数据 ↔ 输入树一致。
- **未运行**：dmg 生成与 DMG-06 验收（重签后执行）。
