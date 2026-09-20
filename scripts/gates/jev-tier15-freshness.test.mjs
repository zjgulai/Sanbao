import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  computeJevTier15Fingerprint,
  serializeExpected,
  validateExpected,
  checkJevTier15Freshness,
  toCanonicalJevTier15Result,
  DEFAULT_EXPECTED_PATH,
} from './jev-tier15-freshness.mjs'
import { readFileSync } from 'node:fs'

function fixtureDir() {
  return mkdtempSync(join(tmpdir(), 'jev-tier15-fresh-'))
}

function writeFixture(dir, { corpusEntries = 2, sampleCount = 3 } = {}) {
  const corpus = {
    _meta: { what: 'fixture' },
    skills: Object.fromEntries(
      Array.from({ length: corpusEntries }, (_, i) => [`skill-${i}`, { title: `s${i}`, description: `d${i}`, body_excerpt: `b${i}` }]),
    ),
  }
  const samples = {
    _meta: { what: 'fixture' },
    samples: Array.from({ length: sampleCount }, (_, i) => ({
      id: `S-${i}`,
      kind: 'recall',
      criterion: 'q2-stop-obligation',
      expectFire: true,
      source: `fixture-${i}`,
      state: `state-${i}`,
    })),
  }
  const corpusPath = join(dir, 'corpus.json')
  const samplesPath = join(dir, 'samples.json')
  writeFileSync(corpusPath, JSON.stringify(corpus, null, 2))
  writeFileSync(samplesPath, JSON.stringify(samples, null, 2))
  return { corpusPath, samplesPath }
}

function writeExpected(dir, computed, mutate) {
  const expected = serializeExpected(computed, 'fixture')
  const mutated = mutate ? mutate(expected) : expected
  const expectedPath = join(dir, 'expected.json')
  writeFileSync(expectedPath, JSON.stringify(mutated, null, 2))
  return expectedPath
}

test('全绿：四项指纹与登记一致 → pass，canonical 计数守恒', () => {
  const dir = fixtureDir()
  const { corpusPath, samplesPath } = writeFixture(dir)
  const computed = computeJevTier15Fingerprint({ corpusPath, samplesPath })
  const expectedPath = writeExpected(dir, computed)
  const result = checkJevTier15Freshness({ corpusPath, samplesPath, expectedPath })
  assert.equal(result.status, 'pass')
  assert.deepEqual(result.violations, [])
  const canonical = toCanonicalJevTier15Result(result)
  assert.equal(canonical.status, 'pass')
  assert.equal(canonical.expected, 5)
  assert.equal(canonical.checked, 5)
  assert.equal(canonical.failed, 0)
})

test('判据漂移判红并点名 criteria（改 questions.mjs 措辞/阈值的解法是重跑语义轨，不是改 expected）', () => {
  const dir = fixtureDir()
  const { corpusPath, samplesPath } = writeFixture(dir)
  const computed = computeJevTier15Fingerprint({ corpusPath, samplesPath })
  const expectedPath = writeExpected(dir, computed, (e) => ({ ...e, components: { ...e.components, criteria: '0'.repeat(64) } }))
  const result = checkJevTier15Freshness({ corpusPath, samplesPath, expectedPath })
  assert.equal(result.status, 'fail')
  assert.ok(result.violations.some((v) => v.includes('判据文本⊕阈值')), 'violation 要点名判据')
  assert.deepEqual(result.facts.drifted, ['criteria'])
})

test('corpus 漂移判红并点名 corpus；条目数漂移单独点名', () => {
  const dir = fixtureDir()
  const { corpusPath, samplesPath } = writeFixture(dir)
  const computed = computeJevTier15Fingerprint({ corpusPath, samplesPath })
  const expectedPath = writeExpected(dir, computed, (e) => ({ ...e, components: { ...e.components, corpus: '1'.repeat(64) }, corpusEntries: 99 }))
  const result = checkJevTier15Freshness({ corpusPath, samplesPath, expectedPath })
  assert.equal(result.status, 'fail')
  assert.ok(result.violations.some((v) => v.includes('corpus（待审语料）')))
  assert.ok(result.violations.some((v) => v.includes('条目数漂移') && v.includes('99')))
})

test('samples 漂移与 model 漂移各自点名（state 构成随样本进指纹）', () => {
  const dir = fixtureDir()
  const { corpusPath, samplesPath } = writeFixture(dir)
  const computed = computeJevTier15Fingerprint({ corpusPath, samplesPath })
  const samplesExpectedPath = writeExpected(dir, computed, (e) => ({ ...e, components: { ...e.components, samples: '2'.repeat(64) } }))
  assert.ok(checkJevTier15Freshness({ corpusPath, samplesPath, expectedPath: samplesExpectedPath }).violations.some((v) => v.includes('基线样本集')))
  const modelExpectedPath = writeExpected(dir, computed, (e) => ({ ...e, components: { ...e.components, model: 'jev-latest' } }))
  const modelResult = checkJevTier15Freshness({ corpusPath, samplesPath, expectedPath: modelExpectedPath })
  assert.ok(modelResult.violations.some((v) => v.includes('模型版本')))
  assert.ok(modelResult.violations.some((v) => v.includes('jev-latest')))
})

