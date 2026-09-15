# 新一批 592 个 skill 的深度探查与归属分析

> 来源：`/Users/lute/Downloads/skills/`（kimi / Manus / MinMax / MinMaxDesign 四个来源）
> 分析日期：2026-09-14　分析口径：逐条读 SKILL.md，环境依赖逐目录实测
> 结论状态：**待与负责人拍板**，未做任何安装或写盘

---

## 0. 一句话结论

这 592 个 skill **不是一批电商经营技能**，而是四套不同性质的厂商能力包：

- **kimi（133）**：多来源聚合的"通用能力超市"，最大价值在**通用办公真空区**
- **Manus（335）**：英文 SaaS/开发者工具生态的通用能力包，**53% 是工程基础设施或平台绑定**
- **MinMax（17）**：官方 8 个工程指南 + 4 个办公/多模态，质量齐整
- **MinMaxDesign（107）**：**这是 MiniMax-H3 视频工厂的编排层，不是技能库** —— 80% 强环境绑定

**可装 ≈315（53%）、排除 ≈277（46%）**。排除的主因不是质量差，而是**环境绑定**（200 条）。

---

## 1. 全景数字

| 来源 | 总数 | 通用办公 | 岗位专属 | 工程 | 环境绑定 | 重复 | 低质 |
|---|---:|---:|---:|---:|---:|---:|---:|
| kimi (月之暗面) | 133 | 32 | 45 | 21 | 16 | 19 | 0 |
| Manus (3 批合并) | 335 | 39 | 58 | 94 | 93 | 44 | 7 |
| MinMax (官方) | 17 | 1 | 0 | 8 | 5 | 2 | 1 |
| MinMaxDesign | 107 | 0 | 17 | 0 | 86 | 3 | 1 |
| **合计** | **592** | **72** | **120** | **123** | **200** | **68** | **9** |

分类口径：

- **通用办公**：任何岗位都会用到的写作/文书/演示/表格/会议/邮件/调研/图表/方法
- **岗位专属**：只服务某类岗位（电商增长、财务法务、产品供应链、设计媒体）
- **工程**：软件开发/测试/运维/数据工程/基础设施
- **环境绑定**：必须依赖某平台/API/CLI/DCC 软件才能跑出产物
- **重复**：与已装 1664 技能库语义相同
- **低质**：空壳、样例壳、领域完全无关

---

## 2. 与现状的关系（这是归属讨论的前提）

### 2.1 已有机器

| 对象 | 现状 |
| --- | --- |
| 技能库 `~/.dsh/skills/` | **1664** 个目录（`p2s-*` 1390 + 精选 274） |
| 已归位技能 | **253**（overseas 223 + fullstack 30），见 `dsh-overseas-skills/manifest/role-assignments.json` |
| 归位/接线分离 | 归位=技能属于哪些岗位（喂页面）；接线=preset 实际挂载（喂会话）。**两者不一致是事实，不是错误** |
| 装配机制 | `dsh-skill-subset`：每个 preset 的 `agent.cordis.yml` 里列 `skills: [...]`，`hideOthers: true` 遮蔽其余 |
| 现存 subset 规模 | 52 个 preset，**min 3 / max 35 / 均值 9.3**，共引用 281 个不同技能 |
| 入库 SOP | `dsh-overseas-skills/docs/maintenance-sop.md` **§12 第三方技能入库 SOP（分类→归位→生效）** |

### 2.2 §12 已经回答了"通用技能放哪里"

现有 SOP 的第五条是**两条互斥路径**：

- **路径 A · 挂岗**：技能对上《AI组织变革》某岗位的三条责任之一（`responsibility` 逐字），带 `source`/`confidence`/`evidence`
- **路径 B · 通用型**：`roles: []` + 必须给 `no_role_kind` ∈ {`GENERIC_METHOD` / `TOOL_ONLY` / `OUT_OF_SCOPE` / `OTHER`} + `no_role_reason`

