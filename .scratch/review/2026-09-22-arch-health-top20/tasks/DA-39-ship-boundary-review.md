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

## 注意

- profile 侧属本机事实，读数注明日期与环境（profile 会被外部重同步还原——见装载点记忆）；
- 扫描 file: 时注意 pnpm-workspace 与 cordis.patch.yml 两个不同的装载语义，别混在一个 grep 里。
