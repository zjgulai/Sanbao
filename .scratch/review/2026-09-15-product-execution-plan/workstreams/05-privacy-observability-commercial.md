# Workstream 05 · 隐私、可观测性、治理与商业化

## PRIV-001 · 全产品数据流与处理目的清单

- 优先级：P0 隐私
- 估算：M
- 依赖：DEC-004
- 可并行：高

### 目标

建立会话正文、本地派生索引、凭证、连接数据、日志、support bundle、telemetry 和产品指标的唯一数据地图。

### 范围

- 收集来源、目的、处理位置、外发 endpoint/provider、字段、保留、删除、owner、权限和失败状态。
- Electron client/host、Team Hub、MCP/外部 API、安装器、日志和 CI。

### 非范围

- 不在本卡实现隐私 UI。
- 不假设“本地优先”就等于没有外发。
- 不收集或复制真实凭证/会话内容到计划或测试 fixture。

### TODO

- [ ] 静态扫描 fetch/WebSocket/child-process/LLM/文件写入/日志出口。
- [ ] 对每条数据流记录触发动作、最小字段、目的、recipient、保留和删除。
- [ ] 区分默认发生、用户显式动作、配置启用和仅文档声明。
- [ ] 对 My Quotes、Skill Center telemetry、MCP、Team Hub、update check 做专门条目。
- [ ] 明确内容数据、账号标识、设备/安装标识、诊断数据和凭证分类。
- [ ] 记录未知项并设计网络录制/运行验证，不把未知写成无外发。
- [ ] 形成正式数据处理清单与 owner。

### 自动验收

- [ ] 每个已知网络/LLM/文件写入入口能映射到一条数据流。
- [ ] 新增外发或持久化入口但没有登记时 gate 失败。
- [ ] schema 禁止将真实 secret 和正文样本写入仓库。

### 负向验收

- [ ] 新增一个 fetch/LLM/文件写入入口却没有数据流记录时 gate 必须失败；recipient、目的、保留或删除任一未知时必须标 `unknown`，不能自动写成“无外发/不保留”。
- [ ] fixture 或证据包包含真实 credential、会话正文、完整 provider payload 时必须拒绝落盘，并保证原文件 hash 不变。

### 人工验收

- [ ] 产品、工程、支持逐项确认目的和用户解释一致。
- [ ] 网络录制验证默认态与声明一致。

## PRIV-002 · My Quotes 数据生命周期与模型传输闭环

- 优先级：P0 隐私
- 估算：M
- 依赖：PRIV-001、DEC-004、DEC-011
- 可并行：中

### 目标

让用户在扫描历史消息前知道范围，在 AI 精分前知道发送内容/provider，并能彻底清除派生索引。

### 范围

- 首次启用、扫描范围、本地路径、保留、重建、清除。
- AI 精分的逐次/会话确认、发送预览、500 字截断和目标 provider。
- 现有索引迁移。
- 后台扫描 timer、document 级事件 listener、panel mount/unmount 的完整生命周期。

### 非范围

- 不重做 Quotes 的全部分类与视觉。
- 不承诺外部 provider 无法保留数据；只能准确披露和遵守其配置。
- 清除只删除 Quotes 派生数据，绝不删除或改写源 session。
- 不把“用户点击 AI 精分”本身当作对未知 provider、未知发送片段或未来合同版本的永久同意。

### 用户旅程

1. 用户首次打开“我说”，在任何 session 扫描、索引写入或后台 timer 启动前看到用途、扫描范围、本地位置、默认保留期与“不启用”选项。
2. 用户明确 opt-in 后才建立派生索引；界面持续显示记录数、占用空间、最后扫描、下次过期和暂停/清除入口。
3. 用户点击 AI 精分时看到即将使用的 provider/model、recipient/endpoint 类别、精确发送片段与 500 字截断规则；只有本次或已版本化的有效同意后才发送。
4. 用户可暂停扫描、调整保留或清除全部派生数据；清除结果逐类反馈，源 session 保持不变。
5. 用户关闭并重新打开 panel 时不会重复注册键盘/鼠标 listener 或后台扫描；关闭后事件不再改变已卸载界面。

