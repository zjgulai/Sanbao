import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { packagingRoot } from '../scripts/lib.mjs'
import { RUNTIME_ENTRY, collectRuntimeGraph } from '../scripts/runtime-graph.mjs'

// C2D.2A-era fix (2026-10-10): the closure walker classified `node:sqlite` as an npm package
// because the build host's `builtinModules` (Node 22) lacks names the packaged runtime
// (Electron 43 = Node 24.18) provides — the producer then tried to install a package that does
// not exist. This fixture pins the runtime-builtin recognition so the miss cannot come back.

const stagingRoot = join(packagingRoot, 'staging')
mkdirSync(stagingRoot, { recursive: true })
const temporary = mkdtempSync(join(stagingRoot, '.runtime-graph-test.'))

try {
  const root = join(temporary, 'app')
  const mainDir = join(root, 'lib', 'main')
  mkdirSync(mainDir, { recursive: true })
  writeFileSync(join(mainDir, RUNTIME_ENTRY.split('/').at(-1)), [
    "import './local.js'",
    "import 'node:sqlite'",
    "import 'node:fs/promises'",
    "import 'node:crypto'",
    "import 'some-dep'",
    "import 'electron'",
  ].join('\n'))
  writeFileSync(join(mainDir, 'local.js'), 'export const local = true\n')
  writeFileSync(join(mainDir, 'sanbao-host-preload.cjs'), 'module.exports = {}\n')

  const graph = collectRuntimeGraph(root)
  assert.deepEqual(graph.externalPackages, ['some-dep'], JSON.stringify(graph))
  assert.deepEqual(graph.providedModules, ['electron'])
  assert.ok(graph.files.includes('lib/main/index.js'))
  assert.ok(graph.files.includes('lib/main/local.js'))
  assert.ok(graph.files.includes('lib/main/sanbao-host-preload.cjs'))
  process.stdout.write('[sage-packaging] runtime graph builtin classification verified\n')
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
