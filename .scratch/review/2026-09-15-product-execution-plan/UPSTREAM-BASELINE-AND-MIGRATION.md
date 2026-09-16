# DeepSeek Harness 基座差异、适配优先级与迁移 Spec

- 调查快照：2026-09-16
- 本地稳定组合：Desktop `v2.0.5@423406fe` + Harness `dsh-v0.1.2-rc.1@a66e470204`
- 推荐候选组合：Desktop `v2.0.10@697e7d7` + Harness `dsh-v0.1.5-rc.2@fb2c4b9`
- 研究基线：Harness `dsh-v0.1.6-alpha.1@0a15e36`
- 上游 master 快照：`0d1f50007f...`；仅作漂移观察，不作 pin

## 1. 结论先行

最匹配 LUTE 的更新不是直接追 `master`，也不是把 Harness 单独抬到 `0.1.6-alpha.1`。正确拆分是：

1. **现在移植验证机制，不改基座 pin**：packaged filesystem/runtime/bundled-skill smoke、runtime closure、Electron fuse、clean source 与最终 DMG 字节绑定，这些能直接关闭当前发布风险，且不要求采用新 API。
2. **观察窗到期后做成对 canary**：只评估 `Desktop v2.0.10 + Harness v0.1.5-rc.2`；这是上游 Desktop release 明确配对的组合，适合作为当前 `v2.0.5 + v0.1.2-rc.1` 的下一稳定候选。
3. **`0.1.6-alpha.1` 仅做兼容研究**：其 Desktop 归仓、PTC vocabulary、agent lifecycle、Session、MCP v2 和 sandbox/executor 改动跨越 LUTE 多个 seams，尚不适合进入 DMG。
4. **绝不混搭 shell/runtime**：LUTE 的 patch、loader、profile、离线 runtime、`file:` tarball 和 DMG 都依赖配对行为；“只换一个 commit”会制造无法归因的中间态。

该结论符合本仓库 ADR-0006 的两周观察窗、ADR-0008 的基座只 pin 不改，以及 DMG SOP 的 clean source / exact artifact 原则。

## 2. 权威来源与版本状态

| 版本 | 发布状态 | 日期 | 本地适配角色 | 决策 |
| --- | --- | --- | --- | --- |
| Harness `0.1.2-rc.1` | prerelease | 2026-09-03 | 当前稳定兼容锚 | 保持 stable |
| Harness `0.1.5-rc.2` | prerelease | 2026-09-10 | 上游 Desktop v2.0.10 配对 runtime | 观察窗后 canary |
| Harness `0.1.6-alpha.1` | prerelease | 2026-09-15 | 大范围下一代契约研究 | research-only |
| Harness `master@0d1f500...` | 移动分支 | 2026-09-16 快照 | 漂移雷达 | 禁止 pin |
| Desktop `v2.0.5` | release | 当前本地 fork 基点 | 现行 shell/patch 假设 | 保持 stable |
| Desktop `v2.0.10` | latest release | 2026-09-13 | 配对 `0.1.5-rc.2`，含 packaging hardening | canary 候选 |

官方证据：

