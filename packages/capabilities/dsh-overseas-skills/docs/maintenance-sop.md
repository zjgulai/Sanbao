# 出海技能体系 · 维护 SOP（脱手手册）

> 目标：体系不依赖作者记忆。所有操作可复制粘贴执行。
>
> 近两日变更与坑位（分类 v3、硬链接双杀、图标防抹、重复 `---`）：见 [recent-changes-2026-09-08.md](recent-changes-2026-09-08.md)。

## 1. 文件地图

| 对象 | 路径 | 说明 |
| --- | --- | --- |
| 技能运行时目录 | `~/.dsh/skills/` | 250+ 个技能目录（~/.dsh/skills 顶层口径）（SKILL.md + references/scripts/examples/assets/tests…），文件层实时生效 |
| 81 技能源码 | `~/project/81-Skills/`（**仓库外**，2026-09-11 迁出） | 中文目录源（转换源，含 4 个加密暂缓）；路径可用 `LUTE_81SKILLS_SRC` 覆盖 |
| 插件工程 | `~/project/Magpie-Horch/dsh-overseas-skills/` | catalog/图标/卡面/管线脚本 |
| 预设 | `~/.dsh/.agent-presets/brand-marketing-growth/` | 三件套，gen_bmg_preset.mjs 可复现 |
| 头像资产 | `~/.dsh/skills/lute-brand-icons/` | LUTE 头像生成器（manifest 176 条目，含 83 枚卡片图标映射） |
| 子集插件 | `~/project/Magpie-Horch/dsh-skill-subset/` | respectFileFlags 严格语义（I3） |
| 回滚备份 | `dsh-overseas-skills/backup/pre-81/` | 23 个被替换技能原文件 |

## 2. 常规操作速查

```bash
cd ~/project/Magpie-Horch/dsh-overseas-skills

# 一键管线：转换安装(可选) → 头像 → 目录 → 目录统一 → 静态闸门 → 同步 → lint
bash scripts/pipeline.sh            # 非破坏
bash scripts/pipeline.sh --import   # 含 81 转换安装（幂等，保留开关）

# 单步
node scripts/import-81skills.mjs            # 81 转换安装（dry 加 --dry）
python3 scripts/add-fs-brand-icons.py       # 全栈徽章生成（--write；40 行 sk-fs-* 归入 lute-brand-icons catalog 并重建）
python3 scripts/assign_lute_icons.py        # 头像分配（改映射就改这个脚本）
node scripts/unify-directories.mjs          # 存量目录统一（幂等）
node scripts/normalize-zh.mjs              # AI全栈中英排版归一（幂等，ADR-0008）
node scripts/soften-clarify.mjs            # 指令分级措辞软化（幂等，审计 F1）
node scripts/gen_bmg_preset.mjs             # 预设再生成（白名单随 81-mapping）
node scripts/verify_static.mjs              # 静态闸门（名字唯一/图标覆盖/悬空引用/三线名单/运行时前提）
node scripts/verify-generic.mjs             # 通用线闸门（T0 是否真的挂进每个岗位 preset）
node scripts/verify-fullstack.mjs           # AI全栈闸门（安装数由映射推导 + frontmatter + 资源脚本）

# 通用技能线（第三条线，§12.11）——改了这四处中任何一处就要按序重跑
node scripts/build-generic-manifest.mjs     # 归位清单（派生自 intake-localize + provenance）
python3 scripts/assign_lute_icons.py        # 图标（需要 lute-brand-icons 里有 gn-cat-* / sk-gn-*）
python3 scripts/build_preset_catalog.py     # 重建 lib/catalog.js（CATEGORIES_GN / SKILLS_GN）
node ../../scripts/role-presets/generate.mjs # 接线（T0 并入 50 个岗位 preset，落盘后回读核对）
bash scripts/verify_p7.sh                   # 运行时验收（需 DSH 运行中）
bash scripts/preset_mount_probe.sh          # 预设挂载探测
```

**改目录/图标/摘要/catalog 后**：管线同步 → 重启 DSH Desktop（catalog 数据在宿主进程内存）。
**只改技能 SKILL.md 正文/子文件**：无需重启，实时生效。

## 3. DSH 升级后必做（顺序）

1. `node scripts/patch-cn-slash.mjs` — 重打中文斜杠补丁（锚点未命中会显式报告，核对后手动修）
2. `bash scripts/verify_p7.sh` — 运行时验收
3. 白屏排查先查 `~/Library/Application Support/DSH Desktop/lifecycle-events/startup.jsonl` 尾事件：
   - 期望 `finalStage: health-commit`、`rendererStatus: healthy`
   - 出现 `declares no dsh.bundle` → 新装 bundle 缺声明（1.5 硬规则）
4. 日志：`~/Library/Application Support/DSH Desktop/logs/`；预期告警仅两类（安全跳过）：
   - `dsh-skill-subset: <名> 注册失败: ENOENT`（4 个暂缓白名单占位）
   - `skill file … ignored: missing YAML frontmatter`（非本体系技能，单独修复）

## 4. 验收清单（任何发布/迭代后）

- [ ] `pnpm run gate` 全绿 —— **三条技能线的验证器现在都在射程内**（`gate:skill-lines`，
      §12.12）。清单里的前三项曾长期只写在本文档与 `pipeline.sh` 里，不在任何自动路径上
- [ ] `verify_static.mjs` 全绿（8 大场景/28 细分 + FS 8 组 + GN 8 分组 / 名字唯一 / 图标覆盖 /
      三线名单无漂移 / 悬空引用）
- [ ] `verify-generic.mjs` 全绿（通用线 T0 在**每一个**岗位 preset 的 `skill-subset` 里逐字命中）
- [ ] `verify-fullstack.mjs` 全绿（30/30；预设副本判据在预设不在本机时**跳过并说明**）
- [ ] `verify_p7.sh` 全绿（分组数/新分组/B 类标题/installed/防白屏）
- [ ] 设置页：卡面摘要无空白、LUTE 头像渲染（含第 28 项「通用技能」8 组 / 15 行）
- [ ] 斜杠命令：中文候选/填入/触发 + 英文回归（五步清单见 docs/cn-slash-commands.md）
- [ ] 品牌营销增长官：挂载正常、开关语义生效（I3）

