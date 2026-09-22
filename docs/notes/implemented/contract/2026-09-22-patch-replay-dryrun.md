# 补丁重放干跑：runtime-guards 的逃生路径从未可用；升级动作语义修正

关联决策：[ADR-0008](../../../adr/ADR-0008.md)（基座只 pin 不改，补丁锚点为精确原文）、
[ADR-0056](../../../adr/ADR-0056.md)（打包与补丁面）

## Problem

`dsh-patches/*/apply-fixes.sh` 是升级后的标准动作（用户级 AGENTS.md：「升级后跑脚本，
不手工重打」），但**重放序列从未被完整执行过**——下次升级是它的实战首秀。2026-09-22
在 app bundle 完整副本上做四步干跑（rollback → 验缺席 → apply → 验回位），第一步就抓到
真缺陷：

**runtime-guards 的 `--rollback` 在任何机器上永远 ABORT。** `rollback_one` 对 `.orig`
备份直接跑 `node --check <路径>`——备份文件名不带 `.js` 扩展名（如
`electron-runtime-IsgfTki1.js.orig`），Node 的 ESM 加载器对未知扩展名直接抛
`ERR_UNKNOWN_FILE_EXTENSION`，校验恒失败 → 安全检查恒触发 → rollback 恒拒绝执行。
即「升级出问题想回滚」这条逃生路径**从未真正可用**。boot-health-retry 的 rollback
没有此问题，因为它不做语法校验直接还原——两个脚本安全姿势不一致恰是暴露点。
按总账归类：P-04（写了但从没跑到）——自测绿不了的场景没人跑过就发现不了。

## Decision

1. **修复**：`rollback_one` 改用脚本内已有的 `syntax_ok_text()`（apply 路径同款：
   内容写临时 `.js` 文件再 `node --check`，绕过扩展名解析）。修复后干跑四步全绿。
2. **升级动作语义修正**（干跑的第二个发现）：`--rollback` 从 `.orig` 整体还原原始字节，
   会把同一文件上的**其他补丁一并回滚**（实测：brand 改名「Sanbao 设置」被一并还原），
   而重放 `apply` 只重放本脚本自己的补丁。因此升级后的标准动作是：
   **新 app 按原补丁打序跑全部 apply 脚本**（幂等 + 锚点唯一保护），而不是
   逐脚本 rollback+apply。逐脚本 rollback 仅用于「确认文件回到原始字节」的诊断。

## Alternatives considered

- **删掉 rollback 的语法校验**（向 boot 脚本看齐）：否决——校验意图是对的（防止把
  损坏的备份复制回去），坏的只是实现方式；修实现不删意图。
- **给 .orig 改名加 .js 后缀**：否决——`.orig` 命名已被 9 个备份文件用开且是
  「原始字节」的语义标记，改名会让既有盘上备份与新脚本不兼容。

## Consequences

- rollback 逃生路径从「恒 ABORT」变为可用且带语法安全网。
- 干跑基线留档：四步序列 + 双脚本幂等读数在 DA-40 工单，可作下次升级的预期输出模板。
- 生产 app 未被触碰（全程 DSH_APP 指向副本）；`120e3` 看门狗时限检查归 EX-01 实机窗口。
