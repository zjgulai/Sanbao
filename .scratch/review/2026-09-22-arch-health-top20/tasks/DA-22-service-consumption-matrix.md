# DA-22 · 服务消费面清单 + 漂移判据

- 优先级：P1
- 状态：`done`（2026-09-22，EX-06）
- 依赖：无
- 估算：M
- 来源：2026-09-22 架构健康诊断读数②（跨包 imports = 0，协作全走 cordis 注入，消费面无静态守卫）

## Problem

图谱显示 29 个受管包在代码层完全解耦（跨包 imports = 0），包间协作**全部**走 cordis 服务注入。
实测 `ctx.get(` 消费点分布在 22 个文件（不含 lib/ 构建产物与 node_modules）。但：

- 没有任何一份「包 × 消费服务」的完整清单；
- `plugin-entry-contract` 只查入口四态（apply/service/library/unresolved），**不查服务消费面**；
- 新增一个 `ctx.get('xxx')` 消费点没有任何判据会注意到它。

即：静态图谱对这条真实耦合干线是盲的（P-04 同族：写了但从没跑到判据面）。

## 动作

1. 扫全部受管包源码（排除 lib/、node_modules、test），产出「文件 → 消费服务名」清单，
   落成 `scripts/gates/` 下的数据文件（类似 jev.residuals.json 的登记处形态）；
2. 写判据 `gate:service-consumption`：扫描结果与登记清单对账——
   **新增消费点未登记判红**（登记处只减不增不是本判据的约束，新消费点允许登记后通过）；
3. 按第一批 P0 模式配反向自测（恒真桩：注入一个未登记的 `ctx.get('fake-svc')` 必须变红）。

## 验收

- 登记清单覆盖 22 个实测文件，逐条有真实扫描读数（不是回忆，P-01）；
- `node scripts/gate.mjs` 出现新判据行且绿；反向突变红；
- DA-23 / DA-24 复用本清单作为输入。

## 注意

- 扫描须区分 `ctx.get(name)` 与 `ctx.<name>` 属性读（后者对未 inject 服务会抛，ADR-0038 语义不同）；
- 消费服务名来自字符串字面量，注意隔着解释器写字面量的旧坑（P-05 形态：别只 grep 一种写法）。

## 结算（2026-09-22，EX-06）

**产物**：`scripts/gates/service-consumption.json`（登记处，19 文件 / 20 字面量服务 / 4 动态文件）
+ `scripts/gates/service-consumption.mjs`（扫描器 + 对账纯函数）
+ `service-consumption.test.mjs`（11 用例 selftest）+ gate.mjs 注册两项。

**范围决策**：`ctx.<attr>` 未防护属性读不进本判据——plugin-entry-contract 已覆盖
（apply 型核对 inject 名单与未防护 `ctx.<服务>` 访问），不重复设卡。本判据聚焦
`ctx.get('名字')` 字面量消费面，这是图谱证实「跨包 imports = 0、协作全走注入」后
真正的静态盲区。动态消费（`ctx.get(<非字面量>)`，4 个文件）登记 `dynamic: true`，
静态不可枚举是已知边界、note 里声明。

**登记基线读数**（git ls-files 403 个源文件扫描）：
`connection`×2 · `web`×2 · `remoteWebUiPairing`×5 · `systemPrompt`×2 · 单点：`attachments`、
`locale`、`jobs`、`sessionProjections`、`desktopRuntime`、`settings`、`sessions`、
`clientModules`、`typertGateway`（薄壳 2 文件）。**双通道（connection.api.）确实只有
launcher 一处走**——DA-23 的 22:1 立项依据由这份清单固化。

**接线承重（突变红→恢复绿）**：往 `dsh-theme-local/src/index.ts` 追加
`ctx.get("brand-new-fake-service")` → 判据 fail，点名「消费服务 "brand-new-fake-service" 未登记」
→ 恢复 → 绿（19/20/4 读数复原）。

**突变发现的判据自身缺陷（已修）**：第一版服务名正则 `[A-Za-z_$][\w$]*` 不匹配连字符——
带连字符的服务名会被**静默漏扫**（当前 20 个真实服务名恰好全是 camelCase，基线不暴露）。
突变用的名字恰好带连字符才当场现形。已修（正则加 `-`）并固化为 selftest 用例
「keeps hyphenated service names (mutation-discovered blind spot)」。
这是「没有反向突变的接线不算完成」的第三次实证（前两次：DA-07 第二片、DA-27）。

**门禁读数**：quick gate `exit=0`，`service-consumption` + `service-consumption-selftest`
双绿，127/130（3 skip 为既有形态）。
