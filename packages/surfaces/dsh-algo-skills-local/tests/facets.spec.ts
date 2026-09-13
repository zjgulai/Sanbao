/**
 * The provenance criterion: what a card's classification row says when the card
 * carries no value for a field.
 *
 * Three layers, deliberately:
 *
 *  1. the pure decision (`provenanceCells`) — a field the card does not carry
 *     renders 「未标注」 and reports `missing: true`;
 *  2. the decision applied to realistic corpora — all-absent, all-present and
 *     half-present, because the real 146-card curated line is mostly
 *     half-present (33 have a `venue`, 21 an `evidence_grade`);
 *  3. **the mutation** — the same source with the fallback removed, loaded and
 *     asserted to produce blanks. Layer 3 is what makes layers 1–2 worth
 *     anything: without it, deleting the fallback would leave a green suite that
 *     still "checks" the wording. `page-render.spec.tsx` drives the same
 *     criterion through the mounted page; this file proves the criterion itself
 *     is load-bearing rather than incidentally satisfied.
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PROVENANCE_FACETS, provenanceCells, type ProvenanceCell, type ProvenanceKey } from '../src/client/facets.ts'
import { runMutant } from './mutate.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const FACETS_SRC = join(HERE, '..', 'src', 'client', 'facets.ts')

/** The copy object the page passes in (zh strings; the criterion is locale-blind). */
const COPY = {
  labels: {
    venue: 'venue',
    venueTier: '档位',
    evidenceGrade: '证据',
    paperId: '论文',
    codeLevel: '代码',
  } as Record<ProvenanceKey, string>,
  unlabeled: '未标注',
}

/** An empty card — every provenance field absent, which is the real majority. */
const BARE = { venue: '', venueTier: '', evidenceGrade: '', paperId: '', codeLevel: '' }

/**
 * The child-process runner: imports the mutated module, calls the criterion with
 * the same empty card the in-process assertions use, and prints the cells.
 * Kept in this file (not in the harness) so the mutation's meaning is readable
 * next to the assertion it is supposed to flip.
 */
const RUNNER = `
import { provenanceCells } from './mutant.mjs'
const BARE = ${JSON.stringify(BARE)}
const COPY = ${JSON.stringify(COPY)}
console.log(JSON.stringify(provenanceCells(BARE, COPY)))
`

describe('provenanceCells', () => {
  it('names every facet, in one fixed order', () => {
    const cells = provenanceCells(BARE, COPY)
    expect(cells.map((c) => c.key)).toEqual(['venue', 'venueTier', 'evidenceGrade', 'paperId', 'codeLevel'])
    // The facet table is the single list of what a card's row carries; a facet
    // added to the wire contract but not here would simply never render.
    expect(PROVENANCE_FACETS.map((f) => f.key)).toEqual(cells.map((c) => c.key))
  })

  it('renders 未标注 — not an empty string — for every absent field', () => {
    const cells = provenanceCells(BARE, COPY)
    expect(cells.map((c) => c.value)).toEqual(['未标注', '未标注', '未标注', '未标注', '未标注'])
    expect(cells.every((c) => c.missing)).toBe(true)
    for (const cell of cells) expect(cell.value.trim()).not.toBe('')
  })

  it('renders the value written on the card, unchanged', () => {
    const cells = provenanceCells(
      { venue: 'SIGIR 2025', venueTier: 'CCF-A', evidenceGrade: 'A', paperId: '2406.12089', codeLevel: '完整实现·可解析' },
      COPY,
    )
    expect(cells.map((c) => c.value)).toEqual(['SIGIR 2025', 'CCF-A', 'A', '2406.12089', '完整实现·可解析'])
    expect(cells.some((c) => c.missing)).toBe(false)
  })

  it('treats a whitespace-only value as absent, and keeps mixed rows mixed', () => {
    // 卡面写了一个空格，与「没写」是同一件事；把它当有值会在屏幕上画出一个空格子，
    // 正是这一条判据要防的那个失效。
    const cells = provenanceCells({ ...BARE, venue: '   ', venueTier: 'preprint' }, COPY)
    expect(cells.find((c) => c.key === 'venue')?.value).toBe('未标注')
    expect(cells.find((c) => c.key === 'venue')?.missing).toBe(true)
    expect(cells.find((c) => c.key === 'venueTier')?.value).toBe('preprint')
    expect(cells.find((c) => c.key === 'venueTier')?.missing).toBe(false)
    expect(cells.filter((c) => c.missing)).toHaveLength(4)
  })

  it('does not invent a value for a field the row does not even carry', () => {
    // 老 payload / 老卡：字段整个不在对象上。`undefined` 必须走「未标注」，
    // 而不是渲染成 "undefined"。
    const cells = provenanceCells({} as never, COPY)
    expect(cells.map((c) => c.value)).toEqual(['未标注', '未标注', '未标注', '未标注', '未标注'])
    expect(cells.map((c) => c.value)).not.toContain('undefined')
  })
})

describe('mutation: the 未标注 fallback is load-bearing', () => {
  it('the original falls back to 未标注 while the mutated copy falls back to a blank cell', () => {
    const run = runMutant(FACETS_SRC, [
      ['value: missing ? copy.unlabeled : raw,', 'value: missing ? \'\' : raw,'],
    ], RUNNER)
    try {
      // 先证明变异改变了真实取值，再谈判据有没有劲。
      const original: ProvenanceCell[] = provenanceCells(BARE, COPY)
      const broken = run.result as ProvenanceCell[]
      expect(original.map((c) => c.value)).toEqual(['未标注', '未标注', '未标注', '未标注', '未标注'])
      expect(broken.map((c) => c.value)).toEqual(['', '', '', '', ''])

      // 也就是：把判据改坏之后，本文件与 page-render.spec.tsx 里「不许空白」的那条
      // 断言会失败。
      const blankAssertionHolds = (cells: readonly { value: string }[]): boolean =>
        cells.every((c) => c.value.trim().length > 0)
      expect(blankAssertionHolds(original)).toBe(true)
      expect(blankAssertionHolds(broken)).toBe(false)

      // 反向控制：`missing` 仍然为真，所以「只是文案没了」不会伪装成「字段有值了」。
      expect(broken.every((c) => c.missing)).toBe(true)
    } finally {
      run.dispose()
    }
  })

  it('refuses to run a mutation whose anchor does not occur exactly once', () => {
    // 变异本身也要能被抓：锚点写错（出现 0 次或 2 次）时 harness 必须报出来，
    // 否则「变异没施上力」会被读成「判据没劲」（run_phase6_gates.py 的实际缺陷）。
    expect(() => runMutant(FACETS_SRC, [['this anchor does not exist', 'x']], RUNNER))
      .toThrow(/exactly once/u)
    expect(() => runMutant(FACETS_SRC, [['const', 'const']], RUNNER))
      .toThrow(/exactly once/u)
  })
})
