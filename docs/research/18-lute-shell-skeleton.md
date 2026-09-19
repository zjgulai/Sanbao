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
| **本次重跑**（写本文时实跑） | §1、§2（**除 §2.4**）、§3、§5 | 全部无头、廉价、可重复；输出逐字贴在对应小节 |
| **fix round 2 重拍**（2026-09-19，用户指令下重开 GUI 一次） | §4 的空态五件套与 DOM 探针 | 隔离 `DSH_HOME` 的空态捕获替换了入库截图；本轮读数与 Task 8 原读数在 §4 内**分块标注**，不混写 |
| **引自执行期报告**（未重跑） | §2.4（Task 6）、§4.3（Task 8） | 物化后的 profile 形态与两条架构前提；重装 274 MB 的 profile 不产生新事实，架构前提与截图重拍无关 |

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

（两段 `dist-tags` 在这里统一按 `alpha` → `next` → `latest` 排列以便对照，**不是** pnpm 的原样键序：
键序随调用/客户端而变，同一包两次调用可不同；本节两块为对照重排过键序，值未变。与 §1.2 的折行
同一性质：只改排版，不改内容。）

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
$ cd /Users/lute/project/Magpie-Horch/apps/lute-shell && pnpm run smoke > /tmp/t10-smoke-final.txt 2>&1; echo "EXIT=$?" >> /tmp/t10-smoke-final.txt
$ cat /tmp/t10-smoke-final.txt
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

条数是数出来的，不是抄来的：

```
$ grep -c '^PASS' /tmp/t10-smoke-final.txt   # 即上面那次运行的捕获文件
10
```

初版是 **9** 条断言，fix round 1 加上「profile manifest 的两个 bundle」后为 **10** 条（round 2 只
把这条的 label 收窄，没动条数）。**计数口径**：happy path 上会执行的 `check(` 站点数，只在失败
分支里出现的站点不计——初版即 `6b30938`，
`git show 6b30938:apps/lute-shell/scripts/smoke.mjs | grep -c 'check('` → **10**，其中 1 处
（`check('dist/assets holds a binary asset to verify', false, …)`）在 `largest === undefined` 的失败
分支里，故 **10 − 1 = 9**；`task-7-report.md` 记的也是「断言数 9 → 10（新增 bundle 断言）」，与该
读数一致（那份报告在 git-ignored 的 SDD 目录里，见 §0）。以
`apps/lute-shell/scripts/smoke.mjs` 实跑输出为准，本文不写死条数之外的任何断言清单——断言的家是
脚本本身。

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
（[Note](../notes/implemented/architecture/2026-09-19-lute-shell-skeleton.md) Consequences「负面 / 待办」4）。

## 4. 第一个可见 UI（fix round 2 空态重拍：隔离 `DSH_HOME`，2026-09-19；Task 8 共享 home 读数留作历史出处）

![lute-shell 第一个可见 UI（空态）](assets/2026-09-19-lute-shell-first-ui.png)

**入库图像是 fix round 2（2026-09-19，用户指令）在隔离 `DSH_HOME` 下的空态捕获**：启动命令
`DSH_HOME=<临时目录> pnpm run dev --remote-debugging-port=9223`，`LUTE_SHELL_PROFILE` 未设
（宿主仍跑真 profile `~/.dsh/profiles/lute-shell/`，换的只是会话库/设置的落点）。它比 Task 8 的
原共享 `~/.dsh` 捕获更贴 P1 里程碑的验收字面——[spec §5](../superpowers/specs/2026-09-19-base-decoupling-design.md)
的「显示 harness 默认 UI」与[计划 Task 8 Step 10](../superpowers/plans/2026-09-19-p1-lute-shell-skeleton.md)
的「未登录/无 API key 状态下的启动页」：`api/session/list` 响应体 `{"items":[]}`（§4.1 逐字），
侧栏「暂无会话」，无任何真实会话标题。Task 8 的原读数**原样保留**在 §4.1 末尾（标注「原共享
`~/.dsh` 捕获」）——它们是「壳对共享 home 同样工作」的证据，不因换图作废。

