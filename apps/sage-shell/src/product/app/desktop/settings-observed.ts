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

export interface SettingsObservedGroup {
  readonly group: string
  readonly rows: readonly SettingsObservedRow[]
}

/** QB15-01 · 常规默认页. */
export const GENERAL_GROUPS: readonly SettingsObservedGroup[] = [
  {
    group: '任务与工具',
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
    group: '通知',
    rows: [
      { label: '轮次完成通知', note: '设置 Agent 完成一轮后何时通过系统通知提醒你。' },
      { label: '权限请求通知', note: 'Agent 需要授权才能继续时显示系统通知。' },
      { label: '等待回答通知', note: 'Agent 等待你回答问题时显示系统通知。' },
      { label: '系统通知设置', note: '系统已关闭通知。打开系统设置后即可恢复提醒。' },
    ],
  },
  {
    group: '隐私',
    rows: [
      { label: '数据共享模式', note: '你的提示词、上下文及使用数据将用于产品改进，以便提供更好的服务。' },
    ],
  },
  {
    group: '托盘与菜单栏',
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
  { group: '编程', rows: MODE_ROWS },
  { group: '通用', rows: MODE_ROWS },
]

/** QB16-01 · 任务监控默认页（五组十四行；任务回顾另有设置按钮）。 */
export const TASK_MONITOR_GROUPS: readonly SettingsObservedGroup[] = [
  {
    group: '展示方式',
    rows: [
      { label: '任务监控形式', note: '选择任务监控以浮层打开，或固定在任务右侧。' },
      { label: '固定模式默认展示', note: '选择进入任务时是否自动展示固定任务监控；隐藏时需要手动点击打开。' },
    ],
  },
  {
    group: '进度与上下文',
    rows: [
      { label: '任务回顾', note: '在任务监控中生成简短回顾。设置入口见右侧按钮。' },
      { label: '任务目标', note: '显示当前任务正在追踪的目标。' },
      { label: '计划', note: '显示当前任务的计划入口。' },
    ],
  },
  {
    group: '执行活动',
    rows: [
      { label: '子智能体', note: '显示后台子智能体的运行状态和入口。' },
      { label: '后台进程', note: '显示后台命令和长时间运行进程。' },
      { label: '侧边聊天', note: '显示从当前任务分出的侧边聊天。' },
      { label: 'Skill 与 MCP', note: '显示任务使用的 Skill、MCP 和其他运行时能力。' },
    ],
  },
  {
    group: '结果与来源',
    rows: [
      { label: '产出', note: '显示任务产生的文件和其他结果。' },
      { label: '网页查阅', note: '显示任务过程中打开的网页。' },
      { label: '来源', note: '显示任务引用的文件和链接，以及添加来源的入口。' },
    ],
  },
  {
    group: '辅助入口',
    rows: [
      { label: '记忆更新', note: '记忆发生更新时，显示前往记忆设置的入口。' },
      { label: '演示画面', note: '在固定模式中显示演示画面的显隐控制。' },
    ],
  },
]
