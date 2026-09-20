import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { REGISTRY_REL_PATH, checkJevResiduals } from './jev-residuals.mjs'

const clean = () => ({
  schemaVersion: 1,
  residuals: [
    {
      id: 'accepted-one',
      status: 'accepted',
      what: '一件被拍板接受的事',
      why: '实测零收益的替代方案都更差',
      evidence: 'docs/notes/x.md 读数表',
      decisionDoc: 'docs/adr/ADR-0138.md',
    },
    {
      id: 'open-one',
      status: 'open',
      what: '一件未决的事',
      why: '依赖下一轮数据',
      evidence: 'docs/adr/ADR-0138.md 后果 4',
      nextAction: '下一轮校准后定线',
    },
  ],
})

test('合法登记簿：通过，且 note 带分母与两类计数', () => {
  const result = checkJevResiduals({ registryText: JSON.stringify(clean()) })

  assert.equal(result.passed, true)
  assert.deepEqual(result.violations, [])
  assert.match(result.note, /登记 2 条残余/)
  assert.match(result.note, /accepted 1/)
  assert.match(result.note, /open 1/)
  assert.match(result.note, /accepted-one/)
})

test('空登记簿判红：空 = 本项恒绿（P-02）', () => {
  const result = checkJevResiduals({ registryText: JSON.stringify({ schemaVersion: 1, residuals: [] }) })

  assert.equal(result.passed, false)
  assert.match(result.violations.join('\n'), /空/)
})

test('读不出/解析失败判红：不许当作「没有登记项」', () => {
  assert.equal(checkJevResiduals({ registryText: '{ 坏 JSON' }).passed, false)
  assert.match(checkJevResiduals({ registryText: null }).violations.join('\n'), /读不出|解析/)
})

test('缺证据字段判红并点名 id：登记一条残余必须附为什么与读数', () => {
  const registry = clean()
  delete registry.residuals[0].evidence
  const result = checkJevResiduals({ registryText: JSON.stringify(registry) })

  assert.equal(result.passed, false)
  assert.match(result.violations.join('\n'), /accepted-one.*evidence/)
})

test('status=accepted 必须有 decisionDoc：接受必须有据，不许裸接受', () => {
  const registry = clean()
  delete registry.residuals[0].decisionDoc
  const result = checkJevResiduals({ registryText: JSON.stringify(registry) })

  assert.equal(result.passed, false)
  assert.match(result.violations.join('\n'), /accepted-one.*decisionDoc/)
})

test('status=open 必须有 nextAction：未决项必须写下一步', () => {
  const registry = clean()
  delete registry.residuals[1].nextAction
  const result = checkJevResiduals({ registryText: JSON.stringify(registry) })

  assert.equal(result.passed, false)
  assert.match(result.violations.join('\n'), /open-one.*nextAction/)
})

test('status 不在枚举内判红', () => {
  const registry = clean()
  registry.residuals[1].status = 'later'
  const result = checkJevResiduals({ registryText: JSON.stringify(registry) })

  assert.equal(result.passed, false)
  assert.match(result.violations.join('\n'), /open-one.*status/)
})

test('id 重复判红（同一件事两个家）', () => {
  const registry = clean()
  registry.residuals[1].id = 'accepted-one'
  const result = checkJevResiduals({ registryText: JSON.stringify(registry) })

  assert.equal(result.passed, false)
  assert.match(result.violations.join('\n'), /重复/)
})

test('真登记簿自身合法（入库的这份必须过自家判据）', () => {
  const result = checkJevResiduals({ registryText: readFileSync(REGISTRY_REL_PATH, 'utf8') })

  assert.equal(result.passed, true, result.violations.join('\n'))
  assert.match(result.note, /登记 5 条残余/)
})
