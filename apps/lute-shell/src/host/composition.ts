/** Profile composition for the lute-shell host: bundle layers, user layer, shell overlay. */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { PatchOptions } from '@deepseek-ai/cordis-plugin-include'
import { composeEntries, loadOverlayPatches, loadProfileDirectory } from '@deepseek-ai/dsh-app-boot'

// cordis-plugin-include types entries as the loader's EntryOptions but does not re-export it.
type EntryOptions = NonNullable<PatchOptions['insert']>[number]

/** Bin name carried into every harness diagnostic this shell emits. */
export const SHELL_LABEL = 'lute shell'

/** Composition root the seed ships; boot mounts it and nothing else. */
export const ROOT_CONFIG_FILENAME = 'cordis.yml'

/** Root-config content the host rewrites at every boot; the seed ships the same bytes as the initial copy. */
export const ROOT_CONFIG_CONTENT = '# lute-shell composition root; the seed ships this file, the host rewrites it at every boot.\n[]\n'

/** Ordered patch layers handed to boot, plus where the bundle layers came from. */
export interface ShellPatches {
  readonly patches: PatchOptions[]
  readonly layerNames: readonly string[]
  readonly layerDirs: readonly string[]
}

/** Absolute path of the composition root inside one materialized profile. */
export function rootConfigPath(profileDir: string): string {
  return join(profileDir, ROOT_CONFIG_FILENAME)
}

function installAnchor(profileDir: string): string {
  const manifest = join(profileDir, 'node_modules', '@deepseek-ai', 'dsh', 'package.json')
  if (!existsSync(manifest)) {
    throw new Error(`${SHELL_LABEL}: profile ${profileDir} has no installed @deepseek-ai/dsh — run pnpm run materialize first`)
  }
  return manifest
}

// Upstream also injects an agent-presets system root from <dsh>/config/agent-presets; the
// published dsh tarball ships no config/, and dsh-agent-presets already supplies its own
// shipped root plus $DSH_HOME/.agent-presets, so the injection is redundant here.
/**
 * Compose one materialized profile into boot patches.
 * @param input - absolute profile directory and absolute shell overlay patch file.
 * @returns ordered patches (bundle layers, user layer, shell overlay) and bundle origins.
 */
export function composeShellPatches(input: { profileDir: string; overlayPatchPath: string }): ShellPatches {
  const profile = loadProfileDirectory(SHELL_LABEL, input.profileDir, installAnchor(input.profileDir))
  const layers = [
    ...profile.layers.map(layer => layer.patches),
    profile.patches,
    loadOverlayPatches(SHELL_LABEL, input.overlayPatchPath),
  ]
  // boot mutates the rows it is handed; upstream clones at the same boundary
  // (apps/desktop-host/src/index.ts:289-292).
  return {
    patches: structuredClone(layers.flat()),
    layerNames: profile.layers.map(layer => layer.packageName),
    layerDirs: profile.layers.map(layer => layer.packageDir),
  }
}

/**
 * Compose patches into loader entries for diagnostics and tests.
 * @param patches - one ordered patch layer.
 * @returns the entries the Loader would mount.
 */
export function inspectEntries(patches: readonly PatchOptions[]): readonly EntryOptions[] {
  return composeEntries([patches as PatchOptions[]])
}
