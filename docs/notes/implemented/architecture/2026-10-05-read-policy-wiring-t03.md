# T03 读策略接线（选择时读授权与投影读取策略）

- 日期：2026-10-05
- 决策：[ADR-0267](../../../adr/ADR-0267.md)
- 状态：已实施（授权范围内的接线与门禁注册事实扩展）；真实读取路径仍需登录会话与实例策略文件，属后续票前置。未提交、未推送。

## Problem

`/.sage/state` 等 13 条 read-only 路由在 T01/T02 后仍恒停 read-policy 阶段：`index.ts` 两个授权端口被钉死 `() => undefined`，且该钉死是 route-authority 门禁登记的生产护栏事实。T03 的策略模块、桌面消费与接入入口已备好，接线本身需要门禁注册事实变更的单独授权。

## Decision

1. `index.ts` 组装唯一 memoised `readPolicyFor()`（账本跨请求存活），两个钉点接为 policy 调用（ADR-0267 D1）。
2. 门禁 `projectionReadOwnerMatches` 由 unavailable-first 钉死事实改述为接线事实：policy 导入、`let readPolicy: ProjectionReadPolicy | null = null` 单例、`authorizeMatterRead/authorizeProjectionRead` 两条接线语句、旧钉死与每请求重建负向针；成功 note 与矩阵 `runtimeLevel`（state、context/select）同步改述（D3）。
3. 自测新增 4 条具名突变：unwire projection / unwire matter / drop import（指向不存在的模块）/ per-request rebuild 语义轮换——每条必须触发 `production read-policy wiring drifted` 具名失败（D4）。
4. 其余面不动：collection/opaque-object 读取、写面、local-system 面均保持既有 unavailable/denied 语义（D5）。

## Alternatives considered

- 保持钉死不接：读策略是 T04/T05/T06 的前置，接线与登录解耦可各自验收（ADR 备选表）。
- 每请求重建策略对象：绑定账本随对象销毁，选择与读取永远对不上——已列为门禁负向针。

## Consequences

- 接线后无法登录会话时对外表现不变（state 仍 `projection-read-unavailable`，现由 initial-context（无会话）先拒）；有会话+策略+绑定时 read-only 面可走到真实读取。
- 门禁持续以源码事实锁住接线形态；新的每请求重建或回退钉死都会具名红。
- T04/T05/T06 与登录链路仍按各自票据验收，本接线不宣称成功聊天链。

## Verification

证据：门禁自测 `node --test scripts/gates/sage-route-authority.test.mjs` 32/32（含新 T03 用例 4 突变具名红）；`pnpm run gate` 27/27（objects 85/85）；`apps/sage-shell` typecheck 0；全量套件 193 文件全部通过（读数见回报）；实机探针（隔离根、无登录）确认 state 读仍诚实 unavailable、writes=0、0 异常，证据目录 `.birdview/evidence/sanbao-desktop-t03-2026-10-05/`。
