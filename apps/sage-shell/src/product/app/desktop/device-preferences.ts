import {
  SAGE_DEVICE_PREFERENCES_PATH,
  SAGE_PREFERENCES_PATH,
  SAGE_REQUEST_TIMEOUT_MS,
} from '../../contracts.js'

export interface DevicePreferenceValues {
  readonly theme: 'light' | 'dark' | 'system'
  readonly language: 'zh' | 'en'
  readonly density: 'comfortable' | 'compact'
  readonly fontStyle: 'sans' | 'serif'
  readonly contentWidth: 'standard' | 'wide'
  readonly terminalTheme: 'follow' | 'manual'
  readonly fileIcons: 'product' | 'material'
  readonly iconAppearance: 'system' | 'light' | 'dark'
}

export type DevicePreferenceKey = keyof DevicePreferenceValues
export type DevicePreferencePatch = Partial<DevicePreferenceValues>

export interface DevicePreferencesState {
  readonly requested: DevicePreferenceValues
  readonly savedAt: string | null
  readonly effectiveTheme: 'light' | 'dark' | null
}

export type DevicePreferencesRead =
  | { readonly kind: 'read'; readonly value: DevicePreferencesState }
  | { readonly kind: 'unavailable'; readonly code: 'device-preferences-unavailable' | null }

export interface DevicePreferencesControllerSnapshot {
  readonly read: DevicePreferencesRead
  readonly saving: boolean
  readonly lastSave: 'idle' | 'saved' | 'refused'
}

export interface DevicePreferencesSaveResult {
  readonly outcome: 'saved' | 'refused'
  readonly read: DevicePreferencesRead
}

export interface DevicePreferencesRoot {
  readonly setAttribute: (name: string, value: string) => void
}

export interface DevicePreferencesController {
  readonly snapshot: () => DevicePreferencesControllerSnapshot
  readonly subscribe: (listener: (snapshot: DevicePreferencesControllerSnapshot) => void) => () => void
  readonly refresh: () => Promise<DevicePreferencesRead>
  readonly save: (patch: DevicePreferencePatch) => Promise<DevicePreferencesSaveResult>
}

export const DEVICE_PREFERENCE_KEYS = [
  'theme',
  'language',
  'density',
  'fontStyle',
  'contentWidth',
  'terminalTheme',
  'fileIcons',
  'iconAppearance',
] as const satisfies readonly DevicePreferenceKey[]

export const DEVICE_PREFERENCE_OPTIONS = {
  theme: ['light', 'dark', 'system'],
  language: ['zh', 'en'],
  density: ['comfortable', 'compact'],
  fontStyle: ['sans', 'serif'],
  contentWidth: ['standard', 'wide'],
  terminalTheme: ['follow', 'manual'],
  fileIcons: ['product', 'material'],
  iconAppearance: ['system', 'light', 'dark'],
} as const satisfies { readonly [Key in DevicePreferenceKey]: readonly DevicePreferenceValues[Key][] }

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index])
}

export function isDevicePreferenceValue<Key extends DevicePreferenceKey>(
  key: Key,
  value: unknown,
): value is DevicePreferenceValues[Key] {
  return typeof value === 'string' && (DEVICE_PREFERENCE_OPTIONS[key] as readonly string[]).includes(value)
}

function parseRequested(value: unknown): DevicePreferenceValues | null {
  if (!isRecord(value) || !hasExactKeys(value, DEVICE_PREFERENCE_KEYS)) return null
  for (const key of DEVICE_PREFERENCE_KEYS) {
    if (!isDevicePreferenceValue(key, value[key])) return null
  }
  return value as unknown as DevicePreferenceValues
}

function isCanonicalIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || value === '') return false
  try {
    return new Date(value).toISOString() === value
  } catch {
    return false
  }
}

/** Parse the closed GET DTO. Extra fields are rejected so an older state envelope cannot be
 *  mistaken for this device-only projection. */
export function classifyDevicePreferences(input: unknown): DevicePreferencesRead {
  if (!isRecord(input)) return { kind: 'unavailable', code: null }
  if (hasExactKeys(input, ['code', 'correlation', 'retryable', 'stage'])
    && input.code === 'device-preferences-unavailable'
    && input.stage === 'local-system'
    && input.retryable === true
    && typeof input.correlation === 'string'
    && input.correlation.length > 0) {
    return { kind: 'unavailable', code: 'device-preferences-unavailable' }
  }
  if (!hasExactKeys(input, ['effectiveTheme', 'requested', 'savedAt'])) {
    return { kind: 'unavailable', code: null }
  }
  const requested = parseRequested(input.requested)
  const savedAt = input.savedAt
  const effectiveTheme = input.effectiveTheme
  if (requested === null
    || (savedAt !== null && !isCanonicalIsoTimestamp(savedAt))
    || (effectiveTheme !== null && effectiveTheme !== 'light' && effectiveTheme !== 'dark')) {
    return { kind: 'unavailable', code: null }
  }
  return { kind: 'read', value: { requested, savedAt, effectiveTheme } }
}

type DevicePreferencesFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

