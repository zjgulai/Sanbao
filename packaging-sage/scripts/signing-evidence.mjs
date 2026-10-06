import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readlinkSync } from 'node:fs'
import { assertDirectory, sha256File, walkTree } from './lib.mjs'

export function artifactTreeDigest(root) {
  const rows = walkTree(assertDirectory(root, 'signed app')).map((row) => {
    if (row.kind === 'file') {
      return { path: row.relative, type: 'file', mode: row.mode.toString(8), bytes: row.size, sha256: sha256File(row.absolute) }
    }
    if (row.kind === 'symlink') {
      return { path: row.relative, type: 'symlink', mode: row.mode.toString(8), target: row.target ?? readlinkSync(row.absolute) }
    }
    return { path: row.relative, type: 'directory', mode: row.mode.toString(8) }
  })
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex')
}

export function designatedRequirement(app) {
  const result = spawnSync('/usr/bin/codesign', ['-d', '-r-', app], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30_000,
    killSignal: 'SIGKILL',
    maxBuffer: 4 * 1024 * 1024,
  })
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(`codesign could not read the designated requirement: ${result.error?.message ?? result.stderr.trim()}`)
  }
  const rows = result.stderr.split(/\r?\n/u).filter((row) => row.startsWith('designated => '))
  if (rows.length !== 1) throw new Error(`expected one designated requirement, observed ${String(rows.length)}`)
  const requirement = rows[0].slice('designated => '.length)
  if (requirement === '' || /[\r\n\u0000]/u.test(requirement)) {
    throw new Error('codesign returned an invalid designated requirement')
  }
  return requirement
}
