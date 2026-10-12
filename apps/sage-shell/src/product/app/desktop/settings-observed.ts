/** R17-A (ADR-0317 之后壳批延续): the observed settings-page structures, reproduced as data.
 *
 *  Every label and description below is verbatim from the in-repo observation captures
 *  (vendor/sanbao-prototype/dist/research/batch07/15/16-capture.md, QB7-01/QB15-01/QB15-02/
 *  QB16-01). The structures are read-only reproductions: a row with no Sage machinery renders
 *  its observed label and description with an honest 未接线 state — no fabricated values, no
 *  action entry. Write paths land in their own named batches (T13 sub-batches).
 */

export interface SettingsObservedRow {
  readonly label: string
  readonly note: string
}

/** VF-2 (ADR-0337 D6): the per-group icon tile. The Qoder live settings give every row a
 *  26×26 tinted tile with a line icon; per-row semantic icons are a content decision still
 *  pending capture, so each group carries one representative icon for its whole block. */
export type SettingsGroupIcon = 'bolt' | 'chat' | 'panel' | 'monitor' | 'grid' | 'settings' | 'file' | 'clock'

export interface SettingsObservedGroup {
  readonly group: string
  readonly icon: SettingsGroupIcon
  readonly rows: readonly SettingsObservedRow[]
}

/** QB15-01 · 常规默认页. */
export const GENERAL_GROUPS: readonly SettingsObservedGroup[] = [
  {
    group: '任务与工具', icon: 'bolt',
    rows: [
      { label: '运行中发送方式', note: '设置主输入框和桌面宠物在 Agent 执行期间发送的新输入默认排队或立即插话。' },
      { label: '问答面板静默跳过', note: '开启后，当前任务前台无人操作 150 秒、后台 90 秒后，以空答案自动跳过未回答的问答；面板内交互会取消自动跳过。' },
      { label: '产物文件默认打开位置', note: '控制会话流中的产物文件默认在右侧工作区还是新窗口打开。文件菜单仍可选择其他方式。' },
      { label: '提示建议', note: 'Agent 完成回复后显示可继续追问的建议。' },
      { label: '新消息保持在阅读起点', note: '发送后将新一轮定位到视口顶部，内容填满后继续贴底追随；关闭后发送新消息时直接定位到底部。' },
      { label: '显示工具调用次数', note: '在折叠的处理过程前显示这一段里的工具调用数量。' },
      { label: '默认展开工具调用', note: '工具调用卡片默认显示输入与响应详情。' },
      { label: '折叠回复过程', note: '回复成功完成后，将最终正文前的过程文本、思考和工具调用收进活动详情。' },
      { label: '耗时显示格式', note: '控制会话流和回复结果里的执行耗时精度。' },
      { label: '思考状态 Loader', note: '选择思考状态文案左侧的加载动效。' },
      { label: '思考状态文案', note: '同时自定义思考期间轮换显示的中文和英文文案。' },
      { label: '目标驱动执行', note: '设定最大轮次上限。设置目标后，Qoder 会自动持续推进目标，直到达成或用完轮次。' },
      { label: '首页小游戏', note: '选择首页游戏，两种工作模式共用。更改从下次入口展示起生效，不影响当前游玩。' },
    ],
  },
  {
    group: '通知', icon: 'chat',
    rows: [
      { label: '轮次完成通知', note: '设置 Agent 完成一轮后何时通过系统通知提醒你。' },
      { label: '权限请求通知', note: 'Agent 需要授权才能继续时显示系统通知。' },
      { label: '等待回答通知', note: 'Agent 等待你回答问题时显示系统通知。' },
      { label: '系统通知设置', note: '系统已关闭通知。打开系统设置后即可恢复提醒。' },
    ],
  },
  {
    group: '隐私', icon: 'panel',
    rows: [
      { label: '数据共享模式', note: '你的提示词、上下文及使用数据将用于产品改进，以便提供更好的服务。' },
    ],
  },
  {
    group: '托盘与菜单栏', icon: 'monitor',
    rows: [
      { label: '显示菜单栏图标', note: '在 macOS 菜单栏显示应用图标，可快速打开任务或退出应用。' },
    ],
  },
]