### TODO

- [ ] 写明当前会扫描何种 session/user message、最小长度和排除项，并把该范围绑定到版本化 `indexingConsent`；合同变化后旧同意失效。
- [ ] 首次扫描前展示说明并允许“不启用”；未 opt-in 时不得读取源 session、创建索引目录、写派生文件或启动五分钟扫描 timer。
- [ ] DEC-004 确认有限默认保留期；推荐 30 天且允许用户缩短/立即清除，永久保留只能由用户显式选择。UI 显示索引位置、记录数、大小、最后扫描、下次过期和当前策略。
- [ ] 在启动、每次增量扫描和策略变化时执行同一 retention policy；只清理过期派生记录及其 overrides/cache，不碰源 session。
- [ ] AI 精分前从即将执行的真实 dispatch 解析 provider/model 与接收方，显示实际 quote 发送片段、截断/规范化结果和其他模板数据类别；确认后的 payload 中用户内容必须与预览完全一致且不超过 500 字。
- [ ] 提供“仅本次同意”以及可选的“记住此 provider+动作”同意；记住状态必须版本化、可撤回，provider、recipient、payload 合同或上限变化时重新确认。
- [ ] 提供清除派生索引、停止扫描和受控重建；清除覆盖 records、meta、overrides、cache 与临时文件，重启后不恢复，完成后默认保持停止状态直到重新 opt-in。
- [ ] 现有用户升级时暂停后台扫描并提供“继续使用并同意 / 清除 / 暂不处理”；不得因旧索引存在推断用户已同意。
- [ ] 将 `keydown`、`mousedown`、timer 等注册为具名且可追踪的 handler；dispose/unmount 必须逐项 remove/cancel，重复 mount 不得累积。
- [ ] 日志和 support bundle 禁止消息正文。

### 自动验收

- [ ] 未 opt-in 的首次打开、重启和五分钟时间推进均不读源 session、不创建索引目录/文件、不注册扫描 timer。
- [ ] opt-in→扫描→暂停→重启状态迁移可重复；暂停后新增 session 不进入索引。
- [ ] retention 用过期/未过期/override/cache/时钟边界 fixture 验证，只清派生数据；源 session hash 前后完全一致。
- [ ] 未点击、拒绝、取消或同意已失效时 AI provider 请求数为 0。
- [ ] provider 调用的用户内容与确认预览完全一致且不超 500 字；切换 provider、recipient、合同版本或发送片段后必须重新确认，禁止静默 fallback 到另一 provider。
- [ ] clear 成功后 records、meta、overrides、cache、temp 与搜索结果为空，重启不恢复；clear 部分失败不得回报成功，并列出未删除类别供 retry。
- [ ] mount/unmount 多轮后 document `keydown`/`mousedown` 和扫描 timer 的有效订阅数不增长；卸载后触发事件没有副作用。
- [ ] 日志、错误、telemetry、support bundle 无消息正文、发送预览或 provider credential。

### 人工 / live / a11y 验收

- [ ] 至少 4/5 用户能回答数据在哪里、何时外发、如何删除。
- [ ] 在 live DSH 以“拒绝 opt-in、同意、暂停、30 天过期、清除、重启”完整走查，磁盘结果与 UI 一致。
- [ ] 分别对当前 provider、切换 provider、provider 不可用验证发送预览与同意；抓包确认用户内容片段与预览一致，拒绝时无请求。
- [ ] 清除过程有明确完成/失败反馈；用户能确认源 session 未删除，部分失败时能 retry。
- [ ] VoiceOver/纯键盘能理解同意范围、provider、发送片段、保留期与危险清除确认；dialog 焦点和关闭恢复符合 PROD-UX-002。
- [ ] 连续开关 panel 后验证快捷键/外部点击只响应一次，已关闭 panel 不再响应。

