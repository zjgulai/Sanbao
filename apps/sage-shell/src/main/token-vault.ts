/** WT-02B.2B in-memory token vault: tokens never leave main, never persist, never log. */
export interface VaultSession {
  readonly accessToken: string
  readonly idToken: string
  readonly displayName: string | null
  /** WT-02B.2C: opaque Sage-internal identity handle for this session (main-internal ref, never a token). */
  readonly identityHandle: string
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
  /** Main-internal accessor for the current session's identity handle; null when signed out. Never part of the renderer-facing snapshot. */
  identityHandle(): string | null
}

export function createTokenVault(): TokenVault {
  let status: 'signed-out' | 'pending' | 'signed-in' = 'signed-out'
  let session: VaultSession | null = null
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
      session = next
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
    identityHandle: () => session === null ? null : session.identityHandle,
  }
}
