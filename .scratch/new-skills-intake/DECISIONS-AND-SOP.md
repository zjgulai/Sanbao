# 新一批 592 skill · 归属决策与自动化执行方案

> 决策日期：2026-09-14　决策人：lute　状态：**归属已定；SOP 方案已批并落地（P0+P1 完成）**
> 前置分析见同目录 `ANALYSIS.md`

---

## 第一部分 · 已锁定的六条决策

| # | 决策项 | 结论 |
| --- | --- | --- |
| ① | 通用办公池规模 | **T0 = 12–15 条常挂全部 50 preset**（≈1,900 tok/会话）；分三层：T0 常挂 / T1 按岗位族挂 / T2 仅进库 |
| ② | 工程 123 条 | **只挑与 AI 全栈线 8 分类对齐的 ~40 条**并入现有全栈线；框架专属（Flutter/iOS/Android/shader/E2E 框架/.NET）不进 |
| ③ | 重复 68 条 | **逐个比对后择优**——来件明显更厚的作升级源回填已装件，保留本地化四件套 |
| ④ | 环境绑定 200 条 | **不装**；先只复活 17 条纯提示词方法论，挂 AGT-030/AGT-031 |
| ⑤ | 通用办公落点 | **新建第三条线「通用技能」**（设置页 order 28，无 org 轴，按用途分组） |
| ⑥ | 许可证 | Manus(335)/MinMaxDesign(107) 无 LICENSE，**按内部使用留档后继续装** |

### 决策②的关键依据：全栈线是「方法论线」不是「框架线」

实测现有 30 条的构成，这条线的语义是**跨仓库通用的工程方法论**：

```
fs-clarify(7)      grilling grill-me grill-with-docs wait-what to-questionnaire research teach
fs-spec(5)         to-spec to-tickets wayfinder ask-matt wizard
fs-architecture(5) codebase-design domain-modeling improve-codebase-architecture simplify-codebase prototype
fs-implement(2)    implement tdd
fs-quality(4)      code-review diagnosing-bugs resolving-merge-conflicts triage
fs-infra(5)        setup-matt-pocock-skills setup-pre-commit git-guardrails-claude-code migrate-to-shoehorn scaffold-exercises
fs-collab(1)       handoff
fs-writing(1)      writing-for-agents
```

所以「对齐」= 跨仓库方法论，**不是**框架/库指南。

**拟并入（~40 条）**

| fs 分类 | 拟并入 |
| --- | --- |
| fs-spec | `spec-driven-development`(改造) `writing-plans` |
| fs-architecture | `api-designer` `graphql-architect` `content-modeling-best-practices` `clickhouse-architecture-advisor` `langchain-architecture` |
| fs-implement | `refactor` `dependency-updater` `make-repo-contribution` |
| fs-quality | `agentic-eval` `verification-before-completion` `performance` `web-perf` `accessibility`(改造) `sql-optimization-patterns` `code-documenter` `web-design-reviewer` |
| fs-infra | `ci-cd-and-automation` `observability-and-instrumentation` `slo-implementation` `prometheus-configuration` `postgres` `dbt-transformation-patterns` `sql-queries` `spark-optimization` `data-context-extractor` `turborepo` `pnpm-upgrade` `supabase-postgres-best-practices` |
| fs-collab | `dispatching-parallel-agents` `git-workflow-and-versioning` `finishing-a-development-branch` `git-commit` `github-gem-seeker` `incident-retrospective` |
| fs-writing | `markdown-to-html` `crafting-effective-readmes` `agent-md-refactor` `prompt-engineer` |

**不进全栈线**（走挂岗，见决策②补充）：框架/库专属 —— `flutter-dev` `ios-application-dev` `android-native-dev` `react-native-dev` `shader-dev` `frontend-dev` `fullstack-dev`（MinMax 8 件里的工程指南）、6 个 E2E 框架、`.NET` 两件、数据科学库族（`polars`/`dask`/`vaex`/`statsmodels`/`sympy`/`networkx`/`umap-learn`/`torch-geometric`/`stable-baselines3`）。

> 后两组中的一部分仍然有用——它们服务 **AGT-012 灵枢（软件算法与生态）/ AGT-046 清源（数据工程）/ AGT-047 接桥（系统集成）/ AGT-049 稳行（平台可靠运行）** 四个岗位，走**路径 A 挂岗**，不塞进全栈线。

### 决策①的 T0 名单（15 条）

选取标准不是「最好的」，而是「**任何一个岗位在任意一次任务里都可能用到，且没有它就得手工做**」，且**互不重叠**、**零运行时依赖优先**。

