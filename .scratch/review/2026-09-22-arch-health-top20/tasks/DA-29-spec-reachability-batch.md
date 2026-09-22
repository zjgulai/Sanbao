# DA-29 · 测试可达性对账与 quick 策略缺口接线

- 优先级：**P0**
- 状态：`in-progress`（2026-09-23：纠正32个未执行的前提，按实际调用链接线）
- 依赖：无
- 估算：L
- 来源：DA-08 留档读数（42 个包级 spec / 门禁点名 10）；DA-07 第二片已验证单点接线模式；P-04 存量形态

## Problem

全仓 42 个包级 spec 只有 10 个被门禁判据点名——**32 个 spec 写了但没有任何判据会跑到它们**。
这正是 P-04（写了但从没跑到）的存量形态。DA-07 第二片刚证明了单点接线的完整模式与成本：

> 新增 `test/list-response.spec.mjs` 原先不在任何判据射程内；接进 `wanzh-persistence-and-oauth`
> （第 7 个 spec），并以反向突变证明接线承重（旧 6 个 spec 对同一突变 59 pass / 0 fail，接入后具名用例变红）。

## 动作

1. 以 DA-08 的可达性基线读数为分母，列出 32 个未点名 spec 的清单（含所属包与现有判据归属）；
2. 按包组分 4~5 批接线：优先**已有同包判据**的（扩 spec 名单，模式已验证），
   其次需新建包级判据的（套 `changed-packages` 网格）；
3. 每批验收三件：接线后判据绿、**反向突变红**（证明承重，不是挂名）、MASTER-TODO 状态更新；
4. 全部接完后更新 DA-08 的可达性基线读数（分母应变为 42/42 或登记例外理由）。

## 验收

- 32 个 spec 每个有归宿：被某判据点名 / 或登记不接线的理由（如废弃 spec 直接删）；
- 每批的突变红读数留档；
- 最终可达性读数落 DA-08，两份工单交叉引用一致。

## 2026-09-23 调用链复核与修订

旧结论“32 个没有任何判据会跑到”撤回。`gate.mjs:2760-2787` 的 full
`scripts-runnable` 调用29个生产包的脚本（不是只跑变更包），包括以下42个 `.spec.mjs`。
根 `test:gate` 未覆盖 packages 不等于 full 未覆盖 packages。

| 组 | 文件名（均为 test/ 下 .spec.mjs） | quick | 包内/full |
| --- | --- | --- | --- |
| loopx | artifact-integrity、supply-chain-pinned | 未找到执行路径 | 选中 |
| overseas-skills | build-third-party-intake、fullstack-contract、install-fullstack-skills | 显式执行 | 选中 |
| overseas-skills | doc-counts、generic-manifest-skip、host-routes、immutable-supply-chain、intake-promote-writer-roundtrip、layer-icons、no-hero-capsules、org-tree-wiring、org-tree、overseas-skills、profile-sync、role-map、validate-assignments | 经 skill-lines 有环境前置 | 选中 |
| overseas-tools | overseas-tools | 未找到执行路径 | 选中 |
| paper2skills | axis、card-render、code-availability、html-text、secret-scrub、source-code、taxonomy | 未找到执行路径 | 选中 |
| wanzh | atomic-store、list-response、oauth-flow、oauth-routes、persistence-failclosed、persistence-inventory、persistence | 显式执行 | 选中 |
| wanzh | bounded-body、client.visual-contract、supply-chain-integrity、wanzh-hulian | 未找到执行路径 | 选中 |
| preset-lint | preset-lint | 未找到执行路径 | 选中 |
| update | update | 未找到执行路径 | 选中 |
| my-quotes | my-quotes | 未找到执行路径 | 选中 |
| task-board | task-board、visual-contract | 未找到执行路径 | 选中 |

守恒：10 quick显式 + 13 quick条件 + 19仅包内/full = 42。
全部后缀的测试文件分母187，其中185由默认脚本/config选中，2个 browser rc-legacy
按包内README冻结排除。**选中不等于跑过或通过**，本次研究未跑所有包套件。