/** QB15-02 · 模式配置默认页（编程/通用各六行，行名与说明一致）。 */
const MODE_ROWS: readonly SettingsObservedRow[] = [
  { label: '绑定主题', note: '切换到这个模式时使用的主题配色，亮暗模式沿用外观设置。' },
  { label: '运行位置入口', note: '控制 Local、Worktree、SSH 和分支选择是否展示。' },
  { label: '输入区运行环境标签', note: '控制任务输入框下方的本地、Worktree、SSH 和 Git 分支标签是否展示，不影响任务监控卡片。' },
  { label: '任务监控卡片环境信息', note: '控制任务监控卡片中的分支、运行位置和本地服务等工程信息是否展示，不影响输入区标签。' },
  { label: '浏览器本地服务入口', note: '控制浏览器空白页是否展示本地服务列表。' },
  { label: '任务文件变更卡片', note: '控制 Agent 完成一轮后，是否在任务流末尾展示文件变更和 Diff 审阅入口。' },
]

export const MODE_GROUPS: readonly SettingsObservedGroup[] = [
  { group: '编程', icon: 'grid', rows: MODE_ROWS },
  { group: '通用', icon: 'grid', rows: MODE_ROWS },
]

/** QB16-01 · 任务监控默认页（五组十四行；任务回顾另有设置按钮）。 */
export const TASK_MONITOR_GROUPS: readonly SettingsObservedGroup[] = [
  {
    group: '展示方式', icon: 'panel',
    rows: [
      { label: '任务监控形式', note: '选择任务监控以浮层打开，或固定在任务右侧。' },
      { label: '固定模式默认展示', note: '选择进入任务时是否自动展示固定任务监控；隐藏时需要手动点击打开。' },
    ],
  },
  {
    group: '进度与上下文', icon: 'clock',
    rows: [
      { label: '任务回顾', note: '在任务监控中生成简短回顾。设置入口见右侧按钮。' },
      { label: '任务目标', note: '显示当前任务正在追踪的目标。' },
      { label: '计划', note: '显示当前任务的计划入口。' },
    ],
  },
  {
    group: '执行活动', icon: 'bolt',
    rows: [
      { label: '子智能体', note: '显示后台子智能体的运行状态和入口。' },
      { label: '后台进程', note: '显示后台命令和长时间运行进程。' },
      { label: '侧边聊天', note: '显示从当前任务分出的侧边聊天。' },
      { label: 'Skill 与 MCP', note: '显示任务使用的 Skill、MCP 和其他运行时能力。' },
    ],
  },
  {
    group: '结果与来源', icon: 'file',
    rows: [
      { label: '产出', note: '显示任务产生的文件和其他结果。' },
      { label: '网页查阅', note: '显示任务过程中打开的网页。' },
      { label: '来源', note: '显示任务引用的文件和链接，以及添加来源的入口。' },
    ],
  },
  {
    group: '辅助入口', icon: 'settings',
    rows: [
      { label: '记忆更新', note: '记忆发生更新时，显示前往记忆设置的入口。' },
      { label: '演示画面', note: '在固定模式中显示演示画面的显隐控制。' },
    ],
  },
]