test('四项全对而汇总指纹不对 → 判红（防手抄哈希蒙混）', () => {
  const dir = fixtureDir()
  const { corpusPath, samplesPath } = writeFixture(dir)
  const computed = computeJevTier15Fingerprint({ corpusPath, samplesPath })
  const expectedPath = writeExpected(dir, computed, (e) => ({ ...e, fingerprint: '3'.repeat(64) }))
  const result = checkJevTier15Freshness({ corpusPath, samplesPath, expectedPath })
  assert.equal(result.status, 'fail')
  assert.ok(result.violations.some((v) => v.includes('汇总指纹不守恒')))
})

test('空射程判红不判过（P-15）：corpus 0 条 / 样本 0 条都不是「通过」', () => {
  const dir = fixtureDir()
  const { corpusPath, samplesPath } = writeFixture(dir, { corpusEntries: 0, sampleCount: 0 })
  const computed = computeJevTier15Fingerprint({ corpusPath, samplesPath })
  const expectedPath = writeExpected(dir, computed, (e) => ({ ...e, corpusEntries: 0, sampleCount: 0 }))
  const result = checkJevTier15Freshness({ corpusPath, samplesPath, expectedPath })
  assert.equal(result.status, 'fail')
  assert.ok(result.violations.some((v) => v.includes('P-15') && v.includes('corpus')))
  assert.ok(result.violations.some((v) => v.includes('P-15') && v.includes('样本')))
})

test('输入损坏判红：corpus 缺失 / 坏 JSON / 形状非法都不许静默通过', () => {
  const dir = fixtureDir()
  const { corpusPath, samplesPath } = writeFixture(dir)
  const computed = computeJevTier15Fingerprint({ corpusPath, samplesPath })
  const expectedPath = writeExpected(dir, computed)
  const missing = checkJevTier15Freshness({ corpusPath: join(dir, 'nope.json'), samplesPath, expectedPath })
  assert.equal(missing.status, 'fail')
  assert.ok(missing.violations.some((v) => v.includes('无法重算')))
  const bad = join(dir, 'bad.json')
  writeFileSync(bad, '{oops')
  assert.equal(checkJevTier15Freshness({ corpusPath: bad, samplesPath, expectedPath }).status, 'fail')
  const shapeless = join(dir, 'shapeless.json')
  writeFileSync(shapeless, JSON.stringify({ nope: true }))
  assert.equal(checkJevTier15Freshness({ corpusPath: shapeless, samplesPath, expectedPath }).status, 'fail')
})

test('expected 是必备治理文件：缺失 / 坏 JSON / schema 不符一律 fail 不 skip', () => {
  const dir = fixtureDir()
  const { corpusPath, samplesPath } = writeFixture(dir)
  const missing = checkJevTier15Freshness({ corpusPath, samplesPath, expectedPath: join(dir, 'absent.json') })
  assert.equal(missing.status, 'fail')
  assert.ok(missing.violations.some((v) => v.includes('必备') && v.includes('无法读取')))
  const computed = computeJevTier15Fingerprint({ corpusPath, samplesPath })
  const broken = join(dir, 'broken.json')
  writeFileSync(broken, '{oops')
  assert.equal(checkJevTier15Freshness({ corpusPath, samplesPath, expectedPath: broken }).status, 'fail')
  const badSchema = join(dir, 'bad-schema.json')
  writeFileSync(badSchema, JSON.stringify({ schemaVersion: 2 }))
  const schemaResult = checkJevTier15Freshness({ corpusPath, samplesPath, expectedPath: badSchema })
  assert.equal(schemaResult.status, 'fail')
  assert.ok(schemaResult.violations.some((v) => v.includes('schemaVersion')))
})

test('指纹确定性：同输入两次重算逐字节一致；serializeExpected 可往返', () => {
  const dir = fixtureDir()
  const { corpusPath, samplesPath } = writeFixture(dir)
  const a = computeJevTier15Fingerprint({ corpusPath, samplesPath })
  const b = computeJevTier15Fingerprint({ corpusPath, samplesPath })
  assert.deepEqual(a, b)
  const serialized = serializeExpected(a, 'x')
  assert.deepEqual(validateExpected(serialized), [])
})

test('真实仓内 expected 文件 schema 合法且与默认输入自洽', () => {
  const expected = JSON.parse(readFileSync(DEFAULT_EXPECTED_PATH, 'utf8'))
  assert.deepEqual(validateExpected(expected), [])
  const result = checkJevTier15Freshness({})
  assert.equal(result.status, 'pass', JSON.stringify(result.violations))
  assert.equal(expected.corpusEntries, result.facts.computed.corpusEntries)
})
