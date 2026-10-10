# 选择流前置 ensure：全新 matter 全流程闭合

- 日期：2026-10-11
- 决策：[ADR-0291](../../../adr/ADR-0291.md)
- 状态：已实施（内核新序 + 两半分写入核 + index 装配 + 门禁事实与突变 + 全流程 E2E）；回合收口流待粒度裁决。

## Problem

ADR-0290 D5：context 激活绑定既有 revision，send 时 prepare 无法修复。解法是把 ensure 前移到选择内核。实施中又被 step-10 端到端抓到第二处缺陷：send 时钩子「先栅后判」——已备 matter 也被索要 prepare grant（dispatch E2E 的 protected-effect-denied 拒绝暴露）。

## Decision

1. 选择内核新增可选 ensure 端口：read-authorization 后、current-revision 读前；refused → `revision-ensure-refused`，CAS 不跑；缺省端口=旧行为。
2. 写入核心拆两半：`decideRunRevision`（读库 + current-policy 判，先于 authority 检查）→ `writeRunRevision`（域 authored + 普通幂等 append）；send-time runner 与 selection ensure 共用。
3. 见证：selection=`user-selection`；send=`user-input`。
4. index 以同一身份端口工厂构造 ensure 并接入选择端口。
5. 门禁：ensure 顺序 pin、拒绝停选择 pin、decide-先于栅 pin + 三条突变。

## Alternatives considered

- ensure 置于 CAS 前最后（current-revision 读陈旧）/ 写藏进读端口 / 维持先栅后判 / send 时静默重激活——逐条理由见 [ADR-0291](../../../adr/ADR-0291.md) 备选表。

## Consequences

- 全新 matter 全流程闭合（选择→ensure→绑定→十步链→accepted）；两处缺陷有测试与门禁钉住。
- 未闭：回合收口流（粒度裁决待定）、真实模型调用、WT-02B.3、host-lifecycle、撤销运营。

## Verification

证据（2026-10-11，全部真实执行；未跑的照实写）：

- **选择内核单测**：`test/active-matter-selection.spec.ts` **9/9**——ensure 与链序（identity-session→read-access→revision-ensure→current-revision→…）；refused/malformed/抛错三形态均 `revision-ensure-refused` 且既有 context 不被触碰（CAS 未跑，投影仍是旧 matter）；缺省端口旧序不变。
- **全流程 E2E**：`test/session-prompt-selection-ensure.spec.ts` **1/1**——custody 形态 seed（created + 空 policies revision:1 + insufficient 证据）→ 真选择内核 + 真 ensure + CAS → 投影 revisionId = `revision:sage.<uuid>`（非 `revision:1`）→ 真装配 POST `/.sage/session/send` → `accepted{sessionId:'session:sage.e2e'}`；store 重开复核：两修订、一条 attempt、current = 被绑定的工作修订。
- **家族回归**：prepare + ensure + dispatch + persistence **14/14**（先判后栅修复后 dispatch E2E 复绿）。
- **门禁自测**：`node --test scripts/gates/sage-route-authority.test.mjs` **48/48**（新增：ensure 顺序 pin、拒绝停选择 pin、decide-先于栅 pin + 三条突变；上一刀 pin 随拆分复绿）。
- **typecheck**：0。
- **全量套件**：215 文件 / 1904 通过 / 1 skip（exit 0）。
- **门禁**：`pnpm run gate` 32/32（objects 319/319，exit 0）。
- 未运行：produce（不动 publications）。
