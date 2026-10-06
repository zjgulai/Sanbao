import { execFileSync } from 'node:child_process'
import { loadConfig, nativeBinaryKind, walkTree } from './lib.mjs'

const root = process.argv[2]
const label = process.argv[3]
if (root === undefined || label === undefined || !/^[a-z0-9.-]+$/u.test(label)) {
  process.stderr.write('usage: node validate-mach-o.mjs <tree> <label>\n')
  process.exit(2)
}

try {
  const config = loadConfig()
  const candidates = walkTree(root).filter(row => row.kind === 'file')
  let machOCount = 0
  for (const row of candidates) {
    const kind = nativeBinaryKind(row.absolute)
    if (kind !== 'mach-o') {
      if (kind === 'elf' || kind === 'pe') throw new Error(`${label} contains a foreign native payload: ${row.relative}`)
      continue
    }
    const architectures = execFileSync('/usr/bin/lipo', ['-archs', row.absolute], { encoding: 'utf8' })
      .trim()
      .split(/\s+/u)
    if (!architectures.includes(config.arch)) {
      throw new Error(`${label} contains a Mach-O without ${config.arch}: ${row.relative}`)
    }
    machOCount += 1
  }
  process.stdout.write(`${JSON.stringify({
    kind: 'mach-o-architecture',
    label,
    architecture: config.arch,
    inspectedFiles: candidates.length,
    files: machOCount,
  })}\n`)
} catch (error) {
  process.stderr.write(`[sage-packaging] ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
}