## 5. 故障排查表

| 症状 | 首查 | 处置 |
| --- | --- | --- |
| 启动白屏 | startup.jsonl 尾事件 + `declares no dsh.bundle` | 补 dsh.bundle 声明 + cordis.patch.yml 自插行（1.5 硬规则） |
| 设置页卡片不显示 | client load report + slot abdication（active:false=渲染崩溃） | 检查 client.js 注入服务与 hooks 顺序 |
| 卡片数据旧 | profile 硬链接同步 | `pipeline.sh` 重跑（-ef 守卫逻辑内置） |
| 技能开关不生效（非预设会话） | frontmatter disable-model-invocation | 设置页 toggle 直接写文件 |
| 预设内开关不生效 | agent.cordis.yml 是否含 `respectFileFlags: true` | 未含=现状语义（全部可调用）；含=严格语义 |
| 路由引用悬空 | verify_static.mjs | 改 unify-refine-batch*.json 或 81-mapping.json 后重跑 |

## 6. 回滚

- 技能内容回滚：`backup/pre-81/<名>/` 覆盖回 `~/.dsh/skills/<名>/`
- 中文斜杠补丁回滚：`node scripts/patch-cn-slash.mjs --restore`（自动用 .bak-cn-slash）
- 预设回滚：`~/.dsh/.agent-presets/brand-marketing-growth/` 删除即卸载；白名单由 gen_bmg_preset.mjs 重建
- I3 回滚：删 agent.cordis.yml 中 `respectFileFlags: true` 一行

## 7. 待办留痕

- 4 个加密技能（上市策略/市场可行性审计/竞品情报/电商季度战略）补齐 → `pipeline.sh --import`
- DSH 升级后跑 §3

## 8. AnySearch 技能（用户级实时搜索）

- 位置：`~/.dsh/skills/anysearch/`（SKILL.md + scripts/ 4 语言 CLI + .env 600 权限 + runtime.conf）
- 来源：github.com/anysearch-ai/anysearch-skill v3.1.0（Apache-2.0）
- 升级：重新下载 release → 覆盖 SKILL.md/scripts/ → 保留 .env 与 runtime.conf
- 运行时：`python3 ~/.dsh/skills/anysearch/scripts/anysearch_cli.py <search|batch_search|extract|get_sub_domains> …`
- Key：`~/.dsh/skills/anysearch/.env`（ANYSEARCH_API_KEY，chmod 600）；优先级 --api_key > .env > 环境变量 > 匿名
- 目录行：manifest/extra-skills.json（extensible 清单，接入 build_preset_catalog.py）

## 9. AI全栈技能（mattpocock/skills 稳定集 29 个）

- 决策与背景：docs/adr/（ADR-0001~0007）、docs/ai-fullstack-analysis.md
- 管线：`node scripts/import-fullstack.mjs`（幂等；译文取 staging/translations/<name>.body.md，缺则英文回退）
- 验收：`node scripts/verify-fullstack.mjs`（29/29 解析/开关/路由冒烟/脚本语法/预设副本）
- 页面：设置页第二 section「AI全栈技能」+ 卡片墙双组（lib/index.js fullstack-list 端点 + lib/client.js 参数化）
- 图标：lute 生成器 sk-fs-* / fs-cat-* 条目 → assign_lute_icons.py 双档分配
- 升级源仓库：重新 clone mattpocock/skills → 覆盖 /tmp/mattpocock-skills → 重跑 import + verify
- 撞名注意：tdd/to-spec/grill-me 全局新版与「AI 产品开发工程师」预设旧版共存（预设层优先，ADR-0002）

## 10. 技能卡片结构化引导（Prompt 模板）

- 模板引擎：`lib/templates.js`（L1 人工 30 个高频技能 + L2 解析「## 输入」章节 + L3 通用兜底；mtime 缓存）
- 数据流：/list 每行附 `template` 字段 + `GET /prompt-template?name=&title=`；卡片单击填结构化模板，hover「简」按钮填简短版
- 斜杠选择器：patch-cn-slash.mjs 6 处补丁（中文标题×2/卡片墙/P4 候选挂模板/P5 onPick 模板/P6 缓存）
- 增改模板：改 lib/templates.js 的 L1 表即可（mtime 缓存自动失效）；分析文档 docs/skill-prompt-templates-analysis.md
- 维护注意：补丁脚本锚点为精确原文（缩进敏感），改动前先看目标文件；--restore 会回滚**所有** 6 处补丁（含海外 client.js），restore 后需重跑 palette 模板改动（历史教训 2026-09-06）

## 11. 万物互联插件（dsh-wanzh-hulian）同步与红线

- 位置：`/Users/lute/project/Magpie-Horch/dsh-wanzh-hulian/`（profile file: 硬链接；编辑工具重写源文件会打破 inode → 改后必须 `cat lib/<f>.js > ~/.dsh/profiles/desktop/node_modules/dsh-wanzh-hulian/lib/<f>.js`）
- 文档索引：`dsh-wanzh-hulian/docs/README.md`（产品形态总览 + 版本状态 + 导航）
- 关键事实：/open 白名单（biji + shopify 域）、connections.json/mcp-servers.json（0600）、CREDENTIAL_REFS 动态收集、probe 注册表、MCP 宿主直挂 dsh-mcp-client（静态挂载重启生效）、getnote 19 工具 + 真移动语义（≤20/批）
- 验收节奏：宿主变更需重启；客户端变更刷新即可；补丁变更重启/刷新

## 12. 第三方技能入库 SOP（分类 → 归位 → 生效）

