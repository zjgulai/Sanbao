# BATCH-001 · 工作树边界与 Shopify 凭证外传阻断

- 状态：`local-complete / live-deferred / closed`
- 日期：2026-09-16
- Tasks：`BASE-001`、`BASE-002`、`SEC-RT-001`
- Owner：当前 Codex 会话
- 分支：`main`（禁止 worktree）
- 提交/推送/发布权限：无

## 1. 完成标准

本批只有同时满足以下条件才完成：

- 事实边界、目标文件 hash、允许/禁止写入和停止条件已保存；
- Shopify domain 保存路径、历史读取路径和每次网络使用前都采用同一个 fail-closed normalizer；
- 合法 `<shop>.myshopify.com` 被规范化，全部非法矩阵在任何 fetch 前拒绝；
- 有真实 Red/Green 证据；目标 package test 与 typecheck 通过；
- 未授权路径不因本批发生变化；
- 汇报明确区分 E1/E2 与未运行的 live/clean-machine/release 验收。

## 2. BASE-001 快照

### Git 与发布锚

- branch：`main`
- HEAD：`af5f2ede6092a38fcb7d119571667771004bf416`
- `origin/main`：`44f49940be70574519da6afbfeef3638fb0b97ad`
- `codeup/main`：`44f49940be70574519da6afbfeef3638fb0b97ad`
- local ahead：3 commits
- latest local tag：`v2.4.1`
- 写前工作树：23 tracked worktree modifications、57 untracked files、0 staged

### 并发/他人资产

以下路径或主题已有非本批候选，本批不接管、不格式化、不修复、不用于 green 归因：

- `packages/capabilities/dsh-overseas-skills/**`
- `packages/platform/dsh-settings-shell-local/**`
- `scripts/gate.mjs`、`scripts/gates/**`、`scripts/sync-profile.mjs`
- `docs/adr/ADR-0087.md`、`ADR-0088.md`、`ADR-0091.md`、`ADR-0092.md` 及其 notes/index
- Settings live acceptance、role preset removal、Fullstack/intake 相关新增文件

### 目标文件写前快照

| 文件 | 写前 SHA-256 | 写前状态 |
| --- | --- | --- |
| `packages/capabilities/dsh-wanzh-hulian/lib/host-util.js` | `405334a14c955f378104108a8fe931605a0f9984ec18eb8c18bfa28275c4363f` | clean |
| `packages/capabilities/dsh-wanzh-hulian/lib/index.js` | `7eb864a65fdf77170b853b489802b91b04e49d42396ca2f19e8006d9b331b352` | clean |
| `packages/capabilities/dsh-wanzh-hulian/test/wanzh-hulian.spec.mjs` | `098fcf9e7ab2c518694ab2477a3273c70335f28ca62f32f7167cf3c10168f2d8` | clean |

三文件在初始审查与本批开始复核中 hash 一致，未发现相同目标的并发写入。每次 patch 前仍须重新核对。

## 3. BASE-002 权限契约

### 允许写入

- `.scratch/review/2026-09-15-product-execution-plan/**`
- `.loopx/registry.json`（只允许 LoopX CLI 管理新 goal entry）
- `.codex/goals/magpie-horch-product-hardening*`（只允许 LoopX CLI 管理）
- 上述三个 `dsh-wanzh-hulian` 文件

### 非范围

- vendor/pin/patch/profile/live HOME、其他 package、gate、ADR、DMG、Release、CI/ruleset
- 真实凭证、真实店铺、真实外部网络
- 产品 UX 重构、MCP 供应链、Team Hub、上游升级
- commit、push、tag、签名、公证、发布

### 停止条件

- 三个目标文件在 patch 前 hash 与本卡不一致；
- 官方 contract 需要接受非 `.myshopify.com` host；
- 测试只能用真实网络/secret 才能证明；
- 目标 package 的失败无法与并发 dirty 候选隔离。

## 4. 证据计划

### Red

先只加入 contract test，运行目标测试并要求因缺少 `normalizeShopifyHost` / safe fetch contract 而失败。保存退出码和关键错误；Red 不能通过人为 `throw` 或无关 broken fixture 制造。

### Green

实现后执行：

```sh
rtk pnpm --dir packages/capabilities/dsh-wanzh-hulian test
rtk pnpm --dir packages/capabilities/dsh-wanzh-hulian typecheck
rtk git diff --check -- packages/capabilities/dsh-wanzh-hulian
rtk git status --short -- packages/capabilities/dsh-wanzh-hulian
```

若运行仓库 `gate`，只能报告当前 dirty 工作树的整体状态；除非能证明输入在本批验证期间稳定，否则不能作为本任务 E3。

## 5. 执行记录

| 时间 | 任务 | 结果 | 证据 |
| --- | --- | --- | --- |
| 2026-09-16 | BASE-001 | done | Git/target hash 双快照稳定；见本文件第 2 节 |
| 2026-09-16 | BASE-002 | done | allowlist、非范围、停止条件与命令已冻结 |
| 2026-09-16 | SEC-RT-001 Red | done | `pnpm ... test` exit 1：`host-util.js` 尚未导出 `fetchShopifyAdmin`，证明旧实现缺少安全边界 |
| 2026-09-16 | SEC-RT-001 Green | done | 17/17 tests；typecheck exit 0；target diff-check exit 0 |

### 最终代码 hash

| 文件 | SHA-256 |
| --- | --- |
| `lib/host-util.js` | `c749b9320f60b35645030b186b3ca8c98f6414fde21e5bf0d9194cecdf546533` |
| `lib/index.js` | `d55163d169dcdad7b18ceb61e79c6a6e4054bf8b0816a342060d822df5a5f308` |
| `test/wanzh-hulian.spec.mjs` | `2b02e7a9f620465839bbea7bac9776cf9358323e6d299c0e04e819d8f7f03bc1` |

### 验证裁决

- E1：已建立。合法/非法 host、safe fetch、path origin、redirect 拒绝、secret canary、token strategy 共 17 tests 全绿。
- E2：已建立。目标 package typecheck 全绿。
- Target diff hygiene：已建立。`git diff --check -- packages/capabilities/dsh-wanzh-hulian` 退出 0。
- E3：未建立。全仓 `git diff --check` 仍由本批外并发候选打红；根 gate 输入也在并发变化，不把它归因成本任务结果。
- E4–E10：未执行；无 live profile、真实 Shopify、clean-machine、CI、DMG、Release、canary 或 production 结论。
- LoopX：project-local registry/status contract 为 7 checks、0 errors；三个 agent todos 已完成并留下一个 Batch 002 user gate。全仓 `loopx check --scan-root` 仍被 vendor/staging/generated/历史文档中的 142 个 public-boundary scanner finding 打红，属于需单独治理的存量结果，不伪装为本批 green。

本批没有运行根 `gate`：当前 gate/fixture 文件本身处于并发 dirty 状态，且计划已识别其 mutation 隔离尚未完成；目标 package 的 E1/E2 不依赖该不稳定仪器。

最终工作树为 26 个 tracked 修改、62 个 untracked files、0 staged；相对批次开始的净增量正好是本批 3 个代码文件和 5 个新 plan/task 文档。全仓 `git diff --check` 的唯一输出是本批外 `dsh-overseas-skills/test/host-routes.spec.mjs:279` 的 EOF 空行；目标 package 自身的 diff-check 为 0。

## 6. 批次关闭规则

`SEC-RT-001` 已达到 local implementation complete / live deferred，本批在此关闭。未自动开始 `SEC-RT-003A`、`QG-001` 或上游 canary，也不把本地 E1/E2 写成产品连接已验收。
