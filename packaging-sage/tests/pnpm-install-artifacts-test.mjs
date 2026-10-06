import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'

import { packagingRoot } from '../scripts/lib.mjs'
import { removeExactPnpmInstallerArtifacts } from '../scripts/pnpm-install-artifacts.mjs'

const stagingRoot = join(packagingRoot, 'staging')
mkdirSync(stagingRoot, { recursive: true })
const temporary = mkdtempSync(join(stagingRoot, '.pnpm-install-artifacts-test.'))

function write(path, bytes = 'fixture\n') {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, bytes)
}

try {
  const nodeModules = join(temporary, 'positive', 'node_modules')
  write(join(nodeModules, '.modules.yaml'))
  write(join(nodeModules, '.pnpm-workspace-state-v1.json'), '{}\n')
  write(join(nodeModules, '.pnpm', 'lock.yaml'))
  write(join(nodeModules, '.bin', 'root-tool'))
  write(join(nodeModules, '.pnpm', 'fixture@1.0.0', 'node_modules', '.bin', 'virtual-tool'))
  write(join(
    nodeModules,
    '.pnpm',
    'fixture@1.0.0',
    'node_modules',
    'fixture',
    'node_modules',
    '.bin',
    'package-local-tool',
  ))
  write(join(
    nodeModules,
    '.pnpm',
    '@scope+fixture@1.0.0',
    'node_modules',
    '@scope',
    'fixture',
    'node_modules',
    '.bin',
    'scoped-package-local-tool',
  ))
  write(join(nodeModules, '.pnpm', 'node_modules', '.bin', 'store-tool'))

  const publishedBin = join(
    nodeModules,
    'retained-package',
    'published-content',
    'node_modules',
    '.bin',
    'published-tool',
  )
  write(publishedBin)
  write(join(nodeModules, 'retained-package', 'src', 'index.js'), 'module.exports = {}\n')

  const result = removeExactPnpmInstallerArtifacts(nodeModules)
  assert.deepEqual(result, { removedFiles: 3, removedBinFarms: 5 })
  for (const relativePath of [
    '.modules.yaml',
    '.pnpm-workspace-state-v1.json',
    '.pnpm/lock.yaml',
    '.bin',
    '.pnpm/fixture@1.0.0/node_modules/.bin',
    '.pnpm/fixture@1.0.0/node_modules/fixture/node_modules/.bin',
    '.pnpm/@scope+fixture@1.0.0/node_modules/@scope/fixture/node_modules/.bin',
    '.pnpm/node_modules/.bin',
  ]) {
    assert.equal(existsSync(join(nodeModules, ...relativePath.split('/'))), false, relativePath)
  }
  assert.equal(existsSync(publishedBin), true, 'published nested node_modules/.bin must be retained')
  assert.equal(existsSync(join(nodeModules, 'retained-package', 'src', 'index.js')), true)

  const metadataLinkNodeModules = join(temporary, 'metadata-link', 'node_modules')
  const metadataTarget = join(temporary, 'metadata-link-target')
  write(metadataTarget)
  mkdirSync(metadataLinkNodeModules, { recursive: true })
  symlinkSync(metadataTarget, join(metadataLinkNodeModules, '.modules.yaml'))
  assert.throws(
    () => removeExactPnpmInstallerArtifacts(metadataLinkNodeModules),
    /installer metadata must be a regular file/u,
  )
  assert.equal(existsSync(metadataTarget), true)

  const binLinkNodeModules = join(temporary, 'bin-link', 'node_modules')
  const binTarget = join(temporary, 'bin-link-target')
  write(join(binTarget, 'outside-tool'))
  mkdirSync(binLinkNodeModules, { recursive: true })
  symlinkSync(binTarget, join(binLinkNodeModules, '.bin'))
  assert.throws(
    () => removeExactPnpmInstallerArtifacts(binLinkNodeModules),
    /generated \.bin path must be a real directory/u,
  )
  assert.equal(existsSync(join(binTarget, 'outside-tool')), true)

  const storeLinkNodeModules = join(temporary, 'store-entry-link', 'node_modules')
  const storeEntryTarget = join(temporary, 'store-entry-link-target')
  write(join(storeEntryTarget, 'node_modules', '.bin', 'outside-store-tool'))
  mkdirSync(join(storeLinkNodeModules, '.pnpm'), { recursive: true })
  symlinkSync(storeEntryTarget, join(storeLinkNodeModules, '.pnpm', 'fixture@1.0.0'))
  assert.throws(
    () => removeExactPnpmInstallerArtifacts(storeLinkNodeModules),
    /virtual store entry must be a regular file or real directory/u,
  )
  assert.equal(existsSync(join(storeEntryTarget, 'node_modules', '.bin', 'outside-store-tool')), true)

  process.stdout.write('pnpm exact installer artifact removal: PASS\n')
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
