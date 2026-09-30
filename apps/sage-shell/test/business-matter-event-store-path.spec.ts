import {
  chmodSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir, userInfo } from 'node:os'
import { dirname, join, parse } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createBusinessMatter } from '../src/domain/business-matter.js'
import { encodeBusinessMatterEvents } from '../src/domain/business-matter-codec.js'
import {
  BUSINESS_MATTER_STORE_FILENAME,
  BUSINESS_MATTER_STORE_RELATIVE_DIRECTORY,
  BusinessMatterEventStoreError,
  openBusinessMatterEventStore,
  type AppendRequest,
  type BusinessMatterEventStore,
  type BusinessMatterEventStoreErrorCode,
} from '../src/persistence/business-matter-event-store.js'
import {
  resolveSagePaths,
  type SagePaths,
} from '../src/profile/paths.js'

const RECORDED_AT = '2026-09-27T00:10:00Z'
const cleanups: Array<() => void | Promise<void>> = []

afterEach(async () => {
  vi.restoreAllMocks()
  let cleanup = cleanups.pop()
  while (cleanup !== undefined) {
    await cleanup()
    cleanup = cleanups.pop()
  }
})

async function temporaryStorage(label: string): Promise<{
  readonly container: string
  readonly sagePaths: SagePaths
  readonly storageRoot: string
  readonly databasePath: string
}> {
  const physicalTemporaryRoot = await realpath(tmpdir())
  const container = await mkdtemp(join(physicalTemporaryRoot, `sage-store-path-${label}-`))
  const home = join(container, 'home')
  const sageRoot = join(container, 'Sage')
  mkdirSync(home, { mode: 0o700 })
  mkdirSync(sageRoot, { mode: 0o700 })
  const sagePaths = resolveSagePaths({
    home,
    root: sageRoot,
    platform: process.platform,
  })
  const storageRoot = join(
    sagePaths.root,
    BUSINESS_MATTER_STORE_RELATIVE_DIRECTORY,
  )
  cleanups.push(() => rm(container, { force: true, recursive: true }))
  return {
    container,
    sagePaths,
    storageRoot,
    databasePath: join(storageRoot, BUSINESS_MATTER_STORE_FILENAME),
  }
}

function openStore(
  sagePaths: SagePaths,
  overrides: Partial<Parameters<typeof openBusinessMatterEventStore>[0]> = {},
): BusinessMatterEventStore {
  return openBusinessMatterEventStore({
    sagePaths,
    maxStreamEvents: 32,
    maxPayloadBytes: 64 * 1024,
    busyTimeoutMs: 75,
    clock: () => RECORDED_AT,
    ...overrides,
  })
}

function ensureStorageRoot(
  fixture: Awaited<ReturnType<typeof temporaryStorage>>,
): void {
  mkdirSync(join(fixture.sagePaths.root, 'data'), { mode: 0o700 })
  mkdirSync(fixture.storageRoot, { mode: 0o700 })
}

function expectStoreError(
  action: () => unknown,
  code: BusinessMatterEventStoreErrorCode,
): BusinessMatterEventStoreError {
  try {
    action()
  } catch (error) {
    if (!(error instanceof BusinessMatterEventStoreError)) throw error
    expect(error.code).toBe(code)
    return error
  }
  throw new Error(`Expected BusinessMatterEventStoreError(${code})`)
}

function mode(path: string): number {
  return lstatSync(path).mode & 0o7777
}

function createdMatterAppendRequest(
  matterId = 'matter:path-boundary',
): AppendRequest {
  const matter = createBusinessMatter({
    matterId,
    eventId: `${matterId}:created`,
    occurredAt: '2026-09-27T00:00:00Z',
    goal: 'Prove the storage boundary before acknowledging a write.',
    responsibleParty: { kind: 'human', roleRef: 'role:owner' },
  })
  const event = encodeBusinessMatterEvents(matter)[0]!
  return {
    matterId,
    expectedVersion: { kind: 'not-exists' },
    appendId: 'append:path-boundary',
    events: [{
      matterId: event.matterId,
      eventId: event.eventId,
      eventType: event.eventType,
      eventSchemaVersion: event.eventSchemaVersion,
      occurredAt: event.occurredAt,
      payloadBytes: event.payloadBytes.slice(),
    }],
  }
}

