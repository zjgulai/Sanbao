/**
 * ADR-0334: the instance credential surface — the main-owned port over the host bridge plus
 * the `/.sage/credentials` route grammar. The acceptance lines that live here: a signed-out
 * app answers the identity refusal without any bridge call; a non-allowlisted name never
 * reaches the bridge; describe carries presence/source only; a set crosses exactly once and
 * the secret never appears in any outcome; malformed bodies stop at 400 before the port.
 */
import { describe, expect, it, vi } from 'vitest'

import { createCredentials } from '../src/main/instance-credential.js'
import { createUnavailableFirstService } from '../src/appservice/composition.js'
import { handleSageServiceRequest } from '../src/appservice/route-skeleton.js'
import type { CredentialOutcome } from '../src/appservice/contracts.js'

const SECRET = 'sk-instance-credential-0123456789'

function signedIn(): { identitySession: () => { readonly sessionRef: string } | null } {
  return { identitySession: () => ({ sessionRef: 'session:test' }) }
}

describe('ADR-0334: the instance credential port', () => {
  it('refuses a signed-out session by name without any bridge call', async () => {
    const callBridge = vi.fn()
    const port = createCredentials(callBridge, () => null)
    await expect(port({ action: 'describe', name: 'DEEPSEEK_API_KEY' })).resolves.toEqual({
      state: 'refused', code: 'credential-identity-unavailable', retryable: true,
    })
    await expect(port({ action: 'set', name: 'DEEPSEEK_API_KEY', value: SECRET })).resolves.toEqual({
      state: 'refused', code: 'credential-identity-unavailable', retryable: true,
    })
    expect(callBridge).not.toHaveBeenCalled()
  })

  it('forwards any grammar-valid name to the host — the semantic allowlist lives there (018 close-out)', async () => {
    // The fixed-name gate that used to live here made declared refs unreachable: the host is
    // the only place that can read the saved configuration and answer the name allowlist.
    const callBridge = vi.fn(async () => ({ ok: false, code: 'bridge-credential-name-refused' }))
    const port = createCredentials(callBridge, signedIn().identitySession)
    await expect(port({ action: 'describe', name: 'ANTHROPIC_API_KEY' })).resolves.toEqual({
      state: 'refused', code: 'bridge-credential-name-refused', retryable: true,
    })
    expect(callBridge).toHaveBeenCalledWith('credentials/describe', [{ name: 'ANTHROPIC_API_KEY' }])
  })

  it('describes the allowlisted credential as presence/source/writability only', async () => {
    const callBridge = vi.fn(async () => ({ ok: true, result: { configured: true, source: 'file', writable: true } }))
    const port = createCredentials(callBridge, signedIn().identitySession)
    await expect(port({ action: 'describe', name: 'DEEPSEEK_API_KEY' })).resolves.toEqual({
      state: 'read',
      entries: [{ name: 'DEEPSEEK_API_KEY', configured: true, source: 'file', writable: true }],
    })
    expect(callBridge).toHaveBeenCalledWith('credentials/describe', [{ name: 'DEEPSEEK_API_KEY' }])
  })

  it('reports an unconfigured credential without inventing a source', async () => {
    const callBridge = vi.fn(async () => ({ ok: true, result: { configured: false, writable: true } }))
    const port = createCredentials(callBridge, signedIn().identitySession)
    await expect(port({ action: 'describe', name: 'DEEPSEEK_API_KEY' })).resolves.toEqual({
      state: 'read',
      entries: [{ name: 'DEEPSEEK_API_KEY', configured: false, source: null, writable: true }],
    })
  })

  it('passes a bridge refusal through as a typed refusal', async () => {
    const callBridge = vi.fn(async () => ({ ok: false, code: 'bridge-credential-readonly-source' }))
    const port = createCredentials(callBridge, signedIn().identitySession)
    await expect(port({ action: 'set', name: 'DEEPSEEK_API_KEY', value: SECRET })).resolves.toEqual({
      state: 'refused', code: 'bridge-credential-readonly-source', retryable: true,
    })
  })

  it('maps a rejected bridge call to its named code instead of a blanket failure', async () => {
    const rejecting = vi.fn(async () => { throw { code: 'bridge-provider-unavailable' } })
    const port = createCredentials(rejecting, signedIn().identitySession)
    await expect(port({ action: 'describe', name: 'DEEPSEEK_API_KEY' })).resolves.toEqual({
      state: 'refused', code: 'bridge-provider-unavailable', retryable: true,
    })
    const opaque = createCredentials(async () => { throw new Error('socket gone') }, signedIn().identitySession)
    await expect(opaque({ action: 'set', name: 'DEEPSEEK_API_KEY', value: SECRET })).resolves.toEqual({
      state: 'refused', code: 'bridge-unreachable', retryable: true,
    })
  })

  it('sends the value once and never lets it into the outcome', async () => {
    const callBridge = vi.fn(async () => ({ ok: true, result: { saved: true } }))
    const port = createCredentials(callBridge, signedIn().identitySession)
    const outcome = await port({ action: 'set', name: 'DEEPSEEK_API_KEY', value: SECRET })
    expect(outcome).toEqual({ state: 'saved', name: 'DEEPSEEK_API_KEY' })
    expect(callBridge).toHaveBeenCalledWith('credentials/set', [{ name: 'DEEPSEEK_API_KEY', value: SECRET }])
    expect(JSON.stringify(outcome)).not.toContain(SECRET)
  })

  it('unsets through the bridge and answers the typed removal', async () => {
    const callBridge = vi.fn(async () => ({ ok: true, result: { removed: true } }))
    const port = createCredentials(callBridge, signedIn().identitySession)
    await expect(port({ action: 'unset', name: 'DEEPSEEK_API_KEY' })).resolves.toEqual({ state: 'removed', name: 'DEEPSEEK_API_KEY' })
    expect(callBridge).toHaveBeenCalledWith('credentials/unset', [{ name: 'DEEPSEEK_API_KEY' }])
  })

  it('refuses an unrecognised bridge answer instead of guessing', async () => {
    const port = createCredentials(async () => 'not-an-answer', signedIn().identitySession)
    await expect(port({ action: 'describe', name: 'DEEPSEEK_API_KEY' })).resolves.toEqual({
      state: 'refused', code: 'bridge-answer-unrecognised', retryable: true,
    })
  })
})

