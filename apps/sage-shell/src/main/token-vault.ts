/** WT-02B.2B in-memory token vault: tokens never leave main, never persist, never log. */
export interface VaultSession {
  readonly accessToken: string
  readonly idToken: string
  readonly displayName: string | null
}

export interface TokenVaultSnapshot {
  readonly status: 'signed-out' | 'signed-in'
  readonly displayName: string | null
}

export interface TokenVault {
  status(): 'signed-out' | 'pending' | 'signed-in'
  beginPending(): boolean
  signIn(session: VaultSession): void
  signOut(): void
  snapshot(): TokenVaultSnapshot
}

export function createTokenVault(): TokenVault {
  let status: 'signed-out' | 'pending' | 'signed-in' = 'signed-out'
  let session: VaultSession | null = null
  return {
    status: () => status,
    beginPending(): boolean {
      if (status === 'pending') return false
      status = 'pending'
      return true
    },
    signIn(next: VaultSession): void {
      session = next
      status = 'signed-in'
    },
    signOut(): void {
      // Drop references immediately; nothing persisted anywhere else by contract.
      session = null
      status = 'signed-out'
    },
    snapshot: () => session === null
      ? { status: 'signed-out' as const, displayName: null }
      : { status: 'signed-in' as const, displayName: session.displayName },
  }
}
