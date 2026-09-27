# 本机活动仓基线

- 日期：2026-09-27
- 状态：BASE-01～05 已完成本地实施与 Sage BASE 验证；BASE-06 已获授权，本文随 checkpoint 提交固化
- 决策：[ADR-0160](../../../adr/ADR-0160.md)

## Problem

原施工仓被整体搬到普通本地文件系统时，同时带入了分叉的 `main`、staged / unstaged / untracked 三层工作、ignored 历史发布物、旧插件、缓存和失效的机器绝对路径。把“目录已经搬家”当成“干净活动仓已经建立”，会让后续前后端开发继续在不可解释的混合基线上累积。

## Decision

- 活动开发使用普通本地文件系统上的 `main`；仓根由 `git rev-parse --show-toplevel`、`import.meta.url` 或脚本自身位置推导。
- BASE-01 / 02 先建立仓外恢复集：完整物理快照、全 refs bundle、ECC/P0 专项 bundle、两层 patch、精确 index 和 untracked 副本。
- BASE-03 以 fetch 后的 `origin/main` 为唯一基线；远端 revert 不被旧快照覆盖。
- BASE-04 只恢复 Sage Shell、Capability Adapter、数据隔离、候选资产和当前决策记录。历史插件、受控浏览器、Laya、legacy 门禁、packaging/DMG 接线与 UI 新开发均不进入本批。
- BASE-05 修复当前入口、动态仓根和本机 hooks，并把裸 CLI、包脚本与 CI 都收敛为 Sage BASE allowlist；Sage 服务消费只核对 `apps/sage-shell/` 的独立登记，历史全量检查仍可通过 `gate:legacy*` 显式运行。根包名称与描述改为 Sage 语义，`luteOrigin` / `luteOwner` / `lutePublish` 仅作为治理兼容字段保留。历史名称仅在 provenance、兼容、许可证、fixture 和历史记录中保留。
- BASE-04 回放的 `product/renderer.ts` 是此前已批准 P0 壳快照的一部分，不是本批新设计或扩写 UI；本批没有把 Sanbao 原型页面接入产品。
- `packaging/` 的变更只修复仓根发现、`file:` 依赖改写与文档标识，并以语法 / fixture 测试验证；没有执行旧装配器，也没有把它连接为 Sage DMG 发布链。

## Alternatives considered

- **继续从 iCloud 目录开发**：Git / 文件扫描等待过高，不适合高频开发。
- **在整体搬入的旧仓上直接继续**：不能解释 ahead/behind 与三层 dirty 状态，也无法区分当前产品和历史施工。
- **重新 clone 后删除旧仓**：会在没有完整恢复源时丢失 ignored DMG、stash、index、`.qoder` 和历史 worktree 管理记录。
- **全仓字符串替换**：会把历史事实、兼容接口、治理字段和第三方归属误改为产品品牌。

## Consequences

- 当前 Sage P0 可以在远端权威基线上独立验证；旧插件默认隔离，不再隐式决定启动或测试结果。
- 默认 `pnpm run gate` 只给出 Sage BASE 证据；旧全量门禁保留为 `pnpm run gate:legacy*`，其已知 `repo-attest` 超时 / 进程回收问题进入后续 Gate Hygiene，不在 BASE 中放宽或跳过判据。
- 仓外恢复集 `Sage-recovery-20260927-base01/` 是本轮回退入口，不是运行时依赖。
- BASE-01～05 完成时，`packaging/release/` 及其 12 个历史 DMG 仍保留在活动仓；该条是当时的历史结论，不代表 CLEAN-02A 后的当前文件布局。
- 本轮不修复、清理或复用历史 worktree；后续若要处理，需独立维护计划。
- BASE 完成后的代码最初仍是未提交工作；用户已在 BASE-06 单独授权事实同步、复验、提交并推送 `main`。

## CLEAN-02A 后续事实（2026-09-27）

