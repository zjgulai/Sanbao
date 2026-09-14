# 方案 · LUTE 2.4.0 DMG 打包发布（待执行）

> 本文件是**一次性的执行方案**，不是长期 SOP。长期规程见 [dmg-release.md](dmg-release.md)；
> 本文件只写「2.4.0 这一版怎么办」——包括本次盘点**实测**出来的、会咬这一版的那几处。
> 红线来源：[ADR-0056](../adr/ADR-0056.md) / [ADR-0057](../adr/ADR-0057.md) /
> [ADR-0058](../adr/ADR-0058.md) / [ADR-0063](../adr/ADR-0063.md) / [ADR-0067](../adr/ADR-0067.md) /
> [ADR-0076](../adr/ADR-0076.md) / [ADR-0080](../adr/ADR-0080.md) / [ADR-0081](../adr/ADR-0081.md) /
> [ADR-0082](../adr/ADR-0082.md)；复发故障总账 [pitfalls-playbook.md](../pitfalls-playbook.md)。
>
> **执行前必须先读总账**——本方案里的每一步都对应总账里一条已发生过的故障，不要凭直觉跳过。

## 0. 状态盘点（2026-09-13 实测，非推测）

| 项 | 读数 | 结论 |
| --- | --- | --- |
| 分支 / 工作区 | `main`，`git status --short` 为空 | 可开始 |
| 起点 | `v2.3.3` = `d4365f2`（tag 对象 → `f9e67b5`） | 上一发布版 |
| 本次增量 | `v2.3.3..HEAD` = **22 个提交** | 见 §1 |
| `vendor/dsh-desktop.pin` | `lute-sha=4e23031e`，submodule HEAD = `4e23031e` | **一致**，pin 门禁会过 |
| 磁盘 | `/` 剩余 376 GiB | ≥ 6 GB，够 |
| 签名身份 | 钥匙串有 `BA3372A39BF4FE09E467AB8565CFB3A0166BABBE "LUTE Code Signing"` | **在位**，与 SOP §4 表内 SHA-1 逐字相同 ⇒ TCC 授权延续 |
| 目标版本目录 | `packaging/release/2.4.0` 与 `packaging/staging/2.4.0` **都不存在** | 可用，无需 `--force` |
| 本机运行的 DSH | **有**（`dsh-running.sh` 退出码 0，pid 96890） | 见 §2.2 |
| `pnpm run gate`（quick） | **49/49 绿** | 过 |
| `pnpm run gate:full` | **55/55 绿**（原先 54/55，红项 `scripts-runnable` 已修，见 §2.1） | 过 |

### 出货面构成（决定这一版「客户会多看到什么」）

| 读数 | 值 | 出处 |
| --- | --- | --- |
| 2.4.0 出货技能面 | **349** | 装配后实测：卷内 `skills/*/SKILL.md` 去重 349 条，与 `completeness.json` 的 `skills` 清单 **349 双向零差异**（missing 0 / extra 0） |
| 2.3.3 出货技能面 | **349** | 同一算法量 2.3.3 的 `skills-presets.tar.gz` |
| 两版逐名差异 | **空**（`diff` 无输出） | ⇒ **出货面零变化**，换底只动产品侧底本 |
| 其中 `p2s-*` | 164（两版相同） | 与 `skill-map.json` 的 `p2s-*` 引用数相等 |
| 出货预设 | **51**（岗位 50 + 登记 1：`lute-cordis`；本机保留不发 1：`bobo-cto`） | `assemble.sh` 输出 |
| 新接入的 52 张卡 | **均不在**出货面（`skill-map` 命中 0/52，preset 命中 0/52） | ⇒ 换底**不改变对客户的出货面** |
| `packaging/shipped-skills.json` 产品级白名单 | 15 条 | ADR-0074 |

