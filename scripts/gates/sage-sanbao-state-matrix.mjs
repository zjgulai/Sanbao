#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { isAbsolute, join, resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const MATRIX_REL_PATH = 'docs/specs/2026-09-27-sanbao-to-sage-ui-state-map.json'
export const TICKETS_REL_PATH = 'docs/plans/2026-10-05-sanbao-in-sage-integration-tickets.md'
export const ROUTE_MATRIX_REL_PATH = 'apps/sage-shell/src/appservice/route-authority-matrix.json'

export const PIN = Object.freeze({
  commit: 'b861d046013fb8bee9a1f3224ed0965efcf42111',
  catalogSha256: '9eaf593a5bdc214ec0d938951e7aaa6859111823c361a2719c736210276398d3',
  ledgerSha256: '0244bd8b25cd2d9323b0f22e54123515cfa37ea8b08b45b4a24dc692e3a3a63e',
  stateIdsSha256: 'a89ad30a082d23b67616a67402c734e781dae0094d1c6af12e061609e6df4698',
  sourceRowsSha256: '905780c52acbfa7e52ac59c37a1f5a5ad0fb84f255280caac43ed46ac2572caf',
  prototypeRowsSha256: '9b246b8a876e15ff129a7ee34376428d63a1f71e3eb62e25c2d253e0b23e9e78',
})

const SOURCE_KINDS = new Set(['observed', 'entry-observed', 'static-only'])
const APPLICABILITY = new Set(['unreviewed', 'required', 'not-applicable'])
const DIMENSION_STATUS = new Set(['pending', 'implementing', 'blocked', 'verified', 'not-applicable'])
const INTEGRATION_STATUS = new Set(['pending', 'blocked', 'integrated', 'not-applicable'])
const PROTOTYPE_NORMALIZED = new Set([
  'prototype-host-wired',
  'prototype-entry-verified',
  'honest-unwired',
  'prototype-not-applicable',
])
const REQUIRED_DIMENSIONS = [
  'ui',
  'applicationService',
  'hostIntegration',
  'electronAcceptance',
  'visualAcceptance',
]

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export function sourceRowsForDigest(states) {
  return states.map(row => ({ sourceStateId: row.sourceStateId, source: row.source }))
}

export function prototypeRowsForDigest(states) {
  return states.map(row => ({ sourceStateId: row.sourceStateId, prototype: row.prototype }))
}

export function routeKeysFromAuthorityMatrix(matrix) {
  if (!matrix || !Array.isArray(matrix.routes)) throw new Error('route authority matrix must contain routes')
  return new Set(matrix.routes.map(route => `${route.method} ${route.path}`))
}

function countBy(values) {
  const counts = {}
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)))
}

export function deriveSummary(states) {
  return {
    rows: states.length,
    sourceKinds: countBy(states.map(row => row.source?.sourceKind ?? '<missing>')),
    sourceImplementedFlags: countBy(states.map(row => String(row.source?.implementedFlag))),
    prototype: {
      rawStatus: countBy(states.map(row => row.prototype?.rawStatus ?? '<missing>')),
      normalizedStatus: countBy(states.map(row => row.prototype?.normalizedStatus ?? '<missing>')),
    },
    legacyReview: {
      reviewStatus: countBy(states.map(row => row.legacyUi00Review?.reviewStatus ?? '<missing>')),
      disposition: countBy(states.map(row => row.legacyUi00Review?.disposition ?? '<missing>')),
    },
    delivery: {
      ownerTicket: countBy(states.map(row => row.delivery?.ownerTicket ?? '<missing>')),
      applicability: countBy(states.map(row => row.delivery?.applicability ?? '<missing>')),
      ui: countBy(states.map(row => row.delivery?.ui?.status ?? '<missing>')),
      applicationService: countBy(states.map(row => row.delivery?.applicationService?.status ?? '<missing>')),
      hostIntegration: countBy(states.map(row => row.delivery?.hostIntegration?.status ?? '<missing>')),
      electronAcceptance: countBy(states.map(row => row.delivery?.electronAcceptance?.status ?? '<missing>')),
      visualAcceptance: countBy(states.map(row => row.delivery?.visualAcceptance?.status ?? '<missing>')),
      integration: countBy(states.map(row => row.delivery?.integrationStatus ?? '<missing>')),
    },
  }
}

