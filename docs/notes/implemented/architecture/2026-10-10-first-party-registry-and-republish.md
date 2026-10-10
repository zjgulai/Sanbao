# 首方 Registry entry 与能力发布面：first-party provenance、7 键载体与重发链

- 日期：2026-10-10
- 决策：[ADR-0285](../../../adr/ADR-0285.md)
- 状态：已实施（内核扩展 + 首个非空快照 + loader/装配 + 重发链 + 门禁）；resolveRegistry 端口接线属后续批。

## Problem

ADR-0283 D4 裁决自证等价路线后，落地侦察发现三处结构性障碍：C2D approved 路径硬性 `source:'c2c5'`（含运行时收录过滤器）；C2.2T requirement 的 capability 载体 5 键 vs semantic/descriptor 的 7 面不同构（真实能力永远配不成对）；非空 approved 条目必然移动 `runtimeDescriptorDigest`（capabilities 在 canonical body 内——已复现空集摘要逐字相等以证），矩阵与全部 golden 需重发重锚。

## Decision

1. `source` 扩 `'first-party'`；digest 命名空间按 source 条件化且不可互换；`verification:'verified'` 由 source 消歧验证路径；运行时收录过滤器同步。
2. capability 载体 5→7（`CompatibilityTargetCapabilityRequirementV1`）；空 caps 规范字节不变（旧摘要稳定，已实证）；候选复制与 semantic 重建同步，非空 caps 的 fail-closed 分支删除。
3. 首个 registry 快照落 `publications/session-prompt.capability-registry.json`（snapshotId `f2df5963…`；条目字节逐字段见 ADR-0285 D3）；**effectiveAt = 决策时刻**（避免 descriptor digest 随生效边界二次移动）；loader 内核 parse + 重封回同 id 才可取代 bundled 空集默认；常量保持空集。
4. 重发链（重观测即重发）：probe 与 index 同款装载 registry → 隔离根重观测（生成 `0b6d6f26…`）→ 能力首次进入 `RuntimeDescriptorV2.capabilities`（7 面齐全，registryDescriptorDigest 恰绑批准时描述子 `e1c7a8b4…`）→ requirement v2（`1b398a37…`，supersedes `521b87ac…`，digest `a00e6303…`）与矩阵 v2（`304c124f…`/`b2967eb3…`）同批重封；golden/spec 常量重锚。
5. 门禁：registry 事实组改为「index 必须经 loader 把 body 交给同一工厂 + loader 钉重封一致性」+ 两条突变；空集常量/kernel 封存/fail-closed read 钉子保持。

## Alternatives considered

- c2c5 冒充 / 平行 registry / 5 键裁剪 / effectiveAt 对齐 10-11 / 先发 registry 后补矩阵——逐条理由见 [ADR-0285](../../../adr/ADR-0285.md) 备选表。

## Consequences

- 首个真实 non-empty approved 条目进入产品链（candidate→审批→快照→运行时收录全链真实）；自引用被「entry 绑定批准时描述子、capabilities 再携带其内容摘要」的结构天然避免。
- 无能力面（provider/model/agent/preset/策略）旧记录仍可解释（空 caps 字节不变）。
- 链路在 10-11 生效窗后：target ✓ → compatibility（新对）✓ → registry 步仍 absent（端口未接）——诚实停在 step 7。

## Verification

证据（2026-10-10，全部真实执行；未跑的照实写）：

- **内核扩展**：`test/capability-registry.spec.ts` 新增 first-party 正例 + 跨 source 命名空间拒收三负例；`test/compatibility-target-requirement.spec.ts` 夹具改 7 键后全绿；门禁自测 `node --test scripts/gates/sage-route-authority.test.mjs` **42/42**（note 锚短语随货面同步，首跑 41/42 正是自测钉住旧句——改锚后复跑全绿）。
- **发布件**：registry 快照封存 `SEALED OK`（`f2df5963…`）；requirement v2 `1b398a37…`/`a00e6303…`；矩阵 v2 `304c124f…`/`b2967eb3…`；全部内核 parse 往返过。
- **真实重观测**：探针（与生产同款装载 registry）对隔离根重观测——`capabilities` 首次非空、descriptor `208b273e…`；对照实验证明生效过滤正确（10-11 生效版条目在 10-10 观测下被正确排除）。
- **spec 重锚**：`session-prompt-target`/`session-prompt-compatibility`/`session-prompt-capability-registry` **16/16**（含动态篡改突变修复：旧硬编码摘要前缀在新摘要下失效——已改动态位翻转；首轮全量套件抓到 registry spec 常量仍停 effectiveAt 裁决前的旧封存 `91a4d627…`，重锚 `f2df5963…` 后复跑全绿）。
- **全量套件**：`pnpm run test` 209 文件 / 1875 通过 / 1 skip（exit 0）。
- **produce**：`produce-inputs.sh --replace`（v10 store 应急口令）EXIT=0，四件出版物字节一致落入 `staging/input/app-runtime/publications/`（shasum 逐一相等）。
- **门禁**：`pnpm run gate` **32/32（objects 319/319，exit 0）**；首跑 31/32 为 `electron-single-frame-caller-binding` 高负载时序红（已登记 flake 家族；全量复跑 209/1875 exit 0，非本刀回归）。
