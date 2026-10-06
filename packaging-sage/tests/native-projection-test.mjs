import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

import { packagingRoot } from '../scripts/lib.mjs'
import {
  NODE_PTY_PLATFORM_PROJECTION,
  projectKnownPlatformNativePayloads,
} from '../scripts/native-projection.mjs'

const stagingRoot = join(packagingRoot, 'staging')
mkdirSync(stagingRoot, { recursive: true })
const temporary = mkdtempSync(join(stagingRoot, '.native-projection-test.'))
const electron = join(
  packagingRoot,
  '..',
  'apps',
  'sage-shell',
  'node_modules',
  'electron',
  'dist',
  'Electron.app',
  'Contents',
  'MacOS',
  'Electron',
)
if (!existsSync(electron)) throw new Error('pinned arm64 Electron is required for the native projection test')

function fixture(name, options = {}) {
  const nodeModules = join(temporary, name, 'node_modules')
  const packageRoot = options.virtualStore === true
    ? join(
        nodeModules,
        '.pnpm',
        `node-pty@${options.version ?? NODE_PTY_PLATFORM_PROJECTION.version}`,
        'node_modules',
        'node-pty',
      )
    : join(nodeModules, ...NODE_PTY_PLATFORM_PROJECTION.physicalPackagePath.split('/'))
  mkdirSync(join(packageRoot, 'prebuilds', 'darwin-arm64'), { recursive: true })
  copyFileSync(electron, join(packageRoot, 'prebuilds', 'darwin-arm64', 'pty.node'))
  for (const relativePath of NODE_PTY_PLATFORM_PROJECTION.removedRelativePaths) {
    const directory = join(packageRoot, ...relativePath.split('/'))
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'published-payload.bin'), 'published fixture\n')
  }
  mkdirSync(join(packageRoot, 'src'), { recursive: true })
  mkdirSync(join(packageRoot, 'scripts'), { recursive: true })
  writeFileSync(join(packageRoot, 'src', 'index.js'), 'module.exports = {}\n')
  writeFileSync(join(packageRoot, 'scripts', 'prebuild.js'), 'module.exports = {}\n')
  writeFileSync(join(packageRoot, 'README.md'), '# node-pty fixture\n')
  writeFileSync(join(packageRoot, 'package.json'), `${JSON.stringify({
    name: 'node-pty',
    version: options.version ?? NODE_PTY_PLATFORM_PROJECTION.version,
    main: './src/index.js',
  })}\n`)
  if (options.omit !== undefined) rmSync(join(packageRoot, ...options.omit.split('/')), { recursive: true, force: true })
  return { nodeModules, packageRoot }
}

try {
  const valid = fixture('valid')
  const result = projectKnownPlatformNativePayloads(valid.nodeModules, {
    platform: 'darwin',
    architecture: 'arm64',
  })
  assert.equal(result.applied, true)
  assert.deepEqual([...result.removed], [...NODE_PTY_PLATFORM_PROJECTION.removedRelativePaths])
  for (const relativePath of NODE_PTY_PLATFORM_PROJECTION.removedRelativePaths) {
    assert.equal(existsSync(join(valid.packageRoot, ...relativePath.split('/'))), false, relativePath)
  }
  for (const relativePath of ['src/index.js', 'scripts/prebuild.js', 'README.md', 'prebuilds/darwin-arm64/pty.node']) {
    assert.equal(existsSync(join(valid.packageRoot, ...relativePath.split('/'))), true, relativePath)
  }
  const validation = spawnSync(process.execPath, [
    join(packagingRoot, 'scripts', 'validate-mach-o.mjs'),
    valid.nodeModules,
    'node-pty-projection-fixture',
  ], { encoding: 'utf8' })
  assert.equal(validation.status, 0, validation.stderr)

  const unknownVersion = fixture('unknown-version', { version: '1.2.0-beta.16' })
  assert.throws(
    () => projectKnownPlatformNativePayloads(unknownVersion.nodeModules, { platform: 'darwin', architecture: 'arm64' }),
    /unsupported node-pty platform projection version/u,
  )

  const missingPath = fixture('missing-path', { omit: 'prebuilds/linux-x64' })
  assert.throws(
    () => projectKnownPlatformNativePayloads(missingPath.nodeModules, { platform: 'darwin', architecture: 'arm64' }),
    /platform projection path is missing/u,
  )

  const unknownPayload = fixture('unknown-payload')
  const unexpected = join(unknownPayload.packageRoot, 'prebuilds', 'unknown-platform')
  mkdirSync(unexpected, { recursive: true })
  writeFileSync(join(unexpected, 'pty.node'), Buffer.from([0x7f, 0x45, 0x4c, 0x46]))
  projectKnownPlatformNativePayloads(unknownPayload.nodeModules, { platform: 'darwin', architecture: 'arm64' })
  const rejected = spawnSync(process.execPath, [
    join(packagingRoot, 'scripts', 'validate-mach-o.mjs'),
    unknownPayload.nodeModules,
    'unknown-native-payload-fixture',
  ], { encoding: 'utf8' })
  assert.notEqual(rejected.status, 0, 'unknown foreign native payload must fail closed')

  const unsupportedPhysicalPath = fixture('unsupported-physical-path', { virtualStore: true })
  assert.throws(
    () => projectKnownPlatformNativePayloads(unsupportedPhysicalPath.nodeModules, {
      platform: 'darwin',
      architecture: 'arm64',
    }),
    /unsupported node-pty physical package path/u,
  )

  const symlinkedAncestor = fixture('symlinked-ancestor')
  const externalPrebuilds = join(temporary, 'external-prebuilds')
  renameSync(join(symlinkedAncestor.packageRoot, 'prebuilds'), externalPrebuilds)
  symlinkSync(externalPrebuilds, join(symlinkedAncestor.packageRoot, 'prebuilds'))
  assert.throws(
    () => projectKnownPlatformNativePayloads(symlinkedAncestor.nodeModules, {
      platform: 'darwin',
      architecture: 'arm64',
    }),
    /prebuilds root must be a real directory/u,
  )

  const absentNodePty = join(temporary, 'absent-node-pty', 'node_modules')
  const unrelatedPublishedContent = join(absentNodePty, 'unrelated-package', 'vendor', 'node-pty')
  mkdirSync(unrelatedPublishedContent, { recursive: true })
  writeFileSync(join(unrelatedPublishedContent, 'package.json'), `${JSON.stringify({
    name: 'node-pty',
    version: 'unknown-published-content-version',
  })}\n`)
  assert.deepEqual(projectKnownPlatformNativePayloads(absentNodePty, {
    platform: 'darwin',
    architecture: 'arm64',
  }), { applied: false, removed: [] })
  process.stdout.write('node-pty exact platform projection: PASS\n')
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
