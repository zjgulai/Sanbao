# 门禁判词把「墙钟超时」与「用例判红」分开报

关联决策：[ADR-0043](../../../adr/ADR-0043.md)（脚本证据按流分流、退出码不得伪造）、
[ADR-0102](../../../adr/ADR-0102.md)（「没读到」不得长得像「通过」）、
[ADR-0103](../../../adr/ADR-0103.md)（侧效应见证与安静窗口）

## Problem

2026-09-21 集成后的 `gate:full` 只剩一项红：

```
repo-attest-selftest  fail
  - 侧效应见证六条结束路径的反向自测失败（退出码 124）
```

单独复跑 `node --test scripts/lib/repo-attest.test.mjs` 的读数是 **9/9 全绿、139.5s、退出码 0**。
聚合层给这条检查的墙钟预算是 `runNodeTestFile` 的默认 120s，于是进程被杀掉、
门禁把「预算没读到结论」写成「反向自测失败」。按这句话去改用例是错方向：
**红的是环境，不是判据**（总账 P-21 的形态）。

两层叠加让它更难读：

1. `scripts/lib/run-script.mjs` 早就为这类误读准备了 `note`——超时时带上当场
   load 均值与占 CPU 前 5 的进程（ADR-0043 的第二例修法）。但聚合层
   `runNodeTestFile` / `runNodeTestFiles` 只取退出码，把 `note` **整段丢掉**，
   于是生产端准备好的区分能力在自己的消费者身上失效。
2. 本机当时挂着四组**父进程已是 init** 的 vitest worker（`dsh-newapp-local`，
   起跑于 11:53–12:28，持续 11 小时以上、每组 10 个 worker），load 均值 9.7／10 核。
   同一个原因还让 `run-script.test.mjs` 里「烧 CPU 的进程必须出现在前 5 名」那条用例
   变红——它去抢一个全局排名，而排名被外来负载占满。

## Decision

1. **判词分类落在 `scripts/lib/run-script.mjs`**：新增纯函数
   `describeTestRunFailure({ result, scriptPath, failureLabel })`。
   - 退出码 124 → 一条专属判词：点名耗尽的预算、带上当场机器读数、给出
     `node --test <file>` 的单独复跑命令，并明写「未跑完不等于用例判红」；
     **不复用** `failureLabel`（那句话断言的是判据失败）。
   - 有可解析的 `✖` / `AssertionError` 行 → 逐条带出（这才是诊断的本体）。
   - 非零且无行 → `failureLabel（退出码 N）`；退出码读不到 → `未给出退出码`，不折算成 1。
   落点选这里而不是留在 `gate.mjs`：`gate.mjs` 顶层就 `main()`，import 即跑一整轮门禁，
   不可测——这正是当初把 `runScript` 抽到 `scripts/lib/` 的理由。
2. **见证类用例显式抬高预算**：`repo-attest-selftest` 从默认 120s 抬到 20 分钟。
   上界不是拍的：用例集里 8 个探针各自有 `attestCommand` 内部 120s 上限，
   加上每用例两次全仓快照 ≈ 18 分钟，取 20 分钟保证**用例自己的判词**先于门禁墙钟出现。
3. **给这份判据补一个读者**：注册 `gate:run-script-selftest`。此前
   `scripts/lib/run-script.test.mjs` 只被 `pnpm run test:gate` 的通配覆盖，
   `pnpm run gate` 与 CI 都不跑它——而总账把它写成 P-21 的「已落地机制」。
4. **把那条抢排名的用例改成受控的 `ps` 替身**：乱序 7 行输入，断言按 pcpu 降序取前 5、
   第 6/7 名不得混进、并且 `ps` 真的被调用过（写标记文件）。
   它现在比原来更严（原来只证「有个进程出现了」），且不再随外来负载翻脸。

## Alternatives considered

- **删掉这条红／把它降成 skip**：不成立。超时确实该报，只是必须报成超时。
- **只抬预算，不改判词**：能把门禁刷绿，但下一次任何一条 selftest 超时仍然会被读成
  「判据坏了」——修的是这一次的红，不是这个类。
- **让 `repo-attest.test.mjs` 跑快一点（减探针、减快照）**：会把六条结束路径的覆盖面一起减掉，
  而那些路径正是这项存在的理由。作为后续优化可以谈，不作为消红手段。
- **改机读环境（清掉那四组孤儿 vitest）**：能解释今天的负载，但它不是判据的责任，
  而且判词分类在无负载时同样必要。孤儿进程单独上报，处置由人拍板。

## Consequences

- 门禁总项数 +1（`run-script-selftest`）。判词变化会影响任何按字符串匹配报告的人；
  目前报告消费面只有 `--json` 的 `violations[]` 与终端渲染，无契约破坏。
- 超时不再"看起来像"代码缺陷，但也意味着**真·慢下来的用例**会以「预算用尽 + 机器读数」
  出现，需要人判断该修的是用例还是预算——这个决定交回给人，是本条的意图。
- `repo-attest-selftest` 在最坏情况下可能占用 20 分钟墙钟（用例自身判词先出现，
  因此那 20 分钟只会出现在真挂住的时候）。CI 的 full job `timeout-minutes` 仍在其上。
- 本机那四组孤儿 vitest worker 仍在（load 9.7）。**已知未处理**：它们会持续污染所有
  时间敏感的读数（含 `gate-concurrency-selftest` 的安静窗口探测），处置需用户拍板。
