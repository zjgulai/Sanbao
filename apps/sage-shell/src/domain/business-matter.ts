export type BusinessMatterErrorCode =
  | 'active-attempt'
  | 'compatibility-blocked'
  | 'decision-invalid'
  | 'decision-required'
  | 'duplicate-id'
  | 'evidence-not-ready'
  | 'invalid-event-stream'
  | 'invalid-input'
  | 'invalid-transition'
  | 'receipt-authority'
  | 'reference-mismatch'

export class BusinessMatterError extends Error {
  readonly code: BusinessMatterErrorCode

  constructor(code: BusinessMatterErrorCode, message: string) {
    super(message)
    this.name = 'BusinessMatterError'
    this.code = code
  }
}

export type BusinessMatterStage =
  | 'created'
  | 'evidence'
  | 'running'
  | 'clarification'
  | 'artifact-receipt'
  | 'failed-retry'

export type BusinessMatterConclusion = 'completed' | 'stopped'

export type EffectClass =
  | 'local-read'
  | 'local-write'
  | 'external-read'
  | 'external-write'
  | 'privileged'

export interface HumanRoleRef {
  readonly kind: 'human'
  readonly roleRef: string
}

export interface EvidenceRef {
  readonly evidenceId: string
  readonly source: string
  readonly observedAt: string
  readonly status: 'supported' | 'insufficient' | 'contradicted'
}

export interface ExplicitUnknown {
  readonly unknownId: string
  readonly description: string
}

export interface DependencyRef {
  readonly dependencyId: string
  readonly status: 'ready' | 'blocked' | 'unknown'
}

export interface ExperienceRef {
  readonly experienceId: string
  readonly sourceRevisionId: string
  readonly sourceEventId: string
  readonly adoption: 'adopted' | 'adapted' | 'rejected'
}

export interface ActionPolicy {
  readonly actionScope: string
  readonly effectClass: EffectClass
  readonly requiresDecision: boolean
}

export interface VersionedIdentity {
  readonly identity: string
  readonly version: string
  readonly digest: string
}

export interface ExecutionSnapshot {
  readonly provider: VersionedIdentity
  readonly model: VersionedIdentity
  readonly agent: VersionedIdentity
  readonly preset: VersionedIdentity
  readonly capabilities: readonly VersionedIdentity[]
}

export type CompatibilityOutcome =
  | 'equivalent'
  | 'requires-new-revision'
  | 'unknown'

export interface CompatibilityDecision {
  readonly outcome: CompatibilityOutcome
  readonly matrixId: string
  readonly reason: string
}

export interface RevisionSnapshot {
  readonly revisionId: string
  readonly predecessorRevisionId: string | undefined
  readonly createdByEventId: string
  readonly matterCreatedByEventId: string
  readonly changeReason: string
  readonly scope: string
  readonly permissionBoundary: string
  readonly dataDestination: string
  readonly evidence: readonly EvidenceRef[]
  readonly unknowns: readonly ExplicitUnknown[]
  readonly options: readonly string[]
  readonly dependencies: readonly DependencyRef[]
  readonly experienceRefs: readonly ExperienceRef[]
  readonly actionPolicies: readonly ActionPolicy[]
}

export interface DecisionProjection {
  readonly decisionId: string
  readonly revisionId: string
  readonly actionScope: string
  readonly status: 'approved' | 'rejected' | 'revoked'
  readonly actor: HumanRoleRef
  readonly reason: string
  readonly expiresAt: string | undefined
  readonly recordedAt: string
  readonly revokedAt: string | undefined
  readonly revocationReason: string | undefined
}

export interface AttemptProjection {
  readonly attemptId: string
  readonly revisionId: string
  readonly actionScopes: readonly string[]
  readonly actionPolicies: readonly ActionPolicy[]
  readonly decisionIds: readonly string[]
  readonly executionSnapshot: ExecutionSnapshot
  readonly compatibility: CompatibilityDecision
  readonly status: 'running' | 'blocked' | 'failed' | 'succeeded'
  readonly startedAt: string
  readonly endedAt: string | undefined
  readonly terminationReason: string | undefined
}

export interface ArtifactProjection {
  readonly artifactId: string
  readonly revisionId: string
  readonly attemptId: string
  readonly kind: string
  readonly locator: string
  readonly digest: string
  readonly recordedAt: string
}

export interface ReceiptProjection {
  readonly receiptId: string
  readonly revisionId: string
  readonly artifactId: string
  readonly verdict: 'accepted' | 'rejected'
  readonly actor: HumanRoleRef
  readonly reason: string
  readonly evidenceRefs: readonly string[]
  readonly recordedAt: string
}

export interface ClarificationProjection {
  readonly eventId: string
  readonly revisionId: string
  readonly attemptId: string | undefined
  readonly actionScope: string | undefined
  readonly reason: string
  readonly requestedAt: string
}

interface MatterCreatedEvent {
  readonly type: 'matter-created'
  readonly eventId: string
  readonly matterId: string
  readonly occurredAt: string
  readonly goal: string
  readonly responsibleParty: HumanRoleRef
}

interface RevisionEnteredEvent {
  readonly type: 'revision-entered'
  readonly eventId: string
  readonly matterId: string
  readonly occurredAt: string
  readonly revision: RevisionSnapshot
}

interface ClarificationRequestedEvent {
  readonly type: 'clarification-requested'
  readonly eventId: string
  readonly matterId: string
  readonly occurredAt: string
  readonly revisionId: string
  readonly attemptId: string | undefined
  readonly actionScope: string | undefined
  readonly reason: string
}

interface DecisionRecordedEvent {
  readonly type: 'decision-recorded'
  readonly eventId: string
  readonly matterId: string
  readonly occurredAt: string
  readonly decision: Omit<
    DecisionProjection,
    'status' | 'revokedAt' | 'revocationReason'
  > & {
    readonly outcome: 'approved' | 'rejected'
  }
}

interface DecisionRevokedEvent {
  readonly type: 'decision-revoked'
  readonly eventId: string
  readonly matterId: string
  readonly occurredAt: string
  readonly decisionId: string
  readonly reason: string
}

