# P1 薄壳骨架 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在仓库内建出 `apps/lute-shell/`——一个自有的 Electron 薄壳，用 npm 上的 harness 运行时（`@deepseek-ai/dsh-*@0.1.5-rc.2`）启动 cordis host 子进程，并在窗口里显示 harness 默认 UI，全程不碰 `vendor/dsh-desktop` 与线上 profile。

**Architecture:** 两个进程、两条模块解析域。Electron 主进程注册特权 scheme `dsh-app:`，把请求经 FD3/FD4 二进制管道（DSH3 帧协议 v3）转给宿主子进程；宿主子进程用纯 Node 跑 `boot()` 组装 cordis host，按 pathname 把请求分给 gateway 流、connection 的 `/api` fetch handler、`dsh-web-frontend/dist` 资产处理器。**宿主运行时就位在 profile 内**（`<profile>/lute-host/`），使其 `@deepseek-ai/*` 裸导入解析到 profile 唯一一份 hoisted node_modules——否则会加载第二份 cordis 实例，服务身份跨边界断裂。profile 由仓库内的 seed 物化到 `~/.dsh/profiles/lute-shell/`。

**Tech Stack:** TypeScript 5.6（tsc → `lib/`，ESM + NodeNext）、Node `^22.19 || >=24`、Electron 43.3.0、pnpm（`apps/lute-shell` 是独立 pnpm 项目；仓库根**不**引入 workspace，遵 ADR-0011）、vitest 4、cordis 4.0.2 + `@deepseek-ai/dsh-*@0.1.5-rc.2`。

**Spec:** [docs/superpowers/specs/2026-09-19-base-decoupling-design.md](../specs/2026-09-19-base-decoupling-design.md) §3 §5（P1 里程碑）· 前置证据 [docs/research/17-thin-shell-spike.md](../../research/17-thin-shell-spike.md)

## Global Constraints

以下每条对**所有** task 生效，值逐字复制自 spec 与本次取证：

- **harness 版本**：全部 `@deepseek-ai/dsh-*` 精确锁 `0.1.5-rc.2`，`@deepseek-ai/cordis` 锁 `4.0.2`，`@deepseek-ai/cordis-plugin-include` 锁 `1.0.7`。**禁用 `^` 与 `latest`**：`dsh-app-boot`/`dsh-cmdline`/`dsh-host-webserver`/`dsh-client-connection`/`dsh-client-modules`/`dsh-api-gateway`/`dsh-launch-environment`/`dsh-web-frontend` 的 npm `latest` tag 指向旧的 `0.0.1-rc.*` 线（P0 已踩过一次），只有显式版本才拿到 `0.1.5-rc.2`。
- **未发布内部包**：`@deepseek-ai/dsh-type-meta` 与 `@deepseek-ai/dsh-user-interaction` 在 npm 上是 404（实测），两个 pnpm 项目（`apps/lute-shell/` 与 `seed/`）都必须用 `overrides` 指向 `npm:empty-npm-package@1.0.0`。
- **`@deepseek-ai/dsh-desktop-host` 不存在于 npm（404，实测）**：宿主进程是本仓自有源码，不是依赖。
- **Electron**：精确锁 `43.3.0`（与 `vendor/dsh-desktop/dsh-plugin-desktop/package.json:294` 同版本，减少 renderer 分歧）。
- **协议常量必须与 submodule 参照一致**：magic `0x44534833`、版本 `3`、header `13` 字节、请求 FD `3`、响应 FD `4`、IPC FD `5`、数据帧上限 `64 * 1024`、控制帧上限 `1024 * 1024`。参照 `vendor/dsh-desktop/deepseek-harness/apps/desktop-host/src/wire.ts:4-17` 与 `apps/desktop/src/host-protocol.ts:4-20`。
- **拷贝代码署名**：帧协议改写自 MIT 的 harness（`vendor/dsh-desktop/deepseek-harness/LICENSE`，Copyright (c) 2026 DeepSeek），署名必须落在 `apps/lute-shell/THIRD_PARTY_NOTICES.md`。
- **不改插件源码**：`packages/**` 一个字节都不动（spec §5 约束，也是 P2 的前提）。
- **不碰参照与线上**：不写 `vendor/**`，不写 `~/.dsh/profiles/desktop/`，不动 `/Applications/DSH Desktop.app`。新 profile 只落 `~/.dsh/profiles/lute-shell/`。
- **无头安全**：`typecheck` / `test` / `smoke` 都不得启动 GUI；图形界面只在 Task 8 的人工验收步骤显式启动。
- **仓库无 pnpm workspace**：根目录**不得**新增 `pnpm-workspace.yaml`（ADR-0011；`scripts/gates/changed-packages.mjs:61` 明文记录仓库没有该文件）。`apps/lute-shell/pnpm-workspace.yaml` 是独立 pnpm 项目的自有文件，不是仓库级 workspace。
- **提交纪律**：工作树长期有并发会话在制品（capability-hub / skill-center / role-matrix 等未提交）。**只 `git add` 本 task 列出的文件**，禁止 `git add -A` / `git add .`。
- **`.gitignore` 是白名单式**（第 14 行 `*`）：新增 `!apps/**` 的同一次提交里 `apps/lute-shell/` 必须已在磁盘上存在，否则门禁 `gitignore-whitelist`（`scripts/gate.mjs:326`）报红；`apps/lute-shell/lib/` 必须显式忽略，否则 `index-drift`（`scripts/gate.mjs:415`）会因 tracked+ignored 漂移报红。
- **错误信息前缀**：一律 `lute shell: `（上游用 `dsh desktop: `）。
- **注释纪律**：默认不写注释；只在「为什么」不显然处写一行（隐藏约束、协议常量来源、与上游的差异点）。

## 本次取证确立的关键事实

计划从这里推论，执行者不必重新调研（每条都给了可复核的引用）：

1. `loadProfileDirectory(binName, dir, installAnchor)` **只读** `<dir>/package.json`，layers 的唯一来源是 `manifest.dsh.profile.bundles`（`packages/boot/app-boot/src/profile.ts:774-804`，bundles 读取在 `:781`）。缺字段或空数组 ⇒ `layers: []`。**这推翻了 P0 报告 §3 的根因猜测**（不是 pnpm workspace 结构问题，也不需要 symlink → 完整 install 才能发现插件）。
2. 零 bundle 时 boot 必抛 `composition did not provide connection, typertGateway, and clientModules`（`apps/desktop-host/src/index.ts:298-304`）。spec §5 的「空 profile 正常」= **无 LUTE 插件**，仍须含 `dsh-base` + `dsh-web-app`（上游 `DESKTOP_PROFILE_BUNDLES`，`apps/desktop/src/project-manager.ts:105`）。
3. 桌面路径无 HTTP 端口：上游 overlay 关掉 `web-startup`/`webserver`/`web-runtime`/`client-hmr`/`open-in-app`/`ui-open-in-app`/`directory-picker`（`apps/desktop-host/config/desktop.cordis.patch.yml:3-22`）；UI 是预构建 Vite 包 `@deepseek-ai/dsh-web-frontend/dist/index.html`，由 `assetHandler` 从 profile 的 node_modules 解析（`apps/desktop-host/src/index.ts:186-188`）。
4. `boot()` 是纯库函数：不碰 `process.argv/exit/stdout`、不装信号处理器（`packages/boot/app-boot/src/index.ts:787-834`）；`installFailLoud` 只由 CLI bin 选用（`apps/cli/src/profile-boot.ts:310-311`）。签名 `boot(binName, absoluteConfigPath, patches?, prepare?, bareModuleBaseUrl?)`。
5. `prepare` 回调只做两件事：`hostCtx.provide(DSH_LAUNCH_ENVIRONMENT_KEY, environment)` 与 `provideCmdline(hostCtx, {args: [], exit: () => {}})`（`apps/desktop-host/src/index.ts:292-296`）。`launchEnvironment` 下游可选（`packages/util/launch-environment/src/index.ts:106-117` 有 env 快照兜底），`cmdlineArgs` 在桌面 overlay 关掉 `web-startup` 后无注入者。**必需**服务只有 `connection`、`clientModules`、`typertGateway`。
6. shipped 前端 `dsh-web-frontend/dist` 里 `dshDesktop`、`ownsHost`、`__DSH_TRANSPORT__` 字面量出现次数均为 **0**（实测 `grep -ro`）：客户端 bundle 是运行时经 `/plugins/*` → `ctx.clientModules.fetchBundle` 取的（`apps/desktop-host/src/index.ts:200`）。**结论：P1 不需要 preload 脚本**；上游 `window.dshDesktop`（`apps/desktop/src/preload-app.ts:1-5`）是其壳私有，harness UI 不读。
7. 注入脚本必须保留 `ownsHost: true`：客户端用它判 loopback（`packages/client/connection/src/client/index.ts:227`：`isLoopback: transport?.ownsHost === true || …`）。
8. 上游那段 `agent-presets` 系统根注入（`apps/desktop-host/src/index.ts:166-175`，指向 `<dsh>/config/agent-presets`）**对 npm 消费者是冗余的**：`@deepseek-ai/dsh` 的 tarball `files` 只有 `lib/*.js`，没有 `config/`（实测）；shipped presets 打在 `dsh-agent-presets` 包内、由 `includeShippedRoot`（默认 `true`，`packages/preset/agent-presets/src/index.ts:110,179`）提供，人写的 `$DSH_HOME/.agent-presets` 由 `includeUserRoot` 自动纳入（`packages/bundle/web-app/cordis.patch.yml:474-485`）。**P1 整段跳过该注入。**
9. bundle 的依赖全部是 `^0.1.5-rc.2`（实测 `pnpm view @deepseek-ai/dsh-web-app@0.1.5-rc.2 dependencies`），`dsh-web-frontend` 也在 `0.1.5-rc.2` 线上——P0 spike 里 pin 的 `0.0.1-rc.5` 是旧线。
10. 真实 profile 形态：`nodeLinker: hoisted`、`node_modules` 顶层 0 个 symlink（全是硬链接副本）、`dsh.profile.bundles` 是扁平有序数组、LUTE 插件是 `file:./vendor/packages/<组>/<名>` 指向 profile 内的**物理副本**（`packaging/scripts/rewrite-file-deps.mjs:19-20` 做前缀重写）。P1 不含 `file:` 依赖，P2 才需要这套机制。
11. 治理面：`apps/` 对仓库 collector 结构性不可见（`scripts/gates/package-layout.mjs:15,20-38` 只下钻 `packages/<五组>/`），故 `package-identity`/`catalog-fresh`/`deps-reproducible`/`scripts-runnable` 都管不到薄壳——这是本期用户选定的范围（静态门禁 + 本地 smoke，不扩 collector）。会管到的门禁：`gitignore-whitelist`、`index-drift`、`shell-var-multibyte`（`scripts/gate.mjs:769`，扫全仓 `.sh`；本计划不新增 `.sh`）、`adr-index`/`adr-note-links`/`adr-agent-records`（Task 10 触发）、`pitfalls-playbook`（本期不加条目）。
12. 门禁注册形态：`scripts/gate.mjs:135` 的 `const CHECKS = [`，每项 `{name, remediation, run()}`，`run()` 返回 `{passed, violations}` 或带 `status/expected/discovered/checked/skipped/failed/typedSkips/violations/reason/note` 的富读数（例：`scripts/gate.mjs:308-334`）。纯检查函数放 `scripts/gates/<name>.mjs`，配套 `scripts/gates/<name>.test.mjs` 由 `pnpm run test:gate` 收集。
13. ADR 下一个空号是 **0131**（盘上已有未提交的 ADR-0128/0129/0130，执行时须复核）；`docs/adr/decisions.json` 是派生账本，用 `node scripts/gates/adr-agent-records.mjs --write` 重生成，不可手改。

## File Structure

```
apps/lute-shell/
├── package.json              独立 pnpm 项目；main=lib/main/index.js（Electron 入口）；devDeps 供编译期类型
├── pnpm-workspace.yaml       仅 overrides（两个未发布内部包）——不是仓库级 workspace
├── pnpm-lock.yaml            入库（版本锁即 pin）
├── tsconfig.json             自包含，不 extends（仓库惯例：无 root tsconfig）
├── vitest.config.ts
├── THIRD_PARTY_NOTICES.md    MIT 署名（帧协议改写自 harness）
├── config/
│   └── shell.cordis.patch.yml  自有桌面 overlay（改写自上游，去掉两个 native picker insert）
├── seed/                     profile 种子，全部入库
│   ├── package.json          dsh.profile.bundles = [dsh-base, dsh-web-app] + 宿主侧直接依赖
│   ├── pnpm-workspace.yaml   nodeLinker: hoisted + overrides
│   ├── pnpm-lock.yaml        入库
│   ├── cordis.yml            boot 的 rootConfigPath，内容 []
│   └── cordis.patch.yml      用户层，P1 为 []，P2 开始填
├── scripts/
│   ├── materialize.mjs       驱动 lib/profile/materialize.js（seed + 宿主运行时 → profile）
│   ├── smoke.mjs             无头端到端：spawn 真宿主子进程，走管道取 index.html
│   └── README.md             两条命令的前置条件与失败归因顺序
├── src/
│   ├── protocol.ts           双向帧编解码 + IPC 消息类型（合并上游两份镜像文件）
│   ├── host/
│   │   ├── index.ts          子进程入口：管道/IPC/信号生命周期 + 请求路由
│   │   ├── composition.ts    profile → boot patches（自有，不依赖 dsh-desktop-host）
│   │   ├── assets.ts         dsh-web-frontend/dist 资产 + __DSH_TRANSPORT__ 注入
│   │   ├── streams.ts        /.dsh/remote-stream → typertGateway.wireStream 的 NDJSON 桥
│   │   └── handler.ts        FetchHandler 接口（assets/streams/index 共用）
│   ├── main/
│   │   ├── index.ts          Electron 主进程入口（唯一需要 GUI 的文件）
│   │   ├── host-process.ts   子进程生命周期 + fetch 桥
│   │   ├── runtime.ts        纯函数：解析 node 二进制 / 宿主入口 / 子进程 env
│   │   └── route.ts          纯函数：dsh-app:// 主机名路由
│   └── profile/
│       ├── layout.ts         纯函数：seed 与宿主运行时的源→目标路径映射
│       └── materialize.ts    物化 + pnpm install
├── lib/                      tsc 产物，git 忽略
└── test/
    ├── skeleton.spec.ts  protocol.spec.ts  composition.spec.ts
    ├── assets.spec.ts  streams.spec.ts  host-entry.spec.ts
    ├── layout.spec.ts  materialize.spec.ts  runtime.spec.ts  route.spec.ts
    └── fixtures/
        ├── profile/                  composition 测试用的最小 profile（含 1 个 bundle）
        ├── profile-broken-bundle/    bundle 缺 dsh.bundle.patch 的反例
        └── frontend/dist/            assets 测试用的假 SPA dist
```

职责边界：`protocol.ts` 是唯一同时被主进程与宿主进程导入的模块（上游维护两份镜像副本，我们两侧同仓故合一）；`main/runtime.ts`、`main/route.ts`、`profile/layout.ts` 是纯函数，把 Electron 侧可测的部分从 GUI 里剥出来；`host/*` 全部能在纯 Node 下跑，这是 Task 7 无头 smoke 的基础。

---

### Task 1: 包骨架与仓库白名单

**Files:**
- Create: `apps/lute-shell/package.json`
- Create: `apps/lute-shell/pnpm-workspace.yaml`
- Create: `apps/lute-shell/tsconfig.json`
- Create: `apps/lute-shell/vitest.config.ts`
- Create: `apps/lute-shell/THIRD_PARTY_NOTICES.md`
- Create: `apps/lute-shell/test/skeleton.spec.ts`
- Modify: `.gitignore`（第 31 行 `!dsh-rootoutlet-heal/**` 之后加 `!apps/**`；第 46 行 `generated/` 之后加 `apps/lute-shell/lib/`）

**Interfaces:**
- Consumes: 无（第一个 task）。
- Produces: 可运行的 pnpm 项目 `apps/lute-shell`，脚本 `typecheck` / `build` / `test` / `materialize` / `smoke` / `dev`；后续 task 的源码全落在这个项目的 `src/` 下，构建产物落 `lib/`。

- [ ] **Step 1: 写失败测试**

`apps/lute-shell/test/skeleton.spec.ts`：

```typescript
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const shellRoot = join(import.meta.dirname, '..')
const manifest = JSON.parse(readFileSync(join(shellRoot, 'package.json'), 'utf8')) as {
  type: string
  main: string
  scripts: Record<string, string>
  devDependencies: Record<string, string>
}

describe('shell package skeleton', () => {
  it('is an ESM package whose Electron entry is the built main process', () => {
    expect(manifest.type).toBe('module')
    expect(manifest.main).toBe('lib/main/index.js')
  })

  it('exposes the six lifecycle scripts in the repo order', () => {
    expect(Object.keys(manifest.scripts)).toEqual([
      'typecheck', 'build', 'test', 'materialize', 'smoke', 'dev',
    ])
  })

  it('pins every harness package to an exact version', () => {
    const harness = Object.entries(manifest.devDependencies)
      .filter(([name]) => name.startsWith('@deepseek-ai/'))
    expect(harness.length).toBeGreaterThan(0)
    for (const [name, spec] of harness) {
      expect(spec, `${name} must be an exact version`).toMatch(/^\d+\.\d+\.\d+(-[\w.]+)?$/u)
    }
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /Users/lute/project/Magpie-Horch/apps/lute-shell && pnpm exec vitest run test/skeleton.spec.ts`
Expected: FAIL —— 目录与 `package.json` 尚不存在（`ENOENT`）。此时 `pnpm exec` 还不可用，先做 Step 3–8 再回来补跑本步，并在提交信息里注明「Red 在依赖就位后补跑」。

- [ ] **Step 3: 写 `apps/lute-shell/package.json`**

```json
{
  "name": "lute-shell",
  "version": "0.1.0",
  "private": true,
  "description": "LUTE 自有 Electron 薄壳：用 npm 上的 harness 运行时启动 cordis host，脱离 dsh-desktop fork",
  "type": "module",
  "main": "lib/main/index.js",
  "engines": {
    "node": "^22.19.0 || >=24.0.0"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "build": "tsc",
    "test": "vitest run",
    "materialize": "node scripts/materialize.mjs",
    "smoke": "node scripts/smoke.mjs",
    "dev": "tsc && electron ."
  },
  "devDependencies": {
    "@deepseek-ai/cordis": "4.0.2",
    "@deepseek-ai/cordis-plugin-include": "1.0.7",
    "@deepseek-ai/dsh-api-gateway": "0.1.5-rc.2",
    "@deepseek-ai/dsh-app-boot": "0.1.5-rc.2",
    "@deepseek-ai/dsh-client-connection": "0.1.5-rc.2",
    "@deepseek-ai/dsh-client-modules": "0.1.5-rc.2",
    "@deepseek-ai/dsh-cmdline": "0.1.5-rc.2",
    "@deepseek-ai/dsh-host-webserver": "0.1.5-rc.2",
    "@deepseek-ai/dsh-launch-environment": "0.1.5-rc.2",
    "@types/node": "^22.20.2",
    "electron": "43.3.0",
    "typescript": "5.6.3",
    "vitest": "^4.1.11"
  }
}
```

这些 `@deepseek-ai/*` 全是 **devDependencies**：只为 `tsc` 与 vitest 提供编译期类型；运行时宿主进程从 profile 的 node_modules 解析同一批包（单一 cordis 实例的约束见 Architecture 与 Task 6）。

- [ ] **Step 4: 写 `apps/lute-shell/pnpm-workspace.yaml`**

```yaml
overrides:
  "@deepseek-ai/dsh-type-meta": "npm:empty-npm-package@1.0.0"
  "@deepseek-ai/dsh-user-interaction": "npm:empty-npm-package@1.0.0"
```

- [ ] **Step 5: 写 `apps/lute-shell/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "rootDir": "src",
    "outDir": "lib",
    "strict": true,
    "noImplicitAny": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "declaration": true,
    "sourceMap": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts"]
}
```

`test/` 不进 `include`：vitest 自己转译测试文件，`tsc` 只构建 `src/`（避免测试被 emit 到 `lib/`）。

- [ ] **Step 6: 写 `apps/lute-shell/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.spec.ts'],
  },
})
```

- [ ] **Step 7: 写 `apps/lute-shell/THIRD_PARTY_NOTICES.md`**

正文三段：(1) 说明 `src/protocol.ts` 的帧格式（13 字节 header：`u32BE` magic `0x44534833`、`u8` type、`u32BE` streamId、`u32BE` payloadLength；请求类型 1-4 = start/data/end/cancel，响应类型 1-4 = start/data/end/error；数据帧 ≤ 64 KiB、控制帧 ≤ 1 MiB）与编解码实现改写自 MIT 许可的 DeepSeek Harness，指名两个参照文件 `apps/desktop-host/src/wire.ts`、`apps/desktop/src/host-protocol.ts`，并注明参照副本在本仓 `vendor/dsh-desktop/deepseek-harness/`（只读 submodule）；(2) 逐字粘贴 MIT 全文，版权行写 `Copyright (c) 2026 DeepSeek`（从 `vendor/dsh-desktop/deepseek-harness/LICENSE` 复制，不要凭记忆重写）；(3) 一段说明运行时消费的 `@deepseek-ai/dsh-host-webserver` 与 `@deepseek-ai/dsh-web-frontend` 在**本壳锁定的 `0.1.5-rc.2` 上以 MIT 发布**（实测 `pnpm view <pkg>@0.1.5-rc.2 license` → MIT；不带版本号查会得到 BSD-3-Clause，那是陈旧 `latest` tag 指向的 `0.0.1-rc.*` 旧线——与 Global Constraints 里那条版本陷阱同源，**查 license 必须带版本号**），本壳只按包边界调用其公开导出（`renderIndexInjections`、`dist/index.html`），未复制其源码。

- [ ] **Step 8: 改 `.gitignore`**

在第 31 行 `!dsh-rootoutlet-heal/**` 之后插入：

```
!apps/**
```

在第 46 行 `generated/` 之后插入：

```
apps/lute-shell/lib/
```

（`node_modules/` 第 41 行、`dist/` 第 45 行已全局忽略且出现在白名单之后，git 取最后匹配的规则，故 `apps/lute-shell/node_modules/` 自动被忽略。）

- [ ] **Step 9: 安装依赖并跑测试**

