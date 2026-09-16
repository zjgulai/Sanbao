/**
 * Recoverable directory transactions for preset/skill final-name siblings.
 *
 * This module deliberately does not parse CLI input or discover targets. Callers
 * must finish the full-batch preflight with `preset-skill-paths.mjs` first and
 * pass the resulting root/path proofs and tree snapshots here. The transaction
 * layer owns only the mutation protocol:
 *
 *   lock -> sibling workspace -> stage every replacement -> durable intents ->
 *   old target to backup/quarantine -> staged target to final name -> verify ->
 *   durable COMMITTED journal -> unlock.
 *
 * Backups, quarantine, staged/recovered after-images, and the journal are never
 * garbage-collected here. A failure is rolled back in reverse order. If the
 * rollback cannot prove the complete before-state, the lock and evidence remain
 * in place and the transaction becomes MANUAL_RECOVERY_REQUIRED.
 */
import { createHash } from 'node:crypto'
import {
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
} from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import {
  acquireRootLock,
  adoptOrphanRootLock,
  atomicWriteJson,
  canonicalRoot,
  copyTreeVerified,
  fsyncDirectory,
  inspectTree,
  releaseRootLock,
  resolveContainedTarget,
  revalidatePathSnapshot,
  validateFinalNames,
} from './preset-skill-paths.mjs'

export const TRANSACTION_SCHEMA_VERSION = 1
export const JOURNAL_FILE = 'journal.json'

/** Fault points accepted by `options.fault(point, context)`. */
export const TRANSACTION_FAULT_POINTS = Object.freeze([
  'copy',
  'fsync',
  'journal',
  'old-rename',
  'new-rename',
  'close',
  'rollback-rename',
])

const ACTIONS = new Set(['replace', 'remove'])
const SAFE_BATCH_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u

export class DirectoryTransactionError extends Error {
  constructor(message, options = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'DirectoryTransactionError'
    this.code = options.code ?? 'DIRECTORY_TRANSACTION_FAILED'
    this.workspace = options.workspace
    this.journalPath = options.journalPath
    this.rollback = options.rollback
    this.lockRetained = options.lockRetained === true
  }
}

/**
 * Execute a preflighted batch.
 *
 * @param {{
 *   batchId: string,
 *   owner: string,
 *   root: object,
 *   workspace: string,
 *   items: Array<{
 *     action: 'replace'|'remove',
 *     finalName: string,
 *     target: object,
 *     before: object|null,
 *     source?: object,
 *     after?: object,
 *     stageMode?: 'copy'|'prepared',
 *   }>,
 * }} plan
 * @param {{
 *   fault?: (point: string, context: object) => (void|Promise<void>),
 *   prepare?: (context: {
 *     workspace: string,
 *     stageDir: string,
 *     archiveDir: string,
 *     backupDir: string,
 *     quarantineDir: string,
 *     recoveryDir: string,
 *     journalPath: string,
 *     root: object,
 *     items: ReadonlyArray<object>,
 *   }) => (void|object|Promise<void|object>),
 * }} options
 * @returns {Promise<{state: 'COMMITTED', workspace: string, journalPath: string, journal: object}>}
 */
