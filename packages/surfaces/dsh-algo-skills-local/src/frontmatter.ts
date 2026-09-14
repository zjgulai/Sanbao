/**
 * SKILL.md frontmatter read/rewrite for the algorithm-skills surface.
 *
 * Two jobs, both pure (no I/O) so they can be regression-tested without a
 * cordis runtime:
 *
 *  1. `parseFields` — read the classification + display fields this surface
 *     renders. The paper→skills pipeline writes them as JSON-quoted scalars
 *     (`title: "3D Bin Packing…"`), so a naive `split(': ')` mangles any value
 *     containing a colon — which is most titles. Values are therefore decoded
 *     as JSON when they look quoted, and returned raw otherwise (hand-authored
 *     skills in the same directory are not quoted).
 *
 *  2. `rebuildFrontmatter` — flip `disable-model-invocation` and keep
 *     `user-invocable` true, preserving every other byte. This writes into the
 *     user's real `~/.dsh/skills`, so the contract is deliberately narrow and
 *     idempotent.
 *
 * The A1 semantics are inherited verbatim from `dsh-overseas-skills`: one
 * switch controls model invocation only; the "/" menu stays visible either way.
 * @module dsh-algo-skills-local/frontmatter
 */

/** The frontmatter key holding the split marker; must be the first line of the file. */
const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---/

/** Skill names double as directory names; anything else can escape the skills root. */
const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Whether a name is safe to `join()` onto the skills root.
 * @param name - candidate directory name.
 * @returns true for kebab-case names only.
 */
export function isValidSkillName(name: unknown): name is string {
  return typeof name === 'string' && NAME_PATTERN.test(name)
}

/**
 * Split a SKILL.md into its frontmatter block and the rest.
 * @param text - file contents.
 * @returns the block and its span, or `undefined` when the file opens without frontmatter.
 */
export function splitFrontmatter(text: string): { block: string; body: string } | undefined {
  const match = FRONTMATTER_PATTERN.exec(text)
  if (match === null) return undefined
  return { block: match[1], body: text.slice(match.index + match[0].length) }
}

/**
 * Decode one frontmatter scalar.
 *
 * JSON-quoted values are unquoted and unescaped; unquoted values are trimmed
 * and returned as-is. A value that looks quoted but is not valid JSON (a lone
 * leading quote, a stray backslash) falls back to the raw text rather than
 * throwing — a hand-edited skill must never take the whole list down.
 * @param raw - the text after the first colon on the line.
 * @returns the decoded value.
 */
export function decodeScalar(raw: string): string {
  const value = raw.trim()
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(value)
      if (typeof parsed === 'string') return parsed
    } catch {
      return value.slice(1, -1)
    }
  }
  return value
}

/**
 * Parse the frontmatter block into a field map.
 *
 * Only the first colon on a line splits key from value, so quoted values keep
 * their own colons intact. Repeated keys keep the last occurrence, matching how
 * the loader's own frontmatter reader resolves duplicates.
 * @param text - full SKILL.md contents.
 * @returns field name → decoded value (empty when the file has no frontmatter).
 */
export function parseFields(text: string): Map<string, string> {
  const fields = new Map<string, string>()
  const split = splitFrontmatter(text)
  if (split === undefined) return fields
  for (const line of split.block.split(/\r?\n/)) {
    const at = line.indexOf(':')
    if (at <= 0) continue
    const key = line.slice(0, at).trim()
    if (key === '') continue
    fields.set(key, decodeScalar(line.slice(at + 1)))
  }
  return fields
}

/**
 * One of the two invocation keys this module owns, with the raw text after its colon.
 *
 * The same expression decides both "which lines are replaced" and "how the file
 * spells this key" — one predicate, so a line can never be captured for style
 * while surviving the filter (which would leave two copies of the key behind).
 */
const SWITCH_LINE = /^(disable-model-invocation|user-invocable):(.*)$/

/**
 * Whether a raw frontmatter value is written JSON-quoted.
 *
 * The paper→skills pipeline quotes every scalar (`disable-model-invocation: "true"`);
 * hand-authored skills in the same directory do not. Both decode to the same
 * boolean here and in the loader, so the only question is which one to write
 * back: the one the file already uses.
 * @param raw - the text after the first colon on the line.
 * @returns true for a `"…"`-wrapped value.
 */
