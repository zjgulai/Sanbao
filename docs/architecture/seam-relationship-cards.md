# 工程接缝关系卡

- 状态：evidence-mapped
- 日期：2026-09-24
- P2 范围：只读取证。没有修改 desktop profile、Lute Shell、DSH Desktop 或 vendor。
- P3 更新：已完成 service-consumption 同行多调用检测器的最小 Red/Green 修复；写入范围只含该检测器及其测试。
- P3.1 更新：已修复 repo-attest 在共享工作区只跳过占位用例的问题；独占 clone 的 10 条见证测试均通过。共享工作区在安静探测后仍有新写者时，不把结果外推为门禁或产品缺陷。
- 上游索引：[子项目工程能力图谱](subproject-capability-graph.json)

## 怎么读这组卡

这五张卡把“包之间看起来相连”的说法拆成可验证的关系。每个结论都标明它是源码或配置读数、装载点读数、运行态读数，还是还需要产品决定。

| 标记 | 含义 |
| --- | --- |
| OBSERVED | 本轮只读检查到源码、受管清单、配置或局部命令输出。 |
| DECLARED | manifest、profile 或登记表中的声明；不表示进程已使用它。 |
| PASS | 本轮运行了所列静态或装载点检查，且该检查本身通过。 |
| UNVERIFIABLE | 本轮没有目标宿主或端到端实机证据，不能外推为功能已可用。 |
| DECISION REQUIRED | 缺少用户的产品主线或语义决定，不能用工程猜测代替。 |

关系卡不是新增架构决策，也不授权实现。它们的作用是让下一次改动能从一个明确的接缝和最小验证开始。

<a id="s0-runtime-composition"></a>
## S0 · Runtime composition / 运行时装配

| 项 | 结论 |
| --- | --- |
| 卡片状态 | 静态与装载点：PASS；DSH Desktop 实机加载与用户行为：UNVERIFIABLE。 |
| 协调 owner | 工程与发布。这是图谱中的协调标签，不是新的人事归属。 |
| 源码 owner | 各包的 luteOwner；根工程治理 owner 为 lute。 |
| profile 生命周期 owner | 未找到仓库内可强制执行的个人或团队映射；UNVERIFIABLE。 |
| 主要来源 | [架构契约](../architecture.md)、[目录墙](../catalog/packages.md)、[profile 覆盖判据](../../scripts/gates/profile-coverage.mjs)、上游 profile 解析器。 |

### 已证实的关系

    受管包源码与 package.json
        -> desktop profile 的 file: 依赖             [DECLARED]
        -> profile node_modules 装载点               [OBSERVED]
        -> dsh.profile.bundles 的有序注册            [DECLARED]
        -> DSH host 的 bundle 解析和 patch 叠加      [源码已读]
        -> profile cordis.patch.yml 的后置叠加       [源码已读]
        -> 已启动进程和用户界面                      [UNVERIFIABLE]

本轮读数：

- 目录墙总数为 30，含根治理包；packages 下实际参与 profile 对照的是 29 个包。
- desktop profile 有 27 条本地 file: 依赖、41 条 bundle 声明；29 个包中，26 个已声明且注册 bundle，dsh-team-hub 只有依赖，dsh-onboarding-carousel-local 与 dsh-paper2skills 未在当前 desktop profile 声明。
- 本轮运行 node scripts/sync-profile.mjs --check --loadpoint，输出为“ok 装载点与仓库源一致（对比 27 个包）”。这是 source 到装载点的字节读数，不是 DSH Desktop 已加载的证明。
- host 的解析顺序使安装包可优先于 profile 同名 bundle；即使装载点字节一致，也不能推论正在运行的 host 选中了它。
- profile 的后置 cordis.patch.yml 可以影响已经列入 bundle 的能力。因此“在 bundles 中”仍不等于“正在活动”。

### 已有契约、失败模式与缺口

