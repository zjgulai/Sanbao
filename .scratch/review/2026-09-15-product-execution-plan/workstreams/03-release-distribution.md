# Workstream 03 · 发布、分发与升级

## 发布状态建议

```text
candidate
  ├─ failed
  ├─ superseded
  └─ attested
       └─ published
            ├─ superseded
            └─ revoked
```

状态只能按允许边单向迁移；不能用“存在 manifest 但没有 tag”等偶然组合猜测意图。

## REL-001 · 正式产物强制 clean source

- 优先级：P0
- 估算：S
- 依赖：BASE-001、DEC-010、QG-005；Settings 构建契约还依赖 QG-003/QG-012
- 可并行：高

### 目标

正式 channel 在创建或改动 release 目录前，必须证明来源 commit 可达且工作树完全干净。

### TODO

- [ ] 为 tracked、staged、untracked 进入 payload 分别建立 Red fixture。
- [ ] 正式 build 前检查 HEAD、source dirty、source commit 可达性。
- [ ] 完成源码快照后再次检查 HEAD/工作树，阻止装配期间漂移。
- [ ] dirty/unknown source 只能进入明确的 non-publish 开发目录和 channel。
- [ ] manifest 记录 source commit、dirty、profile snapshot，但记录不能替代阻断。
- [ ] 在写入正式 release 路径前失败，不能留下半成品正式目录。
- [ ] stable build 只允许在 exact source commit 的一次性临时 clone/checkout 中执行（不用 worktree），锁定依赖安装；装配不得读取开发工作树的 `lib`、untracked 文件或缓存产物。
- [ ] 为 `packages/platform/dsh-settings-shell-local` 定义 clean-checkout build contract：package 必须被 source commit 跟踪，锁文件可复现，build 从 `src` 产生声明的 `lib`，`main`/`exports`/`files`/DSH entry 指向的每个路径都存在且属于本次 build artifact manifest。
- [ ] 对允许进入 payload 的 live profile/skills 输入生成 canonical snapshot manifest（逻辑路径、来源分类、mode、size、SHA-256；排除凭证/用户数据），对规范化 manifest 求 snapshot digest。
- [ ] snapshot 在装配前后重新计算并要求 digest 不变；payload manifest 与后续 smoke/sign/release attestation 都引用同一 digest，未知或不可读输入失败。

### Red/Green 验证

- [ ] Red：当前 dirty/untracked Settings Shell 或开发机已有 `lib` 可被本地装配消费，但 exact source commit 的 clean checkout 无法重建同一产物；profile 仅记录描述而没有可复算 digest。
- [ ] Green：临时 clean checkout 独立安装/构建后得到完整 Settings artifact manifest，开发工作树即使存在额外 `lib` 也不改变产物；profile/skills snapshot digest 在装配前后以及 payload manifest 中全等。

### 负例

- [ ] 仅 untracked Settings source、stale `lib`、缺一个 exports target、锁文件漂移、build 输出多/少文件、snapshot 捕获后修改一个 skill、未知 symlink、凭证路径混入 snapshot，均在写正式 release 路径前非零退出。

### 证据层级

- [ ] L1 source/dirty 与 artifact-contract fixture；L2 exact commit 临时 clone 的可复现 build + artifact manifest；L3 payload/source/snapshot digest 绑定。开发机现有可运行包不等于 clean-source build 证据。

### 自动验收

- [ ] tracked/staged/untracked 任一改动都会阻塞正式构建。
- [ ] clean candidate 正常进入下一阶段。
- [ ] 构建期间改变 HEAD 或工作树会失败。
- [ ] non-publish 调试产物不可能进入签名/归档/上传入口。

### 人工验收

- [ ] reviewer 从 source commit 在新的临时目录按 manifest 重建一次 Settings package，并抽查 profile/skills snapshot 不含用户数据或凭证。

### 退出条件

- [ ] stable 装配入口只能接收 clean-checkout artifact manifest；Settings 所有声明入口可由 source commit 重建，live-profile/skills snapshot digest 可独立复算且贯穿后续证明。

### 失败边界

不修复历史 dirty release 的字节或 metadata；仅保留历史事实并阻止复发。

## REL-002 · Smoke attestation 绑定 payload/DMG 字节

- 优先级：P0
- 估算：M/L
- 依赖：REL-001
- 可并行：与 REL-005/006 的设计可并行

### 目标

将 smoke 从可跳过的日志步骤升级为签名和发布必须消费的、与具体字节绑定的结构化证明。

### TODO