> 适用范围：**非 81 系自研**、从外部仓库/市场引入的技能。
> 自研 81 系的归位四步见 [skill-taxonomy-v2.md](skill-taxonomy-v2.md) 「新增技能归位 SOP」——两者判据不同，不要互相套用。
> 已入库实例：[§8 AnySearch](#8-anysearch-技能用户级实时搜索)（工具接入型）、`lieflat-charts`（内容渲染型，2026-09-12 入库）。

**硬规则：每一个进来的技能都必须落到「岗位归属」，或明确归为「通用型」。不允许既无岗位、也无通用分型的裸条目。**（用户 2026-09-12 定）

### 12.1 第一步 · 形态判定（决定后面全部落点）

| 形态 | 判据 | 安装去向 | 是否进 manifest |
| --- | --- | --- | --- |
| 纯文档 / 方法论参考 | 无 `SKILL.md` frontmatter | 不入技能目录 | 否 |
| **技能（Agent Skills 格式）** | 根目录 `SKILL.md` + frontmatter | `~/.dsh/skills/<name>/` | **是（本 SOP 主体）** |
| Python CLI / uv 工具 | `pyproject.toml` + `[project.scripts]` | `uv tool install`（可附技能） | 附带的技能才进 |
| DSH 打包插件 | `package.json` 含 `dsh.bundle` 或 `cordis.patch.yml` | profile 依赖 + bundles | **否** —— 走插件流程，勿混入技能目录 |

判据取自 frontmatter 而非目录名。**链接指向的仓库形态经常反直觉**（可能是发行版 monorepo、可能是工具而非插件）——判定结论要先与负责人对齐再动手。

### 12.2 第二步 · 来源留底（决定升级与回滚怎么做）

安装前必须记下三样，写进该技能的接口文档：

1. **锚定 commit SHA**（不是分支名）——`git ls-remote <url> refs/heads/main`
2. 上游仓库 URL
3. 许可证

**目录安装策略（2026-09-12 定，此前教训）**：技能目录**不要保留 `.git`**。

- 理由：入库必然改写 `SKILL.md` frontmatter（补 §12.3 四件套），带 `.git` 时 `git pull` 会在 frontmatter 处冲突，每次更新都要 stash + 重放本地字段，是个会持续咬人的坑。
- 代价：失去内置版本控制 → 用**锚定 SHA 写进文档 + 上游 tarball 版本化**替代。
- （`lieflat-charts` 原本是 git clone，已按此改为纯目录安装，释放 18MB。）

### 12.3 第三步 · 补齐元数据（四件套 + 溯源块）

两道**都要做**，缺一不可 —— 它们服务不同的消费者：

| 落点 | 字段 | 谁消费 |
| --- | --- | --- |
| `~/.dsh/skills/<name>/SKILL.md` frontmatter | `name`（kebab，必填）、`description`（必填）、`title`（中文显示名）、`user_summary`、`user_try` | DSH 会话技能目录、卡片「试试这样说」 |
| `manifest/skills.json` | `name`、`title`、`category`、`categoryTitle`、`scenario`、`subcategory`、`toolBacked`、`importable`、`summaryZh` | 出海技能页卡片 |
| `manifest/skill-icons.json` | `name` → LUTE 头像 data URI | 卡片头像 |

**两个已实测的坑（会静默失效，不报错）**：

- ⛔ **`manifest/skills.json` 里的 `icon` 字段对非 81 系技能无效**。构建器只认 `skill-icons.json`（及 81 系覆盖表），行内 icon 会被改写为 `""` 并回退到**分类默认头像**。表现是「卡片有头像但和同组其它技能一模一样」，容易误判为成功。**头像必须写 `skill-icons.json`。**
- ⛔ **只改 `SKILL.md` 不写 manifest 无效**。宿主 `buildScenarios` 用 `skill.subcategory` 过滤 `SKILLS` 才能匹配到分组，manifest 里没有条目 → 卡片根本不出现。

头像取值：`~/.dsh/skills/lute-brand-icons/assets/manifest.json` 的 `id → data URI`。
生成器 `assign_lute_icons.py` 会**保留**非 81 系的手工条目（`if name not in SKILL_ASSIGN`），因此写进 `skill-icons.json` 是防抹的；重跑管线不会丢。

### 12.4 第四步 · 场景归位（taxonomy v3）

在 `manifest/taxonomy-v3.json` 补两处：`mapping["<name>"] = <细分场景key>` 与 `overseasNames` 数组。

8 大场景 / 28 细分场景的 key 见该文件 `scenarios`。**判别口径是「这个技能的产出服务于出海链路哪个阶段」**，不是「它像哪类软件」。例：图表/报告生成 → `g-insight` / `g1-analytics`（与 `ecommerce-daily-report`、`ecommerce-sales-dashboard` 同格）。

### 12.5 第五步 · 岗位归属或通用分型（本 SOP 的核心）

写入 `manifest/role-assignments.json` 的 `skills{}`，`_meta` 明确它是「**归位**（技能属于哪些岗位，喂页面）」，与 `scripts/role-presets/skill-map.json` 的「**接线**（preset 实际挂载哪些技能）」是两件事，不要混。

**两条互斥路径，必须二选一：**

**路径 A · 挂岗** —— 技能的三条责任能对上《AI组织变革》某岗位的责任（词表见 `.scratch/overseas-skills-refactor/evidence/roles.json`）：

```json
{
  "catalog": "overseas", "scenario": "<key>", "sub": "<key>",
  "roles": [{ "id": "AGT-0NN", "responsibility": "<该岗三条责任之一，逐字>",
              "source": "assigned", "confidence": "high|medium|low",
              "evidence": { "from_skill": "<技能原文连续子串>", "from_role": "<岗位原文连续子串>" },
              "note": "<边界说明：只服务哪个环节、不含什么>" }]
}
```

硬约束：`responsibility` 必须**逐字**属于该岗三条之一；**≥3 岗时不得标 high**；`from_skill`/`from_role` 必须是两侧原文的连续子串（防伪造）。

**路径 B · 通用型**（不挂岗）—— `roles: []`，且**必须**同时给分型与理由：

⚠️ **只有下面标「生效」的四类能被写下**。其余三类是**已提议、尚未生效**的词汇表（见本节末），
校验器 `scripts/validate_assignments.py` 的 `NO_ROLE_KINDS` 与 `test/role-map.spec.mjs` 目前都只认四类，
写了会被判 `J4-NO-ROLE-KIND` —— **那不是你写错了，是这张表曾经跑在实现前面**（2026-09-15 由 40 条全栈件入库时实测发现）。

| `no_role_kind` | 状态 | 含义 | 典型 |
| --- | --- | --- | --- |
| `GENERIC_METHOD` | **生效** | 跨岗位通用的**方法论**：任何岗位都能用，但不承载某一岗的责任 | `tdd`、`code-review`、`doc-coauthoring`、`grilling` |
| `TOOL_ONLY` | **生效** | **纯工具/格式处理形态**：无业务语义，只做转换或呈现 | `docx`、`pptx`、`anysearch`、`chart-gen` |
| `OUT_OF_SCOPE` | **生效** | 有明确业务语义，但不在本体系出海链路内 | `freemium-upgrade-optimizer`（面向 SaaS 付费墙） |
| `OTHER` | **生效** | 兜底（需在 `no_role_reason` 说清） | — |
| `GENERIC_OFFICE` | 🕓 未生效 | **通用办公**：写作/文书/演示/会议/表格/翻译等任何岗位日常都要用的产出能力 | `meeting-minutes`、`work-report-writer`、`copy-editor`、`weighted-scoring` |
| `GENERIC_ANALYTICS` | 🕓 未生效 | **通用数据方法**：跨领域的分析手法，输入任意数据、不绑定业务口径 | `validate-data`、`outlier-scan`、`regression-insight` |
| `DEV_ENGINEERING` | 🕓 未生效 | **工程能力**：面向代码/系统的开发与运维能力，不服务出海业务的某一岗 | `ci-cd-and-automation`、`observability-and-instrumentation` |

> **2026-09-14 提议新增后三个分型**（原只有生效的四类）：本批 592 个来件里**通用件有 70+ 条**，
> 一个 `GENERIC_METHOD` 装不下——把「会议纪要」和「跨仓库工程方法论」放进同一格，卡片分组与
> 后续按族挂载都会失去区分度。`GENERIC_*` 与 `DEV_ENGINEERING` 三条的边界是**用途域**，
> `GENERIC_METHOD` 的边界是**方法论属性**；判不准时优先看「它产出的是不是业务结论」（是 → 路径 A 挂岗）。
>
> **2026-09-15 实测更正**：这三条**从未落地**——只写进了本表，没进校验器、没进测试、
> 没进 `manifest/role-assignments.json` 的任何一条（该表 68 条无岗件全部落在生效四类里）。
> 后果是**照本表判就会撞红**：写 `DEV_ENGINEERING` 的条目会被 `J4-NO-ROLE-KIND` 判失败，
> 而报错措辞把责任指向判定人而不是文档。已按「文档不许承诺没被守住的东西」改成本表的状态列。
> 要真正启用需三处同改：`validate_assignments.py` 的 `NO_ROLE_KINDS`、`test/role-map.spec.mjs`
> 的分型集合、以及**既有 68 条已判无岗条目的分型重判**（新词汇会改变大量条目的归属）。
> 这是一次产品可见的分组变化（页面按分型在场景组头聚合显示），**未获明确决定前保持四类**。

**判别要点：技能是「产出业务结论」还是「只做呈现/转换」。** 图表渲染输入任意数据、不选品不归因不做经营判断 → `TOOL_ONLY`；同组的 `ecommerce-sales-dashboard` 挂了 AGT-021/AGT-003，因为它**自带业务口径**——这是两者的分界，不能因为「都出报表」就抄同一个答案。

`no_role_reason` 要写成能独立读懂的一段话（现状体例见该文件既有条目）。

### 12.6 第六步 · 重建、验收、生效

```bash
cd ~/project/Magpie-Horch/packages/capabilities/dsh-overseas-skills

# 1) 改动落 manifest 后重建（catalog.js / role-map.js 是构建产物，不要手改）
python3 scripts/build_role_map.py            # manifest → lib/role-map.js
python3 scripts/build_preset_catalog.py      # manifest → lib/catalog.js（自带 preset-skills.json 防清空守卫）

# 1b) 只改了技能正文/图标/摘要时的同步线（与 1) 互不替代）
node scripts/build-evidence-corpus.mjs --check  # 证据语料是否覆盖目录里每一条（缺一条即 from_skill 不可复核）
python3 scripts/add-fs-brand-icons.py           # 新增全栈技能 → lute-brand-icons catalog（--write 才落盘）
python3 scripts/assign_lute_icons.py            # 再烘焙 manifest/skill-icons-{fs,gn}.json

# 2) 契约门（含 coverage 计数一致性、SOP 分型表与校验器对账）
node --test test/*.spec.mjs                  # 期望全绿

# 3) 重启桌面进程（catalog 在宿主内存里，不重启页面看不到新卡片）
osascript -e 'tell application "DSH Desktop" to quit'; sleep 5; open -a "DSH Desktop"

# 4) 运行层取证
curl -s http://127.0.0.1:43120/api/dsh-overseas-skills/list | \
  python3 -c "import json,sys;d=json.load(sys.stdin);[print(s['key'],len(x['items'])) for s in d['scenarios'] for x in s['subs'] if x['key']=='<细分场景key>']"
```

验收标准（四项缺一不可）：契约门全绿；目标细分场景条目数 **+1**；卡片 `title` 是中文名、`installed=true`、`modelEnabled=true`；头像与同组其它技能**不同**。

### 12.7 已知陷阱（实测，重复运行会踩）

| 陷阱 | 症状 | 处置 |
| --- | --- | --- |
| ✅ 已修（2026-09-12）：`build_preset_catalog.py` 曾无条件重写 `presets/preset-skills.json` | `PRESET_IDS` 里那 7 个 preset 已不在 `~/.dsh/.agent-presets`（现存 51 个 `agt-NNN`），重跑把它清成 `{"presets": []}`，混进提交 | 已加守卫：**本次解析出 0 个而文件已有内容时跳过写盘并告警**；确要清空用 `--force-empty-presets`。路径若再变，守卫会打印告警而非静默改写 |
| ⚠️ 改了 manifest 不重启 | 页面上卡片不出现，但 curl 磁盘产物却已正确 —— 像「改了没生效」 | 宿主在内存持有 catalog 模块，必须重启进程 |
| ⚠️ 启动「用 CLI 起隔离实例」验证 | `dsh --profile desktop` 在装载阶段即失败，**不是**忠实启动 | desktop profile 的启动合约含 Electron 壳侧步骤（package overlay、YAML `!!js` tag 解析）。实况验证只能在重启后的真实实例里做 |

### 12.8 准入前置检查（许可证与署名）

入库前必须核 `LICENSE` 与 `THIRD_PARTY_NOTICES`，把结论写进 §12.2 的来源留底：

- **非商业许可（如 PolyForm Noncommercial）**：个人研究/内部试验可用，**对外商业交付超范围**。需先取得授权或明确放弃用于商业交付——这是业务决策，不是技术决策，必须留档。
- **署名要求**：部分技能在 SKILL.md 里明文要求模型交付后署名。**照做，但不要写进产出物本身**（上游常明确禁止污染内容）。
- **第三方依赖**：模板/脚本引外部 CDN、字体、地图数据时，记明联网依赖与各自许可证。

### 12.9 变体 · AI 全栈技能入库（与出海路径的落点差异）

出海技能进 `overseasNames` + `manifest/skills.json`；**AI 全栈技能进 `fullstackNames` + 全栈管线**，落点清单不同（2026-09-12 `simplify-codebase` 入库实测）：

| 落点 | 出海路径（§12.3–12.4） | 全栈路径 |
| --- | --- | --- |
| 技能目录 | `~/.dsh/skills/<name>/`（tarball + 四件套 + metadata 溯源块） | 同左，但 **frontmatter 用全栈标准形态**（name/title/description/enabled/disable-model-invocation/user-invocable）——`verify-fullstack.mjs` 的正则**只允许纯标量行，metadata 块会报「非法fm行」**；溯源写进技能目录 `README.usage.md` |
| 汉译 | — | `staging/translations/<name>.body.md`（正文汉译，references 保真英文原文） |
| 安装管线 | 手动 tarball | `import-fullstack.mjs` 多根回退：`staging/third-party/<name>/` 优先（仓库内版本化缓存），`/tmp/mattpocock-skills/skills` 兜底 |
| 映射表 | `manifest/skills.json` | **两处**：`scripts/fullstack-mapping.json`（安装+图标管线事实源，src/name/title/cat/summaryZh）+ `manifest/fullstack-skills.json`（catalog 构建读） |
| taxonomy | `mapping` + `overseasNames` | `mapping["<name>"] = "h2-agent-skill"` + `fullstackNames` 数组 |
| 归位 | `catalog: "overseas"` + 细分场景 | `role-assignments.json`：`catalog: "fs"` + `scenario: fs-*`（8 组：clarify/spec/architecture/implement/quality/infra/collab/writing）+ 挂岗或 `GENERIC_METHOD`/`TOOL_ONLY`。**两条支撑脚本**：`scripts/build-evidence-corpus.mjs`（把新技能正文补进证据语料；缺了则 `from_skill` 全部「不可复核」，结论无据可查）、`scripts/apply-role-fragments.py`（合并判定片段 + 重算 `coverage` + 同步 `_meta.purpose`；写盘前先跑正式判据与序列化守卫） |
| 头像 | `skill-icons.json` | `scripts/add-fs-brand-icons.py` 把 `sk-fs-<name>` 条目按 id 归入 lute-brand-icons `scripts/catalog.js` 的既有块（**40 个徽章选型留档在仓库里**，不再只活在本机资产）→ `node scripts/build.js` → `assign_lute_icons.py` 自动写 `skill-icons-fs.json` |
| 计数闸门 | — | `verify-fullstack.mjs` 的 `TOTAL` **已改为从映射推导**（2026-09-15 去硬编码，「30/30」一类手改计数不再存在）。README 里那几处会腐烂的数字（归位条数、测试条数）由 `test/doc-counts.spec.mjs` 守着 |
| 验收接口 | `/api/.../list` | `/api/.../fullstack-list`：`groups[]` 目标 fs 组条目数 +1，卡片 installed/modelEnabled/icon 齐全 |

判 `GENERIC_METHOD` 的对照锚：`codebase-design`、`improve-codebase-architecture`、`tdd`——跨仓库通用的工程方法论，不承载任一岗位三条责任。

### 12.10 第零步 · 运行时前提（先于安装，2026-09-14 新增）

> **为什么补这一步**：§12.1–12.9 的判据全部在回答同一个问题——「技能引用的 skill id 存在吗」。
> 目录名唯一、图标覆盖、路由引用无悬空，**没有一条在问「这个技能跑得起来吗」**。
> 结果是假绿：卡片正常、`installed=true`、模型看得见，一调用就 `ImportError`。

**实测（2026-09-14，本机，T0 精选 15 条）**：15 条里 **4 条装完必然跑不起来**——
缺 `openpyxl` / `matplotlib` / `python-docx` / `python-pptx` / `PyMuPDF` / `pdfplumber` /
`pypdf` / `reportlab` / `seaborn`，Node 侧缺 `vega` / `vega-lite` / `sharp`。
而当时**所有门禁是全绿的**。

#### 三个脚本

| 脚本 | 作用 | 判据 |
| --- | --- | --- |
| `scripts/scan-runtime-deps.mjs` | 扫来件抽依赖 → `manifest/runtime-deps.json`；`--probe` 实测本机；`--check` 供门禁调用 | 按**代码块语言**分流抽取（见下），人工核对走 `manifest/runtime-deps.overrides.json` |
| `scripts/install-runtime-deps.sh` | 建受管 venv + 装 Python / brew CLI / Node 包；**先建 venv 再探测** | 幂等，只装探测为缺的；结束前做中文渲染自检 |
| `scripts/intake-lint.mjs` | 安装前结构体检（§12.1 准入） | 见「结构体检」表 |

门禁侧：`gate:skill-runtime-preconditions`（仓库根 `pnpm run gate` 内）。判据是
**已接线技能的声明依赖逐条就位**，射程取自各 `agt-NNN/agent.cordis.yml` 的 `skill-subset`——
一条还没接线的技能不拖红，一旦接线就必须齐备。

#### 抽取为什么必须按代码块语言分流

同一个词在 shell 块里是命令，在 python 块里是散文。实测三次误报都出自这里：

- `"""… ; convert .doc to .docx …"""` 被当成 ImageMagick → 把 `# For .ppt: convert via libreoffice`
  那句的 `;` 当成了 shell 分隔符
- 正文里的 CSS 术语 `` `dot` `` 被当成 Graphviz
- `npm install -g playwright && npx playwright install chromium` 的 `\s+` 吃掉换行，
  把下一行 `node /data/.../chart.mjs` 也吞成了包名

所以：**fenced block 先判语言**（shell / python / js / 其它），`import X` 只认 python 块与 `.py`，
`pip install` 只认 shell 块与行内代码，外部 CLI 只认「真被当命令调用」的四种形状
（argv 列表 `['bin', …]` / 行首 `bin -flag` / `| bin …` / `command -v bin`）。

#### 人工覆盖是事实源，且是**替换**不是合并

`manifest/runtime-deps.overrides.json` 里写过就代表逐条核过；合并会把误报又带回来。
每条可标 `optional` 并写 `why`——**软依赖不计红**，但要在读数里看得见。实测三例：

- `sn-da-non-spreadsheet-analysis` 的 **libreoffice 是软依赖**：只在旧格式 `.doc` / `.ppt` 上
  走转换（`capability/word-analysis/SKILL.md:14,267`、`capability/ppt-analysis/SKILL.md:16,328`）；
  `.docx` / `.pptx` 直接走 python-docx / python-pptx
- `minimax-pdf` 的 **playwright 是软依赖**：只有 `render_cover.js` 走无头浏览器
- `chart-gen` **不需要 matplotlib**——它是 Vega-Lite + Sharp 的 Node 实现
  （早期分析文档里记的 matplotlib 是错的，已在此更正）

#### 依赖装到哪：受管 venv，不是系统 Python

```
$VENV = ~/.dsh/skills-runtime/.venv        # 注意：不是 ~/.dsh/skills/
```

两条理由：

1. **不污染系统 Python**。本机系统 Python 是 3.14.7，太新——轮子覆盖不全，
   且装崩了会波及 DSH 自身。venv 钉 **3.12**（PyMuPDF / scikit-learn / scipy / pandas
   的 macOS 轮子在 3.12 上齐全）。
2. **不落在 `~/.dsh/skills/`**。那是技能目录，每个子目录都会被当成一条技能；
   把几万个文件的 venv 放进去会污染 `verify_static.mjs` 的悬空引用判定
   （它 `readdir` 后并进「合法名字」集合）。

#### 两条会静默出错的实现细节

- ⛔ **探测口径必须跟着 venv 走**。venv 一旦存在，探测就**只**看 venv。回退到系统 python3
  会出现「系统里有 pandas ✓ 但 venv 里没有」——门禁绿、一跑就 ImportError。
  同理 installer **必须先建 venv 再探测**：第一版顺序反了，计划漏了 `scipy` / `scikit-learn`，
  跑第二遍才收敛。
- ⛔ **`--skills` 局部扫描写 manifest 必须并入，不能整体覆盖**。实测一次试跑把 manifest
  从 5 条缩成 2 条，门禁于是不再检查另外 3 条，**继续报绿**。

#### 环境前提：中文渲染（非包类，装不出来）

`matplotlib` 装上了，默认 `DejaVu Sans` 不含 CJK 字形 → 中文标题渲染成豆腐块，
**脚本退出码 0、图也生成了，坏在交付物里**。对中文组织这是常态。

配置落在 `$VENV/etc/matplotlib/matplotlibrc`，由 `$VENV/.../sitecustomize.py` 设
`MPLCONFIGDIR` 指过去。三个位置的取舍：

- 不放 `~/.matplotlib` / `~/.config/matplotlib`：会作用于**所有** Python，含系统与 DSH 自身
- 不直接放 `$VENV/etc/matplotlibrc`：matplotlib 3.11 **已不再搜索该路径**
  （实测 `matplotlib_fname()` 直接落到 `site-packages/mpl-data`）
- 不改 `site-packages/matplotlib/mpl-data/matplotlibrc`：会被 `uv pip install --reinstall` 抹掉

自检判据是**真的渲染一次中文**（`-W error::UserWarning` 把缺字警告升级成异常），
不是「字体文件存在」。字体按本机实测可用性排序：`Hiragino Sans GB` / `Heiti SC` /
`Songti SC` / `Arial Unicode MS` 可；`PingFang SC` 与 `STHeiti` 是 `.ttc` 集合，3.11 加载失败。

#### 结构体检（§12.1 准入）判据与实测分布

`node scripts/intake-lint.mjs`——判据全部来自实测缺陷，不是想象出来的。
**592 个来件实测**：致命 12 条、告警 144 条（第一版规则误报 135 条，收窄后见下表）。

| 判据 | 严重度 | 实测 |
| --- | --- | --- |
| 坏文件（含 NUL 字节，代码/数据被毁） | **致命** | 12 条（kimi 系统性：`_meta.json`、`scripts/*.js`、`package.json`、`requirements.txt`） |
| 厂商标记文件损坏（`_meta.json` / `LICENSE` / `THIRD_PARTY_NOTICES`） | 告警（安装时丢弃） | 20 条 |
| 硬编码**技能自身**路径（`…/skills/…`，本机必不存在） | **致命** | 2 条（chart-gen、speech-synthesis） |
| 正文示例用原厂沙箱路径（`/mnt/data/out.xlsx`） | 告警（改写即可） | 6 条 |
| 双层嵌套（实际技能在 `<name>/` 下） | 告警（安装时**自动拆壳**） | 111 条（MinMaxDesign 整批是 zip，106 条） |
| 多技能包（一个来件含 N 个子技能） | 告警（**须拆成 N 条**，不是坏了） | kimi `gitlab-cli-guide` 等 |
| `__MACOSX` / `._` 资源分支 | 告警（安装时过滤） | 21 条 |
| 断引用（指向未随附文件） | 告警 | 6 条 |
| frontmatter 缺 name / description | 致命 / 告警 | 5 条 |
| 带 `.git` | **致命** | 0 条 |

**修补与豁免必须声明**（`staging/intake-repairs.json`）：`dropFiles` / `writeFiles` /
`rewritePaths` / `acceptFatal`。参照 ADR-0014——**匹配不到任何缺陷的豁免会报错**
（过期豁免长期挂账就是假绿）。实测 T0 15 条里 3 条需要修补：

- `chart-gen`：丢损坏的 `_meta.json`；从 `scripts/chart.mjs` 的 import **重建**
  `scripts/package.json`（原文件是乱码，`npm install` 必失败）；3 处 `/data/clawd/skills/chart-image/*`
  改写为相对路径
- `guizang-ppt-skill`：丢损坏的 `assets/motion.min.js`（68 KB 乱码）。该技能自带两级降级
  （本地 → jsdelivr CDN → 强制 `opacity:1`，见 `references/components.md:380`），
  功能不受影响，仅失去离线兜底。另有已知缺口：`assets/screenshot-backgrounds/` 未随包
- `sop-writer`：丢损坏的 `LICENSE.txt`（许可证结论改按 frontmatter 声明的 Apache-2.0 记）

#### 安装产物

- `~/.dsh/skills/<name>/`，全量保真复制，**不保留 `.git`**（§12.2）
- `~/.dsh/skills/<name>/SKILL.md`：四件套 frontmatter（§12.3）
- `manifest/intake-provenance.json`：批次 / 原始单元 / **逐文件 sha256** / 许可证结论 /
  已应用的修补 / 已知缺口。失去 `.git` 后靠它做升级比对与回滚
- 覆盖已装件前逐个 `ditto` 备份到 `backup/intake-2026-09/overwritten/`

#### 验收（缺一不可）

1. `node scripts/intake-lint.mjs --skills <名单>` 致命缺陷全被修补或显式豁免
2. 四件套齐全（`node scripts/intake-install.mjs --dry` 逐条报）
3. `scripts/scan-runtime-deps.mjs --check --subset <名单>` 硬缺为 0
4. **真的跑一次**——这一条不可省。实测通过的四条：`chart-gen` 出 PNG（690×390）、
   `sn-da-excel-workflow` 写读 xlsx 带条件格式、`sn-da-non-spreadsheet-analysis`
   解析 docx/pptx/pdf、`minimax-pdf` 出中文 PDF 并能回读文本
5. `pnpm run gate` 全绿（含 `gate:skill-runtime-preconditions`）

### 12.11 变体 · 通用技能线入库与**接线**（2026-09-15 新增）

> **为什么补这一节**：§12.1–12.10 管到了「装得上」「跑得起来」，但**没有一节管「挂得上」**。
> 而出海线与全栈线的落点差异（§12.9）讲的是**归位**——技能属于哪些岗位、喂给哪个页面。
> **归位 ≠ 接线**：归位喂页面，接线喂会话。一条技能可以归位得完全正确、在设置页显示得
> 完全正常，却在 50 个岗位会话里一次都不会被模型看见。

#### 三条线，两套落点

| 线 | 归位写入 | 接线写入 | 谁来挂 |
| --- | --- | --- | --- |
| 出海（`overseasNames`） | `manifest/skills.json` + `role-assignments.json` 路径 A 挂岗 | 各岗位 preset 的 `skill-subset`（逐岗不同） | `generate.mjs` 的 `skill-map.json` 供给 |
| AI全栈（`fullstackNames`） | `manifest/fullstack-skills.json` + `role-assignments.json` `catalog: "fs"` | **不进 `agt-*` preset** | 无（按需在设置页开关） |
| **通用（`genericNames`）** | `manifest/generic-skills.json` | **T0 进全部 50 个 `agt-*` preset 的 `skill-subset`** | `generate.mjs` 读同一份清单 |

#### 为什么「通用」在装配上的含义只能是「逐岗各挂一份」

DSH 的技能可见性由 `dsh-skill-subset` 的 `skills: [...]` 白名单 + `hideOthers` 决定，
**没有「全局技能」这一层**。所以 T0 的 15 条不是「挂一次大家都能用」，
而是「50 个岗位各自挂上同样那 15 条」。代价是每个会话多约 **1,900 tok** 的技能目录；
收益是任何岗位在任何时候都能用上开会纪要、周报、图表、PDF 这些与岗位无关的动作。

#### 一份事实只有一个家（与全栈线的差异，这是有意的）

全栈线有**两份**高度重叠的文件（`scripts/fullstack-mapping.json` 与
`manifest/fullstack-skills.json`）。通用线**只保留一份**：`manifest/generic-skills.json`。
它是派生产物（唯一的人工判断是 T0 分档，见本段末），派生源是 `staging/intake-localize.json`（四件套 + 分组，逐条读过原文写的）
与 `manifest/intake-provenance.json`（批次 / 许可证 / 修补），派生器是
`scripts/build-generic-manifest.mjs`。**T0 名单的家就是派生器里的 `T0_NAMES` 常量**，
其余四处（设置页、图标分配、`verify_static`、`generate.mjs`）全部**读**它。

> 为什么不把 T0 写进 `generate.mjs` 当常量：同一份 15 条还要被另外三处读。
> 常量放进去就等于有第二个家，而第二个家只能靠人对齐——那是纪律，不是机制。

#### 图标

`assign_lute_icons.py` 从 `manifest/generic-skills.json` 取名单，按 `gn-cat-<key>`（8 个分组）
与 `sk-gn-<name>`（每行）两个约定从 lute-brand-icons 的 `assets/manifest.json` 取图，
写出 `manifest/category-icons-gn.json` + `manifest/skill-icons-gn.json`。
**不要写 `manifest/skills.json` 的行级 `icon`**——那条路径会静默失效。

#### 接线顺序：T0 必须在契约闸门**之后**并入

`generate.mjs` 里 T0 的并入点放在 `contractGateFor()` **之后**。理由是实测得出的：
闸门判的是 `p2s-` 卡的「这张卡有没有被契约引用」，第三方的通用技能不是 p2s 卡、没有契约可挂。
放闸门之前它们会被算成 `pending`，一旦把 `P2S_CONTRACT_GATE` 切到 `enforce`，
**T0 会被静默删掉**——一条与计量模式无关的接线，不该跟着另一个开关的档位改变生死。

#### 接线判据：读回落的字节，不读意图

`generate.mjs` 写盘后**重新读回** `agent.cordis.yml`，逐条核对 15 个名字是否真的在
`skill-subset` 里；缺一条即 `exit 1`。只报「T0 名单有 15 条」是自述不是读数——
那 15 条有没有真的进文件，只有回读才算数（P-17）。

#### 验收（缺一不可）

1. `node scripts/build-generic-manifest.mjs` 无问题，`--check` 与磁盘一致
   （**`--check` 的退出码有两态**：`0` 一致 / `1` 与磁盘不一致 / **`2` = 派生源 `staging/` 不在本机**。
   `staging/` 按 `.gitignore:44` 不入库，所以干净 clone 上没有派生源——那是**环境事实**，
   不是清单坏了。两个 verifier 都把 `2` 当「跳过并说明」，`1` 才是红。契约由
   `test/generic-manifest-skip.spec.mjs` 的 G1–G4 钉住，见 playbook P-21）
2. 图标：`python3 scripts/assign_lute_icons.py` 通过（缺 id 会 `SystemExit` 点名）
3. `python3 scripts/build_preset_catalog.py` 重建 `lib/catalog.js`（GN 8 组 / 15 行）
4. `node scripts/role-presets/generate.mjs` → 收尾必须打印
   `★ 通用线 T0 15/15 条在 50/50 个岗位的 skill-subset 里逐字回读命中`
5. `node scripts/verify-generic.mjs` 全绿
6. `pnpm run gate` 全绿（含 `gate:skill-lines`，见 §12.12）

### 12.12 `gate:skill-lines` · 三条线终于进了 `pnpm run gate`

**这是一处补漏，不是新增要求。** §4 的验收清单与 `scripts/pipeline.sh` 一直写着要跑
`verify_static.mjs`，但 **`pnpm run gate` 里从来没有一项跑过它**——三个验证器
（`verify_static` / `verify-generic` / `verify-fullstack`）此前只有人工执行这一条路。
于是「技能入库要跑 verify_static」只活在文档与人的自觉里，不是一个会拦住提交的机制（P-03）。

`scripts/gates/skill-lines.mjs` 把三条线各自的验证器串成一个调用点。射程与跳过：

- 本机没有 `~/.dsh/skills` **且**没有 `~/.dsh/.agent-presets` → **跳过**（`passed: true` + note）。
  环境不存在时不假绿也不假红，与 `patch-anchors` / `theme-tokens` 同一语义。
- 目录存在 → 任一验证器非零退出即红，原文回传它的输出。

本项自己也有反向自测（`gate:skill-lines-selftest`，7 条）：环境不在必须是**跳过且说清跳过了什么**
而不是静默通过、验证器判红必须回传原文、验证器文件不存在必须红、第三个验证器红而前两个绿仍必须红、
包内一条 spec 都没有必须红（空射程不得长得像通过，P-11）、恒真桩突变（`passed` 钉成常量 `true`）
必须让用例失效。另有一条守卫专门钉「红桩 key 打错字」这种**静默变空转**的反向用例——
第一版把 `verify_static.mjs` 写成了 `verify-static.mjs`，那个本该红的桩一次也没生效，
用例绿着通过。**看起来验过了比没有验过更坏**（P-02）。

射程里有**四个**验证器（前三个量数据，第四个量负载形状）：

| 验证器 | 回答的问题 |
| --- | --- |
| `verify_static.mjs` | 名字唯一 / 图标覆盖 / 三线名单无漂移 / 悬空引用 / 运行时前提 |
| `verify-generic.mjs` | 通用线 T0 是否真的挂进**每一个**岗位 preset |
| `verify-fullstack.mjs` | AI全栈 30 条安装完整 / frontmatter 合法 / 资源脚本可编译 |
| `test/*.spec.mjs`（包自身） | **三个路由拼出来的页面负载形状**——`buildGroupsLegacy` 靠 `skill.category === cat.key` 配对，清单分组 key 与 catalog 的 category 一旦写岔，返回的是 N 个**空组**：页面一片空白，而不是报错。这段只有真的 `apply` 一遍插件才跑得到，静态判据看不见 |

包内 fixture 在真机 preset 不足 50 个时**跳过并打印 diagnostic**（不静默通过），
所以本项在没入库的机器上不会因此变红。

**上线当天它就抓到两件事**，都不是本次改动引入的：

1. **`lib/catalog.js` 缺 `SKILLS_GN`、通用线名单漂移**——本次改动尚未重建目录，属预期红。
2. **`verify-fullstack.mjs` 恒红**：它的第五条判据断言
   `~/.dsh/.agent-presets/ai-product-developer/skills/{tdd,to-spec,grill-me}` 存在，
   而该 preset 组在 v3 重组时已移出本机（现存只有 `agt-001..050` + `bobo-cto` + `lute-cordis`）。
   原实现把「预设目录不在本机」报成「副本丢失」——**前者是环境事实，后者是数据被动了**。
   已修：目录不在 → 跳过并说明；目录在 → 逐条核对，且条数取自 `presets/preset-skills.json`
   而非硬编码的 3（硬编码会让「少了一条」与「改过清单」无法区分）。

  > 恒红的判据与恒绿的判据一样没有信息量：人只会学会绕过它。