function push(issues, code, stateId, detail) {
  issues.push({ code, ...(stateId ? { stateId } : {}), detail })
}

function evidenceRefsFor(row) {
  return REQUIRED_DIMENSIONS.flatMap(dimension => row.delivery?.[dimension]?.evidenceRefs ?? [])
}

function forbiddenEvidenceRef(ref) {
  if (typeof ref !== 'string' || !ref) return 'empty evidence ref'
  if (isAbsolute(ref) || ref.startsWith('file:') || ref.startsWith('~')) return 'machine-local evidence ref'
  if (ref.startsWith('.birdview/') || ref.startsWith('.scratch/')) return 'ignored evidence ref'
  if (/(^|\/)fixtures?(\/|$)/i.test(ref)) return 'fixture evidence ref'
  if (/github\.io|pages/i.test(ref)) return 'Pages evidence ref'
  return null
}

function validateEvidence(issues, row, dimension, options) {
  const stateId = row.sourceStateId
  const value = row.delivery?.[dimension]
  if (!value || typeof value !== 'object') {
    push(issues, 'missing-dimension', stateId, dimension)
    return
  }
  if (!DIMENSION_STATUS.has(value.status)) push(issues, 'invalid-dimension-status', stateId, `${dimension}:${value.status}`)
  if (!Array.isArray(value.evidenceRefs)) {
    push(issues, 'invalid-evidence-list', stateId, dimension)
    return
  }
  if (value.status === 'verified' && value.evidenceRefs.length === 0) {
    push(issues, 'verified-without-evidence', stateId, dimension)
  }
  for (const evidence of value.evidenceRefs) {
    if (!evidence || typeof evidence !== 'object') {
      push(issues, 'invalid-evidence', stateId, dimension)
      continue
    }
    const forbidden = forbiddenEvidenceRef(evidence.ref)
    if (evidence.countsAsVerification === true && forbidden) {
      push(issues, 'forbidden-verification-evidence', stateId, `${dimension}:${forbidden}:${evidence.ref}`)
    }
    if (value.status === 'verified' && evidence.countsAsVerification !== true) {
      push(issues, 'verified-with-candidate-evidence', stateId, `${dimension}:${evidence.ref ?? '<missing>'}`)
    }
    if (evidence.countsAsVerification === true && typeof options.isTrackedEvidence === 'function' && !options.isTrackedEvidence(evidence.ref)) {
      push(issues, 'untracked-verification-evidence', stateId, `${dimension}:${evidence.ref}`)
    }
  }
}

function expectedPrototypeStatus(rawStatus) {
  if (rawStatus?.startsWith('wired(')) return 'prototype-host-wired'
  if (rawStatus === 'entry-verified') return 'prototype-entry-verified'
  if (rawStatus === 'honest') return 'honest-unwired'
  if (rawStatus?.startsWith('n/a(')) return 'prototype-not-applicable'
  return null
}

