import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { renderSageDocument } from '../src/product/renderer.js'
import { createPreferences } from '../src/main/preferences.js'
import { createUnavailableFirstService } from '../src/appservice/composition.js'
import { handleSageServiceRequest } from '../src/appservice/route-skeleton.js'
import { bootSagePage, statePayload } from './support/sage-page.js'

/**
 * Ticket 020 (US-107~113).
 *
 * The acceptance lines that live here: the two entries read and write the one authoritative value,
 * "已保存" only appears after a confirmed save, a failed save falls back to the stored value, and
 * the preferences with no entry stay that way.
 */

const cleanups: Array<() => Promise<void>> = []

afterEach(async () => {
  let cleanup = cleanups.pop()
  while (cleanup !== undefined) {
    await cleanup()
    cleanup = cleanups.pop()
  }
})

async function fresh() {
  const dir = await mkdtemp(join(tmpdir(), 'sage-prefs-'))
  cleanups.push(() => rm(dir, { recursive: true, force: true }))
  let counter = 0
  const store = createPreferences({
    file: join(dir, 'display.prefs'),
    now: () => `2026-10-02T12:00:0${String(++counter)}.000Z`,
    randomKey: () => randomBytes(32),
  })
  return { store, dir }
}

describe('the preference record', () => {
  it('starts with nothing saved and the eight-item defaults, and only a confirmed save sets savedAt', async () => {
    const { store, dir } = await fresh()
    const initial = store.snapshot(null)
    expect(initial.savedAt).toBeNull()
    expect(initial.requested).toEqual({
      theme: 'system', language: 'zh', density: 'comfortable', fontStyle: 'sans',
      contentWidth: 'standard', terminalTheme: 'follow', fileIcons: 'product', iconAppearance: 'system',
    })
    // `system` with no observation is unresolved, not "light".
    expect(initial.effectiveTheme).toBeNull()

    const saved = store.save({ theme: 'dark' }, false)
    expect(saved?.savedAt).toBe('2026-10-02T12:00:01.000Z')
    expect(saved?.requested.theme).toBe('dark')
    expect(saved?.effectiveTheme).toBe('dark')
    // Sealed at rest: no plaintext preference key values in the file.
    expect(readFileSync(join(dir, 'display.prefs'), 'utf8')).not.toContain('"theme"')
  })

  it('keeps all eight values across a restart, with the followed theme resolved by the restart observation', async () => {
    const { dir } = await fresh()
    const first = createPreferences({
      file: join(dir, 'display.prefs'),
      now: () => '2026-10-02T12:00:07.000Z',
      randomKey: () => randomBytes(32),
    })
    const written = {
      theme: 'system' as const, language: 'en' as const, density: 'compact' as const, fontStyle: 'serif' as const,
      contentWidth: 'wide' as const, terminalTheme: 'manual' as const, fileIcons: 'material' as const, iconAppearance: 'dark' as const,
    }
    expect(first.save(written, false)?.requested).toEqual(written)

    // A restart is a second store over the same directory: same device key file, same record.
    const restarted = createPreferences({
      file: join(dir, 'display.prefs'),
      now: () => '2026-10-02T13:00:00.000Z',
      randomKey: () => randomBytes(32),
    })
    const snapshot = restarted.snapshot(true)
    // 实际生效值 after the restart: the eight stored values come back, and `system` resolves
    // through the observation the restart sees — never through a recorded guess.
    expect(snapshot.requested).toEqual(written)
    expect(snapshot.savedAt).toBe('2026-10-02T12:00:07.000Z')
    expect(snapshot.effectiveTheme).toBe('dark')
    expect(restarted.snapshot(false).effectiveTheme).toBe('light')
    expect(restarted.snapshot(null).effectiveTheme).toBeNull()
  })

  it('resolves the followed theme through the observation main owns', async () => {
    const { store } = await fresh()
    store.save({ theme: 'system' }, true)
    expect(store.snapshot(true).effectiveTheme).toBe('dark')
    expect(store.snapshot(false).effectiveTheme).toBe('light')
    // An observation that is not available is its own state, never a guessed theme.
    expect(store.snapshot(null).effectiveTheme).toBeNull()
  })

  it('keeps the previous value when a save cannot be written', async () => {
    const { dir } = await fresh()
    // A regular file where the records directory should be makes every write fail.
    const { writeFileSync } = await import('node:fs')
    writeFileSync(join(dir, 'blocker'), 'not a directory')
    const store = createPreferences({
      file: join(dir, 'blocker', 'display.prefs'),
      now: () => '2026-10-02T12:00:09.000Z',
      randomKey: () => randomBytes(32),
    })
    expect(store.save({ theme: 'light', fontStyle: 'serif' }, false)).toBeUndefined()
    // Nothing was recorded: the snapshot still shows the unresolved defaults, not the attempt.
    expect(store.snapshot(false).requested.theme).toBe('system')
    expect(store.snapshot(false).requested.fontStyle).toBe('sans')
    expect(store.snapshot(false).savedAt).toBeNull()
  })
})

