#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createHash, X509Certificate } from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import {
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:net'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  assertRegularFile,
  loadConfig,
  packagingRoot,
  ownedPackagingRoots,
  safeOutputPath,
  sha256File,
  walkTree,
} from './lib.mjs'

const repoRoot = realpathSync(join(packagingRoot, '..'))
const [stagingRoot, releaseRoot] = ownedPackagingRoots(packagingRoot)
const liveCheck = join(repoRoot, 'apps', 'sage-shell', 'test', 'support', 'desktop-live-check.mjs')
const DEFAULT_TIMEOUT_MS = 90_000
let activeLaunch
let interruptedSignal

function usage() {
  return 'usage: node packaging-sage/scripts/accept-dmg.mjs --dmg <release.dmg> --evidence <new staging directory> [--timeout-ms <milliseconds>]'
}

export function parseArgs(argv) {
  const options = { timeoutMs: DEFAULT_TIMEOUT_MS }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--dmg' || argument === '--evidence' || argument === '--timeout-ms') {
      const value = argv[index + 1]
      if (value === undefined || value.startsWith('--')) throw new Error(`${argument} requires a value`)
      if (argument === '--dmg') options.dmg = value
      else if (argument === '--evidence') options.evidence = value
      else {
        const timeoutMs = Number(value)
        if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 10_000 || timeoutMs > 300_000) {
          throw new Error('--timeout-ms must be an integer from 10000 through 300000')
        }
        options.timeoutMs = timeoutMs
      }
      index += 1
      continue
    }
    if (argument === '-h' || argument === '--help') return { help: true }
    throw new Error(`unknown argument: ${argument}`)
  }
  if (options.dmg === undefined || options.evidence === undefined) throw new Error(usage())
  return options
}

function assertFuturePathInside(root, candidate, label) {
  const resolvedRoot = realpathSync(root)
  const resolvedCandidate = resolve(candidate)
  const distance = relative(resolvedRoot, resolvedCandidate)
  if (distance === '' || distance === '..' || distance.startsWith(`..${sep}`) || isAbsolute(distance)) {
    throw new Error(`${label} must be a strict descendant of ${resolvedRoot}`)
  }
  let ancestor = dirname(resolvedCandidate)
  while (!existsSync(ancestor)) ancestor = dirname(ancestor)
  const entry = lstatSync(ancestor)
  if (entry.isSymbolicLink() || !entry.isDirectory()) throw new Error(`${label} has an unsafe existing ancestor`)
  const physicalDistance = relative(resolvedRoot, realpathSync(ancestor))
  if (physicalDistance === '..' || physicalDistance.startsWith(`..${sep}`) || isAbsolute(physicalDistance)) {
    throw new Error(`${label} escapes its owned root through an existing ancestor`)
  }
  return resolvedCandidate
}

export function parseAttachResult(value, expectedMountpoint) {
  assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value), 'hdiutil attach plist must be an object')
  const entities = value['system-entities']
  assert.ok(Array.isArray(entities), 'hdiutil attach plist must contain system-entities')
  const expected = resolve(expectedMountpoint)
  const mounted = entities.filter(entity => entity !== null
    && typeof entity === 'object'
    && typeof entity['mount-point'] === 'string')
  assert.equal(mounted.length, 1, 'DMG must produce exactly one mounted filesystem')
  assert.equal(resolve(mounted[0]['mount-point']), expected, 'DMG mounted at an unexpected path')
  assert.match(mounted[0]['dev-entry'], /^\/dev\/disk[0-9]+(?:s[0-9]+)?$/u, 'mounted device must be an exact disk device')
  return { device: mounted[0]['dev-entry'], mountpoint: expected }
}

export function devicesForImage(value, imagePath) {
  if (value === null || typeof value !== 'object' || !Array.isArray(value.images)) return []
  const expected = resolve(imagePath)
  return value.images.flatMap(image => {
    if (image === null || typeof image !== 'object' || typeof image['image-path'] !== 'string') return []
    if (resolve(image['image-path']) !== expected || !Array.isArray(image['system-entities'])) return []
    return image['system-entities'].flatMap(entity => entity !== null
      && typeof entity === 'object'
      && typeof entity['dev-entry'] === 'string'
      && /^\/dev\/disk[0-9]+(?:s[0-9]+)?$/u.test(entity['dev-entry'])
      ? [entity['dev-entry']]
      : [])
  })
}

function exactKeys(value, expected) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort())
}

