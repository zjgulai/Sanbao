# DA-18 · 双基座回滚基线的显式维护

- 优先级：P2
- 状态：`open`
- 依赖：无
- 估算：S
- 来源：vendor/dsh-desktop.pin 注释；报告 TOP20 #18

## Problem

pin 文件注释原文：「运行时源（2.0.10 / 0.1.5-rc.2）…；`vendor/dsh-runtime/0.1.2-rc.1/` **仅作 2.0.5 回滚对照保留，不再被构建消费**。」
即回滚到 2.0.5 的路径目前只有一句「对照保留」的注释——**回滚剧本是否仍可执行从未验证**，且回滚面会随下次迁移继续扩大。

## 动作

1. 明确回滚语义二选一：① 保留可执行回滚（核对 2.0.5 回滚剧本完整性：runtime tgz 在场 + 补丁面版本 + 壳 fork 分支）；② 放弃回滚面（在 ADR 记录：升级不可逆 + 逃生路径=重装旧 DMG）；
2. 把结论写进 pin 注释或相邻文档，替换模糊的「对照保留」。

## 验收

- 两方向都有明确产出（剧本可执行或 ADR 废弃声明）；
- pin 注释与结论一致；若保留：`vendor/dsh-runtime/0.1.2-rc.1/` 完整性可核对。

## 注意

别用「应该能回滚」当结论；核对是遍历不是回忆（P-12 的教训：搜索沉默不是缺席证据）。

## 只读资产核验（2026-09-22）

本轮只校验恢复材料，不执行恢复、不切换 vendor 分支、不改 pin。原始汇总留在
`/tmp/sanbao-rollback-20260922.json`；恢复步骤仍以
[迁移记录 T-00](../../../../docs/research/13-upgrade-2.0.10-execution-plan.md) 为准。

| 检查面 | 方法 | 实际读数 |
| --- | --- | --- |
| 旧 fork 与 runtime | `git -C vendor/dsh-desktop show lute-v2.0.5:vendor/dsh-runtime/0.1.2-rc.1/manifest.json`，逐项 `git cat-file --batch` 复算大小与 SHA-256 | `lute-v2.0.5@4e23031e926de35898cf79500be49eedbdd27b9a`；242/242 个包匹配，0 缺失 blob |
| 当前 checkout 的旧 runtime | 对照上述 manifest 遍历实际目录 | `vendor/dsh-desktop/vendor/dsh-runtime/0.1.2-rc.1/` 只物化 2/242 个包；240 个不在工作目录，不能把 Git 中可恢复误称为已在位 |
| 仓库外备份 | 对 `pre-2.0.10-migration/SHA256SUMS` 的每项读取原文件并复算 SHA-256 | 6/6 匹配；包括 profile、settings、全量 dsh-home、热备与 pristine userData，以及升级用 2.0.10 DMG；最后一项不是旧版回滚 DMG |
| 旧 app 目录 | 读取 Info.plist；逐条复算 `DSH-Desktop.app-file-hashes.txt`，另枚举额外普通文件 | 版本 `2.0.5-lute.2.4.1`；42,871/42,871 个文件匹配，无额外普通文件 |
| 旧发行包 | 用仓库 `release/2.4.1.sha256` 核对 `packaging/release/2.4.1/` 中的 DMG | 636,801,473 字节，SHA-256 匹配 |

**结论边界**：恢复材料的字节完整性成立；当前工作目录不具备全量旧 runtime，启动成功、数据兼容性、TCC 授权以及恢复剧本的实际执行均未验证。保留或放弃可执行回滚的决策尚未作出，本卡仍为 `open`。
