import { useEffect, useState, type FormEvent, type ReactNode } from 'react'

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

export interface DesktopSettingsViewProps {
  /** Supplying the controller keeps tests and the eventual page glue on the same narrow seam. */
  readonly controller?: DevicePreferencesController
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
export function DesktopSettingsView({ controller: suppliedController }: DesktopSettingsViewProps): ReactNode {
  const [controller] = useState(() => suppliedController ?? createDevicePreferencesController())
  const [snapshot, setSnapshot] = useState(() => controller.snapshot())
  const [draft, setDraft] = useState<DevicePreferenceValues | null>(() => draftFrom(controller.snapshot()))

  useEffect(() => {
    const unsubscribe = controller.subscribe((next) => {
      setSnapshot(next)
      setDraft(draftFrom(next))
    })
    void controller.refresh()
    return unsubscribe
  }, [controller])

  const update = (key: DevicePreferenceKey, value: string): void => {
    if (!isDevicePreferenceValue(key, value)) return
    setDraft(current => current === null ? null : ({ ...current, [key]: value } as DevicePreferenceValues))
  }

  const save = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (draft === null || snapshot.saving) return
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
  </section>
}
