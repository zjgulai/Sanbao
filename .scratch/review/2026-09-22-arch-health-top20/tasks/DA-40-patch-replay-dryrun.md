# DA-40 · 补丁重放脚本干跑演练

- 优先级：P1
- 状态：`open`
- 依赖：无
- 估算：S
- 来源：用户级 AGENTS.md 约定（「升级后跑脚本，不手工重打」）；38 锚验证过但重放脚本本身从未干跑

## Problem

`dsh-patches/boot-health-retry/apply-fixes.sh` 与 `dsh-patches/runtime-guards/apply-fixes.sh`
是 app bundle 上 lute 补丁的**重放脚本**——升级后的标准动作就是跑它们。但现状：

- 38 个补丁锚点验证过（`verify-patches-v2.sh` ALL VERIFIED）——那是**已在位补丁**的核对；
- **重放脚本本身从未干跑过**：升级后第一次跑它就是它的第一次执行（P-04 形态）。

下次升级是重放脚本的实战首秀，风险集中在：脚本对当前 bundle 状态的前置假设、
restore/apply 的幂等性、失败中断后的半完成态。

## 动作

1. 备份当前 app bundle（或用归档的 pristine userData 副本）；
2. 干跑序列：`restore`（回滚全部补丁）→ `verify`（锚应全部缺席）→ `apply`（重放）→
   `verify-patches-v2.sh`（38 锚 ALL VERIFIED）；
3. 记录每步退出码与输出；重点观察：restore 对未打补丁状态的行为（幂等？报错？）、
   apply 中断恢复路径；
4. 干跑后 app 启动一次（lifecycle 读数）确认补丁面功能完好。

## 验收

- 四步序列全读数落盘；38 锚终态 ALL VERIFIED；
- 幂等性结论明确（重复跑 restore/apply 的行为）；
- app 启动正常读数；环境恢复原状（哈希核对）。

## 注意

- 在 app bundle 副本上做（`cp -R` 后改路径），不动 `/Applications/DSH Desktop.app` 本体；
- 若脚本硬编码了 bundle 路径：干跑方式改为「先备份生产、生产上跑、立即核对恢复」，
  或给脚本补路径参数（改动过门禁）；
- 盘上见 `120e3` 看门狗时限 = 止痛贴复发信号，顺带检查（用户级 AGENTS.md 约定）。
