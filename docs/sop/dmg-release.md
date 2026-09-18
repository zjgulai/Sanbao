# SOP · DSH Desktop × Magpie-Horch DMG 打包发布

> 适用范围：从本仓库源码构建并发布 macOS arm64 版 DMG。
> 决策来源：[ADR-0056](../adr/ADR-0056.md)、[ADR-0057](../adr/ADR-0057.md)、[ADR-0058](../adr/ADR-0058.md)。
> 相关脚本：`packaging/assemble.sh`、`packaging/sign-and-dmg.sh`。
> 开工前先读**复发故障总账** [../pitfalls-playbook.md](../pitfalls-playbook.md)：其中 P-02（仪器假绿）、
> P-06（把平台行为当常量）、P-08（用纪律守只有机制能守住的东西）、**P-14（交付形态是产物的属性，
> 却按文档的属性维护——本 SOP §5 曾在同一版里同时写错三处）** 与本 SOP 直接相关。
> **§0 的检查项里不许出现「读数为空的仪器」**——那条红线由门禁 `dead-instrument` 逐行核对，
> 登记簿在 [`scripts/gates/dead-instruments.json`](../../scripts/gates/dead-instruments.json)
> （[ADR-0080](../adr/ADR-0080.md)）。清单本身也是判据（ADR-0069）：写在清单里的命令，
> 会有人照着敲，所以它必须真的读得出东西。

## 0. 发布前检查清单

- [ ] 当前在仓库 `main` 分支且工作树干净（`git status --short` 为空）。
- [ ] 本次改动的 ADR 与 Note 已落盘，`docs/adr/README.md` 索引已更新。
- [ ] 项目级 `pnpm run gate` 通过（退出码 0）。
- [ ] `vendor/dsh-desktop.pin` 的 `lute-sha` 与 `vendor/dsh-desktop` 当前 HEAD 一致。
- [ ] 磁盘剩余空间 ≥ 6 GB。
- [ ] **本机无运行中的 DSH 实例**：`bash packaging/scripts/dsh-running.sh`（随包部署在
  `tools/` 下）——**退出码 1 = 没有在跑**，可以继续；**0 = 有实例在跑**，先退出它再回来；
  **4 = 判不了**，必须当失败处理（`ps` 读不出进程表时不能断定「没有在跑」）。
  运行中替换 app bundle 会触发宿主 HMR 热更 → 生产 renderer 无完整热替换 runtime → 白屏（2026-09-13 实测）。
  本条曾写成一条 `pgrep -f` 判据，而**它在主进程在跑时返回空**——读数与决策见 [ADR-0080](../adr/ADR-0080.md)；
  「在不在跑」只有这一个家，不要在此另写一条命令。
- [ ] **本版触及的 UI 面，实况探针必须逐条跑绿**（退出码 0 = 全部断言通过）。
  探针在真实 Chromium 里装载 **profile 装载点的插件产物**，对着**本机 app 包里的官方 CSS**
  复刻官方结构再断言用户可观察结果——它验的是「类名解析 + DOM 改写真的生效」，
  那是 `pnpm run gate` 量不到的一层。
     - `node scripts/acceptance/root-brand-live-anchors.mjs --out .scratch/acceptance/<VERSION>`
       —— 品牌面：官方标题不再出现、品牌句只出现一次、角标 `Preview`、结构不唯一时不隐藏新的东西、
       换随机新前缀仍命中、卸载可还原。
     - 其余按本版改动面取：`pnpm accept:theme-tokens`、`pnpm accept:settings-shell`、
       `pnpm accept:newapp-products`、`pnpm accept:newapp-systems`、`pnpm accept:worktable-fence`。
  ⚠️ 本条是 2026-09-18 事故的直接产物：**没有任何检查项要求跑探针**，于是品牌探针在 2.0.10 上
  第一步就死（按旧结构找已退役的 `StatsLine` 模块，exit 3），而死掉的探针安静得像通过——
  同一天装机的用户看到的是官方标题「探索未至之境」重新出现。**「没跑」与「跑了且绿」必须是两种读数。**