Run: `cd /Users/lute/project/Magpie-Horch/apps/lute-shell && pnpm install`
Expected: 成功并生成 `pnpm-lock.yaml`。**本机 pnpm 用户级配置是 `ignoreScripts: true`，所以 `electron` 的 postinstall 不会跑、install 阶段不下载二进制**（原写法「postinstall 会下载 ~100 MB」在本机为假，且体积也错——实测 `dist/` 是 295 MB）。这不构成阻塞：electron 43.3.0 的 `index.js` 在 **require 时自愈**（`getElectronPath()` 缺 `path.txt`/`dist` 就自己 `spawnSync(install.js)`），`cli.js` 正是 `require('./')`，故首次 `pnpm run dev` 会先静默下载再起 Electron。实测读数：`./node_modules/.bin/electron --version` → `v43.3.0`。**结论：不需要白名单、不需要 `.npmrc`、不需要放宽 `ignoreScripts`**；完整性由包内 `checksums.json`（`@electron/get` 校验）保住。若报 `ERR_PNPM_FETCH_404` 点名 `dsh-type-meta` / `dsh-user-interaction`，说明 Step 4 的 overrides 没生效——核对文件名恰为 `pnpm-workspace.yaml`。

Run: `pnpm exec vitest run test/skeleton.spec.ts`
Expected: PASS（3 tests）

- [ ] **Step 10: 验证 git 可见性与忽略边界**

**探测方式有坑，照下面写**：`git check-ignore -v` 在文件**未提交**时会把命中的否定模式（`!apps/**`）也打印出来并返回 `exit=0`，看起来像「被忽略」，其实相反；`-v` 只用于诊断「哪条规则命中」。判布尔一律用不带 `-v` 的形式：`exit=1` = 未被忽略（可入库），`exit=0` = 被忽略。另外 pnpm 的 `node_modules/<pkg>` 是符号链接，探测其**内部**路径会得到 `fatal: pathspec ... is beyond a symbolic link`——要探就探 `node_modules` 目录本身。

Run: `cd /Users/lute/project/Magpie-Horch && git check-ignore apps/lute-shell/package.json ; echo "exit=$?"`
Expected: 无输出、`exit=1`（未被忽略 ⇒ 可入库）

Run: `cd /Users/lute/project/Magpie-Horch && mkdir -p apps/lute-shell/lib && touch apps/lute-shell/lib/probe.js && git check-ignore apps/lute-shell/lib/probe.js ; echo "exit=$?" ; rm -rf apps/lute-shell/lib`
Expected: 打印 `apps/lute-shell/lib/probe.js`、`exit=0`

Run: `cd /Users/lute/project/Magpie-Horch && git check-ignore apps/lute-shell/node_modules ; echo "exit=$?"`
Expected: 打印 `apps/lute-shell/node_modules`、`exit=0`

Run: `cd /Users/lute/project/Magpie-Horch && git ls-files --others --exclude-standard apps/`
Expected: 只列出本 task 创建的源文件（package.json / pnpm-workspace.yaml / pnpm-lock.yaml / tsconfig.json / vitest.config.ts / THIRD_PARTY_NOTICES.md / test/skeleton.spec.ts），**没有任何 node_modules 或 lib 条目**。这条是「忽略边界正确」的正面证据，比逐个探测更可靠。

- [ ] **Step 11: 跑门禁确认没弄红既有校验**

Run: `cd /Users/lute/project/Magpie-Horch && pnpm run gate 2>&1 | tail -40`
Expected: `gitignore-whitelist`、`index-drift` 绿。**已知继承性红一项**：BASE（1940c29）上 `profile-bundle-sync` 就是红的（live profile 与仓库受管包不同步，属另一条工作线），本计划全程不写 live profile，**不要修它、不要放宽判据、不要动 `scripts/gates/exemptions.json`**；除此之外应为 95/99 通过、failed=1。若出现别的红，先单独直跑对应 checker 归因（并发会话在制品 vs 本 task 引入），确认是别人的在制品就别动。

- [ ] **Step 12: 提交**

```bash
cd /Users/lute/project/Magpie-Horch
git add .gitignore apps/lute-shell/package.json apps/lute-shell/pnpm-workspace.yaml \
  apps/lute-shell/pnpm-lock.yaml apps/lute-shell/tsconfig.json apps/lute-shell/vitest.config.ts \
  apps/lute-shell/THIRD_PARTY_NOTICES.md apps/lute-shell/test/skeleton.spec.ts
git status --short
git commit -m "$(cat <<'EOF'
feat(apps): lute-shell 薄壳包骨架——独立 pnpm 项目 + 仓库白名单

harness 运行时走 npm（@deepseek-ai/dsh-* 精确锁 0.1.5-rc.2），壳层代码 100% 自有。
apps/ 此前对仓库 collector 结构性不可见，故 .gitignore 加 !apps/** 并显式忽略 lib/。
帧协议改写自 MIT 的 harness，署名见 THIRD_PARTY_NOTICES.md。
EOF
)"
```

---

### Task 2: 帧协议模块 `src/protocol.ts`

**Files:**
- Create: `apps/lute-shell/src/protocol.ts`
- Test: `apps/lute-shell/test/protocol.spec.ts`

**Interfaces:**
- Consumes: 无（只用 `Buffer` 全局）。
- Produces:
  - 常量 `SHELL_HOST_PROTOCOL_VERSION = 3`、`SHELL_REQUEST_PIPE_FD = 3`、`SHELL_RESPONSE_PIPE_FD = 4`、`SHELL_CONTROL_IPC_FD = 5`、`SHELL_PIPE_CHUNK_BYTES = 65536`、`FRAME_MAGIC = 0x44534833`、`FRAME_HEADER_BYTES = 13`、`MAX_CONTROL_PAYLOAD_BYTES = 1048576`
  - 类型 `HostRequestStart { url: string; method: string; headers: readonly [string, string][]; hasBody: boolean }`
  - 类型 `HostRequestFrame`（判别联合 `'start' | 'data' | 'end' | 'cancel'`，都带 `streamId: number`；`start` 带 `url/method/headers/hasBody`，`data` 带 `data: Buffer`）
  - 类型 `HostResponseFrame`（判别联合 `'start' | 'data' | 'end' | 'error'`；`start` 带 `status/headers/hasBody`，`data` 带 `data: Buffer`，`error` 带 `message: string`）
  - 类型 `HostCommand = { readonly type: 'shutdown' }`
  - 类型 `HostEvent = { type: 'ready'; protocolVersion: 3; dshVersion: string } | { type: 'fatal'; message: string }`
  - 请求侧编码 `encodeRequestStart(streamId: number, request: HostRequestStart): Buffer`、`encodeRequestData(streamId: number, data: Uint8Array): Buffer`、`encodeRequestEnd(streamId: number): Buffer`、`encodeRequestCancel(streamId: number): Buffer`
  - 响应侧编码 `encodeResponseStart(streamId: number, response: { status: number; headers: readonly [string, string][]; hasBody: boolean }): Buffer`、`encodeResponseData(streamId: number, data: Uint8Array): Buffer`、`encodeResponseEnd(streamId: number): Buffer`、`encodeResponseError(streamId: number, message: string): Buffer`
  - `class HostRequestDecoder { push(chunk: Buffer): HostRequestFrame[]; finish(): void }`
  - `class HostResponseDecoder { push(chunk: Buffer): HostResponseFrame[]; finish(): void }`
  - `isHostCommand(message: unknown): message is HostCommand`、`isHostEvent(message: unknown): message is HostEvent`

- [ ] **Step 1: 写失败测试**

`apps/lute-shell/test/protocol.spec.ts`：

```typescript
import { describe, expect, it } from 'vitest'
import {
  FRAME_HEADER_BYTES,
  FRAME_MAGIC,
  HostRequestDecoder,
  HostResponseDecoder,
  MAX_CONTROL_PAYLOAD_BYTES,
  SHELL_PIPE_CHUNK_BYTES,
  encodeRequestCancel,
  encodeRequestData,
  encodeRequestEnd,
  encodeRequestStart,
  encodeResponseData,
  encodeResponseEnd,
  encodeResponseError,
  encodeResponseStart,
  isHostCommand,
  isHostEvent,
} from '../src/protocol.js'

const start = {
  url: 'dsh-app://app/index.html',
  method: 'GET',
  headers: [['accept', 'text/html']] as readonly [string, string][],
  hasBody: false,
}

describe('frame header', () => {
  it('writes the 13-byte DSH3 header', () => {
    const frame = encodeRequestEnd(7)
    expect(frame.byteLength).toBe(FRAME_HEADER_BYTES)
    expect(frame.readUInt32BE(0)).toBe(FRAME_MAGIC)
    expect(frame.readUInt8(4)).toBe(3)
    expect(frame.readUInt32BE(5)).toBe(7)
    expect(frame.readUInt32BE(9)).toBe(0)
  })

  it('rejects a stream id outside 1..0xffffffff', () => {
    expect(() => encodeRequestEnd(0)).toThrow(/invalid pipe stream id/u)
    expect(() => encodeRequestEnd(0x1_0000_0000)).toThrow(/invalid pipe stream id/u)
    expect(() => encodeRequestEnd(1.5)).toThrow(/invalid pipe stream id/u)
  })

  it('rejects an oversized control payload but allows a full data chunk', () => {
    expect(() => encodeResponseError(1, 'x'.repeat(MAX_CONTROL_PAYLOAD_BYTES)))
      .toThrow(/exceeds the \d+-byte limit/u)
    expect(encodeRequestData(1, new Uint8Array(SHELL_PIPE_CHUNK_BYTES)).byteLength)
      .toBe(FRAME_HEADER_BYTES + SHELL_PIPE_CHUNK_BYTES)
    expect(() => encodeRequestData(1, new Uint8Array(SHELL_PIPE_CHUNK_BYTES + 1)))
      .toThrow(/exceeds the \d+-byte limit/u)
  })
})

describe('request round trip', () => {
  it('decodes start, data, end and cancel in pipe order', () => {
    const decoder = new HostRequestDecoder()
    const bytes = Buffer.concat([
      encodeRequestStart(1, start),
      encodeRequestData(1, Buffer.from('ab')),
      encodeRequestEnd(1),
      encodeRequestCancel(2),
    ])
    expect(decoder.push(bytes)).toEqual([
      { type: 'start', streamId: 1, ...start },
      { type: 'data', streamId: 1, data: Buffer.from('ab') },
      { type: 'end', streamId: 1 },
      { type: 'cancel', streamId: 2 },
    ])
    expect(() => decoder.finish()).not.toThrow()
  })

  it('holds a frame split across chunks', () => {
    const decoder = new HostRequestDecoder()
    const bytes = encodeRequestStart(3, start)
    expect(decoder.push(bytes.subarray(0, 6))).toEqual([])
    expect(decoder.push(bytes.subarray(6, FRAME_HEADER_BYTES + 2))).toEqual([])
    expect(decoder.push(bytes.subarray(FRAME_HEADER_BYTES + 2))).toHaveLength(1)
  })

  it('rejects a bad magic', () => {
    const badMagic = encodeRequestEnd(1)
    badMagic.writeUInt32BE(0xdead_beef, 0)
    expect(() => new HostRequestDecoder().push(badMagic)).toThrow(/frame marker/u)
  })

  it('rejects an unknown frame type', () => {
    const badType = encodeRequestEnd(1)
    badType.writeUInt8(9, 4)
    expect(() => new HostRequestDecoder().push(badType)).toThrow(/request frame type 9/u)
  })

  it('rejects a payload on an end frame', () => {
    const padded = encodeRequestEnd(1)
    padded.writeUInt32BE(1, 9)
    expect(() => new HostRequestDecoder().push(Buffer.concat([padded, Buffer.from('x')])))
      .toThrow(/end frame carried a payload/u)
  })

  it('rejects an EOF that splits a frame', () => {
    const split = new HostRequestDecoder()
    split.push(encodeRequestStart(1, start).subarray(0, 4))
    expect(() => split.finish()).toThrow(/ended inside a frame/u)
  })

  it('rejects a start payload that is not a well-formed request', () => {
    const payload = Buffer.from(JSON.stringify({ url: 1, method: 'GET', headers: [], hasBody: false }))
    const header = encodeRequestStart(1, start).subarray(0, FRAME_HEADER_BYTES)
    header.writeUInt32BE(payload.byteLength, 9)
    expect(() => new HostRequestDecoder().push(Buffer.concat([header, payload])))
      .toThrow(/request start payload/u)
  })
})

describe('response round trip', () => {
  it('decodes a complete body-bearing response', () => {
    const frames = new HostResponseDecoder().push(Buffer.concat([
      encodeResponseStart(4, { status: 200, headers: [['content-type', 'text/html']], hasBody: true }),
      encodeResponseData(4, Buffer.from('<!doctype html>')),
      encodeResponseEnd(4),
    ]))
    expect(frames).toEqual([
      { type: 'start', streamId: 4, status: 200, headers: [['content-type', 'text/html']], hasBody: true },
      { type: 'data', streamId: 4, data: Buffer.from('<!doctype html>') },
      { type: 'end', streamId: 4 },
    ])
  })

  it('decodes an error frame', () => {
    expect(new HostResponseDecoder().push(encodeResponseError(5, 'boom')))
      .toEqual([{ type: 'error', streamId: 5, message: 'boom' }])
  })

  it('rejects an out-of-range status', () => {
    const payload = Buffer.from(JSON.stringify({ status: 42, headers: [], hasBody: false }))
    const header = encodeResponseStart(5, { status: 200, headers: [], hasBody: false }).subarray(0, FRAME_HEADER_BYTES)
    header.writeUInt32BE(payload.byteLength, 9)
    expect(() => new HostResponseDecoder().push(Buffer.concat([header, payload])))
      .toThrow(/response start payload/u)
  })
})

describe('ipc guards', () => {
  it('accepts only the shutdown command', () => {
    expect(isHostCommand({ type: 'shutdown' })).toBe(true)
    expect(isHostCommand({ type: 'restart' })).toBe(false)
    expect(isHostCommand(null)).toBe(false)
  })

  it('accepts ready and fatal events only at the current protocol version', () => {
    expect(isHostEvent({ type: 'ready', protocolVersion: 3, dshVersion: '0.1.5-rc.2' })).toBe(true)
    expect(isHostEvent({ type: 'ready', protocolVersion: 2, dshVersion: '0.1.5-rc.2' })).toBe(false)
    expect(isHostEvent({ type: 'fatal', message: 'x' })).toBe(true)
    expect(isHostEvent({ type: 'fatal' })).toBe(false)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /Users/lute/project/Magpie-Horch/apps/lute-shell && pnpm exec vitest run test/protocol.spec.ts`
Expected: FAIL —— `Cannot find module '../src/protocol.js'`

- [ ] **Step 3: 写实现（逐字移植 + 符号映射）**

参照 `vendor/dsh-desktop/deepseek-harness/apps/desktop-host/src/wire.ts`（全 184 行，宿主侧：编响应、解请求）与 `apps/desktop/src/host-protocol.ts`（全 215 行，壳侧：编请求、解响应）。两份是镜像的；本壳两侧同仓，**合并成一个模块**，消除镜像重复。

符号映射（左=参照，右=`src/protocol.ts`）：

| 参照符号 | 本模块符号 | 参照位置 |
|---|---|---|
| `DESKTOP_HOST_PROTOCOL_VERSION` | `SHELL_HOST_PROTOCOL_VERSION` | wire.ts:4 |
| `DESKTOP_REQUEST_PIPE_FD` | `SHELL_REQUEST_PIPE_FD` | wire.ts:7 |
| `DESKTOP_RESPONSE_PIPE_FD` | `SHELL_RESPONSE_PIPE_FD` | wire.ts:10 |
| `DESKTOP_CONTROL_IPC_FD` | `SHELL_CONTROL_IPC_FD` | host-protocol.ts:13 |
| `DESKTOP_PIPE_CHUNK_BYTES` | `SHELL_PIPE_CHUNK_BYTES` | wire.ts:13 |
| `DesktopHostRequestStart` | `HostRequestStart` | host-protocol.ts:35-40 |
| `DesktopHostRequestFrame` | `HostRequestFrame` | wire.ts:32-46 |
| `DesktopHostResponseFrame` | `HostResponseFrame` | host-protocol.ts:58-75 |
| `DesktopHostCommand` | `HostCommand` | wire.ts:54-56 |
| `DesktopHostEvent` | `HostEvent` | wire.ts:59-66 |
| `encodeDesktopRequestStart/Data/End/Cancel` | `encodeRequestStart/Data/End/Cancel` | host-protocol.ts:112-129 |
| `encodeDesktopResponseStart/Data/End/Error` | `encodeResponseStart/Data/End/Error` | wire.ts:83-107 |
| `DesktopHostRequestDecoder` | `HostRequestDecoder` | wire.ts:110-184 |
| `DesktopHostResponseDecoder` | `HostResponseDecoder` | host-protocol.ts:132-215 |
| `isDesktopHostCommand` | `isHostCommand`（改为 export） | desktop-host/src/index.ts:84-87 |
| `isDesktopHostEvent` | `isHostEvent`（改为 export） | desktop/src/host-process.ts:32-43 |

私有常量与辅助（`FRAME_MAGIC`、`FRAME_HEADER_BYTES`、`MAX_CONTROL_PAYLOAD_BYTES`、`REQUEST_FRAME_*`、`RESPONSE_FRAME_*`、`isRecord`、`isHeaders`、`assertStreamId`、`encodeFrame`、`encodeJsonFrame`）逐字保留，其中前三个常量改为 **export**（测试与 Task 9 的门禁要读）。

合并规则（只有这三处不是逐字复制）：
1. 两份各有一个 `encodeFrame`（一个按 `RequestFrameType` 限幅、一个按 `ResponseFrameType` 限幅）。合并为单一实现，`type` 参数取 `number`，限幅规则不变：`type === 2` 用 `SHELL_PIPE_CHUNK_BYTES`，其余用 `MAX_CONTROL_PAYLOAD_BYTES`。在该行上方写一行注释：`// 2 is the data frame on both pipes; the two directions share one byte limit.`
2. 错误信息前缀 `dsh desktop: ` → `lute shell: `；消息里区分方向的主语（`Electron request` / `Host response`）保留。
3. 每个导出保留一行 JSDoc（参照已有，逐字带过来，主语换成 lute shell）。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd /Users/lute/project/Magpie-Horch/apps/lute-shell && pnpm exec vitest run test/protocol.spec.ts`
Expected: PASS（15 tests —— frame header 3 + request round trip 7 + response round trip 3 + ipc guards 2）

- [ ] **Step 5: 类型检查**

Run: `cd /Users/lute/project/Magpie-Horch/apps/lute-shell && pnpm run typecheck`
Expected: 退出码 0、无输出

- [ ] **Step 6: 提交**

```bash
cd /Users/lute/project/Magpie-Horch
git add apps/lute-shell/src/protocol.ts apps/lute-shell/test/protocol.spec.ts
git commit -m "$(cat <<'EOF'
feat(apps): lute-shell 帧协议——DSH3 v3 双向编解码合一

