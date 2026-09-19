import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { defaultProfileDir } from '../lib/profile/layout.js'
import { materializeProfile } from '../lib/profile/materialize.js'

const shellRoot = fileURLToPath(new URL('..', import.meta.url))
const profileDir = process.env.LUTE_SHELL_PROFILE ?? defaultProfileDir(homedir())

const profile = await materializeProfile({
  seedDir: `${shellRoot}seed`,
  shellRoot,
  profileDir,
})
process.stdout.write(`lute shell: profile ready at ${profile.profileDir}\n`)
process.stdout.write(`lute shell: host entry ${profile.hostEntry}\n`)
