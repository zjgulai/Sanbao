/** ADR-0294: currency of the boot runtime-inventory observation against the live Host epoch.
 *
 *  The startup composition reads the runtime inventory exactly once and serves it to the
 *  admission chain (compatibility, and through the requirement's provenance the target step
 *  too). Registered follow-up from ADR-0284/0286/0289: when the Host epoch is gone or has moved,
 *  the chain must NOT keep evaluating against a dead epoch's facts — it fails closed instead.
 *
 *  The host snapshot is the live truth: `runtime-invalidated` bumps `runtimeGeneration` and
 *  flips kind to `unavailable`; a fresh epoch carries a new bootId. The check is therefore:
 *  the snapshot is active AND matches the observation's bootId and runtimeGeneration exactly.
 *  Pure and allocation-free so the per-request observation closure can call it cheaply.
 */
export function isInventoryObservationCurrent(
  evidence: { readonly bootId: string; readonly runtimeGeneration: number },
  snapshot: {
    readonly kind: string
    readonly bootId?: string | undefined
    readonly runtimeGeneration?: number | undefined
  },
): boolean {
  return snapshot.kind === 'active'
    && snapshot.bootId === evidence.bootId
    && snapshot.runtimeGeneration === evidence.runtimeGeneration
}