上游维护 wire.ts / host-protocol.ts 两份镜像（宿主侧与壳侧各一份）；两侧同仓故合并为
单模块，协议常量与 13 字节 header 布局逐字对齐参照。MIT 署名见 THIRD_PARTY_NOTICES.md。
EOF
)"
```

---

### Task 3: 组合层 `src/host/composition.ts` 与壳 overlay

**Files:**
- Create: `apps/lute-shell/config/shell.cordis.patch.yml`
- Create: `apps/lute-shell/src/host/composition.ts`
- Create: `apps/lute-shell/test/fixtures/profile/package.json`
- Create: `apps/lute-shell/test/fixtures/profile/cordis.yml`
- Create: `apps/lute-shell/test/fixtures/profile/cordis.patch.yml`
- Create: `apps/lute-shell/test/fixtures/profile/node_modules/lute-fixture-bundle/package.json`
- Create: `apps/lute-shell/test/fixtures/profile/node_modules/lute-fixture-bundle/cordis.patch.yml`
- Create: `apps/lute-shell/test/fixtures/profile/node_modules/@deepseek-ai/dsh/package.json`
- Create: `apps/lute-shell/test/fixtures/profile-broken-bundle/package.json`
- Create: `apps/lute-shell/test/fixtures/profile-broken-bundle/node_modules/lute-broken-bundle/package.json`
- Create: `apps/lute-shell/test/fixtures/profile-broken-bundle/node_modules/@deepseek-ai/dsh/package.json`
- Create: `apps/lute-shell/test/composition.spec.ts`
- Modify: `.gitignore`（第 73 行 `!packages/**/test/**` 之后加 `!apps/lute-shell/test/fixtures/**/node_modules/**`）

**Interfaces:**
- Consumes: `loadProfileDirectory`、`loadOverlayPatches`、`composeEntries` from `@deepseek-ai/dsh-app-boot`；类型 `PatchOptions`、`EntryOptions` from `@deepseek-ai/cordis-plugin-include`。
- Produces:
  - `const SHELL_LABEL = 'lute shell'`
  - `const ROOT_CONFIG_FILENAME = 'cordis.yml'`
  - `const ROOT_CONFIG_CONTENT = '# lute-shell composition root; the profile seed owns this file.\n[]\n'`
  - `interface ShellPatches { readonly patches: PatchOptions[]; readonly layerNames: readonly string[]; readonly layerDirs: readonly string[] }`
  - `composeShellPatches(input: { profileDir: string; overlayPatchPath: string }): ShellPatches`
  - `rootConfigPath(profileDir: string): string`
  - `inspectEntries(patches: readonly PatchOptions[]): readonly EntryOptions[]`

- [ ] **Step 1: 写 fixture profile**

`test/fixtures/profile/package.json`（一个 bundle，`dsh.profile.bundles` 非空——这正是 P0 拿到 `layers: 0` 时缺的字段）：

```json
{
  "name": "lute-shell-fixture-profile",
  "private": true,
  "type": "module",
  "dsh": {
    "profile": {
      "bundles": ["lute-fixture-bundle"]
    }
  }
}
```

`test/fixtures/profile/cordis.yml`：

```yaml
[]
```

`test/fixtures/profile/cordis.patch.yml`：

```yaml
- id: fixture-row
  config:
    fromUserLayer: true
```

`test/fixtures/profile/node_modules/lute-fixture-bundle/package.json`：

```json
{
  "name": "lute-fixture-bundle",
  "version": "0.0.0",
  "type": "module",
  "dsh": {
    "bundle": {
      "patch": "./cordis.patch.yml"
    }
  }
}
```

`test/fixtures/profile/node_modules/lute-fixture-bundle/cordis.patch.yml`：

```yaml
- id: web-startup
  disabled: false

- id: fixture-bundle-row
  config:
    fromBundle: true
```

`test/fixtures/profile-broken-bundle/package.json`：

```json
{
  "name": "lute-shell-fixture-broken",
  "private": true,
  "type": "module",
  "dsh": {
    "profile": {
      "bundles": ["lute-broken-bundle"]
    }
  }
}
```

`test/fixtures/profile-broken-bundle/node_modules/lute-broken-bundle/package.json`（**故意缺 `dsh.bundle.patch`**）：

```json
{
  "name": "lute-broken-bundle",
  "version": "0.0.0",
  "type": "module"
}
```

**两个 fixture 都还需要一个 `@deepseek-ai/dsh` 桩**，否则 `composeShellPatches` 的 `installAnchor` 会先抛「has no installed @deepseek-ai/dsh」，happy path 根本走不到组合逻辑，broken-bundle 那条也测不到它想测的分支。`installAnchor` 只读这个 manifest 的**路径**（作为 `createRequire` 的锚点），不读内容，所以桩可以极简：

`test/fixtures/profile/node_modules/@deepseek-ai/dsh/package.json` 与 `test/fixtures/profile-broken-bundle/node_modules/@deepseek-ai/dsh/package.json`（两份内容相同）：

```json
{
  "name": "@deepseek-ai/dsh",
  "version": "0.1.5-rc.2",
  "type": "module"
}
```

- [ ] **Step 2: 让 fixture 的 node_modules 能入库**

这两个 fixture 的 `node_modules/` 会被 `.gitignore` 第 41 行的全局 `node_modules/` 规则忽略，但它们必须入库，否则干净克隆上测试跑不起来。在第 73 行 `!packages/**/test/**` 之后插入：

```
!apps/lute-shell/test/fixtures/**/node_modules/**
```

Run: `cd /Users/lute/project/Magpie-Horch && git check-ignore apps/lute-shell/test/fixtures/profile/node_modules/lute-fixture-bundle/package.json ; echo "exit=$?"`
Expected: 无输出、`exit=1`（白名单生效，fixture 可入库）。用不带 `-v` 的形式——`-v` 在未提交时会打印命中的否定模式并返回 0，读起来像反的（见 Task 1 Step 10 的说明）。

- [ ] **Step 3: 写 `config/shell.cordis.patch.yml`**

改写自 `vendor/dsh-desktop/deepseek-harness/apps/desktop-host/config/desktop.cordis.patch.yml:1-35`，**去掉末尾的 `insert:` 段**（`directory-picker-native`、`ui-directory-picker-native`）——它们需要壳侧 IPC 对端，P1 不实现；`directory-picker` 仍 disabled，故没有引用者。

```yaml
# lute-shell reuses the browser composition without its network and browser-launch rows.
# 参照：vendor/dsh-desktop/deepseek-harness/apps/desktop-host/config/desktop.cordis.patch.yml
# 差异：上游末尾插入 directory-picker-native / ui-directory-picker-native 两行，二者需要壳侧
# IPC 对端；薄壳尚未实现该对端，故不插入（directory-picker 本身仍 disabled，无引用者）。

- id: web-startup
  disabled: true

- id: webserver
  disabled: true

- id: web-runtime
  disabled: true

- id: client-hmr
  disabled: true

- id: open-in-app
  disabled: true

- id: ui-open-in-app
  disabled: true

- id: directory-picker
  disabled: true

- id: connection
  inject:
    - credentials
  config: {}
```

- [ ] **Step 4: 写失败测试**

`apps/lute-shell/test/composition.spec.ts`：

```typescript
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  ROOT_CONFIG_CONTENT,
  ROOT_CONFIG_FILENAME,
  SHELL_LABEL,
  composeShellPatches,
  inspectEntries,
  rootConfigPath,
} from '../src/host/composition.js'

const fixtures = join(import.meta.dirname, 'fixtures')
const fixtureProfile = join(fixtures, 'profile')
const brokenProfile = join(fixtures, 'profile-broken-bundle')
const overlay = join(import.meta.dirname, '..', 'config', 'shell.cordis.patch.yml')

function ids(patches: readonly { id?: unknown }[]): string[] {
  return patches
    .map(patch => typeof patch.id === 'string' ? patch.id : undefined)
    .filter((id): id is string => id !== undefined)
}

describe('composeShellPatches', () => {
  it('reads layers from dsh.profile.bundles, then the user layer, then the shell overlay', () => {
    const { patches, layerNames, layerDirs } = composeShellPatches({
      profileDir: fixtureProfile,
      overlayPatchPath: overlay,
    })
    expect(layerNames).toEqual(['lute-fixture-bundle'])
    expect(layerDirs).toHaveLength(1)
    expect(ids(patches)).toEqual([
      'web-startup', 'fixture-bundle-row', 'fixture-row',
      'web-startup', 'webserver', 'web-runtime', 'client-hmr',
      'open-in-app', 'ui-open-in-app', 'directory-picker', 'connection',
    ])
  })

  it('lets the overlay disable a row the bundle enabled', () => {
    const { patches } = composeShellPatches({ profileDir: fixtureProfile, overlayPatchPath: overlay })
    const webStartup = inspectEntries(patches).find(row => row.id === 'web-startup')
    expect(webStartup?.disabled).toBe(true)
  })

  it('does not inject an agent-presets system root', () => {
    const { patches } = composeShellPatches({ profileDir: fixtureProfile, overlayPatchPath: overlay })
    expect(ids(patches)).not.toContain('agent-presets')
  })

  it('fails loud when the profile has no installed @deepseek-ai/dsh anchor', () => {
    expect(() => composeShellPatches({
      profileDir: join(fixtureProfile, 'missing'),
      overlayPatchPath: overlay,
    })).toThrow(/^lute shell: profile .* has no installed @deepseek-ai\/dsh/u)
  })

  it('fails loud when a bundle manifest does not declare dsh.bundle.patch', () => {
    let message = ''
    try {
      composeShellPatches({ profileDir: brokenProfile, overlayPatchPath: overlay })
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }
    // 第一条断言才是承重的：证明 fixture 走到了 bundle 校验，而不是被 installAnchor 提前拦下。
    expect(message).not.toMatch(/has no installed @deepseek-ai\/dsh/u)
    expect(message).toMatch(/dsh\.bundle\.patch/u)
  })
})

describe('root config', () => {
  it('points boot at the seed-owned cordis.yml', () => {
    expect(rootConfigPath(fixtureProfile)).toBe(join(fixtureProfile, ROOT_CONFIG_FILENAME))
    expect(ROOT_CONFIG_FILENAME).toBe('cordis.yml')
    expect(ROOT_CONFIG_CONTENT.trimEnd().endsWith('[]')).toBe(true)
    expect(SHELL_LABEL).toBe('lute shell')
  })
})
```

- [ ] **Step 5: 跑测试确认失败**

Run: `cd /Users/lute/project/Magpie-Horch/apps/lute-shell && pnpm exec vitest run test/composition.spec.ts`
Expected: FAIL —— `Cannot find module '../src/host/composition.js'`

- [ ] **Step 6: 写实现**

`apps/lute-shell/src/host/composition.ts`：

```typescript
/** Profile composition for the lute-shell host: bundle layers, user layer, shell overlay. */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { EntryOptions, PatchOptions } from '@deepseek-ai/cordis-plugin-include'
import { composeEntries, loadOverlayPatches, loadProfileDirectory } from '@deepseek-ai/dsh-app-boot'

/** Bin name carried into every harness diagnostic this shell emits. */
export const SHELL_LABEL = 'lute shell'

/** Composition root the seed ships; boot mounts it and nothing else. */
export const ROOT_CONFIG_FILENAME = 'cordis.yml'

/** Written by the materializer so the root config is never absent. */
export const ROOT_CONFIG_CONTENT = '# lute-shell composition root; the profile seed owns this file.\n[]\n'

/** Ordered patch layers handed to boot, plus where the bundle layers came from. */
export interface ShellPatches {
  readonly patches: PatchOptions[]
  readonly layerNames: readonly string[]
  readonly layerDirs: readonly string[]
}

/** Absolute path of the composition root inside one materialized profile. */
export function rootConfigPath(profileDir: string): string {
  return join(profileDir, ROOT_CONFIG_FILENAME)
}

function installAnchor(profileDir: string): string {
  const manifest = join(profileDir, 'node_modules', '@deepseek-ai', 'dsh', 'package.json')
  if (!existsSync(manifest)) {
    throw new Error(`lute shell: profile ${profileDir} has no installed @deepseek-ai/dsh — run pnpm run materialize first`)
  }
  return manifest
}

// Upstream also injects an agent-presets system root from <dsh>/config/agent-presets; the
// published dsh tarball ships no config/, and dsh-agent-presets already supplies its own
// shipped root plus $DSH_HOME/.agent-presets, so the injection is redundant here.
/**
 * Compose one materialized profile into boot patches.
 * @param input - profile directory and absolute shell overlay patch file.
 * @returns ordered patches (bundle layers, user layer, shell overlay) and bundle origins.
 */
export function composeShellPatches(input: { profileDir: string; overlayPatchPath: string }): ShellPatches {
  const profile = loadProfileDirectory(SHELL_LABEL, input.profileDir, installAnchor(input.profileDir))
  const layers = [
    ...profile.layers.map(layer => layer.patches),
    profile.patches,
    loadOverlayPatches(SHELL_LABEL, input.overlayPatchPath),
  ]
  // boot mutates the rows it is handed; upstream clones at the same boundary
  // (apps/desktop-host/src/index.ts:289-292).
  return {
    patches: structuredClone(layers.flat()),
    layerNames: profile.layers.map(layer => layer.packageName),
    layerDirs: profile.layers.map(layer => layer.packageDir),
  }
}

/**
 * Compose patches into loader entries for diagnostics and tests.
 * @param patches - one ordered patch layer.
 * @returns the entries the Loader would mount.
 */
export function inspectEntries(patches: readonly PatchOptions[]): readonly EntryOptions[] {
  return composeEntries([patches as PatchOptions[]])
}
```

- [ ] **Step 7: 跑测试确认通过**

Run: `cd /Users/lute/project/Magpie-Horch/apps/lute-shell && pnpm exec vitest run test/composition.spec.ts`
Expected: PASS（6 tests）

若「bundle 缺 `dsh.bundle.patch`」那条的错误措辞与断言不符，**改断言去匹配 harness 的真实措辞**（真实抛点在 `packages/boot/app-boot/src/profile.ts:791-795`），不要改 harness、也不要放宽成 `/./u`——这条用例的价值就在「误配置大声失败」。

- [ ] **Step 8: 类型检查 + 全量测试**

Run: `cd /Users/lute/project/Magpie-Horch/apps/lute-shell && pnpm run typecheck && pnpm run test`
Expected: 退出码 0（skeleton + protocol + composition）

- [ ] **Step 9: 提交**

```bash
cd /Users/lute/project/Magpie-Horch
git add .gitignore apps/lute-shell/config/shell.cordis.patch.yml \
  apps/lute-shell/src/host/composition.ts apps/lute-shell/test/composition.spec.ts \
  apps/lute-shell/test/fixtures
git status --short
git commit -m "$(cat <<'EOF'
feat(apps): lute-shell 组合层——bundles/用户层/壳 overlay 三段合成

layers 的唯一来源是 profile package.json 的 dsh.profile.bundles（app-boot profile.ts:781），
这推翻了 P0 报告 §3「需完整 pnpm workspace 结构」的根因猜测。
overlay 改写自上游 desktop 版，去掉两个需壳侧 IPC 对端的 native picker insert；
agent-presets 系统根注入整段跳过（npm tarball 无 config/，包内已自带 shipped root）。
EOF
)"
```

---

### Task 4: 资产与流处理 `src/host/assets.ts` + `src/host/streams.ts`

**Files:**
- Create: `apps/lute-shell/src/host/handler.ts`
- Create: `apps/lute-shell/src/host/assets.ts`
- Create: `apps/lute-shell/src/host/streams.ts`
- Create: `apps/lute-shell/test/fixtures/frontend/package.json`
- Create: `apps/lute-shell/test/fixtures/frontend/dist/index.html`
- Create: `apps/lute-shell/test/fixtures/frontend/dist/assets/app.css`
- Test: `apps/lute-shell/test/assets.spec.ts`
- Test: `apps/lute-shell/test/streams.spec.ts`

**Interfaces:**
- Consumes: 类型 `Context` from `@deepseek-ai/cordis`；`renderIndexInjections` 与类型 `IndexInjection` from `@deepseek-ai/dsh-host-webserver`。
- Produces:
  - `interface FetchHandler { requestBodyMode(): 'buffered'; fetch(request: Request): Promise<Response> }`（在 `handler.ts`）
  - `const REMOTE_STREAM_PATH = '/.dsh/remote-stream'`（在 `assets.ts`，`streams.ts` 再导出）
  - `const SHELL_TRANSPORT_SCRIPT: string`（含 `ownsHost:true`）
  - `createAssetHandler(ctx: Context, distRoot: string): FetchHandler`
  - `resolveFrontendDistRoot(profileDir: string): string`
  - `createRemoteStreamHandler(ctx: Context): FetchHandler`

`createAssetHandler` 的第二参是**已解析的 dist 根目录**而非 profileDir，这样测试不必造 node_modules；解析单独由 `resolveFrontendDistRoot` 承担，Task 5 的宿主入口调用它。

- [ ] **Step 1: 写 frontend fixture**

`test/fixtures/frontend/package.json`：

```json
{
  "name": "lute-fixture-frontend",
  "version": "0.0.0",
  "type": "module",
  "exports": {
    "./dist/*": "./dist/*"
  }
}
```

`test/fixtures/frontend/dist/index.html`：

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>fixture</title>
    <link rel="stylesheet" href="/assets/app.css" />
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/assets/app.js"></script>
  </body>
</html>
```

`test/fixtures/frontend/dist/assets/app.css`：

```css
#app { color: rebeccapurple; }
```

- [ ] **Step 2: 写失败测试 `test/assets.spec.ts`**

```typescript
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { SHELL_TRANSPORT_SCRIPT, createAssetHandler, resolveFrontendDistRoot } from '../src/host/assets.js'

const distRoot = join(import.meta.dirname, 'fixtures', 'frontend', 'dist')

interface FakeContext {
  emit(event: string, payload: unknown): void
  clientModules: { fetchBundle(request: Request): Promise<Response> }
}

function fakeContext(): { ctx: FakeContext; emitted: [string, unknown][]; fetchBundle: ReturnType<typeof vi.fn> } {
  const emitted: [string, unknown][] = []
  const fetchBundle = vi.fn(async () => new Response('bundle-bytes', { status: 200 }))
  return {
    emitted,
    fetchBundle,
    ctx: {
      emit: (event: string, payload: unknown) => { emitted.push([event, payload]) },
      clientModules: { fetchBundle },
    },
  }
}

function asContext(ctx: FakeContext): never {
  // cordis Context 只需结构子集；资产处理器只用 emit 与 clientModules.fetchBundle。
  return ctx as never
}

function request(path: string, method = 'GET'): Request {
  return new Request(`dsh-app://app${path}`, { method })
}

describe('asset handler', () => {
  it('serves index.html with the transport script injected', async () => {
    const { ctx, emitted } = fakeContext()
    const response = await createAssetHandler(asContext(ctx), distRoot).fetch(request('/index.html'))
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8')
    const body = await response.text()
    expect(body).toContain('globalThis.__DSH_TRANSPORT__')
    expect(body).toContain('<div id="app"></div>')
    expect(emitted.map(([event]) => event)).toEqual(['webserver/index-inject'])
  })

  it('keeps ownsHost true so the client treats the shell as loopback', () => {
    expect(SHELL_TRANSPORT_SCRIPT).toContain('ownsHost:true')
  })

  it('serves the root path as index.html and a nested asset with its MIME type', async () => {
    const { ctx } = fakeContext()
    const handler = createAssetHandler(asContext(ctx), distRoot)
    expect((await handler.fetch(request('/'))).status).toBe(200)
    const css = await handler.fetch(request('/assets/app.css'))
    expect(css.headers.get('content-type')).toBe('text/css; charset=utf-8')
    expect(await css.text()).toContain('rebeccapurple')
  })

  it('falls back to index.html for an unknown SPA route', async () => {
    const { ctx } = fakeContext()
    const response = await createAssetHandler(asContext(ctx), distRoot).fetch(request('/sessions/42'))
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('__DSH_TRANSPORT__')
  })

  it('rejects path traversal with 403 and non-read methods with 405', async () => {
    const { ctx } = fakeContext()
    const handler = createAssetHandler(asContext(ctx), distRoot)
    expect((await handler.fetch(request('/%2e%2e%2fpackage.json'))).status).toBe(403)
    expect((await handler.fetch(request('/index.html', 'POST'))).status).toBe(405)
  })

  it('forwards /plugins/ to the client module bundle fetcher', async () => {
    const { ctx, fetchBundle } = fakeContext()
    const response = await createAssetHandler(asContext(ctx), distRoot)
      .fetch(request('/plugins/dsh-client-ui-chat.js'))
    expect(fetchBundle).toHaveBeenCalledOnce()
    expect(await response.text()).toBe('bundle-bytes')
  })

  it('declares a buffered request body mode', () => {
    const { ctx } = fakeContext()
    expect(createAssetHandler(asContext(ctx), distRoot).requestBodyMode()).toBe('buffered')
  })
})

describe('resolveFrontendDistRoot', () => {
  it('fails loud when the frontend package is not installed in the profile', () => {
    expect(() => resolveFrontendDistRoot(join(import.meta.dirname, 'fixtures', 'profile')))
      .toThrow(/^lute shell: profile .* has no installed @deepseek-ai\/dsh-web-frontend/u)
  })
})
```

- [ ] **Step 3: 写失败测试 `test/streams.spec.ts`**

```typescript
import { describe, expect, it, vi } from 'vitest'
import { REMOTE_STREAM_PATH, createRemoteStreamHandler } from '../src/host/streams.js'

function contextWith(gateway: unknown): never {
  return { get: (name: string) => (name === 'typertGateway' ? gateway : undefined) } as never
}

function post(body: unknown): Request {
  return new Request(`dsh-app://app${REMOTE_STREAM_PATH}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('remote stream handler', () => {
  it('bridges gateway wire values into NDJSON', async () => {
    const open = vi.fn(async function* () {
      yield { seq: 1 }
      yield { seq: 2 }
    })
    const response = await createRemoteStreamHandler(contextWith({ wireStream: { open } }))
      .fetch(post({ endpoint: 'session.events', payload: { id: 's1' } }))
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/x-ndjson')
    expect(await response.text()).toBe('{"seq":1}\n{"seq":2}\n')
    expect(open).toHaveBeenCalledWith('session.events', { id: 's1' }, expect.any(AbortSignal))
  })

  it('returns 503 without a gateway', async () => {
    const response = await createRemoteStreamHandler(contextWith(undefined)).fetch(post({ endpoint: 'x' }))
    expect(response.status).toBe(503)
  })

  it('returns 405 on GET and 400 on a malformed body', async () => {
    const handler = createRemoteStreamHandler(contextWith({ wireStream: { open: vi.fn() } }))
    expect((await handler.fetch(new Request(`dsh-app://app${REMOTE_STREAM_PATH}`))).status).toBe(405)
    expect((await handler.fetch(post({ payload: 1 }))).status).toBe(400)
    expect((await handler.fetch(new Request(`dsh-app://app${REMOTE_STREAM_PATH}`, {
      method: 'POST',
      body: 'not json',
    }))).status).toBe(400)
  })

  it('surfaces a gateway failure as a stream error', async () => {
    const open = vi.fn(async function* () {
      yield { seq: 1 }
      throw new Error('gateway exploded')
    })
    const response = await createRemoteStreamHandler(contextWith({ wireStream: { open } }))
      .fetch(post({ endpoint: 'session.events', payload: {} }))
    await expect(response.text()).rejects.toThrow(/gateway exploded/u)
  })

  it('declares a buffered request body mode', () => {
    expect(createRemoteStreamHandler(contextWith(undefined)).requestBodyMode()).toBe('buffered')
  })
})
```

- [ ] **Step 4: 跑测试确认失败**

Run: `cd /Users/lute/project/Magpie-Horch/apps/lute-shell && pnpm exec vitest run test/assets.spec.ts test/streams.spec.ts`
Expected: FAIL —— 两个模块都 `Cannot find module`

- [ ] **Step 5: 写 `src/host/handler.ts`**

```typescript
/** One routable request handler inside the host process. */

/** Fetch-shaped handler with an explicit request-body buffering mode. */
export interface FetchHandler {
  /** How the transport must deliver the request body. */
  requestBodyMode(): 'buffered'
  /** Serve one request. */
  fetch(request: Request): Promise<Response>
}
```

- [ ] **Step 6: 写 `src/host/assets.ts`**

```typescript
/** Serves the prebuilt harness SPA and injects the shell-owned page transport. */

import { createRequire } from 'node:module'
import { realpathSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, extname, join, normalize, resolve, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { renderIndexInjections, type IndexInjection } from '@deepseek-ai/dsh-host-webserver'
import type { FetchHandler } from './handler.js'

/** Endpoint the page transport POSTs to for gateway streaming. */
export const REMOTE_STREAM_PATH = '/.dsh/remote-stream'

/**
 * Page transport adopted by the client bundles. `ownsHost: true` is what makes the client
 * treat this origin as loopback (dsh-client-connection client/index.ts:227).
 */
export const SHELL_TRANSPORT_SCRIPT = `globalThis.__DSH_TRANSPORT__={
  ownsHost:true,
  async *openStream(endpoint,payload,signal){
    const response=await fetch(${JSON.stringify(REMOTE_STREAM_PATH)},{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({endpoint,payload}),signal
    })
    if(!response.ok||response.body===null)throw new Error('lute shell: stream transport failed: HTTP '+response.status)
    const reader=response.body.getReader(),decoder=new TextDecoder()
    let pending=''
    for(;;){
      const {done,value}=await reader.read()
      pending+=decoder.decode(value,{stream:!done})
      let newline
      while((newline=pending.indexOf('\\n'))!==-1){
        const line=pending.slice(0,newline);pending=pending.slice(newline+1)
        if(line!=='')yield JSON.parse(line)
      }
      if(done)break
    }
    if(pending!=='')yield JSON.parse(pending)
  }
}`

const MIME: Readonly<Record<string, string>> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
}

/**
 * Resolve the installed SPA dist root from one materialized profile.
 * @param profileDir - profile whose node_modules carries the frontend package.
 * @returns realpath of the directory holding index.html.
 */
