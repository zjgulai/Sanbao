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
