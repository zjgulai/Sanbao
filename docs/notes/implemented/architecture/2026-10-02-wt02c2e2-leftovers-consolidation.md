# WT-02C.2E.2 遗留合并清点：帧名称面单源化 + 冻结面扩展（③⑤ 处置，①④②⑥⑦⑧ 分诊）

日期：2026-10-02 · 分类：architecture · 关联 ADR：[ADR-0195](../../../adr/ADR-0195.md)

## Problem

会话 7365c577（WT-02C.2E.2，收口于 `7256f4f`/ADR-0191）在其 Note 登记了 ①–⑧ 八项遗留。用户要求对"还未完成的任务"做合并梳理并执行。逐项核对现行状态后，真正可在本批机械收口的只有一项：**③「三个 policy 文档字段级语义与 `runtime.ts`/`protocol.ts` 常量同步靠 golden 与评审守」**——实测发现 E.2 provider 的 `FRAME_KINDS`（`{request: ['start','data','end','cancel'], response: ['start','data','end','error']}`）是 **protocol.ts 的手工副本**：它被发布进 stable `protocolContractDigest`（matrix 规则键的一部分），却只由"golden 冻结当时值 + 评审守"约束——协议侧改名/增减 kind 时 golden 不会跟动（正是「知道没有变成拦住」的形态）。另：`HOST_VERSION = '4.0.0'` 同样是协议版本 4 的手工派生（注释写明"a protocol change must move this with it"）。

## Decision

1. **帧名称表单源化（protocol.ts 导出）**：`SHELL_REQUEST_FRAME_KINDS = ['start','data','end','cancel']`、`SHELL_RESPONSE_FRAME_KINDS = ['start','data','end','error']` 成为唯一事实源；E.2 provider 导入它们构造 policy 文档（`HOST_VERSION` 一并改为 `` `${SHELL_HOST_PROTOCOL_VERSION}.0.0` `` 派生）。goldens 值不变即证明逐字节等价。
2. **冻结面扩展（sage-shell-pin）**：`FROZEN_FRAMING_CONSTANTS` 增至 8 行（新增两枚名称表；文本按空白归一比较）。改值/改名/删除导出都会判红，violation 文案指向 ADR-0192/0195。selftest 增 3 例：改名判红、删除导出一枚判红、空白重排不误报。
3. **遗留合并清点（①–⑧ 处置）**：

| # | 遗留（E.2 Note） | 处置 |
| --- | --- | --- |
| ③ | policy 字段与 protocol.ts/runtime.ts 常量同步 | **本批执行**：帧名称表单源 + 门禁冻结 + HOST_VERSION 派生；launch/overlay 其余字段为语义描述串（无运行时常量可绑），维持 golden+评审守 |
| ⑤ | capability canonical 与 C2D.1 digest 重叠则收敛 | **核查关闭**：无重叠——C2D.1 内核 canonicalize 的是 registry 治理条目/快照（`capability-registry(-entry)` v1 文档），E.2 产出的是 compatibility V2 投影（`urn→sha256` 换形、不重算）；两者是不同文档，收敛复用没有对象 |
| ④ | `preset:set` 复合语义 | 被 ADR-0194 修订覆盖（源包迁 registry、spec §3 更新）；v1 复合身份语义保留，无执行项 |
| ① | 默认 preset 运行时判定 | **阻塞**：需 Host protocol 扩展票（新消息面 + 版本决策 + goldens/matrix 重发），未排期 |
| ② | host/harness 分包 artifact 树粒度 | **待语义裁决**：改的是 stable descriptor 语义（现为安装集委派），定夺后小改 + 重发 matrix |
| ⑥ | health/liveness 增强 | **阻塞**：C2C.4/.5 仅有 kernel（无 I/O 数据），真实 provider 未落地 |
| ⑦ | `runtimeInventory` 消费者 | **移交**：D.2 接线（UI wiring loop 车道，`docs/tickets/LOOP.md`），本票不碰 |
| ⑧ | registrySnapshotDigest 快照变更检测 | **阻塞**：待 C2D.2A registry provider 重发快照 |

4. **活性登记**：执行计划的覆盖修正块追加 Revision 43（C2E 线收口 + C 链前沿更新）；E.2 设计 §4.1 的 frameKinds 表述同步为「protocol.ts 导出表（单一事实源，门禁冻结 + golden 守）」。

## Alternatives considered

| 方案 | 结论 |
| --- | --- |
| 保持 provider 手工副本，仅加测试对照 protocol.ts | 否决；"两处写着同一事实、靠测试比"不如单源导入——测试只能覆盖已写下的变体，副本仍会漂。 |
| 用 TS 类型层断言绑定名称表与帧 union | 否决；类型体操对运行时表无约束力（表与 union 仍可各自漂移），门禁冻结才是真守卫。 |
| 顺带把 launch/overlay policy 的语义描述串也单源化 | 否决；它们描述 runtime.ts 行为而非引用常量（`'harness-home'`/`'dropped'` 等是语义摘要），强行导出会造成"文档词汇污染运行时"；维持 golden + 评审。 |
| 把 ① 直接当本批执行项（起 Host protocol 扩展） | 否决；协议扩展涉及新消息面、版本升级与 matrix 重发，属独立决策票，不在"遗留合并"射程。 |

## Consequences

- **红/绿**：先扩冻表 → 真实门禁 `sage-shell-pin` 判红（`SHELL_REQUEST_FRAME_KINDS = undefined`，协议文件尚无导出）；protocol.ts/provider.ts 落单源后门禁 **25/25**、selftest **24/24**（新增 3 例判红/不误报均在列）。
- **零行为漂移的证据**：provider spec 12/12 中 **13 个 golden 字面量未动即通过**——帧名称表与 HOST_VERSION 的派生改写与旧手工值逐字节等价；全量套件 **613 pass + 1 opt-in skip**、typecheck 0 错。
- **边界**：protocol.ts 只增导出（六枚冻结数值常量与帧 union 未动）；E.2 产出对现行 matrix 键不变（goldens 证）；①②⑥⑦⑧ 的处置均记录在案（上表），不产生任何"已放行"暗示。
- **遗留**：① 建议择机立"Host protocol 扩展"票（含默认 preset 标记与 enablement 求值语义）；② 建议用户裁决粒度语义后再动；⑥⑧ 随 C2C/C2D 真实 provider 到位时重审。
