# 通用技能线接线：T0 15 条进全部 50 个岗位 preset，以及「挂上了没有」这一维度首次有判据

> 分类：capability · 生命周期：implemented · 关联决策：[ADR-0085](../../../adr/ADR-0085.md)（归位 ≠ 接线）
> 前置：本批入库的 P0 运行时前提层（`docs/maintenance-sop.md` §12.10）、T0 四条真实运行取证
> 落地位置：`dsh-overseas-skills/manifest/generic-skills.json`（新）、`scripts/build-generic-manifest.mjs`（新）、
> `scripts/verify-generic.mjs`（新）、`scripts/gates/skill-lines.mjs`（新）、`scripts/role-presets/generate.mjs`（改）、
> `dsh-overseas-skills/docs/maintenance-sop.md` §12.11–12.12（新）

## Problem

T0 精选 15 条通用技能（会议纪要 / 去 AI 味 / 周报 / 图表 / PDF / Excel / 文档解析…）已按 SOP §12
装进 `~/.dsh/skills/`：四件套齐全、结构体检通过、运行时前提齐备、设置页可见。**所有既有判据全绿。**

而按设计意图，这 15 条应当**常挂全部 50 个岗位 preset**——「通用」在装配上的含义就是
「每个岗位各挂一份同样的名单」，因为 DSH 的技能可见性由 `dsh-skill-subset` 的 `skills:` 白名单
+ `hideOthers` 决定，**没有「全局技能」这一层**。

实测：`scripts/role-presets/generate.mjs` 生成的 `skill-subset` 里**一条都没有**。
对会话而言这 15 条等于不存在，而没有任何一处报错——卡片正常、`installed=true`、图标齐全。

同一轮还量到两处结构性洞：

1. **`pnpm run gate` 里没有任何一项跑过 `verify_static.mjs`。** SOP §4 的验收清单与
   `scripts/pipeline.sh` 一直写着「要跑它」，但它只有人工执行这一条路。同一条也盖住了
   `verify-fullstack.mjs`（以及本轮新建的 `verify-generic.mjs`）。
2. **`verify-fullstack.mjs` 恒红。** 它断言 `~/.dsh/.agent-presets/ai-product-developer/skills/`
   下三个副本存在，报「预设副本丢失」；真相是该 preset 组在 v3 重组时已移出本机
   （现存只有 `agt-001..050` + `bobo-cto` + `lute-cordis`）。

第 2 条是 **2026-09-12 一次改动里显式判定为「既有环境漂移、留待单独处置」的债**——
Note 原文写在 `docs/notes/implemented/capability/2026-09-12-simplify-codebase-fullstack-intake.md`
的「Alternatives considered」第 4 条。此后无人处置，于是判据一直红着，而**没有任何东西知道它红着**，
因为它不在任何自动路径上。这两件事叠起来正好演示了 P-03：挂着账、写着文档，
但没有任何机制会因此停下来。

## Decision

一、**技能落点分两个平面，各自独立判据。** 归位（`manifest/*.json` + `role-assignments.json` +
taxonomy 名单）回答「属于哪些岗位、喂给哪个页面」；接线（`agent.cordis.yml` 的 `skill-subset`）
回答「哪个会话会真的用到它」。判据必须读**消费侧的产物**，不能读登记表或生成器的意图。

二、**新增第三条线「通用技能」（`genericNames`），T0 档进全部 50 个岗位 preset。**

- 归位写入 `manifest/generic-skills.json`，**唯一一份**，纯派生自 `staging/intake-localize.json`
  （四件套 + 分组，逐条读过原文写的）与 `manifest/intake-provenance.json`（批次 / 许可证 / 修补），
  派生器 `scripts/build-generic-manifest.mjs`。**T0 名单的家是派生器里的 `T0_NAMES`**，
  其余四处（设置页、图标分配、`verify_static`、`generate.mjs`）全部读它。
  全栈线保留其既有两份文件的形态，本次不动。
- 接线并入点放在**契约闸门之后**。闸门判的是 `p2s-` 卡的契约引用，第三方通用技能没有契约可挂；
  放闸门之前它们会被算成 `pending`，一旦 `P2S_CONTRACT_GATE=enforce` 就会被**静默删掉**。
- 接线判据读**回落的字节**：写盘后重新读回 `agent.cordis.yml` 逐条核对，缺一条即 `exit 1`。

三、**新增 `gate:skill-lines`**，把三条线的验证器收进 `pnpm run gate`。射程里有四个验证器：
三个量数据（`verify_static` / `verify-generic` / `verify-fullstack`），第四个量**负载形状**
（包自身的 `test/*.spec.mjs`）。第四个非加不可的理由：`buildGroupsLegacy` 靠
`skill.category === cat.key` 配对，清单里的分组 key 与 catalog 里的 category 一旦写岔，
返回的就是 N 个**空组**——页面显示成一片空白而不是报错，而这段只有真的 `apply` 一遍插件
才跑得到，没有任何静态判据看得见。

