import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  normalizeGateResult,
  runGateChecks,
  summarizeGateResults,
  validateGateResult,
} from './gate-result.mjs'

const PASS = {
  status: 'pass',
  expected: 2,
  discovered: 2,
  checked: 2,
  skipped: 0,
  failed: 0,
  typedSkips: [],
  reason: '全部对象均已核对',
  note: 'fixture pass',
  violations: [],
}

test('canonical pass 保留统一 schema', () => {
  const result = normalizeGateResult(PASS, { name: 'pass-fixture' })

  assert.deepEqual(result, PASS)
  assert.deepEqual(validateGateResult(result), { valid: true, errors: [] })
})

test('canonical skip 要求 typed skip 守恒', () => {
  const result = normalizeGateResult({
    status: 'skip',
    expected: 3,
    discovered: 1,
    checked: 1,
    skipped: 2,
    failed: 0,
    typedSkips: [
      { type: 'optional-environment-missing', count: 2, reason: 'fixture runtime 未安装' },
    ],
    reason: '部分可选环境不存在',
    note: '已核对 1，跳过 2',
    violations: [],
  }, { name: 'skip-fixture' })

  assert.equal(result.status, 'skip')
  assert.equal(result.skipped, 2)
  assert.equal(result.typedSkips[0].type, 'optional-environment-missing')
})

test('legacy pass 一次性映射为一个已核对 gate 单元', () => {
  const result = normalizeGateResult({ passed: true, violations: [], note: 'legacy ok' }, { name: 'legacy-pass' })

  assert.deepEqual(result, {
    status: 'pass',
    expected: 1,
    discovered: 1,
    checked: 1,
    skipped: 0,
    failed: 0,
    typedSkips: [],
    reason: 'legacy checker passed',
    note: 'legacy ok',
    violations: [],
  })
})

test('legacy passed+skipped 映射为 typed skip，不计作 pass', () => {
  const result = normalizeGateResult({
    passed: true,
    skipped: true,
    violations: [],
    note: '可选 app 未安装',
  }, { name: 'legacy-skip' })

  assert.equal(result.status, 'skip')
  assert.equal(result.checked, 0)
  assert.equal(result.skipped, 1)
  assert.deepEqual(result.typedSkips, [
    { type: 'legacy-skip', count: 1, reason: '可选 app 未安装' },
  ])
})

test('legacy fail 保留违规并映射为一个失败单元', () => {
  const result = normalizeGateResult({ passed: false, violations: ['缺少治理文件'] }, { name: 'legacy-fail' })

  assert.equal(result.status, 'fail')
  assert.equal(result.failed, 1)
  assert.equal(result.reason, 'legacy checker failed')
  assert.deepEqual(result.violations, ['缺少治理文件'])
})

test('legacy skip 缺 reason/note 时 fail-closed', () => {
  const result = normalizeGateResult({ passed: true, skipped: true, violations: [] }, { name: 'silent-skip' })

  assert.equal(result.status, 'fail')
  assert.match(result.reason, /result schema invalid/)
  assert.match(result.violations.join('\n'), /skip.*reason|note/i)
})

test('守恒不成立时 fail-closed', () => {
  const result = normalizeGateResult({ ...PASS, expected: 3 }, { name: 'bad-accounting' })

  assert.equal(result.status, 'fail')
  assert.equal(result.expected, 1)
  assert.equal(result.failed, 1)
  assert.match(result.violations.join('\n'), /expected.*checked.*skipped.*failed/)
})

test('typed skip 总数与 skipped 不一致时 fail-closed', () => {
  const result = normalizeGateResult({
    status: 'skip',
    expected: 2,
    discovered: 0,
    checked: 0,
    skipped: 2,
    failed: 0,
    typedSkips: [{ type: 'optional-environment-missing', count: 1, reason: '只解释了一个' }],
    reason: '跳过',
    violations: [],
  }, { name: 'bad-typed-skip' })

  assert.equal(result.status, 'fail')
  assert.match(result.violations.join('\n'), /typedSkips.*skipped/)
})

test('canonical pass checked=0 与混用 legacy 字段都 fail-closed', () => {
  const vacuous = normalizeGateResult({ ...PASS, expected: 0, discovered: 0, checked: 0 }, { name: 'vacuous' })
  const mixed = normalizeGateResult({ ...PASS, passed: true }, { name: 'mixed' })

  assert.equal(vacuous.status, 'fail')
  assert.match(vacuous.violations.join('\n'), /pass.*checked/i)
  assert.equal(mixed.status, 'fail')
  assert.match(mixed.violations.join('\n'), /legacy/i)
})

test('非法返回值 fail-closed 且不回显原始对象', () => {
  const result = normalizeGateResult(null, { name: 'null-result' })

  assert.equal(result.status, 'fail')
  assert.equal(result.failed, 1)
  assert.match(result.reason, /null-result.*result schema invalid/)
  assert.deepEqual(result.typedSkips, [])
})

test('runGateChecks 捕获 checker throw 并返回可追溯 fail', () => {
  const run = runGateChecks([
    {
      name: 'throwing-check',
      run() {
        throw new Error('fixture exploded')
      },
    },
  ])

  assert.equal(run.results[0].status, 'fail')
  assert.equal(run.results[0].name, 'throwing-check')
  assert.match(run.results[0].reason, /checker threw/)
  assert.match(run.results[0].violations.join('\n'), /fixture exploded/)
  assert.equal(run.summary.failed, 1)
  assert.equal(run.exitCode, 1)
})

test('runGateChecks 汇总 pass/fail/skip，skip 不计入 pass', () => {
  const checks = [
    { name: 'pass', run: () => PASS },
    { name: 'skip', run: () => ({ passed: true, skipped: true, violations: [], note: '可选环境不存在' }) },
    { name: 'fail', run: () => ({ passed: false, violations: ['fixture failure'] }) },
  ]
  const run = runGateChecks(checks)

  assert.deepEqual(
    {
      total: run.summary.total,
      passed: run.summary.passed,
      skipped: run.summary.skipped,
      failed: run.summary.failed,
    },
    { total: 3, passed: 1, skipped: 1, failed: 1 },
  )
  assert.equal(run.summary.expected, 4)
  assert.equal(run.summary.checked, 2)
  assert.equal(run.summary.skippedObjects, 1)
  assert.equal(run.summary.failedObjects, 1)
  assert.equal(run.exitCode, 1)
})

test('requireNoSkip 令纯 skip 汇总非零退出', () => {
  const checks = [
    { name: 'pass', run: () => PASS },
    { name: 'skip', run: () => ({ passed: true, skipped: true, violations: [], note: '可选环境不存在' }) },
  ]
  const normal = runGateChecks(checks)
  const strict = runGateChecks(checks, { requireNoSkip: true })

  assert.equal(normal.summary.status, 'skip')
  assert.equal(normal.exitCode, 0)
  assert.equal(strict.summary.status, 'fail')
  assert.equal(strict.exitCode, 1)
})

test('summarizeGateResults 可独立汇总 canonical results', () => {
  const summary = summarizeGateResults([
    PASS,
    normalizeGateResult({ passed: true, skipped: true, violations: [], note: 'optional fixture absent' }),
  ])

  assert.equal(summary.total, 2)
  assert.equal(summary.passed, 1)
  assert.equal(summary.skipped, 1)
  assert.equal(summary.failed, 0)
  assert.equal(summary.status, 'skip')
  assert.equal(summary.exitCode, 0)
})
