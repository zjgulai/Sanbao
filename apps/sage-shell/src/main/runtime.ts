/** Resolves which binary runs the host child process and what environment it sees. */

import { hostEntryPath } from '../profile/layout.js'
import type { ActiveProfile, SagePaths } from '../profile/paths.js'

/** Electron-owned directories that must be set before Electron becomes ready. */
export interface SageElectronPaths {
  readonly userData: string
  readonly sessionData: string
  readonly logs: string
  readonly crashDumps: string
}

/** Resolve the Electron-owned directories underneath one Sage root. */
export function resolveSageElectronPaths(paths: Pick<SagePaths,
  'electronUserDataDir' | 'sessionDataDir' | 'logsDir' | 'crashDumpsDir'>): SageElectronPaths {
  return {
    userData: paths.electronUserDataDir,
    sessionData: paths.sessionDataDir,
    logs: paths.logsDir,
    crashDumps: paths.crashDumpsDir,
  }
}

/** Everything the main process needs to spawn one host child. */
export interface HostRuntime {
  readonly node: string
  readonly entry: string
  readonly sageRoot: string
  readonly profileDir: string
  readonly expectedProfileGeneration: string
  readonly expectedManifestSha256: string
  readonly env: Record<string, string | undefined>
}

const SCRUBBED_PREFIX = /^(?:npm|pnpm|corepack)_/iu
/**
 * Resolve the host runtime for one shell launch.
 * @param input - Electron executable, Sage paths, active profile, and the parent environment.
 * @returns node binary, active host entry, Sage root, and the scrubbed child environment.
 */
export function resolveHostRuntime(input: {
  execPath: string
  paths: SagePaths
  activeProfile: ActiveProfile
  env: Readonly<Record<string, string | undefined>>
}): HostRuntime {
  const env: Record<string, string | undefined> = {}
  for (const [name, value] of Object.entries(input.env)) {
    if (name === 'NODE_OPTIONS') continue
    if (name.startsWith('LUTE_SHELL_')) continue
    if (name.startsWith('SAGE_')) continue
    if (name === 'DSH_HOME') continue
    if (SCRUBBED_PREFIX.test(name)) continue
    env[name] = value
  }
  // The Electron binary acts as plain Node, so harness native modules load at their N-API ABI.
  env.ELECTRON_RUN_AS_NODE = '1'
  // Never inherit an ambient DSH_HOME: Harness sees only the Sage-owned compatibility root.
  env.DSH_HOME = input.paths.harnessHome
  return {
    node: input.env.SAGE_NODE_BINARY ?? input.execPath,
    entry: hostEntryPath(input.activeProfile.profileDir),
    sageRoot: input.paths.root,
    profileDir: input.activeProfile.profileDir,
    expectedProfileGeneration: input.activeProfile.generation,
    expectedManifestSha256: input.activeProfile.manifestSha256,
    env,
  }
}
