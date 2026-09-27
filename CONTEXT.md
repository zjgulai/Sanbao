# CONTEXT · 术语表

本文件是**纯术语表**：只定义词义，不放实现细节、不放规格说明。
同一结论的完整表述住在它该住的地方（ADR / docs/architecture.md / 各能力组 README），
此处只留一句可判真的定义。当前正在收敛的术语来自 Sage 自有桌面壳设计树；未落地的实现不得由本表表述为已交付。

## 品牌与身份

| 术语 | 定义 | 归属 |
| --- | --- | --- |
| **Sage / 三宝** | 唯一的对外产品品牌：`Sage` 是英文产品名，「三宝」是中文产品名；二者是同一产品的本地化表达。 | [Sage 自有桌面壳设计树](docs/notes/proposed/architecture/2026-09-24-sage-self-owned-desktop-design-tree.md) |
| **Sanbao** | 退役的罗马字品牌名；只允许出现在历史证据、兼容迁移和尚未完成的源代码改造面，不得新增到用户可见面。 | [Sage 自有桌面壳设计树](docs/notes/proposed/architecture/2026-09-24-sage-self-owned-desktop-design-tree.md) |
| **WorldPilot** | **视觉语言供体**，不是产品名。本仓采纳它的色彩/材质/排印/图像/动效契约；不得在任何出货可见面上当产品名使用。 | ADR-0136 D1 |
| **字顺分工** | 拉丁 `Sage` 管英文 UI、字标、图标、Finder 名、DMG 名、`short_name` 与未来原生身份；中文「三宝」管中文 UI、中文文档标题与中文文案位。 | [Sage 自有桌面壳设计树](docs/notes/proposed/architecture/2026-09-24-sage-self-owned-desktop-design-tree.md) |
| **品牌名源** | 产品名字的唯一可编辑源，所有含名字的产物由它生成。改名 = 改这一个源 + 重跑生成。 | ADR-0136 D2 |
| **slogan** | 中「三宝出海，货通四方」；英 `Sage — Your AI Fleet to Global Markets`。**愿景式口号**，不是「面向 X 客户群」的可证伪断言。 | [Sage 自有桌面壳设计树](docs/notes/proposed/architecture/2026-09-24-sage-self-owned-desktop-design-tree.md) |
| **Sage 图标母版** | Sage 的唯一主图形来源是 Sanbao Logo Kit 的 `A_StarSail_Product_symbol.svg` 图形几何；它与官网已选 A 路线同源，但进入 Sage 前必须派生为无 `SanBao` 元数据的资产。 | [ADR-0159](docs/adr/ADR-0159.md) |
| **受控品牌衍生物** | 由 Sage 图标母版生成的 `sage-symbol`、深浅色版、AppIconset / `Sage.icns` 与新的 Sage lockup；源仓字标、概念图和生成记录不进入出货物。 | [ADR-0159](docs/adr/ADR-0159.md) |
| **LUTE** | 历史内部标识；产品壳源码已受控迁移 `apps/lute-shell/` → `apps/sage-shell/`。`lute-shell` profile、`lute-host`、`LUTE_SHELL_*` 与治理字段仍是显式兼容接口，不得进入新用户可见面或新产品命名。 | [ADR-0159](docs/adr/ADR-0159.md) |
| **单品牌收口** | 一个产品只有一套对外名字。不存在「底座名 + 皮名」并存的中间态。 | ADR-0131 |
| **视觉语言 / 产品名（解耦）** | 色板、材质、排印签名、头像、动效与产品名无关，可独立采纳；字标、字母标、文件名、签名身份绑产品名。本轮 60% / 40% 的分界即由此而来。 | ADR-0136 |
| **Harness Capability Runtime** | 在过渡期提供 agent、插件与 Cordis 能力的上游运行时；它不是 Sage 的产品 UI、窗口系统或导航壳。 | [Sage 自有桌面壳设计树](docs/notes/proposed/architecture/2026-09-24-sage-self-owned-desktop-design-tree.md) |
| **Sage Shell** | Sage 自己拥有的桌面窗口、路由、交互、产品状态与发布身份；只通过稳定适配边界消费 Harness 能力。 | [Sage 自有桌面壳设计树](docs/notes/proposed/architecture/2026-09-24-sage-self-owned-desktop-design-tree.md) |
| **Capability Adapter** | Sage Shell 与 Harness Capability Runtime 之间唯一允许的能力、事件和状态翻译边界；产品页面不得直接依赖 Cordis 或上游 UI。 | [Sage 自有桌面壳设计树](docs/notes/proposed/architecture/2026-09-24-sage-self-owned-desktop-design-tree.md) |
| **原型契约** | 原型中被确认的页面、状态、跳转和交互意图；它是 Sage Shell 的产品输入，不是可直接挂载的运行时包。 | [Sage 自有桌面壳设计树](docs/notes/proposed/architecture/2026-09-24-sage-self-owned-desktop-design-tree.md) |
| **产品主线（product spine）** | 首版优先打通的跨境经营 AgenticOS 闭环：经营事项创建 → 证据输入 → 运行活动 → 澄清/人工审批 → 产物回执 → 失败重试。 | [ADR-0159](docs/adr/ADR-0159.md) |
| **经营事项** | Sage 的首要领域对象，统一持有范围与版本、证据和未知、可比较选项、依赖就绪度、授权动作、产物、回执与经验；它不是 DSH 会话或侧栏的别名。 | [ADR-0159](docs/adr/ADR-0159.md) |
| **可见品牌清零** | Sage 的窗口、Dock / Finder、启动、空态、侧栏、设置、错误框、安装器和产品页面均不得出现原桌面品牌；许可证、依赖字节、vendor pin 与历史证据保留真实第三方归属。 | [ADR-0159](docs/adr/ADR-0159.md) |

