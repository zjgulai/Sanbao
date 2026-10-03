import { describe, expect, it, vi } from 'vitest'

import { createUnavailableFirstService } from '../src/appservice/composition.js'
import { handleSageServiceRequest } from '../src/appservice/route-skeleton.js'

const callerBinding = { correlation: 'caller:context-selection' }

function providers() {
  const selectActiveMatter = vi.fn(async (request: { readonly matterId: string; readonly expectedContextGeneration: number }) => ({
    state: 'selected' as const,
    context: {
      state: 'active' as const,
      contextGeneration: request.expectedContextGeneration + 1,
      matterId: request.matterId,
      revisionId: 'revision:current',
      workspaceRef: 'workspace:trusted',
      frameGeneration: 7,
    },
  }))
  const service = createUnavailableFirstService(null, {
    activeMatterContext: () => ({ state: 'inactive' as const, contextGeneration: 4 }),
    selectActiveMatter,
  })
  return { service, selectActiveMatter }
}

async function post(service: ReturnType<typeof providers>['service'], body: unknown, contentType = 'application/json') {
  return handleSageServiceRequest(new Request('dsh-app://app/.sage/context/select', {
    method: 'POST',
    headers: { 'content-type': contentType },
    body: JSON.stringify(body),
  }), { callerBinding, providers: service })
}

describe('explicit active matter selection route', () => {
  it('projects the current generation and forwards only the exact candidate contract', async () => {
    const harness = providers()
    const state = await harness.service.readState()
    expect((await state.json()).activeContext).toEqual({ state: 'inactive', contextGeneration: 4 })

    const response = await post(harness.service, {
      matterId: 'matter:chosen',
      expectedContextGeneration: 4,
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      state: 'selected',
      context: {
        state: 'active',
        contextGeneration: 5,
        matterId: 'matter:chosen',
        revisionId: 'revision:current',
        workspaceRef: 'workspace:trusted',
        frameGeneration: 7,
      },
    })
    expect(harness.selectActiveMatter).toHaveBeenCalledWith({
      matterId: 'matter:chosen',
      expectedContextGeneration: 4,
    })
  })

  it('rejects malformed, extra-field, wrong-method and wrong-content-type requests before selection', async () => {
    const harness = providers()
    expect((await post(harness.service, { matterId: 'matter:chosen' })).status).toBe(400)
    expect((await post(harness.service, {
      matterId: 'matter:chosen',
      expectedContextGeneration: 4,
      workspaceRoot: '/renderer/not-authority',
    })).status).toBe(400)
    expect((await post(harness.service, {
      matterId: 'matter:chosen',
      expectedContextGeneration: 4,
    }, 'text/plain')).status).toBe(415)
    const get = await handleSageServiceRequest(new Request('dsh-app://app/.sage/context/select'), {
      callerBinding,
      providers: harness.service,
    })
    expect(get.status).toBe(405)
    expect(harness.selectActiveMatter).not.toHaveBeenCalled()
  })

  it('never reaches the provider without a verified caller binding', async () => {
    const harness = providers()
    const response = await handleSageServiceRequest(new Request('dsh-app://app/.sage/context/select', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ matterId: 'matter:chosen', expectedContextGeneration: 4 }),
    }), { callerBinding: null, providers: harness.service })
    expect(response.status).toBe(403)
    expect(harness.selectActiveMatter).not.toHaveBeenCalled()
  })
})
