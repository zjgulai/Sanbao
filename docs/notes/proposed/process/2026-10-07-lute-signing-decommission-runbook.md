# 旧 LUTE 签名身份退役处置包（保留回退，未执行移除）

- 日期：2026-10-07
- 状态：退役（保留回退）——**未执行任何移除**；本文件是「将来要移除时」的执行前提与步骤
- 决策：[ADR-0272](../../../adr/ADR-0272.md) D7（用户裁决：退役但保留回退）；TCC 延续性背景见 [ADR-0063](../../../adr/ADR-0063.md)
- 收据：[交接记录 · 另列任务](../../implemented/process/2026-10-06-portable-cleanup-and-handoff.md#另列任务收据2026-10-07)

## 现状事实（2026-10-07 只读复核）

- 系统唯一 codesigning 身份：`LUTE Code Signing`，SHA-1 `BA3372A39BF4FE09E467AB8565CFB3A0166BABBE`（`security find-identity -v -p codesigning`）。
- Sage 产品链**不依赖它**：`packaging-sage/` 使用当次生成、有效期两天的 Sage 专属临时身份（`sign-local.sh`，签后回收信任与钥匙串）。
- 消费者全部在 legacy scope：
  - `packaging/assemble.sh:393`、`packaging/scripts/build-setup-app.sh:49`、`packaging/scripts/refresh-app-brand.sh:40`、`packaging/scripts/tcc-grant-status-test.sh:18`（`LUTE_SIGN_IDENTITY` 默认值）；
  - 文档 `packaging/README.md`（历史发布事实与 ADR-0063 的 TCC 延续理由）。
- 私钥与证书在系统钥匙串内，**未导出、未复制**；移除即不可恢复。

## 为什么保留（用户裁决）

- 回退价值：现有 DSH/LUTE 安装的 TCC 授权按证书叶延续（ADR-0063）——换身份意味着所有存量安装重新授权一次；保留身份 = 保留「同叶重签」能力。
- 已签名制品不受私钥去向影响（签名已固化在产物里），但**重签旧版本**只能靠该身份。

## 移除前提（全部满足才可执行）

1. legacy 发布线正式退役（不再需要重签任何历史版本），且该裁定已落 ADR；
2. 确认无待重签/待续签制品（含客户手上的历史 DMG 支持窗口）；
3. 所有者（用户）显式表决「销毁该身份」——本文件不等于授权。

## 移除步骤（未执行；执行时逐条留读数）

1. 记录指纹与依赖清单（本文件「现状事实」即模板），归档进当日 Note；
2. 在「钥匙串访问」中删除该身份（或 `security delete-identity -c "LUTE Code Signing" <keychain>`，按实际钥匙串）；不移交、不导出私钥；
3. `security find-identity -v -p codesigning` 复核已无该身份；
4. 复跑 `codesign --verify --strict` 抽查既有安装的产物（签名不受影响），并更新 `packaging/README.md` 的历史叙述指针。

## 影响清单

- 移除后：无法再以同一身份签名/重签；未来重新引入需新身份 + 存量安装重授 TCC。
- 保留期成本：钥匙串中一条自签身份 + 极小的文档维护面；无运行时成本。
