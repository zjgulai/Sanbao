import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'

import { Icon } from './icons.js'
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
  INSTANCE_CREDENTIAL_NAME,
  type InstanceCredentialController,
  type InstanceCredentialRead,
  type InstanceCredentialSaveOutcome,
} from './instance-credential.js'
import {
  deriveRouteFromEndpoint,
  type ModelRouteDraftProfile,
  type ModelRoutesController,
  type ModelRoutesListRead,
  type ModelRouteRead,
} from './model-routes.js'
import {
  GENERAL_GROUPS,
  MODE_GROUPS,
  SHORTCUT_GROUPS,
  TASK_MONITOR_GROUPS,
  VOICE_GROUPS,
  type SettingsObservedGroup,
} from './settings-observed.js'
import {
  DEEPSEEK_MODEL_OPTIONS,
  DEEPSEEK_TYPE_OPTIONS,
  OPENAI_COMPATIBLE_API_TYPES,
  PROVIDER_GROUPS,
  PROVIDER_NAMES,
  providerForVariant,
  type ModelProviderId,
} from './settings-models.js'

export interface DesktopSettingsViewProps {
  /** Supplying the controller keeps tests and the eventual page glue on the same narrow seam. */
  readonly controller?: DevicePreferencesController
  /** ADR-0312: the eleven settings leaves (Ticket 046 machine). Absent = no leaf region. */
  readonly leaves?: readonly DesktopSettingsLeaf[]
  /** ADR-0334: the instance credential card (describe/set for DEEPSEEK_API_KEY). Supplying
   *  the controller makes the models pane's credential card real; absent keeps the pane shell
   *  only — the same narrow-seam rule as `controller`. */
  readonly credential?: InstanceCredentialController
  /** ADR-0339: the saved-model-routes controller. Supplying it makes the compatible-provider
   *  flow real (record/save/test/list); absent keeps the pane shell only. */
  readonly modelRoutes?: ModelRoutesController
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
      <h3 className="settings-group-label">{group.group}</h3>
      <ul>
        {group.rows.map((row) => <li className="settings-observed-row" key={row.label}>
          <span className="settings-row-tile" aria-hidden="true"><Icon name={group.icon} size={14} /></span>
          <span className="settings-row-text">
            <strong>{row.label}</strong>
            <small>{row.note}</small>
          </span>
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

/** R17-C: the observed shortcut-edit modal shell (QB18-04 / QB19-02). Open, cancel and Escape
 *  are real local interactions; recording and saving stay disabled with the honest note — the
 *  local shortcut store lands in its own batch (T13 sub-batch: save/apply separated). */
function ShortcutEditModal({ title, onClose }: {
  readonly title: string
  readonly onClose: () => void
}): ReactNode {
  return <div className="settings-modal-backdrop" role="presentation"
    onKeyDown={event => { if (event.key === 'Escape') onClose() }}>
    <div className="settings-modal" role="dialog" aria-modal="true" aria-label={title}>
      <h3>{title}</h3>
      <p>按下包含 ⌘/Ctrl、⌃ 或 Option/Alt 的新组合键。Escape 可取消修改。</p>
      <button type="button" className="text-button" disabled aria-label="按下新快捷键">按下新快捷键</button>
      <p className="settings-observed-note">录制与保存未接线：本机不录制、不保存任何快捷键。</p>
      <div className="settings-modal-actions">
        <button type="button" className="text-button" aria-label="取消修改" onClick={onClose}>取消</button>
        <button type="button" className="text-button" disabled aria-label="保存快捷键">保存快捷键</button>
      </div>
    </div>
  </div>
}

/** R17-C: the 快捷键 page — the 5 observed groups / 16 commands plus the REAL local search
 *  (QB18-01/02: filter over command or description; the no-match copy and clear are the
 *  observed interaction). Every command row carries the 未接线 state; the pencil opens the
 *  modal shell. */
function ShortcutsPane(): ReactNode {
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const q = query.trim()
  const total = SHORTCUT_GROUPS.reduce((count, group) => count + group.rows.length, 0)
  const groups = SHORTCUT_GROUPS
    .map((group) => ({ group: group.group, icon: group.icon, rows: group.rows.filter((row) => row.label.includes(q) || row.note.includes(q)) }))
    .filter((group) => group.rows.length > 0)
  return <section className="settings-observed" aria-label="快捷键">
    <header>
      <h2>快捷键</h2>
      <p>搜索、查看并修改内置命令的快捷键。本机未接线：不录制、不保存任何绑定。</p>
    </header>
    <section className="settings-observed-group" aria-label="应用快捷键">
      <h3>应用快捷键</h3>
      <p className="settings-observed-note">共 {total} 条观测命令，0 个已自定义（本机未接线）。</p>
      <label className="settings-search">
        <span>搜索快捷键</span>
        <input type="search" value={query} aria-label="搜索快捷键" placeholder="搜索命令、说明或组合键"
          onChange={event => setQuery(event.currentTarget.value)} />
      </label>
      {groups.length === 0
        ? <p className="settings-nav-empty">没有找到包含“{q}”的命令、说明或组合键。
          <button type="button" className="text-button" aria-label="清空搜索" onClick={() => setQuery('')}>清空搜索</button></p>
        : null}
    </section>
    {groups.map((group) => <section className="settings-observed-group" key={group.group} aria-label={group.group}>
      <h3 className="settings-group-label">{group.group}</h3>
      <ul>
        {group.rows.map((row) => <li className="settings-observed-row" key={row.label}>
          <span className="settings-row-tile" aria-hidden="true"><Icon name={group.icon} size={14} /></span>
          <span className="settings-row-text">
            <strong>{row.label}</strong>
            <small>{row.note}</small>
          </span>
          {row.label !== '发送消息'
            ? <button type="button" className="text-button" aria-label={`修改 ${row.label} 快捷键`}
              onClick={() => setEditing(row.label)}>修改快捷键</button>
            : null}
          <span className="settings-observed-state">未接线</span>
        </li>)}
      </ul>
    </section>)}
    {editing !== null ? <ShortcutEditModal title={`修改“${editing}”快捷键`} onClose={() => setEditing(null)} /> : null}
  </section>
}

/** R17-C: the 语音 page — the 4 observed groups / 13 rows. The 实时语音快捷键 row opens the same
 *  modal shell; the 常用词纠正 row offers a REAL local draft input whose 添加 stays disabled
 *  (QB19-03: the observation never added a word — nothing here adds or persists either). */
function VoicePane(): ReactNode {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  return <section className="settings-observed" aria-label="语音">
    <header>
      <h2>语音</h2>
      <p>集中配置语音输入与实时语音。本机未接线：不录音、不保存任何偏好。</p>
    </header>
    {VOICE_GROUPS.map((group) => <section className="settings-observed-group" key={group.group} aria-label={group.group}>
      <h3 className="settings-group-label">{group.group}</h3>
      <ul>
        {group.rows.map((row) => <li className="settings-observed-row" key={row.label}>
          <span className="settings-row-tile" aria-hidden="true"><Icon name={group.icon} size={14} /></span>
          <span className="settings-row-text">
            <strong>{row.label}</strong>
            <small>{row.note}</small>
          </span>
          {row.label === '实时语音快捷键'
            ? <button type="button" className="text-button" aria-label="修改 实时语音快捷键 快捷键"
              onClick={() => setEditing(true)}>修改快捷键</button>
            : null}
          {row.label === '常用词纠正'
            ? <label className="settings-inline-input">
              <input type="text" value={draft} aria-label="添加词汇" placeholder="添加词汇"
                onChange={event => setDraft(event.currentTarget.value)} />
              <button type="button" className="text-button" disabled aria-label="添加词汇按钮">添加</button>
            </label>
            : null}
          <span className="settings-observed-state">未接线</span>
        </li>)}
      </ul>
    </section>)}
    {editing ? <ShortcutEditModal title={'修改“实时语音快捷键”快捷键'} onClose={() => setEditing(false)} /> : null}
  </section>
}

/** R17-B (QB20): the model editor shell. The add-dialog opens/cancels for real (QB20-02), the
 *  provider menu opens with the observed 3-group/17-entry list and DeepSeek is selectable
 *  (QB20-03/04); the type/models/api-type panels open and Escape back (QB20-05/06); the discard
 *  confirm offers the observed two outcomes (QB20-07). The API Key stays an always-empty
 *  read-only placeholder and 校验并添加模型 stays disabled with the named note — Sage has no
 *  credential write path yet; nothing here enters, validates, stores or sends a credential. */
type ModelsPanel = 'provider' | 'type' | 'models' | 'api-type'

function ModelSelectMenu({ panel, label, value, open, onOpen, onClose, children, describedBy }: {
  readonly panel: ModelsPanel
  readonly label: string
  readonly value: string
  readonly open: boolean
  readonly onOpen: () => void
  readonly onClose: () => void
  readonly children: ReactNode
  readonly describedBy?: string
}): ReactNode {
  const menuId = `models-${panel}-options`
  return <div className="settings-models-select" data-models-select={panel}>
    <button type="button" role="combobox" aria-label={label} aria-expanded={open}
      aria-describedby={describedBy} aria-haspopup={panel === 'models' ? 'menu' : 'listbox'}
      aria-controls={open ? menuId : undefined}
      onClick={() => (open ? onClose() : onOpen())}
      onKeyDown={event => { if (open && event.key === 'Escape') { event.stopPropagation(); onClose() } }}>
      <span className="settings-models-select-value">{value}</span>
    </button>
    {open
      ? <div id={menuId} className={`settings-models-options settings-models-options-${panel}`}
        role={panel === 'models' ? 'menu' : 'listbox'} aria-label={label}
        onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose() } }}>
        {children}
      </div>
      : null}
  </div>
}

