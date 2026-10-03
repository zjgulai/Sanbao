import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { createMatterLinkStore, foldLinks, type MatterLinkRecord } from '../src/main/matter-workspace-links.js'
import { createUnavailableFirstService, PRODUCTION_FAIL_CLOSED_PORTS } from '../src/appservice/composition.js'
import { handleSageServiceRequest } from '../src/appservice/route-skeleton.js'

/**
 * Ticket 011 (US-065~070).
 *
 * The acceptance lines that live here: every link operation leaves a named record, the link action
 * reads no content, and a dispatch whose chosen environment is gone is blocked instead of sliding
 * to another workspace.
 */

const cleanups: Array<() => Promise<void>> = []

afterEach(async () => {
  let cleanup = cleanups.pop()
  while (cleanup !== undefined) {
    await cleanup()
    cleanup = cleanups.pop()
  }
})

async function freshStore() {
  const dir = await mkdtemp(join(tmpdir(), 'sage-links-'))
  cleanups.push(() => rm(dir, { recursive: true, force: true }))
  let counter = 0
  const store = createMatterLinkStore({
    linksDir: dir,
    now: () => new Date(1_700_000_000_000 + counter * 1000).toISOString(),
    nextId: () => `op-${String(++counter)}`,
  })
  return { store, dir }
}

const post = (body: string, providers: ReturnType<typeof createUnavailableFirstService>) => handleSageServiceRequest(
  new Request('dsh-app://app/.sage/matter/link', { method: 'POST', headers: { 'content-type': 'application/json' }, body }),
  { callerBinding: { correlation: 'c-011' }, providers } as never,
)

describe('the trail is the store', () => {
  it('records every link, unlink and default change with actor and instant, and folds to the current set', async () => {
    const { store, dir } = await freshStore()
    store.link({ matterRef: 'receipt:1', workspaceRef: 'ws-1', workspacePath: '/Users/someone/a', actorRef: 'session:verified' })
    store.link({ matterRef: 'receipt:1', workspaceRef: 'ws-2', workspacePath: '/Users/someone/b', actorRef: 'session:verified' })
    let state = store.snapshot()
    expect(state.links.map((link) => link.workspaceRef).sort()).toEqual(['ws-1', 'ws-2'])
    expect(state.links.every((link) => link.isDefault === false)).toBe(true)

    store.setDefault({ matterRef: 'receipt:1', workspaceRef: 'ws-2', actorRef: 'session:verified' })
    state = store.snapshot()
    expect(state.links.find((link) => link.workspaceRef === 'ws-2')?.isDefault).toBe(true)
    expect(state.links.find((link) => link.workspaceRef === 'ws-1')?.workspacePath).toBe('/Users/someone/a')

    store.unlink({ matterRef: 'receipt:1', workspaceRef: 'ws-2', actorRef: 'session:verified' })
    state = store.snapshot()
    expect(state.links.map((link) => link.workspaceRef)).toEqual(['ws-1'])
    // Unlinking the default clears it rather than sliding to the remaining workspace.
    expect(state.links.some((link) => link.isDefault)).toBe(false)
    expect(store.defaultOf('receipt:1')).toBeUndefined()

    // Every step is a record; the file is append-only JSONL with the actor named.
    expect(state.trail.map((record) => record.action)).toEqual(['linked', 'linked', 'default-set', 'unlinked'])
    expect(state.trail.every((record) => record.actorRef === 'session:verified' && record.linkId !== '')).toBe(true)
    const bytes = await readFile(join(dir, 'trail.jsonl'), 'utf8')
    expect(bytes.trim().split('\n')).toHaveLength(4)
  })

  it('refuses to make an unlinked workspace the default, and folds a corrupt trail to nothing', async () => {
    const { store, dir } = await freshStore()
    store.link({ matterRef: 'receipt:1', workspaceRef: 'ws-1', workspacePath: '/a', actorRef: 'session:verified' })
    store.setDefault({ matterRef: 'receipt:1', workspaceRef: 'ws-9', actorRef: 'session:verified' })
    expect(store.defaultOf('receipt:1')).toBeUndefined()

    const { writeFileSync } = await import('node:fs')
    writeFileSync(join(dir, 'trail.jsonl'), '{"linkId":"x"\nnot json\n')
    const state = store.snapshot()
    expect(state.links).toEqual([])
  })

  it('folds a hand-written trail the same way (the fold is the only reader)', () => {
    const trail: MatterLinkRecord[] = [
      { linkId: 'l1', at: 't1', action: 'linked', matterRef: 'm', workspaceRef: 'w1', actorRef: 'a' },
      { linkId: 'l2', at: 't2', action: 'linked', matterRef: 'm', workspaceRef: 'w1', actorRef: 'a' },
      { linkId: 'l3', at: 't3', action: 'default-set', matterRef: 'm', workspaceRef: 'w1', actorRef: 'a' },
      { linkId: 'l4', at: 't4', action: 'linked', matterRef: 'm', workspaceRef: 'w2', actorRef: 'a' },
      { linkId: 'l5', at: 't5', action: 'default-cleared', matterRef: 'm', actorRef: 'a' },
      { linkId: 'l6', at: 't6', action: 'unlinked', matterRef: 'm', workspaceRef: 'w2', actorRef: 'a' },
    ]
    const folded = foldLinks(trail)
    expect(folded.links.map((link) => link.workspaceRef)).toEqual(['w1'])
    expect(folded.defaults.size).toBe(0)
  })
})

