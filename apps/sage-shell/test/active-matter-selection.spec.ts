import { describe, expect, it } from 'vitest'

import { createActiveMatterContext, type ActiveMatterContextInput } from '../src/main/active-matter-context.js'
import {
  selectActiveMatter,
  type ActiveMatterSelectionPorts,
} from '../src/main/active-matter-selection.js'

const first: ActiveMatterContextInput = {
  actorScopeRef: 'actor:old',
  matterId: 'matter:old',
  revisionId: 'revision:old',
  workspaceRef: 'workspace:old',
  trustedWorkspaceRoot: '/trusted/old',
  sessionRef: 'session:old',
  frameGeneration: 3,
}

function activeContext() {
  const context = createActiveMatterContext()
  expect(context.activate({ expectedContextGeneration: 0, next: first }).ok).toBe(true)
  return context
}

interface PortHarnessOptions {
  readonly session?: unknown
  readonly authorization?: unknown
  readonly revision?: unknown
  readonly defaultWorkspace?: unknown
  readonly workspaceFold?: unknown
  readonly frame?: unknown
  readonly ensure?: unknown
  readonly throwAt?: string
  readonly beforeFrame?: () => void
}

function portHarness(options: PortHarnessOptions = {}) {
  const calls: string[] = []
  const configured = (key: keyof PortHarnessOptions, fallback: unknown): unknown =>
    Object.prototype.hasOwnProperty.call(options, key) ? options[key] : fallback
  const invoke = (name: string, value: unknown): unknown => {
    calls.push(name)
    if (options.throwAt === name) throw new Error(`raw secret from ${name}`)
    return value
  }
  const ports: ActiveMatterSelectionPorts = {
    readActiveIdentitySession: () => invoke('identity-session', configured('session', {
      sessionRef: 'session:new',
    })) as never,
    authorizeMatterRead: (request) => {
      expect(request).toEqual({
        sessionRef: 'session:new',
        matterId: 'matter:new',
      })
      return invoke('read-access', configured('authorization', { state: 'allowed', actorScopeRef: 'actor:new' })) as never
    },
    resolveCurrentRevision: (request) => {
      expect(request).toEqual({ matterId: 'matter:new' })
      return invoke('current-revision', configured('revision', {
        matterId: 'matter:new',
        revisionId: 'revision:new',
      })) as never
    },
    resolveDefaultWorkspace: (request) => {
      expect(request).toEqual({ matterId: 'matter:new' })
      return invoke('default-workspace', configured('defaultWorkspace', {
        matterId: 'matter:new',
        workspaceRef: 'workspace:new',
      })) as never
    },
    readFreshWorkspaceFold: () => invoke('workspace-fold', configured('workspaceFold', {
      state: 'read',
      entries: [{ workspaceId: 'workspace:new', path: '/trusted/new' }],
    })) as never,
    ...(Object.prototype.hasOwnProperty.call(options, 'ensure')
      ? {
          ensureRunnableRevision: (request: { readonly matterId: string }) => {
            expect(request).toEqual({ matterId: 'matter:new' })
            return invoke('revision-ensure', options.ensure) as never
          },
        }
      : {}),
    snapshotFramePolicy: () => {
      options.beforeFrame?.()
      return invoke('frame-policy', configured('frame', {
        generation: 17,
        ready: true,
        contaminated: false,
      })) as never
    },
  }
  return { ports, calls }
}