function credentialReadLabel(read: InstanceCredentialRead): string {
  if (read.kind === 'loading') return '正在读取凭据状态…'
  if (read.kind === 'unavailable') {
    return read.code === 'credential-identity-unavailable'
      ? '未登录：登录后可查看与保存。'
      : `凭据状态读取失败（${read.code}）。`
  }
  if (!read.configured) return '未配置：真实模型回合需要实例 API Key。'
  if (read.source === 'env') return '已配置（来源：启动环境变量；只读，界面保存不改变生效值）。'
  if (read.source === 'file') return '已配置（来源：本机凭据文件）。'
  return `已配置（来源：${read.source ?? '未知层'}）。`
}

function credentialSaveLabel(outcome: InstanceCredentialSaveOutcome): string {
  if (outcome.kind === 'saved') return '已保存；值不回显。新值对下一次模型请求生效。'
  if (outcome.kind === 'unreachable') return '请求未能送达服务，值未保存。'
  switch (outcome.code) {
    case 'credential-identity-unavailable': return '需要先登录；登录后可保存实例 API Key。'
    case 'credentials-unavailable': return '本机凭据服务未接线，暂不能保存。'
    case 'bridge-credential-readonly-source': return '当前值由启动环境变量提供（只读）；从环境移除后重试。'
    case 'bridge-credential-value-refused': return '值不合法：需为 8–512 字符，且不含首尾空白或控制字符。'
    case 'bridge-provider-unavailable': return '宿主凭据服务不可用，值未保存。'
    default: return `保存未完成（${outcome.code}）。`
  }
}

