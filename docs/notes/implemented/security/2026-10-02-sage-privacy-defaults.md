# Sage 组合隐私默认：会话日志贡献关断与遥测面登记（K7）

日期：2026-10-02 · 分类：security · 关联 ADR：[ADR-0193](../../../adr/ADR-0193.md)

## Problem

0.2.0-rc.2 的隐私相关默认面在已装闭包中实测为：[research/20 §5](../../../research/20-harness-0.2.0-rc.2-delta.md) 的条目全部兑现——

1. `@deepseek-ai/dsh-session-log-deepseek/lib/index.js:18`：`enabled: z.boolean().default(true).volatile()`——官方 DeepSeek API 请求的会话日志贡献**默认开启**（内容含 message 文本、工具参数与结果、workspace 路径）。
2. web-app `cordis.patch.yml` 的两条 insert：`desktop-product-telemetry`（`dsh-host-product-telemetry-otel`）与 `product-analytics`（`dsh-client-product-analytics`）均 `disabled: !!js "ctx.get('profileContext')?.name !== 'desktop'"`，端点另需 `DSH_PRODUCT_ANALYTICS_OTLP_URL`。
3. `session-telemetry-otel` 以 `mode: process.env.DSH_TELEMETRY_MODE || 'FEEDBACK_ONLY'` 运行，端点 `DSH_TELEMETRY_OTLP_URL` 可覆盖。

Sage 的凭据/隐私纪律：默认不出网、能力不删除但默认关；共享数据根与 `~/.dsh` 零接触（ADR-0159）。

## Decision

1. **D1 关断**：Sage overlay（`config/shell.cordis.patch.yml`）新增 `- id: session-log-deepseek` / `config.enabled: false`（含一行注释指向 ADR-0193）；这是组合层单点动作，不改上游包，不改 seed。
2. **D2 遥测/分析登记**：维持零动作——两行已被 `profileContext` 门控自动关闭（Sage launcher 不提供该值）；把「Sage 启动器不得提供 `profileContext.name === 'desktop'`」写进 ADR-0193 作为约束。
3. **D3 OTel 维持 FEEDBACK_ONLY**：无反馈入口 → 普通活动不可触发；引入反馈面须重审 ADR-0193。
4. **D4 验证方法**：同根第二代重物化后跑 smoke 与 composed-entries 探针（临时脚本 `/tmp/k6-overlay-probe.mjs`，跑完即弃；读数全量录下）。

## Alternatives considered

| 方案 | 结论 |
| --- | --- |
| 改上游包默认值 | 否决；改基座 + 升级即丢（ADR-0008 精神）。 |
| 以「未配置 DeepSeek API 故不触发」为依赖 | 否决；P-02 类靠现状的守卫会静默腐烂。 |
| 一并 disable session-telemetry-otel | 否决；FEEDBACK_ONLY 已等价关闭，改由条件重审守。 |
| 探针落仓/建正式断言 | 留待需要时独立立项；本票以一次性探针 + Note 读数闭环。 |

## Consequences

- **读数（2026-10-02，隔离根 `tmp.fEaCVwelL9`）**：overlay 变更→同根重物化得第二代 generation `7592e8d0`（首代 `8e932755`）；`SAGE_ROOT` smoke **16/16 PASS、零告警**；组合探针 **11/11 OK**——7 个 disable 行 + 2 个 insert + `connection inject=["credentials"]` + `session-log-deepseek config.enabled=false {"enabled":false}`；组合条目 185。提交 `babcbc9`（overlay 一行 + 注释）。
- **探针实现注记**：`readActiveProfile` 是异步函数，读取 active 指针必须 `await`（探针首版漏 await 导致 `overlayPath(undefined)` 报错，修正后 11/11）；后续任何消费该指针的工具同样注意。
- **流程注记（K8 终验抓出并修复）**：K7 提交（`babcbc9`）前只跑了 smoke+probe、未跑全量门禁；K8 终验的 `sage-shell-quality` 抓出 `test/composition.spec.ts` **直接断言真实 overlay**（`config/shell.cordis.patch.yml` 的条目序列）而未同步新行——教训：**改 overlay 必须跑套件**（该测试是有意的真实面读方，非 fixture）。同轮另有 ADR 账本（`docs/adr/decisions.json`，派生面，`node scripts/gates/adr-agent-records.mjs --write` 重生成）与 ADR-0193 链接层级两处红，一并当场修复后三级门禁（quick/full/strict）全绿。
- **行为面**：Sage 组合不再向官方 DeepSeek API 附加会话日志后缀；实例可在本地 patch 层显式重开（能力保留、默认关）。
- **未覆盖/边界**：`DSH_TELEMETRY_OTLP_URL`、`DSH_TELEMETRY_MODE`、`DSH_PRODUCT_ANALYTICS_OTLP_URL` 等 env 覆盖面未设置时相关 exporter 不动作（登记，不逐一 disable）；上游后续版本若新增默认出网面，按 ADR-0192 的增量核对一并重审。
- **重审触发器**：任何 Sage 侧反馈面/遥测消费面引入 → 重审 ADR-0193（尤其 FEEDBACK_ONLY 与 profileContext 门控两条）。
