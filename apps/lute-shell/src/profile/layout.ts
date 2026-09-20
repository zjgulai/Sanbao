/** Where the profile seed and the built host runtime land inside a materialized profile. */

import { join, resolve } from 'node:path'

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
  'host/composer-adapter.js',
  'host/composer-view.js',
  'host/streams.js',
  'host/handler.js',
] as const

/** Overlay source relative to the shell package root. */
export const HOST_CONFIG_FILE = 'config/shell.cordis.patch.yml'

/** Subdirectory of the profile carrying the shell-owned product packages. */
export const COMPOSED_DIR_NAME = '.composed'

/**
 * Repo packages this shell owns and composes into its profile.
 *
 * Paths are repository-root relative (see {@link repoRootOf}); they are copied
 * in rather than referenced by machine path. {@link composeProfileManifest}
 * then declares each one in the profile manifest (profile-local `file:`
 * dependency plus a bundle entry) — that pair is what puts both the host half
 * and the browser half of a package into the running app.
 */
export const COMPOSED_PACKAGES = [
  { name: 'dsh-onboarding-carousel', dir: 'packages/surfaces/dsh-onboarding-carousel-local' },
] as const

/**
 * Resolve the repository root composed package paths are relative to.
 * @param shellRoot - this shell package's own directory (`<repo>/apps/lute-shell`).
 * @returns the repository root.
 */
export function repoRootOf(shellRoot: string): string {
  return resolve(shellRoot, '..', '..')
}

/** Files a composed package ships, relative to its own directory. */
const COMPOSED_PACKAGE_FILES = ['package.json', 'cordis.patch.yml'] as const

/** Directories a composed package ships whole, relative to its own directory. */
const COMPOSED_PACKAGE_DIRS = ['lib'] as const

/** Where one composed package lands inside a profile. */
export function composedPackageDir(profileDir: string, name: string): string {
  return join(profileDir, COMPOSED_DIR_NAME, name)
}

/** The parts of a profile manifest this shell composes into. */
export interface ProfileManifest {
  readonly dependencies?: Record<string, string>
  readonly dsh?: { readonly profile?: { readonly bundles?: readonly string[] } }
}

/**
 * Add every composed package to a profile manifest.
 *
 * The seed deliberately stays free of these entries: their `file:` targets only
 * exist inside a materialized profile, so a seed that declared them could never
 * resolve its own lockfile.
 * @param manifest - the seed manifest as copied into the profile.
 * @returns a new manifest carrying the composed dependencies and bundles.
 */
export function composeProfileManifest(manifest: ProfileManifest): ProfileManifest {
  const dependencies = { ...manifest.dependencies }
  const bundles = [...(manifest.dsh?.profile?.bundles ?? [])]
  for (const pkg of COMPOSED_PACKAGES) {
    dependencies[pkg.name] = `file:./${COMPOSED_DIR_NAME}/${pkg.name}`
    if (!bundles.includes(pkg.name)) bundles.push(pkg.name)
  }
  return {
    ...manifest,
    dependencies,
    dsh: { ...manifest.dsh, profile: { ...manifest.dsh?.profile, bundles } },
  }
}

/** One planned copy. */
export interface CopyPlanEntry {
  readonly from: string
  readonly to: string
  /** Directories are copied whole; files are copied one to one. */
  readonly recursive?: boolean
  /** Where a missing source is attributed when the plan is asserted. */
  readonly kind: 'seed' | 'host-runtime' | 'composed-package'
}

/** One planned file copy. */
export interface CopyPlan {
  readonly entries: readonly CopyPlanEntry[]
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
 * @param input - seed directory, shell package root, target profile directory, and
 * the repository root composed package paths are relative to.
 * @returns ordered copy entries, seed files first.
 */
export function planMaterialize(input: { seedDir: string; shellRoot: string; profileDir: string; repoRoot?: string }): CopyPlan {
  const repoRoot = input.repoRoot ?? repoRootOf(input.shellRoot)
  return {
    entries: [
      ...SEED_FILES.map(name => ({ from: join(input.seedDir, name), to: join(input.profileDir, name), kind: 'seed' as const })),
      ...HOST_LIB_FILES.map(name => ({
        from: join(input.shellRoot, 'lib', name),
        to: join(input.profileDir, HOST_DIR_NAME, name),
        kind: 'host-runtime' as const,
      })),
      { from: join(input.shellRoot, HOST_CONFIG_FILE), to: overlayPath(input.profileDir), kind: 'host-runtime' as const },
      ...COMPOSED_PACKAGES.flatMap(pkg => {
        const from = join(repoRoot, pkg.dir)
        const to = composedPackageDir(input.profileDir, pkg.name)
        return [
          ...COMPOSED_PACKAGE_FILES.map(name => ({ from: join(from, name), to: join(to, name), kind: 'composed-package' as const })),
          ...COMPOSED_PACKAGE_DIRS.map(name => ({ from: join(from, name), to: join(to, name), kind: 'composed-package' as const, recursive: true })),
        ]
      }),
    ],
  }
}