/** ADR-0334: the instance API Key card — the one place the product writes DEEPSEEK_API_KEY.
 *  The input never echoes a stored value (the read half cannot carry one); after a save the
 *  draft clears and the status line re-reads. */
function InstanceCredentialCard({ controller }: { readonly controller: InstanceCredentialController }): ReactNode {
  const [read, setRead] = useState<InstanceCredentialRead>({ kind: 'loading' })
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const refresh = async (): Promise<void> => {
    setRead(await controller.read())
  }
  useEffect(() => {
    let active = true
    void controller.read().then((next) => { if (active) setRead(next) })
    return () => { active = false }
  }, [controller])
  const save = async (): Promise<void> => {
    if (busy || draft === '') return
    setBusy(true)
    setNotice(null)
    const outcome = await controller.save(draft)
    setBusy(false)
    setNotice(credentialSaveLabel(outcome))
    if (outcome.kind === 'saved') {
      setDraft('')
      await refresh()
    }
  }
  const saveDisabled = busy || draft === ''
  return <section className="settings-models-credential" aria-label="实例 API Key">
    <h3>实例 API Key</h3>
    <p>内置模型（DeepSeek）使用它发起真实模型回合。保存后立即生效；值不会回显。</p>
    <p role="status" className="settings-observed-note">{credentialReadLabel(read)}</p>
    <div className="settings-models-field">
      <label htmlFor="models-instance-key">API Key（{INSTANCE_CREDENTIAL_NAME}）</label>
      <input id="models-instance-key" type="password" aria-label="实例 API Key 输入"
        placeholder="粘贴 API Key" value={draft} autoComplete="off" spellCheck={false}
        onChange={event => setDraft(event.currentTarget.value)} />
    </div>
    <div className="settings-modal-actions">
      <button type="button" className="text-button" aria-label="保存实例 API Key"
        disabled={saveDisabled} onClick={() => { void save() }}>
        {busy ? '正在保存…' : '保存'}
      </button>
    </div>
    {notice !== null ? <p role="status" className="settings-observed-note">{notice}</p> : null}
  </section>
}

function routeApiFor(provider: ModelProviderId, apiType: string): ModelRouteDraftProfile['api'] {
  if (provider === 'anthropic-compatible') return 'anthropic-messages'
  return apiType === 'Responses API' ? 'openai-responses' : 'openai-completions'
}

function routeKindLabel(api: string): string {
  if (api === 'anthropic-messages') return 'Anthropic Compatible'
  if (api === 'openai-responses') return 'OpenAI Compatible · Responses API'
  return 'OpenAI Compatible · Chat Completions API'
}