export function validateMatrix(matrix, options = {}) {
  const issues = []
  if (!matrix || typeof matrix !== 'object') return [{ code: 'invalid-matrix', detail: 'matrix must be an object' }]
  if (matrix.schemaVersion !== 2) push(issues, 'schema-version', null, `expected 2, got ${matrix.schemaVersion}`)
  if (matrix.source?.commit !== PIN.commit) push(issues, 'source-commit', null, `${matrix.source?.commit ?? '<missing>'}`)
  if (matrix.source?.catalog?.sha256 !== PIN.catalogSha256) push(issues, 'catalog-digest', null, `${matrix.source?.catalog?.sha256 ?? '<missing>'}`)
  if (matrix.source?.prototypeLedger?.sha256 !== PIN.ledgerSha256) push(issues, 'ledger-digest', null, `${matrix.source?.prototypeLedger?.sha256 ?? '<missing>'}`)
  if (matrix.policy?.primaryKey !== 'sourceStateId') push(issues, 'primary-key', null, `${matrix.policy?.primaryKey ?? '<missing>'}`)
  if (matrix.policy?.prototypeWiringCountsAsSageIntegration !== false) push(issues, 'prototype-boundary', null, 'prototype wiring must never count as Sage integration')
  if (matrix.policy?.fixtureCountsAsVerification !== false) push(issues, 'fixture-boundary', null, 'fixtures must never count as verification')

  const states = Array.isArray(matrix.states) ? matrix.states : []
  if (states.length !== 206) push(issues, 'row-count', null, `expected 206, got ${states.length}`)
  const ids = states.map(row => row?.sourceStateId)
  const seen = new Set()
  for (const id of ids) {
    if (typeof id !== 'string' || !id) push(issues, 'invalid-state-id', null, `${id}`)
    else if (seen.has(id)) push(issues, 'duplicate-state-id', id, 'duplicate sourceStateId')
    else seen.add(id)
  }
  const idsDigest = sha256(JSON.stringify(ids))
  if (matrix.source?.catalog?.stateIdsSha256 !== idsDigest) push(issues, 'state-id-summary-drift', null, idsDigest)
  if (PIN.stateIdsSha256 !== idsDigest) push(issues, 'state-id-set-drift', null, idsDigest)

  const uniqueGroups = new Set()
  let explicitReview = 0
  let defaultReview = 0
  for (const row of states) {
    const stateId = row?.sourceStateId
    const source = row?.source
    if (!source || typeof source !== 'object') {
      push(issues, 'missing-source', stateId, 'source object is required')
      continue
    }
    for (const field of ['title', 'page', 'variant', 'sourceKind', 'trigger', 'exit', 'evidence', 'notes']) {
      if (typeof source[field] !== 'string' || !source[field]) push(issues, 'missing-source-field', stateId, field)
    }
    if (!SOURCE_KINDS.has(source.sourceKind)) push(issues, 'invalid-source-kind', stateId, `${source.sourceKind}`)
    if (source.implementedFlag !== false) push(issues, 'ambiguous-source-implemented', stateId, 'source implemented flag must remain false and non-authoritative')
    if (!Array.isArray(source.groupIds) || source.groupIds.length === 0) push(issues, 'missing-groups', stateId, 'groupIds')
    else for (const groupId of source.groupIds) uniqueGroups.add(groupId)
    if (!Array.isArray(source.observationIds)) push(issues, 'invalid-observation-ids', stateId, 'observationIds must be an array')

    const prototype = row.prototype
    if (!prototype || typeof prototype !== 'object') push(issues, 'missing-prototype', stateId, 'prototype object is required')
    else {
      const expected = expectedPrototypeStatus(prototype.rawStatus)
      if (!expected) push(issues, 'invalid-prototype-raw-status', stateId, `${prototype.rawStatus}`)
      if (!PROTOTYPE_NORMALIZED.has(prototype.normalizedStatus)) push(issues, 'invalid-prototype-status', stateId, `${prototype.normalizedStatus}`)
      if (expected && prototype.normalizedStatus !== expected) push(issues, 'prototype-normalization-drift', stateId, `${prototype.rawStatus} -> ${prototype.normalizedStatus}`)
      if (prototype.countsAsSageIntegration !== false) push(issues, 'prototype-promoted', stateId, 'countsAsSageIntegration must be false')
      for (const field of ['class', 'wireDepthTarget', 'rawStatus', 'evidence']) {
        if (typeof prototype[field] !== 'string' || !prototype[field]) push(issues, 'missing-prototype-field', stateId, field)
      }
    }

    const review = row.legacyUi00Review
    if (!review || typeof review !== 'object') push(issues, 'missing-legacy-review', stateId, 'legacyUi00Review')
    else if (review.reviewStatus === 'explicit') explicitReview += 1
    else if (review.reviewStatus === 'default-unreviewed') defaultReview += 1
    else push(issues, 'invalid-review-status', stateId, `${review.reviewStatus}`)

    const delivery = row.delivery
    if (!delivery || typeof delivery !== 'object') {
      push(issues, 'missing-delivery', stateId, 'delivery object is required')
      continue
    }
    if (!/^T\d{2}$/.test(delivery.ownerTicket ?? '')) push(issues, 'invalid-owner-ticket', stateId, `${delivery.ownerTicket}`)
    if (typeof delivery.ownerTicketRef !== 'string' || !delivery.ownerTicketRef.startsWith(`${TICKETS_REL_PATH}#`)) {
      push(issues, 'invalid-owner-ticket-ref', stateId, `${delivery.ownerTicketRef}`)
    }
    if (!APPLICABILITY.has(delivery.applicability)) push(issues, 'invalid-applicability', stateId, `${delivery.applicability}`)
    if (!INTEGRATION_STATUS.has(delivery.integrationStatus)) push(issues, 'invalid-integration-status', stateId, `${delivery.integrationStatus}`)
    for (const dimension of REQUIRED_DIMENSIONS) validateEvidence(issues, row, dimension, options)
    const routeRefs = delivery.applicationService?.routeRefs
    if (!Array.isArray(routeRefs)) push(issues, 'invalid-route-refs', stateId, 'applicationService.routeRefs must be an array')
    else {
      if (delivery.applicationService?.status === 'verified' && routeRefs.length === 0) {
        push(issues, 'verified-service-without-route', stateId, 'verified Application Service requires at least one route ref')
      }
      for (const routeRef of routeRefs) {
        if (typeof routeRef !== 'string' || !/^[A-Z]+ \/\.sage\//.test(routeRef)) {
          push(issues, 'invalid-route-ref', stateId, `${routeRef}`)
        } else if (options.routeKeys instanceof Set && !options.routeKeys.has(routeRef)) {
          push(issues, 'unknown-route-ref', stateId, routeRef)
        }
      }
    }
    if (!Array.isArray(delivery.blockers)) push(issues, 'invalid-blockers', stateId, 'blockers must be an array')

    if (delivery.applicability === 'not-applicable') {
      if (delivery.integrationStatus !== 'not-applicable') push(issues, 'n-a-status-mismatch', stateId, 'not-applicable row must have not-applicable integration status')
      if (typeof delivery.notApplicableDecisionRef !== 'string' || !delivery.notApplicableDecisionRef) {
        push(issues, 'n-a-without-decision', stateId, 'tracked decision ref is required')
      } else if (typeof options.isTrackedEvidence === 'function' && !options.isTrackedEvidence(delivery.notApplicableDecisionRef)) {
        push(issues, 'n-a-with-untracked-decision', stateId, delivery.notApplicableDecisionRef)
      }
      if (typeof delivery.notApplicableRationale !== 'string' || !delivery.notApplicableRationale) {
        push(issues, 'n-a-without-rationale', stateId, 'rationale is required')
      }
    } else if (delivery.integrationStatus === 'not-applicable') {
      push(issues, 'unexpected-n-a-integration', stateId, `${delivery.applicability}`)
    }

    if (delivery.integrationStatus === 'integrated') {
      if (delivery.applicability !== 'required') push(issues, 'integrated-not-required', stateId, `${delivery.applicability}`)
      for (const dimension of REQUIRED_DIMENSIONS) {
        if (delivery[dimension]?.status !== 'verified') push(issues, 'integrated-with-unverified-dimension', stateId, `${dimension}:${delivery[dimension]?.status}`)
      }
    }
    if (delivery.applicationService?.status === 'blocked' && delivery.integrationStatus === 'integrated') {
      push(issues, 'blocked-service-integrated', stateId, 'blocked Application Service cannot be integrated')
    }
  }

  if (uniqueGroups.size !== 59) push(issues, 'group-count', null, `expected 59, got ${uniqueGroups.size}`)
  if (explicitReview !== 15) push(issues, 'explicit-review-count', null, `expected 15, got ${explicitReview}`)
  if (defaultReview !== 191) push(issues, 'default-review-count', null, `expected 191, got ${defaultReview}`)

  const sourceDigest = sha256(stableJson(sourceRowsForDigest(states)))
  const prototypeDigest = sha256(stableJson(prototypeRowsForDigest(states)))
  if (matrix.source?.catalog?.normalizedRowsSha256 !== sourceDigest) push(issues, 'source-row-summary-drift', null, sourceDigest)
  if (PIN.sourceRowsSha256 !== sourceDigest) push(issues, 'source-row-drift', null, sourceDigest)
  if (matrix.source?.prototypeLedger?.normalizedRowsSha256 !== prototypeDigest) push(issues, 'prototype-row-summary-drift', null, prototypeDigest)
  if (PIN.prototypeRowsSha256 !== prototypeDigest) push(issues, 'prototype-row-drift', null, prototypeDigest)

  const derived = deriveSummary(states)
  if (stableJson(matrix.summary) !== stableJson(derived)) push(issues, 'summary-drift', null, 'summary must be derived from rows')
  if (derived.sourceKinds.observed !== 123 || derived.sourceKinds['entry-observed'] !== 28 || derived.sourceKinds['static-only'] !== 55) {
    push(issues, 'source-kind-counts', null, stableJson(derived.sourceKinds))
  }
  if (derived.prototype.normalizedStatus['prototype-host-wired'] !== 44
    || derived.prototype.normalizedStatus['honest-unwired'] !== 55
    || derived.prototype.normalizedStatus['prototype-not-applicable'] !== 105
    || derived.prototype.normalizedStatus['prototype-entry-verified'] !== 2) {
    push(issues, 'prototype-counts', null, stableJson(derived.prototype.normalizedStatus))
  }
  if (derived.legacyReview.disposition.adapt !== 13 || derived.legacyReview.disposition.defer !== 193) {
    push(issues, 'legacy-disposition-counts', null, stableJson(derived.legacyReview.disposition))
  }
  if ((derived.delivery.integration.integrated ?? 0) !== 0 && options.requireInitialZero === true) {
    push(issues, 'initial-integrated-count', null, `${derived.delivery.integration.integrated}`)
  }

  const serialized = JSON.stringify(matrix)
  for (const marker of ['/Users/', 'file://', '\"token\"', '\"rawSubject\"']) {
    if (serialized.includes(marker)) push(issues, 'forbidden-matrix-content', null, marker)
  }
  for (const ref of states.flatMap(evidenceRefsFor)) {
    if (ref?.countsAsVerification === true && !ref.kind) push(issues, 'untyped-verification-evidence', null, `${ref?.ref}`)
  }
  return issues
}

