import test from 'node:test'
import assert from 'node:assert/strict'
import { checkSageProductBoundary } from './sage-product-boundary.mjs'

const files = [
  { path: 'apps/sage-shell/src/product/contracts.ts', text: 'export const state = "/.sage/state"' },
  { path: 'apps/sage-shell/src/product/state.ts', text: 'export const state = "ready"' },
  { path: 'apps/sage-shell/src/product/renderer.ts', text: 'export const render = () => "Sage"' },
  { path: 'apps/sage-shell/src/adapter/contracts.ts', text: 'export interface Port {}' },
  { path: 'apps/sage-shell/src/adapter/capability-adapter.ts', text: "const connection = ctx.get('connection')" },
  { path: 'apps/sage-shell/src/adapter/handler.ts', text: 'export const handler = true' },
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

test('rejects a missing required product file and a retired source file', () => {
  const missing = checkSageProductBoundary({ files: files.filter((file) => !file.path.endsWith('/renderer.ts')) })
  assert.equal(missing.passed, false)
  assert.match(missing.violations[0], /renderer\.ts/u)

  const retired = checkSageProductBoundary({
    files: [...files, { path: 'apps/sage-shell/src/host/streams.ts', text: 'export const legacy = true' }],
  })
  assert.equal(retired.passed, false)
  assert.ok(retired.violations.some((violation) => violation.includes('retired')))
})

test('rejects every product-side escape hatch and direct host service access', () => {
  for (const token of ['/api', '/plugins', '/.dsh/remote-stream', '/.sanbao/', '__DSH_TRANSPORT__', 'localStorage', 'ctx.get(', '@deepseek-ai/', '../host/']) {
    const result = checkSageProductBoundary({
      files: withFile('apps/sage-shell/src/product/renderer.ts', 'const drift = ' + JSON.stringify(token)),
    })
    assert.equal(result.passed, false, token)
    assert.ok(result.violations.some((violation) => violation.includes(token)), token)
  }

  const directHost = checkSageProductBoundary({
    files: withFile('apps/sage-shell/src/host/index.ts', "const drift = ctx.get('connection')"),
  })
  assert.equal(directHost.passed, false)
  assert.ok(directHost.violations.some((violation) => violation.includes('outside')))
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
