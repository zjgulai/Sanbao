import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  isNativeCodeCandidate,
  nativeBinaryKind,
  packagingRoot,
} from '../scripts/lib.mjs'

const stagingRoot = join(packagingRoot, 'staging')
mkdirSync(stagingRoot, { recursive: true })
const temporary = mkdtempSync(join(stagingRoot, '.native-inventory-test.'))

try {
  const fixtures = [
    ['arm64.node', Buffer.from([0xcf, 0xfa, 0xed, 0xfe]), 'mach-o'],
    ['linux.node', Buffer.from([0x7f, 0x45, 0x4c, 0x46]), 'elf'],
    ['windows.node', Buffer.from([0x4d, 0x5a, 0x90, 0x00]), 'pe'],
    ['runtime.js', Buffer.from('#!/usr/bin/env node\n'), undefined],
  ]
  for (const [name, bytes, expected] of fixtures) {
    const path = join(temporary, name)
    writeFileSync(path, bytes)
    if (name === 'runtime.js') chmodSync(path, 0o755)
    assert.equal(nativeBinaryKind(path), expected, name)
  }
  assert.equal(isNativeCodeCandidate('addon.node', 0o644), true)
  assert.equal(isNativeCodeCandidate('payload.dll', 0o644), true)
  assert.equal(isNativeCodeCandidate('payload.exe', 0o644), true)
  assert.equal(isNativeCodeCandidate('runtime.js', 0o755), true)
  assert.equal(isNativeCodeCandidate('asset.json', 0o644), false)

  const validator = join(packagingRoot, 'scripts', 'validate-mach-o.mjs')
  const x64MachO = Buffer.alloc(32)
  x64MachO.writeUInt32LE(0xfeedfacf, 0)
  x64MachO.writeUInt32LE(0x01000007, 4)
  x64MachO.writeUInt32LE(3, 8)
  x64MachO.writeUInt32LE(2, 12)
  const rejected = [
    ['non-executable.dll', Buffer.from([0x4d, 0x5a, 0x90, 0x00])],
    ['non-executable.exe', Buffer.from([0x4d, 0x5a, 0x90, 0x00])],
    ['opaque-runtime.bin', Buffer.from([0x7f, 0x45, 0x4c, 0x46])],
    ['wrong-architecture.node', x64MachO],
  ]
  for (const [name, bytes] of rejected) {
    const tree = join(temporary, `reject-${name.replaceAll('.', '-')}`)
    mkdirSync(tree)
    writeFileSync(join(tree, name), bytes, { mode: 0o644 })
    const result = spawnSync(process.execPath, [validator, tree, 'negative-native-fixture'], {
      encoding: 'utf8',
    })
    assert.notEqual(result.status, 0, `${name} must fail the final native inventory`)
  }
  process.stdout.write('native inventory classifier and fail-closed validator: PASS\n')
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
