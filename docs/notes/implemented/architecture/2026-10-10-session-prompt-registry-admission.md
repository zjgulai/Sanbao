# 第 7 步 registry 准入接线：三重绑定、失败语义与派生单一家

- 日期：2026-10-10
- 决策：[ADR-0286](../../../adr/ADR-0286.md)
- 状态：已实施（端口 + 三重绑定 + 接线 + 门禁事实与突变）；D4 评估时点沿用 ADR-0284（=证据 observedAt，待用户复核）；preflight / persistence / dispatch 与撤销运营属后续批。

## Problem

ADR-0285 落成第 7 步发布与收录半后，准入口（`resolveRegistry`）仍 absent，链路停在 registry 前。落地材料齐备但三处需裁决/设计：失败语义（「未配置」与「拒绝」的产品面区分）、绑定强度（声明一致性靠机制还是发布纪律）、以及 `adapterMappingDigest`/`registryDescriptorDigest` 派生规则当时只存在于 runtime inventory 生产者内部——准入若要重算，必须有单一家，否则两个消费者会静默偏离。

## Decision

1. 端口 `createSessionPromptRegistryPort`：消费同实例 provider 快照 + requirement bundle + 最后可信观测；评估时点 = 证据 `observedAt`（ADR-0284 纪律）。三重硬校验：快照代（`contentDigestOf(snapshotId)` === 证据 `registrySnapshotDigest`）、声明一致（requirement 的 `registryDescriptorDigest`/`adapterMappingDigest` === 按同规则从条目重算）、审批态（approved+verified 且在证据时点生效窗内）。失配一律 `unavailable`。
2. 失败语义（用户裁决）：无映射/歧义/candidate/读取失败/窗口外/声明失配 → `unavailable`；**仅 disabled / revoked → `denied`**。成功值 `mappingRef = mapping:${snapshotId}:${adapterMappingDigest}`。
3. 派生规则抽入 `src/main/capability-entry-derivation.ts`（projection + 两摘要），生产者与准入共用；抽取以既有 golden 逐字节不动为验收。
4. 接线 options-gated 三输入；`index.ts` 传 `bundledRegistry` 同实例，不得第二来源。
5. 门禁：registry 事实组十项 + 六条具名突变；note 句 registry 移出 absent 名单。

## Alternatives considered

- 全部 unavailable（denied 留待撤销批）/ 结构性同源不做声明重算 / 独立 registry 读取 seam / mappingRef 无快照代——逐条理由见 [ADR-0286](../../../adr/ADR-0286.md) 备选表。

## Consequences

- 十步链真实推进到第 7 步；窗口内 `session.send` 过 registry 后停在 preflight，路由级仍 `protected-effect-unavailable`（信封不含 stage）。
- 两个消费者共用一条派生 forma；未来若规则需演进，动一处即同时移动观测对与准入校验。
- 未闭：preflight/persistence/dispatch、撤销运营真实化（disabled/revoked 的发布流程）、Host 生命周期失效接线。

## Verification

证据（2026-10-10，全部真实执行；未跑的照实写）：

- **新端口 spec**：`test/session-prompt-registry.spec.ts` **8/8**——allowed（真实发布件 + 真实观测，mappingRef 常量逐字）；派生单一家回归（descriptor 面/requirement 面双对比 + `0b6e398d…` 锚）；快照代漂移→unavailable；disabled/revoked→denied、candidate→unavailable（变体快照经内核重封并重绑代）；歧义/无映射/窗口外→unavailable；声明篡改/无声明者→unavailable；缺输入/抛错 provider/非法字节 fail closed；装配探针（三输入齐备才构造，缺一不构造——target/compat 因 authority 缺失不可误触）。
- **抽取回归**：`runtime-inventory-provider` + 三个 session-prompt spec + 内核 spec **39/39**（既有 descriptor 摘要逐字节不动）。
- **门禁自测**：`node --test scripts/gates/sage-route-authority.test.mjs` **43/43**（新增六条具名红：ungate 合并 / index 第二来源 / 端口绕内核 parse / 代绑定移除 / denied 漂移 / mappingRef 漂移 / 派生第二形式——含新事实组基线转绿）。
- **typecheck**：`pnpm run typecheck` 0。
- **全量套件**：210 文件 / 1883 通过 / 1 skip（exit 0）。
- **门禁**：`pnpm run gate` **32/32（objects 319/319，exit 0）**。
- 未运行：本批不动 publications，produce 与 DMG 未重跑（进内测包时随下次 produce）。
