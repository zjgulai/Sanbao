/**
 * 更新 feed（latest.json）判据的反向自测（DA-10 第一步）。
 *
 * 三块射程：
 *   ① 纯函数（scripts/lib/update-feed.mjs）：清单解析 / feed 生成 / feed 校验 / 与清单对账 / 版本比较；
 *   ② 判据本体（./update-feed.mjs 的 checkUpdateFeeds）：把「已提交的清单 × feed 快照」判成红绿；
 *   ③ 恒真桩突变证明：一个永远判绿的桩必须能通过同一批**该红**的输入——否则这些用例没有牙。
 *
 * 每条「该红」的形态都断言**违例文案点了名**（字段名/文件名），不是只看 passed=false：
 * 「报红了但说不出红在哪」在下一轮会被当成噪声关掉（P-02 / P-03）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseReleaseManifest,
  buildUpdateFeed,
  validateUpdateFeed,
  checkFeedAgainstManifest,
  compareVersions,
} from '../lib/update-feed.mjs'
import { checkUpdateFeeds } from './update-feed.mjs'

const SHA = 'a'.repeat(64)
const SRC = 'b'.repeat(40)
const SNAP = '5f6ca254d10a00d0'
const DMG = (version) => `DSH-Desktop-LUTE-${version}-mac-arm64.dmg`

/** 与 packaging/sign-and-dmg.sh §7 写出的入库清单同构的固定夹具。 */
function manifestText(version = '9.9.9', overrides = {}) {
  const fields = {
    version,
    dmg: DMG(version),
    build: '20260921-000000',
    source_commit: SRC,
    source_dirty: '0',
    profile_snapshot: SNAP,
    ...overrides,
  }
  return [
    '# LUTE 发布清单（ADR-0058）—— 由 packaging/sign-and-dmg.sh 生成，勿手改',
    `# 校验（DMG 与本文件同目录时）：shasum -a 256 -c ${version}.sha256`,
    `# version=${fields.version}`,
    `# dmg=${fields.dmg}`,
    `# build=${fields.build}`,
    `# source_commit=${fields.source_commit}`,
    `# source_dirty=${fields.source_dirty}`,
    `# profile_snapshot=${fields.profile_snapshot}`,
    `${overrides.sha256 ?? SHA}  ${fields.dmg}`,
  ].join('\n') + '\n'
}

function manifestFor(version = '9.9.9', overrides = {}) {
  return parseReleaseManifest(manifestText(version, overrides))
}

function feedFor(version = '9.9.9', overrides = {}) {
  return {
    ...buildUpdateFeed({ manifest: manifestFor(version), minOs: '12.0' }),
    ...overrides,
  }
}

// ── ① 清单解析 ───────────────────────────────────────────────────────────────

test('解析：正常清单还原出全部字段（含哈希行）', () => {
  assert.deepEqual(manifestFor(), {
    version: '9.9.9',
    dmg: DMG('9.9.9'),
    sha256: SHA,
    build: '20260921-000000',
    sourceCommit: SRC,
    sourceDirty: '0',
    profileSnapshot: SNAP,
  })
})

