# Master TODO · 薄壳骨架健康诊断 TOP20（2026-09-22 第二批）

> 承接 [2026-09-20 第一批](../2026-09-20-deep-analysis-top20/MASTER-TODO.md)（20 项：16 done / 3 local-done / 1 in-progress）。
> 本批起点：第一批评审结论 + 图谱 af548ec（3,833 节点 / 4,236 边 / 10 层；与 HEAD df9c661 仅差 3 个 docs/gate 提交，无需重跑）。

## 1. 执行原则（沿用第一批）

- 排序按「**可证明的风险关闭**」；每条验收 = 命令 + 原始输出；仪器类改动必须做恒真桩突变。
- 消融实验统一判据：**两问都要有答案——系统怎么降级（稳定性）、哪个判据变红（可证明）**。
  只有降级没有红灯 = P-02 复发（假绿比红灯贵）。
- P0 不得以新增豁免 / 放宽阈值 / 隐藏 skip 换取表面变绿。
- 多会话同写一棵树（P-43）：动手前先归因 gate 红，提交只取自己 hunks。
- 估算口径：S ≈ 半天内；M ≈ 1–2 天；L ≈ 3–5 天。

## 2. 本批评审的五个读数依据

1. **跨包 imports = 0**：图谱 584 条 imports 边中，无一条跨受管包边界。29 包代码层完全解耦
   （ADR-0011 五组布局机制上成立）；包间协作全部走 cordis 服务注入。
2. **服务消费面无静态守卫**：`ctx.get(` 消费点分布 22 个文件、`connection.api.` 双通道仅 1 个文件
   （ADR-0061 执行率 22:1）；plugin-entry-contract 只查入口四态，不查消费面。
3. **测试可达性缺口**：42 个包级 spec 只有 10 个被门禁点名（DA-08 读数）——32 个「写了但没人跑」
   （P-04 存量形态；DA-07 第二片已验证单点接线模式）。
4. **实机读数通道是单点**：DA-06 / DA-10 / DA-21 三个 local-done 工单共用同一欠账
   （app 带 CDP 重启且窗口可见），账面 113 项全绿 ≠ 运行绿。
5. **卡位从未整体对账**：图谱 10 层（分析器视角）vs package.json 归属（声明视角）零对账。

## 3. 工单总表

### 批次 A · 运行时耦合显性化（3 项）

| ID | 事项 | 优先级 | 估算 | 依赖 | 状态 |
| --- | --- | --- | --- | --- | --- |
| [DA-22](tasks/DA-22-service-consumption-matrix.md) | 服务消费面清单 + 漂移判据 | P1 | M | 无 | `done`（09-22，EX-06：登记处 19 文件/20 服务/4 动态 + 判据双绿；突变挖出连字符盲区已修） |
| [DA-23](tasks/DA-23-dual-channel-compliance.md) | 双通道探测合规审计（22:1 执行率分诊） | P1 | M | DA-22 | `open` |
| [DA-24](tasks/DA-24-optional-service-failure-audit.md) | 可选服务保守失败态抽查（ADR-0038 模式复检） | P2 | S | DA-22 | `open` |

### 批次 B · 消融实验矩阵（4 项，用户 09-22 拍板：DA-25 走重版）

| ID | 事项 | 优先级 | 估算 | 依赖 | 状态 |
| --- | --- | --- | --- | --- | --- |
| [DA-25](tasks/DA-25-capability-ablation-matrix.md) | 能力组消融矩阵（含宿主启动 + UI 降级实机验证） | **P0** | L | 与 DA-34 同批 | `open` |
| [DA-26](tasks/DA-26-shell-materialize-ablation.md) | 薄壳物资消融（materialize 缺件降级路径） | P1 | M | 无 | `open` |
| [DA-27](tasks/DA-27-protocol-constant-drift-ablation.md) | 帧协议常量漂移消融（lute-shell-pin 反向突变） | P1 | S | 无 | `done`（09-22，EX-02：既有 19 用例 selftest 接进门禁 + FRAME_MAGIC 突变红→恢复绿闭环） |
| [DA-28](tasks/DA-28-loadpoint-missing-file-ablation.md) | 装载点缺件消融（profile-files-sync 分母运行时证明） | P1 | S | 无 | `done`（09-22，EX-03：删→双判红→恢复→绿四步闭环，原 inode 保住） |