| 边界 | 已有拦截或事实 | 仍未被证明的部分 |
| --- | --- | --- |
| 期望集 | profile-coverage 从 file: 声明推导共同分母，坏 JSON、零或缺项会判红。 | 声明正确不代表 host 已选中该包。 |
| 装载点 | profile metadata、files、bundle 三面门禁与 sync-profile 可发现部分文件或字节漂移。 | 静态门禁不能证明旧进程已退出或 bundle 已真正执行。 |
| 交付清单 | package-files-coverage 覆盖运行时模块图遗漏，防止新装时缺文件。 | 不量用户界面和业务结果。 |
| bundle 注册 | host 对无效 bundle 或无 dsh.bundle 的条目会失败。 | 没有发现通用门禁强制“每个带 dsh.bundle 的受管包必须进入 bundles”；这是治理缺口，不是已守住的契约。 |
| 运行时覆盖 | 后置 patch、宿主优先级和进程缓存都可能改变最终行为。 | 本轮未采集 ProfileLayer 解析结果、进程日志、AX 或具名行为探针。 |

### 回退和验证梯子

- 当前 sync-profile 只能把仓库源正向同步到装载点，不是任意历史 profile 的恢复命令。
- 真正修改 profile 前，必须先保存原 package.json、bundle 顺序和对应源码 revision，并取得隔离环境与运行态操作授权。
- L0：受管包发现、dsh.bundle.patch、package-files-coverage。
- L1：file: 依赖、bundle 顺序、26 加 1 加 2 的声明态分类。
- L2：sync-profile 的 loadpoint 检查；本轮 PASS 27 包。
- L3：目标 Desktop 对每个 bundle 的解析路径、patch 叠加和禁用状态。
- L4：重启后的具名功能、AX、截图或行为探针。L3 与 L4 本轮均 UNVERIFIABLE。

### 下一步

在用户指定的隔离宿主中，选择一个单包场景采集 L3 和 L4。不要先改 profile，也不要把此卡的 L2 PASS 写成运行完成。

<a id="s0-service-consumption"></a>
## S0 · Service consumption / 服务消费

| 项 | 结论 |
| --- | --- |
| 卡片状态 | 登记表与已跟踪源码对账：PASS；同行多调用 Red/Green：PASS；运行中服务可用性：UNVERIFIABLE。 |
| 关系 owner | 根门禁由 lute 维护；具体消费者仍由各包自己的 luteOwner 管理。 |
| 主要来源 | [服务消费登记表](../../scripts/gates/service-consumption.json)、[检测器](../../scripts/gates/service-consumption.mjs)、[对应测试](../../scripts/gates/service-consumption.test.mjs)。 |

### 已证实的关系

    git 跟踪的 packages 与 apps 源码
        -> ctx.get(service) 消费点
        -> service-consumption.json 登记关系
        -> service-consumption.mjs 对账
        -> 根 gate 的活动检查
        -> Cordis 的服务存储
        -> 服务实例或 undefined                         [运行态未验证]

本轮执行结果：

- 检测器与登记表对账为 PASS：19 个消费文件、20 条字面量服务、4 个动态消费文件，0 个 violation。
- 现有自测为 PASS：11 项通过。
- 最小反例 ctx.get("web"); ctx.get("settings") 曾只返回 web，证明同一行第二个字面量调用会被漏掉。
- 根因是扫描器在每行只读取一次非全局的字面量正则匹配。P3 已改为枚举同一行全部字面量调用，并补上同行双调用反例。

### 边界

- 这个门禁只回答“已跟踪源码消费了哪些字面量服务，是否登记”。它不记录 provider、装配时间、权限或运行中是否存在服务。
- plugin-entry-contract 是相邻但不同的门禁：它核对裸属性读取和 inject，不替代 ctx.get 消费关系登记。
- 未跟踪源码不在 git ls-files 的扫描范围；动态服务名只能标记 dynamic，无法由静态规则枚举出服务名。
- 可选服务应通过 ctx.get 读取并处理 undefined；裸属性读取的 inject 失败会抛异常。详见 [架构页的可选服务契约](../architecture.md) 与 [ADR-0046](../adr/ADR-0046.md)。

### P3 · 已执行的最小 Red/Green 试点

| 步骤 | 允许的最小范围 | 成功读数 |
| --- | --- | --- |
| Red | 仅在 service-consumption.test.mjs 新增“同一行 web 与 settings、登记表只有 web”的反例。 | 实际得到 12 项中 11 PASS / 1 FAIL；现状错误地判为通过。 |
| Green | 仅在 service-consumption.mjs 枚举同一行全部字面量调用。 | 实际得到 12 / 12 PASS。 |
| 回归 | 未改 registry、gate.mjs、任一业务包、profile 或 DSH。 | 当前静态对账仍为 19 / 20 / 4，0 violation。 |
| 收口 | 已完整运行 pnpm run gate。 | 第一次约四分钟无输出后中止；复跑证明门禁会串行推进但不持续输出，最终为 121/128 通过、4 项失败。service-consumption 与其 selftest 均 PASS；repo-attest-selftest、adr-index、role-preset-source-freshness、adr-agent-records 不在本试点改动范围，故整体仍不是 PASS。 |

