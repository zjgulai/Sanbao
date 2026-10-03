import { describe, expect, it } from 'vitest'

import type { ArtifactRecord } from '../src/main/artifacts.js'
import { createToolResults } from '../src/main/tool-results.js'

/**
 * Ticket 033 (US-175/176, D-048): typed tool results through Sage-owned components.
 *
 * The declaration is untrusted plugin-side data: a strict parser admits the supported types with
 * bounded sizes, masks sensitive fields, resolves image refs against the 015 store (ready images
 * only), refuses unsupported types BY NAME, and never lets raw payload or extra keys cross the
 * projection. Nothing in the module executes: no scripts, no authoritative action inputs.
 */

const imageRecord = (overrides: Partial<ArtifactRecord> = {}): ArtifactRecord => ({
  artifactId: 'art-1',
  matterRef: 'matter:1',
  workspaceRoot: '/w',
  path: '/w/chart.png',
  name: 'chart.png',
  kind: 'image',
  version: 'v7',
  bytes: 128,
  state: 'ready',
  observedAt: 't',
  ...overrides,
})

const harness = (declarations: readonly unknown[] | undefined, records: readonly ArtifactRecord[] = []) => createToolResults({
  ...(declarations === undefined ? {} : { declarations: () => declarations }),
  artifactRecord: (artifactId) => records.find((record) => record.artifactId === artifactId),
})

const base = { resultId: 'r1', tool: 'web.fetch', title: '抓取结果', at: '2026-10-03T10:00:00.000Z' }

describe('the typed tool-results module (ticket 033)', () => {
  it('renders each supported type as its own Sage-owned view, with sensitive fields masked', () => {
    const status = harness([
      { ...base, type: 'text', text: '第一行\n第二行' },
      { ...base, resultId: 'r2', type: 'key-values', fields: [{ name: '状态码', value: '200' }, { name: 'Authorization', value: 'Bearer sk-secret-123', sensitive: true }] },
      { ...base, resultId: 'r3', type: 'table', columns: ['渠道', '数量'], rows: [['直营', '12'], ['分销', '7']] },
      { ...base, resultId: 'r4', type: 'link', label: '官方文档', url: 'https://docs.example.com/guide?x=1' },
      { ...base, resultId: 'r5', type: 'image', artifactId: 'art-1' },
    ], [imageRecord()]).list()
    expect(status.state).toBe('read')
    if (status.state !== 'read') return
    expect(status.results).toHaveLength(5)
    const [text, kv, table, link, image] = status.results as Array<Record<string, unknown>>
    expect((text.fields as Array<Record<string, unknown>>)[0]).toMatchObject({ kind: 'text', text: '第一行\n第二行' })
    const kvField = (kv.fields as Array<Record<string, unknown>>)[0] as { entries: { name: string, value: string }[] }
    expect(kvField.entries).toEqual([{ name: '状态码', value: '200' }, { name: 'Authorization', value: '（已脱敏）' }])
    // The raw secret never crosses this projection.
    expect(JSON.stringify(status)).not.toContain('sk-secret-123')
    expect((table.fields as Array<Record<string, unknown>>)[0]).toMatchObject({ kind: 'table', columns: ['渠道', '数量'], rows: [['直营', '12'], ['分销', '7']] })
    expect((link.fields as Array<Record<string, unknown>>)[0]).toMatchObject({ kind: 'link', label: '官方文档', host: 'docs.example.com' })
    // Image refs resolve to the ready artifact of this run — name + version, never the path.
    expect((image.fields as Array<Record<string, unknown>>)[0]).toMatchObject({ kind: 'image', name: 'chart.png', artifactId: 'art-1', version: 'v7' })
    expect(JSON.stringify(status)).not.toContain('/w/chart.png')
  })

  it('refuses unsupported types by name and never approximates them', () => {
    const status = harness([
      { ...base, type: 'webgl-scene', data: { vertices: 1 } },
      { ...base, resultId: 'r2', type: 'text', text: 'ok' },
    ]).list()
    if (status.state !== 'read') throw new Error('expected read')
    const [unsupported] = status.results as Array<Record<string, unknown>>
    expect(unsupported).toMatchObject({ state: 'unsupported', declaredType: 'webgl-scene', tool: 'web.fetch' })
    // No fields are invented for it — nothing renders as substitute content.
    expect('fields' in unsupported).toBe(false)
  })

  it('keeps per-entry refusals honest: bad links and unpermitted images get codes, not entries', () => {
    const status = harness([
      { ...base, type: 'link', label: '危险链接', url: 'javascript:alert(1)' },
      { ...base, resultId: 'r2', type: 'image', artifactId: 'art-missing' },
      { ...base, resultId: 'r3', type: 'image', artifactId: 'art-text' },
      { ...base, resultId: 'r4', type: 'image', artifactId: 'art-absent' },
    ], [imageRecord({ artifactId: 'art-text', kind: 'text' }), imageRecord({ artifactId: 'art-absent', state: 'absent' })]).list()
    if (status.state !== 'read') throw new Error('expected read')
    const fields = (status.results as Array<{ fields: Array<Record<string, unknown>> }>).map((result) => result.fields[0])
    expect(fields[0]).toEqual({ kind: 'refused', code: 'link-scheme-refused' })
    expect(fields[1]).toEqual({ kind: 'refused', code: 'tool-result-image-not-permitted' })
    expect(fields[2]).toEqual({ kind: 'refused', code: 'tool-result-image-not-permitted' })
    expect(fields[3]).toEqual({ kind: 'refused', code: 'tool-result-image-not-permitted' })
  })

  it('bounds every field and drops extra keys; a throwing source is unavailable, never a partial list', () => {
    const big = harness([
      { ...base, type: 'text', text: 'x'.repeat(9000) },
      { ...base, resultId: 'r2', type: 'table', columns: ['a'], rows: [['1'], ['2'], ['3']], secretExtra: 'boom' },
    ]).list()
    if (big.state !== 'read') throw new Error('expected read')
    const [overlong, table] = big.results as Array<{ fields: Array<Record<string, unknown>> }>
    expect(overlong.fields[0]).toEqual({ kind: 'refused', code: 'tool-result-field-invalid' })
    expect(table.fields[0]).toMatchObject({ kind: 'table' })
    expect(JSON.stringify(big)).not.toContain('secretExtra')
    expect(JSON.stringify(big)).not.toContain('boom')

    const many = harness(Array.from({ length: 40 }, (_value, index) => ({ ...base, resultId: `r${String(index)}`, type: 'text', text: 't' }))).list()
    if (many.state !== 'read') throw new Error('expected read')
    expect(many.results).toHaveLength(32)

    expect(harness(undefined).list()).toEqual({ state: 'unavailable', reason: 'tool-results-provider-unavailable' })
    const throwing = createToolResults({ declarations: () => { throw new Error('down') }, artifactRecord: () => undefined }).list()
    expect(throwing).toEqual({ state: 'unavailable', reason: 'tool-results-read-failed' })
  })
})
