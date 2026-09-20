# DA-15 · Jev 语义层剩余口子复核（对账 CHANGELOG 与既有记录）

- 优先级：P1
- 状态：`open`
- 依赖：无
- 估算：S
- 来源：CHANGELOG Unreleased（2026-09-19/20 两条）vs 项目记忆；报告 TOP20 #15

## Problem

两份记录需要**对账**（可能有一方过期）：
- CHANGELOG Unreleased 已记录：① Jev Tier 1.5 基线 + `jev-tier15-freshness` 指纹门禁（2026-09-19）；② **出网边界已从纪律变机制**——`jev-egress-boundary` 装载器闸门 + 六项探针（2026-09-20）；残余如实保留：「文件被跟踪 ≠ 内容清白，那一段只能靠人复核」。
- 项目记忆（较早快照）仍写「剩出网门禁与 key 可读性两条口子」。
即：出网门禁似已收口；**key 可读性**（`~/.dsh/.credentials.yaml` refs 四级优先链、只读不写）一条现状待核。

## 动作

1. 核对两条门的现状读数：`pnpm run gate` 中 `jev-tier15-freshness` 与 `jev-egress-boundary`（及其 selftest）是否全绿且非空射程；
2. 核 `LUTE_JEV_API_KEY` 只读链与「key 可读性」残留口子：确认凭据读取失败时的行为（降级/拒绝）与提示文案；
3. 残余项写进 `scripts/gates/jev-tier15.expected.json` 相邻的登记处，并更新本仓记忆。

## 验收

- 三项 jev 门禁全绿且读数含真实 checked 计数（非空射程）；
- key 可读性口子给出明确结论（已闭 or 登记残余 + why）；
- 对账结论落 Note 或本目录，消除「两处记录不一致」。

## 注意

「文件被跟踪 ≠ 内容清白」的人复核段是已知边界，别在自动化上过度承诺。