export function assertDmgReceipt(value, config, artifact) {
  assert.ok(exactKeys(value, [
    'schemaVersion', 'phase', 'product', 'bundleId', 'version', 'build',
    'architecture', 'distribution', 'artifact', 'app', 'signing', 'volume',
  ]), 'DMG receipt keys')
  assert.equal(value.schemaVersion, 'sage.dmg-receipt.v1', 'DMG receipt schemaVersion')
  assert.equal(value.phase, 'dmg', 'DMG receipt phase')
  assert.equal(value.product, config.productName, 'DMG receipt product')
  assert.equal(value.bundleId, config.bundleId, 'DMG receipt bundleId')
  assert.equal(value.version, config.version, 'DMG receipt version')
  assert.equal(value.build, config.build, 'DMG receipt build')
  assert.equal(value.architecture, config.arch, 'DMG receipt architecture')
  assert.equal(value.distribution, config.distribution, 'DMG receipt distribution')
  assert.ok(exactKeys(value.artifact, ['type', 'name', 'bytes', 'sha256']), 'DMG receipt artifact keys')
  assert.equal(value.artifact.type, 'file', 'DMG receipt artifact type')
  assert.equal(value.artifact.name, artifact.name, 'DMG receipt artifact name')
  assert.equal(value.artifact.bytes, artifact.bytes, 'DMG receipt artifact bytes')
  assert.equal(value.artifact.sha256, artifact.sha256, 'DMG receipt artifact sha256')
  assert.ok(exactKeys(value.app, ['name', 'treeSha256']), 'DMG receipt app keys')
  assert.equal(value.app.name, 'Sage.app', 'DMG receipt app name')
  assert.match(value.app.treeSha256, /^[a-f0-9]{64}$/u, 'DMG receipt app tree digest')
  assert.ok(exactKeys(value.signing, [
    'mode', 'identityCommonName', 'certificateSha256', 'certificateSha1', 'timestamp',
    'hardenedRuntime', 'appSandbox', 'notarized',
  ]), 'DMG receipt signing keys')
  assert.equal(value.signing.mode, config.signing.mode, 'DMG receipt signing mode')
  assert.equal(value.signing.identityCommonName, config.signing.identityCommonName, 'DMG receipt signing identity')
  assert.match(value.signing.certificateSha256, /^[a-f0-9]{64}$/u, 'DMG receipt signing certificate SHA-256')
  assert.match(value.signing.certificateSha1, /^[a-f0-9]{40}$/u, 'DMG receipt signing certificate SHA-1')
  assert.equal(value.signing.timestamp, 'none', 'DMG receipt signing timestamp')
  assert.equal(value.signing.hardenedRuntime, config.signing.hardenedRuntime, 'DMG receipt hardened runtime')
  assert.equal(value.signing.appSandbox, config.signing.appSandbox, 'DMG receipt app sandbox')
  assert.equal(value.signing.notarized, config.signing.notarized, 'DMG receipt notarization')
  assert.ok(exactKeys(value.volume, ['format', 'name', 'readOnly', 'entries', 'treeSha256']), 'DMG receipt volume keys')
  assert.equal(value.volume.format, config.dmg.format, 'DMG receipt volume format')
  assert.equal(value.volume.name, config.dmg.volumeName, 'DMG receipt volume name')
  assert.equal(value.volume.readOnly, true, 'DMG receipt volume must be read-only')
  assert.ok(Array.isArray(value.volume.entries), 'DMG receipt volume entries')
  assert.equal(value.volume.entries.length, 2, 'DMG receipt volume entry count')
  const [applications, app] = value.volume.entries
  assert.ok(exactKeys(applications, ['path', 'type', 'mode', 'target']), 'DMG receipt Applications entry keys')
  assert.equal(applications.path, 'Applications')
  assert.equal(applications.type, 'symlink')
  assert.match(applications.mode, /^[0-7]{3}$/u)
  assert.equal(applications.target, '/Applications')
  assert.ok(exactKeys(app, ['path', 'type', 'mode', 'treeSha256']), 'DMG receipt Sage.app entry keys')
  assert.equal(app.path, 'Sage.app')
  assert.equal(app.type, 'directory')
  assert.match(app.mode, /^[0-7]{3}$/u)
  assert.match(app.treeSha256, /^[a-f0-9]{64}$/u)
  assert.equal(app.treeSha256, value.app.treeSha256, 'DMG receipt app and volume tree digests')
  assert.equal(value.volume.treeSha256, createHash('sha256').update(JSON.stringify(value.volume.entries)).digest('hex'), 'DMG receipt volume tree digest')
  return value
}

export function parseProcessRows(output, pgid) {
  return output.split('\n').flatMap(line => {
    const match = /^\s*([0-9]+)\s+([0-9]+)\s+(.+)$/u.exec(line)
    if (match === null || Number(match[2]) !== pgid) return []
    return [{ pid: Number(match[1]), pgid: Number(match[2]), command: match[3].trim() }]
  })
}

