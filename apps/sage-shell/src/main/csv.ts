/** Ticket 016 (US-039/041): the CSV preview — a strict-enough parser, measured caps, honest cuts.
 *
 * Why the caps exist at all: the preview parses inside the app process, so the product must name
 * what it will and will not swallow. The numbers in {@link CSV_PREVIEW_CAPS} are NOT the base's
 * defaults — they were chosen from this repository's own measurement run, recorded verbatim in
 * `docs/notes/implemented/architecture/2026-10-02-csv-preview-caps-measured.md` (the spec file
 * `test/csv-caps.spec.ts` fails if code and record drift apart).
 *
 * Parse discipline (FW-005: 缺内容/超出处理能力/格式不支持/解析失败分别反馈，不能伪装空文档):
 *
 * - an empty file and a broken file are different facts, each with its own state;
 * - rows beyond the row cap, columns beyond the column cap and cells beyond the cell cap are
 *   **cuts**, each counted and reported — never silently dropped;
 * - RFC 4180 quoting is honored; a quote that opens and never closes is a parse failure, because
 *   rendering the twisted remainder as a table would be a guess.
 */
export interface CsvCaps {
  /** Page requested from the reader: this many rows + 1, so truncation is visible as `eof: false`. */
  readonly maxRows: number
  /** Displayed columns per row; extra cells are cut and counted. */
  readonly maxColumns: number
  /** Characters kept per cell; longer cells are ellipsized and counted. */
  readonly maxCellCharacters: number
}

/** The measured caps — see the record note; must equal its machine-readable block. */
export const CSV_PREVIEW_CAPS: CsvCaps = { maxRows: 2000, maxColumns: 64, maxCellCharacters: 200 }

export type CsvParseOutcome =
  | {
    readonly state: 'parsed'
    readonly rows: readonly (readonly string[])[]
    readonly columnsCut: number
    readonly cellsCut: number
  }
  | { readonly state: 'empty' }
  | { readonly state: 'parse-failed', readonly reason: 'quote-unterminated' | 'quote-junk' }

/**
 * Parse one CSV page. The page comes from the line-paged reader, so it is already bounded; this
 * parser only enforces structure and the displayed-shape caps.
 */
export function parseCsv(text: string, delimiter: ',' | '\t', caps: CsvCaps = CSV_PREVIEW_CAPS): CsvParseOutcome {
  if (text.trim() === '') return { state: 'empty' }
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let closedQuote = false
  let columnsCut = 0
  let cellsCut = 0
  let index = 0
  const pushField = (): void => {
    if (field.length > caps.maxCellCharacters) {
      field = field.slice(0, caps.maxCellCharacters - 1) + '…'
      cellsCut += 1
    }
    row.push(field)
    field = ''
    closedQuote = false
  }
  const pushRow = (): void => {
    pushField()
    if (row.length > caps.maxColumns) {
      columnsCut += row.length - caps.maxColumns
    }
    rows.push(row.slice(0, caps.maxColumns))
    row = []
  }
  while (index < text.length) {
    const char = text[index]!
    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"'
          index += 2
          continue
        }
        inQuotes = false
        closedQuote = true
        index += 1
        continue
      }
      field += char
      index += 1
      continue
    }
    if (closedQuote) {
      // RFC 4180 closes a quoted field only at a delimiter, a row end, or the file end. Trailing
      // spaces are the one common sloppiness that stays viewable; anything else would be a guess.
      if (char === ' ') {
        index += 1
        continue
      }
      if (char !== delimiter && char !== '\n' && char !== '\r') {
        return { state: 'parse-failed', reason: 'quote-junk' }
      }
    }
    if (char === '"') {
      if (field === '') {
        inQuotes = true
        index += 1
        continue
      }
      // A quote in the middle of an unquoted field is not RFC 4180; guessing would invent content.
      return { state: 'parse-failed', reason: 'quote-junk' }
    }
    if (char === delimiter) {
      pushField()
      index += 1
      continue
    }
    if (char === '\n' || char === '\r') {
      pushRow()
      if (char === '\r' && text[index + 1] === '\n') index += 1
      index += 1
      continue
    }
    field += char
    index += 1
  }
  if (inQuotes) return { state: 'parse-failed', reason: 'quote-unterminated' }
  // A trailing newline terminates the last row rather than opening an empty one.
  if (field !== '' || row.length > 0) pushRow()
  return { state: 'parsed', rows, columnsCut, cellsCut }
}