describe('the link route and its assertions', () => {
  it('posts the three named actions and refuses anything else before any provider runs', async () => {
    const seen: string[] = []
    const providers = createUnavailableFirstService(null, {
      matterLinkApply: (request) => {
        seen.push(`${request.action}:${request.matterRef}:${request.workspaceRef ?? ''}`)
        return { state: 'read', links: [], trail: [] }
      },
    })
    expect((await post(JSON.stringify({ action: 'link', matterRef: 'receipt:1', workspaceRef: 'ws-1' }), providers)).status).toBe(200)
    expect((await post(JSON.stringify({ action: 'unlink', matterRef: 'receipt:1', workspaceRef: 'ws-1' }), providers)).status).toBe(200)
    expect((await post(JSON.stringify({ action: 'set-default', matterRef: 'receipt:1', workspaceRef: 'ws-1' }), providers)).status).toBe(200)
    expect((await post(JSON.stringify({ action: 'set-default', matterRef: 'receipt:1' }), providers)).status).toBe(200)
    expect(seen).toEqual([
      'link:receipt:1:ws-1',
      'unlink:receipt:1:ws-1',
      'set-default:receipt:1:ws-1',
      'set-default:receipt:1:',
    ])

    const refused: string[] = [
      'not json',
      JSON.stringify({ action: 'merge', matterRef: 'receipt:1', workspaceRef: 'ws-1' }),
      JSON.stringify({ action: 'link', matterRef: '' }),
      JSON.stringify({ action: 'link', matterRef: 'receipt:1' }),
      JSON.stringify({ action: 'link', matterRef: 'receipt:1', workspaceRef: 'ws-1', extra: 1 }),
      JSON.stringify({ action: 'set-default', matterRef: 'receipt:1', workspaceRef: 7 }),
    ]
    for (const body of refused) {
      expect((await post(body, providers)).status, body).toBe(400)
    }
    expect(seen).toHaveLength(4)
    expect(await (await post(JSON.stringify({ action: 'link', matterRef: 'm', workspaceRef: 'w' }), createUnavailableFirstService(null, {}))).json())
      .toEqual({ state: 'unavailable', links: [], trail: [] })
  })

  it('blocks a dispatch whose default environment is gone, without running the pipeline', async () => {
    let ran = 0
    const providers = createUnavailableFirstService(null, {
      // The gate answers "gone"; nothing else in the service may run.
      verifyEnvironment: () => ({ ok: false, code: 'environment-unavailable' }),
      commandPorts: {
        ...PRODUCTION_FAIL_CLOSED_PORTS,
        resolveIdentityPolicy: () => { ran += 1; return { kind: 'denied' as const, code: 'invalid-request' as const, reason: 'should not run' } },
      },
    })
    const response = await handleSageServiceRequest(
      new Request('dsh-app://app/.sage/actions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ matterId: 'receipt:1', revisionId: 'r1', actionType: 'pause', actionScope: 'matter', payload: {}, origin: 'renderer-action' }),
      }),
      { callerBinding: { correlation: 'c-011' }, providers } as never,
    )
    const body = await response.json() as Record<string, unknown>
    expect(body).toMatchObject({ code: 'environment-unavailable', stage: 'environment', retryable: true })
    expect(ran).toBe(0)
    // The same refusal lands in the classified command slot as not-ready (never "failed").
    const state = await (await handleSageServiceRequest(
      new Request('dsh-app://app/.sage/state', { method: 'GET' }),
      { callerBinding: { correlation: 'c-011' }, providers } as never,
    )).json() as { service: { command: { outcome: string, retryable: boolean } } }
    expect(state.service.command).toMatchObject({ outcome: 'not-ready', retryable: true })
  })

  it('lets a dispatch through when no default was chosen, and when the default still exists', async () => {
    let ran = 0
    const providers = createUnavailableFirstService(null, {
      verifyEnvironment: () => ({ ok: true }),
      commandPorts: {
        ...PRODUCTION_FAIL_CLOSED_PORTS,
        resolveIdentityPolicy: () => { ran += 1; return undefined },
      },
    })
    const dispatch = () => handleSageServiceRequest(
      new Request('dsh-app://app/.sage/actions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ matterId: 'receipt:1', revisionId: 'r1', actionType: 'pause', actionScope: 'matter', payload: {}, origin: 'renderer-action' }),
      }),
      { callerBinding: { correlation: 'c-011' }, providers } as never,
    )
    expect((await (await dispatch()).json() as Record<string, unknown>).code).toBe('identity-unavailable')
    expect(ran).toBe(1)
    // The retry probe rides the availability branch (never resolveIdentityPolicy), so the counter
    // stays at one while the answer still comes from the availability check.
    expect((await (await handleSageServiceRequest(
      new Request('dsh-app://app/.sage/actions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'retry' }) }),
      { callerBinding: { correlation: 'c-011' }, providers } as never,
    )).json() as Record<string, unknown>).code).toBe('identity-unavailable')
    expect(ran).toBe(1)
  })
})

