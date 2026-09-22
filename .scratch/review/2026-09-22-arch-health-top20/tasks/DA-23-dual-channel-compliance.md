# DA-23 · 双通道探测合规审计

- 优先级：P1
- 状态：`done`（2026-09-22，EX-07；桶 C 按推荐补守卫 + ADR-0061 勘误已落）
- 依赖：DA-22（已 done，登记处为输入）
- 估算：M
- 来源：2026-09-22 读数②（`connection.api.` 双通道仅 1 个文件 vs `ctx.get(` 22 个，ADR-0061 执行率 22:1）

## Problem

ADR-0061 规定：新应用抽屉读取**可选 host 服务**须双通道探测——`ctx.get('agentPresets')` 与
`connection.api.agentPresets` 都要试，以「是否存在可调用 `select`」为准。但实测执行率 22:1：
大量消费点只走单通道。两种可能：

- 多数消费点消费的是**必选服务**（宿主保证在场），本不需要双通道——纪律被过度泛化或文档不精确；
- 存在消费**可选服务**却只走单通道的点——这是真缺陷（载体换了就静默失败）。

两者混在一起，没有分诊就没有结论。

## 动作

1. 以 DA-22 清单为输入，逐点判定「消费的是否为可选 host 服务」
   （判据：宿主文档声明 optional / 服务方是否可能不在场 / vendor 源码里该服务的注册是否无条件）；
