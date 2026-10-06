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
  statSync,
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

/**
 * Digest a runtime tree after removing only embedded Mach-O signature superblobs from private
 * copies. This keeps source input provenance stable across the later leaf-to-root signing step;
 * every non-signature byte, file mode, path, directory, and symlink remains authoritative.
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
          return {
            path: row.relative,
            type: 'file',
            mode: row.mode.toString(8),
            bytes: statSync(copy).size,
            sha256: createHash('sha256').update(readFileSync(copy)).digest('hex'),
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
