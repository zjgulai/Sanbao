# 能力装配契约（首例：Jev 判断层）交接

- 日期：2026-09-27
- 状态：装配契约、壳侧机制与首例（Jev 判断层）的历史 Host 启动层证据已完成；真实会话工具调用仍未取证，且按 ADR-0165 继续标记 `mounted / runtime-observed / compatibility-unproven`，不能表述为产品已授权或当前可用
- ADR：[ADR-0162](../../../adr/ADR-0162.md)
- Compatibility Authority：[ADR-0165](../../../adr/ADR-0165.md) 与[架构记录](2026-09-28-compatibility-authority.md)
- Capability Registry 治理：[ADR-0171](../../../adr/ADR-0171.md) 与[架构记录](2026-09-29-capability-registry-governance.md)；历史装配证据不产生 Registry `approved`
- 交接件（JEV 侧盘点与六处相容面）：[research/19 · JEV × DSH 兼容性插件交接](../../../research/19-jev-dsh-compat-handoff.md)
- 外部依据：JEV 仓的宿主装配指南与"重装 mcp-jev"校准记录（JEV `docs/deployment/mcp-integration.md`、其迁移工作区 `tickets/005`；跨仓引用不复写）

## Problem

Sage 设计树已定「Jev 等内容增长能力以模块接入」（[ADR-0159](../../../adr/ADR-0159.md) 的 Note），但壳**没有装配契约**：外部能力以什么形态、经哪个面、按什么 pin 与隔离纪律挂进来，没有一处写死。JEV 侧判断层（真实材料闭环已跑通：判定 6/6、深挖 draft、引文全定位）是第一个真实案例，继续拖延意味着每次接线都靠记忆——而记忆已经失败过一次：2026-09-19 legacy 曾端到端挂过 `mcp-jev`，后在 profile 改写中静默丢失（[HANDOFF-CODEX](../../../../.scratch/review/2026-09-22-arch-health-top20/HANDOFF-CODEX.md) 记录在案），当时没有任何门禁或契约能拦住"接线消失"。

只读核对给出的事实（2026-09-27）：壳已有三层装配点（seed → 物化 → 启动合成，`src/host/composition.ts`：bundle 层 → profile 用户补丁层 → 壳 overlay）；**最初以为"物化 profile 自带用户补丁"是实例本地面——执行时被实测推翻**：profile 的 `cordis.patch.yml` 是 `seed/cordis.patch.yml` 的复制件，且被代收据**逐文件哈希封印**（改一字节即 `assertOwnedFilesMatch` fail-closed），壳**没有实例本地装配入口**；`sage-shell-pin` 要求 `@deepseek-ai/*` 依赖精确版本、两侧同名同版；`@deepseek-ai/dsh-mcp-client@0.1.5-rc.2` 在 npm 可装，壳此前无任何 mcp 条目。

## Decision

用户确认 [ADR-0162](../../../adr/ADR-0162.md)：**外部能力以 MCP client 条目挂入壳装配面（首例 Jev 判断层）**，五条纪律同时生效——① 每个消费面依赖精确版本、两侧同名同版（`sage-shell-pin` 守；runtime-only 可 seed-only，见 ADR-0165 对 D2 的校准）；② **机器相关条目只写进壳的实例本地补丁层 `<Sage root>/cordis.local.patch.yml`**（`composeShellPatches` 可选 `localPatchPath`，存在才合并、最后合并；仓库保持机器无关）；③ 条目必带 `insert:`、凭证 spawn 时来源、node 绝对路径、宿主重启生效；④ 外部能力状态显式指向 Sage 实例数据根，不碰旧 DSH 数据面；⑤ 以端到端只读调用取证、失败 fail-closed。

### 首例（Jev）的装配清单（已执行，2026-09-27；证据见 §实施与证据）

