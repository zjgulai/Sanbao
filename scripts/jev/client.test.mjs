import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  JEV_ENDPOINT,
  JevBudgetExceeded,
  JevError,
  createJevClient,
} from './client.mjs'
import { MODEL_VERSION } from './questions.mjs'

const KEY = 'apikey_fake_test_only'
const QUESTIONS = { gate: { type: 'noul', instructions: 'Is this ok?' } }

function okBody(model = MODEL_VERSION) {
  return JSON.stringify({ model, answers: { gate: { type: 'noul', noul: 0.92 } }, usage: { input_tokens: 10, output_tokens: 0 } })
}

function fakeFetch(responses) {
  const calls = []
  const impl = async (endpoint, init) => {
    calls.push({ endpoint, init, body: JSON.parse(init.body) })
    const r = responses[Math.min(calls.length - 1, responses.length - 1)]
    if (typeof r === 'function') return r(calls.length - 1, init)
    return r
  }
  impl.calls = calls
  return impl
}

function res(status, body = '', headers = {}) {
  return {
    status,
    text: async () => body,
    headers: { get: (k) => headers[k.toLowerCase()] ?? null },
  }
}

test('成功路径：请求体形状（state/model/questions）、endpoint、Bearer 头、usage 累计、model 回读', async () => {
  const fetchImpl = fakeFetch([res(200, okBody('jev-1.13.0-actual'))])
  const client = createJevClient({ apiKey: KEY, fetchImpl, sleepImpl: async () => {} })
  const out = await client.ask('some text', QUESTIONS)
  assert.equal(out.model, 'jev-1.13.0-actual')
  assert.equal(out.answers.gate.noul, 0.92)
  const call = fetchImpl.calls[0]
  assert.equal(call.endpoint, JEV_ENDPOINT)
  assert.equal(call.init.headers.Authorization, `Bearer ${KEY}`)
  assert.equal(call.body.model, MODEL_VERSION)
  assert.equal(call.body.state, 'some text')
  assert.deepEqual(call.body.questions, QUESTIONS)
  assert.ok(call.init.signal)
  const s = client.stats()
  assert.equal(s.requests, 1)
  assert.equal(s.inputTokens, 10)
  assert.equal(s.modelEcho, 'jev-1.13.0-actual')
})

test('apiKey 缺失 → 构造期大声抛错，不创建哑客户端', () => {
  assert.throws(() => createJevClient({ apiKey: '' }), JevError)
  assert.throws(() => createJevClient({}), JevError)
})

test('429 限流 → 指数退避重试后成功；退避序列递增', async () => {
  const fetchImpl = fakeFetch([res(429), res(429), res(200, okBody())])
  const sleeps = []
  const client = createJevClient({
    apiKey: KEY,
    fetchImpl,
    sleepImpl: async (ms) => sleeps.push(ms),
    maxRetries: 3,
  })
  await client.ask('x', QUESTIONS)
  assert.equal(fetchImpl.calls.length, 3)
  assert.equal(sleeps.length, 2)
  assert.ok(sleeps[1] >= sleeps[0], `退避应递增: ${sleeps}`)
})

test('429 带 Retry-After: 2 → 退避 2000ms，不用指数序列', async () => {
  const fetchImpl = fakeFetch([res(429, '', { 'retry-after': '2' }), res(200, okBody())])
  const sleeps = []
  const client = createJevClient({ apiKey: KEY, fetchImpl, sleepImpl: async (ms) => sleeps.push(ms) })
  await client.ask('x', QUESTIONS)
  assert.deepEqual(sleeps, [2000])
})

test('401 → 立即大声失败，零重试', async () => {
  const fetchImpl = fakeFetch([res(401, '{"error":"bad key"}')])
  const client = createJevClient({ apiKey: KEY, fetchImpl, sleepImpl: async () => {} })
  await assert.rejects(client.ask('x', QUESTIONS), (e) => {
    assert.ok(e instanceof JevError)
    assert.equal(e.status, 401)
    assert.equal(e.retryable, false)
    return true
  })
  assert.equal(fetchImpl.calls.length, 1)
})

test('429 重试耗尽 → 抛最后一个错误，失败计数 1', async () => {
  const fetchImpl = fakeFetch([res(429)])
  const client = createJevClient({ apiKey: KEY, fetchImpl, sleepImpl: async () => {}, maxRetries: 2 })
  await assert.rejects(client.ask('x', QUESTIONS), JevError)
  assert.equal(fetchImpl.calls.length, 3)
  assert.equal(client.stats().failures, 1)
})

test('200 但 answers 缺问 → 按失败处理（P-02 仪器假绿防线）', async () => {
  const bad = JSON.stringify({ model: MODEL_VERSION, answers: {}, usage: {} })
  const client = createJevClient({ apiKey: KEY, fetchImpl: fakeFetch([res(200, bad)]), sleepImpl: async () => {} })
  await assert.rejects(client.ask('x', QUESTIONS), /缺问或 type 不匹配/)
})

test('200 但缺 model 回读字段 → 失败（D6 要求回读）', async () => {
  const bad = JSON.stringify({ answers: { gate: { type: 'noul', noul: 0.5 } } })
  const client = createJevClient({ apiKey: KEY, fetchImpl: fakeFetch([res(200, bad)]), sleepImpl: async () => {} })
  await assert.rejects(client.ask('x', QUESTIONS), /model 回读/)
})

test('200 但 type 不匹配 → 失败', async () => {
  const bad = JSON.stringify({ model: MODEL_VERSION, answers: { gate: { type: 'choice', choice: 'x' } } })
  const client = createJevClient({ apiKey: KEY, fetchImpl: fakeFetch([res(200, bad)]), sleepImpl: async () => {} })
  await assert.rejects(client.ask('x', QUESTIONS), /缺问或 type 不匹配/)
})

test('网络层失败（超时/连接错）→ 可重试', async () => {
  const fetchImpl = fakeFetch([
    () => { throw new Error('ECONNRESET') },
    res(200, okBody()),
  ])
  const client = createJevClient({ apiKey: KEY, fetchImpl, sleepImpl: async () => {} })
  await client.ask('x', QUESTIONS)
  assert.equal(fetchImpl.calls.length, 2)
})

test('预算闸门：超限在发起前拦截，fetch 一次都不调', async () => {
  const fetchImpl = fakeFetch([res(200, okBody())])
  const client = createJevClient({ apiKey: KEY, fetchImpl, sleepImpl: async () => {}, budget: { maxRequests: 2 } })
  await client.ask('x', QUESTIONS)
  await client.ask('x', QUESTIONS)
  await assert.rejects(client.ask('x', QUESTIONS), JevBudgetExceeded)
  assert.equal(fetchImpl.calls.length, 2)
  assert.equal(client.stats().requests, 2)
})

test('错误消息与 body 截断不携带完整 key', async () => {
  const fetchImpl = fakeFetch([res(500, 'x'.repeat(2000))])
  const client = createJevClient({ apiKey: KEY, fetchImpl, sleepImpl: async () => {} })
  await assert.rejects(client.ask('x', QUESTIONS), (e) => {
    assert.ok(!e.message.includes(KEY))
    assert.ok(!String(e.body).includes(KEY))
    assert.ok(e.body.length <= 500)
    return true
  })
})

test('空 questions → 立即拒绝', async () => {
  const fetchImpl = fakeFetch([])
  const client = createJevClient({ apiKey: KEY, fetchImpl })
  await assert.rejects(client.ask('x', {}), /questions 不能为空/)
  assert.equal(fetchImpl.calls.length, 0)
})
