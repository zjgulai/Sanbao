import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'

import type { DesktopSettingsLeaf } from './client.js'
import {
  DEVICE_PREFERENCE_KEYS,
  DEVICE_PREFERENCE_OPTIONS,
  createDevicePreferencesController,
  isDevicePreferenceValue,
  type DevicePreferenceKey,
  type DevicePreferenceValues,
  type DevicePreferencesController,
  type DevicePreferencesControllerSnapshot,
} from './device-preferences.js'
import {
  GENERAL_GROUPS,
  MODE_GROUPS,
  TASK_MONITOR_GROUPS,
  type SettingsObservedGroup,
} from './settings-observed.js'

export interface DesktopSettingsViewProps {
  /** Supplying the controller keeps tests and the eventual page glue on the same narrow seam. */
  readonly controller?: DevicePreferencesController
  /** ADR-0312: the eleven settings leaves (Ticket 046 machine). Absent = no leaf region. */
  readonly leaves?: readonly DesktopSettingsLeaf[]
  /** R17-A (wave 1): the real account facts and the one real account action (login/logout).
   *  Absent keeps the profile pane read-only — display-only consumers never get a dead control. */
  readonly account?: {
    readonly auth: 'signed-in' | 'signed-out' | 'pending'
    readonly busy: boolean
    readonly onAction: (action: 'login' | 'logout') => void | Promise<void>
  }
  /** R17-A: the observed 返回应用 navigation. Absent = no back control (display-only consumers). */
  readonly onBack?: () => void
}

const FIELD_LABELS: Readonly<Record<DevicePreferenceKey, string>> = {
  theme: '颜色模式',
  language: '语言',
  density: '界面密度',
  fontStyle: '字体风格',
  contentWidth: '内容宽度',
  terminalTheme: '终端主题',
  fileIcons: '文件图标',
  iconAppearance: '图标外观',
}

const FIELD_IDS: Readonly<Record<DevicePreferenceKey, string>> = {
  theme: 'theme',
  language: 'language',
  density: 'density',
  fontStyle: 'font-style',
  contentWidth: 'content-width',
  terminalTheme: 'terminal-theme',
  fileIcons: 'file-icons',
  iconAppearance: 'icon-appearance',
}

const OPTION_LABELS: Readonly<Record<string, string>> = {
  light: '浅色',
  dark: '深色',
  system: '跟随系统',
  zh: '中文',
  en: 'English',
  comfortable: '舒适',
  compact: '紧凑',
  sans: '无衬线',
  serif: '衬线',
  standard: '标准',
  wide: '宽',
  follow: '跟随应用',
  manual: '手动',
  product: 'Sage',
  material: 'Material',
}

function draftFrom(snapshot: DevicePreferencesControllerSnapshot): DevicePreferenceValues | null {
  return snapshot.read.kind === 'read' ? { ...snapshot.read.value.requested } : null
}

function statusText(snapshot: DevicePreferencesControllerSnapshot): string {
  if (snapshot.saving) return '正在保存；完成前不会把表单值当作设备权威值。'
  if (snapshot.lastSave === 'refused') {
    return snapshot.read.kind === 'read'
      ? '保存未确认；已回读并恢复为本设备的权威值。'
      : '保存未确认，且本设备权威值当前未核验。'
  }
  if (snapshot.read.kind !== 'read') return '本设备显示设置当前未核验。'
  const saved = snapshot.read.value.savedAt === null
    ? '本设备还没有成功保存过。'
    : `已保存到本设备：${snapshot.read.value.savedAt}`
  const effective = snapshot.read.value.effectiveTheme === null
    ? '系统明暗当前未核验。'
    : `当前实际主题：${OPTION_LABELS[snapshot.read.value.effectiveTheme] ?? snapshot.read.value.effectiveTheme}。`
  return `${saved} ${effective}`
}

/** The Settings appearance slice. Native controls preserve keyboard/focus behavior; unavailable
 *  reads show no invented defaults, and the controller owns all POST + authoritative GET logic. */
