/** T05-mid publication bundle loader (ADR-0282): reads the shipped, sealed C2.2T requirement
 *  snapshot from the shell's own `publications/` tree. The relative layout is identical in a dev
 *  checkout (`apps/sage-shell/publications/…`) and inside the packaged runtime
 *  (`<resources>/app/publications/…`, copied by the producer), because both resolve from
 *  `lib/main/` (or `src/main/` under the test transform) two levels up.
 *
 *  The kernel parse is the validation gate — a missing, malformed or tampered bundle can only
 *  produce `{ ok: false }`, and consumers keep the target step present but unavailable-first.
 *  A publication is governance data: this loader never repairs, never defaults, never reseals.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  parseCompatibilityTargetRequirementSnapshot,
  type CompatibilityTargetRequirementSnapshotV1,
} from '../security/compatibility-target-requirement.js'
import {
  createBundledCompatibilityMatrixProviderV2,
  parseCompatibilityMatrixBundleV2,
  parseCompatibilityMatrixRevocationSourceV2,
  type CompatibilityMatrixBundleV2,
  type CompatibilityMatrixProviderV2,
  type CompatibilityMatrixRevocationSourceV2,
} from '../security/compatibility-matrix-provider.js'
import {
  parseCapabilityRegistrySnapshot,
  sealCapabilityRegistrySnapshot,
  type CapabilityRegistrySnapshotBodyV1,
} from '../security/capability-registry.js'

/** The first shipped publication (ADR-0278 bytes, sealed through the C2.2T kernel). */
export const SESSION_PROMPT_REQUIREMENT_BUNDLE_REL_PATH = 'publications/session-prompt.requirement-snapshot.json'
/** The first shipped matrix pair publication (ADR-0284 bytes, sealed through the C2 matrix kernel). */
export const SESSION_PROMPT_MATRIX_BUNDLE_REL_PATH = 'publications/session-prompt.compatibility-matrix-bundle.json'
export const SESSION_PROMPT_MATRIX_REVOCATION_REL_PATH = 'publications/session-prompt.matrix-revocation-source.json'
/** The first non-empty published registry snapshot (ADR-0285): the approved first-party entry. */
export const SESSION_PROMPT_CAPABILITY_REGISTRY_REL_PATH = 'publications/session-prompt.capability-registry.json'

export type RequirementBundleLoad =
  | {
      readonly ok: true
      readonly snapshotId: string
      readonly snapshot: CompatibilityTargetRequirementSnapshotV1
    }
  | { readonly ok: false; readonly reason: string }

export type CompatibilityMatrixPublicationLoad =
  | {
      readonly ok: true
      readonly provider: CompatibilityMatrixProviderV2
      readonly bundleId: string
      readonly matrixId: string
      readonly revocationSourceId: string
      /** The sealed bundle bytes (ADR-0288): the persist step rebuilds the historical matrix from
       *  these exact values, not from a second read of the file. */
      readonly bundle: CompatibilityMatrixBundleV2
      readonly revocationSource: CompatibilityMatrixRevocationSourceV2
    }
  | { readonly ok: false; readonly reason: string }

export type CapabilityRegistryPublicationLoad =
  | {
      readonly ok: true
      readonly snapshotId: string
      readonly snapshotBody: CapabilityRegistrySnapshotBodyV1
    }
  | { readonly ok: false; readonly reason: string }

function readJsonFile(baseDir: string, relPath: string): { ok: true; value: unknown } | { ok: false; reason: string } {
  let text: string
  try {
    text = readFileSync(join(baseDir, relPath), 'utf8')
  } catch (error) {
    return { ok: false, reason: `${relPath} is unreadable: ${error instanceof Error ? error.message : String(error)}` }
  }
  try {
    return { ok: true, value: JSON.parse(text) as unknown }
  } catch {
    return { ok: false, reason: `${relPath} is not valid JSON` }
  }
}

