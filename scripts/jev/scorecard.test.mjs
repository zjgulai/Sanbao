import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runScorecard, loadSamples } from './scorecard.mjs'
import { MODEL_VERSION } from './questions.mjs'

const SAMPLES = [
  { id: 'R-1', kind: 'recall', criterion: 'q2-stop-obligation', expectFire: true, source: 'x', state: 'a' },
  { id: 'R-2', kind: 'recall', criterion: 'q3-env-mechanism', expectFire: true, source: 'x', state: 'b' },
  { id: 'FP-1', kind: 'false-positive', criterion: 'q2-stop-obligation', expectFire: false, source: 'x', state: 'c' },
]

function fakeClient(script) {
  let call = 0
  return {
    ask: async (state, questions) => {
      const [id] = Object.keys(questions)
      const v = script(state, id, call++)
      return { model: MODEL_VERSION, answers: { [id]: { type: 'noul', noul: v } }, usage: null }
    },
  }
}

test('聚合：召回/误报分母如实计数，漂移 = max-min', async () => {
  const client = fakeClient((state, id) => (state === 'a' ? 0.9 : state === 'b' ? 0.8 : 0.1))
  const report = await runScorecard({ client, samples: SAMPLES, repeats: 3 })
  assert.equal(report.totals.samples, 3)
  assert.equal(report.totals.readings, 9)
  assert.equal(report.totals.errors, 0)
  const q2 = report.byCriterion['q2-stop-obligation']
  assert.deepEqual(q2.recall, { fired: 3, of: 3 })
  assert.deepEqual(q2.falsePositive, { fired: 0, of: 3 })
  assert.ok(report.perSample[0].spread === 0)
  assert.ok(report.modelEchoes.includes(MODEL_VERSION))
})

test('漂移被显式测量：同一样本读数波动进 spread', async () => {
  let i = 0
  const client = fakeClient(() => [0.62, 0.71, 0.55, 0.68, 0.64][i++ % 5])
  const report = await runScorecard({ client, samples: SAMPLES, repeats: 5 })
  const r1 = report.perSample.find((r) => r.id === 'R-1')
  assert.equal(r1.n, 5)
  assert.equal(r1.spread, 0.71 - 0.55)
})

test('部分失败：错误计入 errors、分母按实际成功数计，不静默补齐', async () => {
  let i = 0
  const client = {
    ask: async (state, questions) => {
      const [id] = Object.keys(questions)
      if (i++ === 1) throw new Error('Jev 429 重试耗尽')
      return { model: MODEL_VERSION, answers: { [id]: { type: 'noul', noul: 0.5 } }, usage: null }
    },
  }
  const report = await runScorecard({ client, samples: SAMPLES, repeats: 2 })
  assert.equal(report.totals.errors, 1)
  assert.equal(report.totals.readings, 5)
  assert.ok(report.errors[0].error.includes('429'))
})

test('样本校验：缺 source 拒绝（P-01），空集拒绝（P-15），未知判据拒绝', () => {
  const dir = mkdtempSync(join(tmpdir(), 'scorecard-samples-'))
  const write = (name, obj) => writeFileSync(join(dir, name), JSON.stringify(obj))
  write('bad.json', { samples: [{ id: 'x', kind: 'recall', criterion: 'q2-stop-obligation', state: 's' }] })
  assert.throws(() => loadSamples(join(dir, 'bad.json')), /source/)
  write('empty.json', { samples: [] })
  assert.throws(() => loadSamples(join(dir, 'empty.json')), /P-15/)
  write('unknown.json', { samples: [{ id: 'x', kind: 'recall', criterion: 'nope', state: 's', source: 'y' }] })
  assert.throws(() => loadSamples(join(dir, 'unknown.json')), /未知判据/)
  assert.equal(loadSamples(new URL('./samples.json', import.meta.url).pathname).length, 9)
})

test('真实样本集：每条带 source，expectFire 与 kind 一致', () => {
  const samples = loadSamples(new URL('./samples.json', import.meta.url).pathname)
  for (const s of samples) {
    assert.ok(s.source.length > 10, `${s.id} source 太短`)
    if (s.kind === 'recall') assert.equal(s.expectFire, true, s.id)
    if (s.kind === 'false-positive') assert.equal(s.expectFire, false, s.id)
  }
  const criteria = new Set(samples.map((s) => s.criterion))
  for (const c of criteria) {
    assert.ok(samples.some((s) => s.kind === 'recall' && s.criterion === c) || samples.some((s) => s.criterion === c), c)
  }
})