射程前提统一为「本机有没有 `~/.dsh/skills` 与 `~/.dsh/.agent-presets`」：两者都不在 →
跳过并写明跳过了什么；目录在 → 任一验证器非零退出即红，原文回传输出。

本项自带反向自测（`gate:skill-lines-selftest`，7 条）。写它的过程本身产出一条教训：
第一版把 `verify_static.mjs` 打成了 `verify-static.mjs`（连字符 vs 下划线），
那个本该判红的桩**一次也没被匹配到**，于是用例绿着通过——一个打错字的反向用例比没有
反向用例更坏，因为它看起来验过了。修法不是「仔细点」，而是给桩加断言：`red` 里每个 key
必须被真的匹配到一次，否则抛错。打字错误从此会响。

四、**`verify-fullstack.mjs` 的预设副本判据改为带前提的跳过**，且期望条数改从
`presets/preset-skills.json` 读而非硬编码 3。

五、**设置页新增第 28 项「通用技能」**（与出海 26 / 全栈 27 并列），8 个用途分组 + 15 行，
走新路由 `/api/dsh-overseas-skills/generic-list`。

## Alternatives considered

- **把 T0 名单写成 `generate.mjs` 里的常量数组**（P3 方案的字面写法）：同一份 15 条还要被
  设置页、图标分配、`verify_static` 三处读。常量放进去就等于有第二个家，而第二个家只能靠人
  对齐——那是纪律不是机制（ADR-0009）。否决，改为从 `generic-skills.json` 读。
- **只把 15 条塞进各岗位的 `skill-map.json` 供给表**：供给表按岗位语义映射**材料业务技能名**，
  通用件不对应任何材料岗位，塞进去会让「这条技能为什么在这个岗位」变成无法回答的问题。否决。
- **给通用技能硬派一个出海场景（如 `h-enable`）以复用 `/list`**：通用线的 8 个用途分组回答
  「这条技能干什么用」，出海线的 8 大场景回答「属于出海业务的哪一段」。用一个错误的坐标去满足
  一个不该存在的形状要求，会让「通用」这个定语失去意义。`handleGenericList()` 因此**只走
  `buildGroupsLegacy`，没有 scenarios 那一层**。否决。
- **把 `verify_static` 的失败登记进 `exemptions.json`**：豁免只减不增、到期即拒绝（ADR-0014），
  且本轮两处红**都不是存量不达标**——一处是本次改动尚未重建目录（预期红），一处是判据自身在
  说假话（`verify-fullstack` 把环境事实报成数据缺陷）。用豁免盖住后者，等于把「判据坏了」
  永久合法化。否决。
- **直接删掉 `verify-fullstack.mjs` 的预设副本判据**：它在 preset 装着的机器上仍然有效，
  删掉是把「环境耦合」误诊成「判据无用」。否决。
- **为 T0 生成一批 `agt-*` 之外的通用 preset**：用户仍要逐个岗位切换才能用上，等于没接。否决。

## Consequences

**正面**

- 「挂上了没有」首次有判据，且三层都读消费侧产物：`verify-generic.mjs`（T0 在每一个岗位
  preset 的白名单里逐字命中，缺哪岗缺哪条点名）、`generate.mjs` 的落盘回读、`gate:skill-lines`。
- 三条线的验证器首次进入 `pnpm run gate`（**55 项**）。
- **接线的 diff 是确定性的**，直接给出证据而不是声明：50 个 `agt-*` 每个恰好 **+15**、
  1 个非 `agt` preset 不变、**移除 0 条**、新增并集**恰好等于** T0 名单、总条目 **474 → 1224**
  （= 50 × 15）。生成器自己打印
  `★ 通用线 T0 15/15 条在 50/50 个岗位的 skill-subset 里逐字回读命中`。
- `taxonomy-v3.json` 的 `overseasNames` / `fullstackNames` 从**无人校验的死数据**变成活的：
  这两个名单写在 SOP §12 里却没有任何消费者，现在一条判据同时锁三个名单，成本近乎为零。
- 上线当天 `gate:skill-lines` 抓到两件事，第二件是 2026-09-12 挂账后无人处置的既有债，本轮关闭。
- 运行时前提门禁的射程从「已接线 281 条 / 需探测 0 条」变成「已接线 **296** 条 / 需探测 **5** 条」
  ——接线之前这条判据对 T0 是**空射程**，它一直绿着但没量到任何东西。

**代价与约束**

- 每个岗位会话的技能目录多约 **1,900 tok**。这是 T0 常挂的必然成本，也是把 T0 压在 15 条
  （而非 40 条）的理由。
- `lib/catalog.js` 由 `build_preset_catalog.py` 生成；新增线必须重跑该脚本，未重建时
  `verify_static` 以「缺 `SKILLS_GN`」判红（不是静默空页）。
- **T1（按岗位族挂）本批为空。** `generate.mjs` 会把非 T0 成员打印出来明确说明**未被接线**，
  避免「清单里有 = 已经挂了」的误读。