## 工程拓扑

| 术语 | 定义 | 归属 |
| --- | --- | --- |
| **受管包 / managed package** | 被目录墙收录并受治理的包；不自动等于 profile 已安装、bundle 已注册或宿主已生效。 | `docs/catalog/packages.md` |
| **宿主 / host** | 运行插件和界面的环境。DSH Desktop 与 Sage Shell 是两条不同的宿主路径，不能默认互相替代。 | `docs/architecture.md` |
| **运行时装配 / runtime composition** | 源码经过 profile 的 `file:` 依赖、bundle 注册再被宿主加载的链路；每一段都要单独取证。 | `docs/architecture.md` |
| **Sage 数据根** | Sage 自有 Bundle ID、profile、host 与用户数据的默认隔离位置；首次迁移仅复制、校验和回滚，不原地改写旧 `~/.dsh` 或当前 DSH Desktop 数据。 | [ADR-0159](docs/adr/ADR-0159.md) |
| **受控清理** | 先只读盘点，再将每项标为保留、归档或删除；删除必须有明确名单、恢复副本和单独授权。未知发布物、旧 App 与运行数据在 Sage 验收前一律保留。 | [ADR-0159](docs/adr/ADR-0159.md) |

## 射程（什么改、什么不改）

| 术语 | 定义 |
| --- | --- |
| **出货可见面** | 客户在安装后可感知的品牌位。全集共 **16 处**，其清单是唯一权威射程表（`.scratch/sanbao-reskin/surface-map.md`）。 |
| **内部面** | 不随皮走：npm 包名、目录名、`luteOrigin`/`luteOwner`/`lutePublish`、bundle 目录名与可执行文件名、`appId`。 |
| **不可动锚** | 改了就断链的技术事实：`/Applications/DSH Desktop.app` 路径、`ai.deepseek.dsh.desktop`、`file:` 硬链接 inode、CSS-module 哈希。 |
| **品牌泄漏** | 出货可见面上残留的基座原名（如「请重启 DeepSeek Harness」）。换皮必须清零，且由门禁拦新增。 |
| **品牌事实之家** | 一条品牌事实（如主色十六进制）在盘上的**唯一**权威住处。其余位置一律引用或生成。 |

## 素材源与图形语言

| 术语 | 定义 |
| --- | --- |
| **素材源仓** | `github.com/lillian-maker/WorldPilot`。三类资产：`brand/logo/`、`digital-employees/`、`website/`。本仓采纳其**视觉语言与头像**，不采纳其字标与字母标。 |
| **五形态** | Logo 的五种构图：`mark`（独立字母标）、`lockup`（图左字右横版）、`stacked`（图上字下）、`square`（带留白透明方图标）、`favicon`（随系统明暗变色）。 |
| **色道 / colorway** | 同一形态的四套配色：`dark`（炭黑背景）、`light`（冷白背景）、`black`（单黑）、`white`（反白）。 |
| **WP 字母标** | W→P 连笔单路径字母标，圆头笔画。深色图形 `#c4d0dc`，浅色图形 `#344b61`。**属供体的名字资产，本产品不沿用**（ADR-0136 D5）。 |
| **R∞T 字标** | 被替换对象：现状 boot 字标（R + ∞ + T 三笔画加三横条），住 `dsh-root-brand-local/src/client/brand.tsx`。 |
| **钛银 / titanium** | WorldPilot 主色的材质名：安静表面、精确边缘、冷反射光。 |
| **材质 token / `--metal-*`** | 钛银的渐变实现（`metal-fill` / `metal-line` / `metal-highlight` / `metal-pressed`），是品牌签名而非可选装饰。 |

