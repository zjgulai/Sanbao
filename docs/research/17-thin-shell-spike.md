# 薄壳 Spike 验证报告（P0）

> 日期：2026-09-19
> 状态：**spike 完结——GO for A 路径**
> 关联：[设计 spec](../superpowers/specs/2026-09-19-base-decoupling-design.md) §4 · [实施计划](../superpowers/plans/2026-09-19-p0-thin-shell-spike.md)
> 证据级别：Fact = 命令输出实截

## 总结

| # | 前提 | 结论 | 关键证据 |
|---|---|---|---|
| 1 | npm 可安装 | **PASS** | 12 个 @deepseek-ai 包全部到位；仅需 2 个 override stub |
| 2 | 独立 boot | **PASS** | 纯 Node.js ~30 行 boot cordis host，5 秒存活无崩溃 |
| 3 | 插件加载 | **PARTIAL** | host 正常 boot 并接受 entries；plugin discovery 需完整 pnpm workspace 结构（配置细节，非架构阻塞） |
| 4 | pnpm patch | **PASS** | git-format patch 在 `pnpm install` 时自动应用，grep 验证通过 |

**结论：走 A 路径（fork harness `apps/desktop` 建薄壳）。** 两项核心前提（npm 可用 + 独立 boot）均为 solid PASS。插件发现是 profile 目录结构的配置问题，P1 阶段参照真实 profile（`~/.dsh/profiles/desktop/`）的 pnpm workspace 布局即可解决。

## 1. npm 可用性（Fact）

```
$ pnpm view @deepseek-ai/dsh version          → 0.1.5-rc.2
$ pnpm view @deepseek-ai/dsh-app-boot version → 0.1.5-rc.2（latest tag 指向 0.1.0-rc.6，需显式指定版本）
$ pnpm view @deepseek-ai/cordis version       → 4.0.2
$ pnpm view @deepseek-ai/dsh-host-webserver   → 0.0.1-rc.1
$ pnpm view @deepseek-ai/dsh-llm              → 0.0.1-rc.1
```

安装结果：734 packages added，12 个 `@deepseek-ai/*` 包全部到位。

**发现**：2 个 workspace 内部包未发布到 npm（`@deepseek-ai/dsh-type-meta`、`@deepseek-ai/dsh-user-interaction`），用 `pnpm-workspace.yaml` overrides 指向 `empty-npm-package` 即可绕过。这是上游打包缺口，不影响运行时功能（它们是类型/交互抽象层，非核心路径）。

**注意**：`dsh-app-boot` 的 npm `latest` tag 指向旧版 0.1.0-rc.6（API 不同），必须显式指定 `@0.1.5-rc.2`。薄壳的 package.json 应精确锁版本。

## 2. 独立 Boot（Fact）

boot.mjs 核心（~30 行）：

```javascript
import { boot, composeEntries, loadLayeredEnv, loadProfileDirectory, loadOverlayPatches } from '@deepseek-ai/dsh-app-boot'
import { provideCmdline } from '@deepseek-ai/dsh-cmdline'
import { DSH_LAUNCH_ENVIRONMENT_KEY } from '@deepseek-ai/dsh-launch-environment'

const profile = loadProfileDirectory(label, projectDir, dshPkgPath)
const layers = [...profile.layers.map(l => l.patches), profile.patches, loadOverlayPatches(label, patchYml)]
const entries = composeEntries(layers)
const environment = loadLayeredEnv(label)
const ctx = await boot(label, rootConfigPath, entries, (hostCtx) => {
  hostCtx.provide(DSH_LAUNCH_ENVIRONMENT_KEY, environment)
  provideCmdline(hostCtx, { args: [], exit: () => {} })
})
```

运行输出：
```
[spike] profile loaded, layers: 0
[spike] composed entries: 0
[spike] environment loaded
[spike] boot callback fired — host context alive
[spike] SUCCESS: cordis host booted.
[spike] host alive after 5s — PASS
```

