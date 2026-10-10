/** T05-mid (ADR-0282): the shipped requirement bundle, the real target port, and the production
 *  wiring of the session family's fifth admission step. */
import { readFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { handleSageServiceRequest } from '../src/appservice/route-skeleton.js'
import { createSageAppServiceProviders } from '../src/main/app-service.js'
import { createActiveMatterContext } from '../src/main/active-matter-context.js'
import {
  SESSION_PROMPT_REQUIREMENT_BUNDLE_REL_PATH,
  loadSessionPromptRequirementBundle,
} from '../src/main/publication-bundle.js'
import { createSessionPromptTargetPort } from '../src/main/session-prompt-target.js'
import { resolveSagePaths } from '../src/profile/paths.js'
import type { ServiceProviders } from '../src/appservice/contracts.js'

const APP_ROOT = fileURLToPath(new URL('..', import.meta.url))
const SNAPSHOT_ID = 'urn:sage:compatibility-target-requirement-snapshot:sha256:521b87ace95e8556de898c62973a02fd0f402efca20b1d529d18f5eff892394f'
const REQUIREMENT_DIGEST = 'urn:sage:compatibility-target-requirement:sha256:c7583d07f88f6326c32d5e1339cf908e300034d8ca55812f1136cd6f3705f2eb'
/** Inside the requirement window (2026-10-11 → 2027-10-11) and the session/policy windows. */
const IN_WINDOW = '2026-10-12T00:30:00.000Z'
/** Before the published effectiveAt — identity still passes, the target must not. */
const BEFORE_WINDOW = '2026-10-10T00:30:00.000Z'

const cleanups: Array<() => void | Promise<void>> = []

afterEach(async () => {
  let cleanup = cleanups.pop()
  while (cleanup !== undefined) {
    await cleanup()
    cleanup = cleanups.pop()
  }
})

const vault = {
  status: () => 'signed-out' as const,
  snapshot: () => ({ status: 'signed-out' as const, displayName: null }),
  signOut: () => undefined,
  identitySession: () => ({
    sessionRef: 'session:active',
    identityHandle: 'actor:local',
    issuer: 'https://issuer.invalid',
    authenticatedAt: '2026-10-01T00:00:00.000Z',
    expiresAt: '2027-01-01T00:00:00.000Z',
  }),
}
const adapter = { startLogin: async () => ({ ok: false as const, code: 'probe' }) }
const callerBinding = { correlation: 'caller:session-core' }

async function temporaryAuthority(): Promise<{
  readonly wiring: { readonly policyPath: string, readonly readFileBytes: (path: string) => Buffer, readonly now: () => string }
}> {
  const container = await mkdtemp(join(tmpdir(), 'sage-session-target-'))
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
    grants: [{
      roleRef: 'role:owner',
      operation: 'session.send',
      actionScope: 'session.prompt',
      effectClass: 'external-write',
      requiresDecision: false,
    }],
  }), 'utf8')
  return {
    wiring: {
      policyPath: paths.organizationPolicyFile,
      readFileBytes: (path: string) => readFileSync(path),
      now: () => IN_WINDOW,
    },
  }
}

function activeContext() {
  const context = createActiveMatterContext()
  expect(context.activate({
    expectedContextGeneration: 0,
    next: {
      actorScopeRef: 'actor:local',
      matterId: 'matter:active',
      revisionId: 'revision:active.1',
      workspaceRef: 'workspace:active',
      trustedWorkspaceRoot: '/trusted/workspace',
      sessionRef: 'session:active',
      frameGeneration: 7,
    },
  }).ok).toBe(true)
  return context
}

function assemble(options: {
  readonly authority?: { readonly policyPath: string, readonly readFileBytes: (path: string) => Buffer, readonly now: () => string }
  readonly requirementBundle?: unknown
}) {
  return createSageAppServiceProviders({
    viewState: null,
    vault: vault as never,
    adapter: adapter as never,
    callerBinding,
    activeMatterContext: activeContext(),
    framePolicySnapshot: () => ({ generation: 7, ready: true, contaminated: false, contaminationReasons: [] }),
    matterRehydrate: (() => ({ matter: {} as never, current: true })) as never,
    matterLinks: () => ({
      state: 'read',
      links: [{
        matterRef: 'matter:active',
        workspaceRef: 'workspace:active',
        workspacePath: '/trusted/workspace',
        linkedAt: '2026-10-01T00:00:00.000Z',
        isDefault: true,
      }],
      trail: [],
    }),
    workspaceList: async () => ({
      source: 'workspace-follow', state: 'read', reason: null,
      entries: [{
        workspaceId: 'workspace:active',
        path: '/trusted/workspace',
        title: 'Workspace', sessionCount: 0,
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z',
      }],
      order: ['workspace:active'], archivedSessions: 0, frames: 1, unapplied: 0,
    }),
    sessionSend: vi.fn(async () => ({ state: 'accepted' as const, sessionId: 's', requestId: 'r', mode: 'queue' as const })),
    ...(options.authority === undefined ? {} : { authority: options.authority }),
    ...(options.requirementBundle === undefined ? {} : { requirementBundle: options.requirementBundle as never }),
  })
}

