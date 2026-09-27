import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { ensureSageDirectories, resolveSagePaths } from '../lib/profile/paths.js'
import { materializeProfile } from '../lib/profile/materialize.js'

const shellRoot = fileURLToPath(new URL('..', import.meta.url))
const root = process.env.SAGE_ROOT
const paths = resolveSagePaths({
  home: homedir(),
  ...(root === undefined ? {} : { root }),
})

await ensureSageDirectories(paths)
const profile = await materializeProfile({
  seedDir: `${shellRoot}seed`,
  shellRoot,
  paths,
})
process.stdout.write(`sage shell: profile ${profile.generation} ready at ${profile.profileDir}\n`)
process.stdout.write(`sage shell: host entry ${profile.hostEntry}\n`)
