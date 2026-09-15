---
name: "pnpm-upgrade"
title: "pnpm 升级"
description: "按九步升级 pnpm 工具链：查 registry 版本与完整性、预检 CI 引导路径、对齐 packageManager。触发词：pnpm 升级、pnpm self-update、packageManager、action-setup、CI 版本固定、pnpm-upgrade。何时不用：只升级 pnpm 这一条工具链本身（查版本、预检、对齐 packageManager、重钉 CI）；普通依赖的升级与审计用 dependency-updater，向外部仓库贡献代码用 make-repo-contribution。"
enabled: "true"
disable-model-invocation: false
user-invocable: true
---
# pnpm 工具链升级

按以下步骤升级 pnpm 与 CI 里的固定版本，不要用粗暴的全局查找替换。

## 步骤（在仓库根目录执行）

1. 解析目标 pnpm 版本
   - 在动手改本地工具链之前，先查 npm registry：`PNPM_VERSION=$(curl -fsSL https://registry.npmjs.org/pnpm/latest | jq -r .version)`。
   - 如果取不到版本号，中止。
   - 解析该版本包的精确完整性校验值：`curl -fsSL "https://registry.npmjs.org/pnpm/${PNPM_VERSION}" | jq -r .dist.integrity`。
   - 把结果存为 `PNPM_INTEGRITY`。
   - 如果完整性值缺失，或者不以 `sha512-` 开头，中止。
   - 把 `sha512-` 之后的 base64 摘要转成小写十六进制，例如：
     ```bash
     printf '%s' "${PNPM_INTEGRITY#sha512-}" | base64 -d | xxd -p -c 256
     ```
   - 把结果存为 `PNPM_SHA512_HEX`。

2. 找到目标 pnpm/action-setup 版本
   - 查 GitHub API：`curl -fsSL https://api.github.com/repos/pnpm/action-setup/releases/latest | jq -r .tag_name`。
   - 如果有 `GITHUB_TOKEN`/`GH_TOKEN` 就用上，以提高速率上限。
   - 存为 `ACTION_TAG`（例如 `v4.2.0`）。取不到就中止。

3. 把 action 的 tag 解析为不可变的 commit SHA
   - 执行 `git ls-remote https://github.com/pnpm/action-setup "refs/tags/${ACTION_TAG}^{}"`，把 SHA 记为 `ACTION_SHA`。
   - 如果解引用后的 tag 不存在，回退到 `git ls-remote https://github.com/pnpm/action-setup "refs/tags/${ACTION_TAG}"`。
   - 如果 `ACTION_SHA` 为空，中止。

4. 对该 release 与 CI 安装路径做预检
   - 执行 `node .agents/skills/pnpm-upgrade/scripts/preflight.mjs --version "${PNPM_VERSION}" --action-ref "${ACTION_SHA}"`。
   - 该脚本首先拒绝 `dependencies` 或 `devDependencies` 非空的已发布 pnpm manifest。pnpm 把运行时依赖打进包内，因此这些字段非空说明这是一次损坏的发布，例如 `pnpm@11.12.0`。
   - 随后它在各自独立的临时目录里复现 `pnpm/action-setup` 的两条安装路径：从 `pnpm-lock.json` 安装常规的 `pnpm` 引导包，从 `exe-lock.json` 安装独立的 `@pnpm/exe` 引导包，设置彼此隔离的 `PNPM_HOME` 目录，并把两个引导包分别自更新到 `PNPM_VERSION`。
   - 任何一步失败都中止升级。不要用直接本地安装绕过这道检查；预检存在的意义就是走通那条只在 CI 里跑的引导路径。

5. 在本地更新 pnpm
   - 执行 `pnpm self-update "${PNPM_VERSION}"`。
   - 如果 pnpm 不存在，或者自更新失败的原因仅仅是当前这套安装无法自我更新，则执行 `corepack prepare "pnpm@${PNPM_VERSION}" --activate`。不要用这个回退去绕过失败的预检。
   - 确认 `pnpm -v` 与 `PNPM_VERSION` 完全一致。

6. 对齐 package.json
   - 打开 `package.json`，把 `packageManager` 设为 `pnpm@${PNPM_VERSION}+sha512.${PNPM_SHA512_HEX}`（保留结尾换行与原有格式）。

7. 谨慎更新 workflow（不要用宽泛正则）
   - 涉及文件：`.github/workflows/` 下所有用到 `pnpm/action-setup` 的文件。
   - 逐个手工编辑：
     - 设为 `uses: pnpm/action-setup@${ACTION_SHA}`。
     - 如果存在 `with: version:` 字段，把它设为 `${PNPM_VERSION}`（保持原有引号风格与缩进）。
   - 不要碰无关的步骤。避免多行 sed/perl 单行命令。

8. 校验
   - 执行 `pnpm -v`，确认与 `packageManager` 里的版本部分一致。
   - 确认 `packageManager` 保留了精确的 `+sha512.${PNPM_SHA512_HEX}` 后缀。
   - `git diff` 确认改动只落在预期的 workflow 与 package.json 上。

9. 后续
   - 如果改动了运行时代码、构建或测试配置（本流程里通常不会），执行 `$code-change-verification`；否则做一次轻量检查即可。
   - 用 `chore: upgrade pnpm toolchain` 提交并开 PR（自动化流程可能会代劳）。

## 说明

- 需要的工具：`curl`、`jq`、`base64`、`xxd`、`node`、`npm`，以及 `pnpm`/`corepack`。缺了就装。
- 改动保持最小且可读 —— 优先逐个文件显式编辑，而不是全局替换。
- GitHub Actions 必须固定在 commit SHA 上，而不是 tag 上。最新 release tag 只用来找到该固定到哪个 commit SHA。
- 如果 GitHub API 触发速率限制，带 token 重试或直接放弃，不要靠猜 tag。
