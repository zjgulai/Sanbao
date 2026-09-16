import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test, { afterEach } from 'node:test'

import {
  buildRemovalPlan,
  executeRemovalPlan,
  parseRemoveArgs,
  runRemoveCli,
} from '../role-presets/remove-preset.mjs'
import {
  buildRestorePlan,
  executeRestorePlan,
  parseRestoreArgs,
} from '../role-presets/restore-presets.mjs'
import { runRecoveryCli } from '../role-presets/recover-preset-transaction.mjs'

const temps = []

afterEach(() => {
  while (temps.length > 0) rmSync(temps.pop(), { recursive: true, force: true })
})

function fixture() {
  const base = mkdtempSync(join(tmpdir(), 'preset-maintenance-'))
  temps.push(base)
  const userRoot = join(base, 'agent-presets')
  const sessionsRoot = join(base, 'sessions')
  mkdirSync(userRoot)
  mkdirSync(sessionsRoot)
  for (const [id, value] of [['alpha', 'old-alpha'], ['beta', 'old-beta']]) {
    mkdirSync(join(userRoot, id, 'resources'), { recursive: true })
    writeFileSync(join(userRoot, id, 'preset.yml'), `${value}\n`)
    writeFileSync(join(userRoot, id, 'resources', 'keep.txt'), `resource-${id}\n`)
  }
  const outside = join(base, 'outside-canary.txt')
  writeFileSync(outside, 'outside-unchanged\n')
  return { base, userRoot, sessionsRoot, outside }
}

function cleanSessions() {
  return {
    scanned: 2,
    byPreset: new Map(),
  }
}

function removalOptions(fx, extra = []) {
  const parsed = parseRemoveArgs(['--ids', 'alpha,beta', '--apply', ...extra])
  return { ...parsed, userRoot: fx.userRoot, sessionsRoot: fx.sessionsRoot }
}

test('多项 remove 完整归档并只 rename 到 quarantine；随后 transaction restore 保真恢复', async () => {
  const fx = fixture()
  const removal = await buildRemovalPlan(removalOptions(fx), {
    scanSessions: async () => cleanSessions(),
    batchId: 'remove-roundtrip',
  })
  const removed = await executeRemovalPlan(removal)

  assert.equal(removed.state, 'COMMITTED')
  assert.equal(existsSync(join(fx.userRoot, 'alpha')), false)
  assert.equal(existsSync(join(fx.userRoot, 'beta')), false)
  assert.equal(readFileSync(join(removed.workspace, 'archive', 'alpha', 'preset.yml'), 'utf8'), 'old-alpha\n')
  assert.equal(readFileSync(join(removed.workspace, 'quarantine', 'beta', 'preset.yml'), 'utf8'), 'old-beta\n')
  const manifest = JSON.parse(readFileSync(join(removed.workspace, 'MANIFEST.json'), 'utf8'))
  assert.deepEqual(manifest.items.map((item) => item.id), ['alpha', 'beta'])

  const restoreOptions = {
    ...parseRestoreArgs(['--from', removed.workspace, '--ids', 'alpha,beta', '--apply']),
    userRoot: fx.userRoot,
  }
  const restore = await buildRestorePlan(restoreOptions, { batchId: 'restore-roundtrip' })
  const restored = await executeRestorePlan(restore)
  assert.equal(restored.state, 'COMMITTED')
  assert.equal(readFileSync(join(fx.userRoot, 'alpha', 'resources', 'keep.txt'), 'utf8'), 'resource-alpha\n')
  assert.equal(readFileSync(join(fx.userRoot, 'beta', 'preset.yml'), 'utf8'), 'old-beta\n')
  assert.equal(readFileSync(fx.outside, 'utf8'), 'outside-unchanged\n')
})

test('默认 dry-run：全批预检后仍不创建 transaction workspace、不改 live', async () => {
  const fx = fixture()
  let output = ''
  const result = await runRemoveCli([
    '--ids', 'alpha,beta',
    '--user-root', fx.userRoot,
    '--sessions', fx.sessionsRoot,
    '--archive-root', join(fx.base, 'dry-evidence'),
    '--json',
  ], {
    scanSessions: async () => cleanSessions(),
    batchId: 'dry-plan',
    stdout: (text) => { output = text },
  })
  assert.equal(result.dryRun, true)
  assert.equal(JSON.parse(output).items.length, 2)
  assert.equal(existsSync(join(fx.base, 'dry-evidence')), false)
  assert.equal(readFileSync(join(fx.userRoot, 'alpha', 'preset.yml'), 'utf8'), 'old-alpha\n')
})

