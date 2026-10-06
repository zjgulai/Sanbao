import { execFileSync } from 'node:child_process'
import {
  lstatSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs'
import { join } from 'node:path'

import { nativeBinaryKind } from './lib.mjs'

export const NODE_PTY_PLATFORM_PROJECTION = Object.freeze({
  name: 'node-pty',
  version: '1.2.0-beta.15',
  platform: 'darwin',
  architecture: 'arm64',
  physicalPackagePath: 'node-pty',
  retainedPrebuild: 'darwin-arm64',
  removedRelativePaths: Object.freeze([
    'prebuilds/darwin-x64',
    'prebuilds/linux-arm64',
    'prebuilds/linux-x64',
    'prebuilds/win32-arm64',
    'prebuilds/win32-x64',
    'third_party/conpty',
  ]),
})

function readManifest(path, label) {
  const entry = lstatIfPresent(path)
  if (entry === undefined || entry.isSymbolicLink() || !entry.isFile()) {
    throw new Error(`${label} must be a regular file: ${path}`)
  }
  let value
  try {
    value = JSON.parse(readFileSync(path, 'utf8'))
  } catch (cause) {
    throw new Error(`${label} is not valid JSON: ${path}`, { cause })
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object: ${path}`)
  }
  return value
}

function requireRealDirectory(path, label) {
  const entry = lstatIfPresent(path)
  if (entry === undefined || entry.isSymbolicLink() || !entry.isDirectory()) {
    throw new Error(`${label} must be a real directory: ${path}`)
  }
}

function lstatIfPresent(path) {
  try {
    return lstatSync(path)
  } catch (error) {
    if (error !== null && typeof error === 'object' && error.code === 'ENOENT') return undefined
    throw error
  }
}

function unexpectedVirtualStoreEntries(nodeModules) {
  const virtualStore = join(nodeModules, '.pnpm')
  const storeEntry = lstatIfPresent(virtualStore)
  if (storeEntry === undefined) return []
  if (storeEntry.isSymbolicLink() || !storeEntry.isDirectory()) {
    throw new Error(`pnpm virtual store must be a real directory: ${virtualStore}`)
  }
  return readdirSync(virtualStore).filter(name => /^node-pty(?:@|$)/u.test(name)).sort()
}

/**
 * node-pty publishes every platform's native payload in one package. This is the sole package-
 * aware exception to the default rule that retained third-party package contents remain intact.
 * The policy is version/path exact; anything new fails later in the full-tree native validator.
 */
export function projectKnownPlatformNativePayloads(nodeModules, input = {}) {
  const platform = input.platform ?? process.platform
  const architecture = input.architecture ?? process.arch
  if (platform !== NODE_PTY_PLATFORM_PROJECTION.platform
    || architecture !== NODE_PTY_PLATFORM_PROJECTION.architecture) {
    throw new Error(`node-pty native projection has no policy for ${platform}-${architecture}`)
  }
  const nodeModulesEntry = lstatIfPresent(nodeModules)
  if (nodeModulesEntry === undefined || nodeModulesEntry.isSymbolicLink() || !nodeModulesEntry.isDirectory()) {
    throw new Error(`installed node_modules must be a real directory: ${nodeModules}`)
  }
  const unexpectedRootEntries = readdirSync(nodeModules).filter(name => /^node-pty@/u.test(name)).sort()
  if (unexpectedRootEntries.length > 0) {
    throw new Error(`unsupported node-pty physical package path: ${unexpectedRootEntries.join(', ')}`)
  }
  const unexpectedStoreEntries = unexpectedVirtualStoreEntries(nodeModules)
  if (unexpectedStoreEntries.length > 0) {
    throw new Error(`unsupported node-pty physical package path: .pnpm/${unexpectedStoreEntries.join(', .pnpm/')}`)
  }
  const packageRoot = join(
    nodeModules,
    ...NODE_PTY_PLATFORM_PROJECTION.physicalPackagePath.split('/'),
  )
  const packageEntry = lstatIfPresent(packageRoot)
  if (packageEntry === undefined) return Object.freeze({ applied: false, removed: Object.freeze([]) })
  if (packageEntry.isSymbolicLink() || !packageEntry.isDirectory()) {
    throw new Error(`node-pty physical package path must be a real directory: ${NODE_PTY_PLATFORM_PROJECTION.physicalPackagePath}`)
  }
  const manifest = readManifest(join(packageRoot, 'package.json'), 'node-pty dependency manifest')
  if (manifest.name !== NODE_PTY_PLATFORM_PROJECTION.name) {
    throw new Error(`node-pty physical package path has unexpected package name: ${String(manifest.name)}`)
  }
  if (manifest.version !== NODE_PTY_PLATFORM_PROJECTION.version) {
    throw new Error(`unsupported node-pty platform projection version: ${String(manifest.version)}`)
  }
  requireRealDirectory(join(packageRoot, 'prebuilds'), 'node-pty prebuilds root')
  requireRealDirectory(join(packageRoot, 'third_party'), 'node-pty third-party root')
  const retained = join(
    packageRoot,
    'prebuilds',
    NODE_PTY_PLATFORM_PROJECTION.retainedPrebuild,
    'pty.node',
  )
  const retainedParent = join(packageRoot, 'prebuilds', NODE_PTY_PLATFORM_PROJECTION.retainedPrebuild)
  requireRealDirectory(retainedParent, 'node-pty retained prebuild directory')
  const retainedEntry = lstatIfPresent(retained)
  if (retainedEntry === undefined || retainedEntry.isSymbolicLink() || !retainedEntry.isFile()
    || nativeBinaryKind(retained) !== 'mach-o') {
    throw new Error('node-pty darwin-arm64 payload must be a regular Mach-O file')
  }
  const architectures = execFileSync('/usr/bin/lipo', ['-archs', retained], { encoding: 'utf8' })
    .trim()
    .split(/\s+/u)
  if (!architectures.includes(architecture)) {
    throw new Error(`node-pty retained payload does not contain ${architecture}`)
  }

  const removed = []
  for (const relativePath of NODE_PTY_PLATFORM_PROJECTION.removedRelativePaths) {
    const target = join(packageRoot, ...relativePath.split('/'))
    const entry = lstatIfPresent(target)
    if (entry === undefined) throw new Error(`node-pty platform projection path is missing: ${relativePath}`)
    if (entry.isSymbolicLink() || !entry.isDirectory()) {
      throw new Error(`node-pty platform projection path must be a real directory: ${relativePath}`)
    }
    rmSync(target, { recursive: true, force: true })
    removed.push(relativePath)
  }
  process.stdout.write(`[sage-packaging] node-pty ${manifest.version} platform projection retained ${NODE_PTY_PLATFORM_PROJECTION.retainedPrebuild}; removed ${removed.join(', ')}\n`)
  return Object.freeze({ applied: true, removed: Object.freeze(removed) })
}
