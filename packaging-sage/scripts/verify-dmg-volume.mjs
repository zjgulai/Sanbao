import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  lstatSync,
  mkdirSync,
  readlinkSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertDirectory,
  loadConfig,
  packagingRoot,
  ownedPackagingRoots,
  safeOutputPath,
  sha256File,
  walkTree,
} from './lib.mjs'

function canonicalTreeDigest(root) {
  const rows = walkTree(root).map((row) => {
    if (row.kind === 'file') {
      return {
        path: row.relative,
        type: 'file',
        mode: row.mode.toString(8),
        bytes: row.size,
        sha256: sha256File(row.absolute),
      }
    }
    if (row.kind === 'symlink') {
      return { path: row.relative, type: 'symlink', mode: row.mode.toString(8), target: row.target }
    }
    return { path: row.relative, type: 'directory', mode: row.mode.toString(8) }
  })
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex')
}

export function inspectVolumeRoot(mountpoint, volumeName) {
  const root = assertDirectory(mountpoint, 'DMG mountpoint')
  const entries = readdirSync(root).sort()
  if (JSON.stringify(entries) !== JSON.stringify(['Applications', 'Sage.app'])) {
    throw new Error(`DMG volume root must contain exactly Applications and Sage.app; observed ${entries.join(', ')}`)
  }

  const applicationsPath = join(root, 'Applications')
  const applications = lstatSync(applicationsPath)
  if (!applications.isSymbolicLink() || readlinkSync(applicationsPath) !== '/Applications') {
    throw new Error('DMG Applications entry must be the exact /Applications symlink')
  }

  const appPath = join(root, 'Sage.app')
  const app = lstatSync(appPath)
  if (app.isSymbolicLink() || !app.isDirectory()) throw new Error('DMG Sage.app must be a real directory')
  const volumeEntries = [
    {
      path: 'Applications',
      type: 'symlink',
      mode: (applications.mode & 0o777).toString(8),
      target: '/Applications',
    },
    {
      path: 'Sage.app',
      type: 'directory',
      mode: (app.mode & 0o777).toString(8),
      treeSha256: canonicalTreeDigest(appPath),
    },
  ]
  return {
    schemaVersion: 'sage.dmg-volume-inventory.v1',
    volumeName,
    readOnly: true,
    entries: volumeEntries,
    treeSha256: createHash('sha256').update(JSON.stringify(volumeEntries)).digest('hex'),
  }
}

export function validateMountEvidence(attach, disk, mountpoint, expectedVolumeName) {
  if (attach === null || typeof attach !== 'object' || Array.isArray(attach)
    || !Array.isArray(attach['system-entities'])) {
    throw new Error('hdiutil attach evidence has an unsupported shape')
  }
  const expectedMount = resolve(mountpoint)
  const mounted = attach['system-entities'].filter((entry) => entry !== null
    && typeof entry === 'object' && !Array.isArray(entry)
    && typeof entry['mount-point'] === 'string'
    && resolve(entry['mount-point']) === expectedMount)
  if (mounted.length !== 1 || typeof mounted[0]['dev-entry'] !== 'string'
    || !/^\/dev\/disk[0-9]+(?:s[0-9]+)?$/u.test(mounted[0]['dev-entry'])) {
    throw new Error('hdiutil attach evidence does not bind exactly one mounted device')
  }
  const device = mounted[0]['dev-entry']
  if (disk === null || typeof disk !== 'object' || Array.isArray(disk)
    || disk.DeviceNode !== device
    || typeof disk.MountPoint !== 'string' || resolve(disk.MountPoint) !== expectedMount
    || disk.VolumeName !== expectedVolumeName
    || disk.Writable !== false) {
    throw new Error('mounted DMG is not the expected read-only Sage volume')
  }
  return device
}

function plistFileToJson(path) {
  return JSON.parse(execFileSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', path], { encoding: 'utf8' }))
}

function diskInfoToJson(device, temporaryPlist) {
  const bytes = execFileSync('/usr/sbin/diskutil', ['info', '-plist', device])
  writeFileSync(temporaryPlist, bytes, { mode: 0o600 })
  try {
    return plistFileToJson(temporaryPlist)
  } finally {
    rmSync(temporaryPlist, { force: true })
  }
}

export function verifyMountedVolume({ mountpoint, attachPlist, output }) {
  const config = loadConfig()
  const resolvedOutput = safeOutputPath(output, ownedPackagingRoots(packagingRoot))
  mkdirSync(dirname(resolvedOutput), { recursive: true })
  const root = assertDirectory(mountpoint, 'DMG mountpoint')
  const attach = plistFileToJson(attachPlist)
  const candidates = attach?.['system-entities']?.filter((entry) => entry !== null
    && typeof entry === 'object' && !Array.isArray(entry)
    && typeof entry['mount-point'] === 'string'
    && resolve(entry['mount-point']) === resolve(root)) ?? []
  if (candidates.length !== 1 || typeof candidates[0]['dev-entry'] !== 'string') {
    throw new Error('hdiutil attach evidence does not identify the requested mountpoint')
  }
  const device = candidates[0]['dev-entry']
  if (!/^\/dev\/disk[0-9]+(?:s[0-9]+)?$/u.test(device)) {
    throw new Error(`hdiutil returned an unsafe device identifier: ${String(device)}`)
  }
  const diskInfo = diskInfoToJson(device, `${resolvedOutput}.${process.pid}.diskutil.plist`)
  validateMountEvidence(attach, diskInfo, root, config.dmg.volumeName)
  const inventory = inspectVolumeRoot(root, config.dmg.volumeName)

  const temporary = `${resolvedOutput}.${process.pid}.tmp`
  writeFileSync(temporary, `${JSON.stringify(inventory, null, 2)}\n`, { mode: 0o600 })
  renameSync(temporary, resolvedOutput)
  process.stdout.write(`${device}\n`)
  return inventory
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const [mountpoint, attachPlist, output] = process.argv.slice(2)
  if (mountpoint === undefined || attachPlist === undefined || output === undefined) {
    process.stderr.write('usage: node verify-dmg-volume.mjs <readonly-mountpoint> <hdiutil-attach.plist> <output>\n')
    process.exit(2)
  }
  try {
    verifyMountedVolume({ mountpoint, attachPlist, output })
  } catch (error) {
    process.stderr.write(`[sage-packaging] ${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  }
}
