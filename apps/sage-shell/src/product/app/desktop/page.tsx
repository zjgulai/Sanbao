import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

import { SAGE_LOGIN_PATH, SAGE_LOGOUT_PATH, SAGE_REQUEST_TIMEOUT_MS } from '../../contracts.js'
import { readDesktopBootstrapState, readDesktopState, type DesktopBootstrapRead, type DesktopRead, type DesktopReadoutKnowledge } from './client.js'
import { adoptDesktopWorkspace } from './adopt.js'
import { Icon, TreeStamp, type DesktopIconName } from './icons.js'
import { searchDesktop, SEARCH_MATCHED_FIELD_LABELS, type DesktopSearchOutcome, type DesktopSearchSessions } from './search.js'
import { createDevicePreferencesController, type DevicePreferencesController } from './device-preferences.js'
import { DesktopSettingsView } from './settings-view.js'
import { useDesktopSession, type DesktopReadState } from './session-controller.js'
import type { DesktopPlans, DesktopSession } from './session.js'
import type { DesktopArtifacts } from './client.js'
import { listDesktopFileCandidates, type DesktopFileCandidate } from './files.js'
import { McpForm } from './mcp-form.js'
import { ExtensionsMarketView } from './extensions-market.js'
import { DEVICE_PREFERENCE_OPTIONS, type DevicePreferencePatch } from './device-preferences.js'
import { DesktopSessionView, TurnProcessFooter } from './session-view.js'
import { closeDesktopArtifact, openDesktopArtifact, retryDesktopArtifact, setDesktopArtifactFullscreen, setDesktopArtifactWindow } from './artifacts.js'
import { answerDesktopApproval, editPendingInput, editQueueItem, removePendingInput, removeQueueItem, withdrawDesktopApproval, type SessionControlResult } from './session-controls.js'
import { readDesktopTerminal } from './terminal.js'

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
const outstanding: Record<Exclude<Page, '新任务' | '工作区' | '搜索' | '账号与设置' | '扩展' | '知识中心' | '站点' | '运行模式'>, string> = {
  通用: '通用任务模式尚未接通；当前选择只改变本地浏览页面。',
  自动化: '自动化尚未接通；没有安排任务或启动定时运行。',
  移动端: '移动端入口尚未接通；没有打开下载页面。',
  模型: '模型选择尚未接通；配置与可用状态未知。',
}
// T03 follow-up (M-3): the send route caps the whole request body at 4096 bytes — far below the
// 16384-character text limit once UTF-8 multi-byte text plus matter/workspace fields are counted.
// Surface the pressure honestly before a submit is locally refused with request-too-large.
const DRAFT_BYTE_NOTICE_AT = 3000

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

function receiptCode(value: unknown): string | null {
  return value !== null && typeof value === 'object' && typeof (value as { readonly code?: unknown }).code === 'string'
    ? (value as { readonly code: string }).code
    : null
}

// T03: the workspace page consumes the service's workspace-follow projection read. The list is
// rendered strictly in the service's own order; an order id without an entry is skipped, never
// filled with an invented row, and an empty list is a real empty state.
// T03-C: the adopt entry posts the real adopt route and reports its outcome verbatim in a local
// notice; an adopted result never inserts a local row — the list stays a pure projection of the
// last read, refreshed by the ordinary read cycle.
// Loop-Q R12 line A (QDR.P13.create.empty / QDR.P13.create.ready): the observed icon/colour
// option labels. Selection is a local draft fact only; nothing posts on selection.
const CREATE_ICON_OPTIONS = ['方格', '闪电', '星标'] as const
const CREATE_COLOR_OPTIONS = ['绿', '蓝', '橙'] as const

// ADR-0316 (R16/O04): the matter roster and the administration read-backs. Every write (archive/
// restore/batch/rename; groups' create/rename/remove/membership) rides a direct-provider-bypass
// violation route — this version carries ZERO action entries and says so in one named line per
// card (ADR-0315 D2 pure-shell posture); selection machinery lands with the admission batch.
const MATTER_TRIGGER_LABEL: Record<string, string> = {
  'attempt-unknown': '尝试结果未知', 'attempt-failed': '尝试失败', 'pending-inputs': '待继续输入',
}
const GROUP_TRAIL_LABEL: Record<string, string> = {
  create: '建立', rename: '改名', remove: '移除', 'add-members': '加入成员', 'remove-members': '移出成员',
}
const MATTER_UNWIRED_NOTE = '归档/恢复/批量/重命名尚未接通（写路径 admission 收口在独立批——本版不提供动作入口）。'
const GROUPS_UNWIRED_NOTE = '建立/改名/移除/成员变更尚未接通（写路径 admission 收口在独立批——本版不提供动作入口）。'

function MatterSection({ state }: { readonly state: DesktopReadState }): ReactNode {
  if (state.kind !== 'read') return null
  const { matterList, matterAdmin, matterGroups } = state
  if (matterList === undefined && matterAdmin === undefined && matterGroups === undefined) return null
  return <section className="matter-section" aria-label="事项">
    <h2>事项</h2>
    {matterList !== undefined && (matterList.state !== 'read'
      ? <p className="workspace-note" role="status">{`事项名册读取不可用（原因码 ${matterList.code ?? 'matter-list-unavailable'}）；不据此断言无事项。`}</p>
      : <div className="matter-roster" aria-label="事项名册">
        <p className="control-note" role="status">{`待我处理 ${String(matterList.counts.action)} · 进行中 ${String(matterList.counts.inProgress)} · 验收 ${String(matterList.counts.acceptance)}`}</p>
        {matterList.items.length === 0
          ? <p className="workspace-note" role="status">当前没有事项。</p>
          : <ul className="workspace-list" aria-label="事项列表">{matterList.items.map(item => <li key={item.itemId} className="matter-row" data-matter-partition={item.partition}>
            <strong>{item.title}</strong>
            <span className="control-item-badge">{item.partition === 'action' ? '待我处理' : item.partition === 'in-progress' ? '进行中' : '验收'}</span>
            {item.lifecycle === 'archived' ? <span className="control-item-badge">已归档</span> : null}
            {item.triggers.length > 0
              ? <small>{`触发：${item.triggers.map(trigger => MATTER_TRIGGER_LABEL[trigger.kind] + (trigger.count === null ? '' : `×${String(trigger.count)}`)).join(' · ')}`}</small>
              : null}
          </li>)}</ul>}
      </div>)}
    {matterAdmin !== undefined && (matterAdmin.state !== 'read'
      ? <p className="workspace-note" role="status">事项管理读取不可用；不据此断言无归档记录。</p>
      : <div className="matter-admin-card" aria-label="事项管理读回">
        {matterAdmin.entries.length === 0 ? null : <ul className="workspace-list" aria-label="已归档事项">
          {matterAdmin.entries.map(entry => <li key={entry.matterRef} className="matter-row">
            <strong>{entry.matterRef}</strong>
            <span className="control-item-badge">{entry.ground === 'completed' ? '已完成归档' : '已停止归档'}</span>
            <small>{entry.archivedAt}</small>
          </li>)}</ul>}
        {matterAdmin.rename === null ? null
          : <p className="control-note">{`最近重命名：${matterAdmin.rename.requested} → ${matterAdmin.rename.effective}（以服务回读为准）`}</p>}
        {matterAdmin.batch === null ? null
          : <p className="control-note">{`最近批量（${matterAdmin.batch.operation === 'archive' ? '归档' : '恢复'}）：共 ${String(matterAdmin.batch.rows.length)} · 受理 ${String(matterAdmin.batch.okCount)} / 拒绝 ${String(matterAdmin.batch.refusedCount)}`}</p>}
        {matterAdmin.trail.length === 0 ? null : <ul className="workspace-list" aria-label="事项管理轨迹">
          {matterAdmin.trail.slice(-6).map((record, index) => <li key={index} className="matter-row">
            <small>{`${record.at} · ${record.action === 'archive' ? '归档' : '恢复'} ${record.matterRef}`}</small>
          </li>)}</ul>}
        <p className="control-note" role="status">{MATTER_UNWIRED_NOTE}</p>
      </div>)}
    {matterGroups !== undefined && (matterGroups.state !== 'read'
      ? <p className="workspace-note" role="status">事项分组读取不可用（{matterGroups.code ?? 'matter-groups-unavailable'}）。</p>
      : <div className="matter-groups-card" aria-label="事项分组读回">
        {matterGroups.groups.length === 0
          ? <p className="control-note" role="status">当前没有事项分组。</p>
          : <ul className="workspace-list" aria-label="事项分组列表">{matterGroups.groups.map(group => <li key={group.groupId} className="matter-row">
            <strong>{group.name}</strong>
            <span className="control-item-badge">{`${String(group.memberCount)} 项`}</span>
          </li>)}</ul>}
        {matterGroups.rename === null ? null
          : <p className="control-note">{`最近改名：${matterGroups.rename.requested} → ${matterGroups.rename.effective}（以服务回读为准）`}</p>}
        {matterGroups.batch === null ? null
          : <p className="control-note">{`最近成员批量（${matterGroups.batch.operation === 'add' ? '加入' : '移出'}）：受理 ${String(matterGroups.batch.okCount)} / 未变 ${String(matterGroups.batch.unchangedCount)} / 拒绝 ${String(matterGroups.batch.refusedCount)}`}</p>}
        {matterGroups.trail.length === 0 ? null : <ul className="workspace-list" aria-label="事项分组轨迹">
          {matterGroups.trail.slice(-6).map((record, index) => <li key={index} className="matter-row">
            <small>{`${record.at} · ${GROUP_TRAIL_LABEL[record.action] ?? record.action} ${record.name}（${String(record.count)}）`}</small>
          </li>)}</ul>}
        <p className="control-note" role="status">{GROUPS_UNWIRED_NOTE}</p>
      </div>)}
  </section>
}

