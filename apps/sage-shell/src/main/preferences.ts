/** Ticket 020 (US-107~113) + ticket 047 (US-220~222): the eight persistable display
 * preferences, with one authoritative device value.
 *
 * The record keeps the states the surface must not merge (US-110): what was **requested** and when
 * it was last **saved**. What is *effective* is computed here: `system` resolves through the
 * desktop observation main owns (US-111), so a follower cannot claim a theme nobody observed.
 *
 * The 047 expansion widens the same record from three items to eight — the same port, the same
 * envelope, one value. A record sealed by the three-item build is a version this build never
 * wrote: it reads back as defaults, never as a half-adopted eight-item value.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { DisplayPreferenceValues } from '../appservice/contracts.js'
import { DEFAULT_DISPLAY_PREFERENCE_VALUES } from '../appservice/contracts.js'

import { createDeviceSealer } from './draft-store.js'

export type PreferenceValues = DisplayPreferenceValues

export interface PreferencesSnapshot {
  readonly requested: PreferenceValues
  /** null until the first successful save: "立即保存" wording never stands in for this (US-110). */
  readonly savedAt: string | null
  /** The theme actually in effect; null when `system` was requested but nothing observed it. */
  readonly effectiveTheme: 'light' | 'dark' | null
  readonly systemDark: boolean | null
  /** Theme and density apply live; the remaining six values are persisted for later RUNTIME-03 slices. */
  readonly applies: 'live'
}

export interface PreferencesStoreDeps {
  readonly file: string
  readonly now: () => string
  readonly randomKey: () => Buffer
}

export interface PreferencesStore {
  readonly snapshot: (systemDark: boolean | null) => PreferencesSnapshot
  /** Save a patch and return the new snapshot; a write failure is a refusal, not a silent keep. */
  readonly save: (patch: Partial<PreferenceValues>, systemDark: boolean | null) => PreferencesSnapshot | undefined
}

const DEFAULTS: PreferenceValues = DEFAULT_DISPLAY_PREFERENCE_VALUES
const FILE_VERSION = 'sage.preferences.v2'

function readValues(value: unknown): PreferenceValues {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return DEFAULTS
  const record = value as Record<string, unknown>
  const theme = record.theme === 'light' || record.theme === 'dark' || record.theme === 'system' ? record.theme : DEFAULTS.theme
  const language = record.language === 'zh' || record.language === 'en' ? record.language : DEFAULTS.language
  const density = record.density === 'comfortable' || record.density === 'compact' ? record.density : DEFAULTS.density
  const fontStyle = record.fontStyle === 'sans' || record.fontStyle === 'serif' ? record.fontStyle : DEFAULTS.fontStyle
  const contentWidth = record.contentWidth === 'standard' || record.contentWidth === 'wide' ? record.contentWidth : DEFAULTS.contentWidth
  const terminalTheme = record.terminalTheme === 'follow' || record.terminalTheme === 'manual' ? record.terminalTheme : DEFAULTS.terminalTheme
  const fileIcons = record.fileIcons === 'product' || record.fileIcons === 'material' ? record.fileIcons : DEFAULTS.fileIcons
  const iconAppearance = record.iconAppearance === 'system' || record.iconAppearance === 'light' || record.iconAppearance === 'dark' ? record.iconAppearance : DEFAULTS.iconAppearance
  return { theme, language, density, fontStyle, contentWidth, terminalTheme, fileIcons, iconAppearance }
}

function resolveTheme(values: PreferenceValues, systemDark: boolean | null): 'light' | 'dark' | null {
  if (values.theme !== 'system') return values.theme
  return systemDark === null ? null : systemDark ? 'dark' : 'light'
}

export function createPreferences(deps: PreferencesStoreDeps): PreferencesStore {
  const sealer = createDeviceSealer({
    keyFile: join(deps.file, '..', '.device-key'),
    directory: join(deps.file, '..'),
    randomKey: deps.randomKey,
  })

  const read = (): { values: PreferenceValues, savedAt: string | null } => {
    if (!existsSync(deps.file)) return { values: DEFAULTS, savedAt: null }
    try {
      if (statSync(deps.file).size > 64 * 1024) return { values: DEFAULTS, savedAt: null }
      const opened = sealer.open(readFileSync(deps.file))
      if (opened === null || typeof opened !== 'object' || Array.isArray(opened)) return { values: DEFAULTS, savedAt: null }
      const record = opened as Record<string, unknown>
      if (record.schemaVersion !== FILE_VERSION || typeof record.savedAt !== 'string') return { values: DEFAULTS, savedAt: null }
      return { values: readValues(record.values), savedAt: record.savedAt }
    } catch {
      return { values: DEFAULTS, savedAt: null }
    }
  }

  const snapshotOf = (record: { values: PreferenceValues, savedAt: string | null }, systemDark: boolean | null): PreferencesSnapshot => ({
    requested: record.values,
    savedAt: record.savedAt,
    effectiveTheme: resolveTheme(record.values, systemDark),
    systemDark,
    applies: 'live',
  })

  return {
    snapshot: (systemDark) => snapshotOf(read(), systemDark),
    save(patch, systemDark) {
      const current = read()
      const values = readValues({ ...current.values, ...patch })
      const savedAt = deps.now()
      try {
        mkdirSync(join(deps.file, '..'), { recursive: true, mode: 0o700 })
        const temporary = `${deps.file}.tmp`
        writeFileSync(temporary, sealer.seal({ schemaVersion: FILE_VERSION, values, savedAt }), { mode: 0o600 })
        renameSync(temporary, deps.file)
      } catch {
        // A failed write must not read back as saved: the surface reverts to the stored value.
        return undefined
      }
      return snapshotOf({ values, savedAt }, systemDark)
    },
  }
}
