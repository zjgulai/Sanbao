import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  createDisplayThemeAdapter,
  type NativeThemePort,
  type RequestedDisplayTheme,
} from '../src/main/display-theme.js'

function recordingPort(initial: RequestedDisplayTheme = 'system') {
  let current = initial
  const writes: RequestedDisplayTheme[] = []
  const port: NativeThemePort = {
    get themeSource() {
      return current
    },
    set themeSource(value) {
      writes.push(value)
      current = value
    },
  }
  return { port, writes }
}

describe('the injected Electron display-theme adapter (RUNTIME-03A)', () => {
  it.each(['system', 'light', 'dark'] as const)('maps requested %s exactly to nativeTheme.themeSource', (requested) => {
    const { port, writes } = recordingPort()
    const outcome = createDisplayThemeAdapter(port).apply(requested)

    expect(outcome).toEqual({ state: 'applied', requestedTheme: requested, themeSource: requested })
    expect(writes).toEqual([requested])
    expect(outcome).not.toHaveProperty('effectiveTheme')
  })

  it('refuses an invalid requested value without touching nativeTheme', () => {
    const { port, writes } = recordingPort('dark')
    const outcome = createDisplayThemeAdapter(port).apply('sepia')

    expect(outcome).toEqual({ state: 'refused', code: 'invalid-requested-theme', requestedTheme: null })
    expect(writes).toEqual([])
    expect(port.themeSource).toBe('dark')
  })

  it('refuses when the nativeTheme port is unavailable instead of guessing an effective theme', () => {
    const outcome = createDisplayThemeAdapter(null).apply('system')

    expect(outcome).toEqual({ state: 'refused', code: 'native-theme-unavailable', requestedTheme: 'system' })
    expect(outcome).not.toHaveProperty('effectiveTheme')
  })

  it('fails closed when Electron rejects the write', () => {
    const port: NativeThemePort = {
      get themeSource() {
        return 'system'
      },
      set themeSource(_value) {
        throw new Error('native theme unavailable')
      },
    }

    expect(createDisplayThemeAdapter(port).apply('dark')).toEqual({
      state: 'refused',
      code: 'native-theme-apply-failed',
      requestedTheme: 'dark',
    })
  })

  it('fails closed when the nativeTheme readback does not match the requested source', () => {
    const writes: RequestedDisplayTheme[] = []
    const port: NativeThemePort = {
      get themeSource() {
        return 'system'
      },
      set themeSource(value) {
        writes.push(value)
      },
    }

    expect(createDisplayThemeAdapter(port).apply('light')).toEqual({
      state: 'refused',
      code: 'native-theme-apply-failed',
      requestedTheme: 'light',
    })
    expect(writes).toEqual(['light'])
  })

  it('restores persisted theme before BrowserWindow creation and applies a save only after persistence', () => {
    const mainSource = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'main', 'index.ts'), 'utf8')
    const restoreIndex = mainSource.indexOf('const restoredTheme = displayTheme.apply(')
    const windowIndex = mainSource.indexOf('const window = createSageWindow(')
    const saveIndex = mainSource.indexOf('const saved = preferences.save(')
    const saveGuardIndex = mainSource.indexOf("if (saved === undefined) return undefined", saveIndex)
    const applyIndex = mainSource.indexOf('const applied = displayTheme.apply(saved.requested.theme)', saveIndex)

    expect(restoreIndex).toBeGreaterThan(-1)
    expect(windowIndex).toBeGreaterThan(restoreIndex)
    expect(saveIndex).toBeGreaterThan(-1)
    expect(saveGuardIndex).toBeGreaterThan(saveIndex)
    expect(applyIndex).toBeGreaterThan(saveGuardIndex)
  })
})
