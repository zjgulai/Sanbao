#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  SAGE_PACKAGING_CONTRACT_TESTS,
  SAGE_PACKAGING_EXPECTED_TEST_COUNT,
  inspectSagePackagingTestManifest,
} from './test-manifest.mjs'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const args = process.argv.slice(2)
if (args.some(argument => argument !== '--list')) {
  process.stderr.write('usage: node packaging-sage/tests/run-contract-tests.mjs [--list]\n')
  process.exit(2)
}

const inspection = inspectSagePackagingTestManifest(repoRoot)
if (inspection.issues.length > 0) {
  for (const issue of inspection.issues) process.stderr.write(`[sage-packaging] ${issue}\n`)
  process.exit(1)
}

const selected = SAGE_PACKAGING_CONTRACT_TESTS.filter(entry => entry.layer === 'pure')
if (args.includes('--list')) {
  process.stdout.write(`${JSON.stringify({
    registered: SAGE_PACKAGING_EXPECTED_TEST_COUNT,
    layers: inspection.layers,
    selected: selected.map(entry => entry.path),
  }, null, 2)}\n`)
  process.exit(0)
}

for (const entry of selected) {
  const path = join(repoRoot, entry.path)
  const command = entry.runner === 'bash' ? '/bin/bash' : process.execPath
  const commandArgs = entry.runner === 'node-test' ? ['--test', path] : [path]
  process.stdout.write(`[sage-packaging] pure contract: ${entry.path}\n`)
  const result = spawnSync(command, commandArgs, {
    cwd: repoRoot,
    env: process.env,
    stdio: 'inherit',
    timeout: 120_000,
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) {
    const reason = result.signal === null ? `status ${String(result.status)}` : `signal ${String(result.signal)}`
    throw new Error(`${entry.path} exited with ${reason}`)
  }
}

process.stdout.write(
  `[sage-packaging] pure contract suite: PASS (${selected.length}/${SAGE_PACKAGING_EXPECTED_TEST_COUNT} executed; platform/input/live not run)\n`,
)

