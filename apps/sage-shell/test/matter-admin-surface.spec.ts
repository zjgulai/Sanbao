import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { createSessionCoreIdentityPort } from '../src/main/session-core-identity.js'
import { admitMatterGovernanceEffect } from '../src/appservice/matter-governance-admission.js'
import { resolveSagePaths } from '../src/profile/paths.js'

import { createUnavailableFirstService } from '../src/appservice/composition.js'
import { handleSageServiceRequest } from '../src/appservice/route-skeleton.js'
import { createMatterAdmin } from '../src/main/matter-admin.js'
import { createMatterAdminDispatchPort } from '../src/main/matter-admin-dispatch.js'
import { createMatterList } from '../src/main/matter-list.js'

/**
 * Ticket 029 at the S1 routes (US-150~154), with the real 022 derivation wired to the real
 * archive store.
 *
 * The two acceptance lines are cross-store byte assertions: archive/restore move only the
 * archive slot and the list's lifecycle — every other fact (drafts, receipts, links, session,
 * projects, action items) stays byte-equal; and rename shows the service's read-back value.
 */

const DRAFT_FACTS = [{
  draftId: 'draft-1',
  matterRef: 'receipt:42',
  title: '季度复盘',
  attempt: null,
  updatedAt: 't1',
}] as const

