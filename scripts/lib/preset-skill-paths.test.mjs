import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  closeSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  PathSafetyError,
  acquireRootLock,
  adoptOrphanRootLock,
  atomicWriteJson,
  canonicalRoot,
  copyTreeVerified,
  inspectTree,
  releaseRootLock,
  resolveContainedTarget,
  revalidatePathSnapshot,
  revalidateTreeManifest,
  snapshotPath,
  validateFinalName,
  validateFinalNames,
} from './preset-skill-paths.mjs'

const temps = []

afterEach(() => {
  while (temps.length > 0) rmSync(temps.pop(), { recursive: true, force: true })
})

function tempRoot(prefix = 'preset-skill-paths-') {
  const root = mkdtempSync(join(tmpdir(), prefix))
  temps.push(root)
  return root
}

function hasCode(code) {
  return (error) => error instanceof PathSafetyError && error.code === code
}

test('validateFinalName：只接受小写 ASCII kebab direct-child 名称', () => {
  assert.equal(validateFinalName('agent-fullstack-2'), 'agent-fullstack-2')
  for (const [value, code] of [
    ['', 'FINAL_NAME_EMPTY'],
    ['.', 'FINAL_NAME_TRAVERSAL'],
    ['..', 'FINAL_NAME_TRAVERSAL'],
    ['../outside', 'FINAL_NAME_SEPARATOR'],
    ['a/b', 'FINAL_NAME_SEPARATOR'],
    ['a\\b', 'FINAL_NAME_SEPARATOR'],
    ['/tmp/outside', 'FINAL_NAME_ABSOLUTE'],
    ['nul\u0000byte', 'FINAL_NAME_CONTROL'],
    ['line\u000abreak', 'FINAL_NAME_CONTROL'],
    ['Upper', 'FINAL_NAME_FORMAT'],
  ]) {
    assert.throws(() => validateFinalName(value), hasCode(code), JSON.stringify(value))
  }
})

test('validateFinalName：显式拒绝 NFD，不把平台归一化留给文件系统', () => {
  const nfd = 'e\u0301'
  assert.notEqual(nfd, nfd.normalize('NFC'))
  assert.throws(() => validateFinalName(nfd), hasCode('FINAL_NAME_NORMALIZATION'))
})

test('validateFinalNames：批内 exact duplicate 在触盘前判红', () => {
  assert.throws(() => validateFinalNames(['alpha', 'alpha']), hasCode('FINAL_NAME_COLLISION'))
})

test('validateFinalNames：direct child 的大小写别名冲突判红；精确更新必须显式 allow', () => {
  const root = tempRoot()
  mkdirSync(join(root, 'Alpha'))
  assert.throws(
    () => validateFinalNames(['alpha'], { root }),
    hasCode('DIRECT_CHILD_COLLISION'),
  )

  const exactRoot = tempRoot()
  mkdirSync(join(exactRoot, 'alpha'))
  assert.throws(() => validateFinalNames(['alpha'], { root: exactRoot }), hasCode('DIRECT_CHILD_EXISTS'))
  assert.deepEqual(
    validateFinalNames(['alpha'], { root: exactRoot, allowExisting: ['alpha'] }),
    ['alpha'],
  )
})

test('canonicalRoot / resolveContainedTarget：root 与 existing target symlink 均拒绝', () => {
  const holder = tempRoot()
  const realRoot = join(holder, 'real')
  const outside = join(holder, 'outside')
  mkdirSync(realRoot)
  mkdirSync(outside)
  const rootLink = join(holder, 'root-link')
  symlinkSync(realRoot, rootLink, 'dir')
  assert.throws(() => canonicalRoot(rootLink), hasCode('ROOT_SYMLINK'))

  const targetLink = join(realRoot, 'skill-a')
  symlinkSync(outside, targetLink, 'dir')
  assert.throws(
    () => resolveContainedTarget(canonicalRoot(realRoot), 'skill-a'),
    hasCode('TARGET_SYMLINK'),
  )
  assert.throws(
    () => resolveContainedTarget(canonicalRoot(realRoot), '../outside'),
    hasCode('FINAL_NAME_SEPARATOR'),
  )
})

