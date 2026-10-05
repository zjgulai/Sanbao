# Sanbao-in-Sage 可见承载：dev 打开承载窗＋Sage 内 206 路由真机爬检（ADR-0264）

> 历史承载实验，不是默认主界面或业务接通验收；默认启动方式已由 [ADR-0265](../../../adr/ADR-0265.md) 替代，现行实现与范围见 [T01 记录](2026-10-05-sanbao-default-desktop-t01.md)。

## Problem

206 页接线此前完成 L1（sanbao_ui 原型侧 206/206 桥接＋部署）与 L2（Sage 承载面 `sage-sanbao://`＋
13 方法壳桥，ADR-0262 探针全绿），但 `createSanbaoSurface` 在产品路径零调用——运行中的 Sage 从不
打开承载面（ADR-0262 登记的未接线项），用户在应用里看不到任何一页。用户 2026-10-05 当面点名：
「这206个页面你确认你都集成装配到当前的 Sage 上了，为什么我看见基本都没有做，连主页面的 AI 对话框
我都没有看见」——L3（Sage 内可见可检）必须闭合，且验收口径须按层区分。

## Decision

见 [ADR-0264](../../../adr/ADR-0264.md)（D1–D5）：`SAGE_SANBAO_SURFACE=1`（dev:debug 默认注入）
时 main 在 ready、主窗加载后打开独立承载窗并 `load()`；honest 桥（不注入 facts，未提供能力如实
标注、fixture 文案保留）；失败不致命；root 解析唯一家迁入 `src/main/sanbao-surface-root.ts`；
`--no-sanbao` / `--sanbao-root` 可覆盖；生产默认零变化。

## Alternatives considered

| 方案 | 结论 |
| --- | --- |
| 维持只留能力（不打开） | 否决：不可见不可检，用户已点名。 |
| 生产默认打开 | 否决：窗口归属/时机/资产打包未决策（决策包 P0/P1 输入）。 |
| 注入 fixture facts 让页面「全亮」 | 否决：违反 honest 纪律（fixture 冒充成功）。 |
| env 门控 dev 打开＋honest 桥（采纳） | 最小面接通 ADR-0262 登记的产品接线；生产零变化；失败不阻启动。 |

（完整取舍见 ADR-0264。）

## Consequences

- dev 一键可见：`cd apps/sage-shell && pnpm dev:debug`（默认开）→ Sage 内出现承载窗；`--no-sanbao` 关、
  `--sanbao-root` 指定产物根。
- Sage 内逐 state 验收工具落地：`apps/sage-shell/scripts/crawl-sanbao-in-sage.mjs`（CDP 驱动承载窗；
  只读、逐条读数落 CSV/summary；清单缺失/空选择/仪器错误显式拒跑）。
- 生产打开形态、FramePolicy、写路径、资产打包仍归各自批次（tickets T3/T4 登记）。
- root 解析从 test support 收敛到 `src/main` 唯一家；探针与 spec 引用同一实现（旧薄层已删）。

## 读数（2026-10-05，全部本机实测）

- **承载窗**（dev 启动）：CDP target `sage-sanbao://app/index.html?state=QDR.P01.home.workspace`
  （title「SanBao · 完整原型目录」）；应用日志 `sage shell: sanbao 承载面已打开（root source=dist）`。
- **DOM 事实**：`data-sanbao-wiring=live`；`.home-composer textarea` 在场（首页 AI 输入框）；send 按钮
  在场；`window.__SANBAO_HOST__` present、protocolVersion 1；workspace 摘要＝fixture 文案
  （「SanBao 本地演示…未连接业务系统」）＋「不创建经营事项或外部记录」——honest 语义未被冒充替换。
- **Sage 内 206 路由爬检**：**206/206 挂载、0 fail、console 错误 state 0 个、43.2s、exit 0**
  （`crawl-summary.json`；逐行读数 `crawl-results.csv`，行样例：`QDR.P01.home.workspace,live,…,58ms`）。
- **无 env 复核**：`--no-sanbao` 启动 target 仅 dsh-app＋DevTools、无 sage-sanbao
  （`targets-nosanbao.json`＋`dev-nosanbao.log`）。
- **测试与门禁**：`sanbao-surface-root` spec 6/6（新）；`sanbao-surface-window` 真实 Electron 探针
  3/3（live/honest/负控）；`pnpm run gate` 27/27（quick，objects 84/84、skipped=0、failed=0）。
- **截图**：`sanbao-in-sage-live.png`（已回看：左侧 206/206 页目录导航＋首页 AI 输入框＋honest 工作区标注）。

## 边界

dev 数据根隔离；零凭据；零真实业务调用（壳桥 honest，未提供能力如实标注）；不动 parked 批次；
本地提交不推送。

## 证据索引

`.birdview/evidence/sanbao-in-sage-2026-10-05/`：`targets.json`、`dom-facts.json`、
`sanbao-in-sage-live.png`、`crawl-results.csv`、`crawl-summary.json`、`targets-nosanbao.json`、
`dev-nosanbao.log`。
