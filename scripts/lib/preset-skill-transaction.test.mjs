import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import {
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  acquireRootLock,
  canonicalRoot,
  copyTreeVerified,
  inspectTree,
  releaseRootLock,
  resolveContainedTarget,
} from './preset-skill-paths.mjs'
import {
  DirectoryTransactionError,
  executeDirectoryTransaction,
  recoverTransaction,
} from './preset-skill-transaction.mjs'
import { nodeCommand } from './real-node.mjs'

const temps = []

afterEach(() => {
  while (temps.length > 0) rmSync(temps.pop(), { recursive: true, force: true })
})

function makeTree(root, name, body, extra = '') {
  const directory = join(root, name)
  mkdirSync(directory)
  mkdirSync(join(directory, 'empty'))
  writeFileSync(join(directory, 'value.txt'), `${body}\n`)
  if (extra !== '') {
    mkdirSync(join(directory, 'resources'))
    writeFileSync(join(directory, 'resources', 'extra.txt'), `${extra}\n`)
  }
  return directory
}

function fixture(label = 'batch') {
  const base = mkdtempSync(join(tmpdir(), 'preset-skill-transaction-'))
  temps.push(base)
  const live = join(base, 'live')
  const sources = join(base, 'sources')
  mkdirSync(live)
  mkdirSync(sources)
  makeTree(live, 'alpha', 'old-alpha', 'old-alpha-resource')
  makeTree(live, 'beta', 'old-beta')
  makeTree(live, 'gamma', 'old-gamma')
  makeTree(sources, 'alpha-new', 'new-alpha', 'new-alpha-resource')
  makeTree(sources, 'gamma-new', 'new-gamma')
  makeTree(sources, 'delta-new', 'new-delta')
  const outsideCanary = join(base, 'outside-canary.txt')
  writeFileSync(outsideCanary, 'outside-must-not-change\n')

  const root = canonicalRoot(live)
  const sourceRoot = canonicalRoot(sources)
  const target = (name) => resolveContainedTarget(root, name, { mustExist: true })
  const source = (name) => resolveContainedTarget(sourceRoot, name, { mustExist: true })
  const alpha = target('alpha')
  const beta = target('beta')
  const gamma = target('gamma')
  const delta = resolveContainedTarget(root, 'delta', { mustExist: false })
  const alphaSource = source('alpha-new')
  const gammaSource = source('gamma-new')
  const deltaSource = source('delta-new')
  const items = [
    {
      action: 'replace', finalName: 'alpha', target: alpha,
      before: inspectTree(alpha.path), source: alphaSource, after: inspectTree(alphaSource.path),
    },
    {
      action: 'remove', finalName: 'beta', target: beta,
      before: inspectTree(beta.path), after: null,
    },
    {
      action: 'replace', finalName: 'gamma', target: gamma,
      before: inspectTree(gamma.path), source: gammaSource, after: inspectTree(gammaSource.path),
    },
    {
      action: 'replace', finalName: 'delta', target: delta,
      before: null, source: deltaSource, after: inspectTree(deltaSource.path),
    },
  ]
  // Keep the caller's lexical tmpdir path. On macOS this commonly traverses
  // /var -> /private/var; the transaction must reconstruct and return the
  // canonical sibling path rather than rejecting a safe alias.
  const workspace = join(base, `.live-transaction-${label}`)
  return {
    base,
    live,
    sources,
    outsideCanary,
    root,
    workspace,
    items,
    plan: {
      kind: 'preset',
      batchId: label,
      owner: 'transaction-test',
      root,
      workspace,
      items,
    },
  }
}

function text(path) { return readFileSync(path, 'utf8') }
function valueAt(root, name) { return text(join(root, name, 'value.txt')) }

function assertBefore(state) {
  assert.equal(valueAt(state.live, 'alpha'), 'old-alpha\n')
  assert.equal(valueAt(state.live, 'beta'), 'old-beta\n')
  assert.equal(valueAt(state.live, 'gamma'), 'old-gamma\n')
  assert.equal(existsSync(join(state.live, 'delta')), false)
  assert.equal(text(state.outsideCanary), 'outside-must-not-change\n')
}

function assertAfter(state) {
  assert.equal(valueAt(state.live, 'alpha'), 'new-alpha\n')
  assert.equal(existsSync(join(state.live, 'beta')), false)
  assert.equal(valueAt(state.live, 'gamma'), 'new-gamma\n')
  assert.equal(valueAt(state.live, 'delta'), 'new-delta\n')
  assert.equal(text(state.outsideCanary), 'outside-must-not-change\n')
}

