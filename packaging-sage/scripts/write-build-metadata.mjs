import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import {
  assertDirectory,
  loadConfig,
  safeOutputPath,
  packagingRoot,
  sha256File,
  walkTree,
} from './lib.mjs'
import { signingNormalizedTreeDigest } from './signing-normalized-tree.mjs'

const output = process.argv[2]
const appRuntimeRoot = process.argv[3]
const profileTemplateRoot = process.argv[4]
const electronAppRoot = process.argv[5]
const sourceCommit = process.argv[6]
if (output === undefined || appRuntimeRoot === undefined || profileTemplateRoot === undefined
  || electronAppRoot === undefined || sourceCommit === undefined || !/^[a-f0-9]{40}$/u.test(sourceCommit)) {
  process.stderr.write('usage: node write-build-metadata.mjs <output> <app-runtime-root> <profile-template-root> <Electron.app> <40-char-commit>\n')
  process.exit(2)
}

function digestRows(rows) {
  const canonical = rows.map(row => {
    if (row.kind === 'file') {
      return { path: row.relative, type: 'file', mode: row.mode.toString(8), bytes: row.size, sha256: sha256File(row.absolute) }
    }
    if (row.kind === 'symlink') {
      return { path: row.relative, type: 'symlink', mode: row.mode.toString(8), target: row.target ?? readlinkSync(row.absolute) }
    }
    return { path: row.relative, type: 'directory', mode: row.mode.toString(8) }
  })
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
}

function treeDigest(root) {
  return digestRows(walkTree(assertDirectory(root, 'build metadata input')))
}

function packagingDefinitionDigest() {
  const root = assertDirectory(packagingRoot, 'packaging definition root')
  const rows = []
  const visit = (path) => {
    for (const name of readdirSync(path).sort()) {
      if (path === root && (name === 'staging' || name === 'release')) continue
      const absolute = join(path, name)
      const entry = lstatSync(absolute)
      const relativePath = relative(root, absolute).split(sep).join('/')
      if (entry.isSymbolicLink()) {
        rows.push({ absolute, relative: relativePath, kind: 'symlink', target: readlinkSync(absolute), mode: entry.mode & 0o777 })
      } else if (entry.isDirectory()) {
        rows.push({ absolute, relative: relativePath, kind: 'directory', mode: entry.mode & 0o777 })
        visit(absolute)
      } else if (entry.isFile()) {
        rows.push({ absolute, relative: relativePath, kind: 'file', size: entry.size, mode: entry.mode & 0o777 })
      } else {
        throw new Error(`unsupported packaging definition entry: ${relativePath}`)
      }
    }
  }
  visit(root)
  return digestRows(rows)
}

const config = loadConfig()
const resolvedOutput = safeOutputPath(output, [join(packagingRoot, 'staging'), join(packagingRoot, 'release')])
const template = JSON.parse(readFileSync(join(profileTemplateRoot, 'template-manifest.json'), 'utf8'))
const repoRoot = execFileSync('git', ['-C', packagingRoot, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
const observedHead = execFileSync('git', ['-C', repoRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
if (sourceCommit !== observedHead) {
  throw new Error(`source commit does not match repository HEAD: expected ${observedHead}, received ${sourceCommit}`)
}
const relevantStatus = execFileSync('git', [
  '-C', repoRoot, 'status', '--porcelain=v1', '--untracked-files=all', '--',
  'apps/sage-shell', 'packaging-sage', 'assets/sage',
], { encoding: 'utf8' }).trim()
const relevantTrackedWorktreeClean = relevantStatus === ''
const metadata = {
  schemaVersion: 4,
  product: {
    name: config.productName,
    bundleId: config.bundleId,
    version: config.version,
    build: config.build,
    architecture: config.arch,
    distribution: config.distribution,
  },
  runtime: {
    electronVersion: config.electronVersion,
    profileGeneration: template.generation,
    profileManifestSha256: template.profileManifestSha256,
    artifactAttestationDigest: template.artifactAttestationDigest,
  },
  inputs: {
    sourceAppRuntimeTreeSha256: treeDigest(appRuntimeRoot),
    sourceProfileTemplateTreeSha256: treeDigest(profileTemplateRoot),
    sourceElectronBaseAppTreeSha256: treeDigest(electronAppRoot),
    iconSha256: sha256File(join(repoRoot, config.icon)),
    packagingDefinitionTreeSha256: packagingDefinitionDigest(),
  },
  assembly: {
    appRuntimeSigningNormalizedTreeSha256: signingNormalizedTreeDigest(appRuntimeRoot),
    profileTemplateSigningNormalizedTreeSha256: signingNormalizedTreeDigest(profileTemplateRoot),
  },
  signing: {
    mode: config.signing.mode,
    identityCommonName: config.signing.identityCommonName,
    hardenedRuntime: config.signing.hardenedRuntime,
    appSandbox: config.signing.appSandbox,
    notarized: config.signing.notarized,
  },
  source: {
    commit: sourceCommit,
    relevantTrackedWorktreeClean,
    provenance: 'source-context-plus-input-byte-digests',
  },
}
mkdirSync(dirname(resolvedOutput), { recursive: true })
const temporary = `${resolvedOutput}.${process.pid}.tmp`
writeFileSync(temporary, `${JSON.stringify(metadata, null, 2)}\n`, { mode: 0o644 })
renameSync(temporary, resolvedOutput)