export async function executeDirectoryTransaction(plan, options = {}) {
  const checked = await validatePlan(plan)
  const { root, rootPath, rootFingerprint, workspace, journalPath, items } = checked
  let lock
  let journal
  let targetMutationStarted = false

  try {
    lock = await acquireRootLock(root, {
      owner: { name: plan.owner, batchId: plan.batchId },
    })

    await assertRootStillMatches(root, rootFingerprint)
    await mkdir(workspace, { mode: 0o700 })
    await Promise.all([
      mkdir(join(workspace, 'stage'), { mode: 0o700 }),
      mkdir(join(workspace, 'archive'), { mode: 0o700 }),
      mkdir(join(workspace, 'backup'), { mode: 0o700 }),
      mkdir(join(workspace, 'quarantine'), { mode: 0o700 }),
      mkdir(join(workspace, 'recovery'), { mode: 0o700 }),
    ])
    await syncDirectories([dirname(workspace), workspace], options.fault, {
      phase: 'PREPARING',
      index: null,
    })

    journal = makeJournal(plan, checked, lock)
    await persistJournal(journalPath, journal, options.fault, {
      phase: 'PREPARING',
      kind: 'intent',
    })

    // Revalidate the complete plan after taking the lock and before staging.
    await assertRootStillMatches(root, rootFingerprint)
    for (const item of items) {
      await revalidateTargetProof(item.target)
      if (item.action === 'replace' && item.stageMode !== 'prepared') {
        await revalidateTargetProof(item.source)
      }
    }

    // Archive creation and installer-specific builders run while the same lock
    // that protects the later live renames is held. The hook receives only the
    // transaction workspace; live targets are revalidated after it returns.
    if (options.prepare !== undefined) {
      const evidence = await options.prepare(Object.freeze({
        workspace,
        stageDir: join(workspace, 'stage'),
        archiveDir: join(workspace, 'archive'),
        backupDir: join(workspace, 'backup'),
        quarantineDir: join(workspace, 'quarantine'),
        recoveryDir: join(workspace, 'recovery'),
        journalPath,
        root,
        items: Object.freeze([...items]),
      }))
      if (evidence !== undefined) journal.prepareEvidence = jsonRoundTrip(evidence)
      journal.prepareCompleted = true
      await persistJournal(journalPath, journal, options.fault, {
        phase: 'PREPARE_HOOK', kind: 'done',
      })
      await assertRootStillMatches(root, rootFingerprint)
      for (const item of items) await revalidateTargetProof(item.target)
    }

    // Stage every replacement before the first live target is renamed.
    for (const [index, item] of items.entries()) {
      if (item.action !== 'replace') continue
      const stagePath = stagePathFor(workspace, item.finalName)
      let staged
      if (item.stageMode === 'prepared') {
        staged = await inspectExistingTree(stagePath)
      } else {
        await hitFault(options.fault, 'copy', { timing: 'before', index, finalName: item.finalName })
        staged = await copyTreeVerified(item.source.path, stagePath, {
          expectedManifest: item.after,
        })
        await hitFault(options.fault, 'copy', { timing: 'after', index, finalName: item.finalName })
      }
      assertDigest(staged, digestOf(item.after), `staged ${item.finalName}`)
      journal.items[index].stageDigest = digestOf(staged)
      journal.items[index].phase = 'STAGED'
      await syncDirectories([dirname(stagePath), stagePath], options.fault, {
        phase: 'STAGED', index, finalName: item.finalName,
      })
      await persistJournal(journalPath, journal, options.fault, {
        phase: 'STAGED', kind: 'done', index,
      })
    }

    journal.state = 'PREPARED'
    await persistJournal(journalPath, journal, options.fault, {
      phase: 'PREPARED', kind: 'done',
    })

    // Commit one direct child at a time. Every syscall has a durable intent and
    // every later failure rolls the already-applied prefix back in reverse order.
    for (const [index, item] of items.entries()) {
      const record = journal.items[index]
      const oldDestination = item.action === 'remove'
        ? quarantinePathFor(workspace, item.finalName)
        : backupPathFor(workspace, item.finalName)

      record.phase = 'BACKUP_INTENT'
      journal.state = 'COMMITTING'
      await persistJournal(journalPath, journal, options.fault, {
        phase: 'BACKUP_INTENT', kind: 'intent', index,
      })

      if (item.target.exists === true) {
        await hitFault(options.fault, 'old-rename', {
          timing: 'before', index, finalName: item.finalName,
        })
        await revalidateTargetProof(item.target)
        const currentBefore = await inspectExistingTree(item.target.path)
        assertDigest(currentBefore, digestOf(item.before), `before ${item.finalName}`)
        await assertAbsent(oldDestination)
        await assertRootStillMatches(root, rootFingerprint)
        await revalidateTargetProof(item.target)
        await rename(item.target.path, oldDestination)
        targetMutationStarted = true
        await syncDirectories([dirname(item.target.path), dirname(oldDestination)], options.fault, {
          phase: 'BACKED_UP', index, finalName: item.finalName,
        })
        await hitFault(options.fault, 'old-rename', {
          timing: 'after', index, finalName: item.finalName,
        })
      } else if (item.action === 'remove') {
        throw new DirectoryTransactionError(`remove target is absent: ${item.finalName}`, {
          code: 'TARGET_ABSENT', workspace, journalPath,
        })
      } else {
        await revalidateTargetProof(item.target)
      }

      record.phase = item.action === 'remove' ? 'REMOVED' : 'BACKED_UP'
      await persistJournal(journalPath, journal, options.fault, {
        phase: record.phase, kind: 'done', index,
      })

      if (item.action === 'remove') continue

      record.phase = 'PROMOTE_INTENT'
      await persistJournal(journalPath, journal, options.fault, {
        phase: 'PROMOTE_INTENT', kind: 'intent', index,
      })
      const stagePath = stagePathFor(workspace, item.finalName)
      await hitFault(options.fault, 'new-rename', {
        timing: 'before', index, finalName: item.finalName,
      })
      const staged = await inspectExistingTree(stagePath)
      assertDigest(staged, digestOf(item.after), `stage ${item.finalName}`)
      await assertRootStillMatches(root, rootFingerprint)
      await assertAbsent(item.target.path)
      await rename(stagePath, item.target.path)
      targetMutationStarted = true
      await syncDirectories([dirname(stagePath), dirname(item.target.path)], options.fault, {
        phase: 'PROMOTED', index, finalName: item.finalName,
      })
      await hitFault(options.fault, 'new-rename', {
        timing: 'after', index, finalName: item.finalName,
      })
      record.phase = 'PROMOTED'
      await persistJournal(journalPath, journal, options.fault, {
        phase: 'PROMOTED', kind: 'done', index,
      })
    }

    await verifyAfterState(rootPath, items)
    journal.state = 'COMMIT_INTENT'
    await persistJournal(journalPath, journal, options.fault, {
      phase: 'COMMIT_INTENT', kind: 'intent',
    })
    await hitFault(options.fault, 'close', { timing: 'before', phase: 'COMMITTED' })
    journal.state = 'COMMITTED'
    journal.committedAt = new Date().toISOString()
    await persistJournal(journalPath, journal, options.fault, {
      phase: 'COMMITTED', kind: 'commit',
    })

    try {
      await releaseRootLock(lock)
      lock = undefined
    } catch (error) {
      journal.state = 'MANUAL_RECOVERY_REQUIRED'
      journal.controlPlaneFailure = errorIdentity(error)
      await bestEffortJournal(journalPath, journal)
      throw new DirectoryTransactionError('commit succeeded but the root lock could not be released', {
        code: 'LOCK_RELEASE_FAILED', cause: error, workspace, journalPath, lockRetained: true,
      })
    }

    return { state: 'COMMITTED', workspace, journalPath, journal }
  } catch (error) {
    if (error instanceof DirectoryTransactionError && error.code === 'LOCK_RELEASE_FAILED') throw error

    // A lock acquisition failure happens before a journal/workspace exists and
    // must never try to alter the competing transaction's state.
    if (lock === undefined || journal === undefined) {
      if (lock !== undefined) {
        try { await releaseRootLock(lock) } catch { /* retain the original failure */ }
      }
      throw wrapFailure(error, { workspace, journalPath, rollback: 'not-started' })
    }

    journal.failure = errorIdentity(error)
    try {
      const rollback = await rollbackJournal({
        workspace,
        journalPath,
        journal,
        rootPath,
        fault: options.fault,
      })
      if (lock !== undefined) {
        await releaseRootLock(lock)
        lock = undefined
      }
      throw wrapFailure(error, {
        workspace,
        journalPath,
        rollback: rollback.state,
        targetMutationStarted,
      })
    } catch (rollbackError) {
      // The wrapped original failure above is deliberately allowed through.
      if (rollbackError instanceof DirectoryTransactionError
          && rollbackError.code === 'DIRECTORY_TRANSACTION_FAILED'
          && rollbackError.rollback === 'ROLLED_BACK') throw rollbackError

      journal.state = 'MANUAL_RECOVERY_REQUIRED'
      journal.rollbackFailure = errorIdentity(rollbackError)
      await bestEffortJournal(journalPath, journal)
      throw new DirectoryTransactionError('transaction failed and automatic rollback could not prove the before-state', {
        code: 'MANUAL_RECOVERY_REQUIRED',
        cause: rollbackError,
        workspace,
        journalPath,
        rollback: 'MANUAL_RECOVERY_REQUIRED',
        lockRetained: true,
      })
    }
  }
}

