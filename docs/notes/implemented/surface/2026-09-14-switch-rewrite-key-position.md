# 开关重写必须保留键的原位：一条没有读者的不变量，只有字节比对看得见

- 日期：2026-09-14
- 分类：surface（`dsh-algo-skills-local`）
- 相关：[ADR-0083](../../../adr/ADR-0083.md)、[ADR-0041](../../../adr/ADR-0041.md)、
  总账 [P-16](../../../pitfalls-playbook.md)

## Problem

`pnpm run gate:full` 在 `scripts-runnable` 上报红，两个包：

1. `dsh-paper2skills` typecheck 5 处（`lib/contract-gate.js`）；
2. `dsh-algo-skills-local` 2 个用例失败，读数都是 `expected [ Array(145) ] to deeply equal []`。

第 2 条起先被读成「语料漂移：读本机 `~/.dsh/skills`，本机状态与基线不一致」。对这个判断
先做了两次证伪，两次都不成立：

- `corpus-write.spec.ts` 的 `CARDS` 是**动态读**本机全部 `p2s-*` 目录（`installedCards()`），
  没有写死任何数量。当时本机 `p2s-*` 恰好 1390 张，**不是 145**。
- 145 这个数字**等于断言射程全长**，意味着测试射程内的每一张都漂移了。

于是逐张量：1390 张里 **1245 张字节不变、145 张漂移**。漂移的 145 张有一个共同形状——

```
was: disable-model-invocation: "true"      now: rebase_evidence_quotes: "0"
was: user-invocable: "true"                now: rebase_evidence_quotes_total: "0"
was: rebase_evidence_quotes: "0"           now: rebase_evidence_quotes_complete: "true"
was: rebase_evidence_quotes_total: "0"     now: disable-model-invocation: "true"
```

**两个开关键被移动了位置**，值一个没错。

全语料普查（1390 张）确认这不是两个方言并存：

| 形状 | 张数 |
| --- | --- |
| 开关键在 `rebase_*` **之前** | 145 |
| 开关键在 `rebase_*` **之后** | **0** |
| 无 `rebase_*` 键 | 1245 |

即键序现实只有一种——开关在前。漂移集**恰好等于**含 `rebase_*` 的那 145 张。

定因落在 `src/frontmatter.ts` 的 `rebuildFrontmatter`：它把两个开关键从块里**摘掉**，
再**追加到块尾**。这个写法在「开关本来就在块尾」的卡上正确——而那正是组装器
（`assemble-skills.mjs:173-175`）产出的形状，也是写这段代码时看得见的形状。
`rebase_*` 是上游 vault 侧**后来追加**的，追加发生在开关之后，于是这 145 张卡的开关
不再位于块尾，重写就把它们挪到了末尾。

### 为什么它活了下来

- **键序没有任何读者**。`parseFields` 建的是 `Map`，键序不进任何解析结果；值原样往返，
  页面读回来状态正确。整个系统里没有一处会因为键序错而报错。
- **唯一能看见它的是字节比对**，而字节比对只有 `corpus-write.spec.ts` 一处，
  它是对的——只是它按**语料**验证，而 CI / 全新检出上语料不存在，整个 describe 会跳过
  （该文件注释自己写着「worth nothing on a machine with no cards」）。
- `tests/frontmatter.spec.ts` 有「追加键」「CRLF」「幂等」「往返」四类用例，
  **唯独没有「键在块中间」**——纯函数层面的这个空档，正是 bug 从单测漏到语料测试的原因。

### 责任归属（用读数定，不靠印象）

- `corpus-write.spec.ts` 与 `frontmatter.ts` **只在 `b0ba3d5`（2026-09-12）进过一次**，
  之后再没被任何提交改过 ⇒ 不是本轮改动引入。
- 145 张卡 `SKILL.md` 落盘于 `2026-09-13 21:15`（换底安装跑）⇒ 语料先变，
  缺的是**没被跑到**的那个测试：`scripts-runnable` 是 `full` 模式项，而这之前
  `gate:full` 一直因别处报红，第 2 条红被同一读数掩盖。

第 1 条（typecheck 5 处）的定因更简单：`lib/contract-gate.js` 与 `6d6429a`（2026-09-13
S12 提交）**逐字节相同** ⇒ 存量红，同属「`full` 模式没人跑到」。

## Decision

**修写入器，不修测试、不动语料。**

1. `rebuildFrontmatter` 改为**保留原位**：已有的键就地改写、缺失的键追加到块尾、
   重复的键收敛到**最后一次出现**的那个槽位（加载器读的就是那一次）。
2. 补三条**纯函数**单测：键在块中间、重复键收敛到最后的槽位、只缺一个键。
   它们不依赖本机语料，因此把守卫从「环境依赖」变成「在 CI 上也有效」。
3. `lib/contract-gate.js` 的 5 处 typecheck：补 `readContracts` 的 `missing` 与
   `computeLedger` 的 `l3` 两项**真实存在的字段**声明。

   其中一处不是补声明而是**改错声明**：`bySlug` 原本声称存
   `{contract, raw, kind}`，而实际只 push 了 `{contract, raw}`——类型在说假话。
   补齐声明后 TS 立刻指出真实的矛盾，遂把声明改成实情，并把 `?? bySlug.set(...).get(...)`
   换成先取后判空（TS 不跟踪「先 set 再 get」，只能靠再补一个假兜底，那就是把假逻辑写进类型里）。

## Alternatives considered

- **把「字节不变」放宽成「值不变」**：否决。那等于亲手拆掉唯一的守卫，把产品缺陷改写成测试的错。
- **重排 145 张卡的键序**：否决。语料是上游产物的实物（本仓库没有 `rebase_*` 的写入器），
  改数据去迎合代码，下次重装上游产物会把改动洗掉，漂移原样回来。
- **只靠语料测试**：否决。语料缺席即跳过，而这条不变量没有别的读者。
- **只改注释、接受漂移**：否决。没有读者的不变量写在注释里，迟早变成又一次静默改写。

## Consequences

- 实测：修复后全量语料 `UNCHANGED=1390 / DRIFTED=0`；包内 `154 passed`。
- **双面验证**（不接受单面读数）：把「原位改写」退化成旧的「追加到末尾」后，
  **13 条红**（含新增的三条纯函数用例）；还原后 26/26 绿。
  一条只会变绿的测试是没有牙的，这一步就是给牙。
- 门禁：`pnpm run gate` **49/49**、`pnpm run gate:full` **55/55**。
- 残余：块内混用行尾时仍按首行风格归一（既有残余，本次未变）。
- 该函数日后若退回「收集 + 追加」，那三条纯函数用例会在**任何**机器上判红。