export function waitForOwnedProcessGroup(pid, readProcessGroup, pause, attempts = 80) {
  let observed
  let lastError
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      observed = readProcessGroup(pid)
      if (observed === pid) return observed
    } catch (error) {
      lastError = error
    }
    pause()
  }
  const detail = observed === undefined
    ? lastError instanceof Error ? lastError.message : 'not observable'
    : `observed ${observed}`
  throw new Error(`packaged Sage PGID did not settle on its owned leader PID ${pid}: ${detail}`)
}

export function classifyLaunchLog(output, expectedProfileState) {
  assert.ok(expectedProfileState === 'installed' || expectedProfileState === 'existing', 'expected profile state')
  const profileStates = [...output.matchAll(/sage shell: bundled profile (installed|existing)/gu)].map(match => ({ state: match[1], index: match.index }))
  const expected = profileStates.filter(row => row.state === expectedProfileState)
  const unexpected = profileStates.filter(row => row.state !== expectedProfileState)
  const hostIndexes = [...output.matchAll(/sage shell: host ready, dsh /gu)].map(match => match.index)
  assert.deepEqual(unexpected, [], `packaged launch logged an unexpected bundled profile state`)
  assert.ok(expected.length <= 1, `packaged launch logged bundled profile ${expectedProfileState} more than once`)
  assert.ok(hostIndexes.length <= 1, 'packaged launch logged Host ready more than once')
  if (expected.length === 0 && hostIndexes.length === 0) return { ready: false }
  assert.equal(expected.length, 1, 'Host ready appeared before the bundled profile state')
  if (hostIndexes.length === 0) return { ready: false }
  assert.ok(hostIndexes[0] > expected[0].index, 'Host ready must follow the bundled profile state')
  return { ready: true, profileMarker: `sage shell: bundled profile ${expectedProfileState}`, hostReady: true }
}

function treeDigest(root) {
  const rows = walkTree(root).map(row => {
    if (row.kind === 'file') {
      return { path: row.relative, type: 'file', mode: row.mode.toString(8), bytes: row.size, sha256: sha256File(row.absolute) }
    }
    if (row.kind === 'symlink') {
      return { path: row.relative, type: 'symlink', mode: row.mode.toString(8), target: row.target }
    }
    return { path: row.relative, type: 'directory', mode: row.mode.toString(8) }
  })
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex')
}

function run(file, args, options = {}) {
  try {
    return execFileSync(file, args, { encoding: 'utf8', ...options })
  } catch (error) {
    const detail = error instanceof Error && 'stderr' in error && error.stderr !== undefined
      ? String(error.stderr).trim()
      : error instanceof Error ? error.message : String(error)
    throw new Error(`${basename(file)} ${args.join(' ')} failed${detail === '' ? '' : `: ${detail}`}`)
  }
}

function plistToJson(bytes) {
  return JSON.parse(run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '--', '-'], { input: bytes }))
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function processRows(pgid) {
  return parseProcessRows(run('/bin/ps', ['-axo', 'pid=,pgid=,command=']), pgid)
}

function processGroupForPid(pid) {
  const value = run('/bin/ps', ['-o', 'pgid=', '-p', String(pid)]).trim()
  if (!/^[0-9]+$/u.test(value)) throw new Error(`cannot determine process group for PID ${pid}`)
  return Number(value)
}

export function buildLaunchEnvironment(source, sageRoot) {
  const environment = { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', SAGE_ROOT: sageRoot }
  for (const key of ['HOME', 'TMPDIR', 'USER', 'LOGNAME', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TZ', '__CF_USER_TEXT_ENCODING']) {
    if (typeof source[key] === 'string' && source[key] !== '') environment[key] = source[key]
  }
  return environment
}

function groupAlive(pgid) {
  try {
    process.kill(-pgid, 0)
    return true
  } catch (error) {
    if (error !== null && typeof error === 'object' && error.code === 'ESRCH') return false
    throw error
  }
}

function signalGroup(pgid, signal) {
  try {
    process.kill(-pgid, signal)
    return true
  } catch (error) {
    if (error !== null && typeof error === 'object' && error.code === 'ESRCH') return false
    throw error
  }
}

async function waitFor(predicate, timeoutMs, label, intervalMs = 100) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = await predicate()
    if (value) return value
    await new Promise(resolvePromise => setTimeout(resolvePromise, intervalMs))
  }
  throw new Error(`${label} timed out`)
}

