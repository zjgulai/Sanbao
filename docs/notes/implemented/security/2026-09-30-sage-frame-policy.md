# Sage privileged renderer 帧禁用防御层落地

- 日期：2026-09-30
- 状态：revision 41 已实现（当前工作树，未提交）
- 决策：[ADR-0178](../../../adr/ADR-0178.md)
- 相关：[ADR-0177](../../../adr/ADR-0177.md)、[WT-02D Application Service 边界](../../proposed/architecture/2026-09-30-application-service-boundary.md)

## Problem

ADR-0177 的 single-frame preflight（revision 40）证明帧禁用不变量在 test-only probe 内成立，但按其第 5 条，production 采纳必须另票决定。本票（revision 41）在用户逐项拍板后执行骨架采纳：不变量落进 production shell，但**不引入 preload / IPC bridge**——bridge 仍属 WT-02D.0.1 后续票。

本票要回答的问题是：production Sage shell 在真实窗口、真实自有文档与 strict CSP 下，能否由 main-owned frame 观察与 document generation 污染状态机执行同一不变量，同时保持现有文档功能（inline script / style、same-origin fetch）不受损。

## Decision

用户确认四项：采纳帧禁用不变量为 production 合同；骨架票射程（防御层先落地、无 bridge）；strict CSP 随票下发；未来嵌内容场景定为合同（独立非特权 WebContentsView，实现后置）。

实现组成：

- `apps/sage-shell/src/main/frame-policy.ts`：纯状态机（零 Electron import，Node 侧可单测）。main-owned navigation intent 是唯一能提交 clean generation 的导航；非 main frame 的 `frame-created` / 导航各阶段、webview attach 尝试都会污染当前 generation；child 移除与 same-document navigation 不洗白；`did-frame-navigate` 提交时按「本导航窗口内是否见过 child + 现场 frame tree 是否单帧」判定 clean，污染理由汇总为 `non-main-frame-created` 或 `live-frame-tree-not-single`；`did-fail-load`、`render-process-gone`、`destroyed` 失效当前信任。`isTrustedGeneration()` 是未来 privileged IPC 入口必须检查的事实。
- `apps/sage-shell/src/main/window.ts`：唯一 privileged 窗口工厂。显式 `webviewTag: false`、`nodeIntegrationInSubFrames: false`（不再依赖默认值）；保留 window-open deny 与 `will-navigate` scheme 栅栏；`attachFramePolicy` 把 `frame-created` / `did-start-navigation` / `will-frame-navigate` / `did-frame-navigate` / `will-attach-webview` / `did-fail-load` / `render-process-gone` / `destroyed` 喂给状态机，并对非 main 导航与 unowned 顶层导航 `preventDefault`。`loadTrustedUrl` 是唯一的受信导航入口（intent + loadURL）。
- `apps/sage-shell/src/main/index.ts`：改用窗口工厂与 `loadTrustedUrl`；污染事件经 `onContamination` 写 stdout，作为可观测 tripwire。
- `apps/sage-shell/src/product/contracts.ts` + `src/host/assets.ts`：`SAGE_DOCUMENT_CSP` 常量并作为响应头下发：`default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self'; frame-src 'none'; child-src 'none'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`。CSP 是并积层，不是不变量的替代。

真实读数（Electron 43.3.0 / Chromium 150.0.7871.212，真实窗口 + 真实 asset handler + 真实文档）：

| 场景 | 读数 |
| --- | --- |
| initial main-owned load | generation 1 clean、trusted、零污染事件 |
| 文档功能 under CSP | inline script 运行（overview 面板可见）、inline style 生效（body 背景 `rgb(17, 26, 24)`）、same-origin fetch 得 404（`connect-src 'self'` 允许，`/.sage/state` 在 probe 中无 host 属预期） |
| iframe 注入 | CSP 以 `frame-src` violation 拦截加载（stderr `ERR_BLOCKED_BY_CSP`），但 `frame-created` tripwire 仍触发 → generation 1 污染、trusted 失效 |
| child 移除后 | 污染粘滞（`ready=false`） |
| `window.open` / `<webview>` | open 返回 null（deny handler 计数 +1）；webview 无 `getWebContentsId`（inert） |
| renderer 发起顶层导航 | `will-frame-navigate` `preventDefault` 真实生效：URL 保持 `dsh-app://app/index.html`，generation 记 `unowned-top-navigation` 污染——这是 revision 40 probe 未实测过的点 |
| clean main-owned reload | generation 2 clean、trusted、理由清空 |

验证命令与结果：

```text
pnpm --dir apps/sage-shell test                                    # 41 files / 399 tests passed
pnpm --dir apps/sage-shell typecheck                               # exit 0
pnpm run gate                                                      # 23/23
```

新增测试：`test/frame-policy.spec.ts`（12 例纯状态机）、`test/assets.spec.ts` 扩展 CSP 断言、`test/sage-frame-policy-window.spec.ts`（先 `tsc --build` 再 spawn 独立 Electron 跑 `test/support/sage-frame-policy-window-probe.mjs`，对编译后 `lib/` 的 production 代码取证）。负控变异（`contaminate()` 不再置 `contaminated/ready`）下 raw probe 转非 pass、外层 spec 红；恢复后回绿。

## Alternatives considered

- CSP `frame-src 'none'` 单独承担：真实读数证明被拦加载的 iframe 仍产生 `frame-created`，且 CSP 无法覆盖 child 移除后重嵌入、`about:blank` 等路径，只能作并积层。
- 只在 entry / barrier 即时检查 frame tree：removed-child 读数证明移除后 tree-only 检查重新放行，必须 sticky generation。
- 本票直接引入 preload / IPC bridge：超射程；ADR-0174 的 production composition 仍缺多项真实 authority，bridge 属 WT-02D.0.1 后续票。
- 把状态机放进 `main/index.ts` 内联：无法 Node 侧单测、无法被真实窗口 probe 复用，独立模块更可验证。
- window-open deny / scheme 栅栏之外再加 `WebContentsView` 嵌内容通道：本票只定合同（ADR-0178），实现后置到具体 UI 票。

## Consequences

- 帧禁用不变量从「preflight 候选」升级为 production shell 的执行中合同；任何 privileged 窗口只能经 `createSageWindow` 创建，绕开即无策略保护。
- 已证明的是窗口/文档/CSP/状态机行为；未证明 preload / IPC bridge（不存在）、Application Service、Host narrow port、真实 adapter cancel / receipt 与真实身份授权，WT-02D.0.1 的 route 迁移仍 blocked。
- 未来嵌内容（HTML 预览、外部页面）必须走独立非特权 WebContentsView（独立 session、无 preload、无 privileged IPC），按 ADR-0178 合同执行。
- 污染后的恢复语义是「main-owned clean reload」；产品 UI 若引入 SPA 路由，须保持该语义（same-document 不洗白），SPA entitlement 治理仍在后续票。
- 本批未提交、未推送；production `src/**` 改动为 `main/frame-policy.ts`（新增）、`main/window.ts`（新增）、`main/index.ts`（改用工厂）、`product/contracts.ts`（CSP 常量）、`host/assets.ts`（CSP header）。
