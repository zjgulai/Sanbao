import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const testDir = dirname(fileURLToPath(import.meta.url))
const clientPath = resolve(testDir, '../lib/client.js')
const settingsShellCssPath = resolve(
  testDir,
  '../../../platform/dsh-settings-shell-local/src/client/shell.css',
)
const client = readFileSync(clientPath, 'utf8')
const settingsShellCss = readFileSync(settingsShellCssPath, 'utf8')

function declaredNumber(css, variable) {
  const match = css.match(new RegExp(`${variable}\\s*:\\s*(\\d+)`))
  assert.ok(match, `missing numeric declaration for ${variable}`)
  return Number(match[1])
}

test('Settings right panel uses a drawer layer below the Settings shell contract', () => {
  const match = client.match(/whRightPanel \{[^}]*z-index:var\(--dsh-layer-drawer, (\d+)\)/)
  assert.ok(match, 'whRightPanel must declare the semantic drawer layer with a numeric fallback')

  const drawerLayer = Number(match[1])
  const settingsModalLayer = declaredNumber(settingsShellCss, '--dsh-settings-shell-modal-layer')
  const settingsRootLayer = declaredNumber(settingsShellCss, '--dsh-settings-shell-root-layer')

  assert.equal(drawerLayer < settingsModalLayer, true)
  assert.equal(drawerLayer < settingsRootLayer, true)
})

test('Settings right panel visual contract has no raw layer or gradient', () => {
  assert.doesNotMatch(client, /z-index:2500/)
  assert.doesNotMatch(client, /whRightPanelTop \{[^}]*linear-gradient/)
  assert.match(
    client,
    /whRightPanelTop \{[^}]*background:var\(--dsw-alias-state-business-primary\)/,
  )
})
