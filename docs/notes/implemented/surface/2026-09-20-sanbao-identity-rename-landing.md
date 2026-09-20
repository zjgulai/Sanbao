# Sanbao 改名落地（身份表 / 数据目录 / 显示名 / 重签）

- 日期：2026-09-20
- 相关：[ADR-0147](../../../adr/ADR-0147.md)（本轮决策）、[ADR-0136](../../../adr/ADR-0136.md)（品牌名源与派生物）、[ADR-0080](../../../adr/ADR-0080.md)（运行中替换 app bundle 红线）、[ADR-0068](../../../adr/ADR-0068.md)（TCC 与签名身份）
- 制品：`dsh-patches/app-identity-sanbao/`、`packaging/scripts/migrate-app-data-dir.sh`、`dsh-patches/brand-replay-strings.py`、`dsh-patches/brand-replay.sh`（块 1 重写 / 块 2b / 块 3b）

## Problem

产品名已定为 Sanbao（名源 `shared/client/sanbao-brand-source.ts` 与派生物在上一片完成，ADR-0136 D2），但**本机装机 app** 还整片是旧名：

- 显示面（窗口标题、通知、托盘、恢复模式、安装向导、CLI 帮助）是 `LUTE Agentic System` / `DSH Desktop`；
- 身份表 `productName` 是 `DSH Desktop`，Electron userData 指向 `~/Library/Application Support/DSH Desktop`；
- 四条既有落地工具（身份补丁 → 数据迁移 → 品牌重放 → 重签）从未成套执行过，真机首次执行即连撞三处缺口：
  1. 品牌重放的「9 文件清单」漏了 8 个带品牌的文件（真机 93 个文本文件里 21 个带名）；
  2. 上一位品牌名只报不改——显示名块 PREV 分支在 `--apply` 下也报 DRIFT 不动手；`index.html` 的替换锚写死上游名，PREV 态 `replace` 不命中**却打印 `patched`**；
  3. helper 与 CFBundleName 的匹配从未被核对（旧目录名写死首代名）——外层已是 Sanbao、helper 还是上一位的名字，应用启动 **17ms 崩 `FATAL: Unable to find helper app`**。

## Decision

按 [ADR-0147](../../../adr/ADR-0147.md) D1–D5 执行：**四步成套**（身份表 → 数据迁移（只复制不删除）→ 显示名/Helper/Info.plist 重放 → 同身份重签）；品牌重放**退役文件清单、改扫描式**（app 本体文本文件 + 曾用名清单 + 按行豁免显式报 SKIP）；**helper 四处一起换**且认曾用名；写路径**默认带落笔后校验**；bundle 目录名、`appId`、签名身份不动。

## Alternatives considered

- **只改显示名、保留身份与数据目录**：改完 app 叫 Sanbao 而数据目录仍叫 DSH Desktop。用户拍板「连数据目录一起换（要迁移）」——名字干净是目标，半套改名是半成品。
- **数据目录迁移用 mv**：选了「只复制不删除」——旧目录是回滚后路，代价是 510M 磁盘。
- **补全文件清单而不是改扫描式**：被否。清单的历史故障模式就是「随基座升级继续漏」，而 `--check` 对清单外漂移完全盲——扫描是机制（ADR-0114 门禁文化）。
- **扫描面把 node_modules 也纳入**：被否。app 内 node_modules 是第三方/官方包，改它们要 vendor 化且会被重装覆盖；列为已知边界（ADR-0147 D5）。

## Consequences

- 本机 app：显示名/身份/数据目录/Helper 全部为 Sanbao；`verify-patches-v2` 从 DRIFT 翻 **ALL VERIFIED**；TCC 双授权（辅助功能 + 屏幕录制）保持「身份型（绑证书）→ 本 app 满足」。
- 旧数据目录 `~/Library/Application Support/DSH Desktop` 保留为备份（未清理，待人工确认后处置）。
- app 内 node_modules 的第三方/官方包仍含 "DSH Desktop" 字样（已知边界，需 vendor 化才能清）。
- 回归网：`dsh-running-test.sh` 新增 R6d（修掉 `--any` 的 `index()` 撞号假阳性——它曾让 quit 后的轮询 24 秒不收敛）、`brand-replay-test.sh` 新增 T1–T7（扫描面/曾用名/豁免逐字节不变）与 U1–U3（helper 曾用名识别）。

## 证据（2026-09-20 真机）

| 项 | 读数 |
| --- | --- |
| 身份表 | `bin.js` / `profile-manager-Dr…js`：DSH×0 / Sanbao×1（`--check`） |
| 数据迁移 | 旧 317 文件 → 新 317 文件（rsync 只复制；旧目录保留） |
| 品牌重放 | 扫描 93 个文本文件；第一轮落笔 20 个文件、第二轮 helper ×4；收尾 `BRAND ALL VERIFIED`；曾用名 `--check` 0 DRIFT |
| 重签 | `codesign --verify` rc=0（Authority=LUTE Code Signing，Identifier 未变）；`tcc-grant-status.sh`：2 项授权有效、无死授权 |
| 启动 | lifecycle `startup.run.completed / health-commit / rendererStatus=healthy` 写入 **Sanbao** 目录；日志尾行 `dsh-plugin-desktop Sanbao 2.0.10`（此前全部为 DSH Desktop） |
| 补丁判据 | `verify-patches-v2.sh`：`PATCHES v2 ALL VERIFIED`（40 条含两条 identity 判据） |
| 测试 | `dsh-running-test.sh` 11/11；`brand-replay-test.sh` 18/18；品牌派生物 3/3 与名源一致 |
| 残留 | app 本体（排除 node_modules/备份）`DSH Desktop` 0 处、`LUTE Agentic System` 0 处；Info.plist 与 index.html title 均为 Sanbao |
