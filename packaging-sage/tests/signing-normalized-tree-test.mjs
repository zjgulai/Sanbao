import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { packagingRoot } from '../scripts/lib.mjs'
import { signingNormalizedTreeDigest } from '../scripts/signing-normalized-tree.mjs'

const stagingRoot = join(packagingRoot, 'staging')
mkdirSync(stagingRoot, { recursive: true })
const temporary = mkdtempSync(join(stagingRoot, '.signing-normalized-test.'))

try {
  const tree = join(temporary, 'tree')
  mkdirSync(tree)
  const binary = join(tree, 'native-tool')
  copyFileSync('/usr/bin/true', binary)
  execFileSync('/usr/bin/codesign', ['--remove-signature', binary], { stdio: 'ignore' })
  const unsignedDigest = signingNormalizedTreeDigest(tree)
  execFileSync('/usr/bin/codesign', ['--force', '--sign', '-', '--timestamp=none', binary], { stdio: 'ignore' })
  const adhocDigest = signingNormalizedTreeDigest(tree)
  assert.equal(adhocDigest, unsignedDigest)
  const tampered = readFileSync(binary)
  const offset = 8
  tampered[offset] ^= 0x01
  writeFileSync(binary, tampered)
  assert.notEqual(signingNormalizedTreeDigest(tree), unsignedDigest)
  process.stdout.write('signing-normalized tree digest is invariant across Mach-O signature bytes: PASS\n')
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
