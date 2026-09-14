# 精选线接入分类底本：两条恒真断言与一处已存在的词表分歧（ADR-0082）

> 决策记录（ADR-0015 的 Note 侧）。决定本身见 [ADR-0082](../../../adr/ADR-0082.md)。
> 前一条（技能出货面白名单）见 [ADR-0074](../../../adr/ADR-0074.md)。

## Problem

### 触发条件：两个判据从相反方向指着同一件事

`staging/<L2 域>/<slug>/SKILL.md` 是产品侧卡的**实物**，`data/classification.json` 是它的
**分类底本**。两边各自有一条判据：

- `scripts/verify-install.mjs`：占用 `p2s-` 前缀、但底本里没有的目录 = **编外目录**，exit 1；
- S12 消费口闸门 `check-contract-gate.mjs`：契约引用了精选线 id、但技能目录里没有 = `待装线`
  （实测 14 条），并明文写着这是 S5 换底的前置依赖。

两条判据的措辞完全不同，指的是同一件事：**底本落后于实物**。故本次把 vault 精选线独有的
条目接进底本：`classification.json` 1338 → **1390**（+52）。

### 但真正的问题不在数据，在这个 writer 自己的判据上

新写的 `scripts/append-selected-line.mjs` 有两条纪律，它自己也写了两段「断言」来守。
把它们拿去跑，**都是恒真的**：

**① 空循环（首读实测）**

```js
// 底本里已有的条目：逐项确认**没被本脚本改过**
for (const it of cls.items) {
  if (it._provenance?.added_by) continue     // ← 循环体什么都不做
}
```

注释宣称「逐项确认」，而循环体从不往 `problems` 里写东西。把守卫改成 `if (false)` 也照样通过。

**② `--check` 无条件 ✅（实测复现）**

```js
} else {
  console.log('\n✅ 计划与现场一致（--check：无待接入或已幂等）')
}
```

把 `classification.json` 回退到接入前（52 条待接入）再跑 `--check --allow-blocked`：

```
  本次要接入（精选线独有） 52
  …
✅ 计划与现场一致（--check：无待接入或已幂等）
RC=0                      ← 52 条不一致，它说「一致」
```

两条都是 P-02（仪器假绿）的同型形态，而且都长在**「只增不改」这条纪律的守卫位**上——
即纪律写在注释里，机制是空的。

### 顺带核出的第三件事：一处已存在的词表分歧

`data/venue-tiers.json`（PHASE6-S10 的投递副本）的 `tier_alias` 已经定了

```
"workshop": "preprint", "demo": "preprint", "findings": "preprint", "short-paper": "preprint"
```

而 `packages/capabilities/dsh-paper2skills/lib/axis.js:58` 的 `VENUE_LEGACY_PENDING` 仍写
`to: null`，注释是「映射到哪一档是 **S10** 的决策，本模块**不替它决定**」。

**S10 已经决定了，产品侧的读端没跟上。** 更要紧的是：`axis.js` 此刻**还不是**这份文件的
reader——它把 7 档硬编码在 `:42`。所以「按 axis.js 判」与「按投递副本判」现在会给出不同答案，
而两边都读得出东西、都不报错（P-07 一条事实多个家）。

（核对过程中我先按「孤儿资产、`_meta` 自述是假的」判定，去上游核实后**推翻了自己**：
J9 断言与 writer 都真实存在于仓外 `paper2skills-research/scripts/build_venue_tiers.py`，
自带 T9/T9b/T9c 三条自测，实跑 `--check` 全判据通过，副本与 `axis.js` 的 7 档逐字相同。
真实状态是「已投递、待接读」，不是「无人认领」。）

## Decision

1. **只增不改的判据改成真会判红的形式，且先量后写。** 只比两侧 schema 都有的分类事实字段
   （`l3` / `confidence` / `note`）；射程实测 **93 条**，`l3` 93/93、`confidence` 93/93 逐字一致；
   `note` 81 条逐字相同 + 12 条「空 ↔ 占位说明」，按同一事实的两种写法规范化，但把
   「规范化了几条」当**读数**打印。**射程为 0 单独判红**。
2. **`--check` 有待接入即判红**（exit 1），✅ 只在待接入 0 时出现。
3. **第 53 张卡登记为可见阻断，不改名、不隐藏**：`slugFor()` 把全中文卡名折成非法的 `p2s-`，
   在 writer 里改名 = 自造第二套 slug 规则。本次达成 **52/53**，账如实留着。
4. **venue 词表的分歧与「待接读」状态写进 ADR-0082**，接线时两处一起改；本次不假装它已生效。

## Alternatives considered

- **在 writer 里给那张卡编 ASCII slug** —— 用可见缺口换静默错误，否决。
- **把第 53 张移出 staging 以凑齐「底本 = 实物」** —— 把「底本落后」变成「实物缺失」，更难发现，否决。
- **把 `note` 的「空 ↔ 占位说明」也判红** —— 会让判据常红，而常红的判据等于没有，否决。
- **让 `--check` 保持「只出计划、不下结论」** —— 它已经打出了 `✅`，那就是在下结论，否决。
- **本次一并给 `axis.js` 接上 reader** —— 属 S10 的工作包，且要与 J9 的核对方式一起定，否决。

## Consequences

- 底本与实物落差清零：1390 = 1390；新增条目出处可逐条回溯（`_provenance`）。
- 两条恒真断言变成真判据，各带一次 A/B 反向读数：
  - `--check`：0 条待接入 → exit 0；回退底本 52 条 → **exit 1**；
  - 「只增不改」：93 条 × 3 字段，射程与规范化读数每次都打印。
- 未完成的账留着：**52/53**，第 53 张等 `slugFor` 归属方的命名决策。
- 未接线的账留着：`venue-tiers.json` 与 `axis.js:58` 的 `workshop/demo` 分歧。
- 已知未挂：S12 的 13 组 / 27 条变异自测不在门禁射程内（P-04），另行立项。
- 已知死指针：`generate.mjs:73` 与 `lib/contract-gate.js:28` 指向不存在的
  `scripts/check-contract-gate.mjs`（P-09）。
