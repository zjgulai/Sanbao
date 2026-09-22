# lute-shell-pin 的反向自测进门禁：19 个用例此前谁也跑不到

关联决策：[ADR-0139](../../../adr/ADR-0139.md)（薄壳 pin 判据与 12 个 test fixture 的治理事实）、
[ADR-0014](../../../adr/ADR-0014.md)（判据化与反向自测进门禁）

## Problem

第二批 TOP20 立项（DA-27）时的复核发现一个可达性缺口：`scripts/gates/lute-shell-pin.test.mjs`
**早已存在**（19 个用例，覆盖帧协议常量漂移、双 manifest 版本错位、electron pin 三态、
治理字段、seed 用户层、fixture 跟踪的负例），但 `scripts/gate.mjs` 的 CHECKS 注册表里
**没有它的 selftest 项**——与 DA-07 第二片发现的形态一致（总账 P-04：写了但从没跑到）：
门禁的包级/文件级测试是显式点名式，没有自动发现；CI 只跑 `scripts/gate.mjs`。
判据本体（`lute-shell-pin`）在跑，但它的反向自测面（判据逻辑能否说「不」）不在任何射程内。

## Decision

把既有测试文件接进门禁：`scripts/gate.mjs` 新增 `lute-shell-pin-selftest` 判据项
（`runNodeTestFile`，挂在 `lute-shell-pin` 本体之后），不新增测试逻辑——
19 个用例已经是完整的反向突变面，缺的只是「有人跑它」。

接线承重按惯例用恒真桩突变闭环验证（不是挂名即完成）：

1. 突变 `apps/lute-shell/src/protocol.ts` 的 `FRAME_MAGIC`（`0x44534833 → 0x44534834`）；
2. quick 门禁红读数：`lute-shell-pin` **fail**（failed=1，remediation 点名协议常量面）、
   整体 `exit=1`；selftest 保持绿是正确行为（它用 fixture 测判据逻辑，不读工作树）；
3. 恢复后复跑：`exit=0`，本体 + selftest 双绿（122/125，3 项 skip 为既有形态）；
4. 工作树恢复干净（`git status` 无残留）。

同批完成 DA-28（装载点缺件消融）：装载点删 `dsh-wanzh-hulian/lib/bounded-body.js` →
`profile-files-sync` + `profile-bundle-sync` 双判红（exit=1、点名 `~lib/bounded-body.js`）→
mv 恢复原 inode → check 绿（27 包一致）。两支消融共同验证了第二批的「消融两问判据」
（系统怎么降级 + 哪个判据变红），是 DA-25 重版消融矩阵的方法论前置。

## Alternatives considered

- **不接，登记为豁免**：拒绝——豁免只减不增（ADR-0014），且这是「测试在、射程缺」的
  纯接线成本，不是达标困难。
- **给 gate 加测试自动发现机制**（扫 `scripts/gates/*.test.mjs` 全量注册）：能一次性消灭
  同类缺口，但改变门禁的显式点名契约（每个 selftest 有各自的 remediation 文案与语义），
  属于框架级改动，超出本卡；已登记进第二批 DA-29（32 个未点名 spec 批量接线）的射程。

## Consequences

- `lute-shell-pin` 的反向突变面从「写在那没人跑」变为「每次 quick gate 都跑」；
  gate 项数 125 → 125+1（quick 档可见）。
- 后续给该判据加新声明面时，负例进 `lute-shell-pin.test.mjs` 即自动进射程。
- P-04 的同类存量（42 个包级 spec / 门禁点名 10）仍开放，归 DA-29 批量收口；
  本卡只关掉其中这一处。
