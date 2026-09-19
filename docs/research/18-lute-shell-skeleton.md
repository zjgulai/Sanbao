# 18 · LUTE 自有薄壳骨架（P1）实测报告

> 日期：2026-09-19
> 状态：**P1 完结**（spec §5 的三条里程碑全部有实测支撑；遗留项见 §6）
> 关联：[设计 spec](../superpowers/specs/2026-09-19-base-decoupling-design.md) ·
> [P1 实施计划](../superpowers/plans/2026-09-19-p1-lute-shell-skeleton.md) ·
> [17 号报告（P0 spike，本文更正其 §3）](17-thin-shell-spike.md) ·
> [ADR-0139](../adr/ADR-0139.md) · [决策记录 Note](../notes/implemented/architecture/2026-09-19-lute-shell-skeleton.md)
> 证据级别：Fact = 命令输出实截。**标注「引自 Task N 报告」的段落是 2026-09-19 执行期捕获的真实输出，
> 本文逐字转录并给出出处**；未跑的一律写「未运行」。

## 0. 本文的证据来源分两类（先说清楚，免得被当成全部重跑）

| 类别 | 章节 | 说明 |
|---|---|---|
| **本次重跑**（写本文时实跑） | §1、§2、§3、§5 | 全部无头、廉价、可重复；输出逐字贴在对应小节 |
| **引自执行期报告**（未重跑） | §4 | GUI 验收。重开一个窗口在用户屏幕上不产生任何新信息，故按 Task 8 报告的原始捕获逐字引用并标注出处 |

执行期报告的持久位置：`.superpowers/sdd/2026-09-19-p1-lute-shell-skeleton/task-{6,7,8,9}-report.md`
（该目录被 `.gitignore` 排除，不随克隆走）；裁决账本在同目录 `progress.md`。**这两处的裁决已由
[Note 的「过程裁决（fix rounds）」节](../notes/implemented/architecture/2026-09-19-lute-shell-skeleton.md)
收进 git 跟踪面**，本文只引读数。

## 1. npm 可用性补测（Fact，本次重跑）

P0 报告 §1 记的是「12 个 `@deepseek-ai` 包全部到位」，但**宿主进程**能不能从 npm 取到当时没测。
P1 的第一件事就是补这一测——结论是取不到，所以 D1 的「薄壳自己持有宿主入口」不是偏好，是唯一解。

### 1.1 宿主包未发布（404 原始输出）

```
$ pnpm view @deepseek-ai/dsh-desktop-host versions
Error: ERR_PNPM_FETCH_404

  × GET https://registry.npmjs.org/@deepseek-ai/dsh-desktop-host: Not Found -
  │ 404

EXIT=1
```

### 1.2 四个关键包的已发布版本列表