> ⚠️ **计数口径的坑（本方案 §0 初版就在这里写错了一个数）**：`tar tzf … | awk -F/ '$1=="skills" && NF>1 {print $2}'`
> 会把 **`skills` 目录自身**那个条目（`NF==2`）也算成一个技能，**恒多 1**（读数 350）。
> 正确写法要 `$3=="SKILL.md"` 或 `NF>2`。判据本身自带这个坑时，「比数」就成了比两个都错的数——
> 这正是 ADR-0075/P-11 说的「先写下判据对谁成立」。

## 1. 本次的源提交（装配将包含它们）

| 提交 | 内容 | 与打包的关系 |
| --- | --- | --- |
| `f565f08` | 修 `node-interpreter` 三处（起子进程的解释器在 pnpm 下是宿主 Electron，三条断言一直恒真） | `quick` 门禁 48/49 → **49/49** |
| `6014177` | PHASE6-S5/B11 精选线接入底本：1338 → 1390（+52），新增 `append-selected-line.mjs` 与 `venue-tiers.json` | 改变了载荷内 `classification.json` 的字节 |
| `f111fcb` | `--check` 假绿修复 + ADR-0082 + Note | 文档与工具 |
| 本方案的提交组（§2.1 的修复） | `rebuildFrontmatter` 保留键位（ADR-0083 + Note + 总账 P-16）＋ `contract-gate.js` 5 处 typecheck | `gate:full` 54/55 → **55/55**；改动**碰了出货面**：`lib/index.js` 的字节进了载荷，签名前必须 `sync-profile --apply --loadpoint` 已做 |

## 2. 开工前必须清掉的三件事

### 2.1 `gate:full` 的 `scripts-runnable` 红项 —— **已修，55/55**

原判读被**推翻**，如实记录（`gate:full` 的读数形如 `expected [ Array(145) ] to deeply equal []`，
当时读成「本机语料状态问题」。真因见 [ADR-0083](../adr/ADR-0083.md) / 总账
[P-16](../pitfalls-playbook.md)）：

- `dsh-paper2skills` 的 5 处是**存量红**：`lib/contract-gate.js` 与 `6d6429a`（S12）**逐字节相同**，
  属 JSDoc 类型标注与实现不同步（含一处**类型在说假话**：`bySlug` 声称存 `kind` 而实际没存）。
- `dsh-algo-skills-local` 那 2 个用例**不是语料漂移，是产品真缺陷**：`rebuildFrontmatter` 把两个
  开关键从块里摘掉再追加到块尾，导致**含 `rebase_*` 字段的 145 张卡**（全语料 1390 张里）
  在「点两下开关」后键序被改写。已改为保留原位。

**对本版打包的含义**：这个修复**改到了出货字节**（`lib/index.js` 进了载荷），所以

- 装配**必须**在修复之后（否则发出去的是带缺陷的旧产物）；
- 装配前 `node scripts/sync-profile.mjs --check --loadpoint` 必须无漂移（已做，装载点与仓库
  产物 sha256 一致）；
- 客户可见的行为变化**只有**：在算法技能页把某张卡开→关，磁盘上**不再**被改写键序。
  出货面技能数**不变**（修复不碰白名单与分类底本）。

### 2.2 退出正在运行的 DSH 实例（白屏红线）

正在跑的实例（本机实测 pid 96890）会让「替换 app bundle」触发热更 → 生产 renderer 无热替换
runtime → **整屏白屏**。判据只有一个家，**不要就地另写一条命令**（本仓库曾用一条读数为空的
判据守这条红线，ADR-0080）：

```bash
bash packaging/scripts/dsh-running.sh
# 退出码：0 = 有实例在跑（先退出它再回来）；1 = 没有在跑（可继续）；4 = 判不了（按失败处理）
```

**注意**：这个 DSH 实例就是当前会话正在跑的宿主。退出它会中断本会话——
执行打包时请安排在一个不会被自身打断的时机（例如先结束会话再在终端里跑，或接受会话中断）。

