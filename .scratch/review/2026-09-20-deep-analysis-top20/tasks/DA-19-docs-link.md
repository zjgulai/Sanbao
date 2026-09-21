# DA-19 · 本报告入 docs 索引，避免死指针

- 优先级：P2
- 状态：`done`（2026-09-21 结算，随本批提交入库）
- 依赖：无
- 估算：S
- 来源：P-09；报告 TOP20 #19

## Problem

报告位于 `docs/deep-analysis-2026-09-20.html`，若无入口指向它，就是 P-09 形态（指路本身也算事实，一条无入口的文件等于不存在）。
同批产出 `.scratch/review/2026-09-20-deep-analysis-top20/`（工单轮）也需要入口。

## 动作

1. `docs/README.md`「计划与报告」表新增一行：报告 + 工单目录的入口；
2. 链接按所在文件目录为基准写相对路径（P-09：层级数一遍，不要按感觉）。

## 验收

- `pnpm run gate` 中 `docs-link-integrity` 全绿（新链接可达）；
- 从 docs/README.md 能两步内到达报告与工单目录。

## 注意

本收尾已执行（状态 `local-done`），随下次提交入库后置 `done`。
