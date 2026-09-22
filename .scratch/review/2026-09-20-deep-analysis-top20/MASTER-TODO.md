# Master TODO · 深度分析 TOP20

## 1. 执行原则

- 排序按「**可证明的风险关闭**」：P0 = 文档自认「尚未落地」的机制债（关闭成本低、复发成本高）；P1 = 结构与在飞工作；P2 = 保鲜与纪律。
- P0 不得以「新增豁免 / 放宽阈值 / 隐藏 skip」换取表面变绿（P-02 与 ADR-0014 的直接约束）。
- 每条验收必须是**命令 + 原始输出**；仪器类改动必须做恒真桩突变（红不了就是没测）。
- 并发提醒：本仓多会话同写一棵树（P-43）——动手前先归因 gate 红，提交只取自己 hunks。
- 估算口径：S ≈ 半天内；M ≈ 1–2 天；L ≈ 3–5 天。

## 2. P0 · 机制债收口（6 项，建议下一窗口整体做掉）

| ID | 事项 | 机制缺口（来源） | 估算 | 依赖 | 状态 |
| --- | --- | --- | --- | --- | --- |
| [DA-01](tasks/DA-01-gate-aggregate-tri-state.md) | gate.mjs 聚合层三态收口（skip 显式渲染 + `--strict`） | P-17「两处尚未落地」 | M | 无 | `done`（09-21） |
| [DA-02](tasks/DA-02-permission-bit-gate.md) | 权限位判据：000 文件不得进提交 | P-45「尚无——约定，无强制」 | S | 无 | `done`（09-21） |
| [DA-03](tasks/DA-03-intake-placeholders.md) | 入库面占位化收口（写入者直写占位符或加判据） | P-48「入库面占位化仍是流程」 | M | 无 | `done`（09-21） |
| [DA-04](tasks/DA-04-cleanup-commitment-first.md) | 清场清单「先查承诺」序机制化 | P-49「第一步只有纪律」 | M | 无 | `done`（09-21） |
| [DA-05](tasks/DA-05-architecture-base-facts.md) | architecture.md §1 基座事实节更新（已核实落后一次迁移） | 本次实测（pin v2.0.10 vs 文档 2.0.5/rc.1） | S | 与 DA-12 同批 | `done`（09-21） |
| [DA-06](tasks/DA-06-observer-singleton-probe.md) | observer 乒乓最小探针：单例计数进可执行判据 | P-52「缺口不是成绩」 | M | 无 | `local-done`（09-21 补读：探针换面 + window-hidden 闸门已落；绿读数待窗口可见） |

## 3. P1 · 结构热点与在飞工作（10 项）

| ID | 事项 | 证据 | 估算 | 状态 |
| --- | --- | --- | --- | --- |
| [DA-07](tasks/DA-07-source-hotspot-split.md) | 源码热点拆分（ResearchView.tsx / wanzh lib/index.js 等） | 图谱：39 函数/552 调用边；31 函数纯 JS 源 | L | `in-progress`（09-22：ResearchView 首片已推；Wanzh 列表组装已抽离并独立复验，运行副本双同步 6/6 哈希相符；新 spec 已接进门禁并做反向突变；未验实机，待提交） |
| [DA-08](tasks/DA-08-test-depth-plan.md) | 测试纵深计划：四包最低测试面与默认套件可达性 | 图谱零边不代表零测试，见工单无语料反证 | L | `done`（09-22：修复已合入并推送，主树 LoopX 默认套件复验 11/11） |
| [DA-09](tasks/DA-09-mgt-ship-prerequisites.md) | MGT 管理层出货前置推进（或复核边界并记录） | ADR-0129 / architecture.md §3 | M | `done`（09-21） |
| [DA-10](tasks/DA-10-auto-update-first-steps.md) | 自动更新路线第一步（不白做的两步） | docs/plans/2026-09-13-auto-update-route.md | M | `local-done`（09-21：①feed 管道 `ff4d721` + ②骨架 `bf7438a`；Developer ID 决策＝暂不采购，③–⑦ 挂起） |
| [DA-11](tasks/DA-11-x64-universal-gap.md) | x64 / universal 构建缺口补齐（或记录单架构决策） | 2.5.0 CHANGELOG「登记下轮」 | M | `done`（09-21） |
| [DA-12](tasks/DA-12-production-machine-baseline.md) | 生产机基座现状核对并落记录 | architecture.md §1（2026-09-10 观察，未核实） | S | `done`（09-21） |
| [DA-13](tasks/DA-13-scratch-cleanup.md) | .scratch 42 个工作流清场（按 DA-04 顺序） | historical-artifacts 层 205 节点 | L | 依赖 DA-04 |
| [DA-14](tasks/DA-14-agt-shared-source-guard.md) | AGT 共享源改动 → 50 全量重生成护栏 | research/16 §3.6（目前是阅读纪律） | M | `done`（09-21） |
| [DA-15](tasks/DA-15-jev-remaining-gaps.md) | Jev 语义层剩余口子复核 | CHANGELOG Unreleased vs 项目记忆对账 | S | `done`（09-21） |
| [DA-21](tasks/DA-21-newapp-degrade-false-positive.md) | newapp 降级文案误归因 + 陈旧标志（窗口不可见被读成「侧边栏改版」） | DA-06 补读轮活体现场（2026-09-21） | S | `local-done`（09-21，`09f1c08`；实机读数与 DA-06 同批待窗口可见） |