```
$ pnpm view @deepseek-ai/dsh-base versions
[  "0.0.1-rc.1",  "0.0.1-rc.2",  "0.0.1-rc.3",  "0.0.1-rc.5",  "0.1.0-rc.2",  "0.1.0-rc.3",
   "0.1.0-rc.6",  "0.1.0-rc.7",  "0.1.0-rc.8",  "0.1.1-rc.1",  "0.1.1-rc.2",  "0.1.2-alpha.2",
   "0.1.2-alpha.3",  "0.1.2-alpha.4",  "0.1.2-alpha.5",  "0.1.2-rc.1",  "0.1.3-alpha.2",
   "0.1.5-alpha.1",  "0.1.5-alpha.2",  "0.1.5-rc.1",  "0.1.5-rc.2",  "0.1.6-alpha.1",
   "0.1.6-alpha.2"]

$ pnpm view @deepseek-ai/dsh-web-app versions
[  "0.0.1-rc.1",  "0.0.1-rc.2",  "0.0.1-rc.5",  "0.1.0-rc.2",  "0.1.0-rc.3",  "0.1.0-rc.6",
   "0.1.0-rc.7",  "0.1.0-rc.8",  "0.1.1-rc.1",  "0.1.1-rc.2",  "0.1.2-alpha.2",  "0.1.2-alpha.3",
   "0.1.2-alpha.4",  "0.1.2-alpha.5",  "0.1.2-rc.1",  "0.1.3-alpha.2",  "0.1.5-alpha.1",
   "0.1.5-alpha.2",  "0.1.5-rc.1",  "0.1.5-rc.2",  "0.1.6-alpha.1",  "0.1.6-alpha.2"]

$ pnpm view @deepseek-ai/dsh-web-frontend versions
[  "0.0.1-rc.5",  "0.1.0-rc.2",  "0.1.0-rc.3",  "0.1.0-rc.6",  "0.1.0-rc.7",  "0.1.0-rc.8",
   "0.1.1-rc.1",  "0.1.1-rc.2",  "0.1.2-alpha.2",  "0.1.2-alpha.3",  "0.1.2-alpha.4",
   "0.1.2-alpha.5",  "0.1.2-rc.1",  "0.1.3-alpha.2",  "0.1.5-alpha.1",  "0.1.5-alpha.2",
   "0.1.5-rc.1",  "0.1.5-rc.2",  "0.1.6-alpha.1",  "0.1.6-alpha.2"]

$ pnpm view @deepseek-ai/dsh-app-boot versions
[  "0.0.1-rc.1",  "0.0.1-rc.2",  "0.0.1-rc.3",  "0.0.1-rc.5",  "0.1.0-rc.2",  "0.1.0-rc.3",
   "0.1.0-rc.6",  "0.1.0-rc.7",  "0.1.0-rc.8",  "0.1.1-rc.1",  "0.1.1-rc.2",  "0.1.2-alpha.2",
   "0.1.2-alpha.3",  "0.1.2-alpha.4",  "0.1.2-alpha.5",  "0.1.2-rc.1",  "0.1.3-alpha.2",
   "0.1.5-alpha.1",  "0.1.5-alpha.2",  "0.1.5-rc.1",  "0.1.5-rc.2",  "0.1.6-alpha.1",
   "0.1.6-alpha.2"]
```

（原文是单行长数组，这里按 100 列折行以便阅读；版本号一个未增删。）

### 1.3 ★ `latest` tag 指向旧线（这是「必须精确 pin」的直接理由）

```
$ pnpm view @deepseek-ai/dsh-cmdline version
0.0.1-rc.1

$ pnpm view @deepseek-ai/dsh-cmdline dist-tags
{
  "alpha": "0.1.6-alpha.2",
  "next": "0.1.5-rc.2",
  "latest": "0.0.1-rc.1"
}

$ pnpm view @deepseek-ai/dsh-web-app dist-tags
{
  "alpha": "0.1.6-alpha.2",
  "next": "0.1.5-rc.2",
  "latest": "0.0.1-rc.1"
}

$ pnpm view @deepseek-ai/dsh-app-boot version
0.1.0-rc.6

$ pnpm view @deepseek-ai/dsh-web-app@0.1.5-rc.2 dependencies | grep -E "cmdline|app-boot"
  "@deepseek-ai/dsh-cmdline": "^0.1.5-rc.2",
  "@deepseek-ai/dsh-app-boot": "^0.1.5-rc.2",
```

判读：`latest` 停在 `0.0.1-rc.1`（`dsh-app-boot` 的 `latest` 是 `0.1.0-rc.6`），而本期用的是
`0.1.5-rc.2`（在 `next` tag 上）。**任何 `^`/`~`/省略版本号的写法都会解析到旧线**——而旧线的
API 与 0.1.5 不同（P0 报告 §1 已记「`dsh-app-boot` 的 latest 指向 0.1.0-rc.6，API 不同」）。
`dsh-web-app@0.1.5-rc.2` 自己的依赖写的是 `^0.1.5-rc.2`，在 semver 上不会被 `0.0.1-rc.1` 满足，
所以传递依赖是安全的；**危险面只在我们自己的声明上**，故 seed 的 13 个 `@deepseek-ai/*` 与壳的
9 个全部精确 pin，并由门禁 `lute-shell-pin` 守「出现 range 即判红」。

