import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const HERE = dirname(fileURLToPath(import.meta.url))
const SCRIPT = join(HERE, 'rewrite-file-deps.mjs')
const REPO_ROOT = resolve(HERE, '..', '..')

test('rewrites current Sage and legacy repository file dependencies without a machine-specific current path', () => {
  const root = mkdtempSync(join(tmpdir(), 'sage-rewrite-file-deps-'))
  const profile = join(root, 'profile')
  const currentVendor = 'packages/platform/current-demo'
  const legacyVendor = 'packages/platform/legacy-demo'

  try {
    mkdirSync(join(profile, 'vendor', currentVendor), { recursive: true })
    mkdirSync(join(profile, 'vendor', legacyVendor), { recursive: true })
    writeFileSync(join(profile, 'vendor', currentVendor, 'package.json'), '{}\n')
    writeFileSync(join(profile, 'vendor', legacyVendor, 'package.json'), '{}\n')
    writeFileSync(join(profile, 'package.json'), `${JSON.stringify({
      dependencies: {
        current: `file:${REPO_ROOT}/${currentVendor}`,
        legacy: `file:../../../project/Magpie-Horch/${legacyVendor}`,
      },
    }, null, 2)}\n`)
    writeFileSync(join(profile, 'pnpm-lock.yaml'), [
      `  current: file:${REPO_ROOT}/${currentVendor}`,
      `  legacy: file:../../../project/Magpie-Horch/${legacyVendor}`,
      '',
    ].join('\n'))

    execFileSync(process.execPath, [SCRIPT, profile], { stdio: 'pipe' })
    const manifest = JSON.parse(readFileSync(join(profile, 'package.json'), 'utf8'))
    const lock = readFileSync(join(profile, 'pnpm-lock.yaml'), 'utf8')

    assert.equal(manifest.dependencies.current, `file:./vendor/${currentVendor}`)
    assert.equal(manifest.dependencies.legacy, `file:./vendor/${legacyVendor}`)
    assert.ok(!lock.includes(REPO_ROOT))
    assert.ok(!lock.includes('Magpie-Horch'))
    execFileSync(process.execPath, [SCRIPT, '--check', profile], { stdio: 'pipe' })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
