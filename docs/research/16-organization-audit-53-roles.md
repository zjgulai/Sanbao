# 16 · 53 数字员工全量机械审计（2026-09-19）

> 本文是管理层（MGT）preset 整合设计（[ADR-0129](../adr/ADR-0129.md)）的取证附件：
> 对 50 个存量 AGT 岗位（材料 + 产物）与 3 个新 MGT 管理岗位（材料）做多维度属性与
> 协作关系的机械化一致性审计。方法：一次性只读脚本（会话内执行，正式化列入执行计划
> P4 的 `audit-organization.mjs`），数据源为材料根
> `/Users/lute/project/AI组织变革/docs/`（与 GitHub zjgulai/AI-Native-Organization 同步，
> diff 为空）与产物根 `~/.dsh/.agent-presets/`。本文只记录**读数与判定**；处置决策在
> ADR-0129，不在本文重复。

## 1. 审计范围与维度

| 维度 | 数据源 | 判定 |
| --- | --- | --- |
| 属性完备性（18 必备字段） | role-catalog.json × 50 | 全完备；1 处例外（§3.5） |
| 协作声明对称性 | role-catalog `collaborates_with`（200 条有向声明） | **66 条非对称（33%）**（§3.1） |
| 协作图参与闭合 | collaboration-graph.json（338 边） | 角色↔角色边 = **0**；无孤儿岗位（§3.2） |
| 流程/场景引用悬空 | catalog flows/scenarios vs graph | 零悬空 |
| MGT 覆盖闭合 | management-catalog.json | AGT 覆盖 50/50，双线归属 0（§3.3） |
| 技能映射健康度 | skill-map.json（151 能力名） | direct 120 / partial 30 / **gap 1**（§3.4） |
| 产物一致性 | 50 × preset.yml / manifest.json / agent.cordis.yml | order 唯一、icon 唯一、T0 全挂、披露段全在（§2） |
| 快照传染面 | manifest source_snapshot | 8 个共享源哈希 50 岗一致 → 任一共享源改动 = 全量重生成（§3.6） |

## 2. 健康面（好的读数）

- **产物层零缺陷**：50 个 preset 的 order 无撞号、icon sha256 无重复、16 项 T0 通用技能
  全量挂载无缺失、persona「技能供给实况」披露段 50/50 存在（ADR-0021 纪律被机制守住）。
  （勘误：初稿写 15 项，系引用生成器过期注释；实际 T0_NAMES 于 2026-09-18 追加 kami 后
  为 16 项，审计脚本按 16 项清单核对。）
- **门禁账本与实物一致**：live-presets.expected.json 的 presetCount=53（50 agt +
  lute-cordis + agent-fullstack + …）与盘上目录吻合。
- **production_authorized 纪律**：材料两侧（role-catalog × 50、management-catalog × 3）
  全部 `false`，无一例外。
- **技能供给健康**：151 个中文能力名仅 1 个 gap（零供给率 0.7%），direct 占 79%。
- **MGT 覆盖闭合**：MGT-002（38 岗）∪ MGT-003（12 岗）= AGT-001~050 全集，交集为空；
  MGT-001 的 owned_role_ids 是 MGT-002/003（层内覆盖，不计入 AGT 覆盖）。

## 3. 发现（按处置编号对应 ADR-0129）

### 3.1 发现 A：collaborates_with 33% 非对称，集中于控制类枢纽

200 条有向协作声明中 66 条单向（声明方列了对方、对方未回指）。非对称入度Top：
AGT-021×6、AGT-044×5、AGT-043×4、AGT-013×4、AGT-050×3、AGT-040×3、AGT-006×3、AGT-009×3
——全部是控制/合规/平台侧枢纽岗。形态与「业务岗声明向枢纽岗协作、枢纽岗服务全员故不
逐一回指」的有向语义吻合，但材料从未声明边是有向的。
**处置**：ADR-0129 D7（声明有向语义，门禁只校验悬空）。

