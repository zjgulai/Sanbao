#!/usr/bin/env node

import { randomUUID } from 'node:crypto'
import {
  closeSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { constants as osConstants } from 'node:os'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'

const OWNER_FILE = 'owner.json'
const FORMAT_VERSION = 'sage.packaging-input-lock.v1'
const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP']
const RECOVERY_PROCESS_NAMES = 'producer, assembler, or producer-contract'

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

function ownerPath(lockDir) {
  return resolve(lockDir, OWNER_FILE)
}

function readOwner(lockDir) {
  try {
    const lockEntry = lstatSync(lockDir)
    if (lockEntry.isSymbolicLink() || !lockEntry.isDirectory()) {
      return { error: 'lock path is not a real directory' }
    }
    const path = ownerPath(lockDir)
    const ownerEntry = lstatSync(path)
    if (ownerEntry.isSymbolicLink() || !ownerEntry.isFile()) {
      return { error: 'owner metadata is not a regular file' }
    }
    const value = JSON.parse(readFileSync(path, 'utf8'))
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return { error: 'owner metadata is not an object' }
    }
    return { value }
  } catch (error) {
    return { error: errorMessage(error) }
  }
}

function processState(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return 'unknown'
  try {
    process.kill(pid, 0)
    return 'active'
  } catch (error) {
    if (error !== null && typeof error === 'object' && error.code === 'ESRCH') return 'stale'
    return 'unknown'
  }
}

function contentionMessage(lockDir) {
  const observed = readOwner(lockDir)
  const lines = [`packaging input lock is already held: ${lockDir}`]
  if (observed.value !== undefined) {
    const { operation, pid, acquiredAt } = observed.value
    const state = processState(pid)
    lines.push(`owner: operation=${String(operation ?? 'unknown')} pid=${String(pid ?? 'unknown')} acquiredAt=${String(acquiredAt ?? 'unknown')}`)
    if (state === 'active') {
      lines.push('owner pid appears active; wait for it to finish and retry')
    } else if (state === 'stale') {
      lines.push('owner pid is not running; this lock appears stale')
    } else {
      lines.push('owner liveness could not be established; treat the lock as active')
    }
  } else {
    lines.push(`owner metadata is unavailable (${observed.error}); the lock may be incomplete or stale`)
  }
  lines.push(`recovery: first confirm that no ${RECOVERY_PROCESS_NAMES} process is using packaging inputs`)
  lines.push(`then remove exactly this lock directory and retry: ${lockDir}`)
  lines.push('the lock is never removed automatically after an ownership or stale-state check')
  return lines.join('\n')
}

export function acquireInputLock({ lockDir, operation }) {
  if (typeof operation !== 'string' || !/^[a-z][a-z0-9-]*$/u.test(operation)) {
    throw new Error(`invalid packaging input lock operation: ${String(operation)}`)
  }
  const absoluteLockDir = resolve(lockDir)
  const absoluteParent = dirname(absoluteLockDir)
  mkdirSync(absoluteParent, { recursive: true, mode: 0o755 })
  try {
    mkdirSync(absoluteLockDir, { mode: 0o700 })
  } catch (error) {
    if (error !== null && typeof error === 'object' && error.code === 'EEXIST') {
      throw new Error(contentionMessage(absoluteLockDir), { cause: error })
    }
    throw error
  }

  const token = randomUUID()
  const metadata = {
    formatVersion: FORMAT_VERSION,
    token,
    pid: process.pid,
    operation,
    acquiredAt: new Date().toISOString(),
  }
  try {
    const descriptor = openSync(ownerPath(absoluteLockDir), 'wx', 0o600)
    try {
      writeFileSync(descriptor, `${JSON.stringify(metadata, null, 2)}\n`)
    } finally {
      closeSync(descriptor)
    }
  } catch (error) {
    try {
      const path = ownerPath(absoluteLockDir)
      const entry = lstatSync(path)
      if (!entry.isSymbolicLink() && entry.isFile()) unlinkSync(path)
    } catch {}
    try { rmdirSync(absoluteLockDir) } catch {}
    throw new Error(`could not write packaging input lock owner metadata: ${errorMessage(error)}`, { cause: error })
  }

  const entry = statSync(absoluteLockDir)
  return {
    lockDir: absoluteLockDir,
    operation,
    pid: process.pid,
    token,
    device: entry.dev,
    inode: entry.ino,
    releaseAttempted: false,
    released: false,
  }
}

function ownershipError(lock, reason) {
  return new Error(`refusing to release packaging input lock because this process is not its current owner: ${reason}; retained ${lock.lockDir} for recovery`)
}

export function assertInputLockOwner({ lockDir, token, pid, operation }) {
  const absoluteLockDir = resolve(lockDir)
  const observed = readOwner(absoluteLockDir)
  if (observed.value === undefined) {
    throw new Error(`packaging input lock owner metadata is unavailable: ${observed.error}`)
  }
  const expectedPid = Number(pid)
  if (observed.value.formatVersion !== FORMAT_VERSION
    || observed.value.token !== token
    || observed.value.pid !== expectedPid
    || observed.value.operation !== operation) {
    throw new Error('packaging input lock ownership assertion failed; refusing to access packaging inputs')
  }
}