## 4. P2 · 保鲜与纪律（5 项）

| ID | 事项 | 证据 | 估算 | 状态 |
| --- | --- | --- | --- | --- |
| [DA-16](tasks/DA-16-graph-freshness.md) | 图谱保鲜：排除 TS 包 lib/ + 发布窗口后例行增量重跑 | 本次实测：lib 构建产物双计入图 | S | `open` |
| [DA-17](tasks/DA-17-baseline-checkups.md) | 基线类清单例行体检（theme-tokens / dead-instruments / exemptions） | 只减不增需有人推着清 | S | `done`（09-21：主题基线 6、豁免 0、死仪器 5；五项检查通过，后续窗口仍例行） |
| [DA-18](tasks/DA-18-rollback-baseline.md) | 双基座回滚基线显式维护 | pin 注释：0.1.2-rc.1 仅回滚对照 | S | `open` |
| [DA-19](tasks/DA-19-docs-link.md) | 本报告入 docs 索引，避免死指针 | P-09 | S | `done`（本收尾已执行） |
| [DA-20](tasks/DA-20-ticket-conversion.md) | TOP20 工单化并纳入固定跟踪 | P-03 | S | `done`（本目录即产出） |

## 5. 依赖与批次

```text
批次 A（机制债，可并行）：DA-01  DA-02  DA-03  DA-04  DA-06
批次 B（文档与现状核对）：DA-05 + DA-12（同批）  DA-15
批次 C（结构，与在飞工作重叠）：DA-07  DA-08  DA-09  DA-10  DA-11  DA-14
批次 D（清场，依赖 A 的 DA-04）：DA-13
批次 E（用户 09-21 拍板）：DA-10（①feed 管道 + ②更新器骨架）  DA-21（降级标志「挂起 ≠ 失败」）
例行（每发布窗口）：DA-16  DA-17  DA-18
```

**批次 E 结算（2026-09-21）**：DA-10 两步落地（`ff4d721` ①feed 契约 ADR-0151 / `bf7438a` ②骨架
ADR-0152；Developer ID **暂不采购**——更新器停在「检查 + 提示」）+ DA-21（`09f1c08`，ADR-0153）。
欠读数（与 DA-06 同批，需 app 带 CDP 重启且屏幕可见）：`singleton-count-live` 的 `entry-newapp=1`、
唤醒后 `data-dsh-newapp-degraded` 缺席、更新器在 app 内实际装载。

**集成与验收收口（2026-09-22）**：`1734914` 至 `4788320` 的 7 个已批准提交已推送至 Sanbao/main。
主树完整门禁与并发见证已复验，仍有明示的未覆盖面；新远端 CI 的逐项对比与实机缺口统一见
[DA-10 §8](tasks/DA-10-auto-update-first-steps.md)。Laya 的本地建议型入口未包含在这次推送中。
回滚材料的只读哈希核验已补至 [DA-18](tasks/DA-18-rollback-baseline.md)，不等同于恢复演练完成。

**DA-07 第二片收尾与本机环境处置（2026-09-22，第二窗口）**：本轮不沿用上轮结论，逐项独立重跑——
wanzh 包内 100/100、typecheck 无输出、`npm pack` 11 个文件含新模块、三处副本 6/6 哈希相符、
`sync-profile --check --loadpoint` exit 0。发现并关闭一处**门禁可达性缺口**：本片新增的
`test/list-response.spec.mjs` 原先不在任何判据射程内；经用户拍板接进 `wanzh-persistence-and-oauth`
（第 7 个 spec），并以反向突变证明接线承重（旧 6 个 spec 对同一突变 59 pass / 0 fail，接入后具名用例变红）。
全仓可达性基线读数（42 个包级 spec / 门禁点名 10）留档在 [DA-08](tasks/DA-08-test-depth-plan.md)。
机器侧：09-21 遗留的 5 棵孤儿 vitest（41 个进程）经用户批准清除，load 10.04 → 4.59；
`Notes.app` 100% / `kavd` 45% 仍在，故**不宣称环境已干净**——读数与边界见 [DA-10 §7](tasks/DA-10-auto-update-first-steps.md)。
本节主体**先于**门禁复跑落盘、跑期间不写工作树，因此该轮 `gate:full` 取证的树包含它；
只有末尾「推送」一段是复跑**之后**补写的 doc-only 内容，不追加进那次取证的射程声明。

**推送（2026-09-22 第二窗口，三个提交）**：`d181002` 抽离本体（wanzh + Note + ADR-0099）、
`03d2a3f` 门禁接线（第 7 个 spec + 反向突变）、`889c49c` 本节（工单结算）。
推送 `4788320..889c49c` 至 Sanbao/main，远端 SHA 回读一致
（`889c49ce1e9967acbcdfd94ef76b5c9a565507f0`），新 CI run `35683510320` 已触发。
Laya 的本地建议型入口与并发会话的未提交文件均不在该推送内。
**本段为门禁复跑之后补写的 doc-only 内容**，不追加进上述门禁取证的射程声明。

## 6. 结算

- 每单完成后：状态置 `done` → 随提交入库后置 `done`，并在本表登记结算日期。
- 涉及判据的（DA-01/02/03/04/06/14）必须同步：门禁注册 + 反向自测 + pitfalls-playbook 对应条目更新。
- 全部 P0 关闭后，重跑一次本报告（`/understand` 增量 + 门禁读数），对照结算率。