function routeSaveNotice(what: string, outcome: { readonly kind: string, readonly code?: string }): string {
  if (outcome.kind === 'saved') return `${what}已保存。`
  if (outcome.kind === 'unreachable') return `${what}未能送达服务，未保存。`
  switch (outcome.code) {
    case 'bridge-settings-conflict': return `${what}版本冲突：其他人或窗口刚改过配置，请重试。`
    case 'bridge-model-profile-invalid': return `${what}不符合本机文法（协议/地址/模型名），未保存。`
    case 'bridge-model-route-invalid': return '路由名不合法，未保存。'
    case 'bridge-credential-value-refused': return '凭据值不合法：需为 8–512 字符，且不含首尾空白或控制字符。'
    case 'bridge-credential-name-refused': return '凭据名未被已保存配置声明，宿主拒绝写入。'
    case 'credential-identity-unavailable':
    case 'model-config-identity-unavailable': return '需要先登录；登录后可保存模型配置与凭据。'
    case 'model-config-unavailable': return '本机模型配置服务未接线，未保存。'
    case 'credentials-unavailable': return '本机凭据服务未接线，凭据未保存。'
    default: return `${what}保存未完成（${outcome.code ?? 'unrecognised'}）。`
  }
}

/** 测试结果行：成功只说本次所测能力；绑定不再成立的成功降为「仅历史」。 */
function routeTestLabel(test: ModelRouteRead['test'], configured: boolean): { readonly label: string, readonly tone: string } {
  if (!configured) return { label: '凭据未设置', tone: 'warn' }
  if (test === null) return { label: '已保存、未测试', tone: 'warn' }
  switch (test.state) {
    case 'ok':
      return test.current
        ? { label: `测试通过 · ${String(test.latencyMs ?? '?')}ms · ${test.host ?? ''}`, tone: 'ok' }
        : { label: '仅历史（配置或凭据已变）', tone: 'warn' }
    case 'failed': return { label: '测试失败：供应商未接受请求', tone: 'bad' }
    case 'unknown': return { label: '测试未确认（超时待核对）', tone: 'warn' }
    case 'credential-missing': return { label: '测试失败：缺凭据', tone: 'bad' }
    case 'unsupported': return { label: '该协议不支持列目录测试', tone: 'warn' }
    default: return { label: '已保存、未测试', tone: 'warn' }
  }
}