/**
 * Explicitly roll a retained workspace back. Existing locks are never inferred
 * stale. Orphan adoption is opt-in and succeeds only when the lock token/batch
 * matches this journal and the recorded owner PID is proven absent.
 *
 * @param {string} workspace
 * @param {{mode?: 'rollback', owner?: string, fault?: Function, adoptOrphanLock?: boolean}} [options]
 */
export async function recoverTransaction(workspace, options = {}) {
  if (options.mode !== 'rollback') {
    throw new DirectoryTransactionError('recoverTransaction only supports mode=rollback', {
      code: 'UNSUPPORTED_RECOVERY_MODE', workspace,
    })
  }
  const requestedWorkspace = resolve(workspace)
  const requestedJournalPath = join(requestedWorkspace, JOURNAL_FILE)
  const journal = await readJournal(requestedJournalPath)
  validateJournalShape(journal)
  const workspacePath = await assertWorkspaceSibling(journal.root.path, requestedWorkspace, { mustExist: true })
  const journalPath = join(workspacePath, JOURNAL_FILE)

  const root = await canonicalRoot(journal.root.path)
  await assertRootFingerprint(root, journal.root)
  const names = journal.items.map((item) => item.finalName)
  await Promise.resolve(validateFinalNames(names))
  for (const item of journal.items) {
    // Parsing a retained journal must go back through the same direct-child
    // resolver; a tampered journal never reaches rename().
    await resolveContainedTarget(root, item.finalName, {
      mustExist: false,
      existingType: 'directory',
    })
  }

  if (journal.state === 'ROLLED_BACK') {
    await verifyBeforeState(journal.root.path, journal.items)
    return { state: 'ROLLED_BACK', workspace: workspacePath, journalPath, journal }
  }

  let lock
  let adoptedLock = null
  try {
    if (options.adoptOrphanLock === true) {
      const epoch = [...journal.lockEpochs].reverse().find((row) => row?.batchId === journal.batchId)
      if (typeof epoch?.tokenHash !== 'string') {
        throw new DirectoryTransactionError('journal has no matching lock token for orphan adoption', {
          code: 'ORPHAN_LOCK_ADOPTION_FAILED', workspace: workspacePath,
          journalPath, rollback: 'not-started', lockRetained: true,
        })
      }
      try {
        adoptedLock = await adoptOrphanRootLock(root, {
          expectedTokenHash: epoch.tokenHash,
          batchId: journal.batchId,
        })
      } catch (error) {
        throw new DirectoryTransactionError('explicit orphan lock adoption was refused', {
          code: 'ORPHAN_LOCK_ADOPTION_FAILED', cause: error, workspace: workspacePath,
          journalPath, rollback: 'not-started', lockRetained: true,
        })
      }
    }
    lock = await acquireRootLock(root, {
      owner: { name: options.owner ?? `recovery:${process.pid}`, batchId: journal.batchId },
    })
    if (adoptedLock !== null) {
      journal.adoptedLocks ??= []
      journal.adoptedLocks.push({
        adoptedAt: new Date().toISOString(),
        owner: adoptedLock.metadata.owner,
        pid: adoptedLock.metadata.pid,
        startedAt: adoptedLock.metadata.startedAt,
        tokenHash: adoptedLock.tokenHash,
      })
    }
    journal.lockEpochs.push(lockEpoch(lock))
    await persistJournal(journalPath, journal, options.fault, {
      phase: 'RECOVERY_LOCKED', kind: 'intent',
    })
    const result = await rollbackJournal({
      workspace: workspacePath,
      journalPath,
      journal,
      rootPath: journal.root.path,
      fault: options.fault,
    })
    await releaseRootLock(lock)
    lock = undefined
    return { ...result, workspace: workspacePath, journalPath, journal }
  } catch (error) {
    if (lock === undefined) {
      if (error instanceof DirectoryTransactionError
          && error.code === 'ORPHAN_LOCK_ADOPTION_FAILED') throw error
      // Another owner (including an orphaned/stale lock) remains authoritative.
      // Recovery never rewrites its journal or unlinks/adopts that lock implicitly.
      throw new DirectoryTransactionError('explicit rollback could not acquire the root lock', {
        code: 'RECOVERY_LOCK_UNAVAILABLE', cause: error, workspace: workspacePath,
        journalPath, rollback: 'not-started', lockRetained: true,
      })
    }
    journal.state = 'MANUAL_RECOVERY_REQUIRED'
    journal.rollbackFailure = errorIdentity(error)
    await bestEffortJournal(journalPath, journal)
    throw new DirectoryTransactionError('explicit rollback failed or the root is still locked', {
      code: 'MANUAL_RECOVERY_REQUIRED', cause: error, workspace: workspacePath,
      journalPath, rollback: 'MANUAL_RECOVERY_REQUIRED', lockRetained: lock !== undefined,
    })
  }
}

