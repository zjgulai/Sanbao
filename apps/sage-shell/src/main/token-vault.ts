/** WT-02B.2B in-memory token vault: tokens never leave main, never persist, never log.
 * WT-02B.2E adds the non-secret session context (issuer provenance, timing, session ref)
 * that the Authority Runtime needs to build identity assertions. */
export interface VaultSession {
  readonly accessToken: string
  readonly idToken: string
  readonly displayName: string | null
  /** WT-02B.2C: opaque Sage-internal identity handle for this session (main-internal ref, never a token). */
  readonly identityHandle: string
  /** WT-02B.2E: exact verified issuer — non-secret provenance, never a subject. */
  readonly issuer: string
  /** WT-02B.2E: local accept moment (ISO UTC); deliberately not the token `iat` (IdP clock skew). */
  readonly authenticatedAt: string
  /** WT-02B.2E: verified id_token `exp` (ISO UTC); the authorization window never outlives it. */
  readonly expiresAt: string
}

/** WT-02B.2E main-internal session context; five non-secret fields, replaced per sign-in. */
export interface VaultIdentitySession {
  readonly sessionRef: string
  readonly identityHandle: string
  readonly issuer: string
  readonly authenticatedAt: string
  readonly expiresAt: string
}

export interface TokenVaultSnapshot {
  readonly status: 'signed-out' | 'signed-in'
  readonly displayName: string | null
}

export interface TokenVault {
  status(): 'signed-out' | 'pending' | 'signed-in'
  beginPending(): boolean
  /** Applies only from `pending`; returns false when a logout (or any other transition) superseded the flow. */
  signIn(session: VaultSession): boolean
  signOut(): void
  snapshot(): TokenVaultSnapshot
  /** Main-internal session context (WT-02B.2E); null when signed out. Never part of the renderer-facing snapshot. */
  identitySession(): VaultIdentitySession | null
}

export function createTokenVault(options: { readonly mintSessionRef: () => string }): TokenVault {
  let status: 'signed-out' | 'pending' | 'signed-in' = 'signed-out'
  let session: (VaultSession & { readonly sessionRef: string }) | null = null
  return {
    status: () => status,
    beginPending(): boolean {
      // Spec §4.1: a login may only start from signed-out — signed-in requires an explicit logout first.
      if (status !== 'signed-out') return false
      status = 'pending'
      return true
    },
    signIn(next: VaultSession): boolean {
      // A completed flow must not resurrect a session the user signed out of mid-flow.
      if (status !== 'pending') return false
      // The ref is random, non-secret and non-bearer; minted once per accepted sign-in only.
      session = { ...next, sessionRef: options.mintSessionRef() }
      status = 'signed-in'
      return true
    },
    signOut(): void {
      // Drop references immediately; nothing persisted anywhere else by contract.
      session = null
      status = 'signed-out'
    },
    snapshot: () => session === null
      ? { status: 'signed-out' as const, displayName: null }
      : { status: 'signed-in' as const, displayName: session.displayName },
    identitySession: () => session === null ? null : {
      sessionRef: session.sessionRef,
      identityHandle: session.identityHandle,
      issuer: session.issuer,
      authenticatedAt: session.authenticatedAt,
      expiresAt: session.expiresAt,
    },
  }
}
