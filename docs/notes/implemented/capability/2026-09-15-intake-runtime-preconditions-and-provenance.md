# 技能入库的第零步：从「来件长得对不对」到「这台机器现在能不能跑」

> 分类：capability · 生命周期：implemented · 关联决策：[ADR-0086](../../../adr/ADR-0086.md)（第零步独立成层）
> 前置：第三方技能入库 SOP §12.1–12.9（[ADR-0052](../../../adr/ADR-0052.md)）、[ADR-0085](../../../adr/ADR-0085.md)（归位 ≠ 接线）
> 落地位置：`dsh-overseas-skills/scripts/scan-runtime-deps.mjs`（新）、`scripts/install-runtime-deps.sh`（新）、
> `scripts/intake-lint.mjs`（新）、`scripts/intake-install.mjs`（新）、`scripts/intake-lib.mjs`（新）、
> `manifest/runtime-deps.json` + `manifest/runtime-deps.overrides.json` + `manifest/intake-provenance.json`（新）、
> `scripts/gates/skill-runtime-preconditions.mjs`（新，进 `pnpm run gate`）、
> `dsh-overseas-skills/docs/maintenance-sop.md` §12.10（新）

## Problem

2026-09-14 本批 592 个第三方来件入库。既有 SOP §12 的判据——目录名唯一、图标覆盖、
路由引用无悬空、frontmatter 四件套齐全——**全部在回答同一个问题：「技能引用的 skill id 存在吗」**。
没有一条在问「这个技能跑得起来吗」。

T0 精选 15 条装完后实测本机运行时前提：

```
Python 3.14.7 ｜ Node v26.0.0 ｜ uv 0.11.14
Python 库：  pandas ✓   numpy ✓   PIL ✓   yaml ✓   scipy ✓
             openpyxl ✗  matplotlib ✗  python-docx ✗  python-pptx ✗
             PyMuPDF ✗   pdfplumber ✗  pypdf ✗       reportlab ✗
Node 包：    vega ✗  vega-lite ✗  sharp ✗  playwright ✗
```

**4 条装完必然报错**，而当时所有门禁全绿：卡片正常显示、`installed=true`、图标齐全、
模型看得见——模型一调用就 `ImportError`。这就是 P-02：红灯会被处理，绿灯会被相信。

同轮还有两种更隐蔽的形态：

**一、装上了，但坏在交付物里。** `matplotlib` 装上后默认字体 `DejaVu Sans` 不含 CJK 字形，
中文标题渲染成豆腐块。**脚本退出码 0、图也生成了**，坏的是交付物——退出码这条最常被信任的
读数在这里说了假话。对一个面向中文组织的岗位 preset 集合，这不是边缘情况。

**二、失去 `.git` 之后没有基线。** SOP §12.2 要求不保留 `.git`（理由充分：来件的 `.git`
会把仓库体积与历史一起带进来），但这样「这条技能从哪来、哪一版、被改过什么」就没有记录，
升级比对与回滚同时没有依据。

**为什么这一层此前不存在**，值得写下来：因为「技能入库」被默认当成了**文件搬运**，
而搬运的判据天然是结构性的——名字、图标、引用关系。这类判据有一个共同优点和一个共同盲区：
优点是离线可跑、与机器无关；盲区正是它们看不见机器状态。所以 592 个来件里有多少条装得上、
装得对，判据能给出一整套读数；**它们能不能真的跑，判据一个字也说不出**，
而这恰好是模型调用时唯一会撞上的那件事。

## Decision

六条决策见 [ADR-0086](../../../adr/ADR-0086.md) 的「决策」一节，此处不复述（ADR-0009：一份事实只有一个家）。
本篇记录**为什么这么选**与放弃了什么。

## Alternatives considered

**为什么 venv 不在 `~/.dsh/skills/`。** 前缀直觉上更自然——「技能的东西放技能的目录里」。
实测否决：`verify_static.mjs` 的悬空引用判定要 `readdir(~/.dsh/skills)` 并把子目录名并进
「合法名字」集合。一个几万文件的 venv 放进去，等于往那个集合里塞进一个巨大且与技能无关的目录名，
而它是不是会被当成一条技能，取决于判据的实现细节——把正确性押在「别人不会那样读」上，
是给下一个人埋坑。移到 `~/.dsh/skills-runtime/`，这条耦合从根上不存在。

**为什么 CJK 判据是「真渲染一次」而不是「字体文件存在」。** 后者便宜、稳定、不需要跑 Python，
在多数场景下是好判据。这里不行：这一类缺陷的**症状**恰恰是「退出码 0、产物是坏的」，
所以判据必须落在产物上。`-W error::UserWarning` 把 matplotlib 的缺字警告升级成异常，
是让那条警告第一次变得**能被机制看见**。放弃的是速度（每次门禁多跑一次 Python，约百毫秒级），
换来的是这条判据与它守的缺陷在同一个平面上。