**用户要的"通用办公技能"就是路径 B。机制已存在，不需要新造。**

### 2.3 实测出的三个真空

1. **办公文档真空**：已装库里 PPTX/Excel/DOCX/PDF 生成类技能**几乎为零**；50 个 agt preset **没有一个挂 univer**。
2. **通用办公真空**：会议纪要、周报月报、OKR、甘特图、HTML 邮件、翻译、简历 —— 已装库一个都没有。
3. **利益冲突检查**：`skill-map.json` 151 个业务技能名里**唯一残留的 gap**（AGT-005 守衡），本批 `audit-support` 可补。

### 2.4 一个必须知道的成本

技能目录条目（name + title + description）会进每个会话的上下文，**实测每条 ≈124 tokens**：

| 挂载条数 | 每个 preset 会话额外成本 |
|---:|---:|
| 10 | ~1,240 tokens |
| 15 | ~1,860 tokens |
| 20 | ~2,480 tokens |
| 30 | ~3,720 tokens |

> 通用池不是免费的。**它真正的上限不是 token，而是"目录精度"** —— 候选越多，模型选错的概率越高。这决定了通用池必须分层，不能一次性全挂。

---

## 3. 四个来源的画像（逐个）

### 3.1 kimi（133）—— 多来源聚合，办公真空补位者

**不是纯原创**：15 个带 `Localized from` / `openclaw` / `clawhub` / `anthropics/skills` 溯源；带 LICENSE 的 87 个里，版权方是 Corey Haines(5)、Matt Pocock(5)、daymade(5)、Alireza Rezvani、Abbas Mir、歸藏等。**47 个无 LICENSE**（多为 Kimi 一方件：kimi-slides / kimi-design / kimi-webmcp / guizang-ppt-skill 等）。

**⚠️ 13 个厂商对象模型必须硬排除** —— 进了 DSH 就是死代码：

| 技能 | 绑定的私有对象模型 |
| --- | --- |
| `blueprint` `automation` `binding` `canvas` | Daimon Blueprint 四资产工具集（AutomationCreate / Binding.create / Canvas.placeWidget / Widget.validate） |
| `widget` `widgetdesign` | Kimi Widget 宿主运行时（预加载 CSS + `<kimi-icon>` + host token） |
| `kimi-slides` `kimi-design` | `.pptd` 专有 DSL + 环境预装 CLI + `<KIMI_REF>`，且**明文禁止自行导出 pptx** |
| `kimi-webmcp` `in-app-browser` | Kimi Work `InAppBrowser` RPC + `chromium-cdp-webmcp/m150-v1` |
| `kimi-model-annotations` | `model3dAnnotation` / `model-component-geometry-v1` 附件协议 |
| `plugin-builder` `kimi-skills-finder` | Kimi 桌面版 CLI + 硬编码 `/app/.agents/skills` |

> 反直觉点：**最花哨的 kimi-slides / kimi-design 恰恰最不能用。**

**最大价值**：30 个通用办公技能，全部落在已装库的空白区。

### 3.2 Manus（335）—— 开发者工具超市，业务占比低

- 三个批次里，**工程 94 + 环境绑定 93 = 56%**
- 一整条 AI 视频生产线（6 件）靠 `../../references`、`../../prompts/data` 引用**实测不存在的父技能**（某视频插件的内部件）
- **19 条与已装库语义重复，其中 6 条同名精确重复**：`cold-email`、`content-strategy`、`marketing-ideas`、`seo-competitor-analysis`、`skill-creator`、`tdd`
- 一整条 **SEO 内容族 9 件全部判重**（已装 `seo-controller`/`seo-keyword-research`/`seo-competitor-analysis`/`seo-page-audit`/`seo-writing`/`geo-optimizer`/`multilingual-seo` 已成体系）
- **打包缺陷**：`stock-analysis` 双层嵌套目录、`similarweb-analytics` 嵌套坏包 + `__MACOSX`、`skill-creator` 夹带 `__MACOSX`、7 个技能引用未随附的 `../../CONNECTORS.md`
- **空壳**：`azure-role-selector`(6 行)、`push-to-github`(20 行)、`example-skill`、`applying-brand-guidelines`(虚构 Acme 样例)、`hackernews-frontpage`

