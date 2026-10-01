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
    expect(registry.resolve({ issuer: 'https://idp.example', subject: 'user-1' })).toEqual({
      identityHandle: 'h-1',
      candidateOrgRefs: [],
    })
    expect(registry.resolve({ issuer: 'https://idp.example', subject: 'user-2' }).identityHandle).toBe('h-2')
    expect(registry.resolve({ issuer: 'https://idp.example', subject: 'user-1' }).identityHandle).toBe('h-1')
  })

  it('reuses the same handle for the same verified subject within the process', () => {
    const registry = createIdentityRegistry({ randomHandle: sequenceHandles('h') })
    const first = registry.resolve({ issuer: 'https://idp.example', subject: 'user-1' })
    const second = registry.resolve({ issuer: 'https://idp.example', subject: 'user-1' })
    expect(second).toBe(first)
  })

  it('does not collide across issuers for the same subject id', () => {
    const registry = createIdentityRegistry({ randomHandle: sequenceHandles('h') })
    const a = registry.resolve({ issuer: 'https://idp-a.example', subject: 'user-1' })
    const b = registry.resolve({ issuer: 'https://idp-b.example', subject: 'user-1' })
    expect(a.identityHandle).not.toBe(b.identityHandle)
  })

  it('mints a unique handle per distinct subject', () => {
    const registry = createIdentityRegistry({ randomHandle: sequenceHandles('h') })
    const handles = new Set([
      registry.resolve({ issuer: 'https://idp.example', subject: 'user-1' }).identityHandle,
      registry.resolve({ issuer: 'https://idp.example', subject: 'user-2' }).identityHandle,
      registry.resolve({ issuer: 'https://idp.example', subject: 'user-3' }).identityHandle,
    ])
    expect(handles.size).toBe(3)
  })

  it('keeps candidate org refs empty until the organization-mapping ticket', () => {
    const registry = createIdentityRegistry({ randomHandle: sequenceHandles('h') })
    expect(registry.resolve({ issuer: 'https://idp.example', subject: 'user-1' }).candidateOrgRefs).toEqual([])
  })
})