### 成功指标

- 未披露外发 0。
- 删除成功率 100%。
- 隐私理解率 ≥80%。
- 索引写入前有效 opt-in 覆盖率 100%；默认拒绝/未选择状态下源 session 读取和派生写入均为 0。
- 远端精分调用的有效 provider+payload 同意覆盖率 100%；预览与实际用户内容片段差异为 0。
- 重复 document listener/timer 为 0；保留期到期派生记录清理率 100%。

### 失败边界

- 同意状态缺失、损坏、版本未知或无法持久化时 fail closed：不扫描、不写索引、不远端精分，并给出可恢复说明。
- 清除若有任何类别失败，状态必须是 partial/failed 并保留可重试清单；不得删除源 session，也不得以 UI 搜索为空冒充磁盘已清除。
- 当前 provider 无法确定或不可用时不请求、不自动换 provider；用户重新选择后必须看到新披露并再次同意。
- retention 执行失败不得隐瞒；暂停新增扫描，保留源数据不动，并允许用户重试清除。
- listener/timer 无法证明完全 dispose 时不得通过重复 mount 验收，避免已关闭 panel 继续响应或后台读取。

## PRIV-003 · Skill Center telemetry 决策与事实一致

- 优先级：P0 隐私
- 估算：S/M
- 依赖：PRIV-001、DEC-004
- 可并行：高

### 目标

消除“README 声称每日 heartbeat、实现文件存在但运行路径未接线、文档链接缺失”的三方漂移。

### 范围

- telemetry 是否启用、真实调用入口、事件 schema、频率、endpoint、同意/撤回、保留、删除、失败重试和用户说明。
- source、bundle、运行网络、README/隐私文档/Settings 与测试之间的事实同步。

### 非范围

- 不把 update check、错误日志、support bundle 或产品指标自动归类为 telemetry；各自保留独立目的和开关。
- 不因存在一个未调用的 helper 就宣称已发送，也不因静态搜索无调用就宣称运行时绝无网络。
- 不在 DEC-004 未批准前默认开启远端 heartbeat。

### 选择

1. 无 telemetry：删除错误声明和孤立实现。
2. 仅本地聚合：不向远端发送。
3. 明确 opt-in：只有用户同意后发送最小事件。

推荐默认无外发；需要数据时采用明确 opt-in。

### 用户旅程

1. 用户在 Privacy/Diagnostics 中看到 telemetry 当前是 Off、Local only 或 Opt-in remote，以及准确的数据字段、目的、频率、接收方、保留和删除方式。
2. 默认未同意时应用不发送 heartbeat；用户选择启用后，同意记录绑定 telemetry contract 版本。
3. 启用且满足调度条件时每日最多发送一次最小事件，UI 不被发送成败阻塞；诊断页显示最近尝试/成功和安全错误摘要。
4. 用户撤回后立即停止未来调用并可删除本地 telemetry 状态；升级不会擅自改变选择，合同变化要求重新同意。
5. 用户单独使用更新检查时，不产生 telemetry 事件，也不会被 telemetry 开关阻断。

### TODO

