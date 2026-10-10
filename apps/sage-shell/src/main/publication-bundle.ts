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

/** The first shipped publication (ADR-0278 bytes, sealed through the C2.2T kernel). */
export const SESSION_PROMPT_REQUIREMENT_BUNDLE_REL_PATH = 'publications/session-prompt.requirement-snapshot.json'

export type RequirementBundleLoad =
  | {
      readonly ok: true
      readonly snapshotId: string
      readonly snapshot: CompatibilityTargetRequirementSnapshotV1
    }
  | { readonly ok: false; readonly reason: string }

export function loadSessionPromptRequirementBundle(
  options: { readonly baseDir?: string } = {},
): RequirementBundleLoad {
  const baseDir = options.baseDir ?? fileURLToPath(new URL('../../', import.meta.url))
  let text: string
  try {
    text = readFileSync(join(baseDir, SESSION_PROMPT_REQUIREMENT_BUNDLE_REL_PATH), 'utf8')
  } catch (error) {
    return {
      ok: false,
      reason: `requirement bundle is unreadable: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return { ok: false, reason: 'requirement bundle is not valid JSON' }
  }
  const parsed = parseCompatibilityTargetRequirementSnapshot(value)
  if (!parsed.ok) {
    return { ok: false, reason: `requirement bundle rejected by the kernel: ${parsed.code}: ${parsed.reason}` }
  }
  return { ok: true, snapshotId: parsed.value.snapshotId, snapshot: parsed.value }
}
