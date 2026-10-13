/**
 * ADR-0339: the saved-model-routes port and its `/.sage/model-config` route. The acceptance
 * lines that live here: a signed-out app answers the identity refusal with zero bridge calls;
 * list joins saved routes with credential presence and demotes stale test records; test runs
 * are single-flight per route and bind to the revision/credential facts of the attempt; the
 * route grammar stops malformed bodies at 400 before the port, and the composition default
 * answers unavailable-first.
 */
import { describe, expect, it, vi } from 'vitest'

import { createModelConfig } from '../src/main/model-config.js'
import { createUnavailableFirstService } from '../src/appservice/composition.js'
import { handleSageServiceRequest } from '../src/appservice/route-skeleton.js'
import type { ModelConfigOutcome } from '../src/appservice/contracts.js'

function signedIn(): () => unknown {
  return () => ({ sessionRef: 'session:test' })
}

const describeAnswer = {
  ok: true,
  result: {
    writable: true,
    hasDocument: true,
    namespaces: [
      {
        ns: 'llm-pi-ai',
        revision: 5,
        applies: 'live',
        user: {
          providers: {
            'zeta-route': { api: 'anthropic-messages', baseURL: 'https://api.z.example', models: [{ id: 'z1' }] },
            'alpha-route': { api: 'openai-completions', baseURL: 'https://api.a.example/v1', apiKeyEnv: 'ALPHA_API_KEY', displayName: 'Alpha', models: [{ id: 'a1' }, { id: 'a2' }] },
          },
        },
      },
    ],
  },
} as const