### 1.4 两个内部包仍未发布（override 的必要性）

沿用 P0 的结论并在 P1 复验：`@deepseek-ai/dsh-type-meta` 与 `@deepseek-ai/dsh-user-interaction`
不在 registry 上，seed 与壳的两个 `pnpm-workspace.yaml` 都带 override 指向 `empty-npm-package@1.0.0`：

```
$ cat apps/lute-shell/seed/pnpm-workspace.yaml
packages:
  - .

nodeLinker: hoisted
autoInstallPeers: false
overrides:
  "@deepseek-ai/dsh-type-meta": "npm:empty-npm-package@1.0.0"
  "@deepseek-ai/dsh-user-interaction": "npm:empty-npm-package@1.0.0"
```

## 2. `layers: 0` → `layers: 2`（Fact，本次重跑）

这是 P0 报告 §3 那个 PARTIAL 的收口。

### 2.1 实测读数

```
$ cd ~/.dsh/profiles/lute-shell && node --input-type=module -e "
import { loadProfileDirectory } from '@deepseek-ai/dsh-app-boot'
import { join } from 'node:path'
const dir = process.cwd()
const profile = loadProfileDirectory('lute shell', dir, join(dir, 'node_modules/@deepseek-ai/dsh/package.json'))
console.log('layers:', profile.layers.length, profile.layers.map(l => l.packageName).join(', '))
"
layers: 2 @deepseek-ai/dsh-base, @deepseek-ai/dsh-web-app
EXIT=0
```

### 2.2 让它从 0 变 2 的那一段 seed manifest

```
$ node -e "const m=require('./apps/lute-shell/seed/package.json'); console.log(JSON.stringify(m.dsh,null,2))"
{
  "profile": {
    "bundles": [
      "@deepseek-ai/dsh-base",
      "@deepseek-ai/dsh-web-app"
    ],
    "patchReload": "live"
  }
}
```

### 2.3 ★ 根因：`dsh.profile.bundles`，不是 pnpm workspace 结构

`loadProfileDirectory` 推 layers 的唯一来源是 profile 自己 manifest 的这个字段
（`vendor/dsh-desktop/deepseek-harness/packages/boot/app-boot/src/profile.ts:781`）：

```ts
const manifest = readProfileManifest(binName, dir)
const bundles = manifest.dsh?.profile?.bundles ?? []
…
const layers = bundles.map((packageName): ProfileLayer => { … })
```

`bundles` 缺字段 ⇒ `?? []` ⇒ `layers.length === 0`，**与 `.pnpm` store 结构、symlink 与否、
`nodeLinker` 取值全部无关**。17 号报告 §3 把 `layers: 0` 归给「spike 用 symlink 简化了完整
`pnpm install`」是错的，已就地追加更正行（原文保留）。

`nodeLinker: hoisted` 影响的是**另一件事**：它决定裸导入能否解析到唯一一份 cordis（ADR-0139 D3
的单一实例前提）。Task 6 是这两件事第一次被分开实测的地方。

### 2.4 物化后的 profile 形态（引自 Task 6 报告 §4.3/§4.4，2026-09-19 捕获）

- `node_modules/@deepseek-ai/` 顶层是 `drwxr-xr-x`（真目录）而非 `lrwxr-xr-x`（symlink）⇒
  `nodeLinker: hoisted` 生效；`node_modules/.modules.yaml` 里也记着 `"nodeLinker": "hoisted"`。
- profile 体积 274 M（对照：`~/.dsh/profiles/desktop` 1.6 G，只读参照未触碰）。
- `lute-host/` 内**没有** `package.json`，故 6 个宿主 `.js` 的 ESM 身份由 profile 根的
  `"type": "module"` 决定（塞一份清单进去会把它们变 CJS 并在第一个 `import` 上炸）。
