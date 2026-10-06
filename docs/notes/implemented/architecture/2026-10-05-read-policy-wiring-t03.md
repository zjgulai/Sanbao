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

## 追加（2026-10-05 晚）：T03/A 设备聚合读授权（ADR-0268）

用户对 A/B/C 选择 A。`createProjectionReadRunner` 的 candidate-match 放行 `collection:'state'`（candidateRef `collection:state`）；search 与其他 opaque 读维持 unavailable。既有准入链前提不变。门禁新增放行事实（`return candidate.collection === 'state'`，旧全封禁语句不得回）与两条具名突变；`projection-read-production.spec.ts` 护栏由批-4 的「所有 collection 一律 unavailable」拆分为 state 放行（raw 恰一次）与 search 维持封锁两条，取代关系在 ADR-0268 记录。集成 spec 新增 `/state` 放行（activeContext/workspaces/matterLinks 真投影）与 search 维持拒绝两组断言。设备级槽位随该授权对已签入会话可见（A 的已知暴露面，用户已接受）；B 的窄化如需要另开票。

## 追加（2026-10-05 晚）：T03-D 搜索页接线

桌面搜索页消费真实 `/.sage/search`：`src/product/app/desktop/search.ts` 本地守卫（trim 空或超 500 字→`invalid-search-request`，不发请求）、POST 单键 `{query}`、传输码映射（400/403/405/413/415）、响应形状不符→固定 `search-result-unrecognised`（绝不渲染任何命中）；`page.tsx` SearchPage 标题逐字「搜索」、composition 期间 Enter 不提交、refused/unknown 不渲染结果行、重提交先清旧结果。本次未登录实机验证仅证明搜索请求遭拒，未记录具体准入拒绝阶段；不能据此声称请求到达 candidate-match。源码另确认 ADR-0268 仍封锁 `collection:'search'`，因此登录就绪也不足以开放搜索。页面显示不可用提示且无结果行；这不等于真实空命中态已验收。

验证：`test/product-app/desktop-search.spec.tsx` 8/8；聚焦 85/85；全量 195 文件/1780 通过/1 skip；tsc 0；gate 27/27；实机探针（隔离 dev 根，新证据目录 `.birdview/evidence/sanbao-desktop-t03-search-2026-10-05/`）exit 0——搜索阶段恰 1 次 POST `/.sage/search`（唯一写形请求）、拒答文案逐字、0 结果行、0 异常、1440/660/320 无横向回流。矩阵 `QDR.P02.search.empty`→implementing；真实搜索结果/空命中态需登录＋search 对象 resolver，保持未完成。