function isQuoted(raw: string): boolean {
  const value = raw.trim()
  return value.length >= 2 && value.startsWith('"') && value.endsWith('"')
}

/**
 * Rewrite the invocation switches without changing anything else — including
 * their spelling.
 *
 * Semantics:
 *  - `disable-model-invocation` := !enabled
 *  - `user-invocable` := true
 *  - a key already in the block is rewritten **where it stands**; a key that was
 *    absent is appended, last-first order, at the end of the block
 *  - a duplicated key collapses to its last occurrence (the one the loader reads),
 *    which is what "replaced, not appended" means once position is preserved
 *  - each key keeps the quoting style the file already used for it, so a card
 *    the pipeline serialized stays serialized that way; a key that was absent
 *    is written bare
 *  - the block's line ending is preserved (a CRLF card stays CRLF)
 *  - the body after the frontmatter is never modified
 *
 * Why position is part of the contract: the pipeline does not always emit these
 * two keys in the same slot. Cards that carry the curated-line fields
 * (`rebase_evidence_*`, written by the vault-side rebase) have the switches
 * *above* them, while the plain assembled cards have nothing after them — so
 * "append at the end" silently re-ordered 145 of the 1390 installed cards and
 * moved them; a card that began `… enabled / disable-model-invocation / rebase_*`
 * came back as `… enabled / rebase_* / disable-model-invocation`. Key order is
 * invisible to every reader, which is exactly why it survived: the value round
 * trips, only the bytes drift. Measured 2026-09-13 against the real corpus;
 * `corpus-write.spec.ts` catches it on all 1390 cards.
 *
 * The consequence worth stating: **a toggle that ends where it started leaves
 * the file byte-identical.** That is what a switch promises a user who clicks
 * it twice, and it is asserted against all 1390 installed cards in
 * `corpus-write.spec.ts`. (Residual: a block that mixes line endings *within
 * itself* normalizes to the style of its opening line.)
 * @param text - original file text.
 * @param enabled - desired model-invocation state.
 * @returns rewritten text, or `null` when there is no frontmatter (caller must
 *   then refuse the write rather than silently dropping the toggle).
 */
export function rebuildFrontmatter(text: string, enabled: boolean): string | null {
  const split = splitFrontmatter(text)
  if (split === undefined) return null
  const eol = text.startsWith('---\r\n') ? '\r\n' : '\n'

  /**
   * Last line index for each switch key, and whether that occurrence was quoted.
   * The *last* index is the slot the rewrite keeps — a block with the key twice
   * must come back with the key once, in the position the loader was reading.
   */
  const slot = new Map<string, number>()
  const quoted = new Map<string, boolean>()
  const lines = split.block.split(/\r?\n/)
  lines.forEach((line, i) => {
    const match = SWITCH_LINE.exec(line)
    if (match === null) return
    const key = match[1] as string
    slot.set(key, i)
    quoted.set(key, isQuoted(match[2] as string))
  })

  const write = (key: string, value: boolean): string => {
    const scalar = String(value)
    return quoted.get(key) === true ? `${key}: "${scalar}"` : `${key}: ${scalar}`
  }
  const values = new Map<string, string>([
    ['disable-model-invocation', write('disable-model-invocation', !enabled)],
    ['user-invocable', write('user-invocable', true)],
  ])

  const next: (string | null)[] = lines.map((line, i) => {
    const match = SWITCH_LINE.exec(line)
    if (match === null) return line
    const key = match[1] as string
    // Only the surviving slot is written here; earlier duplicates drop out, so
    // every key ends up exactly once no matter how many times the block had it.
    return slot.get(key) === i ? (values.get(key) as string) : null
  })
  for (const key of ['disable-model-invocation', 'user-invocable']) {
    if (!slot.has(key)) next.push(values.get(key) as string)
  }

  return `---${eol}${next.filter((line) => line !== null).join(eol)}${eol}---${split.body}`
}

/**
 * Normalize any thrown value to display text.
 *
 * `catch (e)` yields `unknown`; reading `.message` off it and interpolating
 * gives the literal string "undefined" in user-facing errors.
 * @param value - thrown value.
 * @returns readable text; empty string when there is nothing to say.
 */
export function errorMessage(value: unknown): string {
  if (value instanceof Error) return value.message
  if (typeof value === 'string') return value
  if (value === null || value === undefined) return ''
  return String(value)
}
