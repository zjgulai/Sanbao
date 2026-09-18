/**
 * ADR 决策账本校验项的反向自测（ADR-0122）。
 *
 * 本文件的作用不是「再跑一遍正向」：它证明**这条判据会说「不」**。
 *
 * 为什么没有「恒真桩突变」（把某个阈值换成 `Infinity` 看是否漏过）：
 * 本项的判据是**纯函数 + 输入即射程**——`checkAdrAgentRecords` 的射程完全由磁盘上的
 * ADR 文件与传入的账本决定，没有阈值可换。所以边界用例**就是**它的突变：
 * 「标题在但围栏缺失」「decisions 是空数组」「账本比源新/比源旧」这三类，
 * 正是任何粗糙实现（例如 `text.includes('## 机器可读决策')` 或只比 id 集合）会静默放过的
 * 状态。下面每一条都点名了它针对的粗糙实现。
 *
 * 全部 fixture 是**真实形态**的 ADR（含 `- 状态：` / `- 日期：` 头部与 `## 决策` 节），
 * 不是编出来的最小串——判据的边界必须由真实文档的形状钉住。
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import { after, test } from 'node:test'

import {
  buildLedger,
  checkAdrAgentRecords,
  parseDecisionBlock,
  renderLedger,
  serializeLedger,
} from './adr-agent-records.mjs'

const roots = []
after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
})

/** 造一个临时仓库，写入给定的 ADR 文件（名 → 正文）。返回仓库根。 */
function makeRepo(files) {
  const root = mkdtempSync(join(tmpdir(), 'adr-ledger-'))
  roots.push(root)
  mkdirSync(join(root, 'docs', 'adr'), { recursive: true })
  for (const [name, text] of Object.entries(files)) {
    writeFileSync(join(root, 'docs', 'adr', name), text)
  }
  return root
}

const BLOCK = (decisions) => `## 机器可读决策\n\n\`\`\`json\n${JSON.stringify({ decisions }, null, 2)}\n\`\`\`\n`

/** 一篇合规的 ADR：有四段 + 决策块。 */
function adr({ id, title, status = 'accepted（2026-09-18）', date = '2026-09-18', decisions }) {
  return `# ${id} · ${title}\n\n- 状态：${status}\n- 日期：${date}\n- 决策者：用户 + agent\n\n## 背景\n\n背景。\n\n## 决策\n\n决策。\n\n## 备选方案\n\n方案。\n\n## 后果\n\n后果。\n\n${BLOCK(decisions)}`
}

/** 一篇**没有**决策块的历史 ADR。 */
function legacyAdr({ id, title, status = 'accepted', date = '2026-09-10' }) {
  return `# ${id} · ${title}\n\n- 状态：${status}\n- 日期：${date}\n\n## 背景\n\n背景。\n\n## 决策\n\n决策。\n\n## 备选方案\n\n方案。\n\n## 后果\n\n后果。\n`
}

/* ── 1. 射程与可读性：不得静默放过 ────────────────────────────────── */

test('射程为空判红——「一篇都没扫」与「都扫过且合规」必须分开（P-15）', () => {
  const root = makeRepo({})
  const result = checkAdrAgentRecords({ repoRoot: root, ledger: { schema: 1, adrs: [], legacyWithoutDecisions: [] } })
  assert.equal(result.passed, false)
  assert.match(result.violations.join('\n'), /射程为空/)
  assert.match(result.note, /扫描 0 篇/)
})

test('账本读不出来判红，且明说本次未核对任何东西（不是「都干净」）', () => {
  const root = makeRepo({ 'ADR-0001.md': adr({ id: 'ADR-0001', title: '甲', decisions: [{ id: 'D1', text: '甲' }] }) })
  const result = checkAdrAgentRecords({ repoRoot: root, ledger: null })
  assert.equal(result.passed, false)
  assert.match(result.violations.join('\n'), /账本 .* 读不出来/)
  assert.match(result.note, /未核对任何东西/)
})

/* ── 2. 合规路径必须真的绿（否则「红」没有意义） ──────────────────── */

