# Sweep 消费规则裁定落地（Q1–Q4）：维度正交、成例入批、P13 收缩

- 日期：2026-10-11
- 决策：[ADR-0315](../../../adr/ADR-0315.md)
- 状态：已实施（消费规则入档；无矩阵/数据变更——本裁定不产生数据面改动）。

## Problem

pending-sweep 警示 1/2/3 把「assemblable（壳装配）」与 route `currentAuthority`（权威维度）两个正交维度并置成句，产生三处表面张力：O04「判 assemblable 却 route violation」；P15/S09「同骑一只机器却分类矛盾」；P13「矩阵 violation vs ADR-0310 已取证」。C 线盘点证实仓内无事实冲突：O04 bypass 属实、P15/S09 两行逐字段同构（「S09 口径」无锚）、ADR-0310 从未声明 adopt compliant 且只消费 adopt。裁定材料见落定前的 C 线备忘（本地 drafts，未入仓）。

## Decision

1. **D1 通用口径**：assemblable 只指壳可装配；route `currentAuthority` 是权威维度的唯一事实家；admission 收口一律独立成批；壳批不改变 violation 计数。
2. **D2（Q1）**：O04/P15/S09 入批照 ADR-0313 成例——纯壳迁移、appsvc 保持 blocked、blocker 照 S03 四要素样板、矩阵一字不动、admission 收口具名独立批。
3. **D3（Q2）**：P13 裁「正交」——矩阵管 route 权威维度、ADR-0310 管装配维度；adopt/mutate violation 原样保留至 workspace admission 独立批；澄清：ADR-0310 只消费 adopt（mutate 消费方是 T03 旧工作区列表）。
4. **D4（Q3）**：P13 归档确认叶/远端工作区叶仓内无机器——从 P13 伞的 assemblable 声明剔除；编辑叶先补 WorkspaceEditorDialog 字段级观察再定。
5. **D5**：sweep 警示 1/2/3 原文保留；引用时按 D1 改写读法；sweep 记录加注记链接（单向，一份事实一个家）。

## Alternatives considered

见 [ADR-0315](../../../adr/ADR-0315.md) 备选表（批内收口、改写 compliant、认定假绿、先立 route 设计批、不落通用口径——逐条否决/推迟）。

## Consequences

- 16 条 bypass 家族后续入批有可引用口径；O04/P15/S09 批形状定型；P13 批范围收缩（扩叶前置具名）。
- 矩阵与 route-authority-matrix 零改动；门禁计数不动。

## Verification

真实运行（2026-10-11）：docs 链接门禁 + ADR 索引/账本在提交内复算（`node scripts/gates/adr-agent-records.mjs --write` + `pnpm run gate` 退出码见提交记录）。
