# dsh-onboarding-carousel（Sanbao 首启轮播）

Sanbao 的第一屏产品介绍：三页轮播，接在**官方 `settings.onboarding` 坐位**上（`order: -1000`，
比上游的 `welcome-notice`(-100) 与 `deepseek-official`(0) 都靠前），因此宿主只会挂载我们这一张，
不需要改任何上游 bundle。

走完后一次做两件事：

1. 往自己的命名空间 `sanbao-onboarding.introVersion` 写确认（durable，版本号比对，改文案就升版本号）；
2. 顺手把上游「内测声明」的确认（`ui-onboarding.welcomeNoticeVersion`）写掉——`UPSTREAM_NOTICE_VERSION`
   是上游常量的副本，由 `src/onboarding-copy.test.ts` 对着 vendor 参照比对，上游一升版本号这条就红。

「添加一个 API Key」那步不归我们管：它按 provider readiness 自隐，产品里只要有可用 provider 就不会出现。

## 边界

- **不承诺未落地能力**：文案只写今天真实能做的事；云端执行、邀请制账户等落地前不进轮播。
- **不改上游**：没有资产适配器、没有补丁面；上游升级只会让 `welcome-notice` 的版本比对失配（一条红测），不会静默。
- **记不住就重来**：确认写失败（远端浏览器 memory 模式）时仍放行用户，错误记在 store 里给测试看，不挡路。

## 命令

```sh
pnpm install --ignore-workspace   # 本包自带锁文件，与仓库 workspace 无关
pnpm run test                     # vitest：文案/决策/分页/store 写入 20 例
pnpm run typecheck
pnpm run build                    # tsdown（host + client）+ scripts/validate-build.mjs 产物自检
```

实机验收（对着已打开的薄壳实例跑，需要 playwright-core）：

```sh
LUTE_PLAYWRIGHT_PACKAGE=<playwright-core 的 package.json> \
LUTE_DSH_HOME=<该实例的 DSH_HOME> \
LUTE_ONBOARDING_EVIDENCE=<证据落点> \
node scripts/acceptance.mjs
```

它会：新建空白会话 → 断言轮播接管首启面 → 翻三页 → 点「开始使用」→ 断言上游内测声明不出现、
两个确认都落到 settings.yaml → 刷新后不再出现。清掉 `sanbao-onboarding.introVersion` 即可重放。

## 待办（未完成，不得宣称）

- **产品组合面尚未接线**：目前只在隔离预览 profile 里用 `node_modules` 拷贝 + `dsh.profile.bundles`
  装配验证过；落地需要进新薄壳的 profile 组合与 DMG 打包清单。
- 文案终审：三页文案待 lute 审；改文案要同步升 `INTRO_VERSION`。
