import { createHash } from 'node:crypto'
import { lstatSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfig, ownedPackagingRoots, packagingRoot, safeOutputPath, sha256File } from './lib.mjs'

function readJson(path, label) {
  const entry = lstatSync(path)
  if (entry.isSymbolicLink() || !entry.isFile()) throw new Error(`${label} must be a regular file`)
  let value
  try {
    value = JSON.parse(readFileSync(path, 'utf8'))
  } catch (cause) {
    throw new Error(`${label} must be valid JSON`, { cause })
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`)
  return value
}

function exactKeys(value, expected) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort())
}

function assertArtifactManifest(value, phase, config, label) {
  if (!exactKeys(value, [
    'schemaVersion', 'phase', 'product', 'bundleId', 'version', 'build',
    'architecture', 'distribution', 'artifact',
  ])
    || value.schemaVersion !== 1 || value.phase !== phase
    || value.product !== config.productName || value.bundleId !== config.bundleId
    || value.version !== config.version || value.build !== config.build
    || value.architecture !== config.arch || value.distribution !== config.distribution
    || !exactKeys(value.artifact, ['type', 'name', 'treeSha256', 'entries'])
    || value.artifact.type !== 'directory' || value.artifact.name !== 'Sage.app'
    || typeof value.artifact.treeSha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(value.artifact.treeSha256)
    || !Array.isArray(value.artifact.entries)) {
    throw new Error(`${label} does not match the Sage ${phase} manifest contract`)
  }
}

function assertSigningReceipt(value, config) {
  if (!exactKeys(value, [
    'schemaVersion', 'product', 'bundleId', 'version', 'build', 'mode',
    'identityCommonName', 'certificateSha256', 'certificateSha1', 'timestamp',
    'signedAppTreeSha256', 'signingPlanSha256', 'designatedRequirement',
    'hardenedRuntime', 'appSandbox', 'notarized',
  ])
    || value.schemaVersion !== 'sage.local-signing-receipt.v2'
    || value.product !== config.productName || value.bundleId !== config.bundleId
    || value.version !== config.version || value.build !== config.build
    || value.mode !== config.signing.mode
    || value.identityCommonName !== config.signing.identityCommonName
    || typeof value.certificateSha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(value.certificateSha256)
    || typeof value.certificateSha1 !== 'string' || !/^[a-f0-9]{40}$/u.test(value.certificateSha1)
    || typeof value.signedAppTreeSha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(value.signedAppTreeSha256)
    || typeof value.signingPlanSha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(value.signingPlanSha256)
    || typeof value.designatedRequirement !== 'string' || value.designatedRequirement === ''
    || value.timestamp !== 'none'
    || value.hardenedRuntime !== config.signing.hardenedRuntime
    || value.appSandbox !== config.signing.appSandbox
    || value.notarized !== config.signing.notarized) {
    throw new Error('signing receipt does not match the Sage DMG contract')
  }
}

function assertVolumeInventory(value, config) {
  if (!exactKeys(value, ['schemaVersion', 'volumeName', 'readOnly', 'entries', 'treeSha256'])
    || value.schemaVersion !== 'sage.dmg-volume-inventory.v1'
    || value.volumeName !== config.dmg.volumeName || value.readOnly !== true
    || !Array.isArray(value.entries) || value.entries.length !== 2
    || typeof value.treeSha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(value.treeSha256)) {
    throw new Error('volume inventory does not match the Sage DMG contract')
  }
  const [applications, app] = value.entries
  if (!exactKeys(applications, ['path', 'type', 'mode', 'target'])
    || applications.path !== 'Applications' || applications.type !== 'symlink'
    || typeof applications.mode !== 'string' || !/^[0-7]{3}$/u.test(applications.mode)
    || applications.target !== '/Applications'
    || !exactKeys(app, ['path', 'type', 'mode', 'treeSha256'])
    || app.path !== 'Sage.app' || app.type !== 'directory'
    || typeof app.mode !== 'string' || !/^[0-7]{3}$/u.test(app.mode)
    || typeof app.treeSha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(app.treeSha256)) {
    throw new Error('volume inventory entries are not the exact Sage.app and /Applications symlink pair')
  }
  const expectedTree = createHash('sha256').update(JSON.stringify(value.entries)).digest('hex')
  if (value.treeSha256 !== expectedTree) throw new Error('volume inventory tree digest is invalid')
  return app.treeSha256
}

export function writeDmgReceipt({
  dmg,
  sourceManifestPath,
  installedManifestPath,
  signingReceiptPath,
  volumeInventoryPath,
  output,
}) {
  const config = loadConfig()
  const entry = lstatSync(dmg)
  if (!entry.isFile() || entry.isSymbolicLink()) throw new Error('DMG receipt input must be a regular file')
  if (basename(dmg) !== config.dmg.fileName) throw new Error('DMG receipt input filename does not match product configuration')
  const source = readJson(sourceManifestPath, 'source app manifest')
  const installed = readJson(installedManifestPath, 'installed app manifest')
  const signing = readJson(signingReceiptPath, 'signing receipt')
  const volume = readJson(volumeInventoryPath, 'volume inventory')
  assertArtifactManifest(source, 'signed', config, 'source app manifest')
  assertArtifactManifest(installed, 'installed-copy', config, 'installed app manifest')
  assertSigningReceipt(signing, config)
  const sourceTree = source.artifact?.treeSha256
  const installedTree = installed.artifact?.treeSha256
  const mountedTree = assertVolumeInventory(volume, config)
  if (sourceTree !== installedTree || sourceTree !== mountedTree || sourceTree !== signing.signedAppTreeSha256) {
    throw new Error('source, installed-copy, and mounted app evidence do not carry the same signed tree digest')
  }
  const receipt = {
    schemaVersion: 'sage.dmg-receipt.v1',
    phase: 'dmg',
    product: config.productName,
    bundleId: config.bundleId,
    version: config.version,
    build: config.build,
    architecture: config.arch,
    distribution: config.distribution,
    artifact: {
      type: 'file',
      name: basename(dmg),
      bytes: entry.size,
      sha256: sha256File(dmg),
    },
    app: {
      name: 'Sage.app',
      treeSha256: sourceTree,
    },
    signing: {
      mode: signing.mode,
      identityCommonName: signing.identityCommonName,
      certificateSha256: signing.certificateSha256,
      certificateSha1: signing.certificateSha1,
      timestamp: signing.timestamp,
      hardenedRuntime: signing.hardenedRuntime,
      appSandbox: signing.appSandbox,
      notarized: signing.notarized,
    },
    volume: {
      format: config.dmg.format,
      name: volume.volumeName,
      readOnly: volume.readOnly,
      entries: volume.entries,
      treeSha256: volume.treeSha256,
    },
  }
  const resolvedOutput = safeOutputPath(output, ownedPackagingRoots(packagingRoot))
  mkdirSync(dirname(resolvedOutput), { recursive: true })
  const temporary = `${resolvedOutput}.${process.pid}.tmp`
  writeFileSync(temporary, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o644 })
  renameSync(temporary, resolvedOutput)
  process.stdout.write(`dmg manifest: ${resolvedOutput}\n`)
  return receipt
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const [dmg, sourceManifestPath, installedManifestPath, signingReceiptPath, volumeInventoryPath, output] = process.argv.slice(2)
  if ([dmg, sourceManifestPath, installedManifestPath, signingReceiptPath, volumeInventoryPath, output]
    .some(value => value === undefined)) {
    process.stderr.write('usage: node write-dmg-receipt.mjs <dmg> <source-app-manifest> <installed-app-manifest> <signing-receipt> <volume-inventory> <output>\n')
    process.exit(2)
  }
  try {
    writeDmgReceipt({
      dmg,
      sourceManifestPath,
      installedManifestPath,
      signingReceiptPath,
      volumeInventoryPath,
      output,
    })
  } catch (error) {
    process.stderr.write(`[sage-packaging] ${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  }
}
