/** WT-02B.2C in-memory identity registry: verified (issuer, subject) → opaque internal identity
 * handle. Runtime-only by contract (retention / legal hold undecided): nothing persists, nothing
 * logs, and handles are never derived from the raw subject (no deterministic pseudonyms).
 * WT-02B.2F: candidate org refs from the verified IdP claim are stored/refreshed per login. */
export interface IdentityRegistryEntry {
  readonly identityHandle: string
  /** Lookup hints only — never membership / role / grant authority (2A governance). Refreshed on
   * every login with the IdP's latest answer (WT-02B.2F). */
  readonly candidateOrgRefs: readonly string[]
}

export interface IdentityRegistry {
  /** Resolve the runtime handle for a verified external subject, or mint one on first sight.
   * When the subject is already known, candidate refs are replaced with this login's answer. */
  resolve(input: {
    readonly issuer: string
    readonly subject: string
    readonly candidateOrgRefs: readonly string[]
  }): IdentityRegistryEntry
}

function sameRefs(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((ref, index) => ref === b[index])
}

export function createIdentityRegistry(options: { readonly randomHandle: () => string }): IdentityRegistry {
  const entries = new Map<string, IdentityRegistryEntry>()
  return {
    resolve({ issuer, subject, candidateOrgRefs }) {
      // NUL keeps the composite key unambiguous across issuer/subject splits.
      const key = `${issuer}\u0000${subject}`
      const existing = entries.get(key)
      if (existing !== undefined) {
        if (sameRefs(existing.candidateOrgRefs, candidateOrgRefs)) return existing
        const updated: IdentityRegistryEntry = {
          identityHandle: existing.identityHandle,
          candidateOrgRefs: [...candidateOrgRefs],
        }
        entries.set(key, updated)
        return updated
      }
      const entry: IdentityRegistryEntry = {
        identityHandle: options.randomHandle(),
        candidateOrgRefs: [...candidateOrgRefs],
      }
      entries.set(key, entry)
      return entry
    },
  }
}
