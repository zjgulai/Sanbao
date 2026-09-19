/**
 * L10 头像判据的反向自测（工单 004）。
 *
 * 本项必须能说「不」：
 * - 伪造 SVG 包位图必须判红（旧断言只看前缀，正是这条伪造路径的历史漏洞）；
 * - MIME 谎报（自报 webp 实为 PNG 字节）必须判红；
 * - 与源不同串必须判红；缺 icon 必须判红；
 * - 真实受管 webp data URI 与正常 svg 线稿必须通过。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { iconMimeViolation, judgeIconEntry } from './role-icon-judge.mjs'

const png1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)
const svgLineArt = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="12" fill="none" stroke="#347A2F"/></svg>'
const svgUri = `data:image/svg+xml;base64,${Buffer.from(svgLineArt).toString('base64')}`
/** 伪造：位图字节裹进 svg 外壳——旧前缀断言对它全绿。 */
const wrappedRasterUri = `data:image/svg+xml;base64,${Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg"><image href="data:image/png;base64,${png1x1.toString('base64')}"/></svg>`,
).toString('base64')}`
/** 真实受管 webp（取自 AGT-001 32 档 pin 资产的头部结构即可，用最小 RIFF/WEBP 壳）。 */
const webpUri = `data:image/webp;base64,${Buffer.concat([
  Buffer.from('RIFF', 'latin1'),
  Buffer.from([0x24, 0x00, 0x00, 0x00]),
  Buffer.from('WEBP', 'latin1'),
  Buffer.from('VP8 ', 'latin1'),
  Buffer.alloc(16),
]).toString('base64')}`

test('正常 svg 线稿与真实 webp 结构 → 无 violation', () => {
  assert.equal(iconMimeViolation(svgUri), null)
  assert.equal(iconMimeViolation(webpUri), null)
})

test('伪造 SVG 包位图 → 判红并点名伪造路径', () => {
  const v = iconMimeViolation(wrappedRasterUri)
  assert.ok(v !== null, 'SVG 包位图必须判红')
  assert.ok(v.includes('SVG 包位图'), `要点名伪造路径：${v}`)
})

test('MIME 谎报：自报 webp 实为 PNG 字节 → 判红', () => {
  const v = iconMimeViolation(`data:image/webp;base64,${png1x1.toString('base64')}`)
  assert.ok(v !== null)
  assert.ok(v.includes('RIFF'), `要点名字节头判据：${v}`)
})

test('非 base64 图片 URI → 判红', () => {
  assert.ok(iconMimeViolation('https://example.com/a.webp') !== null)
  assert.ok(iconMimeViolation(undefined) !== null)
})

test('judgeIconEntry：与源不同串、缺 icon、源缺条目 → 都红', () => {
  assert.ok(judgeIconEntry({ presetId: 'agt-001', ymlIcon: svgUri, mfIcon: svgUri, expectedIcon: webpUri }).length > 0)
  assert.ok(judgeIconEntry({ presetId: 'agt-001', ymlIcon: webpUri, mfIcon: svgUri, expectedIcon: webpUri }).length > 0)
  assert.ok(judgeIconEntry({ presetId: 'agt-001', expectedIcon: webpUri }).some((v) => v.includes('缺 icon')))
  assert.ok(judgeIconEntry({ presetId: 'agt-051', ymlIcon: webpUri, mfIcon: webpUri, expectedIcon: undefined }).some((v) => v.includes('没有 id')))
})

test('judgeIconEntry：三处同串且 MIME 合法 → 空 violations', () => {
  assert.deepEqual(
    judgeIconEntry({ presetId: 'agt-001', ymlIcon: webpUri, mfIcon: webpUri, expectedIcon: webpUri }),
    [],
  )
})
