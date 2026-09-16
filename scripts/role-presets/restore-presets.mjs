#!/usr/bin/env node
/** Restore presets from a SEC-RT-003A SHA-256 archive transaction. */
import { randomBytes } from 'node:crypto'
import { accessSync, constants, existsSync, readFileSync, statfsSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  DEFAULT_SESSIONS_ROOT,
  DEFAULT_SHIPPED_ROOT,
  DEFAULT_USER_PRESET_ROOT,
  resolveRoster,
  scanSessions,
} from './session-refs.mjs'
import {
  canonicalRoot,
  inspectTree,
  resolveContainedTarget,
  revalidatePathSnapshot,
  snapshotPath,
  validateFinalNames,
} from '../lib/preset-skill-paths.mjs'
import { executeDirectoryTransaction } from '../lib/preset-skill-transaction.mjs'

export class PresetRestoreError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'PresetRestoreError'
    this.code = code
    this.details = details
  }
}

function fail(code, message, details) {
  throw new PresetRestoreError(code, message, details)
}

export function parseRestoreArgs(argv) {
  const options = {
    from: null,
    ids: null,
    referenced: false,
    skipExisting: false,
    apply: false,
    dryRun: true,
    json: false,
    userRoot: DEFAULT_USER_PRESET_ROOT,
    sessionsRoot: DEFAULT_SESSIONS_ROOT,
    shippedRoot: process.env.ROLE_SHIPPED_PRESET_ROOT ?? DEFAULT_SHIPPED_ROOT,
  }
  let sawMode = false
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--from' || arg === '--user-root' || arg === '--sessions' || arg === '--shipped-root') {
      const value = argv[++i]
      if (!value || value.startsWith('--')) fail('CLI_VALUE_MISSING', `${arg} 缺值`)
      if (arg === '--from') options.from = value
      else if (arg === '--user-root') options.userRoot = value
      else if (arg === '--sessions') options.sessionsRoot = value
      else options.shippedRoot = value
    } else if (arg === '--ids') {
      if (options.ids !== null) fail('CLI_IDS_DUPLICATE', '--ids 不得重复')
      const raw = argv[++i]
      if (!raw || raw.startsWith('--')) fail('CLI_IDS_MISSING', '--ids 缺值')
      options.ids = raw.split(',').map((value) => value.trim())
      if (options.ids.some((value) => value === '')) fail('CLI_IDS_EMPTY', '--ids 不得含空项')
    } else if (arg === '--referenced') {
      if (options.referenced) fail('CLI_REFERENCED_DUPLICATE', '--referenced 不得重复')
      options.referenced = true
    } else if (arg === '--skip-existing') {
      if (options.skipExisting) fail('CLI_SKIP_DUPLICATE', '--skip-existing 不得重复')
      options.skipExisting = true
    } else if (arg === '--apply') {
      if (sawMode) fail('CLI_MODE_DUPLICATE', '只能指定一次 --apply/--dry-run')
      options.apply = true
      options.dryRun = false
      sawMode = true
    } else if (arg === '--dry-run') {
      if (sawMode) fail('CLI_MODE_DUPLICATE', '只能指定一次 --apply/--dry-run')
      sawMode = true
    } else if (arg === '--json') {
      if (options.json) fail('CLI_JSON_DUPLICATE', '--json 不得重复')
      options.json = true
    } else if (arg === '--help' || arg === '-h') {
      options.help = true
    } else {
      fail('CLI_UNKNOWN', `未知参数：${arg}`)
    }
  }
  if (!options.help) {
    if (!options.from) fail('CLI_FROM_MISSING', '必须给 --from <transaction root>')
    if ((options.ids === null) === !options.referenced) {
      fail('CLI_SCOPE', '必须且只能给 --ids 或 --referenced 之一')
    }
  }
  return options
}

function usage() {
  return `用法：
  node scripts/role-presets/restore-presets.mjs --from <transaction-root> --ids a,b [--dry-run]
  node scripts/role-presets/restore-presets.mjs --from <transaction-root> --referenced --apply

只接受带 MANIFEST.json 的 SEC-RT-003A archive；默认 dry-run。`
}