async function allocatePort() {
  const server = createServer()
  await new Promise((resolvePromise, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolvePromise)
  })
  const address = server.address()
  assert.ok(address !== null && typeof address === 'object', 'ephemeral port allocation failed')
  await new Promise((resolvePromise, reject) => server.close(error => error === undefined ? resolvePromise() : reject(error)))
  return address.port
}

async function cdpPages(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1_000) })
  if (!response.ok) throw new Error(`CDP returned ${response.status}`)
  return response.json()
}

async function assertPortClosed(port) {
  try {
    await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(500) })
  } catch {
    return
  }
  throw new Error(`owned CDP port ${port} remained open after process-group cleanup`)
}

async function startPackagedApp(app, sageRoot, phaseRoot, port) {
  mkdirSync(phaseRoot, { recursive: true, mode: 0o700 })
  const stdoutPath = join(phaseRoot, 'stdout.log')
  const stderrPath = join(phaseRoot, 'stderr.log')
  const stdout = openSync(stdoutPath, 'wx', 0o600)
  const stderr = openSync(stderrPath, 'wx', 0o600)
  const executable = join(app, 'Contents', 'MacOS', 'Sage')
  assertRegularFile(executable, 'packaged Sage executable')
  const env = buildLaunchEnvironment(process.env, sageRoot)
  let child
  try {
    child = spawn(executable, [`--remote-debugging-port=${port}`], {
      cwd: dirname(executable),
      detached: true,
      env,
      stdio: ['ignore', stdout, stderr],
    })
  } finally {
    closeSync(stdout)
    closeSync(stderr)
  }
  const launch = {
    child,
    pgid: child.pid,
    groupVerified: false,
    port,
    stdoutPath,
    stderrPath,
    spawnError: undefined,
  }
  launch.closed = new Promise(resolvePromise => {
    child.once('close', (code, signal) => resolvePromise({ code, signal }))
  })
  child.once('error', error => { launch.spawnError = error })
  activeLaunch = launch
  try {
    assert.ok(Number.isSafeInteger(child.pid), 'packaged Sage did not receive a PID')
    const sleeper = new Int32Array(new SharedArrayBuffer(4))
    waitForOwnedProcessGroup(child.pid, processGroupForPid, () => { Atomics.wait(sleeper, 0, 0, 25) })
    launch.groupVerified = true
    return launch
  } catch (error) {
    let cleanupError
    try {
      await cleanupLaunch(launch)
    } catch (observed) {
      cleanupError = observed
    }
    activeLaunch = undefined
    if (cleanupError !== undefined) throw new AggregateError([error, cleanupError], 'packaged Sage ownership verification and cleanup both failed')
    throw error
  }
}

async function waitForPackagedReady(launch, expectedProfileState, timeoutMs) {
  return waitFor(async () => {
    if (launch.spawnError !== undefined) throw launch.spawnError
    if (!groupAlive(launch.pgid)) {
      const stderr = existsSync(launch.stderrPath) ? readFileSync(launch.stderrPath, 'utf8').trim() : ''
      throw new Error(`packaged Sage exited before readiness${stderr === '' ? '' : `: ${stderr}`}`)
    }
    const stdout = readFileSync(launch.stdoutPath, 'utf8')
    const log = classifyLaunchLog(stdout, expectedProfileState)
    if (!log.ready) return false
    let pages
    try {
      pages = await cdpPages(launch.port)
    } catch {
      return false
    }
    const products = pages.filter(page => page.type === 'page' && !page.url.startsWith('devtools:'))
    if (products.length !== 1 || products[0].url !== 'dsh-app://app/index.html') return false
    return { profileMarker: log.profileMarker, hostReady: true, productUrl: products[0].url }
  }, timeoutMs, `${expectedProfileState} packaged Sage readiness`, 200)
}