1. **仓库侧（已完成）**：`seed/package.json` 的 dependencies 加 runtime-only 的 `"@deepseek-ai/dsh-mcp-client": "0.1.5-rc.2"`（`seed/pnpm-lock.yaml` +3 行、解析全落 rc.2 同线）；按 ADR-0165 校准后的 D2，**壳 devDeps 侧刻意不加**——实测加了会把 `dsh-agent/session/subprocess/…@rc.3` 传递子树拖进开发锁（+955 行），正是红线 1 要防的版本混装；`pnpm run gate` 23/23。
2. **实例侧（已完成，不进仓库）**：本机 `<Sage root>/cordis.local.patch.yml`（0600）落 `mcp-jev` 条目，形状如下（机器值按本机展开，仓库与本文都不写死）：

   ```yaml
   - insert:
       - id: mcp-jev
         name: "@deepseek-ai/dsh-mcp-client"
         config:
           serverName: jev
           transport: stdio
           command: /bin/zsh
           args:
             - "-c"
             - "source <凭据落点> && exec <绝对 node 路径> <JEV 仓>/src/mcp/main.ts"
           env:
             JEV_STATE_DIR: "<Sage 数据根>/jev-state"
   ```

   （`insert:` 包装、spawn 时 source 凭据、node 绝对路径三条来自 JEV 侧校准记录，各对应一次真实踩坑；`env` 一行做隔离——JEV 缺省状态目录是与旧 DSH 共存的 `~/.local/state/jev-dsh`。`dsh-mcp-client` 的类型定义证实宿主会**清洗子进程环境**且 `env` 是"缀在清洗后环境之上"的合并入口，故 spawn 时 source 是必需而非偏好。）
3. **物化与重启**：**改条目不需要重物化**——本地层在宿主启动时读取；只有宿主运行时（`lib/`）变更才需要 `materialize` 出新代。本次因加了壳侧机制，重建过一代；重启（或冒烟式重新拉起宿主）后条目生效。
4. **验证链**：① 宿主进程里出现 JEV 服务器进程 ✓（实测活体 pid）；② 宿主 stderr 无 `mcp-client(jev)` 告警、且打出 JEV 的启动行 ✓；③ egress 请求行——**待真实判读调用后才会有**（`list_judgments` 是本机注册表列举，不出境）；④ 真实会话里的 `mcp__jev__list_judgments` 调用——**未取证**（需要会话/模型侧，冒烟协议覆盖不到）。
5. **回滚**：删除或改名本地层文件 + 重启即回原状（**实测过负控**：停用后宿主照常启动、无 JEV 进程、无输出）；仓库侧依赖可保留（无行为）。

### 装配前的三项核实（已完成）

1. **"用户层补丁的保全"——问题本身被推翻**：不存在"实例本地的用户层"；`cordis.patch.yml` 由 seed 复制、被收据封印。处置：给壳加实例本地补丁层（本次实现，含测试与变异验证），把机器内容与代收据彻底解耦。
2. **凭据通道**：采用 spawn 时 `source` 形态（宿主清洗环境已被类型定义证实）；`env` 仅传非密的状态目录。壳的 credentials 服务面不参与本条目——它服务的是壳内连接，不是外部进程。
3. **壳的可启动性**：已证——`materialize` 成功（代 `bee8a015-…`、505 包 frozen-lock）、无 GUI `smoke` **14/14 通过**（宿主 ready、protocol v3、边界与路径遍历拒绝、干净退出）。

## Alternatives considered

见 [ADR-0162](../../../adr/ADR-0162.md) 的备选方案表：Sage 侧适配包（重治理、无增量收益，留待产品面需要 Jev 状态/设置时）、旧 DSH profile 先装（不建立 Sage 契约，仅可作对照）、条目直接进仓库 overlay（机器路径入仓，违反 ADR-0160）、内建壳内服务（复制 JEV 既有实现并破坏其凭据纪律）。

## Consequences

- 正面：外部能力挂载一次性获得可复制样板（形态/面归属/pin/隔离/证据各有落点）；仓库保持机器无关；装配与回滚都在实例本地完成。
- 代价：装配不是"改仓库即生效"；每台实例各落一份本地补丁，跨机器分发需要另立决策（大概率走向适配包形态）。
- 边界：**已装配到宿主启动层并取证**（进程活体、启动行、负控；见下节）；**未证**真实会话里的工具调用与产品面集成、闭环（digest）工具化；Jev 判断结果未标定（`action` 恒为 `uncalibrated`），产品面不得据此自动执行；`~/.local/state/jev-dsh` 与 `~/.dsh` 均不得成为 Sage 侧数据面。

