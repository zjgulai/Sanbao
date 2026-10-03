/** Ticket 033 (US-175/176, D-048): typed tool results rendered by Sage-owned components.
 *
 * The declaration is plugin-side data, so it is treated as untrusted input: a strict parser admits
 * exactly the supported types with bounded sizes, and everything else is refused **by name**
 * (`tool-result-type-unsupported`) — never approximated by substitute rendering. Sensitive fields
 * arrive masked; the raw payload never crosses this projection. Images are admitted only when the
 * reference resolves to a READY image artifact of this run (the same permission home the 015
 * preview reads under) — an unresolvable or non-image reference is a refused entry, not a guess.
 * This module renders values; it executes nothing: no scripts, no interpolated markup, and no
 * authoritative action input — the only interactive entries are the caller's explicit open
 * actions (external link / artifact preview) built by the renderer.
 */
import type {
  ToolResultField,
  ToolResultUnsupportedView,
  ToolResultView,
  ToolResultsStatus,
} from '../appservice/contracts.js'
import { readExternalUrl } from './external-links.js'
import type { ArtifactRecord } from './artifacts.js'

const MAX_RESULTS = 32
const MAX_TITLE = 200
const MAX_TOOL = 80
const MAX_TEXT = 8192
const MAX_FIELDS = 32
const MAX_NAME = 80
const MAX_VALUE = 2000
const MAX_COLUMNS = 12
const MAX_ROWS = 100
const MAX_CELL = 400
const MASK = '（已脱敏）'

export interface ToolResultsDeps {
  /** The declarations currently on offer (unwired in production ⇒ no source, honest unavailable). */
  readonly declarations?: () => readonly unknown[]
  /** The 015 artifact home: image refs are admitted only as READY images of this run. */
  readonly artifactRecord: (artifactId: string) => ArtifactRecord | undefined
}

export interface ToolResultsStore {
  readonly list: () => ToolResultsStatus
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function boundedString(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.length <= max ? value : null
}

/** One field of a supported declaration → its view, or a refused entry with its own code. */
function fieldOf(raw: Record<string, unknown>): ToolResultField {
  if (raw.type === 'text') {
    const text = boundedString(raw.text, MAX_TEXT)
    return text === null ? { kind: 'refused', code: 'tool-result-field-invalid' } : { kind: 'text', text }
  }
  if (raw.type === 'key-values') {
    if (!Array.isArray(raw.fields) || raw.fields.length === 0 || raw.fields.length > MAX_FIELDS) return { kind: 'refused', code: 'tool-result-field-invalid' }
    const entries: { name: string, value: string }[] = []
    for (const entry of raw.fields) {
      if (!isRecord(entry)) return { kind: 'refused', code: 'tool-result-field-invalid' }
      const name = boundedString(entry.name, MAX_NAME)
      const value = boundedString(entry.value, MAX_VALUE)
      if (name === null || value === null) return { kind: 'refused', code: 'tool-result-field-invalid' }
      entries.push({ name, value: entry.sensitive === true ? MASK : value })
    }
    return { kind: 'key-values', entries }
  }
  if (raw.type === 'table') {
    const columns = Array.isArray(raw.columns) ? raw.columns : null
    const rows = Array.isArray(raw.rows) ? raw.rows : null
    if (columns === null || rows === null || columns.length === 0 || columns.length > MAX_COLUMNS || rows.length > MAX_ROWS) {
      return { kind: 'refused', code: 'tool-result-field-invalid' }
    }
    const header: string[] = []
    for (const column of columns) {
      const text = boundedString(column, MAX_NAME)
      if (text === null) return { kind: 'refused', code: 'tool-result-field-invalid' }
      header.push(text)
    }
    const body: string[][] = []
    for (const row of rows) {
      if (!Array.isArray(row) || row.length !== columns.length) return { kind: 'refused', code: 'tool-result-field-invalid' }
      const cells: string[] = []
      for (const cell of row) {
        const text = boundedString(cell, MAX_CELL)
        if (text === null) return { kind: 'refused', code: 'tool-result-field-invalid' }
        cells.push(text)
      }
      body.push(cells)
    }
    return { kind: 'table', columns: header, rows: body }
  }
  if (raw.type === 'link') {
    const label = boundedString(raw.label, MAX_NAME)
    const url = boundedString(raw.url, 2048)
    if (label === null || url === null) return { kind: 'refused', code: 'tool-result-field-invalid' }
    const reading = readExternalUrl(url)
    // The layout stays renderable; the entry does not — and it is never replaced by a guess.
    return reading.ok
      ? { kind: 'link', label, host: reading.host, url: reading.url }
      : { kind: 'refused', code: reading.code }
  }
  return { kind: 'refused', code: 'tool-result-field-invalid' }
}

export function createToolResults(deps: ToolResultsDeps): ToolResultsStore {
  const imageFieldOf = (raw: Record<string, unknown>): ToolResultField => {
    const artifactId = boundedString(raw.artifactId, 160)
    if (artifactId === null) return { kind: 'refused', code: 'tool-result-field-invalid' }
    const record = deps.artifactRecord(artifactId)
    // Permission home = the 015 store: only a ready image of this run gets an entry; the byte
    // read still goes through the preview's own version-checked open.
    if (record === undefined || record.kind !== 'image' || record.state !== 'ready') {
      return { kind: 'refused', code: 'tool-result-image-not-permitted' }
    }
    return { kind: 'image', name: record.name, artifactId: record.artifactId, version: record.version }
  }

  const viewOf = (raw: unknown): ToolResultView | ToolResultUnsupportedView | null => {
    if (!isRecord(raw)) return null
    const resultId = boundedString(raw.resultId, 160)
    const tool = boundedString(raw.tool, MAX_TOOL)
    const title = boundedString(raw.title, MAX_TITLE)
    if (resultId === null || tool === null || title === null) return null
    const at = boundedString(raw.at, 80) ?? ''
    const supported = raw.type === 'text' || raw.type === 'key-values' || raw.type === 'table' || raw.type === 'link' || raw.type === 'image'
    if (supported) {
      const field = raw.type === 'image' ? imageFieldOf(raw) : fieldOf(raw)
      return { resultId, tool, title, at, state: 'read', fields: [field] }
    }
    // Anything else: refused by the declared name — shown as such, never approximated.
    return { resultId, tool, title, at, state: 'unsupported', declaredType: boundedString(raw.type, MAX_NAME) ?? '未知' }
  }

  return {
    list() {
      const source = deps.declarations
      if (source === undefined) return { state: 'unavailable', reason: 'tool-results-provider-unavailable' }
      let raws: readonly unknown[]
      try {
        raws = source()
      } catch {
        return { state: 'unavailable', reason: 'tool-results-read-failed' }
      }
      const results: (ToolResultView | ToolResultUnsupportedView)[] = []
      for (const raw of raws.slice(0, MAX_RESULTS)) {
        const view = viewOf(raw)
        if (view !== null) results.push(view)
      }
      return { state: 'read', results }
    },
  }
}