test('canonicalRoot：文件系统根不能成为 destructive root', () => {
  assert.throws(() => canonicalRoot('/'), hasCode('ROOT_TOO_BROAD'))
})

test('inspectTree：逐文件 manifest 含 sha256/size/type，并保留空目录', () => {
  const root = tempRoot()
  mkdirSync(join(root, 'references'))
  mkdirSync(join(root, 'empty'))
  writeFileSync(join(root, 'SKILL.md'), 'skill body\n')
  writeFileSync(join(root, 'references', 'one.bin'), Buffer.from([0, 1, 2, 255]))

  const manifest = inspectTree(root)
  assert.equal(manifest.version, 1)
  assert.match(manifest.treeSha256, /^[a-f0-9]{64}$/)
  assert.deepEqual(manifest.entries.map((entry) => [entry.path, entry.type]), [
    ['empty', 'directory'],
    ['references', 'directory'],
    ['references/one.bin', 'file'],
    ['SKILL.md', 'file'],
  ])
  for (const file of manifest.entries.filter((entry) => entry.type === 'file')) {
    assert.equal(typeof file.size, 'number')
    assert.match(file.sha256, /^[a-f0-9]{64}$/)
    assert.ok(file.snapshot.dev)
    assert.ok(file.snapshot.ino)
  }
  assert.doesNotThrow(() => revalidateTreeManifest(manifest))
})

test('inspectTree：树内 symlink 一律拒绝', () => {
  const holder = tempRoot()
  const source = join(holder, 'source')
  mkdirSync(source)
  writeFileSync(join(holder, 'outside.txt'), 'outside')
  symlinkSync(join(holder, 'outside.txt'), join(source, 'linked.txt'))
  assert.throws(() => inspectTree(source), hasCode('SYMLINK_REJECTED'))
})

test('inspectTree：树内 hard link 一律拒绝', () => {
  const root = tempRoot()
  writeFileSync(join(root, 'a.txt'), 'same inode')
  linkSync(join(root, 'a.txt'), join(root, 'b.txt'))
  assert.throws(() => inspectTree(root), hasCode('HARD_LINK_REJECTED'))
})

test('revalidatePathSnapshot：同 inode、同 size 篡改也由 SHA-256 判红', () => {
  const root = tempRoot()
  const file = join(root, 'same-size.txt')
  writeFileSync(file, 'AAAA')
  const before = snapshotPath(file)
  writeFileSync(file, 'BBBB')
  const stat = lstatSync(file)
  assert.equal(stat.ino.toString(), before.ino)
  assert.equal(stat.size, before.size)
  assert.throws(() => revalidatePathSnapshot(before), hasCode('PATH_CONTENT_CHANGED'))
})

test('copyTreeVerified：不追随链接、逐文件复制、fsync 后双边 manifest 一致', () => {
  const holder = tempRoot()
  const source = join(holder, 'source')
  const destination = join(holder, 'staged-copy')
  mkdirSync(source)
  mkdirSync(join(source, 'scripts'))
  mkdirSync(join(source, 'empty'))
  writeFileSync(join(source, 'SKILL.md'), '---\nname: safe\n---\nbody\n')
  writeFileSync(join(source, 'scripts', 'run.sh'), '#!/bin/sh\necho ok\n')
  chmodSync(join(source, 'scripts', 'run.sh'), 0o755)
  writeFileSync(join(source, 'asset.bin'), Buffer.from([0, 4, 0, 8, 255]))

  const expected = inspectTree(source)
  const copied = copyTreeVerified(source, destination, { expectedManifest: expected })
  assert.equal(copied.treeSha256, expected.treeSha256)
  assert.deepEqual(readFileSync(join(destination, 'asset.bin')), Buffer.from([0, 4, 0, 8, 255]))
  assert.equal(lstatSync(join(destination, 'scripts', 'run.sh')).mode & 0o777, 0o755)
  assert.ok(lstatSync(join(destination, 'empty')).isDirectory())
})

