/**
 * Launch the isolated Sage preview profile, then start Electron with its own preview home and CDP port.
 */

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { basename, resolve } from 'node:path'
import { ensureSageDirectories, resolveSagePaths } from '../lib/profile/paths.js'
import { materializeProfile } from '../lib/profile/materialize.js'

const shellRoot = fileURLToPath(new URL('..', import.meta.url))
const root = process.env.SAGE_ROOT ?? resolve(shellRoot, '../..', '.sage-preview')
// Keep the fake HOME beside the Sage root: a HOME inside root would make its
// legacy `.dsh` descendant overlap the root and correctly fail SagePaths.
const home = resolve(root, '..', `${basename(root)}-home`)
const paths = resolveSagePaths({ home, root })
const port = process.env.SAGE_CDP_PORT ?? '9463'

await ensureSageDirectories(paths)
const profile = await materializeProfile({ seedDir: `${shellRoot}seed`, shellRoot, paths })

process.stdout.write(`sage shell preview: profile ${profile.profileDir}\n`)
process.stdout.write(`sage shell preview: CDP http://127.0.0.1:${port}; validate the Sage state/retry surface in the isolated profile\n`)

const environment = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => name !== 'DSH_HOME' && !name.startsWith('LUTE_SHELL_')),
)

const child = spawn(resolve(shellRoot, 'node_modules/.bin/electron'), [
  '.',
  '--remote-debugging-address=127.0.0.1',
  `--remote-debugging-port=${port}`,
], {
  cwd: shellRoot,
  stdio: 'inherit',
  env: {
    ...environment,
    HOME: home,
    SAGE_ROOT: paths.root,
    SAGE_DEVTOOLS: process.env.SAGE_DEVTOOLS ?? '0',
  },
})

child.once('close', code => { process.exitCode = code ?? 0 })