function ModelsPane({ credential, modelRoutes }: {
  readonly credential?: InstanceCredentialController
  readonly modelRoutes?: ModelRoutesController
}): ReactNode {
  const [provider, setProvider] = useState<ModelProviderId>('aliyun')
  const [panel, setPanel] = useState<ModelsPanel | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [apiType, setApiType] = useState('Chat Completions API')
  const [endpoint, setEndpoint] = useState('')
  const [modelDraft, setModelDraft] = useState('')
  const [modelIds, setModelIds] = useState<readonly string[]>([])
  const [keyDraft, setKeyDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [listRead, setListRead] = useState<ModelRoutesListRead | null>(null)
  const [testingRoute, setTestingRoute] = useState<string | null>(null)
  const [rowMenu, setRowMenu] = useState<string | null>(null)
  const [editRoute, setEditRoute] = useState<ModelRouteRead | null>(null)
  const compatible = provider === 'openai-compatible' || provider === 'anthropic-compatible'
  const providerName = PROVIDER_NAMES[provider]
  const wired = modelRoutes !== undefined && compatible
  const refresh = async (): Promise<void> => {
    if (modelRoutes === undefined) return
    setListRead(await modelRoutes.list())
  }
  useEffect(() => {
    let active = true
    if (modelRoutes === undefined) return () => { active = false }
    void modelRoutes.list().then((next) => { if (active) setListRead(next) })
    return () => { active = false }
  }, [modelRoutes])
  const draftDirty = endpoint !== '' || modelDraft !== '' || modelIds.length > 0 || keyDraft !== ''
  const dirty = provider !== 'aliyun' || panel !== null || (wired && draftDirty)
  const derived = wired ? deriveRouteFromEndpoint(routeApiFor(provider, apiType), endpoint.trim()) : undefined
  const canSubmit = wired && !busy && derived !== undefined && modelIds.length > 0 && keyDraft.trim() !== '' && keyDraft === keyDraft.trim()
  const resetForm = (): void => {
    setApiType('Chat Completions API')
    setEndpoint('')
    setModelDraft('')
    setModelIds([])
    setKeyDraft('')
  }
  const closeForm = (): void => {
    if (dirty) setConfirming(true)
    else setFormOpen(false)
  }
  const leaveForm = (): void => {
    setConfirming(false)
    setFormOpen(false)
    setPanel(null)
    setProvider('aliyun')
    setEditRoute(null)
    resetForm()
  }
  const beginEdit = (row: ModelRouteRead): void => {
    setRowMenu(null)
    setNotice(null)
    setEditRoute(row)
    setProvider(row.api === 'anthropic-messages' ? 'anthropic-compatible' : 'openai-compatible')
    setApiType(row.api === 'openai-responses' ? 'Responses API' : 'Chat Completions API')
    setEndpoint(row.baseURL)
    setModelIds(row.modelIds)
    setModelDraft('')
    setKeyDraft('')
    setPanel(null)
    setFormOpen(true)
  }
  const editRevision = (): number | undefined =>
    listRead !== null && listRead.kind === 'read' && listRead.namespaceRevision !== null ? listRead.namespaceRevision : undefined
  const submitEdit = async (): Promise<void> => {
    if (busy || editRoute === null || modelRoutes === undefined || derived === undefined || modelIds.length === 0) return
    setBusy(true)
    setNotice(null)
    const saved = await modelRoutes.saveRoute({
      route: editRoute.route,
      profile: {
        api: routeApiFor(provider, apiType),
        baseURL: endpoint.trim(),
        ...(editRoute.apiKeyEnv === undefined ? {} : { apiKeyEnv: editRoute.apiKeyEnv }),
        models: modelIds.map(id => ({ id })),
      },
      ...(editRevision() === undefined ? {} : { expectedRevision: editRevision() as number }),
    })
    if (saved.kind !== 'saved') {
      setBusy(false)
      setNotice(routeSaveNotice('配置', saved))
      return
    }
    // The key is only touched when the user typed one: the stored value is never readable, so
    // an untouched field must never overwrite it.
    if (keyDraft !== '' && editRoute.apiKeyEnv !== undefined) {
      const stored = await modelRoutes.saveCredential({ name: editRoute.apiKeyEnv, value: keyDraft })
      if (stored.kind !== 'saved') {
        setBusy(false)
        setNotice(`配置已保存；${routeSaveNotice('凭据', stored)}`)
        await refresh()
        return
      }
    }
    setBusy(false)
    leaveForm()
    setEditRoute(null)
    await refresh()
    setNotice(keyDraft === '' ? '配置已保存；凭据未改动。' : '配置与凭据已保存。')
  }
  const unsetCredential = async (row: ModelRouteRead): Promise<void> => {
    if (modelRoutes === undefined || row.apiKeyEnv === undefined) return
    setRowMenu(null)
    setNotice(null)
    const outcome = await modelRoutes.unsetCredential({ name: row.apiKeyEnv })
    setNotice(outcome.kind === 'saved' ? `已清除凭据（${row.apiKeyEnv}）。` : routeSaveNotice('清除凭据', outcome))
    await refresh()
  }
  const addModelId = (): void => {
    const id = modelDraft.trim()
    if (id === '' || modelIds.includes(id) || modelIds.length >= 64) return
    setModelIds([...modelIds, id])
    setModelDraft('')
  }
  const submitAdd = async (): Promise<void> => {
    if (!canSubmit || modelRoutes === undefined || derived === undefined) return
    setBusy(true)
    setNotice(null)
    const saved = await modelRoutes.saveRoute({
      route: derived.route,
      profile: {
        api: routeApiFor(provider, apiType),
        baseURL: endpoint.trim(),
        apiKeyEnv: derived.apiKeyEnv,
        models: modelIds.map(id => ({ id })),
      },
    })
    if (saved.kind !== 'saved') {
      setBusy(false)
      setNotice(routeSaveNotice('配置', saved))
      return
    }
    const stored = await modelRoutes.saveCredential({ name: derived.apiKeyEnv, value: keyDraft })
    setBusy(false)
    if (stored.kind !== 'saved') {
      // 部分失败不显示整项完成：配置已入档，凭据未保存按名回报，对话框保留。
      setNotice(`配置已保存；${routeSaveNotice('凭据', stored)}`)
      await refresh()
      return
    }
    leaveForm()
    await refresh()
    setNotice('已保存、未测试：保存不触发供应商请求；真实调用只在显式「测试连接」后发生。')
  }
  const testRoute = async (route: string): Promise<void> => {
    if (modelRoutes === undefined) return
    setTestingRoute(route)
    setNotice(null)
    const outcome = await modelRoutes.testConnection(route)
    setTestingRoute(null)
    if (outcome.kind === 'tested') await refresh()
    else setNotice(`测试未能发起（${outcome.kind === 'refused' ? outcome.code : 'unreachable'}）。`)
  }
  const removeRoute = async (route: string): Promise<void> => {
    if (modelRoutes === undefined) return
    const outcome = await modelRoutes.removeRoute({ route })
    setNotice(outcome.kind === 'saved' ? null : routeSaveNotice('删除', outcome))
    await refresh()
  }
  const routes = listRead !== null && listRead.kind === 'read' ? listRead.routes : null
  return <section className="settings-observed settings-models" aria-label="模型">
    <header>
      <h2>模型</h2>
      {modelRoutes !== undefined
        ? <p>使用自有 API Key 管理自定义模型。兼容供应商可录入并保存（保存不触发供应商请求）；「测试连接」为显式动作，结果绑定当次的配置与凭据。</p>
        : <p>使用自有 API Key 管理自定义模型。自定义模型编辑器未接线（不录入、不校验、不保存）。</p>}
    </header>
    {credential !== undefined ? <InstanceCredentialCard controller={credential} /> : null}
    {routes !== null && routes.length > 0
      ? <ul className="settings-models-list" aria-label="已配置模型">
        {routes.map(row => {
          const status = routeTestLabel(row.test, row.credential?.configured ?? true)
          return <li className="settings-models-row" key={row.route} data-model-route={row.route}>
            <div className="settings-models-row-main">
              <strong>{row.displayName ?? row.route}</strong>
              <span className="settings-models-row-sub">{routeKindLabel(row.api)} · {row.baseURL}</span>
              <span className="settings-models-row-meta">模型 {row.modelCount} 个{row.apiKeyEnv === undefined ? '' : ` · 凭据 ${row.credential?.configured === true ? '已设置' : '未设置'}（${row.apiKeyEnv}）`}</span>
            </div>
            <span className={`settings-models-status settings-models-status-${status.tone}`} role="status">{status.label}</span>
            <div className="settings-models-row-actions">
              <button type="button" className="text-button" aria-label={`${row.route} 更多操作`}
                aria-haspopup="menu" aria-expanded={rowMenu === row.route}
                onClick={() => setRowMenu(rowMenu === row.route ? null : row.route)}>…</button>
              {rowMenu === row.route
                ? <>
                  <div className="model-selector-backdrop" role="presentation" onClick={() => setRowMenu(null)} />
                  <div className="settings-models-row-menu" role="menu" aria-label={`${row.route} 操作`}
                    onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setRowMenu(null) } }}>
                    <button type="button" role="menuitem" aria-label={`编辑 ${row.route}`}
                      onClick={() => beginEdit(row)}>编辑</button>
                    <button type="button" role="menuitem" aria-label={`测试连接 ${row.route}`}
                      disabled={testingRoute !== null}
                      onClick={() => { setRowMenu(null); void testRoute(row.route) }}>
                      {testingRoute === row.route ? '测试中…' : '测试连接'}
                    </button>
                    {row.apiKeyEnv !== undefined && row.credential?.configured === true
                      ? <button type="button" role="menuitem" aria-label={`清除凭据 ${row.route}`}
                        onClick={() => { void unsetCredential(row) }}>清除凭据</button>
                      : null}
                    <button type="button" role="menuitem" aria-label={`删除 ${row.route}`}
                      onClick={() => { setRowMenu(null); void removeRoute(row.route) }}>删除</button>
                  </div>
                </>
                : null}
            </div>
          </li>
        })}
      </ul>
      : routes === null && listRead !== null && listRead.kind === 'unavailable'
        ? <p className="settings-observed-note" role="status">模型列表读取失败（{listRead.code}）。</p>
        : <p className="settings-models-empty">暂无自定义模型，点击添加模型开始使用</p>}
    <button type="button" className="text-button" aria-label="添加模型"
      onClick={() => { setProvider('aliyun'); setPanel(null); setNotice(null); setFormOpen(true) }}>添加模型</button>
    {notice !== null && !formOpen ? <p className="settings-observed-note" role="status">{notice}</p> : null}
    {formOpen && !confirming
      ? <div className="settings-modal-backdrop" role="presentation"
        onKeyDown={event => { if (event.key === 'Escape') closeForm() }}>
        <div className="settings-modal" role="dialog" aria-modal="true" aria-label={editRoute === null ? '添加模型' : '编辑模型'}>
          <h3>{editRoute === null ? '添加模型' : `编辑模型 · ${editRoute.route}`}</h3>
          <form onSubmit={event => { event.preventDefault(); if (editRoute !== null) { void submitEdit() } else if (wired) { void submitAdd() } }}>
            <div className="settings-models-field">
              <label>供应商</label>
              <ModelSelectMenu panel="provider" label="供应商" value={providerName}
                open={panel === 'provider' && editRoute === null} onOpen={() => { if (editRoute === null) setPanel('provider') }}
                onClose={() => setPanel(null)}>
                {PROVIDER_GROUPS.map(group => <div role="group" aria-label={group.group} key={group.group}>
                  <h3>{group.group}</h3>
                  {group.names.map(name => {
                    const id = (Object.keys(PROVIDER_NAMES) as ModelProviderId[])
                      .find(key => key !== 'aliyun' && PROVIDER_NAMES[key] === name)
                    const selected = name === providerName
                    return <button type="button" role="option" aria-selected={selected}
                      tabIndex={selected ? 0 : -1} key={name}
                      onClick={() => {
                        if (id === undefined) return
                        setProvider(id)
                        setPanel(null)
                      }}>
                      <span>{name}</span>{selected ? <span aria-hidden="true">✓</span> : null}
                    </button>
                  })}
                </div>)}
              </ModelSelectMenu>
            </div>
            {compatible
              ? <>
                {provider === 'openai-compatible'
                  ? <div className="settings-models-field">
                    <label>API 类型</label>
                    <ModelSelectMenu panel="api-type" label="API 类型" value={apiType}
                      open={panel === 'api-type'} onOpen={() => setPanel('api-type')}
                      onClose={() => setPanel(null)}>
                      {OPENAI_COMPATIBLE_API_TYPES.map(option => {
                        const selected = option === apiType
                        return <button type="button" role="option" aria-selected={selected}
                          tabIndex={selected ? 0 : -1} key={option}
                          onClick={() => { setApiType(option); setPanel(null) }}>
                          <span>{option}</span>{selected ? <span aria-hidden="true">✓</span> : null}
                        </button>
                      })}
                    </ModelSelectMenu>
                  </div>
                  : null}
                <div className="settings-models-field">
                  <label htmlFor={wired ? 'models-endpoint' : 'models-endpoint-readonly'}>接口地址（Base URL）</label>
                  {wired
                    ? <input id="models-endpoint" className="settings-models-text" type="text"
                      aria-label="接口地址（Base URL）" placeholder="https://api.example.com/v1"
                      value={endpoint} autoComplete="off" spellCheck={false}
                      onChange={event => setEndpoint(event.currentTarget.value)} />
                    : <input id="models-endpoint-readonly" className="settings-models-text" type="text"
                      aria-label="接口地址（Base URL）" placeholder="https://api.example.com/v1"
                      value="" readOnly autoComplete="off" />}
                </div>
                {wired
                  ? <div className="settings-models-field">
                    <label htmlFor="models-model-id">Model ID</label>
                    <div className="settings-models-modelid">
                      <input id="models-model-id" className="settings-models-text" type="text"
                        aria-label="Model ID" placeholder="例如 qwen3.8-max"
                        value={modelDraft} autoComplete="off" spellCheck={false}
                        onChange={event => setModelDraft(event.currentTarget.value)}
                        onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addModelId() } }} />
                      <button type="button" className="text-button" aria-label="添加 Model ID"
                        disabled={modelDraft.trim() === '' || modelIds.length >= 64}
                        onClick={addModelId}>添加 Model ID</button>
                    </div>
                    {modelIds.length > 0
                      ? <ul className="settings-models-modelids" aria-label="已录入 Model ID">
                        {modelIds.map(id => <li key={id}>
                          <span>{id}</span>
                          <button type="button" className="text-button" aria-label={`移除 Model ID ${id}`}
                            onClick={() => setModelIds(modelIds.filter(candidate => candidate !== id))}>移除</button>
                        </li>)}
                      </ul>
                      : null}
                  </div>
                  : null}
              </>
              : <>
                <div className="settings-models-field">
                  <label>类型</label>
                  <ModelSelectMenu panel="type" label="类型"
                    value={provider === 'deepseek' ? '按量付费' : 'Token plan'}
                    open={panel === 'type'} onOpen={() => setPanel('type')}
                    onClose={() => setPanel(null)}>
                    {(provider === 'deepseek' ? DEEPSEEK_TYPE_OPTIONS : ['Token plan']).map(option =>
                      <button type="button" role="option" aria-selected="true" tabIndex={0} key={option}
                        onClick={() => setPanel(null)}>
                        <span>{option}</span><span aria-hidden="true">✓</span>
                      </button>)}
                  </ModelSelectMenu>
                </div>
                <div className="settings-models-field">
                  <label>模型</label>
                  <ModelSelectMenu panel="models" label="选择模型" value="选择模型" describedBy="models-models-count"
                    open={panel === 'models'} onOpen={() => setPanel('models')}
                    onClose={() => setPanel(null)}>
                    <span id="models-models-count" hidden>已选择 0 个模型</span>
                    {DEEPSEEK_MODEL_OPTIONS.map(name =>
                      <button type="button" role="menuitemcheckbox" aria-checked="false" tabIndex={-1} key={name}
                        onClick={() => undefined}>
                        <span>{name}</span>
                      </button>)}
                  </ModelSelectMenu>
                </div>
              </>}
            <div className="settings-models-field">
              <label htmlFor={wired ? 'models-api-key' : 'models-api-key-readonly'}>API Key</label>
              {wired
                ? <>
                  <input id="models-api-key" type="password" aria-label="API Key"
                    placeholder="请输入 API Key" value={keyDraft} autoComplete="off" spellCheck={false}
                    onChange={event => setKeyDraft(event.currentTarget.value)} />
                  <p className="settings-observed-note">{editRoute === null
                    ? '此值保存到本机凭据文件层，不回显；保存本身不触发任何供应商请求。'
                    : '留空则保留现有凭据；填入新值则覆盖。此值不回显。'}</p>
                </>
                : <>
                  <input id="models-api-key-readonly" type="password" aria-label="API Key"
                    placeholder="请输入 API Key" value="" readOnly autoComplete="off" spellCheck={false} />
                  <p className="settings-observed-note">API Key 未接线：本机不录入、不校验、不保存任何凭据；凭证写入路径独立成批。</p>
                </>}
            </div>
            {notice !== null ? <p className="settings-observed-note" role="status">{notice}</p> : null}
            <div className="settings-modal-actions">
              <button type="button" className="text-button" aria-label="取消" onClick={closeForm}>取消</button>
              {wired && editRoute !== null
                ? <button type="button" className="text-button"
                  disabled={busy || derived === undefined || modelIds.length === 0}
                  aria-label="保存修改" onClick={() => { void submitEdit() }}>
                  {busy ? '正在保存…' : '保存修改'}
                </button>
                : wired
                  ? <button type="button" className="text-button" disabled={!canSubmit}
                    aria-label="校验并添加模型" onClick={() => { void submitAdd() }}>
                    {busy ? '正在保存…' : '校验并添加模型'}
                  </button>
                  : <button type="submit" className="text-button" disabled aria-label="校验并添加模型">校验并添加模型</button>}
            </div>
          </form>
        </div>
      </div>
      : null}
    {confirming
      ? <div className="settings-modal-backdrop" role="presentation"
        onKeyDown={event => { if (event.key === 'Escape') setConfirming(false) }}>
        <div className="settings-modal" role="dialog" aria-modal="true" aria-label="放弃未保存的模型配置？">
          <h3>放弃未保存的模型配置？</h3>
          <p>关闭后，本次输入的 Endpoint、模型能力和 API Key 都会被清空。</p>
          <div className="settings-modal-actions">
            <button type="button" className="text-button" aria-label="继续编辑" onClick={() => setConfirming(false)}>继续编辑</button>
            <button type="button" className="text-button" aria-label="放弃更改" onClick={leaveForm}>放弃更改</button>
          </div>
        </div>
      </div>
      : null}
  </section>
}