### 3.2 发现 F：协作事实只有一个家，且不在协作图里

collaboration-graph.json 的 338 条边全部是角色→流程/阶段/产物/协议边
（eligible_for_flow 51、legacy_candidate_contributor 140、has_flow_stage_binding 64 等），
角色↔角色边为 0。50 岗的「谁与谁协作」唯一事实源是 role-catalog 的 `collaborates_with`。
这不是缺陷，但文件名（collaboration-graph）与内容（Case 编排图）的错位会误导读者。
**处置**：随 D7 的语义声明一并在材料侧说明；不改文件。

### 3.3 MGT 侧核验（新增 3 岗）

- 三岗属性完备（15 项必备字段含 decision_rights / explicitly_not_granted / boundary /
  autonomy.case_role_participation=false）。
- MGT 相互协作声明对称（001↔002、001↔003、002↔003）。
- 蓝图 `dsh.mgt.NNN.v1` 自我声明 `blueprint_only_not_importable`、`concrete_tools:
  unknown`——与本仓生成器「材料声明→平台供给逐条披露」的范式兼容（映射工作列入 P1）。
- 验证状态：MGT-EVAL-B 已执行**未通过**（阶梯归属一致率 4/6=66.7% < 100%；L2b 识别
  2/2=100%）；A/C/R0/R2 未执行。这是「评估载体、暂不出货」姿态（D1）的直接依据。

### 3.4 发现 B：T0 含租户专属工具，无差别挂 50 岗

T0（16 项）判据是「①任何岗位都用得上；②不产出岗位责任产物」，但 `xindaya-translator`
（信达雅翻译）与 `kami` 是租户专属工具，「任何岗位都用得上」对它们不成立；
`meeting-minutes` 与管理层「禁止转述/纪要中继」的边界直接冲突（MGT 侧已剔除，D5）。
**处置**：50 岗侧登记为独立债务（ADR-0129 D9），不混入本期爆炸半径。

### 3.5 发现 E：AGT-002 有 4 项技能（其余 49 岗均为 3）

疑似有意（场景自主编排与异常协调岗），但材料未登记例外理由。
**处置**：材料侧补一句登记（D9）。

### 3.6 发现 C+D：结构性观察两项

- **数量断言五个家**：「50」硬编码在 generate.mjs 断言、shipped-presets
  expectPatternCount、verify-lossless L1/L10、门禁账本 presetCount——同一事实多处维护，
  与 ADR-0009 精神有张力。本期最小改（断言从材料 role_count 派生），彻底单一事实源化
  留后续债务（D6/D9）。
- **域与平面两轴正交**：catalog `group`（责任域）与 organization-graph `plane_id`
  （平面）是两条正交轴——「财务与合规」域跨 PLN-OPS/PLN-MGT/PLN-CTL 三平面、「经营与
  组织」跨 PLN-MGT/PLN-CTL、「数据与AI运行」跨 PLN-PLT/PLN-CTL。这是独立性设计使然
  （控制岗抽到 CTL 平面）。**勘误（P0 执行时修正）**：本审计初稿称「材料无一处解释」，
  实为误判——`AI-ORGANIZATION-MAP.md`「两个正交视角」一节已有完整说明（含 AGT-050/040
  实例）。处置相应取消：不新增任何说明文档（该事实已有家，新增即第二份家）。
- **共享源传染面**：agt-001 与 agt-050 的 shared_source_hashes 逐字节一致，8 个共享源
  （roleCatalog/organizationGraph/managementGraph/lifecycle/collaborationGraph/flowCatalog/
  playbooks/roster）任一改动 = 50 preset 全量重生成。这是 D4「MGT 协作事实不进共享图」
  的定量依据。

## 4. 复现方式

正式化脚本落地前（P4），可按 §1 数据源用等价只读脚本复现；本文全部读数为
2026-09-19 材料 HEAD（与 GitHub 同步态）+ 产物根的快照，材料更新后读数可能变化。