现有深度开发计划把 T1-05 放在前置阶段之后。本次修复由用户明确授权；前置 Todo 本身是本轮之外的既有未跟踪文件，未在此批次改写其状态。

### 回退和下一步

试点应独立提交，仅含检测器和测试；若误报，回退该提交即可，不影响 registry、profile 或 DSH 实例。进入 P3 前应确认前置阶段和共享工作区的变更边界。

<a id="s1-work-item-identity"></a>
## S1 · Work-item identity / 工作事项身份

| 项 | 结论 |
| --- | --- |
| 卡片状态 | 现有五类记录的本地身份已映射；统一身份：DECISION REQUIRED。 |
| 统一 owner | UNASSIGNED。不能由工程先替产品指定。 |
| 主要来源 | [P1 图谱路线](../notes/proposed/architecture/2026-09-24-subproject-capability-graph.md)、对应包的 schema 和服务代码。 |

### 当前身份不是同一个对象

| 现有记录 | 已证实的本地权威 | 不可外推的结论 |
| --- | --- | --- |
| Task Board | 项目路径隔离的 UUID 任务树和 revision。 | 不是 Agent Team Run、Research 或 LoopX Goal 的自动主键。 |
| Agent Team | DispatchId、sessionId、可选 sourceMessageId 与 projectKey 的 durable Run。 | projectKey 是 cwd，不是 Task Board ID。 |
| LoopX | SessionId 到 goalId 和 loopxAgentId 的严格绑定。 | 缺失或歧义时 fail-closed，不能降级成普通任务。 |
| DeepResearch | 跨 Session 共享的独立 ResearchProject。 | schema 未证明与 task、dispatch 或 loopx 有 ID 映射。 |
| Qoder Activity | 当前 Session 事件的展示投影；callId 只用于 tool 调用回填。 | 不是持久工作事项 ID。 |

已审查的这些源记录之间没有发现直接 ID 映射；这不是“全仓永远不存在集成”的绝对断言，而是当前可见范围的事实。

### 失败、回退与验证

- 把五种 ID 当成同一个 ID，会造成重复、假完成、错误权限或删除传播。
- Task Board 的父任务删除会递归删除后代；它不能据此删除外部 Run、Research 或 Goal。
- Agent Team 的 active Run 重启会进入 interrupted；LoopX 对缺失或多重绑定拒绝动作；Qoder 的瞬时活动不能当作持久进度。
- 当前没有统一映射，因此也没有可回退的跨系统写入。产品授权前继续保留每个源记录自己的 owner 与生命周期。

下一步需要用户先选择一个 D3 价值流。之后才建立可失败的关系 fixture，覆盖创建、重试、Session 替换、源记录删除、关联失效、权限和审计；最后才进行 Desktop 端到端回放。

<a id="s1-host-portability"></a>
## S1 · Host portability / 宿主可移植性

| 项 | 结论 |
| --- | --- |
| 卡片状态 | 两条宿主路径的静态边界已证实；能力等价、实机运行、数据隔离和出货准备：UNVERIFIABLE。 |
| owner | Lute Shell 的代码与物化边界归 lute；DSH Desktop 与 Lute Shell 间不存在已验证的“无成本替代”契约。 |
| 主要来源 | [ADR-0139](../adr/ADR-0139.md)、[架构契约](../architecture.md)、apps/lute-shell 的 profile 和 host 代码。 |

| 维度 | DSH Desktop | Lute Shell | 当前结论 |
| --- | --- | --- | --- |
| 装配路径 | 受管包经 desktop profile 的 file: 依赖和 bundles。 | seed 物化到 lute-shell profile，再在 profile 内安装并启动 lute-host 子进程。 | 两条路径不等价。 |
| 治理读者 | package collector 与 profile 相关门禁。 | apps 不在 package collector 射程，由 lute-shell-pin 单独守。 | 不可互相借用门禁结果。 |
| 已显式组装能力 | 以 desktop profile 的声明为准。 | 代码只明确组装 dsh-onboarding-carousel。 | 不证明 Shell 具有 Desktop 的受管包集合。 |
| 数据边界 | 本轮未做运行态采集。 | 默认复用 DSH_HOME，ADR 已标明尚未隔离。 | 不能把会话归属或隐私边界视为已经处理。 |