export function resolveFrontendDistRoot(profileDir: string): string {
  const require = createRequire(join(profileDir, 'package.json'))
  let distIndex: string
  try {
    distIndex = require.resolve('@deepseek-ai/dsh-web-frontend/dist/index.html')
  } catch {
    throw new Error(`lute shell: profile ${profileDir} has no installed @deepseek-ai/dsh-web-frontend`)
  }
  return realpathSync(dirname(distIndex))
}

/**
 * Serve SPA assets and client plugin bundles for one host context.
 * @param ctx - booted host context supplying clientModules and index-inject events.
 * @param distRoot - realpath of the frontend dist directory.
 * @returns handler for every request that is not an API or stream call.
 */
export function createAssetHandler(ctx: Context, distRoot: string): FetchHandler {
  const renderIndex = async (): Promise<Response> => {
    const rows: IndexInjection[] = [{ kind: 'script', placement: 'head', text: SHELL_TRANSPORT_SCRIPT }]
    ctx.emit('webserver/index-inject', rows)
    const body = renderIndexInjections(await readFile(join(distRoot, 'index.html'), 'utf8'), rows)
    return new Response(body, { headers: { 'content-type': MIME['.html'] ?? 'text/html; charset=utf-8' } })
  }
  return {
    requestBodyMode: () => 'buffered',
    async fetch(request): Promise<Response> {
      if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405 })
      const url = new URL(request.url)
      if (url.pathname.startsWith('/plugins/')) return ctx.clientModules.fetchBundle(request)
      let pathname: string
      try {
        pathname = decodeURIComponent(url.pathname)
      } catch {
        return new Response(null, { status: 400 })
      }
      if (pathname === '/' || pathname === '/index.html') return renderIndex()
      const target = resolve(normalize(join(distRoot, pathname)))
      if (target !== distRoot && !target.startsWith(distRoot + sep)) return new Response(null, { status: 403 })
      try {
        const realTarget = realpathSync(target)
        if (realTarget !== distRoot && !realTarget.startsWith(distRoot + sep)) return new Response(null, { status: 403 })
        return new Response(request.method === 'HEAD' ? null : await readFile(realTarget), {
          headers: { 'content-type': MIME[extname(realTarget)] ?? 'application/octet-stream' },
        })
      } catch {
        return renderIndex()
      }
    },
  }
}
```

`REMOTE_STREAM_PATH` 放在 `assets.ts` 是因为注入脚本要把它写进页面；`streams.ts` 从这里导入并再导出同一常量，避免一条事实两个家。

- [ ] **Step 7: 写 `src/host/streams.ts`**

```typescript
/** Bridges gateway wire streams to the page transport as NDJSON. */

import type { Context } from '@deepseek-ai/cordis'
import { REMOTE_STREAM_PATH } from './assets.js'
import type { FetchHandler } from './handler.js'

export { REMOTE_STREAM_PATH }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * Serve the streaming endpoint for one host context.
 * @param ctx - booted host context; `typertGateway` is read per request.
 * @returns handler for POST REMOTE_STREAM_PATH.
 */
export function createRemoteStreamHandler(ctx: Context): FetchHandler {
  return {
    requestBodyMode: () => 'buffered',
    async fetch(request): Promise<Response> {
      if (request.method !== 'POST') return new Response(null, { status: 405 })
      const gateway = ctx.get('typertGateway')
      if (gateway === undefined) return new Response('gateway unavailable', { status: 503 })
      let body: unknown
      try {
        body = await request.json()
      } catch {
        return new Response('body is not JSON', { status: 400 })
      }
      if (!isRecord(body) || typeof body.endpoint !== 'string') {
        return new Response('invalid stream request', { status: 400 })
      }
      const endpoint = body.endpoint
      const abort = new AbortController()
      const cancel = (): void => { abort.abort(request.signal.reason) }
      request.signal.addEventListener('abort', cancel, { once: true })
      const encoder = new TextEncoder()
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          try {
            const values = await gateway.wireStream.open(endpoint, body.payload, abort.signal)
            for await (const value of values) {
              controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`))
            }
            controller.close()
          } catch (error) {
            controller.error(error)
          } finally {
            request.signal.removeEventListener('abort', cancel)
          }
        },
        cancel(reason) {
          abort.abort(reason)
          request.signal.removeEventListener('abort', cancel)
        },
      })
      return new Response(stream, { headers: { 'content-type': 'application/x-ndjson' } })
    },
  }
}
```

- [ ] **Step 8: 跑测试确认通过**

Run: `cd /Users/lute/project/Magpie-Horch/apps/lute-shell && pnpm exec vitest run test/assets.spec.ts test/streams.spec.ts`
Expected: PASS（assets 8 + streams 5）

若 `renderIndexInjections` 的实际签名与上面用法不符（例如要求 `rows` 为可变数组或返回 `Promise`），以 `node_modules/@deepseek-ai/dsh-host-webserver/lib/types/index.d.ts` 的真实声明为准调整调用点，**不要**放宽测试断言。

- [ ] **Step 9: 类型检查 + 全量测试**

Run: `cd /Users/lute/project/Magpie-Horch/apps/lute-shell && pnpm run typecheck && pnpm run test`
Expected: 退出码 0

- [ ] **Step 10: 提交**

```bash
cd /Users/lute/project/Magpie-Horch
git add apps/lute-shell/src/host/handler.ts apps/lute-shell/src/host/assets.ts \
  apps/lute-shell/src/host/streams.ts apps/lute-shell/test/assets.spec.ts \
  apps/lute-shell/test/streams.spec.ts apps/lute-shell/test/fixtures/frontend
git commit -m "$(cat <<'EOF'
feat(apps): lute-shell 资产与流处理——SPA 注入 ownsHost 传输 + NDJSON 网关桥

注入脚本保留 ownsHost:true（dsh-client-connection client/index.ts:227 用它判 loopback）。
实测 shipped dist 里 dshDesktop/__DSH_TRANSPORT__ 字面量为 0，客户端 bundle 运行时经
/plugins/* 取，故薄壳本期不需要 preload 脚本。
EOF
)"
```

---

### Task 5: 宿主子进程入口 `src/host/index.ts`

**Files:**
- Create: `apps/lute-shell/src/host/index.ts`
- Test: `apps/lute-shell/test/host-entry.spec.ts`

**Interfaces:**
- Consumes: Task 2 的 `protocol.js` 全部导出；Task 3 的 `composeShellPatches`/`rootConfigPath`/`ROOT_CONFIG_CONTENT`/`SHELL_LABEL`；Task 4 的 `createAssetHandler`/`createRemoteStreamHandler`/`resolveFrontendDistRoot`/`REMOTE_STREAM_PATH`/`FetchHandler`；`boot`、`loadLayeredEnv` from `@deepseek-ai/dsh-app-boot`；`provideCmdline` from `@deepseek-ai/dsh-cmdline`；`DSH_LAUNCH_ENVIRONMENT_KEY` from `@deepseek-ai/dsh-launch-environment`。
- Produces:
  - `interface HostFetchCommand { readonly streamId: number; readonly request: { readonly url: string; readonly method: string; readonly headers: readonly [string, string][] } }`
  - `interface HostController { readonly dshVersion: string; fetch(command: HostFetchCommand, body: ReadableStream<Uint8Array> | null): Promise<void>; cancel(streamId: number): void; dispose(): Promise<void> }`
  - `routeRequest(pathname: string): 'stream' | 'api' | 'assets'`
  - `runShellHost(input: { profileDir: string; overlayPatchPath: string; writeResponse: (frame: Buffer) => Promise<void> }): Promise<HostController>`
  - `startHostProcess(argv: readonly string[]): Promise<void>`

- [ ] **Step 1: 写失败测试**

`apps/lute-shell/test/host-entry.spec.ts`：

```typescript
import { describe, expect, it } from 'vitest'
import { routeRequest } from '../src/host/index.js'

describe('routeRequest', () => {
  it('sends the stream endpoint, the API prefix and everything else to their handlers', () => {
    expect(routeRequest('/.dsh/remote-stream')).toBe('stream')
    expect(routeRequest('/api/session/list')).toBe('api')
    expect(routeRequest('/api')).toBe('assets')
    expect(routeRequest('/index.html')).toBe('assets')
    expect(routeRequest('/plugins/dsh-client-ui-chat.js')).toBe('assets')
    expect(routeRequest('/')).toBe('assets')
  })
})
```

`runShellHost` 的真实组装在 Task 7 的无头 smoke 里对真 profile 验证（需要数百个已安装包，不适合放进单元测试）；这里只锁路由这一处纯逻辑。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /Users/lute/project/Magpie-Horch/apps/lute-shell && pnpm exec vitest run test/host-entry.spec.ts`
Expected: FAIL —— `Cannot find module '../src/host/index.js'`

- [ ] **Step 3: 写 `runShellHost` 与 `routeRequest`**

`apps/lute-shell/src/host/index.ts` 的上半部分（自有代码，完整给出）：

```typescript
/** Plain-Node child process: boots the profile and carries API plus SPA assets over framed pipes. */

import { createRequire } from 'node:module'
import { closeSync, createReadStream, createWriteStream, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { once } from 'node:events'
import { join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import { boot, loadLayeredEnv } from '@deepseek-ai/dsh-app-boot'
import { provideCmdline } from '@deepseek-ai/dsh-cmdline'
import { DSH_LAUNCH_ENVIRONMENT_KEY } from '@deepseek-ai/dsh-launch-environment'
import type {} from '@deepseek-ai/dsh-api-gateway'
import type {} from '@deepseek-ai/dsh-client-modules'
import {
  HostRequestDecoder,
  SHELL_HOST_PROTOCOL_VERSION,
  SHELL_PIPE_CHUNK_BYTES,
  SHELL_REQUEST_PIPE_FD,
  SHELL_RESPONSE_PIPE_FD,
  encodeResponseData,
  encodeResponseEnd,
  encodeResponseError,
  encodeResponseStart,
  isHostCommand,
  type HostEvent,
  type HostRequestFrame,
} from '../protocol.js'
import { ROOT_CONFIG_CONTENT, SHELL_LABEL, composeShellPatches, rootConfigPath } from './composition.js'
import { REMOTE_STREAM_PATH, createAssetHandler, resolveFrontendDistRoot } from './assets.js'
import { createRemoteStreamHandler } from './streams.js'
import type { FetchHandler } from './handler.js'

/** One request forwarded from the shell's `dsh-app://` handler. */
export interface HostFetchCommand {
  readonly streamId: number
  readonly request: {
    readonly url: string
    readonly method: string
    readonly headers: readonly [string, string][]
  }
}

/** Controller returned to tests and to the self-executing process entry. */
export interface HostController {
  /** Installed dsh version carried by this host. */
  readonly dshVersion: string
  /** Dispatch one custom-protocol request and stream its response to the response pipe. */
  fetch(command: HostFetchCommand, body: ReadableStream<Uint8Array> | null): Promise<void>
  /** Abort one in-flight request. */
  cancel(streamId: number): void
  /** Stop accepting messages and await complete host teardown. */
  dispose(): Promise<void>
}

interface NodeRequestInit extends RequestInit {
  readonly duplex?: 'half'
}

type RouteTarget = 'stream' | 'api' | 'assets'

/** Which handler owns one request pathname. */
export function routeRequest(pathname: string): RouteTarget {
  if (pathname === REMOTE_STREAM_PATH) return 'stream'
  if (pathname.startsWith('/api/')) return 'api'
  return 'assets'
}

function isInside(root: string, target: string): boolean {
  const resolved = realpathSync(target)
  return resolved === root || resolved.startsWith(root + sep)
}

function readDshVersion(profileDir: string): string {
  const require = createRequire(join(profileDir, 'package.json'))
  const manifest = JSON.parse(readFileSync(require.resolve('@deepseek-ai/dsh/package.json'), 'utf8')) as { version?: unknown }
  if (typeof manifest.version !== 'string') throw new Error('lute shell: installed dsh manifest has no version')
  return manifest.version
}

/**
 * Boot one materialized profile.
 * @param input - profile directory, shell overlay path, and drain-aware response writer.
 * @returns controller after every host and client-manifest row is active.
 */
export async function runShellHost(input: {
  profileDir: string
  overlayPatchPath: string
  writeResponse: (frame: Buffer) => Promise<void>
}): Promise<HostController> {
  const { writeResponse } = input
  mkdirSync(input.profileDir, { recursive: true })
  const profileRoot = realpathSync(input.profileDir)
  const rootConfig = rootConfigPath(input.profileDir)
  writeFileSync(rootConfig, ROOT_CONFIG_CONTENT)
  const composition = composeShellPatches({
    profileDir: input.profileDir,
    overlayPatchPath: input.overlayPatchPath,
  })
  for (const [index, layerDir] of composition.layerDirs.entries()) {
    if (!isInside(profileRoot, layerDir)) {
      throw new Error(`lute shell: profile bundle ${JSON.stringify(composition.layerNames[index])} resolved outside the profile`)
    }
  }
  const environment = loadLayeredEnv(SHELL_LABEL)
  let current: Context | undefined
  const ctx = await boot(SHELL_LABEL, rootConfig, composition.patches, (hostCtx) => {
    current = hostCtx
    hostCtx.provide(DSH_LAUNCH_ENVIRONMENT_KEY, environment)
    provideCmdline(hostCtx, { args: [], exit: () => {} })
  })
  current = ctx
  const connection = ctx.get('connection')
  const clientModules = ctx.get('clientModules')
  const gateway = ctx.get('typertGateway')
  if (connection === undefined || clientModules === undefined || gateway === undefined) {
    await ctx.fiber.dispose()
    throw new Error('lute shell: composition did not provide connection, typertGateway, and clientModules')
  }
  const api = connection.createSharedFetchHandler('/api')
  const handlers: Record<RouteTarget, FetchHandler> = {
    api: { requestBodyMode: () => 'buffered', fetch: (request) => api.fetch(request) },
    assets: createAssetHandler(ctx, resolveFrontendDistRoot(input.profileDir)),
    stream: createRemoteStreamHandler(ctx),
  }
  const requests = new Map<number, AbortController>()
  let disposing: Promise<void> | undefined

  const dispose = async (): Promise<void> => {
    disposing ??= (async () => {
      for (const controller of requests.values()) controller.abort()
      requests.clear()
      await current?.fiber.dispose()
      current = undefined
    })()
    await disposing
  }

  return {
    dshVersion: readDshVersion(input.profileDir),
    cancel(streamId) {
      requests.get(streamId)?.abort()
    },
    async fetch(command, body) {
      if (disposing !== undefined) throw new Error('lute shell: host is disposing')
      const controller = new AbortController()
      requests.set(command.streamId, controller)
      try {
        const url = new URL(command.request.url)
        const init: NodeRequestInit = {
          method: command.request.method,
          headers: new Headers(command.request.headers.map(([name, value]) => [name, value] as [string, string])),
          ...(body === null ? {} : { body, duplex: 'half' }),
          signal: controller.signal,
        }
        const response = await handlers[routeRequest(url.pathname)].fetch(new Request(url, init))
        await writeResponse(encodeResponseStart(command.streamId, {
          status: response.status,
          headers: [...response.headers.entries()],
          hasBody: response.body !== null,
        }))
        if (response.body !== null) {
          for await (const chunk of response.body) {
            const bytes = Buffer.from(chunk)
            for (let offset = 0; offset < bytes.byteLength; offset += SHELL_PIPE_CHUNK_BYTES) {
              await writeResponse(encodeResponseData(
                command.streamId,
                bytes.subarray(offset, offset + SHELL_PIPE_CHUNK_BYTES),
              ))
            }
          }
        }
        await writeResponse(encodeResponseEnd(command.streamId))
      } catch (error) {
        if (!controller.signal.aborted) {
          await writeResponse(encodeResponseError(
            command.streamId,
            error instanceof Error ? error.message : String(error),
          ))
        }
      } finally {
        requests.delete(command.streamId)
      }
    },
    dispose,
  }
}
```

`mkdirSync` 必须在 `realpathSync` 之前：profile 目录首次运行时还不存在，先 realpath 会直接抛 `ENOENT`。

- [ ] **Step 4: 写 `startHostProcess`（逐段移植上游 `main()`）**

参照 `vendor/dsh-desktop/deepseek-harness/apps/desktop-host/src/index.ts:376-587`，逐段移植，**只有四处差异**：

1. 不接受 `--allow-linked-profile`：`argv[3]` 非 `undefined` 就抛 `lute shell: unsupported host argument ${JSON.stringify(argv[3])}`（P1 的 profile 是真装出来的，没有 linked bundle；越界检查已在 `runShellHost` 内保留）。
2. overlay 路径由就位布局推出：`fileURLToPath(new URL('../shell.cordis.patch.yml', import.meta.url))`——宿主运行时在 `<profile>/lute-host/host/index.js`，overlay 在 `<profile>/lute-host/shell.cordis.patch.yml`（Task 6 的 `planMaterialize` 保证这个相对关系）。
3. 符号名换成 Task 2 的：`DESKTOP_*` → `SHELL_*`、`DesktopHostRequestDecoder` → `HostRequestDecoder`、`encodeDesktopResponse*` → `encodeResponse*`、`isDesktopHostCommand` → `isHostCommand`、`DesktopHostEvent` → `HostEvent`、`DesktopHostRequestFrame` → `HostRequestFrame`；错误前缀 `dsh desktop: ` → `lute shell: `。
4. 入口判定不用 `import.meta.main`（Node 24 才有，仓库 engines 允许 `^22.19`）：

```typescript
const entryPath = process.argv[1]
const isEntry = entryPath !== undefined && realpathSync(entryPath) === realpathSync(fileURLToPath(import.meta.url))
if (isEntry) {
  startHostProcess(process.argv).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    if (process.send !== undefined) process.send({ type: 'fatal', message } satisfies HostEvent)
    else process.stderr.write(`lute shell: ${message}\n`)
    process.exitCode = 1
  })
}
```

移植时必须逐字保留的行为（它们是协议正确性，不是风格）：`writeResponse` 的串行 tail + `drain` 背压；`send()` 只吞 `ERR_IPC_CHANNEL_CLOSED`、其余照抛；`beginRequest` 的 `streamId` 单调递增检查；`data` 帧在 `desiredSize <= 0` 时 `requestPipe.pause()` 并记入 `blockedRequests`；`end`/`cancel` 对已丢弃 body 的 `discardedRequestBodies` 分支；`stop()` 的收敛顺序（pause → error 掉未决 body → destroy 请求管道 → `closeSync(FD3)` → `controller.dispose()` → `allSettled(runs)` → 等 `responseWriteTail` → end+destroy 响应管道 → `closeSync(FD4)` → `disconnect` → 设 `exitCode`）；`disconnect`/`SIGTERM`/`SIGINT` 三个触发点；`requestPipe.once('end')` 在已 stopping 时静默返回。

- [ ] **Step 5: 跑测试确认通过**

Run: `cd /Users/lute/project/Magpie-Horch/apps/lute-shell && pnpm exec vitest run test/host-entry.spec.ts`
Expected: PASS（1 test）

- [ ] **Step 6: 类型检查 + 全量测试**

Run: `cd /Users/lute/project/Magpie-Horch/apps/lute-shell && pnpm run typecheck && pnpm run test`
Expected: 退出码 0

- [ ] **Step 7: 提交**

```bash
cd /Users/lute/project/Magpie-Horch
git add apps/lute-shell/src/host/index.ts apps/lute-shell/test/host-entry.spec.ts
git commit -m "$(cat <<'EOF'
feat(apps): lute-shell 宿主子进程入口——boot + 三路分发 + 优雅退出

管道背压、streamId 单调、SIGTERM/disconnect 收敛顺序逐段对齐上游 desktop-host；
差异：不接受 --allow-linked-profile、overlay 路径由就位布局推出、入口判定不依赖
import.meta.main（Node 22 无该属性）。
EOF
)"
```

---

### Task 6: profile seed 与物化

**Files:**
- Create: `apps/lute-shell/seed/package.json`
- Create: `apps/lute-shell/seed/pnpm-workspace.yaml`
- Create: `apps/lute-shell/seed/cordis.yml`
- Create: `apps/lute-shell/seed/cordis.patch.yml`
- Create: `apps/lute-shell/src/profile/layout.ts`
- Create: `apps/lute-shell/src/profile/materialize.ts`
- Create: `apps/lute-shell/scripts/materialize.mjs`
- Test: `apps/lute-shell/test/layout.spec.ts`
- Test: `apps/lute-shell/test/materialize.spec.ts`

**Interfaces:**
- Consumes: 无（`layout.ts` 是纯路径计算，不导入 composition）。
- Produces:
  - `const PROFILE_LABEL = 'lute-shell'`
  - `const HOST_DIR_NAME = 'lute-host'`
  - `const SEED_FILES: readonly ['package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml', 'cordis.yml', 'cordis.patch.yml']`
  - `const HOST_LIB_FILES: readonly ['protocol.js', 'host/index.js', 'host/composition.js', 'host/assets.js', 'host/streams.js', 'host/handler.js']`
  - `const HOST_CONFIG_FILE = 'config/shell.cordis.patch.yml'`
  - `defaultProfileDir(homedir: string): string`
  - `hostEntryPath(profileDir: string): string`
  - `overlayPath(profileDir: string): string`
  - `interface CopyPlan { readonly entries: readonly { readonly from: string; readonly to: string }[] }`
  - `planMaterialize(input: { seedDir: string; shellRoot: string; profileDir: string }): CopyPlan`
  - `interface MaterializedProfile { readonly profileDir: string; readonly hostEntry: string; readonly overlay: string; readonly installed: boolean }`
  - `materializeProfile(input: { seedDir: string; shellRoot: string; profileDir: string; install?: (profileDir: string) => Promise<void> }): Promise<MaterializedProfile>`
  - `defaultInstall(profileDir: string): Promise<void>`

- [ ] **Step 1: 写 seed**

`apps/lute-shell/seed/package.json`（宿主侧导入的包**显式列为直接依赖**，保证 hoisted 后一定在 `<profile>/node_modules/` 顶层，宿主裸导入才解析到唯一一份 cordis）：

```json
{
  "name": "lute-shell-profile",
  "private": true,
  "type": "module",
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app"
      ],
      "patchReload": "live"
    }
  },
  "dependencies": {
    "@deepseek-ai/cordis": "4.0.2",
    "@deepseek-ai/cordis-plugin-include": "1.0.7",
    "@deepseek-ai/dsh": "0.1.5-rc.2",
    "@deepseek-ai/dsh-api-gateway": "0.1.5-rc.2",
    "@deepseek-ai/dsh-app-boot": "0.1.5-rc.2",
    "@deepseek-ai/dsh-base": "0.1.5-rc.2",
    "@deepseek-ai/dsh-client-connection": "0.1.5-rc.2",
    "@deepseek-ai/dsh-client-modules": "0.1.5-rc.2",
    "@deepseek-ai/dsh-cmdline": "0.1.5-rc.2",
    "@deepseek-ai/dsh-host-webserver": "0.1.5-rc.2",
    "@deepseek-ai/dsh-launch-environment": "0.1.5-rc.2",
    "@deepseek-ai/dsh-web-app": "0.1.5-rc.2",
    "@deepseek-ai/dsh-web-frontend": "0.1.5-rc.2"
  }
}
```

`apps/lute-shell/seed/pnpm-workspace.yaml`（`nodeLinker: hoisted` 对齐真实 profile）：

```yaml
packages:
  - .

nodeLinker: hoisted
autoInstallPeers: false
overrides:
  "@deepseek-ai/dsh-type-meta": "npm:empty-npm-package@1.0.0"
  "@deepseek-ai/dsh-user-interaction": "npm:empty-npm-package@1.0.0"
```

`apps/lute-shell/seed/cordis.yml`：

```yaml
# lute-shell composition root; the profile seed owns this file.
[]
```

`apps/lute-shell/seed/cordis.patch.yml`：

```yaml
# 用户层：P1 留空。P2 起在这里声明 LUTE 插件的 id / config / disabled。
[]
```

`seed/pnpm-lock.yaml` 不在本步手写，由紧接着的 Step 1b 生成——注意顺序是承重的：`SEED_FILES` 含 `pnpm-lock.yaml`，而 `assertPlan` 对缺失的 seed 文件直接抛错，所以 lockfile 必须在 Step 11 跑 `materialize` **之前**就存在于 seed 里。

- [ ] **Step 1b: 生成 seed 的 lockfile（不装 node_modules）**

Run: `cd /Users/lute/project/Magpie-Horch/apps/lute-shell/seed && pnpm install --lockfile-only`
Expected: 只写出 `pnpm-lock.yaml`，**不产生 `node_modules/`**。seed 自带 `pnpm-workspace.yaml`，故它自己就是 workspace 根，pnpm 不会向上走到 `apps/lute-shell/` 那个项目。

Run: `ls /Users/lute/project/Magpie-Horch/apps/lute-shell/seed`
Expected: `cordis.patch.yml  cordis.yml  package.json  pnpm-lock.yaml  pnpm-workspace.yaml`（五个文件，恰好等于 `SEED_FILES`，无 `node_modules`）

Run: `cd /Users/lute/project/Magpie-Horch && git check-ignore apps/lute-shell/seed/pnpm-lock.yaml ; echo "exit=$?"`
Expected: 无输出、`exit=1`（可入库）。用不带 `-v` 的形式——`-v` 在未提交时会打印命中的否定模式并返回 0，读起来像反的（见 Task 1 Step 10 的说明）。

Run: `grep -c "0.1.5-rc.2" /Users/lute/project/Magpie-Horch/apps/lute-shell/seed/pnpm-lock.yaml`
Expected: 一个大于 0 的数（锁文件确实按精确版本解析了）。若这里是 0，说明有依赖被解到别的版本线上——停下来查 `pnpm why`，不要继续。

- [ ] **Step 2: 写失败测试 `test/layout.spec.ts`**

```typescript
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  HOST_CONFIG_FILE,
  HOST_DIR_NAME,
  HOST_LIB_FILES,
  PROFILE_LABEL,
  SEED_FILES,
  defaultProfileDir,
  hostEntryPath,
  overlayPath,
  planMaterialize,
} from '../src/profile/layout.js'

