import assert from 'node:assert/strict'
import { test } from 'node:test'

import { judgeSourceFreshness, readRecordedSnapshot } from './source-freshness.mjs'

/** 产物记录的读数（judgeSourceFreshness 的形状：{revision, hashes}）。 */
const snapshot = (over = {}) => ({
  revision: 'source-hash:aaaaaaaa',
  hashes: { roster: 'r1', roleCatalog: 'c1', playbooks: 'p1' },
  ...over,
})

const computed = (over = {}) => ({
  revision: 'source-hash:aaaaaaaa',
  hashes: { roster: 'r1', roleCatalog: 'c1', playbooks: 'p1' },
  ...over,
})

test('读数齐全且一致 → fresh', () => {
  const verdict = judgeSourceFreshness({ recorded: snapshot(), computed: computed() })

  assert.equal(verdict.fresh, true)
  assert.deepEqual(verdict.changed, [])
})

test('共享文件变了、没重生成 → 判不新鲜并点名那个 key（DA-14 的存在理由）', () => {
  const verdict = judgeSourceFreshness({
    recorded: snapshot(),
    computed: computed({ revision: 'source-hash:bbbbbbbb', hashes: { roster: 'r2', roleCatalog: 'c1', playbooks: 'p1' } }),
  })

  assert.equal(verdict.fresh, false)
  assert.deepEqual(verdict.changed.map((entry) => entry.key), ['roster'])
  assert.match(verdict.reason, /roster/)
})

test('共享 hash 全同但 revision 变了 → 仍判不新鲜（角色卡 / soul / blueprint 等其他源也进了 revision）', () => {
  const verdict = judgeSourceFreshness({
    recorded: snapshot(),
    computed: computed({ revision: 'source-hash:cccccccc' }),
  })

  assert.equal(verdict.fresh, false)
  assert.deepEqual(verdict.changed, [])
  assert.match(verdict.reason, /revision/)
})

test('readRecordedSnapshot：从产物 manifest 的 source_snapshot 取出 {revision, hashes}', () => {
  const parsed = readRecordedSnapshot({
    source_snapshot: { source_revision: 'source-hash:aaaaaaaa', shared_source_hashes: { roster: 'r1' } },
  })

  assert.deepEqual(parsed, { revision: 'source-hash:aaaaaaaa', hashes: { roster: 'r1' } })
})

test('读不到 source_snapshot → readRecordedSnapshot 返回 null（读不到≠干净）', () => {
  assert.equal(readRecordedSnapshot({}), null)
  assert.equal(readRecordedSnapshot({ source_snapshot: { source_revision: 'source-hash:x' } }), null)
  assert.equal(readRecordedSnapshot(null), null)
})

test('任一侧读数缺失 → 判不新鲜并在 reason 里说清（不许静默通过）', () => {
  const verdict = judgeSourceFreshness({ recorded: null, computed: computed() })

  assert.equal(verdict.fresh, false)
  assert.match(verdict.reason, /读数/)
})

test('新增共享文件（computed 多一个 key）同样算变', () => {
  const verdict = judgeSourceFreshness({
    recorded: snapshot(),
    computed: computed({ revision: 'source-hash:dddddddd', hashes: { roster: 'r1', roleCatalog: 'c1', playbooks: 'p1', newThing: 'n1' } }),
  })

  assert.equal(verdict.fresh, false)
  assert.deepEqual(verdict.changed.map((entry) => entry.key), ['newThing'])
})
