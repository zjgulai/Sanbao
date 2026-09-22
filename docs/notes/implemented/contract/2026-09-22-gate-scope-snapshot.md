# 门禁的射程快照：判据不得把自己同侪刚写出来的字节当成改动

关联决策：[ADR-0103](../../../adr/ADR-0103.md)（门禁的「无副作用」必须由快照见证与进程边界担保）、
[ADR-0055](../../../adr/ADR-0055.md)（full 模式逐包跑脚本的顺序判据）、
[ADR-0102](../../../adr/ADR-0102.md)（分母必须由被检查对象的完整集推出）

## Problem

2026-09-22 的远端 CI 里，同一轮 run 的两个 job 对**同一个判据**给出相反读数：

| 档 | `changed-packages` 读数 |
| --- | --- |
| quick | `skip`，typedSkip `no-changes-in-range`——「改动射程为空」 |
| full | `pass`，「3 个改动包与治理规则已核对」 |

两档的基线完全相同（报告 `note` 都是 `DSH_GATE_BASE_SHA@889c49ce（event-base-sha）`），
差异在**工作树**：quick 是 `unstaged=0`，full 是 `unstaged=53`。

53 个被跟踪文件从哪来？**门禁自己写的。** 判据表里 `scripts-runnable` 标着 `modes: ['full']`、
排在第 89 位，而 `changed-packages` 排第 92 位——前者按包执行 `typecheck → test → build`
（`packageScriptOrder`，ADR-0055），而 `build` 会把**已入库**的产物用新字节盖掉，
这件事该判据自己的注释就写着。于是后置判据读到的不是「这次推送改了什么」，
而是「门禁刚把什么改脏了」。

为什么本机看不见：重写后字节与入库产物**完全相同**（同平台同工具链），`git diff` 为空；
CI 的 Linux runner 上重写结果不同，才以「两档互相矛盾」的形式暴露。同一机制在本机也复现过——
两次本地 full 读数里 `changed-packages` 的 2→3 与 `permission-bits` 的 120→122 就是这个漂移。

按 P-02（仪器假绿）归类：假绿不来自判据本身，来自**判据的输入被同侪污染**。
本次推送（`889c49c..9d9cc2a`）只动文档，正确读数就是 quick 档那个 `skip`；
full 档那条 `pass` 核对的 3 个包与本次推送无关。

## Decision

**射程在门禁启动时算一次，后置判据复用同一份快照。**

- `scripts/gates/changed-packages.mjs` 新增 `takeChangedScope()` / `readChangedScope()`：
  前者算一次并记住，后者读回（未取过返回 `null`）。
- `scripts/gate.mjs` 在 `runGateChecks()` **之前**调用 `takeChangedScope({...})`，
  即在任何判据执行前落定射程。
- `changed-packages` 与 `permission-bits` 改为 `readChangedScope() ?? resolveChangedScope({...})`：
  取不到快照时仍走各自原路径，行为不变（`permission-bits` 只用 `scope.sources` 与 `ok/reason`，
  不关心包归属，故与前者共用一份即可）。

射程类读数从此与「判据表里的相对顺序」解耦：将来在它们前面新增任何写盘判据，都不会再污染射程。

## Alternatives considered

- **把这两条判据挪到所有写盘判据之前**：脆弱。顺序是隐式契约，没有任何判据守着它，
  下次有人在前面加一条会写盘的判据就复发（这正是本条的成因）。
- **让 `scripts-runnable` 改在临时副本里跑**：最干净但最贵（每个包都要物化一份），
  且会改变该判据的语义——它现在的价值恰恰是「在真实布局上跑真实脚本」。
- **只在 CI 侧加前置快照**：把问题留在门禁里、在调用方兜。判据的输入该由判据自己保证，
  且本地跑同样受益（本机也观察到过同样的漂移）。

## Consequences

- **端到端实测（2026-09-22）**：门禁跑到中途（约 45 秒时）往
  `packages/capabilities/dsh-browser-local/lib/index.js` 追加一字节，报告里
  `changed-packages` 的 `unstaged` 仍是 **3**（写入前的读数）、直接命中包 **0** 个——
  写入没有进射程。同批单独复算：同一写入若走现算路径，该包会立刻进射程
  （`packages` 从 `[]` 变 `["packages/capabilities/dsh-browser-local"]`，`unstaged` 3→4）。
  探针文件已还原，改动数 0。
- 该轮 quick 的唯一红是 `profile-bundle-sync` 报 `@yuxianglin/dsh-bridge-browser` 装载点不一致
  ——**同一支探针的副作用**（仓库源被写脏，仓库与装载点自然不一致），还原后独立复跑
  `node scripts/sync-profile.mjs --check --loadpoint` 得 `ok 27 个包`、exit 0。不是回归。
- `changed-packages-selftest` 与 `permission-bits-selftest` 均 `fail 0`。
- **仍未覆盖**：本修法只保证「射程不被同轮写入污染」，不改变「射程口径」本身
  （口径问题见 ADR-0102 与总账 P-11）；也不再回答「写盘判据该不该写盘」——
  ADR-0103 的 `--attest` 见证仍是那条线，但它在 CI 上因门禁先失败而跑不到，属未收口项。
