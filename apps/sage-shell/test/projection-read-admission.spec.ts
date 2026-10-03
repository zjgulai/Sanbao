import { describe, expect, it, vi } from 'vitest'
import {
  PROJECTION_READ_OPERATIONS,
  admitProjectionRead,
  type ProjectionReadAdmissionPorts,
  type ProjectionReadAdmissionStage,
  type ProjectionReadStepResult,
} from '../src/appservice/projection-read-admission.js'

interface Candidate {
  readonly matterRef: string
}

interface ReadValue {
  readonly payload: string
}

const candidate: Candidate = { matterRef: 'matter:one' }
const caller = { bindingRef: 'caller:one' }
const initialContext = {
  scope: 'request' as const,
  callerBindingRef: caller.bindingRef,
  sessionRef: 'session:one',
  matterRef: candidate.matterRef,
  contextGeneration: 7,
  frameGeneration: 11,
}
const readPolicy = { decisionRef: 'decision:one', actorScopeRef: 'actor-scope:one' }
const scope = {
  matterRef: candidate.matterRef,
  revisionRef: 'revision:one',
  workspaceRef: 'workspace:one',
  trustedWorkspaceRoot: '/trusted/workspace',
  sessionRef: initialContext.sessionRef,
  actorScopeRef: readPolicy.actorScopeRef,
  contextGeneration: initialContext.contextGeneration,
  frameGeneration: initialContext.frameGeneration,
}
const candidateMatch = { candidateRef: 'candidate:one' }
const freshness = { freshnessRef: 'freshness:one' }
const readValue: ReadValue = { payload: 'visible only after post-read freshness' }

function allowed<T>(value: T): ProjectionReadStepResult<T> {
  return { state: 'allowed', value }
}

function createPorts(events: string[] = []): ProjectionReadAdmissionPorts<Candidate, ReadValue> {
  return {
    verifyCaller: vi.fn(async () => {
      events.push('caller')
      return allowed(caller)
    }),
    resolveInitialContext: vi.fn(async () => {
      events.push('initial-context')
      return allowed(initialContext)
    }),
    authorizeRead: vi.fn(async () => {
      events.push('read-policy')
      return allowed(readPolicy)
    }),
    resolveFreshScope: vi.fn(async () => {
      events.push('fresh-scope')
      return allowed(scope)
    }),
    matchCandidate: vi.fn(async () => {
      events.push('candidate-match')
      return allowed(candidateMatch)
    }),
    checkPreReadFreshness: vi.fn(async () => {
      events.push('pre-read-freshness')
      return allowed(freshness)
    }),
    read: vi.fn(async () => {
      events.push('read')
      return allowed(readValue)
    }),
    validatesReadValue: (value: unknown): value is ReadValue => {
      return typeof value === 'object'
        && value !== null
        && !Array.isArray(value)
        && (value as ReadValue).payload === readValue.payload
    },
    checkPostReadFreshness: vi.fn(async () => {
      events.push('post-read-freshness')
      return allowed(freshness)
    }),
  }
}

async function run(ports: ProjectionReadAdmissionPorts<Candidate, ReadValue>) {
  return admitProjectionRead({
    intent: { operation: 'session.history.detail', candidate },
    correlation: 'correlation:one',
    ports,
  })
}

function withoutPort(
  ports: ProjectionReadAdmissionPorts<Candidate, ReadValue>,
  key: keyof ProjectionReadAdmissionPorts<Candidate, ReadValue>,
): ProjectionReadAdmissionPorts<Candidate, ReadValue> {
  const copy = { ...ports }
  delete copy[key]
  return copy
}