### 批次 C · 门禁可达性批量收口（2 项）

| ID | 事项 | 优先级 | 估算 | 依赖 | 状态 |
| --- | --- | --- | --- | --- | --- |
| [DA-29](tasks/DA-29-spec-reachability-batch.md) | 32 个未点名 spec 分批接线 | **P0** | L | 无 | `open` |
| [DA-30](tasks/DA-30-tested-by-reconciliation.md) | tested_by 对账读数（图谱 106 边 vs 2870 测试文件） | P2 | S | 无 | `open` |

### 批次 D · 效率与热点（3 项）

| ID | 事项 | 优先级 | 估算 | 依赖 | 状态 |
| --- | --- | --- | --- | --- | --- |
| [DA-31](tasks/DA-31-paper2skills-hotspot-split.md) | DA-07 剩余热点：paper2skills load.mjs / taxonomy.js | P1 | M | 无 | `open` |
| [DA-32](tasks/DA-32-startup-timeline-baseline.md) | 启动时序基线判据（startup.jsonl 权威读数） | P1 | M | 无 | `open` |
| [DA-33](tasks/DA-33-gate-cost-profiling.md) | gate 113 项耗时画像 + CI 两档射程漂移监控 | P2 | S | 无 | `open` |

### 批次 E · 欠账收口（4 项）

| ID | 事项 | 优先级 | 估算 | 依赖 | 状态 |
| --- | --- | --- | --- | --- | --- |
| [DA-34](tasks/DA-34-live-readings-one-shot.md) | 实机读数一次收口（DA-06/10/21 三件共用通道） | **P0** | S | 无（需窗口可见） | `open` |
| [DA-35](tasks/DA-35-scratch-cleanup-execution.md) | DA-13 .scratch 45 项清场执行（按 DA-04 顺序） | P1 | L | DA-04 已满足 | `open` |
| [DA-36](tasks/DA-36-rollback-drill.md) | DA-18 回滚演练（超越哈希核对，真做一次恢复） | P2 | M | 无（建议备份机） | `open` |
| [DA-37](tasks/DA-37-production-machine-channel.md) | 生产机读数通道方案设计（或明确弃案） | P2 | M | 无 | `open` |

### 批次 F · 卡位正确性与补丁演练（4 项）

| ID | 事项 | 优先级 | 估算 | 依赖 | 状态 |
| --- | --- | --- | --- | --- | --- |
| [DA-38](tasks/DA-38-package-placement-audit.md) | 29 包 × 5 组归属审计（图谱层 vs package.json 对账） | P1 | M | 无 | `open` |
| [DA-39](tasks/DA-39-ship-boundary-review.md) | 出货面 / 本机装配边界复核（ADR-0056/0061） | P2 | S | 无 | `open` |
| [DA-40](tasks/DA-40-patch-replay-dryrun.md) | 补丁重放脚本干跑演练（下次升级前最后保险） | P1 | S | 无 | `open` |
| [DA-41](tasks/DA-41-hardlink-snapshot-refill-drill.md) | 硬链接快照补件演练（补件 + 判据验证完整链路） | P2 | S | 无 | `open` |

## 4. 依赖与批次

```text
P0（先做，互相独立可并行）：DA-34 + DA-25（同批共享 CDP 会话）  DA-29
批次 A（DA-22 → DA-23 → DA-24）内部串行（同一份消费面清单复用）
P1 其余（26/27/28/31/32/38/40）全部可并行
DA-35 随时可开，建议排在 DA-34 后避免同机负载
```

**推荐起手式（第一周）**：DA-34 + DA-27 + DA-28（半天级 × 3，先解锁欠账、验证消融方法论），
随后 DA-25 与 DA-29 各开独立窗口（两个 L 规模大头）。

## 5. 用户拍板记录（2026-09-22）

1. DA-25 深度：**重版**——含宿主启动 + UI 降级实机验证，与 DA-34 同批执行（共享 CDP + 窗口可见会话）。
2. 本批**工单化落盘**（本目录即产出），沿用第一批格式。
