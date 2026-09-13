/**
 * `release-published` 射程与差集判据的反向自测（ADR-0076 / P-03：判据自己也要被证伪）。
 *
 * 立的规矩：**每个用例都要能在「判据退化成恒真桩」时变红**。
 * 下面每条注释都点名它挡的是哪种退化。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { selectPublishTargets } from './release-publish-scope.mjs'

test('射程：修复前的真实形状——四个版本齐全却一个都没发', () => {
  // 2026-09-13 的实际读数（`gh release list` 最新是 v2.0.0 时）。
  // 挡的退化：如果把 missing 恒置空数组，本项对着一个空荡荡的分发面说 ok——
  // 而它存在的**唯一**理由就是这条。
  const scope = selectPublishTargets({
    manifestVersions: ['2.2.0', '2.3.0', '2.3.1', '2.3.2', '2.3.3'],
    taggedVersions: ['2.0.1', '2.2.0', '2.3.0', '2.3.1', '2.3.3'],
    releases: [{ tag: 'v2.0.0', isDraft: false }],
  })

  assert.deepEqual(scope.inScope, ['2.2.0', '2.3.0', '2.3.1', '2.3.3'])
  assert.deepEqual(scope.missing, ['2.2.0', '2.3.0', '2.3.1', '2.3.3'])
  assert.equal(scope.vacuous, false)
})

test('射程：补齐之后全绿，且读数点出被排除的版本', () => {
  const scope = selectPublishTargets({
    manifestVersions: ['2.2.0', '2.3.0', '2.3.1', '2.3.2', '2.3.3'],
    taggedVersions: ['2.0.1', '2.2.0', '2.3.0', '2.3.1', '2.3.3'],
    releases: ['2.2.0', '2.3.0', '2.3.1', '2.3.3'].map((v) => ({ tag: `v${v}`, isDraft: false })),
  })

  assert.deepEqual(scope.missing, [])
  assert.deepEqual(scope.drafts, [])
  // 「谁被排除」也必须有读数：不然「本项只核对了四个版本」没有任何地方说。
  assert.match(scope.note, /2\.3\.2/)
  assert.match(scope.note, /不算发布版/)
})

test('射程：只有清单、没有 tag 的版本自动出局（v2.3.2 的形状）', () => {
  // 挡的退化：射程写成「所有 release/*.sha256」。那样 v2.3.2 会被要求发布，
  // 而它正是**刻意不发**的那一个（通过判据之前就被取代）——门禁会逼着人
  // 要么发一份已知带错的载荷，要么维护一张「已评审不发」的例外表（第二个家，ADR-0009）。
  const scope = selectPublishTargets({
    manifestVersions: ['2.3.2'],
    taggedVersions: ['2.3.1'],
    releases: [{ tag: 'v2.3.1', isDraft: false }],
  })

  assert.deepEqual(scope.untaggedManifests, ['2.3.2'])
  assert.equal(scope.missing.includes('2.3.2'), false)
})

test('射程：只有 tag、没有清单的版本同样出局（v2.0.1 的形状，且不得变成永久红）', () => {
  // 挡的退化：射程写成「所有 v* tag」。v0.1.0 这类早期实验早于清单机制，
  // 永远没有 Release——永久红会被当成噪声关掉（与 ADR-0075 修掉的
  // `patch-anchors` 永久红同形：判据单调增长 × 历史堆积）。
  const scope = selectPublishTargets({
    manifestVersions: ['2.3.3'],
    taggedVersions: ['v0.1.0'].map((t) => t.replace(/^v/, '')).concat(['2.0.1', '2.3.3']),
    releases: [{ tag: 'v2.3.3', isDraft: false }],
  })

  assert.deepEqual(scope.inScope, ['2.3.3'])
  assert.deepEqual(scope.missing, [])
})

test('draft 不算已发布：对客户它不存在', () => {
  // 挡的退化：判据写成 `published.has(version)`。gh 上传大附件时先建 draft，
  // 此时 Release 页面只有本人可见——把它读成「发了」正是最贵的那种假绿。
  const scope = selectPublishTargets({
    manifestVersions: ['2.3.3'],
    taggedVersions: ['2.3.3'],
    releases: [{ tag: 'v2.3.3', isDraft: true }],
  })

  assert.deepEqual(scope.missing, [])
  assert.deepEqual(scope.drafts, ['2.3.3'])
})

test('射程为空必须报「空」，不许与「通过」同形（P-02 的第二形态）', () => {
  // 挡的退化：vacuous 恒置 false 或不返回，则「一个版本都没核对」会被读成
  // 「所有版本都发了」——假绿最便宜的那条路径。
  const scope = selectPublishTargets({ manifestVersions: [], taggedVersions: ['2.3.3'], releases: [] })

  assert.equal(scope.vacuous, true)
  assert.match(scope.note, /无可核对对象/)
})

test('射程：读不到 tag 时射程为空（而不是把清单全当发布版）', () => {
  // 浅克隆 / 新克隆 / git 不可用时 taggedVersions 回退为空数组。
  // 此时**不能**退化成「有清单即发布版」——那会对着四个从未量过的版本说 ok。
  // 正确行为：射程为空 → 调用方报跳过（不是通过）。
  const scope = selectPublishTargets({
    manifestVersions: ['2.2.0', '2.3.0', '2.3.1', '2.3.3'],
    taggedVersions: [],
    releases: [],
  })

  assert.equal(scope.vacuous, true)
  assert.deepEqual(scope.missing, [])
  assert.deepEqual(scope.untaggedManifests, ['2.2.0', '2.3.0', '2.3.1', '2.3.3'])
})

test('射程：tag 带不带 v 前缀都认（读数的两个来源格式不同）', () => {
  // 挡的退化：只 strip 一处前缀，于是 `gh` 给的 `v2.3.3` 与 git 给的 `2.3.3` 永不相等，
  // 全部版本被判成 missing——一条永远为真的假红。
  const scope = selectPublishTargets({
    manifestVersions: ['2.3.3'],
    taggedVersions: ['2.3.3'],
    releases: [{ tag: 'v2.3.3', isDraft: false }],
  })

  assert.deepEqual(scope.missing, [])
  assert.equal(scope.vacuous, false)
})

test('射程：输出顺序稳定（版本升序），不随输入顺序抖动', () => {
  const a = selectPublishTargets({ manifestVersions: ['2.3.3', '2.2.0'], taggedVersions: ['2.2.0', '2.3.3'] })
  const b = selectPublishTargets({ manifestVersions: ['2.2.0', '2.3.3'], taggedVersions: ['2.3.3', '2.2.0'] })

  assert.deepEqual(a.inScope, ['2.2.0', '2.3.3'])
  assert.deepEqual(b.inScope, a.inScope)
})