- [ ] 盘点所有 telemetry/analytics/heartbeat 代码、build 注入、产物和 endpoint。
- [ ] 用网络录制确认当前运行行为，不能只靠搜索推断。
- [ ] 形成 ADR：字段、目的、默认、同意、撤回、删除、保留、owner、endpoint。
- [ ] 建立唯一、版本化的 telemetry contract manifest 作为事实源，至少包含 mode、event/schema、frequency、endpoint/recipient、consentVersion、retention、owner 和 update-check separation。
- [ ] 运行时调度与实际调用必须读取该 manifest 或其生成物；不得维护另一份手写频率/endpoint/字段常量。每次调用记录 contract version，便于诊断与验证。
- [ ] README、隐私说明和 Settings 的机器事实区块由同一 manifest 生成，或由 gate 与 manifest 双向校验；解释性文案只引用事实源，不复制会漂移的值。
- [ ] package/build 检查同时验证 helper 是否被真实入口调用：disabled 模式不得 bundle 可达 endpoint/call，opt-in 模式必须有从已同意调度器到 transport 的可执行调用链。
- [ ] 若 opt-in，禁止 prompt、消息正文、路径、凭证、稳定个人标识和未披露 IP 持久化。
- [ ] 同意状态版本化；合同变化要求重新同意。
- [ ] 更新检查网络与 telemetry 事件严格分离。
- [ ] 定义 offline、endpoint 失败、时钟回拨/前跳、休眠唤醒和多窗口的 single-flight/退避；失败不阻塞 Skill Center，也不形成 retry storm。

### 自动验收

- [ ] 默认态网络捕获无 telemetry。
- [ ] 撤回后立即停止且本地状态可验证。
- [ ] manifest schema 和 mode mutation 覆盖三种选择；缺 owner/endpoint/consent/retention 或非法事件字段时失败。
- [ ] README、隐私文档、Settings、bundle 中的 mode/frequency/schema/endpoint 与 manifest 不一致时 gate 失败。
- [ ] 静态调用图与可执行 harness 同时验证真实调用链：disabled/local-only 时 transport 调用为 0；opt-in 且已同意时才可到达 transport。
- [ ] opt-in 模式在多窗口、重启、休眠唤醒和时钟变化下 24 小时最多一次；未同意、撤回、合同过期时请求数为 0。
- [ ] telemetry 与 update check 使用不同事件/endpoint/开关；只触发 update check 时 telemetry transport 请求数为 0。
- [ ] endpoint 失败采用有上限退避、无 retry storm，且不阻塞 Skill Center 渲染或用户动作。
- [ ] schema 敏感字段 mutation 被拒绝。

### 人工 / live / a11y 验收

- [ ] 用户理解开关影响；离线、升级、撤回不改变其选择。
- [ ] 在当前候选的 live DSH 对 Off、Local only、Opt-in remote 三种批准模式分别抓包；网络、诊断状态与 UI/文档描述一致。
- [ ] 演练启用、拒绝、撤回、合同升级、断网、endpoint 失败、休眠唤醒与多窗口，确认频率、退避和不阻塞体验。
- [ ] VoiceOver/纯键盘能读取 mode、数据类别、接收方、最近状态和撤回结果；状态变化通过 live region 宣读且不抢焦点。
- [ ] 单独执行更新检查，确认 telemetry 开关与事件不受影响且没有附带 heartbeat。

### 成功指标

- telemetry 文档—manifest—bundle—实际调用链—运行网络漂移为 0。
- 默认/未同意/已撤回状态下远端 telemetry 请求为 0；启用且有效同意时每 24 小时最多 1 次。
- 撤回生效延迟为 0 个后续请求；敏感字段进入事件为 0。
- telemetry endpoint 故障导致的 UI 阻塞、crash 或 retry storm 为 0。

### 失败边界

- DEC-004 未决、manifest 缺失/非法、同意损坏或 contract version 不匹配时一律按远端 Off 处理，并阻塞任何“每日 heartbeat”文档声明。
- 抓包与静态/文档证据冲突时以运行网络为故障信号，保持未验证并查明调用链；不得选择性相信其中一层。
- endpoint 不可用时只记录脱敏诊断并有界退避，不阻塞 UI、不降级发送到未披露 endpoint。
- 无法证明 update check 与 telemetry 隔离时不得开启 remote mode；不得用更新请求充当 heartbeat 成功证据。

## OBS-001 · 用户可控的脱敏 Support Bundle

- 优先级：P1
- 估算：M
- 依赖：PROD-002、PRIV-001..003、GATE-A2
- 可并行：可与 onboarding UI 联合设计

### 目标