**空态截图前有一段首启流程，如实交代**：全新 `DSH_HOME` 首启会先后弹两个首启弹窗——「内测声明」
（按钮「继续」）与「添加一个 API Key 开始使用」（按钮「稍后配置」/「保存并继续」）。本轮经 CDP
点击按钮依次 dismiss 后，对 settle 的默认视图采集读数与截图（同一 GUI 运行内多次 reload 分多趟
采集，每条读数标注所在趟）；第二个弹窗本身就是「无 API key 启动页」的字面形态，但其捕获未入库
（首屏图只保留一张）。

### 4.1 ★ 引证必须给整条证据链，不能只给这张截图

**这张 PNG 是 CDP `Page.captureScreenshot` 的产物**——macOS 的 `screencapture` 被 TCC 拒
（Task 8 实测：`screencapture -l 41280` → `could not create image from window`；全屏
`screencapture -x` → `could not create image from display`），本仓不去碰 TCC 授权。CDP 截图是
**进程内合成器捕获**，所以单凭它只能证明「renderer 画了这些像素」，**不能**证明「原生窗口真在
物理屏上合成」。

「窗口已显示」这个结论由五件套共同支撑，缺一即不得写。**本轮五件套全部来自 fix round 2 的同一
次 GUI 运行**（2026-09-19，隔离 `DSH_HOME`；与 Task 8 读数分块，不混写）：

| # | 证据 | 本轮原始读数（2026-09-19 fix round 2，隔离 `DSH_HOME`） |
|---|---|---|
| 1 | **on-screen 合成**（窗口服务器层，独立于 renderer） | Swift `CGWindowListCopyWindowInfo`：`42426 Electron bounds=["Height": 840, "Width": 1280] layer=0 onscreen=true`——尺寸恰为规格 1280×840；另有 `42445 Electron bounds=["Height": 600, "Width": 800] layer=0 onscreen=true`（detach 的 DevTools 窗） |
| 2 | **代码事实**：窗口不是无条件 show 的 | `apps/lute-shell/src/main/index.ts:31` 建窗时 `show: false`，`:43` 才 `window.once('ready-to-show', () => { if (!window.isDestroyed()) window.show() })`——「显示」发生在首帧就绪之后，不是构造即显示（本轮复核行号；`src/main/**` 自 Task 8 后零改动） |
| 3 | **宿主就绪** | 主进程 stdout 逐字：`lute shell: host ready, dsh 0.1.5-rc.2` |
| 4 | **网络与异常面干净** | CDP Network 域 28 个请求**全部 200**（直方图 `{"200":28}`）、零 `loadingFailed`；`Runtime.exceptionThrown` 计数 **0**；console 仅 2 条 Electron 开发期 CSP 安全警告（与 Task 8 观察到的同一条，Electron 自述打包后不出现） |
| 5 | **退出后无孤儿子进程** | AppleScript quit 后（后台 dev 任务 exit 0）：`pgrep -f "lute-host/host/index.js"` 空（exit 1）、Electron 主进程空（exit 1）、`9223` 端口无监听 |

**空态判定是读数，不是目视**（同一 GUI 运行内采集；截图所在趟的读数与其同趟）：

- `api/session/list` 响应体（115 字节，逐字，dismiss 首启弹窗后那趟）：
  `{"type":"server-response","rpcId":"dedc1a65-228e-4267-b39a-d3255abba0a0","result":{"ok":true,"value":{"items":[]}}}`
  ——会话库为空是协议层事实，不靠看图。
- DOM 探针（截图所在趟）：`{"title":"DeepSeek Harness","bodyChildren":3,"rootHtmlLen":47094,"styleSheets":107,"scripts":7}`；
  侧栏文本采样 `新会话 | 工作区 | 暂无会话 | 设置 | 探索未至之境 | 预览版 | 选择工作区 | 标准模式 |
  选择一个工作区开始`——无任何会话标题。