describe('linking is a metadata-only act (US-070) and leaves references alone', () => {
  it('never touches the file surface: neither the store nor its wiring names workspaceFiles', async () => {
    const { readFile } = await import('node:fs/promises')
    const storeSource = await readFile(new URL('../src/main/matter-workspace-links.ts', import.meta.url), 'utf8')
    const wiringSource = await readFile(new URL('../src/main/index.ts', import.meta.url), 'utf8')
    const wiring = wiringSource.slice(wiringSource.indexOf('const foldWorkspaces'), wiringSource.indexOf('// Ticket 013: one in-process reference store'))
    expect(wiring).toContain('foldWorkspaces')
    for (const banned of ['workspaceFiles', 'fetch(']) {
      expect(storeSource.includes(banned), `store: ${banned}`).toBe(false)
      expect(wiring.includes(banned), `wiring: ${banned}`).toBe(false)
    }
    // The fold the link path uses is the same follow-stream reader the state projection uses.
    expect(wiring).toContain("readWorkspaceList((endpoint, payload, onFrame) => host.bridgeStream(endpoint, payload, onFrame))")
  })

  it('keeps an existing reference pointing at its original source version after an unlink', async () => {
    const { store: links } = await freshStore()
    const { createFileReferences } = await import('../src/main/workspace-files.js')
    const calls: string[] = []
    const references = createFileReferences(async (endpoint) => {
      calls.push(endpoint)
      if (endpoint === 'workspaceFiles/stat') return { ok: true, result: { absolutePath: '/Users/someone/a/notes.md', version: 'v1' } }
      return { ok: false, code: 'bridge-answer-unrecognised' }
    }, { now: () => '2026-10-02T12:00:00.000Z', nextId: () => 'ref-1' })

    links.link({ matterRef: 'receipt:1', workspaceRef: 'ws-1', workspacePath: '/Users/someone/a', actorRef: 'session:verified' })
    const created = await references.create({ workspaceRoot: '/Users/someone/a', path: 'notes.md' })
    expect(created.state).toBe('created')
    const before = created.reference!
    expect(before.workspaceRoot).toBe('/Users/someone/a')

    links.unlink({ matterRef: 'receipt:1', workspaceRef: 'ws-1', actorRef: 'session:verified' })
    // The association is gone; the reference is not: it still names its workspace root and the
    // version of the moment it was created (nothing is re-resolved or re-pointed).
    const after = references.list().find((record) => record.referenceId === before.referenceId)
    expect(after).toEqual(before)
    expect(calls).toEqual(['workspaceFiles/stat'])
  })
})
