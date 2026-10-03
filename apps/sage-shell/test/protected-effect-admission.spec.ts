import { describe, expect, it, vi } from 'vitest'
import { admitProtectedEffect } from '../src/appservice/protected-effect-admission.js'
import type {
  ProtectedEffectAdmissionPorts,
  ProtectedEffectAdmissionStep,
  ProtectedEffectStepResult,
  RequestScopedActiveContext,
  SessionCoreProtectedEffectIntent,
} from '../src/appservice/protected-effect-admission.js'

const intent: SessionCoreProtectedEffectIntent = {
  family: 'session-core',
  requestId: 'request-1',
  operation: 'session.send',
  candidate: { kind: 'matter', matterRef: 'matter-1' },
  payload: { message: 'hello' },
}

const activeContext: RequestScopedActiveContext = {
  scope: 'request',
  callerBindingRef: 'caller-binding-1',
  sessionRef: 'session-1',
  matterRef: 'matter-1',
  revisionRef: 'revision-1',
  generation: 'generation-1',
}

function allowed<T>(value: T): ProtectedEffectStepResult<T> {
  return { state: 'allowed', value }
}

function recordingPorts(): {
  readonly ports: ProtectedEffectAdmissionPorts
  readonly calls: string[]
  readonly dispatchSpy: ReturnType<typeof vi.fn>
} {
  const calls: string[] = []
  const dispatchSpy = vi.fn(async () => {
    calls.push('dispatch')
    return { state: 'receipt' as const, receiptRef: 'receipt-1' }
  })
  const ports: ProtectedEffectAdmissionPorts = {
    verifyCaller: async () => {
      calls.push('caller')
      return allowed({ bindingRef: 'caller-binding-1' })
    },
    resolveActiveContext: async () => {
      calls.push('context')
      return allowed(activeContext)
    },
    matchCandidate: async () => {
      calls.push('candidate-match')
      return allowed({ candidateRef: 'candidate-1' })
    },
    resolveIdentityPolicy: async (request) => {
      calls.push('identity-policy')
      expect(request.context).toEqual(activeContext)
      return allowed({ decisionRef: 'decision-1', actorScopeRef: 'actor-scope-1' })
    },
    resolveTarget: async () => {
      calls.push('target')
      return allowed({ targetRef: 'target-1' })
    },
    resolveCompatibility: async () => {
      calls.push('compatibility')
      return allowed({ evaluationRef: 'evaluation-1', outcome: 'equivalent' })
    },
    resolveRegistry: async () => {
      calls.push('registry')
      return allowed({ mappingRef: 'mapping-1' })
    },
    preflight: async () => {
      calls.push('preflight')
      return allowed({ preflightRef: 'preflight-1' })
    },
    persist: async () => {
      calls.push('persistence')
      return allowed({ operationRef: 'operation-1', dispatchRef: 'dispatch-1' })
    },
    dispatch: dispatchSpy,
  }
  return { ports, calls, dispatchSpy }
}

function omitPort(
  ports: ProtectedEffectAdmissionPorts,
  key: keyof ProtectedEffectAdmissionPorts,
): ProtectedEffectAdmissionPorts {
  const copy = { ...ports }
  delete (copy as { [name: string]: unknown })[key]
  return copy
}

function replacePortWithState(
  ports: ProtectedEffectAdmissionPorts,
  key: Exclude<keyof ProtectedEffectAdmissionPorts, 'dispatch'>,
  state: 'unavailable' | 'denied' | 'stale',
): ProtectedEffectAdmissionPorts {
  return {
    ...ports,
    [key]: async () => ({ state }),
  } as ProtectedEffectAdmissionPorts
}

