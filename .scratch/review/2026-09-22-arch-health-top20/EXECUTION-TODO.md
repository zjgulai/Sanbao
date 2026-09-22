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

## 阶段 2 执行方案（2026-09-22 定稿，阶段 0 本地部分完成后）

阶段目标：把「运行时耦合显性化」（批次 A 串行线）与五个无阻塞并行项推完。
EX-04/EX-05（两个 L 级大头）按 spec 各开独立窗口，不在本阶段混做。

**推进顺序**（成本配方：子代理合并批次、先样本后全量）：

1. **EX-06（DA-22）服务消费面清单**——串行线头部，解锁 EX-07/08。
   步骤：全仓扫描 `ctx.get(` / `ctx.<attr>` 属性读 / `connection.api.` 三种形态
   （排除 lib/、node_modules、test）→ 产出「文件 × 消费服务」矩阵落数据文件 →
   写判据 `service-consumption`（新消费点未登记判红）→ 反向自测进门禁。
2. **EX-07（DA-23）双通道分诊**——复用 EX-06 清单，三桶归类 + ADR-0061 修订。
3. **EX-08（DA-24）失败态抽查**——复用 EX-06 清单筛「可能不在场」消费点。
4. **并行池（任意窗口取做）**：EX-10（DA-31 paper2skills 判型）→ EX-13（DA-40 补丁干跑）→
   EX-09（DA-26 materialize 消融）→ EX-12（DA-38 归属审计）→ EX-11（DA-32 启动基线，
   宜与 EX-01 同开机，可后置）。
5. EX-14（清场）等 EX-01 完成后错峰开。

每项完成仪式不变（工单结算 + MASTER 状态 + 判据类附 Note + 独立提交）。

## 执行记录

（按切片结算时追加，格式：`EX-xx · 日期 · 一行结论 + 指向工单读数的链接`）

- EX-02 · 2026-09-22 · DA-27 done：既有 selftest（19 用例）从未进门禁——已接 `lute-shell-pin-selftest` 判据项并做 FRAME_MAGIC 突变闭环（红 fail+exit=1 → 恢复绿 exit=0 双绿）。勘误与读数见 [DA-27 结算段](tasks/DA-27-protocol-constant-drift-ablation.md)。
- EX-03 · 2026-09-22 · DA-28 done：装载点删 `lib/bounded-body.js` → `profile-files-sync` + `profile-bundle-sync` 双判红（exit=1，点名 `~lib/bounded-body.js`）→ mv 恢复原 inode → check 绿（27 包一致）+ 哈希闭环。消融两问判据在两个 S 级消融上验证完毕，EX-04 前置满足。读数见 [DA-28 结算段](tasks/DA-28-loadpoint-missing-file-ablation.md)。
- EX-06 · 2026-09-22 · DA-22 done：服务消费面登记处（19 文件/20 服务/4 动态）+ `service-consumption`/`-selftest` 双判据进门禁（127/130 绿）。突变挖出判据自身连字符盲区（服务名正则漏 `brand-new-fake-service` 型名字）——已修并固化用例，第三次实证「没有反向突变的接线不算完成」。EX-07/08 已解锁。读数见 [DA-22 结算段](tasks/DA-22-service-consumption-matrix.md)。
- EX-07 · 2026-09-22 · DA-23 local-done：分诊完成——22:1 实为「纪律适用面只有 1 处」（launcher 本身就是 ADR-0061 样板）；17 处失败态已保守登记豁免；**2 处待拍板**（agent-team-gui 客户端 connection/locale 无守卫直用 + 宿主侧 systemPrompt 直用）+ ADR-0061 适用判据勘误建议。见 [DA-23 分诊表](tasks/DA-23-dual-channel-compliance.md)。
- EX-07 收口 · 2026-09-22 · DA-23 done：用户指示按推荐继续——桶 C 两处补守卫（66/66 绿 + 装载点同步）+ ADR-0061 勘误落盘（`dbf0949`，未推）。
- EX-08 · 2026-09-22 · DA-24 done：fail-open 终扫零命中；pair-access 栅栏 fail-closed 被 access.spec.ts 具名负例证明（读不到=拒绝 + 拒绝 revoked）；放行型缺陷清零。批次 A（EX-06/07/08）整体关账。**CI 归因附记**：Sanbao 远端 09-20 起 20 项环境红（vendor submodule 未初始化 / GH_TOKEN 缺失 / 本机路径假设），df9c661 与 1e8ff77 两轮失败集逐项一致——本批推送零新增；登记与基线对照在 DA-10 §6/§8。
- EX-10 · 2026-09-22 · DA-31 done：判型结论**两个文件均不拆**——load.mjs 是 eval 基础设施的内聚工具箱（消费面同契约、拆分不减导入边），taxonomy.js 是分类契约的单一数据源（ADR-0009 的应用，220 行无体量压力）。判型三问（同契约？导入边减？体量超压？）留档可复用。DA-07 热点线整体收口。读数见 [DA-31 结算段](tasks/DA-31-paper2skills-hotspot-split.md)。
- EX-13 · 2026-09-22 · DA-40 done：副本四步干跑全绿（rollback→验缺席→apply→验回位）+ 双脚本幂等确认。**干跑抓到 runtime-guards rollback 全坏缺陷**——`node --check` 对无 `.js` 扩展名的 `.orig` 恒抛 ERR_UNKNOWN_FILE_EXTENSION，逃生路径从未可用（P-04 同族）；已改用脚本内 `syntax_ok_text` 修复并复跑验证。**语义发现**：rollback=整文件还原（会把同文件其他补丁一并回滚）→ 升级标准动作是按打序全量 apply，不是逐脚本 rollback+apply。生产 app 未触碰、副本已清。读数见 [DA-40 结算段](tasks/DA-40-patch-replay-dryrun.md)。
- EX-12 · 2026-09-23 · DA-38 done：30 包对账矩阵全绿**零错位**（surfaces 10 包全走客户端 slot、platform 9 包全宿主侧，行为特征与物理组自洽）。立项假设两项被复核推翻：theme 的「8 个 surfaces 导入方」实为包内聚合误读（判型三问第一问再立功）；shared 是 sync-shared 分发机制非归属组。contract 2 包判不并组（语义划分非容量划分）。盘上登记：`dsh-memory-local/` 空壳目录（无 manifest、未跟踪，本地遗留物）。读数见 [DA-38 结算段](tasks/DA-38-package-placement-audit.md)。
