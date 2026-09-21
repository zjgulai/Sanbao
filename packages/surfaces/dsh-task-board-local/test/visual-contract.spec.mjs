import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'

const clientSource = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')

function cssRule(selector) {
  const start = clientSource.indexOf(`${selector} {`)
  assert.notEqual(start, -1, `missing ${selector}`)
  return clientSource.slice(start, clientSource.indexOf('}', start))
}

test('看板面板随主题解析 CSS，不在 apply 时读取或固化背景', () => {
  /** @type {{ apply: (ctx: unknown) => void } | undefined} */
  let plugin
  let reads = 0
  const writes = []
  const styles = []
  runInNewContext(clientSource, {
    window: {
      __ModuleLoader__: { load: ({ factory }) => { plugin = factory(() => ({ createElement() {} })) } },
      addEventListener() {},
      matchMedia: () => { reads++; return { matches: true } },
    },
    document: {
      body: {},
      documentElement: { lang: 'en', style: { setProperty: (...args) => writes.push(args) } },
      createElement: () => ({ setAttribute() {} }),
      head: { appendChild: (style) => styles.push(style) },
    },
    getComputedStyle: () => { reads++; return { backgroundColor: 'rgb(35, 35, 36)' } },
  })
  assert.ok(plugin, 'client factory must register the plugin')
  plugin.apply({ get: (key) => key === 'slots' ? { inject() {} } : undefined, effect() {} })
  assert.equal(reads, 0, 'apply must not sample the current theme')
  assert.deepEqual(writes, [], 'apply must not pin a root background property')
  assert.equal(styles.length, 1)
  assert.doesNotMatch(styles[0].textContent, /--tb-panel-bg/)
  for (const selector of ['.dsh-tb-panel', '.dsh-tb-main-panel, .dsh-tb-child-panel', '.dsh-tb-card', '.dsh-tb-manual-dialog']) {
    assert.match(cssRule(selector), /background:var\(--dsw-alias-bg-layer-1\)/)
  }
})

test('看板主操作使用主题前景，危险操作保留独立语义', () => {
  for (const selector of ['.dsh-tb-root-create button:first-child', '.dsh-tb-manual-actions button.dsh-tb-primary']) {
    assert.match(cssRule(selector), /color:var\(--sanbao-on-accent\)/)
    assert.match(cssRule(selector), /background:var\(--sanbao-accent-fill\)/)
  }
  assert.match(cssRule('.dsh-tb-manual-actions button.dsh-tb-danger'), /color:var\(--dsw-alias-state-error-primary\)/)
  assert.match(cssRule('.dsh-tb-manual-actions button.dsh-tb-danger'), /background:var\(--sanbao-error-surface\)/)
})

test('看板视觉合同：使用语义 token、克制层级并支持 reduced motion', () => {
  assert.match(clientSource, /var\(--dsw-alias-bg-base\)/)
  assert.match(clientSource, /transition:border-color 180ms ease/)
  assert.match(clientSource, /prefers-reduced-motion: reduce/)
  assert.match(clientSource, /--dsw-alias-state-warn-primary/)
  assert.doesNotMatch(clientSource, /background(?:-image)?:linear-gradient/)
})
