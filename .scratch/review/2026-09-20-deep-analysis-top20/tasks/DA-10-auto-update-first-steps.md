# DA-10 · 自动更新路线第一步（「现在就能做且不白做」的两步）

- 优先级：P1
- 状态：`local-done`（2026-09-21 批次 E 结算：两步落地 `ff4d721`/`bf7438a`；Developer ID 决策＝暂不采购，见结算）
- 依赖：Developer ID 采购（独立跟踪）
- 估算：M
- 来源：docs/plans/2026-09-13-auto-update-route.md；报告 TOP20 #10

## Problem

该计划文档记录了自动更新路线的完整约束：**待 Developer ID**；换签名身份的代价（安装器身份变了 → TCC 权限需再重授一次）；公证链、feed 与信任链、灰度/回滚；并明确划出「**现在就能做且不白做**」的两步（先行的结构与清单面工作）。
当前状态：两步未排期，Developer ID 采购决策未落。

## 动作

1. 重读该计划 §「现在就能做的两步」，把它们拆成可执行任务并排进下一工作窗口；
2. Developer ID 采购与切换成本（TCC 重授一次）作为独立决策项提请用户；
3. 两步落地时各自的判据进 `gate --list`（可离线判的部分先行）。

## 验收

- 两步各自完成并留下真实读数；
- 若启动身份切换：产出 TCC 重授清单（哪些权限、怎么重授、客户通告文案）成文；
- 计划文档更新「已完成 / 未决」状态。

## 注意

不要提前实现依赖 Developer ID 的部分（会白做两次）；先做与身份无关的结构面。

## 排期裁决（2026-09-21）

用户拍板：**下一轮先做「结构两步」**（与签名身份无关的部分，见计划文档 §「现在就能做的两步」）；
Developer ID 采购作为独立决策项另行跟踪，本轮不动依赖它的部分（工单注意：不要提前实现依赖 Developer ID 的部分）。

## 结算（2026-09-21，批次 E）

**两步都已落地并留下读数；Developer ID 决策已提请并拍板「暂不采购」。**

### 1. 第一步：feed `latest.json` 管道（提交 `ff4d721`，ADR-0151）

- 契约：`schema_version` + 10 个固定字段、固定顺序、snake_case、未知字段判违规（为将来的
  Ed25519 签名字段留一次公开 schema 变更口）；六字段逐字段派生自 `release/<版本>.sha256`，
  `min_os` 读产物 Info.plist（缺键即中止打包），`channel`/`notes` 走发布环境变量。
- 派生器 `scripts/lib/update-feed.mjs`（写前自校验）+ `sign-and-dmg.sh` §7.5 生成、§8 随归档
  `uchg` 锁并回读；2.5.0 按真实清单**回填**一份快照，使判据自落地即有真射程。
- 判据 `gate:update-feed` + `update-feed-selftest`（22 用例含恒真桩突变）：最新版本必须已有
  feed（更老缺失＝机制引入前的历史，豁免），射程为空 / 读不到正文 / JSON 读不成一律判红点名。
- 档案侧：`release-verify.sh` 核对 sha256/dmg/version（无 feed 如实记「机制引入前」）、
  F1/F2/F3 三例 14/14、`release-restore.sh` 纳入、SOP 三处同批更新。
- **实现期门禁抓到一次真接线 bug**：`readIfExists` 对缺失返回 `''` 被当成「有 feed」，
  7 个版本各报一条假红 → 改用 `readRepoText`（缺失返回 `null`）。「空内容」与「没有文件」是两个读数。

### 2. 第二步：更新器骨架（提交 `bf7438a`，ADR-0152）

- 包 `packages/platform/dsh-update-local`（host-only）：版本口径 = app Info.plist 的
  `CFBundleVersion` 后缀（`2.0.10-lute.2.5.0` → `2.5.0`）；**八态判定**
  （update-available / up-to-date / feed-behind / channel-mismatch / feed-unreadable /
  feed-invalid / current-unreadable / current-not-lute），读不到绝不折叠成「已是最新」；
  工具 `upd_check` 只读，启动检查延后 20s、离线只记日志；**无下载、无写盘、无安装路径**。
- 判据：先跑桩实现拿 **51 红 / 2 绿**，再换真实现 **28/28**；交叉钉（消费侧 `lib/feed.js` 对钉
  生产侧**派生出来的 feed 的键序** + 同一张突变表 + 真实回填快照放行）；`typecheck` 收口两处
  JSDoc 契约（`ok:false` 被放宽成 boolean）。
- **真机读数**（`node scripts/live-check.mjs`，本机 `2.0.10-lute.2.5.0 → LUTE 2.5.0`）：
  回填快照 `up-to-date`、构造更高版本 `update-available`、构造更低版本 `feed-behind`、
  坏形状 `feed-invalid`（点名 sha256）、404 与真 Releases latest 都是 `feed-unreadable（HTTP 404）`
  ——机制后第一版才会上传那个附件，这条正是「读不到 ≠ 最新」的第一现场。
- 装配：profile 本地（ADR-0061）——`file:` 声明 + `dsh.profile.bundles` + vendor/装载点两处副本，
  装载点零漂移；profile 清单改动两行（改前备份 `package.json.bak-pre-dsh-update-20260921`）。

### 3. Developer ID 决策（动作 2）

**用户 2026-09-21 拍板：暂不采购，维持自签。** 含义：人工交付继续，更新器停在「检查 + 提示」
这一版；③④⑤⑥⑦ 全部挂起，重启条件是出现外部客户或跨机分发需求。代价已如实登记在计划 §0 与
「未决」一节（换身份时点越晚，需重授三项 TCC 的用户面越大）。

### 4. 验收对表

| 验收项 | 读数 |
| --- | --- |
| 两步各自完成并留下真实读数 | ① quick 门禁 `update-feed`/`update-feed-selftest` 绿（123 项基线）；② `live-check` 六态全符合预期，`node --test` 28/28 |
| 若启动身份切换 → 产出 TCC 重授清单 | **未启动**（决策：暂不采购），故不产出——不提前做依赖它的部分 |
| 计划文档更新「已完成 / 未决」 | 已更新：§5 表格两行 + 新增「未决」一节（含本次决策与重启条件） |

### 5. 未验收（如实）

- 更新器**在 app 内的实际装载**未读——需重启应用（本会话不动用户的运行实例）；
  重启后 `upd_check` 应能报出 `feed-unreadable（HTTP 404）`（真 Releases 尚无该附件）。
- 与 DA-06 的实机绿读数、DA-21 的实机读数同批欠着：都需要 app 带 `--remote-debugging-port=9333`
  重启且屏幕可见。