function parseArchiveManifest(fromRoot) {
  const pathname = join(fromRoot.path, 'MANIFEST.json')
  if (!existsSync(pathname)) fail('ARCHIVE_MANIFEST_MISSING', `归档缺 MANIFEST.json：${pathname}`)
  const before = snapshotPath(pathname)
  if (before.type !== 'file') fail('ARCHIVE_MANIFEST_TYPE', 'MANIFEST.json 必须是普通文件')
  let value
  try { value = JSON.parse(readFileSync(pathname, 'utf8')) } catch (error) {
    fail('ARCHIVE_MANIFEST_JSON', `MANIFEST.json 无法解析：${error.message}`)
  }
  revalidatePathSnapshot(before)
  if (value?.schemaVersion !== 1 || value?.type !== 'preset-removal-archive'
      || !Array.isArray(value?.items) || typeof value?.batchId !== 'string') {
    fail('ARCHIVE_MANIFEST_SCHEMA', 'MANIFEST.json schema/type 非法')
  }
  const ids = validateFinalNames(value.items.map((item) => item?.id))
  const byId = new Map()
  for (let i = 0; i < ids.length; i += 1) {
    const digest = value.items[i]?.treeSha256
    if (typeof digest !== 'string' || !/^[a-f0-9]{64}$/u.test(digest)) {
      fail('ARCHIVE_MANIFEST_DIGEST', `${ids[i]} 的 treeSha256 非法`)
    }
    byId.set(ids[i], digest)
  }

  const journalPath = join(fromRoot.path, 'journal.json')
  if (!existsSync(journalPath)) fail('ARCHIVE_JOURNAL_MISSING', `归档缺 journal.json：${journalPath}`)
  const journalSnapshot = snapshotPath(journalPath)
  if (journalSnapshot.type !== 'file') fail('ARCHIVE_JOURNAL_TYPE', 'journal.json 必须是普通文件')
  let journal
  try { journal = JSON.parse(readFileSync(journalPath, 'utf8')) } catch (error) {
    fail('ARCHIVE_JOURNAL_JSON', `journal.json 无法解析：${error.message}`)
  }
  revalidatePathSnapshot(journalSnapshot)
  if (journal?.type !== 'preset-skill-directory-transaction'
      || journal?.kind !== 'preset' || !Array.isArray(journal?.items)
      || journal?.batchId !== value.batchId) {
    fail('ARCHIVE_JOURNAL_SCHEMA', 'journal 与 archive manifest 的 type/kind/batch 不一致')
  }
  const journalById = new Map(journal.items
    .filter((item) => item?.action === 'remove')
    .map((item) => [item.finalName, item.beforeDigest]))
  for (const [id, digest] of byId) {
    if (journalById.get(id) !== digest) {
      fail('ARCHIVE_JOURNAL_DIGEST', `${id} 的 archive manifest 未被 transaction journal 绑定`)
    }
  }
  return { value, snapshot: before, byId, journal, journalSnapshot }
}

function makeBatchId() {
  return `preset-restore-${Date.now()}-${randomBytes(4).toString('hex')}`
}

function recoveryWorkspace(root, id) {
  return join(dirname(root.path), `.agent-presets-restore-${id}`)
}

export async function buildRestorePlan(options, dependencies = {}) {
  const root = canonicalRoot(options.userRoot)
  const fromRoot = canonicalRoot(options.from)
  const manifest = parseArchiveManifest(fromRoot)
  const archiveRoot = canonicalRoot(join(fromRoot.path, 'archive'))

  let requested = options.ids
  let sessionsScanned = null
  if (options.referenced) {
    const scanner = dependencies.scanSessions ?? scanSessions
    const sessions = await scanner({ sessionsRoot: options.sessionsRoot })
    if (!Number.isInteger(sessions.scanned) || sessions.scanned <= 0) {
      fail('SESSION_SCAN_EMPTY', `会话扫描结果为 ${String(sessions.scanned)}，无法推导恢复范围`)
    }
    if (!(sessions.byPreset instanceof Map)) fail('SESSION_SCAN_SHAPE', '会话扫描结果缺 byPreset Map')
    const rosterResolver = dependencies.resolveRoster ?? resolveRoster
    const roster = rosterResolver({ shippedRoot: options.shippedRoot, userRoot: root.path })
    requested = [...sessions.byPreset.keys()].filter((id) => !roster.available.has(id)).sort()
    sessionsScanned = sessions.scanned
  }
  if (!Array.isArray(requested) || requested.length === 0) {
    return {
      version: 1,
      id: dependencies.batchId ?? makeBatchId(),
      root,
      fromRoot,
      archiveRoot,
      manifest,
      ids: [],
      skipped: [],
      items: [],
      sessionsScanned,
      workspace: null,
    }
  }
  const ids = validateFinalNames(requested)
  const items = []
  const skipped = []
  for (const id of ids) {
    const expected = manifest.byId.get(id)
    if (!expected) fail('ARCHIVE_ID_UNDECLARED', `MANIFEST.json 未声明 ${id}`)
    const source = resolveContainedTarget(archiveRoot, id, { mustExist: true })
    const sourceManifest = inspectTree(source.path)
    if (sourceManifest.treeSha256 !== expected) {
      fail('ARCHIVE_DIGEST_MISMATCH', `${id} archive digest 与 MANIFEST.json 不一致`, {
        expected,
        actual: sourceManifest.treeSha256,
      })
    }
    const target = resolveContainedTarget(root, id, { mustExist: false })
    if (target.exists) {
      if (!options.skipExisting) fail('TARGET_EXISTS', `目标已存在，拒绝覆盖：${target.path}`)
      skipped.push({ id, target: target.path })
      continue
    }
    items.push({
      action: 'replace',
      finalName: id,
      target,
      before: null,
      source,
      after: sourceManifest,
      stageMode: 'copy',
    })
  }
  const id = dependencies.batchId ?? makeBatchId()
  let restoreCapacity = null
  if (items.length > 0) {
    const requiredBytes = items.reduce((sum, item) => sum + item.after.entries
      .filter((entry) => entry.type === 'file')
      .reduce((total, entry) => total + entry.size, 0), 0) + 1024 * 1024
    const parent = canonicalRoot(dirname(root.path))
    try {
      accessSync(root.path, constants.W_OK | constants.X_OK)
      accessSync(parent.path, constants.W_OK | constants.X_OK)
    } catch (error) {
      fail('RESTORE_ROOT_NOT_WRITABLE', `user root 或 transaction parent 不可写：${error.message}`)
    }
    const fileSystem = statfsSync(parent.path, { bigint: true })
    const availableBytes = fileSystem.bavail * fileSystem.bsize
    if (availableBytes < BigInt(requiredBytes)) {
      fail('RESTORE_SPACE_INSUFFICIENT', `restore staging 可用空间不足：需要至少 ${requiredBytes} B`)
    }
    restoreCapacity = { requiredBytes, availableBytes: availableBytes.toString() }
  }
  return {
    version: 1,
    id,
    root,
    fromRoot,
    archiveRoot,
    manifest,
    ids,
    skipped,
    items,
    sessionsScanned,
    restoreCapacity,
    workspace: items.length > 0 ? recoveryWorkspace(root, id) : null,
  }
}