function AppearancePane({ controller: suppliedController, leaves }: {
  readonly controller?: DevicePreferencesController
  readonly leaves?: readonly DesktopSettingsLeaf[]
}): ReactNode {
  const [controller] = useState(() => suppliedController ?? createDevicePreferencesController())
  const [snapshot, setSnapshot] = useState(() => controller.snapshot())
  const [draft, setDraft] = useState<DevicePreferenceValues | null>(() => draftFrom(controller.snapshot()))
  // Acceptance finding (2026-10-11): an authoritative read that lands WHILE the user is editing
  // (the mount refresh can resolve mid-interaction) must never discard the unsaved draft. The
  // draft is only re-adopted from a snapshot while it is clean; a submit re-arms the adoption so
  // the read-back (saved or refused) still restores the authoritative values.
  const dirty = useRef(false)

  useEffect(() => {
    const unsubscribe = controller.subscribe((next) => {
      setSnapshot(next)
      setDraft(current => (current !== null && dirty.current) ? current : draftFrom(next))
    })
    void controller.refresh()
    return unsubscribe
  }, [controller])

  const update = (key: DevicePreferenceKey, value: string): void => {
    if (!isDevicePreferenceValue(key, value)) return
    dirty.current = true
    setDraft(current => current === null ? null : ({ ...current, [key]: value } as DevicePreferenceValues))
  }

  const save = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (draft === null || snapshot.saving) return
    // The submitted values are now the candidate authority: re-arm adoption so the read-back
    // (saved → the sent values; refused → the previous authority) lands on the form.
    dirty.current = false
    void controller.save(draft)
  }

  const unavailable = draft === null

  return <section className="settings-appearance" aria-labelledby="device-preferences-title">
    <header>
      <h2 id="device-preferences-title">外观与显示</h2>
      <p>主题与密度在保存并完成权威回读后立即生效；其余六项仅保存，尚未接入产品显示。</p>
    </header>
    <form onSubmit={save} aria-busy={snapshot.saving}>
      <fieldset disabled={unavailable || snapshot.saving}>
        <legend>本设备设置</legend>
        {DEVICE_PREFERENCE_KEYS.map((key) => {
          const id = `device-preferences-${FIELD_IDS[key]}`
          return <label key={key} htmlFor={id}>
            <span>{FIELD_LABELS[key]}</span>
            <select
              id={id}
              name={key}
              value={draft?.[key] ?? ''}
              disabled={unavailable || snapshot.saving}
              onChange={event => update(key, event.currentTarget.value)}
            >
              {unavailable ? <option value="">未核验</option> : null}
              {DEVICE_PREFERENCE_OPTIONS[key].map(value => <option key={value} value={value}>
                {OPTION_LABELS[value] ?? value}
              </option>)}
            </select>
          </label>
        })}
        <button type="submit" disabled={unavailable || snapshot.saving}>保存到本设备</button>
      </fieldset>
    </form>
    <p role="status" aria-live="polite">{statusText(snapshot)}</p>
    {leaves !== undefined
      ? <section className="settings-leaves" aria-label="本机设置叶">
        <h3>本机设置叶</h3>
        <ul>
          {leaves.map((leaf) => <li key={leaf.leafId} className="settings-leaf" data-leaf-state={leaf.state}>
            <strong>{leaf.title}</strong>
            <span className="settings-leaf-state">{leaf.state === 'read' ? '已读' : '未核验'}</span>
            <small>来源：{leaf.source} · {leaf.note}</small>
          </li>)}
        </ul>
      </section>
      : null}
  </section>
}

/** R17-A (wave 1): one observed page reproduced as structure. Every row carries its observed
 *  label and description verbatim; a row with no Sage machinery answers the honest 未接线 state
 *  and offers no action entry — the write path lands in its own named batch (T13 sub-batches). */
function ObservedGroupsPane({ heading, note, groups, extraRows }: {
  readonly heading: string
  readonly note: string
  readonly groups: readonly SettingsObservedGroup[]
  readonly extraRows?: readonly { readonly group: string, readonly label: string }[]
}): ReactNode {
  const extras = extraRows ?? []
  return <section className="settings-observed" aria-label={heading}>
    <header>
      <h2>{heading}</h2>
      <p>{note}</p>
    </header>
    {groups.map((group) => <section className="settings-observed-group" key={group.group} aria-label={group.group}>
      <h3>{group.group}</h3>
      <ul>
        {group.rows.map((row) => <li className="settings-observed-row" key={row.label}>
          <strong>{row.label}</strong>
          <small>{row.note}</small>
          {extras.some((extra) => extra.group === group.group && extra.label === row.label)
            ? <button type="button" className="text-button" disabled aria-label={`设置${row.label}`}>设置</button>
            : null}
          <span className="settings-observed-state">未接线</span>
        </li>)}
      </ul>
    </section>)}
  </section>
}

/** R17-A: the profile pane keeps only real facts — the identity session state and the real
 *  login/logout action. Account metering, subscription, editing and the credential buttons are
 *  named as unwired rather than reproduced with fabricated readings. */
