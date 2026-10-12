---
title: Host 运行时失效过滤——会话首发不再打死桥
doc_type: architecture
module: sage-shell
topic: host-invalidation-filter
status: stable
created: 2026-10-12
updated: 2026-10-12
owner: self
source: human+ai
---

# Host 运行时失效过滤

## Problem

v8 装机发送实测暴露第三个生产从未走通的接缝：首个实例 dispatch 后 `attempt-dispatch-unknown`；此后**每个**实例 select+send 后桥整体死亡（折叠/读全部 `bridge-host-not-ready`），Host 进程活着、stderr 空。

探针链（装版 + 逐层）：

1. `[bridge-guard] {kind:'unavailable', connected:true, terminal:true}`——shell 判定失效，非崩溃；
2. `[host-invalidate] invalidated` 栈 → `handleMessage` 的 `'runtime-invalidated'` 分支——Host 主动上报；
3. Host 侧监听 `hostCtx.on('internal/status', ...)` 无过滤：cordis 对**每个 fiber 的每次迁移**发事件（含懒激活 0→1→2）；ready 后 arm，任何迁移即失效。会话首发懒加载 prompt 栈 → 首发打死桥 → dispatch 回执随桥丢失 → outcome-unknown。

既有生命期 spec 的意图可见：dispose 后失效一次；但无过滤把「正常激活」也当失效。

## Decision

见 ADR-0327。要点：监听器只对 `FAILED(3)/DISPOSED(4)/UNLOADING(5)` 失效；实测迁移序列（boot/懒激活 0→1→2；teardown 2→5）经临时 debug 日志获取；门禁新增 `hostEntryText` pin + 突变；dispose 场景既有 spec 不改判据仍通过。

## Alternatives considered

- shell 侧忽略 runtime-invalidated：拆证据链；否决。
- 插件白名单：名单腐烂；否决。
- dispatch 期间豁免：窗口是症状；否决。

## Consequences

- 首发不再打死桥；回执可完整返回（outcome-unknown 诱因解除其一）。
- dispose/失败仍失效一次（幂等守卫）。
- e2e 验证 = v9 装机发送实测。

## 证据

- `[bridge-guard] {"kind":"unavailable","connected":true,"terminal":true}`；
- `[host-invalidate] invalidated` 栈到 `handleMessage`；
- 临时日志实测迁移：`1←0`、`2←1`（boot）、`5←2`（teardown）。
