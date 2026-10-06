import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectRuntimeGraph } from './runtime-graph.mjs'
import { loadConfig, sha256Bytes, sha256File } from './lib.mjs'

function packageManifest(root, name) {
  const path = join(root, 'node_modules', ...name.split('/'), 'package.json')
  let value
  try {
    value = JSON.parse(readFileSync(path, 'utf8'))
  } catch (cause) {
    throw new Error(`runtime dependency manifest is unreadable: ${name}`, { cause })
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || typeof value.version !== 'string' || value.version === '') {
    throw new Error(`runtime dependency has no version: ${name}`)
  }
  return value
}

export function writeRuntimePackage(runtimeRoot) {
  const root = resolve(runtimeRoot)
  const config = loadConfig()
  const graph = collectRuntimeGraph(root)
  const files = graph.files.map(path => ({ path, sha256: sha256File(join(root, path)) }))
  const externalDependencies = graph.externalPackages.map(name => ({
    name,
    version: packageManifest(root, name).version,
  }))
  const closureBody = {
    schemaVersion: 'sage.runtime-closure.v1',
    entry: graph.entry,
    assets: graph.assets,
    providedModules: graph.providedModules,
    files,
    externalDependencies,
  }
  const manifest = {
    name: 'sage-shell-runtime',
    productName: config.productName,
    version: config.version,
    private: true,
    type: 'module',
    main: graph.entry,
    engines: { node: '^22.19.0 || >=24.0.0' },
    dependencies: Object.fromEntries(externalDependencies.map(entry => [entry.name, entry.version])),
    sageRuntimeClosure: {
      ...closureBody,
      digest: `sha256:${sha256Bytes(Buffer.from(JSON.stringify(closureBody), 'utf8'))}`,
    },
  }
  const output = join(root, 'package.json')
  mkdirSync(dirname(output), { recursive: true })
  const temporary = `${output}.${process.pid}.tmp`
  writeFileSync(temporary, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o644 })
  renameSync(temporary, output)
  return manifest
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const root = process.argv[2]
  if (root === undefined) {
    process.stderr.write('usage: node write-runtime-package.mjs <runtime-root>\n')
    process.exit(2)
  }
  try {
    const manifest = writeRuntimePackage(root)
    process.stdout.write(`${JSON.stringify({
      kind: 'runtime-package',
      files: manifest.sageRuntimeClosure.files.length,
      dependencies: Object.keys(manifest.dependencies).length,
      digest: manifest.sageRuntimeClosure.digest,
    })}\n`)
  } catch (error) {
    process.stderr.write(`[sage-packaging] ${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  }
}
