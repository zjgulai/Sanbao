import { describe, expect, it } from 'vitest'
import { createIdentityRegistry } from '../src/main/identity-registry.js'

/** Deterministic sequence injector: proves the handle comes from the injected randomness, not the subject. */
function sequenceHandles(prefix: string) {
  let n = 0
  return () => `${prefix}-${++n}`
}

describe('identity registry (WT-02B.2C, runtime-only)', () => {
  it('mints handles from the injected randomness, never from the subject', () => {
    const registry = createIdentityRegistry({ randomHandle: sequenceHandles('h') })
    expect(registry.resolve({ issuer: 'https://idp.example', subject: 'user-1', candidateOrgRefs: [] })).toEqual({
      identityHandle: 'h-1',
      candidateOrgRefs: [],
    })
    expect(registry.resolve({ issuer: 'https://idp.example', subject: 'user-2', candidateOrgRefs: [] }).identityHandle).toBe('h-2')
    expect(registry.resolve({ issuer: 'https://idp.example', subject: 'user-1', candidateOrgRefs: [] }).identityHandle).toBe('h-1')
  })

  it('reuses the same handle for the same verified subject within the process', () => {
    const registry = createIdentityRegistry({ randomHandle: sequenceHandles('h') })
    const first = registry.resolve({ issuer: 'https://idp.example', subject: 'user-1', candidateOrgRefs: [] })
    const second = registry.resolve({ issuer: 'https://idp.example', subject: 'user-1', candidateOrgRefs: [] })
    expect(second).toBe(first)
  })

  it('does not collide across issuers for the same subject id', () => {
    const registry = createIdentityRegistry({ randomHandle: sequenceHandles('h') })
    const a = registry.resolve({ issuer: 'https://idp-a.example', subject: 'user-1', candidateOrgRefs: [] })
    const b = registry.resolve({ issuer: 'https://idp-b.example', subject: 'user-1', candidateOrgRefs: [] })
    expect(a.identityHandle).not.toBe(b.identityHandle)
  })

  it('mints a unique handle per distinct subject', () => {
    const registry = createIdentityRegistry({ randomHandle: sequenceHandles('h') })
    const handles = new Set([
      registry.resolve({ issuer: 'https://idp.example', subject: 'user-1', candidateOrgRefs: [] }).identityHandle,
      registry.resolve({ issuer: 'https://idp.example', subject: 'user-2', candidateOrgRefs: [] }).identityHandle,
      registry.resolve({ issuer: 'https://idp.example', subject: 'user-3', candidateOrgRefs: [] }).identityHandle,
    ])
    expect(handles.size).toBe(3)
  })

  it('stores candidate org refs at first sight and replaces them on later logins (WT-02B.2F)', () => {
    const registry = createIdentityRegistry({ randomHandle: sequenceHandles('h') })
    const first = registry.resolve({ issuer: 'https://idp.example', subject: 'user-1', candidateOrgRefs: ['org-a'] })
    expect(first.candidateOrgRefs).toEqual(['org-a'])

    // A later login refreshes the hints (latest IdP truth); the handle never changes.
    const second = registry.resolve({ issuer: 'https://idp.example', subject: 'user-1', candidateOrgRefs: ['org-b', 'org-c'] })
    expect(second.identityHandle).toBe(first.identityHandle)
    expect(second.candidateOrgRefs).toEqual(['org-b', 'org-c'])
    expect(second).not.toBe(first)

    // Unchanged candidates keep the entry identity stable.
    const third = registry.resolve({ issuer: 'https://idp.example', subject: 'user-1', candidateOrgRefs: ['org-b', 'org-c'] })
    expect(third).toBe(second)

    // The stored refs are a detached copy: later caller-side mutation cannot leak in.
    const refs = ['org-d']
    const fourth = registry.resolve({ issuer: 'https://idp.example', subject: 'user-1', candidateOrgRefs: refs })
    refs.push('org-e')
    expect(fourth.candidateOrgRefs).toEqual(['org-d'])
  })
})
