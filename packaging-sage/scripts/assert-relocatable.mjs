import { isAbsolute } from 'node:path'

import { fileContains, walkTree } from './lib.mjs'

const root = process.argv[2]
const needles = []
for (let index = 3; index < process.argv.length; index += 1) {
  if (process.argv[index] !== '--forbid' || process.argv[index + 1] === undefined) {
    process.stderr.write('usage: node assert-relocatable.mjs <tree> [--forbid <absolute-path>]...\n')
    process.exit(2)
  }
  needles.push(process.argv[index + 1])
  index += 1
}

try {
  const rows = walkTree(root)
  for (const link of rows.filter(row => row.kind === 'symlink')) {
    if (isAbsolute(link.target)) {
      throw new Error(`absolute symlink is forbidden: ${link.relative} -> ${link.target}`)
    }
  }
  const files = rows.filter((row) => row.kind === 'file')
  const distinctNeedles = [...new Set(needles)].filter(needle => needle.trim() !== '')
  const minimalNeedles = distinctNeedles.filter(needle => (
    !distinctNeedles.some(other => other !== needle && needle.includes(other))
  ))
  for (const needle of minimalNeedles) {
    for (const file of files) {
      if (await fileContains(file.absolute, needle)) {
        throw new Error(`machine path leaked into artifact file ${file.relative}`)
      }
    }
  }
  process.stdout.write(`[sage-packaging] relocatable tree verified (${files.length} files)\n`)
} catch (error) {
  process.stderr.write(`[sage-packaging] ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
}