interface AttemptStartedEvent {
  readonly type: 'attempt-started'
  readonly eventId: string
  readonly matterId: string
  readonly occurredAt: string
  readonly attempt: Omit<
    AttemptProjection,
    'status' | 'startedAt' | 'endedAt' | 'terminationReason'
  >
}

interface AttemptFailedEvent {
  readonly type: 'attempt-failed'
  readonly eventId: string
  readonly matterId: string
  readonly occurredAt: string
  readonly attemptId: string
  readonly source:
    | 'runtime'
    | 'tool'
    | 'profile-generation'
    | 'execution-snapshot-changed'
    | 'other'
  readonly reason: string
  readonly impact: string
}

interface RevisionReconfirmedEvent {
  readonly type: 'revision-reconfirmed'
  readonly eventId: string
  readonly matterId: string
  readonly occurredAt: string
  readonly revisionId: string
  readonly compatibility: CompatibilityDecision
  readonly reason: string
}

interface ArtifactRecordedEvent {
  readonly type: 'artifact-recorded'
  readonly eventId: string
  readonly matterId: string
  readonly occurredAt: string
  readonly artifact: Omit<ArtifactProjection, 'revisionId' | 'recordedAt'>
}

interface ReceiptRecordedEvent {
  readonly type: 'receipt-recorded'
  readonly eventId: string
  readonly matterId: string
  readonly occurredAt: string
  readonly receipt: Omit<ReceiptProjection, 'revisionId' | 'recordedAt'>
}

interface MatterStoppedEvent {
  readonly type: 'matter-stopped'
  readonly eventId: string
  readonly matterId: string
  readonly occurredAt: string
  readonly revisionId: string
  readonly reason: string
}

export type BusinessMatterEvent =
  | MatterCreatedEvent
  | RevisionEnteredEvent
  | ClarificationRequestedEvent
  | DecisionRecordedEvent
  | DecisionRevokedEvent
  | AttemptStartedEvent
  | AttemptFailedEvent
  | RevisionReconfirmedEvent
  | ArtifactRecordedEvent
  | ReceiptRecordedEvent
  | MatterStoppedEvent

const BUSINESS_MATTER_BRAND: unique symbol = Symbol('BusinessMatter')
const TRUSTED_BUSINESS_MATTERS = new WeakSet<object>()

export interface BusinessMatter {
  readonly [BUSINESS_MATTER_BRAND]: true
  readonly events: readonly BusinessMatterEvent[]
}

export interface BusinessMatterProjection {
  readonly matterId: string
  readonly creationEventId: string
  readonly goal: string
  readonly responsibleParty: HumanRoleRef
  readonly stage: BusinessMatterStage
  readonly conclusion: BusinessMatterConclusion | undefined
  readonly currentRevisionId: string | undefined
  readonly activeAttemptId: string | undefined
  readonly pendingClarification: ClarificationProjection | undefined
  readonly revisions: readonly RevisionSnapshot[]
  readonly decisions: readonly DecisionProjection[]
  readonly attempts: readonly AttemptProjection[]
  readonly artifacts: readonly ArtifactProjection[]
  readonly receipts: readonly ReceiptProjection[]
}

export interface CreateBusinessMatterInput {
  readonly matterId: string
  readonly eventId: string
  readonly occurredAt: string
  readonly goal: string
  readonly responsibleParty: HumanRoleRef
}

export interface EnterEvidenceInput {
  readonly eventId: string
  readonly occurredAt: string
  readonly revisionId: string
  readonly changeReason: string
  readonly scope: string
  readonly permissionBoundary: string
  readonly dataDestination: string
  readonly evidence: readonly EvidenceRef[]
  readonly unknowns: readonly ExplicitUnknown[]
  readonly options: readonly string[]
  readonly dependencies: readonly DependencyRef[]
  readonly experienceRefs: readonly ExperienceRef[]
  readonly actionPolicies: readonly ActionPolicy[]
}

export interface RequestClarificationInput {
  readonly eventId: string
  readonly occurredAt: string
  readonly revisionId: string
  readonly actionScope: string | undefined
  readonly reason: string
}

export interface RecordDecisionInput {
  readonly eventId: string
  readonly occurredAt: string
  readonly decisionId: string
  readonly revisionId: string
  readonly actionScope: string
  readonly outcome: 'approved' | 'rejected'
  readonly actor: HumanRoleRef
  readonly reason: string
  readonly expiresAt: string | undefined
}

export interface RevokeDecisionInput {
  readonly eventId: string
  readonly occurredAt: string
  readonly decisionId: string
  readonly reason: string
}

export interface StartAttemptInput {
  readonly eventId: string
  readonly occurredAt: string
  readonly attemptId: string
  readonly revisionId: string
  readonly actionScopes: readonly string[]
  readonly decisionIds: readonly string[]
  readonly executionSnapshot: ExecutionSnapshot
  readonly compatibility: CompatibilityDecision
}

export interface FailAttemptInput {
  readonly eventId: string
  readonly occurredAt: string
  readonly attemptId: string
  readonly source: AttemptFailedEvent['source']
  readonly reason: string
  readonly impact: string
}

export interface ReconfirmRevisionInput {
  readonly eventId: string
  readonly occurredAt: string
  readonly revisionId: string
  readonly compatibility: CompatibilityDecision
  readonly reason: string
}

export interface RecordArtifactInput {
  readonly eventId: string
  readonly occurredAt: string
  readonly artifactId: string
  readonly attemptId: string
  readonly kind: string
  readonly locator: string
  readonly digest: string
}

export interface RecordReceiptInput {
  readonly eventId: string
  readonly occurredAt: string
  readonly receiptId: string
  readonly artifactId: string
  readonly verdict: 'accepted' | 'rejected'
  readonly actor: HumanRoleRef
  readonly reason: string
  readonly evidenceRefs: readonly string[]
}

export interface StopMatterInput {
  readonly eventId: string
  readonly occurredAt: string
  readonly revisionId: string
  readonly reason: string
}

const EFFECT_CLASSES: readonly EffectClass[] = [
  'local-read',
  'local-write',
  'external-read',
  'external-write',
  'privileged',
]