### 2.3 冻结工作区

装配期间任何并发改动都会被 `打包源指纹` 判据抓到并中止（这是设计意图）。确保没有其他会话在写
`~/.dsh` 与仓库：

```bash
git -C "$DSH_VENDOR" status --short
```

## 3. 这一版特有的复发性坑（逐条对照总账）

| # | 坑 | 本版的具体形态 | 拦它的门禁 / 判据 |
| --- | --- | --- | --- |
| 1 | **运行中替换 app bundle → 白屏**（P-02 + ADR-0063） | 本机此刻就有实例在跑（0） | `dsh-running.sh`；安装器 0b；`dsh-running-selftest`、`installer-running-guard-selftest` |
| 2 | **交付形态是产物的属性**（P-14） | 卷里是什么、入口是哪个，只有 [安装手册第 2 节](../../packaging/INSTALL-GUIDE.md) 一个家；**不要去改 SOP 的复述** | `dmg-layout-doc`（卷内清单 ↔ 安装手册**两向**逐名对照） |
| 3 | **图标有两个家**（ADR-0081） | Finder 的 `icon.icns` 对了 ≠ Dock 的 `build/app-icon-mac.png` 对了；Dock 那套由 `setIcon()` 覆盖 | `brand-icons`、`brand-replay-selftest`；装配时 `assemble.sh` 自动重放 |
| 4 | **签名身份不得回退 adhoc**（ADR-0063） | 证书缺失必须**失败**；回退 adhoc 会静默恢复「TCC 授权随字节失效」 | `verify-app-signature.sh`；SOP §4/§5.1 |
| 5 | **TCC 授权「显示已开启」不等于有效**（ADR-0068） | 面板只读 `auth_value`，不显示 `csreq` 绑在谁身上 | `tcc-grant-status.sh`（退出码 3 = 检出死授权）、`tcc-grant-status-selftest`、`tcc-form-selftest` |
| 6 | **重授必须在「身份版已就位」之后**（ADR-0068 规则一） | 先重授再换 app = 白付一次；反了就得再付一次 | 安装器落位完成后才提示重授 |
| 7 | **机器路径只减不增**（ADR-0073） | 新接入的 52 条卡带 vault 路径进 `_provenance`；出货副本会被改写为占位符 | `scan-machine-paths.mjs`、`machine-path-tarball-selftest`、`rewrite-build-paths-test.sh` |
| 8 | **同号不同字节不可接受**（ADR-0057） | `2.4.0` 目录此刻不存在 ⇒ **不存在重制问题**；若中途失败重来，**必须换号或 `--force` 归档**，不许手工覆盖 | `sign-and-dmg.sh` 的版本目录检查；`release-artifacts-intact` |
| 9 | **产物丢了要找回、不要重做**（ADR-0057 + P-12） | 万一失败：`release/2.4.0.sha256` 在、字节不在 = 红灯，用 `release-restore.sh` 找回 | `release-verify.sh`、`release-verify-selftest` |
| 10 | **分发面不是可选项**（ADR-0076） | 2.0.1/2.2.0/2.3.0/2.3.1 曾四版从未上过 Releases | `release-published`（4 个版本在射程内；draft 不算已发布） |
| 11 | **`gh release create` 的退出码不是判据**（P-02） | 曾把失败读成 `exit=0`（`$?` 读的是 `echo`）；640 MB 上传可被打断且会回滚整个 Release | 以外部 `gh release view --json isDraft,assets` 对状态 |
| 12 | **出货面白名单缺文件 = 判否，不是空名单**（ADR-0074） | `shipped-skills.json`（15 条）与 `shipped-presets.json` 缺文件即中止 | `shipped-skills-scope-selftest`、`shipped-presets-scope-selftest` |
| 13 | **底本与实物的一致性**（ADR-0082） | 本版新增 52 条卡进底本；若 staging 与底本不一致，安装校验会报**编外目录** | `verify-install.mjs`；换底工具带 `--check`（待接入 0 才绿） |
| 14 | **venue 词表尚未接读**（ADR-0082） | `data/venue-tiers.json` 是「已投递、待接读」，且与 `axis.js:58` **已分歧**。它**不影响**本版出货行为（无 reader ⇒ 无行为），但**不许**在 Release notes 里写成「venue 词表已生效」 | 人工核对；`axis.js` 未被本次改动 |

