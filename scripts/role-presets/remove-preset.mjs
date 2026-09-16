#!/usr/bin/env node
/**
 * Journaled preset removal. Default mode is dry-run; live mutation requires
 * --apply. A committed removal is a rename into retained quarantine, never rm.
 */
import { randomBytes } from 'node:crypto'
import { accessSync, constants, existsSync, statfsSync } from 'node:fs'
import { dirname, join, basename, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  DEFAULT_SESSIONS_ROOT,
  DEFAULT_USER_PRESET_ROOT,
  scanSessions,
  summarize,
} from './session-refs.mjs'
import {
  atomicWriteJson,
  canonicalRoot,
  copyTreeVerified,
  inspectTree,
  resolveContainedTarget,
  validateFinalNames,
} from '../lib/preset-skill-paths.mjs'
import { executeDirectoryTransaction } from '../lib/preset-skill-transaction.mjs'

export class PresetRemovalError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'PresetRemovalError'
    this.code = code
    this.details = details
  }
}

function fail(code, message, details) {
  throw new PresetRemovalError(code, message, details)
}

export function parseRemoveArgs(argv) {
  const options = {
    ids: null,
    force: false,
    apply: false,
    dryRun: true,
    json: false,
    userRoot: DEFAULT_USER_PRESET_ROOT,
    sessionsRoot: DEFAULT_SESSIONS_ROOT,
    archiveRoot: null,
  }
  let sawMode = false
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--ids') {
      if (options.ids !== null) fail('CLI_IDS_DUPLICATE', '--ids 不得重复')
      const raw = argv[++i]
      if (!raw || raw.startsWith('--')) fail('CLI_IDS_MISSING', '--ids 必须给至少一个 preset id')
      options.ids = raw.split(',').map((value) => value.trim())
      if (options.ids.some((value) => value === '')) fail('CLI_IDS_EMPTY', '--ids 不得含空项')
    } else if (arg === '--force') {
      if (options.force) fail('CLI_FORCE_DUPLICATE', '--force 不得重复')
      options.force = true
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
    } else if (arg === '--user-root' || arg === '--sessions' || arg === '--archive-root') {
      const value = argv[++i]
      if (!value || value.startsWith('--')) fail('CLI_VALUE_MISSING', `${arg} 缺值`)
      if (arg === '--user-root') options.userRoot = value
      else if (arg === '--sessions') options.sessionsRoot = value
      else options.archiveRoot = value
    } else if (arg === '--help' || arg === '-h') {
      options.help = true
    } else {
      fail('CLI_UNKNOWN', `未知参数：${arg}`)
    }
  }
  if (!options.help && (options.ids === null || options.ids.length === 0)) {
    fail('CLI_IDS_MISSING', '必须用 --ids 指定至少一个 preset id')
  }
  return options
}

function usage() {
  return `用法：
  node scripts/role-presets/remove-preset.mjs --ids a,b [--dry-run] [--json]
  node scripts/role-presets/remove-preset.mjs --ids a,b --apply [--force] [--json]

默认只做 dry-run；--force 只能接受已知引用，不能绕过扫描失败或零会话。`
}

function batchId() {
  return `preset-remove-${Date.now()}-${randomBytes(4).toString('hex')}`
}

function resolveWorkspace(root, requested, id, requiredBytes) {
  const lexical = resolve(requested ?? join(dirname(root.path), `.agent-presets-pre-remove-${id}`))
  const parent = canonicalRoot(dirname(lexical))
  const canonical = join(parent.path, basename(lexical))
  if (canonical === root.path || dirname(canonical) !== dirname(root.path)) {
    fail('ARCHIVE_NOT_SIBLING', 'archive root 必须是 canonical user root 的直接 sibling')
  }
  if (String(parent.snapshot.dev) !== String(root.snapshot.dev)) {
    fail('ARCHIVE_CROSS_DEVICE', 'archive root 与 user root 不在同一 filesystem，不能保证 rename 语义')
  }
  if (existsSync(canonical)) fail('ARCHIVE_EXISTS', `archive root 已存在，拒绝覆盖：${canonical}`)
  try {
    accessSync(root.path, constants.W_OK | constants.X_OK)
    accessSync(parent.path, constants.W_OK | constants.X_OK)
  } catch (error) {
    fail('TRANSACTION_ROOT_NOT_WRITABLE', `user root 或 archive parent 不可写：${error.message}`)
  }
  const fileSystem = statfsSync(parent.path, { bigint: true })
  const availableBytes = fileSystem.bavail * fileSystem.bsize
  if (availableBytes < BigInt(requiredBytes)) {
    fail('ARCHIVE_SPACE_INSUFFICIENT', `archive 可用空间不足：需要至少 ${requiredBytes} B`)
  }
  return { path: canonical, requiredBytes, availableBytes: availableBytes.toString() }
}