const EVIDENCE_STATUSES: readonly EvidenceRef['status'][] = [
  'supported',
  'insufficient',
  'contradicted',
]

const DEPENDENCY_STATUSES: readonly DependencyRef['status'][] = [
  'ready',
  'blocked',
  'unknown',
]

const ADOPTION_RELATIONS: readonly ExperienceRef['adoption'][] = [
  'adopted',
  'adapted',
  'rejected',
]

const FAILURE_SOURCES: readonly AttemptFailedEvent['source'][] = [
  'runtime',
  'tool',
  'profile-generation',
  'execution-snapshot-changed',
  'other',
]

function error(code: BusinessMatterErrorCode, message: string): never {
  throw new BusinessMatterError(code, message)
}

function assertNonBlank(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    error('invalid-input', `${field} must be a non-empty string.`)
  }
}

function assertIsoTimestamp(value: unknown, field: string): asserts value is string {
  assertNonBlank(value, field)
  const isoUtc = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u
  const timestamp = Date.parse(value)
  const normalized = value.includes('.') ? value : value.replace(/Z$/u, '.000Z')
  if (
    !isoUtc.test(value) ||
    Number.isNaN(timestamp) ||
    new Date(timestamp).toISOString() !== normalized
  ) {
    error('invalid-input', `${field} must be a valid UTC ISO-8601 timestamp.`)
  }
}

function assertArray(value: unknown, field: string): asserts value is readonly unknown[] {
  if (!Array.isArray(value)) {
    error('invalid-input', `${field} must be an explicitly declared array.`)
  }
}

function assertUnique(values: readonly string[], field: string): void {
  if (new Set(values).size !== values.length) {
    error('duplicate-id', `${field} contains a duplicate value.`)
  }
}

function assertHumanRole(value: unknown, field: string): asserts value is HumanRoleRef {
  if (typeof value !== 'object' || value === null) {
    error('invalid-input', `${field} must identify a human role.`)
  }
  const candidate = value as Partial<HumanRoleRef>
  if (candidate.kind !== 'human') {
    error('invalid-input', `${field}.kind must be human.`)
  }
  assertNonBlank(candidate.roleRef, `${field}.roleRef`)
}

function cloneHumanRole(value: HumanRoleRef): HumanRoleRef {
  return {
    kind: 'human',
    roleRef: value.roleRef,
  }
}

function assertNoConclusion(state: BusinessMatterProjection): void {
  if (state.conclusion !== undefined) {
    error(
      'invalid-transition',
      `Revision ${state.currentRevisionId ?? '(none)'} already concluded as ${state.conclusion}.`,
    )
  }
}

function assertCurrentRevision(
  state: BusinessMatterProjection,
  revisionId: string,
): RevisionSnapshot {
  assertNonBlank(revisionId, 'revisionId')
  if (state.currentRevisionId !== revisionId) {
    error(
      'reference-mismatch',
      `Revision ${revisionId} is not the current revision ${state.currentRevisionId ?? '(none)'}.`,
    )
  }
  const revision = state.revisions.find((item) => item.revisionId === revisionId)
  if (revision === undefined) {
    error('invalid-event-stream', `Current revision ${revisionId} is missing.`)
  }
  return revision
}

function assertRevisionReady(revision: RevisionSnapshot): void {
  if (!revision.evidence.some((item) => item.status === 'supported')) {
    error('evidence-not-ready', 'At least one supported evidence item is required.')
  }
  if (revision.unknowns.length > 0) {
    error('evidence-not-ready', 'Material unknowns must be resolved before execution.')
  }
  if (revision.dependencies.some((item) => item.status !== 'ready')) {
    error('evidence-not-ready', 'Every declared dependency must be ready.')
  }
}

function assertCompatibility(decision: CompatibilityDecision): void {
  if (typeof decision !== 'object' || decision === null) {
    error('compatibility-blocked', 'A compatibility matrix decision is required.')
  }
  if (
    decision.outcome !== 'equivalent' &&
    decision.outcome !== 'requires-new-revision' &&
    decision.outcome !== 'unknown'
  ) {
    error('compatibility-blocked', 'The compatibility outcome is unknown.')
  }
  if (
    typeof decision.matrixId !== 'string' ||
    decision.matrixId.trim().length === 0 ||
    typeof decision.reason !== 'string' ||
    decision.reason.trim().length === 0
  ) {
    error(
      'compatibility-blocked',
      'Compatibility requires a non-empty matrix identity and reason.',
    )
  }
  if (decision.outcome !== 'equivalent') {
    error(
      'compatibility-blocked',
      `Compatibility outcome ${decision.outcome} cannot run the current revision.`,
    )
  }
}

function assertVersionedIdentity(value: unknown, field: string): void {
  if (typeof value !== 'object' || value === null) {
    error('compatibility-blocked', `${field} identity snapshot is missing.`)
  }
  const candidate = value as Partial<VersionedIdentity>
  for (const [name, item] of [
    ['identity', candidate.identity],
    ['version', candidate.version],
    ['digest', candidate.digest],
  ] as const) {
    if (typeof item !== 'string' || item.trim().length === 0) {
      error('compatibility-blocked', `${field}.${name} is required.`)
    }
  }
}

function assertExecutionSnapshot(value: ExecutionSnapshot): void {
  if (typeof value !== 'object' || value === null) {
    error('compatibility-blocked', 'The execution identity snapshot is missing.')
  }
  assertVersionedIdentity(value.provider, 'executionSnapshot.provider')
  assertVersionedIdentity(value.model, 'executionSnapshot.model')
  assertVersionedIdentity(value.agent, 'executionSnapshot.agent')
  assertVersionedIdentity(value.preset, 'executionSnapshot.preset')
  if (!Array.isArray(value.capabilities)) {
    error('compatibility-blocked', 'executionSnapshot.capabilities must be declared.')
  }
  value.capabilities.forEach((item, index) => {
    assertVersionedIdentity(item, `executionSnapshot.capabilities[${index}]`)
  })
  assertUnique(
    value.capabilities.map((item) => item.identity),
    'executionSnapshot.capabilities identities',
  )
}

