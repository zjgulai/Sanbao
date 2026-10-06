import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inspectVolumeRoot, validateMountEvidence } from '../scripts/verify-dmg-volume.mjs'
import { writeDmgReceipt } from '../scripts/write-dmg-receipt.mjs'

const packagingRoot = fileURLToPath(new URL('../', import.meta.url))
const stagingRoot = join(packagingRoot, 'staging')
mkdirSync(stagingRoot, { recursive: true })
const temporaryRoot = mkdtempSync(join(stagingRoot, '.dmg-contract-test.'))

const config = JSON.parse(readFileSync(join(packagingRoot, 'product.json'), 'utf8'))

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
}

function manifest(phase, treeSha256) {
  return {
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
      name: 'Sage.app',
      treeSha256,
      entries: [],
    },
  }
}

try {
  const mountpoint = join(temporaryRoot, 'mounted-volume')
  const app = join(mountpoint, 'Sage.app')
  mkdirSync(join(app, 'Contents'), { recursive: true })
  writeFileSync(join(app, 'Contents', 'fixture.txt'), 'signed fixture bytes\n')
  symlinkSync('/Applications', join(mountpoint, 'Applications'))

  const inventory = inspectVolumeRoot(mountpoint, config.dmg.volumeName)
  assert.equal(inventory.schemaVersion, 'sage.dmg-volume-inventory.v1')
  assert.equal(inventory.readOnly, true)
  assert.deepEqual(inventory.entries.map(entry => entry.path), ['Applications', 'Sage.app'])
  assert.match(inventory.entries[1].treeSha256, /^[a-f0-9]{64}$/u)
  assert.equal(
    inventory.treeSha256,
    createHash('sha256').update(JSON.stringify(inventory.entries)).digest('hex'),
  )

  writeFileSync(join(mountpoint, 'unexpected.txt'), 'not allowed')
  assert.throws(
    () => inspectVolumeRoot(mountpoint, config.dmg.volumeName),
    /must contain exactly Applications and Sage\.app/u,
  )
  rmSync(join(mountpoint, 'unexpected.txt'))

  rmSync(join(mountpoint, 'Applications'))
  symlinkSync('/tmp', join(mountpoint, 'Applications'))
  assert.throws(
    () => inspectVolumeRoot(mountpoint, config.dmg.volumeName),
    /must be the exact \/Applications symlink/u,
  )
  rmSync(join(mountpoint, 'Applications'))
  symlinkSync('/Applications', join(mountpoint, 'Applications'))

  const device = '/dev/disk99s1'
  const attach = {
    'system-entities': [
      { 'dev-entry': '/dev/disk99', 'content-hint': 'GUID_partition_scheme' },
      { 'dev-entry': device, 'mount-point': mountpoint, 'volume-kind': 'hfs' },
    ],
    'framework-version': 1,
  }
  const disk = {
    DeviceNode: device,
    MountPoint: mountpoint,
    VolumeName: config.dmg.volumeName,
    Writable: false,
  }
  assert.equal(validateMountEvidence(attach, disk, mountpoint, config.dmg.volumeName), device)
  assert.throws(
    () => validateMountEvidence(attach, { ...disk, Writable: true }, mountpoint, config.dmg.volumeName),
    /not the expected read-only Sage volume/u,
  )

  const dmg = join(temporaryRoot, config.dmg.fileName)
  const sourceManifestPath = join(temporaryRoot, 'source-manifest.json')
  const installedManifestPath = join(temporaryRoot, 'installed-manifest.json')
  const signingReceiptPath = join(temporaryRoot, 'signing-receipt.json')
  const volumeInventoryPath = join(temporaryRoot, 'volume-inventory.json')
  const output = join(temporaryRoot, `${config.dmg.fileName}.manifest.json`)
  const appTreeSha256 = inventory.entries[1].treeSha256
  writeFileSync(dmg, 'fixture DMG bytes')
  writeJson(sourceManifestPath, manifest('signed', appTreeSha256))
  writeJson(installedManifestPath, manifest('installed-copy', appTreeSha256))
  writeJson(signingReceiptPath, {
    schemaVersion: 'sage.local-signing-receipt.v2',
    product: config.productName,
    bundleId: config.bundleId,
    version: config.version,
    build: config.build,
    mode: config.signing.mode,
    identityCommonName: config.signing.identityCommonName,
    certificateSha256: 'a'.repeat(64),
    certificateSha1: 'b'.repeat(40),
    signedAppTreeSha256: appTreeSha256,
    signingPlanSha256: 'd'.repeat(64),
    designatedRequirement: 'identifier "com.lute.sage" and anchor cdhash H"fixture"',
    timestamp: 'none',
    hardenedRuntime: config.signing.hardenedRuntime,
    appSandbox: config.signing.appSandbox,
    notarized: config.signing.notarized,
  })
  writeJson(volumeInventoryPath, inventory)

  const receipt = writeDmgReceipt({
    dmg,
    sourceManifestPath,
    installedManifestPath,
    signingReceiptPath,
    volumeInventoryPath,
    output,
  })
  assert.equal(receipt.artifact.sha256, createHash('sha256').update('fixture DMG bytes').digest('hex'))
  assert.equal(receipt.app.treeSha256, appTreeSha256)
  assert.equal(receipt.signing.certificateSha256, 'a'.repeat(64))
  assert.equal(receipt.volume.treeSha256, inventory.treeSha256)
  assert.deepEqual(receipt.volume.entries, inventory.entries)
  assert.deepEqual(JSON.parse(readFileSync(output, 'utf8')), receipt)

  const mismatchedManifestPath = join(temporaryRoot, 'mismatched-installed-manifest.json')
  const rejectedOutput = join(temporaryRoot, 'rejected.manifest.json')
  writeJson(mismatchedManifestPath, manifest('installed-copy', 'c'.repeat(64)))
  assert.throws(
    () => writeDmgReceipt({
      dmg,
      sourceManifestPath,
      installedManifestPath: mismatchedManifestPath,
      signingReceiptPath,
      volumeInventoryPath,
      output: rejectedOutput,
    }),
    /do not carry the same signed tree digest/u,
  )
  assert.equal(existsSync(rejectedOutput), false)

  process.stdout.write('dmg contract fixture: PASS\n')
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true })
}