const shellRoot = '/repo/apps/lute-shell'
const seedDir = `${shellRoot}/seed`
const profileDir = '/home/lute/.dsh/profiles/lute-shell'

describe('layout', () => {
  it('puts the profile under DSH_HOME with the shell label', () => {
    expect(PROFILE_LABEL).toBe('lute-shell')
    expect(defaultProfileDir('/home/lute')).toBe(join('/home/lute', '.dsh', 'profiles', 'lute-shell'))
  })

  it('plans every seed file onto the profile root, in order', () => {
    const plan = planMaterialize({ seedDir, shellRoot, profileDir })
    const seedTargets = plan.entries.filter(entry => entry.from.startsWith(seedDir))
    expect(seedTargets.map(entry => entry.from)).toEqual(SEED_FILES.map(name => join(seedDir, name)))
    expect(seedTargets.map(entry => entry.to)).toEqual(SEED_FILES.map(name => join(profileDir, name)))
    expect([...SEED_FILES]).toEqual(['package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml', 'cordis.yml', 'cordis.patch.yml'])
  })

  it('plans the built host runtime into lute-host/ preserving relative imports', () => {
    const plan = planMaterialize({ seedDir, shellRoot, profileDir })
    const hostTargets = plan.entries.filter(entry => entry.from.startsWith(join(shellRoot, 'lib')))
    expect(hostTargets.map(entry => entry.from)).toEqual(HOST_LIB_FILES.map(name => join(shellRoot, 'lib', name)))
    expect(hostTargets.map(entry => entry.to)).toEqual(HOST_LIB_FILES.map(name => join(profileDir, HOST_DIR_NAME, name)))
  })

  it('plans the overlay next to the host entry and exposes both paths', () => {
    const plan = planMaterialize({ seedDir, shellRoot, profileDir })
    expect(plan.entries).toContainEqual({
      from: join(shellRoot, HOST_CONFIG_FILE),
      to: join(profileDir, HOST_DIR_NAME, 'shell.cordis.patch.yml'),
    })
    expect(hostEntryPath(profileDir)).toBe(join(profileDir, HOST_DIR_NAME, 'host', 'index.js'))
    expect(overlayPath(profileDir)).toBe(join(profileDir, HOST_DIR_NAME, 'shell.cordis.patch.yml'))
  })
})
```

- [ ] **Step 3: 跑测试确认失败**

Run: `cd /Users/lute/project/Magpie-Horch/apps/lute-shell && pnpm exec vitest run test/layout.spec.ts`
Expected: FAIL —— `Cannot find module '../src/profile/layout.js'`

- [ ] **Step 4: 写 `src/profile/layout.ts`**

```typescript
/** Where the profile seed and the built host runtime land inside a materialized profile. */

import { join } from 'node:path'

/** Profile directory name under `$DSH_HOME/profiles`. */
export const PROFILE_LABEL = 'lute-shell'

/** Subdirectory of the profile carrying this shell's host runtime. */
export const HOST_DIR_NAME = 'lute-host'

/** Seed files copied verbatim onto the profile root. */
export const SEED_FILES = ['package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml', 'cordis.yml', 'cordis.patch.yml'] as const

/** Built host modules relative to `lib/`; relative imports survive the copy because the layout is preserved. */
export const HOST_LIB_FILES = [
  'protocol.js',
  'host/index.js',
  'host/composition.js',
  'host/assets.js',
  'host/streams.js',
  'host/handler.js',
] as const

/** Overlay source relative to the shell package root. */
export const HOST_CONFIG_FILE = 'config/shell.cordis.patch.yml'

/** One planned file copy. */
export interface CopyPlan {
  readonly entries: readonly { readonly from: string; readonly to: string }[]
}

/**
 * Resolve the profile directory for one home directory.
 * @param homedir - absolute home directory.
 * @returns `$homedir/.dsh/profiles/lute-shell`.
 */
export function defaultProfileDir(homedir: string): string {
  return join(homedir, '.dsh', 'profiles', PROFILE_LABEL)
}

/** Absolute host child-process entry inside one materialized profile. */
export function hostEntryPath(profileDir: string): string {
  return join(profileDir, HOST_DIR_NAME, 'host', 'index.js')
}

/** Absolute overlay patch file inside one materialized profile. */
export function overlayPath(profileDir: string): string {
  return join(profileDir, HOST_DIR_NAME, 'shell.cordis.patch.yml')
}

/**
 * Plan every copy the materializer performs.
 * @param input - seed directory, shell package root, and target profile directory.
 * @returns ordered copy entries, seed files first.
 */
export function planMaterialize(input: { seedDir: string; shellRoot: string; profileDir: string }): CopyPlan {
  return {
    entries: [
      ...SEED_FILES.map(name => ({ from: join(input.seedDir, name), to: join(input.profileDir, name) })),
      ...HOST_LIB_FILES.map(name => ({
        from: join(input.shellRoot, 'lib', name),
        to: join(input.profileDir, HOST_DIR_NAME, name),
      })),
      { from: join(input.shellRoot, HOST_CONFIG_FILE), to: overlayPath(input.profileDir) },
    ],
  }
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `cd /Users/lute/project/Magpie-Horch/apps/lute-shell && pnpm exec vitest run test/layout.spec.ts`
Expected: PASS（4 tests）

- [ ] **Step 6: 写失败测试 `test/materialize.spec.ts`**

```typescript
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HOST_CONFIG_FILE, HOST_DIR_NAME, HOST_LIB_FILES, SEED_FILES } from '../src/profile/layout.js'
import { materializeProfile } from '../src/profile/materialize.js'

const realShellRoot = join(import.meta.dirname, '..')
const seedDir = join(realShellRoot, 'seed')
const created: string[] = []

function tempDir(label: string): string {
  const dir = join(tmpdir(), `lute-shell-${label}-${String(created.length)}-${String(Date.now())}`)
  created.push(dir)
  return dir
}

// 临时 shellRoot：桩 lib/ + 真 overlay 副本。绝不往仓库的 lib/ 里写东西——
// 那是构建产物的家，混进桩文件会让后续 build/materialize 拷出假宿主。
function stubShellRoot(): string {
  const root = tempDir('shellroot')
  for (const name of HOST_LIB_FILES) {
    const path = join(root, 'lib', name)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, `// built ${name}\n`)
  }
  mkdirSync(join(root, dirname(HOST_CONFIG_FILE)), { recursive: true })
  cpSync(join(realShellRoot, HOST_CONFIG_FILE), join(root, HOST_CONFIG_FILE))
  return root
}

afterEach(() => {
  while (created.length > 0) rmSync(created.pop() as string, { recursive: true, force: true })
})

describe('materializeProfile', () => {
  it('copies the seed and the built host runtime, then installs', async () => {
    const shellRoot = stubShellRoot()
    const profileDir = tempDir('profile')
    const install = vi.fn(async () => {})

    const result = await materializeProfile({ seedDir, shellRoot, profileDir, install })

    expect(result.installed).toBe(true)
    expect(result.profileDir).toBe(profileDir)
    expect(result.hostEntry).toBe(join(profileDir, HOST_DIR_NAME, 'host', 'index.js'))
    expect(result.overlay).toBe(join(profileDir, HOST_DIR_NAME, 'shell.cordis.patch.yml'))
    expect(install).toHaveBeenCalledWith(profileDir)
    for (const name of SEED_FILES) expect(existsSync(join(profileDir, name)), name).toBe(true)
    for (const name of HOST_LIB_FILES) {
      expect(existsSync(join(profileDir, HOST_DIR_NAME, name)), name).toBe(true)
    }
    expect(existsSync(join(profileDir, HOST_DIR_NAME, 'shell.cordis.patch.yml'))).toBe(true)
    expect(readFileSync(join(profileDir, 'cordis.yml'), 'utf8')).toContain('[]')
  })

  it('is idempotent and re-syncs a drifted seed file', async () => {
    const shellRoot = stubShellRoot()
    const profileDir = tempDir('profile')
    const install = vi.fn(async () => {})
    await materializeProfile({ seedDir, shellRoot, profileDir, install })
    writeFileSync(join(profileDir, 'cordis.yml'), 'drifted\n')

    await materializeProfile({ seedDir, shellRoot, profileDir, install })

    expect(readFileSync(join(profileDir, 'cordis.yml'), 'utf8')).toContain('[]')
    expect(install).toHaveBeenCalledTimes(2)
  })

  it('fails loud when a seed file is missing', async () => {
    await expect(materializeProfile({
      seedDir: join(seedDir, 'absent'),
      shellRoot: stubShellRoot(),
      profileDir: tempDir('profile'),
      install: vi.fn(async () => {}),
    })).rejects.toThrow(/^lute shell: missing seed file /u)
  })

  it('fails loud when the built host runtime is missing', async () => {
    await expect(materializeProfile({
      seedDir,
      shellRoot: tempDir('empty-shellroot'),
      profileDir: tempDir('profile'),
      install: vi.fn(async () => {}),
    })).rejects.toThrow(/^lute shell: built host runtime is missing /u)
  })

  it('propagates an install failure', async () => {
    await expect(materializeProfile({
      seedDir,
      shellRoot: stubShellRoot(),
      profileDir: tempDir('profile'),
      install: async () => { throw new Error('lute shell: pnpm install failed with 1: ERR_PNPM_FETCH_404') },
    })).rejects.toThrow(/ERR_PNPM_FETCH_404/u)
  })
})
```

两条 fail-loud 用例现在各自只缺一样东西（前者缺 seed、后者缺 lib/），所以断言可以收紧成单一措辞而不必用 `|` 兼容两种——这才是「大声失败且说清是哪一种失败」。`stubShellRoot()` 复制的是仓库里**真的** `config/shell.cordis.patch.yml`，故 overlay 缺失不会被误判成 lib 缺失。

- [ ] **Step 7: 跑测试确认失败**

Run: `cd /Users/lute/project/Magpie-Horch/apps/lute-shell && pnpm exec vitest run test/materialize.spec.ts`
Expected: FAIL —— `Cannot find module '../src/profile/materialize.js'`

- [ ] **Step 8: 写 `src/profile/materialize.ts`**

```typescript
/** Materializes the tracked profile seed plus the built host runtime into a runnable profile. */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { copyFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { hostEntryPath, overlayPath, planMaterialize, type CopyPlan } from './layout.js'

/** One materialized profile ready to be handed to the host child process. */
export interface MaterializedProfile {
  readonly profileDir: string
  readonly hostEntry: string
  readonly overlay: string
  readonly installed: boolean
}

function assertPlan(plan: CopyPlan, seedDir: string): void {
  for (const entry of plan.entries) {
    if (existsSync(entry.from)) continue
    throw new Error(entry.from.startsWith(seedDir)
      ? `lute shell: missing seed file ${entry.from}`
      : `lute shell: built host runtime is missing ${entry.from} — run pnpm run build in apps/lute-shell`)
  }
}

/**
 * Install profile dependencies with pnpm.
 * @param profileDir - materialized profile holding package.json and pnpm-lock.yaml.
 */
export function defaultInstall(profileDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('pnpm', ['install', '--dir', profileDir], {
      cwd: profileDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stderr = ''
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => { stderr += chunk })
    child.stdout.resume()
    child.once('error', (error) => {
      reject(new Error(`lute shell: pnpm install failed to start: ${error.message}`))
    })
    child.once('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`lute shell: pnpm install failed with ${String(code)}: ${stderr.trim()}`))
    })
  })
}

/**
 * Copy the seed and host runtime into one profile, then install its dependencies.
 * @param input - seed directory, shell package root, target profile, and install override.
 * @returns the materialized profile paths.
 */
export async function materializeProfile(input: {
  seedDir: string
  shellRoot: string
  profileDir: string
  install?: (profileDir: string) => Promise<void>
}): Promise<MaterializedProfile> {
  const plan = planMaterialize(input)
  assertPlan(plan, input.seedDir)
  for (const entry of plan.entries) {
    await mkdir(dirname(entry.to), { recursive: true })
    await copyFile(entry.from, entry.to)
  }
  const install = input.install ?? defaultInstall
  await install(input.profileDir)
  return {
    profileDir: input.profileDir,
    hostEntry: hostEntryPath(input.profileDir),
    overlay: overlayPath(input.profileDir),
    installed: true,
  }
}
```

`assertPlan` 用 `seedDir` 前缀区分两种失败措辞（seed 文件缺失 vs 忘了先 `pnpm run build`），因为二者的出路完全不同：前者是仓库坏了，后者是本地少跑一步。

- [ ] **Step 9: 跑测试确认通过**

Run: `cd /Users/lute/project/Magpie-Horch/apps/lute-shell && pnpm run build && pnpm exec vitest run test/materialize.spec.ts`
Expected: PASS（5 tests）。`build` 必须先跑——测试拿真的 `lib/` 产物当拷贝源。

- [ ] **Step 10: 写 `scripts/materialize.mjs`**

```javascript
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { defaultProfileDir } from '../lib/profile/layout.js'
import { materializeProfile } from '../lib/profile/materialize.js'

const shellRoot = fileURLToPath(new URL('..', import.meta.url))
const profileDir = process.env.LUTE_SHELL_PROFILE ?? defaultProfileDir(homedir())

const profile = await materializeProfile({
  seedDir: `${shellRoot}seed`,
  shellRoot,
  profileDir,
})
process.stdout.write(`lute shell: profile ready at ${profile.profileDir}\n`)
process.stdout.write(`lute shell: host entry ${profile.hostEntry}\n`)
```

（`fileURLToPath(new URL('..', import.meta.url))` 带尾斜杠，故 `seedDir` 直接拼 `${shellRoot}seed`。）

- [ ] **Step 11: 真装一次 profile（本 task 的实机验收）**

Run: `cd /Users/lute/project/Magpie-Horch/apps/lute-shell && pnpm run build && pnpm run materialize`
Expected: 结尾两行 `lute shell: profile ready at /Users/lute/.dsh/profiles/lute-shell` 与 `lute shell: host entry …/lute-host/host/index.js`。`pnpm install` 会拉数百个包（数分钟，需网络）。

Run:
```bash
cd ~/.dsh/profiles/lute-shell && node --input-type=module -e "
import { loadProfileDirectory } from '@deepseek-ai/dsh-app-boot'
import { join } from 'node:path'
const dir = process.cwd()
const profile = loadProfileDirectory('lute shell', dir, join(dir, 'node_modules/@deepseek-ai/dsh/package.json'))
console.log('layers:', profile.layers.length, profile.layers.map(l => l.packageName).join(', '))
"
```
Expected: `layers: 2 @deepseek-ai/dsh-base, @deepseek-ai/dsh-web-app`

**这就是 P0 报告 §3 那个 PARTIAL 的收口**：layers 从 0 变 2，靠的是 seed `package.json` 里的 `dsh.profile.bundles`，不是 pnpm workspace 结构。

Run: `ls -la ~/.dsh/profiles/lute-shell/node_modules/@deepseek-ai/ | head -5 && du -sh ~/.dsh/profiles/lute-shell`
Expected: 顶层是真目录（hoisted，非 symlink）；总体积远小于线上 desktop profile 的 1.6 G。

Run: `ls ~/.dsh/profiles/lute-shell/node_modules/@deepseek-ai/dsh-web-frontend/dist/index.html`
Expected: 文件存在（Task 4 的 `resolveFrontendDistRoot` 依赖它）

- [ ] **Step 11b: 实测原生依赖与 `exports` 两件事（用户裁决「先实测再定」）**

本机 pnpm 用户级配置设了 `ignoreScripts: true`，所以这次 install **没有跑任何 postinstall**。不预先放宽供应链面，改为实测「随包预编译是否已经够用」：

Run:
```bash
cd ~/.dsh/profiles/lute-shell
echo "--- node-pty ---"; ls node_modules/node-pty/prebuilds/darwin-arm64/ 2>&1; ls -l node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper 2>&1
echo "--- koffi ---"; ls node_modules/@koromix/koffi-darwin-arm64/darwin_arm64/ 2>&1
echo "--- sharp ---"; ls node_modules/@img/ 2>&1 | head
echo "--- node-addon-system ---"; ls node_modules/@deepseek-ai/node-addon-system-*/bin/ 2>&1
```
（`node-addon-system` 本身是纯 JS 派发器、`files` 里没有 `bin/`；真正的 `system.node` 在平台可选依赖 `@deepseek-ai/node-addon-system-darwin-arm64/bin/` 里。上面这条 glob 是对原写法的更正——照原写法 `ls node_modules/@deepseek-ai/node-addon-system/bin/` 必然报 no such file，会被误读成「原生件缺失 ⇒ 需要白名单」，即伪造出一个放宽供应链的理由。）
判读：`pty.node` 与 `koffi.node` 在位即可用（都是 N-API 预编译）；**`spawn-helper` 若没有可执行位（`-rw-r--r--`）就是 `ignoreScripts` 跳过了 `dsh-subprocess-local` 的 chmod postinstall** —— 这正是需要白名单的证据。把四类读数原样贴进 report，缺件或权限不对就明确写「需要白名单，理由是 X」，不要自行加 flag、不要写 `.npmrc`、不要改用户全局配置。

Run: `cd ~/.dsh/profiles/lute-shell && node --input-type=module -e "import { createRequire } from 'node:module'; import { join } from 'node:path'; const r = createRequire(join(process.cwd(), 'package.json')); console.log(r.resolve('@deepseek-ai/dsh/package.json'))"`
Expected: 打印出真实路径。这验的是 Task 5 遗留的一个分裂风险——`readDshVersion` 用 `createRequire().resolve('@deepseek-ai/dsh/package.json')`（受 `exports` map 影响），而 `composition.ts` 的 `installAnchor` 用直接 `join`（免疫）。若这里抛 `ERR_PACKAGE_PATH_NOT_EXPORTED`，说明两条机制在真实包上会分裂失败，必须在 report 里点名（届时 Task 5 的那条 Minor 要升级为 Important）。

- [ ] **Step 12: 验证 install 是锁文件驱动的、且物化幂等**

lockfile 从 Step 1b 起就住在 seed 里并随物化拷进 profile，所以这一步不是「把锁文件拷回来」，而是验证真实 install **没有让锁文件漂移**——漂移就意味着 `--lockfile-only` 解析出的图与真装时的图不一致，那 P1 的版本 pin 就是假的。

Run: `diff ~/.dsh/profiles/lute-shell/pnpm-lock.yaml /Users/lute/project/Magpie-Horch/apps/lute-shell/seed/pnpm-lock.yaml && echo "lockfile 未漂移"`
Expected: 输出 `lockfile 未漂移`（diff 无差异、退出码 0）。**若有差异**：把 diff 原样贴进 report，不要直接把 profile 的版本覆盖回 seed——先判断是 seed 的 `package.json` 与 lockfile 不同步（该重跑 `--lockfile-only`），还是 install 期间解析出了新版本（那说明精确 pin 没生效，属 Global Constraints 违规，必须停下来报）。

Run: `cd /Users/lute/project/Magpie-Horch && git status --short apps/lute-shell/seed`
Expected: 只显示 `seed/` 下的新增文件（`??` 或已 staged），**没有** `M apps/lute-shell/seed/pnpm-lock.yaml` 之外的意外改动。

Run: `cd /Users/lute/project/Magpie-Horch/apps/lute-shell && time pnpm run materialize && pnpm run test`
Expected: 第二次物化因为 node_modules 已就位而明显更快（秒级到十几秒，而不是几分钟）；测试全绿。这条同时验证 `materializeProfile` 的幂等性在真实 profile 上成立，不只是在 mock install 下成立。

- [ ] **Step 13: 提交**

```bash
cd /Users/lute/project/Magpie-Horch
git add apps/lute-shell/seed apps/lute-shell/src/profile apps/lute-shell/scripts/materialize.mjs \
  apps/lute-shell/test/layout.spec.ts apps/lute-shell/test/materialize.spec.ts
