# AGENTS.md · Sage

本仓库是 Sage 桌面产品的活动开发仓。Harness 保留为能力运行时与历史兼容边界，不再拥有产品壳；旧插件、旧发布链和历史证据默认隔离。以下是**每个会话都要在上下文里的常驻规则**，每条只给结论与归属地；详细内容一律在被链接的文档里，不要在此复述。

## 基座与红线

- **基座只 pin 不改**：`deepseek-harness` 与 `vendor/dsh-desktop` 均为 pin 的只读参照（[ADR-0008](docs/adr/ADR-0008.md)）；补丁与 pin 的实际契约在 `vendor/dsh-desktop.pin`，改 pin 必须与行为变更分开提交。
- **版本跟进走观察窗**：上游新稳定版先观察 2 周，仅红线触发才跟进（[ADR-0006](docs/adr/ADR-0006.md)）。
- 架构红线（凭证不落仓库、不碰 shadows-shipped-ui slot、编辑工具会打破 `file:` 硬链接须 tmp+mv 同步、**官方 UI 改写锚禁止钉哈希**）见 [docs/architecture.md](docs/architecture.md) 第 2 节。

## 改动的验收方式

- **一条命令给 Sage 证据**：`pnpm run gate`（提交前）与 `pnpm run gate:full`（推送前）只跑 Sage BASE allowlist；退出码即契约，门禁契约表见 [docs/architecture.md](docs/architecture.md) 第 0 节。历史平台、旧插件与发布链只能显式运行 `pnpm run gate:legacy*`，其结果不得冒充 Sage 验收。
- **门禁是硬门槛**：契约级校验一律阻塞；存量未达标的包登记在 `scripts/gates/exemptions.json`，该文件**只减不增、到期即拒绝**（[ADR-0014](docs/adr/ADR-0014.md)）。
- **不接受口头验收**：改动必须给出真实命令输出（Red/Green、构建、浏览器验收），未跑就写「未运行」。
- **开工前先读复发故障总账**：[docs/pitfalls-playbook.md](docs/pitfalls-playbook.md) 按**根因**列出会复发的故障（未验证的事实被钉进出货面、仪器假绿、「知道」没有变成「拦住」、写了但从没跑到、隔着解释器写字面量、把平台行为当常量、一条事实多个家、用纪律守只有机制能守住的东西、挂死主线程的观测悖论——所有仪器都要过故障现场，症状层修复被当成根除〔P-52，2026-09 黑屏事故〕）。每条点名了拦它的**门禁名**，由门禁 `pitfalls-playbook` 守着，不会腐烂；改完一类缺陷就往里加一条。
- **挂死/卡死类故障先建旁路再排查**：CPU 100%+、inspector 超时、console 零输出、rAF 不跑四签名同时成立 = 渲染主线程被微任务级联饿死——禁止跳到 JIT/CLI/版本玄学；旁路取证手册在 `~/.agents/skills/dsh-desktop-diagnostics/SKILL.md`（铸 cookie + 独立 Chrome + 预启用 Debugger 的 pause 中断）。改共享层 `shared/client/sidebar-entry-core.ts` 的 observer 时必须维持不变量：**对被观察子树的写操作，移动一次后不得再满足移动条件**。

## 活动仓与续作边界

- **先读本机活动仓基线**：开工前阅读 [本机活动仓基线](docs/notes/implemented/process/2026-09-27-local-active-repository-baseline.md)、[ADR-0160](docs/adr/ADR-0160.md) 与任务相关 ADR。恢复集不是活动依赖；不得整包回灌旧施工内容。
- **仓根必须动态发现**：代码、测试和维护命令使用 `git rev-parse --show-toplevel`、`import.meta.url` 或脚本自身位置；禁止新增用户机器绝对仓路径。历史证据和故意验证绝对路径会判红的 fixture 除外。
- **历史能力默认隔离**：受控浏览器、legacy 门禁、Laya、旧插件与旧 DMG 发布链只有在单独任务明确启用时才进入改动和验证射程；`pnpm run gate` 不运行这些检查，需用 `pnpm run gate:legacy*` 显式进入；accepted ADR 不等于实现已进入当前基线。
- **不明改动不擅自归属**：继续旧任务前核对 branch / status / diff / untracked 和任务记录；不以 reset、清理或放宽判据换取绿灯。

## 决策与文档

- **非机械改动必须留痕**：同一次提交附一篇决策记录 Note（`docs/notes/{lifecycle}/{class}/yyyy-mm-dd-topic.md`，必备 `## Problem` / `## Decision` / `## Alternatives considered` / `## Consequences`），对应 ADR 编号登记在 `docs/adr/`（[ADR-0015](docs/adr/ADR-0015.md)）。
- **一份事实只有一个家**：同一结论只写一处，其余位置留相对 Markdown 链接；链接可达性由门禁校验（[ADR-0009](docs/adr/ADR-0009.md)）。
- 文档分层：本文件（常驻规则）→ [docs/architecture.md](docs/architecture.md)（有序地图）→ `docs/notes/`（决策）→ 各能力组 README（包契约）。索引见 [docs/README.md](docs/README.md)。

## 目录与归属

- 插件按能力归入 5 组：`capabilities/` `surfaces/` `platform/` `contract/` `infra/`（[ADR-0011](docs/adr/ADR-0011.md)）。
- 包的治理性质写在 `package.json` 的 `luteOrigin` / `luteOwner` / `lutePublish` 三字段里，`npm-pinned` 的包不在本仓库内（[ADR-0010](docs/adr/ADR-0010.md)、[ADR-0012](docs/adr/ADR-0012.md)）。
- 当前重构分期与本次范围见 [.scratch/lute-refactor/spec.md](.scratch/lute-refactor/spec.md)。

## Legacy 产品矩阵与外部产品（仅显式旧平台任务适用）

- 以下规则只在用户明确进入旧 DSH profile / 旧插件任务时启用；Sage 当前使用独立数据根，尚未建立新的插件装配契约，不得把 `~/.dsh` 当作 Sage 运行时。
- **外部产品不进 legacy 出货 preset**：`scripts/role-presets/generate.mjs` 的 `PRODUCT_MOUNTS` 保持为空；任何 `file:` 指向仓库外的产品包都不得烘焙进 `agt-*` 旧出货组合（[ADR-0056](docs/adr/ADR-0056.md)）。
- **旧平台本机使用外部产品走 profile 本地装配**：在 `~/.dsh/profiles/<profile>/cordis.patch.yml` 里显式挂载，并确保包仍在 `dsh.profile.bundles`；装配只改旧运行时 profile，不进仓库出货物（[ADR-0061](docs/adr/ADR-0061.md)）。
- **新应用抽屉读取可选 host 服务须双通道探测**：`ctx.get('agentPresets')` 与 `connection.api.agentPresets` 都要试，以是否存在可调用 `select` 为准，不得假设单一载体（[ADR-0061](docs/adr/ADR-0061.md)）。

## Legacy 发布与 SOP（仅显式旧 DMG 任务适用）

- Sage.app 的装配、签名、公证与发布链尚未建立；不得把旧 DMG 通过当作 Sage 发布证据。
- **旧 DMG 打包发布按 legacy SOP 执行**：仅在用户明确进入旧发布任务时使用 [docs/sop/dmg-release.md](docs/sop/dmg-release.md)；关键红线（原子就位、清单入库、同号归档、机器路径只减不增）来自 [ADR-0056](docs/adr/ADR-0056.md) / [ADR-0057](docs/adr/ADR-0057.md) / [ADR-0058](docs/adr/ADR-0058.md)。