- [ ] 目标版本目录 `packaging/release/<VERSION>/` 不存在；若存在且必须重制，使用 `--force`。

## 1. 环境准备

```bash
# corepack 路径（node 26 不自带）
export COREPACK="$HOME/.lute-toolchain/node_modules/.bin/corepack"
[ -x "$COREPACK" ] || ( npm i --prefix ~/.lute-toolchain corepack )

# 默认变量（按需覆盖）
export DSH_APP="/Applications/DSH Desktop.app"
export DSH_HOME="$HOME/.dsh"
export DSH_VENDOR="$HOME/project/Magpie-Horch"
export VERSION="2.3.0"          # 按语义版本规则递增
```

## 2. 装配 payload

```bash
cd "$DSH_VENDOR/packaging"
VERSION="$VERSION" ./assemble.sh
```

预期产物：

- `staging/$VERSION/payload/DSH Desktop.app.tar.gz`
- `staging/$VERSION/payload/profile.tar.gz`
- `staging/$VERSION/payload/install.sh`
- `staging/$VERSION/payload/tools/`（`verify-patches-v2.sh` 38 锚点、`brand-replay.sh`、`brand-icons/`、`runtime-guards/`、`rewrite-file-deps.mjs`、`reloc-aeis.sh`、`tcc-grant-status.sh`、`dsh-running.sh`）
- 装配日志：`/tmp/lute-package-dir.log`

**若失败**：根据脚本输出定位；常见失败点：

1. `pin 门禁失败` → 对齐 `vendor/dsh-desktop.pin` 与 submodule HEAD。
2. `electron 二进制缺失` → 脚本会自动经 npmmirror 安装；失败则手动执行 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ node node_modules/electron/install.js`。
3. `package:dir 失败` → 看 `/tmp/lute-package-dir.log` 尾部。
4. `打包源指纹不一致` → 装配期间有另一个会话改动了 live profile；停止并发改动后重跑。

## 3. 隔离冒烟（可选但强烈建议）

```bash
# 若存在 smoke-test.sh
./scripts/smoke-test.sh "staging/$VERSION/payload"
```

冒烟在 `/tmp` 隔离环境进行，验证安装器、首启、关键锚点。若同机已有 DSH 实例在跑，首启测试会跳过——这是预期行为（同机双实例会互相干扰）。

## 4. 签名并制 DMG

```bash
./sign-and-dmg.sh "staging/$VERSION/payload" "$VERSION"
```

产物：

- `packaging/release/$VERSION/DSH-Desktop-LUTE-$VERSION-mac-arm64.dmg`
- `packaging/release/$VERSION/SHA256SUMS`
- `packaging/release/$VERSION/VERSION`
- `packaging/release/$VERSION/manifest.json`
- 仓库根 `release/$VERSION.sha256`（入库清单，已进 git）

**若版本目录已存在**：脚本会拒绝。必须重制时加 `--force`：

```bash
./sign-and-dmg.sh "staging/$VERSION/payload" "$VERSION" --force
```

旧产物会被归档到 `packaging/release/.archive/`，不会被删除。

### 签名身份（受门禁保护的构建输入，ADR-0063）

`assemble.sh` 用**固定身份的证书**给 app 深签名；证书缺失或不可用即**失败**，不得回退 adhoc
（回退等于静默恢复「TCC 授权随字节失效」这一缺陷，且失败方向恰是最糟的一种：产物照出、权限照丢）。

| 项 | 值 |
| --- | --- |
| 证书名（CN，也是 `--sign` 的取值） | `LUTE Code Signing` |
| 类型 | 自签代码签名证书（免费、离线可建、无外部依赖；非 Developer ID，故 Gatekeeper 面不变） |
| 建立 / 重建 | `packaging/scripts/ensure-signing-identity.sh` |
| SHA-256 指纹 | `7B:82:6F:76:BD:8A:0C:42:F7:AC:3A:70:8F:5B:D9:54:4B:34:C5:42:56:89:67:A9:A6:BD:03:7B:45:93:F9:E3` |
| SHA-1 指纹（**指定要求里钉的就是这个**，与 `codesign -d -r-` 的 `certificate leaf = H"…"` 直接可比） | `ba3372a39bf4fe09e467ab8565cfb3a0166babbe` |
| 有效期至 | **2036-09-10**（10 年）；到期会以「签不出来」的形式暴露，届时续建并重授一次 TCC |

**私钥只在构建机钥匙串**，不进仓库、不进 profile、不进任何 Markdown（ADR-0008）。上表登记的是可公开的
身份信息，用途是「换机重建时确认是不是同一个身份」——指纹一致，TCC 授权才谈得上延续。

**重建身份（或换机）等于换身份**：TCC 条目按新身份重建，需重授一次。所以别为了「清一遍」随手重建证书；
只有确认指纹与上表不符时才动手。

复核身份（判据机读，两条都要）：

```bash
# ① 装配面（制 dmg 前即可验）
codesign -d -r-  "packaging/staging/$VERSION/app/DSH Desktop.app"         # 指定要求：不得出现 cdhash
codesign -dv --verbose=2 "packaging/staging/$VERSION/app/DSH Desktop.app" | grep Authority
# ② 交付面（挂载 dmg 后解包复核；sign-and-dmg.sh 的终验已自动做这一步）
# ③ 身份一致性（换机 / 疑心证书被重建时验）：DR 钉的 leaf 必须逐字节等于上表 SHA-1
codesign -d -r- "packaging/staging/$VERSION/app/DSH Desktop.app" | grep -o 'certificate leaf = H"[0-9a-f]*"'
# 期望：certificate leaf = H"ba3372a39bf4fe09e467ab8565cfb3a0166babbe"
```

`Authority=` 为空即说明产物是 adhoc——正是 ADR-0063 要消除的形态。出厂冒烟
（`packaging/scripts/smoke-test.sh`）已把这两条连同「指定要求可读出」（防空判据假绿）做成断言。

## 5. 终验

### 5.1 签名验证

```bash
codesign --verify --deep --strict \
  "packaging/staging/$VERSION/app/DSH Desktop.app"
