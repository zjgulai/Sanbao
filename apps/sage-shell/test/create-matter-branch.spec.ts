import { existsSync } from 'node:fs'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { runCommand } from '../src/appservice/command-pipeline.js'
import { PRODUCTION_FAIL_CLOSED_PORTS } from '../src/appservice/composition.js'
import { createUnavailableFirstService } from '../src/appservice/composition.js'
import { handleSageServiceRequest } from '../src/appservice/route-skeleton.js'
import { ACTION_AUTHORITY_TABLE } from '../src/main/action-authority-table.js'
import { assembleAuthorizationRequest } from '../src/main/authorization-assembly.js'
import { createMatterRehydratePort } from '../src/main/matter-rehydrate-port.js'
import { resolveSagePaths } from '../src/profile/paths.js'
import { mkdirSync } from 'node:fs'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SageDispatchIntent } from '../src/appservice/command-contracts.js'

/**
 * Ticket 002, creation half. ADR-0005 is explicit: every formal matter is created by the custody
 * side, and a client must never mint one locally and merge later. So a create request gets its own
 * branch after step 2 — it never walks the existing-matter steps, and it never touches the local
 * execution store. Without a custodian the answer is a retryable "not ready", not a fake matter.
 */

const cleanups: Array<() => void | Promise<void>> = []

afterEach(async () => {
  vi.restoreAllMocks()
  let cleanup = cleanups.pop()
  while (cleanup !== undefined) {
    await cleanup()
    cleanup = cleanups.pop()
  }
})

const createIntent = {
  matterId: 'draft:draft-1',
  revisionId: 'draft-revision:1',
  actionType: 'create-matter',
  actionScope: 'revision',
  payload: { goal: 'Prepare a reviewable draft.', deliverable: 'Draft', responsibleParty: 'role:owner' },
  origin: 'renderer-action',
} as unknown as SageDispatchIntent

const authorityAllows = {
  resolveIdentityPolicy: () => ({ kind: 'authorized' as const, actor: {}, authoritySnapshot: {} }),
} as const

describe('create-matter is a custody action, not a local write', () => {
  it('is registered with its own scope and an external-write effect class', () => {
    const entry = ACTION_AUTHORITY_TABLE['create-matter']
    expect(entry).toMatchObject({ operation: 'create-matter', actionScope: 'matter.create', effectClass: 'external-write' })
    // Registration is what the step-2 assembly needs: without an entry the request dies as an
    // unregistered action type before any custodian could be consulted.
    const assembled = assembleAuthorizationRequest({
      intent: createIntent,
      sessionRef: 'session-ref-1',
      organizationRef: 'organization:sage',
    })
    expect(assembled.kind).toBe('request')
  })

  it('reports a missing custodian as a retryable not-ready, never as a created matter', () => {
    const result = runCommand({
      intent: createIntent,
      correlation: 'c-create',
      ports: { ...PRODUCTION_FAIL_CLOSED_PORTS, ...authorityAllows },
    })
    expect(result).toMatchObject({ code: 'persistence-unavailable', stage: 'create', retryable: true })
    expect('receiptRef' in result).toBe(false)
  })

  it('accepts with a receipt when a custodian port answers', () => {
    const result = runCommand({
      intent: createIntent,
      correlation: 'c-create-ok',
      ports: {
        ...PRODUCTION_FAIL_CLOSED_PORTS,
        ...authorityAllows,
        createMatter: () => ({ receiptRef: 'custody-receipt-1' }),
      },
    })
    expect(result).toEqual({ correlation: 'c-create-ok', receiptRef: 'custody-receipt-1' })
  })

  it('treats an explicit custody refusal exactly like a missing custodian', () => {
    const result = runCommand({
      intent: createIntent,
      correlation: 'c-create-refused',
      ports: {
        ...PRODUCTION_FAIL_CLOSED_PORTS,
        ...authorityAllows,
        createMatter: () => ({ denied: 'custody-unavailable' as const }),
      },
    })
    expect(result).toMatchObject({ code: 'persistence-unavailable', stage: 'create', retryable: true })
    expect('receiptRef' in result).toBe(false)
  })

  it('never consults the local execution store for a creation', async () => {
    const physical = await realpath(tmpdir())
    const container = await mkdtemp(join(physical, 'sage-create-'))
    const home = join(container, 'home')
    const root = join(container, 'Sage')
    mkdirSync(home, { mode: 0o700 })
    mkdirSync(root, { mode: 0o700 })
    cleanups.push(() => rm(container, { recursive: true, force: true }))
    const paths = resolveSagePaths({ home, platform: 'darwin', root })
    const port = createMatterRehydratePort({ sagePaths: paths })
    cleanups.push(() => port.close())
    const strictRehydrate = vi.fn(port.strictRehydrate)

    const result = runCommand({
      intent: createIntent,
      correlation: 'c-create-local',
      ports: { ...PRODUCTION_FAIL_CLOSED_PORTS, ...authorityAllows, strictRehydrate },
    })

    expect(result).toMatchObject({ code: 'persistence-unavailable', stage: 'create' })
    // ADR-0005: no local minting, and no local read pretending to be one either.
    expect(strictRehydrate).not.toHaveBeenCalled()
    expect(existsSync(join(root, 'data', 'business-matter'))).toBe(false)
  })

  it('classifies the custody gap as not-ready so the surface offers no replay', async () => {
    const providers = createUnavailableFirstService(null, {
      commandPorts: { ...PRODUCTION_FAIL_CLOSED_PORTS, ...authorityAllows },
    })
    const response = await handleSageServiceRequest(new Request('dsh-app://app/.sage/actions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(createIntent),
    }), { callerBinding: { correlation: 'c-create-surface' }, providers } as never)
    const body = await response.json() as Record<string, unknown>
    expect(body).toMatchObject({ code: 'persistence-unavailable', stage: 'create', retryable: true })

    const state = await handleSageServiceRequest(new Request('dsh-app://app/.sage/state', { method: 'GET' }), {
      callerBinding: { correlation: 'c-state' },
      providers,
    } as never)
    const projected = await state.json() as { service: { command: unknown } }
    expect(projected.service.command).toMatchObject({ outcome: 'not-ready', code: 'persistence-unavailable', retryable: true })
  })
})