/** QB17-01 + QB18 快捷键页：五组十六行；搜索为真实本地交互（观测覆盖 search.voice/empty）。 */
export const SHORTCUT_GROUPS: readonly SettingsObservedGroup[] = [
  {
    group: '输入', icon: 'bolt',
    rows: [
      { label: '发送消息', note: '聊天输入框使用 ⌘ Enter 换行，也可用 Shift Enter。运行中支持插话时，⌘ Enter 仍用于插话。' },
    ],
  },
  {
    group: '导航', icon: 'grid',
    rows: [
      { label: '设置', note: '打开设置。' },
      { label: '返回', note: '在工作台导航历史中返回上一页。' },
      { label: '前进', note: '在工作台导航历史中前进到下一页。' },
      { label: '切换工作模式', note: '在编程模式和通用模式之间切换。' },
      { label: '切换任务', note: '搜索并切换到另一个任务。' },
      { label: '打开或关闭左侧栏', note: '切换工作台左侧导航栏的展开状态。' },
    ],
  },
  {
    group: '任务', icon: 'file',
    rows: [
      { label: '新任务', note: '从当前工作台打开新的 Chat 输入页。' },
      { label: '搜索当前任务', note: '在当前可见的 ChatSession 中打开任务搜索。' },
      { label: '打开或关闭右侧栏', note: '切换当前任务或新任务的右侧工作区栏。' },
    ],
  },
  {
    group: '语音', icon: 'chat',
    rows: [
      { label: '开始或停止语音输入', note: '在当前聚焦的消息输入框中切换语音输入。' },
      { label: '实时语音快捷键', note: '在当前聚焦的 Chat 输入框中开始实时语音，或结束正在进行的实时语音。' },
      { label: '静音或恢复实时语音播报', note: '不切换当前焦点，静音或恢复正在进行的实时语音播报。' },
      { label: '启用或禁用实时语音麦克风', note: '不切换当前焦点，启用或禁用正在进行的实时语音麦克风。' },
    ],
  },
  {
    group: '系统', icon: 'monitor',
    rows: [
      { label: '新建窗口', note: '在桌面端打开一个新的窗口。' },
      { label: '问题反馈', note: '打开问题反馈窗口并自动附带当前截图。' },
    ],
  },
]

/** QB18-05 语音页：四组十三行（实时语音快捷键行另挂修改弹窗；常用词纠正行挂本地草稿输入）。 */
export const VOICE_GROUPS: readonly SettingsObservedGroup[] = [
  {
    group: '通用', icon: 'grid',
    rows: [
      { label: '输入设备', note: '选择用于语音输入的麦克风；自动会跟随系统当前设备。' },
    ],
  },
  {
    group: '语音输入', icon: 'chat',
    rows: [
      { label: '语音输入', note: '开启后可在当前 Chat 输入框中使用麦克风、快捷键和 DJI Mic 进行语音输入。' },
      { label: '语音识别润色', note: '自动修正口语停顿、重复和标点，让转写结果更适合直接发送。' },
      { label: '声纹识别', note: '根据本次录音开头的声音特征降低周围人声干扰；下一次录音时生效。' },
      { label: '自动发送', note: '使用 DJI Mic Mini 2 合作套装时，单击开始录音，再次单击结束录音并自动发送。' },
      { label: '常用词纠正', note: '添加专有名词或术语，提升识别准确率。' },
      { label: '暂无语音输入历史', note: '在 Chat 输入框完成语音输入后，记录会显示在这里。' },
    ],
  },
  {
    group: '实时语音', icon: 'chat',
    rows: [
      { label: '实时语音快捷键', note: '在当前聚焦的 Chat 输入框中开始实时语音，或结束正在进行的实时语音。' },
      { label: '播报音色', note: '新实时语音连接使用所选音色。' },
      { label: '播报速度', note: '新实时语音连接使用所选速度。' },
      { label: '声纹识别', note: '新实时语音任务优先识别已保存的声纹；关闭不会删除已有声纹。' },
      { label: '屏幕上下文', note: '当你提到屏幕内容时，允许实时语音将检查请求交给 Backend Agent。' },
    ],
  },
  {
    group: '录音纪要', icon: 'file',
    rows: [
      { label: '录音纪要最长时长', note: '到达上限后自动停止并保存录音和转写。' },
    ],
  },
]