describe('projection read admission', () => {
  it('covers the 15 read operations represented by the 13 read-only routes', () => {
    expect(PROJECTION_READ_OPERATIONS).toEqual([
      'state.read',
      'workspace.files.list-candidates',
      'workspace.files.create-reference',
      'workspace.files.use-reference',
      'session.history.list',
      'session.history.detail',
      'session.anchors.read',
      'session.anchors.locate',
      'session.terminal.read',
      'search.query',
      'artifacts.observe',
      'artifacts.open',
      'artifacts.retry',
      'edit-drafts.diff',
      'run-log.read',
    ])
    expect(new Set(PROJECTION_READ_OPERATIONS).size).toBe(15)
  })

  it('admits one read only after the exact ordered chain and a matching post-read freshness fact', async () => {
    const events: string[] = []
    const ports = createPorts(events)

    await expect(run(ports)).resolves.toEqual({
      state: 'read',
      correlation: 'correlation:one',
      value: readValue,
    })
    expect(events).toEqual([
      'caller',
      'initial-context',
      'read-policy',
      'fresh-scope',
      'candidate-match',
      'pre-read-freshness',
      'read',
      'post-read-freshness',
    ])
    expect(ports.read).toHaveBeenCalledTimes(1)
    const policyRequest = vi.mocked(ports.authorizeRead!).mock.calls[0]![0]
    expect(policyRequest).not.toHaveProperty('candidate')
    expect(policyRequest).not.toHaveProperty('intent')
    expect(ports.matchCandidate).toHaveBeenCalledWith(expect.objectContaining({ candidate }))
  })

  it.each([
    ['verifyCaller', 'caller', 0],
    ['resolveInitialContext', 'initial-context', 0],
    ['authorizeRead', 'read-policy', 0],
    ['resolveFreshScope', 'fresh-scope', 0],
    ['matchCandidate', 'candidate-match', 0],
    ['checkPreReadFreshness', 'pre-read-freshness', 0],
    ['read', 'read', 0],
    ['validatesReadValue', 'read', 0],
    ['checkPostReadFreshness', 'post-read-freshness', 1],
  ] as const)(
    'fails closed when %s is absent',
    async (key, stage, expectedReadCalls) => {
      const ports = createPorts()
      const read = ports.read

      await expect(run(withoutPort(ports, key))).resolves.toEqual({
        state: 'unavailable',
        code: 'projection-read-unavailable',
        stage,
        retryable: true,
        correlation: 'correlation:one',
      })
      expect(read).toHaveBeenCalledTimes(expectedReadCalls)
    },
  )

  it.each([
    ['verifyCaller', 'caller', 0],
    ['resolveInitialContext', 'initial-context', 0],
    ['authorizeRead', 'read-policy', 0],
    ['resolveFreshScope', 'fresh-scope', 0],
    ['matchCandidate', 'candidate-match', 0],
    ['checkPreReadFreshness', 'pre-read-freshness', 0],
    ['read', 'read', 1],
    ['checkPostReadFreshness', 'post-read-freshness', 1],
  ] as const)(
    'collapses an exception from %s to stable unavailable',
    async (key, stage, expectedReadCalls) => {
      const ports = createPorts()
      const read = ports.read
      const throwing = vi.fn(async () => {
        throw new Error('provider secret')
      })
      const overridden = { ...ports, [key]: throwing }

      await expect(run(overridden)).resolves.toEqual({
        state: 'unavailable',
        code: 'projection-read-unavailable',
        stage,
        retryable: true,
        correlation: 'correlation:one',
      })
      expect(key === 'read' ? throwing : read).toHaveBeenCalledTimes(expectedReadCalls)
    },
  )

  it('collapses a throwing read validator to stable unavailable without leaking the value', async () => {
    const ports = createPorts()
    const result = await run({
      ...ports,
      validatesReadValue: () => {
        throw new Error('decoder secret')
      },
    })

    expect(result).toEqual({
      state: 'unavailable',
      code: 'projection-read-unavailable',
      stage: 'read',
      retryable: true,
      correlation: 'correlation:one',
    })
    expect(result).not.toHaveProperty('value')
    expect(ports.read).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['verifyCaller', 'caller', allowed({})],
    ['resolveInitialContext', 'initial-context', allowed({ ...initialContext, contextGeneration: -1 })],
    ['authorizeRead', 'read-policy', allowed({ decisionRef: 'decision:one' })],
    ['resolveFreshScope', 'fresh-scope', allowed({ ...scope, trustedWorkspaceRoot: '' })],
    ['matchCandidate', 'candidate-match', allowed({ candidateRef: '' })],
    ['checkPreReadFreshness', 'pre-read-freshness', allowed({ freshnessRef: '' })],
    ['read', 'read', allowed({ payload: 'malformed' })],
    ['checkPostReadFreshness', 'post-read-freshness', allowed({ freshnessRef: '' })],
  ] as const)(
    'rejects malformed output from %s at %s',
    async (key, stage, malformed) => {
      const ports = createPorts()
      const read = ports.read
      const malformedProvider = vi.fn(async () => malformed) as never
      const result = await run({ ...ports, [key]: malformedProvider })

      expect(result).toMatchObject({
        state: 'unavailable',
        code: 'projection-read-unavailable',
        stage,
      })
      expect(result).not.toHaveProperty('value')
      if (stage !== 'read' && stage !== 'post-read-freshness') {
        expect(read).not.toHaveBeenCalled()
      }
    },
  )

  it.each([
    ['authorizeRead', 'read-policy', 'denied', 'projection-read-denied', false],
    ['matchCandidate', 'candidate-match', 'stale', 'projection-read-stale', false],
    ['checkPreReadFreshness', 'pre-read-freshness', 'unavailable', 'projection-read-unavailable', true],
  ] as const)(
    'preserves the stable %s failure state from %s without invoking the raw read',
    async (key, stage, state, code, retryable) => {
      const ports = createPorts()
      const result = await run({
        ...ports,
        [key]: vi.fn(async () => ({ state })),
      })

      expect(result).toEqual({
        state,
        code,
        stage,
        retryable,
        correlation: 'correlation:one',
      })
      expect(ports.read).not.toHaveBeenCalled()
    },
  )

  it('denies a caller/context binding mismatch before read policy evaluation', async () => {
    const ports = createPorts()
    const result = await run({
      ...ports,
      resolveInitialContext: vi.fn(async () => allowed({
        ...initialContext,
        callerBindingRef: 'caller:other',
      })),
    })

    expect(result).toMatchObject({
      state: 'denied',
      code: 'projection-read-denied',
      stage: 'initial-context',
    })
    expect(ports.authorizeRead).not.toHaveBeenCalled()
    expect(ports.read).not.toHaveBeenCalled()
  })

  it.each([
    ['matterRef', 'matter:other'],
    ['sessionRef', 'session:other'],
    ['actorScopeRef', 'actor-scope:other'],
    ['contextGeneration', 8],
    ['frameGeneration', 12],
  ] as const)('rejects fresh-scope drift in %s before candidate matching', async (key, value) => {
    const ports = createPorts()
    const result = await run({
      ...ports,
      resolveFreshScope: vi.fn(async () => allowed({ ...scope, [key]: value })),
    })

    expect(result).toMatchObject({
      state: 'stale',
      code: 'projection-read-stale',
      stage: 'fresh-scope',
    })
    expect(ports.matchCandidate).not.toHaveBeenCalled()
    expect(ports.read).not.toHaveBeenCalled()
  })

  it.each(['unavailable', 'denied', 'stale'] as const)(
    'discards a completed read when post-read freshness returns %s',
    async (state) => {
      const ports = createPorts()
      const result = await run({
        ...ports,
        checkPostReadFreshness: vi.fn(async () => ({ state })),
      })

      expect(result).toMatchObject({ state, stage: 'post-read-freshness' })
      expect(result).not.toHaveProperty('value')
      expect(ports.read).toHaveBeenCalledTimes(1)
    },
  )

  it('discards a completed read when the post-read freshness token changes', async () => {
    const ports = createPorts()
    const result = await run({
      ...ports,
      checkPostReadFreshness: vi.fn(async () => allowed({ freshnessRef: 'freshness:two' })),
    })

    expect(result).toEqual({
      state: 'stale',
      code: 'projection-read-stale',
      stage: 'post-read-freshness',
      retryable: false,
      correlation: 'correlation:one',
    })
    expect(result).not.toHaveProperty('value')
    expect(ports.read).toHaveBeenCalledTimes(1)
  })

  it('rejects an unknown operation before consulting any provider', async () => {
    const ports = createPorts()
    const result = await admitProjectionRead({
      intent: { operation: 'unknown.read' as never, candidate },
      correlation: 'correlation:one',
      ports,
    })

    expect(result).toMatchObject({
      state: 'unavailable',
      code: 'projection-read-unavailable',
      stage: 'caller',
    })
    expect(ports.verifyCaller).not.toHaveBeenCalled()
    expect(ports.read).not.toHaveBeenCalled()
  })

  it('does not expose read values from malformed post-read results', async () => {
    const ports = createPorts()
    const result = await run({
      ...ports,
      checkPostReadFreshness: vi.fn(async () => ({ state: 'allowed' } as never)),
    })

    expect(result).toEqual({
      state: 'unavailable',
      code: 'projection-read-unavailable',
      stage: 'post-read-freshness',
      retryable: true,
      correlation: 'correlation:one',
    })
    expect(result).not.toHaveProperty('value')
  })
})
