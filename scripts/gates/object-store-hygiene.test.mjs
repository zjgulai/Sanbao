/**
 * 对象库卫生校验项的反向自测（SEC-RT-011 / ADR-0121）。
 *
 * 本文件的作用不是「再跑一遍正向」：它证明**这条判据会说「不」**。
 * 全部输入取自 2026-09-18 的真实读数，不是编出来的数字——
 * 判据的边界必须由真实观测钉住，否则阈值只是一个人的口味。
 *
 * 真实读数（当天实测，`git cat-file --batch-all-objects --batch-check`）：
 *   · 6.8 GB tar     ddab355b…  6,800,745,472 B  ← 含活凭证，已移除
 *   · 183 MB Mach-O  5987db81…    192,170,032 B  ← 不可达，本项应拦下
 *   · 26.6 MB tgz    389e7de8…     26,656,635 B  ← 合法资产（cpython standalone），必须放行
 *   · 垃圾包 2 个，716.63 MiB（tmp_pack_*）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_LIMITS,
  checkObjectStoreHygiene,
  formatBytes,
  parseAllObjects,
  parseCountObjects,
} from './object-store-hygiene.mjs'

/** 真实读数：6.8 GB 的 ~/.dsh 全量快照（含活凭证）。 */
const REAL_TAR = { type: 'blob', size: 6800745472, sha: 'ddab355b3e4a07d2b8035137250b824e3aae575b' }
/** 真实读数：183 MB 的 Mach-O，ref 不可达。 */
const REAL_MACHO = { type: 'blob', size: 192170032, sha: '5987db818c5ce3b526474c6869a61faa52a4efb0' }
/** 真实读数：合法的 cpython standalone 资产，被 main 与全部 tag 可达。 */
const REAL_PYTHON = {
  type: 'blob',
  size: 26656635,
  sha: '389e7de83850554d8234a66dc3bc26c9f5ae9f2d',
}

// `git count-objects -v` 的 size 字段单位是 KiB（实测：size=103572 KiB ↔ -vH=101.14 MiB）。
// 这里用字节表示同一个状态；KiB → 字节的换算在 parseCountObjects 里做，另有用例守着它。
const cleanCounted = {
  count: 1371,
  size: 103572 * 1024,
  inPack: 7840,
  packs: 2,
  sizePack: 66040 * 1024,
  garbage: 0,
  sizeGarbage: 0,
}

const smallObjects = [
  { type: 'blob', size: 4156, sha: '5d11147ed87f64c212faf262099f75a5df1fc2d8' },
  REAL_PYTHON,
  { type: 'tree', size: 512, sha: 'fadecdb35efb775488eb2be1b56563063dbb7c3f' },
]

test('对象库干净时判绿，且读数里常显分母', () => {
  const r = checkObjectStoreHygiene({
    counted: cleanCounted,
    objects: smallObjects,
    reachable: new Set([REAL_PYTHON.sha]),
  })
  assert.equal(r.passed, true, r.violations.join('；'))
  assert.equal(r.scanned, 3)
  assert.match(r.note, /扫描 3 个对象/)
})

test('26.6 MB 的合法 cpython tgz 必须放行（阈值边界）', () => {
  const r = checkObjectStoreHygiene({
    counted: cleanCounted,
    objects: [REAL_PYTHON],
    reachable: new Set([REAL_PYTHON.sha]),
  })
  assert.equal(r.passed, true, `合法资产被误判：${r.violations.join('；')}`)
  assert.ok(REAL_PYTHON.size < DEFAULT_LIMITS.maxObjectBytes)
})

test('6.8 GB 的凭据快照必须判红并点名 sha 与体积', () => {
  const r = checkObjectStoreHygiene({
    counted: cleanCounted,
    objects: [REAL_TAR, ...smallObjects],
    reachable: new Set(),
  })
  assert.equal(r.passed, false)
  assert.equal(r.offenders.length, 1)
  assert.match(r.violations.join('\n'), /ddab355b3e4a07d2b8035137250b824e3aae575b/)
  assert.match(r.violations.join('\n'), /6\.33 GiB/)
  assert.match(r.violations.join('\n'), /不可达（gc 可回收）/)
})

test('183 MB 的 Mach-O 必须判红（体积是无须词汇表的代理量）', () => {
  const r = checkObjectStoreHygiene({
    counted: cleanCounted,
    objects: [REAL_MACHO],
    reachable: new Set(),
  })
  assert.equal(r.passed, false)
  assert.match(r.violations.join('\n'), /192170032|183\.27 MiB/)
})

test('可达性判不了时不阻塞，但必须在读数里说出来', () => {
  const r = checkObjectStoreHygiene({
    counted: cleanCounted,
    objects: [REAL_TAR],
    reachable: null,
  })
  assert.equal(r.passed, false)
  assert.match(r.violations.join('\n'), /可达性未测/)
  assert.match(r.note, /可达性未测/)
})