**为什么不并进 `intake-lint.mjs`。** 两者都在安装之前跑，看起来该合成一步。分开的理由是
**故障归属**：结构体检判「来件的形状」，结论与机器无关，红了就是来件的问题；
运行时前提判「这台机器现在能不能跑」，红了是环境的问题。合成一条判据，同一句话就会
同时表示这两件事——ADR-0085 刚刚为这个形状付过代价（`verify-fullstack` 把「预设组不在本机」
报成「副本丢失」，于是那条红既不能驱动重装也不能驱动查数据）。判断「该修什么」的成本，
比多维护一个脚本高得多。

**为什么不用豁免放行缺依赖的新技能。** 这是本轮最有诱惑力的一条：`exemptions.json` 现成、
机制完整、只减不增（ADR-0014），登记一条就能让门禁变绿、放量继续。否决的理由是它会把
「新装技能依赖没装齐」与「存量技能不达标」混成一类——前者是**动作没做完**，
后者是**历史债**。豁免是为后者设计的，用它盖前者，等于给「装了但跑不起来」发一张永久通行证。

**为什么只装已接线技能的依赖（门禁射程跟着 `skill-subset` 走，而不是跟着清单走）。**
跟着清单走会让「这条技能还没接进去」把门禁拖红，而它此刻确实不会被任何会话用到——
恒红与恒绿一样没有信息量，人只会学会绕过它。跟着接线走，判据的含义就变成一句能回答的话：
**「凡是会被挂载的技能，它的运行时前提都齐备。」**

## Consequences

**代价。** venv 是机器状态、不入库，干净 clone 上无法跳过（只要有任何已接线技能声明 Python 依赖），
必须真的装出依赖——这是有意的，否则换台机器判据就变绿。判据依赖本机
`~/.dsh/skills` 与 `~/.dsh/.agent-presets`，与 `gate:skill-lines` 同一射程前提。

**边界（诚实划界）。** 本层只保证**依赖就位**：不管版本是否合适、不管技能逻辑对不对、
不管产物内容是否正确。它把「装了但跑不起来」从一个安静的选项变成一个响亮的失败，
仅此而已——不要把它读成技能质量门。

**未做完的部分。** 本批只对 T0 做过完整第零步；剩余来件的 `missing` 尚未逐条探测。
放量到 T1（约 30 条）与挂岗的约 120 条时必须重跑，`--skills` 的并入语义就是为逐批放量准备的。

## 验证（真实命令与读数）

**落盘的读数**（本轮复核）：

| 产物 | 读数 |
| --- | --- |
| `manifest/runtime-deps.json` | 自动抽取基线，5 条有依赖的技能 |
| `manifest/runtime-deps.overrides.json` | 人工核对覆盖同样这 5 条（含 `optional` + `why`） |
| `manifest/intake-provenance.json` | 15 条（T0 全量），逐文件 sha256 + 许可证结论 + 已应用修补 |
| 受管 venv | `~/.dsh/skills-runtime/.venv` → **Python 3.12.13**（钉 3.12，非本机 3.14.7） |

**结构体检实测**（§12.10 表）：592 个来件 → **致命 12 条、告警 144 条**。
第一版规则误报 135 条，**收窄判据后**才收敛——这条也记下来：一个建立在误报之上的判据，
会被人用「反正它老报警」的方式绕过去。T0 15 条里 3 条需要修补，全部登记在
`staging/intake-repairs.json`（`chart-gen` 一条同时命中三种缺陷：损坏的 `_meta.json`、
乱码的 `scripts/package.json`、硬编码的原厂沙箱路径 `/data/clawd/skills/chart-image/*`）。

**真实运行取证**（不可省的一步，四条）：`chart-gen` 出 PNG（690×390）、
`sn-da-excel-workflow` 写读 xlsx 带条件格式、`sn-da-non-spreadsheet-analysis` 解析
docx/pptx/pdf、`minimax-pdf` 出中文 PDF 并能回读文本。**这四条不是「依赖装上了」的推论，
是产物本身**——第零步的全部意义就是让这个区别有地方落。

**门禁接线**：`gate:skill-runtime-preconditions` 进 `pnpm run gate`。
子进程调用走 `real-node.mjs` 的 `nodeCommand()`（ADR-0040）：pnpm 下 `process.execPath`
是宿主 Electron，直接拿它起子进程会得到「退出码 0 且没有任何输出」，
于是这条判据会变成一句没有信息量的话。

**被实测推翻的两处原始判断**（过程稿在 `.scratch/new-skills-intake/DECISIONS-AND-SOP.md`，
此处只登记更正后的家）：

| 原判断 | 实测 | 事实的家 |
| --- | --- | --- |
| `chart-gen` 运行依赖 = matplotlib | 不需要。它是 Node 实现（Vega-Lite + Sharp） | `manifest/runtime-deps.overrides.json` 的 `chart-gen.note` |
| T0 取 Manus 的 `humanizer` | 该件 439 行规则基于**英文语料**，挂 50 个中文岗位会误判 → 换 kimi 的 `humanizer-zh` | `staging/intake-localize.json` 的 `_meta.t0SelectionNote` |

第一条尤其值得留：它是**只读描述**得出的结论，被实际读代码推翻。第零步的整条链路
（抽取 → 人工核对覆盖 → 真实运行）就是为这类错误装的牙。
