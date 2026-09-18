# Kami 入库：第三条线第 16 条走真管线，以及走管线才踩到的两个沉睡缺陷

> 分类：capability · 生命周期：implemented · 关联决策：[ADR-0119](../../../adr/ADR-0119.md)（登记必须走机制，不走笔）
> 前置：通用技能线与 `gate:skill-lines`（[ADR-0085](../../../adr/ADR-0085.md)）、来源留底与运行时前提层（[ADR-0086](../../../adr/ADR-0086.md)）
> 落地位置：`dsh-overseas-skills/manifest/{intake-provenance,runtime-deps,runtime-deps.overrides,generic-skills,taxonomy-v3,skill-icons-gn}.json`、
> `dsh-overseas-skills/lib/catalog.js`、`scripts/{intake-lib,promote-intake-batch,build-generic-manifest}.mjs`、
> `staging/{intake-localize,intake-repairs}.json` + `staging/translations/kami.body.md`（三者不入库，见 §Consequences）、
> `scripts/role-presets/generate.mjs`（产物重生成）、`dsh-overseas-skills/docs/maintenance-sop.md` §12.11–12.13

## Problem

`kami`（纸感排版系统，来源 `github.com/tw93/Kami` 的 `skills/kami/`，MIT，v1.15.0 @ `6b39d04`）
在本机已经存在一版**手装**的副本：`~/.dsh/skills/kami/` 111 个文件齐全、字体已下到
`~/.local/share/fonts/kami/`、断网渲染实测通过。但它是**手装**的——没有走
`intake-install.mjs`，于是：

1. `manifest/intake-provenance.json` 里没有它 → 「这批来件的逐文件 sha256 / 许可证结论 /
   已应用修补」这条事实链在它身上断开，升级比对与回滚没有依据；
2. `manifest/runtime-deps.json` 里没有它 → `gate:skill-runtime-preconditions` 的射程
   **静默地**不含它（该门禁的判定范围是「清单里有声明 ∩ 已接线」，清单里没有就查不到，
   而读数只会显示总数小一，不会显示漏了一条，P-11）；
3. 它不在任何 preset 的 `skill-subset` 里 → 对 50 个岗位会话而言等于不存在。

把它纳入门禁有两条路，本记录的核心决策就是在这两条之间选，以及**选了之后才发现的两个缺陷**。

## Decision

**① 登记必须走机制：把来件放回 `~/Downloads/skills/<批次>/<nested>/`，跑 `intake-install.mjs --force`。**

手写一条 provenance 条目会产生 `intake-provenance.json` 的**第二个写入者**，而 `repairs` /
`lintWarnings` 这两个字段只能由安装器**量**出来、不能由人**断言**——手写等于把一个未经
验证的事实钉进事实源（P-02）。走管线的成本是三条声明（`BATCHES` 一条、`intake-repairs`
一条、正文覆盖一份），换来的是真 lint 读数、真实逐文件 sha256、以及**可复现的安装路径**。

新增批次登记（`scripts/intake-lib.mjs` 的 `BATCHES`）：

```js
{ dir: "Kami", source: "kami", nested: "skills" },   // 上游形状是 <仓库>/skills/<技能>
```

`source` 取 `kami` 而不是 `github`：这一批的全部含义就是那一个上游仓库，而批次名会一路流到
技能 frontmatter 的 `metadata.batch`、provenance 的 `batch` 与设置页的来源标签。

两条本地偏离各走管线**已有**的通道，不为这条技能新开机制：

| 偏离 | 通道 | 内容 |
| --- | --- | --- |
| 正文含 DSH 侧的「第 −1 步 · 运行时前提」段 | `staging/translations/kami.body.md` | 正文覆盖（安装器本来就有的汉译/覆盖路径） |
| `scripts/verify.py` 的字重归并表缺 Adobe 的 `Medi` 缩写 | `intake-repairs.json` 的 `rewritePaths` | 一条**恒等替换**，只动一个 token |

**② 第 16 条 T0 的判据沿用 TOOL_ONLY，与 `minimax-pdf` 同判。**
Kami 是排版与格式产出形态：它决定**怎么排**，不决定**排什么**（不选品、不归因、不下经营判断），
文档里的结论与数字全部来自内容提供方。两者不互相替代的理由（minimax-pdf 走令牌化 PDF 与
表单填写，Kami 走模板族与落地页）写进 `noRoleReason`，与其余 15 条同一处。

**③ 顺手修掉走管线时踩到的两个沉睡缺陷，并把「还没变成机制」的那半写清楚。**

## Alternatives considered

- **手写 provenance 条目**（把安装器会填的字段照形状补上）。否决：它让 `intake-provenance.json`
  有两个写入者，且 `repairs` / `lintWarnings` 变成人的断言。判据一旦可以被绕过，
  下一个人不会知道该信谁。代价也不对称——走管线只多三条声明。
- **把 `intake-install.mjs` 改造成「就地登记已装技能」**（读 `~/.dsh/skills/kami` 直接算 sha256）。
  否决：它把「来源单元」这个概念换成「当前落盘的副本」，而 sha256 的意义恰恰是**相对来件**的
  比对基准。改完之后上游升级就没有参照物了。
