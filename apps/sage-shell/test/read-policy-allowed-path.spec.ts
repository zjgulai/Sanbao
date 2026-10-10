// T03 authorized read path over the real kernel chain.
//
// The fixtures are fake main-owned facts only: one fixed identity session, one instance policy
// file on a temp disk. Every kernel under test is the production one — the real route table
// (`handleSageServiceRequest`), the real projection-read admission runner, the real active-matter
// selection kernel, the real main-owned read policy (file re-read on every call) and the real
// active-matter context CAS. No network, no Electron. The `selectActiveMatter` option below is a
// deliberate replica of the wiring in `src/main/index.ts` (CTX-01B / T03), refusal mapping
// included, so each receipt assertion pins what the gate-registered wiring actually returns.
import { readFileSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { handleSageServiceRequest } from '../src/appservice/route-skeleton.js'
import { createActiveMatterContext } from '../src/main/active-matter-context.js'
import { selectActiveMatter } from '../src/main/active-matter-selection.js'
import { createSageAppServiceProviders } from '../src/main/app-service.js'
import { createProjectionReadPolicy } from '../src/main/projection-read-policy.js'
import type { VaultIdentitySession } from '../src/main/token-vault.js'

const NOW = '2026-10-05T12:00:00.000Z'
const CALLER = { correlation: 'read:allowed-path' } as const

const SESSION: VaultIdentitySession = {
  sessionRef: 'session:one',
  identityHandle: 'handle:operator-001',
  issuer: 'https://issuer.example/oidc',
  authenticatedAt: '2026-10-05T11:00:00.000Z',
  expiresAt: '2026-10-05T13:00:00.000Z',
}

const SELECT_BODY = { matterId: 'matter:one', expectedContextGeneration: 0 }

const SELECTED_RECEIPT = {
  state: 'selected',
  context: {
    state: 'active',
    matterId: 'matter:one',
    revisionId: 'revision:one',
    workspaceRef: 'workspace:one',
    contextGeneration: 1,
    frameGeneration: 7,
  },
}

/** The route's own blocked fallback for this family (route-skeleton.ts), both for denial and
 *  for staleness: the renderer never learns which admission stage discarded the read. */
const BLOCKED_CANDIDATES_RECEIPT = {
  state: 'refused',
  code: 'file-candidates-unavailable',
  entries: [],
  truncated: false,
  path: '',
}

/** The instance policy file the whole path re-reads. Four local-read grants, no decision
 *  requirement — one selection grant and the canonical projection grants for this read family. */
function policyDocument(overrides: {
  readonly grants?: readonly Record<string, unknown>[]
  readonly version?: string
} = {}): Record<string, unknown> {
  return {
    schemaVersion: 'sage.organization-policy.v1',
    organizationId: 'organization:controlled',
    policy: { identity: 'policy:local', version: overrides.version ?? '1' },
    validFrom: '2026-10-01T00:00:00Z',
    expiresAt: '2027-10-01T00:00:00Z',
    membership: { mode: 'instance-operator', roleRefs: ['role:owner'] },
    grants: overrides.grants ?? [
      { roleRef: 'role:owner', operation: 'matter.read', actionScope: 'matter.read', effectClass: 'local-read', requiresDecision: false },
      { roleRef: 'role:owner', operation: 'workspace.files.list-candidates', actionScope: 'projection.read', effectClass: 'local-read', requiresDecision: false },
      { roleRef: 'role:owner', operation: 'state.read', actionScope: 'projection.read', effectClass: 'local-read', requiresDecision: false },
      { roleRef: 'role:owner', operation: 'edit-drafts.create', actionScope: 'projection.read', effectClass: 'local-read', requiresDecision: false },
    ],
  }
}

const tempRoots: string[] = []

afterEach(async () => {
  while (tempRoots.length > 0) {
    await rm(tempRoots.pop()!, { recursive: true, force: true })
  }
})

/** The production assembly path with fake main-owned facts. */
async function createHarness(options: { readonly session?: VaultIdentitySession | null } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'sage-read-policy-path-'))
  tempRoots.push(root)
  const policyPath = join(root, 'organization-policy.json')
  const writePolicy = async (document: Record<string, unknown>): Promise<void> => {
    await writeFile(policyPath, JSON.stringify(document))
  }
  await writePolicy(policyDocument())

  const session = options.session === undefined ? SESSION : options.session
  const context = createActiveMatterContext()
  const frame = { generation: 7, ready: true, contaminated: false, contaminationReasons: [] as string[] }

  // T03: one read-policy object serves both authorization points — `authorizeMatterRead` at
  // selection time and `authorizeProjectionRead` at read time — mirrors the gate-registered
  // index.ts wiring. The bound-scope ledger that ties the two lives inside this single instance.
  const policy = createProjectionReadPolicy({
    vault: { identitySession: () => session },
    policyPath,
    readFileBytes: readFileSync,
    now: () => NOW,
  })
  const authorizeMatterRead = vi.spyOn(policy, 'authorizeMatterRead')
  const authorizeProjectionRead = vi.spyOn(policy, 'authorizeProjectionRead')

  const listFileCandidates = vi.fn(async () => ({
    state: 'read' as const,
    code: null,
    entries: [{ name: 'alpha.md', path: 'sub/alpha.md', bytes: 42 }],
    truncated: false,
    path: 'sub',
  }))

  const searchProvider = vi.fn(async () => ({
    state: 'read' as const,
    matters: [{ matterRef: 'matter:one', snippet: 'private-snippet' }],
    sessions: [],
  }))

  const providers = createSageAppServiceProviders({
    viewState: { status: 'ready', message: 'private-runtime-message', retryable: false },
    vault: {
      status: () => 'signed-in' as const,
      beginPending: () => false,
      signIn: () => false,
      signOut: () => undefined,
      snapshot: () => ({ status: 'signed-in' as const, displayName: null }),
      identitySession: () => session,
    },
    adapter: { startLogin: async () => ({ ok: false as const, code: 'login-in-progress' as const }) },
    callerBinding: CALLER,
    activeMatterContext: context,
    framePolicySnapshot: () => frame,
    // CTX-01B replica of index.ts: same port order, same refusal mapping
    // (`read-access-denied` → `active-context-denied`, everything else → `active-context-unavailable`).
    selectActiveMatter: async (candidate) => {
      const result = await selectActiveMatter({
        candidate,
        context,
        ports: {
          readActiveIdentitySession: () => session === null ? undefined : { sessionRef: session.sessionRef },
          authorizeMatterRead: (request) => policy.authorizeMatterRead(request),
          resolveCurrentRevision: ({ matterId }) => ({ matterId, revisionId: 'revision:one' }),
          resolveDefaultWorkspace: ({ matterId }) => ({ matterId, workspaceRef: 'workspace:one' }),
          readFreshWorkspaceFold: () => ({
            state: 'read' as const,
            entries: [{ workspaceId: 'workspace:one', path: '/controlled/root' }],
          }),
          snapshotFramePolicy: () => frame,
        },
      })
      if (result.ok) {
        return { state: 'selected' as const, context: { state: 'active' as const, ...result.projection } }
      }
      if (result.code === 'stale-context-generation') {
        return { state: 'refused' as const, code: 'active-context-stale' as const, retryable: true }
      }
      if (result.code === 'read-access-denied') {
        return { state: 'refused' as const, code: 'active-context-denied' as const, retryable: false }
      }
      return { state: 'refused' as const, code: 'active-context-unavailable' as const, retryable: true }
    },
    authorizeProjectionRead: (request) => policy.authorizeProjectionRead(request),
    matterRehydrate: () => ({ matter: {} as never, current: true }),
    matterLinks: () => ({
      state: 'read' as const,
      links: [{
        matterRef: 'matter:one',
        workspaceRef: 'workspace:one',
        workspacePath: '/controlled/root',
        linkedAt: '2026-10-05T10:00:00.000Z',
        isDefault: true,
      }],
      trail: [],
    }),
    workspaceList: async () => ({
      source: 'workspace-follow' as const,
      state: 'read' as const,
      reason: null,
      entries: [{
        workspaceId: 'workspace:one',
        path: '/controlled/root',
        title: 'Controlled root',
        sessionCount: 1,
        createdAt: '2026-10-05T10:00:00.000Z',
        updatedAt: '2026-10-05T10:00:00.000Z',
      }],
      order: ['workspace:one'],
      archivedSessions: 0,
      frames: 1,
      unapplied: 0,
    }),
    listFileCandidates,
    search: searchProvider,
  })

  return {
    providers,
    frame,
    listFileCandidates,
    searchProvider,
    authorizeMatterRead,
    authorizeProjectionRead,
    writePolicy,
    get: (path: string): Promise<Response> => handleSageServiceRequest(
      new Request(`dsh-app://app${path}`),
      { callerBinding: CALLER, providers },
    ),
    post: (path: string, body: unknown): Promise<Response> => handleSageServiceRequest(
      new Request(`dsh-app://app${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
      { callerBinding: CALLER, providers },
    ),
  }
}

describe('T03 authorized read path over the real kernel chain', () => {
  it('selects through the real policy and carries one candidate read across every admission stage to the provider', async () => {
    const harness = await createHarness()

    const select = await harness.post('/.sage/context/select', SELECT_BODY)
    expect(select.status).toBe(200)
    expect(await select.json()).toEqual(SELECTED_RECEIPT)
    // Selection-time authority ran through the shared policy with the bound session facts.
    expect(harness.authorizeMatterRead).toHaveBeenCalledTimes(1)
    expect(harness.authorizeMatterRead).toHaveBeenCalledWith({ sessionRef: 'session:one', matterId: 'matter:one' })

    const response = await harness.post('/.sage/workspace/files/candidates', { workspaceRoot: '/controlled/root', path: 'sub' })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      state: 'read',
      code: null,
      entries: [{ name: 'alpha.md', path: 'sub/alpha.md', bytes: 42 }],
      truncated: false,
      path: 'sub',
    })
    // Read-time authority is the same policy object (hence the same bound-scope ledger), and the
    // raw provider ran exactly once with the router-parsed request.
    expect(harness.authorizeProjectionRead).toHaveBeenCalledTimes(1)
    expect(harness.authorizeProjectionRead).toHaveBeenCalledWith({
      sessionRef: 'session:one',
      matterId: 'matter:one',
      operation: 'workspace.files.list-candidates',
    })
    expect(harness.listFileCandidates).toHaveBeenCalledTimes(1)
    expect(harness.listFileCandidates).toHaveBeenCalledWith({ workspaceRoot: '/controlled/root', path: 'sub' })
  })

  it('refuses the selection with the denied code when the policy grants nothing', async () => {
    const harness = await createHarness()
    await harness.writePolicy(policyDocument({ grants: [] }))

    const response = await harness.post('/.sage/context/select', SELECT_BODY)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      state: 'refused',
      code: 'active-context-denied',
      retryable: false,
    })
    // The policy answered `denied` (not unavailable) for the granted membership.
    expect(harness.authorizeMatterRead).toHaveBeenCalledTimes(1)
    expect(harness.authorizeMatterRead.mock.results[0]?.value).toEqual({ state: 'denied' })
  })

  it('blocks a candidate naming another workspace root after a granted selection', async () => {
    const harness = await createHarness()
    const select = await harness.post('/.sage/context/select', SELECT_BODY)
    expect(await select.json()).toEqual(SELECTED_RECEIPT)

    const response = await harness.post('/.sage/workspace/files/candidates', { workspaceRoot: '/other/root', path: 'sub' })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(BLOCKED_CANDIDATES_RECEIPT)
    // Policy allowed (so the refusal is the candidate-match denial) and the raw provider never ran.
    expect(harness.authorizeProjectionRead).toHaveBeenCalledTimes(1)
    expect(harness.authorizeProjectionRead.mock.results[0]?.value).toMatchObject({ state: 'allowed' })
    expect(harness.listFileCandidates).not.toHaveBeenCalled()
  })

  it('blocks the read as stale when the frame generation moves after selection', async () => {
    const harness = await createHarness()
    const select = await harness.post('/.sage/context/select', SELECT_BODY)
    expect(await select.json()).toEqual(SELECTED_RECEIPT)

    harness.frame.generation = 8

    const response = await harness.post('/.sage/workspace/files/candidates', { workspaceRoot: '/controlled/root', path: 'sub' })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(BLOCKED_CANDIDATES_RECEIPT)
    // The context still names frame generation 7; the fresh frame observation moved to 8.
    expect(harness.authorizeProjectionRead).toHaveBeenCalledTimes(1)
    expect(harness.listFileCandidates).not.toHaveBeenCalled()
  })

  it('blocks the read when the policy version drifts after selection', async () => {
    const harness = await createHarness()
    const select = await harness.post('/.sage/context/select', SELECT_BODY)
    expect(await select.json()).toEqual(SELECTED_RECEIPT)

    await harness.writePolicy(policyDocument({ version: '2' }))

    const response = await harness.post('/.sage/workspace/files/candidates', { workspaceRoot: '/controlled/root', path: 'sub' })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(BLOCKED_CANDIDATES_RECEIPT)
    // The fresh file re-read produced another digest, so read time denied the scope that
    // selection had minted under version 1.
    expect(harness.authorizeProjectionRead.mock.results[0]?.value).toEqual({ state: 'denied' })
    expect(harness.listFileCandidates).not.toHaveBeenCalled()
  })

  it('serves the device state aggregate only after the same granted selection, and still blocks search', async () => {
    const harness = await createHarness()
    const select = await harness.post('/.sage/context/select', SELECT_BODY)
    expect(await select.json()).toEqual(SELECTED_RECEIPT)

    // T03/A (user-authorised): the state aggregate rides the active-matter grant.
    const state = await harness.get('/.sage/state')
    expect(state.status).toBe(200)
    const body = await state.json()
    expect(body.activeContext.state).toBe('active')
    expect(body.workspaces.state).toBe('read')
    expect(body.workspaces.entries.map((entry: { workspaceId: string }) => entry.workspaceId)).toEqual(['workspace:one'])
    expect(body.matterLinks.state).toBe('read')
    expect(harness.authorizeProjectionRead).toHaveBeenCalledWith({
      sessionRef: 'session:one',
      matterId: 'matter:one',
      operation: 'state.read',
    })

    // Search spans multiple matters and global sessions: its collection has no main-owned
    // object resolver yet, so the read stops at candidate match with the route's own refusal.
    const search = await harness.post('/.sage/search', { query: 'alpha' })
    expect(search.status).toBe(200)
    expect(await search.json()).toEqual({ state: 'refused', code: 'search-unavailable' })
    expect(harness.searchProvider).not.toHaveBeenCalled()
  })

  it('refuses the selection as unavailable without a session and never evaluates read access', async () => {
    const harness = await createHarness({ session: null })

    const response = await harness.post('/.sage/context/select', SELECT_BODY)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      state: 'refused',
      code: 'active-context-unavailable',
      retryable: true,
    })
    // `identity-session-unavailable` maps to the unavailable code, and the policy provider
    // (authorizeMatterRead) was never invoked.
    expect(harness.authorizeMatterRead).not.toHaveBeenCalled()
  })
})
