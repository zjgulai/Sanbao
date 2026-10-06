import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertDirectory, validateSymlinkTree } from './lib.mjs'

function inside(root, candidate) {
  const distance = relative(root, candidate)
  return distance === '' || (distance !== '..' && !distance.startsWith(`..${sep}`) && !isAbsolute(distance))
}

function dependencyPath(root, packageDir, name) {
  const parts = name.startsWith('@') ? name.split('/') : [name]
  if (parts.some(part => part === '' || part === '.' || part === '..')) {
    throw new Error(`invalid dependency name: ${name}`)
  }
  let cursor = packageDir
  while (inside(root, cursor)) {
    const manifest = join(cursor, 'node_modules', ...parts, 'package.json')
    if (existsSync(manifest)) {
      const entry = lstatSync(manifest)
      if (entry.isSymbolicLink() || !entry.isFile()) throw new Error(`dependency manifest is not a regular file: ${name}`)
      const canonical = realpathSync(manifest)
      if (!inside(join(root, 'node_modules'), canonical)) {
        throw new Error(`dependency resolves outside runtime node_modules: ${name}`)
      }
      return dirname(canonical)
    }
    const parent = dirname(cursor)
    if (parent === cursor) break
    cursor = parent
  }
  return undefined
}

function objectMap(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function readManifest(packageDir) {
  const path = join(packageDir, 'package.json')
  let value
  try {
    value = JSON.parse(readFileSync(path, 'utf8'))
  } catch (cause) {
    throw new Error(`dependency package.json is unreadable: ${path}`, { cause })
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || typeof value.name !== 'string' || value.name === ''
    || typeof value.version !== 'string' || value.version === '') {
    throw new Error(`dependency package.json has an unsupported identity: ${path}`)
  }
  return value
}

export function validateNodeDependencyClosure(runtimeRoot, directDependencies) {
  const root = assertDirectory(runtimeRoot, 'runtime root')
  const nodeModules = assertDirectory(join(root, 'node_modules'), 'runtime node_modules')
  const links = validateSymlinkTree(nodeModules)
  const queue = Object.keys(directDependencies).sort().map(name => ({ from: root, name, optional: false }))
  const visited = new Map()

  while (queue.length > 0) {
    const request = queue.shift()
    const packageDir = dependencyPath(root, request.from, request.name)
    if (packageDir === undefined) {
      if (request.optional) continue
      throw new Error(`runtime dependency is missing from its portable closure: ${request.name}`)
    }
    const key = realpathSync(packageDir)
    if (visited.has(key)) continue
    const manifest = readManifest(key)
    visited.set(key, { name: manifest.name, version: manifest.version })

    const dependencies = objectMap(manifest.dependencies)
    for (const name of Object.keys(dependencies).sort()) queue.push({ from: key, name, optional: false })
    const optionalDependencies = objectMap(manifest.optionalDependencies)
    for (const name of Object.keys(optionalDependencies).sort()) queue.push({ from: key, name, optional: true })
    const peerDependencies = objectMap(manifest.peerDependencies)
    const peerMeta = objectMap(manifest.peerDependenciesMeta)
    for (const name of Object.keys(peerDependencies).sort()) {
      const metadata = objectMap(peerMeta[name])
      queue.push({ from: key, name, optional: metadata.optional === true })
    }
  }

  return Object.freeze({
    packages: [...visited.values()].sort((left, right) => left.name.localeCompare(right.name) || left.version.localeCompare(right.version)),
    symlinks: links.length,
  })
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const runtimeRoot = process.argv[2]
  if (runtimeRoot === undefined) {
    process.stderr.write('usage: node node-closure.mjs <runtime-root>\n')
    process.exit(2)
  }
  try {
    const manifest = JSON.parse(readFileSync(join(runtimeRoot, 'package.json'), 'utf8'))
    const result = validateNodeDependencyClosure(runtimeRoot, objectMap(manifest.dependencies))
    process.stdout.write(`${JSON.stringify({ kind: 'node-dependency-closure', ...result })}\n`)
  } catch (error) {
    process.stderr.write(`[sage-packaging] ${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  }
}