function oneShotFault(matches, code = 'INJECTED_FAULT') {
  let fired = 0
  const hook = async (point, context) => {
    if (fired === 0 && matches(point, context)) {
      fired += 1
      const error = new Error(`injected ${point}`)
      error.code = code
      throw error
    }
  }
  hook.count = () => fired
  return hook
}

function isRolledBackFailure(error) {
  assert.ok(error instanceof DirectoryTransactionError)
  assert.equal(error.code, 'DIRECTORY_TRANSACTION_FAILED')
  assert.equal(error.rollback, 'ROLLED_BACK')
  return true
}

test('合法多项：同一锁内 prepare archive/stage，commit 保留证据，显式 recovery 恢复完整 before', async () => {
  const state = fixture('prepare-and-recover')
  const preparedItems = state.items.map((item) => item.action === 'replace'
    ? { ...item, stageMode: 'prepared' }
    : item)
  const plan = { ...state.plan, items: preparedItems }
  let lockObserved = false

  const result = await executeDirectoryTransaction(plan, {
    prepare({ stageDir, archiveDir, items }) {
      lockObserved = lstatSync(join(state.live, '.preset-skill-transaction.lock')).isFile()
      const archiveDigests = {}
      for (const item of items) {
        if (item.action === 'replace') {
          copyTreeVerified(item.source.path, join(stageDir, item.finalName), {
            expectedManifest: item.after,
          })
        } else {
          const archived = copyTreeVerified(item.target.path, join(archiveDir, item.finalName), {
            expectedManifest: item.before,
          })
          archiveDigests[item.finalName] = archived.treeSha256
        }
      }
      return { archiveDigests }
    },
  })

  assert.equal(lockObserved, true)
  assert.equal(result.state, 'COMMITTED')
  assert.equal(result.workspace, join(dirname(state.root.path), '.live-transaction-prepare-and-recover'))
  assertAfter(state)
  assert.equal(existsSync(join(state.workspace, 'backup', 'alpha')), true)
  assert.equal(existsSync(join(state.workspace, 'quarantine', 'beta')), true)
  assert.equal(existsSync(join(state.workspace, 'archive', 'beta')), true)
  assert.equal(result.journal.prepareEvidence.archiveDigests.beta, state.items[1].before.treeSha256)
  assert.match(result.journal.lockEpochs[0].tokenHash, /^[a-f0-9]{64}$/u)
  assert.match(result.journal.root.parentDev, /^\d+$/u)
  assert.match(result.journal.root.parentIno, /^\d+$/u)
  assert.notEqual(result.journal.root.parentDev, 'undefined')
  assert.notEqual(result.journal.root.parentIno, 'undefined')
  assert.equal(JSON.stringify(result.journal).includes('old-alpha-resource'), false)
  assert.equal(existsSync(join(state.live, '.preset-skill-transaction.lock')), false)

  const recovered = await recoverTransaction(state.workspace, { mode: 'rollback', owner: 'recovery-test' })
  assert.equal(recovered.state, 'ROLLED_BACK')
  assertBefore(state)
  assert.equal(existsSync(join(state.workspace, 'recovery', '0000-alpha')), true)
  assert.equal(existsSync(join(state.workspace, 'recovery', '0003-delta')), true)
  assert.equal(existsSync(join(state.live, '.preset-skill-transaction.lock')), false)
})

test('copy/fsync/journal/old rename/new rename/close fault：任一后项失败都恢复完整 before', async (t) => {
  const cases = [
    ['later-copy', (point, c) => point === 'copy' && c.timing === 'after' && c.index === 2, 'ENOSPC'],
    ['later-fsync', (point, c) => point === 'fsync' && c.timing === 'after' && c.phase === 'STAGED' && c.index === 2, 'EIO'],
    ['journal-after-prefix', (point, c) => point === 'journal' && c.timing === 'after' && c.phase === 'BACKUP_INTENT' && c.index === 1, 'EACCES'],
    ['old-rename-after-prefix', (point, c) => point === 'old-rename' && c.timing === 'after' && c.index === 1, 'EIO'],
    ['new-rename-late', (point, c) => point === 'new-rename' && c.timing === 'after' && c.index === 2, 'EIO'],
    ['journal-close', (point, c) => point === 'close' && c.timing === 'before', 'EIO'],
  ]

  for (const [label, matches, code] of cases) {
    await t.test(label, async () => {
      const state = fixture(label)
      const fault = oneShotFault(matches, code)
      await assert.rejects(
        executeDirectoryTransaction(state.plan, { fault }),
        isRolledBackFailure,
      )
      assert.equal(fault.count(), 1)
      assertBefore(state)
      assert.equal(existsSync(join(state.live, '.preset-skill-transaction.lock')), false)
      const journal = JSON.parse(text(join(state.workspace, 'journal.json')))
      assert.equal(journal.state, 'ROLLED_BACK')
    })
  }
})

