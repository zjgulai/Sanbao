import { randomBytes } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createActionConfirmationStore } from '../src/appservice/action-confirmations.js'
import { createUnavailableFirstService, PRODUCTION_FAIL_CLOSED_PORTS } from '../src/appservice/composition.js'
import type { DraftStatus } from '../src/appservice/contracts.js'
import { handleSageServiceRequest } from '../src/appservice/route-skeleton.js'
import { projectBusinessMatter } from '../src/domain/business-matter.js'
import { createDraftStore, type DraftRecord } from '../src/main/draft-store.js'
import { createMatterCustody } from '../src/main/matter-custody.js'
import { openBusinessMatterEventStore } from '../src/persistence/business-matter-event-store.js'
import { resolveSagePaths, type SagePaths } from '../src/profile/paths.js'

/**
 * T04 end-to-end: the home-page draft confirmation converts through the same pipeline every
 * command runs (identity → authorization → the creation branch), and the creation branch lands
 * in the Sage-owned authoritative store through the real custodian. The negatives pin the
 * acceptance lines: no conversion before the confirmation, changed input refuses, denied
 * identity writes nothing, and reconcile only settles from the committed stream.
 */

const cleanups: Array<() => void | Promise<void>> = []

afterEach(async () => {
  let cleanup = cleanups.pop()
  while (cleanup !== undefined) {
    await cleanup()
    cleanup = cleanups.pop()
  }
})

function gateToStatus(gate: { readonly state: 'locked' } | { readonly state: 'ready', readonly drafts: readonly DraftRecord[] }): DraftStatus {
  return gate.state === 'locked'
    ? { state: 'locked', drafts: [] }
    : {
        state: 'unlocked',
        drafts: gate.drafts.map((draft) => ({
          draftId: draft.draftId,
          fields: draft.fields,
          clarification: draft.clarification,
          history: draft.history,
          status: draft.status,
          matterRef: draft.matterRef,
          attempt: draft.attempt ?? null,
          complete: draft.fields.goal.trim() !== '' && draft.fields.deliverable.trim() !== '' && draft.fields.responsibility.trim() !== '',
          createdAt: draft.createdAt,
          updatedAt: draft.updatedAt,
        })),
      }
}

