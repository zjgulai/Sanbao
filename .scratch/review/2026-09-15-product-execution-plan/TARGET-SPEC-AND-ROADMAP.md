# LUTE × DSH 目标 Spec 与阶段路线图

- 文档类型：整合目标 / 产品 Spec / 执行控制面
- 决策日期：2026-09-16
- 当前状态：`active-plan / batch-001-local-complete / next-batch-gated`
- 本地锚点：`main@af5f2ede6092a38fcb7d119571667771004bf416`
- 基座锚点：DSH Desktop `v2.0.5@423406fe` + Harness `dsh-v0.1.2-rc.1@a66e4702`
- 适用范围：本仓库的产品化、基座跟进、安全、质量、UX、DMG 与发布治理

## 0. 本文件的权威边界

本文件把整轮审查、Qodo 增量复核、本地架构/代码/发布链复核和上游 DSH 对比整合成一个执行入口。具体任务细节仍由工作流文件和任务卡承载；若表述冲突，按以下顺序解释：

1. 已被代码与可重复命令证明的当前事实；
2. 本文件的目标、阶段边界和 Go/No-Go；
3. [Master TODO](MASTER-TODO.md) 的任务依赖；
4. 各 [workstreams](workstreams/) 与 [tasks](tasks/) 的实现细则；
5. 早期评审结论与工具 finding。

Qodo/AI reviewer 的结果是 E0 线索，不自动成为事实。Codex Advisor 本轮父运行时不可用，没有生成可归因的 Advisor 结论。Understand 已在用户明确确认 `.ua/.understandignore` 后完成全量扫描；图谱事实、dirty-worktree 限制、1,334 个 orphan warnings 与 fingerprints 证据见 [Understand 图谱证据](UNDERSTAND-GRAPH-EVIDENCE.md)，它们只作为计划差异输入，不覆盖代码、门禁、live 或发布证据。

## 1. 当前真实形态

### 1.1 四个必须分离的事实面

| 事实面 | 当前结论 | 可证明什么 | 不能推导什么 |
| --- | --- | --- | --- |
| 已发布基线 | `v2.4.1`，25 个受管单元 | 已归档版本的 source/manifest/DMG 证据 | 当前 dirty 候选已发布 |
| 当前 HEAD | `main@af5f2ed`，相对两个远端均超前 3 个提交 | 本地已提交架构和 25 单元基线 | 远端、CI 或客户机已接收 |
| Dirty candidate | 23 个 tracked 修改、57 个 untracked 文件、0 staged；含未跟踪 Settings Shell | 当前有人正在形成的候选工作 | 可复现、可提交、可出货或归属本批 |
| Planning / execution | 本 review 目录与后续 LoopX goal | 已形成方案、批次与证据入口 | 代码完成、live 生效、DMG 或生产接受 |

上述数字是 2026-09-16 本文件落盘前快照，任何批次开始前必须重新采集。

### 1.2 产品不是“插件集合”，而是六段式系统

```text
可信输入与基座
  → profile / bundles / cordis.patch 装配
    → Host 能力与安全边界
      → Client 发现、配置、执行和恢复
        → 本地状态、审计与隐私边界
          → clean build / DMG / Release / update / canary
```

五组 package 目录表达治理归属，不表达严格运行分层；同一包可能同时提供 host service、client slot、tool 和持久化。系统级验收必须沿真实用户旅程和数据流横切这些目录。

### 1.3 当前最重要的状态漂移

- 根 README 的版本、架构文档包数和 packaging README 的发布口径落后于 `v2.4.1` 与 25 单元事实。
- Dirty Settings Shell 令候选 catalog 变为 26 单元，但整包尚未跟踪；本机存在 build output/live mount 不等于 clean checkout 可重建。
- Fullstack 同时存在发布基线 30、HEAD 70、dirty catalog 138、live whitelist 89 四种不同集合；它们不能合并为一个“技能数”。
- Team Hub 文档与默认 Desktop patch 行为不一致；其 LAN/正式多用户产品边界尚未决策。
- Skill Center telemetry 的 README、helper 与实际调用链不一致；在网络行为验证前不能声称启用或禁用。

## 2. 完整目标

### 2.1 北极星目标

把 LUTE 建成一个“可解释、可装配、可验证、可升级、可回滚”的 DSH 二开产品平台：用户能够从可信 DMG 完成安装和首个有效任务；维护者能够从唯一事实源复现每个能力、基座、配置与发布字节；任何安全、兼容或质量缺口在进入客户面之前以 fail-closed 方式被阻断。

### 2.2 三条产品旅程

