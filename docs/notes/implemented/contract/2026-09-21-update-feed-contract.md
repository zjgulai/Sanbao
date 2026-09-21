# 2026-09-21 · 更新 feed `latest.json` 契约落地（DA-10①，结构两步之一）

## Problem

自动更新计划（`docs/plans/2026-09-13-auto-update-route.md` §5「现在」行）把「`latest.json` 生成 +
归档 + 门禁核对」列为**与签名身份无关、现在就能做且不白做**的第一步。当前仓库的现状是：
入库清单 `release/<版本>.sha256` 已有（ADR-0058），但**没有任何机器可读的「最新版本」读数**——
将来无论谁（更新器、官网、人工）想知道「现在该装哪版、那包的哈希是多少」，只能自己去翻仓库里的
清单文件，且没有任何判据保证那份读数与清单**没分家**。

同一条计划还写明 feed 的信任链分阶段升级（现在 HTTPS，Developer ID 之后加 Ed25519 签名），
因此这一步落地的形状必须**为签名留位**（有 `schema_version`、字段集固定），否则第二步要推倒重来。

## Decision

**D1：feed 契约 = `schema_version` + 10 个固定字段、固定顺序。** 文件 `release/<版本>.latest.json`
（每版本一份快照）+ 发布时另出 `latest.json`（最新指针）。字段与来源：

| 字段 | 来源 |
| --- | --- |
| `schema_version` | 常量 `1`（脚本写死，不是手填） |
| `version` / `dmg` / `sha256` / `build` / `source_commit` / `profile_snapshot` | 逐字段来自 `release/<版本>.sha256` 入库清单（ADR-0058） |
| `min_os` | 打包脚本从 app `Info.plist` 的 `LSMinimumSystemVersion` 读（§3 已校验产物签名后才读） |
| `channel` | 发布时 `LUTE_CHANNEL` 环境变量，默认 `stable`（枚举 `stable`/`canary`） |
| `notes` | 发布时 `LUTE_NOTES` 环境变量，默认空串 |

字段名 snake_case、键序固定为上述顺序，**未知字段判违规**——这是「为 Ed25519 留位」的具体形态：
将来加签名字段是一次公开的 schema 变更，而不是任何人往文件里悄悄塞一个键。

**D2：feed 只从清单派生，不手写。** 派生器住 `scripts/lib/update-feed.mjs`（`parseReleaseManifest`
→ `buildUpdateFeed`），发布脚本 `packaging/sign-and-dmg.sh` §7.5 调用它生成、`cp` 进归档、
§8 连同其他元文件一起 `uchg` 锁定并回读。生成器**写前自校验**（形状不过就不落盘），
对照侧 `checkFeedAgainstManifest()` 做六字段逐字段比对，消息里**两个读数都点名**
（`feed=…，清单=…`）——「分家」是这条契约唯一真正的故障形态。

**D3：判据两条进 quick 门禁。** `update-feed`（对 `release/` 下所有版本求值：最新版本必须已经有
feed 快照，更老版本没有则豁免〔机制引入前的历史〕；有则六字段核对；射程为空判红〔P-15〕；
读不到清单/feed 正文判红并点名，不静默）与 `update-feed-selftest`（22 用例，含恒真桩突变证明）。
`readRepoText`（缺失返回 `null`）而非 `readIfExists`（缺失返回 `''`）——「空文件」与「没有文件」
在判据里是两件事，这条在本轮**真的咬过一次**（见 Consequences）。

**D4：档案侧核对与恢复链同批接上。** `release-verify.sh` 有 feed 则核对 sha256/dmg/version 三项、
不符即 FAIL 并点名，无 feed 记 `无 feed（机制引入前）`（不是通过也不是失败，是如实分类）；
`release-verify-test.sh` 加 F1/F2/F3 三例（一致 / 哈希不符 / 无 feed）共 14 例全过；
`release-restore.sh` 的元文件循环把 `latest.json` 纳入。

**D5：本轮不做签名，也不做自动安装。** 不加 Ed25519、不加任何下载/安装路径——那两项分别等
Developer ID 与运行观察（计划 §3/§5）；本切片只交付「可核对的读数」。

**回填**：机制引入时对已发布的 2.5.0 用真实清单跑一次派生器生成 `release/2.5.0.latest.json`
（内容与清单逐字段一致，`notes` 写明是回填快照），使「最新版本有 feed」这条判据立刻有真射程。

## Alternatives considered

- **单文件 `latest.json`（无每版本快照）。** 否决：回滚（计划 §4）需要旧版读数仍在场；
  且「某一版当时对外宣告了什么」是可审计事实，覆盖写会让它消失。
- **feed 直接手写在发布说明里/手动维护。** 否决：那就是 P-48 的形态（构建机手写事实源），
  且与清单分家的概率随时间单调上升。
- **把判据写成「所有版本都必须有 feed」。** 否决：机制引入前的版本没有 feed 是历史事实，
  判据若全量要求，只会逼人回填或加豁免文件；改为「最新版本必须有」——语义是
  「从现在起，发布的每一版都要带」，无需豁免登记。
- **现在就加 Ed25519 签名字段（留空壳）。** 否决：空壳字段会被读成「已签名」，
  且私钥管理是独立决策（计划 §3 明确排在 Developer ID 之后）。

## Consequences

- 正面：任何消费方（更新器/官网/人工）读一个文件即可拿到「最新版本 + 哈希 + 最低系统 + 通道」，
  且该读数与入库清单**有机器判据保证一致**；为第二步更新器骨架（DA-10②）提供了稳定的输入契约；
  Ed25519 与自动安装都留了明确的接入位，不需要推倒。
- 代价（如实保留）：`min_os` 由打包机从产物读取，若产物 Info.plist 缺失该键则打包**中止**
  （宁可不发也不要发一份 `min_os` 为空的 feed）；`channel`/`notes` 走环境变量，
  发布时的实际取值由发布动作负责（SOP 已更新为两步 `git add`）。
- 过程教训（写进本 Note 以免复发）：判据首跑红在 `readIfExists` 返回 `''` 被当成「有 feed」，
  7 个版本各报一条「读不成 JSON」的假红——**门禁机制本身抓到了这个接线 bug**，
  这正是「先写判据再接仪器」的价值；修法是换 `readRepoText` 并留注释。
- 后续：DA-10② 更新器骨架（只做「检查 + 提示有新版」，不做安装）；Developer ID 之后加签名与
  自动安装（计划 §5 ③④⑤，独立决策项）。
- 详见：[ADR-0151](../../../adr/ADR-0151.md)