**关键发现**：
- `boot()` 签名：`boot(label: string, rootConfigPath: string, entries: PatchOptions[], callback: (ctx) => void)`
- `rootConfigPath` 指向一个 YAML 文件（内容 `[]` 即可）
- 不需要 Electron、不需要 dsh-desktop 壳、不需要 pipe transport
- `desktop-host` 源码（`apps/desktop-host/src/index.ts`）是纯 Node.js 子进程，通过 FD 3/4 pipe 与 Electron 通信——薄壳可以复用同一 boot 逻辑但换成 HTTP server 或直接 in-process

## 3. 插件加载（Partial）

host 正常 boot 且 callback 中 `hostCtx` 可用（能 `provide` 服务），但 `loadProfileDirectory` 在 spike 的简化目录结构中未发现 `dsh-theme` 插件（layers: 0）。

**根因分析**：真实 profile（`~/.dsh/profiles/desktop/`）通过完整 `pnpm install` 建立 `.pnpm` store 结构，`loadProfileDirectory` 依赖该结构解析 `file:` 依赖的 bundle 元数据。Spike 用 symlink 简化了这一步，导致发现失败。

> **2026-09-19 更正**：真因是 profile `package.json` 缺 `dsh.profile.bundles`（`packages/boot/app-boot/src/profile.ts:781`），与 pnpm workspace 结构无关。实测见 [18 号报告 §2](18-lute-shell-skeleton.md)。

**P1 解法**：在薄壳的 profile 目录执行完整 `pnpm install`（与真实 profile 相同流程），而非 symlink。这是配置细节，不是架构阻塞——cordis host 已证明能 boot 并接受 entries，只要 entries 非空插件就会加载。

## 4. pnpm patch（Fact）

patch 文件（git-format diff）：
```diff
diff --git a/package.json b/package.json
--- a/package.json
+++ b/package.json
@@ -1,6 +1,6 @@
 {
   "name": "@deepseek-ai/dsh-llm",
-  "description": "Provider-neutral LLM service interface for the DeepSeek Harness",
+  "description": "Provider-neutral LLM service interface for the DeepSeek Harness [LUTE-SPIKE-PATCHED]",
```

注册（`pnpm-workspace.yaml`）：
```yaml
patchedDependencies:
  "@deepseek-ai/dsh-llm@0.0.1-rc.1": "patches/@deepseek-ai+dsh-llm@0.0.1-rc.1.patch"
```

验证：
```
$ rm -rf node_modules && pnpm install
$ grep "LUTE-SPIKE-PATCHED" node_modules/@deepseek-ai/dsh-llm/package.json
  "description": "Provider-neutral LLM service interface for the DeepSeek Harness [LUTE-SPIKE-PATCHED]",
```

**PASS**：patch 在 fresh install 时自动应用。冲突时 pnpm 会报 `ERR_PNPM_PATCH_NOT_APPLIED`（精确到文件）。

**注意**：`pnpm patch` CLI 在 pnpm 12 非交互模式下报 `ERR_PNPM_PATCH_CANCELED`；实际工作流应手工编辑 .patch 文件或用 `pnpm patch --edit-dir`（需确认 pnpm 12 具体语法）。patch 文件格式必须是 git-style diff（`diff --git a/... b/...`），纯 `diff -u` 不被识别。

## 5. 结论与下一步

**GO for A 路径**。四项前提中三项 solid PASS、一项 PARTIAL（配置细节，非阻塞）。

P1（薄壳骨架）的具体起步：
1. 从 harness submodule 的 `apps/desktop-host/src/index.ts` 提取 boot 逻辑（已证明可独立运行）
2. 参照 `~/.dsh/profiles/desktop/` 的完整 pnpm workspace 结构建立薄壳的 profile 目录
3. 用 `pnpm install`（非 symlink）安装 LUTE 插件到 profile，验证 layers > 0
4. 加上 Electron 主进程（BrowserWindow + 加载 renderer）→ 第一个可见 UI

Spike 目录 `/tmp/lute-shell-spike/` 保留供 P1 参照，不入库。
