/**
 * Launch the isolated preview profile: materialize the host runtime, install the local fixture
 * config and acceptance plugin, then start Electron with the preview home and CDP port.
 *
 * The preview-only patch is written *after* `materializeProfile`, which copies the tracked seed
 * files over the profile root: running `pnpm run materialize` alone restores the shipped config and
 * silently points the preview at the default real-model catalog instead of the local fixture.
 */

import { spawn } from 'node:child_process'
import { copyFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { materializeProfile } from '../lib/profile/materialize.js'

const shellRoot = fileURLToPath(new URL('..', import.meta.url))
const previewDir = process.env.LUTE_SHELL_PROFILE ?? resolve(shellRoot, '../..', '.composer-preview')
const home = resolve(previewDir, 'final-home')
const port = process.env.LUTE_SHELL_CDP_PORT ?? '9463'

const profile = await materializeProfile({ seedDir: `${shellRoot}seed`, shellRoot, profileDir: previewDir })
await copyFile(resolve(shellRoot, 'test/fixtures/acceptance-plugin.mjs'), resolve(previewDir, 'acceptance-plugin.mjs'))
await copyFile(resolve(shellRoot, 'test/fixtures/preview.cordis.patch.yml'), resolve(previewDir, 'cordis.patch.yml'))

process.stdout.write(`lute shell preview: profile ${profile.profileDir}\n`)
process.stdout.write(`lute shell preview: CDP http://127.0.0.1:${port}; acceptance: node scripts/composer-acceptance.mjs\n`)

const child = spawn(resolve(shellRoot, 'node_modules/.bin/electron'), [
  '.',
  `--user-data-dir=${resolve(previewDir, 'final-chromium')}`,
  '--remote-debugging-address=127.0.0.1',
  `--remote-debugging-port=${port}`,
], {
  cwd: shellRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    HOME: home,
    DSH_HOME: resolve(home, '.dsh'),
    LUTE_SHELL_PROFILE: previewDir,
    LUTE_SHELL_DEVTOOLS: '0',
  },
})

child.once('close', code => { process.exitCode = code ?? 0 })
