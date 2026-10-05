import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

import { readDesktopState, type DesktopRead } from './client.js'
import { Icon, TreeStamp, type DesktopIconName } from './icons.js'
import { useDesktopSession, type DesktopReadState } from './session-controller.js'
import { DesktopSessionView } from './session-view.js'

// Sanbao b861d04: ProductPages.tsx:31–36,73–75 and Controls.tsx:199–234.
// Keep the research desktop's structure, not its routes, fixtures or optimistic send/clear behavior.
type Page = '新任务' | '通用' | '搜索' | '工作区' | '知识中心' | '站点' | '自动化' | '扩展' | '账号与设置' | '移动端' | '模型' | '运行模式'
const navigation = [
  { label: '知识中心', icon: 'book' }, { label: '站点', icon: 'globe' },
  { label: '自动化', icon: 'clock' }, { label: '扩展', icon: 'grid' },
] as const
const contextItems = [
  { label: '目标', icon: 'bolt' }, { label: '计划', icon: 'file' },
  { label: '站点', icon: 'globe' }, { label: '工作区文件', icon: 'folder' },
  { label: '插件', icon: 'grid' }, { label: '技能', icon: 'bolt' },
] as const
const outstanding: Record<Exclude<Page, '新任务'>, string> = {
  通用: '通用任务模式尚未接通；当前选择只改变本地浏览页面。',
  搜索: '搜索尚未接通；等待独立读取授权与真实检索结果。',
  工作区: '工作区尚未接通；目录选择、绑定与文件读取需要服务端接入。',
  知识中心: '知识中心尚未接通；不会展示虚构知识条目。',
  站点: '站点尚未接通；没有创建、发布或打开站点。',
  自动化: '自动化尚未接通；没有安排任务或启动定时运行。',
  扩展: '扩展尚未接通；安装、启用与授权需要分别核验。',
  '账号与设置': '账号与设置尚未接通；身份状态未知，不从服务读取拒绝推断登录状态。',
  移动端: '移动端入口尚未接通；没有打开下载页面。',
  模型: '模型选择尚未接通；配置与可用状态未知。',
  运行模式: '运行模式尚未接通；不从运行时连接状态推断任务执行权限。',
}

function ReadStatus({ state, retry, busy }: { readonly state: DesktopReadState; readonly retry: () => void; readonly busy: boolean }): ReactNode {
  let content: ReactNode
  switch (state.kind) {
    case 'loading': content = <><strong>正在读取服务状态</strong><span>草稿可继续编辑。</span></>; break
    case 'blocked': content = <><strong>读取被拒绝</strong><span>服务未允许本次状态读取：<code>{state.code}</code></span></>; break
    case 'unavailable': content = <><strong>服务状态不可用</strong><span>未能取得可用读数，可以重新读取。</span></>; break
    case 'read': content = <><strong>运行时状态：{({ ready: '已连接', recovering: '恢复中', unavailable: '不可用' } as const)[state.runtime.status]}</strong><span>{state.runtime.message}</span></>; break
  }
  return <section className="desktop-read" data-desktop-read={state.kind} aria-label="服务状态">
    <div id="desktop-read-status" role="status" aria-live="polite">{content}</div>
    <button id="desktop-read-retry" className="text-button" aria-label="重新读取状态" disabled={busy || state.kind === 'loading'} onClick={retry}>重新读取</button>
  </section>
}

