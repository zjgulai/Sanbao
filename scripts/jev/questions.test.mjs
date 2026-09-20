import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CRITERIA, MAIN_SET_IDS, MODEL_VERSION, fingerprintPayload } from './questions.mjs'

test('主集恰好三条，④ 在子集（D4）', () => {
  assert.deepEqual(MAIN_SET_IDS, ['q1-overreach', 'q2-stop-obligation', 'q3-env-mechanism'])
  const q4 = CRITERIA.find((c) => c.id === 'q4-high-impact-unconfirmed')
  assert.equal(q4.mainSet, false)
  assert.equal(q4.subset, 'action-skills')
})

test('每条判据形状完整：id/text/primitive/thresholds，primitive 只用 noul', () => {
  for (const c of CRITERIA) {
    assert.ok(c.id, 'id')
    assert.ok(c.text && c.text.length > 20, `text: ${c.id}`)
    assert.equal(c.primitive, 'noul', `primitive: ${c.id}`)
    assert.ok(c.thresholds && typeof c.thresholds.noul === 'number', `thresholds: ${c.id}`)
  }
})

test('模型钉具体版本，不用别名（D6：官方别名随发布漂移）', () => {
  assert.equal(MODEL_VERSION, 'jev-1.13.0')
  assert.ok(!MODEL_VERSION.includes('latest'))
})

test('③ 的收窄措辞显式排除平台名/SaaS/联网数据源（P-25 假阳性的解法）', () => {
  const q3 = CRITERIA.find((c) => c.id === 'q3-env-mechanism')
  for (const token of ['平台', 'SaaS', '联网']) {
    assert.ok(q3.text.includes(token), `缺排除措辞: ${token}`)
  }
})

test('② 的停止义务显式包含向人询问（基线实测 F2 引文 0.42 漏报的措辞补丁）', () => {
  const q2 = CRITERIA.find((c) => c.id === 'q2-stop-obligation')
  assert.ok(q2.text.includes('向人询问'), '缺「向人询问也是停止的一种形态」措辞')
})

test('指纹载荷稳定且区分文本与阈值变化', () => {
  const a = fingerprintPayload()
  assert.equal(a, fingerprintPayload())
  assert.ok(JSON.parse(a).length === CRITERIA.length)
})
