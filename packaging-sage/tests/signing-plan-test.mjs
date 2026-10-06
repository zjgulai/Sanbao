import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { packagingRoot } from '../scripts/lib.mjs'

const stagingRoot = join(packagingRoot, 'staging')
mkdirSync(stagingRoot, { recursive: true })
const temporary = mkdtempSync(join(stagingRoot, '.signing-plan-test.'))

try {
  const app = join(temporary, 'Sage.app')
  mkdirSync(app)
  writeFileSync(join(app, 'opaque-runtime.bin'), Buffer.from([0xcf, 0xfa, 0xed, 0xfe]), { mode: 0o644 })
  const plan = execFileSync(process.execPath, [join(packagingRoot, 'scripts', 'signing-plan.mjs'), app], {
    encoding: 'utf8',
  })
  assert.match(plan, /^mach-o\topaque-runtime\.bin$/mu)
  assert.equal(plan.trimEnd().split('\n').at(-1), 'app\t.')
  process.stdout.write('signing plan includes opaque non-executable Mach-O files: PASS\n')
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