async function validatePlan(plan) {
  if (plan === null || typeof plan !== 'object') throw planError('plan must be an object')
  if (!SAFE_BATCH_ID.test(plan.batchId ?? '')) throw planError('batchId is invalid')
  if (typeof plan.owner !== 'string' || plan.owner.trim() === '' || /[\u0000-\u001f\u007f]/u.test(plan.owner)) {
    throw planError('owner must be a non-empty printable string')
  }
  if (plan.root === null || typeof plan.root !== 'object') throw planError('root proof is required')
  if (!Array.isArray(plan.items) || plan.items.length === 0) throw planError('items must be a non-empty array')
  if (plan.kind !== undefined && !['preset', 'skill'].includes(plan.kind)) {
    throw planError('kind must be preset or skill')
  }

  const rootPath = resolve(plan.root.realPath ?? plan.root.path ?? '')
  const workspace = await assertWorkspaceSibling(rootPath, resolve(plan.workspace ?? ''), { mustExist: false })
  const rootFingerprint = await captureRootFingerprint(plan.root, rootPath)

  const names = plan.items.map((item) => item?.finalName)
  const allowExisting = plan.items
    .filter((item) => item?.target?.exists === true)
    .map((item) => item.finalName)
  await Promise.resolve(validateFinalNames(names, { root: plan.root, allowExisting }))
  if (new Set(names).size !== names.length) throw planError('duplicate finalName in batch')

  const items = plan.items.map((item) => {
    if (item === null || typeof item !== 'object' || !ACTIONS.has(item.action)) {
      throw planError('each item action must be replace or remove')
    }
    if (item.target === null || typeof item.target !== 'object') throw planError(`${item.finalName}: target proof is required`)
    const expectedTarget = join(rootPath, item.finalName)
    if (resolve(item.target.path ?? '') !== expectedTarget || dirname(expectedTarget) !== rootPath) {
      throw planError(`${item.finalName}: target is not the named direct child of root`)
    }
    if (item.target.exists === true && digestOf(item.before) === null) {
      throw planError(`${item.finalName}: existing target requires a before snapshot`)
    }
    if (item.target.exists !== true && item.before !== null) {
      throw planError(`${item.finalName}: absent target must use before=null`)
    }
    if (item.action === 'remove' && item.target.exists !== true) {
      throw planError(`${item.finalName}: remove requires an existing target`)
    }
    let stageMode = item.stageMode
    if (item.action === 'replace') {
      stageMode ??= 'copy'
      if (!['copy', 'prepared'].includes(stageMode)) throw planError(`${item.finalName}: invalid stageMode`)
      if (stageMode === 'copy' && (item.source === null || typeof item.source !== 'object')) {
        throw planError(`${item.finalName}: copy staging requires a source proof`)
      }
      if (digestOf(item.after) === null) throw planError(`${item.finalName}: replace requires an after snapshot`)
    } else if (item.after !== undefined && item.after !== null) {
      throw planError(`${item.finalName}: remove must not declare an after snapshot`)
    }
    return { ...item, ...(stageMode === undefined ? {} : { stageMode }) }
  })

  return {
    root: plan.root,
    rootPath,
    rootFingerprint,
    workspace,
    journalPath: join(workspace, JOURNAL_FILE),
    items,
    kind: plan.kind ?? 'preset',
  }
}

