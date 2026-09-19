# LUTE 自有 Electron 薄壳骨架（P1）：宿主走子进程 + DSH3 管道、profile 用 seed + 运行时物化

> 决策：[ADR-0139](../../../adr/ADR-0139.md) · 分类：architecture · 生命周期：implemented
> 取证附件：[research/18 · 薄壳骨架 P1 实测](../../../research/18-lute-shell-skeleton.md) ·
> 设计 spec [基座解耦与一键更新](../../../superpowers/specs/2026-09-19-base-decoupling-design.md) ·
> 执行计划 [P1 薄壳骨架](../../../superpowers/plans/2026-09-19-p1-lute-shell-skeleton.md)

## Problem

LUTE 现在的出货面建立在 `anywhere-labs/dsh-desktop` 的 fork 上，壳内嵌 harness submodule 提供
AI 运行时。上游约每月 1-2 次破坏性更新，每次都要重锚 38 个补丁（12 壳层 + ~15 运行时层 +
品牌/判定项）、迁移 15+ 处脚本硬编码路径、跑全量 verify + smoke，单次 2-4 周、年累计 8-24 周
（[spec §1](../../../superpowers/specs/2026-09-19-base-decoupling-design.md)）。根因是产品代码与
上游壳层的**打包实现细节**（ASAR/no-ASAR、chunk 哈希文件名、dist 路径常量）深度耦合。

P0 spike 已经证明「npm 装 harness + 纯 Node 独立 boot」这条路走得通
（[17 号报告](../../../research/17-thin-shell-spike.md)：四项前提三 PASS 一 PARTIAL），但留了
两个没解决的问题，P1 必须先答：

1. **宿主进程无处可取**。上游把宿主入口放在 harness submodule 的 `apps/desktop-host/`，而它
   **没有发布到 npm**——实测 `pnpm view @deepseek-ai/dsh-desktop-host versions` 返回
   `ERR_PNPM_FETCH_404`（[18 号报告 §1](../../../research/18-lute-shell-skeleton.md)）。薄壳要么
   自己写宿主，要么继续依赖 fork。
2. **spike 的 `layers: 0` 归因错了**。17 号报告 §3 把它归给「缺完整 pnpm workspace / `.pnpm`
   store 结构」，并据此给出 P1 解法「用完整 `pnpm install` 而非 symlink」。P1 实测证明真因是
   profile 自己的 `package.json` 缺 `dsh.profile.bundles` 字段——`loadProfileDirectory` 只从
   这个字段推 layers（`vendor/dsh-desktop/deepseek-harness/packages/boot/app-boot/src/profile.ts:781`
   的 `const bundles = manifest.dsh?.profile?.bundles ?? []`），与 workspace 结构无关。17 号报告
   §3 已就地追加更正行，原文保留。

此外还有三个约束决定了本期形态：`vendor/dsh-desktop` 与 harness submodule 是 pin 的只读
参照（[ADR-0008](../../../adr/ADR-0008.md)）；旧壳在 P5 之前继续出货，本期不得碰
`vendor/**`、`~/.dsh/profiles/desktop/`、`/Applications/DSH Desktop.app`；本仓在 2026-09 刚经历过
一次渲染主线程被微任务级联饿死的黑屏事故（[总账 P-52](../../../pitfalls-playbook.md)），其教训是
**观测通道必须先于挂死存在**。

## Decision

四条，逐条是本期实际做的选择与理由。实测读数的家在
[18 号报告](../../../research/18-lute-shell-skeleton.md)；本节与 Consequences 只引读数与验收入口
名，数出读数的命令与完整输出以该报告为家（§3 smoke、§5 补丁数与源码行数），不重贴
（ADR-0009：一份事实只有一个家）。