### Compatibility Authority 边界（2026-09-28）

装配、运行观测、兼容性、产品授权和当前可用性是五个不同结论。`cordis.local.patch.yml`、Host 进程、启动行、MCP tool registration、16 条判断读数和 package version 都只能证明各自局部事实；它们不能生成 `matrixId`、`equivalent` 或产品调用权。Jev 与其他 inherited DSH entries 只有在进入 Sage-owned Capability Registry allowlist、具备稳定 descriptor / artifact / normalized contract digest、被 main-owned runtime inventory 验证、由 Compatibility Authority 唯一精确命中，并经 Application Service、Identity / Policy、BusinessMatter 与 Capability Adapter 重验后，才可能用于某个 revision 的真实 action。

因此本记录中的“已完成”只指历史装配机制和当时列出的 Host 启动层证据，不表示当前 live、inventory-verified、compatible、product-authorized 或 runtime-verified。真实 OIDC 等待期间可以开发 Jev descriptor、attestation 与 blocked UI projection，但不得借“只读工具”绕过 compatibility 或数据出境边界。

未来产品投影必须使用正交状态轴，禁止把近义状态压成一个“已接入”：`mountState`（`unmounted | configured | mounted`）、`observationState`（`absent | historical | current`）、`inventoryState`（`unknown | verified`）、`compatibilityOutcome`（`unknown | equivalent | requires-new-revision`）、`authorizationState`（`unauthorized | authorized`）与 `availabilityState`（`unavailable | degraded | available`）。历史或当前 observation 都要携带 `observedAt`；当前 observation 还必须绑定 `bootId`、`runtimeGeneration` 与 freshness。任一状态轴通过都不能自动抬升其他轴。

## 实施与证据（2026-09-27）

**壳侧（仓库内）**
- 实现：`composeShellPatches` 增可选 `localPatchPath`（存在才 merge、**最后 merge**）；宿主入口 `startHostProcess` 从 `<Sage root>/cordis.local.patch.yml` 解析并传入；文件名常量 `LOCAL_PATCH_FILE` 在 `src/profile/paths.ts`。
- 测试：新增 2 条（合并在最后 / 缺失零行为），先红后绿；**变异验证**——去掉新分支 → 仅新测试判红（1 failed / 160 passed），恢复后全量 **17 文件 / 161 测试通过**；`typecheck`/`build` 绿；`pnpm run gate` **23/23**。
- 附带修正（写进本文以防复发）：测试观测仪必须用 `inspectEntries` 后的条目——`insert:` 里的 id 不在补丁行顶层；第一版测试因观测仪错误而假红（不是实现错）。

**仓库侧（依赖）**：`seed/package.json` +1、`seed/pnpm-lock.yaml` +3（全 rc.2 同线）；壳 devDeps 侧刻意不加（实测会拖入 rc.3 传递子树 +955 行）。

**实例侧与运行证据**
- 本机 `<Sage root>/cordis.local.patch.yml`（0600）落 `mcp-jev` 条目。
- `materialize`：代 `bee8a015-01d7-4d56-b6cf-f02cbd7d5300`（505 包、frozen-lock）。
- 无 GUI `smoke`：**14/14 通过**（宿主 ready / protocol v3 / `/.sage/*` 边界 / 路径遍历拒绝 / 干净退出）。
- 探针实测（一次性脚本，复用 smoke 的启动机制；不进仓库）：宿主启动后 **JEV 服务器进程活体**（`/opt/homebrew/bin/node …/JEV/src/mcp/main.ts`），宿主 stderr 打出 `jev-judgments: 16 judgments from …; state in <Sage root>/jev-state`，无任何 mcp 告警——即"spawn → 凭据 → 服务器起来 → 状态隔离"整条都成立。
- **负控**：停用本地层（改名）→ 宿主照常启动、无 JEV 进程、stderr 无输出；恢复后复现。
- **仍未取证**：真实会话里 `mcp__jev__list_judgments` 调用（需会话/模型侧，冒烟协议覆盖不到）与随之才会出现的 egress 请求行。