describe('the two entries share one value — eight items (US-108/220/221)', () => {
  const KEYS = ['theme', 'language', 'density', 'fontStyle', 'contentWidth', 'terminalTheme', 'fileIcons', 'iconAppearance'] as const
  const ID: Record<(typeof KEYS)[number], string> = {
    theme: 'theme', language: 'language', density: 'density', fontStyle: 'font-style',
    contentWidth: 'content-width', terminalTheme: 'terminal-theme', fileIcons: 'file-icons', iconAppearance: 'icon-appearance',
  }
  const STORED = {
    theme: 'dark', language: 'en', density: 'compact', fontStyle: 'serif',
    contentWidth: 'wide', terminalTheme: 'manual', fileIcons: 'material', iconAppearance: 'light',
  }
  const ALTERNATE = {
    theme: 'light', language: 'zh', density: 'comfortable', fontStyle: 'sans',
    contentWidth: 'standard', terminalTheme: 'follow', fileIcons: 'product', iconAppearance: 'dark',
  }
  const prefs = (overrides: Record<string, unknown> = {}) => ({
    requested: { ...STORED },
    savedAt: '2026-10-02T12:00:01.000Z',
    effectiveTheme: 'dark', systemDark: false, applies: 'live', ...overrides,
  })

  it('renders all eight items at both entries from the same slot', async () => {
    const harness = await bootSagePage(statePayload({ preferences: prefs() }))
    for (const key of KEYS) {
      expect(harness.node(`pref-${ID[key]}`).value, key).toBe(STORED[key])
      expect(harness.node(`menu-${ID[key]}`).value, key).toBe(STORED[key])
    }
  })

  it('moves both entries together when the projection changes — per item', async () => {
    const harness = await bootSagePage(statePayload({ preferences: prefs() }))
    harness.setPayload(statePayload({ preferences: prefs({ requested: { ...ALTERNATE }, savedAt: '2026-10-02T12:05:00.000Z', effectiveTheme: 'light' }) }))
    await harness.refresh()
    for (const key of KEYS) {
      expect(harness.node(`pref-${ID[key]}`).value, key).toBe(ALTERNATE[key])
      expect(harness.node(`menu-${ID[key]}`).value, key).toBe(ALTERNATE[key])
    }
  })

  it('applies compact and comfortable density at the root, then clears malformed, null, and unknown projections', async () => {
    const densityAttribute = 'data-sage-density'
    const harness = await bootSagePage(statePayload({ preferences: prefs() }))
    expect(harness.root.attributes[densityAttribute]).toBe('compact')
    expect(harness.node('pref-density').value).toBe('compact')
    expect(harness.node('menu-density').value).toBe('compact')

    harness.setPayload(statePayload({ preferences: prefs({ requested: { ...STORED, density: 'comfortable' } }) }))
    await harness.refresh()
    expect(harness.root.attributes[densityAttribute]).toBe('comfortable')
    expect(harness.node('pref-density').value).toBe('comfortable')
    expect(harness.node('menu-density').value).toBe('comfortable')

    const withoutDensity: Record<string, unknown> = { ...STORED }
    delete withoutDensity.density
    const invalidProjections: Array<[string, unknown]> = [
      ['malformed density', prefs({ requested: { ...STORED, density: 'spacious' } })],
      ['null density', prefs({ requested: { ...STORED, density: null } })],
      ['unknown density', prefs({ requested: withoutDensity })],
      ['null preferences', null],
    ]
    for (const [label, preferences] of invalidProjections) {
      // Seed a stale valid value so every invalid projection must actively clear it.
      harness.root.setAttribute(densityAttribute, 'compact')
      harness.setPayload(statePayload({ preferences }))
      await harness.refresh()
      expect(harness.root.attributes[densityAttribute], label).toBe('unknown')
    }
  })

  it('writes the eight items through the one route: the page patch and the per-item menu saves', async () => {
    const harness = await bootSagePage(statePayload({ preferences: prefs() }))
    for (const key of KEYS) {
      harness.node(`pref-${ID[key]}`).value = ALTERNATE[key]
    }
    harness.node('pref-save').dispatch('click')
    await harness.refresh()
    expect(harness.requests[0]).toEqual({ path: '/.sage/preferences', body: { ...ALTERNATE } })

    // The quick menu writes one item per change — eight more patches, one key each.
    let next = 1
    for (const key of KEYS) {
      harness.node(`menu-${ID[key]}`).value = ALTERNATE[key]
      harness.node(`menu-${ID[key]}`).dispatch('change')
      await harness.settle()
      expect(harness.requests[next], key).toEqual({ path: '/.sage/preferences', body: { [key]: ALTERNATE[key] } })
      next += 1
    }
  })

  it('shows the saved value at both entries only after a confirmed save', async () => {
    const saved = prefs({ requested: { ...ALTERNATE }, savedAt: '2026-10-02T12:06:00.000Z', effectiveTheme: 'light' })
    const harness = await bootSagePage(statePayload({ preferences: prefs() }), {
      '/.sage/preferences': { state: 'saved', preferences: saved },
    })
    // The POST answers its narrow receipt; the following GET remains the exact nested state envelope.
    harness.setPayload(statePayload({ preferences: saved }))
    harness.node('pref-save').dispatch('click')
    await harness.refresh()
    expect(harness.node('pref-note').textContent).toContain('已保存到本设备：2026-10-02T12:06:00.000Z')
    expect(harness.node('pref-font-style').value).toBe('sans')
    expect(harness.node('menu-font-style').value).toBe('sans')
    expect(harness.node('menu-note').textContent).not.toContain('保存失败')
  })

  it('says 已保存 only with a savedAt, and never lets 立即生效 stand in for persistence', async () => {
    const unsaved = await bootSagePage(statePayload({ preferences: prefs({ savedAt: null }) }))
    const note = unsaved.node('pref-note').textContent
    expect(note).toContain('还没有成功保存过')
    expect(note).toContain('立即生效不等于已持久化')
    expect(note).not.toContain('已保存到本设备')

    const saved = await bootSagePage(statePayload({ preferences: prefs() }))
    expect(saved.node('pref-note').textContent).toContain('已保存到本设备')
    expect(saved.node('pref-note').textContent).toContain('主题与密度即时生效；其余六项仅保存，尚未接入产品显示。')
    expect(saved.node('pref-note').textContent).not.toContain('八项都即时生效')
    expect(saved.node('pref-note').textContent).not.toContain('无需重启')
  })

  it('falls back to the stored value when a save is refused — at either entry', async () => {
    const harness = await bootSagePage(statePayload({ preferences: prefs() }))
    // The service refuses (no provider): the page selects snap back to the stored value.
    harness.root.setAttribute('data-sage-density', 'comfortable')
    harness.node('pref-theme').value = 'system'
    harness.node('pref-icon-appearance').value = 'system'
    harness.node('pref-save').dispatch('click')
    await harness.refresh()
    expect(harness.node('pref-note').textContent).toContain('保存失败：显示值已回退')
    expect(harness.node('pref-theme').value).toBe('dark')
    expect(harness.node('pref-icon-appearance').value).toBe('light')
    expect(harness.node('menu-theme').value).toBe('dark')
    expect(harness.root.attributes['data-sage-density']).toBe('compact')

    // The quick menu has its own failure sentence and its own fallback — no entry claims a save.
    harness.root.setAttribute('data-sage-density', 'comfortable')
    harness.node('menu-font-style').value = 'sans'
    harness.node('menu-font-style').dispatch('change')
    await harness.refresh()
    expect(harness.node('menu-note').textContent).toContain('保存失败：显示值已回退')
    expect(harness.node('menu-font-style').value).toBe('serif')
    expect(harness.node('pref-font-style').value).toBe('serif')
    expect(harness.root.attributes['data-sage-density']).toBe('compact')
  })

  it('says 未核验 for a followed theme nobody observed', async () => {
    const harness = await bootSagePage(statePayload({ preferences: prefs({ requested: { theme: 'system', language: 'zh', density: 'comfortable', fontStyle: 'sans', contentWidth: 'standard', terminalTheme: 'follow', fileIcons: 'product', iconAppearance: 'system' }, effectiveTheme: null, systemDark: null }) }))
    expect(harness.node('pref-note').textContent).toContain('还没有系统明暗观察')
  })

  it('marks the off-list appearance items non-configurable, and gives them no control (US-222)', () => {
    const document = renderSageDocument()
    const start = document.indexOf('id="appearance-deferred"')
    const end = document.indexOf('id="settings-leaf-section"')
    expect(start).toBeGreaterThan(0)
    expect(end).toBeGreaterThan(start)
    const section = document.slice(start, end)
    for (const [item, label] of [['shortcuts', '快捷键'], ['voice', '语音'], ['task-monitor-layout', '任务监控浮层布局']] as const) {
      const row = /data-deferred-item="[^"]*"[\s\S]*?<\/li>/gu
      const rows = [...section.matchAll(row)].map((match) => match[0])
      const own = rows.find((candidate) => candidate.includes(`data-deferred-item="${item}"`))
      expect(own, item).toBeDefined()
      expect(own, item).toContain(label)
      // Each deferred row carries its own 不可配置 tag — not only a section-level sentence.
      expect(own, item).toContain('不可配置')
    }
    // No "looks editable" control for a deferred item: the block carries none at all.
    expect([...section.matchAll(/<button|<input|<select/gu)]).toHaveLength(0)
    // And nowhere in the document does a control carry one of the deferred labels.
    for (const match of document.matchAll(/<(?:button|select|input)[^>]*aria-label="([^"]*)"/gu)) {
      expect(match[1], match[1]).not.toMatch(/快捷键|语音|布局/u)
    }
  })

  it('offers no entry for the deferred preferences and no in-app browser switch (US-112/113)', () => {
    const document = renderSageDocument()
    for (const banned of ['快捷键', '语音', '内置浏览器']) {
      expect(document, banned).toContain(banned) // stated as out of scope
    }
    const labels = [...document.matchAll(/<button[^>]*>([^<]*)</gu)].map((match) => match[1])
    for (const banned of ['快捷键', '语音', '布局偏好', '浏览器']) {
      expect(labels.some((label) => label.includes(banned)), banned).toBe(false)
    }
  })

})

