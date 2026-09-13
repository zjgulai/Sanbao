/**
 * Card provenance cells — the single place that decides what a card's
 * provenance row says, **including what it says when the card carries no value
 * at all**.
 *
 * Why this is its own module rather than five ternaries inside the JSX: the
 * whole reason this surface exists is that the corpus's own facts become
 * visible, and the failure mode that matters is not "the value is wrong" but
 * "the value is absent and nothing says so". A blank cell renders identically
 * whether nobody measured the fact or the fact is missing — the page looks
 * complete while saying less. 「未标注」 is therefore a **criterion**, not copy:
 * it is a behaviour a test can hold still, and it lives in a pure function so
 * that test does not need a browser.
 *
 * The values themselves are transmitted verbatim from the card (see
 * `collect.ts::parseSkill`); nothing here classifies, normalizes or defaults a
 * value. An out-of-vocabulary tier is shown as written — deciding it is wrong
 * would be this package inventing a fact, and the corpus is the authority.
 * @module dsh-algo-skills-local/client/facets
 */

import type { SkillRow } from '../wire.ts'

/**
 * The five transmitted provenance fields, in render order.
 *
 * `key` doubles as the `SkillRow` field name, so adding a field to the wire
 * contract without rendering it is a type error rather than a silent omission.
 */
export const PROVENANCE_FACETS = [
  { key: 'venue', labelKey: 'prov.venue' },
  { key: 'venueTier', labelKey: 'prov.tier' },
  { key: 'evidenceGrade', labelKey: 'prov.grade' },
  { key: 'paperId', labelKey: 'prov.paper' },
  { key: 'codeLevel', labelKey: 'prov.code' },
] as const

/** Field name of one provenance cell. */
export type ProvenanceKey = (typeof PROVENANCE_FACETS)[number]['key']

/** One rendered `label: value` cell. */
export interface ProvenanceCell {
  /** Which `SkillRow` field this cell carries. */
  key: ProvenanceKey
  /** Localized label (「venue」 / 「档位」 …). */
  label: string
  /** What to print — the value, or the localized 「未标注」 when there is none. */
  value: string
  /** Whether the card carried no value. Drives styling only; `value` is never blank. */
  missing: boolean
}

/** The translated strings this module needs; passed in so it stays pure. */
export interface ProvenanceCopy {
  /** Cell labels, keyed by field name. */
  labels: Record<ProvenanceKey, string>
  /** What to print in place of a value the card does not carry. */
  unlabeled: string
}

/**
 * Build the provenance cells for one card.
 *
 * The one rule worth stating out loud: **a cell is never empty**. A field the
 * card does not carry renders `copy.unlabeled`. Returning `''` here (the
 * mutation this rule was written to catch) makes the page look exactly like a
 * page whose cards all carry values, so the omission disappears instead of
 * being reported.
 * @param card - the fields transmitted for this card (empty string = absent).
 * @param copy - localized labels plus the "no value" wording.
 * @returns one cell per facet, in `PROVENANCE_FACETS` order.
 */
export function provenanceCells(card: Pick<SkillRow, ProvenanceKey>, copy: ProvenanceCopy): ProvenanceCell[] {
  return PROVENANCE_FACETS.map((facet) => {
    const raw = String(card[facet.key] ?? '').trim()
    const missing = raw === ''
    return {
      key: facet.key,
      label: copy.labels[facet.key],
      value: missing ? copy.unlabeled : raw,
      missing,
    }
  })
}
