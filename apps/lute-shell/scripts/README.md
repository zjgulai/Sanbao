# scripts/ · lute-shell 本地脚本

两个脚本都是**本地开发工具，不进 CI**；断言清单以 [`smoke.mjs`](smoke.mjs) 源码本身为准。

## `materialize.mjs`（`pnpm run materialize`）

把 `seed/` 与编译好的宿主运行时拷进 `~/.dsh/profiles/lute-shell/`，再在 profile 内跑 `pnpm install`
收敛依赖（已收敛时是快速 no-op）。前置条件：先跑 `pnpm run build`（脚本从 `lib/` 导入布局与物化逻辑）。
环境变量 `LUTE_SHELL_PROFILE` 可改落点目录。

## `smoke.mjs`（`pnpm run smoke`）

无头端到端 smoke：纯 Node 父进程 spawn 真宿主子进程（不启 GUI、不依赖 Electron），走 FD3/FD4
帧管道把每条 `check(...)` 断言对真 profile 跑一遍（ready、index.html 注入、SPA 回退、403 越界、
最大资产逐字节往返、优雅退出）。前置条件：`materialize` 跑过（宿主运行时已在 profile 内）。
**不进 CI**：profile 要装数百个 npm 包，CI 成本与网络面都不成立。

## 失败归因顺序

smoke 失败时按既定顺序归因（overlay/bundle → 裸导入落点 → seed overrides → layers 为空 →
页面渲染留给 Task 8），**不要**跳到版本/JIT/CLI 玄学（P-52 教训）。
清单的家在计划文档 [Task 7 Step 3](../../../docs/superpowers/plans/2026-09-19-p1-lute-shell-skeleton.md)。
