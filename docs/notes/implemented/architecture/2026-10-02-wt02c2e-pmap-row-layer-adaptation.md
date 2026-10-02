# WT-02C.2E-PMAP.1：preset/provider/model 源面随 0.2.0-rc.2 换代（声明行 + 层叠行模型）

日期：2026-10-02 · 分类：architecture · 关联 ADR：[ADR-0194](../../../adr/ADR-0194.md)

## Problem

0.2.0-rc.2 删除了 E.0 PMAP 静态层的两个源：其一，preset 目录扫描（`dsh-agent-presets/presets` 随包整体删除）——presets 换代为**层内声明行**（`name: '@deepseek-ai/dsh-agent-preset'` + `config.id`，registry 不扫描目录、不接受 preset 路径）；其二，`settings.yaml` 的静态读（被运行时一次性导入改名，model 选择落在 `agent-default-model` 行的层叠 `config`）。换装票（[ADR-0192](../../../adr/ADR-0192.md)，spec §8.1）只登记不改 PMAP；E.2 的 `preset:set` 面还引用已删的 `dsh-agent-presets` 包——在真实 0.2.0 generation 上 provider 会恒 `pmap-incomplete`（生产死路；E.2 fixture 写同名的伪造包，套件因此假绿）。本票（用户定向：**行模型 + 层叠行配置**，范围 = PMAP 适配 + 插件体检）把 E 线静态层源面迁到 0.2.0 语义。

## Decision

1. **preset 面 = 声明行模型**：层序 = `dsh.profile.bundles` 各 bundle 的 `dsh.bundle.patch` 文件（trust=system）→ profile `cordis.patch.yml`（user；缺文件=上游合法空层）→ shell overlay `sage-host/shell.cordis.patch.yml`（user；必需）。行提取 = 按缩进切块 + 行扫 `name`/`config.id` 的**文本级**切片——不引 YAML 引擎、不执行 `!!js`。同 id 冲突：首条 `observed`、后续 `broken`（`preset-id-collision`，镜像 registry 的 `Duplicate agent preset` 拒绝语义）；零声明 = 合法空 roster。
2. **provider/model 面 = 层叠行配置**：`agent-default-model` 行 `config` 沿层序浅合并（后者覆盖前者，base bundle 缺省 `deepseek-official`/`deepseek-flash`）；路由→包名走静态校准表（`deepseek-official → dsh-llm-deepseek-api-key`、`deepseek-account → dsh-llm-deepseek-account`，锚点为各包内 `PROVIDER` 常量，随内核升级同步）；新增稳定原因码 `patch-layer-unresolved` / `preset-row-unparsable` / `preset-id-collision` / `model-selection-unparsable` / `model-selection-incomplete` / `model-selection-row-missing`；`settings.yaml` 不再是选择源。
3. **`preset:set` 源包迁移**：`dsh-agent-presets` → 后继 `dsh-agent-preset-registry`（E.2 provider 读其 package.json；E.2 设计 §3 同步修订）。这是「PMAP 适配」的必答项——不迁移则生产恒 `pmap-incomplete`，属「知道没有变成拦住」的反面。
4. **overlay 成为组成必需层**：上游 `loadOverlayPatches` 对 overlay 为 required 语义（缺文件=误配置），Sage 组合同样 fail-loud；PMAP 镜像该语义——缺 overlay → `patch-layer-unresolved`（preset/provider/model 三面 broken），E.2 在更早的 PMAP 阶段呈现 `pmap-incomplete`。原「缺失 overlay = `policy-document-unavailable`」断言按阶段语义更新：**文件缺失 = pmap-incomplete（composition 不可成立），读取被拒（EACCES 端口）= policy-document-unavailable**。
5. **证据纪律保持**：path-free（层标签为 `bundle:<包名>/<相对路径>` / `profile:<相对路径>` 形式）、白名单字段（`apiKeyEnv` 等非白名单 key 绝不进 evidence）、hostile `!!js` 不执行、digest 公式逐面冻结（goldens 全字面量）。

## Alternatives considered