describe('ADR-0334: the /.sage/credentials route', () => {
  const outcomes: CredentialOutcome[] = []
  const providers = createUnavailableFirstService(null, {
    credentials: async (request) => {
      if (request.action === 'describe') {
        outcomes.push({ state: 'read', entries: [{ name: request.name, configured: false, source: null, writable: true }] })
      } else if (request.action === 'unset') {
        outcomes.push({ state: 'removed', name: request.name })
      } else {
        outcomes.push({ state: 'saved', name: request.name })
      }
      return outcomes[outcomes.length - 1]!
    },
  })

  const post = (body: string, target = providers) => handleSageServiceRequest(
    new Request('dsh-app://app/.sage/credentials', { method: 'POST', headers: { 'content-type': 'application/json' }, body }),
    { callerBinding: { correlation: 'c-034' }, providers: target } as never,
  )

  it('describes through the port and answers the typed read', async () => {
    outcomes.length = 0
    const response = await post(JSON.stringify({ action: 'describe', name: 'DEEPSEEK_API_KEY' }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      state: 'read', entries: [{ name: 'DEEPSEEK_API_KEY', configured: false, source: null, writable: true }],
    })
  })

  it('accepts a set and the response never carries the value', async () => {
    outcomes.length = 0
    const response = await post(JSON.stringify({ action: 'set', name: 'DEEPSEEK_API_KEY', value: SECRET }))
    expect(response.status).toBe(200)
    const text = await response.text()
    expect(JSON.parse(text)).toEqual({ state: 'saved', name: 'DEEPSEEK_API_KEY' })
    expect(text).not.toContain(SECRET)
  })

  it('accepts an unset and answers the typed removal', async () => {
    outcomes.length = 0
    const response = await post(JSON.stringify({ action: 'unset', name: 'DEEPSEEK_API_KEY' }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ state: 'removed', name: 'DEEPSEEK_API_KEY' })
  })

  it('stops malformed bodies at 400 before the port', async () => {
    outcomes.length = 0
    for (const body of [
      'not json', '{}', '[]',
      JSON.stringify({ action: 'describe', name: 'deepseek_api_key' }),
      JSON.stringify({ action: 'describe', name: '1KEY' }),
      JSON.stringify({ action: 'describe', name: '' }),
      JSON.stringify({ action: 'describe', name: 'A'.repeat(129) }),
      JSON.stringify({ action: 'describe', name: 'DEEPSEEK_API_KEY', value: SECRET }),
      JSON.stringify({ action: 'describe', name: 'DEEPSEEK_API_KEY', extra: 1 }),
      JSON.stringify({ action: 'set', name: 'DEEPSEEK_API_KEY' }),
      JSON.stringify({ action: 'set', name: 'DEEPSEEK_API_KEY', value: 'short' }),
      JSON.stringify({ action: 'set', name: 'DEEPSEEK_API_KEY', value: ` ${SECRET}` }),
      JSON.stringify({ action: 'set', name: 'DEEPSEEK_API_KEY', value: `has\u0000control` }),
      JSON.stringify({ action: 'set', name: 'DEEPSEEK_API_KEY', value: 'x'.repeat(513) }),
      JSON.stringify({ action: 'set', name: 'DEEPSEEK_API_KEY', value: 42 }),
    ]) {
      const response = await post(body)
      expect(response.status, body).toBe(400)
      expect(await response.json()).toMatchObject({ code: 'invalid-credential-request' })
    }
    expect(outcomes).toHaveLength(0)
  })

  it('refuses wrong methods and content types at the transport layer', async () => {
    const get = await handleSageServiceRequest(
      new Request('dsh-app://app/.sage/credentials', { method: 'GET' }),
      { callerBinding: { correlation: 'c-034' }, providers } as never,
    )
    expect(get.status).toBe(405)
    expect(get.headers.get('allow')).toBe('POST')
    const wrongType = await handleSageServiceRequest(
      new Request('dsh-app://app/.sage/credentials', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' }),
      { callerBinding: { correlation: 'c-034' }, providers } as never,
    )
    expect(wrongType.status).toBe(415)
  })

  it('answers the composition default when no credential port is wired', async () => {
    const bare = createUnavailableFirstService(null, {})
    const response = await post(JSON.stringify({ action: 'describe', name: 'DEEPSEEK_API_KEY' }), bare)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ state: 'refused', code: 'credentials-unavailable', retryable: true })
  })
})
