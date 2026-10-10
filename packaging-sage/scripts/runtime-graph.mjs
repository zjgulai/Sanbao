import { builtinModules } from 'node:module'
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export const RUNTIME_ENTRY = 'lib/main/index.js'
export const RUNTIME_ASSETS = Object.freeze(['lib/main/sanbao-host-preload.cjs'])
export const PROVIDED_MODULES = Object.freeze(['electron'])

const BUILTINS = new Set([
  ...builtinModules,
  ...builtinModules.map(name => `node:${name}`),
  // Builtins the RUNTIME provides beyond this build host's `builtinModules`: the packaging host
  // may run an older Node than the packaged Electron runtime (43.3.0 = Node 24.18), and a missed
  // name would be misread as an npm package the producer then tries to install.
  'sqlite',
  'node:sqlite',
])

function portable(path) {
  return path.split(sep).join('/')
}

function inside(root, candidate) {
  const distance = relative(root, candidate)
  return distance === '' || (distance !== '..' && !distance.startsWith(`..${sep}`) && !isAbsolute(distance))
}

function literalSpecifiers(source) {
  const values = new Set()
  const patterns = [
    /\b(?:import|export)\s+(?:[^'";]*?\s+from\s*)?['"]([^'"]+)['"]/gu,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/gu,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/gu,
  ]
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) values.add(match[1])
  }
  return [...values]
}

function externalPackageName(specifier) {
  if (specifier.startsWith('@')) {
    const [scope, name] = specifier.split('/')
    if (!scope || !name) throw new Error(`invalid scoped package specifier: ${specifier}`)
    return `${scope}/${name}`
  }
  return specifier.split('/')[0]
}

function resolveLocal(root, importer, specifier) {
  if (!specifier.startsWith('.')) throw new Error(`not a relative specifier: ${specifier}`)
  const base = resolve(dirname(importer), specifier)
  const candidates = extname(base) === ''
    ? [base, `${base}.js`, `${base}.cjs`, join(base, 'index.js'), join(base, 'index.cjs')]
    : [base]
  const match = candidates.find(path => existsSync(path))
  if (match === undefined) throw new Error(`runtime import is missing: ${portable(relative(root, importer))} -> ${specifier}`)
  const entry = lstatSync(match)
  if (entry.isSymbolicLink() || !entry.isFile()) {
    throw new Error(`runtime import must resolve to a regular file: ${portable(relative(root, match))}`)
  }
  const canonical = realpathSync(match)
  if (!inside(root, canonical)) throw new Error(`runtime import escapes its root: ${specifier}`)
  if (!['.js', '.cjs'].includes(extname(canonical))) {
    throw new Error(`runtime import has an unsupported extension: ${portable(relative(root, canonical))}`)
  }
  return canonical
}

export function collectRuntimeGraph(inputRoot) {
  const root = realpathSync(inputRoot)
  const queue = [RUNTIME_ENTRY, ...RUNTIME_ASSETS].map(path => {
    const candidate = join(root, path)
    if (!existsSync(candidate)) throw new Error(`required runtime entry is missing: ${path}`)
    return realpathSync(candidate)
  })
  const files = new Set()
  const externals = new Set()
  const provided = new Set()

  while (queue.length > 0) {
    const file = queue.shift()
    const relativePath = portable(relative(root, file))
    if (!inside(root, file)) throw new Error(`runtime graph file escapes its root: ${file}`)
    if (files.has(relativePath)) continue
    files.add(relativePath)
    const source = readFileSync(file, 'utf8')
    for (const specifier of literalSpecifiers(source)) {
      if (specifier.startsWith('.')) {
        queue.push(resolveLocal(root, file, specifier))
        continue
      }
      if (specifier.startsWith('/') || specifier.startsWith('file:')) {
        throw new Error(`runtime module uses an absolute import: ${relativePath} -> ${specifier}`)
      }
      if (BUILTINS.has(specifier)) continue
      const packageName = externalPackageName(specifier)
      if (PROVIDED_MODULES.includes(packageName)) provided.add(packageName)
      else externals.add(packageName)
    }
  }

  return Object.freeze({
    entry: RUNTIME_ENTRY,
    assets: [...RUNTIME_ASSETS],
    files: [...files].sort(),
    externalPackages: [...externals].sort(),
    providedModules: [...provided].sort(),
  })
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const root = process.argv[2]
  if (root === undefined) {
    process.stderr.write('usage: node runtime-graph.mjs <runtime-root>\n')
    process.exit(2)
  }
  try {
    process.stdout.write(`${JSON.stringify(collectRuntimeGraph(root), null, 2)}\n`)
  } catch (error) {
    process.stderr.write(`[sage-packaging] ${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  }
}
