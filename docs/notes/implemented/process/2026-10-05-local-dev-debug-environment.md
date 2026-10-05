# 本地开发与调试环境（dev:debug）

- 日期：2026-10-05
- 关联 ADR：[ADR-0263](../../../adr/ADR-0263.md)
- 关联：[打包决策包（A 档）](../../proposed/process/2026-10-05-sage-packaging-decision-package.md)、[本机活动仓基线](2026-09-27-local-active-repository-baseline.md)、[执行方案](../../../plans/2026-09-24-sage-self-owned-desktop-execution-plan.md)（P1）

## Problem

方案 A（本机自用 Sage.app）的第一步是可靠的本地开发与调试环境。此前开发循环是手工三步（`tsc && build-renderer` → `SAGE_ROOT=… node scripts/materialize.mjs` → `electron .`），且 `pnpm dev` 缺省直指**生产数据根**；「先 materialize 再重启」只是会话经验；调试端口与日志路径没有成文入口。

## Decision

1. 一键入口 `apps/sage-shell/scripts/dev-debug.mjs`（`pnpm dev:debug`）：**构建 → materialize → 启动**顺序固定；`--no-build` 纯重启、`--print` 只读解析结果。
2. 隔离 dev 根默认 `~/Library/Application Support/Sage Dev`，首用写 `.sage-dev-root` 标记；`--reset` 仅认标记（否则拒绝，exit 2）；`SAGE_DEV_ROOT`/`--root` 可覆盖。
3. 调试姿态：main inspector（默认 9229）＋renderer CDP（默认 9222）＋`SAGE_DEVTOOLS=1` detached DevTools；端口可覆盖；stdout/stderr tee 至 `<dev 根>/logs/dev-session.log`。
4. 投影默认 `SAGE_FIXTURE_PROJECTION=1`（可见 UI）；`--unavailable` 切生产形态。

## Alternatives considered

- 维持手工三步：否决（摩擦、误用生产根风险、无成文读数）。
- 复用生产根：否决（隔离纪律）。
- 引入 dev server/热重载框架：暂不（单文档私有协议无需；另行评估）。

## 首批战果（2026-10-05 首跑即抓）

- **现象**：首跑 live 应用，页面控制台持续报 `Fetch API cannot load dsh-app://app/.sage/state. URL scheme "dsh-app" is not supported`——`/.sage/state` 全部失败、所有区域恒 `unavailable`（脏工作树下的真实产品路径缺陷，窗口 spec 因用测试主进程而全绿）。
- **根因（最小复刻机械确证）**：Electron 43 下 `protocol.registerSchemesAsPrivileged` 的**第二次调用会清除先前 scheme 的 fetch 等特权**。ADR-0262 批引入的 `registerSanbaoSurfaceScheme()` 是第二次调用，直接把 dsh-app 的 fetch 特权打掉。复刻对照：一次调用＝FETCH-OK；两次调用＝FETCH-ERR。
- **修复**：`sanbao-surface.ts` 改为导出 `SANBAO_SCHEME_REGISTRATION` 描述符，不再自注册；`main/index.ts` 在**唯一一次**调用里同时注册 dsh-app 与 sanbao；探针同步改为单次调用；并新增源扫描守卫 `test/scheme-registration-single-call.spec.ts`（src/main 恰一处调用点＋两个描述符同在）。
- **修复后 live 读数**：`fetch('/.sage/state')` → **status 200**；区域 `matter=fixture`、`draft=locked`、`session=read`、`artifacts=cards`、`link/action-items/matter-admin=read`；截图 `.birdview/evidence/dev-debug-2026-10-05/dev-debug-live-1440.png`（真机窗口：六阶段、澄清卡、动作预览、事实脉络、三枚徽章）。
- **重启循环**：新增 `--no-materialize`（纯界面迭代不必每次重跑 materialize 的 ~2 分钟）。

## Consequences

- 操作面固定四问：**命令**＝`cd apps/sage-shell && pnpm dev:debug`；**在哪运行**＝Sage 仓；**产物/读数在哪**＝dev 根（`…/Sage Dev`）＋`logs/dev-session.log`＋inspector 9229＋CDP 9222；**跑完怎么读**＝日志内 materialize generation 行与 Electron/host 输出、`curl http://127.0.0.1:9222/json/list` 看渲染目标。
- 与发布链无关：不改变 gate、不改生产根、不产生签名/DMG 证据。
- dev 根可整体 `--reset` 重建；后续 A 档装配在同一根上验证。