function WorkspacePage({ state, retry, navigate }: { readonly state: DesktopReadState; readonly retry: () => void; readonly navigate: (page: Page) => void }): ReactNode {
  const [adoptBusy, setAdoptBusy] = useState(false)
  const [adoptNotice, setAdoptNotice] = useState('')
  // Loop-Q R12 line A: the create form's draft state lives here — above the read-branch render —
  // so a retry()'s transient loading read never discards what the user already picked.
  const [createDir, setCreateDir] = useState<{ readonly title: string; readonly path: string } | null>(null)
  const [createName, setCreateName] = useState('')
  const [createIcon, setCreateIcon] = useState<typeof CREATE_ICON_OPTIONS[number]>('方格')
  const [createColor, setCreateColor] = useState<typeof CREATE_COLOR_OPTIONS[number]>('绿')
  const [createNote, setCreateNote] = useState('')
  const [createBusy, setCreateBusy] = useState(false)
  const startAdopt = () => {
    if (adoptBusy) return
    setAdoptBusy(true)
    void adoptDesktopWorkspace().then(outcome => {
      setAdoptBusy(false)
      if (outcome.state === 'refused') setAdoptNotice(`本次未接入（${outcome.code}），没有创建或绑定任何工作区。`)
      else if (outcome.state === 'cancelled') setAdoptNotice('已取消目录选择；没有创建或绑定任何工作区。')
      else {
        setAdoptNotice(`已接入工作区 ${outcome.title}；列表以下一次读取为准。`)
        retry()
      }
    })
  }
  const pickCreateFolder = () => {
    if (createBusy) return
    setCreateBusy(true)
    void adoptDesktopWorkspace().then(outcome => {
      setCreateBusy(false)
      if (outcome.state === 'refused') setCreateNote(`本次未接入（${outcome.code}），没有创建或绑定任何工作区。`)
      else if (outcome.state === 'cancelled') setCreateNote('已取消目录选择；没有创建或绑定任何工作区。')
      else {
        setCreateDir({ title: outcome.title, path: outcome.path })
        setCreateName(outcome.title)
        setCreateNote(`已接入工作区 ${outcome.title}；列表以下一次读取为准。`)
        retry()
      }
    })
  }
  const createWorkspace = () => {
    if (createBusy || createDir === null || createName.trim() === '') return
    setCreateNote('正在保存……')
    void Promise.resolve().then(() => {
      setCreateNote(`已接入：${createDir.title}；列表以下一次读取为准。`)
      retry()
    })
  }
  let body: ReactNode
  if (state.kind === 'read') {
    const list = state.workspaces
    if (list !== undefined && list.state === 'read') {
      const byId = new Map(list.entries.map(entry => [entry.workspaceId, entry]))
      const rows = list.order.map(id => byId.get(id)).filter(entry => entry !== undefined)
      body = rows.length === 0
        ? <p className="workspace-note" role="status">暂无已接入工作区。</p>
        : <ul className="workspace-list" aria-label="已接入工作区列表">
          {rows.map(entry => <li key={entry.workspaceId} className="workspace-entry">
            <strong>{entry.title}</strong><span>{entry.path}</span><small>{`会话数 ${entry.sessionCount}`}</small>
          </li>)}
        </ul>
    } else {
      const reason = list?.reason ?? 'unknown'
      body = <p className="workspace-note" role="status">{`工作区列表不可用（原因码 ${reason}）；可以重新读取状态后再查看。`}</p>
    }
  } else {
    const waiting = state.kind === 'blocked'
      ? `状态读取被拒绝（${state.code}）；工作区列表暂不能显示，可以重新读取。`
      : state.kind === 'loading'
        ? '正在读取服务状态；工作区列表以本次读取结果为准。'
        : '未能取得可用读数；工作区列表暂不能显示，可以重新读取。'
    body = <p className="workspace-note" role="status">{waiting}</p>
  }
  return <section className="welcome-content outstanding-feature" aria-label="工作区">
    <h1>工作区</h1>
    <button className="text-button" aria-label="接入工作区" disabled={adoptBusy} onClick={startAdopt}>接入工作区</button>
    {state.kind === 'read' && <section className="workspace-create" aria-label="新建工作区">
      {/* Known, registered difference from the observed product (QDR.P13.create.*): observation is
          two-phase — pick a folder, then click 创建 to save. This form reuses the existing
          pick+create-in-one adopt route (adopt.ts untouched), so choosing a folder already
          completes the real adoption; the create button only settles the local draft with a
          transient note and never posts a second adopt. */}
      <h2>新建工作区</h2>
      <div className="workspace-create-field" aria-label="源文件夹">
        {createDir === null
          ? <><span className="workspace-create-dir-empty">未选择文件夹</span>
            <button type="button" className="text-button" aria-label="选择文件夹" disabled={createBusy}
              onClick={pickCreateFolder}>选择文件夹</button></>
          : <p className="workspace-create-dir-row">
            <strong>{createDir.title}</strong><span className="workspace-create-primary" aria-label="主要">主要</span>
            <small>{createDir.path}</small>
          </p>}
      </div>
      <label className="workspace-create-field">名称
        <input aria-label="工作区名称" value={createName} onChange={event => setCreateName(event.target.value)} />
      </label>
      <div className="workspace-create-field" role="group" aria-label="工作区图标">
        <span>图标</span>
        {CREATE_ICON_OPTIONS.map(option => <button key={option} type="button" aria-label={option}
          aria-pressed={createIcon === option} className={createIcon === option ? 'active' : ''}
          onClick={() => setCreateIcon(option)}>{option}</button>)}
      </div>
      <div className="workspace-create-field" role="group" aria-label="工作区颜色">
        <span>颜色</span>
        {CREATE_COLOR_OPTIONS.map(option => <button key={option} type="button" aria-label={option}
          aria-pressed={createColor === option} className={createColor === option ? 'active' : ''}
          onClick={() => setCreateColor(option)}>{option}</button>)}
      </div>
      <button type="button" className="text-button" aria-label="创建工作区"
        disabled={createDir === null || createName.trim() === ''} onClick={createWorkspace}>创建工作区</button>
      {createNote !== '' && <p className="workspace-create-note" role="status">{createNote}</p>}
    </section>}
    {body}
    <MatterSection state={state} />
    {adoptNotice !== '' && <p className="workspace-note workspace-adopt-note" role="status">{adoptNotice}</p>}
    <button className="text-button" onClick={() => navigate('新任务')}>返回任务输入</button>
  </section>
}

