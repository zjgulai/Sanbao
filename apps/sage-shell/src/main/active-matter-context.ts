/**
 * Main-owned active matter context.
 *
 * This is an in-memory coordination kernel, not a product route or an authority provider. The
 * caller supplies facts already established inside Electron main; the kernel only gives those
 * facts one atomic, generation-bound owner. In particular, it performs no I/O and never infers a
 * matter from draft recency, renderer state, or a Host observation.
 */

export interface ActiveMatterContextInput {
  readonly actorScopeRef: string
  readonly matterId: string
  readonly revisionId: string
  readonly workspaceRef: string
  /** Main-only resolved root. It must never cross into the renderer projection. */
  readonly trustedWorkspaceRoot: string
  /** Main-only, non-bearer session reference; null does not imply anonymous authority. */
  readonly sessionRef: string | null
  /** FramePolicy's generation, observed independently from this context's generation. */
  readonly frameGeneration: number
}

export interface ActiveMatterContextSnapshot extends ActiveMatterContextInput {
  readonly contextGeneration: number
}

/** Only these non-sensitive facts may be projected outside the main-owned kernel. */
export interface ActiveMatterContextProjection {
  readonly matterId: string
  readonly revisionId: string
  readonly workspaceRef: string
  readonly contextGeneration: number
  readonly frameGeneration: number
}

/** Exact current facts required before a caller may reuse or replace a context. */
export interface ActiveMatterContextExpectation {
  readonly contextGeneration: number
  readonly actorScopeRef: string
  readonly matterId: string
  readonly revisionId: string
  readonly workspaceRef: string
  readonly sessionRef: string | null
  readonly frameGeneration: number
}

export type ActiveMatterContextRefusalCode =
  | 'stale-context-generation'
  | 'context-inactive'
  | 'context-already-active'
  | 'matter-mismatch'
  | 'workspace-mismatch'
  | 'stale-current-revision'
  | 'actor-scope-mismatch'
  | 'session-mismatch'
  | 'frame-generation-mismatch'

export interface ActiveMatterContextRefusal {
  readonly ok: false
  readonly code: ActiveMatterContextRefusalCode
}

export type ActiveMatterContextMatch =
  | { readonly ok: true, readonly snapshot: ActiveMatterContextSnapshot }
  | ActiveMatterContextRefusal

export type ActiveMatterContextTransition =
  | {
    readonly ok: true
    readonly contextGeneration: number
    readonly snapshot: ActiveMatterContextSnapshot | null
  }
  | ActiveMatterContextRefusal

export interface ActiveMatterContextActivation {
  readonly expectedContextGeneration: number
  readonly next: ActiveMatterContextInput
}

export interface ActiveMatterContextReplacement {
  readonly expected: ActiveMatterContextExpectation
  readonly next: ActiveMatterContextInput
}

export interface ActiveMatterContextInvalidation {
  readonly expected: ActiveMatterContextExpectation
}

/** Explicit user selection is the only transition allowed to replace the matter/workspace tuple. */
export interface ActiveMatterContextSelection {
  readonly expectedContextGeneration: number
  readonly next: ActiveMatterContextInput
}

export interface ActiveMatterContext {
  /** The generation remains observable while inactive so a later activation can use CAS. */
  readonly contextGeneration: () => number
  readonly snapshot: () => ActiveMatterContextSnapshot | null
  readonly projection: () => ActiveMatterContextProjection | null
  readonly match: (expected: ActiveMatterContextExpectation) => ActiveMatterContextMatch
  readonly activate: (request: ActiveMatterContextActivation) => ActiveMatterContextTransition
  readonly replace: (request: ActiveMatterContextReplacement) => ActiveMatterContextTransition
  readonly invalidate: (request: ActiveMatterContextInvalidation) => ActiveMatterContextTransition
  readonly select: (request: ActiveMatterContextSelection) => ActiveMatterContextTransition
}

const refusal = (code: ActiveMatterContextRefusalCode): ActiveMatterContextRefusal => Object.freeze({ ok: false, code })

function makeSnapshot(input: ActiveMatterContextInput, contextGeneration: number): ActiveMatterContextSnapshot {
  return Object.freeze({
    actorScopeRef: input.actorScopeRef,
    matterId: input.matterId,
    revisionId: input.revisionId,
    workspaceRef: input.workspaceRef,
    trustedWorkspaceRoot: input.trustedWorkspaceRoot,
    sessionRef: input.sessionRef,
    contextGeneration,
    frameGeneration: input.frameGeneration,
  })
}

export function projectActiveMatterContext(snapshot: ActiveMatterContextSnapshot): ActiveMatterContextProjection {
  return Object.freeze({
    matterId: snapshot.matterId,
    revisionId: snapshot.revisionId,
    workspaceRef: snapshot.workspaceRef,
    contextGeneration: snapshot.contextGeneration,
    frameGeneration: snapshot.frameGeneration,
  })
}

export function createActiveMatterContext(): ActiveMatterContext {
  let generation = 0
  let current: ActiveMatterContextSnapshot | null = null

  const match = (expected: ActiveMatterContextExpectation): ActiveMatterContextMatch => {
    if (expected.contextGeneration !== generation) return refusal('stale-context-generation')
    if (current === null) return refusal('context-inactive')
    if (expected.matterId !== current.matterId) return refusal('matter-mismatch')
    if (expected.workspaceRef !== current.workspaceRef) return refusal('workspace-mismatch')
    if (expected.revisionId !== current.revisionId) return refusal('stale-current-revision')
    if (expected.actorScopeRef !== current.actorScopeRef) return refusal('actor-scope-mismatch')
    if (expected.sessionRef !== current.sessionRef) return refusal('session-mismatch')
    if (expected.frameGeneration !== current.frameGeneration) return refusal('frame-generation-mismatch')
    return Object.freeze({ ok: true, snapshot: current })
  }

  const transition = (snapshot: ActiveMatterContextSnapshot | null): ActiveMatterContextTransition => Object.freeze({
    ok: true,
    contextGeneration: generation,
    snapshot,
  })

  return Object.freeze({
    contextGeneration: () => generation,
    snapshot: () => current,
    projection: () => current === null ? null : projectActiveMatterContext(current),
    match,
    activate(request: ActiveMatterContextActivation) {
      if (request.expectedContextGeneration !== generation) return refusal('stale-context-generation')
      if (current !== null) return refusal('context-already-active')
      generation += 1
      current = makeSnapshot(request.next, generation)
      return transition(current)
    },
    replace(request: ActiveMatterContextReplacement) {
      const matched = match(request.expected)
      if (!matched.ok) return matched
      const active = matched.snapshot
      if (request.next.matterId !== active.matterId) return refusal('matter-mismatch')
      if (
        request.next.workspaceRef !== active.workspaceRef
        || request.next.trustedWorkspaceRoot !== active.trustedWorkspaceRoot
      ) return refusal('workspace-mismatch')
      if (request.next.actorScopeRef !== active.actorScopeRef) return refusal('actor-scope-mismatch')
      generation += 1
      current = makeSnapshot(request.next, generation)
      return transition(current)
    },
    invalidate(request: ActiveMatterContextInvalidation) {
      const matched = match(request.expected)
      if (!matched.ok) return matched
      generation += 1
      current = null
      return transition(null)
    },
    select(request: ActiveMatterContextSelection) {
      if (request.expectedContextGeneration !== generation) return refusal('stale-context-generation')
      generation += 1
      current = makeSnapshot(request.next, generation)
      return transition(current)
    },
  })
}