修订执行切片：先补已确认的策略差异——安全登记表 SEC-RT-001 的
`wanzh-hulian.spec.mjs` 声明 quick，而当前 quick 没有执行入口。复用
`runNodeTestFile`，不创建第二套 runner，不将19个full-only无差别搬进quick。
其他安全登记的 runTier 也必须按执行路径逐项核对后才能关闭本卡。

## 结算（2026-09-23）：SEC-RT-001 接线 + 全表 runTier 逐项核对

### SEC-RT-001 接线（已落地，待提交）

新增 `wanzh-host-contract` 判据（gate.mjs CHECKS），`runNodeTestFile` 执行
`packages/capabilities/dsh-wanzh-hulian/test/wanzh-hulian.spec.mjs`。
反向突变承重证据：`gate-result.test.mjs` 新增注册项测试（pass/fail 双态传播，
34/34 绿）+ 真实 leaf 17/17 绿。修复与 SEC-RT-001 登记一致：host 归一化与
URL 凭证安全行为由 quick 无条件执行。

### 全表核对（11 条 SEC-RT × testFiles 逐项）

判据口径：**无条件 quick 入口** = gate.mjs 某判据 `runNodeTestFile` 点名该文件
（每次 quick 必跑）；**条件 quick** = `changed-packages` 判据在包进入改动射程时
跑该包 test 脚本（glob 覆盖）；**full** = `scripts-runnable`（full-only）按包真跑。

| SEC-RT | testFiles | 无条件 quick | 条件 quick + full |
| --- | --- | --- | --- |
| 001 | wanzh-hulian.spec | ✅ 本轮新接 | — |
| 002 | immutable-supply-chain.test / supply-chain-integrity.spec / supply-chain-pinned.spec / immutable-supply-chain.spec | 1/4（gates/*.test 有 selftest 判据） | 3/4 条件 |
| 003 | env-policy.test | 0/1 | 1/1 条件 |
| 003A | 4× scripts/lib+gate .test | ✅ 4/4 | — |
| 004 | route-guard.test、plugin-routes.test | 0/2 | 2/2 条件 |
| 005 | bounded-body.spec、bounded-body.test | 0/2 | 2/2 条件 |
| 006 | 4× wanzh atomic/persistence | ✅ 4/4（wanzh-persistence-and-oauth） | — |
| 007 | oauth-flow、oauth-routes | ✅ 2/2 | — |
| 008 | session-store.test、policy.test | 0/2 | 2/2 条件 |
| 009 | security-hardening.test | 0/1 | 1/1 条件 |
| 011 | object-store-hygiene.test | ✅ 1/1 | — |

**发现**：6 条登记（002/003/004/005/008/009，共 12 个 testFile）声明
`runTier: 'quick'`，但 quick 无无条件执行入口；实际覆盖 = changed-packages
条件执行（本包改动时必跑，跨包回归不跑）+ full 无条件执行。`security-contract-master`
只审计文件可达性（existsSync）不审计可执行性，故该 gap 对现有门禁不可见。

**覆盖强度论证**：条件路径对「本包安全契约回归」结构上是健全的——改
targetFiles 必使本包进射程。残余 gap = 共享层改动导致跨包 suite 破绿，
quick 抓不到（full 推送前仍抓）。

**处置待拍板**（三选一）：
A. 6 条 runTier 改 `'full'`（与事实一致；full 推送前无条件跑；跨包 gap 接受并登记）；
B. 12 文件全部无条件接进 quick（闭跨包 gap；quick 变重；违反本卡「不搬 full-only」纪律，须逐项论证）；
C. 保持现状 + 新开 P2 工单（登记表继续声明 quick 但事实不符——P-02 形态，不推荐）。


## 注意

- 「挂名不承重」是最危险的假绿：没有反向突变的接线不算完成（DA-07 的核心教训）；
- spec 本身可能过期（对应源码已重构）：先跑一遍，红且合理的修 spec，不是删判据；
- 多会话窗口：每批独立提交，避免大 PR 与同侪改动纠缠。
