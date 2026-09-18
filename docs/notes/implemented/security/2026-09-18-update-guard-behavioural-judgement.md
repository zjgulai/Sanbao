# 更新安装闸有了会自己变红的判据：从「串在不在」到「闸还成不成立」

- 日期：2026-09-18
- ADR：[ADR-0126](../../../adr/ADR-0126.md)
- 生命周期：implemented
- 类别：security

## Problem

2.0.10 升级方案 §4 把 T-08a 标成**必做**：把「`DSH_DISABLE_UPDATE_INSTALL` 可解除下载执行」变成 gate，
对已装 app 的 `electron-runtime-*.js` 断言 **throw 路径存在**，变异验证红。

2026-09-18 做版本升级任务盘点时实测：全仓 `grep -rn "update-guard\|updateGuard" scripts/` **零命中**——
这条「必做」从未建立。而它守的那条闸是真实存在的（装机字节 `electron-runtime-IsgfTki1.js`，命中位置 110553）：

```js
async downloadAndOpenUpdate(version, signal, channel = "stable") {
    if (process.env.DSH_DISABLE_UPDATE_INSTALL !== "0") throw new Error("Update installation is disabled for security (unsigned payload risk). …");
    …
    const artifactPath = await downloadDesktopUpdate({ … });
    const openError = await shell.openPath(artifactPath);
```

**已经有人在守它，但守的方式看不见它坏掉。** `packaging/verify-patches-v2.sh:66` 是：

```bash
ck "P0-1v2 更新守卫" "$LIB_ER" "Update installation is disabled for security"
```

按**消息串**判。串在 ≠ 闸在，而且这两件事可以同时成立、闸却完全不设防。对**装机真实字节**做突变，两种形态实测如下：

| 突变 | 消息串仍在？ | 按串判 | 物理后果 |
| --- | --- | --- | --- |
| M2 把闸整句挪到 `downloadDesktopUpdate(` **之后** | 是 | **绿（假绿）** | 下载已经发生才判，拦不拦都没有意义 |
| M3 把条件抽成 `if (false)` | 是 | **绿（假绿）** | 闸永不拦；且紧跟的 platform 检查也带 `throw`，连「判后有 throw」这条较弱的判据都照样成立 |

这条闸的后果是不对称的：官方载荷**未签名**，失去它等于允许未签名字节被交给系统安装器（那句文案说的
正是 "unsigned payload risk"）。而当时的账面上——门禁全绿，没有任何读数会变。

这正是 P-03 的形状：**没有判据能说「不」的东西，等于没有守住。**

## Decision

新增门禁 `update-guard` + 反向自测 `update-guard-selftest`，判据是纯函数
`checkUpdateGuard(text)`（`scripts/gates/update-guard.mjs`）。断言**四条结构关系**，不判文案：

1. 闸用 `DSH_DISABLE_UPDATE_INSTALL`，且**紧跟与 `0` 的比较**；
2. 判完**紧跟 `throw`**（判而不断等于没判）；
3. 闸**排在副作用之前**——`downloadDesktopUpdate(` 与 `shell.openPath(` 都在它后面；
4. `downloadAndOpenUpdate` **仍有调用点**（否则闸是死代码，真正的安装路径在别处）。

射程**复用** `gates/patch-anchor-scope.mjs` 的 `selectAnchorTargets`（本机 `/Applications` ∪ 未打 tag
的 staging 树），本处只做它的磁盘读取面——射程规则不立第二个家。

`unverifiable`（读不到正文、方法体配对不闭合）**单独计数并计入失败**。它包含一个实测形态：
写入路径把文件落成 mode 000 时 node 直接 `EACCES`——把「读不到」读成「补丁丢了」，
会把人送去重锚一个根本没坏的东西。

与 `patch-anchors` **分工，不合并**：那条管补丁在不在（含消息串），这条只管它在行为上还成不成立。

## Alternatives considered