function harness(options: { readonly wired?: boolean, readonly rename?: (request: { readonly matterRef: string, readonly title: string }) => { readonly effectiveTitle: string } | { readonly denied: string } | undefined } = {}) {
  const admin = createMatterAdmin({
    now: () => '2026-10-03T10:00:00.000Z',
    knownMatter: (matterRef) => matterRef === 'receipt:42' || matterRef === 'receipt:other',
    ...(options.rename === undefined ? {} : { renameMatter: options.rename }),
  })
  const list = createMatterList({
    listDraftFacts: () => ({ state: 'ready', facts: [...DRAFT_FACTS] }),
    pendingCount: () => 0,
    acceptanceCandidateCount: () => 0,
    archivedOf: (matterRef) => admin.isArchived(matterRef),
  })
  const providers = createUnavailableFirstService(null, options.wired === false ? {} : {
    draftList: () => ({
      state: 'unlocked',
      drafts: [{
        draftId: 'draft-1',
        fields: { goal: '季度复盘', deliverable: '对外说明', responsibility: 'role:owner', projectRef: '' },
        clarification: '', history: [], status: 'converted', matterRef: 'receipt:42', attempt: null, complete: true,
        createdAt: 't', updatedAt: 't',
      }] as never,
    }),
    matterLinks: () => ({ state: 'read', links: [], trail: [] }),
    matterList: () => list.derive(),
    matterAdmin: admin.list,
    // L1-A (ADR-0320): the four writes now ride the matter-governance admission family — the
    // harness supplies the front steps as allowed stubs and the REAL dispatch port bound to the
    // real provider store, so the route-level facts below are exercised through the full chain.
    matterGovernancePorts: {
      verifyCaller: async () => ({ state: 'allowed', value: { bindingRef: 'c-029' } }),
      resolveActiveContext: async () => ({
        state: 'allowed',
        value: {
          scope: 'request',
          callerBindingRef: 'c-029',
          sessionRef: 'session:1',
          matterRef: 'receipt:42',
          revisionRef: 'revision:1',
          generation: '1',
        },
      }),
      matchCandidate: async () => ({ state: 'allowed', value: { candidateRef: 'receipt:42' } }),
      resolveIdentityPolicy: async () => ({ state: 'allowed', value: { decisionRef: 'decision:1', actorScopeRef: 'actor:1' } }),
      dispatch: createMatterAdminDispatchPort({
        archive: admin.archive,
        restore: admin.restore,
        batch: admin.batch,
        rename: admin.rename,
        readContext: () => ({
          sessionRef: 'session:1',
          matterRef: 'receipt:42',
          revisionRef: 'revision:1',
          contextGeneration: 1,
          frameGeneration: 7,
        }),
        readIdentitySession: () => ({ sessionRef: 'session:1' }),
        readFrame: () => ({ generation: 7, ready: true, contaminated: false }),
      }),
    },
  })
  const post = (path: string, body: unknown) => handleSageServiceRequest(
    new Request(`dsh-app://app${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    { callerBinding: { correlation: 'c-029' }, providers } as never,
  )
  const readState = async () => (await (await providers.readState()).json()) as Record<string, unknown>
  return { post, readState }
}

describe('the matter-admin routes (ticket 029)', () => {
  it('archives and restores with the archive slot as the only moving fact (US-150/151 acceptance)', async () => {
    const h = harness()
    const before = await h.readState()
    expect((before.matterList as { items: Array<{ lifecycle: string }> }).items[0]?.lifecycle).toBe('active')

    const archived = await (await h.post('/.sage/matter-admin', { action: 'archive', matterRef: 'receipt:42', ground: 'completed' })).json()
    expect(archived).toMatchObject({ state: 'ok' })
    const after = await h.readState()

    // The archived matter still holds every fact and receipt — only its list membership moved.
    for (const slot of ['draft', 'matterLinks', 'readout', 'sessionChannel', 'projects', 'actionItems', 'editDrafts']) {
      expect(JSON.stringify(after[slot]), slot).toBe(JSON.stringify(before[slot]))
    }
    const draft = after.draft as { drafts: Array<{ status: string, matterRef: string | null }> }
    expect(draft.drafts[0]?.status).toBe('converted')
    expect(draft.drafts[0]?.matterRef).toBe('receipt:42')
    expect((after.matterList as { items: Array<{ lifecycle: string, matterRef: string | null }> }).items[0]).toMatchObject({ lifecycle: 'archived', matterRef: 'receipt:42' })
    // The archive never says "stopped run" or "hidden": its own slot carries only archive facts.
    const admin = after.matterAdmin as { entries: unknown, trail: unknown }
    expect(JSON.stringify(admin)).not.toContain('hidden')
    expect(JSON.stringify(admin)).not.toContain('pause')

    const restored = await (await h.post('/.sage/matter-admin', { action: 'restore', matterRef: 'receipt:42' })).json()
    expect(restored).toMatchObject({ state: 'ok' })
    const back = await h.readState()
    expect((back.matterList as { items: Array<{ lifecycle: string }> }).items[0]?.lifecycle).toBe('active')
    for (const slot of ['draft', 'matterLinks', 'readout', 'sessionChannel', 'projects', 'actionItems', 'editDrafts']) {
      expect(JSON.stringify(back[slot]), slot).toBe(JSON.stringify(before[slot]))
    }
  })

  it('a batch answers row by row over the route — refusals included, no overall success (US-153)', async () => {
    const h = harness()
    const result = await (await h.post('/.sage/matter-admin', {
      action: 'batch',
      operation: 'archive',
      targets: ['receipt:42', 'receipt:other', 'receipt:ghost'],
      ground: 'stopped',
    })).json() as { state: string, status: { batch: { rows: unknown, okCount: number, refusedCount: number } } }
    expect(result.state).toBe('batch')
    expect(result.status.batch.rows).toEqual([
      { matterRef: 'receipt:42', outcome: 'ok', code: null },
      { matterRef: 'receipt:other', outcome: 'ok', code: null },
      { matterRef: 'receipt:ghost', outcome: 'refused', code: 'matter-unknown' },
    ])
    expect(result.status.batch).toMatchObject({ okCount: 2, refusedCount: 1 })
    // The JSON has no all-ok banner: success is only ever per row.
    expect(JSON.stringify(result.status.batch)).not.toContain('success')
  })

  it('rename shows the service read-back value (US-152)', async () => {
    const h = harness({ rename: () => ({ effectiveTitle: '季度复盘·2026Q3' }) })
    const renamed = await (await h.post('/.sage/matter-admin', { action: 'rename', matterRef: 'receipt:42', title: '季度复盘' })).json() as { state: string, status: { rename: { requested: string, effective: string } } }
    expect(renamed.state).toBe('renamed')
    expect(renamed.status.rename).toEqual({ matterRef: 'receipt:42', requested: '季度复盘', effective: '季度复盘·2026Q3', at: '2026-10-03T10:00:00.000Z' })

    // Unwired: the honest not-ready answer, never a pretend rename.
    const unwired = harness()
    expect(await (await unwired.post('/.sage/matter-admin', { action: 'rename', matterRef: 'receipt:42', title: 'x' })).json())
      .toMatchObject({ state: 'refused', code: 'matter-rename-unavailable' })
  })

  it('keeps an unwired family honest and parses bodies exactly', async () => {
    const unwired = harness({ wired: false })
    expect(await (await unwired.post('/.sage/matter-admin', { action: 'archive', matterRef: 'receipt:42', ground: 'completed' })).json())
      .toMatchObject({ state: 'refused', code: 'protected-effect-unavailable' })
    expect((await unwired.readState()).matterAdmin).toEqual({ state: 'unavailable', entries: [], trail: [], rename: null, batch: null })

    const h = harness()
    const bad: unknown[] = [
      { action: 'archive', matterRef: 'receipt:42' },
      { action: 'archive', matterRef: 'receipt:42', ground: 'maybe' },
      { action: 'archive', matterRef: 'receipt:42', ground: 'completed', extra: 1 },
      { action: 'restore', matterRef: '' },
      { action: 'batch', operation: 'archive', targets: ['a'], ground: 'completed', extra: 1 },
      { action: 'batch', operation: 'delete', targets: ['a'], ground: 'completed' },
      { action: 'batch', operation: 'restore', targets: ['a'], ground: 'completed' },
      { action: 'batch', operation: 'restore', targets: [] },
      { action: 'rename', matterRef: 'receipt:42', title: '' },
      { action: 'toggle-visibility', matterRef: 'receipt:42' },
    ]
    for (const body of bad) {
      expect((await h.post('/.sage/matter-admin', body)).status, JSON.stringify(body)).toBe(400)
    }
  })
})

describe('L1-A: the admission layer over the real identity policy (ADR-0320)', () => {
  const cleanups: Array<() => Promise<void>> = []
  afterEach(async () => {
    let cleanup = cleanups.pop()
    while (cleanup !== undefined) {
      await cleanup()
      cleanup = cleanups.pop()
    }
  })

  async function policy(grants: readonly unknown[]) {
    const container = await mkdtemp(join(tmpdir(), 'sage-matter-admin-admission-'))
    const home = join(container, 'home')
    await mkdir(home, { recursive: true })
    cleanups.push(() => rm(container, { recursive: true, force: true }))
    const paths = resolveSagePaths({ home, platform: 'darwin', root: join(container, 'Sage') })
    await mkdir(paths.root, { recursive: true })
    await writeFile(paths.organizationPolicyFile, JSON.stringify({
      schemaVersion: 'sage.organization-policy.v1',
      organizationId: 'organization:sage',
      policy: { identity: 'policy:local', version: '1' },
      validFrom: '2026-10-01T00:00:00Z',
      expiresAt: '2027-10-01T00:00:00Z',
      membership: { mode: 'instance-operator', roleRefs: ['role:owner'] },
      grants,
    }), 'utf8')
    return {
      policyPath: paths.organizationPolicyFile,
      readFileBytes: (path: string) => readFileSync(path),
      now: () => '2026-10-03T00:30:00.000Z',
    }
  }

  const GRANT = {
    roleRef: 'role:owner',
    operation: 'matter.admin.archive',
    actionScope: 'matter.admin',
    effectClass: 'local-write',
    requiresDecision: false,
  } as const

  const frontStubs = {
    verifyCaller: async () => ({ state: 'allowed' as const, value: { bindingRef: 'caller:1' } }),
    resolveActiveContext: async () => ({
      state: 'allowed' as const,
      value: {
        scope: 'request' as const,
        callerBindingRef: 'caller:1',
        sessionRef: 'session:active',
        matterRef: 'receipt:42',
        revisionRef: 'revision:1',
        generation: '1',
      },
    }),
    matchCandidate: async () => ({ state: 'allowed' as const, value: { candidateRef: 'receipt:42' } }),
  }

  const intent = {
    family: 'matter-governance' as const,
    requestId: 'fixture-1',
    operation: 'matter.admin.archive' as const,
    candidate: { kind: 'matter' as const, matterRef: 'receipt:42' },
    payload: { ground: 'completed' as const },
  }

  it('evaluates the real identity step: exact grant passes, a mismatched scope is a denial', async () => {
    const granted = await policy([GRANT])
    const identity = createSessionCoreIdentityPort({
      vault: {
        identitySession: () => ({
          sessionRef: 'session:active',
          identityHandle: 'actor:local',
          issuer: 'https://issuer.invalid',
          authenticatedAt: '2026-10-01T00:00:00.000Z',
          expiresAt: '2026-11-01T00:00:00.000Z',
        }),
      } as never,
      authority: granted,
    })
    const allowed = await admitMatterGovernanceEffect({
      intent,
      correlation: 'caller:1',
      ports: {
        ...frontStubs,
        resolveIdentityPolicy: (request) => identity(request as never),
        // The chain passes identity; without a dispatch port it stops retryable, never unknown.
      },
    })
    expect(allowed).toMatchObject({ state: 'unavailable', code: 'protected-effect-unavailable', stage: 'dispatch', retryable: true })

    const ungranted = await policy([{ ...GRANT, actionScope: 'matter.other' }])
    const deniedIdentity = createSessionCoreIdentityPort({ vault: { identitySession: () => ({
      sessionRef: 'session:active',
      identityHandle: 'actor:local',
      issuer: 'https://issuer.invalid',
      authenticatedAt: '2026-10-01T00:00:00.000Z',
      expiresAt: '2026-11-01T00:00:00.000Z',
    }) } as never, authority: ungranted })
    const denied = await admitMatterGovernanceEffect({
      intent,
      correlation: 'caller:1',
      ports: { ...frontStubs, resolveIdentityPolicy: (request) => deniedIdentity(request as never) },
    })
    expect(denied).toMatchObject({ state: 'denied', code: 'protected-effect-denied', stage: 'identity-policy' })

    // Signed out: unavailable before any policy read.
    const signedOut = createSessionCoreIdentityPort({ vault: { identitySession: () => null } as never, authority: granted })
    const noSession = await admitMatterGovernanceEffect({
      intent,
      correlation: 'caller:1',
      ports: { ...frontStubs, resolveIdentityPolicy: (request) => signedOut(request as never) },
    })
    expect(noSession).toMatchObject({ state: 'unavailable', stage: 'identity-policy' })
  })

  it('keeps a dispatched-but-mismatched receipt on the conservative unknown path', async () => {
    const providers = createUnavailableFirstService(null, {
      draftList: () => ({ state: 'unlocked', drafts: [] }),
      matterLinks: () => ({ state: 'read', links: [], trail: [] }),
      matterList: () => ({ state: 'ready', items: [], trail: [] } as never),
      matterAdmin: () => ({ state: 'unavailable', entries: [], trail: [], rename: null, batch: null }),
      matterGovernancePorts: {
        ...frontStubs,
        resolveIdentityPolicy: async () => ({ state: 'allowed', value: { decisionRef: 'decision:1', actorScopeRef: 'actor:1' } }),
        dispatch: async () => ({
          state: 'receipt',
          receiptRef: 'receipt:matter-archive:other',
          detail: { kind: 'matter-archived', matterRef: 'matter:other', ground: 'completed', status: { state: 'read', entries: [], trail: [], rename: null, batch: null } },
        }),
      },
    })
    const response = await handleSageServiceRequest(new Request('dsh-app://app/.sage/matter-admin', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'archive', matterRef: 'receipt:42', ground: 'completed' }),
    }), { callerBinding: { correlation: 'c-029' }, providers } as never)
    expect(await response.json()).toEqual({ state: 'refused', code: 'protected-effect-outcome-unknown' })
  })
})
