# Seed peer 闭包修复（K3 补完，WT-02C.2E.4）

- 日期：2026-10-02
- 状态：implemented
- ADR：[ADR-0197](../../../adr/ADR-0197.md)
- 相关：[ADR-0196](../../../adr/ADR-0196.md)（D6 发现）、[ADR-0192](../../../adr/ADR-0192.md)（0.2.0 换装）、[0.2.0 换装 Note](2026-10-02-harness-0.2.0-rc.2-kernel-upgrade.md)、[升级设计 §8.7](../../../superpowers/specs/2026-10-02-harness-0.2.0-upgrade-design.md)、[K9 计划](../../../superpowers/plans/2026-10-02-harness-0.2.0-upgrade.md)

## Problem

WT-02C.2E.3 验收（ADR-0196 D6）发现 host 面 4 行 `failed to import`：`llm-deepseek`（`@deepseek-ai/dsh-llm-deepseek-api-key`）、`llm-deepseek-account`、`deepseek-account-platform`、`account-controller`。全新隔离根与 K 世代根同病。

全量只读审计（对 generation `4b8e7dfb` 的 hoisted 树，逐包 `peerDependencies` 减 optional 后向上解析）定性：

- **600 包 / 1060 条非可选 peer：未满足恰为 4 条**，全部指向两个缺失包——`@deepseek-ai/dsh-llm-deepseek@0.2.0-rc.2`（`dsh-llm-deepseek-api-key`、`dsh-llm-deepseek-account` 需要）与 `@deepseek-ai/dsh-deepseek-account@0.2.0-rc.2`（`dsh-deepseek-account-platform`、`dsh-api-account-controller` 需要）；两包在 npm 均存在。
- 二号位 peer（`dsh-timeout`、`dsh-home-paths`、`dsh-atomic-write`、`dsh-deepseek-llm-api-extensions`、`dsh-brand`、`dsh-agent`、`cordis-plugin-loader`）全部在位 → **零级联**。
- 非 dsh 家族未满足 = **0**。
- 入图链：两个 bundle（`dsh-base`、`dsh-web-app`）以**常规 dependencies** 引入这 4 个消费者；消费者对两个缺失包声明**非可选 peer**。seed 的 `autoInstallPeers: false` 来自 0.1.x rc 生态纪律（ADR-0005 语境：当时 rc 区间在 npm 不可解析），在 0.2.0 exact-pin peer 生态下只产生「警告 + 静默跳过」：包入图、运行时导入失败、host 仍 ready——**静默降级**；K6 的「stderr 零告警」为模式受限读数（不覆盖 loader 的 `did not activate` 文案）。

## Decision

1. **审计先于动作**：全量枚举未满足非可选 peer（不止 4 行、不止 dsh 家族），blast radius = 恰 4 条 + 零级联（见上）。
2. **seed 翻转 + 锁最小增量重生成**：`apps/sage-shell/seed/pnpm-workspace.yaml` → `autoInstallPeers: true`；锁在隔离临时目录以已提交锁为起点增量 `pnpm install --lockfile-only`。增量结果恰为 `packages +2`（两个缺失包，exact `0.2.0-rc.2`）、600 已锁包**零版本漂移**、importers 成员零变化、其余 diff 仅为 peer-suffix 重哈希。同日全量新鲜解析会拉高 ~68 个 ranged 三方包（aws-sdk/sharp/mcp-sdk/undici…），属票外漂移，**不取**。
3. **`strictPeerDependencies: true` 同批入 workspace，作为再生门**：定性实测——对 `--frozen-lockfile` 无效果（旧锁带 4 条未满足仍 exit 0，冻结安装跳过解析）；对**重生成**有效：同题无锁再生 baseline（关）exit 0 + 警告，开则 exit 1 列出缺失 peer；闭包后正控 exit 0。即 future K3 式换装 recipe 若引入不可自动闭包的 peer，再生即红。
4. **smoke 永久断言（机制守卫）**：`scripts/smoke.mjs` 末尾新增——`stderr` 含 `did not activate` 即失败（上游 `dsh-app-boot` 对 failed/pending entry 的唯一告警文案；required 失败走 `startup failed` 同含该串）。
5. **0.1.x 纪律边界**：`autoInstallPeers: false` 的历史要求属 legacy 上下文，对 Sage seed 由 ADR-0197 取代；legacy 文档不改写。

