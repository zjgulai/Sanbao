#!/usr/bin/env node
/** Ticket 016 的容量实测：本机、本次运行，用出货解析器（lib/main/csv.js）量解析与建表成本。
 *  产物上限从这张表里选（留出余量），而不是照抄基座默认值。 */
import { performance } from 'node:perf_hooks'
import { parseCsv, buildCsvDocument } from '../lib/main/csv.js'

const CAPS = { maxRows: 2000, maxColumns: 64, maxCellCharacters: 200 }

function makeCsv(rows, columns, cellChars) {
  const parts = []
  parts.push(Array.from({ length: columns }, (_, c) => `col_${c}`).join(','))
  for (let r = 0; r < rows; r += 1) {
    parts.push(Array.from({ length: columns }, (_, c) => `r${r}c${c}-${'x'.repeat(Math.max(0, cellChars - 8))}`).join(','))
  }
  return parts.join('\n')
}

const SIZES = [
  { rows: 500, columns: 8, cell: 12 },
  { rows: 2000, columns: 8, cell: 12 },
  { rows: 2000, columns: 64, cell: 12 },
  { rows: 2000, columns: 16, cell: 200 },
  { rows: 5000, columns: 16, cell: 24 },
  { rows: 20000, columns: 8, cell: 12 },
  { rows: 50000, columns: 32, cell: 24 },
]

process.stdout.write('| 行 × 列 × 单元字符 | 字节 | 解析 ms | 建表 ms | 合计 ms |\n')
process.stdout.write('| --- | --- | --- | --- | --- |\n')
for (const size of SIZES) {
  const text = makeCsv(size.rows, size.columns, size.cell)
  const bytes = Buffer.byteLength(text, 'utf8')
  const t0 = performance.now()
  const parsed = parseCsv(text, ',', CAPS)
  const t1 = performance.now()
  const doc = buildCsvDocument({ name: 'm.csv', bytes, parsed, eof: true })
  const t2 = performance.now()
  if (doc.length === 0) throw new Error('empty document')
  process.stdout.write(`| ${size.rows} × ${size.columns} × ${size.cell} | ${bytes} | ${(t1 - t0).toFixed(2)} | ${(t2 - t1).toFixed(2)} | ${(t2 - t0).toFixed(2)} |\n`)
}
