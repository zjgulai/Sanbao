# 运行中的字节不是磁盘上的字节：客户端 bundle 的生效边界，与两处空射程仪器

- 日期：2026-09-13
- 生命周期：implemented
- 类别：contract
- 相关 ADR：[ADR-0078](../../../adr/ADR-0078.md)、ADR-0061（本机装配走 profile）、
  ADR-0009（一份事实一个家）、ADR-0014（门禁硬门槛）
- 相关账目：[复发故障总账 P-02 / P-15](../../../pitfalls-playbook.md)

## Problem

修了侧边栏两处缺陷（技能中心文字居中、岗位矩阵被排到技能中心下方），源码改完、
构建产物核对过、装载点按 tmp+mv 推送过、逐字节比对两份副本都一致——**刷新页面后屏幕毫无变化**。

AX 几何读数与刷新前**逐位相同**：

| 元素 | 行 frame | 标签 x | 判读 |
| --- | --- | --- | --- |
| 技能中心 | x=64 y=233 w=256 | 163（标签中心 189.5） | 仍居中 |
| 岗位矩阵 | x=68 y=271 w=248 | 108 | 靠左（未变） |

于是暴露出三个各自独立的问题，其中两个是**仪器假绿**。

### ① 刷新永远不可能让客户端 bundle 生效

`@deepseek-ai/dsh-client-modules` 在**激活时**把每个包的 `client.js` 读成**不可变字节**
（`initialBundleSnapshot` → `record.bundle`），并在 `compose()` 里预先算好
`URL → body` 的 Map，由 HTTP 直接吐这份内存副本。改写内存的唯一入口是 `rebuilt(id)`，
而它被注释标明是「HMR watch 的注册钩子——bundle 内容变更进入 graph 的**唯一**入口」。

而 `@deepseek-ai/dsh-client-hmr` 里有一道 **production guard**：

```js
if (process.defaultApp !== true && process.env.DSH_DEV !== "1") {
    watch.mtimeMs = current.mtimeMs;   // 只推进基线
    watch.size = current.size;
    watch.dirty = false;
    return;                             // 不调用 clientModules.rebuilt(id)
}
```

即：在**打包后的应用**里，磁盘上的 bundle 变更会被**主动丢弃**，而且基线被推进——
这个变更不会再被注意到。源码注释写得很直白：「下一次**完整重启**才会从新字节重新组合」。

本机实测：`DSH_DEV` 未设置、主进程非 `defaultApp` → 守卫生效。
**结论：客户端 bundle 的任何改动，在打包应用里只有「重启应用」一条生效路径；
刷新页面（⌘R）连试都不用试。**

### ② `sync-profile.mjs --check --loadpoint` 从来没跟仓库比过

`loadPointPairs()` 里：

```js
const sourceDir = spec.slice('file:'.length)          // './vendor/packages/surfaces/…'
if (!managed.has(sourceDir.split('/').pop())) continue // 包名对上了
if (!existsSync(join(sourceDir, 'package.json'))) continue // ← 基准是 cwd，不是 profile
```

`file:` 的基准是**声明它的 package.json 所在目录**（即 profile），而这个脚本可能在任意 cwd 运行：

- 从**仓库根**跑：`./vendor/packages/…` 在仓库里不存在 → **每个包**都被 `continue` 掉 →
  `pairs` 恒为空 → 输出 `ok 装载点与仓库源一致`，退出码 0。
- 从 **profile 目录**跑：路径能解析，但 `sourceDir` 指向 **profile 自己的 vendor 副本**——
  比的是「副本 ↔ 副本」，两份都旧也互相相等 → 同样输出 `ok`。

我此前向用户报告的「从 profile 跑时它比的是两份副本」正是第二种。

### ③ `gate:profile-bundle-sync` 同样空射程，而它正是为这件事存在的

`scripts/gate.mjs` 的门禁有同一个 bug（同一行 `existsSync`）：

```js
const sourceDir = spec.slice('file:'.length)
if (!existsSync(join(sourceDir, 'package.json'))) continue
const entry = packages.get(sourceDir.split('/').pop())
if (entry === undefined) continue
pairs.push({ name, sourceDir, … })   // ← sourceDir 本应是**仓库**相对路径
```

