# 服务消费面进门禁：跨包 imports 为零之后，剩下的耦合干线第一次可见

关联决策：[ADR-0011](../../../adr/ADR-0011.md)（五组能力布局）、[ADR-0014](../../../adr/ADR-0014.md)（判据化与反向自测进门禁）

## Problem

2026-09-22 深度诊断的图谱读数：跨包 imports = **0**——29 个受管包在代码层完全解耦，
包间协作全部走 cordis 服务注入（`ctx.get(name)`）。这条真实的耦合干线没有任何静态守卫：
`plugin-entry-contract` 只查入口四态与 `ctx.<attr>` 属性访问的 inject 名单，
**`ctx.get('名字')` 的消费面不在任何判据射程内**——新增一个消费点（新包依赖宿主新服务）
无人察觉，直到运行时静默失败。

## Decision

建立登记处 + 对账判据（jev.residuals 同型）：

1. **登记处** `scripts/gates/service-consumption.json`：19 个消费文件 / 20 条字面量服务 /
   4 个动态消费文件（`ctx.get(<非字面量>)`，静态不可枚举，标 `dynamic: true` 声明边界）。
   基线扫描读数：`remoteWebUiPairing`×5、`connection`×2、`web`×2、`systemPrompt`×2、
   单点 8 个；双通道（`connection.api.`）确实只有 newapp launcher 一处——DA-23（双通道
   合规分诊）的 22:1 立项依据由这份清单固化。
2. **判据** `gate:service-consumption`：四个方向对账（新文件未登记 / 新服务未登记 /
   陈旧服务 / 陈旧文件）+ 动态标志核对 + 空登记处/读不到判红（P-02）。
3. **selftest** 11 用例进门禁（`gate:service-consumption-selftest`）。

**接线承重与突变发现**：突变（追加 `ctx.get("brand-new-fake-service")`）第一轮**没有变红**——
当场暴露判据自身缺陷：服务名正则 `[A-Za-z_$][\w$]*` 不匹配连字符，带连字符的服务名会被
静默漏扫（当前 20 个真实服务名恰好全是 camelCase，基线不暴露；突变名恰带连字符才现形）。
已修（正则加 `-`）并固化为 selftest 用例。这是「没有反向突变的接线不算完成」的第三次实证
（前两次：DA-07 第二片的 spec 接线、DA-27 的 selftest 接线）——三次里两次的缺陷都藏在
「正则/判据对某类合法输入失明」，值得作为后续判据评审的固定检查面。

**范围边界**：`ctx.<attr>` 未防护属性读不进本判据（plugin-entry-contract 已覆盖，不重复设卡）；
扫描用行级注释跳过近似而非 AST 解析（note 里声明）；本判据不裁「该不该消费」——
那是 DA-23 / ADR-0038 的人裁决面。

## Alternatives considered

- **AST 解析扫描器**（tree-sitter）：精度更高但引入依赖与维护面；行级近似 + 边界声明
  已覆盖当前全部真实形态（19 文件零误报），等出现近似法漏报的实际案例再升级。
- **把消费面写进各包 package.json（如自定义字段）**：登记处离代码远一层，漂移判据
  仍要扫描器；集中登记处的对账成本更低，与 jev.residuals 形态一致。

## Consequences

- 「包 × 消费服务」从不可见变为每次 quick gate 对账；新消费点不登记判红，
  登记动作本身就是在回答「这个包依赖宿主的什么」。
- 后续 ADR-0061 双通道分诊（DA-23）与可选服务失败态抽查（DA-24）有了共同输入：
  这份登记处。
- 若未来出现连字符以外的命名形态（如空格、作用域前缀），扫描器正则需同步扩——
  selftest 的 hyphenated 用例是这条边界的看门例。
