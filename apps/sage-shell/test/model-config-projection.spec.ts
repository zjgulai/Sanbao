import { describe, expect, it } from 'vitest'

import { createUnavailableFirstService } from '../src/appservice/composition.js'
import { handleSageServiceRequest } from '../src/appservice/route-skeleton.js'
import { classifySettingsDescribe, classifySettingsDescribeFailure } from '../src/main/settings-readout.js'
import { withProjectionReadTestAdmission } from './support/projection-read-test-runner.js'

/**
 * Ticket 017 (US-043/044/047), projection side: the model-config read is classified into structure
 * and state only — never a value, never a secret, never a secret's key path. The view itself renders
 * from React after batch 26; its wording is pinned in `capability-model-bridge.spec.ts` and
 * `product-app/capability-model.spec.tsx`.
 *
 * The fixture mirrors the base's own `settings/describe` schema (writable / hasDocument /
 * namespaces[{ns, schema, value, base, user, applies, secrets[{path,set}], revision}]).
 */

const describeAnswer = {
  writable: true,
  hasDocument: true,
  namespaces: [
    {
      ns: 'llm',
      schema: { model: 'string' },
      value: { model: 'deepseek-chat', apiKey: 'sk-should-never-surface', endpoint: '/Users/someone/private' },
      user: { model: 'deepseek-chat' },
      applies: 'live',
      secrets: [{ path: ['apiKey'], set: true }],
      revision: 7,
    },
    {
      ns: 'embedding',
      schema: { provider: 'string' },
      value: { provider: 'local' },
      applies: 'restart',
      secrets: [{ path: ['token'], set: false }, { path: ['token2'], set: false }],
      revision: 3,
    },
  ],
}

async function stateWith(reader: (() => unknown) | undefined) {
  const providers = withProjectionReadTestAdmission(
    createUnavailableFirstService(null, reader === undefined ? {} : { modelConfig: reader as never }),
  )
  const response = await handleSageServiceRequest(new Request('dsh-app://app/.sage/state', { method: 'GET' }), {
    providers,
    callerBinding: { correlation: 'c-017' },
  } as never)
  return await response.json() as Record<string, unknown>
}

describe('the settings read is classified into structure and state only', () => {
  it('keeps namespaces, layers, restart semantics and secret counts — and drops every value', () => {
    const status = classifySettingsDescribe(describeAnswer)
    expect(status.state).toBe('read')
    expect(status.writable).toBe(true)
    expect(status.hasDocument).toBe(true)
    expect(status.namespaces).toEqual([
      { ns: 'llm', revision: 7, applies: 'live', saved: 'user', secrets: { set: 1, total: 1 } },
      { ns: 'embedding', revision: 3, applies: 'restart', saved: 'base-only', secrets: { set: 0, total: 2 } },
    ])
    const serialized = JSON.stringify(status)
    expect(serialized).not.toContain('sk-')
    expect(serialized).not.toContain('/Users')
    expect(serialized).not.toContain('deepseek-chat')
    expect(serialized).not.toContain('apiKey')
  })

  it('refuses an unrecognisable answer instead of rendering a partial configuration', () => {
    expect(classifySettingsDescribe('nope')).toMatchObject({ state: 'unavailable', reason: 'not-plain-data' })
    expect(classifySettingsDescribe({ writable: true })).toMatchObject({ state: 'unavailable', reason: 'not-plain-data' })
    // Every required field is checked, not just the presence of the list: a coerced or missing
    // flag is as unrecognisable as a missing namespace array.
    expect(classifySettingsDescribe({ writable: 'yes', hasDocument: true, namespaces: [] }))
      .toMatchObject({ state: 'unavailable', reason: 'not-plain-data' })
    expect(classifySettingsDescribe({ writable: true, hasDocument: null, namespaces: [] }))
      .toMatchObject({ state: 'unavailable', reason: 'not-plain-data' })
    expect(classifySettingsDescribe({ writable: true, hasDocument: true, namespaces: { llm: {} } }))
      .toMatchObject({ state: 'unavailable', reason: 'not-plain-data' })
    expect(classifySettingsDescribeFailure(Object.assign(new Error('x'), { code: 'bridge-provider-failed' })))
      .toMatchObject({ state: 'unavailable', reason: 'bridge-refused' })
    expect(classifySettingsDescribeFailure(new Error('x'))).toMatchObject({ state: 'unavailable', reason: 'bridge-unavailable' })
  })

  it('keeps unread distinct from empty in the projection', async () => {
    const unread = await stateWith(undefined)
    expect(unread.modelConfig).toMatchObject({ state: 'unavailable', reason: 'not-read', namespaces: [] })
    const read = await stateWith(() => classifySettingsDescribe(describeAnswer))
    expect(read.modelConfig).toMatchObject({ state: 'read' })
    expect(JSON.stringify(read.modelConfig)).not.toContain('sk-')
  })
})