1. **找到并启动工作方式**：用户能理解 Products / Systems / Roles / Skills 的关系，并从推荐入口启动目标任务。
2. **配置到真正可用**：系统把 `Declared → Installed → Loaded → Configured → Connected → Outcome-verified` 分层显示，提供可执行修复而非要求用户猜测重启语义。
3. **执行后看见结果并恢复失败**：Run Center / Task Board / Health Center 对任务、错误、重试、成本、权限和数据边界提供一致反馈。

### 2.3 六个结果域

| 结果域 | 目标状态 | 核心证明 |
| --- | --- | --- |
| Security | 凭证、路径、网络、子进程与第三方执行物默认拒绝未验证输入 | 负例下 I/O=0、根外字节不变、secret canary 不泄漏 |
| Runtime compatibility | 本地扩展只依赖明确、被测试的 DSH 契约 | 配对基座矩阵、契约编译、event/RPC/profile/live 验收 |
| Product UX | 首启、配置、发现、执行、恢复形成连续旅程 | clean-machine 任务、a11y、错误恢复和 matched evaluation |
| Quality control | gate 报告真实射程和三态，没有假绿 | expected/checked/skipped/failed、mutation、并发无副作用 |
| Distribution | DMG 可重建、签名、公证、验证、升级与回滚 | exact bytes、fresh/N-1/rollback、Gatekeeper、五方闭环 |
| Governance | 一份事实一个家，发布/能力/隐私状态可追溯 | manifest/catalog 生成、ADR/Note、CI/ruleset、canary owner |

## 3. 基座策略摘要

详细差异、阻断点和迁移验证见 [上游基座兼容与迁移方案](UPSTREAM-BASELINE-AND-MIGRATION.md)。本阶段采用“三车道”策略：

### Stable 车道

- 继续以 `Desktop v2.0.5 + Harness v0.1.2-rc.1` 为当前发布兼容基线。
- 不修改 pinned vendor，不把新上游行为偷偷混入 stable。
- 先完成与版本无关的安全、门禁真实性、可重建和 DMG 证据修复。

### Canary 车道

- 观察窗满足后，以**成对组合** `Desktop v2.0.10 + Harness v0.1.5-rc.2` 建隔离 canary；不允许只升级 Harness 或只升级 Desktop。
- 在独立临时 clone/profile 重放 patches、编译所有 25 个受管单元、跑 package/gate/live/DMG 矩阵。
- canary 证据不写成 stable 已接受，迁移必须由单独 ADR 与 pin-only 提交完成。

### Research 车道

- `dsh-v0.1.6-alpha.1` 仅用于兼容研究，当前不进入 DMG 或 stable/canary 发布。
- 重点建立 `agent/created`、PTC 重命名、异步 Session、MCP v2、Node PTC 空环境、可取消 Sandbox/Shell、配置热更新和官方 Desktop 架构的适配清单。

## 4. 架构原则与兼容边界

### 4.1 不变量

- 上游只 pin 不改；本地行为通过 package、profile、patch ledger 和受控装配表达。
- shell 与 Harness 必须按上游已验证组合成对移动。
- 任何上游升级先重建契约矩阵，再重放 patch；禁止以“能启动”替代真实工具、事件、UI、持久化和 DMG 验收。
- 本机 live profile 只是一种运行证据，不是发布源；外部产品仍不得进入 shipped preset。
- 运行时能力与 UI 必须能降级或 fail-closed；未知 host service、RPC、route、slot、event 不得静默假成功。

### 4.2 兼容性 seams

必须为以下变更面建立自动契约：

- agent lifecycle events 与 payload；
- Session 同步/异步 reader 和持久化；
- `code-runtime`/`ptc-runtime`、worker、workflow executor 与环境注入；
- `ctx.get(...)` / `connection.api...` 双通道可选服务；
- client slots、DOM/CSS fallback、theme tokens 与 settings ownership；
- Team Hub internal RPC/events、HTTP/WS route allowlist；
- profile resolution、bundle、loader、`file:` 链接与 packaged filesystem；
- Electron fuses、ASAR/no-ASAR、runtime closure、TCC identity、签名与更新。

## 5. 阶段性执行计划

### Phase 0 · 事实、权限与批次控制

目标：任何写入前能回答“谁的文件、什么版本、允许改什么、如何判定完成”。

- `BASE-001`：记录 branch/HEAD/remotes/tags/dirty、目标 hash/mtime、并发写入边界。
- `BASE-002`：记录 task IDs、allowlist、非范围、命令、停止条件和外部权限。
- 建立独立 LoopX goal；旧 `magpie-horch-goal` 只属于插件绑定验证，不复用。
- 退出条件：未授权路径无新增变化；本批写入可逐项映射到 task。

