import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildEgressProbes,
  checkJevEgressBoundary,
  judgeJevEgressBoundary,
  makeEgressFixture,
  toCanonicalJevEgressResult,
  CLIENT_SOURCE_PATH,
} from './jev-egress-boundary.mjs'
import { loadCorpus } from '../jev/corpus-review.mjs'
import { loadSamples } from '../jev/scorecard.mjs'
import { assertEgressSourceTracked } from '../jev/egress-boundary.mjs'
import { validateGateResult } from './gate-result.mjs'

const REAL_DEPS = {
  loadCorpus,
  loadSamples,
  assertTracked: assertEgressSourceTracked,
  clientSourcePath: CLIENT_SOURCE_PATH,
}

/** 造夹具 + 探针；返回的夹具由调用方 cleanup。 */
function probesWith(overrides) {
  const fixture = makeEgressFixture()
  return { fixture, probes: buildEgressProbes({ ...REAL_DEPS, ...overrides, fixture }) }
}

test('阳性对照：真实依赖 + 真实夹具，六项探针全过', () => {
  const { fixture, probes } = probesWith({})
  try {
    const judged = judgeJevEgressBoundary({ probes })
    assert.deepEqual(judged.violations, [])
    assert.equal(judged.checked, 6)
  } finally {
    fixture.cleanup()
  }
})

test('恒真突变：闸门被摘掉（不抛的 assertTracked + 照装的两个装载器）必须判红', () => {
  const { fixture, probes } = probesWith({
    assertTracked: () => ({ relPath: 'x', repoRoot: '/', realPath: '/x' }),
    loadCorpus: () => ({ names: [], entries: {} }),
    loadSamples: () => [],
  })
  try {
    const judged = judgeJevEgressBoundary({ probes })
    assert.ok(judged.violations.length >= 3, `实际只抓到 ${judged.violations.length} 项`)
    assert.ok(judged.violations.some((v) => v.includes('未跟踪 corpus')), judged.violations.join('；'))
    assert.ok(judged.violations.some((v) => v.includes('仓外 corpus')), judged.violations.join('；'))
    assert.ok(judged.violations.some((v) => v.includes('未跟踪样本集')), judged.violations.join('；'))
  } finally {
    fixture.cleanup()
  }
})

test('过严突变：闸门拒绝一切也必须判红——误杀会把整改逼成摘闸门', () => {
  const rejectAll = () => {
    throw new Error('拒绝一切（ADR-0138 D2）')
  }
  const { fixture, probes } = probesWith({ assertTracked: rejectAll, loadCorpus: rejectAll, loadSamples: rejectAll })
  try {
    const judged = judgeJevEgressBoundary({ probes })
    assert.equal(judged.violations.length, 2, judged.violations.join('；'))
    assert.ok(judged.violations.some((v) => v.includes('默认语料路径必须落在跟踪集内')), judged.violations.join('；'))
    assert.ok(judged.violations.some((v) => v.includes('不许误杀')), judged.violations.join('；'))
  } finally {
    fixture.cleanup()
  }
})

test('拒了但不点名 D2：判词契约也判红（读的人要能顺着这句回到决策）', () => {
  const silentReject = () => {
    throw new Error('nope')
  }
  const { fixture, probes } = probesWith({ loadCorpus: silentReject, loadSamples: silentReject })
  try {
    const judged = judgeJevEgressBoundary({ probes })
    const citationMisses = judged.violations.filter((v) => v.includes('没点名 D2'))
    assert.equal(citationMisses.length, 3, judged.violations.join('；'))
  } finally {
    fixture.cleanup()
  }
})

test('空射程（P-02）：没有探针就是不合格，不是「无对象可判」', () => {
  const judged = judgeJevEgressBoundary({ probes: [] })
  assert.equal(judged.checked, 0)
  assert.equal(judged.violations.length, 1)
  assert.ok(judged.violations[0].includes('P-02'))
})

test('canonical 读数合法：通过态 6/6；违约与空射程都不得出现负 checked 或凭空分母', () => {
  const pass = toCanonicalJevEgressResult({ status: 'pass', violations: [], facts: { probes: 6, failed: 0 } })
  assert.deepEqual(validateGateResult(pass), { valid: true, errors: [] })
  const fail = toCanonicalJevEgressResult({ status: 'fail', violations: ['a', 'b'], facts: { probes: 6, failed: 2 } })
  assert.deepEqual(validateGateResult(fail), { valid: true, errors: [] })
  const empty = toCanonicalJevEgressResult({ status: 'fail', violations: ['空射程（P-02）'], facts: { probes: 0, failed: 1 } })
  assert.deepEqual(validateGateResult(empty), { valid: true, errors: [] })
})

test('实况：本仓上必须通过，且读数点名 D2', () => {
  const result = checkJevEgressBoundary()
  assert.equal(result.passed, true, result.violations.join('；'))
  assert.ok(result.facts.probes >= 6)
  assert.ok(result.note.includes('ADR-0138 D2'), result.note)
})