function makeJournal(plan, checked, lock) {
  return {
    schemaVersion: TRANSACTION_SCHEMA_VERSION,
    type: 'preset-skill-directory-transaction',
    kind: checked.kind,
    batchId: plan.batchId,
    owner: plan.owner,
    state: 'PREPARING',
    createdAt: new Date().toISOString(),
    root: checked.rootFingerprint,
    lockEpochs: [lockEpoch(lock)],
    items: checked.items.map((item) => ({
      action: item.action,
      finalName: item.finalName,
      targetExisted: item.target.exists === true,
      beforeDigest: digestOf(item.before),
      afterDigest: digestOf(item.after),
      stageDigest: null,
      phase: 'PLANNED',
    })),
  }
}

async function rollbackJournal({ workspace, journalPath, journal, rootPath, fault }) {
  journal.state = 'ROLLBACK_INTENT'
  journal.rollbackStartedAt = new Date().toISOString()
  await persistJournal(journalPath, journal, undefined, {
    phase: 'ROLLBACK_INTENT', kind: 'intent',
  })

  for (let index = journal.items.length - 1; index >= 0; index -= 1) {
    const item = journal.items[index]
    await assertRootStillMatches({ path: rootPath }, journal.root)
    if (item.action === 'replace') {
      await rollbackReplace({ workspace, rootPath, rootFingerprint: journal.root, item, index, fault })
    } else {
      await rollbackRemove({ workspace, rootPath, rootFingerprint: journal.root, item, index, fault })
    }
    item.phase = 'ROLLED_BACK'
    await persistJournal(journalPath, journal, undefined, {
      phase: 'ROLLED_BACK_ITEM', kind: 'done', index,
    })
  }

  await verifyBeforeState(rootPath, journal.items)
  journal.state = 'ROLLED_BACK'
  journal.rolledBackAt = new Date().toISOString()
  await persistJournal(journalPath, journal, undefined, {
    phase: 'ROLLED_BACK', kind: 'done',
  })
  return { state: 'ROLLED_BACK', journal }
}

