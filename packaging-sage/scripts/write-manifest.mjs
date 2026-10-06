import { createHash } from 'node:crypto'
import { lstatSync, mkdirSync, readlinkSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { loadConfig, packagingRoot, safeOutputPath, sha256File, walkTree } from './lib.mjs'

const artifact = process.argv[2]
const output = process.argv[3]
const phase = process.argv[4]
if (artifact === undefined || output === undefined || !['assembled', 'signed', 'dmg', 'installed-copy'].includes(phase)) {
  process.stderr.write('usage: node write-manifest.mjs <artifact> <output> <assembled|signed|dmg|installed-copy>\n')
  process.exit(2)
}

const config = loadConfig()
const resolvedOutput = safeOutputPath(output, [join(packagingRoot, 'staging'), join(packagingRoot, 'release')])
const entry = lstatSync(artifact)
let payload
if (entry.isFile()) {
  payload = {
    schemaVersion: 1,
    phase,
    product: config.productName,
    bundleId: config.bundleId,
    version: config.version,
    build: config.build,
    architecture: config.arch,
    distribution: config.distribution,
    artifact: { type: 'file', name: artifact.split('/').pop(), bytes: entry.size, sha256: sha256File(artifact) },
  }
} else if (entry.isDirectory() && !entry.isSymbolicLink()) {
  const rows = walkTree(artifact).map((row) => {
    if (row.kind === 'file') return { path: row.relative, type: 'file', mode: row.mode.toString(8), bytes: row.size, sha256: sha256File(row.absolute) }
    if (row.kind === 'symlink') return { path: row.relative, type: 'symlink', mode: row.mode.toString(8), target: readlinkSync(row.absolute) }
    return { path: row.relative, type: 'directory', mode: row.mode.toString(8) }
  })
  const canonical = JSON.stringify(rows)
  payload = {
    schemaVersion: 1,
    phase,
    product: config.productName,
    bundleId: config.bundleId,
    version: config.version,
    build: config.build,
    architecture: config.arch,
    distribution: config.distribution,
    artifact: {
      type: 'directory',
      name: artifact.split('/').pop(),
      treeSha256: createHash('sha256').update(canonical).digest('hex'),
      entries: rows,
    },
  }
} else {
  throw new Error(`unsupported artifact type: ${artifact}`)
}

mkdirSync(dirname(resolvedOutput), { recursive: true })
const temporary = `${resolvedOutput}.${process.pid}.tmp`
writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o644 })
renameSync(temporary, resolvedOutput)
process.stdout.write(`${phase} manifest: ${resolvedOutput}\n`)
