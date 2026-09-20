import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadCorpus, runCorpusReview, stateFor, defaultCriteriaIds, render } from './corpus-review.mjs'
import { MODEL_VERSION } from './questions.mjs'

function fixtureCorpus(entries) {
  const dir = mkdtempSync(join(tmpdir(), 'jev-corpus-review-'))
  const path = join(dir, 'corpus.json')
  writeFileSync(path, JSON.stringify({
    _meta: { what: 'fixture' },
    skills: Object.fromEntries(entries.map(([name, e]) => [name, e])),
  }))
  return { path, dir }
}

const CLEAN = { description: '分析品类结构。', body_excerpt: '# 分析\n先出表再出图。' }
const ENV_MECH = { description: '找货。', body_excerpt: '# 找货\n> 每次调用 MCP find_product 必须带 tags="1"。' }

function fakeClient(script) {
  let call = 0
  return {
    ask: async (state, questions) => {
      const [id] = Object.keys(questions)
      const v = script(state, id, call++)
      if (v === 'throw') throw new Error('Jev 429 重试耗尽')
      return { model: MODEL_VERSION, answers: { [id]: { type: 'noul', noul: v } }, usage: null }
    },
  }
}

test('默认判据 = 主集减逐任务（q2/q3），逐任务判据不许进本脚本', async () => {
  assert.deepEqual(defaultCriteriaIds(), ['q2-stop-obligation', 'q3-env-mechanism'])
  const { path } = fixtureCorpus([['a', CLEAN]])
  const corpus = loadCorpus(path)
  await assert.rejects(
    () => runCorpusReview({ client: fakeClient(() => 0), corpus, criteriaIds: ['q1-overreach'] }),
    /逐任务/,
  )
})

test('聚合：fired 进 findings，0.4–0.5 进 borderline，分母如实', async () => {
  const { path } = fixtureCorpus([['clean', CLEAN], ['env', ENV_MECH]])
  const corpus = loadCorpus(path)
  const client = fakeClient((state, id) => (state.includes('MCP') && id === 'q3-env-mechanism' ? 0.9 : 0.42))
  const report = await runCorpusReview({ client, corpus, criteriaIds: ['q3-env-mechanism'] })
  assert.equal(report.totals.readings, 2)
  assert.equal(report.findings.length, 1)
  assert.equal(report.findings[0].name, 'env')
  assert.equal(report.borderline.length, 1)
  assert.equal(report.borderline[0].name, 'clean')
  assert.equal(report.byCriterion['q3-env-mechanism'].fired, 1)
  assert.ok(render(report).includes('✦ env'))
  assert.ok(render(report).includes('~ clean'))
})

test('失败计入 errors 并点名条目，不静默缩分母（P-02）', async () => {
  const { path } = fixtureCorpus([['a', CLEAN], ['b', CLEAN]])
  const corpus = loadCorpus(path)
  let i = 0
  const client = {
    ask: async () => {
      if (i++ === 1) throw new Error('Jev 429 重试耗尽')
      return { model: MODEL_VERSION, answers: { 'q2-stop-obligation': { type: 'noul', noul: 0.1 } }, usage: null }
    },
  }
  const report = await runCorpusReview({ client, corpus, criteriaIds: ['q2-stop-obligation'] })
  assert.equal(report.totals.errors, 1)
  assert.equal(report.totals.readings, 1)
  assert.equal(report.errors[0].name, 'b')
  assert.ok(report.errors[0].error.includes('429'))
})

test('200 但回答形状坏按失败计（P-02），不进 findings 也不静默跳过', async () => {
  const { path } = fixtureCorpus([['a', CLEAN]])
  const corpus = loadCorpus(path)
  const client = {
    ask: async () => ({ model: MODEL_VERSION, answers: { 'q2-stop-obligation': { type: 'noul' } }, usage: null }),
  }
  const report = await runCorpusReview({ client, corpus, criteriaIds: ['q2-stop-obligation'] })
  assert.equal(report.totals.errors, 1)
  assert.equal(report.findings.length, 0)
})

test('corpus 形状与空射程（P-15）：坏形状/0 条/缺 description 全部拒绝', () => {
  const dir = mkdtempSync(join(tmpdir(), 'jev-corpus-review-'))
  const shapeless = join(dir, 'shapeless.json')
  writeFileSync(shapeless, JSON.stringify({ nope: true }))
  assert.throws(() => loadCorpus(shapeless), /形状非法/)
  const empty = join(dir, 'empty.json')
  writeFileSync(empty, JSON.stringify({ skills: {} }))
  assert.throws(() => loadCorpus(empty), /P-15/)
  const descless = join(dir, 'descless.json')
  writeFileSync(descless, JSON.stringify({ skills: { a: { title: 'x' } } }))
  assert.throws(() => loadCorpus(descless), /缺 description/)
})

test('state 拼法与基线样本同构：description + body_excerpt', () => {
  assert.equal(stateFor(CLEAN), 'description: 分析品类结构。\n\nbody: # 分析\n先出表再出图。')
})

test('真实 corpus 可加载且默认判据全量跑通的预算形状正确', () => {
  const corpus = loadCorpus()
  assert.equal(corpus.names.length, 292)
  assert.equal(defaultCriteriaIds().length, 2)
})