**D1 宿主传输走子进程 + FD3/FD4 上的 DSH3 v3 帧协议，不在主进程内 boot、不走 harness 自带 HTTP。**
薄壳自己写宿主入口（`apps/lute-shell/src/host/`），移植上游 `apps/desktop-host/src/index.ts` 的
boot 与三路分发（assets / api-gateway / remote-stream），Electron 侧用
`src/main/host-process.ts` 移植上游 `apps/desktop/src/host-process.ts` 的请求泵与三段拆机阶梯。
理由：AI 运行时与 UI 同生共死会复刻 P-52 那类挂死故障，而且**没有旁路**——进程内 boot 时
「主线程挂了」与「宿主挂了」在唯一仪表上同形，诊断手册里那条「先建不经过故障现场的观测通道」
无从下手；分子进程后，宿主 fatal / 沉默 / 卡死都能由父进程独立观测并收尸（Task 7 的 smoke 正是
靠这条旁路把「静默挂起」变成了点名请求路径的 FAIL 行）。

**D2 profile 用「仓库 seed + 运行时物化到 `~/.dsh/profiles/lute-shell/`」。**
仓库里只存 5 个 seed 文件（`package.json` / `pnpm-workspace.yaml` / `pnpm-lock.yaml` /
`cordis.yml` / `cordis.patch.yml`，`apps/lute-shell/seed/`），`pnpm run materialize` 把它们连同
构建出的宿主运行时拷进 profile 目录并在原地跑真 `pnpm install`。理由：这与上游 profile 的形态
**同构**（`loadProfileDirectory` 读的就是 profile 自己的 manifest），P4 打包时不需要重新设计
落点；仓库不沾 `node_modules`（274 MB 的 profile 全在仓库外）；seed 的 `pnpm-lock.yaml` 入库且
实测真装后零漂移，所以精确 pin 是可复现的而不是口头的。

**D3 宿主运行时就位在 `<profile>/lute-host/`，让它的裸导入解析到 profile 唯一一份 hoisted
node_modules。** 物化时把 `lib/protocol.js`、`lib/host/*.js`（6 个文件）与
`config/shell.cordis.patch.yml` 拷进 profile 内的 `lute-host/`，宿主入口是
`<profile>/lute-host/host/index.js`，由父进程以 `ELECTRON_RUN_AS_NODE=1`（或
`LUTE_SHELL_NODE_BINARY`）启动。理由：`@deepseek-ai/cordis` 的服务身份是**实例级**的——若宿主
从仓库侧 `apps/lute-shell/node_modules` 解析出第二份 cordis，服务注册与查找会跨两个实例，
身份在边界上断裂，症状是「服务明明 provide 了却 get 不到」。seed 的 `nodeLinker: hoisted` 与
`lute-host/` 内**不放** `package.json`（ESM 身份由 profile 根的 `"type": "module"` 决定）共同
保证只有一份。

**D4 门禁只加静态 `lute-shell-pin`，不把 `apps/` 纳入 package collector。**
`scripts/gates/package-layout.mjs` 只下钻 `packages/<五组>/`，所以 `package-identity` /
`catalog-fresh` / `scripts-runnable` / `deps-reproducible` 结构上看不到薄壳。本期新写一个独立
判定器（8 条守卫 + 19 条单测）覆盖薄壳的版本事实、协议常量、治理三字段、「零 LUTE 插件」的
证据家与 fixture 跟踪态。理由：把 `apps/` 塞进 collector 会牵动 `gen-catalog` 的分组语义
（目录墙按五组能力生成，`apps/` 不是能力组），与「先证明薄壳能 boot」的本期目标不匹配。

## Alternatives considered