### Phase 1 · 小半径安全止血

目标：先关闭能直接导致凭证外传、路径越界或任意外部执行的缺陷。

- 首批：`SEC-RT-001` Shopify host 规范化、保存时校验、每次 I/O 前复核、非法输入 fetch=0。
- 后续：`SEC-RT-003A` 路径 containment/全批事务；`SEC-RT-003` 子进程 env allowlist；`SEC-RT-002` 第三方供应链。
- Team Hub 只有在 `DEC-003` 后进入 `SEC-RT-004/008/009`。
- 退出条件：安全负例证明 fail-closed，且不存在凭证/真实 HOME/live 环境参与测试。

### Phase 2 · Gate 真实性与可复现输入

目标：工具的绿色意味着射程完整、判据经过负控、运行无副作用。

- `QG-001..005` 修复三态、射程、入口、profile 与 changed-packages。
- `QG-010..012` 闭合 Fullstack 138/89、third-party accounting、Settings AX 独立校准。
- 将 `QG-006` 拆成：
  - `QG-006A`：所有 mutation fixture 使用临时根、注入依赖、恢复钩子；
  - `QG-006B`：聚合并发、SIGTERM、失败路径和工作树逐字节无副作用证明。
- `REL-001..003` 将 clean source、payload attestation 和版本不可重制变为硬门禁。
- 退出条件：`gate`/`gate:full` 分母可审计；clean checkout 可重建正式输入。

### Phase 3 · 上游 Canary 实验室

目标：把上游跟进从一次“大升级”变为可重复的差异实验。

- 观察窗到期后锁定 `v2.0.10 + v0.1.5-rc.2` 的确切 commit、tarball、lockfile 和许可证。
- 生成 patch rebase ledger：clean apply / semantic conflict / obsolete / upstreamed / redesign。
- 编译并测试 25 单元；重点覆盖 browser、LoopX、Teams、Settings、Skill registry、profile 和 Team Hub。
- 借鉴新 shell 的 packaged filesystem/runtime/bundled-skill smoke、runtime closure 与 Electron fuse 验证，但先在本仓库门禁落地，不直接复制未知假设。
- 退出条件：canary E1–E6 证据完整；任何 P0 不兼容都回到适配 task，不改 stable pin。

### Phase 4 · 成对基座迁移候选

目标：只有在兼容矩阵全绿后，才形成可审查的 paired pin migration。

- 行为适配与 pin 更新分开提交；先完成适配层，再做只改 pin/manifest 的机械提交。
- stable 与 canary profile、数据目录、feed、版本号和 DMG 不能互相覆盖。
- 至少验证 fresh install、N-1 upgrade、same-version reinstall、failure rollback 和用户数据保留。
- 退出条件：单独 ADR 接受迁移；旧稳定版仍可安装/回滚；无隐式网络补依赖。

### Phase 5 · 产品旅程、隐私与运维闭环

目标：把能力广度转成用户能够理解并完成任务的产品。

- 决策产品楔子、主要用户和三条北极星任务。
- 建能力成熟度账本与 Health Center；统一 reload/retry/restart guidance。
- 收口 Settings CSS ownership、New App 双区刷新、Team Hub Admin 错误恢复、跨包 a11y。
- My Quotes 在 opt-in 前不扫描、不索引、不启 timer；明确删除、保留、模型传输与 provider/payload 预览。
- Telemetry 在文档、调用点、网络行为和用户选择四者闭合前默认关闭。
- 退出条件：新用户不打开终端完成第一条业务任务；三条核心任务有成对效果评估。

### Phase 6 · 可公开分发

目标：客户下载到的字节就是被测试、签名、公证并可回滚的字节。

```text
clean source
  → frozen payload + attestation
    → version occupancy
      → Developer ID + hardened runtime + notary + staple
        → exact final DMG fresh/N-1/rollback
          → tag/manifest/SHA/attestation/Release 五方闭环
            → dual remote + signed feed
              → public clean-machine + canary
```

- 当前 self-signed `LUTE Code Signing` 只能支持内部可信分发，不满足公开 Gatekeeper 目标。
- 不允许重制已发布版本；Release 附件、manifest、tag commit 与测试 attestation 必须同字节。
- 退出条件：E6–E10 各自有独立 owner 和证据，不能用本地 gate 推导生产接受。

## 6. Batch 001 契约与结果

详细任务卡见 [BATCH-001](batches/BATCH-001-boundary-and-shopify.md) 与 [SEC-RT-001](tasks/SEC-RT-001-shopify-host-validation.md)。本批已完成本地 E1/E2 并关闭，以下 allowlist 保留为审计记录，不继续授权写入。