describe('BusinessMatter WT-02A.3B storage boundary', () => {
  it('uses one fixed database name and creates a private single-link file', async () => {
    const fixture = await temporaryStorage('private-file')
    const store = openStore(fixture.sagePaths)
    store.close()

    const database = lstatSync(fixture.databasePath)
    expect(database.isFile()).toBe(true)
    expect(database.isSymbolicLink()).toBe(false)
    expect(database.nlink).toBe(1)
    expect(mode(fixture.databasePath)).toBe(0o600)
    expect(mode(join(fixture.sagePaths.root, 'data'))).toBe(0o700)
    expect(mode(fixture.storageRoot)).toBe(0o700)
    if (typeof process.geteuid === 'function') {
      expect(database.uid).toBe(process.geteuid())
    }

    const reopened = openStore(fixture.sagePaths)
    reopened.close()
  })

  it('derives the store below Sage data and leaves the legacy DSH root unchanged', async () => {
    const fixture = await temporaryStorage('legacy-sentinel')
    const legacyRoot = join(fixture.sagePaths.home, '.dsh')
    mkdirSync(legacyRoot, { mode: 0o700 })
    const sentinel = join(legacyRoot, 'sentinel.txt')
    writeFileSync(sentinel, 'legacy-untouched', { mode: 0o600 })

    const store = openStore(fixture.sagePaths)
    store.close()

    expect(fixture.databasePath).toBe(join(
      fixture.sagePaths.root,
      'data',
      'business-matter',
      BUSINESS_MATTER_STORE_FILENAME,
    ))
    expect(readFileSync(sentinel, 'utf8')).toBe('legacy-untouched')
    expect(existsSync(join(legacyRoot, 'data'))).toBe(false)
  })

  it('rejects a physical legacy DSH root hidden behind a home symlink alias', async () => {
    const fixture = await temporaryStorage('legacy-home-alias')
    const legacyRoot = join(fixture.sagePaths.home, '.dsh')
    mkdirSync(legacyRoot, { mode: 0o700 })
    const sentinel = join(legacyRoot, 'sentinel.txt')
    writeFileSync(sentinel, 'legacy-untouched', { mode: 0o600 })
    const homeAlias = join(fixture.container, 'home-alias')
    symlinkSync(fixture.sagePaths.home, homeAlias)
    const aliasedPaths = resolveSagePaths({
      home: homeAlias,
      root: legacyRoot,
      platform: process.platform,
    })

    expectStoreError(() => openStore(aliasedPaths), 'invalid-config')
    expect(readFileSync(sentinel, 'utf8')).toBe('legacy-untouched')
    expect(existsSync(join(legacyRoot, 'data'))).toBe(false)
  })

  it('rejects a Sage root inside the physical target of a legacy DSH symlink', async () => {
    const fixture = await temporaryStorage('legacy-root-symlink-target')
    const physicalLegacyRoot = join(fixture.container, 'physical-legacy-dsh')
    const nestedSageRoot = join(physicalLegacyRoot, 'sage-shadow')
    mkdirSync(physicalLegacyRoot, { mode: 0o700 })
    mkdirSync(nestedSageRoot, { mode: 0o700 })
    const sentinel = join(physicalLegacyRoot, 'sentinel.txt')
    writeFileSync(sentinel, 'legacy-untouched', { mode: 0o600 })
    symlinkSync(physicalLegacyRoot, join(fixture.sagePaths.home, '.dsh'))
    const escapedPaths = resolveSagePaths({
      home: fixture.sagePaths.home,
      root: nestedSageRoot,
      platform: process.platform,
    })

    expectStoreError(() => openStore(escapedPaths), 'invalid-config')
    expect(readFileSync(sentinel, 'utf8')).toBe('legacy-untouched')
    expect(existsSync(join(nestedSageRoot, 'data'))).toBe(false)
  })

  it('rejects the real legacy DSH root even when sagePaths claims a different home', async () => {
    const fixture = await temporaryStorage('forged-home')
    const actualHome = await realpath(userInfo().homedir)
    const actualLegacyChild = join(
      actualHome,
      '.dsh',
      `sage-wt02a3b-regression-${process.pid}-${Date.now()}`,
    )
    const forgedPaths = resolveSagePaths({
      home: fixture.sagePaths.home,
      root: actualLegacyChild,
      platform: process.platform,
    })

    expect(existsSync(actualLegacyChild)).toBe(false)
    expectStoreError(() => openStore(forgedPaths), 'invalid-config')
    expect(existsSync(actualLegacyChild)).toBe(false)
  })

  it.each([
    ['relative root', 'relative/sage-data'],
    ['filesystem root', parse(process.cwd()).root],
    ['URI root', 'file:/tmp/sage-data?mode=rwc&nolock=1'],
    ['NUL root', `/tmp/sage-data\u0000outside`],
  ])('rejects %s before SQLite can create a database', async (_name, sageRoot) => {
    const fixture = await temporaryStorage('invalid-root')
    const unsafePaths = { ...fixture.sagePaths, root: sageRoot }
    expectStoreError(() => openStore(unsafePaths), 'invalid-config')
  })

  it('rejects a lexical parent segment instead of silently rebasing it', async () => {
    const fixture = await temporaryStorage('lexical-parent')
    const lexicalAlias = `${fixture.sagePaths.root}/../Sage`

    expectStoreError(
      () => openStore({ ...fixture.sagePaths, root: lexicalAlias }),
      'invalid-config',
    )
    expect(existsSync(fixture.databasePath)).toBe(false)
  })

  it('snapshots a hostile sagePaths getter exactly once', async () => {
    const fixture = await temporaryStorage('getter')
    let reads = 0
    const options = {
      get sagePaths() {
        reads += 1
        return reads === 1
          ? fixture.sagePaths
          : { ...fixture.sagePaths, root: dirname(fixture.container) }
      },
      maxStreamEvents: 32,
      maxPayloadBytes: 64 * 1024,
      busyTimeoutMs: 75,
      clock: () => RECORDED_AT,
    }

    const store = openBusinessMatterEventStore(options)
    expect(reads).toBe(1)
    store.close()
  })

  it('rejects a symlink root and a symlinked ancestor without touching their targets', async () => {
    const target = await temporaryStorage('root-link-target')
    const rootLink = join(target.container, 'root-link')
    symlinkSync(target.sagePaths.root, rootLink)
    expectStoreError(
      () => openStore({ ...target.sagePaths, root: rootLink }),
      'storage-boundary-violation',
    )

    const actualParent = join(target.container, 'actual-parent')
    const actualRoot = join(actualParent, 'NestedSage')
    mkdirSync(actualParent, { mode: 0o700 })
    mkdirSync(actualRoot, { mode: 0o700 })
    const ancestorLink = join(target.container, 'ancestor-link')
    symlinkSync(actualParent, ancestorLink)
    const aliasedRoot = join(ancestorLink, 'NestedSage')
    expectStoreError(
      () => openStore({ ...target.sagePaths, root: aliasedRoot }),
      'storage-boundary-violation',
    )
    expect(existsSync(target.databasePath)).toBe(false)
    expect(existsSync(join(
      actualRoot,
      BUSINESS_MATTER_STORE_RELATIVE_DIRECTORY,
      BUSINESS_MATTER_STORE_FILENAME,
    ))).toBe(false)
  })

  it.each([0o755, 0o500])('rejects an existing Sage root with mode %s', async unsafeMode => {
    const fixture = await temporaryStorage(`root-mode-${unsafeMode.toString(8)}`)
    chmodSync(fixture.sagePaths.root, unsafeMode)
    try {
      expectStoreError(() => openStore(fixture.sagePaths), 'storage-boundary-violation')
      expect(() => lstatSync(fixture.databasePath)).toThrow()
    } finally {
      chmodSync(fixture.sagePaths.root, 0o700)
    }
  })

  it('rejects an existing BusinessMatter storage directory with an unsafe mode', async () => {
    const fixture = await temporaryStorage('storage-mode')
    ensureStorageRoot(fixture)
    chmodSync(fixture.storageRoot, 0o755)

    expectStoreError(() => openStore(fixture.sagePaths), 'storage-boundary-violation')
    expect(existsSync(fixture.databasePath)).toBe(false)
  })

  it('rejects a controlled effective-uid mismatch before opening SQLite', async () => {
    if (typeof process.geteuid !== 'function') return
    const fixture = await temporaryStorage('wrong-owner')
    const actualUid = process.geteuid()
    vi.spyOn(process, 'geteuid').mockReturnValue(actualUid + 1)

    expectStoreError(() => openStore(fixture.sagePaths), 'storage-boundary-violation')
    expect(() => lstatSync(fixture.databasePath)).toThrow()
  })

  it('rejects database symlinks, dangling symlinks and non-file leaves', async () => {
    const source = await temporaryStorage('db-source')
    const sourceStore = openStore(source.sagePaths)
    sourceStore.close()

    const linked = await temporaryStorage('db-symlink')
    ensureStorageRoot(linked)
    symlinkSync(source.databasePath, linked.databasePath)
    const sourceBefore = readFileSync(source.databasePath)
    expectStoreError(() => openStore(linked.sagePaths), 'storage-boundary-violation')
    expect(readFileSync(source.databasePath)).toEqual(sourceBefore)

    const dangling = await temporaryStorage('db-dangling')
    ensureStorageRoot(dangling)
    symlinkSync(join(dangling.container, 'missing.sqlite3'), dangling.databasePath)
    expectStoreError(() => openStore(dangling.sagePaths), 'storage-boundary-violation')

    const directoryLeaf = await temporaryStorage('db-directory')
    ensureStorageRoot(directoryLeaf)
    mkdirSync(directoryLeaf.databasePath, { mode: 0o700 })
    expectStoreError(() => openStore(directoryLeaf.sagePaths), 'storage-boundary-violation')
  })

  it('rejects a hard-linked database without changing its external authority bytes', async () => {
    const source = await temporaryStorage('hardlink-source')
    const sourceStore = openStore(source.sagePaths)
    sourceStore.close()
    const before = readFileSync(source.databasePath)

    const target = await temporaryStorage('hardlink-target')
    ensureStorageRoot(target)
    linkSync(source.databasePath, target.databasePath)
    expect(lstatSync(target.databasePath).nlink).toBe(2)
    expectStoreError(() => openStore(target.sagePaths), 'storage-boundary-violation')
    expect(readFileSync(source.databasePath)).toEqual(before)
  })

  it.each([0o644, 0o400, 0o000])('rejects an existing database with mode %s', async unsafeMode => {
    const fixture = await temporaryStorage(`db-mode-${unsafeMode.toString(8)}`)
    const store = openStore(fixture.sagePaths)
    store.close()
    chmodSync(fixture.databasePath, unsafeMode)
    try {
      expectStoreError(() => openStore(fixture.sagePaths), 'storage-boundary-violation')
    } finally {
      chmodSync(fixture.databasePath, 0o600)
    }
  })

  it.each(['-journal', '-wal', '-shm'])('rejects an untrusted %s sidecar before SQLite open', async suffix => {
    const fixture = await temporaryStorage(`sidecar-${suffix.slice(1)}`)
    const store = openStore(fixture.sagePaths)
    store.close()
    const sidecar = `${fixture.databasePath}${suffix}`
    writeFileSync(sidecar, 'untrusted', { mode: 0o644 })
    chmodSync(sidecar, 0o644)

    expectStoreError(() => openStore(fixture.sagePaths), 'storage-boundary-violation')
    expect(readFileSync(sidecar, 'utf8')).toBe('untrusted')
  })

  it.each(['-journal', '-wal', '-shm'])('preserves and rejects an orphaned %s sidecar', async suffix => {
    const fixture = await temporaryStorage(`orphan-${suffix.slice(1)}`)
    ensureStorageRoot(fixture)
    const sidecar = `${fixture.databasePath}${suffix}`
    writeFileSync(sidecar, 'orphaned', { mode: 0o600 })

    const error = expectStoreError(
      () => openStore(fixture.sagePaths),
      'storage-boundary-violation',
    )
    expect(error.reason).toBe('untrusted-sidecar')
    expect(readFileSync(sidecar, 'utf8')).toBe('orphaned')
    expect(existsSync(fixture.databasePath)).toBe(false)
  })

  it('rejects symlinked and hard-linked SQLite sidecars without following them', async () => {
    const symlinked = await temporaryStorage('sidecar-symlink')
    const symlinkedStore = openStore(symlinked.sagePaths)
    symlinkedStore.close()
    const externalTarget = join(symlinked.container, 'outside-journal')
    writeFileSync(externalTarget, 'outside', { mode: 0o600 })
    symlinkSync(externalTarget, `${symlinked.databasePath}-journal`)
    expectStoreError(() => openStore(symlinked.sagePaths), 'storage-boundary-violation')
    expect(readFileSync(externalTarget, 'utf8')).toBe('outside')

    const hardLinked = await temporaryStorage('sidecar-hardlink')
    const hardLinkedStore = openStore(hardLinked.sagePaths)
    hardLinkedStore.close()
    const externalWal = join(hardLinked.container, 'outside-wal')
    writeFileSync(externalWal, 'outside', { mode: 0o600 })
    linkSync(externalWal, `${hardLinked.databasePath}-wal`)
    expectStoreError(() => openStore(hardLinked.sagePaths), 'storage-boundary-violation')
    expect(readFileSync(externalWal, 'utf8')).toBe('outside')
  })

  it('quarantines an open store when its database gains another hard link', async () => {
    const fixture = await temporaryStorage('hardlink-after-open')
    const store = openStore(fixture.sagePaths)
    const outsideLink = join(fixture.container, 'outside.sqlite3')
    linkSync(fixture.databasePath, outsideLink)

    expectStoreError(() => store.load('matter:missing'), 'storage-boundary-violation')
    expect(lstatSync(outsideLink).nlink).toBe(2)
    expectStoreError(() => store.load('matter:missing'), 'store-closed')
  })

  it('quarantines an open store when the storage root is replaced before the next operation', async () => {
    const fixture = await temporaryStorage('parent-replaced')
    const store = openStore(fixture.sagePaths)
    const displaced = join(fixture.container, 'business-matter-displaced')
    renameSync(fixture.storageRoot, displaced)
    mkdirSync(fixture.storageRoot, { mode: 0o700 })
    const sentinel = join(fixture.storageRoot, 'sentinel.txt')
    writeFileSync(sentinel, 'outside-target', { mode: 0o600 })

    expectStoreError(() => store.load('matter:missing'), 'storage-boundary-violation')
    expect(readFileSync(sentinel, 'utf8')).toBe('outside-target')
    expectStoreError(() => store.load('matter:missing'), 'store-closed')
  })

  it('rolls back and quarantines when clock replaces the storage root before the first write', async () => {
    const fixture = await temporaryStorage('clock-path-replaced')
    const displaced = join(fixture.container, 'business-matter-displaced')
    let replaced = false
    const store = openStore(fixture.sagePaths, {
      clock: () => {
        if (!replaced) {
          renameSync(fixture.storageRoot, displaced)
          symlinkSync(displaced, fixture.storageRoot)
          replaced = true
        }
        return RECORDED_AT
      },
    })

    try {
      const error = expectStoreError(
        () => store.append(createdMatterAppendRequest()),
        'storage-boundary-violation',
      )
      expect(error.reason).toBe('symbolic-link')
      expectStoreError(() => store.load('matter:path-boundary'), 'store-closed')
    } finally {
      if (existsSync(fixture.storageRoot) && lstatSync(fixture.storageRoot).isSymbolicLink()) {
        unlinkSync(fixture.storageRoot)
      }
      if (existsSync(displaced)) renameSync(displaced, fixture.storageRoot)
      store.close()
    }

    const reopened = openStore(fixture.sagePaths)
    expect(reopened.load('matter:path-boundary')).toEqual({ kind: 'not-found' })
    reopened.close()
  })

  it('returns commit-unknown and quarantines when the path changes after COMMIT', async () => {
    const fixture = await temporaryStorage('post-commit-path-replaced')
    const store = openStore(fixture.sagePaths)
    const request = createdMatterAppendRequest('matter:post-commit-path')
    const displaced = join(fixture.container, 'business-matter-post-commit')
    const originalExec = DatabaseSync.prototype.exec
    let replaced = false
    vi.spyOn(DatabaseSync.prototype, 'exec').mockImplementation(function (
      this: DatabaseSync,
      sql,
    ) {
      const result = Reflect.apply(originalExec, this, [sql]) as ReturnType<DatabaseSync['exec']>
      if (!replaced && sql.trim() === 'COMMIT') {
        renameSync(fixture.storageRoot, displaced)
        symlinkSync(displaced, fixture.storageRoot)
        replaced = true
      }
      return result
    })

    try {
      expect(store.append(request)).toEqual({ kind: 'commit-unknown' })
      expectStoreError(() => store.load(request.matterId), 'store-closed')
    } finally {
      vi.restoreAllMocks()
      if (existsSync(fixture.storageRoot) && lstatSync(fixture.storageRoot).isSymbolicLink()) {
        unlinkSync(fixture.storageRoot)
      }
      if (existsSync(displaced)) renameSync(displaced, fixture.storageRoot)
      store.close()
    }

    const reopened = openStore(fixture.sagePaths)
    expect(reopened.append(request)).toEqual({
      kind: 'replayed',
      firstVersion: 1,
      lastVersion: 1,
    })
    reopened.close()
  })

  it('preserves a newly created database when SQLite initialization fails', async () => {
    const fixture = await temporaryStorage('open-failure-preserved')
    const runtimePrototype = DatabaseSync.prototype as unknown as {
      enableDefensive(active: boolean): void
    }
    vi.spyOn(runtimePrototype, 'enableDefensive').mockImplementation(() => {
      throw new Error('synthetic initialization failure')
    })

    expectStoreError(() => openStore(fixture.sagePaths), 'io-unavailable')
    expect(existsSync(fixture.databasePath)).toBe(true)
    expect(mode(fixture.databasePath)).toBe(0o600)
    expect(lstatSync(fixture.databasePath).nlink).toBe(1)
  })
})