export function gitTrackedEvidenceChecker(repoRoot) {
  return ref => {
    if (typeof ref !== 'string' || !ref) return false
    const path = ref.split('#')[0]
    if (forbiddenEvidenceRef(path)) return false
    try {
      execFileSync('git', ['-C', repoRoot, 'ls-files', '--error-unmatch', '--', path], { stdio: 'ignore' })
      return true
    } catch {
      return false
    }
  }
}

export function checkMatrixFile(repoRoot, options = {}) {
  const path = join(repoRoot, options.matrixPath ?? MATRIX_REL_PATH)
  let matrix
  try {
    matrix = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    return [{ code: 'matrix-read', detail: error instanceof Error ? error.message : String(error) }]
  }
  let routeKeys
  try {
    routeKeys = routeKeysFromAuthorityMatrix(JSON.parse(readFileSync(join(repoRoot, ROUTE_MATRIX_REL_PATH), 'utf8')))
  } catch (error) {
    return [{ code: 'route-matrix-read', detail: error instanceof Error ? error.message : String(error) }]
  }
  return validateMatrix(matrix, {
    isTrackedEvidence: options.isTrackedEvidence ?? gitTrackedEvidenceChecker(repoRoot),
    requireInitialZero: options.requireInitialZero ?? false,
    routeKeys,
  })
}

function isMain() {
  return process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
}

if (isMain()) {
  const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
  const issues = checkMatrixFile(repoRoot, { requireInitialZero: process.argv.includes('--require-initial-zero') })
  if (issues.length) {
    console.error(`sage-sanbao-state-matrix: FAIL (${issues.length})`)
    for (const issue of issues) console.error(`${issue.code}${issue.stateId ? ` ${issue.stateId}` : ''}: ${issue.detail}`)
    process.exit(1)
  }
  const matrix = JSON.parse(readFileSync(join(repoRoot, MATRIX_REL_PATH), 'utf8'))
  console.log(`sage-sanbao-state-matrix: PASS (${matrix.states.length} rows; integrated ${matrix.summary.delivery.integration.integrated ?? 0})`)
}