- [ ] 定义分阶段 attestation schema：subject type/digest、version、source、build artifact manifest、profile/skills snapshot digest、parent payload/DMG hashes、OS/arch、测试项、时间、runner、skip/fail。
- [ ] smoke 完成后原子写 attestation；任何关键项 skip/fail 不得标 passed。
- [ ] 签名脚本验证 attestation 的 target hashes、source 和 freshness。
- [ ] `SKIP_SMOKE=1` payload 传入正式签名脚本必须失败。
- [ ] smoke 运行在隔离目录/测试用户，不操作开发者真实 `/Applications`、profile 或数据。
- [ ] payload smoke 产出第一阶段证明；REL-009 对签名/公证后的最终 DMG 产出 fresh install、N-1 upgrade、数据保留和失败回滚证明。publish 只消费后者，避免把 payload smoke 冒充最终字节验收。

### Red/Green 验证

- [ ] Red：当前 smoke 可由 `SKIP_SMOKE=1` 绕过且只测 payload；最终 DMG、N-1 upgrade 和 rollback 没有 hash-bound passed attestation。
- [ ] Green：stable 路径无跳过分支；payload attestation 只授权进入签名，最终 DMG attestation 才授权 REL-004 发布，二者 subject/parent digest 和 REL-001 snapshot digest 可闭环。

### 负例

- [ ] `SKIP_SMOKE=1/true`、缺 attestation、关键 case skip/timeout、过期、错误 source、snapshot digest 不同、改一个 payload/DMG 字节、只复制 passed JSON 改文件名，均非零退出。

### 证据层级

- [ ] L1 attestation schema/signature/transition fixture；L2 隔离 payload smoke；L3 REL-009 最终 DMG 机器验收。L2 不得提升为 final-DMG accepted。

### 自动验收

- [ ] attestation hash 与 payload/DMG 完全一致。
- [ ] 改一个 payload 字节、改 source、过期或缺 attestation 都会被签名脚本拒绝。
- [ ] smoke 失败保留诊断和 candidate，不产生 published 证据。
- [ ] 重跑不污染 runner。

### 人工验收

- [ ] 真实 Mac 完成首启、TCC、重启和升级后的授权持续性检查。

### 退出条件

- [ ] 正式签名入口拒绝 dirty/skip/失配 payload，正式发布入口只接受 exact DMG digest 的无 skip REL-009 attestation；所有证明引用同一 source 与 profile/skills snapshot digest。

### 失败边界

禁止“先发布、后补 smoke”；失败版本保持 candidate/failed。

## REL-003 · 已发布版本不可重制

- 优先级：P0
- 估算：S
- 依赖：REL-001
- 可并行：高

### 目标

只要本地 manifest/tag/release dir 或远端 draft/published Release 任一占用版本，该版本号永久不能产出不同字节。

### TODO

- [ ] 列出版本占用的所有本地与远端信号。
- [ ] 正式 channel 移除/禁止 `--force` 同号重制。
- [ ] 调试重跑使用独立 build ID 和 non-publish path，不使用正式 semver。
- [ ] 保护 `v*` tag，禁止 rewrite/delete。
- [ ] 已公开错误版本只允许 revoked + 新 patch。
- [ ] 占用检查必须在创建 release dir、签名、tag 或上传之前完成；stable 路径遇远端不可达/权限不足时 fail-closed。
- [ ] `--force` 仅可用于带独立 build ID 的 non-publish 调试路径；传入 stable/semver 入口时直接拒绝，不能变成覆盖授权。

### Red/Green 验证

- [ ] Red：当前正式脚本接受 `--force`，或只看部分本地信号时，同版本可在未检查远端占用的情况下继续重制。
- [ ] Green：本地 manifest/tag/release dir 与所有 required remote 的 tag/draft/published Release 先做联合占用判定；任一命中或状态未知均停止且零写入。

### 负例

- [ ] 仅本地 manifest、仅本地 tag、仅 release dir、仅 remote draft、仅 remote published、第二远端已占用、网络/API 权限失败、`--force`、同版本同 hash、同版本异 hash，均不得创建或改动正式产物。

### 证据层级

- [ ] L1 版本占用状态矩阵 fixture；L2 本地临时 refs/release dir；L3 required remote API/refs 只读快照。只验证本地不能宣称版本未占用。

### 自动验收

- [ ] 本地 manifest、tag、release dir、remote draft、remote published 任一存在均拒绝。
- [ ] 同字节重跑也不得重新发布；检查流程必须幂等读取已有状态。
- [ ] tag rewrite 测试被 ruleset 拒绝。