test('同尺寸 archive 篡改由 SHA-256 拒绝，target 保持不存在', async () => {
  const fx = fixture()
  const removal = await buildRemovalPlan(removalOptions(fx), {
    scanSessions: async () => cleanSessions(), batchId: 'tamper-remove',
  })
  const removed = await executeRemovalPlan(removal)
  const archived = join(removed.workspace, 'archive', 'alpha', 'preset.yml')
  writeFileSync(archived, 'bad-alpha\n')
  assert.equal(Buffer.byteLength('bad-alpha\n'), Buffer.byteLength('old-alpha\n'))

  await assert.rejects(
    buildRestorePlan({
      ...parseRestoreArgs(['--from', removed.workspace, '--ids', 'alpha']),
      userRoot: fx.userRoot,
    }),
    (error) => error?.code === 'ARCHIVE_DIGEST_MISMATCH',
  )
  assert.equal(existsSync(join(fx.userRoot, 'alpha')), false)
  assert.equal(readFileSync(fx.outside, 'utf8'), 'outside-unchanged\n')
})

test('后项 old-rename fault 自动逆序回滚完整 before', async () => {
  const fx = fixture()
  const removal = await buildRemovalPlan(removalOptions(fx), {
    scanSessions: async () => cleanSessions(), batchId: 'remove-rollback',
  })
  let fired = false
  await assert.rejects(executeRemovalPlan(removal, {
    fault(point, context) {
      if (!fired && point === 'old-rename' && context.timing === 'after' && context.index === 1) {
        fired = true
        throw new Error('injected later remove failure')
      }
    },
  }), (error) => error?.rollback === 'ROLLED_BACK')
  assert.equal(fired, true)
  assert.equal(readFileSync(join(fx.userRoot, 'alpha', 'preset.yml'), 'utf8'), 'old-alpha\n')
  assert.equal(readFileSync(join(fx.userRoot, 'beta', 'preset.yml'), 'utf8'), 'old-beta\n')
  assert.equal(readFileSync(fx.outside, 'utf8'), 'outside-unchanged\n')
})

test('recovery CLI 默认只查看，显式 --rollback --apply 才恢复 before', async () => {
  const fx = fixture()
  const removal = await buildRemovalPlan(removalOptions(fx), {
    scanSessions: async () => cleanSessions(), batchId: 'recovery-cli',
  })
  const removed = await executeRemovalPlan(removal)
  let preview = ''
  const dry = await runRecoveryCli(['--from', removed.workspace, '--rollback', '--json'], {
    stdout: (text) => { preview = text },
  })
  assert.equal(dry.dryRun, true)
  assert.equal(JSON.parse(preview).state, 'COMMITTED')
  assert.equal(existsSync(join(fx.userRoot, 'alpha')), false)

  const recovered = await runRecoveryCli(['--from', removed.workspace, '--rollback', '--apply'])
  assert.equal(recovered.state, 'ROLLED_BACK')
  assert.equal(readFileSync(join(fx.userRoot, 'alpha', 'preset.yml'), 'utf8'), 'old-alpha\n')
  assert.equal(readFileSync(join(fx.userRoot, 'beta', 'preset.yml'), 'utf8'), 'old-beta\n')
})

test('traversal 在 session scan/lock/workspace 前拒绝；--force 也不能绕过零会话', async () => {
  const fx = fixture()
  let scans = 0
  await assert.rejects(buildRemovalPlan({
    ...parseRemoveArgs(['--ids', '..', '--apply']),
    userRoot: fx.userRoot,
    sessionsRoot: fx.sessionsRoot,
  }, {
    scanSessions: async () => { scans += 1; return cleanSessions() },
  }))
  assert.equal(scans, 0)

  await assert.rejects(buildRemovalPlan({
    ...parseRemoveArgs(['--ids', 'alpha', '--apply', '--force']),
    userRoot: fx.userRoot,
    sessionsRoot: fx.sessionsRoot,
  }, {
    scanSessions: async () => ({ scanned: 0, byPreset: new Map() }),
  }), (error) => error?.code === 'SESSION_SCAN_EMPTY')
  assert.equal(readFileSync(join(fx.userRoot, 'alpha', 'preset.yml'), 'utf8'), 'old-alpha\n')
  assert.equal(readFileSync(fx.outside, 'utf8'), 'outside-unchanged\n')
})

test('--force 只接受已知 session reference；同一 plan 的路径/digest 门不变', async () => {
  const fx = fixture()
  const referenced = {
    scanned: 1,
    byPreset: new Map([['alpha', [{
      session: 'session-one', records: 5, userMessages: 2, bytes: 100,
    }]]]),
  }
  await assert.rejects(buildRemovalPlan({
    ...parseRemoveArgs(['--ids', 'alpha']),
    userRoot: fx.userRoot,
    sessionsRoot: fx.sessionsRoot,
  }, { scanSessions: async () => referenced }), (error) => error?.code === 'PRESET_REFERENCED')

  const forced = await buildRemovalPlan({
    ...parseRemoveArgs(['--ids', 'alpha', '--force']),
    userRoot: fx.userRoot,
    sessionsRoot: fx.sessionsRoot,
  }, { scanSessions: async () => referenced, batchId: 'known-reference-force' })
  assert.equal(forced.affected.length, 1)
  assert.match(forced.items[0].before.treeSha256, /^[a-f0-9]{64}$/u)
  assert.equal(existsSync(forced.workspace), false)
  assert.equal(readFileSync(join(fx.userRoot, 'alpha', 'preset.yml'), 'utf8'), 'old-alpha\n')
})
