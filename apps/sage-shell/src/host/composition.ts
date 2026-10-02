/** Profile composition for the Sage shell host: bundle layers, user layer, shell overlay. */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { PatchOptions } from '@deepseek-ai/cordis-plugin-include'
import { composeEntries, loadOverlayPatches, loadProfileDirectory } from '@deepseek-ai/dsh-app-boot'

// cordis-plugin-include types entries as the loader's EntryOptions but does not re-export it.
type EntryOptions = NonNullable<PatchOptions['insert']>[number]

/** Bin name carried into every harness diagnostic this shell emits. */
export const SHELL_LABEL = 'sage shell'

/** Composition root the seed ships; boot mounts it and nothing else. */
export const ROOT_CONFIG_FILENAME = 'cordis.yml'

/** Root-config content the host rewrites at every boot; the seed ships the same bytes as the initial copy. */
export const ROOT_CONFIG_CONTENT = '# sage-shell composition root; the seed ships this file, the host rewrites it at every boot.\n[]\n'

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
// published dsh tarball ships no config/, and 0.2.0 ships presets as bundle-declared rows
// (dsh-web-app presets/*.patch.yml), so the injection is redundant here.
/**
 * Compose one materialized profile into boot patches.
 * @param input - absolute profile directory, absolute shell overlay patch file, and an
 * optional instance-local patch file merged after the overlay (ADR-0162).
 * @returns ordered patches (bundle layers, user layer, shell overlay, instance-local) and bundle origins.
 */
export function composeShellPatches(input: { profileDir: string; overlayPatchPath: string; localPatchPath?: string }): ShellPatches {
  const profile = loadProfileDirectory(SHELL_LABEL, input.profileDir, installAnchor(input.profileDir))
  // 上游 0.2.0 起把不可装载的 bundle 改为「跳过并记 skippedBundles、不抛错」；Sage 的 profile 由
  // Sage 物化、声明的 bundle 就是壳的组合合同——跳过等于半装启动，必须响铃（保留 0.1.5 时代的
  // fail-loud 语义；reason 原样携带上游给出的具体原因）。
  if (profile.skippedBundles.length > 0) {
    const details = profile.skippedBundles
      .map(({ packageName, reason }) => `${JSON.stringify(packageName)}: ${reason}`)
      .join('; ')
    throw new Error(`${SHELL_LABEL}: profile ${input.profileDir} declares bundle(s) that did not load: ${details}`)
  }
  const layers = [
    ...profile.layers.map(layer => layer.patches),
    profile.patches,
    loadOverlayPatches(SHELL_LABEL, input.overlayPatchPath),
  ]
  // Instance-local layer (ADR-0162): merged last so an instance can override any repo row;
  // a missing file is the normal state on fresh instances and adds nothing.
  if (input.localPatchPath !== undefined && existsSync(input.localPatchPath)) {
    layers.push(loadOverlayPatches(SHELL_LABEL, input.localPatchPath))
  }
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
