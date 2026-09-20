import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const compilerPackage = join(ROOT, 'packages/platform/dsh-theme-local/package.json')
const helper = () => import('./theme-source-loader.mjs')

test('real theme CSS resolves three identities and rejects a missing semantic dependency', async () => {
  const { createRequire } = await import('node:module')
  const browserPackage = process.env.THEME_BROWSER_PACKAGE ?? join(ROOT, 'packages/capabilities/dsh-browser-local/package.json')
  const { chromium } = createRequire(browserPackage)('playwright-core')
  const { loadThemeSources } = await helper()
  const source = await loadThemeSources(ROOT)
  const browser = await chromium.launch({ channel: 'chrome' })
  try {
    const page = await browser.newPage()
    await page.setContent('<!doctype html><html><body><div id="probe"></div></body></html>')
    await page.addStyleTag({ content: source.shared.SANBAO_TOKEN_CSS })
    const readings = []
    for (const identity of source.identities) {
      readings.push(await page.evaluate(({ id, scheme, overrides }) => {
        document.body.dataset.sanbaoTheme = id
        document.body.toggleAttribute('data-ds-dark-theme', scheme === 'dark')
        for (const [token, pair] of Object.entries(overrides)) document.body.style.setProperty(token, pair[scheme])
        const probe = document.getElementById('probe')
        const read = () => {
          probe.style.setProperty('--test-value', 'var(--dsw-alias-bg-base)')
          return getComputedStyle(probe).getPropertyValue('--test-value').trim()
        }
        const positive = read()
        document.body.style.setProperty('--sanbao-canvas', 'initial')
        const negative = read()
        document.body.style.removeProperty('--sanbao-canvas')
        return { id, positive, negative, restored: read() }
      }, identity))
    }
    assert.equal(new Set(readings.map((r) => r.positive)).size, 3)
    for (const row of readings) {
      assert.notEqual(row.positive, '', row.id)
      assert.equal(row.negative, '', row.id)
      assert.equal(row.restored, row.positive, row.id)
    }
  } finally {
    await browser.close()
  }
})

// Reject the old type-only loader: .js specifiers must traverse actual TS dependencies.
test('loads a local runtime graph, re-exports and type-only imports without stale builds', async () => {
  const { loadPureModules } = await helper()
  const dir = mkdtempSync(join(tmpdir(), 'theme-source-test-'))
  try {
    writeFileSync(join(dir, 'leaf.ts'), 'export const value: number = 7')
    writeFileSync(join(dir, 'bridge.ts'), 'export { value } from "./leaf.js"')
    writeFileSync(join(dir, 'entry.ts'), 'import type { Absent } from "missing-type-package"; import { value } from "./bridge.js"; export const answer = value * 6')
    const entries = { fixture: join(dir, 'entry.ts') }
    assert.equal((await loadPureModules(entries, compilerPackage)).fixture.answer, 42)
    writeFileSync(join(dir, 'leaf.ts'), 'export const value: number = 8')
    assert.equal((await loadPureModules(entries, compilerPackage)).fixture.answer, 48)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('missing and non-local runtime imports fail rather than supplying fake exports', async () => {
  const { loadPureModules } = await helper()
  const dir = mkdtempSync(join(tmpdir(), 'theme-source-test-'))
  try {
    for (const specifier of ['./missing.js', 'node:fs']) {
      writeFileSync(join(dir, 'entry.ts'), `export * from ${JSON.stringify(specifier)}`)
      await assert.rejects(loadPureModules({ fixture: join(dir, 'entry.ts') }, compilerPackage))
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('real theme graph supplies all three identities, shared CSS and runtime typography', async () => {
  const { loadThemeSources } = await helper()
  const source = await loadThemeSources(ROOT)
  assert.deepEqual(source.identities.map(({ id }) => id), ['light', 'dark', 'warm-pink'])
  assert.equal(source.shared.SANBAO_TOKEN_CSS, source.localShared.SANBAO_TOKEN_CSS)
  for (const { id, scheme, overrides } of source.identities) {
    assert.equal(scheme, id === 'dark' ? 'dark' : 'light')
    assert.equal(overrides['--dsw-alias-bg-base'][scheme], 'var(--sanbao-canvas)')
    assert.match(overrides['--sanbao-font-body'][scheme], /14px\/22px/)
    assert.match(source.shared.SANBAO_TOKEN_CSS, new RegExp(`data-sanbao-theme="${id}"`))
  }
})