describe('the preferences route', () => {
  const defaults = {
    theme: 'system', language: 'zh', density: 'comfortable', fontStyle: 'sans',
    contentWidth: 'standard', terminalTheme: 'follow', fileIcons: 'product', iconAppearance: 'system',
  } as const
  it('accepts only the eight known keys and their known values, and answers unavailable-first when unwired', async () => {
    const seen: string[] = []
    const providers = createUnavailableFirstService(null, {
      preferences: () => ({ requested: { ...defaults }, savedAt: null, effectiveTheme: null, systemDark: null, applies: 'live' }),
      preferencesSave: (request) => {
        seen.push(JSON.stringify(request))
        return { requested: { ...defaults, ...request }, savedAt: 't', effectiveTheme: 'dark', systemDark: false, applies: 'live' }
      },
    })
    const post = (body: string, target = providers) => handleSageServiceRequest(
      new Request('dsh-app://app/.sage/preferences', { method: 'POST', headers: { 'content-type': 'application/json' }, body }),
      { callerBinding: { correlation: 'c-020' }, providers: target } as never,
    )
    expect(await (await post(JSON.stringify({ theme: 'dark' }))).json()).toMatchObject({ state: 'saved' })
    // Each of the four new items takes its own patch on the same route.
    expect(await (await post(JSON.stringify({ fontStyle: 'serif', terminalTheme: 'manual' }))).json()).toMatchObject({ state: 'saved' })
    expect(await (await post(JSON.stringify({ contentWidth: 'wide', fileIcons: 'material', iconAppearance: 'dark' }))).json()).toMatchObject({ state: 'saved' })
    expect(seen).toEqual(['{"theme":"dark"}', '{"fontStyle":"serif","terminalTheme":"manual"}', '{"contentWidth":"wide","fileIcons":"material","iconAppearance":"dark"}'])

    for (const body of [
      'not json', '{}',
      JSON.stringify({ theme: 'blue' }), JSON.stringify({ density: 'spacious' }),
      JSON.stringify({ fontStyle: 'mono' }), JSON.stringify({ contentWidth: 'full' }),
      JSON.stringify({ terminalTheme: 'auto' }), JSON.stringify({ fileIcons: 'solar' }),
      JSON.stringify({ iconAppearance: 'sepia' }),
      JSON.stringify({ theme: 'dark', extra: 1 }),
      JSON.stringify({ ...defaults, extra: 1 }),
    ]) {
      expect((await post(body)).status, body).toBe(400)
    }
    expect(await (await post(JSON.stringify({ iconAppearance: 'dark' }), createUnavailableFirstService(null, {}))).json())
      .toEqual({ state: 'refused', code: 'preferences-unavailable' })
  })
})