- seed 的 `pnpm-lock.yaml` 与真装后的 profile 副本 `diff` 为空（三次 install 之后仍未漂移），
  且锁文件里 `link:`/`file:`/`workspace:` 解析 0 条、绝对机器路径 0 处、540 个包全带 `integrity`。

## 3. 无头端到端 smoke（Fact，本次重跑）

### 3.1 最终态输出（10 条断言，逐字）

```
$ cd apps/lute-shell && pnpm run smoke
$ node scripts/smoke.mjs
PASS profile manifest pins exactly the two upstream bundles — bundles=["@deepseek-ai/dsh-base","@deepseek-ai/dsh-web-app"]
PASS host reports ready at protocol v3 — dshVersion=0.1.5-rc.2
PASS host resolved an installed dsh version — 0.1.5-rc.2
PASS GET /index.html is 200 html — status=200
PASS index.html carries the injected page transport
PASS injected transport declares ownsHost
PASS unknown SPA route falls back to index.html
PASS path traversal is rejected with 403 — status=403
PASS largest dist asset round-trips byte-for-byte (vendor-CCJJTK99.js, 740575 bytes, crosses 64 KiB chunks: true) — status=200 contentType=text/javascript; charset=utf-8 servedBytes=740575
     实际 content-type = text/javascript; charset=utf-8
PASS shutdown IPC exits the host cleanly — code=0
lute shell smoke: PASS
EXIT=0
```

```
$ grep -c '^PASS' <上面的输出>
10
```

初版是 **8** 条断言，两轮 fix 后为 **10** 条（fix round 1 加「profile manifest 的两个 bundle」，
round 2 把它的 label 收窄）。以 `apps/lute-shell/scripts/smoke.mjs` 实跑输出为准，本文不写死条数
之外的任何断言清单——断言的家是脚本本身。

### 3.2 这段输出**证明什么**、**不证明什么**（引用纪律）

| 它证明 | 依据哪一行 |
|---|---|
| 宿主能从物化出的 profile 真 boot，并在 DSH3 v3 协议上报 ready | `host reports ready at protocol v3 — dshVersion=0.1.5-rc.2` |
| 宿主能自己解析出已安装的 dsh 版本 | `host resolved an installed dsh version` |
| 资产路径通、SPA 注入真的发生了（不是上游原文件） | `GET /index.html is 200 html` + `index.html carries the injected page transport` + `injected transport declares ownsHost` |
| SPA 回退与路径穿越 403 都在位 | `unknown SPA route falls back…` + `path traversal is rejected with 403` |
| 真管道的二进制往返逐字节相等，且响应体跨过了 64 KiB 帧分片边界 | `largest dist asset round-trips byte-for-byte (…740575 bytes, crosses 64 KiB chunks: true)` |
| shutdown IPC 能让宿主干净退出（且不是把一次自发退出记到 shutdown 头上） | `shutdown IPC exits the host cleanly — code=0` |
| **profile manifest 的 `dsh.profile.bundles` 恰为两个上游 bundle** | 首行 label —— 注意它的措辞**只声称 manifest** |

**★ 不得把这段输出引用为「空 profile 正常 / 零 LUTE 插件」的证据。** 首行断言的谓词只读
`package.json` 的 `dsh.profile.bundles`，而插件层真正的挂载点是 `cordis.patch.yml` 与
`lute-host/shell.cordis.patch.yml`；label 曾在 fix round 2 之前就写着「profile 里没有 LUTE 插件层」，
那句话超出谓词所证，已被收窄掉（P2 一挂插件它就变假而 PASS 照旧）。

「零 LUTE 插件」这条里程碑事实的**证据家是仓库里 seed 的 `cordis.patch.yml`**——tracked、内容
剥掉注释与空白后恰为 `[]`，由门禁 `lute-shell-pin` 静态守住：

```
$ cat apps/lute-shell/seed/cordis.patch.yml
# 用户层：P1 留空。P2 起在这里声明 LUTE 插件的 id / config / disabled。
[]
```

