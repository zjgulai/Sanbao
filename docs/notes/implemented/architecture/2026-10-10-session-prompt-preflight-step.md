# 第 8 步 preflight：fresh availability 与实时 epoch 读

- 日期：2026-10-10
- 决策：[ADR-0287](../../../adr/ADR-0287.md)
- 状态：已实施（端口 + 接线 + 门禁事实与突变）；persistence / dispatch 与 Host 生命周期失效接线属后续批。

## Problem

第 7 步闭链后链路停在 preflight 前。边界文档定义第 8 步为 fresh availability / no-side-effect preflight，但三类候选面逐条排除：C2C.4 内核是外部能力专用（绑定 external descriptor/provenance/host/connection 代）；行级断言（default preset 未 broken、pinned preset 在 roster）的等值关系仓内无定义——写出来就是发明；收敛型再核验（重读 context/frame/revision）是 persistence/dispatch 「紧邻写入/派发前」的职责，放这里会挤占第 9/10 步语义。唯一真实、live、无副作用的可用性面是 Host epoch 的 runtime-effective 观测（protocol v5；epoch 消失即 undefined），且 inventory 生产者在 boot 已确立「形状校验 → observed → 否则不可用」的读法。

## Decision

1. 端口 `createSessionPromptPreflightPort`：三步读法（`isRuntimeEffectiveObservation` 形状校验、`kind==='observed'`、其余 unavailable）；坏链（bundle 失败 / 无声明 requirement / mappingRef 形态非法）在触 Host 之前拒绝；纯读无时钟。
2. 判词集延续第 7 步裁决：永不 denied、永不 stale；运行时缺失 = unavailable。
3. `preflightRef = urnDigest('urn:sage:preflight:v1:', [targetRef, mappingRef, requirementDigest, JSON.stringify(live)])`——roster 移动即 ref 移动（freshness 可观测）。
4. 接线 options-gated（bundle + runtimeEffective）；复用 index 的 Ticket 030 验证闭包（main-owned 先 `isRuntimeEffectiveObservation` 校验再暴露），不新增读面。
5. 门禁：preflight 事实组六项 + 六条具名突变；note 句迁出 absent 名单。

## Alternatives considered

- C2C.4 内核复用（范畴错误）/ 行级断言（等值关系无定义）/ 收敛型再核验（职责归位第 9/10 步）/ 只读 boot 证据（不 fresh）——逐条理由见 [ADR-0287](../../../adr/ADR-0287.md) 备选表。

## Consequences

- 十步链真实推进到第 8 步；窗口内 `session.send` 过 preflight 后停在 persistence，路由级仍 `protected-effect-unavailable`。
- availability 与 approved 正交落地：Host epoch 不在 = unavailable（不是拒绝）；preflightRef 随实时读数移动。
- 边界诚实：不宣称操作 preflight 完成——boot 静态一致由 inventory 证明、availability ≠ execution authority（dispatch absent）、Host 生命周期失效与重观测属登记项。

## Verification

证据（2026-10-10，全部真实执行；未跑的照实写）：

- **新端口 spec**：`test/session-prompt-preflight.spec.ts` **4/4**——allowed（observed roster，ref 形状 + 两次读逐字节确定 + roster 移动 ref 即移动 + reader 恰调用一次）；非 observed 全谱 unavailable（undefined 读面 / 读抛错 / 形状非法 / 三个 unavailable reason）；坏链（bundle 失败 / 无声明者 / mappingRef 形态非法）在触 Host 前拒绝（reader 未调用）；装配探针（bundle + runtimeEffective 齐备才构造，缺一不构造——target/compat/registry 因输入缺失不可误触）。
- **门禁自测**：`node --test scripts/gates/sage-route-authority.test.mjs` **44/44**（新增六条具名红：ungate 合并 / live 形状校验移除 / observed 门槛漂移 / denined 漂移 / mappingRef 预检移除 / ref 域漂移；**过程中自测抓到一条弱 pin**——pin 串与 service 转发行的同串歧义被突变测试暴露后改为唯一合并串）。
- **typecheck**：0。
- **全量套件**：211 文件 / 1887 通过 / 1 skip（exit 0）。
- **门禁**：`pnpm run gate` 32/32（objects 319/319，exit 0）。
- 未运行：本批不动 publications，produce 未重跑。
