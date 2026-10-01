import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkSageAppServiceImportFirewall } from './sage-appservice-import-firewall.mjs'

test('禁止 import 的来源命中即红', () => {
  const t = mkdtempSync(join(tmpdir(), 'fw-'))
  try {
    const f = join(t, 'a.ts')
    writeFileSync(f, `import { app } from 'electron'\nexport const x = app\n`)
    const bad = checkSageAppServiceImportFirewall({ files: [f] })
    assert.equal(bad.ok, false)
    assert.ok(bad.violations.some(v => v.includes('electron')), JSON.stringify(bad.violations))
  } finally { rmSync(t, { recursive: true, force: true }) }
})

test('合法 import 判绿（node 内置与 product 类型合同允许）', () => {
  const t = mkdtempSync(join(tmpdir(), 'fw-'))
  try {
    const f = join(t, 'b.ts')
    writeFileSync(f, `import { join } from 'node:path'\nimport type { SageViewState } from '../product/contracts.js'\nexport const x = join\n`)
    assert.equal(checkSageAppServiceImportFirewall({ files: [f] }).ok, true)
  } finally { rmSync(t, { recursive: true, force: true }) }
})

test('空射程判红（分母 0 不是绿）', () => {
  assert.equal(checkSageAppServiceImportFirewall({ files: [] }).ok, false)
})

test('renderer 实现路径 / cordis / packages / vendor 均红', () => {
  for (const spec of [
    `import { x } from '../renderer/index.js'`,
    `import { ctx } from '@deepseek-ai/cordis'`,
    `import { y } from 'packages/capabilities/foo'`,
    `import { z } from '../../vendor/dsh-desktop'`,
  ]) {
    const t = mkdtempSync(join(tmpdir(), 'fw-'))
    try {
      const f = join(t, 'c.ts')
      writeFileSync(f, `${spec}\nexport const w = 1\n`)
      assert.equal(checkSageAppServiceImportFirewall({ files: [f] }).ok, false, spec)
    } finally { rmSync(t, { recursive: true, force: true }) }
  }
})