async function harness(options: { readonly identity?: 'authorized' | 'denied' } = {}) {
  const container = await mkdtemp(join(await realpath(tmpdir()), 'sage-convert-custody-'))
  const home = join(container, 'home')
  const root = join(container, 'Sage')
  const draftsDir = join(container, 'drafts')
  mkdirSync(home, { mode: 0o700 })
  mkdirSync(root, { mode: 0o700 })
  mkdirSync(draftsDir, { mode: 0o700 })
  cleanups.push(() => rm(container, { recursive: true, force: true }))
  const paths: SagePaths = resolveSagePaths({ home, platform: 'darwin', root })

  let counter = 0
  const now = () => new Date(1_700_100_000_000 + (counter += 1) * 1000).toISOString()
  const drafts = createDraftStore({ draftsDir, now, nextId: () => `id-${++counter}`, randomKey: () => randomBytes(32) })
  const custody = createMatterCustody({ sagePaths: paths, clock: now })
  cleanups.push(() => custody.close())
  const confirmations = createActionConfirmationStore({ now, nextId: () => `confirmation-${++counter}` })
  const strictRehydrate = vi.fn(() => undefined)

  const providers = createUnavailableFirstService(null, {
    draftList: () => gateToStatus(drafts.list(true)),
    draftCreate: (request) => gateToStatus(drafts.create(request.rawInput, true)),
    draftUpdate: (request) => {
      const gate = drafts.update(request.draftId, {
        ...(request.fields === undefined ? {} : { fields: request.fields }),
        ...(request.clarification === undefined ? {} : { clarification: request.clarification }),
        ...(request.selectedEntryIds === undefined ? {} : { selectedEntryIds: request.selectedEntryIds }),
      }, true)
      return gate === undefined ? undefined : gateToStatus(gate)
    },
    draftPrepareConversion: (request) => drafts.prepareConversion(request.draftId, true),
    draftBeginAttempt: (request) => { drafts.beginAttempt(request.draftId, request.correlation) },
    draftNoteAttempt: (request) => { drafts.noteAttempt(request.draftId, request.correlation, request.state) },
    draftCommitConversion: (request) => { drafts.commitConversion(request.draftId, request.matterRef) },
    reconcileDraftCreation: (request) => custody.reconcileCreation(request),
    actionConfirmations: { store: confirmations, facts: () => ({ environmentRef: null }) },
    commandPorts: {
      ...PRODUCTION_FAIL_CLOSED_PORTS,
      resolveIdentityPolicy: () => options.identity === 'denied'
        ? { kind: 'denied' as const }
        : { kind: 'authorized' as const, actor: {}, authoritySnapshot: {} },
      strictRehydrate,
      createMatter: (request) => custody.createMatter(request),
    },
  })

  const post = (path: string, body: unknown) => handleSageServiceRequest(
    new Request(`dsh-app://app${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    { callerBinding: { correlation: 'e2e-t04' }, providers } as never,
  )

  const readStore = () => {
    const store = openBusinessMatterEventStore({
      sagePaths: paths,
      maxStreamEvents: 4096,
      maxPayloadBytes: 1024 * 1024,
      busyTimeoutMs: 2000,
      clock: () => '2026-10-10T12:00:00Z',
    })
    cleanups.push(() => store.close())
    return store
  }

  return { paths, drafts, custody, post, strictRehydrate, readStore }
}

async function createCompleteDraft(h: Awaited<ReturnType<typeof harness>>): Promise<string> {
  const created = await (await h.post('/.sage/draft/create', { rawInput: '把季度复盘整理成对外说明' })).json() as DraftStatus
  const draftId = created.drafts[0]!.draftId
  const updated = await (await h.post('/.sage/draft/update', {
    draftId,
    fields: { goal: '整理季度复盘', deliverable: '对外的复盘说明', responsibility: '负责人甲' },
  })).json() as DraftStatus
  expect(updated.drafts[0]).toMatchObject({ complete: true })
  return draftId
}

describe('the confirmed conversion creates the matter through the real custodian', () => {
  it('converts, writes both events into the authoritative store, and clears the attempt', async () => {
    const h = await harness()
    const draftId = await createCompleteDraft(h)

    const prepared = await (await h.post('/.sage/draft/prepare-confirm', { draftId })).json() as {
      readonly state: string
      readonly card: { readonly confirmationId: string }
    }
    expect(prepared.state).toBe('prepared')

    const converted = await (await h.post('/.sage/draft/convert', { draftId, confirmationId: prepared.card.confirmationId })).json() as {
      readonly state: string
      readonly matterRef: string
    }
    expect(converted.state).toBe('converted')
    expect(converted.matterRef).toMatch(/^matter:/u)

    // The draft records only the receipt; the attempt is settled and gone.
    const gate = h.drafts.list(true)
    expect(gate.state).toBe('ready')
    const draft = gate.state === 'ready' ? gate.drafts[0] : undefined
    expect(draft).toMatchObject({ status: 'converted', matterRef: converted.matterRef })
    expect(draft?.attempt).toBeUndefined()

    // The authoritative store holds the creation: matter-created plus the creation revision.
    const loaded = h.readStore().load(converted.matterRef)
    expect(loaded.kind, JSON.stringify(loaded)).toBe('loaded')
    if (loaded.kind !== 'loaded') return
    expect(loaded.version).toBe(2)
    const projection = projectBusinessMatter(loaded.matter)
    expect(projection).toMatchObject({
      goal: '整理季度复盘',
      stage: 'evidence',
      currentRevisionId: 'revision:1',
      responsibleParty: { kind: 'human', roleRef: '负责人甲' },
    })
    expect(projection.revisions[0]!.scope).toBe('交付物：对外的复盘说明')
    // ADR-0201 D3's creation branch never reads the store's existing-matter path.
    expect(h.strictRehydrate).not.toHaveBeenCalled()

    // Reopening a converted draft can never reach the custodian a second time (重开不重复创建).
    const second = await (await h.post('/.sage/draft/convert', { draftId, confirmationId: prepared.card.confirmationId })).json() as { readonly state: string, readonly code: string }
    expect(second).toMatchObject({ state: 'refused', code: 'draft-already-converted' })
    const again = h.readStore().load(converted.matterRef)
    expect(again.kind === 'loaded' ? again.version : 0).toBe(2)
  })

  it('refuses without a confirmation and after an input change, writing nothing', async () => {
    const h = await harness()
    const draftId = await createCompleteDraft(h)

    const unprepared = await (await h.post('/.sage/draft/convert', { draftId })).json() as { readonly state: string, readonly code: string, readonly stage: string }
    expect(unprepared).toMatchObject({ state: 'denied', code: 'confirmation-required', stage: 'confirmation' })
    const afterRefusal = h.drafts.list(true)
    expect(afterRefusal.state === 'ready' ? afterRefusal.drafts[0] : undefined)
      .toMatchObject({ status: 'editing' })
    expect(afterRefusal.state === 'ready' ? afterRefusal.drafts[0]!.attempt : 'missing').toBeUndefined()

    const prepared = await (await h.post('/.sage/draft/prepare-confirm', { draftId })).json() as { readonly card: { readonly confirmationId: string } }
    await h.post('/.sage/draft/update', { draftId, fields: { deliverable: '改过的交付物' } })
    const stale = await (await h.post('/.sage/draft/convert', { draftId, confirmationId: prepared.card.confirmationId })).json() as { readonly state: string, readonly code: string }
    expect(stale).toMatchObject({ state: 'denied', code: 'confirmation-stale' })

    const store = h.readStore()
    expect(store.load('matter:any')).toEqual({ kind: 'not-found' })
    expect(h.strictRehydrate).not.toHaveBeenCalled()
  })

  it('denies before any write when the identity policy refuses', async () => {
    const h = await harness({ identity: 'denied' })
    const draftId = await createCompleteDraft(h)
    const prepared = await (await h.post('/.sage/draft/prepare-confirm', { draftId })).json() as { readonly card: { readonly confirmationId: string } }

    const denied = await (await h.post('/.sage/draft/convert', { draftId, confirmationId: prepared.card.confirmationId })).json() as {
      readonly state: string
      readonly code: string
      readonly stage: string
      readonly retryable: boolean
    }
    expect(denied).toMatchObject({ state: 'denied', code: 'policy-denied', stage: 'identity-policy', retryable: false })
    // The attempt records the refusal; the store gains no stream.
    const gate = h.drafts.list(true)
    expect(gate.state === 'ready' ? gate.drafts[0]!.attempt : undefined).toMatchObject({ state: 'failed' })
    expect(h.readStore().load('matter:' + gate.drafts[0]!.attempt!.correlation).kind).toBe('not-found')

    // The credential was consumed by that dispatch: it cannot authorize a retry (US-125/126).
    const reused = await (await h.post('/.sage/draft/convert', { draftId, confirmationId: prepared.card.confirmationId })).json() as { readonly state: string, readonly code: string }
    expect(reused).toMatchObject({ state: 'denied', code: 'confirmation-consumed' })
  })
})

describe('reconcile settles only from the committed stream', () => {
  it('settles a committed creation and writes the receipt back to the draft', async () => {
    const h = await harness()
    const draftId = await createCompleteDraft(h)
    h.drafts.beginAttempt(draftId, 'corr-manual')
    const prepared = h.drafts.prepareConversion(draftId, true)
    expect(prepared.state).toBe('ready')
    if (prepared.state !== 'ready') return
    const result = h.custody.createMatter({
      intent: {
        matterId: prepared.request.matterId,
        revisionId: prepared.request.revisionId,
        actionType: 'create-matter',
        actionScope: 'revision',
        payload: prepared.request.payload,
        origin: 'renderer-action',
      },
      correlation: 'corr-manual',
    })
    expect(result).toEqual({ receiptRef: 'matter:corr-manual' })

    const answer = await (await h.post('/.sage/draft/reconcile', { draftId })).json() as { readonly state: string, readonly matterRef: string }
    expect(answer).toMatchObject({ state: 'settled', matterRef: 'matter:corr-manual' })
    const gate = h.drafts.list(true)
    expect(gate.state === 'ready' ? gate.drafts[0] : undefined).toMatchObject({ status: 'converted', matterRef: 'matter:corr-manual' })
  })

  it('keeps an unobserved request unknown and never settles it himself', async () => {
    const h = await harness()
    const draftId = await createCompleteDraft(h)
    h.drafts.beginAttempt(draftId, 'corr-unobserved')

    const answer = await (await h.post('/.sage/draft/reconcile', { draftId })).json() as { readonly state: string, readonly code: string }
    expect(answer).toMatchObject({ state: 'unknown', code: 'creation-not-observed' })
    const gate = h.drafts.list(true)
    expect(gate.state === 'ready' ? gate.drafts[0] : undefined).toMatchObject({
      status: 'editing',
      attempt: { correlation: 'corr-unobserved', state: 'pending' },
    })
  })
})
