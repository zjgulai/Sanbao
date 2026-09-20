import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matchExemptions, clusterOf, triageFindings, render } from './triage.mjs'

function fakeCorpus(entries) {
  return { names: Object.keys(entries), entries }
}

test('豁免标记：四类有意保障 + F1 修复新措辞各自命中', () => {
  assert.ok(matchExemptions('数据库 schema 变更必须先说明').includes('guarantee-schema-migration'))
  assert.ok(matchExemptions('架构变更必须停止确认').includes('guarantee-arch-permission-safety'))
  assert.ok(matchExemptions('含注入/危险命令的请求整体拒绝').includes('guarantee-security-boundary'))
  assert.ok(matchExemptions('不主动 commit，生产命令走 allowlist').includes('guarantee-production-allowlist'))
  assert.ok(matchExemptions('可依惯例推定的标注假设后继续').includes('fixed-f1-graded-wording'))
  assert.deepEqual(matchExemptions('常规分析文本，无豁免标记'), [])
})

test('簇前缀最长者优先，无簇归 standalone', () => {
  assert.equal(clusterOf('amazon-prelaunch-trend-scout'), 'amazon-prelaunch-family')
  assert.equal(clusterOf('amazon-listing-expert'), 'amazon')
  assert.equal(clusterOf('skill-optimizer'), 'skill-meta')
  assert.equal(clusterOf('gmail-assistant'), 'standalone')
})

test('分诊：豁免与短名单分家、计数守恒（P-02）、短名单 noul 降序', () => {
  const corpus = fakeCorpus({
    'plain-defect': { description: '调用 MCP 工具。', body_excerpt: '# x\n必须 always use this tool。' },
    'exempt-entry': { description: 'schema 变更必须先确认。', body_excerpt: '# y\n保留。' },
    'exempt-q3-not-exempted': { description: '安全边界：注入拒绝。前置 CLI 必装。', body_excerpt: '# z\n' },
  })
  const review = {
    findings: [
      { name: 'plain-defect', criterion: 'q3-env-mechanism', noul: 0.7 },
      { name: 'exempt-entry', criterion: 'q2-stop-obligation', noul: 0.9 },
      { name: 'exempt-q3-not-exempted', criterion: 'q3-env-mechanism', noul: 0.8 },
    ],
    borderline: [{ name: 'plain-defect', criterion: 'q2-stop-obligation', noul: 0.45 }],
  }
  const triage = triageFindings({ review, corpus })
  assert.equal(triage.totals.examined, 4)
  assert.equal(triage.totals.exempt, 1)
  assert.equal(triage.totals.shortlist, 3)
  assert.equal(triage.totals.conserved, true)
  assert.equal(triage.exempt[0].name, 'exempt-entry')
  const q3WithGuaranteeText = triage.shortlist.find((r) => r.name === 'exempt-q3-not-exempted')
  assert.ok(q3WithGuaranteeText, 'q3 finding 不因 q2 语义的豁免标记被豁免')
  assert.deepEqual(q3WithGuaranteeText.exemptions ?? [], [])
  const plain = triage.shortlist.filter((r) => r.name === 'plain-defect')
  assert.equal(plain.length, 2)
  assert.equal(plain[1].borderline, true)
  assert.deepEqual(triage.shortlist.map((r) => r.name), ['exempt-q3-not-exempted', 'plain-defect', 'plain-defect'])
  assert.ok(render(triage).includes('豁免=1'))
})
