---
title: 桥终局契约修正与冷启动后续面——bridge-result 声明契约对象 resolve、组装 scopedOr、走查种子补齐
doc_type: architecture
module: sage-shell
topic: bridge-result-contract
status: stable
created: 2026-10-12
updated: 2026-10-12
owner: self
source: human+ai
---

# 桥终局契约修正与冷启动后续面

## Problem

ADR-0324 修复后装机实测，冷启动链上依次暴露三个后续缺陷：

1. **工作区折叠恒 `unavailable`（`bridge-answer-unrecognised`）**。装版探针：帧正常到达（基线），终局值却是 `{"frames":1}`。`host-process.ts` 的 `bridge-result` 处理器把整包剥成 `message.result` 再 resolve，而全仓 20 个消费者模块（`asAnswer` 家族：折叠、接入、会话通道、附件、产物、检索……）都按整包解析。凡走 bridge 的请求面在此契约下全部不可用——既往走查从未触达。
2. **组装面在无事项 scope 下被刻意防线阻断**。`attachments: () => attachments.snapshot(scopedMatterRef())` 等 15 个 payload 槽在无 ALS scope 时 throw（这是防绕过 runner 的刻意设计）；设备聚合读（ADR-0324）第一次让「无 scope 跑全量组装」成为合法场景 → `read` 阶段 unavailable（装版探针抓到 `projection read scope unavailable` 栈）。
3. **走查环境缺两处事实**：名册行来源于**已转化草案**（matter-list 自 `drafts.list` 派生），base 工作区折叠来源于 **`<root>/harness/storages/workspace.json`**；原生目录选择桥被 overlay 显式禁用（"in-app browsing until its native picker bridge exists"），`directory/pick` 必抛 `bridge-provider-failed`。

## Decision

见 ADR-0325（桥契约）与 ADR-0324（设备聚合读）。本次实施：

1. `host-process.ts`：`ok:true` 时 `pending.resolve({ ok: true, result: message.result })`（声明契约对象 `BridgeAnswer`）；消费者零改动；门禁 pin 该形态存在且 `resolve(message.result)` 不得回。
2. `composition.readState`：`activeContext.state === 'inactive'` 时，15 个 scope 消费槽改用各自的诚实 unavailable 面（`scopedOr`）；其余状态（active / 无端口 fixture）行为逐字节不变。
3. `session-demo-seed.mjs` 扩展：幂等补齐「已转化草案」（转换流水线同形状）与 base 工作区存储条目（`--workspace-path` 可覆盖，默认仓根）；walkthrough 手册第 16 步「系统目录选择弹窗」修正为「尚未接通（native picker bridge 未建）」。

## Alternatives considered

- 散点改 20 个消费者为剥包形态：方向反了（Host 整包才是协议形态），两形态分叉风险；否决。
- 保留 `scopedOr` 兜底 try/catch 包装 provider：会掩盖真实 provider 故障（静默兜底）；否决，改为显式状态判定。
- 实现 native picker bridge：超范围；overlay 显式取舍；否决。

## Consequences

- bridge 请求面契约一致；折叠、接入后续、会话通道、附件、产物、检索等恢复可用（各自既有测试已按整包写，全套件随本批回归）。
- 冷启动走的种子集 = 事项 + 已转化草案 + 工作区条目；「接入工作区」保持设计中的「尚未接通」。
- v7 DMG 承载两项代码修复（composition scopedOr + host-process 整包）；装机重走查。

## 证据

- 装版折叠探针：`[fold-probe-frame] {"type":"baseline",...}` + `[fold-probe-answer] {"frames":1}`。
- 装版接入探针：`[adopt-probe-throw] bridge-provider-failed`。
- 装版组装探针：`[device-read-throw] Error: projection read scope unavailable at scopedMatterRef (index.js:365) → attachments (579) → readState`。
- overlay 首行注释与 `requireCapability('native','pick')` 源码。