- `SKILLS_FS` 的提取正则原先锚 `$`（文件末尾）；GN 追加到它后面会让该正则整条失配，
  而失配的默认值是空数组 ⇒「AI全栈 30 条」会**静默变成 0 条**、图标覆盖判据恒过。
  已改为只锚分号。这是把新线加在文件尾部时必然踩到的一次（P-02 的近亲：判据悄悄失去射程）。

**后续动作**

- 用户拿真实会话试用 T0 15 条后，再决定放量到 T1（约 30 条）还是直接到 120 条挂岗件。
- 592 条来件里剩余约 120 条挂岗件、17 条方法论与 68 条择优件仍走 §12.5 路径 A。

## 验证（真实命令与读数）

| 项 | 读数 |
| --- | --- |
| `node scripts/build-generic-manifest.mjs` | 8 组 / 15 条（T0 15 / T1 0） |
| 接线 diff（before/after 白名单集合比对） | 50 岗 **+15** 各、非 agt **0**、移除 **0**、新增并集 == T0 名单、总条目 **474 → 1224** |
| `node scripts/role-presets/generate.mjs` | `★ 通用线 T0 15/15 条在 50/50 个岗位的 skill-subset 里逐字回读命中` |
| `node scripts/verify-generic.mjs` | 15/15 已装 · 四件套齐全 · T0 挂载缺口 0 个岗位 · 图标齐备 |
| `node scripts/verify-fullstack.mjs` | 30/30 · 预设 `ai-product-developer` 不在本机（跳过副本核对，不判红）· 问题 0 |
| `node scripts/gate.mjs` | **56/56**（含新增 `skill-lines` 与 `skill-lines-selftest`） |
| `gate:skill-runtime-preconditions` | 已接线 **296** 条（281 + T0 15）/ 需探测 **5** 条 / 中文渲染自检绿 |
| `/generic-list` 负载（真机，apply 后直接调 handler） | HTTP 200 · `ok:true` · `scenarios:0` · **8 组**（每组各有自己的 SVG 分组头像）· **15 行**：`installed 15/15` · `modelEnabled 15/15` · 有头像 `15/15` · 有中文摘要 `15/15` · **行级头像互异 15/15** |
| 包内测试 | `ℹ tests 67 ℹ pass 67 ℹ fail 0`（新增 2 条 `/generic-list` 负载契约） |
| `npm run typecheck` | 无输出（通过） |
| 头像几何（独立复核，直读 SVG 源码） | 23/23 外框 `rect 4.5/4.5/91/91 rx=18` + `#58B848` + `stroke-width=2.2`、裁剪区 `6.5/6.5/87/87 rx=15.5` 全部相符；脸圆半径 34（成人 18 枚）/ 36（宝宝 5 枚）——与既有 `sk-fs-*` 的分布（34×36 / 36×2）同模板 |
| 头像风格分散度（直读 `lute-brand-icons/scripts/catalog.js`） | **23 条六元组（skin/hair/shirt/collar/emblem/acc/baby）全部互异，0 组重复**；16 种 emblem、22 种发型、8 种衣领、4 种肤色、7 条带配件、4 条宝宝体型。徽章语义对应：笔/图表/平板/气泡/对勾/天平/书/放大镜/羽毛/剪刀/喇叭/文档/花括号/盾牌/计算器/文件夹 |
| 既有图标未被扰动（独立复核） | 拿上一轮的产物逐条比对**新** manifest：`skill-icons-fs.json` **30/30 byte 相同**、`category-icons-fs.json` **8/8 byte 相同**；manifest 总数 247 → 270（+23） |
| 退出码两态（临时移开 `staging/intake-localize.json` 模拟干净 clone） | 派生器 `--check` → **exit 2** + `⏭ 派生源不在本机…本项无射程`；`verify-generic` → `⏭ 跳过：清单比对` + exit **0**；`verify_static` → 跳过行 + exit **0** |
| 同一契约的反向（往 `generic-skills.json` 注入一处真实漂移） | 派生器 exit **1**、`verify-generic` exit **1**、`verify_static` exit **1**，三处都点名「与派生源不一致」 |
| 新契约的自测与突变 | `generic-manifest-skip.spec.mjs` 4/4 绿；把派生器 `exit(2)` 改成 `exit(1)` 后 **G1 立刻红**（判据有牙） |

**诚实划界**

- `/generic-list` 的负载已在**真机**上取到（表里那行是 apply 一遍插件、直接调 handler 的真实
  响应）。但**设置页在浏览器里长什么样**仍未验证——宿主在内存持有 catalog 模块，改了不重启
  页面不更新（SOP §12.7 已知陷阱）。**当前模型没有图像输入能力**（`read_image` 直接报
  "model does not declare image input"），所以本轮所有头像结论都是**从 SVG 源码算出来的几何
  读数**，不是看出来的；`/tmp/gn-icons/*.png` 只作为交给人复核的产物路径存在。
- `verify-generic.mjs` 的第一版把 frontmatter 的 `metadata:` 块头误判成「无法解析的行」——
  它自己的判据抓到了自己。已改为接受三种合法形态（标量行 / 块头 / 缩进子行）。