describe('ADR-0339: the model-config port', () => {
  it('refuses a signed-out session by name without any bridge call', async () => {
    const callBridge = vi.fn()
    const port = createModelConfig(callBridge, () => null)
    for (const action of ['list', 'save-route', 'remove-route', 'test-connection'] as const) {
      await expect(port({ action, route: 'r' })).resolves.toEqual({
        state: 'refused', code: 'model-config-identity-unavailable', retryable: true,
      })
    }
    expect(callBridge).not.toHaveBeenCalled()
  })

  it('lists saved routes with credential presence and the namespace revision', async () => {
    const callBridge = vi.fn(async (endpoint: string) => {
      if (endpoint === 'settings/describe') return describeAnswer
      if (endpoint === 'credentials/describe') return { ok: true, result: { configured: true, source: 'file', writable: true } }
      throw new Error(`unexpected ${endpoint}`)
    })
    const port = createModelConfig(callBridge, signedIn())
    const outcome = await port({ action: 'list' })
    expect(outcome).toMatchObject({ state: 'read', namespaceRevision: 5 })
    if (outcome.state !== 'read') throw new Error('unreachable')
    expect(outcome.routes.map(route => route.route)).toEqual(['alpha-route', 'zeta-route'])
    expect(outcome.routes[0]).toMatchObject({
      api: 'openai-completions',
      baseURL: 'https://api.a.example/v1',
      apiKeyEnv: 'ALPHA_API_KEY',
      displayName: 'Alpha',
      modelCount: 2,
      credential: { name: 'ALPHA_API_KEY', configured: true },
    })
    expect(outcome.routes[0]!.test).toBeNull()
    expect(outcome.routes[1]!.credential).toBeNull()
    expect(callBridge).toHaveBeenCalledWith('credentials/describe', [{ name: 'ALPHA_API_KEY' }])
  })

  it('saves and removes with path-scoped bridge payloads and keeps conflict identity', async () => {
    const calls: Array<{ readonly endpoint: string, readonly payload: unknown }> = []
    const callBridge = vi.fn(async (endpoint: string, payload: unknown) => {
      calls.push({ endpoint, payload })
      if (endpoint === 'modelConfig/remove') return { ok: false, code: 'bridge-settings-conflict' }
      return { ok: true, result: { saved: true, route: 'alpha-route' } }
    })
    const port = createModelConfig(callBridge, signedIn())
    const profile = { api: 'openai-completions', baseURL: 'https://api.a.example/v1', models: [{ id: 'a1' }] }
    await expect(port({ action: 'save-route', route: 'alpha-route', profile, expectedRevision: 5 }))
      .resolves.toEqual({ state: 'saved', route: 'alpha-route' })
    expect(calls[0]).toEqual({ endpoint: 'modelConfig/save', payload: [{ route: 'alpha-route', profile, expectedRevision: 5 }] })
    await expect(port({ action: 'remove-route', route: 'alpha-route' }))
      .resolves.toEqual({ state: 'refused', code: 'bridge-settings-conflict', retryable: true })
    expect(calls[1]).toEqual({ endpoint: 'modelConfig/remove', payload: [{ route: 'alpha-route' }] })
  })

  it('runs one test at a time per route and binds the record to the attempt facts', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const callBridge = vi.fn(async (endpoint: string) => {
      if (endpoint === 'settings/describe') return describeAnswer
      if (endpoint === 'credentials/describe') return { ok: true, result: { configured: true, source: 'file', writable: true } }
      if (endpoint === 'modelConfig/test') {
        await gate
        return { ok: true, result: { state: 'ok', modelIds: ['a1'], latencyMs: 42, host: 'api.a.example', revision: 5, credentialConfigured: true } }
      }
      throw new Error(`unexpected ${endpoint}`)
    })
    const port = createModelConfig(callBridge, signedIn(), () => '2026-10-13T10:00:00.000Z')
    const first = port({ action: 'test-connection', route: 'alpha-route' })
    await expect(port({ action: 'test-connection', route: 'alpha-route' }))
      .resolves.toEqual({ state: 'refused', code: 'model-test-in-flight', retryable: true })
    release()
    await expect(first).resolves.toEqual({
      state: 'tested',
      route: 'alpha-route',
      test: { state: 'ok', modelIds: ['a1'], latencyMs: 42, host: 'api.a.example', testedAt: '2026-10-13T10:00:00.000Z', current: true },
    })
    // The record joins the next list as still-current (revision and credential presence hold).
    const listed = await port({ action: 'list' })
    if (listed.state !== 'read') throw new Error('unreachable')
    expect(listed.routes[0]!.test).toMatchObject({ state: 'ok', current: true })
  })

  it('demotes a record whose binding revision no longer holds — 仅历史', async () => {
    let revision = 5
    const callBridge = vi.fn(async (endpoint: string) => {
      if (endpoint === 'settings/describe') {
        const answer = JSON.parse(JSON.stringify(describeAnswer)) as { result: { namespaces: { revision: number }[] } }
        answer.result.namespaces[0]!.revision = revision
        return answer
      }
      if (endpoint === 'credentials/describe') return { ok: true, result: { configured: true, source: 'file', writable: true } }
      if (endpoint === 'modelConfig/test') {
        return { ok: true, result: { state: 'ok', latencyMs: 10, host: 'api.a.example', revision, credentialConfigured: true } }
      }
      if (endpoint === 'modelConfig/save') return { ok: true, result: { saved: true, route: 'alpha-route' } }
      throw new Error(`unexpected ${endpoint}`)
    })
    const port = createModelConfig(callBridge, signedIn())
    await port({ action: 'test-connection', route: 'alpha-route' })
    revision = 6 // a later write moves the namespace revision
    const listed = await port({ action: 'list' })
    if (listed.state !== 'read') throw new Error('unreachable')
    expect(listed.routes[0]!.test).toMatchObject({ state: 'ok', current: false })
  })

  it('refuses an unrecognised bridge answer instead of guessing, and a missing route name locally', async () => {
    const port = createModelConfig(async () => 'junk', signedIn())
    await expect(port({ action: 'list' })).resolves.toEqual({ state: 'refused', code: 'bridge-answer-unrecognised', retryable: true })
    const local = createModelConfig(vi.fn(), signedIn())
    await expect(local({ action: 'test-connection' })).resolves.toEqual({ state: 'refused', code: 'model-config-route-invalid', retryable: false })
  })
})