function cloneVersionedIdentity(value: VersionedIdentity): VersionedIdentity {
  return {
    identity: value.identity,
    version: value.version,
    digest: value.digest,
  }
}

function cloneExecutionSnapshot(value: ExecutionSnapshot): ExecutionSnapshot {
  return {
    provider: cloneVersionedIdentity(value.provider),
    model: cloneVersionedIdentity(value.model),
    agent: cloneVersionedIdentity(value.agent),
    preset: cloneVersionedIdentity(value.preset),
    capabilities: value.capabilities.map(cloneVersionedIdentity),
  }
}

function cloneCompatibility(value: CompatibilityDecision): CompatibilityDecision {
  return {
    outcome: value.outcome,
    matrixId: value.matrixId,
    reason: value.reason,
  }
}

function freezeDeep<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
    return value
  }

  for (const key of Reflect.ownKeys(value)) {
    freezeDeep(Reflect.get(value, key))
  }

  return Object.freeze(value)
}

function makeBusinessMatter(
  events: readonly BusinessMatterEvent[],
): BusinessMatter {
  const matter = freezeDeep({
    [BUSINESS_MATTER_BRAND]: true as const,
    events: [...events],
  })
  TRUSTED_BUSINESS_MATTERS.add(matter)
  return matter
}

function appendEvents(
  matter: BusinessMatter,
  ...events: readonly BusinessMatterEvent[]
): BusinessMatter {
  const eventIds = new Set(matter.events.map((event) => event.eventId))
  const matterId = projectBusinessMatter(matter).matterId
  let previousOccurredAt = Date.parse(
    matter.events[matter.events.length - 1]?.occurredAt ?? '',
  )

  for (const event of events) {
    if (eventIds.has(event.eventId)) {
      error('duplicate-id', `Event ${event.eventId} already exists.`)
    }
    if (event.matterId !== matterId) {
      error('reference-mismatch', `Event ${event.eventId} belongs to another matter.`)
    }
    const occurredAt = Date.parse(event.occurredAt)
    if (occurredAt < previousOccurredAt) {
      error(
        'invalid-input',
        `Event ${event.eventId} cannot precede the event already at the end of the log.`,
      )
    }
    eventIds.add(event.eventId)
    previousOccurredAt = occurredAt
  }

  return makeBusinessMatter([...matter.events, ...events])
}

function replaceAttempt(
  attempts: AttemptProjection[],
  attemptId: string,
  update: (attempt: AttemptProjection) => AttemptProjection,
): void {
  const index = attempts.findIndex((attempt) => attempt.attemptId === attemptId)
  const attempt = attempts[index]
  if (index < 0 || attempt === undefined) {
    error('invalid-event-stream', `Attempt ${attemptId} is missing from the event stream.`)
  }
  attempts[index] = update(attempt)
}

function replaceDecision(
  decisions: DecisionProjection[],
  decisionId: string,
  update: (decision: DecisionProjection) => DecisionProjection,
): void {
  const index = decisions.findIndex((decision) => decision.decisionId === decisionId)
  const decision = decisions[index]
  if (index < 0 || decision === undefined) {
    error('invalid-event-stream', `Decision ${decisionId} is missing from the event stream.`)
  }
  decisions[index] = update(decision)
}

export function projectBusinessMatter(
  matter: BusinessMatter,
): BusinessMatterProjection {
  if (
    typeof matter !== 'object' ||
    matter === null ||
    !TRUSTED_BUSINESS_MATTERS.has(matter) ||
    matter[BUSINESS_MATTER_BRAND] !== true
  ) {
    error('invalid-event-stream', 'The event stream was not created by this domain kernel.')
  }
  if (!Array.isArray(matter.events) || matter.events.length === 0) {
    error('invalid-event-stream', 'A BusinessMatter must start with one creation event.')
  }

  const first = matter.events[0]
  if (first === undefined || first.type !== 'matter-created') {
    error('invalid-event-stream', 'The first event must be matter-created.')
  }

  let stage: BusinessMatterStage = 'created'
  let conclusion: BusinessMatterConclusion | undefined
  let currentRevisionId: string | undefined
  let activeAttemptId: string | undefined
  let pendingClarification: ClarificationProjection | undefined
  const revisions: RevisionSnapshot[] = []
  const decisions: DecisionProjection[] = []
  const attempts: AttemptProjection[] = []
  const artifacts: ArtifactProjection[] = []
  const receipts: ReceiptProjection[] = []
  const eventIds = new Set<string>()

  for (const [index, event] of matter.events.entries()) {
    if (eventIds.has(event.eventId)) {
      error('invalid-event-stream', `Duplicate event ${event.eventId}.`)
    }
    eventIds.add(event.eventId)
    if (event.matterId !== first.matterId) {
      error('invalid-event-stream', `Event ${event.eventId} changed the matter identity.`)
    }
    if (index > 0 && event.type === 'matter-created') {
      error('invalid-event-stream', 'A matter cannot contain a second creation event.')
    }

    switch (event.type) {
      case 'matter-created':
        break
      case 'revision-entered':
        revisions.push(event.revision)
        currentRevisionId = event.revision.revisionId
        activeAttemptId = undefined
        pendingClarification = undefined
        conclusion = undefined
        stage = 'evidence'
        break
      case 'clarification-requested':
        if (event.attemptId !== undefined) {
          replaceAttempt(attempts, event.attemptId, (attempt) => ({
            ...attempt,
            status: 'blocked',
            endedAt: event.occurredAt,
            terminationReason: event.reason,
          }))
        }
        activeAttemptId = undefined
        pendingClarification = {
          eventId: event.eventId,
          revisionId: event.revisionId,
          attemptId: event.attemptId,
          actionScope: event.actionScope,
          reason: event.reason,
          requestedAt: event.occurredAt,
        }
        stage = 'clarification'
        break
      case 'decision-recorded':
        decisions.push({
          decisionId: event.decision.decisionId,
          revisionId: event.decision.revisionId,
          actionScope: event.decision.actionScope,
          status: event.decision.outcome,
          actor: event.decision.actor,
          reason: event.decision.reason,
          expiresAt: event.decision.expiresAt,
          recordedAt: event.decision.recordedAt,
          revokedAt: undefined,
          revocationReason: undefined,
        })
        if (event.decision.outcome === 'rejected') {
          stage = 'failed-retry'
        }
        break
      case 'decision-revoked':
        replaceDecision(decisions, event.decisionId, (decision) => ({
          ...decision,
          status: 'revoked',
          revokedAt: event.occurredAt,
          revocationReason: event.reason,
        }))
        break
      case 'attempt-started':
        attempts.push({
          ...event.attempt,
          status: 'running',
          startedAt: event.occurredAt,
          endedAt: undefined,
          terminationReason: undefined,
        })
        activeAttemptId = event.attempt.attemptId
        pendingClarification = undefined
        stage = 'running'
        break
      case 'attempt-failed':
        replaceAttempt(attempts, event.attemptId, (attempt) => ({
          ...attempt,
          status: 'failed',
          endedAt: event.occurredAt,
          terminationReason: `${event.source}: ${event.reason}; impact: ${event.impact}`,
        }))
        activeAttemptId = undefined
        pendingClarification = undefined
        stage = 'failed-retry'
        break
      case 'revision-reconfirmed':
        pendingClarification = undefined
        stage = 'evidence'
        break
      case 'artifact-recorded':
        if (currentRevisionId === undefined) {
          error('invalid-event-stream', 'An artifact requires a current revision.')
        }
        replaceAttempt(attempts, event.artifact.attemptId, (attempt) => ({
          ...attempt,
          status: 'succeeded',
          endedAt: event.occurredAt,
          terminationReason: undefined,
        }))
        artifacts.push({
          ...event.artifact,
          revisionId: currentRevisionId,
          recordedAt: event.occurredAt,
        })
        activeAttemptId = undefined
        pendingClarification = undefined
        stage = 'artifact-receipt'
        break
      case 'receipt-recorded':
        if (currentRevisionId === undefined) {
          error('invalid-event-stream', 'A receipt requires a current revision.')
        }
        receipts.push({
          ...event.receipt,
          revisionId: currentRevisionId,
          recordedAt: event.occurredAt,
        })
        if (event.receipt.verdict === 'accepted') {
          conclusion = 'completed'
          stage = 'artifact-receipt'
        } else {
          conclusion = undefined
          stage = 'failed-retry'
        }
        pendingClarification = undefined
        break
      case 'matter-stopped':
        conclusion = 'stopped'
        pendingClarification = undefined
        stage = 'failed-retry'
        break
    }
  }

  return freezeDeep({
    matterId: first.matterId,
    creationEventId: first.eventId,
    goal: first.goal,
    responsibleParty: first.responsibleParty,
    stage,
    conclusion,
    currentRevisionId,
    activeAttemptId,
    pendingClarification,
    revisions,
    decisions,
    attempts,
    artifacts,
    receipts,
  })
}