describe('a record this build does not understand', () => {
  it('falls back to the defaults instead of adopting a foreign or older schema version', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sage-prefs-schema-'))
    cleanups.push(() => rm(dir, { recursive: true, force: true }))
    const file = join(dir, 'display.prefs')
    // First save creates the device key; then records are sealed here with the same envelope shape
    // but a schema version this build never wrote (foreign, and the older three-item record).
    const store = createPreferences({ file, now: () => 't1', randomKey: () => randomBytes(32) })
    expect(store.save({ theme: 'light' }, false)?.requested.theme).toBe('light')

    const { createCipheriv } = await import('node:crypto')
    const { writeFileSync } = await import('node:fs')
    const key = readFileSync(join(dir, '.device-key'))
    const seal = (record: unknown): void => {
      const iv = randomBytes(12)
      const cipher = createCipheriv('aes-256-gcm', key, iv)
      const body = Buffer.concat([cipher.update(JSON.stringify(record), 'utf8'), cipher.final()])
      writeFileSync(file, JSON.stringify({ v: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: body.toString('base64') }))
    }

    seal({ schemaVersion: 'sage.preferences.v0', values: { theme: 'dark', language: 'zh', density: 'comfortable' }, savedAt: 't9' })
    // Not adopted: the defaults come back and nothing claims it was saved.
    let snapshot = store.snapshot(false)
    expect(snapshot.requested).toEqual({
      theme: 'system', language: 'zh', density: 'comfortable', fontStyle: 'sans',
      contentWidth: 'standard', terminalTheme: 'follow', fileIcons: 'product', iconAppearance: 'system',
    })
    expect(snapshot.savedAt).toBeNull()

    // The three-item record the previous build wrote is not half-adopted either: an eight-item
    // value is never claimed from a record that only asked for three.
    seal({ schemaVersion: 'sage.preferences.v1', values: { theme: 'dark', language: 'en', density: 'compact' }, savedAt: 't9' })
    snapshot = store.snapshot(false)
    expect(snapshot.requested.theme).toBe('system')
    expect(snapshot.requested.fontStyle).toBe('sans')
    expect(snapshot.savedAt).toBeNull()
  })
})
