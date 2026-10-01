import { describe, expect, it } from 'vitest'
import { createTokenVault } from '../src/main/token-vault.js'
import type { VaultSession } from '../src/main/token-vault.js'

const SESSION: VaultSession = {
  accessToken: 'at',
  idToken: 'it',
  displayName: 'Alice',
  identityHandle: 'h-1',
  issuer: 'https://issuer.example/oidc',
  authenticatedAt: '2027-01-15T08:00:00.000Z',
  expiresAt: '2027-01-15T09:00:00.000Z',
}

function makeVault() {
  let minted = 0
  const vault = createTokenVault({
    mintSessionRef: () => {
      minted += 1
      return `session-ref-${String(minted)}`
    },
  })
  return { vault, mintedRefs: () => minted }
}

describe('TokenVault', () => {
  it('starts signed-out with null displayName', () => {
    const { vault } = makeVault()
    expect(vault.status()).toBe('signed-out')
    expect(vault.snapshot()).toEqual({ status: 'signed-out', displayName: null })
  })

  it('transitions signed-out → pending → signed-in and back', () => {
    const { vault } = makeVault()
    expect(vault.beginPending()).toBe(true)
    expect(vault.status()).toBe('pending')
    vault.signIn(SESSION)
    expect(vault.snapshot()).toEqual({ status: 'signed-in', displayName: 'Alice' })
    vault.signOut()
    expect(vault.snapshot()).toEqual({ status: 'signed-out', displayName: null })
    expect(vault.status()).toBe('signed-out')
  })

  it('rejects beginPending when already pending (one login at a time)', () => {
    const { vault } = makeVault()
    expect(vault.beginPending()).toBe(true)
    expect(vault.beginPending()).toBe(false)
  })

  it('recovers to signed-out after a failed pending (explicit reset)', () => {
    const { vault } = makeVault()
    vault.beginPending()
    vault.signOut() // adapter failure path uses signOut as reset
    expect(vault.status()).toBe('signed-out')
    expect(vault.beginPending()).toBe(true)
  })

  it('rejects beginPending when already signed-in (spec §4.1: logout required first)', () => {
    const { vault } = makeVault()
    vault.beginPending()
    expect(vault.signIn(SESSION)).toBe(true)
    expect(vault.beginPending()).toBe(false)
    expect(vault.status()).toBe('signed-in')
  })

  it('refuses signIn after a sign-out during a pending flow (logout wins, no resurrection)', () => {
    const { vault } = makeVault()
    vault.beginPending()
    vault.signOut() // the user logs out while the browser flow is still in flight
    expect(vault.signIn(SESSION)).toBe(false)
    expect(vault.snapshot()).toEqual({ status: 'signed-out', displayName: null })
  })

  it('refuses a second signIn once signed-in (only one session write per pending)', () => {
    const { vault } = makeVault()
    vault.beginPending()
    expect(vault.signIn(SESSION)).toBe(true)
    expect(vault.signIn({ ...SESSION, accessToken: 'at2', idToken: 'it2', displayName: 'Mallory', identityHandle: 'h-2' })).toBe(false)
    expect(vault.snapshot()).toEqual({ status: 'signed-in', displayName: 'Alice' })
  })

  it('exposes the session context only via the main-internal accessor (WT-02B.2C / 2E)', () => {
    const { vault } = makeVault()
    expect(vault.identitySession()).toBeNull()
    vault.beginPending()
    vault.signIn(SESSION)
    expect(vault.identitySession()).toEqual({
      sessionRef: 'session-ref-1',
      identityHandle: 'h-1',
      issuer: 'https://issuer.example/oidc',
      authenticatedAt: '2027-01-15T08:00:00.000Z',
      expiresAt: '2027-01-15T09:00:00.000Z',
    })
    // The renderer-facing snapshot must never carry the handle, issuer or refs.
    expect(vault.snapshot()).toEqual({ status: 'signed-in', displayName: 'Alice' })
    expect(Object.keys(vault.snapshot()).sort()).toEqual(['displayName', 'status'])
    vault.signOut()
    expect(vault.identitySession()).toBeNull()
  })

  it('mints a fresh sessionRef per accepted signIn and never for rejected ones', () => {
    const { vault, mintedRefs } = makeVault()
    vault.beginPending()
    expect(vault.signIn(SESSION)).toBe(true)
    expect(vault.identitySession()?.sessionRef).toBe('session-ref-1')
    vault.signOut()
    vault.beginPending()
    expect(vault.signIn(SESSION)).toBe(true)
    expect(vault.identitySession()?.sessionRef).toBe('session-ref-2')
    vault.signOut()
    expect(mintedRefs()).toBe(2)

    // A signIn outside `pending` is rejected and must not mint a ref.
    expect(vault.signIn(SESSION)).toBe(false)
    expect(mintedRefs()).toBe(2)
  })
})