test('解析：缺 version 头 → 抛错点名 version', () => {
  const text = manifestText().replace(/^# version=.*\n/m, '')
  assert.throws(() => parseReleaseManifest(text), /version/)
})

test('解析：缺哈希行 → 抛错点名哈希', () => {
  const text = manifestText().replace(new RegExp(`^${SHA}  .*\n`, 'm'), '')
  assert.throws(() => parseReleaseManifest(text), /哈希/)
})

test('解析：哈希行坏了（不是 64 位十六进制 / 缺文件名）→ 抛错', () => {
  assert.throws(() => parseReleaseManifest(manifestText().replace(/^a{64}  /m, 'XYZ  ')), /哈希/)
  assert.throws(() => parseReleaseManifest(manifestText().replace(new RegExp(`^${SHA}  .*\n`, 'm'), `${SHA}\n`)), /哈希/)
})

test('解析：空文本 → 抛错（不静默产出空对象）', () => {
  assert.throws(() => parseReleaseManifest(''), /清单/)
})

// ── ② feed 生成 ─────────────────────────────────────────────────────────────

test('生成：字段集与顺序稳定（清单六个字段 + min_os / channel / notes / schema_version）', () => {
  const feed = buildUpdateFeed({ manifest: manifestFor(), minOs: '12.0', notes: '首版' })
  assert.deepEqual(feed, {
    schema_version: 1,
    version: '9.9.9',
    dmg: DMG('9.9.9'),
    sha256: SHA,
    build: '20260921-000000',
    source_commit: SRC,
    profile_snapshot: SNAP,
    min_os: '12.0',
    channel: 'stable',
    notes: '首版',
  })
  assert.deepEqual(Object.keys(feed), [
    'schema_version', 'version', 'dmg', 'sha256', 'build', 'source_commit',
    'profile_snapshot', 'min_os', 'channel', 'notes',
  ])
})

test('生成：channel 只认 stable / canary', () => {
  assert.throws(() => buildUpdateFeed({ manifest: manifestFor(), minOs: '12.0', channel: 'nightly' }), /channel/)
  assert.equal(buildUpdateFeed({ manifest: manifestFor(), minOs: '12.0', channel: 'canary' }).channel, 'canary')
})

test('生成：min_os 必填且形如 12 / 12.0 / 12.0.1', () => {
  assert.throws(() => buildUpdateFeed({ manifest: manifestFor() }), /min_os/)
  assert.throws(() => buildUpdateFeed({ manifest: manifestFor(), minOs: 'macOS 12' }), /min_os/)
  assert.throws(() => buildUpdateFeed({ manifest: manifestFor(), minOs: '12.0.0.1' }), /min_os/)
})

test('生成：notes 必须是字符串（可为空串）', () => {
  assert.throws(() => buildUpdateFeed({ manifest: manifestFor(), minOs: '12.0', notes: 42 }), /notes/)
  assert.equal(buildUpdateFeed({ manifest: manifestFor(), minOs: '12.0' }).notes, '')
})

// ── ③ feed 校验 ─────────────────────────────────────────────────────────────

test('校验：正常 feed → passed，无违例', () => {
  assert.deepEqual(validateUpdateFeed(feedFor()), { passed: true, violations: [] })
})

test('校验：逐类坏字段各自判红并点名', () => {
  const cases = [
    ['schema_version', { schema_version: 2 }],
    ['version', { version: '9.9' }],
    ['dmg', { dmg: 'DSH-Desktop-LUTE-9.9.10-mac-arm64.dmg' }],
    ['dmg', { dmg: 'not-a-dmg.zip' }],
    ['sha256', { sha256: 'XYZ' }],
    ['min_os', { min_os: '12.0.0.1' }],
    ['channel', { channel: 'nightly' }],
    ['build', { build: '' }],
    ['source_commit', { source_commit: 'zzz' }],
    ['profile_snapshot', { profile_snapshot: '' }],
    ['notes', { notes: 7 }],
  ]
  for (const [field, patch] of cases) {
    const result = validateUpdateFeed(feedFor('9.9.9', patch))
    assert.equal(result.passed, false, `${field} 变异应判红`)
    assert.ok(
      result.violations.some((v) => v.includes(field)),
      `${field} 变异应点名 ${field}：${JSON.stringify(result.violations)}`,
    )
  }
  const missing = feedFor()
  delete missing.sha256
  const result = validateUpdateFeed(missing)
  assert.equal(result.passed, false)
  assert.ok(result.violations.some((v) => v.includes('sha256')))
})

// ── ④ feed × 清单对账 ───────────────────────────────────────────────────────

test('对账：同源 → passed', () => {
  assert.deepEqual(
    checkFeedAgainstManifest({ feed: feedFor(), manifest: manifestFor() }),
    { passed: true, violations: [] },
  )
})

test('对账：逐字段分家各自判红并带两边读数', () => {
  const patches = [
    ['sha256', { sha256: 'c'.repeat(64) }],
    ['version', { version: '9.9.8' }],
    ['dmg', { dmg: DMG('9.9.8') }],
    ['build', { build: '20260101-000000' }],
    ['source_commit', { source_commit: 'd'.repeat(40) }],
    ['profile_snapshot', { profile_snapshot: 'ffffffffffffffff' }],
  ]
  for (const [field, patch] of patches) {
    const result = checkFeedAgainstManifest({ feed: feedFor('9.9.9', patch), manifest: manifestFor() })
    assert.equal(result.passed, false, `${field} 分家应判红`)
    assert.ok(
      result.violations.some((v) => v.includes(field)),
      `${field} 分家应点名：${JSON.stringify(result.violations)}`,
    )
  }
})

// ── ⑤ 版本比较 ──────────────────────────────────────────────────────────────

test('版本比较：数值逐段比较（含补零）', () => {
  assert.equal(compareVersions('2.5.0', '2.5.0'), 0)
  assert.equal(compareVersions('2.5.0', '2.6.0'), -1)
  assert.equal(compareVersions('2.6.0', '2.5.0'), 1)
  assert.equal(compareVersions('2.10.0', '2.9.9'), 1)
  assert.equal(compareVersions('2.5', '2.5.0'), 0)
  assert.equal(compareVersions('3.0', '2.99.99'), 1)
})

test('版本比较：非版本形状 → 抛错（不猜）', () => {
  assert.throws(() => compareVersions('v2.5.0', '2.5.0'), /版本/)
  assert.throws(() => compareVersions('2.5.0', 'latest'), /版本/)
})

// ── ⑥ 判据本体（checkUpdateFeeds）──────────────────────────────────────────

test('判据：单版本有效快照 → 绿', () => {
  const result = checkUpdateFeeds({
    entries: [{ version: '9.9.9', manifestText: manifestText(), feedText: JSON.stringify(feedFor()) }],
  })
  assert.deepEqual(result, { passed: true, violations: [] })
})

test('判据：最新版本缺快照 → 红（发布时漏生成/漏提交）', () => {
  const result = checkUpdateFeeds({
    entries: [
      { version: '9.9.9', manifestText: manifestText('9.9.9'), feedText: JSON.stringify(feedFor('9.9.9')) },
      { version: '9.9.10', manifestText: manifestText('9.9.10'), feedText: null },
    ],
  })
  assert.equal(result.passed, false)
  assert.ok(result.violations.some((v) => v.includes('9.9.10') && v.includes('最新')))
})

test('判据：旧版本没有快照不判红（机制引入前的历史版本）', () => {
  const result = checkUpdateFeeds({
    entries: [
      { version: '9.9.9', manifestText: manifestText('9.9.9'), feedText: null },
      { version: '9.9.10', manifestText: manifestText('9.9.10'), feedText: JSON.stringify(feedFor('9.9.10')) },
    ],
  })
  assert.deepEqual(result, { passed: true, violations: [] })
})

test('判据：快照字段坏 / 与清单分家 → 红', () => {
  const bad = feedFor('9.9.9', { sha256: 'c'.repeat(64) })
  const result = checkUpdateFeeds({
    entries: [{ version: '9.9.9', manifestText: manifestText(), feedText: JSON.stringify(bad) }],
  })
  assert.equal(result.passed, false)
  assert.ok(result.violations.some((v) => v.includes('sha256')))
})

test('判据：快照读不成 JSON → 红（读不到不许静默）', () => {
  const result = checkUpdateFeeds({
    entries: [{ version: '9.9.9', manifestText: manifestText(), feedText: '{ 不是 JSON' }],
  })
  assert.equal(result.passed, false)
  assert.ok(result.violations.some((v) => v.includes('9.9.9') && v.includes('JSON')))
})

test('判据：射程为空（没有任何入库清单）→ 红（空射程不是通过）', () => {
  const result = checkUpdateFeeds({ entries: [] })
  assert.equal(result.passed, false)
  assert.ok(result.violations.some((v) => v.includes('射程')))
})

// ── ⑦ 恒真桩突变证明 ────────────────────────────────────────────────────────

test('突变：永远判绿的桩必须能通过同一批「该红」输入（否则用例没有牙）', () => {
  const naive = () => ({ passed: true, violations: [] })
  const redInputs = [
    { entries: [{ version: '9.9.9', manifestText: manifestText(), feedText: JSON.stringify(feedFor('9.9.9', { version: '9.9.8', dmg: DMG('9.9.8') })) }] },
    { entries: [
      { version: '9.9.9', manifestText: manifestText('9.9.9'), feedText: JSON.stringify(feedFor('9.9.9')) },
      { version: '9.9.10', manifestText: manifestText('9.9.10'), feedText: null },
    ] },
    { entries: [{ version: '9.9.9', manifestText: manifestText(), feedText: '{ 不是 JSON' }] },
    { entries: [] },
  ]
  for (const input of redInputs) {
    assert.equal(checkUpdateFeeds(input).passed, false, '真判据必须判红')
    assert.equal(naive(input).passed, true, '恒真桩在该输入上判绿——说明该用例确实携带信息')
  }
})