export function releaseInputLock(lock) {
  if (lock.released) return
  if (lock.releaseAttempted) throw ownershipError(lock, 'a prior release attempt did not complete')
  lock.releaseAttempted = true

  let entry
  try {
    entry = lstatSync(lock.lockDir)
  } catch (error) {
    throw ownershipError(lock, `lock directory is unavailable (${errorMessage(error)})`)
  }
  if (entry.isSymbolicLink() || !entry.isDirectory() || entry.dev !== lock.device || entry.ino !== lock.inode) {
    throw ownershipError(lock, 'lock directory identity changed')
  }
  const observed = readOwner(lock.lockDir)
  if (observed.value === undefined) throw ownershipError(lock, `owner metadata is unavailable (${observed.error})`)
  if (observed.value.formatVersion !== FORMAT_VERSION
    || observed.value.token !== lock.token
    || observed.value.pid !== lock.pid
    || observed.value.operation !== lock.operation) {
    throw ownershipError(lock, 'owner metadata changed')
  }
  const entries = readdirSync(lock.lockDir)
  if (entries.length !== 1 || entries[0] !== OWNER_FILE) {
    throw ownershipError(lock, `unexpected lock directory contents: ${entries.join(', ') || '(empty)'}`)
  }
  unlinkSync(ownerPath(lock.lockDir))
  rmdirSync(lock.lockDir)
  lock.released = true
}

function signalStatus(signal) {
  return 128 + (osConstants.signals[signal] ?? 0)
}

function processGroupIsAlive(pid) {
  try {
    process.kill(-pid, 0)
    return true
  } catch (error) {
    return !(error !== null && typeof error === 'object' && error.code === 'ESRCH')
  }
}

async function waitForProcessGroup(pid) {
  if (process.platform === 'win32') return
  while (processGroupIsAlive(pid)) {
    await new Promise(resolvePromise => setTimeout(resolvePromise, 25))
  }
}

async function runLocked({ lockDir, operation, command, commandArgs }) {
  const lock = acquireInputLock({ lockDir, operation })
  let child
  let requestedSignal
  let finished = false
  let status = 1

  const release = () => {
    if (lock.released || lock.releaseAttempted) return
    try {
      releaseInputLock(lock)
    } catch (error) {
      process.stderr.write(`[sage-packaging] ERROR: ${errorMessage(error)}\n`)
      status = 1
    }
  }
  process.once('exit', release)

  const forward = signal => {
    requestedSignal ??= signal
    if (child === undefined || child.pid === undefined) return
    try {
      if (process.platform === 'win32') child.kill(signal)
      else process.kill(-child.pid, signal)
    } catch (error) {
      if (!(error !== null && typeof error === 'object' && error.code === 'ESRCH')) {
        process.stderr.write(`[sage-packaging] ERROR: could not forward ${signal}: ${errorMessage(error)}\n`)
      }
    }
  }
  const signalHandlers = new Map(SIGNALS.map(signal => {
    const handler = () => forward(signal)
    process.on(signal, handler)
    return [signal, handler]
  }))

  try {
    child = spawn(command, commandArgs, {
      stdio: 'inherit',
      detached: process.platform !== 'win32',
      env: {
        ...process.env,
        SAGE_PACKAGING_INPUT_LOCK_DIR: lock.lockDir,
        SAGE_PACKAGING_INPUT_LOCK_OPERATION: operation,
        SAGE_PACKAGING_INPUT_LOCK_OWNER_PID: String(lock.pid),
        SAGE_PACKAGING_INPUT_LOCK_TOKEN: lock.token,
      },
    })
    if (requestedSignal !== undefined) forward(requestedSignal)
    const result = await new Promise((resolvePromise, rejectPromise) => {
      child.once('error', rejectPromise)
      child.once('close', (code, signal) => resolvePromise({ code, signal }))
    })
    await waitForProcessGroup(child.pid)
    if (requestedSignal !== undefined) status = signalStatus(requestedSignal)
    else if (result.code !== null) status = result.code
    else if (result.signal !== null) status = signalStatus(result.signal)
    else status = 1
    finished = true
  } finally {
    for (const [signal, handler] of signalHandlers) process.off(signal, handler)
    release()
  }
  if (!finished) status = 1
  return status
}

function optionValue(args, name) {
  const index = args.indexOf(name)
  if (index === -1 || index + 1 >= args.length) throw new Error(`${name} requires a value`)
  return args[index + 1]
}

function usage() {
  return [
    'usage:',
    '  node input-lock.mjs run --lock-dir <path> --operation <name> -- <command> [args...]',
    '  node input-lock.mjs assert-owner --lock-dir <path> --operation <name> --token <token> --pid <pid>',
  ].join('\n')
}

async function main() {
  const [action, ...args] = process.argv.slice(2)
  if (action === 'run') {
    const separator = args.indexOf('--')
    if (separator === -1 || separator === args.length - 1) throw new Error(usage())
    const status = await runLocked({
      lockDir: optionValue(args.slice(0, separator), '--lock-dir'),
      operation: optionValue(args.slice(0, separator), '--operation'),
      command: args[separator + 1],
      commandArgs: args.slice(separator + 2),
    })
    process.exitCode = status
    return
  }
  if (action === 'assert-owner') {
    assertInputLockOwner({
      lockDir: optionValue(args, '--lock-dir'),
      operation: optionValue(args, '--operation'),
      token: optionValue(args, '--token'),
      pid: optionValue(args, '--pid'),
    })
    return
  }
  throw new Error(usage())
}

const invokedPath = process.argv[1] === undefined ? undefined : pathToFileURL(resolve(process.argv[1])).href
if (invokedPath === import.meta.url) {
  main().catch(error => {
    process.stderr.write(`[sage-packaging] ERROR: ${errorMessage(error)}\n`)
    process.exitCode = 1
  })
}
