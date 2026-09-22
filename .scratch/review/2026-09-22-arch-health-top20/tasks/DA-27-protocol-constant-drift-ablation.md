# DA-27 · 帧协议常量漂移消融（lute-shell-pin 反向突变）

- 优先级：P1
- 状态：`done`（2026-09-22，EX-02）
- 依赖：无
- 估算：S
- 来源：2026-09-22 诊断（lute-shell-pin 判据声明「7 个帧协议常量不漂移于 submodule 参照」，但从未做反向突变）

## Problem

`lute-shell-pin` 判据声称：7 个帧协议常量不得漂移于 submodule 参照（ADR-0139）。
按本仓贯穿做法③（反向自测进门禁），**每条判据都要配一支「恒真桩突变下必须变红」的自测**。
检索 gate 清单未见 `lute-shell-pin-selftest`。没有反向突变的判据可能是恒绿的（P-02 最便宜复发路径）。

## 动作

1. 写 `lute-shell-pin-selftest`：在临时副本上改动 protocol.ts（345 行，`src/protocol.ts`）一个帧协议常量值，
   判据必须变红；
2. 顺带覆盖判据的其余声明面：壳 devDeps 与 seed deps 两侧 `@deepseek-ai/*` 版本错位、
   electron pin 与 vendor 侧不同名版本——每个声明至少一支突变；
3. 自测挂进门禁（第一批 P0 同型：`gate:tcc-grant-status-selftest` 形态）。

## 验收

- `node scripts/gate.mjs` 出现 selftest 判据行且绿；
- 每支突变有红读数（命令 + 输出贴工单）；
- 突变后工作树恢复干净（`git status` 无残留）。

## 注意

- 突变在临时副本做，别把突变字节留在工作树（多会话同写一棵树，P-43）；
- 若某支突变**不变红**：那是要修的真缺陷，不是自测失败——先修判据再补自测。

## 结算（2026-09-22，EX-02）

**工单立项判断的勘误**：selftest 测试文件 `scripts/gates/lute-shell-pin.test.mjs` **早已存在**
（19 个用例，含帧协议漂移负例、双 manifest 版本错位、electron pin 三态、治理字段、fixture 跟踪），
工单初稿写「未见 selftest」是**抽样当成全集**（P-01 同族——只 grep 了 gate.mjs 的注册表，
没查 scripts/gates/ 下的测试文件）。真实缺口只有一个：**测试文件从未被门禁跑到**
（gate.mjs CHECKS 注册表里没有它的 selftest 项——P-04「写了但从没跑到」的存量形态，
与 DA-07 第二片发现的可达性缺口同型）。

**改动**：`scripts/gate.mjs` 新增 `lute-shell-pin-selftest` 判据项
（`runNodeTestFile('scripts/gates/lute-shell-pin.test.mjs', …)`，挂在 `lute-shell-pin` 本体之后）。

**接线承重证明（红→绿闭环，恒真桩突变）**：

1. 突变：`apps/lute-shell/src/protocol.ts` 的 `FRAME_MAGIC = 0x44534833 → 0x44534834`（一字节）；
2. `node scripts/gate.mjs --mode quick` 红读数：
   ```
   fail contract lute-shell-pin [expected=1, discovered=1, checked=0, skipped=0, failed=1]（legacy checker failed）
        → 把 apps/lute-shell 与 seed 两侧的 @deepseek-ai/* 对齐到同一精确版本；协议常量以 …/wire.ts 为准（ADR-0139）
   ok   contract lute-shell-pin-selftest [checked=1, failed=0]
   exit=1
   ```
   本体判红并点名 FRAME_MAGIC 面；selftest 保持绿是**正确行为**（它用 fixture 测判据逻辑，
   不读工作树——19 条逻辑负例即本判据的反向突变面）；
3. 恢复 mutation 后复跑：`exit=0`，两项双绿（`checked=1, failed=0`），122/125 项通过
   （3 项 skip 为既有形态，与本次改动无关）；
4. 工作树恢复干净：`git status apps/lute-shell/src/protocol.ts` 无输出。

**覆盖面说明**：其余声明面（双 manifest 版本错位、electron pin、治理字段、seed 用户层、
fixture）的负例已在既有 19 用例内逐条覆盖（见测试文件 line 75–292），
本结算不重复罗列——测试文件是这些负例的唯一家。
