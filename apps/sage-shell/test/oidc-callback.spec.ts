import { createHash, randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { verifyAuthorizationCallback, verifyPkceS256 } from '../src/security/oidc/callback.js'

const STATE = 'state-token-1'
const CODE = 'auth-code-1'

function makeVerifier(): string { return randomBytes(32).toString('base64url') }
function challengeFor(verifier: string): string { return createHash('sha256').update(verifier).digest('base64url') }

function makeInput(overrides: {
  query?: Record<string, unknown>
  state?: string
  consumed?: boolean
  verifier?: string
} = {}) {
  const verifier = overrides.verifier ?? makeVerifier()
  const consumedStates = new Set<string>([STATE])
  return {
    input: {
      untrustedQuery: overrides.query ?? { state: STATE, code: CODE },
      expectedState: overrides.state ?? STATE,
      consumeState: (state: string) => {
        if (overrides.consumed === true) return state === STATE && !consumedStates.has(state)
        return state === STATE
      },
      codeVerifier: verifier,
    },
  }
}

describe('verifyAuthorizationCallback', () => {
  it('accepts a valid callback (code + fresh state + valid verifier)', () => {
    const { input } = makeInput()
    expect(verifyAuthorizationCallback(input)).toEqual({ ok: true, authorizationCode: CODE })
  })

  it('accepts URLSearchParams input form', () => {
    const params = new URLSearchParams([['state', STATE], ['code', CODE]])
    expect(verifyAuthorizationCallback({ ...makeInput().input, untrustedQuery: params })).toEqual({ ok: true, authorizationCode: CODE })
  })

  it('rejects provider error responses without leaking the error text', () => {
    const { input } = makeInput({ query: { state: STATE, error: 'access_denied', error_description: 'user pressed no' } })
    expect(verifyAuthorizationCallback(input)).toEqual({ ok: false, reason: 'error-response' })
  })

  it('rejects a state mismatch and a replayed (already consumed) state', () => {
    const mismatch = makeInput({ query: { state: 'attacker-state', code: CODE } })
    expect(verifyAuthorizationCallback(mismatch.input)).toEqual({ ok: false, reason: 'state-mismatch' })
    const replayed = makeInput({ query: { state: STATE, code: CODE }, consumed: true })
    expect(verifyAuthorizationCallback(replayed.input)).toEqual({ ok: false, reason: 'state-replayed' })
  })

  it('rejects a missing or empty code', () => {
    const missing = makeInput({ query: { state: STATE } })
    expect(verifyAuthorizationCallback(missing.input)).toEqual({ ok: false, reason: 'missing-code' })
    const empty = makeInput({ query: { state: STATE, code: '' } })
    expect(verifyAuthorizationCallback(empty.input)).toEqual({ ok: false, reason: 'missing-code' })
  })

  it('rejects a code verifier outside RFC 7636 shape (43-128 base64url chars)', () => {
    const short = makeInput({ verifier: 'a'.repeat(42) })
    expect(verifyAuthorizationCallback(short.input)).toEqual({ ok: false, reason: 'code-verifier-invalid' })
    const long = makeInput({ verifier: 'a'.repeat(129) })
    expect(verifyAuthorizationCallback(long.input)).toEqual({ ok: false, reason: 'code-verifier-invalid' })
    const badChars = makeInput({ verifier: 'a'.repeat(64).replace('a', '!') })
    expect(verifyAuthorizationCallback(badChars.input)).toEqual({ ok: false, reason: 'code-verifier-invalid' })
  })
})

describe('verifyPkceS256', () => {
  it('matches the S256 challenge for a valid verifier', () => {
    const verifier = makeVerifier()
    expect(verifyPkceS256({ codeVerifier: verifier, challenge: challengeFor(verifier) })).toBe(true)
  })

  it('rejects a mismatched challenge', () => {
    const verifier = makeVerifier()
    expect(verifyPkceS256({ codeVerifier: verifier, challenge: challengeFor(makeVerifier()) })).toBe(false)
  })

  it('rejects a plain (non-S256) challenge equal to the verifier', () => {
    const verifier = makeVerifier()
    expect(verifyPkceS256({ codeVerifier: verifier, challenge: verifier })).toBe(false)
  })
})
