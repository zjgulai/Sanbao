# Master TODO

## 1. 执行原则

- 任务按“可证明的风险关闭”排序，不按界面可见度或实现趣味排序。
- 每次只授权一个批次；完成该批次后必须停下汇报。
- P0 任务不得通过新增 exemption、跳过 smoke、降低校验或隐藏 `skip` 来变绿。
- 安全测试一律使用临时 HOME、假凭证、本地 mock 和随机端口。
- 任何持久化、权限、发布、远端 ruleset、Developer ID 或客户机操作都需要新的明确授权。
- 估算口径：S 约半天以内；M 约 1–2 天；L 约 3–5 天；XL 需拆成多个可验收批次。估算不包含外部账号、证书和客户等待。

## 2. 总依赖图

```text
BASE-001 当前工作树边界确认
  ├─ DEC-003 Team Hub 信任区 ─────→ SEC-RT-004/008/009 ──────┐
  ├─ DEC-009 第三方代码准入 ──────→ SEC-RT-002 ──────────────┤
  │                                      ↑ SEC-RT-003/003A   │
  ├─ DEC-010 artifact 权威源 ─────→ REL-001/QG-003 ──────────┤
  ├─ QG-006A mutation fixture 隔离基础设施 ───────────────────┐
  └─ QG-001 三态契约 ─┬→ QG-002..005 ─┐                     │
                      ├→ QG-010/011/012 ├→ QG-006B → QG-007 → QG-008
                      └─────────────────┘        ↑ QG-006A   │
SEC-RT-001/002/003/003A/004 ─→ SEC-RT-010 ───────────────────┤
REL-001 clean source ─→ REL-002 payload attestation ─────────┤
REL-003 版本不可重制 ─────────────────────────────────────────┤
PROD-UX-001 Settings 候选收口 ────────────────────────────────┤
                                                             ↓
                                            GATE-A2 候选交付基线
                                                             │
DEC-001/002 ─→ PROD-001 ─→ PROD-002 ─┬→ PROD-003/004 ────────┤
                                     ├→ PROD-UX-003/004 ─────┤
SEC-RT-004 + PROD-002 ───────────────→ PROD-UX-005 ───────────┤
DEC-004 ─→ PRIV-001 ─┬→ PRIV-003 ─────────────────────────────┤
DEC-011 ─────────────└→ PRIV-002 ─→ OBS-001 ──────────────────┤
                                                             ↓
                                                GATE-B 产品闭环
                                                             │
DEC-005 + GATE-A2 ─→ DIST-002 ─→ REL-009 最终 DMG 验收 ──────┤
REL-009 + QG-007 ─→ REL-004 ─→ REL-005/006 ─→ DIST-001 ──────┤
DIST-001/002 ─→ DIST-003 ─→ DIST-004 ─→ REL-008 ─────────────┤
PROD-006 ─→ OBS-002；DEC-008 ─→ BUS-001 ─→ BUS-002 ──────────┤
                                                             ↓
                                              GATE-C 公开生产候选
```

## 3. Phase 0：启动前边界与决策

### BASE-001 · 当前工作树边界确认

- [x] 重新记录 branch、HEAD、两个远端 refs、tag、tracked/untracked/staged 状态。
- [ ] 对当前 Settings Shell、ADR-0087/0088、门禁候选逐项确认归属者和状态。
- [x] 选择“只做完全不重叠任务”的执行边界；Settings、Fullstack、gate、ADR 候选均不接管。
- [x] 记录禁止覆盖清单和三个 Shopify 目标文件的 hash 快照。
- [x] 目标文件在两次复核中 hash 一致；每次 patch 前继续复核。
- 验收：实施前后未授权文件的 hash 不变；`git status --porcelain=v2` 的变化只来自获批任务。
- 当前状态：边界快照与写入隔离已完成；Settings 候选的最终归属仍由 `PROD-UX-001` 收口，不把该未决项误写成已验收。

### BASE-002 · 建立任务批次记录

- [x] 为 `BATCH-001` 记录 task IDs、范围、非范围、owner、验收命令、live/远端权限。
- [x] 明确本批不允许 commit、push、修改 GitHub ruleset、签名或发布。
- [x] 明确目标 hash 漂移、官方 host 范围扩大、真实 secret/network 依赖和不可隔离冲突等停止条件。
- 验收：所有变更行都能追溯到一个获批 task ID。
- 当前状态：已完成；见 [BATCH-001](batches/BATCH-001-boundary-and-shopify.md)。

