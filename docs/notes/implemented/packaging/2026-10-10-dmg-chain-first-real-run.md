# 内测 DMG 链首跑：三枚潜伏缺陷、版本单源与真实重观测

- 日期：2026-10-10
- 决策：[ADR-0279](../../../adr/ADR-0279.md)
- 状态：producer 与装配已真实通过；签发（等待用户过 SecurityAgent 信任弹窗）、DMG 生成与 DMG-06 验收以本页后续读数为准。

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

## Verification

证据（2026-10-10，全部真实执行；未跑的步骤照实写）：

- **producer**：`bash packaging-sage/produce-inputs.sh --replace` 退出 0——`production inputs ready at packaging-sage/staging/input`；app-runtime 18M（1891 文件、graph 107 文件 / 34 直接包 / 95 symlink）、profile-template 481M（generation `sage-0-1-0-build-1-arm64`、manifest `0a70d47f…`、artifactSet `ec8ecea0…`、attestation `d07bdb7e…`、27743 文件）——首两次运行的失败与其根因（allowBuilds 占位符、corepack 版本回退）见 Problem。
- **契约测试**：`node packaging-sage/tests/producer-contract-test.mjs` 退出 0（`PASS produced runtime and profile validators` / `PASS bundled-profile install/reuse contract` / `PASS no signing or DMG execution`）。
- **装配**：`bash packaging-sage/assemble.sh --app-runtime … --profile-template …` 退出 0——`assembled unsigned Sage 0.1.0 (1) arm64 at packaging-sage/staging/Sage.app`（29892 文件，bundle identity 校验过）。
- **签名计划**：`bash packaging-sage/sign.sh --app packaging-sage/staging/Sage.app --plan` 退出 0——`signing plan verified against candidate inventory`（28 个 Mach-O），计划写入 `staging/Sage.app.signing-plan.tsv`；**签发执行未运行**（需要用户过 SecurityAgent，命令：`bash packaging-sage/sign-local.sh --app packaging-sage/staging/Sage.app --execute`）。
- **门禁**：`node --test scripts/gates/ci-workflow.test.mjs`（含版本单源用例）与 `node --test scripts/gates/sage-packaging-contracts.test.mjs`（13 项清单）全绿；`node packaging-sage/tests/run-contract-tests.mjs`——`pure contract suite: PASS (8/13 executed; platform/input/live not run)`。
- **重观测**：`SAGE_ROOT=~/tmp/sage-reobs-root pnpm run materialize` 退出 0（生成 generation `4e145a6b…`）；`node scripts/inventory-probe.mjs …` 退出 0——`inventory available: descriptor=urn:sage:runtime-descriptor:sha256:e1c7a8b4… evidence=urn:sage:inventory-evidence:sha256:d127d8bb…`。读法偏离手册一处：`resolveHostRuntime` 入参为 `activeProfile` 字段（探针以真实 API 为准）。
- **全量读数**：`apps/sage-shell` 全量套件 **205 文件 / 1854 通过 / 1 skip（exit 0）**；`pnpm run gate` **32/32（objects 315/315，0 skip，退出码 0）**——首跑新增的打包测试条目（12→13）与 `ci-workflow` 版本单源检查均在门禁内真实执行。
- **未运行**：sign/dmg/acceptance（等待用户过 SecurityAgent 的交互步骤）。
