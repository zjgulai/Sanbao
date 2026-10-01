/** WT-02B.2C in-memory identity registry: verified (issuer, subject) → opaque internal identity
 * handle. Runtime-only by contract (retention / legal hold undecided): nothing persists, nothing
 * logs, and handles are never derived from the raw subject (no deterministic pseudonyms). */
export interface IdentityRegistryEntry {
  readonly identityHandle: string
  /** Lookup hints only — never membership / role / grant authority (2A governance); empty until the organization-mapping ticket. */
  readonly candidateOrgRefs: readonly string[]
}

export interface IdentityRegistry {
  /** Resolve the runtime handle for a verified external subject, or mint one on first sight. */
  resolve(input: { readonly issuer: string; readonly subject: string }): IdentityRegistryEntry
}

export function createIdentityRegistry(options: { readonly randomHandle: () => string }): IdentityRegistry {
  const entries = new Map<string, IdentityRegistryEntry>()
  return {
    resolve({ issuer, subject }) {
      // NUL keeps the composite key unambiguous across issuer/subject splits.
      const key = `${issuer}\u0000${subject}`
      const existing = entries.get(key)
      if (existing !== undefined) return existing
      const entry: IdentityRegistryEntry = { identityHandle: options.randomHandle(), candidateOrgRefs: [] }
      entries.set(key, entry)
      return entry
    },
  }
}