### 决策清单

- [ ] DEC-001：内部可信分发还是公开生产发行。
- [ ] DEC-002：确认主要用户与前三条北极星业务任务。
- [ ] DEC-003：Team Hub 仅 loopback、可信 LAN，还是正式多用户模式。
- [ ] DEC-004：telemetry 禁用、明确 opt-in，还是受控默认开启。
- [ ] DEC-005：Developer ID 的获取时间和签名迁移窗口。
- [ ] DEC-006：能力成熟度账本的状态模型和 owner。
- [ ] DEC-007：GitHub/Codeup 的发布权威关系。
- [ ] DEC-008：内部平台、开源平台、垂直产品或企业产品的主商业形态。
- [ ] DEC-009：第三方技能、npm MCP 与 Python runtime 的分级准入和调用权限。
- [ ] DEC-010：各包 artifact policy 与正式发布的唯一、冻结输入源。
- [ ] DEC-011：My Quotes 全文索引默认状态、保留、清除和既有数据迁移。

具体选项见 [DECISIONS-REQUIRED.md](DECISIONS-REQUIRED.md)。

## 4. Phase 1：P0 安全与门禁真实性

目标：先保证凭证、权限和门禁结论不会撒谎。此阶段完成前暂停扩大技能、岗位、系统和设置入口。

| ID | 任务 | P | 依赖 | 估算 | 可并行 |
| --- | --- | --- | --- | --- | --- |
| SEC-RT-001 | [Shopify host 规范化与凭证外传阻断](tasks/SEC-RT-001-shopify-host-validation.md)（local E1/E2 完成；live deferred） | P0 | BASE-001 | S | 高 |
| SEC-RT-003A | preset/skill 路径 containment 与全批事务（local implementation complete；live/UI deferred；第三方 apply 等 SEC-RT-002 ledger） | P0 | BASE-001 | L | 中 |
| SEC-RT-003 | child-process env allowlist 与 LoopX 启动边界 | P1/P0 依赖 | BASE-001 | M | 高 |
| SEC-RT-002 | MCP、LoopX、第三方技能不可变供应链 | P0 | DEC-009,SEC-RT-003,SEC-RT-003A | L | 中 |
| SEC-RT-004 | Team Hub 插件 HTTP 路由 default-deny | P0 | DEC-003 | M | 高 |
| QG-001 | 所有 gate 统一 pass/fail/skip 三态（local implementation + text/JSON/strict acceptance complete；远端 required check 未开始） | P0 | BASE-001 | M | 中 |
| QG-002 | 修复 live-presets 漏行与空射程（local L1/L2 + read-only live L3 complete；真实 preset mutation 未做） | P0 | QG-001 | M | 高 |
| QG-003 | 修复 plugin-entry-contract 射程与入口解析 | P0 | QG-001 | M | 高 |
| QG-004 | profile metadata/files/bundles 覆盖率闭合 | P0 | QG-001 | M | 中 |
| QG-005 | changedPackages 覆盖远端基线和 untracked | P1 | QG-001 | S | 高 |
| QG-010 | Fullstack 138 全量验证与 tracked 89 whitelist 全等（本地 L1/L2/L3 完成；QG-007 remote required deferred） | P0 | QG-001 | M | 高 |
| QG-011 | Third-party intake 分类守恒与错误非零退出（local implementation + E1/E2/E3 acceptance complete；QG-007 remote required check deferred） | P0 | QG-001 | M | 高 |
| QG-012 | Settings AX 独立校准锚与仪器负控 | P0 验收 | QG-001 | M | 高 |
| QG-006A | mutation fixture 隔离基础设施 | P0 基础设施 | BASE-001（先行基础设施；退出条件覆盖 QG-002..005,QG-010..012） | M | 低 |
| QG-006B | 聚合并发、失败/SIGTERM 与零副作用证明 | P0 收口 | QG-006A | M | 低 |
| REL-001 | 正式产物强制 clean source | P0 | DEC-010,QG-003,QG-005 | S/M | 中 |
| REL-002 | smoke attestation 绑定 payload 字节 | P0 | REL-001 | M | 中 |
| REL-003 | 已发布版本永久不可重制 | P0 | REL-001 | S | 高 |
| PROD-UX-001 | Settings Shell CSS 收窄与候选收口 | P0 UX | BASE-001 | M | 低 |

