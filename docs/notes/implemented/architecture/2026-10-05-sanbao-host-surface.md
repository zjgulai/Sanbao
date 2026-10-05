# Sanbao 承载面：壳侧 __SANBAO_HOST__ 桥（未闭项 1）

- 日期：2026-10-05
- 关联 ADR：[ADR-0262](../../../adr/ADR-0262.md)
- 关联合同：[UI 一致性合同](../../../specs/2026-09-27-sanbao-to-sage-ui-consistency-contract.md)、206 页接线程序总纲（sanbao 仓 `docs/wiring/2026-10-04-206-page-program.md`）

## Problem

206 页接线程序把 sanbao_ui 的全部页面收敛到唯一接缝 `window.__SANBAO_HOST__`（无壳＝fixture 原样、有壳读真事实、缺能力如实 unavailable，账本 206/206 已收口）。但**壳侧无任何实现**：没有主进程会注入该桥，sanbao UI 也从未在 Sage 壳里真实运行过。「未闭项 1：壳侧 adapter」要求把这一半补上，并用真实 Electron 证据证明端到端。

## Decision

1. `src/main/sanbao-surface.ts`：`sage-sanbao://` 特权 scheme（standard+secure+stream，与 `dsh-app` 同处、ready 前注册）＋只读 `protocol.handle`（realpath 双前缀防穿越、405/404）＋独立非持久 partition（sandbox/contextIsolation/禁 window.open/禁出 scheme/单向 webRequest 闸门——照 `preview-window.ts` 安全样板）。
2. `sanbao-host-preload.cts`：sandboxed preload 经 `contextBridge` 暴露 `__SANBAO_HOST__`（13 方法 → `ipcRenderer.invoke('sanbao-host:call')`）；main 侧白名单＋形状校验（未知方法/坏参/异常＝honest unavailable，不含堆栈）。
3. `createSanbaoHostPort(facts)`：镜像 sanbao `runtime/host.ts` 全部方法与类型（不跨仓 import）；**生产默认 facts＝每方法如实 unavailable**；facts 注入供测试/探针。
4. 证据：`test/support/sanbao-surface-probe.mjs`（live/honest/负控，exit 0/2/1）＋`test/sanbao-surface-window.spec.ts`（3 用例）；截图 `.birdview/evidence/sanbao-surface-2026-10-05/`。

## Alternatives considered

- **iframe/webview 入既有 renderer**：否决（特权面、合同禁 iframe）。
- **生产直接加载线上 URL**：本票以本地 root 为默认（_site 同哈希回退）；线上分发留作选项。
- **Host 子进程注入**：否决（Host 是 profile 运行时；注入面必须 main 拥有）。

## Consequences

- live 探针（本票复跑）：桥 13/13、工作区真事实 `sanbao-e2e-workspace`＋「已接线」、会话消息 IPC 往返、路径卫士六向、真资产经 scheme 加载、导航/`window.open` 拦截、设置结构式读数（无值/密钥/路径）；honest 探针：fixture 文案保留＋如实 toast；负控 exit 2 具名红。spec 3/3、gate quick/full 27/27。
- **未接线（登记）**：生产启动创建/打开承载面的产品接线（root 指向与时机、窗口归属）；FramePolicy 合同接入；写路径随各自 authority 批次真接线。
- sanbao 页面的后续真事实扩展＝host.ts 与本端口镜像的加法同步；承载面不启动 Host、不装载 profile、零凭据。
- **后续修正（2026-10-05，dev 环境首跑发现）**：本批的 `registerSanbaoSurfaceScheme()` 是 `registerSchemesAsPrivileged` 的第二次调用，在 Electron 43 下清除了 dsh-app 的 fetch 特权（真实应用全部区域 unavailable）。已改单次调用注册双 scheme＋源扫描守卫；过程与读数见 [本地开发与调试环境 Note](../process/2026-10-05-local-dev-debug-environment.md)「首批战果」。