**真正收获**：通用办公池（`meeting-minutes` / `sn-da-non-spreadsheet-analysis` / `humanizer` / `validate-data` / `excel-generator` / `typst-pdf-maker`）+ 数仓/SRE 族。

### 3.3 MinMax（17）—— 质量最齐整的一批

8 个通用工程指南（Android / Flutter / iOS / RN / 全栈 / 前端 / 着色器）**零外部依赖**，是最干净的工程供给。
办公侧只有 2 个可用：`minimax-pdf`（无条件入选）、`minimax-docx`（需 .NET SDK）。
`minimax-xlsx` / `pptx-generator` 与已装 `univer-sheet` / `univer-slide` 同域，判重。

### 3.4 MinMaxDesign（107）—— 视频工厂编排层，不是技能库

**80%（86 个）是环境绑定**。判据统一：正文含**强制生成步骤**，且锁死模型名。

| 依赖类别 | 数量 | 典型 |
| --- | ---: | --- |
| MiniMax-H3 视频生成 | 46 | `cinematic-title-sequence`（直接提交 H3 出片）、`anime-pv-maker`（锁死最高精度） |
| 图像生成/编辑模型 | 21 | `poster-design`（`assemble prompt + generate`）、`n-storyboard` |
| 模型名写死 | 3 | `sword-dance`（Midjourney V7 + Seedance 2.0） |
| Hub 专有 MCP 工具 | 5 | `digital-product-promo-generator`（`hub_generate_video`）、`voice-design`（`hub_design_voice`） |
| 音频/语音生成 | 7 | `audiobook`、`voice-clone` |
| DCC 桌面应用连接器 | 5 | `blender-workflow`、`houdini-workflow`、`touchdesigner-workflow`、`design-after-effects`、`director-stage` |
| 第三方平台 | 2 | `film-style-picker`（飞书 Bitable）、`minimax-music-playlist` |

**⚠️ 但这批不能一概丢弃**：其中 **17 个是纯提示词方法论，无需任何 API 即可用**（判据：正文没有"调用生成服务"的强制步骤，交付物是提示词/分镜表/脚本）：

`h3-prompt-expert`、`video-prompting`、`film-reference-prompt-writer`、`coordinate-camera-control-designer`、`ecommerce-design`、`film-shot`、`film-assets`、`short-drama-screenwriter`、`short-drama-series-writer`、`podcast-marketing`、`podcast-studio`、`podcast-to-content-suite`、`sports-podcast-outline`、`social-caption`、`writing-fragments`、`subtitle-correction`、`voiceover-direction`

**唯一复活路径**：把生成调用重指向本机已装的 `pixpix-ecommerce`（37 个 MCP 工具）或 `higgsfield-guide`。这批的**编排纪律**（审批门、pilot 锚定、跨镜一致性、失败重试、成本门）才是稀缺资产。

---

## 4. 归属方案（待拍板）

### 4.1 五条去向

| # | 去向 | 条数 | 落点 |
| --- | ---: | --- | --- |
| 1 | **通用技能池**（路径 B） | ~65（去重后）→ 建议实际挂 12–18 | `~/.dsh/skills/` 一份 + 每个 preset subset 引用 |
| 2 | **岗位专属**（路径 A 挂岗） | ~120 | 挂到对应 AGT 岗，进 `role-assignments.json` |
| 3 | **工程能力池** | ~123 | 不硬塞业务 preset，见 §4.4 的争议 |
| 4 | **排除 · 环境绑定** | 200 | 不装；或按 §4.5 走"复活"改造 |
| 5 | **排除 · 重复/低质** | 77 | 不装；重复的可作**升级源**回填已装件 |