实测：profile 声明 **23** 个 `file:` 依赖，**23 个全部**在 `existsSync` 处被跳过，
`pairs` 恒为空 → `checkProfileBundleSync([])` → 恒 `passed: true`。

**这条门禁的 remediation 原文是「否则应用重启后仍跑旧字节」——即它存在的唯一理由就是
拦住此刻发生的这件事，而它一个包都没对着看过。**

## Decision

1. **两处路径解析都改为按包名反查仓库受管包目录**（`entry.dir` / `managedPackages()` 的
   `relPath`），不再使用 `file:` spec 里的相对路径。仓库路径的来源只有一个：包清单。
2. **空射程必须自己报出来**，不能与「都一致」同形：
   - 门禁：`fileDeps > 0 && pairs.length === 0` 直接判红，并在 `note` 里常显 `对比 N/M 个 file: 依赖`。
   - CLI：`--loadpoint` 下同上判红；`ok` 行常显 `（对比 N 个包）`。
3. **把「运行中的字节」与「磁盘上的字节」当成两个事实**，并在总账里立为 P-15。
4. 顺带修掉门禁改正后**立刻量出来**的真实漂移：`dsh-overseas-skills` 的
   `lib/client.js` / `lib/org-tree.js` / `lib/preset-roles.js` 三个文件装载点比仓库旧
   （仓库 mtime 19:03，装载点 03:00 / 09-12），已按 tmp+mv 同步。

## Alternatives considered

- **给应用加 `DSH_DEV=1` 启动以走 HMR 路径**：仍然是重启，且改变运行环境
  （会把 rebuilt 帧推给 renderer，而 production guard 的注释明确说那会让页面白屏）。
  收益为零、风险为正，不做。
- **找一条「强制重新组合」的 HTTP 路由**：读过 `dsh-client-hmr` 全文——它只注册
  `/plugins/events` SSE（**只读**：推 graph / rebuilt 帧），没有任何触发重建的路由；
  `clientModules.rebuilt` 只能被 host 内部调用。故不存在「不重启而让新字节生效」的路径。
- **只修 CLI、不修门禁**：门禁才是「拦住」的那个人（P-03）。只修 CLI 等于把
  「知道」写进文档而把「拦住」留空。
- **把空射程判红改成打印警告（非阻塞）**：那正是 P-02 的成因——警告会被忽略，
  而「一个包都没比」与「全都一致」必须不可能同形。

## Consequences

**正面**

- 客户端 bundle 的生效路径被写清楚了：改 → 构建 → tmp+mv 推到装载点 → **重启应用**。
  少掉一整类「我明明改了、刷新了、怎么没变」的时间黑洞。
- `gate:profile-bundle-sync` 的射程从 **0/23** 变成 **23/23**，并且读数里常显分母：
  即使将来又退化成空射程，读数上也不再与「全绿」同形。
- 修正射程后立刻量出一条真实的、此前不可见的漂移（`dsh-overseas-skills` 三个文件），
  并已同步—— **这条漂移本来会在下一次重启后表现为「改过的胶囊又回来了」**。

**负面 / 代价**

- 门禁变红是对的行为：本机现在是绿的，但任何一次「改了仓库忘了推装载点」都会当场变红。
  这是它本来就该有的行为，只是此前没生效。
- 客户端 bundle 的生效仍需**人工重启**，没有自动化路径。已经写进 P-15 的「下一版默认动作」，
  但**没有机制能强制它**——「应用是否重启过」不是磁盘上可判的事实。

**诚实划界（判不出的部分）**

- **「运行中的字节」无法从磁盘判定。** 本次之所以能确认，是因为改的是**可见几何**
  （AX 标签 x / 行 y）。若改的是不可见行为，磁盘侧全绿、应用侧仍旧，没有任何静态判据会发现。
  这一条在总账 P-15 里明写为「判不出」，不假装被拦住了（P-03）。
- 门禁与 CLI 的两处判据**只覆盖磁盘 ↔ 磁盘**（仓库源 ↔ 装载点）。它们能回答
  「装载点是不是最新」，**不能**回答「跑着的那个进程读的是不是装载点」。