/** T03-D: an opaque base session id shown as a short, bounds-safe摘录 — never a substitute for the
 *  real snippet beside it. */
function shortSessionId(value: string): string {
  return value.length > 16 ? `${value.slice(0, 16)}…` : value
}

// T03-D: the sessions section keeps the base's own three states distinct. An unmounted query
// engine (`unavailable`) or a failed call (`failed`) is never rendered as "no hits"; only an
// `available` engine that returned zero items may say so.
function SearchSessions({ sessions }: { readonly sessions: DesktopSearchSessions }): ReactNode {
  if (sessions.state === 'unavailable') return <p className="search-note" role="status">{`会话搜索不可用（${sessions.code}）`}</p>
  if (sessions.state === 'failed') return <p className="search-note" role="status">{`会话搜索失败（${sessions.code}）`}</p>
  if (sessions.items.length === 0) return <p className="search-note" role="status">没有会话命中。</p>
  return <>
    <ul className="search-sessions" aria-label="会话命中列表">
      {sessions.items.map((item, index) => <li key={`${item.sessionId}:${index}`} className="search-session">
        <code>{shortSessionId(item.sessionId)}</code><span>{item.snippet}</span>
      </li>)}
    </ul>
    {sessions.hasMore && <p className="search-note" role="status">还有更多会话命中；当前只显示本次返回的部分。</p>}
  </>
}

// T03-D: every rendered line comes from one real response. Unknown and refused show no rows at
// all; the two sections are rendered from the same validated read and never borrow each other's
// wording.
function SearchResult({ outcome }: { readonly outcome: DesktopSearchOutcome }): ReactNode {
  if (outcome.kind === 'unknown') {
    return <p className="search-note" role="status">结果未知：未能确认搜索是否执行，可以重新尝试；没有显示任何结果。</p>
  }
  if (outcome.kind === 'refused') {
    return <p className="search-note" role="status">搜索不可用（<code>{outcome.code}</code>）；没有返回任何结果。</p>
  }
  return <>
    <section className="search-section" aria-label="事项命中">
      <h2>事项命中</h2>
      {outcome.matters.length === 0
        ? <p className="search-note" role="status">没有事项命中。</p>
        : <ul className="search-hits" aria-label="事项命中列表">
          {outcome.matters.map((hit, index) => <li key={`${hit.matterRef}:${index}`} className="search-hit">
            <strong>{hit.title}</strong>
            <small>{`命中字段：${SEARCH_MATCHED_FIELD_LABELS[hit.matchedField]}`}</small>
            <code>{hit.matterRef}</code>
          </li>)}
        </ul>}
    </section>
    <section className="search-section" aria-label="会话">
      <h2>会话</h2>
      <SearchSessions sessions={outcome.sessions} />
    </section>
  </>
}

// T03-D: the search page consumes the real `POST /.sage/search` route. A blank query is answered
// locally without a request; every submit replaces the previous result so no stale rows survive
// under a new query.
/** ADR-0304: the task monitor page — the steps axis, the honest unknown axes, and the review
 *  card (updated time from the log's own stamp; outputs/sources stay honest when empty). */
/** Loop-Q R11 line A: the installed-extension tabs (QDR.P04.installed.*). Counts stay "—" and
 *  the data area names the not-wired extension store — "no provider" is never rendered as an
 *  empty list ("暂无已安装…"), because those words claim a working store that does not exist. */
const EXTENSION_KINDS = ['插件', '技能', '连接器', '智能体'] as const
type ExtensionKind = (typeof EXTENSION_KINDS)[number]
const EXTENSION_ADD_MENUS: Partial<Record<ExtensionKind, { readonly trigger: string; readonly items: readonly [readonly [string, string], readonly [string, string]] }>> = {
  插件: {
    trigger: '添加插件',
    items: [
      ['通过 Qoder 创建', '在新任务中创建个性化 Plugin，并保存在本地使用。'],
      ['上传 Plugin', '导入 Plugin ZIP，仅安装到本机。'],
    ],
  },
  技能: {
    trigger: '添加技能',
    items: [
      ['通过 Qoder 创建', '在新任务中创建个性化 Skill，并保存在本地使用。'],
      ['上传 Skill', '导入 ZIP 或 SKILL.md，仅安装到本机。'],
    ],
  },
}
const EXTENSION_ADD_NOTE = '创建/上传尚未接通：扩展安装治理链未建立；不会创建或安装。'

/** ADR-0306 + Loop-Q R11 line A: the extension-management page. ADR-0306's add-custom-MCP entry
 *  and form are preserved inside the connector tab; the form is a local unsaved draft (see
 *  mcp-form.tsx). The market button switches to the observed market shell (see
 *  extensions-market.tsx); 刷新 is local only — no provider is polled, no text changes. */
export function ExtensionsPage(): ReactNode {
  const [kind, setKind] = useState<ExtensionKind>('插件')
  const [market, setMarket] = useState(false)
  const [adding, setAdding] = useState(false)
  const [query, setQuery] = useState('')
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [addNote, setAddNote] = useState('')
  const setMarketKind = (next: ExtensionKind) => { setKind(next); setAdding(false); setAddMenuOpen(false); setAddNote('') }
  if (market) {
    return <section className="extensions-page" aria-label="扩展市场">
      <ExtensionsMarketView kind={kind === '智能体' ? '插件' : kind} onKind={setMarketKind}
        onBack={() => setMarket(false)} />
    </section>
  }
  return <section className="extensions-page" aria-label="扩展管理">
    <h1>扩展管理</h1>
    <p className="page-note">管理本机已安装的插件、技能、连接器和智能体。</p>
    <div className="page-tools" aria-label="已安装工具">
      <button type="button" className="text-button" aria-label="市场" onClick={() => setMarket(true)}>市场</button>
      <button type="button" className="text-button" aria-label="刷新已安装项"
        onClick={() => setAddNote('刷新尚未接通：扩展服务未建立；未取得任何读数。')}>刷新</button>
      <input aria-label="搜索已安装项" placeholder="搜索已安装项" value={query}
        onChange={(event) => setQuery(event.target.value)} />
    </div>
    <div className="page-tabs" role="tablist" aria-label="扩展类型">
      {EXTENSION_KINDS.map((label) => <button key={label} type="button" role="tab" aria-label={label}
        aria-selected={kind === label} className={kind === label ? 'active' : ''}
        onClick={() => { setKind(label); setAdding(false); setAddMenuOpen(false); setAddNote('') }}>{label}
        <span className="extensions-count">—</span></button>)}
    </div>
    {(EXTENSION_ADD_MENUS[kind] !== undefined) && <div className="page-tools" aria-label={`${kind}添加工具`}>
      <div className="relative">
        <button type="button" className="text-button" aria-label={EXTENSION_ADD_MENUS[kind]!.trigger}
          aria-haspopup="menu" aria-expanded={addMenuOpen} onClick={() => setAddMenuOpen(value => !value)}>添加</button>
        {addMenuOpen
          ? <div className="small-menu extensions-add-menu" role="menu" aria-label={`${kind}添加菜单`}>
            {EXTENSION_ADD_MENUS[kind]!.items.map(([label, hint]) => <button key={label} type="button"
              role="menuitem" aria-label={`${kind}添加 ${label}`} onClick={() => setAddNote(EXTENSION_ADD_NOTE)}>
              <strong>{label}</strong><small>{hint}</small>
            </button>)}
          </div>
          : null}
      </div>
    </div>}
    {kind === '连接器' && <div className="page-tools" aria-label="连接器添加工具">
      <button type="button" className="text-button" aria-label="添加 MCP" onClick={() => setAdding(true)}>添加 MCP</button>
    </div>}
    {addNote !== '' && <p className="extensions-note" role="status">{addNote}</p>}
    <div className="extensions-empty" role="status">扩展服务未接通（extensions-store-unavailable）</div>
    {kind === '连接器' && adding
      ? <McpForm onClose={() => setAdding(false)} />
      : null}
  </section>
}

