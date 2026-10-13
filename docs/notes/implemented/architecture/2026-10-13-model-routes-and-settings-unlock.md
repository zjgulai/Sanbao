---
title: 模型编辑器真校验/保存——settings 栈解锁、保存路由与已配置列表（ADR-0339）
doc_type: architecture
module: sage-shell
topic: model-routes-and-settings-unlock
status: stable
created: 2026-10-13
updated: 2026-10-13
owner: self
source: ai
---

# 模型编辑器真校验/保存（ADR-0339）

## Problem

ADR-0333 具名后续：模型编辑器「真校验/保存 → 已配置列表」。审计确认 settings 栈**自接线起恒关闭**（`!ctx.get('profileContext')` 门，Sage 启动器不提供）——`modelConfig` 恒 `bridge-refused`，基座完整能力（llm-pi-ai 手写路由、settings 路径写、`discoverModels` 端点探询）全部不可达。设计票 017/018 的蓝图与 ADR-0249 时代的全部真机坑位（组合等式、收据封印、update/unset 语义）在仓内可考。

## Decision

按 [ADR-0339](../../../adr/ADR-0339.md) 六项决策实施：profileContext 供给 + 构造性组合等式（D1）；路径写 + 封闭语法（D2）；只测已保存路由的 `discoverModels` 探询（D3）；测试记录绑 revision+凭据快照、端口 main 生命期单例、每路由单飞（D4）；两步保存 + 行内测试/删除 + 端点派生命名（D5）；value 优先读取口径（D6）。

## Alternatives considered

见 ADR-0339 备选表（代内 patchPath、update 整段 merge、渲染端传 baseURL、真实补全调用、直读 user 层——逐条实测/结构否决）。

两票实测否决最有价值：**代内 patchPath** 会被收据封印判死下代（fail closed 已实测语义）；**直读 user 层**在 Sage 布局下恒空——探针实证 `valueProviders` 有路由而 `userProviders:null`。

## Consequences

- 闭环：录入→（配置+凭据两步）保存→「已保存、未测试」→显式测试→绑定结果；重启持久（测试记录随进程，登记边界）。
- 路由 64 行、bypass 18/direct 12；桥 44 行；消费登记 +llm；gates/pin 全套同步。
- 实测三修（真机暴露）：value 口径、端口单例（per-request 构造让记录蒸发）、pin 随单例。
- 后续：018 未闭项（unset UX、pi-ai 段表单、baseURL 回填）；019 事项级改选；DeepSeek 默认表单写入面。

## Verification

真实运行（2026-10-13）：

- 全套件 2175 通过（242 文件，1 skip）；`pnpm run gate`/`gate:full` 32/32。
- 新 spec：`model-config.spec.ts` 11 例（端口身份门/列表结合/保存删除载荷/单飞/降级/语法 17 非法体/405/415/unavailable 默认）；`desktop-settings-model-routes.spec.tsx` 8 例（列表绑定/两步保存与派生名/部分失败具名/冲突不写凭据/显式测试/删除/草稿脏确认/派生单元）；host +6 例（保存/语法/移除/已保存路由测试/裁决命名/允许集扩展）。
- **真机闭环**（staging Sage.app + cred-proof 根，无 env 依赖）：登录 → `save-route`（settings 文档 `<root>/cordis.settings.patch.yml` 由基座 config-editor 亲手写入）→ 重启 → list 回读路由与凭据已设置 → `test-connection` **真实 200**（api.deepseek.com、147–189ms、`deepseek-flash`/`deepseek-v4-pro`）→ list 绑定 `current:true` → UI 行逐字核对（路由名 · OpenAI Compatible · Chat Completions API · 端点 · 模型 1 个 · 凭据 已设置 · 测试通过 · 189ms · api.deepseek.com）。
- v17 DMG 验收记录另见 packaging note（若随批出包）。