async function rollbackReplace({ workspace, rootPath, rootFingerprint, item, index, fault }) {
  const target = join(rootPath, item.finalName)
  const backup = backupPathFor(workspace, item.finalName)
  const stage = stagePathFor(workspace, item.finalName)
  const recoveredAfter = recoveryPathFor(workspace, index, item.finalName)
  const targetTree = await inspectOptionalTree(target)

  if (targetTree !== null && digestOf(targetTree) === item.afterDigest) {
    await assertAbsent(recoveredAfter)
    await hitFault(fault, 'rollback-rename', {
      timing: 'before', index, finalName: item.finalName, action: 'after-to-recovery',
    })
    const proof = await inspectExistingTree(target)
    assertDigest(proof, item.afterDigest, `rollback after ${item.finalName}`)
    await assertRootStillMatches({ path: rootPath }, rootFingerprint)
    await rename(target, recoveredAfter)
    await syncDirectories([dirname(target), dirname(recoveredAfter)], fault, {
      phase: 'ROLLBACK_AFTER', index, finalName: item.finalName,
    })
    await hitFault(fault, 'rollback-rename', {
      timing: 'after', index, finalName: item.finalName, action: 'after-to-recovery',
    })
  } else if (targetTree !== null && digestOf(targetTree) !== item.beforeDigest) {
    throw new Error(`${item.finalName}: target digest is neither before nor after during rollback`)
  }

  const targetAfterRemoval = await inspectOptionalTree(target)
  const backupNow = await inspectOptionalTree(backup)
  if (item.targetExisted) {
    const alreadyBefore = targetAfterRemoval !== null
      && digestOf(targetAfterRemoval) === item.beforeDigest
      && backupNow === null
    if (!alreadyBefore) {
      if (targetAfterRemoval !== null) throw new Error(`${item.finalName}: target is occupied before backup restore`)
      assertDigest(backupNow, item.beforeDigest, `rollback backup ${item.finalName}`)
      await hitFault(fault, 'rollback-rename', {
        timing: 'before', index, finalName: item.finalName, action: 'backup-to-target',
      })
      await assertRootStillMatches({ path: rootPath }, rootFingerprint)
      await assertAbsent(target)
      await rename(backup, target)
      await syncDirectories([dirname(backup), dirname(target)], fault, {
        phase: 'ROLLBACK_BEFORE', index, finalName: item.finalName,
      })
      await hitFault(fault, 'rollback-rename', {
        timing: 'after', index, finalName: item.finalName, action: 'backup-to-target',
      })
    }
  } else {
    if (targetAfterRemoval !== null) throw new Error(`${item.finalName}: newly-created target could not be removed by rename`)
  }

  // A copy/build can fail before its complete stage digest is recorded. Keep
  // that partial tree as evidence without confusing it with a promoted
  // after-image; once stageDigest is recorded, exact digest verification is
  // mandatory. Anything moved out of live into recovery is always an after-image.
  const retainedStage = await inspectOptionalTree(stage)
  if (retainedStage !== null && item.stageDigest !== null) {
    assertDigest(retainedStage, item.stageDigest, `retained stage ${item.finalName}`)
  }
  const retainedAfter = await inspectOptionalTree(recoveredAfter)
  if (retainedAfter !== null) assertDigest(retainedAfter, item.afterDigest, `retained after-image ${item.finalName}`)
}

async function rollbackRemove({ workspace, rootPath, rootFingerprint, item, index, fault }) {
  const target = join(rootPath, item.finalName)
  const quarantine = quarantinePathFor(workspace, item.finalName)
  const targetTree = await inspectOptionalTree(target)
  const quarantineTree = await inspectOptionalTree(quarantine)

  if (targetTree !== null) {
    assertDigest(targetTree, item.beforeDigest, `rollback target ${item.finalName}`)
    if (quarantineTree !== null) throw new Error(`${item.finalName}: target and quarantine both exist`)
    return
  }
  assertDigest(quarantineTree, item.beforeDigest, `rollback quarantine ${item.finalName}`)
  await hitFault(fault, 'rollback-rename', {
    timing: 'before', index, finalName: item.finalName, action: 'quarantine-to-target',
  })
  await assertRootStillMatches({ path: rootPath }, rootFingerprint)
  await assertAbsent(target)
  await rename(quarantine, target)
  await syncDirectories([dirname(quarantine), dirname(target)], fault, {
    phase: 'ROLLBACK_REMOVE', index, finalName: item.finalName,
  })
  await hitFault(fault, 'rollback-rename', {
    timing: 'after', index, finalName: item.finalName, action: 'quarantine-to-target',
  })
}

async function verifyAfterState(rootPath, items) {
  for (const item of items) {
    const target = join(rootPath, item.finalName)
    const tree = await inspectOptionalTree(target)
    if (item.action === 'remove') {
      if (tree !== null) throw new Error(`${item.finalName}: remove target still exists after commit`)
    } else {
      assertDigest(tree, digestOf(item.after), `after ${item.finalName}`)
    }
  }
}

