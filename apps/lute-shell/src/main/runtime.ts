/** Resolves which binary runs the host child process and what environment it sees. */

import { hostEntryPath } from '../profile/layout.js'

/** Everything the main process needs to spawn one host child. */
export interface HostRuntime {
  readonly node: string
  readonly entry: string
  readonly profileDir: string
  readonly env: Record<string, string | undefined>
}

const SCRUBBED_PREFIX = /^(?:npm|pnpm|corepack)_/iu

/**
 * Resolve the host runtime for one shell launch.
 * @param input - Electron executable, profile directory, DSH_HOME, and the parent environment.
 * @returns node binary, host entry, profile directory, and the scrubbed child environment.
 */
export function resolveHostRuntime(input: {
  execPath: string
  profileDir: string
  dshHome: string
  env: Readonly<Record<string, string | undefined>>
}): HostRuntime {
  const env: Record<string, string | undefined> = {}
  for (const [name, value] of Object.entries(input.env)) {
    if (name === 'NODE_OPTIONS') continue
    if (name.startsWith('LUTE_SHELL_')) continue
    if (SCRUBBED_PREFIX.test(name)) continue
    env[name] = value
  }
  // The Electron binary acts as plain Node, so harness native modules load at their N-API ABI.
  env.ELECTRON_RUN_AS_NODE = '1'
  env.DSH_HOME = input.dshHome
  return {
    node: input.env.LUTE_SHELL_NODE_BINARY ?? input.execPath,
    entry: hostEntryPath(input.profileDir),
    profileDir: input.profileDir,
    env,
  }
}
