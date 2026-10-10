import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { createBusinessMatter, enterEvidence, type BusinessMatter } from '../src/domain/business-matter.js'
import { encodeBusinessMatterEvents } from '../src/domain/business-matter-codec.js'
import {
  BUSINESS_MATTER_STORE_FILENAME,
  openBusinessMatterEventStore,
} from '../src/persistence/business-matter-event-store.js'
import { resolveSagePaths } from '../src/profile/paths.js'
import { createRevisionDigestReader } from '../src/main/revision-digest-reader.js'

const cleanups: Array<() => void | Promise<void>> = []

afterEach(async () => {
  let cleanup = cleanups.pop()
  while (cleanup !== undefined) {
    await cleanup()
    cleanup = cleanups.pop()
  }
})

async function temporaryStoreRoot(name = 'reader'): Promise<string> {
  const container = await mkdtemp(join(
    await realpath(tmpdir()),
    `sage-revision-digest-${name.replace(/[^a-z0-9]+/giu, '-')}-`,
  ))
  const root = join(container, 'Sage')
  await mkdir(join(container, 'home'), { mode: 0o700 })
  await mkdir(join(root, 'data', 'business-matter'), { mode: 0o700, recursive: true })
  cleanups.push(() => rm(container, { force: true, recursive: true }))
  return root
}

function openStore(root: string) {
  const store = openBusinessMatterEventStore({
    sagePaths: resolveSagePaths({
      home: join(dirname(root), 'home'),
      root,
      platform: process.platform,
    }),
    maxStreamEvents: 32,
    maxPayloadBytes: 64 * 1024,
    busyTimeoutMs: 75,
    clock: () => '2026-09-27T00:10:00Z',
  })
  cleanups.push(() => store.close())
  return store
}

function matterWithRevision1(matterId: string): BusinessMatter {
  return enterEvidence(createBusinessMatter({
    matterId,
    eventId: `${matterId}:created`,
    occurredAt: '2026-09-27T00:00:00Z',
    goal: 'Prepare a reviewable draft.',
    responsibleParty: { kind: 'human', roleRef: 'role:owner' },
  }), {
    eventId: `${matterId}:revision-1`,
    occurredAt: '2026-09-27T00:01:00Z',
    revisionId: 'revision:1',
    changeReason: 'Initial evidence.',
    scope: 'Draft only.',
    permissionBoundary: 'No publication.',
    dataDestination: 'Temporary test database.',
    evidence: [{
      evidenceId: 'evidence:brief',
      source: 'fixture:brief',
      observedAt: '2026-09-27T00:00:30Z',
      status: 'supported',
    }],
    unknowns: [],
    options: [],
    dependencies: [],
    experienceRefs: [],
    actionPolicies: [{
      actionScope: 'draft.prepare',
      effectClass: 'local-write',
      requiresDecision: false,
    }],
  })
}

function appendRequest(matter: BusinessMatter, appendId: string) {
  return {
    matterId: matter.events[0]!.matterId,
    expectedVersion: { kind: 'not-exists' } as const,
    appendId,
    events: encodeBusinessMatterEvents(matter).map((event) => ({
      matterId: event.matterId,
      eventId: event.eventId,
      eventType: event.eventType,
      eventSchemaVersion: event.eventSchemaVersion,
      occurredAt: event.occurredAt,
      payloadBytes: event.payloadBytes.slice(),
    })),
  }
}

describe('RevisionDigestReader (WT-02C.2C.6 compatibility evidence chain input)', () => {
  it('resolves a committed revision digest, keeps undefined for missing facts and never caches', async () => {
    const root = await temporaryStoreRoot()
    const store = openStore(root)
    const reader = createRevisionDigestReader({ store })

    // Missing before anything is committed.
    expect(reader.revisionDigest('matter:reader-001', 'revision:1')).toBeUndefined()

    const matter = matterWithRevision1('matter:reader-001')
    expect(store.append(appendRequest(matter, 'append:reader'))).toEqual({
      kind: 'appended',
      firstVersion: 1,
      lastVersion: 2,
    })

    // Found: the store's own validated digest shape.
    const digest = reader.revisionDigest('matter:reader-001', 'revision:1')
    expect(digest).toMatch(/^sha256:[0-9a-f]{64}$/)
    // The reader is a thin adapter: the value matches the store's own read method.
    expect(digest).toEqual(store.readRevisionDigest('matter:reader-001', 'revision:1'))
    // Unknown revision stays a missing fact, never an error.
    expect(reader.revisionDigest('matter:reader-001', 'revision:absent')).toBeUndefined()
    expect(reader.revisionDigest('matter:absent', 'revision:1')).toBeUndefined()
    // No caching: each call re-answers through the store.
    expect(reader.revisionDigest('matter:reader-001', 'revision:1')).toEqual(digest)

    // A later store change is visible on the next call (no snapshotting).
    const second = matterWithRevision1('matter:reader-002')
    expect(store.append(appendRequest(second, 'append:reader-2'))).toEqual({
      kind: 'appended',
      firstVersion: 1,
      lastVersion: 2,
    })
    expect(reader.revisionDigest('matter:reader-002', 'revision:1'))
      .toMatch(/^sha256:[0-9a-f]{64}$/)
  })
})