test('copyTreeVerified：preflight 后同尺寸源篡改时，目标目录保持不存在', () => {
  const holder = tempRoot()
  const source = join(holder, 'source')
  const destination = join(holder, 'staged-copy')
  mkdirSync(source)
  writeFileSync(join(source, 'SKILL.md'), 'AAAA')
  const expected = inspectTree(source)
  writeFileSync(join(source, 'SKILL.md'), 'BBBB')

  assert.throws(
    () => copyTreeVerified(source, destination, { expectedManifest: expected }),
    hasCode('PATH_CONTENT_CHANGED'),
  )
  assert.equal(lstatSync(holder).isDirectory(), true)
  assert.throws(() => lstatSync(destination), /ENOENT/)
})

test('atomicWriteJson：拒绝 symlink 目标，并以 0600 原子写入普通目标', () => {
  const root = tempRoot()
  const outside = join(root, 'outside.json')
  const link = join(root, 'linked.json')
  writeFileSync(outside, '{"outside":true}\n')
  symlinkSync(outside, link)
  assert.throws(() => atomicWriteJson(link, { changed: true }), hasCode('SYMLINK_REJECTED'))
  assert.equal(readFileSync(outside, 'utf8'), '{"outside":true}\n')

  const target = join(root, 'journal.json')
  const snapshot = atomicWriteJson(target, { phase: 'prepared' })
  assert.deepEqual(JSON.parse(readFileSync(target, 'utf8')), { phase: 'prepared' })
  assert.equal(lstatSync(target).mode & 0o777, 0o600)
  assert.doesNotThrow(() => revalidatePathSnapshot(snapshot))
})

test('acquireRootLock：第二个 owner fail-fast，release 只删自己的 inode', () => {
  const root = tempRoot()
  const first = acquireRootLock(root, { owner: { operation: 'installer' } })
  assert.equal(first.metadata.owner.operation, 'installer')
  assert.throws(() => acquireRootLock(root, { owner: { operation: 'remover' } }), hasCode('LOCK_HELD'))
  releaseRootLock(first)
  assert.equal(first.released, true)

  const second = acquireRootLock(root, { owner: { operation: 'remover' } })
  assert.notEqual(second.metadata.lockId, first.metadata.lockId)
  releaseRootLock(second)
})

test('adoptOrphanRootLock：只接管 journal token/batch 精确匹配且 pid 已不存在的锁', () => {
  const root = tempRoot()
  const held = acquireRootLock(root, { owner: { name: 'crashed', batchId: 'batch-one' } })
  const tokenHash = createHash('sha256').update(held.metadata.lockId).digest('hex')
  assert.throws(() => adoptOrphanRootLock(root, {
    expectedTokenHash: tokenHash,
    batchId: 'batch-one',
  }), hasCode('LOCK_OWNER_ALIVE'))

  // Simulate the kernel closing the crashed process fd, then persist a PID that
  // is outside the platform range so kill(pid, 0) deterministically yields ESRCH.
  closeSync(held.fd)
  held.released = true
  const orphan = { ...held.metadata, pid: 2147483647 }
  writeFileSync(held.path, `${JSON.stringify(orphan, null, 2)}\n`)
  assert.throws(() => adoptOrphanRootLock(root, {
    expectedTokenHash: '0'.repeat(64),
    batchId: 'batch-one',
  }), hasCode('LOCK_ADOPTION_MISMATCH'))
  assert.throws(() => adoptOrphanRootLock(root, {
    expectedTokenHash: tokenHash,
    batchId: 'wrong-batch',
  }), hasCode('LOCK_ADOPTION_MISMATCH'))
  const adopted = adoptOrphanRootLock(root, {
    expectedTokenHash: tokenHash,
    batchId: 'batch-one',
  })
  assert.equal(adopted.metadata.pid, 2147483647)
  assert.equal(existsSync(held.path), false)
})
