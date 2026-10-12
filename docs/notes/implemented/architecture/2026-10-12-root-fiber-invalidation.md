---
title: 运行时失效只听根 fiber——会话级子 fiber 拆除不再打死桥
doc_type: architecture
module: sage-shell
topic: root-fiber-invalidation
status: stable
created: 2026-10-12
updated: 2026-10-12
owner: self
source: human+ai
---

# 运行时失效只听根 fiber

## Problem

v10 装机走查实测：回合（成功或失败）后一段时间，桥再次整体死亡（折叠 `bridge-host-not-ready`，Host 进程活着、无 fatal）。装版探针链：

- `[fold-catch] bridge-host-not-ready`（ADR-0325 契约下折叠答案正常，失败发生在 shell 的 Host 有效性闸）；
- Host 侧唯一失效入口 = `internal/status` 监听；ADR-0327 的 3/4/5 过滤误放行**会话级子 fiber 的正常拆除**：回合/会话收尾时 cordis 拆除 scoped 子 fiber（→4/5）→ 判运行时失效 → 桥死。

这是 ADR-0327 的同类误报第二层：事件覆盖所有 fiber，而语义只属于根（整个已认证组合）。

## Decision

见 ADR-0329：注册时捕获根 fiber（`hostCtx.fiber`），仅根 fiber 的事件参与失效判定；根上仍只认 3/4/5。既有生命期 spec（arm→dispose→恰一次）判据不变。

## Alternatives considered

- 只认 FAILED=3：根拆除是既有 spec 的失效事实；否决。
- fiber.parent 链深度启发：根身份可直接比较；否决。
- shell 侧宽限重试：根因在判据；否决。

## Consequences

- 回合收尾（成败皆然）不再打死桥；连续读面保持可用（v11 实测）。
- 根级异常仍恰一次失效。

## 证据

- `[fold-catch] bridge-host-not-ready`（v10 装版，回合后）；
- ADR-0327 探针史：boot/懒激活 0→1→2、根 teardown 2→5（本 ADR 再收窄为根身份）。