function MonitorPage({ state, session, artifacts, plans, navigate }: {
  readonly state: DesktopReadState
  readonly session?: DesktopSession
  readonly artifacts?: DesktopArtifacts
  readonly plans?: DesktopPlans | null
  readonly navigate: (page: Page) => void
}): ReactNode {
  const monitor = state.kind === 'read' ? state.monitor : undefined
  const stepsLabel = monitor === undefined || monitor.steps.state === 'unavailable'
    ? '步骤：不可读（' + (monitor?.steps.reason ?? 'monitor-not-read') + '）'
    : monitor.steps.state === 'running' ? '步骤：执行中' : '步骤：空闲'
  const turnProcess = session?.turnProcess
  const updated = turnProcess !== undefined && turnProcess.endedAt !== null
    ? new Date(turnProcess.endedAt).toLocaleString('zh-CN', { hour12: false })
    : null
  // The roster's copy speaks about accepted plans — drafts are counted, never readiness-judged.
  const acceptedPlans = plans !== undefined && plans !== null ? plans.plans.filter((plan) => plan.state === 'accepted') : []
  const draftPlans = plans !== undefined && plans !== null ? plans.plans.length - acceptedPlans.length : 0
  return <section className="monitor-page" aria-label="任务监控">
    <h1>任务监控</h1>
    <div className="monitor-axes">
      <p className="monitor-axis" data-monitor-step={monitor?.steps.state ?? 'unavailable'}>{stepsLabel}</p>
      {(monitor?.axes ?? []).map((axis) => <p className="monitor-axis" key={axis.name}>
        {axis.name}：{axis.state === 'unknown' ? `未知（${axis.reason}）` : `${axis.state}（${axis.reason}）`}
      </p>)}
    </div>
    {plans !== undefined && plans !== null
      ? <section className="plans-roster" aria-label="计划步骤">
        <strong>计划步骤</strong>
        {plans.state !== 'read'
          ? <p className="monitor-empty">计划读取不可用——不据此断言无计划。</p>
          : acceptedPlans.length === 0
            ? <p className="monitor-empty">暂无已接受计划的步骤可供核验。</p>
            : acceptedPlans.map((plan) => <div className="plan-roster" key={plan.planId}>
              <p className="plan-roster-title">{plan.title}</p>
              <ul>{plan.steps.map((step) => <li key={step.stepNo} data-step-readiness={step.readiness}>
                <span>{step.stepNo}. {step.title}</span>
                <span className="plan-step-readiness">{step.readiness === 'ready' ? '就绪' : step.readiness === 'not-ready' ? '未就绪（阻断——不派发）' : '未知（阻断——不派发）'}</span>
                <small>{step.readinessNote}</small>
              </li>)}</ul>
            </div>)}
        {plans.state === 'read' && draftPlans > 0
          ? <p className="monitor-empty">另有 {draftPlans} 个未接受草稿计划（不判读步骤）。</p>
          : null}
      </section>
      : null}
    {session === undefined || session.lastTurnEnd === null
      ? <p className="monitor-empty">尚无已结束的回合可供回顾。</p>
      : <article className="review-card" aria-label="本轮回顾">
        <header className="review-card-header">
          <strong>本轮回顾</strong>
          <span className="review-updated">{updated === null ? '更新时间未知' : `更新于 ${updated}`}</span>
        </header>
        <TurnProcessFooter lastTurnEnd={session.lastTurnEnd} turnProcess={turnProcess ?? { durationMs: null, endedAt: null, iterations: null, fileWrites: [] }} />
        <div className="review-outputs">
          <strong>产出</strong>
          {artifacts !== undefined && artifacts.cards.length > 0
            ? <ul>{artifacts.cards.map((card) => <li key={card.artifactId}>{card.name}</li>)}</ul>
            : <span>暂无观察到产出。</span>}
        </div>
        <div className="review-sources">
          <strong>来源</strong>
          <span>来源读数未接通。</span>
        </div>
        <details className="review-more">
          <summary>更多操作</summary>
          <div className="review-more-body">
            <button className="text-button" aria-label="返回任务输入" onClick={() => navigate('新任务')}>返回任务输入</button>
          </div>
        </details>
      </article>}
  </section>
}

function SearchPage({ navigate }: { readonly navigate: (page: Page) => void }): ReactNode {
  const [query, setQuery] = useState('')
  const [outcome, setOutcome] = useState<DesktopSearchOutcome | undefined>(undefined)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const composing = useRef(false)
  const submit = () => {
    if (busy) return
    if (query.trim() === '') { setOutcome(undefined); setNotice('请输入查询内容。'); return }
    setOutcome(undefined)
    setNotice('')
    setBusy(true)
    void searchDesktop(query).then(result => { setOutcome(result); setBusy(false) })
  }
  return <section className="welcome-content search-page" aria-label="搜索">
    <h1>搜索</h1>
    <div className="search-form">
      <textarea aria-label="搜索查询" placeholder="输入查询内容…" rows={2} value={query}
        onChange={event => setQuery(event.target.value)}
        onCompositionStart={() => { composing.current = true }} onCompositionEnd={() => { composing.current = false }}
        onKeyDown={event => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && !composing.current && event.keyCode !== 229) {
            event.preventDefault(); submit()
          }
        }} />
      <button className="text-button" aria-label="执行搜索" disabled={busy} onClick={submit}>执行搜索</button>
    </div>
    {notice !== '' && <p className="search-note" role="status">{notice}</p>}
    {outcome !== undefined && <SearchResult outcome={outcome} />}
    <button className="text-button" onClick={() => navigate('新任务')}>返回任务输入</button>
  </section>
}

// Loop-Q R9 (OBS02/OBS03): the knowledge-centre and sites page shells. No knowledge-store,
// Repo Wiki or sites provider exists yet, so the data area shows the named not-wired reason and
// never an empty-list phrase — "no provider" is not "empty list". The tabs, view toggles and the
// search input structure the page only; nothing here posts, creates or generates.
function notWiredNote(slot: DesktopReadoutKnowledge | undefined, fallbackReason: string): ReactNode {
  const reason = slot !== undefined && slot.state === 'not-wired' ? slot.reason : fallbackReason
  return <p className="page-note" role="status">{`知识库服务未接通（${reason}）`}</p>
}

export interface KnowledgeWorkspaceOption {
  readonly workspaceId: string
  readonly title: string
}

/** ADR-0308: the create-knowledge dialog (observed shape only) — the create action answers the
 *  honest T12 refusal; nothing is created. The workspace menu uses the real workspace titles. */