- **甲：复用 `patch-anchors`，不新增判据。** 否决。它的锚**就是那条消息串**，而本项要拦的 M2/M3
  两形态消息串都还在——塞进同一条判据只会让它看起来更全，实际仍看不见。
- **乙：并入 `plugin-entry-contract` 族。** 否决。那一族的对象是插件入口契约（profile 侧），本项是
  壳层 bundle 里的安全守卫，射程与失效方式都不同，并进去会让 remediation 指错地方。
- **丙：只断言「串 + 顺序 + 判后有 throw」。** **曾实现成这样，被自己的突变推翻。** M3 实测判**绿**：
  条件被抽走后 env 只剩消息串里那一次出现，而紧跟的 platform 检查也带 `throw`、落在判定窗口内。
  补上「条件必须还在跟 `0` 比」之后才转红。**这一条是本轮最值得复用的教训：判据的边界只能靠突变
  找出来，不能靠推想**——我在写它的时候认为「判后有 throw」已经够强了。
- **丁：改用运行时探针（真调一次）。** 本版否决。需要真实 update artifact 与平台策略，成本远高于收益；
  而且它一旦真的走到 `shell.openPath`，**探针自己就成了那次未授权安装**。
- **戊：钉死闸的完整字面量。** 否决。上游换引号或改文案就会造出一条与缺陷无关的红，而噪声规则的
  结局是被关掉（P-02 的死法）。只钉「有没有在跟 `0` 比」，不钉写法。

## Consequences

**验证（全部实跑，读数如下）**

| 项 | 结果 |
| --- | --- |
| `node --test scripts/gates/update-guard.test.mjs` | **12/12 pass** |
| 装机真实字节 · 原样 | **绿** —— 闸在位，排在 `downloadDesktopUpdate(`/`shell.openPath(` 之前，调用点 1 处 |
| 突变 M2（闸挪到下载之后） | 天真串判 **绿（假绿）** → 本判据 **红** |
| 突变 M3（条件抽成 `false`） | 天真串判 **绿（假绿）** → 本判据 **红** |
| 突变 M4（定义改名） | 本判据 **红** |
| 突变 M5（闸整句移除） | 本判据 **红** |

**正面**

- P0-1v2 第一次有了**能说「不」**的判据；测试里显式断言「按串判的天真实现会在 M2/M3 上判绿」——
  判据存在的理由被写进断言本身，下一个人拆它之前会先看到这条。
- `unverifiable` 不会被伪装成通过。

**负面 / 代价**

- 这是**静态文本**断言，不做控制流分析。它**拦不住**「闸还在原位、但上游在别处新开了一条未受保护的
  下载路径」。已在模块头、remediation 与 ADR 里如实划界。
- 只认 `downloadAndOpenUpdate` 这一个方法名；上游改名会让本项**响亮判红**并要求人工重锚。
  这是有意的方向选择：宁可响亮红，不静默绿。
- 它**不替代** `verify-patches-v2.sh:66` 的按串 `ck`（那条是补丁登记面的一部分，射程含未打 tag 的树）。
  两条的分工写进了 remediation，免得下一个人误以为重复而删掉一条。

## 顺带实测到的一个仪器缺陷（未修，登记）

`write` / `edit` 的写入路径会把文件落成 **mode 000**：本轮 `CHANGELOG.md`、`scripts/gate.mjs`、
`scripts/gates/update-guard.mjs`、`update-guard.test.mjs` 四个文件都中过，表现为 node 直接 `EACCES`。
仓库里**没有任何判据看这个**——`docs/plans/2026-09-18-release-convergence.md` §F4 把它记成「另一会话
`tmp+mv` 的**瞬态**窗口态、终态 644」，而本轮的最小复现说明它**不是瞬态**：文件写完就一直是 000，
直到手工 `chmod`。

本轮按 git 记录的模式（`100644`）修回，`find -type f -perm 000` 归零。**没有顺带建判据**——
那是一条独立的门禁，超出本轮批准范围，登记为候选：真值来源应当是 git 记录的模式，而不是期望值硬编码。