| # | 技能 | 用途 | 来源 | 运行依赖 |
| --- | --- | --- | --- | --- |
| 1 | `meeting-minutes` | 会议纪要（严格 Schema，235 行） | Manus | **无** |
| 2 | `humanizer` | 去 AI 味（439 行） | Manus | **无** |
| 3 | `validate-data` | 分析交付前 QA 清单（383 行） | Manus | **无** |
| 4 | `copy-editor` | 文案精修（七轮编辑） | kimi | **无** |
| 5 | `audience-adapter` | 按受众改写汇报材料 | kimi | **无** |
| 6 | `work-report-writer` | 周报/月报写作 | kimi | **无** |
| 7 | `sop-writer` | SOP/流程文档写作 | kimi | **无** |
| 8 | `weighted-scoring` | 加权评分决策 | kimi | **无** |
| 9 | `xindaya-translator` | 翻译（信达雅） | kimi | **无** |
| 10 | `markdown-mermaid-writing` | Markdown + Mermaid 写作 | Manus | 无 |
| 11 | `guizang-ppt-skill` | 网页 PPT（杂志/瑞士风） | kimi | 无 |
| 12 | `chart-gen` | JSON → PNG/SVG 图表 | kimi | ⚠️ matplotlib |
| 13 | `sn-da-excel-workflow` | Excel 多步分析编排 | Manus | ⚠️ openpyxl |
| 14 | `sn-da-non-spreadsheet-analysis` | Word/PDF/PPT 全量解析 | Manus | ⚠️ PyMuPDF/pdfplumber/python-docx/python-pptx/**libreoffice** |
| 15 | `minimax-pdf` | 印刷级 PDF 生成/填表 | MinMax | ⚠️ reportlab/pypdf/matplotlib/node playwright |

**T1（按岗位族挂，不进全岗）**：`meeting-follow-up-pipeline` `pro-email-composer` `html-email-builder` `copy-editing` `typst-pdf-maker` `brand-docx` `marp-slide` `excel-generator` `chrono-flow` `gantt-chart-builder` `build-dashboard` `kpi-dashboard-design` `daily-briefing` `okr-planner` `search-strategy` `knowledge-synthesis` `blog-factcheck` `war-council` `lean-canvas` `risk-heatmap` `flashcard-studio` `auto-stat-test` `corr-insight` `outlier-scan` `regression-insight` `split-test-evaluator` `dataset-health-audit` `professional-communication` `ticket-triage` `team-composition-analysis`

**T2（仅进库，不挂 subset）**：其余候选 + C 级 9 条。

---

## 第二部分 · 实测出来的一个通用缺口：技能装上了，但跑不起来

**实测本机运行时前提（2026-09-14）：**

```
Python 3.14.7 ｜ Node v26.0.0 ｜ uv 0.11.14 ｜ brew OK

Python 库：  pandas ✓   numpy ✓   PIL ✓   yaml ✓   scipy ✓
             openpyxl ✗  matplotlib ✗  python-docx ✗  python-pptx ✗
             PyMuPDF ✗   pdfplumber ✗  statsmodels ✗

外部 CLI：   ffmpeg ✓   qpdf ✓
             pandoc ✗  typst ✗  libreoffice ✗  ImageMagick ✗  wkhtmltopdf ✗
Node 包：    playwright ✗
```

**T0 里 4 条（`chart-gen` / `sn-da-excel-workflow` / `sn-da-non-spreadsheet-analysis` / `minimax-pdf`）装完也跑不了。**

现有 SOP §12 的六步里**没有这一层**——它只校验「技能引用的 skill id 存在」（L7/L8），不校验「技能运行前提具备」。结果是**假绿**：门禁全过、卡片正常、模型一调用就报错。

> 这与 `docs/pitfalls-playbook.md` 的「仪器假绿」和「写了但从没跑到」是同一类根因。**新 SOP 必须补一层运行时前提检查。**

---

## 第三部分 · 自动化执行方案（五阶段）

设计原则：**每一步幂等、可重跑、可判据**；产物与判据分离；不新增手工步骤。

### P0 · 运行时前提层（新增）

| 步骤 | 脚本（新建） | 判据 |
| --- | --- | --- |
| 扫描 | `scripts/scan-runtime-deps.mjs` | 从每个 `SKILL.md` 正文抽取 `pip install` / `npm install` / CLI 名 / `import X`，产出 `manifest/runtime-deps.json` |
| 探测 | 同上，`--probe` | 逐条实测本机是否具备，输出 `{skill, needs[], present[], missing[]}` |
| 安装 | `scripts/install-runtime-deps.sh` | 用 `uv`（已装）建受管 venv 装 Python 依赖；`brew install` 装 CLI；**只装 T0/T1 实际需要的** |
| 拦截 | 并入 `verify_static.mjs` | **技能进 subset 前，其 `missing` 必须为空**，否则门禁红 |

**关键取舍**：Python 依赖**不进系统 Python**，走 `uv` 受管 venv（`~/.dsh/skills/.venv`），技能脚本用绝对解释器路径调用。理由是 Python 3.14.7 太新，系统级污染会波及 DSH 自身。

### P1 · 安装（install）

| 步骤 | 脚本 | 判据 |
| --- | --- | --- |
| 形态判定 | `scripts/intake-classify.mjs` | 有 `SKILL.md`+frontmatter → 进技能目录；无 → 分流（纯文档/插件形态） |
| 落目录 | `scripts/intake-install.mjs` | `~/.dsh/skills/<name>/`；**不保留 `.git`**（SOP §12.2） |
| 来源留底 | 同上，写 `manifest/intake-provenance.json` | 每条记：来源批次、原始 zip 路径、sha256、许可证结论（**Manus/MinMaxDesign 记 `internal-only`**） |
| 结构体检 | `scripts/intake-lint.mjs` | 检出实测的打包缺陷：双层嵌套目录（`stock-analysis`/`similarweb-analytics`）、`__MACOSX` 垃圾（`skill-creator`）、引用未随附的 `../../CONNECTORS.md` |
| 去重择优 | `scripts/intake-dedupe.mjs` | 对 68 条重复做**逐条比对报告**（字节数/章节/独有内容），产出 `intake-dedupe-report.md` 供人工定夺，**不自动覆盖** |

### P2 · 优化（optimize）

这是**体量最大**的一段，也是本批与以往最大的不同：592 条里的绝大部分是**英文**，而已装库有统一的中文治理。

| 步骤 | 脚本 | 判据 |
| --- | --- | --- |
| 元数据四件套 | `scripts/intake-localize.mjs` | `title`(中文) / `description`(含触发词+何时不用+安全边界) / `user_summary` / `user_try` —— 对齐已装库口径（实测覆盖 99%/95%/84%/85%） |
| 正文汉译 | 同上，写 `staging/translations/<name>.body.md` | **全栈线强制**（`verify-fullstack.mjs` 会校验）；通用线与出海线可选 |
| 目录归一 | 复用 `scripts/unify-directories.mjs` | 目录名 kebab、与 frontmatter `name` 一致 |
| 溯源块 | `scripts/intake-localize.mjs` | frontmatter 后加来源/版本/SHA 注释块 |

**取舍**：592 条的完整汉译不现实。建议**只对 T0(15) + T1(30) + 全栈线(40) + 挂岗的 120 条做正文汉译**（约 205 条），其余只做四件套。

### P3 · 关联（wire）

三条线三条路径，**机制同一套**：

| 线 | 归位写入 | 接线写入 |
| --- | --- | --- |
| 出海线（岗位专属 120 + 17 提示词方法论） | `role-assignments.json` 路径 A 挂岗 | 各 `agt-*/agent.cordis.yml` 的 `skill-subset` |
| 全栈线（~40 工程） | `fullstack-mapping.json` + `manifest/fullstack-skills.json` | 不进 agt preset |
| **通用线（T0 15 + T1 30，新建）** | `manifest/generic-skills.json`（新） | **T0 进全部 50 个 preset 的 subset** |

| 步骤 | 脚本 | 判据 |
| --- | --- | --- |
| taxonomy 扩展 | 改 `manifest/taxonomy-v3.json` | 加 `genericNames` 数组 + 通用线的 8 个用途分组 |
| 归位 | `scripts/build_role_map.py`（已有） | 路径 A 硬约束：`responsibility` 逐字属于该岗三条之一；≥3 岗不得标 high；`evidence` 双侧连续子串 |
| 通用池接线 | 改 `scripts/role-presets/generate.mjs` | **T0 名单作为一个常量**，生成时并入每个 preset 的 subset（**一份事实只有一个家**） |
| 图标 | `scripts/assign_lute_icons.py`（已有） | 每条进 `skill-icons.json`（**不能写 `skills.json` 的 `icon`，会静默失效**） |

### P4 · 门禁与验收

| 门禁 | 判据 |
| --- | --- |
| `verify_static.mjs`（已有，扩展） | 名字唯一 / 图标覆盖 / 悬空引用 / **新增：运行时前提全绿** |
| `verify-fullstack.mjs`（已有） | **硬编码计数 30/30 必须同步 +40**（SOP 明确标注「易漏」） |
| `verify-lossless.mjs`（已有） | 50 岗位 L1–L10 保真；**新增 T0 通用池在 50/50 preset 里出现** |
| `node --test test/*.spec.mjs` | 归位表与 catalog 契约 |
| 运行层取证 | `curl /api/dsh-overseas-skills/{list,fullstack-list,generic-list}` 目标分组条目数 +N；卡片 `installed=true`、`modelEnabled=true`、头像与同组不同 |

### P5 · 回滚

| 对象 | 方式 |
| --- | --- |
| 技能目录 | `ditto` 归档（**禁用 `cp -R`**，SOP 实测会拍平目录）；`backup/intake-2026-09/` |
| 已装件被择优覆盖 | 覆盖前逐个 `ditto` 备份到 `backup/intake-2026-09/overwritten/` |
| preset | `generate.mjs` 幂等重跑即可复原；改动前备份 agent.cordis.yml |
| 删除 preset | **必须先跑** `scan-session-refs.mjs --would-remove <ids>`（一次真实事故换来的门禁） |

---

## 第四部分 · 需要你批的三件事

**1. 运行时依赖的安装方式**——我建议走 `uv` 受管 venv 而不是系统 Python。这需要 `brew install` 若干 CLI（pandoc/typst/libreoffice/ImageMagick）与一条 node `playwright`。**libreoffice 是重依赖（~700MB）**，只服务 `sn-da-non-spreadsheet-analysis` 一条技能——要不要为它付这个代价？

**2. 汉译范围**——我建议只对约 205 条做正文汉译，其余 387 条只做四件套。592 条全译不现实。

**3. 执行节奏**——建议分批：**先 T0 15 条 + 全栈线 40 条走完整条管线**（验证管线本身），绿了再放量到 120 条挂岗件，最后处理 17 条方法论与 68 条择优。

---

## 附：本方案对既有 SOP 的三处修订

1. **§12 新增第五步半「运行时前提」** —— 补掉「装了但跑不起来」的假绿
2. **§12.5 路径 B 的 `no_role_kind` 建议细分** —— 现在只有 4 类，而本批通用件有 40+ 条，一个 `GENERIC_METHOD` 装不下。建议加 `GENERIC_OFFICE`（通用办公）、`GENERIC_ANALYTICS`（通用数据方法）、`DEV_ENGINEERING`（工程能力）
3. **新增一条线** —— 设置页 order 28「通用技能」，与 order 26 出海 / 27 全栈并列

---

## 第五部分 · 执行后更正（2026-09-14，T0 15 条跑完 P0–P1 后回填）

第一部分写这份方案时有两处事实是错的，实测推翻，在此更正并说明**事实的家搬去了哪里**：

| # | 原文 | 实测 | 事实的家 |
| --- | --- | --- | --- |
| 1 | `chart-gen` 运行依赖 = matplotlib | **不需要 matplotlib**。它是 Node 实现（Vega-Lite + Sharp）。matplotlib 来自早期只读描述的分析 | `manifest/runtime-deps.overrides.json` 的 `chart-gen.note` |
| 2 | T0 第 2 条取 Manus 的 `humanizer` | 该件 439 行规则**完全基于英文语料**（维基百科 Signs of AI writing 的英文高频词表）。T0 常挂全部 50 个**中文**岗位 preset，会误判 → 换成 kimi 的 `humanizer-zh` | `staging/intake-localize.json` 的 `_meta.t0SelectionNote` |

另有两处**规模数字**在实测后变化较大，同表登记（避免两份数字打架）：

| 项 | 方案估计 | 实测 | 出处 |
| --- | --- | --- | --- |
| 去件结构致命缺陷 | 未预估 | **592 个来件里 12 条致命、144 条告警**（第一版规则误报 135 条，收窄判据后收敛） | `docs/maintenance-sop.md` §12.10 表 |
| MinMaxDesign | 107 条环境绑定，不装 | 实为 **107 个 zip 且整批双层嵌套**；按决策④不装，故不影响 | 同上 |

**方案里对的部分已全部落地并被门禁守住**：运行时前提层（§12.10 + `gate:skill-runtime-preconditions`）、
`no_role_kind` 细分为 7 类（§12.5）、T0 常挂接线方式（P3 待做）。
