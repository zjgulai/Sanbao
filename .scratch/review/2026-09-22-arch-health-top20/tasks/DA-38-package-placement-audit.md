# DA-38 · 29 包 × 5 组归属审计

- 优先级：P1
- 状态：`needs-revalidation`（2026-09-23：包数量/进程面推论更正；不迁移方向保留，零错位未获全量证据）
- 依赖：无
- 估算：M
- 来源：2026-09-22 诊断读数⑤（图谱 10 层分析器视角 vs package.json 归属声明视角，零对账）

## Problem

「卡位是否正确」有两个视角从未对过账：

- **声明视角**：包在 `packages/<组>/<包>` 的物理位置（ADR-0011 五组：capabilities/surfaces/platform/contract/infra）；
- **分析器视角**：图谱 10 层（capabilities 569 节点 / surfaces 303 / platform 111 / contract 12 / infra 54
  / shared-runtime 6 / engineering-delivery 205 / documentation 256 / dsh-patches 298 / historical-artifacts 228）。

两个视角各自存在，但「某包物理在 platform 组、图谱行为特征却全是 UI 面」这类错位从未被检出。
卡位错位的代价：改动射程误判（changed-packages 按组归类治理规则）、职责蔓延无人察觉。

## 动作

1. 产出对账矩阵：29 包 × {物理组 / 图谱主要层 / 依赖方向（导入方向、服务消费方向）/ 治理性质
   （luteOrigin/luteOwner/lutePublish）}；
2. 判错位：物理组与行为特征系统性不符的包点名（例：dsh-theme-local 在 platform，但其 8 个导入方
   全在 surfaces 侧消费——是「平台服务」还是「UI 供给」要判）；
3. 每个错位包三选一：**迁移**（物理组挪位，改路径 + 同步 pin/profile + 门禁）/ **登记豁免**
   （理由写清）/ **改图谱分层口径**（若错的是分析器）；
4. shared-runtime 层仅 6 节点、contract 层仅 12 节点——顺带判这两组是否名存实亡（并组提案走 ADR）。

## 验收

- 对账矩阵落盘，29 包每包有归类结论；
- 迁移项完成（若执行）或登记豁免期限；并组提案（若提出）落 ADR 草案交用户拍板；
- 门禁 `package-identity` / `package-layout` 相关项复验绿。

## 注意

- 迁移是高扰动动作（file: 路径、profile 同步、vendor 分组全要跟）——错位但无害的，
  豁免登记优先于物理迁移；
- 图谱分层口径本身是 LLM 分析产物，先怀疑分析器再怀疑代码（P-01：别把分析误差钉成架构债）。

## 2026-09-23 计数与结论边界更正

先前“30个生产包、capabilities 8”计数撤回：受管采集器返回29个生产包，
加仓库根是30份 manifest；capabilities 为7，surfaces 10、platform 9、contract 2、infra 1。
无 manifest 的 dsh-memory-local 不应凑入受管分母。
另外“surfaces全部apply、platform全部宿主侧”的概括不成立：agent-team-gui
本身是宿主Service与客户端组合，root-brand宿主入口为no-op。物理组按职责划分，
不能按进程一刀切。旧矩阵仅作粗粒度线索，不是逐包全实现审计或“全绿”证明。
保持不迁移/不并组的当前方向，但若要断言零错位，仍需逐包完整证据审计。

## 结算（2026-09-23，EX-12 对账矩阵）

**盘点基线**：`git ls-files` 30 个受管包（capabilities 8 / surfaces 10 / platform 9 /
contract 2 / infra 1）。工单初稿写「29 包」系旧读数（packages/files-coverage 门禁口径 29
在册——差异来自一处盘上异常，见末尾）。

### 对账矩阵（物理组 × 治理三字段 × 行为特征）

| 组 | 包 | 治理 origin/owner | 行为特征判读 |
| --- | --- | --- | --- |
| capabilities | browser / deepresearch | internalized/@yuxianglin、@deepseek-ai | 客户端+工具能力，宿主插件 |
| capabilities | loopx / overseas-skills / overseas-tools / paper2skills / wanzh | self/lute | 技能与领域能力，宿主插件 |
| surfaces | agent-team-gui / task-board | internalized/@deepseek-ai、@etony668 | 客户端 UI 面（slot 注入） |
| surfaces | algo-skills / capability-hub / my-quotes / newapp / onboarding-carousel / qoder-sidebar / role-matrix / skill-center | self/lute | 客户端 UI 面（slot 注入） |
| platform | auto-compact | internalized/@deepseek-ai | 宿主侧运行时行为（自动压缩） |
| platform | cost-guard / file-upload / rename-conversations / root-brand / settings-shell / theme / ui-polish / update | self/lute | 宿主侧平台服务与外观面 |
| contract | preset-lint / skill-subset | self/lute | 校验与打包钩子（不面向用户） |
| infra | team-hub | self/lute | 多用户基础设施（web 服务） |

**判读**：`ctx.get` 消费面（service-consumption 登记处）、`plugin-entry-contract`
的 27 候选分布（apply 25 / service 2：deepresearch、agent-team-gui）与物理组**全部自洽**——
surfaces 的 10 个包全部走客户端 slot（apply 型），platform 的 9 个包全部宿主侧，
没有「物理在 A 组、行为特征全是 B 组」的错位。**错位项：零。**

### 工单立项假设的复核（P-01：先怀疑分析器）

- **「dsh-theme-local 在 platform 但 8 个导入方全在 surfaces」**：复核不成立——
  那 8 个「导入方」是图谱对 `presets.ts` 的 imports 边，**消费的是本包导出的模块**，
  而不是「依赖 theme 这个宿主服务」。theme 的宿主面是 `inject(['settings'])` 的
  settings 服务消费（已登记 service-consumption）——它提供外观能力给平台，
  位置正确。**图谱分层口径误读了包内聚合与跨包依赖的差别**（这正是判型三问第一问的应用）。
- **「shared-runtime 层仅 6 节点」**：图谱层不是包组（shared/ 目录里是同步源
  pair-access.ts 等，sync-shared 分发进各包）——「名存实亡」判读不成立，
  shared 是**分发机制**不是归属组。
- **「contract 组仅 12 节点（2 包）是否并组」**：判「不并」。contract 组的语义是
  「校验与打包钩子」（preset-lint、skill-subset），与 platform（面向用户的平台服务）
  是不同关注面；2 包的小体量不是并组理由（组数是语义划分不是容量划分）。

### 盘上异常登记（非仓库事实）

`packages/capabilities/dsh-memory-local/` 是**空壳目录**：只有 node_modules
（@deepseek-ai、@types、tsx），无 package.json、不在 git 跟踪、不在门禁任何射程。
判断为某次实验的本地遗留物。处置：不动（未跟踪目录不影响仓库事实）；
若未来清理本地环境时可删。**这不是仓库资产，故不构成「31 vs 30」的账目问题**
——受管包的权威计数以 `git ls-files` 为准（30）。