function ProfilePane({ account }: {
  readonly account: DesktopSettingsViewProps['account']
}): ReactNode {
  const authLabel = account === undefined
    ? '身份状态未知'
    : ({ 'signed-in': '已登录', 'signed-out': '未登录', pending: '登录中' } as const)[account.auth]
  return <section className="settings-observed settings-profile" aria-label="个人资料">
    <header>
      <h2>个人资料</h2>
      <p>身份以最小投影呈现：只显示身份会话状态，不显示凭据、令牌或原始账号标识。</p>
    </header>
    <section className="settings-observed-group" aria-label="身份">
      <h3>身份</h3>
      <div className="settings-profile-identity">
        <span className="settings-profile-avatar" aria-hidden="true">?</span>
        <span><strong>{authLabel}</strong><small>Sage 身份会话（本机）</small></span>
      </div>
      {account !== undefined && account.auth !== 'pending'
        ? <button type="button" className="text-button" disabled={account.busy}
          aria-label={account.auth === 'signed-in' ? '退出登录' : '登录'}
          onClick={() => { void account.onAction(account.auth === 'signed-in' ? 'logout' : 'login') }}>
          {account.auth === 'signed-in' ? '退出登录' : '登录'}
        </button>
        : null}
    </section>
    <section className="settings-observed-group" aria-label="账户计量">
      <h3>账户</h3>
      <p className="settings-observed-note">用量与活跃统计未接线：没有真实计量服务时不显示伪造读数。</p>
    </section>
    <section className="settings-observed-group" aria-label="订阅">
      <h3>订阅</h3>
      <p className="settings-observed-note">订阅与套餐信息未接线；编辑、分享与成就墙未采集。</p>
    </section>
  </section>
}

type SettingsPane = 'appearance' | 'profile' | 'general' | 'mode' | 'task-monitor'

const PANES: readonly { readonly pane: SettingsPane, readonly label: string }[] = [
  { pane: 'profile', label: '个人资料' },
  { pane: 'general', label: '常规' },
  { pane: 'mode', label: '模式配置' },
  { pane: 'task-monitor', label: '任务监控' },
  { pane: 'appearance', label: '外观与显示' },
]

/** R17-A (wave 1, QDR.P06): the settings surface — the observed navigation (返回应用 / 搜索设置 /
 *  导航项) over the reproduced pages. The default pane stays 外观与显示 so every existing
 *  appearance acceptance (walkthrough / DMG-06 / specs) keeps its landing state; only entries
 *  whose pages exist render — later waves add their entries together with their pages. */
export function DesktopSettingsView({ controller, leaves, account, onBack }: DesktopSettingsViewProps): ReactNode {
  const [pane, setPane] = useState<SettingsPane>('appearance')
  const [query, setQuery] = useState('')
  const visible = PANES.filter((entry) => entry.label.includes(query.trim()))
  return <div className="settings-shell">
    <nav className="settings-nav" aria-label="设置导航">
      {onBack !== undefined
        ? <button type="button" className="text-button" aria-label="返回应用" onClick={() => onBack()}>返回应用</button>
        : null}
      <label className="settings-search">
        <span>搜索设置</span>
        <input type="search" value={query} aria-label="搜索设置"
          onChange={event => setQuery(event.currentTarget.value)} />
      </label>
      {visible.length === 0
        ? <p className="settings-nav-empty">没有匹配的设置项。<button type="button" className="text-button"
          aria-label="清空搜索" onClick={() => setQuery('')}>清空搜索</button></p>
        : <ul>
          {visible.map((entry) => <li key={entry.pane}>
            <button type="button" className="text-button" aria-current={pane === entry.pane ? 'page' : undefined}
              aria-label={`设置项 ${entry.label}`} onClick={() => setPane(entry.pane)}>{entry.label}</button>
          </li>)}
        </ul>}
    </nav>
    <div className="settings-pane">
      {pane === 'appearance'
        ? <AppearancePane {...(controller === undefined ? {} : { controller })} {...(leaves === undefined ? {} : { leaves })} />
        : pane === 'profile'
          ? <ProfilePane account={account} />
          : pane === 'general'
            ? <ObservedGroupsPane heading="常规" groups={GENERAL_GROUPS}
              note="本页复刻观测结构（QB15-01）；写路径在独立批，控件不保存任何设置，读数不伪造。" />
            : pane === 'mode'
              ? <ObservedGroupsPane heading="模式配置" groups={MODE_GROUPS}
                note="本页复刻观测结构（QB15-02，编程/通用各六行）；写路径在独立批，控件不保存任何设置，读数不伪造。" />
              : <ObservedGroupsPane heading="任务监控" groups={TASK_MONITOR_GROUPS}
                extraRows={[{ group: '进度与上下文', label: '任务回顾' }]}
                note="本页复刻观测结构（QB16-01，五组十四行）；写路径在独立批，控件不保存任何设置，读数不伪造。" />}
    </div>
  </div>
}
