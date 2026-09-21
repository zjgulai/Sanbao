# 2026-09-21 · 更新器骨架 `dsh-update-local`（DA-10②，结构两步之二）

## Problem

计划 `docs/plans/2026-09-13-auto-update-route.md` §5「现在」行的第二步是**更新器骨架**：
只做「检查 + 提示有新版」，不做安装。它排在「现在」的理由与 feed 一样——人工交付阶段就有价值
（能回答「有没有新版」），且与签名身份无关。

①（feed 契约，ADR-0151）刚落盘，于是有了输入但没有消费方：应用里问不出「现在有没有新版」，
feed 是否可读、本机是哪一版、通道对不对，全都只能人工去翻。

## Decision

新建宿主插件 `packages/platform/dsh-update-local`：

- **只检查、只报告**：无下载、无写盘、无安装路径；工具 `upd_check`（只读）。
- **本机版本**取 app `Info.plist` 的 `CFBundleVersion` 后缀（装机值 `2.0.10-lute.2.5.0` → `2.5.0`），
  XML 文本解析（不用 `plutil` 子进程：测试在 Linux CI 跑，子进程依赖会把「读不出」与
  「机器没这个工具」混成一个读数）；二进制 plist 明确报出，不猜。
- **八态判定**：`update-available` / `up-to-date` / `feed-behind` / `channel-mismatch` /
  `feed-unreadable` / `feed-invalid` / `current-unreadable` / `current-not-lute`。
  读不到**绝不**折叠成「已是最新」。
- **交叉钉**：`lib/feed.js` 是消费侧实现（装载点上没有仓库脚本可 import），与生产侧
  `scripts/lib/update-feed.mjs` 由用例对钉——对钉的是**生产侧派生出来的 feed 的键序**，
  而不是某个内部常量；再加一张突变表验证两份判据结论一致。
- **装配**走 profile 本地（ADR-0061）：`~/.dsh/profiles/desktop` 声明
  `file:./vendor/packages/platform/dsh-update-local` + 列入 `dsh.profile.bundles`，
  vendor 与装载点两处副本各就位；重启应用后生效。

## Alternatives considered

- 直接接上下载与安装（把 ⑤ 提前）：否决——Developer ID 未采购时只会在用户机器上制造
  Gatekeeper 失败，换身份后这段还要重验。
- 判定返回布尔值：否决——「读不到」「通道不符」「本机是上游构建」互不相同，压成布尔必然
  把其中一种当成「没有新版」。
- 把判据抽成共享源让两侧 import：否决——两侧运行环境不同（生产侧在仓库里跑、消费侧随包物化），
  共享源要么让 profile 依赖仓库路径，要么构建期注入；交叉钉用例更直接。

## Consequences

- 落地读数（2026-09-21 实机，`node scripts/live-check.mjs`）：本机 `2.0.10-lute.2.5.0 → LUTE 2.5.0`；
  对回填快照 `up-to-date`、构造的更高版本 `update-available`（附 dmg / min_os）、
  构造的更低版本 `feed-behind`、坏形状 `feed-invalid`（点名 sha256）、404 `feed-unreadable`；
  真 Releases latest 也是 `feed-unreadable（HTTP 404）`——**机制后第一版才会上传那个附件**，
  这条正好是「读不到不等于最新」的第一现场。
- 判据：`node --test test/*.spec.mjs` 28/28（含恒真桩突变：把判据换成恒返回「已是最新」的桩，
  负向用例全红）。写测试时先跑桩实现拿到 **51 红 / 2 绿**，再换真实现转绿（红-绿真跑过）。
- 装配：装载点 `--check --loadpoint` 对本包零漂移（另 5 条 drift 是并发会话的 client.js 在制品）；
  profile 清单改动两行（依赖 + bundles），改前备份 `package.json.bak-pre-dsh-update-20260921`。
- 未做（如实）：应用内的**实际装载**未验收——需要重启应用（本会话不动用户的运行实例）；
  ③④（Developer ID + 公证 + TCC 重授）仍是外部前置，已提请用户决策。
- 详见：[ADR-0152](../../../adr/ADR-0152.md)