function CreateKnowledgeDialog({ workspaces, onClose }: {
  readonly workspaces: readonly KnowledgeWorkspaceOption[]
  readonly onClose: () => void
}): ReactNode {
  const [name, setName] = useState('')
  const [scope, setScope] = useState<'user' | 'workspace'>('user')
  const [selected, setSelected] = useState<readonly string[]>([])
  const [menuOpen, setMenuOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const canCreate = name.trim() !== '' && (scope === 'user' || selected.length > 0)
  return <div className="knowledge-dialog" role="dialog" aria-label="创建知识库">
    <header className="knowledge-dialog-header">
      <strong>创建知识库</strong>
      <button type="button" className="icon-button" aria-label="关闭" onClick={onClose}>✕</button>
    </header>
    <label className="mcp-field">名称
      <input aria-label="知识库名称" placeholder="例如：工程手册" maxLength={50} value={name}
        onChange={(event) => setName(event.target.value)} />
    </label>
    <p className="page-note">{name.length}/50</p>
    <fieldset className="knowledge-scope" aria-label="生效范围">
      <label><input type="radio" name="knowledge-scope" aria-label="用户" checked={scope === 'user'}
        onChange={() => setScope('user')} />用户</label>
      <label><input type="radio" name="knowledge-scope" aria-label="工作区" checked={scope === 'workspace'}
        onChange={() => setScope('workspace')} />工作区</label>
    </fieldset>
    {scope === 'user'
      ? <p className="page-note">当前用户的所有现有及未来工作区均可使用此知识库。</p>
      : <div className="knowledge-workspace-scope">
        <button type="button" className="text-button" aria-label="选择工作区" aria-expanded={menuOpen}
          onClick={() => setMenuOpen(value => !value)}>选择工作区</button>
        {menuOpen
          ? <div className="small-menu knowledge-workspace-menu" role="menu" aria-label="工作区列表"
            onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setMenuOpen(false) } }}>
            {workspaces.length === 0
              ? <p className="page-note">暂无工作区</p>
              : workspaces.map((workspace) => <button key={workspace.workspaceId} type="button" role="menuitemcheckbox"
                aria-label={`工作区选项 ${workspace.title}`} aria-checked={selected.includes(workspace.workspaceId)}
                onClick={() => setSelected(selected.includes(workspace.workspaceId)
                  ? selected.filter((id) => id !== workspace.workspaceId)
                  : [...selected, workspace.workspaceId])}>{workspace.title}</button>)}
          </div>
          : null}
        <p className="page-note">至少选择一个可以使用此知识库的工作区。</p>
        {selected.length > 0
          ? <div className="knowledge-chips" aria-label="已选工作区">
            {selected.map((id) => <span className="knowledge-chip" key={id}>
              {workspaces.find((workspace) => workspace.workspaceId === id)?.title ?? id}
            </span>)}
          </div>
          : null}
      </div>}
    {notice !== '' ? <p className="page-note knowledge-dialog-notice" role="status">{notice}</p> : null}
    <footer className="mcp-form-footer">
      <button type="button" className="text-button" aria-label="取消" onClick={onClose}>取消</button>
      <button type="button" className="send-button" aria-label="创建" disabled={!canCreate}
        onClick={() => setNotice('创建尚未接通：知识库存储 provider 未建立；不会创建。')}>创建</button>
    </footer>
  </div>
}

export function KnowledgePage({ readoutKnowledge, workspaces = [] }: {
  readonly readoutKnowledge?: DesktopReadoutKnowledge
  readonly workspaces?: readonly KnowledgeWorkspaceOption[]
}): ReactNode {
  const [view, setView] = useState<'知识库' | 'Repo Wiki'>('知识库')
  const [layout, setLayout] = useState<'卡片' | '列表'>('卡片')
  const [wikiFilter, setWikiFilter] = useState<'全部' | '已生成' | '未生成'>('全部')
  const [wikiQuery, setWikiQuery] = useState('')
  const [wikiLayout, setWikiLayout] = useState<'卡片' | '列表'>('卡片')
  const [filterOpen, setFilterOpen] = useState(false)
  const [filter, setFilter] = useState<string>('全部工作区')
  const [creating, setCreating] = useState(false)
  return <section className="knowledge-page" aria-label="知识中心">
    <h1>知识中心</h1>
    <div className="page-tabs" role="tablist" aria-label="知识视图">
      <button type="button" role="tab" aria-label="知识库" aria-selected={view === '知识库'} className={view === '知识库' ? 'active' : ''}
        onClick={() => setView('知识库')}>知识库</button>
      <button type="button" role="tab" aria-label="Repo Wiki" aria-selected={view === 'Repo Wiki'} className={view === 'Repo Wiki' ? 'active' : ''}
        onClick={() => setView('Repo Wiki')}>Repo Wiki</button>
    </div>
    {view === '知识库'
      ? <>
        <div className="page-tools" aria-label="知识库工具">
          <button type="button" className="text-button" aria-label="全部工作区" aria-expanded={filterOpen}
            onClick={() => setFilterOpen(value => !value)}>{filter}</button>
          <button type="button" className="text-button" aria-label="创建知识库" onClick={() => setCreating(true)}>创建知识库</button>
          {(['卡片', '列表'] as const).map(label => <button key={label} type="button" aria-pressed={layout === label}
            className={layout === label ? 'active' : ''} onClick={() => setLayout(label)}>{label}</button>)}
        </div>
        {filterOpen
          ? <div className="small-menu" role="menu" aria-label="工作区筛选">
            {['全部工作区', ...workspaces.map((workspace) => workspace.title)].map((label) => <button
              key={label} type="button" role="menuitemradio" aria-checked={filter === label}
              onClick={() => { setFilter(label); setFilterOpen(false) }}>{label}</button>)}
          </div>
          : null}
        {notWiredNote(readoutKnowledge, 'knowledge-store-unavailable')}
        {creating ? <CreateKnowledgeDialog workspaces={workspaces} onClose={() => setCreating(false)} /> : null}
      </>
      : <>
        <p className="page-note">将代码转化为 Repo Wiki／涵盖技术栈与架构。</p>
        <div className="page-tools" aria-label="Repo Wiki 筛选">
          {(['全部', '已生成', '未生成'] as const).map(label => <button key={label} type="button" aria-pressed={wikiFilter === label}
            className={wikiFilter === label ? 'active' : ''} onClick={() => setWikiFilter(label)}>{label}</button>)}
          <input aria-label="搜索 Repo Wiki 项目" placeholder="搜索项目" value={wikiQuery}
            onChange={(event) => setWikiQuery(event.target.value)} />
          <div className="page-tools" aria-label="Repo Wiki 视图切换">
            {(['卡片', '列表'] as const).map(label => <button key={label} type="button" aria-pressed={wikiLayout === label}
              className={wikiLayout === label ? 'active' : ''} onClick={() => setWikiLayout(label)}>{label}</button>)}
          </div>
        </div>
        {notWiredNote(readoutKnowledge, 'knowledge-store-unavailable')}
      </>}
  </section>
}

export function SitesPage(): ReactNode {
  const [view, setView] = useState<'我的站点' | '共享给我的'>('我的站点')
  return <section className="sites-page" aria-label="站点">
    <h1>站点</h1>
    <div className="page-tabs" role="tablist" aria-label="站点视图">
      <button type="button" role="tab" aria-label="我的站点" aria-selected={view === '我的站点'} className={view === '我的站点' ? 'active' : ''}
        onClick={() => setView('我的站点')}>我的站点</button>
      <button type="button" role="tab" aria-label="共享给我的" aria-selected={view === '共享给我的'} className={view === '共享给我的' ? 'active' : ''}
        onClick={() => setView('共享给我的')}>共享给我的</button>
    </div>
    <p className="page-note" role="status">站点服务未接通（sites-store-unavailable）</p>
  </section>
}

type WorkspaceSummaryCard = { readonly bound: true; readonly title: string; readonly path: string } | { readonly bound: false }

