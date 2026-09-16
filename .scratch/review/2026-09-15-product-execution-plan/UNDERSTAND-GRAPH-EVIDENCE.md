# Understand 全量知识图谱证据

- 执行日期：2026-09-16
- 项目锚点：`main@af5f2ede6092a38fcb7d119571667771004bf416`
- 数据目录：`.ua/`
- 状态：`full-analysis-complete / deterministic-validation-pass / dashboard-not-launched`

## 1. 证据边界

本次在用户明确确认 `.ua/.understandignore` 后执行完整 Understand 7 阶段流程。图谱覆盖执行当时的 dirty worktree，而不只是 `HEAD` 已提交字节：扫描包含 tracked 修改、untracked 候选、`.scratch`、历史备份和禁用 Git 元数据。因此 `gitCommitHash` 只标记基准提交，不能单独重建本图谱，也不能把图谱提升为 commit、CI、live、clean-machine、DMG 或生产验收。

`.ua` 被仓库 `.gitignore` 排除；正式输出未提交：

- `.ua/knowledge-graph.json`
- `.ua/fingerprints.json`
- `.ua/meta.json`
- `.ua/intermediate/scan-result.json`

最终 SHA-256：

| 产物 | SHA-256 |
| --- | --- |
| `knowledge-graph.json` | `ff6d9ca6bebef9da4038d2d3fa39be68056f5fd762e7cde19a002d29f024dda9` |
| `fingerprints.json` | `d7ce73bc95cf49ab3f0f2ec7a1a7165d311effe78503e1540bbc48cf52240804` |
| `meta.json` | `81d3ce2b5024da89b60b85f7c443e777f65bc67ab6602082b8a4555ed2f62f23` |
| `scan-result.json` | `d615bc6402f70adf3752c7e2bd9192523457d5792ca01dd38ef59c5dfbee6b6f` |

## 2. 扫描与图谱规模

### 文件清单

| 类别 | 数量 |
| --- | ---: |
| code | 1,065 |
| docs | 553 |
| config | 323 |
| script | 53 |
| markup | 40 |
| data | 3 |
| infra | 0 |
| 合计 | 2,037 |

当前 ignore 文件没有产生额外过滤，`filteredByIgnore=0`。这使图谱适合作为“当前目录全景”，也把备份扩展名、`.git.disabled/objects`、实验输出和历史材料带进了语言与孤立节点统计。后续若目标改为“当前可出货源码架构”，应另行评审并收紧 ignore，而不是把本次全量结果静默改写。

### KnowledgeGraph

| 指标 | 数量 |
| --- | ---: |
| nodes | 3,858 |
| edges | 4,316 |
| file-level nodes | 2,037 |
| functions | 1,777 |
| classes | 44 |
| imports | 728 |
| contains | 1,821 |
| exports | 1,081 |
| calls | 603 |
| documents | 36 |
| configures | 16 |
| tested_by | 31 |
| layers | 10 |
| guided tour steps | 13 |

## 3. 当前架构分层

| 层 | file-level nodes | 解释 |
| --- | ---: | --- |
| Agent 能力与技能插件 | 452 | `packages/capabilities` 为主的可装配能力与技能面 |
| 契约与治理规则 | 12 | subset、preset lint 与运行时约束 |
| 运行基础设施与协作服务 | 56 | Team Hub 等协作与基础服务 |
| DSH 宿主平台集成 | 107 | Settings、主题、品牌等 host 长期扩展位 |
| 产品界面与交互面 | 306 | Agent Team、新应用抽屉等 surface |
| 共享 Client/Host 基础 | 6 | 跨包复用的 client/host 安全与装配原语 |
| 工程门禁、打包与发布 | 182 | gates、profile 同步、DMG 与 release 验证 |
| 架构决策与项目文档 | 235 | ADR、SOP、研究、计划和验证说明 |
| DSH 上游补丁与修复基线 | 55 | 可重放补丁、回归护栏与 root outlet 修复 |
| 实验、证据与历史备份 | 626 | `.scratch`、验收快照、备份和禁用 Git 元数据 |

该分层强化了原计划的判断：产品主链不是“插件清单”，而是能力、契约、host 平台、surface、共享 runtime、工程交付和上游补丁共同组成的系统；同时，实验/历史材料必须与出货事实隔离。

## 4. 执行与验证证据

1. Scanner 生成 2,037 文件与全量 import map；4 个 `tsconfig.json` 的 path alias 无法解析，但 relative imports 不受影响。
2. Semantic batching 生成 158 个逻辑批次；182 个 part 文件通过根级独立验收：批次连续、2,037/2,037 文件覆盖、3,858 node IDs 全局唯一、imports 与确定性输入逐条相等、分片均不超过 60 nodes/120 edges。
3. Bundled extractor 对 374 个非标准、二进制或历史归档文件明确 skip；每个真实文件仍保留 file-level node，没有伪造函数或类结构。
4. Merge 初次丢弃 3 条 `systems.ts` → JSON catalog import，因为目标真实节点使用 `config:` 而不是 `file:` 前缀；assemble review 将三条边恢复到现有节点，未创建重复节点。最终 728/728 internal imports type-aware 全覆盖。
5. Deterministic validator：`issues=0`；node、edge、layer、tour 引用均有效，无 dangling 或 duplicate。
6. Validator 同时报告 1,334 个 orphan warnings，主要来自 `.scratch`、备份、独立文档与配置。这是完整范围与当前弱语义连边的限制，不是 validation failure。
7. Structural fingerprints 成功覆盖 2,037 个文件后才写入 `meta.json`。解析含 Cordis/DSH `!!js` 自定义标签的 YAML 时出现重复 unresolved-tag warnings，但构建退出码为 0，最终 baseline 仍为 2,037/2,037。
8. 中间分析文件已按 skill 规则移入 `.ua/.trash-1789528529/`，保留 `.ua/intermediate/scan-result.json` 供未来增量分析；trash 为可恢复临时目录，按后续 7 天清理规则处理。

## 5. 对执行计划的影响

- 图谱确认 `packages/{capabilities,contract,infra,platform,surfaces}`、`shared`、`scripts`、`packaging`、`docs` 与 `dsh-patches` 是不同责任面，后续批次不得用跨层大重构替代精确风险关闭。
- `shared/host` 与门禁/同步链是跨产品复用的高杠杆边界；安全修复应优先复用既有原语，但不能为追求统一而扩大当前任务范围。
- 626 个实验/历史节点和 1,334 个 orphan warnings 说明“仓库全景”与“出货架构”需要两套清晰口径。发布与 gate 仍只认明确 manifest、source policy 和验证分母。
- Guided tour 将主阅读路径固定为：项目与治理 → shared runtime → capability/contract/infra/platform/surface → gate/profile → DMG → patch baseline → 实验证据边界。
- 本图谱没有消除 Batch 002 的选择门，也没有证明 `SEC-RT-003A` 或 `QG-001 + QG-002` 已完成。下一批仍必须由用户二选一后再修改对应代码。

## 6. 已知限制

- 这是 dirty-worktree 快照，不可由记录的 commit hash 单独复现。
- Framework scanner 没有确认框架，`frameworks=[]`；不得从依赖印象反推已验证框架清单。
- 自定义扩展名和备份后缀进入 language 列表，不能把该列表直接当技术栈统计。
- 1,334 个 orphan warnings 表示大量节点尚无语义关系；图谱适合导航和差异发现，不适合作为调用链完整性证明。
- Understand dashboard skill 当前运行时不可用，因此没有自动启动可视化；JSON 图谱和 guided tour 已完整保存。