- **对入库 PNG 的读回判定**：完整 harness 默认 UI 非白屏（HARNESS 徽标、「新会话」按钮、hero
  「探索未至之境」+ 预览版徽标、工作区/标准模式选择器、带发送钮的 composer 均在位）；侧栏工作区
  分组下是「暂无会话」占位，**零会话行**。
- 隔离 home 里宿主真实写过数据（运行后实测，共 16 KB）：`.anonymous-user-id`、
  `.credentials.yaml`、`settings.yaml`、`storages/workspace.json`——数据落点确实换到了临时目录，
  不是「UI 恰好没显示旧数据」。

**原共享 `~/.dsh` 捕获的读数（Task 8，2026-09-19，历史出处——「壳对共享 home 同样工作」的证据，
读数原样保留）**：ready 行同文 `lute shell: host ready, dsh 0.1.5-rc.2`；`CGWindowListCopyWindowInfo`：
`41280 Electron bounds=["Height": 840, "Width": 1280]`、`41298 Electron bounds=["Height": 600, "Width": 800]`；
CDP Network 域 35 行**全部 200**、零 `NET-FAIL`，`Runtime.exceptionThrown` **0**；DOM 探针
`{"title":"DeepSeek Harness","bodyChildren":3,"rootHtmlLen":114367,"styleSheets":107,"scripts":7}`，
侧栏为真实会话列表（原侧栏计数，对当时入库 PNG 数出：展开工作区下 5 条会话行 +「展开其余 31 个
会话」+ 9 行工作区条目，第 10 行被视口裁切；逐字标题不转录——该 PNG 已被本轮空态图替换，原文件
在 git 历史 `1b7bb9e`）；quit 后 `pgrep` 空；Console 同样只有 Electron 开发期 CSP 警告。

### 4.2 出货图像的隐私处置（一条必须说明的事实）

**入库图像是空态**（§4.1 的读数判定，非目视）；**原共享 `~/.dsh` 捕获（侧栏含真实会话标题）仍在
git 历史 `1b7bb9e` 里**。fix round 2 按用户指令替换的是工作树图像——git 历史保留是事实登记不是
缺陷，真要清除需 rewrite history，属用户的决定。机制与隔离归属（`DSH_HOME` 默认共享 `~/.dsh`，
`apps/lute-shell/src/main/index.ts:52` 的 `dshHome` 回退；隔离成为默认形态属 P4 决策）见 §6.6。

### 4.3 两条顺带定死的架构前提（引自 Task 8 报告，本轮未重测）

- **Electron 43 内置 Node 的版本号**：`ELECTRON_RUN_AS_NODE=1 …/Electron -p "process.versions.node"`
  → `24.18.1`，≥ harness engines 下限 `22.19` ⇒ **P4 无需随附 plain node**（计划里这条曾是待实测项）。
- **`LUTE_SHELL_NODE_BINARY` 覆盖生效**：Run C 下子进程 argv 实测为
  `/opt/homebrew/bin/node /Users/lute/.dsh/profiles/lute-shell/lute-host/host/index.js /Users/lute/.dsh/profiles/lute-shell`，
  ready 行同文，CDP 截图与 Run B 同字节数（171872）且视觉一致，quit 后 `pgrep` 空。

### 4.4 本文未做的事（诚实声明）

- **fix round 2 之后本文不再有「未重开 GUI」**：本轮按用户指令重开了一次 GUI（隔离 `DSH_HOME`
  的空态重拍）；重开读数已并入 §4.1，Task 8 原读数降级为历史出处。
- **未取得 macOS 合成器级窗口截图**（TCC 所限）；on-screen 合成由 §4.1 第 1 项的 CGWindowList
  读数独立佐证。
- **未在 GUI 内触发 KaTeX 字体请求**：本轮 Network 追踪（28 请求）同样零字体请求，与「KaTeX
  字体仅在渲染数学时加载」一致。结论是「未发生字体请求」，**不是**「字体请求成功」。嵌套字体
  路径的逐字节服务已由无头测量证明（Task 8 派工前实测
  `/assets/fonts/KaTeX_Main-Regular-B22Nviop.woff2` → `status=200 … servedBytes=26272
  diskBytes=26272 byteEqual=true`）。