### GATE-A1 · 安全/门禁真实性退出条件

- [ ] 运行时出货配置中不存在未固定版本的 `npx -y`/等价网络执行。
- [ ] 非法 Shopify hostname 下网络调用次数为 0，日志无凭证。
- [ ] member 的未知插件 route 在 GET/POST/upgrade 三类请求中均默认拒绝。
- [ ] 每个 gate 都报告 expected/checked/skipped/failed 或等价可审计分母。
- [ ] 无射程不会显示 `ok`。
- [ ] live-presets 每一条真实 `name:` 行都进入 checked、disabled、failed 三者之一。
- [ ] plugin-entry 每个候选都有 checked 或类型化 skip，缺入口不能静默消失。
- [x] Fullstack 138 条全部逐项验证，tracked 89 项白名单与批准产品意图双向全等。
- [x] third-party intake 分类互斥且守恒，任何后置 accounting error 均非零退出且零写入。
- [ ] Settings AX 校准锚与目标控件独立，目标尺寸 mutation 能稳定打红。
- [ ] 门禁测试成功、失败、SIGTERM 和并发执行前后工作树一致。
- [ ] preset/skill 的路径逃逸、symlink、批末失败和中断恢复负例均保持允许根外字节不变。
- [ ] 外部运行时和技能只有 immutable source、逐文件 digest、许可证与批准状态闭合后才可调用。
- [ ] Settings CSS 不再改变非设置页 dialog。

## 5. Phase 2：交付控制面与运行时纵深

| ID | 任务 | P | 依赖 | 估算 | 可并行 |
| --- | --- | --- | --- | --- | --- |
| SEC-RT-005 | HTTP body 上限、读取 deadline、解析边界 | P1 | BASE-001 | S | 高 |
| SEC-RT-006 | Wanzh 原子持久化与损坏 fail-closed | P1 | BASE-001 | M | 高 |
| SEC-RT-007 | OAuth flow 生命周期与 disposer 闭合 | P1 | SEC-RT-006 | M | 中 |
| SEC-RT-008 | Team Hub session 原子存储与清理 | P1 | BASE-001 | M | 高 |
| SEC-RT-009 | Team Hub TLS/cookie/登录防护 | P1/P0 | SEC-RT-004,008,DEC-003 | L | 低 |
| SEC-RT-010 | 安全契约总门禁和端到端验收 | P0 收口 | SEC-RT-001..009,SEC-RT-003A | M | 低 |
| QG-007 | GitHub CI workflow 与证据分层 | P0 | QG-001..005,QG-006A,QG-006B,QG-010..012 | M/L | 中 |
| QG-008 | branch protection/ruleset/required checks | P0 | QG-007 | S | 低 |
| QG-009 | gate/packaging/runtime owner 与故障接管人 | P2 | QG-007 | S | 高 |
| REL-007 | AEIS 可选能力的 manifest truthfulness | P1 | REL-002 | S | 高 |

### GATE-A2 · 信任与交付基线退出条件

- [ ] `main` 不能绕过 required checks 直接进入发布状态。
- [ ] CI 的静态、集成和 skip 输出与本地同一契约。
- [ ] 候选构建拒绝 dirty/unknown source，payload attestation 与 exact payload digest、source commit 和冻结 profile/skills snapshot 闭合。
- [ ] stable 版本占用检查在首次写入前同时覆盖本地与 required remote；当前阶段只证明发布机制，不把 draft/fixture 提升为已发布。
- [ ] Team Hub 正式多用户模式具备 TLS、Secure cookie、限速和 CSRF/Origin 边界；否则产品明确限制为 loopback/可信 LAN。
- [ ] 配置截断、OAuth 放弃、超限请求、session 并发、子进程 secret mutation 和第三方 artifact 漂移均会触发预期防线。
- [ ] QG-007 的独立 runner 和 QG-008 的远端 ruleset 已分别取得 E7 证据；未获远端授权时保持 blocked，不以本地 green 代替。

## 6. Phase 3：产品闭环、隐私与自助支持