```

应返回无错误。

**复核的是 `staging/$VERSION/app/` 那棵树，不是 `packaging/release/$VERSION/`。**
后者只有 DMG 与清单三件（`SHA256SUMS` / `VERSION` / `manifest.json`），**没有解开的 app**——
本 SOP 曾在此处写 `packaging/release/$VERSION/DSH Desktop.app`，那条命令在本机当场失败
（同一版里同一根因的第三处，见 §5.2 与 [P-14](../pitfalls-playbook.md)）。

**跨版本身份延续（每一版都要跑）**：换签的全部目的是「用户升级后不必重新授权」。这条不是
只能靠人工复测的经验问题——TCC 存的授权要求取自 app 的指定要求，故它等价于：

```bash
bash packaging/scripts/verify-tcc-persistence.sh \
  "$HOME/Library/Application Support/LUTE/staged/<上一版>/DSH Desktop.app" \
  "packaging/release/$VERSION/DSH Desktop.app"
```

退出码 0 表示「新支满足旧支的指定要求 ⇒ 已存授权在升级后继续有效」。判据自带反向对照
（虚构身份必须被判不满足）与封条前置，因此不会以「恒真」或「读数为空」的形式假绿。
其反向自测：`bash packaging/scripts/verify-tcc-persistence-test.sh`。

### 5.2 挂载与内容验证

交付形态是**离线安装器载荷**——不是可拖拽的安装盘。卷里有哪些文件、哪几个是安装入口，
**只有一个家**：[安装手册第 2 节](../../packaging/INSTALL-GUIDE.md) 的入口表。
本节**不复述那份清单**：复述出来的那是一份快照，产物形态换了它不会自己报错，而复核者读的
正好是这一节（[P-14](../pitfalls-playbook.md)）。逐名比对交给判据，不靠眼看：

```bash
hdiutil attach "packaging/release/$VERSION/DSH-Desktop-LUTE-$VERSION-mac-arm64.dmg" -nobrowse
ls -A "/Volumes/DSH Desktop LUTE $VERSION"/
# 逐名比对：门禁 dmg-layout-doc 会把卷内清单与安装手册入口表两向对照（多一个少一个都判红）
pnpm run gate:full
hdiutil detach "/Volumes/DSH Desktop LUTE $VERSION"
```

**本节不写「应看到 X 与 Y」**：那种句子的真假由产物决定，而它住在文档里，没人会去比。

### 5.3 哈希核对

```bash
cd "packaging/release/$VERSION"
shasum -a 256 -c SHA256SUMS
# 应全部 OK
cat "release/$VERSION.sha256" | head   # 仓库根清单
```

### 5.4 首次启动（真机或干净虚拟机）

1. 按[安装手册第 2 节](../../packaging/INSTALL-GUIDE.md)的入口表选一个安装入口：**双击 `LUTE Setup.app`**，
   或在终端里跑 `bash install.sh`。**不要**试图把某个 `.app` 拖进 `/Applications`——
   卷上根本没有解开的 app，`DSH Desktop.app.tar.gz` 是压缩载荷，拖过去装不成
   （本 SOP 曾把这一步写成「把 DMG 里的 app 拖到 `/Applications`」，见 [P-14](../pitfalls-playbook.md)）。
2. 退出所有已运行的 DSH 实例。
3. 临时移走或重命名现有 `~/.dsh`，模拟新用户首启。
4. 打开 app，10 秒内应完成 profile 物化并进入主界面。
5. 检查关键功能：侧边栏新应用按钮、至少一个核心插件面板。
6. **白屏三问**（连续冷启动两次都要过）：① 窗口截图像素检查（非纯白，三栏可见）② `startup.jsonl` 的 `rendererStatus`/`finalStage` ③ 日志有 `[Renderer]` 转发通道（G2 生效时 renderer 报错可进宿主日志；renderer 无输出时本条天然为空，不算红）。

### 5.5 换签首次升级：一次性重授权（只此一次）

§5.1 的 `verify-tcc-persistence.sh` 证明的是**换签之后**各版本之间授权不再重置。从 adhoc 旧支
升到首个稳定身份版本这一步，系统必然要求重新授权一次——因为 TCC 库里存的授权要求就是旧支的
字节哈希本身。2026-09-13 直读系统库实测
（`/Library/Application Support/com.apple.TCC/TCC.db`，两项的 `csreq` 逐字节相同）：

| service | auth_value | 库里存的要求（`csreq`） |
| --- | --- | --- |
| `kTCCServiceAccessibility` | 2 | `cdhash H"595283898d…" or cdhash H"3d09f5a3…"` |
| `kTCCServiceScreenCapture` | 2 | 同上 |

`post_events` 归 `kTCCServiceAccessibility`，由「辅助功能」承载，**不另占面板**：2026-09-13
15:41–15:44 复读该库，`kTCCServiceListenEvent` 一行记录都没有，而 `post_events` 的判定是
`CGPreflightPostEventAccess()`。故**不要**为它去授「输入监控」——它并非必需；早期文档把第三项
记在它名下，是被 `CGRequestPostEventAccess()` 单次调用写下的瞬态行误导的，本次一并更正。

这两行存的都是旧 adhoc 支的 CDHash，而首个稳定身份版本 2.3.0 的 CDHash 是 `3833cbbc…`，不在该
集合内（`codesign --verify -R='<上述要求>'` 对已装 app 返回 rc=3）。故换签后首次启动这两项
**会先变 false**，这是一次性迁移代价，不是用户把开关关掉了。操作：

1. 重启 DSH Desktop，打开一个会话；
2. `bash packaging/scripts/verify-tcc-runtime.sh`（本机也部署在
   `$HOME/Library/Application Support/LUTE/tools/verify-tcc.sh`），按提示到
   系统设置 → 隐私与安全性 → 辅助功能 / 屏幕录制，把「LUTE Agentic System」
   关掉再打开（两项都要）；
3. 重跑该脚本取基线快照；升级到下一版并重启后再跑 `--diff`，这两项应保持不变——
   这就是判据⑤ 的运行时读法。

**这一步不是走过场：重授那一次就是判据⑤ 的判定实验。** 把本机 TCC 库全部 27 条带 `csreq` 的
条目解码，形态只有两类——Apple 锚定系（`anchor apple`）与 cdhash 系，**唯一不含 `anchor apple`
的就是我方那四条，且全是 cdhash 型**。因此「tccd 会不会原样保存一条**自签**的
`identifier + certificate leaf = H"…"` 要求」在本机**没有先例可援**：会，则 ⑤ 成立；不会（因其
不锚定到受信证书而退回存 cdhash），则 doctor 三项**照样全 true**、判据④ 照常通过，而失败要等到
下一版升级才暴露——那正是本 ADR 要消除的「必然发生且失败时静默」。所以重授后**必须看要求形态**：

- `verify-tcc-runtime.sh` 在判据④ 分支已顺带判读形态：存的仍是 `cdhash` 即当场判红，并写明
  「⑤ 必然失败，不得把本次读数当作证据」；是 `certificate leaf` 才算 ⑤ 具备成立条件。
- 该判读的反向自测：`bash packaging/scripts/verify-tcc-form-test.sh`（F1 用库里那两行 cdhash
  **真实坏输入**，必须判红）。
- 若重授后形态仍是 `cdhash`：**这是 ADR-0063 路线在自签前提下的失效**，须回到该 ADR 的备选路线
  （Developer ID + 公证）决策，**不得**以「doctor 全 true」放行。

**读 doctor 之前必须确认它归因于已装 app。** 被替换掉的旧进程可能仍在运行，此时 doctor 读的是
旧支（换签前它恰好持有授权），会给出一个即将失效的 `true`。判据来自 `lsof`：承载会话的进程
实际执行的文件若不是 `/Applications/DSH Desktop.app/Contents/MacOS/DSH Desktop`，该读数就不
属于已装 app。`verify-tcc-runtime.sh` 已内置这条检查，并在不匹配时**拒绝**给出判据④ 结论。

### 5.6 重授的时机与「假的已开启」（2026-09-13 事故后补写，ADR-0068）

**规则一：重授必须发生在「身份版已就位」之后。** 系统把授权写进库时，存的是**那一刻**在
那个路径上的 app 的代码要求。本机实测的顺序错误：

| 时刻 | 事件 | 后果 |
| --- | --- | --- |
| 11:58–12:00 | 用户在**仍是 adhoc** 的 app 上重授三项 | 库里写入 cdhash 型要求，`auth_value=2` |
| 12:57 | 固定身份的 2.3.0 就位 | 那三条要求立即失配 —— 一次性代价在**错误的时刻**被花掉了 |
| 12:57–15:26 | 三项能力静默死亡 | 界面上它们一直显示「已开启」 |

即：先重授再换 app = 白付一次；先换 app 再重授 = 只付一次。**安装器落位完成后才提示重授**，
顺序由流程保证，不靠人记。

**规则二：隐私界面显示「已开启」不等于授权有效。** 界面只读开关值（`auth_value`），
不显示这个开关绑在谁身上（`csreq`）。换签后残留的旧行会以「已开启」的样子留在面板里，
而能力是死的。故：

- 看到那**两项**已经显示「已开启」时，**不能据此跳过**——要把它们**关掉再打开**；
- 机读判定唯一实现在 `packaging/scripts/tcc-grant-status.sh`（随包分发到 `tools/`，并由
  `install.sh` 收尾自动调用）：它同时读两个事实，**退出码 3 = 检出死授权**（界面会骗人），
  4 = 判不了（库/app/封条读不出），0 = 无死授权（可能是「尚未授权」，那不算错）；
- 它的反向自测是 `packaging/scripts/tcc-grant-status-test.sh`（R1 死授权→3、R2 有效→0、
  R3 封条破损→4 且不得误报、R4 无记录→0，外加一次恒真桩突变证明前四条有牙），
  已进门禁 `tcc-grant-status-selftest`，每次 `pnpm run gate` 都会跑——**判据会不会说「不」
  不再靠人记得**（这是 ADR-0063 后续动作⑦ 在本条判据上的兑现；其余 `packaging/scripts/*-test.sh`
  如何纳入门禁仍待单独立项）。

**规则三：`完全磁盘访问` 那一行同样是 cdhash 型。** 本机 `kTCCServiceSystemPolicyAllFiles`
也是旧 adhoc 支的遗留（`auth_value=0`，不构成「骗人的开关」）。它与三项能力无关，但它证明
**换签遗留是逐服务的**、不是只此三项——凡看到 `auth_value` 与实际能力不一致，先怀疑留下的是
另一个身份的要求。

## 6. 发布

1. **提交入库清单**：仓库根 `release/$VERSION.sha256` 必须随源码一起提交。
2. **打 tag**：清单提交后再打 tag，tag 才担保得住字节。

   ```bash
   git add release/$VERSION.sha256
   git commit -m "release: $VERSION dmg manifest"
   git tag -a "v$VERSION" -m "DSH Desktop LUTE $VERSION"
   ```

3. **推送代码与 tag**：两条远端都要推（ADR-0001：国内 codeup + 公开 GitHub）。

   ```bash
   git push origin main && git push origin "v$VERSION"
   git push codeup HEAD:main HEAD:master && git push codeup "v$VERSION"
   ```

4. **发布到 GitHub Releases**——这是**分发面**，不是可选项：`README.md` 告诉客户「从 Releases 下载」，
   而此前五道环节里只有这一道从来没有人做过（实测 2026-09-13：Releases 最新是 v2.0.0，而 2.0.1 /
   2.2.0 / 2.3.0 / 2.3.1 四个版本从未在任何公开分发面出现过，实际渠道是 IM；见 ADR-0076）。
   notes 必须先落盘（构建号、源提交、profile 快照、SHA256、**该版的已知缺口**），再创建：

   ```bash
   gh release create "v$VERSION" \
     --title "LUTE $VERSION — <一句话>" \
     --notes-file /tmp/lute-release-$VERSION.md \
     --verify-tag \
     --latest \
     "packaging/release/$VERSION/DSH-Desktop-LUTE-$VERSION-mac-arm64.dmg" \
     "packaging/release/$VERSION/SHA256SUMS"
   ```

   - **`--latest` 只给最新的入库版本**；补发历史版本时用 `--latest=false`，否则历史版本会因
     **创建时间较晚**被顶成 Latest，客户从 Releases 首页拿到的是旧包。
   - `gh` 会先把 Release 建成 **draft** 直到附件传完——draft 对客户不存在，**不算已发布**
     （门禁 `release-published` 按这条判）。
   - **640 MB 的上传是可被打断的，而失败会回滚整个 Release**（连已传完的 `SHA256SUMS` 一起没，
     不留半截）。2026-09-13 实测两次：`read tcp …: read: connection reset by peer` 打断后
     `gh release view v2.3.1` 返回 `release not found`。处置就是**重跑同一命令**（无需清理），
     但要带重试；并且——

   > ⚠️ **不要用 `gh release create` 的退出码当判据。** 2026-09-13 实测：把它读在一条
   > `echo "exit=$?"` 之后，失败被报成了 `exit=0`（`$?` 读的是 `echo` 自己的结果）——
   > 一次教科书式的假绿（P-02）。收尾必须**以外部队对状态为准**，这条也就是门禁
   > `release-published` 在做的事：

   ```bash
   for v in <版本…>; do gh release view "v$v" --json isDraft,assets \
     | python3 -c "import sys,json;d=json.load(sys.stdin);a={x['name']:x for x in d['assets']};print('v$v draft=%s %s'%(d['isDraft'],'✓' if not d['isDraft'] and 'DSH-Desktop-LUTE-$v-mac-arm64.dmg' in a else '✗'))"; done
   ```

5. **发布前必答的两问**（缺一不可，见 ADR-0076 决策 4）：

   ```bash
   cd "packaging/release/$VERSION" && shasum -a 256 -c SHA256SUMS   # ① 字节 vs 清单
   ```

   ② **载荷敏感内容扫描**：DMG 内含 profile 快照，而 GitHub 仓库是**公开**的。至少扫凭证形态
   （`sk-` / `ghp_` / `AKIA` / `-----BEGIN … PRIVATE KEY-----` / `Bearer …`）；命中必须**定位到文件**
   再判——2026-09-13 的两处命中分别是渗透测试技能包里的**文档样例**（`alg:none` 的 JWT）
   与 **base64 编码的 WASM 字节码**里的巧合序列，都不是凭证。

6. **飞书/内部文档登记**：记录 SHA256、 tag、 source_commit（从 `manifest.json` 读取）。

## 7. 红线与回滚

- **禁止直接修改已发布目录**：`packaging/release/$VERSION/` 只能是「不存在」或「完整通过终验」。任何中间态必须发生在 `release/.staging.XXXXXX`。
- **禁止运行中替换 app bundle**：本机（或任何目标机）替换 `/Applications/DSH Desktop.app` 前必须先退出运行实例（安装器 `install.sh` 已内置 0b 步骤；手工替换同样适用）。运行中替换会触发宿主 HMR 热更，生产 renderer 无完整热替换 runtime，表现为整屏白屏（2026-09-13 实测；应急恢复 = `Cmd+R`）。**手工替换前先跑 `bash packaging/scripts/dsh-running.sh` 并确认退出码为 1**（0 = 还在跑，4 = 判不了）——不要就地另写一条命令，本仓库曾用一条读数为空的 `pgrep -f` 守这条红线（[ADR-0080](../adr/ADR-0080.md)）。
- **禁止把机器绝对路径带出仓库**：出货树出现新的构建机路径（如 `/Users/lute/...`）时 `scan-machine-paths.mjs` 会中止；若必须新增，先更新 `machine-path-baseline.json` 并说明理由。
- **禁止删除已发布/历史发布的产物**（ADR-0067）：发布成功的产物会被**仓库外归档**
  （`$HOME/Library/Application Support/LUTE/releases/<版本>/`）并在两处加 `uchg` 锁定——
  `rm` / `mv` 一律 `Operation not permitted`。唯一合法解锁点是 `sign-and-dmg.sh` 重制时的归档改名；
  任何其他删除都必须先显式 `chflags -R nouchg <路径>`（把误删变成「必须表过态才可能发生」）。
- **产物丢了要找回，不要重做**：同号不同字节会让「客户手上那版对应哪份源码」无法回答（ADR-0057）。
  重制出来的是另一串字节，**不是**那一版。找回：

  ```bash
  bash packaging/scripts/release-restore.sh <版本>                    # 从仓库外归档
  bash packaging/scripts/release-restore.sh <版本> --from <dmg 路径>  # 从客户/聊天软件里的副本（哈希对上才收）
  bash packaging/scripts/release-verify.sh                            # 复核（`pnpm run gate` 也会跑这条）
  ```

  产物确已不可找回时，用 `release/<版本>.lost` **宣告丢失**并写明原因与找回办法。这是事实记录、
  不是豁免：其余任何「清单在、字节没了」一律红灯。
- **「不可找回」的判据是遍历，不是搜索**（2026-09-13 订正）：2.3.1 曾以「Spotlight 全盘查不到」
  宣告丢失，而副本当时就在 `~/Downloads`（飞书收到、`hdiutil verify` VALID、哈希与清单逐位相同）
  ——**搜索工具的沉默不是缺席的证据**。错宣告的代价不只是「少一份文件」：它把一个本可核验收回的
  版本钉成了「不可重建」，并让 `release-verify.sh` 从此对该版本**短路跳过字节核对**。宣告前必须跑
  文件系统遍历并把命令与输出写进 `.lost` 的取证段，重点排查 IM 落地目录（收文件的默认去处正是
  `~/Downloads`）与外接卷：

  ```bash
  find ~/Downloads ~/Desktop ~/Documents /Volumes \
       "$HOME/Library/Application Support/LUTE/releases" \
       -name "DSH-Desktop-LUTE-<版本>-mac-arm64.dmg" 2>/dev/null
  ```

- **豁免会过期**：字节找回后必须撤下 `release/<版本>.lost`——改名为 `release/<版本>.recovered`
  （保留原文作为教训）并补记找回读数。留着旧 `.lost` 会让该版本被**永久**豁免于字节核对，今后再丢
  也不报错。`release-verify.sh` 对「字节已在位、却还留着 `.lost`」直接判红。
- **找回要连账目一起找回**（2026-09-13 补写）：`release-restore.sh` 把 dmg 与其三件清单
  （`SHA256SUMS` / `VERSION` / `manifest.json`）**一并**恢复。只回字节不回清单会留下
  「字节在、清单不全」的半截状态——它同样是红灯（`release-verify.sh` 与门禁
  `release-artifacts-intact` 都判它），因为**半截比缺席更坏**：缺席看得出来，半截看起来是好的。
  其反向自测是 `packaging/scripts/release-verify-test.sh`（V2/V3 钉住半截红灯，R1~R3 钉住找回随行）。
- **重制必须 --force**：普通重跑会失败，防止意外覆盖已交付产物。
- **回滚**：旧版本 DMG 始终保留在 `packaging/release/.archive/` 与仓库外归档
  `$HOME/Library/Application Support/LUTE/releases/` 中，可直接取回。

## 8. 常见异常

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `pin 门禁失败` | `vendor/dsh-desktop.pin` 与 submodule HEAD 不一致 | 更新 pin 或 checkout 到 pin 的 sha |
| `打包源指纹不一致` | 装配期间 live profile 被并发改动 | 停止其他会话改动后重跑 |
| `scan-machine-paths 失败` | 出货树出现新的机器路径 | 检查新增 file: 依赖或源映射注释，必要时更新基线 |
| `预设出货白名单判定失败`（`未登记的预设目录` / `数量不符` / `登记了但本机不存在`） | 打包机上多了一个预设目录，或岗位集合变了 | 三选一并对齐 [`packaging/shipped-presets.json`](../../packaging/shipped-presets.json)：从本机移走 / 登记进 `allow`（该发）/ 登记进 `exclude`（已评审不发）——**后两档都要写 `why`**。未登记 = 没人表过态，所以装配停下来问（ADR-0073） |
| `技能出货面判定失败`（白名单缺失 / 名字不存在 / 与受限许可同名） | [`packaging/shipped-skills.json`](../../packaging/shipped-skills.json) 与现状不符 | 按报错点名逐条对齐；出货意图确实变了就改这份表并写 `why`，**不要靠改名绕过**。缺文件是判否而不是「等于空名单」——按空名单跑会让白名单里的技能无声少发（ADR-0074） |
| `出货技能树与选择结果不符` | 落位数与选择结果不一致（静默少发 / 多发），或含受限技能 | 看报错点名的技能；用 `node packaging/scripts/select-skills.mjs --report` 复算。少发多因打包期间源被并发改动 |
| `codesign --verify` 红 | 签名后又被修改 | 重新执行 sign-and-dmg.sh |
| 首启卡在 profile-composition | 同机有旧实例在跑 | 退出旧实例或换干净环境测试 |
| **启动后整屏白屏（无 renderSlot 日志）** | 运行中替换过 app bundle（HMR 热更崩渲染器）；或关机态改过 app bundle 内 client bundle 字节（combo rev 失配） | 先 `Cmd+R` 重载 renderer；无效则还原被改字节并完整重启；预防：替换 app 前先退出实例 |
| DMG 挂载后 app 无法打开 | quarantine 属性 | 右键 → 打开一次，或 `xattr -d com.apple.quarantine` |
| 门禁 `release-artifacts-intact` 红 | 某个已发布版本的 dmg 不在了（清单还在） | 跑 `release-restore.sh <版本>` 找回；找回不了就按 ADR-0067 写 `release/<版本>.lost` 宣告丢失 |
| `rm`/`mv` 已发布产物报 Operation not permitted | 产物被 `uchg` 锁定（这是设计意图，不是故障） | 确认确实要动：`chflags -R nouchg <路径>` 后再操作 |

## 9. 版本号规则

- LUTE 集成包独立语义版本，格式 `MAJOR.MINOR.PATCH`，与 DSH 基座版本解耦。
- 基座升级（如 2.0.5 → 2.0.6）通常升 MINOR。
- 补丁重锚或打包流程修复通常升 PATCH。
- 破坏性结构变化（如交付格式切换）升 MAJOR。