async function verifyBeforeState(rootPath, items) {
  for (const item of items) {
    const tree = await inspectOptionalTree(join(rootPath, item.finalName))
    if (item.targetExisted) assertDigest(tree, item.beforeDigest, `restored before ${item.finalName}`)
    else if (tree !== null) throw new Error(`${item.finalName}: target should be absent after rollback`)
  }
}

async function persistJournal(journalPath, journal, fault, context) {
  await hitFault(fault, 'journal', { ...context, timing: 'before' })
  await atomicWriteJson(journalPath, journal, { mode: 0o600 })
  await hitFault(fault, 'journal', { ...context, timing: 'after' })
}

async function bestEffortJournal(journalPath, journal) {
  try { await atomicWriteJson(journalPath, journal, { mode: 0o600 }) } catch { /* preserve evidence already on disk */ }
}

async function syncDirectories(paths, fault, context) {
  const unique = [...new Set(paths.map((path) => resolve(path)))]
  await hitFault(fault, 'fsync', { ...context, timing: 'before', paths: unique })
  for (const path of unique) await Promise.resolve(fsyncDirectory(path))
  await hitFault(fault, 'fsync', { ...context, timing: 'after', paths: unique })
}

async function inspectExistingTree(path) {
  const tree = await inspectOptionalTree(path)
  if (tree === null) throw new Error(`expected directory is absent: ${path}`)
  return tree
}

async function inspectOptionalTree(path) {
  try {
    const meta = await lstat(path)
    if (meta.isSymbolicLink() || !meta.isDirectory()) throw new Error(`unsafe transaction path type: ${path}`)
    return await inspectTree(path)
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return null
    throw error
  }
}

async function revalidateTargetProof(proof) {
  if (proof === null || typeof proof !== 'object' || typeof proof.path !== 'string') {
    throw planError('path proof is invalid')
  }
  await revalidatePathSnapshot(proof.root.snapshot)
  if (proof.exists === true) {
    await revalidatePathSnapshot(proof.snapshot)
  } else {
    await assertAbsent(proof.path)
  }
}

async function assertAbsent(path) {
  try {
    await lstat(path)
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return
    throw error
  }
  throw new Error(`transaction destination already exists: ${path}`)
}

async function assertRootStillMatches(root, expected) {
  const current = await canonicalRoot(root.path)
  await assertRootFingerprint(current, expected)
}

async function assertRootFingerprint(root, expected) {
  const actual = await captureRootFingerprint(root, root.realPath ?? root.path)
  if (actual.path !== resolve(expected.path)
      || actual.dev !== String(expected.dev)
      || actual.ino !== String(expected.ino)
      || actual.parentPath !== resolve(expected.parentPath)
      || actual.parentDev !== String(expected.parentDev)
      || actual.parentIno !== String(expected.parentIno)) {
    throw new Error('root or its parent changed since preflight')
  }
}

async function assertWorkspaceSibling(rootPath, workspace, { mustExist }) {
  const canonicalRootPath = await realpath(rootPath)
  const requestedWorkspace = resolve(workspace)
  const canonicalParent = await realpath(dirname(requestedWorkspace))
  if (canonicalParent !== dirname(canonicalRootPath)) {
    throw planError('workspace must be a direct sibling of the canonical root')
  }
  const workspacePath = join(canonicalParent, basename(requestedWorkspace))
  if (workspacePath === canonicalRootPath || basename(workspacePath) === '') {
    throw planError('workspace must differ from the canonical root')
  }
  try {
    const meta = await lstat(workspacePath)
    if (!mustExist) throw planError('workspace already exists')
    if (meta.isSymbolicLink() || !meta.isDirectory()) throw planError('workspace must be a real directory')
    const actual = await realpath(workspacePath)
    if (actual !== workspacePath) throw planError('workspace canonical path differs from reconstructed sibling path')
    return workspacePath
  } catch (error) {
    if (errorCode(error) === 'ENOENT' && !mustExist) return workspacePath
    throw error
  }
}

async function captureRootFingerprint(root, fallbackPath) {
  const stat = root.snapshot ?? root.stat ?? root
  if (stat?.dev === undefined || stat?.ino === undefined) throw planError('root proof has no dev/ino identity')
  const path = resolve(root.path ?? root.realPath ?? fallbackPath)
  const canonicalPath = await realpath(path)
  if (canonicalPath !== path) throw planError('root proof path is not canonical')
  if (root.snapshot !== undefined) await revalidatePathSnapshot(root.snapshot)
  const parentPath = dirname(path)
  const canonicalParent = await realpath(parentPath)
  if (canonicalParent !== parentPath) throw planError('root parent path is not canonical')
  const parentStat = await lstat(parentPath)
  if (parentStat.isSymbolicLink() || !parentStat.isDirectory()) {
    throw planError('root parent must be a real directory')
  }
  return {
    path,
    dev: String(stat.dev),
    ino: String(stat.ino),
    parentPath,
    parentDev: String(parentStat.dev),
    parentIno: String(parentStat.ino),
  }
}