export function createBusinessMatter(
  input: CreateBusinessMatterInput,
): BusinessMatter {
  assertNonBlank(input.matterId, 'matterId')
  assertNonBlank(input.eventId, 'eventId')
  assertIsoTimestamp(input.occurredAt, 'occurredAt')
  assertNonBlank(input.goal, 'goal')
  assertHumanRole(input.responsibleParty, 'responsibleParty')

  return makeBusinessMatter([
      {
        type: 'matter-created',
        eventId: input.eventId,
        matterId: input.matterId,
        occurredAt: input.occurredAt,
        goal: input.goal,
        responsibleParty: cloneHumanRole(input.responsibleParty),
      },
    ])
}

export function enterEvidence(
  matter: BusinessMatter,
  input: EnterEvidenceInput,
): BusinessMatter {
  const state = projectBusinessMatter(matter)
  if (state.stage === 'running') {
    error('invalid-transition', 'A running attempt must end before entering evidence.')
  }
  if (state.stage === 'artifact-receipt' && state.conclusion === undefined) {
    error('invalid-transition', 'The current artifact requires a receipt before revision.')
  }

  assertNonBlank(input.eventId, 'eventId')
  assertIsoTimestamp(input.occurredAt, 'occurredAt')
  assertNonBlank(input.revisionId, 'revisionId')
  assertNonBlank(input.changeReason, 'changeReason')
  assertNonBlank(input.scope, 'scope')
  assertNonBlank(input.permissionBoundary, 'permissionBoundary')
  assertNonBlank(input.dataDestination, 'dataDestination')
  if (state.revisions.some((item) => item.revisionId === input.revisionId)) {
    error('duplicate-id', `Revision ${input.revisionId} already exists.`)
  }

  assertArray(input.evidence, 'evidence')
  assertArray(input.unknowns, 'unknowns')
  assertArray(input.options, 'options')
  assertArray(input.dependencies, 'dependencies')
  assertArray(input.experienceRefs, 'experienceRefs')
  assertArray(input.actionPolicies, 'actionPolicies')

  if (input.evidence.length === 0 && input.unknowns.length === 0) {
    error(
      'invalid-input',
      'A revision requires evidence or an explicitly declared unknown.',
    )
  }

  input.evidence.forEach((item, index) => {
    assertNonBlank(item.evidenceId, `evidence[${index}].evidenceId`)
    assertNonBlank(item.source, `evidence[${index}].source`)
    assertIsoTimestamp(item.observedAt, `evidence[${index}].observedAt`)
    if (!EVIDENCE_STATUSES.includes(item.status)) {
      error('invalid-input', `evidence[${index}].status is unknown.`)
    }
    if (Date.parse(item.observedAt) > Date.parse(input.occurredAt)) {
      error(
        'invalid-input',
        `evidence[${index}].observedAt cannot be later than the revision event.`,
      )
    }
  })
  assertUnique(
    input.evidence.map((item) => item.evidenceId),
    'evidenceId',
  )

  input.unknowns.forEach((item, index) => {
    assertNonBlank(item.unknownId, `unknowns[${index}].unknownId`)
    assertNonBlank(item.description, `unknowns[${index}].description`)
  })
  assertUnique(
    input.unknowns.map((item) => item.unknownId),
    'unknownId',
  )

  input.options.forEach((item, index) => {
    assertNonBlank(item, `options[${index}]`)
  })
  assertUnique(input.options, 'options')

  input.dependencies.forEach((item, index) => {
    assertNonBlank(item.dependencyId, `dependencies[${index}].dependencyId`)
    if (!DEPENDENCY_STATUSES.includes(item.status)) {
      error('invalid-input', `dependencies[${index}].status is unknown.`)
    }
  })
  assertUnique(
    input.dependencies.map((item) => item.dependencyId),
    'dependencyId',
  )

  input.experienceRefs.forEach((item, index) => {
    assertNonBlank(item.experienceId, `experienceRefs[${index}].experienceId`)
    assertNonBlank(item.sourceRevisionId, `experienceRefs[${index}].sourceRevisionId`)
    assertNonBlank(item.sourceEventId, `experienceRefs[${index}].sourceEventId`)
    if (!ADOPTION_RELATIONS.includes(item.adoption)) {
      error('invalid-input', `experienceRefs[${index}].adoption is unknown.`)
    }
  })
  assertUnique(
    input.experienceRefs.map((item) => item.experienceId),
    'experienceId',
  )

  input.actionPolicies.forEach((item, index) => {
    assertNonBlank(item.actionScope, `actionPolicies[${index}].actionScope`)
    if (!EFFECT_CLASSES.includes(item.effectClass)) {
      error('invalid-input', `actionPolicies[${index}].effectClass is unknown.`)
    }
    if (typeof item.requiresDecision !== 'boolean') {
      error('invalid-input', `actionPolicies[${index}].requiresDecision must be boolean.`)
    }
  })
  assertUnique(
    input.actionPolicies.map((item) => item.actionScope),
    'actionScope',
  )

  const revision: RevisionSnapshot = {
    revisionId: input.revisionId,
    predecessorRevisionId: state.currentRevisionId,
    createdByEventId: input.eventId,
    matterCreatedByEventId: state.creationEventId,
    changeReason: input.changeReason,
    scope: input.scope,
    permissionBoundary: input.permissionBoundary,
    dataDestination: input.dataDestination,
    evidence: input.evidence.map((item) => ({ ...item })),
    unknowns: input.unknowns.map((item) => ({ ...item })),
    options: [...input.options],
    dependencies: input.dependencies.map((item) => ({ ...item })),
    experienceRefs: input.experienceRefs.map((item) => ({ ...item })),
    actionPolicies: input.actionPolicies.map((item) => ({ ...item })),
  }

  return appendEvents(matter, {
    type: 'revision-entered',
    eventId: input.eventId,
    matterId: state.matterId,
    occurredAt: input.occurredAt,
    revision,
  })
}

