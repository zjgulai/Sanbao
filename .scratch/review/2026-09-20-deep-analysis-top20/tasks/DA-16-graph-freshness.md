# DA-16 · 图谱保鲜：排除 TS 包 lib/ 构建产物 + 发布窗口后例行增量重跑

- 优先级：P2
- 状态：`open`
- 依赖：无
- 估算：S
- 来源：本次图谱实测（lib 双计）；报告 TOP20 #16

## Problem

本次图谱收录同时包含 TS 包的 `src/`（源）与 `lib/`（tsc/tsdown 构建产物），节点数约为源码视角的两倍——「热点文件」若不区分会把构建产物当源码（本次报告已手工区分，但图谱本身仍有此失真）。
同时 `.ua/knowledge-graph.json` 是活图谱：不重跑就会再次停在旧 commit（本次刷新前它停在 4 天前、56% 文件已变更）。

## 动作

1. 在 `.ua/.understandignore` 增加「有 `src/` 的 TS 包的 `lib/`」排除模式（保留纯 JS 包的 lib/——那是源码）；
2. 约定：每个发布窗口结束后跑一次 `/understand` 增量（或配置 auto-update 钩子）；
3. 重跑后核对热点列表指向 `src/` 文件、总节点数明显下降。

## 验收

- 重跑一次增量：`lib/` 产物不再出现在文件节点中（纯 JS 包除外）；
- 热点列表（函数密度 Top）全部指向源文件；
- `.ua/meta.json` 的 commit 与当时 HEAD 一致。

## 注意

排除模式生效需要 `--full` 重扫（新 ignore 规则对增量不回溯）；`.ua/intermediate/` 仅保留 scan-result.json。

## 动作 1 已落 + 扫描级读数（2026-09-22）

规则已写进 `.ua/.understandignore`（该文件在本机 gitignore 内、**不入库**，属本机配置）。

**用显式清单而不是「全排 lib/ + 逐包 `!` 拉回」**：本仓纪律是默认错误方向选多量——
漏排一个 TS 包只会让图谱多噪声（可见），漏写一条 `!` 会让某个纯 JS 包的**源码静默消失**（不可见）。
清单可随时用一条命令重推：`for g in packages/*/*; do [ -d "$g/src" ] && [ -d "$g/lib" ] && echo "$g/lib/"; done`。

**改前 / 改后（`scan-project.mjs` 确定性脚本直跑，未经 LLM）**：

| 读数 | 改前 | 改后 |
| --- | --- | --- |
| `filesScanned` | 3037 | **2934**（-103） |
| `filteredByIgnore` | 0（忽略文件全是注释） | **103** |
| `packages/**/lib/**` 文件数 | 173 | **70** |

被排除的 103 个全部属于**有 `src/` 的包**（browser 26 / deepresearch 57 / qoder-sidebar 16 /
theme 2 / onboarding-carousel 2）；被保留的 70 个全部属于**无 `src/` 的纯 JS 包**（wanzh、loopx、
overseas-skills 等 15 个）；**非 lib/ 的意外丢失 0 个**。两侧逐包核对过，不是靠总数相等推断。

其余 TS 包（root-brand / settings-shell / agent-team-gui / algo-skills / capability-hub / newapp /
role-matrix / skill-center）的 `lib/` 未被 git 跟踪且被 .gitignore 排除，扫描器本来看不到，无需列名。

## 尚未完成的验收（需重跑，代价已量）

验收②③（图谱里不再有 lib/ 节点、热点全指源文件、`meta.json` 的 commit == 当时 HEAD）
都要真正重跑一次才拿得到。**先量规模再决定**：

| 路径 | 批数 | 说明 |
| --- | --- | --- |
| 全量重扫 | **201 批** | 最彻底；按本仓成本实测（常规批 19-26 万 token）是千万级 token |
| 定向增量 | **53 批** | 剪掉 103 个 lib/ 节点 + 重分析 `ef17b22..HEAD` 真改过且仍在清单内的 142 个文件 |
| 定向增量（排除 `.scratch/`） | **51 批** | 批数几乎不降（小文件本来就被合并进 misc 批），但图谱少 23 个在飞文档的噪声 |

**未跑**，等用户按成本拍板。中间产物已复原成全量口径（`batches.json` = 201 批），
`scan-result.json` 已换成本轮新扫描（含新 ignore 规则），原件备份在 `/tmp/ua-scan.*/`。