### 允许写入

- 本 review 目录下的计划、任务卡与执行证据；
- LoopX CLI 为新 goal 管理的 `.loopx/registry.json` 与 `.codex/goals/magpie-horch-product-hardening*`；
- `packages/capabilities/dsh-wanzh-hulian/lib/host-util.js`；
- `packages/capabilities/dsh-wanzh-hulian/lib/index.js`；
- `packages/capabilities/dsh-wanzh-hulian/test/wanzh-hulian.spec.mjs`。

### 明确不允许

- 不修改 vendor pin、patches、profile、真实 HOME、DMG、Release、远端 CI/ruleset；
- 不运行真实 Shopify 凭证/店铺；
- 不 commit、push、tag、签名、公证或发布；
- 不接管或格式化 Settings、Fullstack、gate、ADR 等并发候选；
- 不自动进入 Batch 002。

### 停止条件

- 三个代码目标文件任一在写前出现非本批 hash 变化；
- 规范化规则需要支持 `.myshopify.com` 之外的 host；
- 测试必须访问真实网络/凭证才能成立；
- 包级验证暴露与本修改无关且无法隔离的冲突。

## 7. 证据与完成定义

沿用 [EVIDENCE-MATRIX](EVIDENCE-MATRIX.md) 的 E0–E10。当前批次最多建立：

- E0：官方约束 + 可达调用路径；
- E1：Red/Green、非法输入矩阵、fetch=0；
- E2：目标 package test/typecheck；
- E3：仅在当前工作树仓库 gate 可归因时成立。

本批不声称 E4 profile、E5 live、E6 clean-machine、E7 CI/remote、E8 release、E9 canary 或 E10 production。

整体完成必须同时满足：安全 fail-closed、配对基座可迁移、gate 真实、clean source 可重建、产品旅程闭环、公开 DMG 字节链闭合、canary 与生产接受独立留证。

## 8. 风险登记与预案

| 风险 | 早期信号 | 处理方式 |
| --- | --- | --- |
| 并发脏树覆盖 | target hash/mtime 变化 | 立即停写，只汇报冲突；不 reset/checkout |
| 基座错配 | shell 与 runtime tag 不同配对 | 阻断 pin；回到 paired canary |
| API 静默漂移 | 编译绿但 event/tool 不触发 | contract + live 正负控，禁止只靠启动 smoke |
| 旧 profile 污染 | clean checkout 与 live 结果不同 | 临时 HOME/profile、manifest completeness |
| no-ASAR 改变 patch 假设 | `app.asar.unpacked` 路径消失 | 独立设计 patch delivery；验证 packaged bytes/loadpoint |
| macOS 身份变化 | TCC/Keychain/权限丢失 | 固定 bundle ID/signing identity，fresh/N-1/rollback 矩阵 |
| 文档成为第二事实源 | 包数/版本/能力状态漂移 | 从 manifest/catalog 生成，链接而非复制 |
| 测试仪器假绿 | mutation 不打红、checked=0 | 独立校准锚、expected denominator、negative control |
| 隐私声明与网络不符 | helper 有代码但调用链不明 | 默认关闭，网络捕获与用户选择一致后再启用 |

## 9. 决策门

以下决策未获明确答复前，对应阶段保持 blocked，但不阻塞独立安全修复：

- `DEC-001/002`：公开发行目标、主要用户与三条核心任务；
- `DEC-003`：Team Hub loopback / trusted LAN / formal multi-user；
- `DEC-004/011`：telemetry 与 My Quotes 数据政策；
- `DEC-005`：Developer ID / notarization 窗口；
- `DEC-007`：GitHub 与 Codeup 的发布权威关系；
- `DEC-009/010`：第三方代码准入与 artifact 唯一权威源；
- `UP-DEC-001`：观察窗到期后是否授权 paired canary；
- `UP-DEC-002`：是否进入 `0.1.6-alpha` 的适配研究实现（默认否）。

## 10. 下一步顺序

1. `BASE-001`、`BASE-002`、`SEC-RT-001` 已完成本地 Red/Green/E2 并按批次规则停止。
2. 用户选择下一批后，再从 `SEC-RT-003A` 或 `QG-001 + QG-002` 中选一个，不并行改相同门禁/脚本。
3. 上游观察窗到期时只重跑调查与 canary 决策，不自动更新 pin。
4. Understand 全量图谱已完成；后续只在 HEAD/工作树变化后走 fingerprint 驱动的增量更新，并继续把图谱作为导航与差异输入，而不是代码、门禁、live、clean-machine 或发布验收。