export function requestClarification(
  matter: BusinessMatter,
  input: RequestClarificationInput,
): BusinessMatter {
  const state = projectBusinessMatter(matter)
  assertNoConclusion(state)
  if (state.stage !== 'evidence' && state.stage !== 'running') {
    error(
      'invalid-transition',
      'Clarification may be requested only from evidence or a running attempt.',
    )
  }
  const revision = assertCurrentRevision(state, input.revisionId)
  assertNonBlank(input.eventId, 'eventId')
  assertIsoTimestamp(input.occurredAt, 'occurredAt')
  assertNonBlank(input.reason, 'reason')
  if (input.actionScope !== undefined) {
    assertNonBlank(input.actionScope, 'actionScope')
    if (!revision.actionPolicies.some((item) => item.actionScope === input.actionScope)) {
      error('reference-mismatch', `Action ${input.actionScope} is not in the revision.`)
    }
  }

  return appendEvents(matter, {
    type: 'clarification-requested',
    eventId: input.eventId,
    matterId: state.matterId,
    occurredAt: input.occurredAt,
    revisionId: input.revisionId,
    attemptId: state.activeAttemptId,
    actionScope: input.actionScope,
    reason: input.reason,
  })
}

export function recordDecision(
  matter: BusinessMatter,
  input: RecordDecisionInput,
): BusinessMatter {
  const state = projectBusinessMatter(matter)
  assertNoConclusion(state)
  if (state.stage !== 'clarification') {
    error('invalid-transition', 'A decision may be recorded only during clarification.')
  }
  const revision = assertCurrentRevision(state, input.revisionId)
  assertNonBlank(input.eventId, 'eventId')
  assertIsoTimestamp(input.occurredAt, 'occurredAt')
  assertNonBlank(input.decisionId, 'decisionId')
  assertNonBlank(input.actionScope, 'actionScope')
  assertHumanRole(input.actor, 'actor')
  assertNonBlank(input.reason, 'reason')
  if (input.outcome !== 'approved' && input.outcome !== 'rejected') {
    error('invalid-input', 'Decision outcome must be approved or rejected.')
  }
  if (state.decisions.some((item) => item.decisionId === input.decisionId)) {
    error('duplicate-id', `Decision ${input.decisionId} already exists.`)
  }
  const policy = revision.actionPolicies.find(
    (item) => item.actionScope === input.actionScope,
  )
  if (policy === undefined || !policy.requiresDecision) {
    error(
      'reference-mismatch',
      `Action ${input.actionScope} is not a decision-gated action in this revision.`,
    )
  }
  if (input.expiresAt !== undefined) {
    assertIsoTimestamp(input.expiresAt, 'expiresAt')
    if (
      input.outcome === 'approved' &&
      Date.parse(input.expiresAt) <= Date.parse(input.occurredAt)
    ) {
      error('invalid-input', 'An approval must expire after it is recorded.')
    }
  }

  return appendEvents(matter, {
    type: 'decision-recorded',
    eventId: input.eventId,
    matterId: state.matterId,
    occurredAt: input.occurredAt,
    decision: {
      decisionId: input.decisionId,
      revisionId: input.revisionId,
      actionScope: input.actionScope,
      outcome: input.outcome,
      actor: cloneHumanRole(input.actor),
      reason: input.reason,
      expiresAt: input.expiresAt,
      recordedAt: input.occurredAt,
    },
  })
}