- **未端到端演练** `before-quit` 二次触发路径与 fatal-kill 路径（需 boot 失败注入）；代码层在位。
- **本轮零代码改动**：隔离靠 `DSH_HOME` 环境变量，`src/main/index.ts` 的默认回退（共享
  `~/.dsh`）未动——隔离成为默认形态仍属 P4 决策（§6.6）。

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
   另有一条结构事实（Task 6 实测，本次复核仍在）：三个 profile 门禁的 profile 目录**硬编码**在
   `runProfileTarget()`（`scripts/gate.mjs:2502`，其 `:2503` 为
   `join(process.env.HOME ?? '', '.dsh', 'profiles', 'desktop')`）里，lute-shell profile 结构性地
   在射程外；若要覆盖必须先参数化那个路径。稳定锚点是函数名 `runProfileTarget`——Task 6 报告记的
   行号是 `:2477`，Task 9 往 `gate.mjs` 加了 28 行装配后它已经漂到 `:2503`，行号本身不是可靠指针。
4. **smoke 不进 CI**（要真 profile 与网络），靠人工跑 ⇒ 「薄壳还能 boot」无常驻读者。
5. **P4 打包**：Electron 43 内置 Node 实测 `24.18.1`（§4.3），已满足 harness engines 下限，故
   **不需要随附 plain node**；但「`ELECTRON_RUN_AS_NODE` 在**签名 + 公证**后仍可用」这一条尚未
   验证——本期两次运行都是开发态（未签名）。P4 必须在签名产物上复验，否则宿主子进程起不来。
6. **`DSH_HOME` 未隔离**（§4.2）：薄壳默认仍共享 `~/.dsh`（`src/main/index.ts` 的 `dshHome`
   回退），会话数据与旧壳同库；**隔离成为默认形态属 P4 决策**——fix round 2 的空态重拍靠的是
   `DSH_HOME=<临时目录>` 环境变量，零代码改动。隔离对 boot/UI 成立（§4 五件套 + 空会话库读数），
   但隔离 home 下的无头 smoke 会在 shutdown 断言上踩红（宿主 ready、9/10 断言 PASS 后
   `closeSync` 二次 close 报 `EBADF`、宿主 exit 1，2/2 复现；共享 home 同命令 PASS）——这是
   §6.11(b) 同族缺陷在**干净 shutdown 路径**上的时序显形，机制与读数见 §6.11，本轮未修。
   **入库截图已是空态**（§4）；原共享 `~/.dsh` 捕获仍在 git 历史 `1b7bb9e` 里——用户决定的是
   替换工作树图像，历史保留是事实登记不是缺陷（清除需 rewrite history，属用户决定）。
7. **打包面缺 CSP**：开发期的 CSP console 警告是 Electron 预期行为，P4 打包必须补。
8. **quit 路径的孤儿子进程窗口**（Task 8 登记的 Minor，`1b7bb9e`；三种形态，本次对着
   `src/main/index.ts` 复核均在位）：① 外层 catch 调 `app.exit(1)` 但不 `host.stop()`；② 生命周期
   监听器（`window-all-closed` / `before-quit`）只在 `loadURL` resolve 之后才装，quit 早到会绕过
   它们；③ `before-quit` 守卫在第二次 `app.quit()` 时**不** `preventDefault` 就 return，于是
   Electron 可以在 `stop()` 仍在飞行中时退出。P4 的正路是监听器在 `await host.start()` 之前装、
   catch 里补 `stop()`；③ 的守卫是刻意镜像上游「二次 quit 不再 preventDefault，否则永不退出」，
   改它要连上游保真一起判。