| 方案 | 为什么未采用 |
|---|---|
| **主进程内 boot**（Electron main 直接 `await boot(...)`，省掉子进程与帧协议） | AI 运行时与 UI 同生共死：任一侧重挂就是整窗黑，且**没有旁路**——P-52 的教训是观测通道必须先于挂死建立，进程内形态下不存在「不经过故障现场」的观测点。省掉的是 390 行移植（`src/main/host-process.ts` 实测行数），付出的是整类挂死故障不可诊断 |
| **harness 自带 HTTP 服务面**（起 `dsh-host-webserver` 的 HTTP 监听，Electron 用 `loadURL('http://127.0.0.1:…')`） | 走的是浏览器客户端路径，而本机诊断手册（`dsh-desktop-diagnostics`）登记的两个已知客户端故障都在这条路上（`connection invalid server-response failure`、`settings are unavailable in this browser`）；还额外引入本地端口占用、来源栅栏与 CSP 三个面。上游自己也是用 FD3/FD4 管道而不是 HTTP 连宿主 |
| **profile 直接放仓库内**（`apps/lute-shell/profile/` 连同 `node_modules` 一起） | 仓库沾 274 MB 依赖树与本机绝对路径，lockfile 的可移植性审计（`link:`/`file:`/绝对路径均 0 条）白做；且与上游 profile 形态不同构，P4 打包要重新设计落点 |
| **物化时用 symlink 代替真 `pnpm install`**（P0 spike 的做法） | spike 就是这么拿到 `layers: 0` 的——虽然真因后来查明是 manifest 缺字段（见 Problem 2），但 symlink 形态下 `nodeLinker: hoisted` 不成立，裸导入解析不到唯一一份 cordis，D3 的单一实例前提直接失效 |
| **把 `apps/` 纳入 package collector**（复用 `package-identity` / `catalog-fresh` / `scripts-runnable`） | collector 的分组语义是「五组能力」，`gen-catalog` 会按组生成目录墙；`apps/` 不是能力组，纳入即改索引语义。本期用独立判定器覆盖同一批事实，P2 起再评估是否收编（见 Consequences） |
| **不写独立门禁，靠 typecheck 兜住版本事实** | typecheck 不是常驻读者：它只在有人跑 `apps/lute-shell` 的 typecheck 时才响，而 `pnpm run gate` 是每次都会跑的那一个。用「另一条不一定被跑的检查」替门禁放行就是总账 P-08（用纪律守只有机制能守住的东西） |

## Consequences

**正面**

1. **壳层补丁数为 0**。实测读数是 `0`（数它的命令在 18 号报告 §5），两个 `pnpm-workspace.yaml`
   都没有 `patchedDependencies` 段（只有两条未发布包的 `overrides`）。spec §3 的对照表把旧壳的
   壳层补丁记为 12 个、目标 0 个——本期在新壳侧兑现了目标值，旧壳的 12 个补丁一个没动（P5 才退役）。
2. **更新路径的第一段已经通了**：spec §6 的正常路径（`pnpm update @deepseek-ai/dsh-*` →
   `pnpm run gate` → 提交 lockfile）在薄壳侧有了可作用的对象——seed 的 13 个 `@deepseek-ai/*`
   依赖全部精确 pin，且由 `lute-shell-pin` 守着「range 即判红」。
3. **P0 的 PARTIAL 收口**：`layers: 0` → `layers: 2` 已实测（18 号报告 §2），并且根因被换成了
   正确的那个，17 号报告的错误归因不会再被下一个读者继承。
4. **自有源码体量可控**：1680 行 / 12 个 `.ts` 文件，其中 390 行（`src/main/host-process.ts`）是
   上游 `host-process.ts` 的逐段移植（逐文件行数与数它的命令在
   [18 号报告 §5](../../../research/18-lute-shell-skeleton.md)）。逐段差异与「必须逐字保留的行为
   清单」的家是执行期报告
   `.superpowers/sdd/2026-09-19-p1-lute-shell-skeleton/task-5-report.md` 与 `task-8-report.md`
   （该目录被 `.gitignore` 排除、不随克隆走，故写行内代码不做链接）；18 号报告 §5 同样只给对照、
   明写「本文不复述」。
5. **无头验收可重复**：`pnpm run smoke` 走真管道、真 profile、真二进制往返，10 条断言全 PASS
   且退出码 0，不需要 GUI（18 号报告 §3）。

**负面 / 待办**