function timeoutSignal(): AbortSignal {
  return AbortSignal.timeout(SAGE_REQUEST_TIMEOUT_MS)
}

export async function readDevicePreferences(
  fetcher: DevicePreferencesFetch = fetch,
  createSignal: () => AbortSignal = timeoutSignal,
): Promise<DevicePreferencesRead> {
  try {
    const response = await fetcher(SAGE_DEVICE_PREFERENCES_PATH, {
      method: 'GET',
      cache: 'no-store',
      signal: createSignal(),
    })
    if (!response.ok) return { kind: 'unavailable', code: null }
    return classifyDevicePreferences(await response.json())
  } catch {
    return { kind: 'unavailable', code: null }
  }
}

export function applyDevicePreferencesToRoot(
  root: DevicePreferencesRoot | null,
  read: DevicePreferencesRead,
): void {
  if (root === null) return
  if (read.kind !== 'read') {
    root.setAttribute('data-sage-theme-requested', 'unknown')
    root.setAttribute('data-sage-theme-effective', 'unknown')
    root.setAttribute('data-sage-density', 'unknown')
    return
  }
  root.setAttribute('data-sage-theme-requested', read.value.requested.theme)
  root.setAttribute('data-sage-theme-effective', read.value.effectiveTheme ?? 'unknown')
  root.setAttribute('data-sage-density', read.value.requested.density)
}

function normalizePatch(patch: DevicePreferencePatch): DevicePreferencePatch | null {
  if (!isRecord(patch)) return null
  const keys = Object.keys(patch)
  if (keys.length === 0 || keys.some(key => !DEVICE_PREFERENCE_KEYS.includes(key as DevicePreferenceKey))) return null
  const normalized: Partial<Record<DevicePreferenceKey, string>> = {}
  for (const key of keys as DevicePreferenceKey[]) {
    const value = patch[key]
    if (!isDevicePreferenceValue(key, value)) return null
    normalized[key] = value
  }
  return normalized as DevicePreferencePatch
}

async function postDevicePreferences(
  patch: DevicePreferencePatch,
  fetcher: DevicePreferencesFetch,
  createSignal: () => AbortSignal,
): Promise<boolean> {
  const normalized = normalizePatch(patch)
  if (normalized === null) return false
  try {
    const response = await fetcher(SAGE_PREFERENCES_PATH, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(normalized),
      signal: createSignal(),
    })
    if (!response.ok) return false
    const receipt: unknown = await response.json()
    return isRecord(receipt) && receipt.state === 'saved'
  } catch {
    return false
  }
}

function defaultRoot(): DevicePreferencesRoot | null {
  return typeof document === 'undefined' ? null : document.documentElement
}

/** One serialized controller for both Settings entries. POST receipts never update the UI: every
 *  save, including a refusal or timeout, finishes with a fresh GET and only that read may project
 *  root theme/density or form values. */
export function createDevicePreferencesController(options: {
  readonly fetcher?: DevicePreferencesFetch
  readonly createSignal?: () => AbortSignal
  readonly root?: DevicePreferencesRoot | null
} = {}): DevicePreferencesController {
  const fetcher = options.fetcher ?? fetch
  const createSignal = options.createSignal ?? timeoutSignal
  const root = options.root === undefined ? defaultRoot() : options.root
  const listeners = new Set<(snapshot: DevicePreferencesControllerSnapshot) => void>()
  let current: DevicePreferencesControllerSnapshot = {
    read: { kind: 'unavailable', code: null },
    saving: false,
    lastSave: 'idle',
  }
  let tail: Promise<void> = Promise.resolve()
  let saveInFlight: Promise<DevicePreferencesSaveResult> | null = null

  applyDevicePreferencesToRoot(root, current.read)

  const publish = (snapshot: DevicePreferencesControllerSnapshot): void => {
    current = snapshot
    for (const listener of listeners) listener(snapshot)
  }
  const authoritativeRead = async (): Promise<DevicePreferencesRead> => {
    const read = await readDevicePreferences(fetcher, createSignal)
    applyDevicePreferencesToRoot(root, read)
    publish({ ...current, read })
    return read
  }
  const enqueue = <Result>(operation: () => Promise<Result>): Promise<Result> => {
    const result = tail.then(operation, operation)
    tail = result.then(() => undefined, () => undefined)
    return result
  }

  return {
    snapshot: () => current,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    refresh: () => enqueue(authoritativeRead),
    save: (patch) => {
      if (saveInFlight !== null) return saveInFlight
      const operation = enqueue(async (): Promise<DevicePreferencesSaveResult> => {
        publish({ ...current, saving: true, lastSave: 'idle' })
        const confirmed = await postDevicePreferences(patch, fetcher, createSignal)
        const read = await authoritativeRead()
        const outcome = confirmed && read.kind === 'read' ? 'saved' as const : 'refused' as const
        publish({ read, saving: false, lastSave: outcome })
        return { outcome, read }
      })
      saveInFlight = operation
      const clear = (): void => {
        if (saveInFlight === operation) saveInFlight = null
      }
      void operation.then(clear, clear)
      return operation
    },
  }
}
