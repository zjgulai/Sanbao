import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { packagingRoot } from '../scripts/lib.mjs'
import { linkeditVmsizeOffset, signingNormalizedTreeDigest } from '../scripts/signing-normalized-tree.mjs'

const stagingRoot = join(packagingRoot, 'staging')
mkdirSync(stagingRoot, { recursive: true })
const temporary = mkdtempSync(join(stagingRoot, '.signing-normalized-test.'))

// The production pipeline guarantees thin arm64 images (validate-mach-o) and the digest parser
// fails closed on anything else. Apple system binaries are universal (arm64e + x86_64), so the
// fixture comes from the running arm64 Node binary instead — the same shape production signs.
function thinFixture(destination) {
  const source = process.execPath
  const archs = execFileSync('/usr/bin/lipo', ['-archs', source], { encoding: 'utf8' }).trim().split(/\s+/u)
  assert.ok(archs.includes('arm64'), `fixture source must carry an arm64 slice, got: ${archs.join(' ')}`)
  if (archs.length === 1) {
    copyFileSync(source, destination)
  } else {
    execFileSync('/usr/bin/lipo', ['-thin', 'arm64', source, destination], { stdio: 'ignore' })
  }
}

try {
  const tree = join(temporary, 'tree')
  mkdirSync(tree)
  const binary = join(tree, 'native-tool')
  thinFixture(binary)
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

  // First real run (2026-10-10): `codesign --remove-signature` leaves the `__LINKEDIT` vmsize
  // field at the layout computed WHILE SIGNED, so re-signing a binary whose signature no longer
  // fits the recorded slack shifted this field — all 13 profile-template natives carried exactly
  // this residue. Force the shift: pin vmsize small, sign, remove — the field must move, and the
  // digest must absorb the move.
  const shifted = join(temporary, 'shifted')
  mkdirSync(shifted)
  const shiftedBinary = join(shifted, 'native-tool')
  thinFixture(shiftedBinary)
  execFileSync('/usr/bin/codesign', ['--remove-signature', shiftedBinary], { stdio: 'ignore' })
  const pinned = readFileSync(shiftedBinary)
  const vmsizeOffset = linkeditVmsizeOffset(pinned)
  assert.ok(vmsizeOffset !== null, '__LINKEDIT segment must be found')
  pinned.writeBigUInt64LE(0x1000n, vmsizeOffset)
  writeFileSync(shiftedBinary, pinned)
  const shiftedDigest = signingNormalizedTreeDigest(shifted)
  execFileSync('/usr/bin/codesign', ['--force', '--sign', '-', '--timestamp=none', shiftedBinary], { stdio: 'ignore' })
  const residue = join(temporary, 'residue')
  copyFileSync(shiftedBinary, residue)
  execFileSync('/usr/bin/codesign', ['--remove-signature', residue], { stdio: 'ignore' })
  const residueBytes = readFileSync(residue)
  assert.notEqual(residueBytes.readBigUInt64LE(linkeditVmsizeOffset(residueBytes)), 0x1000n)
  assert.equal(signingNormalizedTreeDigest(shifted), shiftedDigest)
  process.stdout.write('signing-normalized tree digest is invariant across Mach-O signature bytes: PASS\n')
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
