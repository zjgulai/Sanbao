import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import {
  dirSizeBytes,
  inspectCandidate,
  judgeCandidate,
  orderSuggested,
  scanReleaseManifests,
} from './cleanup-inventory.mjs'
import { withMutationFixture } from './mutation-fixture.mjs'

// ── 纯判：三步序的结论 ──────────────────────────────────────────────────────
//
// P-49 的核心：清单按「体积 + 有没有人 import」生成，两把尺子都量不到**承诺**。
// 修法是固定顺序：①承诺 → ②引用 → ③体积；①②任一命中 → 出局（证据面），
// 只有都为「否」时才按③排优先级。顺序反了结论会整个翻转（P-44 同族）。

test('judgeCandidate：任一承诺命中即出局（不进入删除建议）', () => {
  const verdict = judgeCandidate({
    commitments: [{ kind: 'release-manifest', detail: 'SHA256SUMS' }],
    references: [],
    sizeBytes: 1024,
  })
  assert.equal(verdict.verdict, 'protected')
  assert.match(verdict.reason, /承诺/)
})

test('judgeCandidate：有代码引用同样出局——「没承诺但有人在用」也不是垃圾', () => {
  const verdict = judgeCandidate({
    commitments: [],
    references: [{ file: 'packaging/scripts/release-verify.sh', line: 41 }],
    sizeBytes: 1024,
  })
  assert.equal(verdict.verdict, 'protected')
  assert.match(verdict.reason, /引用/)
})

test('judgeCandidate：①②都为否才进建议（体积这时才有发言权）', () => {
  const verdict = judgeCandidate({ commitments: [], references: [], sizeBytes: 5 * 1024 * 1024 })
  assert.equal(verdict.verdict, 'suggested')
})

test('orderSuggested：只留建议项，按体积降序', () => {
  const items = [
    { candidate: 'a', verdict: 'suggested', sizeBytes: 10 },
    { candidate: 'b', verdict: 'protected', sizeBytes: 999999 },
    { candidate: 'c', verdict: 'suggested', sizeBytes: 100 },
  ]
  assert.deepEqual(orderSuggested(items).map((item) => item.candidate), ['c', 'a'])
})

// ── ① 承诺面：四个来源各自的读数 ─────────────────────────────────────────────

test('inspectCandidate：目录内的 SHA256SUMS 是发布清单承诺', async () => {
  await withMutationFixture({ prefix: 'cleanup-inventory' }, async (fixture) => {
    const item = join(fixture.repo, 'release-item')
    mkdirSync(item)
    writeFileSync(join(item, 'SHA256SUMS'), 'abc  DSH-Desktop.dmg\n')

    const reading = inspectCandidate({
      candidate: 'release-item',
      repoRoot: fixture.repo,
      deps: fakeDeps({ root: fixture.repo }),
    })

    assert.equal(reading.verdict, 'protected')
    assert.ok(reading.commitments.some((entry) => entry.kind === 'release-manifest'))
    assert.match(JSON.stringify(reading.commitments), /SHA256SUMS/)
  })
})

test('inspectCandidate：uchg 不可变标志是承诺（ADR-0067 决策 2）', async () => {
  await withMutationFixture({ prefix: 'cleanup-inventory' }, async (fixture) => {
    const item = join(fixture.repo, 'frozen-item')
    mkdirSync(item)

    const reading = inspectCandidate({
      candidate: 'frozen-item',
      repoRoot: fixture.repo,
      // 0x2 = UF_IMMUTABLE（实测 packaging/release/2.4.1 的 `stat -f %f` 读数就是 2）
      deps: fakeDeps({ root: fixture.repo, flags: 2 }),
    })

    assert.equal(reading.verdict, 'protected')
    assert.ok(reading.commitments.some((entry) => entry.kind === 'immutable-flag'))
    assert.match(JSON.stringify(reading.commitments), /uchg/)
  })
})