## 4. 执行步骤

### 步骤 0 · 环境与前置变量

```bash
cd "$DSH_VENDOR/packaging"
export COREPACK="$HOME/.lute-toolchain/node_modules/.bin/corepack"
[ -x "$COREPACK" ] || npm i --prefix "$HOME/.lute-toolchain" corepack
export DSH_APP="/Applications/DSH Desktop.app"
export DSH_HOME="$HOME/.dsh"
export DSH_VENDOR="$HOME/project/Magpie-Horch"
export VERSION="2.4.0"
```

### 步骤 1 · 前置检查（**每一条都要真跑，不许「看着没问题」**）

```bash
git -C "$DSH_VENDOR" status --short
pnpm run gate
bash packaging/scripts/dsh-running.sh
ls -d "packaging/release/${VERSION}" 2>/dev/null && echo "目录已存在——必须换号或 --force" || echo "未占用，可继续"
security find-identity -v -p codesigning | grep -c "LUTE Code Signing"
```

### 步骤 2 · 装配 payload

```bash
cd "$DSH_VENDOR/packaging"
VERSION="$VERSION" ./assemble.sh
```

预期产物（`staging/$VERSION/payload/`）：`DSH Desktop.app.tar.gz`、`profile.tar.gz`、
`skills-presets.tar.gz`、`aeis-portable.tar.gz`、`install.sh`、`LUTE Setup.app`、`tools/`。

装配失败时的四个常见落点：pin 不一致 / electron 二进制缺失 / `package:dir` 失败
（看 `/tmp/lute-package-dir.log` 尾部）/ **打包源指纹不一致**（并发改动，停手后重跑）。

### 步骤 3 · 出货面读数核对（本版最关键的一次人工比数）

```bash
tar tzf "staging/${VERSION}/payload/skills-presets.tar.gz" | awk -F/ '$1=="skills" && NF>1 {print $2}' | sort -u | wc -l
```

**期望 349**（若与 2.3.3 不同，先给出原因再决定是否继续）。

### 步骤 4 · 隔离冒烟

```bash
./scripts/smoke-test.sh "staging/${VERSION}/payload"
```

冒烟在 `/tmp` 隔离环境进行；同机有实例在跑时首启测试会跳过（预期行为）。

### 步骤 5 · 签名并制 DMG

```bash
./sign-and-dmg.sh "staging/${VERSION}/payload" "$VERSION"
```

产物落在 `packaging/release/$VERSION/`：DMG + `SHA256SUMS` + `VERSION` + `manifest.json`，
以及仓库根 `release/$VERSION.sha256`（**要进 git**）。

### 步骤 6 · 终验

签名与身份（含**跨版本身份延续**，这一条是「用户升级后不必重新授权」的机器判据）：

```bash
codesign --verify --deep --strict "packaging/staging/${VERSION}/app/DSH Desktop.app"
codesign -d -r- "packaging/staging/${VERSION}/app/DSH Desktop.app" | grep -o 'certificate leaf = H"[0-9a-f]*"'
```

期望 `certificate leaf = H"ba3372a39bf4fe09e467ab8565cfb3a0166babbe"`（不得出现 `cdhash`）。

### 步骤 7 · 哈希与卷内清单

```bash
hdiutil attach "packaging/release/${VERSION}/DSH-Desktop-LUTE-${VERSION}-mac-arm64.dmg" -nobrowse
ls -A "/Volumes/DSH Desktop LUTE ${VERSION}/"
pnpm run gate:full
hdiutil detach "/Volumes/DSH Desktop LUTE ${VERSION}"
```

