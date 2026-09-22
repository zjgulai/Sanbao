# Execution TODO · 第二批执行切片（示踪弹视角）

> 问题视角的家在 [tasks/](tasks/)（DA-22~41 工单全文）；本文件只登记**执行顺序、阻塞关系、切片验收点**。
> 阶段定义与已定决策见 [spec](../../../../../docs/specs/2026-09-22-arch-health-top20-batch2.md)。
> 每颗切片完成即可独立验证（命令 + 原始输出），这正是交给实现环节的前提。

## 切片清单（EX 编号 = 执行顺序视角，非问题编号）

### 阶段 0 · 起手（并行，S 级）

| EX | 工单 | 切片目标（完成后能验证什么） | Blocked by |
| --- | --- | --- | --- |
| EX-01 | [DA-34](tasks/DA-34-live-readings-one-shot.md) | 一次 CDP 会话收五件实机读数，三件 local-done 有归宿 | 无（需用户在场：窗口可见 + app 重启） |
| EX-02 | [DA-27](tasks/DA-27-protocol-constant-drift-ablation.md) | `lute-shell-pin` 每支声明有「突变必红」证明，selftest 挂进门禁 | 无 |
| EX-03 | [DA-28](tasks/DA-28-loadpoint-missing-file-ablation.md) | 「删→红→恢复→绿」四步读数证明 profile-files-sync 分母真的覆盖装载点 | 无 |

### 阶段 1 · 两个大头（各自独立窗口）

| EX | 工单 | 切片目标 | Blocked by |
| --- | --- | --- | --- |
| EX-04 | [DA-25](tasks/DA-25-capability-ablation-matrix.md) | 消融矩阵落盘，「摘了没红灯」的格子为零 | EX-02, EX-03（方法论门）；与 EX-01 共享 CDP 前置 |
| EX-05 | [DA-29](tasks/DA-29-spec-reachability-batch.md) | 32 个未点名 spec 每个有归宿，可达性读数更新 42/42 | 无（可提前开批，按包组分 4~5 个子批，每子批独立提交） |

### 阶段 2 · 结构收口

| EX | 工单 | 切片目标 | Blocked by |
| --- | --- | --- | --- |
| EX-06 | [DA-22](tasks/DA-22-service-consumption-matrix.md) | 「包 × 消费服务」登记清单 + 漂移判据 + 反向自测进门禁 | 无 |
| EX-07 | [DA-23](tasks/DA-23-dual-channel-compliance.md) | 22 个消费点三桶分诊完毕，ADR-0061 适用范围修订 | EX-06 |
| EX-08 | [DA-24](tasks/DA-24-optional-service-failure-audit.md) | 失败态走向抽查表落盘，放行型缺陷清零或登记 | EX-06 |
| EX-09 | [DA-26](tasks/DA-26-shell-materialize-ablation.md) | materialize 缺件三态读数（清晰报错/静默/挂死）落盘 | 无 |
| EX-10 | [DA-31](tasks/DA-31-paper2skills-hotspot-split.md) | 两个热点文件判型结论（拆/不拆/混合）有导入方清单证据 | 无 |
| EX-11 | [DA-32](tasks/DA-32-startup-timeline-baseline.md) | 启动阶段耗时分布 + 基线阈值有出处 | 无（采样与 EX-01 同开机更省） |
| EX-12 | [DA-38](tasks/DA-38-package-placement-audit.md) | 29 包对账矩阵落盘，错位项有迁移/豁免/口径三选一结论 | 无 |
| EX-13 | [DA-40](tasks/DA-40-patch-replay-dryrun.md) | restore→verify→apply→verify 四步干跑全读数，幂等性结论明确 | 无 |
| EX-14 | [DA-35](tasks/DA-35-scratch-cleanup-execution.md) | `.scratch` 顶层只剩活跃目录，归档索引完整，docs-link 绿 | EX-01（同机负载错峰）；DA-04 已满足 |

### 阶段 3 · 例行与长尾（P2 池，无硬时序）

| EX | 工单 | 切片目标 | Blocked by |
| --- | --- | --- | --- |
| EX-15 | [DA-30](tasks/DA-30-tested-by-reconciliation.md) | 图谱测试面 vs 真实测试面对账读数（口径先行） | 无 |
| EX-16 | [DA-33](tasks/DA-33-gate-cost-profiling.md) | 113 项耗时画像 + 两档差值读数 | 无 |
| EX-17 | [DA-36](tasks/DA-36-rollback-drill.md) | 回滚剧本演练（或分步干跑，明示未端到端） | 无（建议备份机） |
| EX-18 | [DA-37](tasks/DA-37-production-machine-channel.md) | 生产机通道候选矩阵 + 用户拍板记录 | 无 |
| EX-19 | [DA-39](tasks/DA-39-ship-boundary-review.md) | PRODUCT_MOUNTS / patch.yml 两面读数 + 判据缺口结论 | 无 |
| EX-20 | [DA-41](tasks/DA-41-hardlink-snapshot-refill-drill.md) | 补件链路演练 + SOP 操作卡入库 | 无（可与 EX-03 同环境连做） |

## 阻塞图

```text
EX-01 ──────────────┐（共享 CDP 前置）
EX-02 ──┬──→ EX-04 │
EX-03 ──┘          │
EX-01 ──→ EX-14（错峰）
EX-06 ──→ EX-07
       └→ EX-08
其余（EX-05/09/10/11/12/13/15~20）无阻塞，任意窗口可取
```

## 每颗切片的统一完成仪式

1. 工单文件状态更新 + 结算段落（读数贴工单，不贴本文件）；
2. MASTER-TODO 对应行状态同步；
3. 涉及判据的：门禁注册 + 反向自测 + pitfalls-playbook（若构成新根因类）；
4. 涉及决策的（EX-06 判据、EX-07 ADR、EX-12 并组提案）：补 Note（ADR-0015）；
5. 独立提交，只取自己 hunks（P-43）。

## 执行记录

（按切片结算时追加，格式：`EX-xx · 日期 · 一行结论 + 指向工单读数的链接`）

- EX-02 · 2026-09-22 · DA-27 done：既有 selftest（19 用例）从未进门禁——已接 `lute-shell-pin-selftest` 判据项并做 FRAME_MAGIC 突变闭环（红 fail+exit=1 → 恢复绿 exit=0 双绿）。勘误与读数见 [DA-27 结算段](tasks/DA-27-protocol-constant-drift-ablation.md)。
- EX-03 · 2026-09-22 · DA-28 done：装载点删 `lib/bounded-body.js` → `profile-files-sync` + `profile-bundle-sync` 双判红（exit=1，点名 `~lib/bounded-body.js`）→ mv 恢复原 inode → check 绿（27 包一致）+ 哈希闭环。消融两问判据在两个 S 级消融上验证完毕，EX-04 前置满足。读数见 [DA-28 结算段](tasks/DA-28-loadpoint-missing-file-ablation.md)。
