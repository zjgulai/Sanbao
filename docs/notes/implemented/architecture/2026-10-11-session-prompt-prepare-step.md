# T05 prepare 第一刀：受治理的 runner 与端到端发现

- 日期：2026-10-11
- 决策：[ADR-0290](../../../adr/ADR-0290.md)
- 状态：已实施（注册 + 仓库方法 + runner 单元 + send 钩子 + 门禁事实）；选择流编排与全新 matter 端到端属下一刀。

## Problem

七项裁决后实现「进入 revision」。实现中端到端尝试暴露关键事实：custody 出生修订 `revision:1` 无 policies（域注释明示后续修订声明可运行内容）；而 **context 激活时绑定当时的既有 revision**——send 时 prepare 新建修订后，链仍绑定旧 revisionRef → fail closed。另：原「无 revision 才 prepare」语义漏掉 custody 出生修订这一真实主用例。

## Decision

1. 注册 `session.prepare`（local-write 四元组）。
2. runner 语义改为「确保 current revision 声明 send scope」：出生修订/无修订 → 进入新修订；已声明 → not-needed；matter 未知 → not-needed。
3. 写入沿裁决：域 authored、用户输入见证、requirement 投影策略、普通幂等 append、服务签发 `revision:sage.<uuid>`。
4. send 路由先跑 prepare 并尊重拒绝；**不声称完成全新 matter 流**——context 重绑定属选择流前置 ensure（下一刀，含 E2E 与推迟原因）。
5. 门禁：prepare 事实组 + 八条突变；identity 装配 pin 随前端端口常量提升同步。

## Alternatives considered

- 「无 revision 才 prepare」/ send 时静默重激活 context / 同刀改选择流 / runner 第二套前端端口——逐条理由见 [ADR-0290](../../../adr/ADR-0290.md) 备选表。

## Consequences

- prepare 第一刀落地并被门禁与单元钉住；step-10 端到端穿过 not-needed 钩子保持全绿。
- 未闭：选择流前置 ensure（含全新 matter E2E）、回合收口流（侦察已呈报）、真实模型调用验收。

## Verification

证据（2026-10-11，全部真实执行；未跑的照实写）：

- **runner 单元**：`test/session-prompt-prepare.spec.ts` **4/4**——无修订→prepared（append 事件恰一条 revision-entered、appendId/expectedVersion 形状）；已声明 scope→not-needed；**custody 出生修订（空 policies）→prepared（真实主用例）**；存储不可判/文本非法/四端口各态拒绝域；运行中 attempt（修订未声明 send scope）→域拒绝 `session-prepare-declined` 且零 append；matter 未知→not-needed。
- **家族回归**：prepare + dispatch + persistence + 身份路由 **34/34**（step-10 端到端经钩子 not-needed 路径仍 accepted）。
- **门禁自测**：`node --test scripts/gates/sage-route-authority.test.mjs` **47/47**（prepare 八条具名突变：未注册/见证漂移/策略丢弃/端口顺序破坏/拒绝族压平/域拒绝吞并/外部效果面渗透/钩子移除；identity pin 随提升同步）。
- **typecheck**：0。
- **全量套件**：214 文件 / 1900 通过 / 1 skip（exit 0；首跑抓到 `authorization-assembly` 的表键逐字 pin——新 action type 必须是一次刻意修改，已按此更新并复跑全绿）。
- **门禁**：`pnpm run gate` 32/32（objects 319/319，exit 0）。
- **未运行**：全新 matter 端到端（编排不完整，推迟原因见 ADR-0290 D5）；produce（不动 publications）。
