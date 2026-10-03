import test from 'node:test'
import assert from 'node:assert/strict'
import { checkSageProductBoundary } from './sage-product-boundary.mjs'

const files = [
  { path: 'apps/sage-shell/src/product/contracts.ts', text: 'export const state = "/.sage/state"' },
  { path: 'apps/sage-shell/src/product/renderer.ts', text: 'export const render = () => "Sage"' },
  { path: 'apps/sage-shell/src/host/assets.ts', text: 'export const asset = true' },
  { path: 'apps/sage-shell/src/host/index.ts', text: 'export const host = true' },
  { path: 'apps/sage-shell/src/profile/layout.ts', text: 'export const layout = true' },
]

function withFile(path, text) {
  return files.map((file) => file.path === path ? { ...file, text } : file)
}

test('passes the minimal self-owned Sage source boundary', () => {
  const result = checkSageProductBoundary({ files })
  assert.equal(result.passed, true)
  assert.deepEqual(result.violations, [])
})

test('rejects a missing required product file and retired source files', () => {
  const missing = checkSageProductBoundary({ files: files.filter((file) => !file.path.endsWith('/renderer.ts')) })
  assert.equal(missing.passed, false)
  assert.match(missing.violations[0], /renderer\.ts/u)

  const retiredStreams = checkSageProductBoundary({
    files: [...files, { path: 'apps/sage-shell/src/host/streams.ts', text: 'export const legacy = true' }],
  })
  assert.equal(retiredStreams.passed, false)
  assert.ok(retiredStreams.violations.some((violation) => violation.includes('retired')))

  // WT-02D.1: the retired P0-2 adapter surface must not re-enter through source drift.
  const retiredAdapter = checkSageProductBoundary({
    files: [...files, { path: 'apps/sage-shell/src/adapter/handler.ts', text: 'export const handler = true' }],
  })
  assert.equal(retiredAdapter.passed, false)
  assert.ok(retiredAdapter.violations.some((violation) => violation.includes('adapter/handler.ts') && violation.includes('retired')))
})

test('rejects every product-side escape hatch and keeps the service ban off the host process only', () => {
  for (const token of ['/api', '/plugins', '/.dsh/remote-stream', '/.sanbao/', '__DSH_TRANSPORT__', 'localStorage', 'ctx.get(', '@deepseek-ai/', '../host/']) {
    const result = checkSageProductBoundary({
      files: withFile('apps/sage-shell/src/product/renderer.ts', 'const drift = ' + JSON.stringify(token)),
    })
    assert.equal(result.passed, false, token)
    assert.ok(result.violations.some((violation) => violation.includes(token)), token)
  }

  // ADR-0198: the Cordis host process may read a service — the consumption registry
  // (gate:sage-service-consumption) is what reds an unregistered or stale consumer.
  const hostRead = checkSageProductBoundary({
    files: withFile('apps/sage-shell/src/host/readonly-bridge.ts', "const settings = ctx.get('settingsController')"),
  })
  assert.equal(hostRead.passed, true, JSON.stringify(hostRead.violations))

  // Every other source tree keeps the lexical ban, so the ban cannot be walked out of.
  for (const path of ['apps/sage-shell/src/main/index.ts', 'apps/sage-shell/src/appservice/composition.ts', 'apps/sage-shell/src/profile/paths.ts']) {
    const result = checkSageProductBoundary({
      files: [...files, { path, text: "const drift = ctx.get('settingsController')" }],
    })
    assert.equal(result.passed, false, path)
    assert.ok(result.violations.some((violation) => violation.includes(path) && violation.includes('ctx.get')), path)
  }
})

test('rejects an upstream product token but ignores a comment that documents the guard', () => {
  const leaked = checkSageProductBoundary({
    files: withFile('apps/sage-shell/src/host/assets.ts', 'const drift = "@deepseek-ai/dsh-web-frontend"'),
  })
  assert.equal(leaked.passed, false)
  assert.ok(leaked.violations.some((violation) => violation.includes('dsh-web-frontend')))

  const documented = checkSageProductBoundary({
    files: withFile('apps/sage-shell/src/host/assets.ts', '// @deepseek-ai/dsh-web-frontend must never be served here'),
  })
  assert.equal(documented.passed, true)
})

test('fails loud on an empty scan', () => {
  const result = checkSageProductBoundary({ files: [] })
  assert.equal(result.passed, false)
  assert.match(result.violations[0], /no readable source/u)
})
