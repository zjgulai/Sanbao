# Jev 出网边界收口：D2 从纪律变成运行期闸门

- 关联 ADR：ADR-0138（D2 出网上限 = 仓库内 git 跟踪的文本；后果 1 登记为「仍是纪律，没有门禁」）
- 日期：2026-09-20
- 状态：implemented

## Problem

ADR-0138 后果 1 写着：「D2 的出网边界目前仍是纪律，没有门禁。要真守住需要一条判据扫『outbound
state 的来源是否落在 git 跟踪集内』，而『来源』是运行期数据流，静态扫不出来。当前只有代码审查这一层。」

2026-09-20 复核：这句话只对了一半。**静态**扫不出数据流是真的，但这条判据在**运行期**是可判的
——装载器就是那道关口。而当天的实际状态是：`corpus-review.mjs --corpus <file>` 与
`loadSamples(path)` 能读任意路径，把它指向 `~/.dsh/scratch/attrib/mine.jsonl`（实测 62MB 完整会话
转录、含 `danger-full-access`、前 300KB 命中密钥形态）只要改一个参数；出口文本随后原样进
`POST /v1/systemone` 的 `state`。D2 说「任何把 attrib 内容读进 outbound state 的代码路径都必须
不存在，而不是靠人记得」——当时它确实存在，且没有任何读数会因此变红。

## Decision

1. **闸门 = `scripts/jev/egress-boundary.mjs`。** `assertEgressSourceTracked(source)` 判三件事：
   存在且是文件、落在某个 git 仓库内（`rev-parse --show-toplevel`，仓外与 git 不可用同判）、
   被该仓库跟踪（`ls-files --error-unmatch`，即索引或 HEAD 里的跟踪集）。任一不满足抛
   `JevEgressBoundaryError`，**每条判词都点名 ADR-0138 D2**——读的人要能顺着这句回到决策，
   而不是只看到「读不到文件」。
2. **闸门装在两个装载器里，不是装在调用方。** `loadCorpus` 与 `loadSamples` 在 `readFileSync`
   之前调用它，于是 CLI 的 `--corpus` / `--samples` 与库形态（`runCorpusReview({corpus})`）
   被同一条判据管住；样本集的 `state` 字段是第二个出网口，单独判。
3. **门禁 `jev-egress-boundary` + `jev-egress-boundary-selftest` 守住闸门本身**（六项探针）：
   默认语料在跟踪集内 / 未跟踪 corpus 被 `loadCorpus` 拒载 / 仓外 corpus 被拒载 /
   未跟踪样本集被 `loadSamples` 拒载 / 跟踪夹具照常装载（**不许误杀**）/ 发网模块 `client.mjs`
   无文件读取面（不得出现 `node:fs`、`node:child_process`、`readFileSync`）。恒真闸门、
   过严闸门、拒了但不点名 D2、空射程（P-02）四种突变各自必须判红。
4. **夹具改成临时 git 仓库**（`git init` + `git add`）：跟踪集是闸门的判据，夹具不入库就只测到
   闸门、测不到它后面的形状校验——两条既有夹具因此重写。
5. **先把 Jev 工具层收口进 git**（提交 `3e38c59`）：`scripts/jev/samples.json` 此前未跟踪，
   闸门一落地就会拒载语义轨自己的基线集。这不是顺带，是前提。

## Alternatives considered

- **保留静态扫描**（grep 出所有读文件的调用点人工核对）。否决：ADR 已判定静态扫不出数据流；
  更要命的是**新增一条读路径不会再让任何仪器变红**——那正是 P-04「写了但从没跑到」的形状。
- **闸门判「在仓内」而不是「被跟踪」**。否决：仓库树里同样有从未打算出境的未跟踪文件（草稿、
  抓取物、临时 dump），跟踪集才是经评审、可 diff、可追溯的那一份；而且 ADR-0138 D2 与 T3
  「只评仓内 git 跟踪 corpus」写的就是跟踪集。仓外判据会宽出一个可被日常操作填上的口子。
- **把判据放在发网模块 `client.mjs` 里**。否决：那里只拿到 `state` 字符串，拿不到来源；把闸门
  建在下游而判上游的事，等于把「谁喂的」这个唯一有效的信息丢掉。
- **靠权限/沙箱**（文件权限、只读挂载）限制。否决：本仓是无服务端的本地优先形态，没有可信边界
  可用；且这类失败是静默的，与「让缺了可观测」正相反。
- **只在 CLI 入口判、库函数不判**。否决：库形态同样是出网路径，测试与将来的调用方都会绕过它；
  闸门必须装在装载函数上，谁调都一样。
- **给默认路径开个豁免**（常量来自被跟踪的源码，所以「可信」）。否决：`samples.json` 当时恰恰
  就是默认路径下的未跟踪文件——豁免会把真问题静默留在原地。

## Consequences

- 正面：D2 拿到的是**运行期**判据（比 ADR 设想的静态扫描更强），attrib 形态的来源在装载那一刻
  被拒，判词点名 D2；CLI 与库两条路走同一条闸门，不再靠人记得。
- 正面：误杀方向也有反向探针按住——闸门过严会把整改逼成「摘闸门」，那是比误杀更坏的结局。
- 残余（不假装已消除）：**文件被跟踪 ≠ 内容清白**。跟踪集内的文件仍可能被写入敏感文本，
  这一段只能靠人复核；corpus 292 条与样本 9 条都在仓内、可 diff、可评审，是这条残余的兜底。
- 代价：语义轨跑批现在要求语料与基线样本集都在跟踪集内——这正是本收口之前必须先提交工具层的
  原因；同时也意味着往后再往 `scripts/jev/` 里放新的出境数据文件，必须先入库。
- 验证读数：`node --test 'scripts/jev/*.test.mjs' 'scripts/gates/jev-egress-boundary.test.mjs'`
  = 46 通过 / 0 失败；`node scripts/gates/jev-egress-boundary.mjs` = 6/6 探针通过且判词点名 D2；
  `pnpm run gate`（quick）里四条 jev 读数全绿（`jev-tier15-freshness` 5/5、
  `jev-egress-boundary` 6/6，两条 selftest 通过）。