test('合规仓库判绿，且分母常显', () => {
  const root = makeRepo({
    'ADR-0001.md': legacyAdr({ id: 'ADR-0001', title: '历史甲' }),
    'ADR-0002.md': adr({ id: 'ADR-0002', title: '新甲', decisions: [{ id: 'D1', text: '甲', constraints: ['约束'] }] }),
  })
  const ledger = buildLedger({ repoRoot: root, previous: { legacyWithoutDecisions: ['ADR-0001'] } })
  assert.deepEqual(ledger.legacyWithoutDecisions, ['ADR-0001'])
  const result = checkAdrAgentRecords({ repoRoot: root, ledger })
  assert.equal(result.passed, true, result.violations.join('\n'))
  assert.match(result.note, /扫描 2 篇 ADR/)
  assert.match(result.note, /有决策块 1 篇/)
  assert.match(result.note, /豁免 1 篇/)
  assert.match(result.note, /共 1 条/)
})

/* ── 3. 决策块解析的边界：粗糙实现会在这三条上静默放过 ───────────── */

test('只有标题、没有 json 围栏 → 视为缺失（针对「正则搜标题就算有」的粗糙实现）', () => {
  const text = '# 甲\n\n## 机器可读决策\n\n决策如下。\n\n## 后果\n\n无。\n'
  assert.equal(parseDecisionBlock(text).found, false)
  assert.match(parseDecisionBlock(text).error, /没有 ```json 围栏/)
})

test('围栏没闭合 → 视为缺失（针对「取到 ```json 就往下读到文件尾」的粗糙实现）', () => {
  const text = '# 甲\n\n## 机器可读决策\n\n```json\n{"decisions":[{"id":"D1","text":"甲"}]}\n'
  assert.equal(parseDecisionBlock(text).found, false)
  assert.match(parseDecisionBlock(text).error, /没有闭合/)
})

test('decisions 是空数组 → 视为缺失（「看起来有块其实没有决策」这一形态）', () => {
  const text = `# 甲\n\n## 机器可读决策\n\n\`\`\`json\n{"decisions":[]}\n\`\`\`\n`
  assert.equal(parseDecisionBlock(text).found, false)
  assert.match(parseDecisionBlock(text).error, /非空数组/)
})

test('决策项缺 text / id 为空 → 判缺失，并点名是第几项', () => {
  const bad = `# 甲\n\n## 机器可读决策\n\n\`\`\`json\n{"decisions":[{"id":"D1","text":"甲"},{"id":"D2"}]}\n\`\`\`\n`
  const parsed = parseDecisionBlock(bad)
  assert.equal(parsed.found, false)
  assert.match(parsed.error, /decisions\[1\]\.text/)
})

test('下一节先出现 → 不在别处捡到围栏（针对「全文搜第一个 json 围栏」的粗糙实现）', () => {
  const text = '# 甲\n\n## 机器可读决策\n\n暂无。\n\n## 后果\n\n```json\n{"decisions":[{"id":"D1","text":"伪造"}]}\n```\n'
  assert.equal(parseDecisionBlock(text).found, false)
  assert.match(parseDecisionBlock(text).error, /没有 ```json 围栏/)
})

/* ── 4. 账本 ↔ 源 的一致性：四类分叉各自判红 ─────────────────────── */

test('新 ADR 没有决策块且不在豁免里 → 判红并点名（本项存在的理由）', () => {
  const root = makeRepo({
    'ADR-0001.md': legacyAdr({ id: 'ADR-0001', title: '历史甲' }),
    'ADR-0002.md': legacyAdr({ id: 'ADR-0002', title: '没写块的新的' }),
  })
  const ledger = buildLedger({ repoRoot: root, previous: { legacyWithoutDecisions: ['ADR-0001'] } })
  const result = checkAdrAgentRecords({ repoRoot: root, ledger })
  assert.equal(result.passed, false)
  const joined = result.violations.join('\n')
  assert.match(joined, /ADR-0002/)
  assert.match(joined, /每一轮决策的结果面向 AGENT 都要做 adr 记录/)
  assert.doesNotMatch(joined, /ADR-0001：既不在/) // 豁免的不能连坐
})

test('账本落后于源（文件在、账本里没有）→ 判红', () => {
  const root = makeRepo({
    'ADR-0001.md': adr({ id: 'ADR-0001', title: '甲', decisions: [{ id: 'D1', text: '甲' }] }),
    'ADR-0002.md': adr({ id: 'ADR-0002', title: '乙', decisions: [{ id: 'D1', text: '乙' }] }),
  })
  const ledger = buildLedger({ repoRoot: root, previous: null })
  ledger.adrs = ledger.adrs.filter((a) => a.id !== 'ADR-0002')
  const result = checkAdrAgentRecords({ repoRoot: root, ledger })
  assert.equal(result.passed, false)
  assert.match(result.violations.join('\n'), /ADR-0002：ADR 文件在，账本里没有它/)
})

test('账本比源新（幽灵条目）→ 判红', () => {
  const root = makeRepo({ 'ADR-0001.md': adr({ id: 'ADR-0001', title: '甲', decisions: [{ id: 'D1', text: '甲' }] }) })
  const ledger = buildLedger({ repoRoot: root, previous: null })
  ledger.adrs.push({ id: 'ADR-0999', title: '幽灵', status: 'accepted', date: '2026-01-01', decisions: [] })
  const result = checkAdrAgentRecords({ repoRoot: root, ledger })
  assert.equal(result.passed, false)
  assert.match(result.violations.join('\n'), /ADR-0999：账本里有它/)
})

test('账本的 title / status 与文件不符 → 逐字段判红', () => {
  const root = makeRepo({ 'ADR-0001.md': adr({ id: 'ADR-0001', title: '标题甲', decisions: [{ id: 'D1', text: '甲' }] }) })
  const ledger = buildLedger({ repoRoot: root, previous: null })
  ledger.adrs[0].title = '被手工改过的标题'
  ledger.adrs[0].status = 'superseded'
  const result = checkAdrAgentRecords({ repoRoot: root, ledger })
  assert.equal(result.passed, false)
  const joined = result.violations.join('\n')
  assert.match(joined, /账本 title 与 ADR 文件不一致/)
  assert.match(joined, /账本 status 与 ADR 文件不一致/)
})

test('账本声称的 decisions 与文件里的块不一致 → 判红（账本是派生面）', () => {
  const root = makeRepo({ 'ADR-0001.md': adr({ id: 'ADR-0001', title: '甲', decisions: [{ id: 'D1', text: '原文' }] }) })
  const ledger = buildLedger({ repoRoot: root, previous: null })
  ledger.adrs[0].decisions = [{ id: 'D1', text: '被改过的决策', constraints: [] }]
  const result = checkAdrAgentRecords({ repoRoot: root, ledger })
  assert.equal(result.passed, false)
  assert.match(result.violations.join('\n'), /账本 decisions 与 ADR 文件里的决策块不一致/)
})

/* ── 5. 豁免只减不增（ADR-0014 / ADR-0056 同法） ─────────────────── */

test('把新编号写进豁免清单 → 判红（只减不增）', () => {
  const root = makeRepo({
    'ADR-0001.md': legacyAdr({ id: 'ADR-0001', title: '历史甲' }),
    'ADR-0002.md': legacyAdr({ id: 'ADR-0002', title: '新的、又不想写块' }),
  })
  const ledger = buildLedger({ repoRoot: root, previous: { legacyWithoutDecisions: ['ADR-0001', 'ADR-0002'] } })
  assert.deepEqual(ledger.legacyWithoutDecisions, ['ADR-0001', 'ADR-0002'])
  const result = checkAdrAgentRecords({
    repoRoot: root,
    ledger,
    baseline: { legacyWithoutDecisions: ['ADR-0001'] },
  })
  assert.equal(result.passed, false)
  assert.match(result.violations.join('\n'), /ADR-0002：新加进 legacyWithoutDecisions/)
})

test('豁免能变短：补上决策块后生成器自动把它移出豁免（自愈方向必须成立）', () => {
  const root = makeRepo({
    'ADR-0001.md': adr({ id: 'ADR-0001', title: '补上了', decisions: [{ id: 'D1', text: '补上' }] }),
  })
  const ledger = buildLedger({ repoRoot: root, previous: { legacyWithoutDecisions: ['ADR-0001'] } })
  assert.deepEqual(ledger.legacyWithoutDecisions, [])
  const result = checkAdrAgentRecords({
    repoRoot: root,
    ledger,
    baseline: { legacyWithoutDecisions: ['ADR-0001'] },
  })
  assert.equal(result.passed, true, result.violations.join('\n'))
})

test('豁免里的幽灵编号 → 判红（否则它是一份会腐烂的清单）', () => {
  const root = makeRepo({ 'ADR-0001.md': legacyAdr({ id: 'ADR-0001', title: '历史甲' }) })
  const ledger = buildLedger({ repoRoot: root, previous: { legacyWithoutDecisions: ['ADR-0001'] } })
  // 生成器只从磁盘上真实存在的 ADR 里挑豁免，所以它会**自愈**幽灵编号——
  // 幽灵因此只可能来自磁盘上那份被手工改过的账本。这里模拟的正是那一形态：
  // 若只在生成器输出上测，这条永远绿，而它的存在理由（账本会腐烂）就没被覆盖。
  ledger.legacyWithoutDecisions.push('ADR-0777')
  const result = checkAdrAgentRecords({ repoRoot: root, ledger })
  assert.equal(result.passed, false)
  assert.match(result.violations.join('\n'), /ADR-0777：在 legacyWithoutDecisions 里/)
})

test('HEAD 里还没有账本时，「只减不增」跳过并明示——不得静默算作合规', () => {
  const root = makeRepo({
    'ADR-0001.md': legacyAdr({ id: 'ADR-0001', title: '历史甲' }),
    'ADR-0002.md': legacyAdr({ id: 'ADR-0002', title: '新的' }),
  })
  const ledger = buildLedger({ repoRoot: root, previous: { legacyWithoutDecisions: ['ADR-0001', 'ADR-0002'] } })
  const result = checkAdrAgentRecords({ repoRoot: root, ledger, baseline: null })
  assert.equal(result.passed, true, result.violations.join('\n'))
  assert.match(result.note, /跳过「只减不增」核对（不是「已合规」）/)
})

/* ── 6. 生成器：稳定、幂等、不替人做决定 ─────────────────────────── */

test('生成器是幂等的：同一棵树连跑两次字节相同', () => {
  const root = makeRepo({
    'ADR-0001.md': legacyAdr({ id: 'ADR-0001', title: '历史甲' }),
    'ADR-0002.md': adr({ id: 'ADR-0002', title: '新甲', decisions: [{ id: 'D1', text: '甲' }] }),
  })
  const first = renderLedger({ repoRoot: root, previous: { legacyWithoutDecisions: ['ADR-0001'] } })
  const again = renderLedger({ repoRoot: root, previous: JSON.parse(first) })
  assert.equal(first, again)
  assert.equal(first, serializeLedger(JSON.parse(first)))
})

test('生成器不会把「新出现的无块 ADR」自动塞进豁免——那正是要判红的状态', () => {
  const root = makeRepo({ 'ADR-0001.md': legacyAdr({ id: 'ADR-0001', title: '新的且没有块' }) })
  const ledger = buildLedger({ repoRoot: root, previous: null })
  assert.deepEqual(ledger.legacyWithoutDecisions, [])
})

test('决策块的 constraints 缺省归一为空数组（账本形状稳定，避免端到端假红）', () => {
  const root = makeRepo({ 'ADR-0001.md': adr({ id: 'ADR-0001', title: '甲', decisions: [{ id: 'D1', text: '甲' }] }) })
  const ledger = buildLedger({ repoRoot: root, previous: null })
  assert.deepEqual(ledger.adrs[0].decisions[0].constraints, [])
  const result = checkAdrAgentRecords({ repoRoot: root, ledger })
  assert.equal(result.passed, true, result.violations.join('\n'))
})
