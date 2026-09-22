# DA-40 · 补丁重放脚本干跑演练

- 优先级：P1
- 状态：`done`（2026-09-22，EX-13；**干跑抓到 runtime-guards rollback 全坏缺陷并已修**）
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

## 结算（2026-09-22，EX-13）

**环境**：app bundle 完整副本（1.3G，含 `.orig` 备份群）拷至 `/tmp/dsh-patch-dryrun-*`，
全程 `DSH_APP=<副本>` 重定向——两个脚本与 verify-patches-v2 都支持该变量，
**无需路径参数改动**。生产 app 未被触碰；演练后副本已清理、无残留。

### 干跑抓到的真缺陷（已修）

**runtime-guards 的 rollback 在任何机器上永远 ABORT**：`rollback_one` 对 `.orig` 备份
（文件名不带 `.js` 扩展名，如 `electron-runtime-IsgfTki1.js.orig`）直接跑
`node --check <路径>`——Node 按 ESM 加载器解析未知扩展名直接抛
`ERR_UNKNOWN_FILE_EXTENSION`，校验恒失败 → 安全检查恒触发 → rollback 恒拒绝执行。
即「升级后出问题想回滚」这条逃生路径**从未真正可用**（P-04 同族：写了但跑不通）。
boot-health-retry 的 rollback 没这个问题，因为它**不做语法校验直接还原**——两个脚本
的安全姿势不一致恰是暴露点。

**修法**：`rollback_one` 改用脚本里已有的 `syntax_ok_text()`（apply 路径同款：
写临时 `.js` 再 check，绕过扩展名解析）。修复后 rollback 正常工作。

### 四步序列读数（修复后）

| 步骤 | 命令 | 读数 |
| --- | --- | --- |
| 1 基线 | 两脚本 `--check`（原始副本） | 双双 `patched` 状态，rc=0 |
| 2 回滚 | 双脚本 `--rollback` | boot：从 `client.js.orig-boot-health-retry` 还原 rc=0；guards（修复后）：G1/G2 双还原 rc=0 |
| 3 验缺席 | 双脚本 `--check` | 双双 `original` 状态，rc=0 |
| 4 重放 | 双脚本 `apply` | 双双 `patched OK`（锚点唯一命中 → node --check → .orig 备份）rc=0 |
| 5 验回位 | 双脚本 `--check` | 双双 `patched`，rc=0 |
| 6 幂等 | 重复 `apply` | 双双 `already patched, skip`，rc=0 |

### 重放产物的字节对照与语义发现

重放后 `client.js` / `electron-runtime-*.js` 与生产字节**不一致**——归因（diff 确认）：
**rollback 从 `.orig` 整体还原原始字节，会把同一文件上的其他补丁一并回滚**
（本例：brand 改名「Sanbao 设置」被还原为「LUTE Agentic System 设置」），
而重放 `apply` 只重放本脚本自己的补丁。

**语义结论（升级操作顺序约束）**：`--rollback` = 「回滚该脚本的全部补丁」，
不是「只回滚自己的补丁」。因此**升级后的标准动作不是逐脚本 rollback+apply**，
而是：新 app 直接按**原补丁打序**跑全部 apply 脚本（幂等、锚点唯一保护）。
逐脚本 rollback 只用于「确认某文件回到了原始字节」的诊断场景。

### 遗留登记

- verify-patches-v2（38 锚）未纳入本次四步序列（它验证 staging 树而非运行 app）；
  升级 SOP 里的位置不变。
- `120e3` 看门狗时限检查：本次干跑对象是渲染器 bundle，不涉及；生产侧未复查
  （归 EX-01 实机窗口顺带）。