git status --short
git commit -m "$(cat <<'EOF'
feat(apps): lute-shell profile seed 与物化——layers 从 0 到 2，收口 P0 的 PARTIAL

loadProfileDirectory 的 layers 唯一来源是 profile package.json 的 dsh.profile.bundles
（app-boot profile.ts:781）。seed 声明 dsh-base + dsh-web-app 两个 bundle，并把宿主侧
导入的 @deepseek-ai/* 显式列为直接依赖，保证 hoisted 后解析到唯一一份 cordis。
宿主运行时就位到 <profile>/lute-host/，与上游「宿主入口在 profile 内」同构。
EOF
)"
```

---

### Task 7: 无头端到端 smoke

**Files:**
- Create: `apps/lute-shell/scripts/smoke.mjs`
- Create: `apps/lute-shell/scripts/README.md`

**Interfaces:**
- Consumes: `lib/protocol.js` 的 `SHELL_REQUEST_PIPE_FD`/`SHELL_RESPONSE_PIPE_FD`/`HostResponseDecoder`/`encodeRequestStart`；`lib/profile/layout.js` 的 `defaultProfileDir`/`hostEntryPath`。（原列的 `encodeRequestEnd` 已不在出货形态里——见下方 Step 1 的更正说明。）
- Produces: `pnpm run smoke` —— 不启 GUI、不依赖 Electron，用纯 Node 父进程 spawn 真宿主子进程，走真管道断言真 profile 的响应。这是本期用户选定的「本地 smoke」，**不进 CI**（要装数百个 npm 包）。

- [ ] **Step 1: 写 `scripts/smoke.mjs`**

> **⚠️ 下面这个代码块是初版，已被两轮 fix 取代——不要再照它转写。**
>
> 出货形态的家是 `apps/lute-shell/scripts/smoke.mjs`（`6b30938` → `060ec28` → `3708db5`），逐条差异与证据在
> `.superpowers/sdd/2026-09-19-p1-lute-shell-skeleton/task-7-report.md`。初版有两类缺陷，都是**只有真跑真宿主才会暴露**的：
>
> 1. **协议错**：`send()` 在 `encodeRequestStart(…, {hasBody:false})` 之后无条件补 `encodeRequestEnd(id)`。
>    宿主对多余 end 帧直接 fatal 拆机（`src/host/index.ts:344`，与上游 `apps/desktop-host/src/index.ts:523` 同），
>    于是**第一个 GET 之后宿主就死了**，表现为后续请求永久挂起 + Node 报 `Detected unsettled top-level await`（exit 13）。
>    正确契约见 Task 8 Step 7 的点名条目：`hasBody:false` 绝不发 end 帧。
> 2. **仪器会假绿/失语**：64 KiB 分片前提只印在 label 里、没进 predicate；宿主中途死亡时 pending 请求永不 settle、
>    捕获到的子进程 stderr 只在 `failures.length > 0` 分支打印（即最需要它的场景反而丢弃）；
>    bundle 断言的 label 声称「profile 里没有 LUTE 插件层」而 predicate 只看 manifest 的 `dsh.profile.bundles`
>    （真正的挂载点是 `cordis.patch.yml` / `lute-host/shell.cordis.patch.yml`）；profile manifest 缺失或损坏时裸抛栈、
>    不走本文件自己的 FAIL 词汇；catch 的 label 把 readiness 超时报成「host survived every request」。
>
> 出货形态因此比初版多了：宿主死亡的持久监听（`fatal`/`exit`/`error` + 单请求超时 + 10s SIGKILL 兜底）、
> `exitedBeforeShutdown` 归因守卫、`phase` 变量、manifest 双守卫，以及一条只声称 manifest 的 label。
> **保留这个初版块是有意为之**——它是「计划里的代码没跑过就不能信」这条教训的实物证据，删掉就只剩结论了。

```javascript
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  HostResponseDecoder,
  SHELL_REQUEST_PIPE_FD,
  SHELL_RESPONSE_PIPE_FD,
  encodeRequestEnd,
  encodeRequestStart,
} from '../lib/protocol.js'
import { defaultProfileDir, hostEntryPath } from '../lib/profile/layout.js'

const profileDir = process.env.LUTE_SHELL_PROFILE ?? defaultProfileDir(homedir())
const entry = hostEntryPath(profileDir)
if (!existsSync(entry)) {
  process.stderr.write(`lute shell smoke: no host runtime at ${entry} — run pnpm run materialize\n`)
  process.exit(1)
}

const failures = []
const check = (label, ok, detail) => {
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'} ${label}${detail === undefined ? '' : ` — ${detail}`}\n`)
  if (!ok) failures.push(label)
}

const child = spawn(process.execPath, [entry, profileDir], {
  cwd: profileDir,
  env: { ...process.env, DSH_HOME: process.env.DSH_HOME ?? `${homedir()}/.dsh` },
  stdio: ['ignore', 'pipe', 'pipe', 'pipe', 'pipe', 'ipc'],
})

const decoder = new HostResponseDecoder()
const responses = new Map()
let streamId = 0
let stderr = ''

const readyPromise = new Promise((resolve, reject) => {
  child.once('message', (message) => {
    if (message?.type === 'ready') resolve(message)
    else reject(new Error(`lute shell smoke: unexpected IPC event ${JSON.stringify(message)}`))
  })
})
child.stderr.setEncoding('utf8')
child.stderr.on('data', (chunk) => { stderr += chunk })
child.stdout.pipe(process.stdout)
child.stdio[SHELL_RESPONSE_PIPE_FD].on('data', (chunk) => {
  for (const frame of decoder.push(chunk)) {
    const state = responses.get(frame.streamId)
    if (state === undefined) continue
    if (frame.type === 'start') {
      state.status = frame.status
      state.headers = frame.headers
      state.chunks = []
    } else if (frame.type === 'data') {
      state.chunks.push(frame.data)
    } else if (frame.type === 'end') {
      const bytes = Buffer.concat(state.chunks)
      state.resolve({
        status: state.status,
        headers: state.headers,
        bytes,
        body: bytes.toString('utf8'),
      })
    } else {
      state.reject(new Error(frame.message))
    }
  }
})

const requestPipe = child.stdio[SHELL_REQUEST_PIPE_FD]
const send = (path) => {
  const id = ++streamId
  const pending = new Promise((resolve, reject) => { responses.set(id, { resolve, reject, chunks: [] }) })
  requestPipe.write(encodeRequestStart(id, {
    url: `dsh-app://app${path}`,
    method: 'GET',
    headers: [['accept', '*/*']],
    hasBody: false,
  }))
  requestPipe.write(encodeRequestEnd(id))
  return pending
}

const info = await Promise.race([
  readyPromise,
  new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`host not ready in 120s: ${stderr.trim()}`)), 120_000).unref()
  }),
])
check('host reports ready at protocol v3', info.protocolVersion === 3, `dshVersion=${info.dshVersion}`)
check('host resolved an installed dsh version', /^\d+\.\d+\.\d+/u.test(info.dshVersion), info.dshVersion)

const index = await send('/index.html')
check(
  'GET /index.html is 200 html',
  index.status === 200 && index.headers.some(([name, value]) => name === 'content-type' && value.startsWith('text/html')),
  `status=${index.status}`,
)
check('index.html carries the injected page transport', index.body.includes('globalThis.__DSH_TRANSPORT__'))
check('injected transport declares ownsHost', index.body.includes('ownsHost:true'))

const fallback = await send('/no-such-route')
check('unknown SPA route falls back to index.html', fallback.status === 200 && fallback.body.includes('__DSH_TRANSPORT__'))

const traversal = await send('/%2e%2e%2fpackage.json')
check('path traversal is rejected with 403', traversal.status === 403, `status=${traversal.status}`)

// 真实二进制资产：字体加载失败也返回 200，所以只断言状态码等于没断言。
// 挑 dist/assets 里最大的文件，既记录 MIME 实际取值，也让响应体大概率跨过 64 KiB
// 帧分片边界——逐字节比对才能证明分片重组没丢没错序。
const distAssets = join(profileDir, 'node_modules', '@deepseek-ai', 'dsh-web-frontend', 'dist', 'assets')
const largest = readdirSync(distAssets)
  .map(name => ({ name, size: statSync(join(distAssets, name)).size }))
  .filter(entry => entry.size > 0)
  .sort((left, right) => right.size - left.size)[0]
if (largest === undefined) {
  check('dist/assets holds a binary asset to verify', false, 'directory empty or missing')
} else {
  const asset = await send(`/assets/${encodeURIComponent(largest.name)}`)
  const contentType = asset.headers.find(([name]) => name === 'content-type')?.[1] ?? '<none>'
  const onDisk = readFileSync(join(distAssets, largest.name))
  check(
    `largest dist asset round-trips byte-for-byte (${largest.name}, ${largest.size} bytes, crosses 64 KiB chunks: ${largest.size > 65_536})`,
    asset.status === 200 && asset.bytes.equals(onDisk),
    `status=${asset.status} contentType=${contentType} servedBytes=${asset.bytes.byteLength}`,
  )
  process.stdout.write(`     实际 content-type = ${contentType}（MIME 表只有 6 项，字体类会落到 octet-stream；实测值记进 report，字形是否真渲染交由 Task 8 在 DevTools 里确认）\n`)
}

child.send({ type: 'shutdown' })
const exitCode = await new Promise((resolve) => { child.once('exit', (code) => resolve(code)) })
check('shutdown IPC exits the host cleanly', exitCode === 0, `code=${String(exitCode)}`)

if (failures.length > 0) {
  process.stderr.write(`lute shell smoke: ${failures.length} failure(s): ${failures.join(', ')}\n${stderr}\n`)
  process.exit(1)
}
process.stdout.write('lute shell smoke: PASS\n')
```

- [ ] **Step 2: 跑 smoke**

Run: `cd /Users/lute/project/Magpie-Horch/apps/lute-shell && pnpm run build && pnpm run materialize && pnpm run smoke`
Expected:
```
PASS host reports ready at protocol v3 — dshVersion=0.1.5-rc.2
PASS host resolved an installed dsh version — 0.1.5-rc.2
PASS GET /index.html is 200 html — status=200
PASS index.html carries the injected page transport
PASS injected transport declares ownsHost
PASS unknown SPA route falls back to index.html
PASS path traversal is rejected with 403 — status=403
PASS largest dist asset round-trips byte-for-byte (<真实文件名>, <N> bytes, crosses 64 KiB chunks: <true|false>) — status=200 contentType=<实测值> servedBytes=<N>
     实际 content-type = <实测值>（MIME 表只有 6 项，字体类会落到 octet-stream；实测值记进 report，字形是否真渲染交由 Task 8 在 DevTools 里确认）
PASS shutdown IPC exits the host cleanly — code=0
lute shell smoke: PASS
```

`largest dist asset` 那条是 Task 4 评审路由过来的：字体加载失败**也**返回 200，所以只断言状态码等于没断言；逐字节比对才证明帧分片（64 KiB 边界）重组无误，`contentType` 的实测值则交给 Task 8 在 DevTools 里确认字形真的渲染出来。

这一步同时验证 P1 里程碑的「新壳 boot」与「空 profile 正常」（profile 里零 LUTE 插件，只有两个上游 bundle）。**把完整输出贴进 Task 10 的研究报告**，不接受口头验收。

- [ ] **Step 3: 失败时的既定归因顺序**

照此顺序查，**不要**跳到版本/JIT/CLI 玄学（这是 P-52 的教训）：

1. `host not ready` 且 stderr 含 `composition did not provide connection, typertGateway, and clientModules` → overlay 没就位或 bundle 没装全：`ls ~/.dsh/profiles/lute-shell/lute-host/shell.cordis.patch.yml`，再核对 seed 的 `bundles` 两项。
2. stderr 含 `Cannot find package '@deepseek-ai/…'` → 宿主裸导入没落到 profile 的 node_modules：确认 spawn 的 `entry` 在 `<profile>/lute-host/` 内（不是仓库的 `lib/`），且 `cwd` 是 profile。
3. stderr 含 `ERR_PNPM_FETCH_404` 点名 `dsh-type-meta` / `dsh-user-interaction` → seed 的 `pnpm-workspace.yaml` overrides 没随物化拷过去。
4. `layers: 0` → seed `package.json` 的 `dsh.profile.bundles` 丢了或被改空。
5. index.html 取到但页面空白 → 不在本 task 射程（无头 smoke 只看 HTTP 语义），留给 Task 8。

- [ ] **Step 4: 写 `scripts/README.md`**

内容三段，每段两三行：(1) `materialize` 做什么（拷 seed + 宿主运行时到 `~/.dsh/profiles/lute-shell/`，再 `pnpm install`）、前置条件（`pnpm run build` 先跑）、`LUTE_SHELL_PROFILE` 可改落点；(2) `smoke` 做什么（纯 Node 父进程 spawn 宿主、走 FD3/FD4 管道把 Step 1 的每条 `check(...)` 断言跑一遍）、前置条件（materialize 跑过）、**为什么不进 CI**（要装数百个 npm 包）；(3) 失败归因顺序，直接链接本计划 Task 7 Step 3 或把那 5 条抄过来（选一处为家，另一处留链接）。

**README 里不要写断言条数**——条数会随 Step 1 增删而腐烂，让读者去看脚本本身。

- [ ] **Step 5: 提交**

```bash
cd /Users/lute/project/Magpie-Horch
git add apps/lute-shell/scripts/smoke.mjs apps/lute-shell/scripts/README.md
git commit -m "$(cat <<'EOF'
test(apps): lute-shell 无头端到端 smoke——纯 Node 父进程走真管道验真 profile

断言覆盖 ready/版本/index.html 注入/ownsHost/SPA 回退/403 越界/最大资产逐字节往返/优雅退出。
不进 CI（需装数百 npm 包）；scripts/README.md 记前置条件与失败归因顺序。
EOF
)"
```

---

### Task 8: Electron 主进程与第一个可见 UI

**Files:**
- Create: `apps/lute-shell/src/main/runtime.ts`
- Create: `apps/lute-shell/src/main/route.ts`
- Create: `apps/lute-shell/src/main/host-process.ts`
- Create: `apps/lute-shell/src/main/index.ts`
- Test: `apps/lute-shell/test/runtime.spec.ts`
- Test: `apps/lute-shell/test/route.spec.ts`

**Interfaces:**
- Consumes: Task 2 的 `protocol.js`（请求侧编码器 + `HostResponseDecoder` + `isHostEvent` + 常量）；Task 6 的 `hostEntryPath`。
- Produces:
  - `interface HostRuntime { readonly node: string; readonly entry: string; readonly profileDir: string; readonly env: Record<string, string | undefined> }`
  - `resolveHostRuntime(input: { execPath: string; profileDir: string; dshHome: string; env: Readonly<Record<string, string | undefined>> }): HostRuntime`
  - `type SchemeRoute = { readonly target: 'app' } | { readonly target: 'reject' }`
  - `routeSchemeRequest(url: URL): SchemeRoute`
  - `interface HostReady { readonly protocolVersion: 3; readonly dshVersion: string }`
  - `class ShellHostProcess { constructor(runtime: HostRuntime); start(): Promise<HostReady>; fetch(request: Request): Promise<Response>; stop(): Promise<void> }`
  - `const SCHEME = 'dsh-app'`（在 `main/index.ts`）

- [ ] **Step 1: 写失败测试 `test/runtime.spec.ts`**

```typescript
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveHostRuntime } from '../src/main/runtime.js'

const base = {
  execPath: '/Applications/LUTE Shell.app/Contents/MacOS/LUTE Shell',
  profileDir: '/home/lute/.dsh/profiles/lute-shell',
  dshHome: '/home/lute/.dsh',
}

describe('resolveHostRuntime', () => {
  it('runs the host under the Electron binary as plain Node', () => {
    const runtime = resolveHostRuntime({ ...base, env: { HOME: '/home/lute' } })
    expect(runtime.node).toBe(base.execPath)
    expect(runtime.env.ELECTRON_RUN_AS_NODE).toBe('1')
    expect(runtime.profileDir).toBe(base.profileDir)
  })

  it('points the entry at the host runtime inside the profile', () => {
    const runtime = resolveHostRuntime({ ...base, env: {} })
    expect(runtime.entry).toBe(join(base.profileDir, 'lute-host', 'host', 'index.js'))
  })

  it('honors an explicit node binary override', () => {
    const runtime = resolveHostRuntime({ ...base, env: { LUTE_SHELL_NODE_BINARY: '/opt/homebrew/bin/node' } })
    expect(runtime.node).toBe('/opt/homebrew/bin/node')
  })

  it('passes DSH_HOME and scrubs bootstrap-only variables', () => {
    const runtime = resolveHostRuntime({
      ...base,
      env: {
        HOME: '/home/lute',
        DSH_HOME: '/somewhere/else',
        NODE_OPTIONS: '--inspect',
        LUTE_SHELL_PROFILE: '/tmp/other',
        pnpm_execpath: '/usr/bin/pnpm',
        npm_lifecycle_event: 'dev',
        corepack_root: '/opt/corepack',
      },
    })
    expect(runtime.env.DSH_HOME).toBe(base.dshHome)
    expect(runtime.env.HOME).toBe('/home/lute')
    expect(runtime.env.NODE_OPTIONS).toBeUndefined()
    expect(runtime.env.LUTE_SHELL_PROFILE).toBeUndefined()
    expect(runtime.env.pnpm_execpath).toBeUndefined()
    expect(runtime.env.npm_lifecycle_event).toBeUndefined()
    expect(runtime.env.corepack_root).toBeUndefined()
  })
})
```

- [ ] **Step 2: 写失败测试 `test/route.spec.ts`**

```typescript
import { describe, expect, it } from 'vitest'
import { routeSchemeRequest } from '../src/main/route.js'

describe('routeSchemeRequest', () => {
  it('serves the app hostname and rejects every other one', () => {
    expect(routeSchemeRequest(new URL('dsh-app://app/index.html'))).toEqual({ target: 'app' })
    expect(routeSchemeRequest(new URL('dsh-app://shell/plugin-manager.html'))).toEqual({ target: 'reject' })
    expect(routeSchemeRequest(new URL('dsh-app://evil/index.html'))).toEqual({ target: 'reject' })
  })
})
```

- [ ] **Step 3: 跑测试确认失败**

Run: `cd /Users/lute/project/Magpie-Horch/apps/lute-shell && pnpm exec vitest run test/runtime.spec.ts test/route.spec.ts`
Expected: FAIL —— 两个模块都 `Cannot find module`

- [ ] **Step 4: 写 `src/main/runtime.ts`**

```typescript
/** Resolves which binary runs the host child process and what environment it sees. */

import { hostEntryPath } from '../profile/layout.js'

/** Everything the main process needs to spawn one host child. */
export interface HostRuntime {
  readonly node: string
  readonly entry: string
  readonly profileDir: string
  readonly env: Record<string, string | undefined>
}

const SCRUBBED_PREFIX = /^(?:npm|pnpm|corepack)_/iu

/**
 * Resolve the host runtime for one shell launch.
 * @param input - Electron executable, profile directory, DSH_HOME, and the parent environment.
 * @returns node binary, host entry, profile directory, and the scrubbed child environment.
 */
export function resolveHostRuntime(input: {
  execPath: string
  profileDir: string
  dshHome: string
  env: Readonly<Record<string, string | undefined>>
}): HostRuntime {
  const env: Record<string, string | undefined> = {}
  for (const [name, value] of Object.entries(input.env)) {
    if (name === 'NODE_OPTIONS') continue
    if (name.startsWith('LUTE_SHELL_')) continue
    if (SCRUBBED_PREFIX.test(name)) continue
    env[name] = value
  }
  // The Electron binary acts as plain Node, so harness native modules load at their N-API ABI.
  env.ELECTRON_RUN_AS_NODE = '1'
  env.DSH_HOME = input.dshHome
  return {
    node: input.env.LUTE_SHELL_NODE_BINARY ?? input.execPath,
    entry: hostEntryPath(input.profileDir),
    profileDir: input.profileDir,
    env,
  }
}
```

- [ ] **Step 5: 写 `src/main/route.ts`**

```typescript
/** Hostname routing for the shell-owned custom scheme. */

/** Where one `dsh-app://` request goes. */
export type SchemeRoute = { readonly target: 'app' } | { readonly target: 'reject' }

/**
 * Route one custom-scheme request by hostname.
 * @param url - parsed request URL under the `dsh-app:` scheme.
 * @returns `app` for the harness UI hostname, `reject` for everything else.
 */