describe('ADR-0339: the /.sage/model-config route', () => {
  const outcomes: ModelConfigOutcome[] = []
  const providers = createUnavailableFirstService(null, {
    modelRoutes: async (request) => {
      const outcome: ModelConfigOutcome = request.action === 'list'
        ? { state: 'read', routes: [], namespaceRevision: 1 }
        : request.action === 'test-connection'
          ? { state: 'tested', route: request.route ?? '', test: { state: 'ok', testedAt: '2026-10-13T10:00:00.000Z', current: true } }
          : { state: request.action === 'save-route' ? 'saved' : 'removed', route: request.route ?? '' }
      outcomes.push(outcome)
      return outcome
    },
  })

  const post = (body: string, target = providers) => handleSageServiceRequest(
    new Request('dsh-app://app/.sage/model-config', { method: 'POST', headers: { 'content-type': 'application/json' }, body }),
    { callerBinding: { correlation: 'c-039' }, providers: target } as never,
  )

  it('answers the list read with the typed outcome', async () => {
    outcomes.length = 0
    const response = await post(JSON.stringify({ action: 'list' }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ state: 'read', routes: [], namespaceRevision: 1 })
  })

  it('stops malformed bodies at 400 before the port', async () => {
    outcomes.length = 0
    const good = { api: 'openai-completions', baseURL: 'https://api.example.com/v1', models: [{ id: 'm' }] }
    for (const body of [
      'not json', '{}', '[]',
      JSON.stringify({ action: 'save' }),
      JSON.stringify({ action: 'list', route: 'r' }),
      JSON.stringify({ action: 'save-route', route: 'Bad', profile: good }),
      JSON.stringify({ action: 'save-route', route: 'ok-route' }),
      JSON.stringify({ action: 'save-route', route: 'ok-route', profile: { ...good, api: 'custom' } }),
      JSON.stringify({ action: 'save-route', route: 'ok-route', profile: { ...good, baseURL: 'https://u:p@h/v1' } }),
      JSON.stringify({ action: 'save-route', route: 'ok-route', profile: { ...good, baseURL: 'https://h/v1?x=1' } }),
      JSON.stringify({ action: 'save-route', route: 'ok-route', profile: { ...good, baseURL: 'ftp://h/v1' } }),
      JSON.stringify({ action: 'save-route', route: 'ok-route', profile: { ...good, models: [] } }),
      JSON.stringify({ action: 'save-route', route: 'ok-route', profile: { ...good, models: [{ id: 'm', name: 'x' }] } }),
      JSON.stringify({ action: 'save-route', route: 'ok-route', profile: { ...good, headers: {} } }),
      JSON.stringify({ action: 'save-route', route: 'ok-route', profile: good, expectedRevision: -1 }),
      JSON.stringify({ action: 'remove-route' }),
      JSON.stringify({ action: 'test-connection' }),
      JSON.stringify({ action: 'test-connection', route: 'r', baseURL: 'https://evil.example' }),
    ]) {
      const response = await post(body)
      expect(response.status, body).toBe(400)
      expect(await response.json()).toMatchObject({ code: 'invalid-model-config-request' })
    }
    expect(outcomes).toHaveLength(0)
  })

  it('accepts a well-formed save and never echoes the request body verbatim', async () => {
    outcomes.length = 0
    const response = await post(JSON.stringify({
      action: 'save-route',
      route: 'alpha-route',
      profile: { api: 'openai-completions', baseURL: 'https://api.example.com/v1', apiKeyEnv: 'ALPHA_API_KEY', models: [{ id: 'a1' }] },
      expectedRevision: 3,
    }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ state: 'saved', route: 'alpha-route' })
  })

  it('refuses wrong methods and content types at the transport layer', async () => {
    const get = await handleSageServiceRequest(
      new Request('dsh-app://app/.sage/model-config', { method: 'GET' }),
      { callerBinding: { correlation: 'c-039' }, providers } as never,
    )
    expect(get.status).toBe(405)
    const wrongType = await handleSageServiceRequest(
      new Request('dsh-app://app/.sage/model-config', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' }),
      { callerBinding: { correlation: 'c-039' }, providers } as never,
    )
    expect(wrongType.status).toBe(415)
  })

  it('answers the composition default when no port is wired', async () => {
    const bare = createUnavailableFirstService(null, {})
    const response = await post(JSON.stringify({ action: 'list' }), bare)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ state: 'refused', code: 'model-config-unavailable', retryable: true })
  })
})