- CLEAN-02A 在单独授权下只处理活动仓中的 ignored 历史产物：先逐项清除 41 个精确 `uchg` 标记，再删除 17 个目录和 3 个文件；没有执行 blanket flags、`git clean` 或 worktree prune。
- 活动仓中的 `packaging/release/` 副本已移除。12 个历史 DMG 的恢复源仍位于仓外恢复集 `Sage-recovery-20260927-base01/source/packaging/release/`；共 `7,732,179,561` bytes，12/12 SHA-256 复算一致。恢复集只用于回退，不是运行时依赖。
- 活动仓磁盘占用从 `15,071,484 KiB` 降到 `6,944,456 KiB`，减少 `8,127,028 KiB`（约 7.75 GiB）；ignored 条目从 258,951 降到 236,449，减少 22,502。
- CLEAN-02A 完成时，149 条 staged BASE 路径与两份冻结指纹未变化；Sage quick gate 仍为 23/23，`test:gate` 仍为 186/186。它们是清理完成时的历史验证结果，BASE-06 仍需在最终提交快照中重新验证。
- BASE-06 提交明确排除共享 `main` 上另一条已批准 BusinessMatter 任务的领域源码、测试、合同与执行计划改动；不删除、不移动、不暂存，也不将其验证结果计入 BASE。

## Verification

- **恢复链**：仓外物理快照、3 份 complete-history bundle、精确 index、staged / unstaged patch、183 个 untracked 文件和 12 个历史 DMG 已经独立只读复核；12 个 DMG 共 `7,732,179,561` bytes，复算 SHA-256 与清单一致。原 iCloud 路径已经不存在，因此不能再与搬迁前原件做第二次逐字节对照；历史 linked worktree 的仓外未提交 / ignored 瞬态文件也不属于当前主仓恢复保证。
- **Git 基线**：活动分支为 `main`，`HEAD == origin/main == 5df1a56f22a51bf57e7e3639eae7bb461880983a`；ECC 与 P0 快照有独立 archive refs，旧 `core.hooksPath` 已 unset，未 prune 历史 worktree。
- **Sage 专用门禁**：`pnpm run gate` 与 `pnpm run gate:full` 当前分别实跑 `23/23` 项通过，`skipped=0`；其中实际执行 Sage Shell `typecheck → build → test`、三类边界、动态仓根 / packaging 路径卫生、候选资产、ADR / 文档和 Sage 独立服务消费对账。服务消费读数为 `1` 个 Sage 文件 / `1` 条字面量服务 / `0` 个动态消费文件，不扫描 `packages/` 旧插件。
- **门禁自测**：`pnpm run test:gate` 当前实跑 `186/186` 通过；Sage scope 固定 23 项，裸 `scripts/gate.mjs` 默认报告 `scope=sage`，workflow 的四条 gate / attest 命令均显式使用 Sage，且 workflow 不进入任何 legacy package 目录；legacy scope 仍保留但只能显式进入。
- **历史全量门禁**：在 scope 分离前曾实跑旧 quick gate；`repo-attest` 超过其 20 分钟预算后遗留孤儿子进程，总门禁未正常返回，人工终止为退出码 `130`。该次不是通过证据；超时与进程组回收进入后续 Gate Hygiene，本批未放宽预算或跳过判据。
- **资产证据边界**：`generate-sage-assets.mjs --check` 已通过；依赖外部已审计 SVG 的两条变异测试因未提供 `SAGE_TEST_SOURCE` 仍是 `UNVERIFIABLE`，不能写成通过。`assets/sage/manifest.json` 的权属、商标、视觉批准均仍为 `unapproved`，release gate 仍为 `blocked`。
- **未验收项**：没有启动 GUI 做产品交互验收，没有生成 / 签名 / 公证 Sage.app 或 DMG，没有连接受控浏览器、旧插件或真实业务闭环。

## 后续任务开工规则

1. 先读本记录、[ADR-0160](../../../adr/ADR-0160.md) 与 [Sage 自有桌面端决策](../../../adr/ADR-0159.md)。
2. 用 Git 或脚本位置发现仓根，禁止新增用户机器绝对路径。
3. 先确认 `main`、status 和当前 diff；不得从恢复集或历史插件整包回灌。
4. accepted ADR 只证明决定存在；代码、测试、build 和运行验收必须分别报告。
5. 任何删除 ignored 缓存、历史 release 或恢复集的操作，都要有精确名单、回退方式和单独授权。