test('扫描面为空判红——「一个都没扫」不是「都干净」（P-15）', () => {
  const r = checkObjectStoreHygiene({ counted: cleanCounted, objects: [], reachable: new Set() })
  assert.equal(r.passed, false)
  assert.match(r.violations.join('\n'), /扫描面为空/)
})

test('垃圾包不为 0 判红（gc 因 pruneExpire 删不掉它）', () => {
  const r = checkObjectStoreHygiene({
    counted: { ...cleanCounted, garbage: 2, sizeGarbage: 751_435_800 },
    objects: smallObjects,
    reachable: new Set([REAL_PYTHON.sha]),
  })
  assert.equal(r.passed, false)
  assert.match(r.violations.join('\n'), /2 个垃圾包/)
})

test('总量超上限判红（单对象阈值被拆块绕过时的第二张网）', () => {
  const r = checkObjectStoreHygiene({
    counted: { ...cleanCounted, sizePack: 2 * 1024 * 1024 * 1024 },
    objects: smallObjects,
    reachable: new Set([REAL_PYTHON.sha]),
  })
  assert.equal(r.passed, false)
  assert.match(r.violations.join('\n'), /总量 .* 超过上限/)
})

test('count-objects 取不到判红，不静默当作「都干净」', () => {
  const r = checkObjectStoreHygiene({ counted: null, objects: smallObjects, reachable: new Set() })
  assert.equal(r.passed, false)
  assert.match(r.violations.join('\n'), /git count-objects -v 取不到/)
})

test('采集阶段的 errors 必须透传成判红', () => {
  const r = checkObjectStoreHygiene({
    counted: cleanCounted,
    objects: smallObjects,
    reachable: new Set(),
    errors: ['git rev-list 取不到：spawn failed'],
  })
  assert.equal(r.passed, false)
  assert.match(r.violations.join('\n'), /spawn failed/)
})

test('恒真桩突变：阈值换成 Infinity 后 6.8 GB 必须漏过', () => {
  // 若这条突变仍然判红，说明拦住它的不是体积阈值，而是别的什么东西——
  // 那样这个阈值就是装饰品（P-02 / P-03）。
  const r = checkObjectStoreHygiene({
    counted: cleanCounted,
    objects: [REAL_TAR],
    reachable: new Set(),
    limits: { maxObjectBytes: Number.POSITIVE_INFINITY, maxTotalBytes: Number.POSITIVE_INFINITY },
  })
  assert.equal(r.passed, true, `突变未生效：${r.violations.join('；')}`)
})

test('parseCountObjects 认得 -v 的全部字段，并把 KiB 换算成字节', () => {
  // 输入取自 2026-09-18 真实 `git count-objects -v`；size-pack 66040 KiB ↔ -vH 64.49 MiB。
  const counted = parseCountObjects(
    'count: 1371\nsize: 103572\nin-pack: 7840\npacks: 2\nsize-pack: 66040'
      + '\nprune-packable: 0\ngarbage: 0\nsize-garbage: 0\n',
  )
  assert.equal(counted.count, 1371)
  assert.equal(counted.size, 103572 * 1024)
  assert.equal(counted.sizePack, 66040 * 1024)
  assert.equal(counted.sizePack, 67_624_960, '= 64.49 MiB，与 -vH 对照')
  assert.equal(counted.garbage, 0)
  assert.equal(counted.sizeGarbage, 0)
})

test('KiB → 字节的换算不得退回（首版把 -v 的 size 当字节，读数印成 165.6 KiB）', () => {
  const counted = parseCountObjects('size: 103572\nsize-pack: 66040')
  const total = counted.size + counted.sizePack
  assert.equal(total, (103572 + 66040) * 1024)
  assert.equal(formatBytes(total), '165.64 MiB', '真值是 165.64 MiB，不是 165.6 KiB')
})

test('parseCountObjects 对 -vH 的单位值不误读为数字', () => {
  const counted = parseCountObjects('count: 1371\nsize-pack: 2.63 GiB\ngarbage: 2\nsize-garbage: 716.63 MiB')
  assert.equal(counted.sizePack, 0, '带单位的值不得被当成数字——把「2.63 GiB」读成 2 比读不出来更坏')
  assert.equal(counted.sizeGarbage, 0)
  assert.equal(counted.garbage, 2)
})

test('parseAllObjects 丢弃不成形的行', () => {
  const objects = parseAllObjects('blob 4156 abc\n\ngarbage line\ntree 512 def\n')
  assert.equal(objects.length, 2)
  assert.deepEqual(objects[0], { type: 'blob', size: 4156, sha: 'abc' })
})

test('formatBytes 在三个量级上都可读', () => {
  assert.equal(formatBytes(4156), '4.1 KiB')
  assert.equal(formatBytes(26_656_635), '25.42 MiB')
  assert.equal(formatBytes(6_800_745_472), '6.33 GiB')
})