function escapeHtml(text: string): string {
  return text.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;')
}

export interface CsvDocumentInput {
  readonly name: string
  readonly bytes: number | null
  readonly parsed: Extract<CsvParseOutcome, { readonly state: 'parsed' }>
  readonly eof: boolean
}

/** A self-contained, script-free table viewer; every cut the parse made is stated under the table. */
export function buildCsvDocument(input: CsvDocumentInput): string {
  const header = input.parsed.rows[0] ?? []
  const body = input.parsed.rows.slice(1)
  const notes: string[] = []
  if (!input.eof) notes.push(`只显示前 ${String(input.parsed.rows.length)} 行（其余内容未读取显示）。`)
  if (input.parsed.columnsCut > 0) notes.push(`有 ${String(input.parsed.columnsCut)} 个列超出上限（每行只显示前 ${String(header.length)} 列）。`)
  if (input.parsed.cellsCut > 0) notes.push(`有 ${String(input.parsed.cellsCut)} 个单元格过长已截断显示。`)
  const renderRow = (cells: readonly string[], tag: 'th' | 'td'): string =>
    `<tr>${cells.map((cell) => `<${tag}>${escapeHtml(cell)}</${tag}>`).join('')}</tr>`
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(input.name)}</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<style>
body { margin: 0; padding: 1.1rem 1.2rem; background: #111a18; color: #f2f4ef; font: 12px/1.5 -apple-system, sans-serif; }
header { display: flex; gap: .6rem; align-items: baseline; padding-bottom: .55rem; border-bottom: 1px solid rgb(160 185 173 / 18%); }
h1 { font-size: .82rem; margin: 0; font-weight: 600; }
span { color: #9ba8a2; font-size: .72rem; }
table { border-collapse: collapse; margin-top: .8rem; font: 12px/1.5 "SF Mono", ui-monospace, monospace; }
th, td { border: 1px solid rgb(160 185 173 / 24%); padding: .3rem .55rem; text-align: left; vertical-align: top; white-space: pre-wrap; word-break: break-word; max-width: 24rem; }
th { background: rgb(160 185 173 / 12%); position: sticky; top: 0; }
tr:nth-child(even) td { background: rgb(160 185 173 / 5%); }
.note { margin-top: .8rem; color: #9ba8a2; font-size: .72rem; }
</style></head>
<body>
<header><h1>${escapeHtml(input.name)}</h1><span>CSV 表格 · ${input.bytes === null ? '字节数未知' : String(input.bytes) + ' 字节'} · ${String(input.parsed.rows.length)} 行 × ${String(header.length)} 列（按卡片版本读取）</span></header>
<table><thead>${renderRow(header, 'th')}</thead><tbody>${body.map((cells) => renderRow(cells, 'td')).join('')}</tbody></table>
${notes.map((note) => `<p class="note">${note}</p>`).join('\n')}
</body></html>`
}

/** The distinct empty-state document: an empty file is a fact, never a stand-in for a parse failure. */
export function buildCsvEmptyDocument(input: { readonly name: string, readonly bytes: number | null }): string {
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(input.name)}</title>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<style>body { margin: 0; padding: 1.2rem; background: #111a18; color: #9ba8a2; font: 12px/1.6 -apple-system, sans-serif; }</style>
</head><body>${escapeHtml(input.name)} · CSV · 空文件：没有可解析的行（这与"解析失败"是两回事）。</body></html>`
}