type SettingsPane = 'appearance' | 'profile' | 'general' | 'mode' | 'task-monitor' | 'shortcuts' | 'voice' | 'models'

const PANES: readonly { readonly pane: SettingsPane, readonly label: string }[] = [
  { pane: 'profile', label: '个人资料' },
  { pane: 'general', label: '常规' },
  { pane: 'mode', label: '模式配置' },
  { pane: 'task-monitor', label: '任务监控' },
  { pane: 'shortcuts', label: '快捷键' },
  { pane: 'voice', label: '语音' },
  { pane: 'models', label: '模型' },
  { pane: 'appearance', label: '外观与显示' },
]

/** R17-A (wave 1, QDR.P06): the settings surface — the observed navigation (返回应用 / 搜索设置 /
 *  导航项) over the reproduced pages. The default pane stays 外观与显示 so every existing
 *  appearance acceptance (walkthrough / DMG-06 / specs) keeps its landing state; only entries
 *  whose pages exist render — later waves add their entries together with their pages. */
export function DesktopSettingsView({ controller, credential, modelRoutes, leaves, account, onBack }: DesktopSettingsViewProps): ReactNode {
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
              : pane === 'task-monitor'
                ? <ObservedGroupsPane heading="任务监控" groups={TASK_MONITOR_GROUPS}
                  extraRows={[{ group: '进度与上下文', label: '任务回顾' }]}
                  note="本页复刻观测结构（QB16-01，五组十四行）；写路径在独立批，控件不保存任何设置，读数不伪造。" />
                : pane === 'shortcuts'
                  ? <ShortcutsPane />
                  : pane === 'models'
                    ? <ModelsPane
                        {...(credential === undefined ? {} : { credential })}
                        {...(modelRoutes === undefined ? {} : { modelRoutes })} />
                    : <VoicePane />}
    </div>
  </div>
}
