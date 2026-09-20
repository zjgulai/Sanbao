# 首启轮播切片（换掉上游两张首启卡）

- 日期：2026-09-20
- 相关：[ADR-0139](../../../adr/ADR-0139.md)（薄壳：仓库 seed + 运行时物化）、[ADR-0011](../../../adr/ADR-0011.md)（受管包分组）、[ADR-0008](../../../adr/ADR-0008.md)（基座只 pin 不改）、[ADR-0136](../../../adr/ADR-0136.md)（Sanbao 品牌）
- 制品：`packages/surfaces/dsh-onboarding-carousel-local/`（包）、`apps/lute-shell/src/profile/layout.ts`（`COMPOSED_PACKAGES` 与物化计划）、`apps/lute-shell/src/profile/materialize.ts`、`packages/surfaces/dsh-onboarding-carousel-local/scripts/acceptance.mjs`

## Problem

用户要求删掉一启动就盖上来的两张卡（内测声明 + 添加 API Key），换成几页产品介绍轮播。
查证后确认这两张卡不是我们可控的产品内容，而是上游 `@deepseek-ai/dsh-client-ui-settings-models`
注册的 `settings.onboarding` 步骤（`welcome-notice` order -100、`deepseek-official` order 0）。

同时暴露出薄壳缺一环：**没有任何机制能把仓库里的包装进 profile**。手工塞 `node_modules` 会被
物化时的 `pnpm install` 按 lockfile 修剪掉（实测 +1 −64），不可复现。

## Decision

- **走官方坐位，不打补丁**：`settings.onboarding` 是公开 root 级 list 槽，设置壳一次只挂载「顺序第一个
  未完成的步骤」；我们的步骤 `order: -1000` 天然接管，不触碰任何上游 bundle（ADR-0008）。
- **走完写两个确认**：自己的 `sanbao-onboarding.introVersion`（durable，精确比对；改文案要升
  `INTRO_VERSION`）＋ 顺手把上游的 `ui-onboarding.welcomeNoticeVersion` 写掉，内测卡永不再现。
  上游版本常量在本包留一份副本，`src/onboarding-copy.test.ts` 对着 vendor 参照比对——上游升版本号即红测。
  API Key 那步靠 provider readiness 自隐。
- **薄壳新增组合包机制**：`COMPOSED_PACKAGES`（仓库根相对路径）+ 物化器把
  `package.json` / `cordis.patch.yml` / `lib` 拷进 profile 的 `.composed/<name>`，并在 profile 清单里追加
  `file:./.composed/<name>` 依赖与 bundle 条目；仓库 seed 保持干净（否则它自己的 lockfile 解不开）。
  加新包 = 往 `COMPOSED_PACKAGES` 加一行。
- **文案只承诺已有能力**：云端执行与邀请制账户落地前不写进轮播。

## Alternatives considered

- **打补丁把上游卡片隐藏**：被否——补丁面随升级漂移；替换「产品级声明」的正确姿势是坐位而非遮蔽。
- **手工把包塞进 profile `node_modules`**：被否——实测会被 pnpm 按 lockfile 修剪，且不可复现。
- **`cordis.patch.yml` 的 `insert` 条目**：被否——桌面组合层**静默忽略** insert（既有实测事实）；
  组合包机制走 `dependencies` + `dsh.profile.bundles` 两条目。
- **把自己的步骤 order 设为 0 或正值**：被否——必须低于上游 `welcome-notice` 的 -100 才能抢在它前面挂载。
- **不做 durable 确认、每次启动都显示**：被否——首启产品介绍应只出现一次，且要能跨重载保持。

## Consequences

- 新 profile 首次启动看到三页 Sanbao 介绍；走完后内测声明不再出现，重载后仍保持已确认。
- 「把仓库的包装进 profile」从一次性手工动作变成机制（物化器 + 清单派生），后续切片复用同一入口。
- 未闭口：**装机侧（DMG）未接线**——要把包装进本机 `~/.dsh/profiles/desktop` 会立刻影响日常在用的
  DSH Desktop，须用户点头后按发布 SOP 走；与三主题代码同树联调未复跑。
- **文案终审（2026-09-20）**：三页中英 + 三个按钮逐项裁决后**全部维持现状**（含英文）；
  零改动，故不升 `INTRO_VERSION`、无验收复跑。

## 证据（2026-09-20，composed preview 实机）

| 项 | 读数 |
| --- | --- |
| 包单测 | 20/20 + tsc + bundle 自检（`scripts/validate-build.mjs`） |
| 壳 | 79/79 + tsc + build |
| composed preview 实机 | 首启 15/15；对话框回归 26/26（`scripts/acceptance.mjs`） |
| 确认键 | `sanbao-onboarding.introVersion=2026-09-20.1`；同批写掉上游 `ui-onboarding.welcomeNoticeVersion`；重载后不再出现 |
| 上游版本哨兵 | `onboarding-copy.test.ts` 比对 vendor 的 `WELCOME_NOTICE_VERSION`（现值 `2026-08-13.1`） |
