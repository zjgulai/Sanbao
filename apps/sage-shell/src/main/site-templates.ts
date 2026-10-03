/** Ticket 040 (US-195/196): the site starting-template catalog — read-only, presentation-only.
 *
 * The rules the ticket names:
 *
 * - **The list is read-only and names its provenance**: every entry carries name, source and
 *   version; nothing here edits, installs, or writes the catalog.
 * - **Selecting a template produces only this draft's input**: the store hands the renderer the
 *   entry's prompt text, and the renderer inserts it into the editable draft input. There is NO
 *   site-create request anywhere — this module has no bridge caller at all, and it never writes
 *   config or any record (the zero-effect rule is structural, not a promise).
 * - **Unavailable is a named state, never a silent substitution**: with no catalog provider the
 *   read answers `unavailable` + reason; a malformed payload is `unreadable` — the surface never
 *   shows an empty list as if the catalog were empty, and never replaces one template with another.
 * - Site creation, publishing, domains and go-live verification stay out (§7.8); no market writes.
 */

import type { SiteTemplateView, SiteTemplatesStatus } from '../appservice/contracts.js'

export type { SiteTemplateView, SiteTemplatesStatus }

/** The catalog provider port: a Sage-side dependency, never a bridge call. */
export type SiteTemplateCatalogSource = () => unknown | Promise<unknown>

export interface SiteTemplatesDeps {
  /** Production wires none today (no catalog source exists) — the read stays honestly unavailable. */
  readonly catalog?: SiteTemplateCatalogSource
}

export interface SiteTemplatesStore {
  readonly read: () => Promise<SiteTemplatesStatus>
}

const MAX_ENTRIES = 50
const MAX_ID = 128
const MAX_NAME = 160
const MAX_SOURCE = 128
const MAX_VERSION = 64
const MAX_PROMPT = 16_384

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function bounded(value: unknown, max: number): string | null {
  return typeof value === 'string' && value !== '' && value === value.trim() && value.length <= max && !value.includes('\u0000')
    ? value
    : null
}

export function createSiteTemplates(deps: SiteTemplatesDeps = {}): SiteTemplatesStore {
  const unavailable = (reason: string): SiteTemplatesStatus => ({ state: 'unavailable', reason, entries: [] })

  const read = async (): Promise<SiteTemplatesStatus> => {
    if (deps.catalog === undefined) return unavailable('site-templates-provider-unavailable')
    let value: unknown
    try {
      value = await deps.catalog()
    } catch {
      return unavailable('site-templates-failed')
    }
    if (!isRecord(value) || !Array.isArray(value.entries)) return unavailable('site-templates-unreadable')
    const entries: SiteTemplateView[] = []
    for (const raw of value.entries.slice(0, MAX_ENTRIES)) {
      if (!isRecord(raw)) continue
      const templateId = bounded(raw.templateId, MAX_ID)
      const name = bounded(raw.name, MAX_NAME)
      const source = bounded(raw.source, MAX_SOURCE)
      const version = bounded(raw.version, MAX_VERSION)
      if (templateId === null || name === null || source === null || version === null) continue
      const prompt = typeof raw.prompt === 'string' && raw.prompt.trim() !== '' && raw.prompt.length <= MAX_PROMPT
        ? raw.prompt
        : null
      entries.push({ templateId, name, source, version, prompt })
    }
    return { state: 'read', reason: null, entries }
  }

  return { read }
}