export function loadSessionPromptRequirementBundle(
  options: { readonly baseDir?: string } = {},
): RequirementBundleLoad {
  const baseDir = options.baseDir ?? fileURLToPath(new URL('../../', import.meta.url))
  const file = readJsonFile(baseDir, SESSION_PROMPT_REQUIREMENT_BUNDLE_REL_PATH)
  if (!file.ok) return { ok: false, reason: `requirement bundle: ${file.reason}` }
  const parsed = parseCompatibilityTargetRequirementSnapshot(file.value)
  if (!parsed.ok) {
    return { ok: false, reason: `requirement bundle rejected by the kernel: ${parsed.code}: ${parsed.reason}` }
  }
  return { ok: true, snapshotId: parsed.value.snapshotId, snapshot: parsed.value }
}

/** Load the published registry snapshot and prove it re-seals to the same snapshot id before it
 *  may supersede the bundled empty default (ADR-0285). The body — not the sealed object's extra
 *  key — is what the bundled provider factory accepts, so the round trip is the load contract. */
export function loadSessionPromptCapabilityRegistry(
  options: { readonly baseDir?: string } = {},
): CapabilityRegistryPublicationLoad {
  const baseDir = options.baseDir ?? fileURLToPath(new URL('../../', import.meta.url))
  const file = readJsonFile(baseDir, SESSION_PROMPT_CAPABILITY_REGISTRY_REL_PATH)
  if (!file.ok) return { ok: false, reason: `capability registry publication: ${file.reason}` }
  const parsed = parseCapabilityRegistrySnapshot(file.value)
  if (!parsed.ok) {
    return { ok: false, reason: `capability registry publication rejected by the kernel: ${parsed.code}: ${parsed.reason}` }
  }
  const snapshot = parsed.value
  const snapshotBody: CapabilityRegistrySnapshotBodyV1 = {
    schemaVersion: snapshot.schemaVersion,
    canonicalizationVersion: snapshot.canonicalizationVersion,
    createdAt: snapshot.createdAt,
    entries: snapshot.entries,
    ...(snapshot.supersedesSnapshotId === undefined ? {} : { supersedesSnapshotId: snapshot.supersedesSnapshotId }),
  }
  const resealed = sealCapabilityRegistrySnapshot(snapshotBody)
  if (!resealed.ok) {
    return { ok: false, reason: `capability registry publication does not re-seal: ${resealed.code}: ${resealed.reason}` }
  }
  if (resealed.value.snapshotId !== snapshot.snapshotId) {
    return { ok: false, reason: 'capability registry publication snapshot id drifted across the seal round trip' }
  }
  return { ok: true, snapshotId: snapshot.snapshotId, snapshotBody }
}

export function loadSessionPromptCompatibilityPublication(
  options: { readonly baseDir?: string } = {},
): CompatibilityMatrixPublicationLoad {
  const baseDir = options.baseDir ?? fileURLToPath(new URL('../../', import.meta.url))
  const bundleFile = readJsonFile(baseDir, SESSION_PROMPT_MATRIX_BUNDLE_REL_PATH)
  if (!bundleFile.ok) return { ok: false, reason: `matrix bundle: ${bundleFile.reason}` }
  const revocationFile = readJsonFile(baseDir, SESSION_PROMPT_MATRIX_REVOCATION_REL_PATH)
  if (!revocationFile.ok) return { ok: false, reason: `matrix revocation source: ${revocationFile.reason}` }
  const parsedBundle = parseCompatibilityMatrixBundleV2(bundleFile.value)
  if (!parsedBundle.ok) {
    return { ok: false, reason: `matrix bundle rejected by the kernel: ${parsedBundle.code}: ${parsedBundle.reason}` }
  }
  const parsedRevocation = parseCompatibilityMatrixRevocationSourceV2(revocationFile.value)
  if (!parsedRevocation.ok) {
    return {
      ok: false,
      reason: `matrix revocation source rejected by the kernel: ${parsedRevocation.code}: ${parsedRevocation.reason}`,
    }
  }
  const matrixId = parsedBundle.value.artifacts[0]?.matrixId
  if (matrixId === undefined) return { ok: false, reason: 'matrix bundle ships no artifacts' }
  return {
    ok: true,
    provider: createBundledCompatibilityMatrixProviderV2(parsedBundle.value, parsedRevocation.value),
    bundleId: parsedBundle.value.bundleId,
    matrixId,
    revocationSourceId: parsedRevocation.value.sourceId,
    bundle: parsedBundle.value,
    revocationSource: parsedRevocation.value,
  }
}