### 人工验收

- [ ] 选择一个历史版本做 dry-run，确认不会改动任何历史附件。

### 退出条件

- [ ] 所有本地/双远端占用组合都在首个写动作前失败，stable 无 `--force` 逃生口，历史附件/tag hash 保持不变。

### 失败边界

远端状态无法证明时保持 blocked；不得通过删除本地记录、改写 tag 或覆盖 Release 来“恢复可发布”。

## REL-004 · GitHub Release 字节闭环

- 优先级：P0
- 估算：M
- 依赖：REL-001..003、REL-009、QG-007
- 外部状态：发布/上传动作需要单独授权

### 目标

证明客户下载字节、入库清单、tag commit 和 smoke attestation 是同一个版本。

### TODO

- [ ] 检查 exact asset 名称、数量、大小、上传状态、draft/prerelease。
- [ ] 比较 GitHub asset digest 与入库清单；API 无 digest 时下载重哈希。
- [ ] 验证 `SHA256SUMS` 附件存在且内容对应 DMG。
- [ ] 验证 tag peeled commit 包含对应 release record/manifest。
- [ ] 验证 smoke attestation 指向同一 digest。
- [ ] 验证 REL-009 最终 DMG/N-1/rollback attestation 的 subject digest 与实际上传 DMG digest 全等，且其 source、snapshot digest 与入库 manifest 一致。
- [ ] 最高 published semver 才能是 Latest。
- [ ] 普通本地网络不可用可 typed skip；正式 release workflow 必须 fail。

### Red/Green 验证

- [ ] Red：只有 tag/draft 状态或本地 DMG hash 能通过时，公网附件可能与本地 manifest/最终验收字节断链。
- [ ] Green：从 Release API 解析 exact asset，必要时下载重哈希；asset、SHA256SUMS、入库 manifest、tag peeled commit、REL-009 attestation 五方指向同一不可变版本和 digest。

### 负例

- [ ] 上传同名不同字节、重复 DMG、遗漏 checksum、tag 指向错误 commit、attestation 属于旧 build、Latest 指错、第二远端 tag 未闭合、API 权限不足均阻止 published。

### 证据层级

- [ ] L1 Release API fixture；L2 draft upload/download byte replay；L3 公网 Release 下载重哈希与 required remote refs。网页显示文件名不构成字节证明。

### 自动验收

- [ ] 缺/重复 DMG、缺 checksum、hash 不符、draft、错误 tag、错误 Latest 全部失败。
- [ ] 模拟半上传、重复附件和 API 缺 digest。
- [ ] 已公开附件错误时自动进入 blocked/revoked 流程，不原位覆盖。

### 人工验收

- [ ] 从公开 Release 页面下载一次并独立重算 hash。

### 退出条件

- [ ] 五方字节闭环与双远端 refs 同时通过，任何远端未知保持 candidate/blocked；published 后同名附件不可原位替换。

### 失败边界

上传失败保留 draft/candidate；公开错误只能 revoked + 新版本。

## REL-005 · Release 状态机与双远端闭合

- 优先级：P1
- 估算：M
- 依赖：DEC-007、REL-004
- 外部状态：push/tag/rules 变更另行授权

### 目标

显式记录 candidate/superseded/attested/published/revoked，并按决策核对 GitHub/Codeup refs。

### TODO

- [ ] 选择 machine-readable release registry 的唯一归属。
- [ ] 字段包括 version、state、source、dirty、digest、attestation、tag、remotes、Release URL、reason。
- [ ] 定义合法迁移，禁止倒退/跳级/双 Latest。
- [ ] 为历史 2.3.2 等“有 manifest 无 tag”状态做人工映射，不猜测。
- [ ] 根据 DEC-007 记录 required remotes/branches/tags。
- [ ] push 后以远端 API/refs 重新读取，不能只信本地 push 输出。
- [ ] annotated tag 检查 peeled commit。

### 自动验收

- [ ] 每个 manifest/tag/release 映射到唯一状态。
- [ ] 非法迁移和重复 published/latest 失败。
- [ ] required remote 漏推、commit 不一致、不可达会阻止 published。
- [ ] 网络恢复后核对可幂等重试，不 force push。

### 人工验收

- [ ] 逐版核对现有正式版本；在 GitHub/Codeup UI 抽查 commit/tag。

### 失败边界

不重写历史；远端不一致时保持 blocked，不自动补 force push。

## REL-006 · 版本、包数和发布 SOP 单一事实源