- [DeepSeek Harness 0.1.5-rc.2](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.5-rc.2)
- [DeepSeek Harness 0.1.6-alpha.1](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.6-alpha.1)
- [anywhere-labs Desktop v2.0.10](https://github.com/anywhere-labs/dsh-desktop/releases/tag/v2.0.10)

## 3. 为什么不能直接升级

### 3.1 本地耦合不是一个版本号

当前仓库至少存在以下直接耦合：

- `vendor/dsh-desktop.pin` 同时固定 shell upstream、LUTE fork、Harness commit 与 runtime version；当前 runtime manifest 是 242 个带 SHA-256 的 tgz 闭包；
- 多个 package lockfile 仍引用 `dsh-code-runtime` 的 `0.1.0/0.1.1/0.1.2` RC 族；
- `dsh-agent-team-gui-local` 直接引用 vendored `0.1.2-rc.1` tarball；
- `dsh-browser-local` 源码直接监听 `agent/session-start`；
- LoopX bundle 同时兼容 `agent/created` 与 `agent/session-start`，说明生命周期 seam 已经漂移；
- Team Hub 依赖 internal RPC/events，不属于稳定公共 HTTP API；
- official Session API/format 与 My Quotes、preset refs 等磁盘旁路 reader 共同组成迁移面，不能只单向升级 writer；
- profile、loader、hardlink、38 个 patch marker/行为锚和 packaged `app.asar.unpacked` 路径共同组成实际运行契约。

因此单独改 `dsh_runtime_commit` 会产生：依赖包版本不一致、事件不触发、tarball 仍指旧 runtime、patch 锚不成立、live profile 与 DMG 字节分叉等复合失败。

### 3.2 版本成熟度不满足 stable

`0.1.5-rc.2` 在调查日仅发布 6 天，`0.1.6-alpha.1` 仅 1 天，均未满足本仓库默认两周观察窗；alpha 又明确含 breaking changes。除非出现安全/数据损坏/无法构建等红线，没有理由绕过观察窗。

## 4. 上游差异与 LUTE 影响矩阵

### 4.1 Harness 0.1.2 → 0.1.5-rc.2

这是**配对 canary 的目标跨度**。对官方 tag 做 repository-level `--no-renames --shortstat` 得到 7,666 files、251,046 insertions、100,974 deletions；该数字包含文档/归档/生成物，不能当作 runtime API 变更数，但足以说明这不是可凭 semver 名称直接接受的小补丁。差异跨越 runtime、client、notes、packaging 与 session seams。

| 变化面 | LUTE 受影响组件 | 主要风险 | 必须验证 |
| --- | --- | --- | --- |
| Runtime package graph | 所有含 DSH deps 的 package、vendored tarballs | 多 RC 版本共存、peer resolution 漂移 | lock/tarball 全等、25 单元编译 |
| Agent/session lifecycle | browser、LoopX、auto-compact、teams | listener 不再触发或触发顺序变化 | lifecycle contract + live session |
| Profile/loader | 全部 local package、external profile mounts | live 可跑但 packaged 不可跑 | clean profile、loadpoint、reload/restart |
| Web/client shell | Settings、New App、Role Matrix、Skill Center、theme/brand | slot/DOM/CSS fallback 失效 | visual/a11y/slot/negative modal |
| Desktop packaging | patch replay、offline runtime、DMG | 机器状态影响产物 | packaged filesystem/runtime smoke |
| Internal RPC/events | Team Hub | 登录后部分功能失效或权限旁路 | admin/member/unknown route E2+E5 |

上游 `v2.0.10` release 明确配对 Harness `0.1.5-rc.2`，同时增加 packaged filesystem/runtime/bundled-skill 检查、运行时闭包验证，并改变 ASAR 策略。这些验证思想高度匹配 LUTE 当前风险，但实现需要按本地离线 installer 与 patch 模型重构。

### 4.2 Harness 0.1.6-alpha.1 的阻断性变化

`0.1.5-rc.2 → 0.1.6-alpha.1` 的同口径 repo diff 为 4,015 files、803,138 insertions、66,043 deletions，同样包含非运行时代码；迁移判断以下述明确契约变化而非总行数为准。

| 上游变化 | LUTE 现状 | 不兼容方式 | 适配任务 |
| --- | --- | --- | --- |
| `agent/session-start` 被 async serial `agent/created` 取代 | Browser 源码直接订阅旧事件；LoopX 双订阅 | browser context 可能永不激活、重复激活或时序改变 | `UP-API-001` lifecycle adapter + exactly-once test |
| PTC packages/services 统一为 `ptc-runtime`，无 legacy aliases | 多 lockfile 与代码仍为 `dsh-code-runtime` | install/DI/service lookup/worker 全部可能断裂 | `UP-API-002` dependency and service migration |
| Workflow executor 改为 `workflow-ptc` | 动态 workflow/团队/工具链可能依赖旧 executor | workflow 可构建但运行时找不到 executor | `UP-API-003` workflow contract replay |
| 同步 Session readers deprecated | My Quotes、Task Board、Teams、Research 使用 session data | 阻塞 I/O、API 移除、读一致性变化 | `UP-API-004` async read inventory and adapter |
| Node PTC 独立进程且 `process.env` 为空 | 当前子进程边界尚待 env allowlist | 隐式 PATH/token/config 消失；也提供更安全默认 | 与 `SEC-RT-003` 合并验证，不回退全环境 |
| MCP SDK v2、resources/templates/pagination | Wanzh 与 MCP clients | schema/transport/capability negotiation 漂移 | `UP-API-005` MCP v1/v2 capability tests |
| Config hot reload 无事务 rollback | 多包依赖 profile/config reload | 半应用、旧/新状态混合 | `UP-API-006` generation + rollback facade |
| SandboxProvider/ShellExecutor 可取消异步 API | Browser/Research/LoopX/上传/teams | cancellation 泄漏、旧同步假设失效 | `UP-API-007` abort/dispose contract |
| Browser/Computer Use experimental provider | 本地 browser 能力已有自定义实现 | 能力重叠、权限与 UX 双入口 | `UP-PROD-001` build-vs-adopt decision |
| 官方 Desktop 进入 Harness monorepo | 当前依赖 anywhere-labs shell fork | 双上游、patch 归属、发布链重画 | `UP-ARCH-001` shell ownership ADR |
| Session image cache/telemetry 行为变化 | 隐私策略尚未闭合 | 内容保留/上传/披露改变 | `PRIV-UP-001` data-flow diff + opt-in |

以上全部是 research backlog；除非 `0.1.6` 出现稳定配对 Desktop release、观察窗结束且兼容矩阵通过，不进入 pin migration。

## 5. 最匹配的更新分层

### 5.1 现在可采用：机制，不采用版本

| 机制 | 本地落点 | 为什么优先 |
| --- | --- | --- |
| Packaged filesystem smoke | `REL-002` / DMG staging | 直接发现 `files`、hardlink、loadpoint、ASAR 路径缺失 |
| Packaged runtime smoke | runtime closure + offline launch | 阻止构建机 cache/PATH 掩盖缺依赖 |
| Bundled-skill completeness | profile snapshot + manifest | 阻止 live HOME 与 shipped skills 分叉 |
| Electron fuse verification | `DIST-002` | 将 Electron 安全配置变成机器可读门禁 |
| Deterministic runtime closure | `REL-001/002` | 让 DMG 内容只依赖冻结输入 |
| Data directory transaction/recovery | installer + profile migration | 降低升级/回滚中用户数据损坏 |

采用这些机制前应阅读对应上游脚本，提取契约和负例，再以 LUTE 自有目录、offline app tar 与 SOP 实现；不得复制硬编码路径或假定同一 ASAR 布局。

### 5.2 观察窗后采用：成对版本

推荐 canary 是 `Desktop v2.0.10 + Harness v0.1.5-rc.2`，原因：

- 上游明确声明配对，避免 shell/runtime 组合爆炸；
- 相比 `0.1.6-alpha`，API 跨代风险更低；
- Desktop packaging hardening 与 LUTE 当前 DMG 缺口高度匹配；
- 可以把迁移风险限制在已知的 patch、package、profile、runtime、UI、Team Hub 和 DMG 矩阵中。

### 5.3 暂缓

- `0.1.6-alpha.1` 全量采用；
- official Desktop 与 anywhere-labs shell 的直接切换；
- Browser/Computer Use 双实现合并；
- MCP v2 对外产品承诺；
- master commit、floating tag、branch 或 latest 作为发布 pin。

### 5.4 明确禁止

- 在 `vendor/dsh-desktop` 内直接修上游源代码；
- 把 runtime-only bump 与产品改动放进一个提交；
- 为通过迁移而保留旧/新 service alias 的永久双栈却不设删除期；
- 用 live profile、npm cache、pip cache 或构建机 PATH 补齐 release 缺件；
- 看到 app 启动就宣告兼容；
- 重制既有版本号或覆盖同名 DMG。

## 6. Canary 迁移执行 Spec

### U0 · 再调查与冻结

- 重新查询官方 releases、tags、paired Desktop 说明和 master 漂移。
- 计算观察窗；若不足且无红线，No-Go。
- 冻结 shell commit、Harness commit、runtime tarballs、lockfile、licenses 和 source digest。
- 输出 `UPSTREAM-SNAPSHOT.json`；任何下载都验证 digest。

### U1 · 隔离环境

- 从 clean main 创建**临时 clone**，不用 worktree；profile、HOME、data directory、cache、ports 全部隔离。
- stable app/profile 不停止、不覆写；canary 使用独立 bundle/version/channel 标识。
- 缺证书、账号或磁盘时在首次产物写入前退出。

### U2 · Patch rebase ledger

对每个 patch 标记：

- `clean-apply`：上下文和语义均成立；
- `semantic-conflict`：文本可应用但语义已变；
- `obsolete-upstreamed`：上游已实现，删除本地 patch；
- `obsolete-product`：产品不再需要；
- `redesign`：上游架构变化要求 package/adapter 迁移。

官方 UI rewrite anchor 只能依赖语义 locator，不钉 build hash。每个 patch 都必须有 postcondition test。

### U3 · Dependency closure

- 将所有 DSH package/version/service name 建 inventory，禁止多 RC 混用无说明。
- 更新 vendored tarballs、package manifests、lockfiles 与 peer constraints；断网重建。
- 对 `code-runtime → ptc-runtime` 等改名使用短期 adapter，只在 research lane；设删除条件。

### U4 · Contract tests

至少覆盖：

- agent create/session/end 的顺序、payload、exactly-once；
- Session read/write/reload/large history；
- tools、skills、MCP、subagent、workflow、sandbox、shell cancellation；
- optional host service 双通道探测；
- Team Hub GET/POST/upgrade allowlist；
- client slots、Settings marker、non-Settings modal 负例、theme/brand fallback；
- profile generation、new file、`file:` link、hardlink tmp+mv 同步。

### U5 · Package and repository gates

- 所有 25 单元逐包 test/typecheck/build；没有脚本的包必须登记 typed skip 和 owner。
- `gate`/`gate:full` 报告 expected/checked/skipped/failed；checked=0 不能 pass。
- mutation、失败、SIGTERM、并发前后 clean clone 字节不变。

### U6 · Live canary

- 首启、Provider、Profile、Skills、Browser、Research、LoopX、Teams、Wanzh、Task Board、My Quotes 走正负例。
- 比对 Installed/Loaded/Configured/Connected/Outcome-verified，不允许由 API 200 推导业务成功。
- telemetry 与任何内容出站必须使用测试数据和明确 opt-in。

### U7 · DMG canary

- 继续支持当前 offline installer DMG：外层 DMG → installer → embedded app tar；不可假定直接拖拽 App。
- 验证 no-ASAR/ASAR 策略对 patch delivery、`app.asar.unpacked`、loader 和资源定位的影响。
- 绑定 clean source、frozen profile、runtime closure、package/bundle manifest 与 exact app tar/dmg digest。
- 用 Developer ID/hardened runtime/notary/staple 才能进入公开发行 lane；否则只能内部 canary。
- 在 exact final DMG 上做 fresh、N-1 upgrade、same-version reinstall、failure rollback、data retention、TCC/Keychain。

### U8 · 接受或回退

Go 条件：

- 所有 P0 compatibility contracts、25 单元、gate/full、live、DMG fresh/N-1/rollback 通过；
- 无 secret、网络补依赖、live profile 取件或 build-machine-only 输入；
- patch ledger、ADR、manifest、licenses 和 rollback artifact 完整；
- canary owner 明确接受已知限制。

No-Go 任一条件：

- event/RPC/profile/loadpoint 出现静默失效；
- official Desktop 与 shell ownership 未决；
- no-ASAR 令本地 patch 模型失去可证明 loadpoint；
- Gatekeeper/TCC/数据迁移/rollback 不可重复；
- 需要放松安全门禁或引入永久兼容双栈才能通过。

## 7. DMG 特别风险

### 7.1 ASAR 不是单纯性能开关

当前 LUTE 的 patch 与离线装配依赖具体 packaged path。上游 v2.0.10 的 no-ASAR 策略可能简化文件可见性，但也会让 `app.asar.unpacked` 相关 patch/loadpoint 失效。必须先回答：

- 本地 patch 最终作用于哪一份 bytes；
- loader 在 packaged app 中解析哪个入口；
- runtime/skills/assets 是否会被 `electron-builder files` 漏掉；
- 签名后是否仍修改 bundle 内字节；
- smoke 测的是 staging、app tar，还是 exact final DMG 解包后的 App。

正确顺序是“最终 bytes 就位 → 签名 → 公证/staple → final DMG → 在 final DMG 验收”，不能在签名后继续注入。

### 7.2 macOS identity 与 TCC

- bundle id、签名 identity、Team ID、entitlements 或安装路径变化可能触发新 TCC/Keychain 语义；
- self-signed identity 不等于 Developer ID；本地 `codesign` 成功不等于 Gatekeeper 接受；
- fresh install 与 upgrade 必须分别测 camera/mic/screen/accessibility/browser extension 等实际需要的权限；
- rollback 必须保留用户数据，但不能把新 schema 写到旧版无法读取且无恢复路径。

### 7.3 发布字节闭环

公开候选必须让以下五者全等：

1. Git tag 指向的 source commit；
2. release manifest 的 source/payload digest；
3. exact final DMG digest；
4. `SHA256SUMS`；
5. fresh/N-1/rollback attestation 中记录的 DMG digest。

GitHub Release、Codeup、feed 和实际公网下载再逐字节核对。任何一处变化都产生新版本，不能覆盖旧附件。

## 8. 预判坑与防线

| 坑 | 为什么容易发生 | 防线 |
| --- | --- | --- |
| 文本 patch clean apply 但语义已失效 | 上游函数/slot 仍存在但时序改变 | postcondition + live negative control |
| 旧新 event 双监听导致重复副作用 | 过渡期为兼容同时订阅 | per-agent idempotency / exactly-once assertion |
| package lock 里混入旧 RC | 各 package 独立 lock | generated dependency inventory + version gate |
| empty `process.env` 破坏子进程 | 代码隐式读取 PATH/HOME/token | 明确 allowlist、typed missing-config，不复制全环境 |
| hot reload 半应用 | 上游不保证 transactional rollback | generation/prepare/commit/rollback facade |
| MCP v2 只测 tools | resources/templates/pagination 未覆盖 | capability negotiation matrix |
| Team Hub 200 但业务不可用 | internal RPC 部分漂移 | 每个 admin/member action 的真实结果断言 |
| DOM fallback 悄悄找错节点 | CSS module/class/layout 漂移 | semantic marker + non-target negative tests |
| clean clone 不含 Settings build | `lib` ignored、live 有残留 | clean checkout build and artifact completeness |
| DMG smoke 测错对象 | staging/App 与最终 DMG 不同 | attestation 强制绑定 exact final digest |
| stable/canary 覆盖同一 data/profile | 默认路径和 bundle id 相同 | 独立 channel/profile/data dir + rollback rehearsal |
| official Desktop 重复 shell 能力 | 未来上游所有权变化 | ADR 先选一个 ownership，再迁移 patch |

## 9. 与总路线的映射

| 上游工作 | 总计划任务 |
| --- | --- |
| packaged filesystem/runtime/skill smoke | `REL-001`、`REL-002`、`QG-003` |
| runtime closure / offline rebuild | `SEC-RT-002`、`REL-001` |
| Electron fuse / Developer ID / notary | `DIST-002` |
| final DMG fresh/N-1/rollback | `REL-009`、`DIST-004` |
| lifecycle/PTC/Session/MCP adaptation | `UP-API-001..007`（research/canary） |
| official Desktop ownership | `UP-ARCH-001` |
| release byte closure/feed/canary | `REL-004..008` |
| privacy diff | `PRIV-UP-001`、`PRIV-001..003` |

## 10. 当前验收边界

本文件完成的是 E0 级上游差异、候选选择与迁移 Spec。没有执行 paired canary、没有改 pin、没有重放 patch、没有打 DMG、没有 live 或 clean-machine 结果。任何未来结论都必须在当时重新获取官方版本事实，不能把本调查快照当成永久最新。