export async function buildRemovalPlan(options, dependencies = {}) {
  const ids = validateFinalNames(options.ids)
  const root = canonicalRoot(options.userRoot)
  const targets = ids.map((id) => resolveContainedTarget(root, id, { mustExist: true }))
  const before = targets.map((target) => inspectTree(target.path))
  const scanner = dependencies.scanSessions ?? scanSessions
  const sessions = await scanner({
    sessionsRoot: options.sessionsRoot,
    ...(dependencies.zstd ? { zstd: dependencies.zstd } : {}),
  })
  if (!Number.isInteger(sessions.scanned) || sessions.scanned <= 0) {
    fail('SESSION_SCAN_EMPTY', `会话扫描结果为 ${String(sessions.scanned)}，无法证明引用面安全`)
  }
  if (!(sessions.byPreset instanceof Map)) fail('SESSION_SCAN_SHAPE', '会话扫描结果缺 byPreset Map')
  const affected = ids.map((id) => {
    const rows = sessions.byPreset.get(id) ?? []
    return { id, rows, summary: summarize(rows) }
  }).filter((entry) => entry.rows.length > 0)
  if (affected.length > 0 && !options.force) {
    fail('PRESET_REFERENCED', '已有会话仍引用待删除 preset；迁移会话或显式 --force', {
      affected: affected.map(({ id, rows, summary }) => ({
        id,
        ...summary,
        sessionIds: rows.map((row) => row.session),
      })),
    })
  }
  const id = dependencies.batchId ?? batchId()
  const requiredArchiveBytes = before.reduce((sum, manifest) => sum + manifest.entries
    .filter((entry) => entry.type === 'file')
    .reduce((total, entry) => total + entry.size, 0), 0) + 1024 * 1024
  const archiveCapacity = resolveWorkspace(root, options.archiveRoot, id, requiredArchiveBytes)
  const workspace = archiveCapacity.path
  return {
    version: 1,
    id,
    root,
    ids,
    workspace,
    sessionsScanned: sessions.scanned,
    affected,
    archiveCapacity,
    items: ids.map((finalName, index) => ({
      action: 'remove',
      finalName,
      target: targets[index],
      before: before[index],
      after: null,
    })),
  }
}

export function publicRemovalPlan(plan) {
  return {
    version: plan.version,
    dryRun: true,
    batchId: plan.id,
    canonicalUserRoot: plan.root.path,
    transactionRoot: plan.workspace,
    archiveRoot: join(plan.workspace, 'archive'),
    quarantineRoot: join(plan.workspace, 'quarantine'),
    journalPath: join(plan.workspace, 'journal.json'),
    sessionsScanned: plan.sessionsScanned,
    requiredArchiveBytes: plan.archiveCapacity.requiredBytes,
    availableBytes: plan.archiveCapacity.availableBytes,
    affected: plan.affected.map(({ id, rows, summary }) => ({
      id,
      ...summary,
      sessionIds: rows.map((row) => row.session),
    })),
    items: plan.items.map((item) => ({
      id: item.finalName,
      canonicalTarget: item.target.path,
      beforeTreeSha256: item.before.treeSha256,
    })),
  }
}

export async function executeRemovalPlan(plan, dependencies = {}) {
  const manifest = {
    schemaVersion: 1,
    type: 'preset-removal-archive',
    batchId: plan.id,
    createdAt: new Date().toISOString(),
    canonicalUserRoot: plan.root.path,
    items: plan.items.map((item) => ({
      id: item.finalName,
      treeSha256: item.before.treeSha256,
    })),
  }
  const result = await executeDirectoryTransaction({
    kind: 'preset',
    batchId: plan.id,
    owner: dependencies.owner ?? 'remove-preset',
    root: plan.root,
    workspace: plan.workspace,
    items: plan.items,
  }, {
    fault: dependencies.fault,
    prepare({ archiveDir, workspace }) {
      const archived = {}
      for (const item of plan.items) {
        const copied = copyTreeVerified(item.target.path, join(archiveDir, item.finalName), {
          expectedManifest: item.before,
        })
        archived[item.finalName] = copied.treeSha256
      }
      atomicWriteJson(join(workspace, 'MANIFEST.json'), manifest, { mode: 0o600, syncParent: true })
      return { archiveManifest: 'MANIFEST.json', archived }
    },
  })
  return { ...result, manifest }
}

export async function runRemoveCli(argv, environment = {}) {
  const options = parseRemoveArgs(argv)
  if (options.help) {
    environment.stdout?.(usage())
    return { exitCode: 0, help: true }
  }
  const plan = await buildRemovalPlan(options, environment)
  const dry = publicRemovalPlan(plan)
  if (!options.apply) {
    environment.stdout?.(options.json ? JSON.stringify(dry, null, 2) : [
      `dry-run：预检 ${plan.ids.length} 个 preset，未写盘`,
      `扫描会话：${plan.sessionsScanned}`,
      `事务证据根：${plan.workspace}`,
      ...dry.items.map((item) => `  remove ${item.id} ${item.beforeTreeSha256}`),
    ].join('\n'))
    return { exitCode: 0, dryRun: true, plan: dry }
  }
  const result = await executeRemovalPlan(plan, environment)
  const output = {
    state: result.state,
    batchId: plan.id,
    removed: plan.ids,
    transactionRoot: result.workspace,
    archiveRoot: join(result.workspace, 'archive'),
    quarantineRoot: join(result.workspace, 'quarantine'),
    journalPath: result.journalPath,
  }
  environment.stdout?.(options.json
    ? JSON.stringify(output, null, 2)
    : `完成：${plan.ids.join(', ')} 已进入 quarantine；archive=${output.archiveRoot}`)
  return { exitCode: 0, ...output }
}

const direct = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (direct) {
  runRemoveCli(process.argv.slice(2), { stdout: (text) => console.log(text) }).then(
    (result) => { process.exitCode = result.exitCode },
    (error) => {
      const payload = {
        ok: false,
        code: typeof error?.code === 'string' ? error.code : 'REMOVE_FAILED',
        message: error instanceof Error ? error.message : String(error),
        ...(error?.details && Object.keys(error.details).length > 0 ? { details: error.details } : {}),
      }
      console.error(process.argv.includes('--json') ? JSON.stringify(payload, null, 2) : `✗ ${payload.code}: ${payload.message}`)
      process.exitCode = payload.code === 'PRESET_REFERENCED' ? 1 : 2
    },
  )
}