function Sidebar({ page, navigate }: { readonly page: Page; readonly navigate: (page: Page) => void }): ReactNode {
  const [collapsed, setCollapsed] = useState(false)
  const row = (label: Page, icon: DesktopIconName) => <button type="button"
    className={`sidebar-row ${page === label ? 'active' : ''}`} aria-label={label}
    aria-current={page === label ? 'page' : undefined} onClick={() => navigate(label)}><Icon name={icon} />{label}</button>
  return <aside className={`product-sidebar ${collapsed ? 'collapsed' : ''}`} aria-label="桌面侧栏">
    <div className="sidebar-top">
      {/* Reserve source titlebar geometry; native window controls remain main-owned. */}
      <span className="window-dots" aria-hidden="true" />
      <button className="icon-button" aria-label={collapsed ? '展开侧栏' : '收起侧栏'} aria-expanded={!collapsed}
        aria-controls="desktop-sidebar-content" onClick={() => setCollapsed(value => !value)}><Icon name="panel" /></button>
    </div>
    <nav id="desktop-sidebar-content" className="sidebar-content" aria-label="主导航" hidden={collapsed}>
      <div className="mode-tabs" aria-label="任务模式">
        <button className={page !== '通用' ? 'active' : ''} aria-pressed={page !== '通用'} onClick={() => navigate('新任务')}><Icon name="code" size={14} />编程</button>
        <button className={page === '通用' ? 'active' : ''} aria-pressed={page === '通用'} onClick={() => navigate('通用')}><Icon name="globe" size={14} />通用</button>
      </div>
      <div className="sidebar-primary">
        <button className="sidebar-row new-task" aria-label="新任务" aria-current={page === '新任务' ? 'page' : undefined} onClick={() => navigate('新任务')}><Icon name="plus" />新任务</button>
        {row('搜索', 'search')}
        <div className="sidebar-label">工作区<button className="icon-button" aria-label="新建工作区" onClick={() => navigate('工作区')}><Icon name="plus" /></button></div>
        <button className="sidebar-row workspace-row" aria-label="工作区" onClick={() => navigate('工作区')}><span className="workspace-mark"><Icon name="folder" size={14} /></span><span>工作区待接入</span><Icon name="down" size={12} /></button>
      </div>
      <div className="sidebar-bottom">
        {navigation.map(item => <div key={item.label}>{row(item.label, item.icon)}</div>)}
        <div className="sidebar-divider" />
        <button className="account-row" aria-label="账号与设置" onClick={() => navigate('账号与设置')}>
          <span className="avatar" aria-hidden="true">?</span><span><strong>账号与设置</strong><small>身份状态未知</small></span><Icon name="settings" size={15} />
        </button>
      </div>
    </nav>
  </aside>
}

function HomeContent({ navigate, suggest }: { readonly navigate: (page: Page) => void; readonly suggest: (text: string) => void }): ReactNode {
  const [tab, setTab] = useState<'会话' | 'Credits'>('会话')
  return <div className="welcome-content">
    <div className="welcome-heading"><div><h1>不止于编程</h1><p>你好，欢迎来到 Sage。</p></div><TreeStamp /></div>
    <div className="workspace-summary" aria-label="工作区状态未知">
      <span className="workspace-mark"><Icon name="folder" size={14} /></span><div><strong>工作区待接入</strong><span>绑定状态未知</span></div><small>尚未读取</small>
    </div>
    <section className="activity-card" aria-label="活动概览">
      <div className="activity-heading"><div className="activity-tabs" aria-label="活动类型">
        {(['会话', 'Credits'] as const).map(label => <button key={label} className={tab === label ? 'active' : ''}
          aria-pressed={tab === label} onClick={() => setTab(label)}>{label}</button>)}
      </div><span>统计范围未知 <Icon name="down" size={11} /></span></div>
      {/* Keep the heatmap footprint, never synthesize contribution cells or zero counts. */}
      <div className="activity-unavailable" role="status"><span>{tab}活动数据不可用</span><small>等待独立读取授权与活动数据接入</small></div>
      <div className="activity-caption"><span>从一个想法，开始新的探索</span><span>未读取，不代表没有活动</span></div>
    </section>
    <div className="welcome-prompts">
      <button onClick={() => suggest('帮我梳理一个想法')}><Icon name="chat" size={14} />帮我梳理一个想法</button>
      <button onClick={() => suggest('制作一个小工具')}><Icon name="code" size={14} />制作一个小工具</button>
      <button onClick={() => navigate('自动化')}><Icon name="clock" size={14} />安排一项自动化</button>
    </div>
  </div>
}

function ContextMenu({ notice }: { readonly notice: (message: string) => void }): ReactNode {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const opener = useRef<HTMLButtonElement>(null)
  const close = () => { setOpen(false); opener.current?.focus() }
  useEffect(() => {
    if (!open) return
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])
  const keys = (event: KeyboardEvent) => {
    if (event.nativeEvent.isComposing) return
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    const items = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])
    if (!items.length) return
    event.preventDefault()
    const index = items.findIndex(item => item === document.activeElement)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
      : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
    items[next]?.focus()
  }
  return <div className="relative" ref={root} onKeyDown={open ? keys : undefined}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}>
    <button className="icon-button" aria-label="添加上下文" aria-haspopup="menu" aria-expanded={open}
      aria-controls={open ? 'desktop-context-menu' : undefined} ref={opener}
      onClick={() => { if (open) close(); else setOpen(true) }}><Icon name="plus" /></button>
    {open && <div className="small-menu context-menu" id="desktop-context-menu" ref={menu} role="menu" aria-label="上下文类型">
      {contextItems.map(item => <button type="button" role="menuitem" key={item.label} aria-label={`${item.label}：不可用`}
        onClick={() => { notice(`${item.label}尚未接通，当前不可用；未添加上下文，草稿已保留。`); close() }}>
        <span className="composer-context-item"><Icon name={item.icon} size={14} />{item.label}</span><small>不可用</small>
      </button>)}
    </div>}
  </div>
}