2. 分诊三桶：**该双通道的**（补双通道探测，保守失败态）/**不该的**（在 ADR-0061 或本工单登记豁免理由）/**不确定的**（单独列出交用户拍板）；
3. 修订 ADR-0061 的适用范围表述，使纪律与实际消费面一致（一份事实只有一个家）。

## 验收

- 22 个消费点每个都有三桶之一的具体归类与证据；
- 需要补双通道的点：修改 + 该包测试 + tmp+mv 同步 profile（若命中 file: 硬链接）；
- ADR-0061 修订或登记完成；分诊表落盘在本工单或其链接的唯一 home。

## 注意

- 判「可选」不能靠猜——读 vendor 源码里服务的注册路径，拿注册条件当证据（P-01）；
- 不确定桶**不得**默认放行，按最保守结论走（ADR-0038 同型）。

## 结算（2026-09-22，EX-07 分诊表）

**方法论**：逐点读消费代码的**读法**（undefined 守卫 / try-catch / 无守卫直用）+
**载体语境**（宿主侧 fiber vs 客户端 slot 侧）判三桶。证据 = 每点的实际代码行。

### 桶 A · 纪律本就适用且已合规（1 处）

| 消费点 | 证据 |
| --- | --- |
| `dsh-newapp-local/src/client/launcher.ts` 的 `agentPresets` 探测 | **ADR-0061 决策 1 的原始实现**：探测 `ctx.get`/`connection.api`/`connection.remote` 三载体、以可调用 `select` 为准；probe 写 localStorage（决策 2）。22:1 的「1」就是它——**它是纪律的样板而不是违规者** |

### 桶 B · 不适用双通道，且失败态已保守（17 处，登记豁免）

双通道纪律的**原文范围**（ADR-0061 决策 1 + AGENTS.md 条目）只针对「可选 host 服务
经 `connection.api` 镜像的载体探测」——即「服务可能从多个载体来」的场景。下面这些
不是该场景，且读法各自有明确失败态：

| 消费点 | 服务 | 读法（证据行） |
| --- | --- | --- |
| lute-shell host/index + streams | connection/clientModules/typertGateway | 三者齐查 undefined → 拒绝启动路径；streams 单查 → `503 gateway unavailable`（宿主侧三服务是薄壳自己 provide 的，载体唯一） |
| pair-access ×5（sync-shared 单源） | remoteWebUiPairing | **三层兜底**：`ctx.get(name,false)` → 属性读 → 读不到=拒绝（ADR-0038 样板，2026-09-12 实测教训全写在共享源注释）。`remoteWebUiPairing` 服务由 remote-web-ui 插件 provide，五包刻意不 inject——「配对插件不在场=仅回环」是设计语义 |
| dsh-browser-local | attachments/systemPrompt | `?.` 可选链 + `!== undefined` 守卫，缺服务走降级路径 |
| dsh-deepresearch-local | web | `requireWeb()` 缺服务**抛错**（明确报「mount a search provider」）；platform.ts 探测型读 |
| dsh-theme-local | desktopRuntime/settings | `??` 兜底 + try-catch；settings 只读 describe |
| dsh-qoder-sidebar-local | sessions | try-catch + `typeof list === 'function'` 守卫，缺则 undefined |
| agent-team-gui usage-meter | sessionProjections | try-catch + undefined 双守卫，缺则返回空 async |
| agent-team-gui execution-service | jobs | `backgroundJobsAvailable()` 以 `!== undefined` 暴露能力探测——**消费侧自建的能力探测 API**，双通道的等价物 |

### 桶 C · 不确定，交用户拍板（2 处）

| 消费点 | 服务 | 疑点 |
| --- | --- | --- |
| `dsh-agent-team-gui-local/src/client/index.ts:56-57` | connection / locale | **无 undefined 守卫直接用**。但这是**客户端 slot 侧**（`apply(ctx: ClientContext)`），且 ClientContext 注释自带 TODO：`inject` 在 SlotCore 原型上不存在、运行时来源未证实（ADR-0017 遗留）。客户端运行时的 `ctx.get` 语义（缺服务时返回 undefined 还是抛）**没有实测读数**——若抛，`connection` 缺席会让四个 slot 无声不注册 |
| `dsh-agent-team-gui-local/src/index.ts:75` | systemPrompt | 宿主侧 fiber 无守卫直用。`inject` 名单里有 `systemPrompt`（已声明），注入纪律上合法；但「宿主某版本不提供该服务时 apply 会抛」未实测 |

**处置建议**（待拍板）：桶 C 两处补 `!== undefined` 守卫 + 明确降级路径（成本各半小时），
而不是登记豁免——理由：ClientContext TODO 本身就是未证实的运行时假设，守卫是消除
假设的最便宜手段。**不补也可以**（plugin-entry-contract 已核 inject 名单），差别在
降级体验：抛错 vs 拒绝注册。

### ADR-0061 适用范围修订建议

分诊结论：**22:1 不是「纪律执行率 4.5%」，而是「纪律适用面本来就只有 1 处」**——
其余 21 处消费的可选性语义各自由 undefined 守卫/try-catch/能力探测 API 承担，
与「多载体探测」是两个正交问题。建议在 ADR-0061 后果节补一条勘误式说明
（不改决策）：

> 双通道探测的适用判据：**服务可能从多个载体来**（`ctx` 直挂 vs `connection.api` 镜像），
> 且消费方在载体缺失时需要走不同的回退路径。单载体消费的可选性由
> `ctx.get(name, false)` + undefined 守卫承担（ADR-0038），不要求双通道。

**该修订与桶 C 处置一起等用户拍板后落盘**；拍板前 ADR-0061 与 AGENTS.md 原文不动。

### 拍板与落地（2026-09-22 同日，用户指示按推荐继续）

- **桶 C 两处已补守卫**：client/index.ts 的 connection/locale 加 undefined 守卫 +
  可操作错误（与既有 slots.inject 校验同型）；src/index.ts 的 systemPrompt 加守卫，
  缺席时 warn + 跳过提示段（其余功能不受影响）。
  验收：typecheck 干净、包内测试 66/66 绿、build + 装载点同步（tmp+mv）+
  `sync-profile --check --loadpoint` 27 包一致。
- **ADR-0061 勘误已落**（后果节新增「勘误 · 双通道纪律的适用判据」三段：
  要双通道 / 不要双通道 / 读不到=拒绝或明确报错），决策原文未动。