export function revokeDecision(
  matter: BusinessMatter,
  input: RevokeDecisionInput,
): BusinessMatter {
  const state = projectBusinessMatter(matter)
  assertNoConclusion(state)
  if (state.stage !== 'clarification') {
    error(
      'invalid-transition',
      'A decision may be revoked only before a matching action starts.',
    )
  }
  assertNonBlank(input.eventId, 'eventId')
  assertIsoTimestamp(input.occurredAt, 'occurredAt')
  assertNonBlank(input.decisionId, 'decisionId')
  assertNonBlank(input.reason, 'reason')
  const decision = state.decisions.find((item) => item.decisionId === input.decisionId)
  if (decision === undefined || decision.status !== 'approved') {
    error('decision-invalid', `Decision ${input.decisionId} is not an active approval.`)
  }

  return appendEvents(matter, {
    type: 'decision-revoked',
    eventId: input.eventId,
    matterId: state.matterId,
    occurredAt: input.occurredAt,
    decisionId: input.decisionId,
    reason: input.reason,
  })
}

export function startAttempt(
  matter: BusinessMatter,
  input: StartAttemptInput,
): BusinessMatter {
  const state = projectBusinessMatter(matter)
  if (state.activeAttemptId !== undefined) {
    error(
      'active-attempt',
      `Attempt ${state.activeAttemptId} must end before another attempt starts.`,
    )
  }
  assertNoConclusion(state)
  if (state.stage !== 'evidence' && state.stage !== 'clarification') {
    error('invalid-transition', 'An attempt may start only from evidence or clarification.')
  }

  const revision = assertCurrentRevision(state, input.revisionId)
  assertRevisionReady(revision)
  assertNonBlank(input.eventId, 'eventId')
  assertIsoTimestamp(input.occurredAt, 'occurredAt')
  assertNonBlank(input.attemptId, 'attemptId')
  if (state.attempts.some((item) => item.attemptId === input.attemptId)) {
    error('duplicate-id', `Attempt ${input.attemptId} already exists.`)
  }
  assertArray(input.actionScopes, 'actionScopes')
  assertArray(input.decisionIds, 'decisionIds')
  if (input.actionScopes.length === 0) {
    error('invalid-input', 'An attempt requires at least one action scope.')
  }
  input.actionScopes.forEach((item, index) => {
    assertNonBlank(item, `actionScopes[${index}]`)
  })
  input.decisionIds.forEach((item, index) => {
    assertNonBlank(item, `decisionIds[${index}]`)
  })
  assertUnique(input.actionScopes, 'actionScopes')
  assertUnique(input.decisionIds, 'decisionIds')

  const policies = input.actionScopes.map((actionScope) => {
    const policy = revision.actionPolicies.find(
      (item) => item.actionScope === actionScope,
    )
    if (policy === undefined) {
      error('reference-mismatch', `Action ${actionScope} has no policy in this revision.`)
    }
    return policy
  })

  const suppliedDecisions = input.decisionIds.map((decisionId) => {
    const decision = state.decisions.find((item) => item.decisionId === decisionId)
    if (decision === undefined) {
      error('decision-invalid', `Decision ${decisionId} does not exist.`)
    }
    return decision
  })

  if (state.stage === 'clarification') {
    const clarification = state.pendingClarification
    const clarifiedPolicy = revision.actionPolicies.find(
      (item) => item.actionScope === clarification?.actionScope,
    )
    if (
      clarification === undefined ||
      clarification.actionScope === undefined ||
      clarifiedPolicy === undefined ||
      !clarifiedPolicy.requiresDecision ||
      !input.actionScopes.includes(clarification.actionScope)
    ) {
      error(
        'invalid-transition',
        'A non-approval clarification must enter a new evidence revision before another attempt.',
      )
    }
  }

  for (const policy of policies) {
    if (!policy.requiresDecision) {
      continue
    }
    const matching = suppliedDecisions.find(
      (decision) =>
        decision.revisionId === revision.revisionId &&
        decision.actionScope === policy.actionScope,
    )
    if (matching === undefined) {
      error(
        input.decisionIds.length === 0 ? 'decision-required' : 'decision-invalid',
        `Action ${policy.actionScope} requires a matching decision.`,
      )
    }
    if (matching.status !== 'approved') {
      error('decision-invalid', `Decision ${matching.decisionId} is ${matching.status}.`)
    }
    if (
      matching.expiresAt !== undefined &&
      Date.parse(matching.expiresAt) <= Date.parse(input.occurredAt)
    ) {
      error('decision-invalid', `Decision ${matching.decisionId} has expired.`)
    }
  }

  for (const decision of suppliedDecisions) {
    const policy = policies.find(
      (item) =>
        item.requiresDecision && item.actionScope === decision.actionScope,
    )
    if (
      policy === undefined ||
      decision.revisionId !== revision.revisionId ||
      decision.status !== 'approved'
    ) {
      error(
        'decision-invalid',
        `Decision ${decision.decisionId} does not match a protected action in this revision.`,
      )
    }
  }

  assertExecutionSnapshot(input.executionSnapshot)
  assertCompatibility(input.compatibility)

  return appendEvents(matter, {
    type: 'attempt-started',
    eventId: input.eventId,
    matterId: state.matterId,
    occurredAt: input.occurredAt,
    attempt: {
      attemptId: input.attemptId,
      revisionId: input.revisionId,
      actionScopes: [...input.actionScopes],
      actionPolicies: policies.map((item) => ({ ...item })),
      decisionIds: [...input.decisionIds],
      executionSnapshot: cloneExecutionSnapshot(input.executionSnapshot),
      compatibility: cloneCompatibility(input.compatibility),
    },
  })
}