test('全批 preflight：后项非法时零 workspace、零 lock、零 live mutation', async () => {
  const state = fixture('preflight-zero-write')
  const invalidPlan = {
    ...state.plan,
    items: state.items.map((item, index) => index === 2 ? { ...item, action: 'unsupported' } : item),
  }

  await assert.rejects(
    executeDirectoryTransaction(invalidPlan),
    (error) => error instanceof DirectoryTransactionError
      && error.code === 'INVALID_TRANSACTION_PLAN',
  )
  assertBefore(state)
  assert.equal(existsSync(state.workspace), false)
  assert.equal(existsSync(join(state.root.path, '.preset-skill-transaction.lock')), false)
})

test('prepare/stage 在 live rename 前失败：保留 partial evidence 但仍证明完整 before', async () => {
  const state = fixture('partial-stage-evidence')
  const plan = {
    ...state.plan,
    items: state.items.map((item) => item.action === 'replace'
      ? { ...item, stageMode: 'prepared' }
      : item),
  }

  await assert.rejects(
    executeDirectoryTransaction(plan, {
      prepare({ stageDir }) {
        mkdirSync(join(stageDir, 'alpha'))
        writeFileSync(join(stageDir, 'alpha', 'partial.txt'), 'incomplete-stage\n')
      },
    }),
    isRolledBackFailure,
  )
  assertBefore(state)
  assert.equal(text(join(state.workspace, 'stage', 'alpha', 'partial.txt')), 'incomplete-stage\n')
  assert.equal(JSON.parse(text(join(state.workspace, 'journal.json'))).state, 'ROLLED_BACK')
  assert.equal(existsSync(join(state.live, '.preset-skill-transaction.lock')), false)
})

test('并发 owner：已有锁时第二批 fail-fast、零 live mutation，且不会自动回收锁', async () => {
  const state = fixture('lock-conflict')
  const first = acquireRootLock(state.root, { owner: { name: 'first-owner', batchId: 'first' } })
  const lockBytes = text(first.path)

  await assert.rejects(
    executeDirectoryTransaction(state.plan),
    (error) => {
      assert.ok(error instanceof DirectoryTransactionError)
      assert.equal(error.rollback, 'not-started')
      return true
    },
  )
  assertBefore(state)
  assert.equal(existsSync(state.workspace), false)
  assert.equal(text(first.path), lockBytes)
  releaseRootLock(first)
})

test('recovery 遇到另一 owner/stale lock：不改 journal、不改 live、不自动 unlink', async () => {
  const state = fixture('recovery-lock-conflict')
  await executeDirectoryTransaction(state.plan)
  assertAfter(state)
  const journalPath = join(state.workspace, 'journal.json')
  const journalBefore = text(journalPath)
  const blocker = acquireRootLock(state.root, { owner: { name: 'blocker', batchId: 'other' } })
  const lockBefore = text(blocker.path)

  await assert.rejects(
    recoverTransaction(state.workspace, { mode: 'rollback' }),
    (error) => error instanceof DirectoryTransactionError
      && error.code === 'RECOVERY_LOCK_UNAVAILABLE'
      && error.lockRetained === true,
  )
  assertAfter(state)
  assert.equal(text(journalPath), journalBefore)
  assert.equal(text(blocker.path), lockBefore)
  releaseRootLock(blocker)

  const recovered = await recoverTransaction(state.workspace, { mode: 'rollback' })
  assert.equal(recovered.state, 'ROLLED_BACK')
  assertBefore(state)
})