- 优先级：P1
- 估算：M
- 依赖：REL-004/005 的 schema 决策
- 可并行：高

### 目标

README、安装卡、About、架构包数、签名状态和发布 SOP 不再手工维护多套当前事实。

### TODO

- [ ] 指定唯一正式发布 SOP；其他文档保留摘要和相对链接。
- [ ] 明确 root private package version 是否与产品版本同义。
- [ ] 从 release registry/catalog 生成或校验 latest、DMG 名、签名状态、包数、下载 URL。
- [ ] 示例使用 `<VERSION>` 等变量，不硬编码旧版本。
- [ ] 修正 TCC SOP 中不可执行的 app 路径，改为从两个 DMG 只读挂载核对。
- [ ] 文档声称的 CI/branch protection 必须与 API 状态一致。
- [ ] 客户文档移除个人绝对路径、pnpm、inode 等维护细节。

### 自动验收

- [ ] tag/manifest/DMG/checksum/展示版本一致。
- [ ] 人为改一个文档副本会被 freshness gate 打红。
- [ ] 非生成区禁止“当前最新版本”硬编码。
- [ ] Markdown 链接和 SOP dry-run 通过。

### 人工验收

- [ ] 未参与项目的人按唯一 SOP 做一次 dry-run，无需口头补充。
- [ ] 客户从发布页、README、安装卡、About 看到同一版本。

## REL-007 · AEIS 可选能力 truthfulness

- 优先级：P1
- 估算：S
- 依赖：REL-002

### 目标

AEIS 缺失时，payload manifest、README 和 UI 不再声称完整包必然包含该能力。

### TODO

- [ ] 决定 AEIS 是 stable 必备还是可选能力。
- [ ] 必备时缺失直接阻断装配。
- [ ] 可选时 manifest 记录 `present:false` 和 reason，README/UI 从同一事实显示。
- [ ] completeness 和 smoke 根据声明执行，不以 0-byte 占位假装存在。

### 自动验收

- [ ] 必备缺失失败；可选缺失产生一致 degraded 状态。
- [ ] manifest/README/UI 不发生“文件缺失但声称包含”。

### 人工验收

- [ ] 在一个包含 AEIS 和一个不包含 AEIS 的候选中，用户界面、manifest 与说明分别显示 available/degraded，且用户能找到对应恢复或安装路径。

## DIST-001 · 可信 release feed 与仅检查更新

- 优先级：P1
- 估算：M
- 依赖：REL-004..006、DEC-004

### 目标

在尚未公证、不能安全自动安装时，可靠提示新版本、release notes 和可信下载入口。

### TODO

- [ ] 定义 `latest.json`/channel feed schema：version、digest、min OS、notes、source、channel、Release URL。
- [ ] Feed 由 release registry 生成并归档，不手写。
- [ ] 为 feed 加独立 Ed25519 签名；公钥随应用交付并支持轮换方案。
- [ ] 客户端区分 current/newer/older/prerelease/replayed/untrusted/offline。
- [ ] 不可信 feed fail-closed，不提示安装。
- [ ] 公证前仅打开可信 Release 页面，不下载、不执行安装。
- [ ] 更新检查与 telemetry 分开，遵守 DEC-004 的网络披露。

### 自动验收

- [ ] 当前、新版、旧版、预发布、篡改、重放、超时、离线矩阵全覆盖。
- [ ] 错误签名/hash/channel 下不推荐更新。
- [ ] 所有路径均不触发安装。

### 人工验收

- [ ] 提示不打断运行任务，辅助技术可读，用户能理解失败/无更新/有更新差异。

## DIST-002 · Developer ID、hardened runtime、公证与 stapling

- 优先级：公开发行 P0
- 估算：L + Apple 外部等待
- 依赖：DEC-005、GATE-A2
- 外部状态：证书、notary credential 和 CI secret 需要明确 owner/授权

### 目标

从自签未公证切换到可被 Gatekeeper 正常接受的公开分发链。

### TODO

- [ ] 审计 app、嵌套二进制、bundle ID、entitlements、hardened runtime 和 TCC designated requirement。
- [ ] 确定证书 owner、最小权限存储、轮换、吊销和 break-glass。
- [ ] app 与 DMG 使用同一 Team ID 的 Developer ID Application 签名。
- [ ] notary submit、等待、staple、stapler validate、`spctl` 纳入原子流水线。
- [ ] 签名身份迁移版本明确提示一次性 TCC 重授。
- [ ] 任一步失败都不能进入 published。
- [ ] 公证成功前不得宣传无警告安装。