### 失败、回退与验证

- 把 desktop profile、Shell 的 npm pin 或历史 smoke 写成当前双宿主兼容，会把静态事实误作用户可用性。
- 共享 DSH_HOME 可能造成 Session 所属误判或数据串扰。
- 把 apps 误纳入 package collector 的语义，或把 Desktop 包默认迁进 Shell，会掩盖真实装配差异。
- 当前安全回退是保持 DSH Desktop 不变；Shell 失败时停止选择 Shell。清理 Shell profile 或切换 data-home 是外部状态变更，必须另行授权。

下一步是建立“能力包 × Desktop/Shell × declared/installed/bundled/live/用户行为”的矩阵。先在隔离 DSH_HOME 做 materialize、host handshake、目标包装载和数据隔离验证；历史 smoke 不代替本轮结果。

<a id="s2-slot-renderer-boundary"></a>
## S2 · Slot and renderer boundary / Slot 与 renderer 边界

| 项 | 结论 |
| --- | --- |
| 卡片状态 | 当前 pin 的 slot 语义和若干自有注册点已读；真实挂载、视觉、焦点和升级兼容：UNVERIFIABLE。 |
| owner | 上游 DSH/vendor 拥有 shipped renderer 与 slot contract；本仓包只拥有自身注册、数据注入与 disposer。 |
| 主要来源 | [项目红线](../../AGENTS.md)、各表面包的 client 注册代码。 |

### 已证实的分类

| 类型 | 已知行为 | 使用纪律 |
| --- | --- | --- |
| 加性 list 或 chain | 自有内容以独立 id 注册；Task Board、Qoder 右栏、DeepResearch overlay 有此类源码例子。 | 优先选它；登记 disposer、输入和上游 fallback。 |
| single 或 keyed cell | 同一单元会发生 shadow 或 priority 竞争；同 priority 可能失败。 | 仅在确有必要时接管整块行为，并承担升级同步成本。 |
| 没有一级 slot | 例如某些行级或 ChatView 内部需求没有已证实的细粒度接缝。 | 不猜测 slot 存在；转上游扩展或 Lute 自有渲染层讨论。 |

Qoder 的右栏登记和 dispose、Task Board 的 conversation.view 加性注册、DeepResearch 的 shell.overlay 注册是当前可读的自有样例。Agent Team 虽有多个加性 slot 的源码意图，但 ctx.slots.inject 的实际运行态尚未取证，不能写成已成功 mount。

### 风险、回退与验证

- 为小改动选择 shadow 会隐式接管上游完整行为和升级成本。
- priority 冲突、缺少 slot/inject、未 dispose 的重复挂载都可能失败或残留。
- DOM 注入、CSS 哈希或静态注册不等于 renderer 已消费；项目红线也禁止把它们当常规改造路径。
- 加性包的回退应由自身 disposer 撤销注册。当前 pin 的源码描述 shadow 异常时会交还上游，但本轮没有实机验证，不应把它写成已演练的回退。

每个未来表面改动在写代码前必须补一行：slot 名、类型、id 或 key、owner、数据输入、disposer、上游 fallback、静态验证、目标宿主的 mount/交互/卸载/焦点/ARIA 验收。若需 shadow，额外需要原生恢复、priority 冲突、异常 fallback、重复 mount 和升级 pin 变更的负例。

## P2 的出口与下一道门

P2 完成的是证据地图；随后的 P3 只实现了 S0 服务消费的一个门禁盲区：

1. S0 的运行时装配已把声明态、装载点和 live 分开；下一步需要隔离宿主的 L3/L4 证据。
2. S0 的服务消费同行多调用检测已通过定向 Red/Green 修复；全量 quick gate 已完整运行，但整体为 FAIL（121/128 通过、4 项范围外失败），不能写为发布级通过；service-consumption 与 selftest 均 PASS。
3. S1 的工作事项身份和宿主选择都需要产品决定；在此之前不新增统一库、不迁移数据、不切换主宿主。
4. S2 为每次 UI 改动给出先做接缝分类、再谈实现的检查表。

本卡没有 profile 变更或 DSH 操作。后续代码修改仍必须先重新核验共享工作区、明确目标宿主和回退范围。
