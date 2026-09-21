# DA-15 · Jev 语义层剩余口子复核（对账 CHANGELOG 与既有记录）

- 优先级：P1
- 状态：`done`（2026-09-21 结算，随本批提交入库）
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

## 结算（2026-09-21）

- 三项 jev 读数（本批 gate 运行）：`jev-tier15-freshness` ok（5/5：corpus 292 / 样本 9 / model=jev-1.13.0，零 API 调用）、
  `jev-egress-boundary` ok（6/6 探针）；两者 selftest 均 ok——全绿且非空射程。
- **key 可读性对账结论：已闭（以「有据的接受」收口，非消除）**——2026-09-20 Keychain 重判实测
  （默认形态 rc=0 零收益、收紧 ACL rc=128 变人在环）拍板接受现状，前置条件写进 ADR-0138 后果 2
  （无人值守自动化前必须先上收紧 ACL）。记忆正文已记录收口，但 MEMORY.md 索引行仍写着「剩出网门禁与 key 可读性两条口子」——该快照已过期，本轮订正。
- 残余登记处建立：`scripts/gates/jev.residuals.json`（5 条：accepted 3 / open 2）+ 新判据 `gate:jev-residuals`
  （accepted 必须有 decisionDoc、open 必须有 nextAction；恒真桩突变下 5/9 用例红）——ADR-0138 后果 2-5 的机器面自此一个家。
- 边界如实：`tracked-not-clean`（文件被跟踪 ≠ 内容清白）是 accepted 的已知边界，不在自动化上过度承诺。