async function cleanupLaunch(launch) {
  if (launch.cleanupPromise !== undefined) return launch.cleanupPromise
  launch.cleanupPromise = (async () => {
    if (!launch.groupVerified) {
      const termSent = launch.child.kill('SIGTERM')
      let closed = await Promise.race([
        launch.closed,
        new Promise(resolvePromise => setTimeout(() => resolvePromise(null), 2_000)),
      ])
      if (closed === null) {
        launch.child.kill('SIGKILL')
        closed = await Promise.race([
          launch.closed,
          new Promise(resolvePromise => setTimeout(() => resolvePromise(null), 2_000)),
        ])
      }
      assert.notEqual(closed, null, `unverified process leader ${launch.pgid} did not close`)
      await assertPortClosed(launch.port)
      return { pgid: launch.pgid, groupVerified: false, termSent, before: [], after: [], leaderClose: closed, cdpPortClosed: true }
    }
    const before = processRows(launch.pgid)
    const termSent = signalGroup(launch.pgid, 'SIGTERM')
    if (termSent) {
      try {
        await waitFor(() => !groupAlive(launch.pgid), 10_000, `SIGTERM cleanup for PGID ${launch.pgid}`)
      } catch {
        signalGroup(launch.pgid, 'SIGKILL')
        await waitFor(() => !groupAlive(launch.pgid), 5_000, `SIGKILL cleanup for PGID ${launch.pgid}`)
      }
    }
    const after = processRows(launch.pgid)
    assert.deepEqual(after, [], `owned process group ${launch.pgid} is not empty`)
    const closed = await Promise.race([
      launch.closed,
      new Promise(resolvePromise => setTimeout(() => resolvePromise(null), 2_000)),
    ])
    assert.notEqual(closed, null, `owned process leader ${launch.pgid} did not close`)
    await assertPortClosed(launch.port)
    return { pgid: launch.pgid, groupVerified: true, termSent, before, after, leaderClose: closed, cdpPortClosed: true }
  })()
  return launch.cleanupPromise
}

function hdiutilInfo() {
  return plistToJson(execFileSync('/usr/bin/hdiutil', ['info', '-plist']))
}

function detachOwnedDevice(device) {
  try {
    run('/usr/bin/hdiutil', ['detach', device])
  } catch {
    run('/usr/bin/hdiutil', ['detach', device, '-force'])
  }
}

function detachImageIfMounted(image) {
  const devices = [...new Set(devicesForImage(hdiutilInfo(), image))]
  const families = [...new Set(devices.map(device => /^\/dev\/disk[0-9]+/u.exec(device)?.[0]).filter(Boolean))]
  if (families.length === 0) return
  assert.equal(families.length, 1, 'DMG attachment ownership became ambiguous; no device was detached')
  detachOwnedDevice(families[0])
}

function profileFingerprint(sageRoot) {
  const pointerPath = join(sageRoot, 'profile-current.json')
  assertRegularFile(pointerPath, 'active profile pointer')
  const pointer = readJson(pointerPath)
  assert.equal(pointer.schemaVersion, 1, 'active profile pointer schemaVersion')
  assert.match(pointer.generation, /^[a-z0-9][a-z0-9-]{0,63}$/u, 'active profile generation')
  assert.match(pointer.manifestSha256, /^[a-f0-9]{64}$/u, 'active profile manifest digest')
  assert.equal(new Date(pointer.activatedAt).toISOString(), pointer.activatedAt, 'active profile activation time')
  const manifestPath = join(sageRoot, 'harness', 'profiles', '.sage-generations', pointer.generation, 'profile-manifest.json')
  assertRegularFile(manifestPath, 'active profile manifest')
  assert.equal(sha256File(manifestPath), pointer.manifestSha256, 'active profile pointer must seal its manifest')
  return {
    generation: pointer.generation,
    manifestSha256: pointer.manifestSha256,
    activatedAt: pointer.activatedAt,
    pointerSha256: sha256File(pointerPath),
  }
}

function preferencesFingerprint(sageRoot) {
  const preferences = join(sageRoot, 'preferences', 'display.prefs')
  assertRegularFile(preferences, 'persisted device preferences')
  return { path: relative(sageRoot, preferences), sha256: sha256File(preferences) }
}

function runLiveCheck(phase, phaseRoot, port, expectedPath) {
  const args = [liveCheck, phaseRoot, String(port), '--phase', phase]
  if (expectedPath !== undefined) args.push('--expected', expectedPath)
  const stdout = run(process.execPath, args)
  writeFileSync(join(phaseRoot, 'desktop-live-stdout.json'), stdout, { mode: 0o600 })
  const resultPath = join(phaseRoot, 'desktop-live-result.json')
  const result = readJson(resultPath)
  assert.equal(result.passed, true, `${phase} desktop live check did not pass`)
  assert.equal(result.phase, phase, `${phase} desktop live check reported a different phase`)
  return { result, resultPath }
}

function verifyDmgInput(path) {
  const config = loadConfig()
  const file = realpathSync(assertRegularFile(path, 'release DMG'))
  assert.equal(dirname(file), realpathSync(releaseRoot), 'acceptance consumes only the final packaging-sage release DMG')
  assert.equal(basename(file), config.dmg.fileName, 'release DMG filename')
  const manifestPath = `${file}.manifest.json`
  assertRegularFile(manifestPath, 'release DMG manifest')
  const manifest = readJson(manifestPath)
  const sha256 = sha256File(file)
  assertDmgReceipt(manifest, config, {
    name: config.dmg.fileName,
    bytes: lstatSync(file).size,
    sha256,
  })
  return { config, file, manifestPath, receipt: manifest, sha256 }
}