### 自动验收

- [ ] `codesign --verify --deep --strict`、designated requirement、hardened runtime、notary、staple、`spctl` 全部通过。
- [ ] nested binary 任一未签名或 identity 不一致都会失败。
- [ ] 证书/凭证不会出现在日志和 artifact。

### 人工验收

- [ ] 浏览器下载到干净 Mac，无 Gatekeeper 绕行即可安装。
- [ ] TCC 提示与真实行为一致；完成证书轮换/吊销演练。

## DIST-003 · 可回滚自动更新

- 优先级：P1
- 估算：L
- 依赖：DIST-001、DIST-002、OBS-001

### 目标

复用同一 `install.sh` 更新 app、profile、skills 和 runtime；用户可控、原子、可回滚。

### TODO

- [ ] 定义 check→download→verify→ready→installing→restart→complete/rollback 状态机。
- [ ] 下载后重新验证 feed signature、DMG hash、Developer ID 和 notary。
- [ ] 在任务安全点提示安装，保护进行中会话和用户数据。
- [ ] 调用同一安装语义，不创建第二套更新路径。
- [ ] stable/canary 分离；允许受控降级。
- [ ] 断网、磁盘满、损坏、进程占用、强制退出、重放和降级攻击全覆盖。
- [ ] 失败自动回滚并生成脱敏 support bundle。

### 自动验收

- [ ] 用户数据 hash 前后不变。
- [ ] 篡改、旧签名、错误 channel 不进入安装。
- [ ] 所有失败阶段能恢复上一可运行版本。
- [ ] 重跑不重复破坏或跳过验证。

### 人工验收

- [ ] 两个受支持 macOS 版本完成旧→新→故障回滚。
- [ ] 进行中的 Agent Team 任务不会静默丢失。

## DIST-004 · 干净机器安装、升级、回滚与 TCC 矩阵

- 优先级：公开发行 P0
- 估算：L
- 依赖：DIST-002/003

### 目标

把仓库 smoke 提升为公网下载字节在真实受支持 Mac 上的发布验收。

### TODO

- [ ] 明确最低 macOS、当前 macOS、Apple Silicon 设备矩阵。
- [ ] 从公开 URL 下载，不复用本地 payload。
- [ ] 覆盖 fresh install、首启、N-1 upgrade、同版重装、失败回滚、降级。
- [ ] 验证会话、配置、技能、凭证引用和 TCC 持续性。
- [ ] 每个组合记录 DMG hash、OS/build、结果、截图/日志和限制。
- [ ] 未执行组合必须写未验证。

### 负向验收

- [ ] 公网 DMG 与 REL-009 attestation digest 不同、最低 macOS 未运行、N-1 基线来源未知、升级后 TCC/用户数据丢失、rollback 只恢复 app 未恢复 profile/skills，任一情况都必须保持未通过。
- [ ] 用本地 payload、开发机已安装 App、历史截图或单一机器结果替代 required matrix 时，验收记录必须拒绝生成“全部通过”。

### 自动验收

- [ ] 机器矩阵 attestation 的 required case、DMG/source/REL-009 digest、OS/build/arch、before/after/rollback snapshot 和 skip 状态可复算；缺一或不全等即失败。
- [ ] 每个安装故障点自动比较旧 app、profile、skills、用户数据与 TCC 不变量，不能只检查进程重新启动。

### 人工验收

- [ ] 在每个 required OS 组合抽查 fresh install、N-1 upgrade 与一次中断 rollback，确认 Gatekeeper 无绕行、用户提示真实且未借用开发机 profile。

### 退出条件

- [ ] 所有 stable required 组合通过。
- [ ] 安装/升级失败不会破坏旧 app、profile 或用户数据。
- [ ] Gatekeeper、签名、公证、TCC 与文档一致。

## REL-008 · 灰度、停止和回滚状态

- 优先级：P1
- 估算：M
- 依赖：OBS-002、DIST-004

### 目标

灰度不再只依赖 1–2 位客户的口头反馈，而是有明确 cohort、指标、停止与回滚状态。

### TODO

- [ ] 记录 cohort、版本、hash、窗口、设备、关键能力和隐私边界。
- [ ] 指标包括安装、启动、升级、任务、恢复和 rollback。
- [ ] 任一 P0 安全/数据损失事件立即停止。
- [ ] 失败自动进入 blocked/rollback，不等待人工汇总后才判断。
- [ ] 灰度结论写回 release registry 和正式 changelog。