## Alternatives considered

| 方案 | 否决理由 |
| --- | --- |
| 把两个 peer 包手写进 seed `dependencies` | 治标；peer 闭包应交给解析器，漏一个是时间问题。 |
| 保 `autoInstallPeers: false` + 只加 `strictPeerDependencies: true` | strict 只让再生失败，不闭合图；换装 recipe 直接不可用。 |
| 全量新鲜解析新锁 | ~68 包版本漂移出票外，毁既有验收读数。 |
| 只在 K6 记录里更正告警读数 | 记录不能替代机制；smoke 断言才是「拦住」。 |

## Consequences

- **红→绿实证**：新增 smoke 断言对旧根 `4b8e7dfb` **exit 1 判红**（19 PASS + 1 FAIL，点名 4 条 `failed to import`）；重物化后新 generation `210d6ea0-d107-4692-b418-74c2bd2a9af4` **20/20 PASS**、exit 0。
- **安装证据**：新 generation 安装 601 包（新增恰 2、reused 598）；对安装树复审计 = **0 未满足 / 0 版本错配**（1073 条非可选 peer 全解）；无凭据激活（隔离根无凭据库、零 `did not activate`）。
- **回归证据**：typecheck exit 0；套件 **63 文件 / 621 passed + 1 skipped**；三层 gate **25/25**（quick / full / strict=no-skip）。
- **配方可复现**：从最终仓库状态复跑增量再生 `Already up to date`、锁字节不变；frozen 安装 exit 0。
- **遗留**：官方 DeepSeek route 端到端可用性已由同日补证探针证实（见文末「Route 探针」节）；行级 enablement 全矩阵与 matrix 物理重发按 ADR-0196 D3/D5 登记不变。

## Route 探针（同日补证，WT-02C.2E.4 收尾）

目的：兑现 ADR-0196 D6 登记的「官方 route 是否不可用须以真实模型调用证实或证伪」。载体：内核自带 `headless` 模板（`dsh --profile headless "…"`，全新持久化会话、打印最终答案），在独立临时 `DSH_HOME` 中用该代（`210d6ea0`）的 `dsh` CLI 运行；凭据经**启动环境层**注入（`dsh-credentials-local` 解析优先级最高且按次覆盖；从用户凭据存储读入进程环境，全程不回显、不落盘）。

- **Arm 1（无凭据基线）**：exit 1，`MISSING_CREDENTIAL: llm-deepseek: no API key for provider route "deepseek-official"` —— 组合启动、route 解析、K9 修复的 provider 包全部就位，只差凭据。
- **Arm 2（带凭据真实调用）**：exit 0，模型应答 `OK`，零 `did not activate` —— 官方 route 内核链路**端到端证实可用**（凭据解析 → 请求发出 → 流式应答返回 → 会话落盘）。

边界（不扩大表述）：探针经 headless 模板（同一内核包集）而非 Sage 组合内的单链调用；Sage 侧的分立证据为 smoke 零告警 + PMAP route 行 observed。同日另用 `preview.mjs` 在隔离根启动真实 Electron：Sage 工作台正常渲染（`运行时已就绪 dsh 0.2.0-rc.2`）、渲染器 console 零条目——但 Sage 现行产品面（`src/product/component-renderer.ts`）是四个面板的静态工作台，**无对话输入面**，故「UI 会话环路」今日不在产品内，不属于本探针缺口。
