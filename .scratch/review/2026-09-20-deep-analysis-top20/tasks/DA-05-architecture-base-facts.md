# DA-05 · architecture.md §1 基座事实节更新（已核实落后一次迁移）

- 优先级：P0
- 状态：`open`
- 依赖：与 DA-12 同批
- 估算：S
- 来源：本次实测；报告 TOP20 #5

## Problem

`docs/architecture.md` §1 标题仍写「双基座：生产 2.0.4/alpha.1 · **发行 2.0.0=2.0.5/rc.1**」（节头注「2026-09-10 更新」），而同仓的权威读数：
- `vendor/dsh-desktop.pin`：`upstream-tag: v2.0.10`、`lute-branch: lute-v2.0.10`、`harness-runtime-source: …（0.1.5-rc.2 物化）`（checked-at 2026-09-17）；
- `packaging/release/2.5.0/VERSION`：`DSH_BASELINE=2.0.10 / DSH_RUNTIME=0.1.5-rc.2`，且 2.5.0 已发布（CHANGELOG 2026-09-18）。
即该节落后**一次完整基座迁移**——P-14（描述产物形态的断言没有与产物绑定）的现场实例。

## 动作

1. 更新 §1 两行事实：发行线版本 → 2.5.0 / DSH 2.0.10 / runtime 0.1.5-rc.2；
2. 生产机现状：与 DA-12 实测结果同批写入（未升级则写「未核实/灰度滞留 + 计划」，按 P-01 写法：拿不到读数就写「未验证」，不出货面）；
3. 复核该节其余数字（补丁数、smoke 分母）与实际读数对表。

## 验收

- §1 数字与 `vendor/dsh-desktop.pin` / `2.5.0/VERSION` 逐项对表一致；
- `pnpm run gate` 全绿（docs 相关项重点看）；

## 注意

同批核对 docs 中其他引用「2.0.5」的历史位置——按「指向运行时的家 vs 历史快照」分类处理，不要一刀切改（历史 Note/ADR 不动）。
