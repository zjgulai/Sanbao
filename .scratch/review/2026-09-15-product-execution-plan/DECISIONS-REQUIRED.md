# 实施前需要用户确认的决策

这些选择会改变架构、权限、安全、UX、兼容性、外部账号或商业边界，不能在未来实施时由执行者自行假设。

## DEC-001 · 产品发行模式

### 问题

下一阶段的目标是内部可信分发，还是公开生产级 macOS 产品？

### 选项

1. 内部可信分发：允许明确记录的自签、可信 LAN 和人工支持限制。
2. 公开生产发行：Developer ID、公证、TLS、多用户权限、自动更新信任链和客户级文档成为硬门槛。
3. 双轨：内部 channel 保留快速验证，stable channel 采用公开生产标准。

### 推荐

选择双轨，但所有对外文案、公开 GitHub Release 和客户 stable channel 必须采用公开生产标准；内部产物使用不同 channel、名称和状态，不能进入正式发布链。

### 需要用户回答

- 哪一个 channel 是未来 90 天的主目标？
- 当前 GitHub Release 是否已经被视为面向外部客户的正式交付？
- 是否允许内部 channel 使用自签产物？

### 决策影响

直接决定 SEC-RT-009、DIST-002..004、REL-003/004 的门槛和优先级。

## DEC-002 · 主要用户与三条北极星任务

### 问题

跨境业务人员、AI 团队负责人、知识工作者和平台管理员中，谁是第一优先用户？

### 推荐定位

“面向跨境业务及 AI 原生团队的本地 AI 工作台：选择岗位或小队，连接业务数据与系统，完成一项可追踪、可恢复、可验证的业务任务。”

### 建议候选任务

1. 跨境研究任务：选择岗位/小队，连接公开情报或业务数据，产出带证据的市场/竞品结论。
2. 店铺运营任务：连接 Shopify/知识库，完成只读诊断或有确认门槛的运营动作。
3. AI 团队任务：创建小队，运行多阶段任务，观察质量门禁、恢复和最终交付物。

### 需要用户回答

- 未来一个版本只优化哪三条任务？
- 第一优先是个人工作台还是团队协作？
- “跨境电商”是垂直产品楔子，还是技能包示例？

### 决策影响

决定 PROD-001..006、信息架构、onboarding、产品指标和商业形态。

## DEC-003 · Team Hub 信任区

### 问题

Team Hub 是仅本机、可信 LAN 辅助工具，还是正式多用户服务？

### 选项

1. Loopback-only：默认 `127.0.0.1`，不对其他机器开放。
2. 可信 LAN：显式开启，明确风险，仍不承诺不可信网络安全。
3. 正式多用户：TLS、Secure cookie、限速、CSRF、default-deny 路由、审计、session 生命周期全部成为发布硬门槛。

### 推荐

默认 loopback-only；在正式多用户契约完成前，LAN 模式必须显式开启并持续显示风险。若 Team Hub 是商业核心，直接选择正式多用户路线，不继续扩大 permissive proxy。

### 需要用户回答

- 当前是否已有非管理员用户在第二台机器上使用？
- 是否存在公网、VPN 或跨网段部署？
- 哪些插件能力应该对 member 开放？

### 决策影响

决定 SEC-RT-004、008、009 的 scope 和 P0/P1 等级。

## DEC-004 · Telemetry 与产品指标策略

### 问题

产品是否允许向远端发送匿名安装/使用指标？

### 选项

1. 完全禁用远端 telemetry，只保留本地 health/support bundle。
2. 明确 opt-in：默认不发，用户了解字段、目的、保留和退出方式后开启。
3. 默认开启但可退出：需要更高透明度、法律与产品论证。

### 推荐

先选择明确 opt-in。在数据合同、隐私说明和真实网络行为闭合前，删除或禁用任何无人调用但文档声称存在的 telemetry。

### 需要用户回答

- 是否允许随机 install ID？
- 是否采集版本、channel、安装/启动/升级结果？
- 是否明确禁止会话正文、prompt、凭证、路径和 IP 持久化？
- 数据由谁控制、保留多久、如何删除？

### 决策影响

决定 PRIV-001..003、OBS-002 以及对外隐私说明。

## DEC-005 · Developer ID 与签名迁移窗口

### 问题

何时获得 Developer ID Application 证书，并接受一次性 TCC 重授？

### 推荐

如果计划继续公开 GitHub Release，尽早安排 Developer ID；先完成 feed 和只读更新提示，但在公证前禁止自动安装。

### 需要用户回答

- Apple Developer 账号和证书 owner 是谁？
- 预计哪个版本切换签名身份？
- 哪批用户参与 TCC 重授灰度？
- 证书、notary credential 和 CI secret 由谁托管？

### 决策影响

决定 DIST-002..004 的时间点和 stable channel 发布资格。

## DEC-006 · 能力成熟度账本

### 问题

谁拥有“能力已到什么阶段”的唯一事实？

### 推荐状态

```text
Declared
→ Installed
→ Loaded
→ Configured
→ Connected
→ Outcome-verified
```

失败状态必须独立表达，例如 `blocked`、`degraded`、`expired`、`not-authorized`，不能被折叠成未安装。

### 需要用户回答

- 粒度是 package、feature、connector、tool 还是业务 task？
- 哪些状态由机器写，哪些由人工批准？
- `Outcome-verified` 的有效期和重新验证条件是什么？

### 决策影响

决定 PROD-002、onboarding、信息架构、客户文案和效果评估。

## DEC-007 · GitHub 与 Codeup 的权威关系

### 问题

发布必须同时满足 `origin/main`、`codeup/main`、`codeup/master` 和两端 tag 一致吗？

### 推荐