1. **`apps/` 暂不受 collector 治理**：`package-identity`、`catalog-fresh`、`scripts-runnable`
   都看不到 `apps/lute-shell/`。治理三字段（`luteOrigin`/`luteOwner`/`lutePublish`）目前由
   `lute-shell-pin` 单独守，是**第二份实现**而非复用 collector 的判据。P2 起需要重新评估收编
   还是长期双轨。
2. **`agent-presets` 的系统根注入被跳过**：npm tarball 里没有 `config/`，包内自带 shipped root，
   所以薄壳的组合层没有插入系统根。P2 接真 preset 时必须复验——「现在不报错」不等于「注入路径
   正确」。
3. **两个 native directory-picker 未插入**：上游桌面壳提供的目录选择器 IPC 没有移植。P2/P3 若
   有面板需要选目录，要连壳侧 IPC 一起做，不能只在插件侧等。
4. **smoke 不进 CI**：它要真 profile（274 MB）与网络，靠人工跑。这意味着「薄壳还能 boot」这条
   事实**没有常驻读者**——只有跑过的人知道。
5. **首屏截图与 `DSH_HOME` 隔离**：出货截图已是隔离 home 的空态捕获（fix round 2 重拍）；
   机制、隔离 home 下 smoke 的时序显形与 git 历史保留等事实的家是
   [18 号报告 §4.2/§6.6/§6.11](../../../research/18-lute-shell-skeleton.md)。
6. **一处已过时的 ADR 指针（终审修复波已改指 ADR-0139）**：`lute-shell-pin` 检查项的
   `remediation` 文案曾把本决策误指为 Task 9 预判的编号 ADR-0131（纯提示文本、不参与判定）；
   登记与修复事实的家是 [18 号报告 §6.9](../../../research/18-lute-shell-skeleton.md)。
7. **spec §6 的三条新门禁本期一条都没上**，这是有意的范围裁剪不是遗漏：P1 没有任何 pnpm patch，
   `patch-applies-clean` 无对象；`harness-version-pin` 的 P1 等价物就是 `lute-shell-pin`（覆盖壳
   与 seed 两侧）；`submodule-ref-sync` 要等 P3 有运行时补丁后再上。

## 过程裁决（fix rounds）

P1 的执行期裁决此前只活在 git commit message 与 git-ignored 的 SDD 账本
（`.superpowers/sdd/2026-09-19-p1-lute-shell-skeleton/progress.md`）里，**本节是它们第一个正式的
家**。每条给结论与理由，细节留 commit 与账本。

1. **Task 4（`751d7fe`）——403 可达性的机制被更正，结论不变、理由全错。** 控制器预检时写的
   Ruling 是「`dsh-app:` 是非特殊 scheme 所以不折叠 `%2e%2e%2f`，换成 `http:` 会被规范化掉」，
   并指示把它钉进出货源码注释。评审实测四种 scheme（`dsh-app:`/`http:`/`https:`/`file:`）后证明
   **四种都不折叠**：真机制是 `%2f` 从来不是 URL 路径分隔符，故 `%2e%2e%2f…` 是单个 segment，
   逃逸完全由 `assets.ts` 自己的 `decodeURIComponent` 制造出真 `../`。失误模式是**只测一种 scheme
   就把推断写成实测**，而且差点让它进出货面（总账第一条：未验证的事实被钉进出货面）。规则：跨
   scheme 的断言必须四种都测，推断不能冒充实测。
2. **Task 6（`cc017a6`）——`defaultInstall` 只修可观测性，刻意不加 kill 超时看门狗。** 缺陷是
   「一次数分钟的 `pnpm install` 在唯一文档化入口上零输出」，即「在干活」与「卡住」同形；修法是把
   stdout 从 `pipe`+`resume()` 丢弃改成 `inherit`，让 pnpm 自己的 `Progress:` 心跳直通终端。**不加
   看门狗**：pnpm 自带网络超时，再套一个任意时长的看门狗会把「看得见地慢」变成「静默地被杀」，
   等于制造一个新的同形症状。已知代价主动接受：`inherit` 之下 stdout 不经父进程，故非零退出时
   pnpm 写在 stdout 的上下文进不了 rejection message（实测 pnpm v12.4.1 把完整原因写在 stderr，
   仍被捕获）。将来若要两者兼得，正路是 tee 或 `--reporter`，**不是**退回 `pipe`。