function prepareEvidence(path) {
  mkdirSync(stagingRoot, { recursive: true, mode: 0o700 })
  const safe = safeOutputPath(path, [stagingRoot])
  assertFuturePathInside(stagingRoot, safe, 'evidence directory')
  if (existsSync(safe)) throw new Error(`evidence directory must not exist: ${safe}`)
  mkdirSync(safe, { recursive: true, mode: 0o700 })
  return safe
}

async function accept(options, result) {
  if (process.platform !== 'darwin') throw new Error('packaged Sage DMG acceptance requires Darwin')
  const dmg = verifyDmgInput(options.dmg)
  result.artifact = { dmg: relative(repoRoot, dmg.file), sha256: dmg.sha256, manifest: relative(repoRoot, dmg.manifestPath) }
  run('/usr/bin/hdiutil', ['verify', dmg.file])
  assert.deepEqual(devicesForImage(hdiutilInfo(), dmg.file), [], 'release DMG must not already be mounted before acceptance')

  const mountpoint = join(options.evidence, 'mount')
  mkdirSync(mountpoint, { mode: 0o700 })
  let mountedDevice
  try {
    let attachBytes
    try {
      attachBytes = execFileSync('/usr/bin/hdiutil', [
        'attach', dmg.file, '-readonly', '-nobrowse', '-noautoopen', '-mountpoint', mountpoint, '-plist',
      ])
    } catch (error) {
      detachImageIfMounted(dmg.file)
      throw error
    }
    const mounted = parseAttachResult(plistToJson(attachBytes), mountpoint)
    mountedDevice = mounted.device
    const disk = plistToJson(execFileSync('/usr/sbin/diskutil', ['info', '-plist', mounted.device]))
    assert.equal(disk.DeviceNode, mounted.device, 'mounted volume device')
    assert.equal(resolve(disk.MountPoint), resolve(mounted.mountpoint), 'mounted volume path')
    assert.equal(disk.VolumeName, dmg.config.dmg.volumeName, 'mounted volume name')
    assert.equal(disk.Writable, false, 'mounted volume must be read-only')
    const rootEntries = readdirSync(mounted.mountpoint).sort()
    assert.deepEqual(rootEntries, ['Applications', 'Sage.app'], 'DMG root entries')
    const applications = join(mounted.mountpoint, 'Applications')
    assert.ok(lstatSync(applications).isSymbolicLink(), 'DMG Applications entry must be a symlink')
    assert.equal(readlinkSync(applications), '/Applications', 'DMG Applications symlink target')
    const mountedApp = join(mounted.mountpoint, 'Sage.app')
    const installedApp = join(options.evidence, 'installed', 'Sage.app')
    mkdirSync(dirname(installedApp), { recursive: true, mode: 0o700 })
    run('/usr/bin/ditto', [mountedApp, installedApp])
    const mountedTreeSha256 = treeDigest(mountedApp)
    const installedTreeSha256 = treeDigest(installedApp)
    assert.equal(installedTreeSha256, mountedTreeSha256, 'installed app tree digest must match mounted app')
    assert.equal(mountedTreeSha256, dmg.receipt.app.treeSha256, 'mounted app tree digest must match DMG receipt')
    assert.equal(installedTreeSha256, dmg.receipt.app.treeSha256, 'installed app tree digest must match DMG receipt')
    const actualVolumeEntries = [
      {
        path: 'Applications',
        type: 'symlink',
        mode: (lstatSync(applications).mode & 0o777).toString(8),
        target: '/Applications',
      },
      {
        path: 'Sage.app',
        type: 'directory',
        mode: (lstatSync(mountedApp).mode & 0o777).toString(8),
        treeSha256: mountedTreeSha256,
      },
    ]
    assert.deepEqual(actualVolumeEntries, dmg.receipt.volume.entries, 'mounted volume entries must match DMG receipt')
    assert.equal(
      createHash('sha256').update(JSON.stringify(actualVolumeEntries)).digest('hex'),
      dmg.receipt.volume.treeSha256,
      'mounted volume tree digest must match DMG receipt',
    )
    run('/usr/bin/codesign', ['--verify', '--deep', '--strict', installedApp])
    const certificatePrefix = join(options.evidence, 'installed', 'embedded-certificate-')
    run('/usr/bin/codesign', ['--display', `--extract-certificates=${certificatePrefix}`, installedApp])
    const leafCertificatePath = `${certificatePrefix}0`
    assertRegularFile(leafCertificatePath, 'installed app embedded leaf certificate')
    const leafCertificate = new X509Certificate(readFileSync(leafCertificatePath))
    const certificateSha256 = leafCertificate.fingerprint256.replaceAll(':', '').toLowerCase()
    const certificateSha1 = leafCertificate.fingerprint.replaceAll(':', '').toLowerCase()
    assert.equal(certificateSha256, dmg.receipt.signing.certificateSha256, 'embedded certificate SHA-256 must match DMG receipt')
    assert.equal(certificateSha1, dmg.receipt.signing.certificateSha1, 'embedded certificate SHA-1 must match DMG receipt')
    assert.equal(leafCertificate.toLegacyObject().subject?.CN, dmg.receipt.signing.identityCommonName, 'embedded certificate identity must match DMG receipt')
    run(process.execPath, [join(packagingRoot, 'scripts', 'verify-bundle.mjs'), installedApp])
    run(process.execPath, [join(packagingRoot, 'scripts', 'assert-relocatable.mjs'), installedApp, '--forbid', repoRoot])
    const arches = run('/usr/bin/lipo', ['-archs', join(installedApp, 'Contents', 'MacOS', 'Sage')]).trim()
    assert.equal(arches, dmg.config.arch, 'installed Sage executable architecture')
    result.artifact = {
      ...result.artifact,
      mountedDevice,
      mountpoint: relative(options.evidence, mounted.mountpoint),
      rootEntries,
      installedApp: relative(options.evidence, installedApp),
      mountedTreeSha256,
      installedTreeSha256,
      volume: { name: disk.VolumeName, readOnly: disk.Writable === false, entries: actualVolumeEntries, treeSha256: dmg.receipt.volume.treeSha256 },
      signing: { certificateSha256, certificateSha1, identityCommonName: dmg.receipt.signing.identityCommonName },
      codesignVerified: true,
      bundleVerified: true,
      relocatable: true,
      architecture: arches,
    }
    writeJson(join(options.evidence, 'mounted-artifact.json'), result.artifact)
  } finally {
    if (mountedDevice !== undefined) {
      detachOwnedDevice(mountedDevice)
      mountedDevice = undefined
    } else detachImageIfMounted(dmg.file)
  }
  result.artifact.dmgDetached = true
  if (interruptedSignal !== undefined) throw new Error(`acceptance interrupted by ${interruptedSignal}`)

  const installedApp = join(options.evidence, 'installed', 'Sage.app')
  const runtimeRoot = join(options.evidence, 'runtime')
  const sageRoot = join(runtimeRoot, 'sage-root')
  mkdirSync(runtimeRoot, { mode: 0o700 })
  assert.equal(existsSync(sageRoot), false, 'fresh SAGE_ROOT must not exist before first launch')
  result.root = { path: relative(options.evidence, sageRoot), freshBeforeFirstLaunch: true, sameRootUsedForRestart: true }

  const firstRoot = join(options.evidence, 'first-launch')
  const firstPort = await allocatePort()
  const firstLaunch = await startPackagedApp(installedApp, sageRoot, firstRoot, firstPort)
  activeLaunch = firstLaunch
  result.firstLaunch = { cdpPort: firstPort }
  let firstCleanup
  let firstFailure
  try {
    const ready = await waitForPackagedReady(firstLaunch, 'installed', options.timeoutMs)
    const live = runLiveCheck('first-save', firstRoot, firstPort)
    Object.assign(result.firstLaunch, { ready, desktopLiveResult: relative(options.evidence, live.resultPath) })
  } catch (error) {
    firstFailure = error
  } finally {
    try {
      firstCleanup = await cleanupLaunch(firstLaunch)
      result.firstLaunch.cleanup = firstCleanup
    } catch (cleanupError) {
      firstFailure = firstFailure === undefined ? cleanupError : new AggregateError([firstFailure, cleanupError], 'first launch and cleanup both failed')
    }
    activeLaunch = undefined
  }
  if (firstFailure !== undefined) throw firstFailure
  if (interruptedSignal !== undefined) throw new Error(`acceptance interrupted by ${interruptedSignal}`)
  const firstProfile = profileFingerprint(sageRoot)
  const firstPreferences = preferencesFingerprint(sageRoot)
  result.firstLaunch.profile = firstProfile
  result.firstLaunch.preferencesFile = firstPreferences

  const firstResultPath = join(firstRoot, 'desktop-live-result.json')
  const firstResult = readJson(firstResultPath)
  const saved = firstResult.reads?.authoritativeDevicePreferences
  assert.ok(saved !== null && typeof saved === 'object', 'first-save live result must contain authoritative device preferences')
  result.firstLaunch.authoritativeDevicePreferences = saved
  result.firstLaunch.screenshots = [1440, 660, 320].map(width => `first-launch/desktop-settings-first-save-${width}-dark-compact.png`)

  const restartRoot = join(options.evidence, 'restart')
  let restartPort
  do restartPort = await allocatePort()
  while (restartPort === firstPort)
  const restartLaunch = await startPackagedApp(installedApp, sageRoot, restartRoot, restartPort)
  activeLaunch = restartLaunch
  result.restart = { cdpPort: restartPort }
  let restartCleanup
  let restartFailure
  let restartLiveResult
  try {
    const ready = await waitForPackagedReady(restartLaunch, 'existing', options.timeoutMs)
    const stdout = readFileSync(restartLaunch.stdoutPath, 'utf8')
    assert.equal(stdout.includes('sage shell: bundled profile installed'), false, 'restart must not reinstall the bundled profile')
    const live = runLiveCheck('restart', restartRoot, restartPort, firstResultPath)
    restartLiveResult = live.result
    Object.assign(result.restart, { ready, desktopLiveResult: relative(options.evidence, live.resultPath) })
  } catch (error) {
    restartFailure = error
  } finally {
    try {
      restartCleanup = await cleanupLaunch(restartLaunch)
      result.restart.cleanup = restartCleanup
    } catch (cleanupError) {
      restartFailure = restartFailure === undefined ? cleanupError : new AggregateError([restartFailure, cleanupError], 'restart and cleanup both failed')
    }
    activeLaunch = undefined
  }
  if (restartFailure !== undefined) throw restartFailure
  if (interruptedSignal !== undefined) throw new Error(`acceptance interrupted by ${interruptedSignal}`)
  const restartProfile = profileFingerprint(sageRoot)
  const restartPreferences = preferencesFingerprint(sageRoot)
  const restored = restartLiveResult.reads?.authoritativeDevicePreferences
  assert.deepEqual(restored, saved, 'restart authoritative GET must preserve requested values and savedAt')
  const restartPreferencePosts = restartLiveResult.requests.filter(request => request.method === 'POST' && request.pathname === '/.sage/preferences')
  assert.deepEqual(restartPreferencePosts, [], 'restart must not POST device preferences')
  assert.deepEqual(restartProfile, firstProfile, 'restart must preserve the active bundled profile')
  assert.deepEqual(restartPreferences, firstPreferences, 'restart must not rewrite persisted preferences')
  result.restart.profile = restartProfile
  result.restart.preferencesFile = restartPreferences
  result.restart.authoritativeDevicePreferences = restored
  result.restart.preferencePosts = restartPreferencePosts.length
  result.restart.screenshots = [1440, 660, 320].map(width => `restart/desktop-settings-restart-${width}-dark-compact.png`)
  result.restart.preferencesEqual = true
  result.restart.savedAtEqual = restored.savedAt === saved.savedAt
  result.cleanup = {
    firstProcessGroupEmpty: firstCleanup.after.length === 0,
    restartProcessGroupEmpty: restartCleanup.after.length === 0,
    firstCdpPortClosed: firstCleanup.cdpPortClosed,
    restartCdpPortClosed: restartCleanup.cdpPortClosed,
    dmgDetached: result.artifact.dmgDetached,
  }
}