describe('admitProtectedEffect', () => {
  it('checks the request-scoped authorities in fixed order before one async dispatch', async () => {
    const { ports, calls, dispatchSpy } = recordingPorts()

    const result = await admitProtectedEffect({ intent, correlation: 'correlation-1', ports })

    expect(result).toEqual({
      state: 'dispatched',
      correlation: 'correlation-1',
      operationRef: 'operation-1',
      receiptRef: 'receipt-1',
    })
    expect(calls).toEqual([
      'caller',
      'context',
      'candidate-match',
      'identity-policy',
      'target',
      'compatibility',
      'registry',
      'preflight',
      'persistence',
      'dispatch',
    ])
    expect(dispatchSpy).toHaveBeenCalledTimes(1)
    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({
      context: activeContext,
      operationRef: 'operation-1',
      dispatchRef: 'dispatch-1',
    }))
  })

  it('rejects a caller binding that is not the binding used to resolve the active context', async () => {
    const { ports, calls, dispatchSpy } = recordingPorts()
    const result = await admitProtectedEffect({
      intent,
      correlation: 'correlation-binding',
      ports: {
        ...ports,
        resolveActiveContext: async () => {
          calls.push('context')
          return allowed({ ...activeContext, callerBindingRef: 'different-caller' })
        },
      },
    })

    expect(result).toEqual({
      state: 'denied',
      code: 'protected-effect-denied',
      stage: 'context',
      retryable: false,
      correlation: 'correlation-binding',
    })
    expect(calls).toEqual(['caller', 'context'])
    expect(dispatchSpy).not.toHaveBeenCalled()
  })

  it('marks a matter candidate stale before identity policy when it differs from active context', async () => {
    const { ports, calls, dispatchSpy } = recordingPorts()
    const result = await admitProtectedEffect({
      intent: { ...intent, candidate: { kind: 'matter', matterRef: 'different-matter' } },
      correlation: 'correlation-stale',
      ports,
    })

    expect(result).toEqual({
      state: 'stale',
      code: 'protected-effect-stale',
      stage: 'candidate-match',
      retryable: false,
      correlation: 'correlation-stale',
    })
    expect(calls).toEqual(['caller', 'context'])
    expect(dispatchSpy).not.toHaveBeenCalled()
  })

  it('admits an active-session candidate without inventing a matter or revision in the intent', async () => {
    const { ports, dispatchSpy } = recordingPorts()
    const result = await admitProtectedEffect({
      intent: { ...intent, operation: 'session.queue.edit', candidate: { kind: 'active-session' } },
      correlation: 'correlation-active-session',
      ports,
    })

    expect(result).toMatchObject({ state: 'dispatched', receiptRef: 'receipt-1' })
    expect(dispatchSpy).toHaveBeenCalledTimes(1)
  })

  const requiredPorts: readonly [keyof ProtectedEffectAdmissionPorts, ProtectedEffectAdmissionStep][] = [
    ['verifyCaller', 'caller'],
    ['resolveActiveContext', 'context'],
    ['matchCandidate', 'candidate-match'],
    ['resolveIdentityPolicy', 'identity-policy'],
    ['resolveTarget', 'target'],
    ['resolveCompatibility', 'compatibility'],
    ['resolveRegistry', 'registry'],
    ['preflight', 'preflight'],
    ['persist', 'persistence'],
    ['dispatch', 'dispatch'],
  ]

  for (const [port, stage] of requiredPorts) {
    it(`fails closed when ${port} is missing`, async () => {
      const { ports, dispatchSpy } = recordingPorts()
      const result = await admitProtectedEffect({
        intent,
        correlation: `correlation-missing-${String(port)}`,
        ports: omitPort(ports, port),
      })

      expect(result).toEqual({
        state: 'unavailable',
        code: 'protected-effect-unavailable',
        stage,
        retryable: true,
        correlation: `correlation-missing-${String(port)}`,
      })
      expect(dispatchSpy).not.toHaveBeenCalled()
    })
  }

  const preDispatchPorts = requiredPorts.slice(0, -1) as readonly [
    Exclude<keyof ProtectedEffectAdmissionPorts, 'dispatch'>,
    ProtectedEffectAdmissionStep,
  ][]
  for (const state of ['unavailable', 'denied', 'stale'] as const) {
    for (const [port, stage] of preDispatchPorts) {
      it(`maps ${state} from ${port} without dispatch`, async () => {
        const { ports, dispatchSpy } = recordingPorts()
        const result = await admitProtectedEffect({
          intent,
          correlation: `correlation-${state}-${String(port)}`,
          ports: replacePortWithState(ports, port, state),
        })

        expect(result).toEqual({
          state,
          code: `protected-effect-${state}`,
          stage,
          retryable: state === 'unavailable',
          correlation: `correlation-${state}-${String(port)}`,
        })
        expect(dispatchSpy).not.toHaveBeenCalled()
      })
    }
  }

  it('redacts a provider throw before dispatch and returns stable unavailable output', async () => {
    const { ports, dispatchSpy } = recordingPorts()
    const result = await admitProtectedEffect({
      intent,
      correlation: 'correlation-redacted',
      ports: {
        ...ports,
        resolveRegistry: async () => {
          throw new Error('secret-token at /Users/lute/private-provider.ts')
        },
      },
    })

    expect(result).toEqual({
      state: 'unavailable',
      code: 'protected-effect-unavailable',
      stage: 'registry',
      retryable: true,
      correlation: 'correlation-redacted',
    })
    expect(JSON.stringify(result)).not.toContain('secret-token')
    expect(JSON.stringify(result)).not.toContain('/Users/')
    expect(dispatchSpy).not.toHaveBeenCalled()
  })

  it('maps a dispatch throw to outcome-unknown and never automatically resends', async () => {
    const { ports, calls } = recordingPorts()
    const dispatchSpy = vi.fn(async () => {
      calls.push('dispatch')
      throw new Error('upstream secret and uncertain result')
    })
    const result = await admitProtectedEffect({
      intent,
      correlation: 'correlation-unknown',
      ports: { ...ports, dispatch: dispatchSpy },
    })

    expect(result).toEqual({
      state: 'outcome-unknown',
      code: 'protected-effect-outcome-unknown',
      stage: 'dispatch',
      retryable: false,
      correlation: 'correlation-unknown',
    })
    expect(dispatchSpy).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(result)).not.toContain('secret')
  })

  it('preserves an explicit unknown dispatch outcome without replaying it', async () => {
    const { ports, calls } = recordingPorts()
    const dispatchSpy = vi.fn(async () => {
      calls.push('dispatch')
      return { state: 'outcome-unknown' as const }
    })
    const result = await admitProtectedEffect({
      intent,
      correlation: 'correlation-explicit-unknown',
      ports: { ...ports, dispatch: dispatchSpy },
    })

    expect(result).toMatchObject({
      state: 'outcome-unknown',
      code: 'protected-effect-outcome-unknown',
      stage: 'dispatch',
      retryable: false,
    })
    expect(dispatchSpy).toHaveBeenCalledTimes(1)
  })
})
