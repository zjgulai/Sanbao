# 全站三主题统一与排版 · 执行计划

> 范围变更（2026-09-20）：用户已选择暖粉白作为第三个第一类主题通道，并要求全站字体、标题、字号、间距与新对话品牌区统一打磨。当前规格以[正式规格 §0](../specs/2026-09-20-qoder-visual-language.md#0-已确认的扩展范围)为准；本文保留页面清单与候选色板。旧 Task 3–7 不再直接执行，尚未完成全站三主题验收。

## 当前实施顺序

本轮接续既有实现，不重开已确认设计。用户已明确要求开发、测试、部署、验收；本机部署仅同步本轮核验的包，不全量推进其他会话在制品。重启前确认没有运行任务并取得安装时机确认；不提交或推送。

| 顺序 | 交付物与接缝 | 修改范围 | 验证 |
| --- | --- | --- | --- |
| 1 | 三选一设置、Host字段级保存、冷启与迁移；字体独立 | 主题包 `theme-controller.ts`、`theme-host.ts`、`ThemeStudio.tsx`、`persistence.ts` 与对应测试 | 逐行为 Red/Green；延迟、拒绝、双窗口并发、重开、无旧色回灌 |
| 2 | 单一语义色板、正确按钮前景、层次与排版 | `shared/client/sanbao-tokens.ts`；主题包 `theme-tokens.ts`、`theme-typography.ts` | 三主题正文/状态/交互/按钮对比度，官方CSS真实解析，类型检查与构建 |
| 3 | 所有同文档自有面随主题更新，不缓存颜色 | 品牌、新应用、岗位、能力中枢、任务看板、互联、技能与输入附属面；仅主题相关hunks | 实际组件三态切换、空态、焦点、长文本、窄屏与200%缩放 |
| 4 | 独立HTML、Office自有控件与原生窗口适配 | 各现有运行环境的受控主题入口；不改pin/vendor、CSP或sandbox | 逐叶登记并验证；无法打开或缺少安全通道记blocked，不计pass |
| 5 | 本机一致产物与真实验收 | 受影响包构建产物、安装源与装载点 | 限定包同步dry-run、哈希对账、许可重启、真实浏览器三主题及门禁、双轴审查 |

核心依赖为1→2→3→4→5；可先并行处理互不写同文件的保存逻辑和色板。全站覆盖分母沿用下表，未验收页保留为缺口；不以核心包通过或截图生成替代完整交付。

## 扩展设计：三主题，一套语义规则，一次性交付

### 已明确要求

- 产品主题选择只保留「亮色」「暗色」「暖粉白」，全局选择适用于所有页面和子页面；不另留各页面独立的配色选择或自定义颜色写入口。
- 亮暗以已有 Qoder CN 参考为依据；暖粉白由本会话负责设计，不要求用户再次取色。
- 保留用户字体、字号、减弱动态等非颜色偏好；主题切换与主题重置不重置字体。
- 实现可按可验证任务串行拆分，交付不可拆成“主页先好、子页下次再说”；所有要求内页面三主题验收齐全后统一装机交付。
- 不删除功能来缩小验收分母；已按其它明确决策退役且实际未加载的页面单列退役记录，不当作验收通过。

### 推荐实现路线与取舍

采用“一份只读语义色板 + 一个持久化主题身份 + 各渲染环境适配”。仅替换旧默认色会被旧存储覆盖，增加一个旧式 preset 仍允许其它预设/自定义混色，均不满足三选一；全屏滤镜会污染图片、状态与文档，也不采用。

主题身份建议为 `light | dark | warm-pink`；暖粉白映射浏览器 `color-scheme: light`，不伪造第三种 CSS color-scheme。主题选择由现有 Host settings 服务中的专属设置命名空间保存并广播，客户端仅持有缓存和展示状态，官方主题服务作为亮/暗适配层。首屏样式、运行期覆盖、已开窗口和稍后打开页面必须从同一身份读取，避免 Host 回灌把暖粉白替换成普通亮色；离线缓存不得变成第二个可写真相源。

三主题色板完整定义画布、左栏、右栏、面板、嵌套面、浮层、控件、正文、次级、边框、强调及其前景、选中/悬停/按下/焦点、禁用、成功/警告/错误，以及代码/图表语义。`--dsw-*`、`--sanbao-*` 和独立 HTML 的 CSS 由同一色板生成、单向映射，不各存一套字面颜色。

同文档扩展变量必须落在实际消费和官方声明所在的 body 上；现有亮色只写 `:root`，会被 body 自有变量阻断继承（`packages/platform/dsh-theme-local/src/client/index.tsx:126-148`）。Portal 随同文档继承；Shadow DOM 通过属性继承或组件接口适配；Office Viewer 等应用自有 iframe 单独接主题，不能只改 iframe 外框。

迁移只从旧记录提取有效字体/字号和已有亮暗选择，旧自定义配色停止作为渲染输入；有新版记录后旧记录不得重新覆盖。旧系统模式在迁移时解析一次固定为亮/暗，后续系统变更不改动用户明确选中的三主题。旧分享串只保留必要的迁移读取，不再导入任意色；旧预设墙、accent、contrast、颜色编辑及其它主题插件写入口都纳入同次收敛。迁移不清空 localStorage、不删除无关偏好。

### 暖粉白候选（设计值，待视觉确认）

| 语义 | 候选值 |
| --- | --- |
| 画布 | `#FFF8F7` |
| 左栏 | `#F7EEEC` |
| 面板/卡片 | `#FFFDFC` |
| 嵌入区 | `#F3E6E4` |
| 正文 | `#382E30` |
| 次级文字 | `#736266` |
| 强调文字/按钮 | `#8F5361` |
| 强调按钮前景 | `#FFFFFF` |

风格是接近白色的暖粉底、暖灰正文、少量低饱和玫瑰强调，不采用粉色大渐变、彩色辉光或彩虹分类卡。按 WCAG sRGB 公式实际计算，上述四背景中的最小对比度为正文 10.77:1、次级 4.70:1、强调 4.82:1，白字/强调按钮 5.87:1；这只是候选色对的数字检查，不是完整控件状态或全页面验收。

旧计划参考色 `#5C9363` 对 `#232523` 的实际对比度为 4.27:1，不能声称满足小字 4.5:1。新版方案区分参考按钮填色与可读强调文字色：保留 Qoder 灰绿方向，为文字用途配置同族合格颜色，按钮前景另检；不以“反复重采直到通过”或放宽阈值处理。

### 页面覆盖表（注册与产物证据，尚未逐页视觉验收）

每个渲染面使用唯一 ID；多个打开入口归到同一行。子页通过父 ID 归属，不能仅勾选父页替代子页。下表是清单骨架，实施前必须把列出的子页、弹层逐叶登记为独立 case；数据记录 ID 不构成新页面类型。

| ID | 唯一归属 | 必须展开的子页面/弹层 | 定位证据 |
| --- | --- | --- | --- |
| shell | 应用框架与首页 | 主窗口、导航、空会话 Hero、启动/加载/失败、兼容标题栏 | 官方 ui-layout / web boot；自有 dsh-root-brand-local；独立 compatibility-chrome 文档 |
| conversation | 会话及工作区 | 会话搜索/分组/新建、工作区选择/浏览、消息与代码、工具树、审批、问答、计划确认、子代理、队列、模型选择、反馈、统计、导出、附件预览/灯箱 | 官方 ui-workspace / ui-conversation / ui-chat / ui-tool / ui-approval / ui-user-questions / session-log-export 等注册 |
| trajectory | 轨迹 | 表格、时间线、筛选、明细 | 官方 ui-trajectory |
| setting-general | 通用设置 | 通用外观/字号、语言、权限等实际注册子项 | 实况 settings.section id=general |
| setting-remote | 远程访问 | 局域网、公网、高级地址、免责声明、重置/开关确认、移动导航抽屉 | id=pocket；dsh-pocket/client/index.jsx:651、mobile/mobile-apply.tsx:335 |
| setting-theme | 主题设置 | 三选一主题、独立字体与字号；旧预设/颜色/导入入口迁移 | id=dsh-theme；dsh-theme-local/src/client/ThemeStudio.tsx |
| setting-models | 模型设置 | 供应商、模型编辑、首次配置引导、欢迎说明 | id=models；官方 ui-settings-models |
| setting-plugins | 插件设置 | 插件配置、配置字段、清单、子代理模型选择 | id=plugins；官方 ui-settings-plugins / ui-settings-plugin-inventory |
| setting-presets | 智能体设置 | 预设列表、复制、组成详情、删除确认 | id=agent-presets；官方 ui-agent-preset |
| setting-im | IM 设置 | 微信、飞书、钉钉、企微机器人/应用、QQ、Slack、Telegram、Discord、WhatsApp、iMessage、AI Office；全局/投递/访问/群聊、目录选择、上下文增强、更新 | id=xmanrui-dsh-im；@xmanrui/dsh-im/plugin-src/client/index.js:459 |
| setting-teams | 小队设置 | 小队、成员、配方、编辑、计划预览、导入导出 | id=agent-teams；dsh-agent-team-gui-local SettingsPage / RecipesWorkspace |
| setting-skills-overseas | 出海技能设置 | 分类树、筛选、技能详情 | id=overseas-skills；dsh-overseas-skills/lib/client.js:906 |
| setting-skills-fullstack | AI 全栈技能设置 | 分类树、筛选、技能详情 | id=fullstack-skills；dsh-overseas-skills/lib/client.js:923 |
| setting-skills-generic | 通用技能设置 | 分类树、筛选、技能详情 | id=generic-skills；dsh-overseas-skills/lib/client.js:939 |
| setting-connectors | 万物互联设置 | MCP、API、企业应用、知识库、连接配置、授权状态 | id=wanzh-hulian；dsh-wanzh-hulian/lib/client.js:817 |
| setting-algorithms | 算法技能库 | 分类筛选、详情 | id=algo-skills；dsh-algo-skills-local/src/client/index.ts:74 |
| setting-market | 市场 | 发现、主题、收藏、已安装、备份、诊断；操作记录、评论、截图灯箱、安装/卸载/恢复确认 | id=market；dshmarket/src/client/MarketSection.tsx:3779,4912；市场“主题”不得绕过三主题选择 |
| setting-memory | 记忆设置 | 导入、搜索、新增/删除、分组浏览、审核队列 | id=noema-memory；@zseven-w/dsh-noema/src/client/index.tsx:435,948 |
| setting-quotes | 我说 | 设置按钮/会话入口共用摘录面板；分类、项目、搜索及操作 | id=my-quotes；dsh-my-quotes/lib/client.js:417,431,469 |
| setting-desktop | 桌面设置 | profile、呈现、材质、网络、通知、市场/AA相关入口 | id=desktop；官方 DesktopSettingsSection |
| roles | 岗位矩阵及能力引导 | 平面→责任域→岗位详情；岗位空会话技能/手册引导是单独渲染 case | dsh-role-matrix-local/src/client/index.ts:114,126,138,171 |
| applications | 新应用 | 产品卡、系统列表、产品打开/确认弹层 | dsh-newapp-local/src/client/index.ts:112；NewAppPanel / SystemsSection |
| command-palette | 能力中枢 | Cmd/Ctrl+K 结果、技能/工具/岗位/产品/系统类别、空结果 | dsh-capability-hub-local/src/client/index.ts:134,145 |
| team-runs | 小队运行 | 运行列表、详情、统计、dock、composer模式弹层 | dsh-agent-team-gui-local/src/client/index.ts:103-123 |
| task-board | 任务看板 | 会话 tab、未读入口、任务状态与明细 | dsh-task-board-local/lib/client.js:965-969 |
| knowledge-panel | 知识库面板 | 搜索、存库、状态反馈 | dsh-wanzh-hulian/lib/client.js:831,837 |
| research | 深度研究 | 列表、新建、计划、调查、报告、删除确认 | dsh-deepresearch-local/src/client/index.ts:103,118；src/lib 挂载差异需对照实况 |
| sidebar-guide | 右栏指南 | 指南及扩展类型入口 | 实况 key=@deepseek-ai/dsh-client-ui-sidebar-right/guide |
| sidebar-activity | 新 Qoder 右栏 | 环境、进程、技能/MCP、产出、网页、来源折叠分组，空/有活动状态 | 实况 key=dsh-qoder-sidebar-local/activity；sidebar-surface.ts:28 |
| context | 上下文观测 | 会话 tab、右栏、/context；构成、趋势、请求详情、消息、统计、事件、文件、附件/图片、agent图、设置子项 | 实况右栏 key=dsh-context；dsh-context/lib/client.js:4130,8964 |
| sidebar-files | 右栏文件 | 文件树、选择、加载/错误 | 实况 key=@deepseek-ai/dsh-client-ui-sidebar-files |
| document-preview | 文档预览 | Markdown、代码、文本、HTML、图片、PDF，各类型的加载/错误及工具栏 | 实况 key=@deepseek-ai/dsh-client-ui-sidebar-documentpreview；HTML用户内容隔离 |
| genui | GenUI | 回复交互UI、工具卡、会话面板、模板分类/预览、成就/Toast、图表 Canvas/SVG | @changfenhuang/dsh-genui/src/client/index.tsx:130、TemplateDrawer.tsx:48 |
| office | Office | 设置卡、回合预览/全屏、Worktree浮窗、多单元、Viewer工具栏/菜单等自有内页；文档内容不重染 | dsh-univer-office/lib/client.js:22139,23085；artifacts/viewer/index.html:18；内部完整子页仍须展开，未标完成 |
| git-graph | Git 图 | 分支选择、新分支、提交图、Worktree创建/管理弹层 | @linxin666/dsh-client-ui-git-graph/src/client/index.ts:269、chips/BranchChip.tsx:257 |
| skill-explorer | npm 技能中心 | 分组列表、新建、删除确认 | @linxin666/dsh-client-ui-skill-explorer/lib/client.js:565,931；本地撤注册不代表 npm 同名功能退出 |
| composer-addons | 输入附属面 | 自有附件按钮、LoopX目标栏 | dsh-file-upload-local/lib/client.js:434、dsh-loopx-plugin/lib/client.js:819 |
| aa | AA 连接与设置 | onboarding、account、mobile connection、settings、status、logs | 实机已挂载 @agents-anywhere/dsh-bridge-next 对应六组 module CSS；注册叶项仍待定向核对 |
| admin | 独立团队管理界面 | 登录及管理子页、状态反馈 | packages/infra/dsh-team-hub/admin-ui；不与主文档共享 CSS，需实际路由清单补齐 |
| native-documents | 应用自有独立窗口 | 首次设置、恢复、Profile选择、Profile创建、通用对话框；每窗独立 case | vendor只读参照下的 setup-wizard-window.ts / startup-recovery-window.ts / profile-selection-window.ts / profile-create-window.ts / desktop-dialog-window.ts；native-ui共享样式 |

运行期证据：只读 CDP `ctx.slots.entriesOfSlot('settings.section')` 返回上述 17 个 setting-* 对应主入口（包括 my-quotes 共用面板）；`sidebar.right.pane.tab` 返回 guide/context/activity/files/documentpreview 五类。两者不是全站页数。当前实际主题仍是旧 Sanbao 深蓝，因此这些入口尚未通过三主题验证。

退役记录：profile bundles 已不含 dsh-right-sidebar-local 或 dsh-better-sidebar；不再以它们的旧七模块设置面作当前右栏验收对象。源码保留，不能擅删并发在制品。旧 vendor 工作台由卸载门禁排除。本地 skill-center 的客户端已撤页面注册，但独立 npm skill-explorer 仍声明于实际 profile。apps/lute-shell 尚未证明替代现行壳，作为候选运行环境单列，不冒充当前实机。

### 独立界面叶项补充（2026-09-20，静态核验，未作三主题视觉验收）

本节细化覆盖表 office/aa/admin，不能拿父行替代叶项。Office 安装产物的哈希仅是证据定位，不得写入产品选择器或补丁锚。三个渲染环境都需同时覆盖亮色、暗色、暖粉白。

| 父面 | 唯一叶 ID（同一行列出的每项均独立登记） | 入口与证据 | 主题边界 |
| --- | --- | --- | --- |
| office | viewer.navigator、viewer.settings-menu、viewer.trunk-toolbar、viewer.worktree-toolbar | 当前/修改文件导航及底部设置，viewer assets主入口:40；embedded模式无这些导航 | 自有iframe或独立HTML；当前chooseAppearance独立保存亮暗，需要接Host身份 |
| office | viewer.ready-confirm、viewer.merge-confirm、viewer.discard-confirm、viewer.edit-confirm、viewer.merge-conflict、viewer.boot-notice、viewer.fatal | doReady/doMerge/doDiscard/startTrunkEdit及错误分支，viewer主入口:40 | 自有控件，不是用户正文 |
| office | ui.shortcuts、doc.header-footer、doc.paragraph、doc.section、doc.formula、doc.link-edit、doc.link-info | Ribbon/右键/链接工具，render-preset:70/162/674/683 | UI ThemeService，不能改变文档本身格式 |
| office | sheet.find-replace、sheet.link-edit、sheet.export-format、base.export-format | 查找/替换、超链接、导出，render-preset:327 | 同一Viewer文档内弹层 |
| office | sheet.conditional-format、sheet.validation、sheet.validation-reject、sheet.filter | 条件格式、数据验证、筛选，render-preset:688/694 | 控件主题，不重染用户单元格 |
| office | sheet.pivot-source、sheet.pivot-editor、sheet.print | 透视表和打印，render-preset:753 | 打印内容本色，设置面接主题 |
| office | sheet.note、sheet.number-format、sheet.custom-sort、sheet.sort-range-confirm、sheet.table-filter、sheet.comments | 右键、格式、排序、批注，render-preset:784/787–788 | 同文档控件 |
| office | slide.background、slide.speaker-notes | 背景设置与备注，render-preset:505 | 调色控件可用，文档颜色不强制替换 |
| office | doc.history、sheet.history、slide.history、base.history、board.history | 对应trunk历史入口，viewer主入口:40；恢复确认:35 | 每种历史面独立验收 |
| aa | onboarding.cloud、onboarding.server、desktop-handoff、account | sidebar.footer.action/agents-anywhere-next → 手机连接，lib/client.js:1810；360/401/1719/769/1746 | 宿主同文档，不是settings.section |
| aa | mobile.qr、mobile.confirm | 账号页展开二维码/扫码待确认，client.js:670/700 | confirm是展开状态，不虚构modal |
| aa | settings、settings.pypi-menu、settings.interval-menu、settings.reset-confirm、settings.local-reset-confirm | 设置tab/选择器/重置，client.js:1092/1069/1235/1257/1321/1138 | 确认窗只打开验收，不执行重置 |
| aa | bridge-status-notice、logs、logs.detail | Bridge未ready提示、日志tab/详情，client.js:1366/1423/1514 | 日志可能含隐私，验收用合成内容 |
| admin | overview、users、workspaces、audit、system | /admin#对应hash，admin-ui/app.js:39/47/89/102/107 | 独立HTML，html[data-theme]及dsw变量 |
| admin | user.rename-prompt | 用户改名，app.js:75 | 浏览器原生prompt，按平台light/dark验边界 |
| admin | login、change-password | `src/server.mjs:83-92` 直接生成两种独立HTML，app.js:13重定向登录 | 同源主题需从server生成页面接入，不能只改admin-ui/styles.css |

Office证据来自已安装 dsh-univer-office/artifacts/viewer 的主入口与render-preset产物；本仓对应可编辑源尚未找到。AA证据来自 `~/.dsh/profiles/node_modules/@agents-anywhere/dsh-bridge-next/lib/client.js`，七组注入CSS未检出固定颜色，仍需真实状态验收。Admin来源 `packages/infra/dsh-team-hub/admin-ui` 可直接修改。

**覆盖仍未闭合：** Office混淆SDK全部子菜单尚未穷尽；Admin登录和首次改密已在server.mjs定位。上述叶项是已核验子集，不是宣称所有叶项已枚举。空/加载/失败/忙遮罩/Toast按所属页面状态登记，不重复造路由。外部OAuth页单列第三方内容边界。

### 交付任务依赖与阻塞边界

| 顺序 | 可验收产物 | 明确落点 | 完成条件 |
| --- | --- | --- | --- |
| 8a | 主文档主题身份和实际apply接线 | dsh-theme-local client/index.tsx、studio.css、apply测试 | warm-pink身份/字体改变/卸载/Host回灌真实执行，非仅导出函数存在 |
| 8b | 核心模型、持久化与全部测试闭合 | shared sanbao色板、theme-controller、theme-host及原测试迁移 | 旧任意色写口清零、并发字段写不互相覆盖、主题包test/typecheck/build通过、对比度包括交互底 |
| 8c | 核心真实浏览器证据 | loopback server+真正组件/Host边界、截图和computed style | 三主题切换/重开/拒绝/损坏旧缓存/字体保留及控制台通过 |
| 9 | 自有页面颜色迁移 | task-board/wanzh/overseas/file-upload/newapp/capability/role/root-brand | 去固定色/缓存色，保留功能和并发排版，逐面浏览器验证 |
| 10 | 官方与npm插件接缝 | General Appearance、Market、IM/Noema/GenUI/Context/Git/skill-explorer/AA | 无旧主题切换写入口；应用自有controls/portal同主题；不动vendor源码、不钉hash |
| 11 | 独立文档 | Admin/login/change-password、Office Viewer、六类native文档 | 同一themeId跨文档传递并重开恢复，用户内容不重染，CSP/sandbox/权限不放宽 |
| 12 | 全站闭合与装机 | 逐叶矩阵、门禁、双装载点、实机 | expected与结果守恒；全主题/状态证据齐全且安装时机获准后一次性交付 |

Task11已知技术阻塞：六类native文档现有state/locale/platform/frame或desktopChrome state均不承载themeId；普通窗无preload、独立partition、CSP connect-src none。仅二态nativeTheme映射不足以验收暖粉白。需要先验证有限主题枚举能否在既有受信初始化数据中传递；不得放宽CSP、加泛用执行桥或修改安全检查来假完成。Office全部SDK子菜单仍为清单缺口，不可缩小分母。

### 验收矩阵与真实边界

- 每个叶 case 必须具备：稳定 ID、父 ID、实际打开入口、包/产物来源、同文档/独立文档/自有 iframe/系统控件/用户内容分类、三主题期望、适用状态与截图/计算样式证据。
- 页面适用状态覆盖默认、悬停、按下、选中、键盘焦点、禁用、空、加载、错误、成功/警告；不适用需说明，不用无意义组合凑数量。
- 三主题均测试冷启、连续切换、关闭重开、持久化恢复、系统主题变化不覆盖显式选择；已有字体在上述路径保持不变。
- 检查实际前景/背景对比，包含透明度合成和弹层；正文/控件文字至少 4.5:1，大字/关键图形至少 3:1，主体正文目标 7:1。禁用态有独立判据，不一概按正文阈值误报。
- 分母来自源码注册 + 安装组合 + 实际注册清单交叉校验。新增未登记面、缺失测试、未知入口必须报缺口；`expected = passed + failed + blocked + not-applicable`，不得把不可访问页面计为 pass 或删掉。
- 应用自有独立 HTML/Office Viewer 的控件必须接主题，插件内换色不覆盖它们。现有 app产物重放可作为接入路径，但先在复制产物上验证和记录，再协调安装；不改 pin/vendor源码、不钉 CSS hash。
- 系统交通灯、系统权限/文件选择及原生控件遵循平台亮/暗能力，无法保证暖粉像素；用户图片、PDF/HTML正文、第三方网页保持内容本色与 sandbox，不对文档套滤镜。这些边界在清单中逐条记录，不能用来排除应用自身的 UI。
- 本次调查未运行三主题测试/构建/全站验收，没有新增源代码。确认扩展设计后重写下方任务、补决策 Note/取代指针，继续采用已选的子代理实施与独立评审，未全矩阵通过不作完整交付声明。

---

## 以下为旧 P0/P1 任务正文（已暂停，仅留历史与证据引用）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 DSH Desktop 的主题契约从 Sanbao（钛银 + 深海军蓝）换成 Qoder CN 的中性灰阶 + 灰绿，并把立面模型反转成 Qoder 式（画布最亮、越抬越暗）。

**Architecture:** 只动主题包 `packages/platform/dsh-theme-local`（**settings 是唯一色值源 → token 派生 → 全 app 跟皮**），不动任何自有面布局、不动 vendor。立面反转改的是 `theme-tokens.ts` 里的派生式方向，不是新加 token。

**Tech Stack:** TypeScript + vitest（包内单测）、`tsdown`（构建）、`scripts/gates/*`（门禁）、`scripts/sync-profile.mjs`（装载点同步）。

**Spec:** `docs/specs/2026-09-20-qoder-visual-language.md`

## Global Constraints

- 色值唯一源是 `packages/platform/dsh-theme-local/src/theme-settings.ts` 的 `DEFAULT_THEME_STUDIO_SETTINGS`；`shared/client/sanbao-tokens.ts` 是**源面**，副本由 `node scripts/sync-shared.mjs --write` 生成，**不得手改副本**。
- 官方壳只换 token，不改结构；不碰 `vendor/`、不钉哈希（ADR-0008 / ADR-0019）。
- 不改 `TARGET_SIDEBAR_WIDTH = 264`（`scripts/gates/sidebar-row-axis.mjs`），本轮不碰侧栏宽度。
- **不碰** `packages/surfaces/dsh-right-sidebar-local/**`（并发会话所有，见 spec D7）。
- 提交前 `pnpm run gate` 必须绿；改动生效必须**两条同步**：`node scripts/sync-profile.mjs --apply --loadpoint`（node_modules）**且** `node scripts/sync-profile.mjs --apply`（vendor，客户端 bundle 由它提供），然后**完整重启**。
- 每个 task 结束前跑一次该 task 指定的验证命令；接受的口径是**命令输出**，不是「应该没问题」。

---

### Task 1: 补齐 Qoder 色板缺失项（正文 / 次级 / 边框 / 明色道）

Task 3 需要 12 个字段的值，但目前只实测到 5 个（画布/rail/面板/卡片/强调）。这一 task 把缺的补齐并写进 spec，避免 Task 3 里凭空发明色值。

**Files:**
- Modify: `docs/specs/2026-09-20-qoder-visual-language.md`（§2.1 表格补行 + §6 删掉第 1 条未决）

**Interfaces:**
- Produces: 一张填满的色值表（12 个字段 → 值），Task 3 直接消费。

- [ ] **Step 1: 取暗色道的文字与边框色**

Qoder CN 停在暗色道，用 harness 截图后按**文本核心像素**采样（取一段加粗标题的字干，避开抗锯齿边缘）：

```bash
cd /tmp && macos-harness <<'PY'
print(mac.see("Qoder CN"))
PY
```

对返回的 png 跑采样脚本，取三组：
- 正文色：会话标题（如「产品体验精细化优化规划」）字干最亮像素；
- 次级色：左栏「工作区」分组标题；
- 边框色：左栏与画布之间那条 1px 线（y=700 横向扫描里 `#171918` 那一段）。

判据：三个值都必须是**中性灰**（R≈G≈B，最大通道差 ≤4）——出现彩色说明采到了状态色，重采。

- [ ] **Step 2: 取明色道全部值（需要用户配合）**

请用户把 Qoder CN 切到明色道（设置里切主题）。切好后**在同一个窗口尺寸**下重新截图，重复 Step 1 的采样面：rail / 画布 / 面板 / 卡片 / 强调 / 正文 / 次级 / 边框。采样完**请用户切回暗色道**。

判据：rail、画布、面板三者**互相可区分**（两两通道差 ≥2）；若明色道下三者同色，说明采到了同一层，换采样点重采。

- [ ] **Step 3: 把两张表写进 spec**

在 `docs/specs/2026-09-20-qoder-visual-language.md` §2.1 的表格下补「明色道实测值」小节，并把 12 个字段的最终值列成一张「字段 → 暗 → 亮」表；同时删掉 §6 的第 1 条未决（明色道真值）。

- [ ] **Step 4: 提交**

```bash
git add docs/specs/2026-09-20-qoder-visual-language.md
git commit -m "docs(spec): 补齐 Qoder 色板实测值（正文/次级/边框 + 明色道）"
```

---

### Task 2: ADR 取代 ADR-0132 的配色部分

**Files:**
- Create: `docs/adr/ADR-0144.md`
- Modify: `docs/adr/README.md`（索引加一行）
- Regenerate: `docs/adr/decisions.json`（生成物，不手改）

**Interfaces:**
- Produces: ADR-0144（Task 3 的提交信息引用它）。

注：0143 号已被另一并发会话的「右侧工作台折叠」ADR 占用（`docs/adr/ADR-0143.md`，在飞未提交），本片顺延用 0144；落笔前若目录里已出现 0144，再顺延并同步改本计划里的引用。

- [ ] **Step 1: 写 ADR 文件**

按 `docs/adr/ADR-0142.md` 的结构写 `docs/adr/ADR-0144.md`：标题行 `# ADR-0144 · <一句话>`、状态行 `- 状态：accepted（2026-09-20）`、`## 背景` / `## 决策` / `## 备选方案` / `## 后果`，**末尾必须有 `## 机器可读决策` 的 ```json 块**（`{"decisions":[{"id":"D1","text":"...","constraints":["..."]}]}`，字段形状照抄 ADR-0142）。

内容必须写清三条：
- D1 配色契约由 Qoder CN 实测值取代 ADR-0132 D1 的钛银/深海军蓝；**ADR-0132 其余部分（`--sanbao-*` 命名空间、双轨 token、材质解禁、Inter 默认字体）继续有效**；
- D2 立面模型反转为「画布最亮、越抬越暗」；
- D3 本轮只动主题包，官方壳只换 token、不动结构（引用 ADR-0008 / ADR-0019）。
备选方案表至少写两条被否的路（保留钛银只换灰阶 / 推导明色道而不采样），各给否决理由。

- [ ] **Step 2: 索引加行**

在 `docs/adr/README.md` 的索引表最后一行后追加：

```
| ADR-0144 | <与 ADR 标题一致的摘要> | accepted（2026-09-20） | — |
```

- [ ] **Step 3: 重生成账本并跑 ADR 门禁**

```bash
node scripts/gates/adr-agent-records.mjs --write
node scripts/gates/adr-index.mjs 2>/dev/null || node --test scripts/gates/adr-index.test.mjs 2>/dev/null || pnpm run gate 2>&1 | grep -E "adr-(index|agent-records)"
```
Expected: `adr-index` 与 `adr-agent-records` 两项 ok；`decisions.json` 条目数 +1。

- [ ] **Step 4: 提交**

```bash
git add docs/adr/ADR-0144.md docs/adr/README.md docs/adr/decisions.json
git commit -m "docs(adr): ADR-0144 配色改判为 Qoder 中性灰 + 灰绿（取代 ADR-0132 配色部分）"
```

---

### Task 3: 主题默认值换 Qoder 色板

**Files:**
- Modify: `packages/platform/dsh-theme-local/src/theme-settings.ts:102-123`（`DEFAULT_THEME_STUDIO_SETTINGS`）
- Test: `packages/platform/dsh-theme-local/src/client/theme-tokens.test.ts`（新增一条「Qoder 契约」用例）

**Interfaces:**
- Consumes: Task 1 的 12 字段值表。
- Produces: `DEFAULT_THEME_STUDIO_SETTINGS`（Task 4/5/6 都读它）。

- [ ] **Step 1: 写失败测试**

在 `theme-tokens.test.ts` 末尾追加（值用 Task 1 表里的暗色道实测值，逐字）：

```ts
it("ships the Qoder contract: rail, canvas and panel are three distinct neutral steps", () => {
  const d = DEFAULT_THEME_STUDIO_SETTINGS;
  const channel = (hex: string) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
  const neutral = (hex: string) => {
    const [r, g, b] = channel(hex);
    return Math.max(r!, g!, b!) - Math.min(r!, g!, b!) <= 6;
  };
  for (const field of ["darkBackground", "darkSidebar", "darkSurface"] as const) {
    expect(neutral(d[field]), field).toBe(true);
  }
  // accent 是灰绿：G 通道必须是三者中最大（旧契约的钛银在这里就挂了）
  const [ar, ag, ab] = channel(d.darkAccent);
  expect(ag, "accent 必须是绿相（G 最大）").toBeGreaterThan(ar!);
  expect(ag).toBeGreaterThan(ab!);
  // 立面模型（Qoder 式）：画布最亮、面板更暗——两者必须可区分
  const sum = (hex: string) => channel(hex).reduce((a, b) => a + b, 0);
  expect(sum(d.darkSurface), "surface 必须比画布暗").toBeLessThan(sum(d.darkBackground));
  expect(sum(d.darkBackground) - sum(d.darkSurface), "两档至少要差 8 阶").toBeGreaterThanOrEqual(8);
});
```

- [ ] **Step 2: 跑测试确认它失败**

Run: `cd packages/platform/dsh-theme-local && pnpm exec vitest run src/client/theme-tokens.test.ts -t "Qoder contract"`
Expected: FAIL——当前 `darkSurface (#142332)` 比 `darkBackground (#0B1521)` **亮**，且带蓝相。

- [ ] **Step 3: 换值**

把 `DEFAULT_THEME_STUDIO_SETTINGS` 的 12 个字段换成 Task 1 表的值，并把上方注释改成记录出处（「Qoder CN 实机采样，见 docs/specs/2026-09-20-qoder-visual-language.md §2.1」）。暗色道已知值（其余照 Task 1 表）：

```ts
  darkBackground: "#232523",
  darkSidebar: "#242624",
  darkSurface: "#191B1A",
  darkAccent: "#5C9363",
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd packages/platform/dsh-theme-local && pnpm exec vitest run src/client/theme-tokens.test.ts`
Expected: PASS（含新用例与既有 11 条）。

- [ ] **Step 5: 提交**

```bash
git add packages/platform/dsh-theme-local/src/theme-settings.ts packages/platform/dsh-theme-local/src/client/theme-tokens.test.ts
git commit -m "feat(theme): 默认色板换成 Qoder 实测值（ADR-0144）"
```

---

### Task 4: `--sanbao-*` 源值同步 + 锚测试翻转

**Files:**
- Modify: `shared/client/sanbao-tokens.ts`（色板十键两个色道）
- Regenerate: `packages/platform/dsh-theme-local/src/client/sanbao-tokens.ts`（`sync-shared --write`）
- Test: `packages/platform/dsh-theme-local/src/client/sanbao-seam.test.ts:98`（现锚点是「LUTE 绿」）

**Interfaces:**
- Consumes: Task 1 表、Task 3 的默认值。
- Produces: `SANBAO_TOKEN_CSS`（后续接线工单的源面）。

- [ ] **Step 1: 改锚测试（先红）**

把 `sanbao-seam.test.ts` 的 accent 锚改成 Qoder 契约值（**两值取 Task 1 表的 accent 行**；暗色道已实测 = `#5C9363`）：

```ts
it('迁移锚：accent 是 Qoder 灰绿（暗 #5C9363），钛银与 LUTE 绿均已退场', () => {
  expect(SANBAO_TOKEN_CSS).toContain('--sanbao-accent: #5C9363')
  expect(SANBAO_TOKEN_CSS).not.toMatch(/#(C4D0DC|58B848|347A2F)/i)
  // 亮色道 accent 不写死断言语料：Task 6 的 swatch 用例会拿它与默认值逐字比对
})
```

Run: `cd packages/platform/dsh-theme-local && pnpm exec vitest run src/client/sanbao-seam.test.ts`
Expected: FAIL（源文件里还是旧值）。

- [ ] **Step 2: 改 shared 源**

`shared/client/sanbao-tokens.ts` 的 `SANBAO_TOKEN_CSS`：`:root`（亮）与 `body[data-ds-dark-theme]`（暗）两个块的 bg/surface/surface2/ink/muted/line/good/accent/on-accent 全部换成 Task 1 表的对应值；文件头注释把出处改成 Qoder 采样 + ADR-0144。

- [ ] **Step 3: 分发并复跑**

```bash
node scripts/sync-shared.mjs --write
cd packages/platform/dsh-theme-local && pnpm exec vitest run src/client/sanbao-seam.test.ts
```
Expected: `[written] .../sanbao-tokens.ts`；测试 PASS。

- [ ] **Step 4: 提交**

```bash
git add shared/client/sanbao-tokens.ts packages/platform/dsh-theme-local/src/client/sanbao-tokens.ts packages/platform/dsh-theme-local/src/client/sanbao-seam.test.ts
git commit -m "feat(theme): --sanbao-* 源值换 Qoder 色板，锚测试翻转（ADR-0144）"
```

---

### Task 5: 立面模型反转（画布最亮、越抬越暗）

**Files:**
- Modify: `packages/platform/dsh-theme-local/src/client/theme-tokens.ts:217-232`（`bg-layer-2/3`、`bg-module-platform`、`bg-overlay` 的派生）
- Test: `packages/platform/dsh-theme-local/src/client/theme-tokens.test.ts`（新增立面序用例）

**Interfaces:**
- Consumes: `palette()` / `mix()` / `borderOverlay()`（同文件既有私有函数，签名不变）。
- Produces: 反转后的 `--dsw-alias-bg-layer-{2,3}` / `--dsw-alias-bg-overlay` / `--dsw-alias-bg-module-platform`。

- [ ] **Step 1: 写失败测试**

```ts
it("keeps the Qoder elevation model: dark theme steps DOWN as surfaces rise", () => {
  const tokens = buildThemeTokenOverrides(DEFAULT_THEME_STUDIO_SETTINGS);
  // 暗色道：layer-2 / layer-3 必须比 surface 更暗（当前实现是更亮）
  for (const token of ["--dsw-alias-bg-layer-2", "--dsw-alias-bg-layer-3", "--dsw-alias-bg-overlay"] as const) {
    expect(tokens[token]!.dark, token).toContain("#000000");
  }
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd packages/platform/dsh-theme-local && pnpm exec vitest run src/client/theme-tokens.test.ts -t "elevation model"`
Expected: FAIL——现在暗色道这几个 token 都是 `#FFFFFF n%` 提亮式。

- [ ] **Step 3: 反转派生**

`theme-tokens.ts` 里把暗色道的提亮改成压暗、亮色道对应改成「抬升=变白」的反向（Qoder 明色道同样是「画布最亮、面板更暗」，故亮色道也走 `#000000` 一侧）：

```ts
    "--dsw-alias-bg-layer-2": {
      light: mix("#000000", light.scale(6), light.surface),
      dark: mix("#000000", dark.scale(10), dark.surface),
    },
    "--dsw-alias-bg-layer-3": {
      light: mix("#000000", light.scale(10), light.surface),
      dark: mix("#000000", dark.scale(16), dark.surface),
    },
    "--dsw-alias-bg-module-platform": {
      light: mix("#000000", light.scale(4), light.surface),
      dark: mix("#000000", dark.scale(6), dark.surface),
    },
    "--dsw-alias-bg-overlay": {
      light: mix("#000000", light.scale(12), light.surface),
      dark: mix("#000000", dark.scale(20), dark.surface),
    },
```

同步把 `theme-tokens.test.ts` 里「golden freeze」与「scales neutral blends」两处**读默认值**的期望改成新公式（它们现在从 `DEFAULT_THEME_STUDIO_SETTINGS` 组合，只需把 `#FFFFFF` 换成 `#000000`、百分比与实现一致）。

- [ ] **Step 4: 跑全包测试**

Run: `cd packages/platform/dsh-theme-local && pnpm exec vitest run`
Expected: 全部 PASS（57+2 条）。

- [ ] **Step 5: 提交**

```bash
git add packages/platform/dsh-theme-local/src/client/theme-tokens.ts packages/platform/dsh-theme-local/src/client/theme-tokens.test.ts
git commit -m "feat(theme): 立面模型反转为画布最亮、越抬越暗（ADR-0144 D2）"
```

---

### Task 6: accent 色板与预设跟随

**Files:**
- Modify: `packages/platform/dsh-theme-local/src/client/accent-swatches.ts:30`
- Test: 既有 `accent-swatches.test.ts`（断言第一对 == 默认对，自动跟随）

**Interfaces:**
- Consumes: Task 3 的 `DEFAULT_THEME_STUDIO_SETTINGS`。

- [ ] **Step 1: 改第一对**

把 `ACCENT_SWATCHES` 的第一项改成：`id` 保持 `"lute"`，`dark` 写 `#5C9363`，`light` 写 **spec §2.1 最终表里「亮色道 accent」那一格的字面值**（那是 Task 1 落笔的产物，逐字抄，不要写表达式——`ACCENT_SWATCHES` 是静态数组，且既有测试断言 `first === { light: DEFAULT.lightAccent, dark: DEFAULT.darkAccent }`，抄错它会点名）。

- [ ] **Step 2: 跑测试**

Run: `cd packages/platform/dsh-theme-local && pnpm exec vitest run src/client/accent-swatches.test.ts`
Expected: PASS（含「每个 swatch 在默认画布上 ≥3:1」那条——若不达标它会点名是哪个 swatch）。

- [ ] **Step 3: 提交**

```bash
git add packages/platform/dsh-theme-local/src/client/accent-swatches.ts
git commit -m "feat(theme): 品牌 accent 色板第一对换成 Qoder 灰绿"
```

---

### Task 7: 对比度读数 + 构建 + 门禁 + 装载点同步 + 实机验收

**Files:**
- Create: `scripts/acceptance/qoder-palette-contrast.mjs`（一次性读数脚本，入仓）
- Modify: 无（构建产物由包脚本产出）

**Interfaces:**
- Consumes: Task 3 的默认值。
- Produces: 一组对比度读数（贴进 spec §4 的验收记录）。

- [ ] **Step 1: 写对比度脚本并跑**

脚本读 `DEFAULT_THEME_STUDIO_SETTINGS`，按 WCAG 相对亮度算并打印：accent on 画布、ink on 画布、ink on 面板、rail 与画布的通道差。
Run: `node scripts/acceptance/qoder-palette-contrast.mjs`
Expected: accent on 画布 ≥ **4.5:1**、ink on 画布 ≥ **7:1**；低于阈值则脚本 exit 1，**回到 Task 1 重采 accent**。

- [ ] **Step 2: 构建 + 门禁**

```bash
cd packages/platform/dsh-theme-local && pnpm run build
cd /Users/lute/project/Magpie-Horch && pnpm run gate
```
Expected: `Validated dsh-theme client bundle`；gate 退出码 0。

- [ ] **Step 3: 两条同步 + 完整重启**

```bash
node scripts/sync-profile.mjs --apply --loadpoint
node scripts/sync-profile.mjs --apply
osascript -e 'quit application "DSH Desktop"'
nohup "/Applications/DSH Desktop/Contents/MacOS/DSH Desktop" --remote-debugging-port=9333 --remote-debugging-address=127.0.0.1 > /tmp/dsh-qoder.log 2>&1 &
```
Expected: 两条 sync 都 ok（vendor 面若报 drift 属预期）；应用起来后 `curl -sf http://127.0.0.1:9333/json/version` 有回。

- [ ] **Step 4: 实机采样验收**

用 CDP 读渲染值（不是读源码）：`--dsw-alias-bg-base` / `--dsw-specific-sidebar-fill` / `--dsw-alias-bg-layer-1` / `--dsw-alias-state-business-primary` 四项，与 Task 1 表逐值比对；再截图确认左栏/画布/面板三者肉眼可分。
Expected: 四项解析值与表一致；截图里看不到蓝色残留（`#0b1521` / `#142332` / `#C4D0DC` 全消失）。

- [ ] **Step 5: 把读数与截图路径写进 spec 验收记录，提交**

```bash
git add scripts/acceptance/qoder-palette-contrast.mjs docs/specs/2026-09-20-qoder-visual-language.md
git commit -m "test(theme): Qoder 色板对比度读数 + 实机验收记录（P0/P1 收口）"
```

---

## 后续计划（不在本计划内）

- **P2 密度与形状**（行高 36→32、右栏 440→360、圆角/边框收敛）：等右侧栏 owner 会话收口后单独出计划。
- **P3 自有面排版**（设置壳/抽屉/面板）：P2 之后单独出计划。
- `--sanbao-*` 别名接线（S-C）与预设墙收敛（工单 014）：本轮不出，保持既有工单归属。