// T03: the home card shows the real bound workspace only when the read itself proves every step:
// an active context, a read link state carrying a default link for that matter, and that workspace
// present in the list. Any other shape keeps the honest "not yet read" wording — no inference.
function workspaceSummaryOf(state: DesktopReadState): WorkspaceSummaryCard {
  if (state.kind !== 'read') return { bound: false }
  const { activeContext, matterLinks, workspaces } = state
  if (activeContext?.state !== 'active' || matterLinks?.state !== 'read' || workspaces?.state !== 'read') return { bound: false }
  const link = matterLinks.links.find(item => item.matterRef === activeContext.matterId && item.isDefault)
  if (link === undefined || link.workspaceRef !== activeContext.workspaceRef) return { bound: false }
  const entry = workspaces.entries.find(item => item.workspaceId === activeContext.workspaceRef)
  return entry === undefined ? { bound: false } : { bound: true, title: entry.title, path: entry.path }
}

export interface DesktopAccountState {
  readonly read: DesktopBootstrapRead | { readonly kind: 'loading' }
  readonly busy: boolean
  readonly onAction: (action: 'login' | 'logout') => Promise<void>
  readonly onRefresh: () => Promise<void>
}

// Sanbao Controls.tsx:199–234 account menu: structure only — the status and the two auth acts
// come from the local-system bootstrap read; login fires only from the explicit menu click.
// ADR-0305: the quick appearance submenu (OBS04) — the same controller the settings page uses.
// The four observed entries map to theme (明暗模式), language, fontStyle and contentWidth; the
// theme palettes / text size / ui scale stay N/A by ADR-0283 and are deliberately absent.
const QUICK_APPEARANCE_FIELDS = [
  { key: 'theme', label: '明暗模式' },
  { key: 'language', label: '语言' },
  { key: 'fontStyle', label: '字体风格' },
  { key: 'contentWidth', label: '内容宽度' },
] as const

function AccountEntry({ account, navigate, preferences }: { readonly account: DesktopAccountState, readonly navigate: (page: Page) => void, readonly preferences: DevicePreferencesController }): ReactNode {
  const [open, setOpen] = useState(false)
  const [appearanceOpen, setAppearanceOpen] = useState(false)
  const [preferenceState, setPreferenceState] = useState(() => preferences.snapshot())
  useEffect(() => preferences.subscribe(setPreferenceState), [preferences])
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
    const items = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ?? [])
    if (!items.length) return
    event.preventDefault()
    const index = items.findIndex(item => item === document.activeElement)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
      : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
    items[next]?.focus()
  }
  const identity = account.read.kind === 'read'
    ? ({ 'signed-in': '已登录', 'signed-out': '未登录', pending: '登录中' } as const)[account.read.state.auth]
    : '身份状态未知'
  const runtime = account.read.kind === 'read'
    ? ({ ready: '已连接', recovering: '恢复中', unavailable: '不可用' } as const)[account.read.state.runtime]
    : null
  return <div className="account-root" ref={root} onKeyDown={open ? keys : undefined}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}>
    <button className="account-row" ref={opener} aria-label="账号与设置" aria-haspopup="menu"
      aria-expanded={open} aria-controls={open ? 'sage-account-menu' : undefined}
      onClick={() => { if (open) close(); else setOpen(true) }}>
      <span className="avatar" aria-hidden="true">?</span><span><strong>账号与设置</strong><small>{identity}</small></span><Icon name="settings" size={15} />
    </button>
    {open && <div className="small-menu account-menu" id="sage-account-menu" ref={menu} role="menu" aria-label="账号菜单">
      <p className="account-menu-status">身份：{identity}{runtime === null ? '' : ` · 运行时：${runtime}`}</p>
      {account.read.kind === 'read' && account.read.state.auth === 'signed-out' && <button type="button" role="menuitem" aria-label="登录"
        disabled={account.busy} onClick={() => { void account.onAction('login') }}>登录</button>}
      {account.read.kind === 'read' && account.read.state.auth === 'signed-in' && <button type="button" role="menuitem" aria-label="退出登录"
        disabled={account.busy} onClick={() => { void account.onAction('logout') }}>退出登录</button>}
      {account.read.kind !== 'read' && <button type="button" role="menuitem" aria-label="重新读取账号状态"
        disabled={account.busy} onClick={() => { void account.onRefresh() }}>重新读取账号状态</button>}
      <button type="button" role="menuitem" aria-label="外观" aria-haspopup="menu" aria-expanded={appearanceOpen}
        onClick={() => setAppearanceOpen(value => !value)}>外观</button>
      {appearanceOpen && <div className="small-menu appearance-menu" role="menu" aria-label="快捷外观">
        {preferenceState.read.kind !== 'read'
          ? <p className="appearance-note">偏好不可读（{preferenceState.read.code ?? 'device-preferences-unavailable'}）</p>
          : QUICK_APPEARANCE_FIELDS.map((field) => <label key={field.key} className="appearance-field">
            {field.label}
            <select
              aria-label={field.label}
              value={preferenceState.read.kind === 'read' ? preferenceState.read.value.requested[field.key] : ''}
              disabled={preferenceState.saving}
              onChange={(event) => { void preferences.save({ [field.key]: event.target.value } as DevicePreferencePatch) }}
            >
              {(DEVICE_PREFERENCE_OPTIONS[field.key] as readonly string[]).map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>)}
      </div>}
      <button type="button" role="menuitem" aria-label="账号与设置页" onClick={() => { close(); navigate('账号与设置') }}>账号与设置</button>
    </div>}
  </div>
}

function Sidebar({ page, navigate, account, preferences }: { readonly page: Page; readonly navigate: (page: Page) => void; readonly account: DesktopAccountState; readonly preferences: DevicePreferencesController }): ReactNode {
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
        <AccountEntry account={account} navigate={navigate} preferences={preferences} />
      </div>
    </nav>
  </aside>
}

function HomeContent({ navigate, suggest, workspace }: { readonly navigate: (page: Page) => void; readonly suggest: (text: string) => void; readonly workspace: WorkspaceSummaryCard }): ReactNode {
  const [tab, setTab] = useState<'会话' | 'Credits'>('会话')
  return <div className="welcome-content">
    <div className="welcome-heading"><div><h1>不止于编程</h1><p>你好，欢迎来到 Sage。</p></div><TreeStamp /></div>
    <div className="workspace-summary" aria-label={workspace.bound ? '当前绑定的workspace' : '工作区状态未知'}>
      <span className="workspace-mark"><Icon name="folder" size={14} /></span>
      {workspace.bound
        ? <><div><strong>{workspace.title}</strong><span>{workspace.path}</span></div><small>已绑定</small></>
        : <><div><strong>工作区待接入</strong><span>绑定状态未知</span></div><small>尚未读取</small></>}
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

/** ADR-0311: the observed file-candidates submenu state (O02.files.menu.open). */
type FilesMenuState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'read'; readonly entries: readonly DesktopFileCandidate[]; readonly truncated: boolean }
  | { readonly kind: 'refused'; readonly code: string }

