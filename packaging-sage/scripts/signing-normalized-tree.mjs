import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
} from 'node:fs'
import { join } from 'node:path'
import {
  assertDirectory,
  nativeBinaryKind,
  packagingRoot,
  sha256File,
  walkTree,
} from './lib.mjs'

const CODESIGN_ENV = Object.freeze({
  LANG: 'C',
  LC_ALL: 'C',
  PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
})

function withoutCodeSignature(path) {
  const result = spawnSync('/usr/bin/codesign', ['--remove-signature', path], {
    encoding: 'utf8',
    env: CODESIGN_ENV,
    timeout: 30_000,
    killSignal: 'SIGKILL',
    maxBuffer: 4 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (result.error !== undefined) throw result.error
  if (result.status === 0) return
  const detail = `${result.stdout}\n${result.stderr}`
  if (/code object is not signed at all/iu.test(detail)) return
  throw new Error(`could not normalize Mach-O code signature: ${detail.trim() || `exit ${String(result.status)}`}`)
}

const MH_MAGIC_64 = 0xfeedfacf
const LC_SEGMENT_64 = 0x19
/** LC_SEGMENT_64 layout: cmd(4) cmdsize(4) segname(16) vmaddr(8) vmsize(8). */
const SEGMENT_VMSIZE_OFFSET = 32

/**
 * Byte offset of the `__LINKEDIT` segment's `vmsize` field in a thin 64-bit little-endian
 * Mach-O. `codesign --remove-signature` restores every other byte of a signature but leaves
 * this field at the layout computed while the file WAS signed (the signature's size feeds the
 * segment's mapped size) — all 13 real profile-template natives differed from their source
 * inputs in exactly this field and nothing else (2026-10-10 DMG chain, same file). The digest
 * zeroes it, because it is signature residue, not source content.
 */
export function linkeditVmsizeOffset(bytes) {
  if (bytes.length < 32 || bytes.readUInt32LE(0) !== MH_MAGIC_64) {
    throw new Error('signing-normalized digest requires a thin 64-bit little-endian Mach-O image')
  }
  const ncmds = bytes.readUInt32LE(16)
  let offset = 32
  for (let index = 0; index < ncmds; index += 1) {
    if (offset + 8 > bytes.length) throw new Error('Mach-O load commands run past the end of the file')
    const command = bytes.readUInt32LE(offset)
    const commandSize = bytes.readUInt32LE(offset + 4)
    if (commandSize < 8 || offset + commandSize > bytes.length) {
      throw new Error('Mach-O load command has an invalid size')
    }
    if (command === LC_SEGMENT_64
      && bytes.toString('latin1', offset + 8, offset + 24).replace(/\0+$/u, '') === '__LINKEDIT') {
      return offset + SEGMENT_VMSIZE_OFFSET
    }
    offset += commandSize
  }
  return null
}

/**
 * Digest a runtime tree after removing only embedded Mach-O signature superblobs from private
 * copies (and zeroing the `__LINKEDIT` vmsize field they leave behind). This keeps source input
 * provenance stable across the later leaf-to-root signing step; every non-signature byte, file
 * mode, path, directory, and symlink remains authoritative.
 */
export function signingNormalizedTreeDigest(root) {
  const canonicalRoot = assertDirectory(root, 'signing-normalized tree')
  mkdirSync(join(packagingRoot, 'staging'), { recursive: true })
  const temporary = mkdtempSync(join(packagingRoot, 'staging', '.signing-normalize.'))
  let cleaned = false
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    rmSync(temporary, { recursive: true, force: true })
  }
  const interrupt = () => {
    cleanup()
    process.exit(130)
  }
  const terminate = () => {
    cleanup()
    process.exit(143)
  }
  process.once('SIGINT', interrupt)
  process.once('SIGTERM', terminate)
  try {
    const rows = walkTree(canonicalRoot).map((row, index) => {
      if (row.kind === 'file') {
        const kind = nativeBinaryKind(row.absolute)
        if (kind === 'elf' || kind === 'pe') {
          throw new Error(`signing-normalized tree contains a foreign native payload: ${row.relative}`)
        }
        if (kind === 'mach-o') {
          const copy = join(temporary, String(index))
          copyFileSync(row.absolute, copy)
          chmodSync(copy, row.mode)
          withoutCodeSignature(copy)
          const bytes = readFileSync(copy)
          const vmsizeOffset = linkeditVmsizeOffset(bytes)
          if (vmsizeOffset === null) {
            throw new Error(`Mach-O image has no __LINKEDIT segment: ${row.relative}`)
          }
          bytes.writeBigUInt64LE(0n, vmsizeOffset)
          return {
            path: row.relative,
            type: 'file',
            mode: row.mode.toString(8),
            bytes: bytes.length,
            sha256: createHash('sha256').update(bytes).digest('hex'),
          }
        }
        return {
          path: row.relative,
          type: 'file',
          mode: row.mode.toString(8),
          bytes: row.size,
          sha256: sha256File(row.absolute),
        }
      }
      if (row.kind === 'symlink') {
        return {
          path: row.relative,
          type: 'symlink',
          mode: row.mode.toString(8),
          target: row.target ?? readlinkSync(row.absolute),
        }
      }
      return { path: row.relative, type: 'directory', mode: row.mode.toString(8) }
    })
    return createHash('sha256').update(JSON.stringify(rows)).digest('hex')
  } finally {
    process.off('SIGINT', interrupt)
    process.off('SIGTERM', terminate)
    cleanup()
  }
}