export function routeSchemeRequest(url: URL): SchemeRoute {
  return url.hostname === 'app' ? { target: 'app' } : { target: 'reject' }
}
```

- [ ] **Step 6: 跑测试确认通过**

Run: `cd /Users/lute/project/Magpie-Horch/apps/lute-shell && pnpm exec vitest run test/runtime.spec.ts test/route.spec.ts`
Expected: PASS（runtime 4 + route 1）

- [ ] **Step 7: 写 `src/main/host-process.ts`（逐段移植上游 `DesktopHostProcess`）**

参照 `vendor/dsh-desktop/deepseek-harness/apps/desktop/src/host-process.ts`（全 413 行），逐段移植，差异只有五处：

1. 类名 `DesktopHostProcess` → `ShellHostProcess`，`DesktopHostReady` → `HostReady`，`PendingResponse` 保留。
2. 构造签名从 `(node, projectDir, inspectPort?)` 改为 `(runtime: HostRuntime)`；`start()` 里的 entry 不再是 `join(projectDir,'node_modules','@deepseek-ai','dsh-desktop-host','lib','index.js')`（该包不在 npm 上），而是 `this.runtime.entry`；`spawn` 的 `cwd` 用 `this.runtime.profileDir`，`env` 直接用 `this.runtime.env`（上游那段内联过滤已由 `resolveHostRuntime` 承担）。
3. spawn 参数去掉 `--inspect` 与 `--allow-linked-profile`：`spawn(this.runtime.node, [this.runtime.entry, this.runtime.profileDir], { cwd, env, stdio: ['ignore','pipe','pipe','pipe','pipe','ipc'] })`。
4. 符号名换成 Task 2 的：`DESKTOP_*` → `SHELL_*`、`DesktopHostResponseDecoder` → `HostResponseDecoder`、`encodeDesktopRequest*` → `encodeRequest*`、`isDesktopHostEvent` → `isHostEvent`、`DesktopHostCommand/Event/ResponseFrame` → `HostCommand/HostEvent/HostResponseFrame`；错误前缀 `dsh desktop ` → `lute shell `。
5. 删掉未使用的 `join` import。

必须逐字保留的行为（协议正确性）：`nextStreamId` 从 1 起且耗尽 `0xffff_ffff` 时抛错；`requestWriteTail` 串行化 + `drain` 背压；`hasBody` 判定为 `method !== 'GET' && method !== 'HEAD' && request.body !== null`；上传按 `SHELL_PIPE_CHUNK_BYTES` 分片；响应 `desiredSize <= 0` 时 `blockedResponses.add` + `responsePipe.pause()`，`pull` 时恢复；`abort` 监听器发 `encodeRequestCancel` 并按 `controller === undefined` 决定 reject 还是 `controller.error`；`stop()` 的三段阶梯（IPC `shutdown` + destroy 请求管道 → 10s → SIGTERM → 5s → SIGKILL → 5s → 抛 `did not exit after SIGKILL`）；`handleResponseFrame` 对未知 streamId 只在 `streamId >= nextStreamId` 时抛错；`fail()` 清 pending 并 `responsePipe.resume()`。

**其中最容易丢、丢了就全瘫的一条（Task 7 实测踩过，务必核对）**：上游 `pumpRequest` 在写完 start 帧后是 `if (!hasBody) return`（参照 `:229`）——**`hasBody:false` 的请求绝不发 end 帧**，end 只用来结束请求体。宿主对多余 end 帧直接 fatal 拆机（上游 `apps/desktop-host/src/index.ts:523`，我们的 `src/host/index.ts:344`）。Task 7 的 smoke 初版正是无条件补了一个 end 帧，结果**第一个 GET 之后宿主就死了**，表现为后续请求永久挂起、Node 报 `Detected unsettled top-level await`。逐段移植会自然带上这行；任何「顺手简化」都会把它弄丢，而丢掉后没有单元测试会红——只有实机才会暴露。

- [ ] **Step 8: 写 `src/main/index.ts`**

```typescript
/** Electron shell: custom protocol, one window, host child lifecycle. */

import { homedir } from 'node:os'
import { join } from 'node:path'
import { app, BrowserWindow, dialog, protocol } from 'electron'
import { defaultProfileDir } from '../profile/layout.js'
import { ShellHostProcess } from './host-process.js'
import { resolveHostRuntime } from './runtime.js'
import { routeSchemeRequest } from './route.js'

const SCHEME = 'dsh-app'

protocol.registerSchemesAsPrivileged([{
  scheme: SCHEME,
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: false,
    stream: true,
    codeCache: true,
  },
}])

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 880,
    minHeight: 600,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).protocol !== `${SCHEME}:`) event.preventDefault()
  })
  window.once('ready-to-show', () => { if (!window.isDestroyed()) window.show() })
  return window
}

async function main(): Promise<void> {
  const profileDir = process.env.LUTE_SHELL_PROFILE ?? defaultProfileDir(homedir())
  const runtime = resolveHostRuntime({
    execPath: process.execPath,
    profileDir,
    dshHome: process.env.DSH_HOME ?? join(homedir(), '.dsh'),
    env: process.env,
  })
  const host = new ShellHostProcess(runtime)
  const ready = await host.start()
  process.stdout.write(`lute shell: host ready, dsh ${ready.dshVersion}\n`)

  protocol.handle(SCHEME, (request) => {
    const route = routeSchemeRequest(new URL(request.url))
    if (route.target === 'reject') return Promise.resolve(new Response(null, { status: 404 }))
    return host.fetch(request)
  })

  const window = createWindow()
  await window.loadURL(`${SCHEME}://app/index.html`)
  if (process.env.LUTE_SHELL_DEVTOOLS !== '0') window.webContents.openDevTools({ mode: 'detach' })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
  app.on('before-quit', (event) => {
    event.preventDefault()
    void host.stop().finally(() => { app.exit(0) })
  })
}

void app.whenReady().then(main).catch(async (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`lute shell: ${error instanceof Error ? error.stack ?? message : message}\n`)
  dialog.showErrorBox('LUTE Shell 启动失败', message)
  app.exit(1)
})
```

`before-quit` 里无条件 `preventDefault` + `app.exit(0)` 会在第二次触发时重复——用一个 `quitting` 布尔守卫（参照上游 `apps/desktop/src/main.ts:376-383` 的 `host === undefined` 守卫写法：停过就把引用清掉，第二次直接 return）。

- [ ] **Step 9: 类型检查 + 全量测试**

Run: `cd /Users/lute/project/Magpie-Horch/apps/lute-shell && pnpm run typecheck && pnpm run test`
Expected: 退出码 0（10 个 spec 文件全绿）

- [ ] **Step 10: 实机验收——第一个可见 UI**

**先读这条，否则会把正常行为误判成挂死**：本机 `ignoreScripts: true`，install 阶段**不**下载 Electron 二进制；electron 43.3.0 在 `require()` 时自愈（`index.js` 的 `getElectronPath()` → `spawnSync(install.js)`），所以**新克隆上第一次 `pnpm run dev` 会先静默下载 295 MB 再起窗口**。这台机器已经下过了（实测 `./node_modules/.bin/electron --version` → `v43.3.0`），若在别处首跑请给足网络时间，不要中途 kill。不需要白名单、不需要 `.npmrc`、不需要放宽 `ignoreScripts`。

Run: `cd /Users/lute/project/Magpie-Horch/apps/lute-shell && pnpm run build && pnpm run materialize && pnpm run dev`
Expected:
- 终端出现 `lute shell: host ready, dsh 0.1.5-rc.2`
- 弹出 1280×840 窗口，显示 harness 默认 UI（未登录/无 API key 状态下的启动页），不是白屏
- DevTools 分离窗口自动打开（`LUTE_SHELL_DEVTOOLS=0` 可关）
- DevTools Console 无未捕获异常；Network 面板里 `dsh-app://app/index.html` 200、`/plugins/*` 若干 200
- 关窗后宿主子进程退出：`pgrep -f "lute-host/host/index.js"` 无输出

**截图存证**：把窗口截图存到 `docs/research/assets/2026-09-19-lute-shell-first-ui.png`（Task 10 的研究报告引用它）。

再验「宿主是纯 Node 进程」这条架构前提（两个方向都要过）：

Run: `cd /Users/lute/project/Magpie-Horch && ELECTRON_RUN_AS_NODE=1 apps/lute-shell/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron -p "process.versions.node"`
Expected: 打印的版本 ≥ `22.19`（harness 的 engines 下限）。若低于 22.19，就用 `LUTE_SHELL_NODE_BINARY` 指向系统 node 跑通 dev，并在 Task 10 的 Note `## Consequences` 里记一条「Electron 43 内置 Node 不满足 harness engines，P4 打包必须像上游那样随附 plain node 运行时」。

Run: `cd /Users/lute/project/Magpie-Horch/apps/lute-shell && LUTE_SHELL_NODE_BINARY=$(which node) pnpm run dev`
Expected: 换系统 node 也能起来并显示同一 UI，窗口照常关闭退出。两条路径都过，才说明宿主没有偷偷依赖 Electron 特有 API。

- [ ] **Step 11: 提交**

```bash
cd /Users/lute/project/Magpie-Horch
git add apps/lute-shell/src/main apps/lute-shell/test/runtime.spec.ts apps/lute-shell/test/route.spec.ts
git commit -m "$(cat <<'EOF'
feat(apps): lute-shell Electron 主进程——dsh-app 特权 scheme + 窗口 + 宿主生命周期

宿主子进程用 Electron 二进制的 RunAsNode 跑（纯 Node 语义、N-API 原生模块免重建），
可用 LUTE_SHELL_NODE_BINARY 换系统 node。本期不做 preload：实测 shipped dist 不读
window.dshDesktop。单实例锁/更新/插件管理窗口留到 P4。
EOF
)"
```

---

### Task 9: 静态门禁 `lute-shell-pin`

**Files:**
- Create: `scripts/gates/lute-shell-pin.mjs`
- Create: `scripts/gates/lute-shell-pin.test.mjs`
- Modify: `scripts/gate.mjs`（在 `CHECKS` 数组里注册一项）
- Modify: `apps/lute-shell/package.json`（补 `luteOrigin`/`luteOwner`/`lutePublish` 三治理字段，值 `self`/`lute`/`false`——与 `packages/` 下 21 个自有包同形；`apps/` 对仓库 package collector 结构性不可见，故这三字段只能由本门禁守）

**Interfaces:**
- Consumes: 无（纯文件读取 + 比较）。
- Produces: `checkLuteShellPin(input): { passed: boolean; violations: string[] }`，`input` 形如
  ```
  {
    shellManifestText: string | null,     // apps/lute-shell/package.json
    seedManifestText: string | null,      // apps/lute-shell/seed/package.json
    shellWorkspaceText: string | null,    // apps/lute-shell/pnpm-workspace.yaml
    seedWorkspaceText: string | null,     // apps/lute-shell/seed/pnpm-workspace.yaml
    protocolText: string | null,          // apps/lute-shell/src/protocol.ts
    referenceWireText: string | null,     // vendor/.../apps/desktop-host/src/wire.ts（可能为 null）
    seedUserPatchText: string | null,     // apps/lute-shell/seed/cordis.patch.yml
    trackedFixturePaths: string[] | null, // git ls-files apps/lute-shell/test/fixtures/ 的输出
  }
  ```

- [ ] **Step 1: 写失败测试 `scripts/gates/lute-shell-pin.test.mjs`**

```javascript
import test from 'node:test'
import assert from 'node:assert/strict'
import { checkLuteShellPin } from './lute-shell-pin.mjs'

const shellManifest = JSON.stringify({
  luteOrigin: 'self',
  luteOwner: 'lute',
  lutePublish: false,
  devDependencies: {
    '@deepseek-ai/dsh-app-boot': '0.1.5-rc.2',
    '@deepseek-ai/cordis': '4.0.2',
    electron: '43.3.0',
  },
})
const seedManifest = JSON.stringify({
  dependencies: {
    '@deepseek-ai/dsh-app-boot': '0.1.5-rc.2',
    '@deepseek-ai/cordis': '4.0.2',
    '@deepseek-ai/dsh-base': '0.1.5-rc.2',
  },
})
const workspace = 'overrides:\n  "@deepseek-ai/dsh-type-meta": "npm:empty-npm-package@1.0.0"\n  "@deepseek-ai/dsh-user-interaction": "npm:empty-npm-package@1.0.0"\n'
const protocol = `export const SHELL_HOST_PROTOCOL_VERSION = 3 as const
export const SHELL_REQUEST_PIPE_FD = 3
export const SHELL_RESPONSE_PIPE_FD = 4
export const SHELL_CONTROL_IPC_FD = 5
export const SHELL_PIPE_CHUNK_BYTES = 64 * 1024
const FRAME_MAGIC = 0x44534833
const FRAME_HEADER_BYTES = 13
const MAX_CONTROL_PAYLOAD_BYTES = 1024 * 1024
`
const referenceWire = `export const DESKTOP_HOST_PROTOCOL_VERSION = 3 as const
export const DESKTOP_REQUEST_PIPE_FD = 3
export const DESKTOP_RESPONSE_PIPE_FD = 4
export const DESKTOP_PIPE_CHUNK_BYTES = 64 * 1024
const FRAME_MAGIC = 0x44534833
const FRAME_HEADER_BYTES = 13
const MAX_CONTROL_PAYLOAD_BYTES = 1024 * 1024
`

// 与 `git ls-files apps/lute-shell/test/fixtures/` 逐字一致（12 个，仓库相对路径）。
// 这份清单是门禁的期望值：干净克隆上 fixtures 必须全在，否则 test/ 跑不起来。
const TRACKED_FIXTURES = [
  'apps/lute-shell/test/fixtures/frontend/dist/assets/app.css',
  'apps/lute-shell/test/fixtures/frontend/dist/index.html',
  'apps/lute-shell/test/fixtures/frontend/package.json',
  'apps/lute-shell/test/fixtures/profile-broken-bundle/node_modules/@deepseek-ai/dsh/package.json',
  'apps/lute-shell/test/fixtures/profile-broken-bundle/node_modules/lute-broken-bundle/package.json',
  'apps/lute-shell/test/fixtures/profile-broken-bundle/package.json',
  'apps/lute-shell/test/fixtures/profile/cordis.patch.yml',
  'apps/lute-shell/test/fixtures/profile/cordis.yml',
  'apps/lute-shell/test/fixtures/profile/node_modules/@deepseek-ai/dsh/package.json',
  'apps/lute-shell/test/fixtures/profile/node_modules/lute-fixture-bundle/cordis.patch.yml',
  'apps/lute-shell/test/fixtures/profile/node_modules/lute-fixture-bundle/package.json',
  'apps/lute-shell/test/fixtures/profile/package.json',
]

const good = {
  shellManifestText: shellManifest,
  seedManifestText: seedManifest,
  shellWorkspaceText: workspace,
  seedWorkspaceText: workspace,
  protocolText: protocol,
  referenceWireText: referenceWire,
  seedUserPatchText: '# 用户层：P1 留空。P2 起在这里声明 LUTE 插件的 id / config / disabled。\n[]\n',
  trackedFixturePaths: TRACKED_FIXTURES,
}

test('passes on a consistent pin', () => {
  assert.deepEqual(checkLuteShellPin(good), { passed: true, violations: [] })
})

test('rejects a ranged harness specifier in the seed', () => {
  const result = checkLuteShellPin({
    ...good,
    seedManifestText: JSON.stringify({ dependencies: { '@deepseek-ai/dsh-base': '^0.1.5-rc.2' } }),
  })
  assert.equal(result.passed, false)
  assert.match(result.violations[0], /dsh-base.*精确版本/u)
})

test('rejects a version that differs between shell devDeps and seed deps', () => {
  const result = checkLuteShellPin({
    ...good,
    shellManifestText: JSON.stringify({ devDependencies: { '@deepseek-ai/dsh-app-boot': '0.1.6-alpha.1' } }),
  })
  assert.equal(result.passed, false)
  assert.match(result.violations[0], /dsh-app-boot/)
})

test('rejects a missing override for the two unpublished internal packages', () => {
  const result = checkLuteShellPin({ ...good, seedWorkspaceText: 'packages:\n  - .\n' })
  assert.equal(result.passed, false)
  assert.equal(result.violations.length, 2)
  assert.match(result.violations[0], /dsh-type-meta/u)
})

test('rejects protocol constants that drift from the submodule reference', () => {
  const result = checkLuteShellPin({
    ...good,
    protocolText: protocol.replace('0x44534833', '0x44534834'),
  })
  assert.equal(result.passed, false)
  assert.match(result.violations[0], /FRAME_MAGIC/u)
})

test('skips the reference comparison when the submodule is not initialized', () => {
  const result = checkLuteShellPin({ ...good, referenceWireText: null })
  assert.equal(result.passed, true)
  assert.deepEqual(result.violations, [])
})

test('fails loud when the shell package is absent', () => {
  const result = checkLuteShellPin({ ...good, shellManifestText: null })
  assert.equal(result.passed, false)
  assert.match(result.violations[0], /apps\/lute-shell\/package\.json/u)
})

test('rejects a shell manifest missing the governance fields', () => {
  const result = checkLuteShellPin({
    ...good,
    shellManifestText: JSON.stringify({ devDependencies: { '@deepseek-ai/cordis': '4.0.2' } }),
  })
  assert.equal(result.passed, false)
  assert.equal(result.violations.length, 3)
  assert.match(result.violations[0], /luteOrigin/u)
})

test('rejects a seed user patch that declares a LUTE plugin layer', () => {
  const result = checkLuteShellPin({
    ...good,
    seedUserPatchText: '# 用户层\n- id: lute-something\n',
  })
  assert.equal(result.passed, false)
  assert.match(result.violations[0], /cordis\.patch\.yaml|cordis\.patch\.yml|用户层/u)
})

test('rejects an untracked fixture', () => {
  const result = checkLuteShellPin({
    ...good,
    trackedFixturePaths: TRACKED_FIXTURES.slice(0, -1),
  })
  assert.equal(result.passed, false)
  assert.match(result.violations[0], /test\/fixtures\/profile\/package\.json/u)
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /Users/lute/project/Magpie-Horch && node --test scripts/gates/lute-shell-pin.test.mjs`
Expected: FAIL —— `Cannot find module './lute-shell-pin.mjs'`

- [ ] **Step 3: 写 `scripts/gates/lute-shell-pin.mjs`**

```javascript
/**
 * 薄壳的版本 pin 与协议常量校验。
 * apps/ 不在 package collector 的射程内（package-layout.mjs 只下钻 packages/<五组>/），
 * 故这里独立守三件事：harness 版本精确锁、shell 与 seed 两侧版本一致、帧协议常量不漂移。
 */

const UNPUBLISHED_OVERRIDES = [
  '@deepseek-ai/dsh-type-meta',
  '@deepseek-ai/dsh-user-interaction',
]

const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[\w.]+)?$/u

const PROTOCOL_CONSTANTS = [
  ['SHELL_HOST_PROTOCOL_VERSION', 'DESKTOP_HOST_PROTOCOL_VERSION'],
  ['SHELL_REQUEST_PIPE_FD', 'DESKTOP_REQUEST_PIPE_FD'],
  ['SHELL_RESPONSE_PIPE_FD', 'DESKTOP_RESPONSE_PIPE_FD'],
  ['SHELL_PIPE_CHUNK_BYTES', 'DESKTOP_PIPE_CHUNK_BYTES'],
  ['FRAME_MAGIC', 'FRAME_MAGIC'],
  ['FRAME_HEADER_BYTES', 'FRAME_HEADER_BYTES'],
  ['MAX_CONTROL_PAYLOAD_BYTES', 'MAX_CONTROL_PAYLOAD_BYTES'],
]

// apps/ 对仓库 package collector 结构性不可见，故治理三字段只能由本门禁守。
const GOVERNANCE_FIELDS = ['luteOrigin', 'luteOwner', 'lutePublish']

// 与 `git ls-files apps/lute-shell/test/fixtures/` 逐字一致；新增 fixture 时本门禁会红，
// 那是**预期**的失败模式：干净克隆上 fixtures 缺失会让 test/ 跑不起来，必须有人显式更新清单。
const TRACKED_FIXTURES = [
  'apps/lute-shell/test/fixtures/frontend/dist/assets/app.css',
  'apps/lute-shell/test/fixtures/frontend/dist/index.html',
  'apps/lute-shell/test/fixtures/frontend/package.json',
  'apps/lute-shell/test/fixtures/profile-broken-bundle/node_modules/@deepseek-ai/dsh/package.json',
  'apps/lute-shell/test/fixtures/profile-broken-bundle/node_modules/lute-broken-bundle/package.json',
  'apps/lute-shell/test/fixtures/profile-broken-bundle/package.json',
  'apps/lute-shell/test/fixtures/profile/cordis.patch.yml',
  'apps/lute-shell/test/fixtures/profile/cordis.yml',
  'apps/lute-shell/test/fixtures/profile/node_modules/@deepseek-ai/dsh/package.json',
  'apps/lute-shell/test/fixtures/profile/node_modules/lute-fixture-bundle/cordis.patch.yml',
  'apps/lute-shell/test/fixtures/profile/node_modules/lute-fixture-bundle/package.json',
  'apps/lute-shell/test/fixtures/profile/package.json',
]

function harnessSpecifiers(manifestText, field) {
  if (manifestText === null) return null
  const manifest = JSON.parse(manifestText)
  const deps = manifest[field] ?? {}
  return new Map(Object.entries(deps).filter(([name]) => name.startsWith('@deepseek-ai/')))
}

function constantValue(text, name) {
  const match = new RegExp(`(?:export\\s+)?const\\s+${name}\\s*=\\s*([^\\n]+?)\\s*(?:as\\s+const)?\\s*(?:\\n|$)`, 'u').exec(text)
  return match?.[1].trim()
}

/**
 * @param {object} input 八个输入（六个文件文本 + seed 用户层文本 + git 跟踪清单），缺失的为 null
 * @returns {{passed: boolean, violations: string[]}}
 */
export function checkLuteShellPin(input) {
  const violations = []
  const shell = harnessSpecifiers(input.shellManifestText, 'devDependencies')
  const seed = harnessSpecifiers(input.seedManifestText, 'dependencies')

  if (shell === null) violations.push('apps/lute-shell/package.json 不存在或不可读——薄壳没有版本事实源')
  if (seed === null) violations.push('apps/lute-shell/seed/package.json 不存在或不可读——profile seed 没有版本事实源')

  if (seed !== null) {
    for (const [name, spec] of seed) {
      if (!EXACT_VERSION.test(spec)) {
        violations.push(`seed 依赖 ${name} 的 "${spec}" 不是精确版本——npm latest tag 指向旧线，必须显式锁版本`)
      }
    }
  }

  if (shell !== null && seed !== null) {
    for (const [name, spec] of seed) {
      const shellSpec = shell.get(name)
      if (shellSpec !== undefined && shellSpec !== spec) {
        violations.push(`${name} 在壳（${shellSpec}）与 seed（${spec}）两侧版本不一致——编译期类型与运行时会是两套包`)
      }
    }
  }

  for (const [label, text] of [['apps/lute-shell/pnpm-workspace.yaml', input.shellWorkspaceText], ['apps/lute-shell/seed/pnpm-workspace.yaml', input.seedWorkspaceText]]) {
    for (const name of UNPUBLISHED_OVERRIDES) {
      if (text === null || !text.includes(name)) {
        violations.push(`${label} 缺 ${name} 的 override——该包未发布到 npm，install 会 404`)
      }
    }
  }

  if (input.protocolText === null) {
    violations.push('apps/lute-shell/src/protocol.ts 不存在或不可读')
  } else if (input.referenceWireText !== null) {
    for (const [ours, theirs] of PROTOCOL_CONSTANTS) {
      const actual = constantValue(input.protocolText, ours)
      const expected = constantValue(input.referenceWireText, theirs)
      if (expected !== undefined && actual !== expected) {
        violations.push(`protocol.ts 的 ${ours} = ${String(actual)}，与 submodule 参照 ${theirs} = ${String(expected)} 不一致`)
      }
    }
  }

  if (input.shellManifestText !== null) {
    const manifest = JSON.parse(input.shellManifestText)
    for (const name of GOVERNANCE_FIELDS) {
      if (typeof manifest[name] !== 'string' && typeof manifest[name] !== 'boolean') {
        violations.push(`apps/lute-shell/package.json 缺治理字段 ${name}——apps/ 不在 package collector 射程内，此字段只能由本门禁守`)
      }
    }
  }

  // seed 的用户层是「零 LUTE 插件」这条里程碑事实的证据家（smoke 只证 manifest 的 bundles）。
  // 剥掉注释与空白后必须恰为 []；P2 起要挂插件时本门禁会红，那是需要人显式确认的时刻。
  if (input.seedUserPatchText === null) {
    violations.push('apps/lute-shell/seed/cordis.patch.yml 不存在或不可读')
  } else {
    const body = input.seedUserPatchText
      .split('\n')
      .filter((line) => !line.trim().startsWith('#'))
      .join('')
      .replace(/\s+/gu, '')
    if (body !== '[]') {
      violations.push(`seed/cordis.patch.yml 的用户层不是 []（剥注释后为 ${body}）——P1 的「零 LUTE 插件」以该文件为证据家，挂载插件属有意变更，须显式更新本门禁`)
    }
  }

  if (input.trackedFixturePaths === null) {
    violations.push('无法读取 git 跟踪清单——fixtures 是否入库不可判定')
  } else {
    const tracked = new Set(input.trackedFixturePaths)
    for (const path of TRACKED_FIXTURES) {
      if (!tracked.has(path)) {
        violations.push(`${path} 不再被 git 跟踪——干净克隆上 test/ 会因缺 fixture 而失败（.gitignore 是白名单式，删 negation 会静默丢文件）`)
      }
    }
  }

  return { passed: violations.length === 0, violations }
}
```