function Composer({ draft, changeDraft, notice, setNotice, navigate, busy, uncertain, hasSession, executing, paused, onAction }: {
  readonly draft: string; readonly changeDraft: (text: string) => void
  readonly notice: string; readonly setNotice: (text: string) => void; readonly navigate: (page: Page) => void
  readonly busy: boolean; readonly uncertain: boolean; readonly hasSession: boolean
  readonly executing: boolean; readonly paused: boolean
  readonly onAction: (kind: 'send' | 'stop' | 'resume') => Promise<void>
}): ReactNode {
  const composing = useRef(false)
  const submit = () => {
    if (!draft.trim() || busy || uncertain) return
    void onAction('send')
  }
  return <div className="home-composer">
    <div className="composer composer-with-context">
      <textarea aria-label="任务输入" placeholder="描述你想完成的任务…" value={draft}
        onChange={event => changeDraft(event.target.value)}
        onCompositionStart={() => { composing.current = true }} onCompositionEnd={() => { composing.current = false }}
        onKeyDown={event => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && !composing.current && event.keyCode !== 229) {
            event.preventDefault(); submit()
          }
        }} />
      <div className="composer-toolbar"><div className="composer-tools">
        <ContextMenu notice={setNotice} />
        <button className="text-button" aria-label="模型状态未知" onClick={() => navigate('模型')}>模型未知 <Icon name="down" size={12} /></button>
      </div>
        {executing && <button className="text-button" aria-label="停止生成" disabled={busy || uncertain} onClick={() => { void onAction('stop') }}>停止生成</button>}
        {paused && <button className="text-button" aria-label="继续会话" disabled={busy || uncertain} onClick={() => { void onAction('resume') }}>继续会话</button>}
        <button className="send-button" aria-label="发送任务" disabled={!draft.trim() || busy || uncertain} onClick={submit}><Icon name="arrow" size={18} /></button>
      </div>
      <div className="composer-context">
        <button onClick={() => navigate('工作区')}><Icon name="folder" size={13} />工作区待接入 <Icon name="down" size={11} /></button>
        <button onClick={() => navigate('运行模式')}><Icon name="monitor" size={13} />运行模式未知</button>
      </div>
      {notice && <p className="composer-local-note" role="status">{notice}</p>}
    </div>
    <p>{uncertain ? '结果未知 · 重新读取不代表允许重发' : hasSession ? '操作结果以服务回执和会话记录为准' : '思考、创作、执行，都从这里开始 · 发送尚未接通'}</p>
  </div>
}

export function DesktopPage({ readState = readDesktopState }: { readonly readState?: () => Promise<DesktopRead> }): ReactNode {
  const [page, setPage] = useState<Page>('新任务')
  const { state, session, draft, changeDraft, notice, setNotice, busy, uncertain, retry, actOnSession } = useDesktopSession(readState)
  const navigate = (next: Page) => {
    if (next === '新任务' && draft.length > 0) setNotice('草稿已保留；返回输入不会创建任务，也不会清空已有内容。')
    setPage(next)
  }
  const suggest = (text: string) => {
    if (draft.length > 0) { setNotice('草稿已保留；建议不会覆盖已有内容。'); return }
    changeDraft(text)
    setNotice('建议已填入草稿，尚未发送。')
  }
  return <div className="sage-desktop product-window">
    <Sidebar page={page} navigate={navigate} />
    <main className="product-surface" aria-label="Sage 桌面">
      <div className="home-page"><div className="home-top"><span />
        <button className="text-button" onClick={() => navigate('移动端')}><Icon name="monitor" size={15} />下载移动端 <Icon name="chevron" size={12} /></button>
      </div>
        <ReadStatus state={state} retry={retry} busy={busy} />
        {page === '新任务'
          ? (session === undefined ? <HomeContent navigate={navigate} suggest={suggest} />
            : <DesktopSessionView title={session.title} execution={session.execution} lastTurnEnd={session.lastTurnEnd}
              paused={session.paused} streamBroken={session.streamBroken} messages={session.messages} />)
          : <section className="welcome-content outstanding-feature"><h1>{page}</h1><p>{outstanding[page]}</p>
            <button className="text-button" onClick={() => navigate('新任务')}>返回任务输入</button></section>}
        <Composer draft={draft} changeDraft={changeDraft} notice={notice} setNotice={setNotice} navigate={navigate}
          busy={busy} uncertain={uncertain} hasSession={session !== undefined}
          executing={session?.execution === 'executing'} paused={session?.paused === true} onAction={actOnSession} />
      </div>
    </main>
  </div>
}