async function main() {
  let options
  try {
    options = parseArgs(process.argv.slice(2))
    if (options.help === true) {
      process.stdout.write(`${usage()}\n`)
      return
    }
    options.evidence = prepareEvidence(options.evidence)
  } catch (error) {
    process.stderr.write(`[sage-packaging] ERROR: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
    return
  }

  const result = {
    schemaVersion: 1,
    kind: 'sage.packaged-acceptance.v1',
    passed: false,
    startedAt: new Date().toISOString(),
  }
  try {
    await accept(options, result)
    result.passed = true
  } catch (error) {
    result.error = error instanceof Error ? error.stack ?? error.message : String(error)
    if (interruptedSignal === undefined) process.exitCode = 1
  } finally {
    result.finishedAt = new Date().toISOString()
    writeJson(join(options.evidence, 'acceptance-result.json'), result)
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

async function interrupt(signal) {
  if (interruptedSignal !== undefined) return
  interruptedSignal = signal
  process.exitCode = signal === 'SIGINT' ? 130 : 143
  try {
    if (activeLaunch !== undefined) await cleanupLaunch(activeLaunch)
  } catch (error) {
    process.stderr.write(`[sage-packaging] ERROR: interrupt cleanup failed: ${error instanceof Error ? error.message : String(error)}\n`)
  }
}

const isMain = process.argv[1] !== undefined
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url
if (isMain) {
  process.once('SIGINT', () => { void interrupt('SIGINT') })
  process.once('SIGTERM', () => { void interrupt('SIGTERM') })
  await main()
}
