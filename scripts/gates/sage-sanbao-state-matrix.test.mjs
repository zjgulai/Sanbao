import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import {
  MATRIX_REL_PATH,
  ROUTE_MATRIX_REL_PATH,
  deriveSummary,
  routeKeysFromAuthorityMatrix,
  validateMatrix,
} from './sage-sanbao-state-matrix.mjs'

const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
const baseline = JSON.parse(readFileSync(join(repoRoot, MATRIX_REL_PATH), 'utf8'))
const routeKeys = routeKeysFromAuthorityMatrix(JSON.parse(readFileSync(join(repoRoot, ROUTE_MATRIX_REL_PATH), 'utf8')))
const options = {
  // Mirrors the real git-tracked checker for repo paths actually used by verification refs
  // (docs specs/notes, sage-shell tests/sources, packaging harness) — ADR-0283 D2 introduced
  // non-docs tracked refs, which the old docs/-only approximation misread as untracked.
  isTrackedEvidence: ref => typeof ref === 'string'
    && (ref.startsWith('docs/') || ref.startsWith('apps/') || ref.startsWith('packaging-sage/')),
  routeKeys,
}

function clone() {
  return structuredClone(baseline)
}

function refreshSummary(matrix) {
  matrix.summary = deriveSummary(matrix.states)
  return matrix
}

function issueCodes(matrix, override = {}) {
  return validateMatrix(matrix, { ...options, ...override }).map(issue => issue.code)
}

function assertIssue(matrix, code, override) {
  assert.ok(issueCodes(matrix, override).includes(code), `expected ${code}`)
}

const trackedEvidence = dimension => [{
  kind: 'test-report',
  ref: `docs/specs/2026-10-05-sanbao-in-sage-integration-spec.md#${dimension}`,
  countsAsVerification: true,
}]

test('tracked baseline is exactly 206 rows with zero integrated states', () => {
  assert.deepEqual(validateMatrix(baseline, { ...options, requireInitialZero: true }), [])
  assert.equal(baseline.summary.rows, 206)
  assert.equal(baseline.summary.delivery.integration.integrated ?? 0, 0)
})

test('rejects a deleted row', () => {
  const matrix = clone()
  matrix.states.pop()
  refreshSummary(matrix)
  assertIssue(matrix, 'row-count')
})

test('rejects a duplicate sourceStateId', () => {
  const matrix = clone()
  matrix.states.at(-1).sourceStateId = matrix.states[0].sourceStateId
  refreshSummary(matrix)
  assertIssue(matrix, 'duplicate-state-id')
})

test('rejects an external sourceStateId', () => {
  const matrix = clone()
  matrix.states.at(-1).sourceStateId = 'EXTERNAL.NOT.IN.CATALOG'
  refreshSummary(matrix)
  assertIssue(matrix, 'state-id-set-drift')
})

test('prototype wired cannot be promoted to Sage integrated', () => {
  const matrix = clone()
  const row = matrix.states.find(item => item.prototype.normalizedStatus === 'prototype-host-wired')
  assert.ok(row)
  row.prototype.countsAsSageIntegration = true
  row.delivery.applicability = 'required'
  row.delivery.integrationStatus = 'integrated'
  refreshSummary(matrix)
  const codes = issueCodes(matrix)
  assert.ok(codes.includes('prototype-promoted'))
  assert.ok(codes.includes('integrated-with-unverified-dimension'))
})

test('ignored evidence cannot make a dimension verified', () => {
  const matrix = clone()
  const row = matrix.states[0]
  row.delivery.ui = {
    status: 'verified',
    evidenceRefs: [{
      kind: 'desktop-probe',
      ref: '.birdview/evidence/untracked/result.json',
      countsAsVerification: true,
    }],
  }
  refreshSummary(matrix)
  assertIssue(matrix, 'forbidden-verification-evidence')
})

test('fixture evidence cannot make a dimension verified', () => {
  const matrix = clone()
  const row = matrix.states[0]
  row.delivery.ui = {
    status: 'verified',
    evidenceRefs: [{
      kind: 'test-report',
      ref: 'docs/fixtures/fake-success.json',
      countsAsVerification: true,
    }],
  }
  refreshSummary(matrix)
  assertIssue(matrix, 'forbidden-verification-evidence')
})

test('candidate-only evidence cannot make a dimension verified', () => {
  const matrix = clone()
  const row = matrix.states[0]
  row.delivery.ui = {
    status: 'verified',
    evidenceRefs: [{
      kind: 'candidate-untracked',
      ref: 'docs/candidate/result.json',
      countsAsVerification: false,
    }],
  }
  refreshSummary(matrix)
  assertIssue(matrix, 'verified-with-candidate-evidence')
})

test('blocked Application Service cannot be integrated', () => {
  const matrix = clone()
  const row = matrix.states[0]
  row.delivery.applicability = 'required'
  row.delivery.integrationStatus = 'integrated'
  refreshSummary(matrix)
  assertIssue(matrix, 'blocked-service-integrated')
})

test('rejects a hand-edited summary', () => {
  const matrix = clone()
  matrix.summary.rows = 205
  assertIssue(matrix, 'summary-drift')
})

test('not-applicable requires a tracked decision and rationale', () => {
  const matrix = clone()
  const row = matrix.states[0]
  row.delivery.applicability = 'not-applicable'
  row.delivery.integrationStatus = 'not-applicable'
  delete row.delivery.notApplicableDecisionRef
  delete row.delivery.notApplicableRationale
  refreshSummary(matrix)
  const codes = issueCodes(matrix)
  assert.ok(codes.includes('n-a-without-decision'))
  assert.ok(codes.includes('n-a-without-rationale'))
})

test('verified Application Service requires a registered route', () => {
  const matrix = clone()
  const row = matrix.states[0]
  row.delivery.applicationService = {
    status: 'verified',
    routeRefs: ['POST /.sage/not-registered'],
    evidenceRefs: trackedEvidence('application-service'),
  }
  refreshSummary(matrix)
  assertIssue(matrix, 'unknown-route-ref')
})

test('allows integrated only after all five dimensions have tracked evidence', () => {
  const matrix = clone()
  const row = matrix.states[0]
  row.delivery.applicability = 'required'
  row.delivery.ui = { status: 'verified', evidenceRefs: trackedEvidence('ui') }
  row.delivery.applicationService = {
    status: 'verified',
    routeRefs: [routeKeys.values().next().value],
    evidenceRefs: trackedEvidence('application-service'),
  }
  row.delivery.hostIntegration = { status: 'verified', evidenceRefs: trackedEvidence('host') }
  row.delivery.electronAcceptance = { status: 'verified', evidenceRefs: trackedEvidence('electron') }
  row.delivery.visualAcceptance = { status: 'verified', evidenceRefs: trackedEvidence('visual') }
  row.delivery.integrationStatus = 'integrated'
  row.delivery.blockers = []
  refreshSummary(matrix)
  assert.deepEqual(validateMatrix(matrix, options), [])
  assertIssue(matrix, 'initial-integrated-count', { requireInitialZero: true })
})