引用超出 label 所声称的范围，正是本仓总账 P-01（未验证的事实被钉进出货面）的形状。

### 3.3 smoke 不进 CI

它要真 profile（274 MB）与网络，靠人工跑。代价是「薄壳还能 boot」这条事实没有常驻读者
（[Note](../notes/implemented/architecture/2026-09-19-lute-shell-skeleton.md) Consequences 4）。

## 4. 第一个可见 UI（引自 Task 8 报告，2026-09-19 实机捕获；本文未重开 GUI）

![lute-shell 第一个可见 UI](assets/2026-09-19-lute-shell-first-ui.png)

### 4.1 ★ 引证必须给整条证据链，不能只给这张截图

**这张 PNG 是 CDP `Page.captureScreenshot` 的产物**——macOS 的 `screencapture` 被 TCC 拒
（`screencapture -l 41280` → `could not create image from window`；全屏 `screencapture -x` →
`could not create image from display`），而本次工作不去碰 TCC 授权。CDP 截图是**进程内合成器
捕获**，所以单凭它只能证明「renderer 画了这些像素」，**不能**证明「原生窗口真在物理屏上合成」。

「窗口已显示」这个结论由五件套共同支撑，缺一即不得写：

| # | 证据 | 原始读数（引自 Task 8 报告 §Step 10） |
|---|---|---|
| 1 | **on-screen 合成**（窗口服务器层，独立于 renderer） | Swift `CGWindowListCopyWindowInfo`：`41280 Electron bounds=["Height": 840, "Width": 1280, …]`——尺寸恰为规格 1280×840；另有 `41298 Electron bounds=["Height": 600, "Width": 800]`（detach 的 DevTools 窗） |
| 2 | **代码事实**：窗口不是无条件 show 的 | `src/main/index.ts` 用 `show: false` 建窗，在 `once('ready-to-show')` 里才显示——所以「显示」发生在首帧就绪之后，不是构造即显示 |
| 3 | **宿主就绪** | 主进程 stdout 逐字：`lute shell: host ready, dsh 0.1.5-rc.2` |
| 4 | **网络与异常面干净** | CDP Network 域 35 行**全部 200**（`dsh-app://app/index.html`、两条 `/plugins/??…client.js` 组合包、`assets/vendor-*.css`/`index-*.css`/`index-*.js`/`vendor-*.js`、十余条 `/api/*` JSON、4 条 `/.dsh/remote-stream` NDJSON），零 `NET-FAIL`；`Runtime.exceptionThrown` 计数 **0** |
| 5 | **退出后无孤儿子进程** | AppleScript quit 后 `pgrep -f "lute-host/host/index.js"` 空（exit 1），Electron 主进程亦空 |

补充的 DOM 探针读数（同一 CDP 会话）：
`{"title":"DeepSeek Harness","bodyChildren":3,"rootHtmlLen":114367,"styleSheets":107,"scripts":7,
"bodyTextHead":"新会话 工作区 agent_cot Magpie-Horch …"}`。

Console 里只有 Electron 开发期标准 CSP 安全警告（reload 前后各一次，Electron 自述打包后不出现）。

### 4.2 截图内容的一条必须说明的事实

**这张 PNG 的侧栏显示的是用户本机 DSH Desktop 的真实会话列表**（Magpie-Horch、agent_cot、
DTC-Agent…）。机制是 `DSH_HOME` 共享 `~/.dsh`（`src/main/index.ts` 的
`dshHome: process.env.DSH_HOME ?? join(homedir(), '.dsh')`），会话库住在 `~/.dsh` 下而非
per-profile。

这不是 P1 缺陷：spec §5 的「空 profile 正常」定义是**零 LUTE 插件**（见 §3.2 的证据家），不含
会话数据隔离；隔离是 **P4 的决策**。图片按原样引用（已入库），本文不新增任何可识别内容，也不
对其做重制或模糊处理——隐私面由用户裁决（可后续换一张空态截图）。