### 4.2 通用技能池候选（65 条，按建议等级）

**A 级（24）—— 建议优先进池**

- 文书：`copy-editor` `humanizer-zh` `humanizer` `audience-adapter`
- 演示文档：`guizang-ppt-skill` `minimax-pdf`
- 表格数据：`sn-da-excel-workflow` `excel-generator` `sn-da-non-spreadsheet-analysis` `dataset-health-audit` `chart-gen` `gantt-chart-builder`
- 会议协作：`meeting-recap` `meeting-minutes` `meeting-follow-up-pipeline` `work-report-writer`
- 邮件：`html-email-builder` `pro-email-composer`
- 图与结构：`mermaid-diagrams` `markdown-mermaid-writing`
- 方法与 QA：`validate-data` `sop-writer`
- 语言：`xindaya-translator`
- 数据方法：`auto-stat-test`

**B+ / B 级（32）**
`copy-editing` `professional-communication` `typst-pdf-maker` `brand-docx` `marp-slide` `beautiful-article` `chrono-flow` `build-dashboard` `kpi-dashboard-design` `daily-briefing` `okr-planner` `call-prep` `ticket-triage` `search-strategy` `knowledge-synthesis` `blog-factcheck` `youtube-transcript` `customer-research` `json-canvas` `war-council` `lean-canvas` `weighted-scoring` `team-composition-analysis` `risk-heatmap` `workload-calculator` `flashcard-studio` `bloom-quiz-maker` `corr-insight` `outlier-scan` `regression-insight` `split-test-evaluator` `obsidian-markdown`

**C 级（9）—— 建议不进池**
`i-have-adhd` `theme-kit` `playground` `public-speaking` `resume-craft` `interview-simulator` `photo-magazine-cn` `rhetoric-speech-craft` `grammar-check`

### 4.3 建议的三层挂载

| 层 | 内容 | 挂载范围 | 成本 |
| --- | --- | --- | --- |
| **T0 常挂** | 12–15 条最高频、互不重叠 | **全部 50 preset** | ~1,500–1,900 tokens |
| **T1 按域挂** | 30–40 条，按岗位族（经营/产品/供应/渠道/品牌/服务/财务/平台） | 相关 preset | 0（按需） |
| **T2 备选** | 其余候选 | 不挂 subset，仅进技能库与设置页 | 0 |

> T0 的选取标准建议不是"最好的"，而是"**任何一个岗位在任意一次任务里都可能用到，且没有它就得手工做**"。

### 4.4 ⚠️ 三个结构层争议（需要拍板）

**争议 A：工程那 123 条怎么放？**

这 50 个岗位是**电商组织**的岗位，其中只有 `AGT-012 灵枢`（软件算法与生态）、`AGT-047 接桥`（系统集成）、`AGT-049 稳行`（Agent 平台）是工程岗。

- 选项 1：只留服务这 3 个岗位的，其余不装（最省）
- 选项 2：建独立「工程能力池」，不硬塞岗位 preset，走另一条 catalog
- 选项 3：整体进池，靠 subset 控制可见性

**争议 B：新批次归属哪个 catalog？**

现有 `catalog` 只有 `overseas`（出海电商 223）与 `fs`（AI 全栈 30）。新批次大部分**两者都不属于**。

- 选项 1：扩 `taxonomy-v3.json`（8 场景 / 28 细分），加办公/设计/数据工程场景
- 选项 2：新增独立 catalog（如 `office` / `design`），照 `fs` 的先例
- 选项 3：只挂岗与通用型，**不进设置页**（省掉 catalog 与图标管线）

**争议 C：重复的 68 条怎么处置？**

已装库经过**统一本地化治理**（99% 有中文 `title`、95% 有触发词、84% 有安全边界、85% 有 `user_summary`）。直接覆盖会丢这些。

