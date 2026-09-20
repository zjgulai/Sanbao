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
| [DA-01](tasks/DA-01-gate-aggregate-tri-state.md) | gate.mjs 聚合层三态收口（skip 显式渲染 + `--strict`） | P-17「两处尚未落地」 | M | 无 | `local-done` |
| [DA-02](tasks/DA-02-permission-bit-gate.md) | 权限位判据：000 文件不得进提交 | P-45「尚无——约定，无强制」 | S | 无 | `local-done` |
| [DA-03](tasks/DA-03-intake-placeholders.md) | 入库面占位化收口（写入者直写占位符或加判据） | P-48「入库面占位化仍是流程」 | M | 无 | `local-done` |
| [DA-04](tasks/DA-04-cleanup-commitment-first.md) | 清场清单「先查承诺」序机制化 | P-49「第一步只有纪律」 | M | 无 | `local-done` |
| [DA-05](tasks/DA-05-architecture-base-facts.md) | architecture.md §1 基座事实节更新（已核实落后一次迁移） | 本次实测（pin v2.0.10 vs 文档 2.0.5/rc.1） | S | 与 DA-12 同批 | `local-done` |
| [DA-06](tasks/DA-06-observer-singleton-probe.md) | observer 乒乓最小探针：单例计数进可执行判据 | P-52「缺口不是成绩」 | M | 无 | `local-done` |

## 3. P1 · 结构热点与在飞工作（9 项）

| ID | 事项 | 证据 | 估算 | 状态 |
| --- | --- | --- | --- | --- |
| [DA-07](tasks/DA-07-source-hotspot-split.md) | 源码热点拆分（ResearchView.tsx / wanzh lib/index.js 等） | 图谱：39 函数/552 调用边；31 函数纯 JS 源 | L | `open` |
| [DA-08](tasks/DA-08-test-depth-plan.md) | 测试纵深计划：四个零覆盖边核心包定最低测试面 | 图谱 tested_by 仅 85 边 | L | `open` |
| [DA-09](tasks/DA-09-mgt-ship-prerequisites.md) | MGT 管理层出货前置推进（或复核边界并记录） | ADR-0129 / architecture.md §3 | M | `open` |
| [DA-10](tasks/DA-10-auto-update-first-steps.md) | 自动更新路线第一步（不白做的两步） | docs/plans/2026-09-13-auto-update-route.md | M | `open` |
| [DA-11](tasks/DA-11-x64-universal-gap.md) | x64 / universal 构建缺口补齐（或记录单架构决策） | 2.5.0 CHANGELOG「登记下轮」 | M | `open` |
| [DA-12](tasks/DA-12-production-machine-baseline.md) | 生产机基座现状核对并落记录 | architecture.md §1（2026-09-10 观察，未核实） | S | `local-done` |
| [DA-13](tasks/DA-13-scratch-cleanup.md) | .scratch 42 个工作流清场（按 DA-04 顺序） | historical-artifacts 层 205 节点 | L | 依赖 DA-04 |
| [DA-14](tasks/DA-14-agt-shared-source-guard.md) | AGT 共享源改动 → 50 全量重生成护栏 | research/16 §3.6（目前是阅读纪律） | M | `local-done` |
| [DA-15](tasks/DA-15-jev-remaining-gaps.md) | Jev 语义层剩余口子复核 | CHANGELOG Unreleased vs 项目记忆对账 | S | `local-done` |

## 4. P2 · 保鲜与纪律（5 项）

| ID | 事项 | 证据 | 估算 | 状态 |
| --- | --- | --- | --- | --- |
| [DA-16](tasks/DA-16-graph-freshness.md) | 图谱保鲜：排除 TS 包 lib/ + 发布窗口后例行增量重跑 | 本次实测：lib 构建产物双计入图 | S | `open` |
| [DA-17](tasks/DA-17-baseline-checkups.md) | 基线类清单例行体检（theme-tokens / dead-instruments / exemptions） | 只减不增需有人推着清 | S | `open` |
| [DA-18](tasks/DA-18-rollback-baseline.md) | 双基座回滚基线显式维护 | pin 注释：0.1.2-rc.1 仅回滚对照 | S | `open` |
| [DA-19](tasks/DA-19-docs-link.md) | 本报告入 docs 索引，避免死指针 | P-09 | S | `local-done`（本收尾已执行） |
| [DA-20](tasks/DA-20-ticket-conversion.md) | TOP20 工单化并纳入固定跟踪 | P-03 | S | `local-done`（本目录即产出） |

## 5. 依赖与批次

```text
批次 A（机制债，可并行）：DA-01  DA-02  DA-03  DA-04  DA-06
批次 B（文档与现状核对）：DA-05 + DA-12（同批）  DA-15
批次 C（结构，与在飞工作重叠）：DA-07  DA-08  DA-09  DA-10  DA-11  DA-14
批次 D（清场，依赖 A 的 DA-04）：DA-13
例行（每发布窗口）：DA-16  DA-17  DA-18
```

## 6. 结算

- 每单完成后：状态置 `local-done` → 随提交入库后置 `done`，并在本表登记结算日期。
- 涉及判据的（DA-01/02/03/04/06/14）必须同步：门禁注册 + 反向自测 + pitfalls-playbook 对应条目更新。
- 全部 P0 关闭后，重跑一次本报告（`/understand` 增量 + 门禁读数），对照结算率。