`referenceWireText` 为 `null`（submodule 未初始化）时跳过常量比对，不算违规——CI 上 submodule 未必 checkout，而常量本身已被 `test/protocol.spec.ts` 锁住数值。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd /Users/lute/project/Magpie-Horch && node --test scripts/gates/lute-shell-pin.test.mjs`
Expected: PASS（10 tests）

- [ ] **Step 5: 注册进门禁**

在 `scripts/gate.mjs` 的 `CHECKS` 数组里，紧挨 `pin-consistency`（`:315-324`）之后插入：

```javascript
  {
    name: 'lute-shell-pin',
    remediation: '把 apps/lute-shell 与 seed 两侧的 @deepseek-ai/* 对齐到同一精确版本；协议常量以 vendor/dsh-desktop/deepseek-harness/apps/desktop-host/src/wire.ts 为准（ADR-0131）',
    run() {
      const reference = join('vendor', 'dsh-desktop', 'deepseek-harness', 'apps', 'desktop-host', 'src', 'wire.ts')
      let trackedFixturePaths = null
      try {
        trackedFixturePaths = execSync('git ls-files apps/lute-shell/test/fixtures/', { cwd: repoRoot, encoding: 'utf8' })
          .split('\n').filter((line) => line !== '')
      } catch {
        trackedFixturePaths = null
      }
      return checkLuteShellPin({
        shellManifestText: readIfExists(join(repoRoot, 'apps', 'lute-shell', 'package.json')),
        seedManifestText: readIfExists(join(repoRoot, 'apps', 'lute-shell', 'seed', 'package.json')),
        shellWorkspaceText: readIfExists(join(repoRoot, 'apps', 'lute-shell', 'pnpm-workspace.yaml')),
        seedWorkspaceText: readIfExists(join(repoRoot, 'apps', 'lute-shell', 'seed', 'pnpm-workspace.yaml')),
        protocolText: readIfExists(join(repoRoot, 'apps', 'lute-shell', 'src', 'protocol.ts')),
        referenceWireText: existsSync(join(repoRoot, reference)) ? readIfExists(join(repoRoot, reference)) : null,
        seedUserPatchText: readIfExists(join(repoRoot, 'apps', 'lute-shell', 'seed', 'cordis.patch.yml')),
        trackedFixturePaths,
      })
    },
  },
```

`execSync` 失败（不在 git 仓库、或 git 不可用）时 `trackedFixturePaths` 为 `null`，checker 报「无法读取 git 跟踪清单」而非静默跳过——fixtures 是否入库这件事没有「跳过」的合法形态。若 `scripts/gate.mjs` 顶部尚未 import `execSync`，在同一处补上。

并在 `scripts/gate.mjs` 顶部既有的一串 `import { check… } from './gates/…'` 里加上 `checkLuteShellPin`（与 `checkPinConsistency` 同一处 import 风格）。

- [ ] **Step 6: 跑门禁**

Run: `cd /Users/lute/project/Magpie-Horch && pnpm run gate:list | grep lute-shell-pin`
Expected: 输出 `lute-shell-pin`

Run: `cd /Users/lute/project/Magpie-Horch && pnpm run test:gate 2>&1 | tail -15`
Expected: 全绿（新 checker 的 test 被 `scripts/gates/*.test.mjs` glob 收到）

Run: `cd /Users/lute/project/Magpie-Horch && pnpm run gate 2>&1 | grep -A3 "lute-shell-pin"`
Expected: 该项 PASS。**注意**：仓库门禁有一项继承红 `profile-bundle-sync`（另一条工作线的在制品，与薄壳无关）——**不要追它、不要修它、不要动 `scripts/gates/exemptions.json`**。只看 `lute-shell-pin` 与 `test:gate`。

- [ ] **Step 7: 提交**

```bash
cd /Users/lute/project/Magpie-Horch
git add scripts/gates/lute-shell-pin.mjs scripts/gates/lute-shell-pin.test.mjs scripts/gate.mjs apps/lute-shell/package.json
git commit -m "$(cat <<'EOF'
feat(gates): lute-shell-pin——薄壳版本精确锁、两侧一致、协议常量不漂移、治理与证据家入库

apps/ 不在 package collector 射程内，deps-reproducible 管不到薄壳；本项独立守六件事：
seed 的 @deepseek-ai/* 必须精确版本（npm latest tag 指向旧线）、壳 devDeps 与 seed deps
同名包必须同版本（否则编译期类型与运行时是两套包）、protocol.ts 常量对齐 submodule 参照、
壳 manifest 带 luteOrigin/luteOwner/lutePublish 三治理字段、seed/cordis.patch.yml 用户层
保持 []（「零 LUTE 插件」的证据家）、12 个 test fixture 保持被 git 跟踪（白名单式 .gitignore
删一条 negation 就会静默丢文件）。
EOF
)"
```

---

### Task 10: 留痕（ADR + Note + 文档 + 研究报告）

**Files:**
- Create: `docs/adr/ADR-0131.md`（执行时复核最小空闲号）
- Create: `docs/notes/implemented/architecture/2026-09-19-lute-shell-skeleton.md`
- Create: `docs/research/18-lute-shell-skeleton.md`
- Create: `docs/research/assets/2026-09-19-lute-shell-first-ui.png`（Task 8 的截图）
- Modify: `docs/adr/README.md`（加一行索引）
- Modify: `docs/adr/decisions.json`（**只能**由 `node scripts/gates/adr-agent-records.mjs --write` 重生成）
- Modify: `docs/research/17-thin-shell-spike.md`（§3 加一行更正指针）
- Modify: `docs/architecture.md`（§0 门禁契约表加 `lute-shell-pin` 一行；仓库构成处提一句 `apps/lute-shell/`）

**Interfaces:**
- Consumes: Task 1–9 的全部产物与实测输出。
- Produces: ADR-0131 与其 Note 互链、decisions.json 含新条目、门禁 `adr-index`/`adr-note-links`/`adr-agent-records`/`docs-link-integrity` 全绿。

- [ ] **Step 1: 复核 ADR 号**

Run: `cd /Users/lute/project/Magpie-Horch && ls docs/adr/ADR-*.md | tail -3`
Expected: 最大号是 `ADR-0130.md` ⇒ 用 0131。若并发会话已占用 0131，取当时的最小空闲号，并把本 task 后续所有 `0131` 字面量一起替换。

- [ ] **Step 2: 写 `docs/notes/implemented/architecture/2026-09-19-lute-shell-skeleton.md`**

四个必备小节，每节写实际发生的事，不写通用道理：

- `## Problem`：上游每月 1-2 次破坏性更新，38 锚点重锚耗时 2-4 周/次（引 spec §1；Note 里写成相对链接 `../../../superpowers/specs/2026-09-19-base-decoupling-design.md`——Note 住在 `docs/notes/implemented/architecture/` 下，三层上溯才到 `docs/`）。P0 spike 证明 npm + 独立 boot 可行，但 `@deepseek-ai/dsh-desktop-host` 未发布（404），宿主进程无处可取；且 spike 的 `layers: 0` 当时归因错误。
- `## Decision`：三条，逐条写清选择与理由——(1) 传输走子进程 + FD3/FD4 DSH3 帧协议（拒绝「主进程内 boot」：AI 运行时与 UI 同生共死会复刻 P-52 那类挂死故障且没有旁路；拒绝「harness 自带 HTTP」：走浏览器客户端路径，诊断技能里登记的两个已知故障都在这条路上）；(2) profile 用「仓库 seed + 运行时物化到 `~/.dsh/profiles/lute-shell/`」（上游同构，P4 不返工，仓库不沾 node_modules）；(3) 宿主运行时就位在 `<profile>/lute-host/`，使其裸导入解析到 profile 唯一一份 hoisted node_modules——否则第二份 cordis 实例会让服务身份跨边界断裂；(4) 门禁只加静态 `lute-shell-pin`，不扩 package collector（`apps/` 进 collector 会牵动 gen-catalog 的分组语义，与本期目标不匹配）。
- `## Alternatives considered`：把上面 (1)(2)(4) 的被拒选项各写一行，含拒绝理由。
- `## Consequences`：正面——壳层补丁数为 0，`pnpm update` + 门禁即更新路径的第一段；layers 从 0 到 2 已实测。负面/待办——`apps/` 暂不受 collector 治理（`package-identity`/`catalog-fresh`/`scripts-runnable` 都看不到它），P2 起需要重新评估；`agent-presets` 系统根注入被跳过（npm tarball 无 `config/`，包内已自带 shipped root，但这条要在 P2 用真 preset 复验）；两个 native directory-picker 未插入，P2/P3 若要目录选择器需连壳侧 IPC 一起做；smoke 不进 CI，靠人工跑。正文里必须出现 `ADR-0131` 字样（门禁 `adr-note-links` 要求）。

- [ ] **Step 3: 写 `docs/adr/ADR-0131.md`**

结构照现有 ADR（例如 `docs/adr/ADR-0130.md`）：标题、状态、日期、正文，末尾必须有 `## 机器可读决策` 小节，后跟一个 ```` ```json ```` 围栏，内含非空 `decisions[]`，每项 `{id, text, constraints?}`（`scripts/gates/adr-agent-records.mjs:50,67-131` 校验）。至少三条 decision：宿主传输（子进程 + DSH3 管道）、profile 落点（seed + 物化）、宿主运行时就位（profile 内，单一 cordis 实例）。正文里必须有 `决策记录：[Note](../notes/implemented/architecture/2026-09-19-lute-shell-skeleton.md)`（相对路径要能从 ADR 文件位置解析到 Note）。

- [ ] **Step 4: 加 ADR 索引行**

在 `docs/adr/README.md` 的表格里按现有格式加一行 `| ADR-0131 | 标题 | 状态（2026-09-19） | [Note](../notes/implemented/architecture/2026-09-19-lute-shell-skeleton.md) |`，位置按编号顺序。

Run: `cd /Users/lute/project/Magpie-Horch && node scripts/gates/adr-agent-records.mjs --write && node scripts/gates/checks.mjs 2>/dev/null; node scripts/gate.mjs --mode quick 2>&1 | grep -E "adr-index|adr-note-links|adr-agent-records"`
Expected: 三项全绿；`docs/adr/decisions.json` 出现 ADR-0131 的条目（`git diff docs/adr/decisions.json` 应只增不改既有行）

- [ ] **Step 5: 写 `docs/research/18-lute-shell-skeleton.md`**

证据级报告，全部贴**真实命令输出**（未跑就写「未运行」，不接受口头验收）：

- 头部：日期、状态（P1 完结/PARTIAL）、关联链接（spec、P1 计划、17 号报告、ADR-0131）。
- §1 npm 可用性补测：`dsh-desktop-host` 404 的原始输出；`dsh-base`/`dsh-web-app`/`dsh-web-frontend`/`dsh-app-boot` 的 versions 列表；「`latest` tag 指向 `0.0.1-rc.*` 旧线」的实测（`pnpm view @deepseek-ai/dsh-cmdline version` → `0.0.1-rc.1`，而 `dsh-web-app@0.1.5-rc.2` 依赖 `^0.1.5-rc.2`）。
- §2 layers 从 0 到 2：Task 6 Step 11 的 `loadProfileDirectory` 输出原文 + seed `package.json` 的 `dsh.profile.bundles` 片段；明写「根因是 `dsh.profile.bundles`（`profile.ts:781`），不是 pnpm workspace 结构」。
- §3 无头 smoke：Task 7 Step 2 的 8 行 PASS 原文。
- §4 第一个可见 UI：Task 8 Step 10 的截图（`![lute-shell 第一个可见 UI](assets/2026-09-19-lute-shell-first-ui.png)`）+ `host ready, dsh 0.1.5-rc.2` 输出 + 关窗后 `pgrep` 无输出。
- §5 与旧壳的对照：壳层补丁 0（旧壳 12）、运行时补丁 0（P3 才引入）、`apps/lute-shell` 自有源码行数（`find apps/lute-shell/src -name '*.ts' | xargs wc -l`）。
- §6 遗留：`agent-presets` 注入跳过、native directory-picker 未插入、`apps/` 未进 collector、smoke 不进 CI、P4 打包需随附 plain node 或验证 RunAsNode 在签名+公证后仍可用。

- [ ] **Step 6: 更正 17 号报告的 §3**

在 `docs/research/17-thin-shell-spike.md` §3「根因分析」段末尾追加一行（不删原文，保留当时的判断痕迹）：

```markdown
> **2026-09-19 更正**：真因是 profile `package.json` 缺 `dsh.profile.bundles`（`packages/boot/app-boot/src/profile.ts:781`），与 pnpm workspace 结构无关。实测见 [18 号报告 §2](18-lute-shell-skeleton.md)。
```

- [ ] **Step 7: 更新 `docs/architecture.md`**

两处，各一行，不复述细节（一份事实只有一个家，细节留在 ADR/Note/研究报告里）：
- §0 的门禁契约表加 `lute-shell-pin` 一行（校验内容一句话 + 指向 ADR-0131）。
- 仓库构成/分层处提一句 `apps/lute-shell/` 是自有 Electron 薄壳、不在 package collector 射程内、详见 ADR-0131。

- [ ] **Step 8: 跑全量门禁**

Run: `cd /Users/lute/project/Magpie-Horch && pnpm run gate 2>&1 | tail -40`
Expected: 退出码 0。若有红，先归因（并发会话在制品 vs 本 task 引入）；本 task 可能引入的红只有 `adr-*` 与 `docs-link-integrity`（相对链接写错），按报错逐一修链接。

Run: `cd /Users/lute/project/Magpie-Horch && pnpm run gate:full 2>&1 | tail -40`
Expected: 退出码 0，或只剩并发会话噪声（`gate-concurrency-selftest` 之类），需在提交信息里点名说明。

- [ ] **Step 9: 提交**

```bash
cd /Users/lute/project/Magpie-Horch
git add docs/adr/ADR-0131.md docs/adr/README.md docs/adr/decisions.json \
  docs/notes/implemented/architecture/2026-09-19-lute-shell-skeleton.md \
  docs/research/18-lute-shell-skeleton.md docs/research/assets/2026-09-19-lute-shell-first-ui.png \
  docs/research/17-thin-shell-spike.md docs/architecture.md
git status --short
git commit -m "$(cat <<'EOF'
docs(adr,research): P1 薄壳骨架留痕——ADR-0131 + 18 号证据报告 + 更正 17 号根因

ADR-0131 记三条决策：宿主走子进程 + DSH3 管道（拒绝主进程内 boot 与 harness HTTP）、
profile 用 seed + 运行时物化、宿主运行时就位在 profile 内以保单一 cordis 实例。
17 号报告 §3 的根因猜测（pnpm workspace 结构）更正为 dsh.profile.bundles 缺字段。
EOF
)"
```

---

## Self-Review

**1. Spec coverage**（[spec](../specs/2026-09-19-base-decoupling-design.md) §5 的 P1 里程碑 = 新壳 boot + 显示 harness 默认 UI + 空 profile 正常）：

| spec 要求 | 落在哪个 task |
|---|---|
| 新壳 boot | Task 5（宿主入口）+ Task 7（smoke 断言 `ready` 与 `dshVersion`） |
| 显示 harness 默认 UI | Task 4（资产 + 注入）+ Task 8 Step 10（实机截图验收） |
| 空 profile 正常 | Task 6（seed 只含两个上游 bundle，零 LUTE 插件）+ Task 6 Step 11（layers=2 实测） |
| 从 `apps/desktop-host` 提取 boot 逻辑（memory 里的 P1 起点 1） | Task 5 Step 3-4 |
| 参照真实 profile 建完整 workspace（起点 2） | Task 6 Step 1（`nodeLinker: hoisted` 等对齐实测形态） |
| 用 `pnpm install` 装到 profile、验 layers > 0（起点 3） | Task 6 Step 11-12 |
| 加 Electron 主进程 → 第一个可见 UI（起点 4） | Task 8 |
| 旧壳继续出货（spec §5「旧壳状态」列） | 全部 task 都不碰 `vendor/**`、`~/.dsh/profiles/desktop/`、`/Applications/DSH Desktop.app`（Global Constraints） |
| 门禁跟着走、每期结束全绿（spec §5 约束） | Task 9 + Task 10 Step 8 |
| 非机械改动必须留痕（AGENTS.md） | Task 10 |

spec §6 的三条新门禁（`patch-applies-clean`、`harness-version-pin`、`submodule-ref-sync`）属于 **P3/P5**：P1 还没有任何 pnpm patch，`patch-applies-clean` 无对象；`harness-version-pin` 的 P1 等价物是 Task 9 的 `lute-shell-pin`（覆盖壳与 seed 两侧）；`submodule-ref-sync` 要等 P3 有运行时补丁后再上。**这是有意的范围裁剪，不是遗漏。**

**2. Placeholder scan**：无 TBD / 「类似 Task N」/ 「适当处理错误」/ 「写测试覆盖上述」。自有代码全部给出完整可编译实现；两处顺序与签名约束在正文就地写明理由（Task 5：`mkdirSync` 必须先于 `realpathSync`，否则首跑 `ENOENT`；Task 6：`assertPlan` 需要 `seedDir` 参数才能区分「seed 坏了」与「忘了先 build」两种出路）。三处大体量移植（Task 2 帧协议、Task 5 Step 4 进程装配、Task 8 Step 7 `ShellHostProcess`）给的是**参照文件 + 行号 + 符号映射表 + 差异清单 + 必须逐字保留的行为清单**——逐字重贴 400 行反而会在执行时与 submodule 参照悄悄漂移，而映射表让漂移可见。

**3. 已知的计划内不确定项**（执行时按指定方式收敛，不要自行放宽断言）：
- `renderIndexInjections` 与 `IndexInjection` 的精确签名以 `apps/lute-shell/node_modules/@deepseek-ai/dsh-host-webserver/lib/types/*.d.ts` 为准（Task 4 Step 8 已写明处置方式）。
- `loadProfileDirectory` 对「bundle 缺 `dsh.bundle.patch`」的错误措辞以 harness 实际抛出为准（真实抛点 `packages/boot/app-boot/src/profile.ts:791-795`），Task 3 Step 7 已写明改断言而非改 harness。
- Electron 43 内置 Node 的版本号（Task 8 Step 10 实测），决定 P4 是否必须随附 plain node。
- ADR 号 0131 可能被并发会话占用（Task 10 Step 1 先复核）。

**4. Type consistency**（跨 task 的符号一致性核对）：
- `FetchHandler` 在 Task 4 定义（`handler.ts`），Task 5 的 `handlers: Record<RouteTarget, FetchHandler>` 使用同一形状 ✓
- `REMOTE_STREAM_PATH` 在 Task 4 的 `assets.ts` 定义、`streams.ts` 再导出，Task 5 从 `./assets.js` 导入 ✓（一条事实一个家）
- `composeShellPatches` 返回 `{patches, layerNames, layerDirs}`——Task 3 的 Interfaces 与 Step 6 实现、Task 5 的 `composition.layerDirs` 用法三处一致 ✓
- `hostEntryPath` / `overlayPath` / `defaultProfileDir` 在 Task 6 定义，Task 7（smoke）、Task 8（runtime）复用同名同签名 ✓
- `HostRuntime.entry` 由 `hostEntryPath(profileDir)` 得出，与 Task 6 Step 11 实测的 `<profile>/lute-host/host/index.js` 一致；Task 5 Step 4 的 overlay 相对路径 `../shell.cordis.patch.yml` 从 `lute-host/host/index.js` 出发正好指向 `lute-host/shell.cordis.patch.yml`，与 Task 6 `planMaterialize` 的目标路径一致 ✓
- `SHELL_*` 常量名在 Task 2 定义、Task 5/7/8 使用，无 `DESKTOP_*` 残留 ✓
- `HostEvent` / `HostCommand` / `isHostEvent` / `isHostCommand` 在 Task 2 导出，Task 5（宿主侧 `send`/`process.on('message')`）与 Task 8（`host-process.ts` 的 `ready`/`fatal` 判定）共用 ✓

## Execution Handoff

计划已落盘。两种执行方式：

1. **Subagent-Driven（推荐）** —— 每个 task 派一个全新 subagent，task 之间我来 review，迭代快、上下文干净。
2. **Inline Execution** —— 在本会话内按 executing-plans 批量执行，带检查点。

Task 1→2→3→4→5→6→7→8→9→10 是严格线性依赖（后者消费前者的接口），不能并行。Task 6 Step 11 与 Task 8 Step 10 需要网络与 GUI，是本计划仅有的两处实机验收点。
