import { describe, expect, it } from 'vitest'

import { buildCsvDocument, buildCsvEmptyDocument, CSV_PREVIEW_CAPS, parseCsv } from '../src/main/csv.js'

/**
 * Ticket 016 (US-039): the CSV parser and table document.
 *
 * The acceptance lines that live here: a broken file and an empty file are different facts, each
 * with its own state; every cut the caps force is counted and reported, never silently dropped.
 */

describe('the CSV parser', () => {
  it('reads plain rows, CRLF, a trailing newline without a phantom row, and TSV', () => {
    const plain = parseCsv('a,b\nc,d\n', ',')
    expect(plain).toMatchObject({ state: 'parsed', rows: [['a', 'b'], ['c', 'd']], columnsCut: 0, cellsCut: 0 })
    const crlf = parseCsv('a,b\r\nc,d', ',')
    expect(crlf).toMatchObject({ state: 'parsed', rows: [['a', 'b'], ['c', 'd']] })
    const tsv = parseCsv('a\tb\nc\td', '\t')
    expect(tsv).toMatchObject({ state: 'parsed', rows: [['a', 'b'], ['c', 'd']] })
  })

  it('honors RFC 4180 quoting: quoted delimiters/newlines, doubled quotes, spaces after a close', () => {
    const quoted = parseCsv('"a,b","line1\nline2"\n"say ""hi""",x', ',')
    expect(quoted).toMatchObject({ state: 'parsed', rows: [['a,b', 'line1\nline2'], ['say "hi"', 'x']] })
    const spaced = parseCsv('"v" ,w', ',')
    expect(spaced).toMatchObject({ state: 'parsed', rows: [['v', 'w']] })
  })

  it('fails a broken quote instead of guessing: unterminated, junk after close, quote mid-field', () => {
    expect(parseCsv('"abc', ',')).toEqual({ state: 'parse-failed', reason: 'quote-unterminated' })
    expect(parseCsv('"abc"x,d', ',')).toEqual({ state: 'parse-failed', reason: 'quote-junk' })
    expect(parseCsv('ab"cd,e', ',')).toEqual({ state: 'parse-failed', reason: 'quote-junk' })
  })

  it('separates an empty file from a broken one', () => {
    expect(parseCsv('', ',')).toEqual({ state: 'empty' })
    expect(parseCsv('  \n \n', ',')).toEqual({ state: 'empty' })
    expect(parseCsv('"', ',')).toEqual({ state: 'parse-failed', reason: 'quote-unterminated' })
  })

  it('counts every cut the caps force: columns, cells, and long cells are reported, not dropped', () => {
    const caps = { maxRows: 2000, maxColumns: 3, maxCellCharacters: 5 }
    const wide = parseCsv('a,b,c,d,e\nf,g,h,i,j', ',', caps)
    expect(wide).toMatchObject({ state: 'parsed', columnsCut: 4 })
    expect((wide as { rows: string[][] }).rows).toEqual([['a', 'b', 'c'], ['f', 'g', 'h']])
    const longCell = parseCsv('123456789,x', ',', caps)
    expect(longCell).toMatchObject({ state: 'parsed', cellsCut: 1 })
    expect((longCell as { rows: string[][] }).rows[0]![0]).toBe('1234…')
  })
})

describe('the table document', () => {
  const parsed = { state: 'parsed' as const, rows: [['<h1>', 'b'] as string[], ['x', 'y'] as string[]], columnsCut: 1, cellsCut: 2 }

  it('renders an escaped table with header row, uses the default caps, and states every cut', () => {
    const doc = buildCsvDocument({ name: 'q3.cs<v>', bytes: 42, parsed, eof: false })
    expect(doc).toContain('<th>&lt;h1&gt;</th>')
    expect(doc).toContain('<td>x</td>')
    expect(doc).toContain('只显示前 2 行（其余内容未读取显示）。')
    expect(doc).toContain('有 1 个列超出上限')
    expect(doc).toContain('有 2 个单元格过长已截断显示。')
    expect(doc).not.toContain('<script')
    expect(CSV_PREVIEW_CAPS).toEqual({ maxRows: 2000, maxColumns: 64, maxCellCharacters: 200 })
  })

  it('gives an empty file its own sentence — never the parse-failure story', () => {
    const doc = buildCsvEmptyDocument({ name: 'empty.csv', bytes: 0 })
    expect(doc).toContain('空文件：没有可解析的行（这与"解析失败"是两回事）。')
    expect(doc).not.toContain('解析失败：结构无法解析')
  })
})
