import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { CSV_PREVIEW_CAPS } from '../src/main/csv.js'

/**
 * Ticket 016 (US-041): the product caps come from the measured record — this spec keeps the code
 * constant and the record's machine-readable block from drifting apart, and checks the record
 * still carries the raw measurement that justified them.
 */
describe('the CSV caps and their measured record', () => {
  const record = readFileSync(new URL('../../../docs/notes/implemented/architecture/2026-10-02-csv-preview-caps-measured.md', import.meta.url), 'utf8')

  it('locks the shipped caps to the record block', () => {
    const block = record.match(/```json\n([\s\S]*?)\n```/u)
    expect(block, 'record must carry a machine-readable block').not.toBeNull()
    const parsed = JSON.parse(block![1]!) as { readonly caps: unknown }
    expect(parsed.caps).toEqual(CSV_PREVIEW_CAPS)
  })

  it('keeps the raw run in the record: command, environment, and the deciding rows', () => {
    expect(record).toContain('node scripts/measure-csv.mjs')
    expect(record).toContain('38.47')
    expect(record).toContain('1255.51')
    expect(record).toContain('149.90')
    expect(record).toContain('≤ ~50ms')
  })
})
