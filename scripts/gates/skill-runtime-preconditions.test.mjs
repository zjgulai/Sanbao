import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { checkSkillRuntimePreconditions } from './skill-runtime-preconditions.mjs'

const temps = []
afterEach(() => {
  while (temps.length > 0) rmSync(temps.pop(), { recursive: true, force: true })
})

test('没有已接线技能时必须显式 skip，不能与运行时前提已核对同形', () => {
  const presetDir = mkdtempSync(join(tmpdir(), 'skill-runtime-empty-'))
  temps.push(presetDir)

  const result = checkSkillRuntimePreconditions({ repoRoot: '/not-used-for-empty-scope', presetDir })

  assert.equal(result.passed, true)
  assert.equal(result.skipped, true)
  assert.deepEqual(result.violations, [])
  assert.match(result.note, /未核对任何运行时前提/)
})