test('显式 orphan adoption：仅 journal 匹配且 owner pid 已退出时接管 stale lock 后恢复', async () => {
  const state = fixture('orphan-adoption')
  await executeDirectoryTransaction(state.plan)
  assertAfter(state)

  const orphan = acquireRootLock(state.root, {
    owner: { name: 'crashed-owner', batchId: state.plan.batchId },
  })
  const tokenHash = createHash('sha256').update(orphan.metadata.lockId).digest('hex')
  closeSync(orphan.fd)
  orphan.released = true
  writeFileSync(orphan.path, `${JSON.stringify({ ...orphan.metadata, pid: 2147483647 }, null, 2)}\n`)
  const journalPath = join(state.workspace, 'journal.json')
  const journal = JSON.parse(text(journalPath))
  journal.lockEpochs.push({
    owner: orphan.metadata.owner,
    pid: 2147483647,
    startedAt: orphan.metadata.startedAt,
    batchId: state.plan.batchId,
    tokenHash,
    lockPath: orphan.path,
    lockDev: orphan.snapshot.dev,
    lockIno: orphan.snapshot.ino,
  })
  writeFileSync(journalPath, `${JSON.stringify(journal, null, 2)}\n`)

  await assert.rejects(
    recoverTransaction(state.workspace, { mode: 'rollback' }),
    (error) => error?.code === 'RECOVERY_LOCK_UNAVAILABLE',
  )
  const recovered = await recoverTransaction(state.workspace, {
    mode: 'rollback',
    adoptOrphanLock: true,
    owner: 'explicit-recovery-test',
  })
  assert.equal(recovered.state, 'ROLLED_BACK')
  assert.equal(recovered.journal.adoptedLocks.length, 1)
  assert.equal(recovered.journal.adoptedLocks[0].tokenHash, tokenHash)
  assertBefore(state)
  assert.equal(existsSync(orphan.path), false)
})

test('真实子进程在 rename 后硬退出：保留 stale lock/journal，显式 adoption 恢复完整 before', async () => {
  const state = fixture('hard-exit-recovery')
  const transactionUrl = new URL('./preset-skill-transaction.mjs', import.meta.url).href
  const pathsUrl = new URL('./preset-skill-paths.mjs', import.meta.url).href
  const program = `
    import { executeDirectoryTransaction } from ${JSON.stringify(transactionUrl)}
    import { canonicalRoot, inspectTree, resolveContainedTarget } from ${JSON.stringify(pathsUrl)}
    const [rootPath, workspace] = process.argv.slice(1)
    const root = canonicalRoot(rootPath)
    const target = resolveContainedTarget(root, 'beta', { mustExist: true })
    await executeDirectoryTransaction({
      kind: 'preset', batchId: 'hard-exit-recovery', owner: 'crashing-child', root, workspace,
      items: [{ action: 'remove', finalName: 'beta', target, before: inspectTree(target.path), after: null }],
    }, {
      fault(point, context) {
        if (point === 'old-rename' && context.timing === 'after') process.exit(86)
      },
    })
  `
  const { command, env } = nodeCommand()
  const child = spawnSync(command, [
    '--input-type=module', '-e', program, state.root.path, state.workspace,
  ], { encoding: 'utf8', env })
  assert.equal(child.status, 86, `${child.stdout}\n${child.stderr}`)
  assert.equal(existsSync(join(state.live, 'beta')), false)
  assert.equal(existsSync(join(state.live, '.preset-skill-transaction.lock')), true)
  assert.equal(existsSync(join(state.workspace, 'journal.json')), true)

  await assert.rejects(
    recoverTransaction(state.workspace, { mode: 'rollback' }),
    (error) => error?.code === 'RECOVERY_LOCK_UNAVAILABLE',
  )
  const recovered = await recoverTransaction(state.workspace, {
    mode: 'rollback', adoptOrphanLock: true, owner: 'hard-exit-recovery-test',
  })
  assert.equal(recovered.state, 'ROLLED_BACK')
  assertBefore(state)
  assert.equal(existsSync(join(state.live, '.preset-skill-transaction.lock')), false)
})

test('rollback 中途失败：停止后续动作并保留 lock/journal/backup/quarantine 供人工恢复', async () => {
  const state = fixture('rollback-interrupted')
  let commitFailed = false
  let rollbackFailed = false
  await assert.rejects(executeDirectoryTransaction(state.plan, {
    fault(point, context) {
      if (!commitFailed && point === 'new-rename' && context.timing === 'after' && context.index === 2) {
        commitFailed = true
        const error = new Error('injected commit EIO')
        error.code = 'EIO'
        throw error
      }
      if (commitFailed && !rollbackFailed && point === 'rollback-rename' && context.timing === 'before') {
        rollbackFailed = true
        const error = new Error('injected rollback EACCES')
        error.code = 'EACCES'
        throw error
      }
    },
  }), (error) => error instanceof DirectoryTransactionError
      && error.code === 'MANUAL_RECOVERY_REQUIRED'
      && error.lockRetained === true)
  assert.equal(commitFailed, true)
  assert.equal(rollbackFailed, true)
  const journal = JSON.parse(text(join(state.workspace, 'journal.json')))
  assert.equal(journal.state, 'MANUAL_RECOVERY_REQUIRED')
  assert.equal(existsSync(join(state.live, '.preset-skill-transaction.lock')), true)
  assert.equal(existsSync(join(state.workspace, 'backup', 'alpha')), true)
  assert.equal(existsSync(join(state.workspace, 'quarantine', 'beta')), true)
  assert.equal(text(state.outsideCanary), 'outside-must-not-change\n')
})

