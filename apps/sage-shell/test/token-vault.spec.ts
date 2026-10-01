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
    vault.signIn({ accessToken: 'at', idToken: 'it', displayName: 'Alice' })
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
})