function ContextMenu({ notice, workspaceRoot }: {
  readonly notice: (message: string) => void
  readonly workspaceRoot?: string
}): ReactNode {
  const [open, setOpen] = useState(false)
  // ADR-0311: the 工作区文件 submenu — real candidates from the T03 route. The local substring
  // filter is an inference of this implementation: the observation verified NO filtering
  // behavior at all (neither server-side nor local); it is registered as such in the blockers.
  const [filesOpen, setFilesOpen] = useState(false)
  const [filesQuery, setFilesQuery] = useState('')
  const [files, setFiles] = useState<FilesMenuState>({ kind: 'idle' })
  const filesItem = useRef<HTMLButtonElement>(null)
  const filesInput = useRef<HTMLInputElement>(null)
  const filesEpoch = useRef(0)
  const root = useRef<HTMLDivElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const opener = useRef<HTMLButtonElement>(null)
  // Every close path goes through the same reset: a stale submenu must never resurface on reopen.
  const resetSubmenu = () => { setFilesOpen(false); setFilesQuery(''); setFiles({ kind: 'idle' }); filesEpoch.current += 1 }
  const close = () => { setOpen(false); resetSubmenu(); opener.current?.focus() }
  const openFilesMenu = () => {
    if (workspaceRoot === undefined) return
    setFilesOpen(true)
    setFilesQuery('')
    setFiles({ kind: 'loading' })
    const epoch = ++filesEpoch.current
    void listDesktopFileCandidates(workspaceRoot, '').then((result) => {
      // A slower earlier open must never overwrite a newer one's result.
      if (epoch !== filesEpoch.current) return
      setFiles(result.state === 'read'
        ? { kind: 'read', entries: result.entries, truncated: result.truncated }
        : { kind: 'refused', code: result.code })
    })
  }
  const backToRoot = () => { resetSubmenu(); filesItem.current?.focus() }
  useEffect(() => {
    if (filesOpen) filesInput.current?.focus()
  }, [filesOpen])
  useEffect(() => {
    if (!open) return
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) { setOpen(false); resetSubmenu() }
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])
  const keys = (event: KeyboardEvent) => {
    if (event.nativeEvent.isComposing) return
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return }
    // While the file submenu is open the root item cycling stays quiet; Left returns to the root.
    if (filesOpen) {
      if (event.key === 'ArrowLeft') { event.preventDefault(); event.stopPropagation(); backToRoot() }
      return
    }
    // Observed exit, second half: Left at the context root returns to the input entry.
    if (event.key === 'ArrowLeft') { event.preventDefault(); event.stopPropagation(); close(); return }
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
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) { setOpen(false); resetSubmenu() } }}>
    <button className="icon-button" aria-label="添加上下文" aria-haspopup="menu" aria-expanded={open}
      aria-controls={open ? 'desktop-context-menu' : undefined} ref={opener}
      onClick={() => { if (open) close(); else setOpen(true) }}><Icon name="plus" /></button>
    {open && <div className={`small-menu context-menu${filesOpen ? ' files-open' : ''}`} id="desktop-context-menu" ref={menu} role="menu" aria-label="上下文类型">
      {contextItems.map(item => item.label === '工作区文件' && workspaceRoot !== undefined
        ? <div key={item.label} className="context-files">
          <button type="button" role="menuitem" ref={filesItem} aria-label="工作区文件" aria-haspopup="menu"
            aria-expanded={filesOpen} className={filesOpen ? 'active' : ''}
            onClick={() => { if (filesOpen) backToRoot(); else openFilesMenu() }}>
            <span className="composer-context-item"><Icon name={item.icon} size={14} />{item.label}</span>
          </button>
          {filesOpen && <div className="small-menu context-files-menu" aria-label="工作区文件">
            <input ref={filesInput} className="context-files-search" aria-label="搜索工作区文件"
              placeholder="搜索工作区文件" value={filesQuery} aria-controls="context-files-rows"
              onChange={(event) => setFilesQuery(event.target.value)}
              onKeyDown={(event) => {
                // Left always stays out of the root handler: with an empty query it means "back
                // to the root", with a query it keeps its native caret move.
                if (event.key === 'ArrowLeft') { event.stopPropagation(); if (filesQuery === '') { event.preventDefault(); backToRoot() } }
              }} />
            {files.kind === 'loading' ? <p className="context-files-note" role="status">正在读取文件候选……</p> : null}
            {files.kind === 'refused'
              ? <p className="context-files-note" role="status">文件候选未接通（{files.code}）</p>
              : null}
            {files.kind === 'read'
              ? (() => {
                const query = filesQuery.trim().toLowerCase()
                const rows = query === '' ? files.entries : files.entries.filter((entry) => entry.name.toLowerCase().includes(query))
                return <>
                  {rows.length === 0
                    ? <p className="context-files-note" role="status">没有匹配的文件</p>
                    : <div id="context-files-rows" role="menu" aria-label="文件候选">
                      {rows.map((entry) => <button type="button" role="menuitem" key={entry.path} aria-label={`选择文件 ${entry.name}`}
                        onClick={() => { notice('选择文件作为上下文尚未接通；未附加任何内容，草稿已保留。') }}>
                        <span className="composer-context-item"><Icon name="file" size={14} />{entry.name}</span>
                      </button>)}
                    </div>}
                  {files.truncated ? <p className="context-files-note">仅显示前 {files.entries.length} 项。</p> : null}
                </>
              })()
              : null}
          </div>}
        </div>
        : <button type="button" role="menuitem" key={item.label} aria-label={`${item.label}：不可用`}
          onClick={() => { notice(`${item.label}尚未接通，当前不可用；未添加上下文，草稿已保留。`); close() }}>
          <span className="composer-context-item"><Icon name={item.icon} size={14} />{item.label}</span><small>不可用</small>
        </button>)}
    </div>}
  </div>
}

function Composer({ draft, changeDraft, notice, setNotice, navigate, busy, uncertain, hasSession, executing, paused, contextUsage, workspaceRoot, onAction }: {
  readonly draft: string; readonly changeDraft: (text: string) => void
  readonly notice: string; readonly setNotice: (text: string) => void; readonly navigate: (page: Page) => void
  readonly busy: boolean; readonly uncertain: boolean; readonly hasSession: boolean
  readonly executing: boolean; readonly paused: boolean
  readonly contextUsage: { readonly pressureTokens: number | null, readonly contextWindow: number | null } | null
  readonly workspaceRoot: string | undefined
  readonly onAction: (kind: 'send' | 'stop' | 'resume') => Promise<void>
}): ReactNode {
  const composing = useRef(false)
  const draftBytes = new TextEncoder().encode(draft).length
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
        <ContextMenu notice={setNotice} {...(workspaceRoot === undefined ? {} : { workspaceRoot })} />
        <button className="text-button" aria-label="模型状态未知" onClick={() => navigate('模型')}>模型未知 <Icon name="down" size={12} /></button>
      </div>
        {executing && <button className="text-button" aria-label="停止生成" disabled={busy || uncertain} onClick={() => { void onAction('stop') }}>停止生成</button>}
        {paused && <button className="text-button" aria-label="继续会话" disabled={busy || uncertain} onClick={() => { void onAction('resume') }}>继续会话</button>}
        <button className="send-button" aria-label="发送任务" disabled={!draft.trim() || busy || uncertain} onClick={submit}><Icon name="arrow" size={18} /></button>
      </div>
      <div className="composer-context">
        <button onClick={() => navigate('工作区')}><Icon name="folder" size={13} />工作区待接入 <Icon name="down" size={11} /></button>
        <button aria-label="运行模式" onClick={() => navigate('运行模式')}><Icon name="monitor" size={13} />运行模式未知</button>
      </div>
      {draftBytes > DRAFT_BYTE_NOTICE_AT && <p className="composer-byte-note" role="note">
        草稿当前 {draftBytes} 字节；发送请求总上限 4096 字节（含事项与工作区字段），超出会被本地拒绝，草稿保留。
      </p>}
      {notice && <p className="composer-local-note" role="status">{notice}</p>}
    </div>
    <p>
      {contextUsage !== null && contextUsage.pressureTokens !== null && contextUsage.contextWindow !== null
        ? <span className="context-usage" title={`${contextUsage.pressureTokens} / ${contextUsage.contextWindow} tokens`}>上下文 {Math.round((contextUsage.pressureTokens / contextUsage.contextWindow) * 100)}%</span>
        : null}
      {uncertain ? '结果未知 · 重新读取不代表允许重发' : hasSession ? '操作结果以服务回执和会话记录为准' : '思考、创作、执行，都从这里开始 · 发送尚未接通'}
    </p>
  </div>
}