function lockEpoch(lock) {
  const token = String(lock.metadata?.lockId ?? '')
  return {
    owner: lock.metadata?.owner,
    pid: lock.metadata?.pid,
    startedAt: lock.metadata?.startedAt,
    batchId: lock.metadata?.owner?.batchId ?? null,
    tokenHash: createHash('sha256').update(token).digest('hex'),
    lockPath: lock.path,
    lockDev: String(lock.snapshot?.dev),
    lockIno: String(lock.snapshot?.ino),
  }
}

function digestOf(snapshot) {
  if (snapshot === null || snapshot === undefined) return null
  if (typeof snapshot.treeSha256 === 'string') return snapshot.treeSha256
  return typeof snapshot.digest === 'string' ? snapshot.digest : null
}

function assertDigest(snapshot, expected, label) {
  if (expected === null || snapshot === null || digestOf(snapshot) !== expected) {
    throw new Error(`${label} digest mismatch`)
  }
}

function stagePathFor(workspace, finalName) { return join(workspace, 'stage', finalName) }
function backupPathFor(workspace, finalName) { return join(workspace, 'backup', finalName) }
function quarantinePathFor(workspace, finalName) { return join(workspace, 'quarantine', finalName) }
function recoveryPathFor(workspace, index, finalName) { return join(workspace, 'recovery', `${String(index).padStart(4, '0')}-${finalName}`) }

async function hitFault(fault, point, context) {
  if (fault === undefined) return
  if (!TRANSACTION_FAULT_POINTS.includes(point)) throw new Error(`unknown transaction fault point: ${point}`)
  await fault(point, Object.freeze({ ...context }))
}

function errorIdentity(error) {
  return {
    name: error && typeof error === 'object' && 'name' in error && typeof error.name === 'string'
      ? error.name
      : 'Error',
    code: errorCode(error),
  }
}

function errorCode(error) {
  return error && typeof error === 'object' && 'code' in error
    ? String(error.code)
    : null
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

function planError(message) {
  return new DirectoryTransactionError(message, { code: 'INVALID_TRANSACTION_PLAN' })
}

function wrapFailure(error, details) {
  return new DirectoryTransactionError('directory transaction failed', {
    code: 'DIRECTORY_TRANSACTION_FAILED', cause: error, ...details,
  })
}

function jsonRoundTrip(value) {
  try { return JSON.parse(JSON.stringify(value)) } catch (error) {
    throw planError(`prepare evidence must be JSON-serializable: ${errorMessage(error)}`)
  }
}

async function readJournal(path) {
  let value
  try { value = JSON.parse(await readFile(path, 'utf8')) } catch (error) {
    throw new DirectoryTransactionError('transaction journal is unreadable', {
      code: 'INVALID_TRANSACTION_JOURNAL', cause: error, journalPath: path,
    })
  }
  return value
}

function validateJournalShape(journal) {
  if (journal?.schemaVersion !== TRANSACTION_SCHEMA_VERSION
      || journal?.type !== 'preset-skill-directory-transaction'
      || !SAFE_BATCH_ID.test(journal?.batchId ?? '')
      || !['preset', 'skill'].includes(journal?.kind)
      || typeof journal?.root?.path !== 'string'
      || typeof journal?.root?.dev !== 'string'
      || typeof journal?.root?.ino !== 'string'
      || typeof journal?.root?.parentPath !== 'string'
      || typeof journal?.root?.parentDev !== 'string'
      || typeof journal?.root?.parentIno !== 'string'
      || [journal?.root?.dev, journal?.root?.ino, journal?.root?.parentDev, journal?.root?.parentIno].includes('undefined')
      || !Array.isArray(journal?.items)
      || !Array.isArray(journal?.lockEpochs)) {
    throw new DirectoryTransactionError('transaction journal schema is invalid', {
      code: 'INVALID_TRANSACTION_JOURNAL',
    })
  }
  for (const item of journal.items) {
    if (!ACTIONS.has(item?.action)
        || typeof item?.finalName !== 'string'
        || typeof item?.targetExisted !== 'boolean'
        || (item.targetExisted && typeof item?.beforeDigest !== 'string')
        || (item.action === 'replace' && typeof item?.afterDigest !== 'string')) {
      throw new DirectoryTransactionError('transaction journal item is invalid', {
        code: 'INVALID_TRANSACTION_JOURNAL',
      })
    }
  }
}
