# DA-39 · 出货面 / 本机装配边界复核

- 优先级：P2
- 状态：`open`
- 依赖：无
- 估算：S
- 来源：ADR-0056 / ADR-0061 边界现状核对；DA-09 已复核 MGT 侧（09-21），本工单复核机制面

## Problem

两条边界规则依赖判据与人的配合，需例行复核（只减不增的纪律要有人推着走）：

1. **外部产品不进出货 preset**：`generate.mjs` 的 `PRODUCT_MOUNTS` 保持为空；任何 `file:`
   指向仓库外的包不得烘焙进 `agt-*` 出货组合（ADR-0056）；
2. **本机外部产品走 profile 本地装配**：`~/.dsh/profiles/<profile>/cordis.patch.yml` 显式挂载
   且包在 `dsh.profile.bundles`（ADR-0061）。

DA-09 复核过 MGT/preset 选择面（52 出货 + 4 不发），但 PRODUCT_MOUNTS 空置与
patch.yml 本机装配的**机制面**自落地后未再核。

## 动作

1. 核 `PRODUCT_MOUNTS` 现值（应为空）+ 扫出货组合配置里有无仓库外 `file:` 引用；
2. 核 profile 装配侧：本机 cordis.patch.yml 的挂载项与 `dsh.profile.bundles` 是否一致；
3. 评估「PRODUCT_MOUNTS 空置」是否有判据守（若只靠约定 = P-06 形态「用纪律守只有机制能守住的东西」，
   登记补判据提案）；
4. 结论三态：边界干净 / 有越界（处置）/ 有判据缺口（登记工单）。

## 验收

- 两面读数落盘（命令 + 输出：PRODUCT_MOUNTS 值、file: 扫描结果、patch.yml 对账）；
- 若有判据缺口：提案形态与成本写清（实施另开工单，本卡收口）；
- 与 DA-09 的复核记录互链，不重复结论。

## 只读复核（2026-09-23）

- 生成器 `scripts/role-presets/generate.mjs:496` 仍为 `const PRODUCT_MOUNTS = {}`。
- 出货白名单配置：AGT pattern 期望50，allow 为 lute-cordis / agent-fullstack；
  exclude 为 bobo-cto / mgt-001~003。这是选择配置，不是本轮重新打包的读数。
- 本机 desktop：42 bundles、27 个 file: 依赖。当前 file: 依赖均落在仓库或
  profile/vendor/packages 内；未见仓库外产品挂载。4 个具名 patch 节点中两个为
  已禁用插件且在依赖/bundles内；另两个为基座服务覆盖，不应套用“第三方包必须单独列出”的判据。
- 对50份 live AGT agent.cordis.yml 的 `file:` 与已知 kol-hunter 产品名扫描：
  0命中、0不可读。该搜索不是任意外部包识别，也不是出货副本完整性验证。
- 真实出货行判据已有 `preset-rows-resolvable-selftest`（gate.mjs:1312）；实跑
  `bash packaging/scripts/check-preset-rows-test.sh`：15通过、0失败，含解析面缺失和恒真桩反例。
  本轮未找到专门断言 PRODUCT_MOUNTS 必为空的测试，不能把出货行可解析当成空表守卫。

**结论边界**：当前装配未发现已知外部产品越界；没有重建/检查发布载荷，不宣称出货面完整验收。
剩余动作：在隔离的出货副本上运行真实行解析判据；评估给空表约束补一条负例，
不得为消除缺口而改动本机装配或增加豁免。本卡保持 open。

## 注意

- profile 侧属本机事实，读数注明日期与环境（profile 会被外部重同步还原——见装载点记忆）；
- 扫描 file: 时注意 pnpm-workspace 与 cordis.patch.yml 两个不同的装载语义，别混在一个 grep 里。
