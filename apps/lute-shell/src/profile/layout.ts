/** Where the profile seed and the built host runtime land inside a materialized profile. */

import { join } from 'node:path'

/** Profile directory name under `$DSH_HOME/profiles`. */
export const PROFILE_LABEL = 'lute-shell'

/** Subdirectory of the profile carrying this shell's host runtime. */
export const HOST_DIR_NAME = 'lute-host'

/** Seed files copied verbatim onto the profile root. */
export const SEED_FILES = ['package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml', 'cordis.yml', 'cordis.patch.yml'] as const

/** Built host modules relative to `lib/`; relative imports survive the copy because the layout is preserved. */
export const HOST_LIB_FILES = [
  'protocol.js',
  'host/index.js',
  'host/composition.js',
  'host/assets.js',
  'host/streams.js',
  'host/handler.js',
] as const

/** Overlay source relative to the shell package root. */
export const HOST_CONFIG_FILE = 'config/shell.cordis.patch.yml'

/** One planned file copy. */
export interface CopyPlan {
  readonly entries: readonly { readonly from: string; readonly to: string }[]
}

/**
 * Resolve the profile directory for one home directory.
 * @param homedir - absolute home directory.
 * @returns `$homedir/.dsh/profiles/lute-shell`.
 */
export function defaultProfileDir(homedir: string): string {
  return join(homedir, '.dsh', 'profiles', PROFILE_LABEL)
}

/** Absolute host child-process entry inside one materialized profile. */
export function hostEntryPath(profileDir: string): string {
  return join(profileDir, HOST_DIR_NAME, 'host', 'index.js')
}

/** Absolute overlay patch file inside one materialized profile. */
export function overlayPath(profileDir: string): string {
  return join(profileDir, HOST_DIR_NAME, 'shell.cordis.patch.yml')
}

/**
 * Plan every copy the materializer performs.
 * @param input - seed directory, shell package root, and target profile directory.
 * @returns ordered copy entries, seed files first.
 */
export function planMaterialize(input: { seedDir: string; shellRoot: string; profileDir: string }): CopyPlan {
  return {
    entries: [
      ...SEED_FILES.map(name => ({ from: join(input.seedDir, name), to: join(input.profileDir, name) })),
      ...HOST_LIB_FILES.map(name => ({
        from: join(input.shellRoot, 'lib', name),
        to: join(input.profileDir, HOST_DIR_NAME, name),
      })),
      { from: join(input.shellRoot, HOST_CONFIG_FILE), to: overlayPath(input.profileDir) },
    ],
  }
}