export function publicRestorePlan(plan) {
  return {
    version: plan.version,
    dryRun: true,
    batchId: plan.id,
    canonicalUserRoot: plan.root.path,
    sourceTransactionRoot: plan.fromRoot.path,
    sourceArchiveRoot: plan.archiveRoot.path,
    transactionRoot: plan.workspace,
    sessionsScanned: plan.sessionsScanned,
    requiredRestoreBytes: plan.restoreCapacity?.requiredBytes ?? 0,
    availableBytes: plan.restoreCapacity?.availableBytes ?? null,
    skipped: plan.skipped,
    items: plan.items.map((item) => ({
      id: item.finalName,
      canonicalSource: item.source.path,
      canonicalTarget: item.target.path,
      treeSha256: item.after.treeSha256,
    })),
  }
}

export async function executeRestorePlan(plan, dependencies = {}) {
  if (plan.items.length === 0) return { state: 'NOOP', workspace: null, journalPath: null }
  return executeDirectoryTransaction({
    kind: 'preset',
    batchId: plan.id,
    owner: dependencies.owner ?? 'restore-presets',
    root: plan.root,
    workspace: plan.workspace,
    items: plan.items,
  }, { fault: dependencies.fault })
}

export async function runRestoreCli(argv, environment = {}) {
  const options = parseRestoreArgs(argv)
  if (options.help) {
    environment.stdout?.(usage())
    return { exitCode: 0, help: true }
  }
  const plan = await buildRestorePlan(options, environment)
  const dry = publicRestorePlan(plan)
  if (!options.apply) {
    environment.stdout?.(options.json ? JSON.stringify(dry, null, 2) : [
      `dry-run：将恢复 ${plan.items.length} 个，跳过 ${plan.skipped.length} 个；未写盘`,
      `来源：${plan.archiveRoot.path}`,
      ...dry.items.map((item) => `  restore ${item.id} ${item.treeSha256}`),
    ].join('\n'))
    return { exitCode: 0, dryRun: true, plan: dry }
  }
  const result = await executeRestorePlan(plan, environment)
  const output = {
    state: result.state,
    batchId: plan.id,
    restored: plan.items.map((item) => item.finalName),
    skipped: plan.skipped,
    transactionRoot: result.workspace,
    journalPath: result.journalPath,
  }
  environment.stdout?.(options.json
    ? JSON.stringify(output, null, 2)
    : `完成：恢复 ${output.restored.length} 个 preset；state=${output.state}`)
  return { exitCode: 0, ...output }
}

const direct = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (direct) {
  runRestoreCli(process.argv.slice(2), { stdout: (text) => console.log(text) }).then(
    (result) => { process.exitCode = result.exitCode },
    (error) => {
      const payload = {
        ok: false,
        code: typeof error?.code === 'string' ? error.code : 'RESTORE_FAILED',
        message: error instanceof Error ? error.message : String(error),
        ...(error?.details && Object.keys(error.details).length > 0 ? { details: error.details } : {}),
      }
      console.error(process.argv.includes('--json') ? JSON.stringify(payload, null, 2) : `✗ ${payload.code}: ${payload.message}`)
      process.exitCode = 2
    },
  )
}