### 自动验收

- [ ] cohort 证据与确切版本/digest 绑定；达到停止阈值时状态自动进入 blocked/rollback，且 rollback 产物经过同等字节验证。

### 人工验收

- [ ] release owner 与支持 owner 各自复核一次停止事件，能从 cohort 证据追到受影响版本、通知范围、回滚动作和恢复判据。

## REL-009 · 最终 DMG、N-1 升级与 rollback attestation

- 优先级：P0
- 估算：L
- 依赖：REL-001..003、DIST-002、QG-012
- 可并行：机器矩阵准备可与 REL-004/005 的实现并行；证明完成必须先于 REL-004 published

### 目标

对签名、公证、staple 后的最终 DMG 字节执行安装级验收，生成发布可消费的结构化证明；payload smoke、开发机运行正常或安装脚本单测都不能替代它。

### 范围/非范围

- 范围：最终 DMG mount/verify、fresh install、Settings 首启、N-1 upgrade、故障注入 rollback、app/profile/skills/用户数据保持性和 attestation。
- 非范围：公网 URL 字节闭环由 REL-004/DIST-004 完成；长期灰度与 cohort 指标由 REL-008 完成。

### TODO

- [ ] 在隔离测试用户或一次性受支持 Mac/VM 上，从只读 staging 取得 exact final DMG，先记录 SHA-256、签名 identity、notary/staple 与 payload parent digest。
- [ ] fresh install 后验证 app 启动、关键插件入口、Settings Shell 构建产物与 QG-012 live anchor；不得复用开发工作树或用户 profile。
- [ ] 准备 hash 已知且已发布的 N-1 基线，写入受控会话/profile/skills/设置样本，再用 exact final DMG 升级并验证迁移与保留。
- [ ] 在 app replace、profile sync、skills sync 和 restart 各阶段注入失败/中断，验证回滚到完整 N-1；新增文件、preset/skill 与临时资源也必须恢复或移除。
- [ ] 对安装前、成功后、回滚后分别生成 app/profile/skills/user-data canonical snapshot；敏感内容只存允许的 digest/结构，不进入日志。
- [ ] 原子生成 final attestation：DMG digest、source commit、payload digest、build artifact manifest、live-profile/skills snapshot digest、N-1 version/digest、OS/build/arch、每个 case 状态、before/after/rollback digest、日志索引、runner 和时间。
- [ ] 任何 required case fail/skip/timeout、digest 漂移或 cleanup 依赖人工修复时，状态为 failed，不得产生 passed attestation。

### Red/Green 验证

- [ ] Red：当前可选 payload smoke 即使绿色，也没有证明最终 DMG 能 fresh install、从 N-1 升级并在中断时完整回滚。
- [ ] Green：对同一 final DMG digest，fresh/N-1/rollback required cases 全部 passed 且无 skip；rollback snapshot 与安装前 N-1 在声明的不变量上全等，attestation 可由 REL-004 独立复算并消费。

### 负例

- [ ] DMG 改一字节、错误/未公证签名、N-1 hash 不在 registry、升级中断、磁盘满、profile 写到一半、skills cache 缺失、rollback 只恢复 app 未恢复/清除 profile 与新增资源、Settings instrument unavailable，均失败且不出 passed attestation。

### 证据层级

- [ ] L1 installer failure-injection fixture；L2 签名/公证最终 DMG 的隔离机器 fresh/N-1/rollback；L3 REL-004 公网附件重哈希。只有 L2 可产出 final acceptance，L1 只证明机制、L3 只证明分发字节。

### 自动验收

- [ ] attestation schema 校验、签名和所有 digest 复算通过；required case 集合与计划矩阵全等。
- [ ] 成功升级保留声明的数据；每个失败点回滚后 app/profile/skills/用户数据不变量通过。
- [ ] 更换 DMG、N-1 或 snapshot 任一 digest 后消费端稳定拒绝。

### 人工验收

- [ ] release owner 抽查一轮 fresh install、一次 N-1 upgrade 和一次中断 rollback 的屏幕/日志，确认无 Gatekeeper 绕行、Settings 可达且用户提示真实。

### 退出条件

- [ ] exact final DMG 获得无 skip、hash-bound 的 fresh/N-1/rollback attestation；REL-004 将其设为 published 的硬依赖，失败候选保持 failed/blocked。

### 失败边界

测试机或 N-1 基线不可用时只能标未验证/blocked；不得降级为 payload smoke、手工口头确认或 `SKIP_SMOKE`。