| ID | 任务 | P | 依赖 | 估算 | 可并行 |
| --- | --- | --- | --- | --- | --- |
| PROD-001 | 确认产品楔子、主要用户和三条核心任务 | P0 产品 | DEC-001,002 | M | 低 |
| PROD-002 | 机器可读能力成熟度账本 | P0 产品 | DEC-006,PROD-001 | M | 中 |
| PROD-003 | 首启 onboarding 与健康中心 | P1 | PROD-001,002,GATE-A2 | L/XL | 低 |
| PROD-004 | 按用户任务重构信息架构 | P1 | PROD-001,002 | L | 中 |
| PROD-UX-002 | 跨包可访问性基线与公共交互模式 | P1 | PROD-004 | M/L | 中 |
| PROD-UX-003 | Fullstack 138/89 能力发现与性能预算 | P1 UX | PROD-002,004,QG-010 | M/L | 中 |
| PROD-UX-004 | New App Products/Systems 同步刷新恢复 | P1 UX | PROD-002 | S/M | 高 |
| PROD-UX-005 | Team Hub Admin async error 与危险确认 | P0 管理 UX | SEC-RT-004,PROD-002 | M | 中 |
| PRIV-001 | 数据流与处理目的清单 | P0 隐私 | DEC-004 | M | 高 |
| PRIV-002 | “我说”opt-in、删除、保留与模型传输边界 | P0 隐私 | PRIV-001,DEC-004,DEC-011 | M | 中 |
| PRIV-003 | Skill Center telemetry 决策与实现一致 | P0 隐私 | PRIV-001,DEC-004 | S/M | 高 |
| OBS-001 | 隐私友好的本地 support bundle | P1 | PRIV-001,GATE-A2 | M | 高 |

### GATE-B · 产品闭环退出条件

- [ ] 一位新用户在不打开终端的情况下完成版本/TCC/Provider/Profile/连接检查。
- [ ] 用户从推荐岗位或小队启动并完成一条参考业务任务。
- [ ] UI 和文档统一显示能力的 Installed/Loaded/Configured/Connected/Outcome-verified 状态。
- [ ] 设置不再承担全部能力发现；Skill Center/统一能力面可按业务目标检索。
- [ ] Fullstack 视图能解释 catalog/selected/installed/ready，138/89 与 300 条扩容 fixture 满足已定义性能预算。
- [ ] New App 一次 Reload 同时重试 Products/Systems，部分失败、过期响应和重试均不要求关闭重开。
- [ ] Team Hub Admin 的异步失败可恢复，reset/disable 在明确确认前请求数为 0。
- [ ] 核心 dialog、tabs、搜索、异步状态通过自动 a11y、键盘与 VoiceOver 人工验收。
- [ ] “我说”的索引位置、删除、保留和外部模型传输有清晰披露。
- [ ] telemetry 的文档、代码、网络行为和用户选择一致。
- [ ] support bundle 默认脱敏，不收集会话正文和凭证。

## 7. Phase 4：效果、公开发行与商业路线

| ID | 任务 | P | 依赖 | 估算 | 可并行 |
| --- | --- | --- | --- | --- | --- |
| PROD-005 | 核心任务基线、golden cases 与评分规范 | P1 | PROD-001 | M | 高 |
| PROD-006 | 有/无能力的 matched outcome evaluation | P1 | PROD-002,005 | L | 中 |
| OBS-002 | TTFV、任务成功、恢复、升级指标 | P1 | PROD-003,PRIV-001 | M | 中 |
| DIST-002 | Developer ID、hardened runtime、公证与 stapling | P0 公开发行 | DEC-005,GATE-A2 | L+外部等待 | 低 |
| REL-009 | exact final DMG 的 fresh/N-1/rollback attestation | P0 公开发行 | REL-001..003,DIST-002,QG-012 | L | 低 |
| REL-004 | GitHub Release 五方字节闭环与 published 转换 | P0 | REL-001..003,REL-009,QG-007 | M | 低 |
| REL-005 | release 状态机与双远端闭合 | P1 | DEC-007,REL-004 | M | 中 |
| REL-006 | 版本、包数、SOP 单一事实源 | P1 | REL-004,005 | M | 高 |
| DIST-001 | 签名 release feed 与只读更新提示 | P1 | REL-004..006,DEC-004 | M | 高 |
| DIST-003 | 下载、校验、同一 install.sh、stable/canary、回滚 | P1 | DIST-001,002,REL-009 | L | 低 |
| DIST-004 | 公网字节的干净机器安装、升级、回滚与 TCC 矩阵 | P0 公开发行 | REL-004,REL-009,DIST-002,003 | L | 低 |
| REL-008 | 灰度状态、指标与停止/回滚自动判定 | P1 | OBS-002,DIST-004 | M | 中 |
| GOV-001 | 客户文档与维护者文档分层 | P1 | REL-006,PROD-001 | M | 高 |
| GOV-002 | ADR/Note 综合索引与现行/历史标记 | P2 | REL-006 | M | 高 |
| BUS-001 | 选择商业产品形态 | P1 商业 | PROD-001,006 | M | 低 |
| BUS-002 | SKU、授权、更新权益、SLA、许可证和数据责任 | P1 商业 | BUS-001,DIST-002 | L | 中 |