describe('explicit active matter selection', () => {
  it('runs the governed ensure between read authorization and the current-revision read', async () => {
    const context = activeContext()
    const { ports, calls } = portHarness({ ensure: { state: 'ready' } })
    const result = await selectActiveMatter({
      candidate: { matterId: 'matter:new', expectedContextGeneration: 1 },
      context,
      ports,
    })
    expect(result.ok).toBe(true)
    expect(calls).toEqual([
      'identity-session',
      'read-access',
      'revision-ensure',
      'current-revision',
      'default-workspace',
      'workspace-fold',
      'frame-policy',
    ])
  })

  it('stops the selection when the ensure refuses, is malformed or throws — the CAS never runs', async () => {
    for (const ensure of [
      { state: 'refused', code: 'session-prepare-declined' },
      { state: 'bogus' },
      { state: 'refused' },
    ]) {
      const context = activeContext()
      const { ports } = portHarness({ ensure })
      const result = await selectActiveMatter({
        candidate: { matterId: 'matter:new', expectedContextGeneration: 1 },
        context,
        ports,
      })
      expect(result).toEqual({ ok: false, code: 'revision-ensure-refused' })
      // The CAS never ran: the previously active context is untouched.
      expect(context.projection()?.matterId).toBe('matter:old')
    }

    const context = activeContext()
    const { ports } = portHarness({ ensure: null, throwAt: 'revision-ensure' })
    const result = await selectActiveMatter({
      candidate: { matterId: 'matter:new', expectedContextGeneration: 1 },
      context,
      ports,
    })
    expect(result).toEqual({ ok: false, code: 'revision-ensure-refused' })
    expect(context.projection()?.matterId).toBe('matter:old')
  })

  it('keeps the old order when no ensure port is wired', async () => {
    const context = activeContext()
    const { ports, calls } = portHarness()
    const result = await selectActiveMatter({
      candidate: { matterId: 'matter:new', expectedContextGeneration: 1 },
      context,
      ports,
    })
    expect(result.ok).toBe(true)
    expect(calls).not.toContain('revision-ensure')
  })

  it('resolves trusted facts in the fixed order and atomically switches matters', async () => {
    const context = activeContext()
    const { ports, calls } = portHarness()

    const result = await selectActiveMatter({
      candidate: { matterId: 'matter:new', expectedContextGeneration: 1 },
      context,
      ports,
    })

    expect(calls).toEqual([
      'identity-session',
      'read-access',
      'current-revision',
      'default-workspace',
      'workspace-fold',
      'frame-policy',
    ])
    expect(result).toEqual({
      ok: true,
      projection: {
        matterId: 'matter:new',
        revisionId: 'revision:new',
        workspaceRef: 'workspace:new',
        contextGeneration: 2,
        frameGeneration: 17,
      },
    })
    expect(context.snapshot()).toEqual({
      actorScopeRef: 'actor:new',
      matterId: 'matter:new',
      revisionId: 'revision:new',
      workspaceRef: 'workspace:new',
      trustedWorkspaceRoot: '/trusted/new',
      sessionRef: 'session:new',
      contextGeneration: 2,
      frameGeneration: 17,
    })
    expect(JSON.stringify(result)).not.toMatch(/actor:new|session:new|\/trusted\/new/u)
  })

  it('accepts only matterId plus expectedContextGeneration and does not query ports for stale or invalid candidates', async () => {
    const accessorCandidate: Record<string, unknown> = { expectedContextGeneration: 1 }
    Object.defineProperty(accessorCandidate, 'matterId', {
      enumerable: true,
      get: () => { throw new Error('candidate getter must never run') },
    })
    for (const [candidate, code] of [
      [{ matterId: 'matter:new', expectedContextGeneration: 0 }, 'stale-context-generation'],
      [{ matterId: '', expectedContextGeneration: 1 }, 'invalid-selection'],
      [{ matterId: 'matter:new', expectedContextGeneration: -1 }, 'invalid-selection'],
      [{ matterId: 'matter:new', expectedContextGeneration: 1, sessionRef: 'self-reported' }, 'invalid-selection'],
      [accessorCandidate, 'invalid-selection'],
    ] as const) {
      const context = activeContext()
      const before = context.snapshot()
      const { ports, calls } = portHarness()
      expect(await selectActiveMatter({ candidate, context, ports })).toEqual({ ok: false, code })
      expect(calls).toEqual([])
      expect(context.snapshot()).toBe(before)
    }
  })

  it('fails closed at every missing, thrown or malformed trusted-fact stage without changing context', async () => {
    const revokedEntries = Proxy.revocable([], {})
    revokedEntries.revoke()
    const cases: readonly {
      readonly options: PortHarnessOptions
      readonly code: string
      readonly calls: readonly string[]
    }[] = [
      { options: { session: null }, code: 'identity-session-unavailable', calls: ['identity-session'] },
      { options: { throwAt: 'identity-session' }, code: 'identity-session-unavailable', calls: ['identity-session'] },
      { options: { session: { sessionRef: '' } }, code: 'identity-session-unavailable', calls: ['identity-session'] },
      { options: { authorization: undefined }, code: 'read-access-unavailable', calls: ['identity-session', 'read-access'] },
      { options: { throwAt: 'read-access' }, code: 'read-access-unavailable', calls: ['identity-session', 'read-access'] },
      { options: { authorization: { state: 'unknown' } }, code: 'read-access-unavailable', calls: ['identity-session', 'read-access'] },
      { options: { authorization: { state: 'allowed' } }, code: 'read-access-unavailable', calls: ['identity-session', 'read-access'] },
      { options: { revision: null }, code: 'current-revision-unavailable', calls: ['identity-session', 'read-access', 'current-revision'] },
      { options: { throwAt: 'current-revision' }, code: 'current-revision-unavailable', calls: ['identity-session', 'read-access', 'current-revision'] },
      { options: { revision: { matterId: 'matter:new', revisionId: '' } }, code: 'current-revision-unavailable', calls: ['identity-session', 'read-access', 'current-revision'] },
      { options: { defaultWorkspace: null }, code: 'default-workspace-unavailable', calls: ['identity-session', 'read-access', 'current-revision', 'default-workspace'] },
      { options: { throwAt: 'default-workspace' }, code: 'default-workspace-unavailable', calls: ['identity-session', 'read-access', 'current-revision', 'default-workspace'] },
      { options: { defaultWorkspace: { matterId: 'matter:new', workspaceRef: '' } }, code: 'default-workspace-unavailable', calls: ['identity-session', 'read-access', 'current-revision', 'default-workspace'] },
      { options: { workspaceFold: null }, code: 'workspace-fold-unavailable', calls: ['identity-session', 'read-access', 'current-revision', 'default-workspace', 'workspace-fold'] },
      { options: { throwAt: 'workspace-fold' }, code: 'workspace-fold-unavailable', calls: ['identity-session', 'read-access', 'current-revision', 'default-workspace', 'workspace-fold'] },
      { options: { workspaceFold: { state: 'read', entries: [{}] } }, code: 'workspace-fold-unavailable', calls: ['identity-session', 'read-access', 'current-revision', 'default-workspace', 'workspace-fold'] },
      { options: { workspaceFold: { state: 'read', entries: revokedEntries.proxy } }, code: 'workspace-fold-unavailable', calls: ['identity-session', 'read-access', 'current-revision', 'default-workspace', 'workspace-fold'] },
      { options: { frame: null }, code: 'frame-unavailable', calls: ['identity-session', 'read-access', 'current-revision', 'default-workspace', 'workspace-fold', 'frame-policy'] },
      { options: { throwAt: 'frame-policy' }, code: 'frame-unavailable', calls: ['identity-session', 'read-access', 'current-revision', 'default-workspace', 'workspace-fold', 'frame-policy'] },
      { options: { frame: { generation: '17', ready: true, contaminated: false } }, code: 'frame-unavailable', calls: ['identity-session', 'read-access', 'current-revision', 'default-workspace', 'workspace-fold', 'frame-policy'] },
    ]

    for (const [caseIndex, item] of cases.entries()) {
      const context = activeContext()
      const before = context.snapshot()
      const { ports, calls } = portHarness(item.options)
      expect(await selectActiveMatter({
        candidate: { matterId: 'matter:new', expectedContextGeneration: 1 },
        context,
        ports,
      }), `case ${String(caseIndex)}`).toEqual({ ok: false, code: item.code })
      expect(calls).toEqual(item.calls)
      expect(context.snapshot()).toBe(before)
    }
  })

  it('keeps explicit denial and cross-source mismatches distinguishable without advancing context', async () => {
    const cases: readonly [PortHarnessOptions, string][] = [
      [{ authorization: { state: 'denied' } }, 'read-access-denied'],
      [{ revision: { matterId: 'matter:other', revisionId: 'revision:new' } }, 'current-revision-mismatch'],
      [{ defaultWorkspace: { matterId: 'matter:other', workspaceRef: 'workspace:new' } }, 'default-workspace-mismatch'],
      [{ workspaceFold: { state: 'read', entries: [{ workspaceId: 'workspace:other', path: '/trusted/other' }] } }, 'workspace-not-found'],
      [{ workspaceFold: { state: 'read', entries: [
        { workspaceId: 'workspace:new', path: '/trusted/new' },
        { workspaceId: 'workspace:new', path: '/trusted/duplicate' },
      ] } }, 'workspace-fold-ambiguous'],
      [{ workspaceFold: { state: 'read', entries: [{ workspaceId: 'workspace:new', path: 'relative/root' }] } }, 'workspace-path-invalid'],
      [{ frame: { generation: 17, ready: false, contaminated: false } }, 'frame-not-ready'],
      [{ frame: { generation: 17, ready: true, contaminated: true } }, 'frame-contaminated'],
    ]

    for (const [options, code] of cases) {
      const context = activeContext()
      const before = context.snapshot()
      const { ports } = portHarness(options)
      expect(await selectActiveMatter({
        candidate: { matterId: 'matter:new', expectedContextGeneration: 1 },
        context,
        ports,
      })).toEqual({ ok: false, code })
      expect(context.snapshot()).toBe(before)
    }
  })

  it('refreshes the same matter from fresh revision, session, workspace path and frame facts', async () => {
    const context = createActiveMatterContext()
    expect(context.activate({
      expectedContextGeneration: 0,
      next: {
        ...first,
        actorScopeRef: 'actor:new',
        matterId: 'matter:new',
        workspaceRef: 'workspace:new',
      },
    }).ok).toBe(true)
    const { ports } = portHarness({
      revision: { matterId: 'matter:new', revisionId: 'revision:fresh' },
      workspaceFold: { state: 'read', entries: [{ workspaceId: 'workspace:new', path: '/trusted/fresh' }] },
      frame: { generation: 29, ready: true, contaminated: false },
    })

    expect(await selectActiveMatter({
      candidate: { matterId: 'matter:new', expectedContextGeneration: 1 },
      context,
      ports,
    })).toMatchObject({
      ok: true,
      projection: {
        matterId: 'matter:new',
        revisionId: 'revision:fresh',
        contextGeneration: 2,
        frameGeneration: 29,
      },
    })
    expect(context.snapshot()).toMatchObject({
      sessionRef: 'session:new',
      trustedWorkspaceRoot: '/trusted/fresh',
    })
  })

  it('rejects a final CAS race and preserves the context that won during fact resolution', async () => {
    const context = activeContext()
    const winner: ActiveMatterContextInput = {
      ...first,
      matterId: 'matter:winner',
      revisionId: 'revision:winner',
    }
    const { ports } = portHarness({
      beforeFrame: () => {
        expect(context.select({ expectedContextGeneration: 1, next: winner }).ok).toBe(true)
      },
    })

    expect(await selectActiveMatter({
      candidate: { matterId: 'matter:new', expectedContextGeneration: 1 },
      context,
      ports,
    })).toEqual({ ok: false, code: 'stale-context-generation' })
    expect(context.snapshot()).toEqual({ ...winner, contextGeneration: 2 })
  })
})
