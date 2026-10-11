---
title: v5 误装旧 input 与 macOS 元数据污染：修正记录与两道路径防线
doc_type: architecture
module: packaging-sage
topic: v5-input-path-and-metadata-correction
status: stable
created: 2026-10-12
updated: 2026-10-12
owner: self
source: ai
---

# v5 误装旧 input 与 macOS 元数据污染：修正记录与两道路径防线

## Problem

2026-10-12 首版 v5 链全绿（验收 passed=true、走查执行）后核对发现：**装的其实是 v4 内容**——
assemble 收到的 `--app-runtime packaging-sage/staging/input/app-runtime` 是**仓库相对路径**（照抄 README 示例），
而 produce 在 `PACKAGING_STAGING_ROOT` 覆盖下写的是 `~/.sage-packaging/staging/input`。仓内旧 input 残留
（Oct-11 v4 内容，校验全过）被静默装箱 → 签名、DMG、DMG-06 验收与用户走查全部落在 v4 内容上，且**每一步的
仪器都诚实报绿**（输入合法、签名合法、验收合法——被测物不是「当前构建」被任何判据锚定）。

修正链中还暴露第二个污染源：用户在 Finder 里浏览 `~/.sage-packaging` 取 DMG 时（03:12）生成的
`.DS_Store` 混入 `input/profile-template/`，触发 assemble 的 exact-shape 校验拒绝（produce 阶段的
`removeMacosMetadata` 只能清洗写时点；produce 之后的 Finder 写入无人清）。

## Decision

1. **重产修正版 v5**：备份错误产物（`Sage.app.wronginput-backup-20261012`、`…-v5-wronginput.dmg`），清理
   input 元数据，以覆盖根绝对路径重组装 → 重签（sha256 `e9493ac7…`，399,076,900 bytes）→ DMG-06
   `passed=true`（evidence 替换入仓）。
2. **防线一（路径）**：README 示例改为 `"$PACKAGING_STAGING_ROOT/input/…"` 并明示仓内相对路径在覆盖模式下
   指向陈旧残留 = 静默错箱。
3. **防线二（元数据）**：assemble.sh 在拷贝前对两个输入跑 `removeMacosMetadata`（复用 produce 同源模块，
   按名精确移除 `.DS_Store`、不可读即抛），打包树不再可能继承 macOS 元数据。
4. **走查与验收叙述更正**：手册 v5 段更新 sha/bytes + 修正记录；已装 `728013c2…` 的副本作废重装。

## Alternatives considered

| 方案 | 结论 |
| --- | --- |
| 仅重产+口头纪律 | 否决：同一陷阱会再踩；两条防线均为机制。 |
| 校验器容忍 .DS_Store | 否决：容忍=放行元数据进包；在拷贝前精确清洗更干净（produce 同源先例）。 |
| 删除仓内旧 staging 残留 | 未做（需点名授权）；两防线已使其无害，清理单列。 |

## Consequences

- 修正版 v5 = 真含 B/R17/L1 与启动失败面；错误产物留档可审计。
- 打包链两条路径有机制防线；README 与真实 env 模式对齐。
- 教训入 [pitfalls P-70](../pitfalls-playbook.md 见根文件)：**「构建产物」必须被内容锚定，不能被「输入合法」代替**。

## Verification

- 修正版验收：`dmg-06-acceptance-20261012-v5d2 passed=true`（sha `e9493ac7…`、installedTree `080b6453…`、清场四检全 true）；evidence 已替换 `evidence/2026-10-12-dmg06-v5-acceptance-result.json`。
- 包内容锚定：`Resources/app/lib/main/desktop-bundle.js` 含 `settings-shell` 标记（修正版为 1，旧箱为 0）。
- `bash -n assemble.sh` 语法过；门禁见提交记录。