async function post(providers: ServiceProviders, path: string, body: unknown) {
  return handleSageServiceRequest(new Request(`dsh-app://app${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }), { callerBinding, providers })
}

describe('the shipped session-prompt requirement bundle (ADR-0282)', () => {
  it('loads, kernel-parses and pins the published bytes to the governance record', () => {
    const load = loadSessionPromptRequirementBundle()
    expect(load.ok).toBe(true)
    if (!load.ok) throw new Error(load.reason)
    expect(load.snapshotId).toBe(SNAPSHOT_ID)
    expect(load.snapshot.entries).toHaveLength(1)
    const entry = load.snapshot.entries[0]!
    expect(entry.requirementId).toBe('requirement:sage-session-prompt')
    expect(entry.requirementDigest).toBe(REQUIREMENT_DIGEST)
    expect(entry.effectiveAt).toBe('2026-10-11T00:00:00Z')
    expect(entry.expiresAt).toBe('2027-10-11T00:00:00Z')
    expect(entry.model.identity).toBe('model:deepseek-official/deepseek-flash')
    expect(entry.permissionRequirements).toEqual([{
      identity: 'permission:sage.session-prompt',
      version: '1.0.0',
      digest: 'sha256:e6c126cdb3290976981b89e2bdacf11cc0b9db809a50aff315eaa7320ee0d153',
    }])
    expect(entry.dataBoundaryRequirements[0]?.digest)
      .toBe('sha256:ef840683c833ca1f1b6e59734c1fed459537860e3d5ec7614de27251f6e70c54')
  })

  it('rejects tampered bytes and a missing bundle without repairing them', async () => {
    const container = await mkdtemp(join(tmpdir(), 'sage-bundle-tamper-'))
    cleanups.push(() => rm(container, { recursive: true, force: true }))
    await mkdir(join(container, 'publications'), { recursive: true })
    const text = readFileSync(join(APP_ROOT, SESSION_PROMPT_REQUIREMENT_BUNDLE_REL_PATH), 'utf8')
    await writeFile(
      join(container, SESSION_PROMPT_REQUIREMENT_BUNDLE_REL_PATH),
      text.replace(REQUIREMENT_DIGEST, REQUIREMENT_DIGEST.replace('c7583d07', 'c7583d08')),
      'utf8',
    )
    const tampered = loadSessionPromptRequirementBundle({ baseDir: container })
    expect(tampered.ok).toBe(false)
    if (tampered.ok) throw new Error('expected rejection')
    expect(tampered.reason).toContain('rejected by the kernel')

    const missing = loadSessionPromptRequirementBundle({ baseDir: join(container, 'nowhere') })
    expect(missing.ok).toBe(false)
    if (missing.ok) throw new Error('expected rejection')
    expect(missing.reason).toContain('unreadable')
  })
})

describe('the real target port', () => {
  const request = (operation: string) => ({ intent: { operation } }) as never

  it('resolves the published requirement inside its window and refuses everything else', async () => {
    const load = loadSessionPromptRequirementBundle()
    if (!load.ok) throw new Error(load.reason)

    const inWindow = createSessionPromptTargetPort({ bundle: load, now: () => IN_WINDOW })
    expect(await inWindow(request('session.send'))).toEqual({
      state: 'allowed',
      value: { targetRef: `target:${SNAPSHOT_ID}:${REQUIREMENT_DIGEST}` },
    })

    const beforeWindow = createSessionPromptTargetPort({ bundle: load, now: () => BEFORE_WINDOW })
    expect(await beforeWindow(request('session.send'))).toEqual({ state: 'unavailable' })

    expect(await inWindow(request('session.stop'))).toEqual({ state: 'unavailable' })

    const failed = createSessionPromptTargetPort({ bundle: { ok: false, reason: 'probe' }, now: () => IN_WINDOW })
    expect(await failed(request('session.send'))).toEqual({ state: 'unavailable' })
  })
})

describe('the production assembly wires the target step on its own switch', () => {
  it('constructs the target port only when both the authority and the bundle are provided', async () => {
    const authority = await temporaryAuthority()
    const probe = () => {
      let constructed = false
      const bundle = Object.defineProperty({ reason: 'probe' }, 'ok', {
        get() {
          constructed = true
          return false
        },
      })
      return { bundle, constructed: () => constructed }
    }

    const both = probe()
    assemble({ authority: authority.wiring, requirementBundle: both.bundle })
    expect(both.constructed()).toBe(true)

    const bundleOnly = probe()
    assemble({ requirementBundle: bundleOnly.bundle })
    expect(bundleOnly.constructed()).toBe(false)

    assemble({ authority: authority.wiring })
  })

  it('keeps the route unavailable-first before the window and past the real target step inside it', async () => {
    const authority = await temporaryAuthority()
    const bundle = loadSessionPromptRequirementBundle()
    if (!bundle.ok) throw new Error(bundle.reason)
    const providers = assemble({ authority: authority.wiring, requirementBundle: bundle })

    // Inside the window the chain now passes the real target step and stops at the still-absent
    // compatibility step — route-level behaviour stays `protected-effect-unavailable` until that
    // step lands, so this assertion is deliberately stage-agnostic (the stage is not part of the
    // envelope; `session-prompt-target.spec.ts` above pins the port's own outcomes).
    const inside = await (await post(providers, '/.sage/session/send', {
      matterRef: 'matter:active', workspaceRoot: '/renderer/path', text: 'run',
    })).json()
    expect(inside).toEqual({ state: 'refused', code: 'protected-effect-unavailable' })

    const beforeProviders = assemble({
      authority: { ...authority.wiring, now: () => BEFORE_WINDOW },
      requirementBundle: bundle,
    })
    const before = await (await post(beforeProviders, '/.sage/session/send', {
      matterRef: 'matter:active', workspaceRoot: '/renderer/path', text: 'run',
    })).json()
    expect(before).toEqual({ state: 'refused', code: 'protected-effect-unavailable' })
  })
})
