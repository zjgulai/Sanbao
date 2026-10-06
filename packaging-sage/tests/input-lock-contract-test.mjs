import { spawn, spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const helper = fileURLToPath(new URL('../lib/input-lock.mjs', import.meta.url))
const temporary = mkdtempSync(join(tmpdir(), 'sage-packaging-input-lock-test-'))
const lockDir = join(temporary, 'isolated-input.lock')
const ownerFile = join(lockDir, 'owner.json')
const active = new Set()

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function waitFor(predicate, label, timeout = 20_000) {
  const deadline = Date.now() + timeout
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(`timed out waiting for ${label}`)
    await new Promise(resolvePromise => setTimeout(resolvePromise, 10))
  }
}

function startHelper(operation, command, commandArgs) {
  const child = spawn(process.execPath, [
    helper,
    'run',
    '--lock-dir', lockDir,
    '--operation', operation,
    '--', command,
    ...commandArgs,
  ], { stdio: ['ignore', 'pipe', 'pipe'] })
  active.add(child)
  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', chunk => { stdout += chunk })
  child.stderr.on('data', chunk => { stderr += chunk })
  const result = new Promise((resolvePromise, rejectPromise) => {
    child.once('error', rejectPromise)
    child.once('close', (code, signal) => {
      active.delete(child)
      resolvePromise({ code, signal, stdout, stderr })
    })
  })
  return { child, result }
}

function startHolder(label) {
  const ready = join(temporary, `${label}.ready`)
  const release = join(temporary, `${label}.release`)
  const program = [
    "const fs = require('node:fs')",
    'const ready = process.argv[1]',
    'const release = process.argv[2]',
    "fs.writeFileSync(ready, 'ready')",
    'setInterval(() => { if (fs.existsSync(release)) process.exit(0) }, 10)',
  ].join('; ')
  return { ready, release, ...startHelper(label, process.execPath, ['-e', program, ready, release]) }
}

function runContender(operation, marker) {
  const program = "require('node:fs').writeFileSync(process.argv[1], 'ran')"
  return spawnSync(process.execPath, [
    helper,
    'run',
    '--lock-dir', lockDir,
    '--operation', operation,
    '--', process.execPath, '-e', program, marker,
  ], { encoding: 'utf8', timeout: 20_000 })
}

try {
  assert(dirname(lockDir) === temporary, 'lock test escaped its isolated temporary root')

  const first = startHolder('producer')
  await waitFor(() => existsSync(first.ready) && existsSync(ownerFile), 'first owner metadata')
  const firstOwner = JSON.parse(readFileSync(ownerFile, 'utf8'))
  assert(firstOwner.formatVersion === 'sage.packaging-input-lock.v1', 'owner metadata format is missing')
  assert(firstOwner.operation === 'producer', 'owner metadata operation is wrong')
  assert(firstOwner.pid === first.child.pid, 'owner metadata does not identify the lock process')
  assert(typeof firstOwner.token === 'string' && firstOwner.token.length > 0, 'owner metadata token is missing')
  assert((statSync(lockDir).mode & 0o777) === 0o700, 'lock directory mode is not 0700')
  assert((statSync(ownerFile).mode & 0o777) === 0o600, 'owner metadata mode is not 0600')

  const blockedMarker = join(temporary, 'blocked-contender-ran')
  const blocked = runContender('assembler', blockedMarker)
  assert(blocked.status !== 0, 'concurrent contender acquired an already-held lock')
  assert(!existsSync(blockedMarker), 'blocked contender executed its protected command')
  assert(blocked.stderr.includes('packaging input lock is already held'), 'contention error is not explicit')
  assert(blocked.stderr.includes('owner pid appears active'), 'active owner is not identified')
  assert(blocked.stderr.includes('producer, assembler, or producer-contract'), 'recovery warning omits protected processes')

  writeFileSync(first.release, 'release')
  const firstResult = await first.result
  assert(firstResult.code === 0, `normal owner failed: ${firstResult.stderr}`)
  assert(!existsSync(lockDir), 'normal owner did not release the lock')

  const successorMarker = join(temporary, 'successor-ran')
  const successor = runContender('producer-contract', successorMarker)
  assert(successor.status === 0, `successor could not acquire released lock: ${successor.stderr}`)
  assert(existsSync(successorMarker), 'successor did not execute under the released lock')
  assert(!existsSync(lockDir), 'successor did not release the lock')
  process.stdout.write('PASS atomic contention blocks protected commands before execution\n')
  process.stdout.write('PASS normal owner release permits the next operation\n')

  mkdirSync(lockDir, { mode: 0o700 })
  writeFileSync(ownerFile, `${JSON.stringify({
    formatVersion: 'sage.packaging-input-lock.v1',
    token: 'stale-owner-token',
    pid: 2_147_483_647,
    operation: 'producer',
    acquiredAt: '2000-01-01T00:00:00.000Z',
  }, null, 2)}\n`, { mode: 0o600 })
  const staleMarker = join(temporary, 'stale-contender-ran')
  const stale = runContender('assembler', staleMarker)
  assert(stale.status !== 0, 'stale lock was silently stolen')
  assert(!existsSync(staleMarker), 'stale-lock contender executed its protected command')
  assert(stale.stderr.includes('appears stale'), 'stale owner is not identified')
  assert(stale.stderr.includes('remove exactly this lock directory'), 'stale recovery action is not explicit')
  assert(existsSync(lockDir), 'stale lock was removed automatically')
  rmSync(lockDir, { recursive: true, force: true })
  process.stdout.write('PASS stale lock is retained with an explicit recovery instruction\n')

  const changed = startHolder('assembler')
  await waitFor(() => existsSync(changed.ready) && existsSync(ownerFile), 'owner-change fixture')
  const changedOwner = JSON.parse(readFileSync(ownerFile, 'utf8'))
  changedOwner.token = `${changedOwner.token}-different-owner`
  writeFileSync(ownerFile, `${JSON.stringify(changedOwner, null, 2)}\n`)
  chmodSync(ownerFile, 0o600)
  writeFileSync(changed.release, 'release')
  const changedResult = await changed.result
  assert(changedResult.code !== 0, 'owner mismatch was accepted during release')
  assert(changedResult.stderr.includes('not its current owner'), 'owner mismatch error is not explicit')
  assert(existsSync(lockDir) && existsSync(ownerFile), 'non-owner release deleted the lock')
  rmSync(lockDir, { recursive: true, force: true })
  process.stdout.write('PASS non-owner release retains the lock for recovery\n')

  const signaled = startHolder('producer-contract')
  await waitFor(() => existsSync(signaled.ready) && existsSync(ownerFile), 'signal owner metadata')
  signaled.child.kill('SIGINT')
  const signaledResult = await signaled.result
  assert(signaledResult.code === 130, `signal exit status was not preserved: ${String(signaledResult.code)} ${signaledResult.stderr}`)
  assert(!existsSync(lockDir), 'signal-handled owner did not release the lock')
  process.stdout.write('PASS signal forwarding waits for the protected process and releases its lock\n')
} finally {
  for (const child of active) child.kill('SIGTERM')
  if (active.size > 0) {
    await Promise.race([
      Promise.all([...active].map(child => new Promise(resolvePromise => child.once('close', resolvePromise)))),
      new Promise(resolvePromise => setTimeout(resolvePromise, 2_000)),
    ])
  }
  rmSync(temporary, { recursive: true, force: true })
}