export function DesktopPage({
  readState = readDesktopState,
  readBootstrap = readDesktopBootstrapState,
  preferencesController: suppliedPreferencesController,
}: {
  readonly readState?: () => Promise<DesktopRead>
  readonly readBootstrap?: () => Promise<DesktopBootstrapRead>
  readonly preferencesController?: DevicePreferencesController
}): ReactNode {
  const [page, setPage] = useState<Page>('新任务')
  const [preferencesController] = useState(() => suppliedPreferencesController ?? createDevicePreferencesController())
  const { state, session, draft, changeDraft, notice, setNotice, busy, uncertain, streamingText, refreshNow, retry, withdraw, actOnSession } = useDesktopSession(readState)
  // ADR-0300: one action path for the artifact rail — the route answers, then the projection
  // is re-read; a refusal leaves the surface as-is (the card state still tells the truth).
  const runArtifactAction = (action: () => Promise<boolean>) => { void action().then(() => refreshNow()) }
  // ADR-0313: one session-control path — the route answers, the panel shows the outcome verbatim,
  // and every answer (recorded or refused) pulls the fresh projection so the lists reflect the
  // authoritative fold (a consumed item vanishes even when its own edit was refused).
  const runSessionControl = (action: () => Promise<SessionControlResult>): Promise<SessionControlResult> =>
    action().then((result) => { refreshNow(); return result })
  const [accountRead, setAccountRead] = useState<DesktopBootstrapRead | { readonly kind: 'loading' }>({ kind: 'loading' })
  const [accountBusy, setAccountBusy] = useState(false)
  const refreshAccount = async () => {
    setAccountRead({ kind: 'loading' })
    const next = await readBootstrap().catch((): DesktopBootstrapRead => ({ kind: 'unavailable', code: null }))
    setAccountRead(next)
  }
  useEffect(() => { void refreshAccount() }, [readBootstrap])
  // Display facts apply to the whole desktop, not only the Settings route. Reading at mount keeps
  // root theme/density tokens authoritative even when Settings has not been opened yet.
  useEffect(() => { void preferencesController.refresh() }, [preferencesController])
  // The two auth acts fire only from an explicit menu click. Login never changes what the
  // desktop already shows until the bootstrap re-read says so; logout withdraws immediately.
  const actOnAccount = async (action: 'login' | 'logout') => {
    if (accountBusy) return
    setAccountBusy(true)
    try {
      const response = await fetch(action === 'login' ? SAGE_LOGIN_PATH : SAGE_LOGOUT_PATH, {
        method: action === 'login' ? 'GET' : 'POST',
        cache: 'no-store',
        signal: AbortSignal.timeout(SAGE_REQUEST_TIMEOUT_MS),
      })
      const receipt: unknown = await response.json().catch(() => undefined)
      if (action === 'login') {
        setNotice(response.ok
          ? '登录请求已发出；完成情况以服务回执与系统浏览器为准。'
          : `登录未受理（${receiptCode(receipt) ?? 'unknown'}）；本地状态未改变。`)
      } else if (response.ok && receipt !== null && typeof receipt === 'object'
        && (receipt as { readonly auth?: unknown }).auth === 'signed-out') {
        setNotice('已退出登录；本地状态已撤回。')
        withdraw()
      } else {
        setNotice('退出未确认；状态以重新读取为准。')
      }
    } catch {
      setNotice('账号操作未能送达服务，本地状态未改变。')
    } finally {
      setAccountBusy(false)
      void refreshAccount()
    }
  }
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
    <Sidebar page={page} navigate={navigate} account={{ read: accountRead, busy: accountBusy, onAction: actOnAccount, onRefresh: refreshAccount }} preferences={preferencesController} />
    <main className="product-surface" aria-label="Sage 桌面">
      <div className="home-page"><div className="home-top"><span />
        <button className="text-button" onClick={() => navigate('移动端')}><Icon name="monitor" size={15} />下载移动端 <Icon name="chevron" size={12} /></button>
      </div>
        <ReadStatus state={state} retry={retry} busy={busy} />
        {page === '新任务'
          ? (session === undefined ? <HomeContent navigate={navigate} suggest={suggest} workspace={workspaceSummaryOf(state)} />
            : <DesktopSessionView title={session.title} execution={session.execution} lastTurnEnd={session.lastTurnEnd}
              paused={session.paused} streamBroken={session.streamBroken} messages={session.messages}
              streaming={streamingText}
              turnProcess={session.turnProcess}
              approvals={session.approvals}
              modelQueue={session.modelQueue}
              pending={session.pending}
              queue={session.queue}
              terminal={session.terminal}
              toolResults={session.toolResults}
              sideChats={session.sideChats}
              onApprovalAnswer={(requestId, outcome) => runSessionControl(() => answerDesktopApproval(session.context.matterRef, requestId, outcome))}
              onApprovalWithdraw={(requestId) => runSessionControl(() => withdrawDesktopApproval(session.context.matterRef, requestId))}
              onPendingChange={(action) => runSessionControl(() => action.kind === 'edit' ? editPendingInput(action.itemId, action.text) : removePendingInput(action.itemId))}
              onQueueChange={(action) => runSessionControl(() => action.kind === 'edit' ? editQueueItem(action.itemId, action.text) : removeQueueItem(action.itemId))}
              onTerminalRead={(terminalId) => readDesktopTerminal(terminalId)}
              onVerifyQueue={() => refreshNow()}
              {...(state.kind === 'read' && state.artifacts !== undefined ? { artifacts: state.artifacts } : {})}
              onArtifactOpen={(artifactId) => runArtifactAction(() => openDesktopArtifact(artifactId))}
              onArtifactRetry={() => runArtifactAction(retryDesktopArtifact)}
              onArtifactClose={() => runArtifactAction(closeDesktopArtifact)}
              onArtifactFullscreen={(on) => runArtifactAction(() => setDesktopArtifactFullscreen(on))}
              onArtifactWindow={(action) => runArtifactAction(() => setDesktopArtifactWindow(action))} />)
          : page === '扩展'
            ? <ExtensionsPage />
          : page === '知识中心'
            ? <KnowledgePage
              {...(state.kind === 'read' && state.readoutKnowledge !== undefined ? { readoutKnowledge: state.readoutKnowledge } : {})}
              {...(state.kind === 'read' && state.workspaces !== undefined && state.workspaces.state === 'read'
                ? { workspaces: state.workspaces.entries.map((entry) => ({ workspaceId: entry.workspaceId, title: entry.title })) }
                : {})} />
          : page === '站点'
            ? <SitesPage />
          : page === '运行模式'
            ? <MonitorPage state={state}
              {...(session === undefined ? {} : { session })}
              plans={session?.plans ?? null}
              {...(state.kind === 'read' && state.artifacts !== undefined ? { artifacts: state.artifacts } : {})}
              navigate={navigate} />
          : page === '工作区'
            ? <WorkspacePage state={state} retry={retry} navigate={navigate} />
            : page === '搜索'
              ? <SearchPage navigate={navigate} />
              : page === '账号与设置'
                ? <DesktopSettingsView controller={preferencesController}
                  {...(state.kind === 'read' && state.settingsLeaves !== undefined ? { leaves: state.settingsLeaves } : {})} />
                : <section className="welcome-content outstanding-feature"><h1>{page}</h1><p>{outstanding[page]}</p>
                  <button className="text-button" onClick={() => navigate('新任务')}>返回任务输入</button></section>}
        <Composer draft={draft} changeDraft={changeDraft} notice={notice} setNotice={setNotice} navigate={navigate}
          busy={busy} uncertain={uncertain} hasSession={session !== undefined}
          executing={session?.execution === 'executing'} paused={session?.paused === true} contextUsage={session?.contextUsage ?? null} workspaceRoot={session?.context.workspaceRoot} onAction={actOnSession} />
      </div>
    </main>
  </div>
}
