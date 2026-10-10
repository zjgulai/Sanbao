# T05-mid 发布票第一刀：requirement 落 bundle 与真实 target 步装配

- 日期：2026-10-10
- 决策：[ADR-0282](../../../adr/ADR-0282.md)
- 状态：已实施（bundle 制品 + 加载面 + target 端口 + 生产装配 + 门禁事实与突变；矩阵制品与 compatibility 属下一刀）。

## Problem

T05 发布件（requirement/策略文档/提议矩阵规则）在 ADR-0278/0280 封存的产物只被测试引用——运行时零消费；会话族十步链真实接线停在 identity-policy，target 起全 absent，route-authority 门禁事实原文写着「the chain still stops at the absent target / compatibility / registry steps」。ADR-0276 D3 的发布流程把「随壳加载 + providers 装配接 resolveTarget」列为发布票本体，但 bundle 位置、加载面与装配语义从未定义，仓内也不存在任何发布制品文件。

## Decision

1. **制品**：以 C2.2T 内核把 ADR-0278 的封存 requirement 包成 snapshot（publicationDecision = owner 三元、createdAt = 决策 decidedAt 保持确定性），落 `apps/sage-shell/publications/session-prompt.requirement-snapshot.json`；构建时先经 `parseCompatibilityTargetRequirement` 复核 recorded requirementDigest == `c7583d07…`（ADR-0278 记录值）再 `sealCompatibilityTargetRequirementSnapshot`——产物 `snapshotId = urn:sage:compatibility-target-requirement-snapshot:sha256:521b87ac…`。dev 检出与打包运行时同相对布局（`lib/main/` 上两级）；producer 显式拷贝整个 `publications/` 目录进 app-runtime（与 seed 同法）。
2. **加载面**：`apps/sage-shell/src/main/publication-bundle.ts` 启动时一次读取 + 内核 parse；失败只记一行 stdout 并原样转发（unavailable-first），不修复/不默认/不重封/不逐请求重读。
3. **目标端口**：`apps/sage-shell/src/main/session-prompt-target.ts` —— 表查 actionScope → snapshot 中唯一声明该 scope 的 requirement（0/>1 → unavailable）→ bundled provider `resolve({requirementId, actionScope, evaluatedAt: authority.now})`；一切失败 → unavailable（**不得** denied）；`targetRef = target:<snapshotId>:<requirementDigest>`。
4. **装配**：`createSessionCoreProtectedEffectPorts` 新增 `requirementBundle` 开关，与 `authority` **同时**存在才装配 resolveTarget；index.ts 启动装载一次并逐请求传引用。
5. **门禁**：route-authority 新事实组（双开关接线、index 装载、表查 scope、唯一声明、targetRef 绑定、失败不得 denied、loader 调用内核 parse）+ 五条具名突变（ungated / index 漂移 / denied 漂移 / targetRef 漂移 / loader 未 parse）；note 句改为「chain now also passes the real target step … before stopping at the absent compatibility / registry steps」。

## Alternatives considered

- 仓外产物直读（`/Users/pray/tmp/…`）：违反随壳加载与仓根纪律——否决。
- requirement 内嵌为 TS 常量：发布件是治理数据，内核 parse 是唯一验证门——否决。
- stage 进拒绝信封：扩协议面，属未来票——否决。
- provider 失败映射 denied：把「治理不可用」说成「策略拒绝」——否决。

## Consequences

- 「发布 → 运行消费」链闭合 requirement 半边：封存件从仓外读数变为随壳制品，启动即内核校验；路由行为保持 unavailable-first（拒绝码不变，stage 内部前移至 compatibility）。
- 打包下一次 produce 装 publications 进 app-runtime；dmg 验收中装载成功时应**无** `requirement bundle unavailable` 输出行。
- 未闭：矩阵制品 + resolveCompatibility + targetEvidence 生产者、Registry 首方 entry、persist/dispatch、stage 进信封。

## Verification

证据（2026-10-10，全部真实执行；未跑的照实写）：

- **制品封存**：组合命令退出 0——`SEALED OK`；`snapshotId = urn:sage:compatibility-target-requirement-snapshot:sha256:521b87ac…`；`entries[0].requirementDigest = urn:sage:compatibility-target-requirement:sha256:c7583d07…`（= ADR-0278 记录值，内核复算一致）。
- **新 spec**：`node scripts/test.mjs run test/session-prompt-target.spec.ts` **5/5**（装载与钉子、篡改/缺失拒绝、端口窗口内外/未登记操作/失败 bundle、双开关接线探针、生产装配路由行为）。
- **门禁自测**：`node --test scripts/gates/sage-route-authority.test.mjs` **41/41**（含新增五条具名突变；收敛过程中突变实验抓出 loader 事实须钉「调用形态 `parse…(value)`」而非裸名字——import 行会满足裸名字）。
- **相关 spec 回归**：`test/protected-session-effects.spec.ts` + `test/session-prompt-target.spec.ts` + `test/protected-effect-admission.spec.ts` + `test/app-service-wiring.spec.ts` 合计 **87/87**。
- **sage-shell 全量套件**：`node scripts/test.mjs` **EXIT=0（0 fail）**。
- **producer 重跑**：`bash packaging-sage/produce-inputs.sh --replace` 退出 0——`runtime graph: 110 files`（新增三个运行时模块进闭包：`publication-bundle.js`、`session-prompt-target.js`、其引入的 `compatibility-target-requirement.js`）；`staging/input/app-runtime/publications/session-prompt.requirement-snapshot.json` 落位（3873 bytes，snapshotId 与包内一致 `521b87ac…`）。
- **门禁**：`pnpm run gate` **32/32（exit 0）**。首跑曾 31/32：`electron-single-frame-caller-binding.spec.ts` 的 Electron 探测件在高负载下非零退出（单跑 1.13s 全绿、复跑门禁 32/32 绿）——高负载轮换时序红家族，非本刀回归。route-authority 的 target 事实组（含五条具名突变）在门禁内真实执行。
