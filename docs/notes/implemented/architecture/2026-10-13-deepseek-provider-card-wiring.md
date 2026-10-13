---
title: 018 收口 A3——观测 DeepSeek 供应商卡的写入面（ADR-0344）
doc_type: architecture
module: sage-shell
topic: deepseek-provider-card-wiring
status: stable
created: 2026-10-13
updated: 2026-10-13
owner: self
source: ai
---

# 018 收口 A3（ADR-0344）

## Problem

018 未闭项「DeepSeek 默认供应商表单写入面」，同时是 tracked 矩阵三行 DeepSeek（add/models.open/type.open）applicationService blocked 的指名 blocker。基线核验（vendor 源码逐条）：默认 provider 路由 `deepseek-official`；目录条目携带 `settingsNs`（`llm-deepseek` 挂载行）与 `settingsPath`（[]）；插件 Config 有可写 `models` 数组；`resolveModelInfo` 公开本地读（含 contextWindow）；**探测缝已退役**（`llm/test-connection` 不在协议表、`discoverModels` 对该路由离线回答=假绿源）。

## Decision

按 [ADR-0344](../../../adr/ADR-0344.md) 四项：桥写 `modelConfig/provider-models`（目录裁定成员资格与 ns/path；`resolveModelInfo` 无损重建完整条目；`mutate set [..settingsPath,'models']`；未知名/未解析条目各自具名拒）；API Key 走既有 `DEEPSEEK_API_KEY` 凭据缝（留空保留）；DeepSeek 卡活清单（懒读、预填当前生效模型、「全选」+逐项）；按钮保留观测标签但 note 明示保存不触发供应商请求。**不发明**：类型菜单保持显示、不新增默认 provider 列表行（提交后形态未观测）。

## Alternatives considered

见 ADR-0344 备选表（discoverModels 假绿 / 重建最小探测（另票）/ 硬编码 ns / 校验通过才保存 / 伪造列表行 / 预填留空——逐条否决或缓）。

## Consequences

- 矩阵三行：ui 与 applicationService → verified；electron/host/visual 保持 pending。
- 018 未闭项剩 D7。
- 深水区登记：类型菜单显示项；购买 Token Plan/获取 API Key 外链未接线。

## Verification

真实运行（2026-10-13）：

- `tsc --noEmit` 干净。
- 本批四文件（host-bridge / model-config 端口+路由 / model-routes 渲染 / r17b 壳）**108 passed**。
- 新增/扩写 spec：host +1（条目重建逐字段断言：ns/path 取自目录、可选字段透传、未知 id/未知 provider/缺 context/空列表四拒）；端口/路由 +2（转发与 receipt 映射、400 边界与去重 200）；渲染 +3（活清单预填与半选保存全链、已配置凭据留空保存、目录不可读/零勾选禁用）；r17b 壳模式断言不动（mount 无 modelRoutes，DeepSeek 只读壳保持）。
- `sage-sanbao-state-matrix.test.mjs` 13/13（三行迁移 + 摘要重算）。
- 全套件 `pnpm test`：**2222 passed（1 skip）**——其中 1 个 fail 为 sage-16 会话在途的 `desktop-experts-window.spec.ts`（其 EP-1 Electron probe，与本批无涉，未触碰）。
- 实机验证（staging）：**未运行**——sage-16 窗口占用；打包机复验（DeepSeek 卡保存→ns models 行出现、凭据写入、发送可用）随窗口后补录。