**卷里有哪些文件由 `dmg-layout-doc` 与安装手册第 2 节的入口表两向对照**，不要靠眼看。

```bash
cd "packaging/release/${VERSION}" && shasum -a 256 -c SHA256SUMS
```

### 步骤 8 · 首次启动（干净环境）

按安装手册第 2 节选入口（**双击 `LUTE Setup.app`** 或 `bash install.sh`）——
卷上**没有**解开的 app，`DSH Desktop.app.tar.gz` 是压缩载荷，**不要**试图拖进 `/Applications`。
首启后连做两次冷启动，过**白屏三问**（窗口截图像素非纯白 / `startup.jsonl` 的 `rendererStatus` /
日志有 `[Renderer]` 转发通道）。

### 步骤 9 · 载荷敏感内容扫描（GitHub 仓库是公开的）

```bash
grep -rIl -E "sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|BEGIN [A-Z ]*PRIVATE KEY|Authorization: Bearer" staging/${VERSION}/payload 2>/dev/null
```

命中必须**定位到文件再判**（2.3.3 的两处命中分别是渗透测试技能里的文档样例 JWT 与
base64 WASM 字节码里的巧合序列，都不是凭证）。

### 步骤 10 · 发布

```bash
git add "release/${VERSION}.sha256"
git commit -m "release: ${VERSION} dmg manifest"
git tag -a "v${VERSION}" -m "DSH Desktop LUTE ${VERSION}"
```

推两条远端（ADR-0001），再创建分发面。**notes 必须先落盘**（构建号、源提交、profile 快照、
SHA256、**该版的已知缺口**）：

```bash
gh release create "v${VERSION}" --title "LUTE ${VERSION} — <一句话>" --notes-file "/tmp/lute-release-${VERSION}.md" --verify-tag --latest "packaging/release/${VERSION}/DSH-Desktop-LUTE-${VERSION}-mac-arm64.dmg" "packaging/release/${VERSION}/SHA256SUMS"
```

收尾**以外部队对状态为准**（不要读 `gh` 自己的退出码）：

```bash
gh release view "v${VERSION}" --json isDraft,assets
```

### 步骤 11 · 登记

飞书/内部文档登记 SHA256、tag、`source_commit`（从 `manifest.json` 读）。
Release notes 的「已知缺口」至少应写：换底 **52/53**（第 53 张卡的 slug 命名决策未做）、
venue 词表**已投递未接读**、S12 的 13 组变异自测**不在门禁射程内**。

## 5. 回滚

- 旧版本 DMG 保留在 `packaging/release/.archive/` 与
  `$HOME/Library/Application Support/LUTE/releases/<版本>/`（两处 `uchg` 锁定，**这是设计意图**）。
- 产物丢失时**找回、不要重做**：`bash packaging/scripts/release-restore.sh <版本>`
  （遍历 `~/Downloads`、`~/Desktop`、`~/Documents`、`/Volumes`、仓库外归档；
  **不要用搜索工具的沉默当缺席的证据**，P-12）。
- 确不可找回时用 `release/<版本>.lost` 宣告，并在找回后改名为 `.recovered`（豁免会过期）。

## 6. 需要你拍板的三个节点

1. **§2.1 怎么处置**：先修 `scripts-runnable` 两处（推荐 A），还是只按 SOP 字面用 `quick`
   并把红项如实写进「已知缺口」（B）？
2. **什么时候退出正在运行的 DSH**：它就是本会话的宿主，退出即中断本会话。
3. **发版登记的公开面**：是否本次一并把 `v2.4.0` 上 GitHub Releases（`--latest`），
   以及是否顺带补发历史上从未上过 Releases 的版本（补发时**必须** `--latest=false`）。