3. **Task 7（`060ec28`、`3708db5`、`2b8acc1`）——Important 不等最终评审、破例折 5 个 Minor、
   一条里程碑事实的证据家转移。** (a) 评审建议把两个 Important 推给终审修复波，被推翻：两者都只
   改 `scripts/smoke.mjs`（已在本 diff 里），而其中「宿主中途死亡 → 静默挂起、stderr 只在有
   failure 时才打印」正是本轮真撞上、不得不手搓 `/tmp/smoke-debug.mjs` 才看见帧的那个故障——旁路
   已经被证明必需一次，留在 `/tmp` 等于让下一个人重搓一遍。(b) 破例把 5 个 Minor 折进同一轮，
   逐条给了理由（共同点是它们都会污染「将被研究报告逐字引用」的那段输出）。(c) fix round 2 把
   bundle 断言的 label 从「profile 里没有 LUTE 插件层」收窄成「profile manifest pins exactly the
   two upstream bundles」，因为谓词只读 `package.json` 的 `dsh.profile.bundles`，而层真正的挂载点
   是 `cordis.patch.yml` / `lute-host/shell.cordis.patch.yml`——P2 一挂插件这句 label 就变假而
   PASS 照旧。净效果是「空 profile 正常 / 零 LUTE 插件」这条里程碑事实**重新没有运行时断言**，
   裁决是把它的证据家转移到仓库里 seed 的 `cordis.patch.yml`（tracked、内容 `[]`），由
   `lute-shell-pin` 静态守住；**研究报告不得把 smoke 输出引用为这条事实的证据**。
4. **Task 8（`1b7bb9e`）——GUI 验收证据是五件套，不是那张截图；共享 `~/.dsh` 的会话显示属 P4
   隔离决策。** 入库的 PNG 是 CDP `Page.captureScreenshot`（macOS `screencapture` 被 TCC 拒），
   单凭它只证明 renderer 画了；「窗口真在物理屏上合成」由 `CGWindowListCopyWindowInfo` 读数
   （bounds 恰 1280×840）+ `show:false`/`once('ready-to-show')` 的代码事实 + 35/35 network 200 +
   0 `Runtime.exceptionThrown` + quit 后 `pgrep` 空共同证明，缺一即不得写「窗口已显示」。截图里
   出现的用户真实会话列表不是 P1 缺陷：`DSH_HOME` 共享 `~/.dsh`，spec §5 的「空 profile 正常」
   只指零 LUTE 插件。
5. **Task 9（`73d7270`、`bd8a220`）——空 dep map 判违规；`electron` 谓词在 fix round 2 才补上。**
   (a) `harnessSpecifiers` 对「解析成功但没有任何 `@deepseek-ai/*` 依赖」的 manifest 返回空 Map，
   而原实现没有非空断言——把 seed 的 `dependencies` 改名成 `devDependencies` 就能让两道版本守卫
   同时静默而门禁照绿。空分母不能算通过，这是 `scripts/gates/gate-result.mjs:116`（pass 要求
   `checked > 0`）已有的教义，本判定器用 legacy 形状绕开了它；改成两侧对称判违规。(b) `electron`
   的精确 pin 与「与 vendor 桌面插件同版本」这条**路由项从未落地**：`EXACT_VERSION` 只作用于
   `@deepseek-ai/*` 键，electron 从头到尾没进任何 map。它是 fixer 自己在 concern 里报出来的——
   Task 9 的评审逐行核了**在场**的七个守卫能否失败，却没问「路由清单里哪条不在场」，而缺席是
   评审方法论天然看不见的。规则：评审验存在的正确性，控制器验存在的完整性。
