import { describe, expect, it } from 'vitest'
import { createTokenVault } from '../src/main/token-vault.js'

describe('TokenVault', () => {
  it('starts signed-out with null displayName', () => {
    const vault = createTokenVault()
    expect(vault.status()).toBe('signed-out')
    expect(vault.snapshot()).toEqual({ status: 'signed-out', displayName: null })
  })

  it('transitions signed-out → pending → signed-in and back', () => {
    const vault = createTokenVault()
    expect(vault.beginPending()).toBe(true)
    expect(vault.status()).toBe('pending')
    vault.signIn({ accessToken: 'at', idToken: 'it', displayName: 'Alice', identityHandle: 'h-1' })
    expect(vault.snapshot()).toEqual({ status: 'signed-in', displayName: 'Alice' })
    vault.signOut()
    expect(vault.snapshot()).toEqual({ status: 'signed-out', displayName: null })
    expect(vault.status()).toBe('signed-out')
  })

  it('rejects beginPending when already pending (one login at a time)', () => {
    const vault = createTokenVault()
    expect(vault.beginPending()).toBe(true)
    expect(vault.beginPending()).toBe(false)
  })

  it('recovers to signed-out after a failed pending (explicit reset)', () => {
    const vault = createTokenVault()
    vault.beginPending()
    vault.signOut() // adapter failure path uses signOut as reset
    expect(vault.status()).toBe('signed-out')
    expect(vault.beginPending()).toBe(true)
  })

  it('rejects beginPending when already signed-in (spec §4.1: logout required first)', () => {
    const vault = createTokenVault()
    vault.beginPending()
    expect(vault.signIn({ accessToken: 'at', idToken: 'it', displayName: 'Alice', identityHandle: 'h-1' })).toBe(true)
    expect(vault.beginPending()).toBe(false)
    expect(vault.status()).toBe('signed-in')
  })

  it('refuses signIn after a sign-out during a pending flow (logout wins, no resurrection)', () => {
    const vault = createTokenVault()
    vault.beginPending()
    vault.signOut() // the user logs out while the browser flow is still in flight
    expect(vault.signIn({ accessToken: 'at', idToken: 'it', displayName: 'Alice', identityHandle: 'h-1' })).toBe(false)
    expect(vault.snapshot()).toEqual({ status: 'signed-out', displayName: null })
  })

  it('refuses a second signIn once signed-in (only one session write per pending)', () => {
    const vault = createTokenVault()
    vault.beginPending()
    expect(vault.signIn({ accessToken: 'at', idToken: 'it', displayName: 'Alice', identityHandle: 'h-1' })).toBe(true)
    expect(vault.signIn({ accessToken: 'at2', idToken: 'it2', displayName: 'Mallory', identityHandle: 'h-2' })).toBe(false)
    expect(vault.snapshot()).toEqual({ status: 'signed-in', displayName: 'Alice' })
  })

  it('exposes the identity handle only via the main-internal accessor (WT-02B.2C)', () => {
    const vault = createTokenVault()
    expect(vault.identityHandle()).toBeNull()
    vault.beginPending()
    vault.signIn({ accessToken: 'at', idToken: 'it', displayName: 'Alice', identityHandle: 'h-1' })
    expect(vault.identityHandle()).toBe('h-1')
    // The renderer-facing snapshot must never carry the handle.
    expect(vault.snapshot()).toEqual({ status: 'signed-in', displayName: 'Alice' })
    expect(Object.keys(vault.snapshot()).sort()).toEqual(['displayName', 'status'])
    vault.signOut()
    expect(vault.identityHandle()).toBeNull()
  })
})
