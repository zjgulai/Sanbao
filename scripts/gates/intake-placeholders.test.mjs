import assert from 'node:assert/strict'
import { test } from 'node:test'

import { INTAKE_SURFACE_FILES, scanIntakeSurface } from './intake-placeholders.mjs'

const PROVENANCE = INTAKE_SURFACE_FILES[0]
const RUNTIME_DEPS = INTAKE_SURFACE_FILES[1]

/** 占位符形态的两份干净读数（与仓库当前已提交的形态一致）。 */
const cleanFiles = () => [
  {
    relPath: PROVENANCE,
    text: '{\n  "_meta": {\n    "from": "__SKILL_INTAKE_SOURCE__",\n    "updated": "2026-09-17T17:52:51.679Z"\n  },\n  "skills": {\n    "a": { "sourceUnit": "__SKILL_INTAKE_SOURCE__/Manus/skill02/a.zip" }\n  }\n}\n',
  },
  {
    relPath: RUNTIME_DEPS,
    text: '{\n  "_meta": {\n    "from": "__SKILL_INTAKE_SOURCE__",\n    "venvPython": "__DSH_HOME__/skills-runtime/.venv/bin/python"\n  }\n}\n',
  },
]

test('两份清单都是占位符形态：通过，且 note 带占位符计数与分母', () => {
  const result = scanIntakeSurface({ files: cleanFiles() })

  assert.equal(result.passed, true)
  assert.deepEqual(result.violations, [])
  assert.match(result.note, /扫描 2 个入库面文件/)
  assert.match(result.note, /__SKILL_INTAKE_SOURCE__ ×3/)
  assert.match(result.note, /__DSH_HOME__ ×1/)
})

test('构建机路径被写回：判红并点名文件与行（P-48 的负例重放）', () => {
  const files = cleanFiles()
  files[0].text = files[0].text.replace('"from": "__SKILL_INTAKE_SOURCE__"', '"from": "/Users/lute/Downloads/skills"')

  const result = scanIntakeSurface({ files })

  assert.equal(result.passed, false)
  assert.equal(result.violations.length, 1)
  assert.match(result.violations[0], new RegExp(`${PROVENANCE.replace(/[/.]/g, '\\$&')}:3`))
  assert.match(result.violations[0], /\/Users\/lute\/Downloads\/skills/)
  assert.match(result.violations[0], /__SKILL_INTAKE_SOURCE__/)
})

test('字面 $HOME 同样判红（它是「运行期再解析」写错了位置）', () => {
  const files = cleanFiles()
  files[1].text = files[1].text.replace('__DSH_HOME__/skills-runtime/.venv/bin/python', '$HOME/.dsh/skills-runtime/.venv/bin/python')

  const result = scanIntakeSurface({ files })

  assert.equal(result.passed, false)
  assert.match(result.violations[0], new RegExp(RUNTIME_DEPS.replace(/[/.]/g, '\\$&')))
  assert.match(result.violations[0], /\$HOME/)
})

test('venvPython 的直接家目录写法（未占位化）也判红', () => {
  const files = cleanFiles()
  files[1].text = files[1].text.replace('__DSH_HOME__', '/Users/someone')

  assert.equal(scanIntakeSurface({ files }).passed, false)
})

test('文件读不到时 fail-closed：「读不到」不等于「干净」（P-15）', () => {
  const result = scanIntakeSurface({ files: [{ relPath: PROVENANCE, text: null }] })

  assert.equal(result.passed, false)
  assert.match(result.violations.join('\n'), /读不到/)
})

test('射程为空判红：一个文件都没扫与「都扫过且干净」必须分开', () => {
  const result = scanIntakeSurface({ files: [] })

  assert.equal(result.passed, false)
  assert.match(result.violations.join('\n'), /射程为空/)
})

test('射程清单本身是常量：两份文件都在（防止有人把其中一份从射程里摘掉）', () => {
  assert.equal(INTAKE_SURFACE_FILES.length, 2)
  assert.ok(INTAKE_SURFACE_FILES.every((file) => file.endsWith('.json')))
  assert.ok(INTAKE_SURFACE_FILES.some((file) => file.endsWith('intake-provenance.json')))
  assert.ok(INTAKE_SURFACE_FILES.some((file) => file.endsWith('runtime-deps.json')))
})
