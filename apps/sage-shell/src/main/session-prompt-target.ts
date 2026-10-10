/** T05-mid: the real target step over the shipped requirement bundle (ADR-0282).
 *
 *  Resolves the operation's kernel action scope through the SAME action authority table the
 *  identity step reads, finds the published requirement that declares that scope inside the
 *  shipped snapshot, and evaluates the bundled C2.2T provider at the caller-visible clock.
 *
 *  Every failure — no bundle, no registered operation, no declaring requirement, an ambiguous
 *  pair of declaring requirements, or any provider code (not-effective / expired / revoked /
 *  not-found) — answers `unavailable`: a trusted target fact cannot be invented or widened, and
 *  the kernel maps this stage to `protected-effect-unavailable` with stage `target`. The
 *  `targetRef` is deterministic from the snapshot: re-publishing moves it by construction.
 */
import type { ProtectedEffectAdmissionPorts } from '../appservice/protected-effect-admission.js'
import { createBundledCompatibilityTargetProvider } from '../security/compatibility-target-requirement.js'
import { ACTION_AUTHORITY_TABLE } from './action-authority-table.js'
import type { RequirementBundleLoad } from './publication-bundle.js'

export interface SessionPromptTargetOptions {
  readonly bundle: RequirementBundleLoad
  readonly now: () => string
}

export function createSessionPromptTargetPort(
  options: SessionPromptTargetOptions,
): NonNullable<ProtectedEffectAdmissionPorts['resolveTarget']> {
  const provider = options.bundle.ok
    ? createBundledCompatibilityTargetProvider(options.bundle.snapshot)
    : undefined
  const snapshot = options.bundle.ok ? options.bundle.snapshot : undefined
  return async ({ intent }) => {
    if (provider === undefined || snapshot === undefined) return { state: 'unavailable' }
    const entry = ACTION_AUTHORITY_TABLE[intent.operation]
    if (entry === undefined) return { state: 'unavailable' }
    const declaring = snapshot.entries.filter(candidate => candidate.actionRequirements
      .some(action => action.actionScope === entry.actionScope))
    const requirement = declaring.length === 1 ? declaring[0] : undefined
    if (requirement === undefined) return { state: 'unavailable' }
    const resolved = provider.resolve({
      requirementId: requirement.requirementId,
      actionScope: entry.actionScope,
      evaluatedAt: options.now(),
    })
    if (resolved.kind !== 'available') return { state: 'unavailable' }
    return {
      state: 'allowed',
      value: { targetRef: `target:${resolved.snapshotId}:${resolved.requirement.requirementDigest}` },
    }
  }
}
