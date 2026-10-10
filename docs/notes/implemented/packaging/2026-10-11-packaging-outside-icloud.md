# 构建根外迁：iCloud 同步域干扰的根因与修复 + 新链 DMG-06 v3 验收

- 日期：2026-10-11
- 决策：[ADR-0292](../../../adr/ADR-0292.md)
- 状态：已实施（迁移覆盖 + 归一化防御 + 全链重建 + 验收通过）；B 版会话干跑与真实模型调用验收登记未闭（见 ADR-0292 D3）。

## Problem

新链重建批中，producer 连续以两类守卫失败：profile-template 精确条目校验（顶层出现多余 `.DS_Store`）与 runtime-artifact attestation 树稳定守卫（`installed artifact directory changed while it was inspected`）。根因：仓库检出位于 iCloud Drive 管辖（Desktop & Documents 同步），`bird` 在构建期向新目录写 `.DS_Store`（实测一个残留目录 8 个）。`com.apple.fileprovider.ignore#P` 不随子目录继承（实测），不可维护。

## Decision

1. `PACKAGING_STAGING_ROOT` / `PACKAGING_RELEASE_ROOT` 单一家环境覆盖：common.sh（导出）、scripts/lib.mjs 的 `ownedPackagingRoots()`；全部触碰点接入（produce、四个写入器、accept-dmg 默认值、signing-normalized-tree、producer 合同测试）。
2. producer 校验前 `removeMacosMetadata()`（仅 `.DS_Store`，计数入库日志）作纵深防御。
3. 本机链条以 `PACKAGING_STAGING_ROOT=$HOME/.sage-packaging/staging` 构建（同步域外）。

## Alternatives considered

- fileprovider xattr / 自动重试 / 整仓迁移 / 并入 accept-dmg——见 [ADR-0292](../../../adr/ADR-0292.md) 备选表。

## Consequences

- 本机重建确定性恢复：全链（produce→assemble→sign→dmg→acceptance）EXIT=0 一次通过。
- 普通检出零变化；覆盖是本地运行契约扩展。
- 未闭：B 版会话干跑（等 WT-02B.2B 登录）；真实模型调用验收（等用户授权）；仓内旧 `packaging-sage/staging` 残留待清理（构建已不再写入）。

## Verification

证据（2026-10-11，全部真实执行；未跑的照实写）：

- **produce**：`PACKAGING_STAGING_ROOT=$HOME/.sage-packaging/staging` + v10 store 口令 → EXIT=0（runtime 1910 文件、profile 27743 文件；`production inputs ready`）。
- **assemble**：EXIT=0 → `~/.sage-packaging/staging/Sage.app`（29,911 文件参与签名巡检）。
- **sign-local**：EXIT=0——临时 Sage 身份（SecurityAgent 信任增/移两弹窗均经用户批准）、`signer verified`（certificate sha256:ad7ae138…）、信任与临时钥匙串已移除。修复前一处遗漏站点（write-signing-receipt 白名单）被本链暴露并修掉。
- **dmg**：EXIT=0 → `Sage-0.1.0-internal-arm64.dmg`，**sha256 `052c3970bdf53e99…`**（完整值见入仓证据）。
- **acceptance（DMG-06 v3）**：`sage.packaged-acceptance.v1 passed=true`（fresh-root 首启 + same-root restart + 六截图 + detach/cleanup 全绿）；脱敏读数入仓 [evidence](evidence/2026-10-11-dmg06-v3-acceptance-result.json)。
- **producer 合同测试**：3/3 PASS（含 bundled-profile install/reuse 合同）。
- **门禁**：`pnpm run gate` **32/32（objects 319/319，exit 0）**；首跑 31/32 为 `business-matter-event-store-process` 进程类时序红（验收重负载后立即跑门禁；隔离复跑 20/20 绿 + 复跑门禁全绿）——非本刀回归。（首跑另指出 ADR-0292 未入索引——已补。）
- 未运行：会话流干跑（设计见 ADR-0292 D3；A 版与既有 unavailable-first 证据重叠、B 版被登录阻塞——独立成刀）；真实模型调用。