9. **一处过时的 ADR 指针**：`scripts/gate.mjs:328` 的 `lute-shell-pin` remediation 文案写死了
   `（ADR-0131）`——那是 Task 9 派工时计划里预判的编号，执行期已被并发的换皮 ADR 占用，本决策
   实为 **ADR-0139**。纯提示文本、不参与任何判定，但它是过时指针，留给最终评审做一处字面量替换。
10. **`tsconfig.json` 只 include `src/**/*.ts`**，故 `apps/lute-shell/test/` 下的 spec 只由 vitest
    转译、从未经过类型检查（Task 1 继承，Task 5/8 均登记）。
11. **宿主侧 disposal 缺口：`boot()` 被拒无处置 + fatal 拆机的二次 `EBADF`**（routed→最终评审；
    Task 5 登记、Task 7 fix round 1 `060ec28` 带可复现负面测试与完整 stderr 栈，出处在
    `.superpowers/sdd/2026-09-19-p1-lute-shell-skeleton/progress.md` 的 Task 5 / Task 7 段与同目录
    `task-7-report.md`——该目录被 `.gitignore` 排除、不随克隆走，故写行内代码不做链接）。两个症状
    同族、一并处置：(a) `src/host/index.ts` 里 `ctx.fiber.dispose()` 只在「三服务缺失」那条分支跑，
    `boot()` **自身拒绝**时没有任何处置路径；(b) fatal 拆机时 `stop(1)` 在管道已 destroyed 之后再次
    `close`，stderr 上出现二次 `EBADF: bad file descriptor, close`。此前这一族只以**理由**形态出现
    在 [ADR-0139](../adr/ADR-0139.md) D1 的 constraint 里（「父进程收到任何 fatal 后主动收尸……
    `boot()` 被拒那条路径没有 disposal」），从未作为**未修项**出现在任何出货文档——在此登记一次，
    免得下一个读者以为它已收口。
    fix round 2 补测（2026-09-19，隔离 `DSH_HOME` 重拍时顺带量到）：这族二次 close 在**干净
    shutdown 路径**上也会显形——无头 smoke 在隔离 home 下 2/2 复现
    `closeSync(SHELL_RESPONSE_PIPE_FD)` 抛 `EBADF`（宿主 exit 1，shutdown 断言 FAIL），共享
    home 同命令 PASS。机制实测（本轮，Node 26.0.0）：`createWriteStream('', { fd, autoClose: false })`
    的 `destroy()` 仍会异步关 fd（fd 3 同），故 `stop()` 的「destroy 流 + `closeSync` 同一 fd」是
    **结构性双 close**，是否显形取决于线程池 close 与主线程 `closeSync` 谁先落地——同族佐证：
    复刻 smoke 请求模式的小驱动（3 请求）在**两个 home 下都**录得 `close-async(4)`（自
    `index.js:210` 的 `responsePipe.destroy()`）却都 exit 0：机制在场、竞速未输；真实 smoke
    （6 请求，含 740575 字节跨分片流式资产）在隔离 home 下竞速 2/2 输掉。仍 routed→最终评审；
    本轮零代码改动，未修。
12. **`lute-shell-pin` 判定器的四条 report-only Minor**（routed→最终评审；Task 9，commits
    `7008c42` + `73d7270` + `bd8a220`；账本同上的 Task 9 段）。① override 守卫是**整文件
    substring** 测试——`pnpm-workspace.yaml` 里一行注释提到包名就满足它（今天为真；强化要 YAML
    解析，不成比例）；② 「用户层恰为 `[]`」的谓词拒绝合法变体（`---\n[]`、`[] # 空`）——**方向
    安全**：响亮红而非假绿，是严格不是洞；③ `remediation` 文案只覆盖部分违规类（计划逐字给的
    文本，fix round 2 新增的 electron 违规也不在其内）；④ 畸形 / 0 字节 manifest 会让 `JSON.parse`
    抛出、整个 checker 中止，其余违规塌成一行 `checker threw`（门禁仍红，属诊断质量而非漏判；
    fix round 2 之后 vendor manifest 也进了这个输入面）。这四条此前只活在 git-ignored 账本里，
    对下一个读者等于不存在。
