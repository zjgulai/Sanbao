/**
 * Security primitives shared by destructive preset/skill maintenance scripts.
 *
 * This module deliberately stops below the transaction-policy layer. It knows
 * how to prove that names and paths stay inside one trusted root, how to inspect
 * and copy a regular-file tree without following links, and how to persist the
 * small control files used by a caller's journal/lock. It does not decide what
 * may be removed, installed, promoted, archived, or recovered.
 */
import {
  chmodSync,
  closeSync,
  constants,
  fsyncSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { createHash, randomBytes } from 'node:crypto'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f]/u
const FINAL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const NOFOLLOW = constants.O_NOFOLLOW ?? 0
const DIRECTORY = constants.O_DIRECTORY ?? 0

/** Typed failure so callers can render a stable reason without parsing prose. */
export class PathSafetyError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'PathSafetyError'
    this.code = code
    this.details = details
  }
}

/** @returns {never} */
function fail(code, message, details) {
  throw new PathSafetyError(code, message, details)
}

function errorCode(error) {
  return error && typeof error === 'object' && 'code' in error
    ? String(error.code)
    : null
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

function statType(stat) {
  if (stat.isFile()) return 'file'
  if (stat.isDirectory()) return 'directory'
  if (stat.isSymbolicLink()) return 'symlink'
  if (stat.isFIFO()) return 'fifo'
  if (stat.isSocket()) return 'socket'
  if (stat.isCharacterDevice()) return 'character-device'
  if (stat.isBlockDevice()) return 'block-device'
  return 'special'
}

function numberFromBigInt(value, label, pathname) {
  const n = Number(value)
  if (!Number.isSafeInteger(n)) {
    fail('STAT_RANGE', `${label} 超出 JavaScript 安全整数范围：${pathname}`, { path: pathname, label })
  }
  return n
}

/**
 * @param {string} pathname
 * @param {any} stat
 * @param {string|null} [digest]
 * @returns {Record<string, any>}
 */
function snapshotFromStat(pathname, stat, digest = null) {
  return {
    path: pathname,
    type: statType(stat),
    dev: stat.dev.toString(),
    ino: stat.ino.toString(),
    nlink: stat.nlink.toString(),
    size: numberFromBigInt(stat.size, 'size', pathname),
    mode: Number(stat.mode & 0o777n),
    mtimeNs: stat.mtimeNs.toString(),
    ctimeNs: stat.ctimeNs.toString(),
    ...(digest === null ? {} : { sha256: digest }),
  }
}

function lstatOrNull(pathname) {
  try {
    return lstatSync(pathname, { bigint: true })
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return null
    throw error
  }
}

function assertRegularTreeEntry(pathname, stat, { rejectHardLinks = true } = {}) {
  const type = statType(stat)
  if (type === 'symlink') fail('SYMLINK_REJECTED', `拒绝符号链接：${pathname}`, { path: pathname })
  if (type !== 'file' && type !== 'directory') {
    fail('SPECIAL_FILE_REJECTED', `拒绝特殊文件（${type}）：${pathname}`, { path: pathname, type })
  }
  if (type === 'file' && rejectHardLinks && stat.nlink > 1n) {
    fail('HARD_LINK_REJECTED', `拒绝硬链接文件（nlink=${stat.nlink}）：${pathname}`, {
      path: pathname,
      nlink: stat.nlink.toString(),
    })
  }
  return type
}

function assertSameIdentity(expected, actual, { includeMetadata = false } = {}) {
  for (const key of ['type', 'dev', 'ino']) {
    if (expected[key] !== actual[key]) {
      fail('PATH_IDENTITY_CHANGED', `路径身份已变化：${expected.path}`, {
        path: expected.path,
        field: key,
        before: expected[key],
        after: actual[key],
      })
    }
  }
  if (expected.type === 'file') {
    for (const key of ['nlink', 'size']) {
      if (expected[key] !== actual[key]) {
        fail('PATH_IDENTITY_CHANGED', `文件身份/大小已变化：${expected.path}`, {
          path: expected.path,
          field: key,
          before: expected[key],
          after: actual[key],
        })
      }
    }
  }
  if (includeMetadata) {
    for (const key of ['mtimeNs', 'ctimeNs']) {
      if (expected[key] !== actual[key]) {
        fail('PATH_METADATA_CHANGED', `路径在读取期间发生变化：${expected.path}`, {
          path: expected.path,
          field: key,
          before: expected[key],
          after: actual[key],
        })
      }
    }
  }
}

/** @param {string} pathname @param {any|null} [expected] */
function readRegularFileVerified(pathname, expected = null) {
  const beforeStat = lstatSync(pathname, { bigint: true })
  assertRegularTreeEntry(pathname, beforeStat)
  if (!beforeStat.isFile()) fail('EXPECTED_FILE', `应为普通文件：${pathname}`, { path: pathname })
  const before = snapshotFromStat(pathname, beforeStat)
  if (expected) assertSameIdentity(expected, before)

  let fd
  try {
    fd = openSync(pathname, constants.O_RDONLY | NOFOLLOW)
    const opened = snapshotFromStat(pathname, fstatSync(fd, { bigint: true }))
    assertSameIdentity(before, opened)
    const buffer = readFileSync(fd)
    const afterRead = snapshotFromStat(pathname, fstatSync(fd, { bigint: true }))
    assertSameIdentity(opened, afterRead, { includeMetadata: true })
    const digest = sha256(buffer)
    /** @type {Record<string, any>} */
    const snapshot = { ...afterRead, sha256: digest }
    if (expected?.sha256 && expected.sha256 !== digest) {
      fail('PATH_CONTENT_CHANGED', `文件内容已变化：${pathname}`, {
        path: pathname,
        before: expected.sha256,
        after: digest,
      })
    }
    const pathAfter = snapshotFromStat(pathname, lstatSync(pathname, { bigint: true }))
    assertSameIdentity(snapshot, pathAfter)
    return { buffer, snapshot }
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}

function directorySnapshot(pathname) {
  const stat = lstatSync(pathname, { bigint: true })
  assertRegularTreeEntry(pathname, stat)
  if (!stat.isDirectory()) fail('EXPECTED_DIRECTORY', `应为目录：${pathname}`, { path: pathname })
  const before = snapshotFromStat(pathname, stat)
  let fd
  try {
    fd = openSync(pathname, constants.O_RDONLY | DIRECTORY | NOFOLLOW)
    const opened = snapshotFromStat(pathname, fstatSync(fd, { bigint: true }))
    assertSameIdentity(before, opened)
    return opened
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}

/**
 * Validate the final, direct-child directory name accepted by both preset and
 * skill operations. The deliberately narrow ASCII kebab contract also avoids
 * platform-dependent Unicode/case aliases.
 */
export function validateFinalName(value) {
  if (typeof value !== 'string') fail('FINAL_NAME_TYPE', 'final name 必须是字符串', { valueType: typeof value })
  if (value.length === 0) fail('FINAL_NAME_EMPTY', 'final name 不能为空')
  if (value !== value.normalize('NFC')) {
    fail('FINAL_NAME_NORMALIZATION', `final name 必须使用 NFC：${JSON.stringify(value)}`, { value })
  }
  if (CONTROL_RE.test(value)) fail('FINAL_NAME_CONTROL', 'final name 不得含 NUL/control 字符', { value })
  if (value === '.' || value === '..') fail('FINAL_NAME_TRAVERSAL', `final name 不得为 ${value}`, { value })
  if (isAbsolute(value)) fail('FINAL_NAME_ABSOLUTE', `final name 不得为绝对路径：${value}`, { value })
  if (value.includes('/') || value.includes('\\')) {
    fail('FINAL_NAME_SEPARATOR', `final name 不得含路径分隔符：${value}`, { value })
  }
  if (!FINAL_NAME_RE.test(value)) {
    fail('FINAL_NAME_FORMAT', `final name 必须是小写 ASCII kebab-case：${value}`, { value })
  }
  return value
}

function collisionKey(value) {
  return value.normalize('NFC').toLocaleLowerCase('en-US')
}

function asCanonicalRoot(root) {
  if (typeof root === 'string') return canonicalRoot(root)
  if (!root || typeof root.path !== 'string' || !root.snapshot) {
    fail('ROOT_DESCRIPTOR', 'root 必须是路径或 canonicalRoot() 返回值')
  }
  revalidatePathSnapshot(root.snapshot)
  return root
}

/**
 * Validate a batch and reject exact, NFC-equivalent, or case-equivalent names.
 * When root is provided, direct children already on disk also participate.
 * Exact existing children are permitted only when explicitly allowlisted.
 */
/**
 * @param {unknown[]} values
 * @param {{root?: any, allowExisting?: string[]}} [options]
 */
export function validateFinalNames(values, { root, allowExisting = [] } = {}) {
  if (!Array.isArray(values)) fail('FINAL_NAMES_TYPE', 'final names 必须是数组')
  const names = values.map(validateFinalName)
  const proposed = new Map()
  for (const name of names) {
    const key = collisionKey(name)
    if (proposed.has(key)) {
      fail('FINAL_NAME_COLLISION', `批内 final name 冲突：${proposed.get(key)} / ${name}`, {
        names: [proposed.get(key), name],
      })
    }
    proposed.set(key, name)
  }

  if (root !== undefined) {
    const info = asCanonicalRoot(root)
    const allowed = new Set(allowExisting)
    const entries = readdirSync(info.path)
    revalidatePathSnapshot(info.snapshot)
    for (const entry of entries) {
      const requested = proposed.get(collisionKey(entry))
      if (requested === undefined) continue
      if (entry === requested && allowed.has(requested)) continue
      fail(entry === requested ? 'DIRECT_CHILD_EXISTS' : 'DIRECT_CHILD_COLLISION',
        entry === requested
          ? `目标已存在但未获准更新：${entry}`
          : `目标与现有 direct child 存在 NFC/case 冲突：${requested} / ${entry}`,
        { requested, existing: entry })
    }
  }
  return names
}

/** Canonicalize and pin one trusted directory root without accepting a root symlink. */
export function canonicalRoot(rootPath) {
  if (typeof rootPath !== 'string' || rootPath.length === 0) fail('ROOT_PATH', 'root 路径不能为空')
  const requested = resolve(rootPath)
  const direct = lstatOrNull(requested)
  if (direct === null) fail('ROOT_MISSING', `root 不存在：${requested}`, { path: requested })
  if (direct.isSymbolicLink()) fail('ROOT_SYMLINK', `root 不得是符号链接：${requested}`, { path: requested })
  if (!direct.isDirectory()) fail('ROOT_NOT_DIRECTORY', `root 不是目录：${requested}`, { path: requested })
  const path = realpathSync.native(requested)
  if (dirname(path) === path) {
    fail('ROOT_TOO_BROAD', `拒绝把文件系统根作为 destructive root：${path}`, { path })
  }
  const snapshot = directorySnapshot(path)
  return Object.freeze({ path, snapshot: Object.freeze(snapshot) })
}

/** Resolve exactly one validated child and reject an existing link/special/hard-link target. */
export function resolveContainedTarget(root, finalName, { mustExist = false, existingType = 'directory' } = {}) {
  const info = asCanonicalRoot(root)
  const name = validateFinalName(finalName)
  const target = resolve(info.path, name)
  if (dirname(target) !== info.path || relative(info.path, target) !== name) {
    fail('TARGET_ESCAPE', `目标不在 root 的直接子级：${target}`, { root: info.path, target, name })
  }
  const stat = lstatOrNull(target)
  let snapshot = null
  if (stat === null) {
    if (mustExist) fail('TARGET_MISSING', `目标不存在：${target}`, { path: target })
  } else {
    const type = statType(stat)
    if (type === 'symlink') fail('TARGET_SYMLINK', `目标不得是符号链接：${target}`, { path: target })
    if (type !== 'file' && type !== 'directory') {
      fail('TARGET_SPECIAL', `目标是特殊文件（${type}）：${target}`, { path: target, type })
    }
    if (type === 'file' && stat.nlink > 1n) {
      fail('TARGET_HARD_LINK', `目标不得是硬链接文件：${target}`, { path: target, nlink: stat.nlink.toString() })
    }
    if (existingType !== null && type !== existingType) {
      fail('TARGET_TYPE', `目标类型应为 ${existingType}，实际为 ${type}：${target}`, {
        path: target,
        expected: existingType,
        actual: type,
      })
    }
    snapshot = type === 'file'
      ? readRegularFileVerified(target).snapshot
      : directorySnapshot(target)
  }
  revalidatePathSnapshot(info.snapshot)
  return Object.freeze({ root: info, name, path: target, exists: stat !== null, snapshot })
}

/** Capture dev/ino and, for a regular file, a content digest. */
export function snapshotPath(pathname) {
  const absolute = resolve(pathname)
  const stat = lstatSync(absolute, { bigint: true })
  const type = assertRegularTreeEntry(absolute, stat)
  return type === 'file' ? readRegularFileVerified(absolute).snapshot : directorySnapshot(absolute)
}

/** Revalidate a captured pathname; same-size file edits are detected by SHA-256. */
export function revalidatePathSnapshot(snapshot) {
  if (!snapshot || typeof snapshot.path !== 'string') fail('SNAPSHOT_SHAPE', 'path snapshot 形状非法')
  const stat = lstatOrNull(snapshot.path)
  if (stat === null) fail('PATH_DISAPPEARED', `路径已消失：${snapshot.path}`, { path: snapshot.path })
  assertRegularTreeEntry(snapshot.path, stat)
  if (snapshot.type === 'file') {
    const current = readRegularFileVerified(snapshot.path, snapshot).snapshot
    if (snapshot.sha256 && current.sha256 !== snapshot.sha256) {
      fail('PATH_CONTENT_CHANGED', `文件内容已变化：${snapshot.path}`, {
        path: snapshot.path,
        before: snapshot.sha256,
        after: current.sha256,
      })
    }
    return current
  }
  const current = directorySnapshot(snapshot.path)
  assertSameIdentity(snapshot, current)
  return current
}

function portableRelative(root, pathname) {
  return relative(root, pathname).split(sep).join('/')
}

function manifestDigest(entries) {
  const content = entries.map(({ path, type, size, mode, sha256: digest = null }) => ({ path, type, size, mode, sha256: digest }))
  return sha256(Buffer.from(JSON.stringify(content)))
}

/**
 * Inspect a whole tree without following links. Every regular file gets a
 * SHA-256/size/type record; directories are retained so empty directories copy.
 */
export function inspectTree(rootPath) {
  const root = canonicalRoot(rootPath)
  const entries = []

  const walk = (directory) => {
    const before = directorySnapshot(directory)
    const names = readdirSync(directory).sort((a, b) => a.localeCompare(b, 'en'))
    for (const name of names) {
      const pathname = join(directory, name)
      const stat = lstatSync(pathname, { bigint: true })
      const type = assertRegularTreeEntry(pathname, stat)
      const rel = portableRelative(root.path, pathname)
      if (type === 'directory') {
        const snapshot = directorySnapshot(pathname)
        entries.push({ path: rel, type, size: 0, sha256: null, mode: snapshot.mode, snapshot })
        walk(pathname)
      } else {
        const { snapshot } = readRegularFileVerified(pathname)
        entries.push({
          path: rel,
          type,
          size: snapshot.size,
          sha256: snapshot.sha256,
          mode: snapshot.mode,
          snapshot,
        })
      }
    }
    const after = directorySnapshot(directory)
    assertSameIdentity(before, after, { includeMetadata: true })
  }

  walk(root.path)
  entries.sort((a, b) => a.path.localeCompare(b.path, 'en'))
  return {
    version: 1,
    root: root.path,
    rootSnapshot: root.snapshot,
    entries,
    treeSha256: manifestDigest(entries),
  }
}

/** Re-scan a tree and prove both its content and every dev/ino identity stayed fixed. */
export function revalidateTreeManifest(manifest) {
  if (!manifest || manifest.version !== 1 || !Array.isArray(manifest.entries)) {
    fail('TREE_MANIFEST_SHAPE', 'tree manifest 形状非法')
  }
  revalidatePathSnapshot(manifest.rootSnapshot)
  for (const entry of manifest.entries) revalidatePathSnapshot(entry.snapshot)
  const current = inspectTree(manifest.root)
  if (current.treeSha256 !== manifest.treeSha256) {
    fail('TREE_CONTENT_CHANGED', `目录树内容已变化：${manifest.root}`, {
      root: manifest.root,
      before: manifest.treeSha256,
      after: current.treeSha256,
    })
  }
  if (current.entries.length !== manifest.entries.length) {
    fail('TREE_CONTENT_CHANGED', `目录树条目数已变化：${manifest.root}`, {
      root: manifest.root,
      before: manifest.entries.length,
      after: current.entries.length,
    })
  }
  for (let i = 0; i < manifest.entries.length; i += 1) {
    const before = manifest.entries[i]
    const after = current.entries[i]
    if (before.path !== after.path || before.type !== after.type) {
      fail('TREE_CONTENT_CHANGED', `目录树形状已变化：${manifest.root}`, { before, after })
    }
    assertSameIdentity(before.snapshot, after.snapshot)
  }
  return current
}

/** Fsync a directory after rename/create/unlink metadata changes. */
export function fsyncDirectory(directory) {
  const snapshot = directorySnapshot(directory)
  let fd
  try {
    fd = openSync(snapshot.path, constants.O_RDONLY | DIRECTORY | NOFOLLOW)
    const opened = snapshotFromStat(snapshot.path, fstatSync(fd, { bigint: true }))
    assertSameIdentity(snapshot, opened)
    fsyncSync(fd)
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}

function ensureInternalChildName(name, label) {
  if (typeof name !== 'string' || !name || name === '.' || name === '..' || isAbsolute(name)
    || name.includes('/') || name.includes('\\') || CONTROL_RE.test(name) || name !== name.normalize('NFC')) {
    fail('INTERNAL_CHILD_NAME', `${label} 必须是单一、安全的 direct-child 名称`, { name })
  }
  return name
}

function writeExclusiveFile(pathname, buffer, mode) {
  let fd
  try {
    fd = openSync(pathname, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | NOFOLLOW, mode)
    writeFileSync(fd, buffer)
    chmodSync(pathname, mode)
    fsyncSync(fd)
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
  return snapshotPath(pathname)
}

function destinationPath(pathname) {
  const absolute = resolve(pathname)
  const child = ensureInternalChildName(basename(absolute), '目标名')
  const parent = canonicalRoot(dirname(absolute))
  return { parent, path: join(parent.path, child), child }
}

function assertTreeContentEqual(expected, actual) {
  if (expected.treeSha256 !== actual.treeSha256) {
    fail('COPY_VERIFY_FAILED', `复制后目录树 digest 不一致：${actual.root}`, {
      source: expected.treeSha256,
      destination: actual.treeSha256,
    })
  }
  const before = expected.entries.map(({ path, type, size, mode, sha256: digest }) => ({ path, type, size, mode, sha256: digest }))
  const after = actual.entries.map(({ path, type, size, mode, sha256: digest }) => ({ path, type, size, mode, sha256: digest }))
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    fail('COPY_VERIFY_FAILED', `复制后逐文件 manifest 不一致：${actual.root}`, { source: before, destination: after })
  }
}

/**
 * Copy one already-inspected tree without following links, then re-read both
 * sides and compare the complete content manifest. Destination must not exist.
 */
/** @param {string} source @param {string} destination @param {{expectedManifest?: any}} [options] */
export function copyTreeVerified(source, destination, { expectedManifest } = {}) {
  const expected = expectedManifest ?? inspectTree(source)
  if (resolve(source) !== resolve(expected.root) && realpathSync.native(resolve(source)) !== expected.root) {
    fail('COPY_SOURCE_MISMATCH', 'expected manifest 不属于给定 source', { source, manifestRoot: expected.root })
  }
  revalidateTreeManifest(expected)
  const dest = destinationPath(destination)
  if (lstatOrNull(dest.path) !== null) fail('COPY_DEST_EXISTS', `复制目标已存在：${dest.path}`, { path: dest.path })

  mkdirSync(dest.path, { mode: expected.rootSnapshot.mode })
  chmodSync(dest.path, expected.rootSnapshot.mode)
  const directories = expected.entries
    .filter((entry) => entry.type === 'directory')
    .sort((a, b) => a.path.split('/').length - b.path.split('/').length || a.path.localeCompare(b.path, 'en'))
  for (const entry of directories) {
    const out = resolve(dest.path, entry.path)
    if (relative(dest.path, out).startsWith('..') || isAbsolute(relative(dest.path, out))) {
      fail('COPY_DEST_ESCAPE', `复制目标逃逸 staging：${entry.path}`, { path: entry.path })
    }
    mkdirSync(out, { mode: entry.mode })
    chmodSync(out, entry.mode)
  }

  for (const entry of expected.entries.filter((item) => item.type === 'file')) {
    const input = resolve(expected.root, entry.path)
    const output = resolve(dest.path, entry.path)
    if (relative(expected.root, input).startsWith('..') || relative(dest.path, output).startsWith('..')) {
      fail('COPY_PATH_ESCAPE', `复制条目逃逸：${entry.path}`, { path: entry.path })
    }
    const { buffer } = readRegularFileVerified(input, entry.snapshot)
    writeExclusiveFile(output, buffer, entry.mode)
  }

  for (const entry of [...directories].sort((a, b) => b.path.split('/').length - a.path.split('/').length)) {
    fsyncDirectory(resolve(dest.path, entry.path))
  }
  fsyncDirectory(dest.path)
  fsyncDirectory(dest.parent.path)
  revalidateTreeManifest(expected)
  const copied = inspectTree(dest.path)
  assertTreeContentEqual(expected, copied)
  return copied
}

/** Atomically replace one direct-child JSON file via exclusive temp + fsync + rename. */
export function atomicWriteJson(target, value, { mode = 0o600, space = 2 } = {}) {
  const dest = destinationPath(target)
  const existing = lstatOrNull(dest.path)
  if (existing) {
    const type = assertRegularTreeEntry(dest.path, existing)
    if (type !== 'file') fail('JSON_TARGET_TYPE', `JSON 目标不是普通文件：${dest.path}`, { path: dest.path, type })
  }
  const text = `${JSON.stringify(value, null, space)}\n`
  const tmpName = `.${dest.child}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`
  const tmp = join(dest.parent.path, tmpName)
  let tmpSnapshot = null
  try {
    tmpSnapshot = writeExclusiveFile(tmp, Buffer.from(text), mode)
    revalidatePathSnapshot(dest.parent.snapshot)
    revalidatePathSnapshot(tmpSnapshot)
    renameSync(tmp, dest.path)
    fsyncDirectory(dest.parent.path)
    const snapshot = snapshotPath(dest.path)
    if (snapshot.sha256 !== sha256(Buffer.from(text))) {
      fail('JSON_VERIFY_FAILED', `JSON 写后 digest 不一致：${dest.path}`, { path: dest.path })
    }
    return snapshot
  } catch (error) {
    if (tmpSnapshot) {
      try {
        revalidatePathSnapshot(tmpSnapshot)
        unlinkSync(tmp)
        fsyncDirectory(dest.parent.path)
      } catch {
        // Preserve the original error; a caller's journal/recovery owns residue policy.
      }
    }
    throw error
  }
}

/** Create and hold one root-local O_EXCL lock. Stale locks are never auto-removed. */
export function acquireRootLock(root, {
  name = '.preset-skill-transaction.lock',
  owner = {},
  mode = 0o600,
} = {}) {
  const info = asCanonicalRoot(root)
  const lockName = ensureInternalChildName(name, 'lock name')
  const path = join(info.path, lockName)
  const metadata = {
    version: 1,
    lockId: randomBytes(16).toString('hex'),
    pid: process.pid,
    startedAt: new Date().toISOString(),
    owner,
  }
  const bytes = Buffer.from(`${JSON.stringify(metadata, null, 2)}\n`)
  let fd
  try {
    fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | NOFOLLOW, mode)
    writeFileSync(fd, bytes)
    chmodSync(path, mode)
    fsyncSync(fd)
    const snapshot = { ...snapshotFromStat(path, fstatSync(fd, { bigint: true })), sha256: sha256(bytes) }
    fsyncDirectory(info.path)
    return { root: info, path, fd, snapshot, metadata, released: false }
  } catch (error) {
    if (fd !== undefined) closeSync(fd)
    if (errorCode(error) === 'EEXIST') {
      fail('LOCK_HELD', `root 已被另一事务锁定：${path}`, { path })
    }
    throw error
  }
}

/**
 * Explicitly remove one proven orphan lock for journal recovery.
 * This is never called by normal execution. The caller must provide the token
 * hash and batch id from the retained journal; a live/unknown PID is refused.
 */
/**
 * @param {any} root
 * @param {{name?: string, expectedTokenHash?: string, batchId?: string}} [options]
 */
export function adoptOrphanRootLock(root, {
  name = '.preset-skill-transaction.lock',
  expectedTokenHash,
  batchId,
} = {}) {
  const info = asCanonicalRoot(root)
  const lockName = ensureInternalChildName(name, 'lock name')
  const path = join(info.path, lockName)
  if (typeof expectedTokenHash !== 'string' || !/^[a-f0-9]{64}$/u.test(expectedTokenHash)) {
    fail('LOCK_ADOPTION_TOKEN', 'orphan lock adoption 缺合法 journal token hash')
  }
  if (typeof batchId !== 'string' || batchId.length === 0) {
    fail('LOCK_ADOPTION_BATCH', 'orphan lock adoption 缺 batch id')
  }
  const { buffer, snapshot } = readRegularFileVerified(path)
  let metadata
  try { metadata = JSON.parse(buffer.toString('utf8')) } catch (error) {
    fail('LOCK_ADOPTION_JSON', `lock metadata 无法解析：${path}`, { path, cause: errorMessage(error) })
  }
  const tokenHash = typeof metadata?.lockId === 'string'
    ? sha256(Buffer.from(metadata.lockId))
    : null
  if (metadata?.version !== 1 || tokenHash !== expectedTokenHash
      || metadata?.owner?.batchId !== batchId) {
    fail('LOCK_ADOPTION_MISMATCH', 'lock 与 retained journal 的 token/batch 不匹配', {
      path,
      expectedTokenHash,
      actualTokenHash: tokenHash,
      expectedBatchId: batchId,
      actualBatchId: metadata?.owner?.batchId ?? null,
    })
  }
  if (!Number.isInteger(metadata.pid) || metadata.pid <= 0) {
    fail('LOCK_ADOPTION_PID', 'lock owner pid 非法，拒绝猜测是否 orphan', { path, pid: metadata?.pid })
  }
  let ownerAlive = true
  try {
    process.kill(metadata.pid, 0)
  } catch (error) {
    if (errorCode(error) === 'ESRCH') ownerAlive = false
    else if (errorCode(error) !== 'EPERM') throw error
  }
  if (ownerAlive) {
    fail('LOCK_OWNER_ALIVE', `lock owner pid ${metadata.pid} 仍存在或无法证明已退出`, {
      path,
      pid: metadata.pid,
    })
  }

  let fd
  try {
    fd = openSync(path, constants.O_RDONLY | NOFOLLOW)
    const opened = snapshotFromStat(path, fstatSync(fd, { bigint: true }))
    assertSameIdentity(snapshot, opened)
    revalidatePathSnapshot(snapshot)
    unlinkSync(path)
    fsyncDirectory(info.path)
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
  return { path, snapshot, metadata, tokenHash }
}

/** Release only the exact dev/ino lock returned by acquireRootLock(). */
export function releaseRootLock(lock) {
  if (!lock || typeof lock.fd !== 'number' || !lock.snapshot || lock.released) {
    fail('LOCK_HANDLE', 'lock handle 非法或已经释放')
  }
  try {
    const held = snapshotFromStat(lock.path, fstatSync(lock.fd, { bigint: true }))
    assertSameIdentity(lock.snapshot, held)
    revalidatePathSnapshot(lock.snapshot)
    unlinkSync(lock.path)
    fsyncDirectory(lock.root.path)
    lock.released = true
  } finally {
    closeSync(lock.fd)
  }
}