| 方案 | 结论 |
| --- | --- |
| 保留目录扫描，迁移到新包的 presets/ 目录 | 否决；0.2.0 registry 不扫描目录/不收路径，声明行是唯一有效语义——扫描目录会观测到永不生效的「影子 roster」。 |
| 引 YAML 引擎做静态解析 | 否决；依赖面扩大，且块内 `!!js` tag 会面临真实求值风险；文本切片 + 稳定原因码已足够表达语义。 |
| settings 与行模型双读（过渡兼容） | 否决；0.2.0 已把 settings 一次性导入 profile patch——双读=双真源，分叉那天没人知道。 |
| `preset:set` 继续读 `dsh-agent-presets`，只登记不改 | 否决；包在 0.2.0 不存在，生产恒 pmap-incomplete。 |
| 只改 fixture 不查真实 generation | 否决；正是真实 generation 探针暴露了 E.2 源包缺口——fixture 写伪造包会让套件假绿（P-15 同类）。 |

## Consequences

- **红/绿**：pmap spec 先红（10/11 行为失败；agent 面 1 条按设计不变）后绿（11/11）——负控价值由红阶段直接证明；golden 全字面量冻结（preset golden artifact `5cdee46f…` / contract `c6bfd6e6…`）。
- **真实根双跑（隔离 generation `7592e8d0`）**：7 行全部 observed——provider `provider:deepseek-official`（源 `bundle:@deepseek-ai/dsh-base/cordis.patch.yml`）、model `model:deepseek-official/deepseek-flash`（base 行缺省）、agent `@0.2.0-rc.2`、preset `standard/ptc/minimal/cordis@system`（web-app `presets/*.patch.yml`，层序即产出序）；两次运行逐位相等；`find -newer` 零写入。
- **重建链验（同隔离根第三世代）**：`tsc` 重建 lib → 同根重物化 generation `56302c51`（598 解析/600 包）→ smoke **16/16 PASS**（protocolVersion=4、generation/manifest 双绑定、`/.sage` 404×2、traversal 403、shutdown 0）→ PMAP 探针 **7 行全 observed**、双跑逐位相等、`find -newer` 零写入——重建后的 lib 与 PMAP 内核在同一真实物化世代上闭卷。
- **E.2 goldens 重锚**（真实生产者探针实算后固化，探针已撤）：十三字面量中 receipt `651d9fc4…`、materialization `a764add1…`、instanceAuthority `f89a0aa2…`、mainObservation `95fe94ac…`、health `b8e770a0…` 更新；liveness `4dc75ed7…`、registrySnapshot `9f79f900…` 与 4 条 policy digest 独立未变；稳定对 `80f051cf…` / `126e9853…`；`preset:set` contract `f6ba8736…`（registry 包 exports）。
- **测试面**：`npm run typecheck` 0 错；全量 **613 pass + 1 opt-in skip（62 文件）**（换装基线 611 + 1；新增 pmap 行模型用例净值）。
- **插件体检（本票范围②，只读盘点）**：27 个 in-repo 包声明 `dsh.bundle`，7 个声明 `@deepseek-ai/dsh-*` peerDependencies。0.2.0 新门 `evaluatePluginCompatibility`（dsh-app-boot）对 dsh 族 peer 逐轴核 runtime 版本（`workspace:*`/`*` 过、旧 `^0.1.x`/`<0.2.0` 区间不过 → `skippedBundles`，Sage 组合 fail-loud）。**当前零 Sage 影响**：27 包全部 legacy 隔离，Sage profile bundle 仅 `dsh-base`+`dsh-web-app`；4 包区间排除 0.2.0（`dsh-deepresearch-local`、`dsh-loopx-plugin`、`dsh-auto-compact-local`、`dsh-agent-team-gui-local`）——未来装入 0.2.0 系 profile 需改区间或走 exact-version exemption。3 处 devDependencies `file:` 老 tgz pin（`vendor/dsh-desktop/vendor/dsh-runtime/0.1.2-rc.1/`：wanzh-hulian→dsh-mcp-client、deepresearch-local / agent-team→dsh-scope）为 dev-only、不被门评估、vendor 快照在位。
- **遗留**：运行态 effective（默认 preset 标记、enablement 求值）仍属 Host protocol 票（E.0 §2 登记不变）；rc.3/stable 增量核对触发即走；C2C 面 / optional bundles / client 栈 / 上游新桌面架构按 spec §8 索引。