### GATE-C · 公开生产候选退出条件

- [ ] Developer ID、notary ticket、staple、`spctl`、签名身份均通过自动核验。
- [ ] exact final DMG 已取得绑定 digest、无 skip 的 fresh install、N-1 upgrade 和 failure rollback attestation。
- [ ] GitHub Release 的 DMG、`SHA256SUMS`、manifest、tag commit、REL-009 attestation 五方全等；Latest 指向最高 published semver。
- [ ] 更新提示可验证版本、hash 和 channel；自动安装只消费可信 feed、签名、公证与 rollback-ready 证据。
- [ ] 公网下载的 DMG 从零开始完成安装、首启、N-1 升级、同版重装、失败回滚、用户数据保留和 TCC 验证。
- [ ] stable/canary feed 被篡改时拒绝安装；旧版本仍可降级。
- [ ] 三条核心任务的 matched evaluation 不低于无增强基线，并有明确适用边界。
- [ ] 灰度指标不再只依赖 1–2 人的口头反馈；失败能触发停止或回滚。
- [ ] 产品宣传、能力账本、客户文档和实际状态一致。
- [ ] 若进入商业化，授权、更新期限、支持 SLA、第三方许可证与数据责任已明确。

## 8. 建议的未来实施顺序

用户后续已授权从完整方案进入阶段执行；每一轮权限以最新用户消息和对应任务卡共同圈定，不从历史 batch 推导额外授权。当前只允许固化 `QG-010/QG-011` 到 GitHub，随后实施 `QG-006A` 并停止；不构成删除、安装、Codeup 推送、发布或后续任务授权。按下列批次逐个执行并在每批后停止：

1. `BASE-001` + `BASE-002`：已完成；冻结文件归属、hash 与验收边界。
2. `SEC-RT-001`：已完成本地修复并进入既有 checkpoint；真实店铺/live/clean-machine/DMG 验收仍 deferred。
3. `SEC-RT-003A`：已按单独授权完成本地实现与临时根 fault/concurrency/recovery 验收；真实 `~/.dsh` 未做 mutation，UI/live 人工验收 deferred，第三方 promotion 继续等 SEC-RT-002 ledger。
4. `QG-001` + `QG-002` + `QG-010` + `QG-011`：均已完成本地实现与分层验收；当前 checkpoint 只固化后两项。QG-007 远端 required check 与聚合并发/SIGTERM/零副作用仍分别由后续 `QG-007`、`QG-006A/QG-006B` 收口。
5. 用户先完成 `DEC-009`，再独立实施 `SEC-RT-003` + `SEC-RT-002`；MCP、LoopX、第三方技能分别给 Red/Green 和 clean-machine 证据。
6. 用户先完成 `DEC-010`，再实施 `QG-003` + `QG-005` + `REL-001`，证明 clean checkout 可重建 Settings artifact 与冻结发布输入。
7. `QG-010` 已关闭本地 138/89 射程；下一独立批次只做 `QG-006A`，先把 mutation fixture 隔离基础设施铺好。
8. `PROD-UX-001` + `QG-012` 继续作为后续独立 Settings 批次，避免代码修复和判据修复互相遮蔽；不得从 `QG-006A` 自动进入。

Team Hub、远端 CI/ruleset、Developer ID、公证、真实安装/删除、Release 和客户机操作均在上述批次之外，仍需各自的明确授权。
