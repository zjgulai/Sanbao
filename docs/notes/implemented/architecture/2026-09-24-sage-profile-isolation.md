# Sage profile 与资料根隔离（P0-3A）

- 日期：2026-09-24
- 状态：已实现并完成本地源码验证；真实旧 DSH、真实用户资料、Electron GUI 与发布物均未运行
- 承接决策：[ADR-0159](../../../adr/ADR-0159.md)
- 实施范围：[Sage 自有桌面端执行方案](../../../plans/2026-09-24-sage-self-owned-desktop-execution-plan.md) 的 P0-3A

## Problem

P0-1 仅把源码目录迁到 `apps/sage-shell/`，仍保留旧的 profile 名、Host 目录、环境变量和默认资料根。若继续让 Sage 从 `~/.dsh`、环境中的 `DSH_HOME` 或任意传入 profile 路径启动，Sage 与旧 DSH 无法安全并存，且失败可能把旧资料误当作 Sage 的可写运行时。

单纯把默认路径改成 Sage 也不足够：Electron 会在 ready 前初始化资料目录；profile 物化若直接覆盖最终目录，会在安装或校验失败时破坏当前可用版本；Host 子进程若只信任 argv，又会绕过主进程的激活状态。

## Decision

P0-3A 将 Sage 的默认资料根固定为 `~/Library/Application Support/Sage`，并通过 `SagePaths` 唯一派生：

- `electron/user-data`、`session-data`、`logs`、`crash-dumps`；
- `harness/`（子进程唯一可见的 `DSH_HOME`）；
- `harness/profiles/.sage-generations/<generation>` 与 `.sage-staging/`；
- 根级原子激活指针 `profile-current.json`。

目录在 Electron ready 前以同步、拒绝符号链接重定向的方式创建；`userData`、`sessionData`、`crashDumps` 与日志路径随后全部指向这组 Sage 路径。子进程环境会清除继承的 `DSH_HOME`、`LUTE_SHELL_*` 与 `SAGE_*` 控制变量，再只写入计算所得的 `harnessHome`。

物化流程改为：Sage staging → 复制 seed / 编译 Host → install → 收据和所有自有文件哈希校验 → generation 原子改名 → `profile-current.json` 原子替换。已激活 generation 永不原地覆盖；启动时再验证指针、收据和所有记录文件，Host 只接受当前激活 generation。

本批只提供带 marker、显式 allowlist、校验收据和失败清理的 `fixture-only` 导入框架。它没有生产调用方，不能读取、复制或改写真实 `~/.dsh`、`desktop`、凭证、会话、预设或工作区。真实旧资料的来源选择、资料分类和导入演练仍是 P0-3B 的独立确认项。

`sage-data-isolation` 门禁和反向用例把旧根、旧 Shell 控制变量、继承 `DSH_HOME`、任意 Host 目录创建、失去 active-profile 校验、错误的 child argv，以及 ready 后才设置 Electron 路径都设为失败。

## Alternatives considered

- **共享 `~/.dsh` 或继承 `DSH_HOME`**：拒绝。两套桌面端会共享可变状态，无法证明 Sage 冷启动没有读取旧资料。
- **直接覆盖一个固定 Sage profile**：拒绝。install 或校验失败会损坏当前可启动状态，且无法保留上一个 generation。
- **让 Host 信任任意 profile argv**：拒绝。会绕过主进程的激活指针和收据验证。
- **立即实现真实旧 DSH 导入**：拒绝。资料类别、来源目录和用户确认尚未获得，P0-3A 只建立不接触真实资料的 fail-closed 框架。
- **在 P0 设置 Bundle ID、签名或 DMG**：拒绝。它们仍需 Apple / 发布身份决策，属于 P1。

## Consequences

已验证的源码层证据：

- `pnpm --dir apps/sage-shell typecheck` 通过；
- `pnpm --dir apps/sage-shell test` 通过（14 个测试文件、76 个测试）；
- `pnpm --dir apps/sage-shell build` 通过；
- `node --test scripts/gates/sage-data-isolation.test.mjs` 通过（10/10）；真实工作树扫描 22 个 Sage 源码 / 脚本文件，0 项违规；
- `git diff --check` 与 `git diff --cached --check` 通过。

仍未验证且不作完成声明：真实 Sage profile 的 materialize、旧 DSH 数据导入 / 回滚、Electron GUI 冷启动、TCC、已安装 App、Bundle ID、签名、公证、DMG 与公开品牌资产。它们分别留待 P0-3B、P0-4、P0-6 和 P1。