test('inspectCandidate：门禁射程与 ADR 决策段各自是一条承诺读数', async () => {
  await withMutationFixture({ prefix: 'cleanup-inventory' }, async (fixture) => {
    const item = join(fixture.repo, 'referenced-item')
    mkdirSync(item)

    const reading = inspectCandidate({
      candidate: 'referenced-item',
      repoRoot: fixture.repo,
      deps: fakeDeps({
        root: fixture.repo,
        hits: {
          'referenced-item': [
            { file: 'scripts/gates/release-publish-scope.mjs', line: 12, text: "const ROOT = 'referenced-item'" },
            { file: 'docs/adr/ADR-0067.md', line: 88, text: 'referenced-item 不允许删除' },
          ],
        },
      }),
    })

    assert.equal(reading.verdict, 'protected')
    assert.ok(reading.commitments.some((entry) => entry.kind === 'gate-scope'))
    assert.ok(reading.commitments.some((entry) => entry.kind === 'adr-decision'))
  })
})

test('inspectCandidate：代码调用点算「引用」，且与承诺分开报', async () => {
  await withMutationFixture({ prefix: 'cleanup-inventory' }, async (fixture) => {
    const item = join(fixture.repo, 'used-item')
    mkdirSync(item)

    const reading = inspectCandidate({
      candidate: 'used-item',
      repoRoot: fixture.repo,
      deps: fakeDeps({
        root: fixture.repo,
        hits: {
          'used-item': [
            { file: 'packaging/scripts/release-verify.sh', line: 41, text: 'bash used-item/check.sh' },
          ],
        },
      }),
    })

    assert.equal(reading.verdict, 'protected')
    assert.equal(reading.commitments.length, 0)
    assert.equal(reading.references.length, 1)
    assert.match(reading.reason, /引用/)
  })
})

test('inspectCandidate：①②都为否的候选带体积进建议（三步读数各自成立）', async () => {
  await withMutationFixture({ prefix: 'cleanup-inventory' }, async (fixture) => {
    const item = join(fixture.repo, 'plain-junk')
    mkdirSync(item)
    writeFileSync(join(item, 'blob.bin'), Buffer.alloc(4096))

    const reading = inspectCandidate({
      candidate: 'plain-junk',
      repoRoot: fixture.repo,
      deps: fakeDeps({ root: fixture.repo }),
    })

    assert.equal(reading.verdict, 'suggested')
    assert.deepEqual(reading.commitments, [])
    assert.deepEqual(reading.references, [])
    assert.ok(reading.sizeBytes >= 4096)
  })
})

// ── 真实文件系统上的两个采集器（不碰 git） ──────────────────────────────────

test('scanReleaseManifests：认出 SHA256SUMS 与 *.sha256，返回相对文件名', async () => {
  await withMutationFixture({ prefix: 'cleanup-inventory' }, async (fixture) => {
    const item = join(fixture.repo, 'one-item')
    mkdirSync(item)
    writeFileSync(join(item, 'SHA256SUMS'), 'x\n')
    writeFileSync(join(item, 'DSH.dmg'), 'x\n')

    assert.deepEqual(scanReleaseManifests(item), ['SHA256SUMS'])
    assert.deepEqual(scanReleaseManifests(join(fixture.repo, 'missing')), [])
  })
})

test('dirSizeBytes：目录体积可复现（空目录 0，含 4 KiB 文件 >= 4096）', async () => {
  await withMutationFixture({ prefix: 'cleanup-inventory' }, async (fixture) => {
    const item = join(fixture.repo, 'sized')
    mkdirSync(item)
    assert.equal(dirSizeBytes(item), 0)
    writeFileSync(join(item, 'blob.bin'), Buffer.alloc(4096))
    assert.ok(dirSizeBytes(item) >= 4096)
  })
})

/**
 * 注入式 deps：测试里不需要 git、不需要真实 flags / 文本扫描。
 * `hits` 把「哪些候选被哪些文件提到」写成表——判据的输入面即这张表。
 */
function fakeDeps({ root, flags = 0, hits = {} }) {
  return {
    listReleaseManifests: (absPath) => scanReleaseManifests(absPath),
    readImmutableFlags: () => flags,
    searchTracked: (needle) => hits[needle] ?? [],
    dirSizeBytes: (absPath) => dirSizeBytes(absPath),
    repoRoot: root,
  }
}