### 4.3 两条顺带定死的架构前提（引自 Task 8 报告）

- **Electron 43 内置 Node 的版本号**：`ELECTRON_RUN_AS_NODE=1 …/Electron -p "process.versions.node"`
  → `24.18.1`，≥ harness engines 下限 `22.19` ⇒ **P4 无需随附 plain node**（计划里这条曾是待实测项）。
- **`LUTE_SHELL_NODE_BINARY` 覆盖生效**：Run C 下子进程 argv 实测为
  `/opt/homebrew/bin/node /Users/lute/.dsh/profiles/lute-shell/lute-host/host/index.js /Users/lute/.dsh/profiles/lute-shell`，
  ready 行同文，CDP 截图与 Run B 同字节数（171872）且视觉一致，quit 后 `pgrep` 空。

### 4.4 本文未做的事（诚实声明）

- **未重开 GUI 重取 §4 的任何读数**：重开窗口只会在用户屏幕上复刻已有证据，不产生新信息。
- **未取得 macOS 合成器级窗口截图**（TCC 所限）；on-screen 合成由 §4.1 第 1 项的 CGWindowList
  读数独立佐证。
- **未在 GUI 内触发 KaTeX 字体请求**：Network 追踪里没有任何字体请求，与「KaTeX 字体仅在渲染
  数学时加载」一致。结论是「未发生字体请求」，**不是**「字体请求成功」。嵌套字体路径的逐字节
  服务已由无头测量证明（Task 8 派工前实测
  `/assets/fonts/KaTeX_Main-Regular-B22Nviop.woff2` → `status=200 … servedBytes=26272
  diskBytes=26272 byteEqual=true`）。
- **未端到端演练** `before-quit` 二次触发路径与 fatal-kill 路径（需 boot 失败注入）；代码层在位。

## 5. 与旧壳的对照（Fact，本次重跑）

| 维度 | 旧壳（`vendor/dsh-desktop` fork） | 新壳（`apps/lute-shell/`） | 本次读数 |
|---|---|---|---|
| 壳层补丁 | spec §3 记为 12 个（改 dist、锚 chunk 哈希文件名） | **0** | `git ls-files apps/lute-shell \| grep -c '\.patch$'` → `0` |
| 运行时补丁（pnpm patch） | ~15 个（P3 才迁） | **0**（本期刻意不引入） | 两个 `pnpm-workspace.yaml` 都只有 `overrides`，**没有** `patchedDependencies` 段；仓库根也没有 `patches/`（`ls -d patches` → `No such file or directory`） |
| 自有源码 | 补丁 + 重放脚本（锚点随上游构建漂移） | 1680 行 TypeScript | `find apps/lute-shell/src -name '*.ts' \| xargs wc -l` → `1680 total`（12 个文件，见下） |
| 运行时来源 | 壳内嵌 tgz 物化 | npm 精确 pin（seed + 壳两侧） | §1.2/§1.3 |
| 更新动作 | 2-4 周人工迁移 | 改版本号 → 门禁（第一段已通） | ADR-0139 后果 2 |

自有源码逐文件行数（`find apps/lute-shell/src -name '*.ts' | sort | xargs wc -l`）：

```
     108 apps/lute-shell/src/host/assets.ts
      71 apps/lute-shell/src/host/composition.ts
       9 apps/lute-shell/src/host/handler.ts
     410 apps/lute-shell/src/host/index.ts
      63 apps/lute-shell/src/host/streams.ts
     390 apps/lute-shell/src/main/host-process.ts
      87 apps/lute-shell/src/main/index.ts
      13 apps/lute-shell/src/main/route.ts
      42 apps/lute-shell/src/main/runtime.ts
      67 apps/lute-shell/src/profile/layout.ts
      75 apps/lute-shell/src/profile/materialize.ts
     345 apps/lute-shell/src/protocol.ts
    1680 total
```

