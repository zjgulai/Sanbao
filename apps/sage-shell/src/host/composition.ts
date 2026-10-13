/** Profile composition for the Sage shell host: bundle layers, user layer, shell overlay. */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { PatchOptions } from '@deepseek-ai/cordis-plugin-include'
import {
  PROFILE_PATCH_FILENAME,
  composeEntries,
  loadOptionalPatches,
  loadOverlayPatches,
  loadProfileDirectory,
  readProfilePatches,
  type ProfileContext,
} from '@deepseek-ai/dsh-app-boot'

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
  /** ADR-0339: the launcher-owned context handed to `ctx.provide('profileContext')`. The SAME
   *  object drives `readProfilePatches`, so the boot composition and the config-editor's later
   *  recomputation are equal by construction — not by two parallel implementations staying in
   *  sync (ticket 018 D2, field-verified in the ADR-0249 era). */
  readonly profileContext: ProfileContext
}

/** Composition inputs: the profile generation plus every launcher-owned location. */
export interface ShellCompositionInput {
  readonly profileDir: string
  readonly overlayPatchPath: string
  /** Instance-local patch file merged after the overlay (ADR-0162); absent on fresh instances. */
  readonly localPatchPath?: string
  /** The config-editor-owned settings document; MUST live outside the receipt-sealed generation. */
  readonly settingsPatchPath: string
 /** The harness home ($DSH_HOME); `<home>/cordis.patch.yml` is the home patch layer. */
  readonly home: string
  readonly cwd?: string
  readonly telemetryDisabledEnv?: string | undefined
}

/**
 * Build the launcher-owned {@link ProfileContext} exactly as the base recomputes it, and fail
 * loud on the one composition drift the equation cannot tolerate: a NON-EMPTY in-generation
 * user layer. `readProfilePatches` reads bundles + settings document + home patch + overlays
 * with `userLayer:false`; a populated `<profile>/cordis.patch.yml` would be silently dropped
 * from every recomputation, so its presence with rows is a hard error (ADR-0339).
 */
export function createShellProfileContext(input: ShellCompositionInput): {
  readonly context: ProfileContext
  readonly layerNames: readonly string[]
  readonly layerDirs: readonly string[]
} {
  const profile = loadProfileDirectory(SHELL_LABEL, input.profileDir, installAnchor(input.profileDir), { userLayer: false })
  // 上游 0.2.0 起把不可装载的 bundle 改为「跳过并记 skippedBundles、不抛错」；Sage 的 profile 由
  // Sage 物化、声明的 bundle 就是壳的组合合同——跳过等于半装启动，必须响铃（保留 0.1.5 时代的
  // fail-loud 语义；reason 原样携带上游给出的具体原因）。
  if (profile.skippedBundles.length > 0) {
    const details = profile.skippedBundles
      .map(({ packageName, reason }) => `${JSON.stringify(packageName)}: ${reason}`)
      .join('; ')
    throw new Error(`${SHELL_LABEL}: profile ${input.profileDir} declares bundle(s) that did not load: ${details}`)
  }
  const generationUserLayer = loadOptionalPatches(SHELL_LABEL, join(input.profileDir, PROFILE_PATCH_FILENAME))
  if (generationUserLayer !== undefined && generationUserLayer.length > 0) {
    throw new Error(
      `${SHELL_LABEL}: profile user layer ${PROFILE_PATCH_FILENAME} carries ${String(generationUserLayer.length)} row(s) `
      + `but left the composition (ADR-0339); settings live at ${input.settingsPatchPath} — migrate the rows and empty the file`,
    )
  }
  // overlays is a FLAT row list in the base's ProfileContext (`...context.overlays` spreads
  // ROWS, not layers): concatenate each layer's rows in merge order.
  const overlays: PatchOptions[] = [...loadOverlayPatches(SHELL_LABEL, input.overlayPatchPath)]
  if (input.localPatchPath !== undefined && existsSync(input.localPatchPath)) {
    overlays.push(...loadOverlayPatches(SHELL_LABEL, input.localPatchPath))
  }
  const context: ProfileContext = {
    name: 'sage-shell',
    dir: input.profileDir,
    patchPath: input.settingsPatchPath,
    installAnchor: installAnchor(input.profileDir),
    cwd: input.cwd ?? input.profileDir,
    home: input.home,
    startedBundles: profile.layers.map(layer => layer.packageName),
    overlays,
    telemetryDisabledEnv: input.telemetryDisabledEnv,
  }
  return {
    context,
    layerNames: profile.layers.map(layer => layer.packageName),
    layerDirs: profile.layers.map(layer => layer.packageDir),
  }
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
 *
 * ADR-0339: the patch list IS `readProfilePatches(context)` — bundle layers, then the
 * config-editor settings document, then the home patch, then the launcher overlays (shell
 * overlay, then instance-local, ADR-0162 merge-last preserved), plus the telemetry opt-out row.
 * Building it through the base function is what keeps the boot composition and every later
 * config-editor recomputation one fact, not two.
 * @param input - profile directory plus all launcher-owned locations (see {@link ShellCompositionInput}).
 * @returns ordered patches, bundle origins, and the profileContext handed to the host.
 */
export function composeShellPatches(input: ShellCompositionInput): ShellPatches {
  const built = createShellProfileContext(input)
  return {
    patches: readProfilePatches(SHELL_LABEL, built.context),
    layerNames: built.layerNames,
    layerDirs: built.layerDirs,
    profileContext: built.context,
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