用户无需终端即可生成可预览、可排除、默认无敏感数据的诊断包。

### 范围

- App/OS/build、能力成熟度、连接状态、更新状态、健康检查、最近脱敏错误。
- 主动导出、预览、删除和大小上限。

### 非范围

- 不自动上传。
- 不包含消息正文、prompt、凭证、完整 session、原始绝对路径和客户隐私。

### TODO

- [ ] 定义版本化 bundle schema 和最大尺寸。
- [ ] 建立集中式 redaction，而非各模块各自替换。
- [ ] 用 token、邮箱、家目录、消息正文等 canary 做 mutation。
- [ ] 生成前列出数据类别，允许用户排除分区和取消。
- [ ] 导出完成后允许本地删除。
- [ ] 健康中心提供入口，但无用户动作不自动生成/上传。
- [ ] 建标准支持案例和读取手册。

### 自动验收

- [ ] 所有 canary 原值不会进入 bundle。
- [ ] bundle 通过 schema，超限/写失败可恢复。
- [ ] 默认不生成、不上传。
- [ ] 成熟度、版本、错误状态与真实数据源一致。

### 人工验收

- [ ] 支持人员仅凭 bundle 诊断启动、TCC、Provider、连接、版本五类故障。
- [ ] 用户能理解包中包含什么。

### 成功指标

- ≥80% 标准支持案例无需终端。
- 敏感字段泄漏 0。
- 生成成功率 ≥99%。

## OBS-002 · 结果导向指标与灰度观测

- 优先级：P1
- 估算：M
- 依赖：PROD-001、PROD-003、PRIV-001、PRIV-003
- 可并行：指标字典可提前，埋点等待旅程稳定

### 目标

以 activation、TTFV、任务结果、恢复和复用替代包数、技能数、安装数。

### 推荐指标

- 安装→环境就绪转化。
- 首次成功任务率。
- Time to First Value。
- 任务开始/成功/失败/恢复。
- 人工接管率。
- 岗位/小队复用率。
- 能力使用后的产物 delta。
- 安装、启动、升级和回滚成功率。
- 7/30 日复用；只有在隐私策略允许时远端汇总。

### TODO

- [ ] 定义事件字典、numerator/denominator、时间窗、版本和失败分类。
- [ ] activation 必须绑定业务产物验证，不等于安装或点击。
- [ ] 本地聚合与远端上传分层。
- [ ] 先采集无远端外发的真实基线，再设目标。
- [ ] 关键事件有去重、顺序、离线和升级测试。
- [ ] 灰度状态消费聚合结果，但安全/数据损失事件仍直接中止。

### 自动验收

- [ ] 事件 schema、顺序、去重通过。
- [ ] 关键旅程事件覆盖率 ≥95%。
- [ ] 默认状态无外发。
- [ ] 敏感字段为 0；错误任务不会误计成功。

### 人工验收

- [ ] 产品、工程、支持用同一示例算出相同指标。
- [ ] 指标异常能定位到具体版本和失败阶段。

## GOV-001 · 客户文档与维护者文档分层

- 优先级：P1
- 估算：M
- 依赖：REL-006、PROD-001
- 可并行：高

### 目标

客户不再看到个人绝对路径、pnpm、profile inode 和内部包维护流程；维护者仍保留完整工程证据。

### TODO

- [ ] 定义客户安装/首启/连接/任务/恢复/升级文档树。
- [ ] 定义维护者架构、package、profile、gate、release、debug 文档树。
- [ ] 当前版本、支持平台、签名状态、下载链接从发布事实源生成。
- [ ] 客户文档只提供产品动作和可理解的恢复；高级命令放维护者文档。
- [ ] 截图和说明与实际 stable DMG 对账。
- [ ] 所有重复事实保留一个 home，其余相对链接。

### 自动验收

- [ ] 客户文档无个人绝对路径和开发命令。
- [ ] 版本/包数/签名状态漂移会被 gate 发现。
- [ ] 链接、命令语法和发布文件名可自动验证。