- 选项 1：一律保留已装，新件不装
- 选项 2：**逐个比对后择优**（如 `marketing-psychology` 新件 21884B vs 已装 4719B，`skill-creator` 新件 22442B vs 已装 9562B）
- 选项 3：新件进库改名并存

### 4.5 ⚠️ 两个内容层争议

**争议 D：200 条环境绑定的要不要"复活"？**

最有价值的是 MinMaxDesign 的 86 条 —— 它们的**编排纪律**（审批门、pilot 锚定、跨镜一致性）是稀缺资产。复活路径是把生成调用重指向 `pixpix-ecommerce`。**这是要投入改造工的，需要决定值不值。**

**争议 E：许可证**

- kimi 87/133 有 LICENSE，但版权方**多为第三方**（Corey Haines / Matt Pocock / daymade 等），47 个无 LICENSE
- MinMax 1/17、**Manus 0/335、MinMaxDesign 0/107 完全没有 LICENSE**

按 SOP §12.8，无许可证的入库需先明确授权边界 —— **这是业务决策，不是技术决策**。

---

## 5. 本批的三项"净收益"（已核实）

1. **补上唯一残留 gap**：`audit-support`（SOX404 内控测试底稿：抽样 + 缺陷分级）→ AGT-005 守衡的 `利益冲突检查` 是 `skill-map.json` 里 151 个技能名中唯一 `kind: gap` 的条目。
2. **补上办公文档真空**：50 个 agt preset 目前**没有任何文档/表格/演示能力**；`minimax-pdf` + `sn-da-excel-workflow` + `sn-da-non-spreadsheet-analysis` + `guizang-ppt-skill` 一举补齐。
3. **补上数仓/SRE 族**：AGT-046 清源（`dbt-transformation-patterns` / `spark-optimization` / `sql-queries` / `data-context-extractor`）、AGT-049 稳行（`observability-and-instrumentation` / `slo-implementation` / `prometheus-configuration`）—— 已装库这两岗只有 p2s 研究型技能。

---

## 6. 下一步（待负责人拍板后执行）

按 SOP §12 的六步执行，**每一步都是幂等的**：

1. **形态判定** —— `SKILL.md` 有 frontmatter 的进技能目录；纯文档/插件形态的分流
2. **来源留底** —— 锚定 commit SHA + 上游 URL + 许可证（**Manus/MinMaxDesign 需先解决许可证**）
3. **补齐元数据** —— 四件套（`title`/`user_summary`/`user_try`/`description`）+ 溯源块；写 `SKILL.md`、`manifest/skills.json`、`skill-icons.json`
4. **场景归位** —— `taxonomy-v3.json` 的 `mapping` + 对应 `*Names` 数组（**取决于争议 B**）
5. **岗位归属或通用分型** —— 写 `role-assignments.json`（**取决于争议 A/C**）
6. **重建、验收、生效** —— `build_role_map.py` → `build_preset_catalog.py` → `node --test test/*.spec.mjs` → 重启 → 运行层取证

---

## 附：分析方法与可信度

- 592 个 skill **全部**解析了 frontmatter 与描述；5 个并行分析员**逐个读了 170+ 个 SKILL.md 原文**（远超抽样要求）
- 环境绑定判定**逐目录 `find` 实测**引用资产是否存在，而非只读描述
- 重复判定**读了已装件与来件的双方原文**，不看名字 —— 由此推翻了 3 个"看名字的误判"：
  - `diagnosing-bugs`：真重复（已装件就是它的中译版）
  - `test-driven-development` vs 已装 `tdd`：**互补不重复**（Iron Law + 反合理化清单）
  - `copywriting` 两边同名但内容不同
- 已如实标注证据薄弱处：`chart-gen` vs `data-viz-gen` 的边界依赖体系偏好；`p2s-*` 家族是否算"已装供给"影响 `split-test-evaluator` / `sql-tutor` 的判定