export function failAttempt(
  matter: BusinessMatter,
  input: FailAttemptInput,
): BusinessMatter {
  const state = projectBusinessMatter(matter)
  assertNoConclusion(state)
  if (state.stage !== 'running' || state.activeAttemptId !== input.attemptId) {
    error('invalid-transition', 'Only the active running attempt may fail.')
  }
  assertNonBlank(input.eventId, 'eventId')
  assertIsoTimestamp(input.occurredAt, 'occurredAt')
  assertNonBlank(input.attemptId, 'attemptId')
  assertNonBlank(input.reason, 'reason')
  assertNonBlank(input.impact, 'impact')
  if (!FAILURE_SOURCES.includes(input.source)) {
    error('invalid-input', 'Failure source is unknown.')
  }

  return appendEvents(matter, {
    type: 'attempt-failed',
    eventId: input.eventId,
    matterId: state.matterId,
    occurredAt: input.occurredAt,
    attemptId: input.attemptId,
    source: input.source,
    reason: input.reason,
    impact: input.impact,
  })
}

export function reconfirmRevision(
  matter: BusinessMatter,
  input: ReconfirmRevisionInput,
): BusinessMatter {
  const state = projectBusinessMatter(matter)
  assertNoConclusion(state)
  if (state.stage !== 'failed-retry') {
    error('invalid-transition', 'Only a failed revision may be reconfirmed.')
  }
  const revision = assertCurrentRevision(state, input.revisionId)
  assertRevisionReady(revision)
  assertNonBlank(input.eventId, 'eventId')
  assertIsoTimestamp(input.occurredAt, 'occurredAt')
  assertNonBlank(input.reason, 'reason')
  assertCompatibility(input.compatibility)

  return appendEvents(matter, {
    type: 'revision-reconfirmed',
    eventId: input.eventId,
    matterId: state.matterId,
    occurredAt: input.occurredAt,
    revisionId: input.revisionId,
    compatibility: cloneCompatibility(input.compatibility),
    reason: input.reason,
  })
}

export function recordArtifact(
  matter: BusinessMatter,
  input: RecordArtifactInput,
): BusinessMatter {
  const state = projectBusinessMatter(matter)
  assertNoConclusion(state)
  if (state.stage !== 'running' || state.activeAttemptId !== input.attemptId) {
    error('invalid-transition', 'Only the active running attempt may produce an artifact.')
  }
  assertNonBlank(input.eventId, 'eventId')
  assertIsoTimestamp(input.occurredAt, 'occurredAt')
  assertNonBlank(input.artifactId, 'artifactId')
  assertNonBlank(input.attemptId, 'attemptId')
  assertNonBlank(input.kind, 'kind')
  assertNonBlank(input.locator, 'locator')
  assertNonBlank(input.digest, 'digest')
  if (state.artifacts.some((item) => item.artifactId === input.artifactId)) {
    error('duplicate-id', `Artifact ${input.artifactId} already exists.`)
  }

  return appendEvents(matter, {
    type: 'artifact-recorded',
    eventId: input.eventId,
    matterId: state.matterId,
    occurredAt: input.occurredAt,
    artifact: {
      artifactId: input.artifactId,
      attemptId: input.attemptId,
      kind: input.kind,
      locator: input.locator,
      digest: input.digest,
    },
  })
}

export function recordReceipt(
  matter: BusinessMatter,
  input: RecordReceiptInput,
): BusinessMatter {
  const state = projectBusinessMatter(matter)
  assertNoConclusion(state)
  if (state.stage !== 'artifact-receipt') {
    error('invalid-transition', 'A receipt requires a pending artifact.')
  }
  assertNonBlank(input.eventId, 'eventId')
  assertIsoTimestamp(input.occurredAt, 'occurredAt')
  assertNonBlank(input.receiptId, 'receiptId')
  assertNonBlank(input.artifactId, 'artifactId')
  assertHumanRole(input.actor, 'actor')
  assertNonBlank(input.reason, 'reason')
  assertArray(input.evidenceRefs, 'evidenceRefs')
  if (input.evidenceRefs.length === 0) {
    error('invalid-input', 'A receipt requires at least one evidence reference.')
  }
  input.evidenceRefs.forEach((item, index) => {
    assertNonBlank(item, `evidenceRefs[${index}]`)
  })
  assertUnique(input.evidenceRefs, 'evidenceRefs')
  if (input.verdict !== 'accepted' && input.verdict !== 'rejected') {
    error('invalid-input', 'Receipt verdict must be accepted or rejected.')
  }
  if (state.receipts.some((item) => item.receiptId === input.receiptId)) {
    error('duplicate-id', `Receipt ${input.receiptId} already exists.`)
  }
  const artifact = state.artifacts.find(
    (item) =>
      item.artifactId === input.artifactId &&
      item.revisionId === state.currentRevisionId,
  )
  if (artifact === undefined) {
    error('reference-mismatch', `Artifact ${input.artifactId} is not pending here.`)
  }
  const latestArtifact = state.artifacts[state.artifacts.length - 1]
  if (latestArtifact?.artifactId !== artifact.artifactId) {
    error(
      'reference-mismatch',
      `Artifact ${input.artifactId} is not the latest pending artifact.`,
    )
  }
  if (input.actor.roleRef !== state.responsibleParty.roleRef) {
    error(
      'receipt-authority',
      'The receipt actor must structurally match the matter responsible human role; this is not an authentication claim.',
    )
  }

  return appendEvents(matter, {
    type: 'receipt-recorded',
    eventId: input.eventId,
    matterId: state.matterId,
    occurredAt: input.occurredAt,
    receipt: {
      receiptId: input.receiptId,
      artifactId: input.artifactId,
      verdict: input.verdict,
      actor: cloneHumanRole(input.actor),
      reason: input.reason,
      evidenceRefs: [...input.evidenceRefs],
    },
  })
}

export function stopMatter(
  matter: BusinessMatter,
  input: StopMatterInput,
): BusinessMatter {
  const state = projectBusinessMatter(matter)
  assertNoConclusion(state)
  if (state.stage !== 'failed-retry') {
    error('invalid-transition', 'Only a failed revision may be stopped.')
  }
  assertCurrentRevision(state, input.revisionId)
  assertNonBlank(input.eventId, 'eventId')
  assertIsoTimestamp(input.occurredAt, 'occurredAt')
  assertNonBlank(input.reason, 'reason')

  return appendEvents(matter, {
    type: 'matter-stopped',
    eventId: input.eventId,
    matterId: state.matterId,
    occurredAt: input.occurredAt,
    revisionId: input.revisionId,
    reason: input.reason,
  })
}