test('preflight 后 target 被换成 symlink：rename 前中止且根外目录逐字不变', async () => {
  const state = fixture('target-symlink-race')
  const outside = join(state.base, 'outside-tree')
  mkdirSync(outside)
  writeFileSync(join(outside, 'canary.txt'), 'outside-tree-unchanged\n')
  renameSync(join(state.live, 'beta'), join(state.base, 'held-beta'))
  symlinkSync(outside, join(state.live, 'beta'), 'dir')

  await assert.rejects(
    executeDirectoryTransaction(state.plan),
    (error) => error instanceof DirectoryTransactionError
      && error.code === 'MANUAL_RECOVERY_REQUIRED'
      && error.lockRetained === true,
  )
  assert.equal(text(join(outside, 'canary.txt')), 'outside-tree-unchanged\n')
  assert.equal(existsSync(join(state.workspace, 'quarantine', 'beta')), false)
  assert.equal(existsSync(join(state.live, '.preset-skill-transaction.lock')), true)
})

test('两个真实进程争同一 root：持锁批提交，第二批 fail-fast 且无 workspace/部分副作用', async () => {
  const state = fixture('two-process-lock')
  const ready = join(state.base, 'owner-ready')
  const release = join(state.base, 'owner-release')
  const transactionUrl = new URL('./preset-skill-transaction.mjs', import.meta.url).href
  const pathsUrl = new URL('./preset-skill-paths.mjs', import.meta.url).href
  const program = `
    import { existsSync, writeFileSync } from 'node:fs'
    import { executeDirectoryTransaction } from ${JSON.stringify(transactionUrl)}
    import { canonicalRoot, inspectTree, resolveContainedTarget } from ${JSON.stringify(pathsUrl)}
    const [rootPath, workspace, ready, release] = process.argv.slice(1)
    const root = canonicalRoot(rootPath)
    const target = resolveContainedTarget(root, 'beta', { mustExist: true })
    await executeDirectoryTransaction({
      kind: 'preset', batchId: 'two-process-owner', owner: 'owner-child', root, workspace,
      items: [{ action: 'remove', finalName: 'beta', target, before: inspectTree(target.path), after: null }],
    }, {
      async prepare() {
        writeFileSync(ready, 'ready\\n')
        while (!existsSync(release)) await new Promise((resolve) => setTimeout(resolve, 10))
      },
    })
  `
  const { command, env } = nodeCommand()
  const child = spawn(command, [
    '--input-type=module', '-e', program, state.root.path, state.workspace, ready, release,
  ], { stdio: ['ignore', 'pipe', 'pipe'], env })
  const waitUntil = async (predicate, timeoutMs = 3000) => {
    const deadline = Date.now() + timeoutMs
    while (!predicate()) {
      if (Date.now() >= deadline) throw new Error('timed out waiting for child lock owner')
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
  }
  await waitUntil(() => existsSync(ready))

  const secondWorkspace = join(state.base, '.second-batch')
  await assert.rejects(
    executeDirectoryTransaction({ ...state.plan, batchId: 'two-process-contender', workspace: secondWorkspace }),
    (error) => error instanceof DirectoryTransactionError && error.rollback === 'not-started',
  )
  assert.equal(existsSync(secondWorkspace), false)
  assertBefore(state)

  writeFileSync(release, 'release\n')
  const outcome = await new Promise((resolve, reject) => {
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.once('error', reject)
    child.once('close', (code, signal) => resolve({ code, signal, stdout, stderr }))
  })
  assert.equal(outcome.code, 0, `${outcome.stdout}\n${outcome.stderr}`)
  assert.equal(existsSync(join(state.live, 'beta')), false)
  assert.equal(valueAt(state.live, 'alpha'), 'old-alpha\n')
  assert.equal(valueAt(state.live, 'gamma'), 'old-gamma\n')
  assert.equal(text(state.outsideCanary), 'outside-must-not-change\n')
})