指定一个 release authority，其余远端是强制镜像还是 best-effort 备份必须写清楚。若任何镜像不一致会阻塞发布，就把它写进 machine-readable release state；否则不要在 SOP 中声称双端完全闭合。

### 需要用户回答

- `codeup/master` 是否仍是有效发布分支？
- GitHub 还是 Codeup 是 tag/Release 的最终权威？
- 一个镜像不可用时，是否允许发布？

### 决策影响

决定 REL-005、REL-006 和统一发布编排。

## DEC-008 · 商业产品形态

### 问题

项目最终是内部平台、开源本地平台、垂直跨境产品，还是企业部署与治理产品？

### 推荐

在三条核心任务完成效果验证后再选择，不先根据当前技能和系统数量设计 SKU。

### 需要用户回答

- 收费对象是个人、团队还是企业？
- 收费价值是软件、连接、能力包、治理还是支持？
- 哪些能力必须开源，哪些可形成付费边界？

### 决策影响

决定 BUS-001/002、账号授权、更新权益、SLA 和数据责任。

## DEC-009 · 第三方技能与动态运行时代码的准入策略

### 问题

GitHub skill、npm MCP 和 PyPI runtime 是否可以在没有不可变版本、逐文件完整性、许可证与人工批准记录时进入 live profile，或被模型自动调用？

### 选项

1. 严格准入：默认进入隔离区，完成不可变来源、digest、许可证、能力/权限与人工审核后才 promotion。
2. 分级准入：纯文本且不可执行内容可走简化审核；含 scripts、commands、network、filesystem 或 credential 能力的单元走严格审核。
3. 开发机宽松：允许 owner 在本机临时加载，但不得进入 tracked preset、正式 profile 或任何 release；界面必须持续标记 unreviewed。

### 推荐

采用 2 + 3：正式链路使用分级准入，个人开发实验可以临时加载但保持隔离和明显状态。所有新来源初始为 `quarantined`，默认禁止模型自动调用；批准必须绑定 resolved commit 与逐文件 digest，来源变化后自动失效。

### 需要用户回答

- 谁可以把 `quarantined` 提升为 `approved`？是否需要第二人复核？
- 哪些文件形态或能力必须进入严格审核？
- MIT 等宽松许可证是否仍需保存 LICENSE/NOTICE 与来源 commit？
- 哪些第三方技能允许模型自动调用，哪些只能由用户显式触发？
- 个人实验状态是否允许写入 `~/.dsh/skills`，还是必须使用独立 profile？

### 决策影响

直接决定 `SEC-RT-002`、`SEC-RT-003A`、`QG-010`、`QG-011` 的准入字段、promotion 条件、agent-fullstack 白名单调用语义，以及 release skill snapshot 的硬门槛。

## DEC-010 · Runtime artifact 与发布输入的权威来源

### 问题

像 Settings Shell 这类 `package.json` 指向生成后 `lib/*` 的包，应提交构建产物，还是由 clean checkout 的受控 pipeline 构建？正式发布是否允许继续从 live profile 和 `~/.dsh/skills` 现场取件？

### 选项

1. Track artifacts：提交 deterministic `lib`，门禁核对 source/build artifact 一致。
2. Build artifacts：只提交 source，CI/release 在锁定 toolchain 的 clean checkout 中构建并生成 manifest。
3. 混合：每个包明确 `artifactPolicy`，但正式 release 最终只消费同一次 clean build 的冻结 staging snapshot。

### 推荐

采用 3，并强制“一个包只有一个声明过的 artifact policy”。无论是否跟踪 `lib`，正式发布都不得把开发机 ignored 产物、live profile 或 live skills 当作唯一来源；它们只能作为 E4/E5 对照面。

### 需要用户回答

- 哪些包必须跟踪预构建 artifact，哪些必须由 pipeline 构建？
- release authority 是 Git checkout + lockfile，还是另一个可复算的 artifact registry？
- live profile 与仓库构建产物不一致时，是阻断发布还是允许显式 override？
- 是否接受为正式发布建立独立、只读的 staging snapshot？

### 决策影响

直接决定 `QG-003`、`REL-001`、`REL-002`、`REL-009` 的 Settings clean-build、package entry gate、profile/loadpoint digest、skill snapshot、DMG provenance 与 clean-machine 验收。

## DEC-011 · My Quotes 本地全文索引与既有数据迁移

### 问题

“我说”是否可以默认扫描所有会话并建立第二份全文索引？已经存在的 `~/.dsh/my-quotes` 数据如何向用户披露、保留或删除？

### 选项

1. 明确 opt-in：默认不扫描；用户看见范围、路径、保留期和模型传输规则后开启。
2. 默认本地开启：必须在首启明确披露，并提供即时停用、清空、范围与保留期控制。
3. 不保存全文：只保存脱敏摘要或不可逆索引，打开原会话时再读取正文。

### 推荐

新用户采用 1；对已有索引执行一次迁移提示，在用户选择前停止后台增量扫描，不自动删除也不继续扩张。AI 分类另设独立、逐次可理解的外发确认，不能用“本地索引已同意”代替。

### 需要用户回答

- 默认允许扫描哪些项目、会话类型和时间范围？
- 默认保留多久，删除是逻辑删除还是安全删除派生文件？
- 既有索引在用户未选择前保留、隔离还是删除？
- AI 分类可发送的最大片段、允许的 provider 和批量上限是什么？

### 决策影响

直接决定 `PRIV-002`，并影响 `PROD-003` onboarding、`OBS-001` support bundle、迁移提示、数据删除测试和隐私说明。

## 决策记录模板

```markdown
### DEC-XXX 结果

- 日期：
- 决策者：
- 选择：
- 原因：
- 接受的代价：
- 会改变决定的新证据：
- 影响任务：
- 是否需要正式 ADR/Note：
```