- **不登记 provenance，只在 `runtime-deps` 与 T0 里加名字。** 否决：那样门禁会绿，
  但「这条技能从哪来、被改过什么、上游升到哪一版」三个问题都没有家。绿灯会被相信，
  而它保护的东西根本不存在。
- **为「中文字体在不在」新增一条门禁判据。** 本轮**未做**（见下 Consequences 的诚实划界）：
  `runtime-deps.json` 的 schema 只有 `python` / `cli` / `node` 三类，加 `fonts` 要同时改
  扫描器、`--check` 分支与门禁三处，属于新增机制而不是登记。本轮先把缺口写进 SOP §12.13
  与 provenance 的 `knownGaps`，不冒充已覆盖。

## Consequences

**取证（全部一手，命令与读数）**

```
来件 → 安装                 111 个文件 · 已汉译 · [修补 丢0/改1/生0] · lint 警告 0
逐文件比对（排除 __pycache__）111 = 111，无单侧文件；相对上游只有 SKILL.md 与 scripts/verify.py 变了
SKILL.md 正文                与手装版逐字节相同（44,381 B）——四件套重生成没有吃掉正文
scripts/verify.py            与手装版逐字节相同（一条 rewritePaths 恒等替换还原了它）
Kami 自检（断网，URL 实测 Connection refused）
                             --check-fonts: CJK 正文由 TsangerJinKai02 绘制（359 个表意字）
                             --check-placeholders: no placeholders ｜ --check-style: no style drift
门禁射程                     verify_static: 已接线 297 条 / 需探测 6 条（原为 296 / 5 —— kami 进射程）
                             scan --check --subset kami: red 0，soft 仅 mathjax(optional)
接线 diff                    50 个 agt-* 每个恰好 +1、移除 0、新增并集恰为 {kami}、总条目 1189 → 1239
通用线闸门                   16/16 已装 · T0 16 条在 50/50 个岗位逐字回读命中 · 图标齐备
保真校验                     L1–L12 全闭合，断言 5106 → 5156（每岗 +1 条技能引用）
```

**闸门能说「不」（接线之前的反向取证）**：清单改到 16 条、preset 尚未重生成时，
`verify-generic.mjs` 报 `✗ 通用线未达标：50 项`，逐岗点名 `agt-001…agt-050 缺 kami`，`exit 1`。
这条判据不是恒绿的。

**两个沉睡的缺陷（都已修）**

1. **`promote-intake-batch.mjs` 对任何输入都退出 2。** 它的写盘前自检要求「零改动往返逐字节
   相同」，而 `WRITERS` 里 `fullstack-skills.json` 与 `taxonomy-v3.json` 的 writer 少写尾随
   换行。**自检挡住的是它自己**：该工具自那两份文件成形起就没成功跑过一次，因为没有调用方
   而无人察觉（P-03「写了但从没跑到」的同族）。修法是两个 writer 各补 `+ "\n"`。
2. **重跑安装会把已占位化的机器路径还原。** `intake-install.mjs` 每次用 `FROM` / `VENV_PY`
   重写两份 manifest 的 `_meta`，而入库形态是发布期 `rewrite-build-paths.mjs` 处理过的
   `__SKILL_INTAKE_SOURCE__` / `__DSH_HOME__`。实测这一轮 `_meta.from` 从占位符变回
   `/Users/lute/…/Downloads/skills`，`sourceUnit` 与 `venvPython` 同样（ADR-0056 机器路径只减不增）。
   本轮靠人工重新占位化收口；**当前没有任何判据在读这两份 manifest 里的机器路径**，
   所以处置仍是流程性的——这一点已写进 SOP §12.13，不冒充已落地机制。

**诚实划界**

- **「中文字体在不在」没有门禁在读。** 它进不了 `runtime-deps.json` 的三类 schema。
  缺字体的症状是 P-02 最隐蔽的形态（退出码 0、PDF 也生成了，坏的是交付物）。目前只有技能
  自己的 `--doctor` 在读它。这条射程缺口写在 SOP §12.13，不写在「已覆盖」里。
- **`staging/` 不入库**（`.gitignore:44`），所以本次的三条声明（`intake-localize` 的四件套、
  `intake-repairs` 的修补、`translations/kami.body.md` 的正文）**在仓库里只留下一组新的
  sha256**，没有任何可评审的内容 diff。这与库内其余 60 余条技能同构，不是本条的特殊取舍；
  代价是「另一台机器重跑 `intake-install`」会得到上游英文正文而不是 DSH 正文。
- **`mathjax` 未装**，已在 `runtime-deps.overrides.json` 里声明为 optional 并在 provenance 的
  `knownGaps` 留底：只有文档含 LaTeX 公式时才需要。
- **仓耳今楷02 商用需向 tsanger.cn 购授权**（个人免费）；MIT 只覆盖仓库的代码与模板。
  这条写进了 SKILL.md 的 description（`安全边界`）与 provenance 的 `knownGaps`。
- T0 常挂的会话成本随之上升：每会话技能目录约 +130 tok（16 条 ≈ 2,000 tok）。