### 人工验收

- [ ] 空白 Mac 用户按客户文档完成安装、首启和参考任务。
- [ ] 维护者可从客户错误深链到正确诊断章节。

## GOV-002 · ADR/Note 综合索引、现行与历史状态

- 优先级：P2
- 估算：M
- 依赖：REL-006
- 可并行：高

### 目标

降低 90 ADR、88 Note、27 pitfalls 的查找和真相漂移成本，同时保留历史证据。

### TODO

- [ ] 为 ADR/Note 标记 current/superseded/implemented/partially-verified/historical。
- [ ] 同一产品事实只保留一个现行 home。
- [ ] 自动生成按能力、风险、状态和 owner 的索引。
- [ ] 历史数字不改写，但明确其日期与已被替代关系。
- [ ] 每次非琐碎任务完成前检查相关现行记录。
- [ ] 为 gate、packaging、runtime、product 形成短摘要，减少每次读取整片历史。

### 自动验收

- [ ] 索引覆盖全部 ADR/Note，状态与 supersedes 链可解析；现行文档无提示引用 superseded 决策时 gate 失败。

### 人工验收

- [ ] 新维护者能在 10 分钟内找到一个现行决定、替代历史和验收方式，并能说明唯一事实 home。

## BUS-001 · 选择主商业产品形态

- 优先级：P1 商业
- 估算：M
- 依赖：DEC-008、PROD-001、PROD-002、PROD-006
- 可并行：低

### 候选

1. 开源本地平台 + 付费连接/能力包。
2. 企业部署、治理与支持。
3. 垂直跨境业务工作台。
4. 内部自用平台，不追求外部商业化。

### TODO

- [ ] 按需求强度、差异化、效果证据、交付成本、支持成本、合规和渠道对四种模式评分。
- [ ] 选择一个主模式，其他模式明确暂缓或作为辅助。
- [ ] 只有达到 Outcome-verified 的能力可成为正式承诺。
- [ ] 与 5–8 名潜在 buyer 访谈并测试试点/价格假设。
- [ ] 记录愿意付费的结果，而不是对功能清单的兴趣。

### 自动验收

- [ ] 决策矩阵只有一个 primary，评分输入、证据日期和 owner 齐全；每个商业承诺均能映射到成熟度账本和验收 ID。

### 人工验收

- [ ] 至少 3 位合格 buyer 愿意进入试点或继续价格讨论；否则保持研究状态，不能把功能兴趣升级为购买意向。
- [ ] 产品、销售与支持对主模式、暂缓模式和不可承诺能力给出一致答案。

## BUS-002 · SKU、授权、更新权益、SLA 与责任边界

- 优先级：P1 商业
- 估算：L
- 依赖：BUS-001、DIST-002
- 可并行：许可证与支持模型可并行调查

### 目标

将产品承诺转成可交付、可支持、可停止的商业契约。

### TODO

- [ ] 定义免费/付费能力、用户/团队/企业计量单位。
- [ ] 明确授权、离线使用、更新期限、版本支持窗口和升级权益。
- [ ] 盘点 MIT 根许可证、第三方包、MCP、模型/provider 和数据源许可。
- [ ] 定义支持渠道、响应目标、支持范围、客户责任和不支持事项。
- [ ] 定义数据 controller/processor、客户凭证和外部 provider 责任。
- [ ] 未达到生产准入的能力标 Preview/Experimental，不进入 SLA。
- [ ] 授权失效不能导致用户数据丢失或无法导出。

### 自动验收

- [ ] SKU 只引用成熟度账本里的正式能力。
- [ ] 许可证/来源/SBOM 完整。
- [ ] 权益状态不会绕过本地数据访问与导出权。

### 人工验收

- [ ] 产品、工程、支持和法律/业务 owner 对示例客户给出同一承诺。
- [ ] 完成一次到期、降级、续费和停止支持演练。