## 岗位与图像

| 术语 | 定义 |
| --- | --- |
| **数字员工** | 一个岗位的人格化 AI 分身。身份主键是 `AGT-NNN`。 |
| **AGT-NNN** | 岗位编号。**两仓同源**：素材源仓 `workforce.json` 的 AGT-001…050 与本仓 `role-catalog.json v2.0` 的 50 个岗位逐条对应（职责 50/50 命中、花名 50/50 全等），可按 ID 零映射直投。 |
| **花名 / alias** | 岗位人格名（衡远、枢衡、明镜…）。两仓 50/50 全等，故头像与人格天然对齐。 |
| **四平面 × 八责任域** | 组织骨架：经营管理 / 业务运营 / 独立控制 / 数据与 Agent 平台 × 经营与组织、产品与创新、品牌与增长、渠道经营、供应与履约、服务与体验、财务与合规、数据与 AI 运行。素材源仓称 `plane` / `domain`，本仓称 `group`（缺平面维度）。 |
| **色道头像 / dark-light 双套** | 每位员工有深色、浅色两套形象，同一人两套只换背景不换脸。七档尺寸 32/48/64/80/128/256/512。 |
| **线稿头像** | 被替换对象：现状由 `~/.dsh/skills/lute-brand-icons` 生成的 100×100 viewBox 绿色描边 SVG 徽章。 |

## Jev 与语义判读

| 术语 | 定义 | 归属 |
| --- | --- | --- |
| **Jev**（不是 `JEV`） | TypeSafe 的 System One 模型：吃自然语言与状态，吐**带概率的类型化判断**，不生成文本、不做推理展示。本仓唯一可合法使用的拼写是首字母大写的 `Jev`。 | ADR-0138 |
| **System One / 判断** | 「这一段是否 X」这类**一次到位的语义读数**。与之相对的是生成：需要产出内容时一律换别的模型，不得拿 Jev 链式 choice 硬凑。 | ADR-0138 |
| **原语三型** | `Noul`＝某条件成立的可能性（**不携带 confidence**）；`Choice`＝从给定选项里选一个（带分布与 confidence）；`Score`＝沿给定档位的概率加权位置。 | ADR-0138 |
| **概率 vs 置信度** | `probabilities` 是完整分布；`confidence` 只是把分布形状压成一个数的统计量。**在一个判据上调好的阈值不得搬到另一型判据上**——Noul 的 0.6 与 Choice 的 0.6 不是同一个问题。 | ADR-0138 |
| **越界率** | 对每个真实业务请求单问一次「该不该由它接手」，由**代码**把越界数除以总数得到的比值。不是模型给出的数。 | ADR-0138 D4 |
| **相关度 ≠ 宽度** | 「这个任务确实归它管」与「这个技能的入口开得太宽」是两件事；一个把两者揉进同一个读数的判据在本仓判为**无效判据**。 | ADR-0138 D4 |
| **无例外停止义务** | 指令里「缺信息就先追问 / 写入前必须先确认」这类**没有例外分支**的停止要求，即使按行业惯例本可合理推进。 | ADR-0138 D4 |
| **环境机制依赖** | 仅指指令依赖 **agent 自身运行环境**才生效（shell 命令前缀、禁止上下文压缩、固定绝对路径、某本地 CLI 必然可用）。**不含**目标电商平台名、外部网站、SaaS、需联网的数据源。 | ADR-0138 D4 |
| **Tier 1.5** | SkillOpt 流水线里介于静态结构与轨迹驱动之间的**语义判读层**：只判纯文本可读出的缺陷，不接管轨迹层。 | ADR-0138 D3 |
| **输入指纹** | 由「待审语料 ⊕ 判据文本 ⊕ 阈值 ⊕ 模型版本」算出的内容寻址哈希。**新鲜度由它定义，不由时钟定义**。 | ADR-0138 D5 |
| **出网集** | 允许进入第三方判断 API 请求 `state` 的文本上界：**仓库内 git 跟踪的文本**。`~/.dsh/scratch/attrib/**` 在其外，永久禁止。 | ADR-0138 D2 |
| **`LUTE_JEV_API_KEY`** | Jev 凭证在 `~/.dsh/.credentials.yaml` 的 `refs` 节里的条目名。刻意不叫 `TYPESAFE_API_KEY`，以免与基座 provider 命名空间碰撞。 | ADR-0138 D7 |