其中 `src/main/host-process.ts`（390 行）是上游 `apps/desktop/src/host-process.ts`（413 行）的
逐段移植，`src/host/index.ts`（410 行）移植上游 `apps/desktop-host/src/index.ts`；差异清单与
「必须逐字保留的行为清单」在 Task 8 / Task 5 报告里，本文不复述。

**未测（本文不做口头验收）**：旧壳侧的 12 个壳层补丁数取自
[spec §3 的对照表](../superpowers/specs/2026-09-19-base-decoupling-design.md)（设计记录），
本次**没有**重新清点 `dsh-patches/patches-manifest-v2.md` 的 A 段行数——该清单的表格行数是 8
（其中一行是「品牌×10」的合并行），与 spec 的 12 不是同一套计数口径。**新壳侧的 0 是本次实测**，
旧壳侧的 12 是引用 spec。

## 6. 遗留（P2/P3/P4 的输入）

1. **`agent-presets` 系统根注入被跳过**。npm tarball 里没有 `config/`，包内自带 shipped root，
   所以薄壳的组合层没有插入系统根。**P2 接真 preset 时必须复验**——「现在不报错」不等于「注入
   路径正确」。
2. **两个 native directory-picker 未插入**。上游桌面壳提供的目录选择器 IPC 没有移植；P2/P3 若有
   面板需要选目录，要连壳侧 IPC 一起做，不能只在插件侧等。
3. **`apps/` 未进 package collector**。`package-identity` / `catalog-fresh` / `scripts-runnable` /
   `deps-reproducible` 结构上看不到 `apps/lute-shell/`（`scripts/gates/package-layout.mjs` 只下钻
   `packages/<五组>/`）。治理三字段目前由 `lute-shell-pin` 单独守，是第二份实现。P2 起重估收编
   还是长期双轨。
   另有一条结构事实（Task 6 实测）：三个 profile 门禁的 profile 目录**硬编码**在
   `scripts/gate.mjs:2477` 为 `~/.dsh/profiles/desktop`，lute-shell profile 结构性地在射程外；
   若要覆盖必须先参数化那个路径。
4. **smoke 不进 CI**（要真 profile 与网络），靠人工跑 ⇒ 「薄壳还能 boot」无常驻读者。
5. **P4 打包**：Electron 43 内置 Node 实测 `24.18.1`（§4.3），已满足 harness engines 下限，故
   **不需要随附 plain node**；但「`ELECTRON_RUN_AS_NODE` 在**签名 + 公证**后仍可用」这一条尚未
   验证——本期两次运行都是开发态（未签名）。P4 必须在签名产物上复验，否则宿主子进程起不来。
6. **`DSH_HOME` 未隔离**（§4.2）：会话数据与旧壳共享，隔离属 P4 决策；已入库截图含真实会话标题，
   隐私面由用户裁决。
7. **打包面缺 CSP**：开发期的 CSP console 警告是 Electron 预期行为，P4 打包必须补。
8. **quit 路径的孤儿子进程窗口**（Task 8 登记的 Minor）：`src/main/index.ts` 的外层 catch 调
   `app.exit(1)` 但不 `host.stop()`，且生命周期监听器只在 `loadURL` resolve 之后才装。P4 的正路
   是监听器在 `await host.start()` 之前装、catch 里补 `stop()`。
9. **一处过时的 ADR 指针**：`scripts/gate.mjs:328` 的 `lute-shell-pin` remediation 文案写死了
   `（ADR-0131）`——那是 Task 9 派工时计划里预判的编号，执行期已被并发的换皮 ADR 占用，本决策
   实为 **ADR-0139**。纯提示文本、不参与任何判定，但它是过时指针，留给最终评审做一处字面量替换。
10. **`tsconfig.json` 只 include `src/**/*.ts`**，故 `apps/lute-shell/test/` 下的 spec 只由 vitest
    转译、从未经过类型检查（Task 1 继承，Task 5/8 均登记）。
