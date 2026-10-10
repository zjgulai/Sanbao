import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { packagingRoot } from '../scripts/lib.mjs'

// First-run catch (2026-10-10): macOS ships bash 3.2 as `env bash`, where `"${arr[@]}"` on an
// EMPTY array under `set -u` aborts with "unbound variable" — the signing script died on its
// normal empty-recovery-root path. The bash-3.2-safe idiom is `${arr[@]+"${arr[@]}"}`; this scan
// keeps every packaging shell script on it (mechanism over review), because the DMG chain runs
// on macOS, where 3.2 is the default interpreter.

const offenders = []
function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'staging' || entry.name === 'release') continue
      walk(path)
      continue
    }
    if (!entry.name.endsWith('.sh')) continue
    const source = readFileSync(path, 'utf8')
    const lines = source.split('\n')
    for (const [index, line] of lines.entries()) {
      // Any "${name[@]}" must sit inside the guarded form ${name[@]+"${name[@]}"} on the same line.
      for (const match of line.matchAll(/"?\$\{([A-Za-z_][A-Za-z0-9_]*)\[@\]\}/gu)) {
        const before = line.slice(Math.max(0, match.index - 40), match.index + match[0].length)
        const guarded = before.includes(`\${${match[1]}[@]+`)
        if (!guarded) offenders.push(`${path.replace(packagingRoot, 'packaging-sage')}:${index + 1}: ${line.trim()}`)
      }
    }
  }
}
const start = statSync(packagingRoot).isDirectory() ? packagingRoot : undefined
assert.ok(start !== undefined)
walk(packagingRoot)
assert.deepEqual(offenders, [], `unguarded bash-3.2-unsafe array expansions:\n${offenders.join('\n')}`)
process.stdout.write('[sage-packaging] bash 3.2 array-expansion safety verified\n')
