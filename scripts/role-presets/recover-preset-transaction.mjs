#!/usr/bin/env node
/** Explicit operator entrypoint for retained preset/skill transaction recovery. */
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { canonicalRoot, revalidatePathSnapshot, snapshotPath } from '../lib/preset-skill-paths.mjs'
import { recoverTransaction } from '../lib/preset-skill-transaction.mjs'

class RecoveryCliError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'RecoveryCliError'
    this.code = code
  }
}

function fail(code, message) { throw new RecoveryCliError(code, message) }

export function parseRecoveryArgs(argv) {
  const options = { from: null, rollback: false, apply: false, adoptOrphanLock: false, json: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--from') {
      if (options.from !== null) fail('CLI_FROM_DUPLICATE', '--from 不得重复')
      const value = argv[++i]
      if (!value || value.startsWith('--')) fail('CLI_FROM_MISSING', '--from 缺值')
      options.from = value
    } else if (arg === '--rollback') {
      if (options.rollback) fail('CLI_ROLLBACK_DUPLICATE', '--rollback 不得重复')
      options.rollback = true
    } else if (arg === '--apply') {
      if (options.apply) fail('CLI_APPLY_DUPLICATE', '--apply 不得重复')
      options.apply = true
    } else if (arg === '--adopt-orphan-lock') {
      if (options.adoptOrphanLock) fail('CLI_ADOPT_DUPLICATE', '--adopt-orphan-lock 不得重复')
      options.adoptOrphanLock = true
    } else if (arg === '--json') {
      if (options.json) fail('CLI_JSON_DUPLICATE', '--json 不得重复')
      options.json = true
    } else if (arg === '--help' || arg === '-h') options.help = true
    else fail('CLI_UNKNOWN', `未知参数：${arg}`)
  }
  if (!options.help && !options.from) fail('CLI_FROM_MISSING', '必须给 --from <transaction-root>')
  if (!options.help && options.apply && !options.rollback) {
    fail('CLI_RECOVERY_MODE', '--apply 必须与显式 --rollback 一起使用')
  }
  if (!options.help && options.adoptOrphanLock && (!options.apply || !options.rollback)) {
    fail('CLI_ADOPT_MODE', '--adopt-orphan-lock 必须与 --rollback --apply 一起使用')
  }
  return options
}

function usage() {
  return `用法：
  node scripts/role-presets/recover-preset-transaction.mjs --from <transaction-root> [--json]
  node scripts/role-presets/recover-preset-transaction.mjs --from <transaction-root> --rollback --apply [--adopt-orphan-lock] [--json]

默认只查看 journal；stale lock 只有显式 --adopt-orphan-lock 且 token/batch/PID 检查全部通过才会接管。`
}

function readJournal(workspace) {
  const pathname = join(workspace.path, 'journal.json')
  const snapshot = snapshotPath(pathname)
  if (snapshot.type !== 'file') fail('JOURNAL_TYPE', 'journal.json 必须是普通文件')
  let journal
  try { journal = JSON.parse(readFileSync(pathname, 'utf8')) } catch (error) {
    fail('JOURNAL_JSON', `journal.json 无法解析：${error.message}`)
  }
  revalidatePathSnapshot(snapshot)
  if (journal?.type !== 'preset-skill-directory-transaction'
      || !Array.isArray(journal?.items) || typeof journal?.state !== 'string') {
    fail('JOURNAL_SCHEMA', 'journal.json schema/type 非法')
  }
  return { pathname, journal }
}

export async function runRecoveryCli(argv, environment = {}) {
  const options = parseRecoveryArgs(argv)
  if (options.help) {
    environment.stdout?.(usage())
    return { exitCode: 0, help: true }
  }
  const workspace = canonicalRoot(options.from)
  const { pathname, journal } = readJournal(workspace)
  const preview = {
    dryRun: !options.apply,
    transactionRoot: workspace.path,
    journalPath: pathname,
    batchId: journal.batchId,
    kind: journal.kind,
    state: journal.state,
    action: options.rollback ? 'rollback' : 'inspect',
    adoptOrphanLock: options.adoptOrphanLock,
    items: journal.items.map((item) => ({
      action: item.action,
      finalName: item.finalName,
      phase: item.phase,
      beforeDigest: item.beforeDigest,
      afterDigest: item.afterDigest,
    })),
  }
  if (!options.apply) {
    environment.stdout?.(options.json ? JSON.stringify(preview, null, 2) : [
      `dry-run：${journal.kind} ${journal.batchId}，state=${journal.state}`,
      `journal：${pathname}`,
      `计划：${options.rollback ? 'rollback（需再加 --apply）' : '仅查看'}`,
    ].join('\n'))
    return { exitCode: 0, ...preview }
  }
  const result = await recoverTransaction(workspace.path, {
    mode: 'rollback',
    owner: environment.owner ?? 'recover-preset-transaction',
    fault: environment.fault,
    adoptOrphanLock: options.adoptOrphanLock,
  })
  const output = { ...preview, dryRun: false, state: result.state }
  environment.stdout?.(options.json
    ? JSON.stringify(output, null, 2)
    : `完成：${journal.batchId} 已 rollback；journal=${pathname}`)
  return { exitCode: 0, ...output }
}

const direct = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (direct) {
  runRecoveryCli(process.argv.slice(2), { stdout: (text) => console.log(text) }).then(
    (result) => { process.exitCode = result.exitCode },
    (error) => {
      const payload = {
        ok: false,
        code: typeof error?.code === 'string' ? error.code : 'RECOVERY_FAILED',
        message: error instanceof Error ? error.message : String(error),
      }
      console.error(process.argv.includes('--json') ? JSON.stringify(payload, null, 2) : `✗ ${payload.code}: ${payload.message}`)
      process.exitCode = 2
    },
  )
}
