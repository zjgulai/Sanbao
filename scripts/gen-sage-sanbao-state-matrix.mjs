#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  MATRIX_REL_PATH,
  PIN,
  ROUTE_MATRIX_REL_PATH,
  TICKETS_REL_PATH,
  deriveSummary,
  gitTrackedEvidenceChecker,
  prototypeRowsForDigest,
  routeKeysFromAuthorityMatrix,
  sha256,
  sourceRowsForDigest,
  stableJson,
  validateMatrix,
} from './gates/sage-sanbao-state-matrix.mjs'

const CATALOG_REL_PATH = 'src/catalog-data.json'
const LEDGER_REL_PATH = 'evidence/wiring/ledger.csv'

function parseArgs(argv) {
  const args = { write: false, print: false, check: false, checkSource: false, requireInitialZero: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--source-root') args.sourceRoot = argv[++index]
    else if (arg === '--candidate') args.candidate = argv[++index]
    else if (arg === '--matrix') args.matrix = argv[++index]
    else if (arg === '--write') args.write = true
    else if (arg === '--print') args.print = true
    else if (arg === '--check') args.check = true
    else if (arg === '--check-source') args.checkSource = true
    else if (arg === '--require-initial-zero') args.requireInitialZero = true
    else throw new Error(`unknown argument: ${arg}`)
  }
  return args
}

export function parseCsv(text) {
  const lines = text.trimEnd().split(/\r?\n/)
  const parseLine = line => {
    const cells = []
    let cell = ''
    let quoted = false
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index]
      if (quoted) {
        if (char === '"') {
          if (line[index + 1] === '"') {
            cell += '"'
            index += 1
          } else quoted = false
        } else cell += char
      } else if (char === '"') quoted = true
      else if (char === ',') {
        cells.push(cell)
        cell = ''
      } else cell += char
    }
    if (quoted) throw new Error('unterminated quoted CSV cell')
    cells.push(cell)
    return cells
  }
  const headers = parseLine(lines[0])
  return lines.slice(1).map((line, offset) => {
    const cells = parseLine(line)
    if (cells.length !== headers.length) throw new Error(`CSV line ${offset + 2}: expected ${headers.length} cells, got ${cells.length}`)
    return Object.fromEntries(headers.map((header, index) => [header, cells[index]]))
  })
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function assertUnique(rows, key, label) {
  const seen = new Set()
  for (const row of rows) {
    const value = row[key]
    if (!value) throw new Error(`${label}: empty ${key}`)
    if (seen.has(value)) throw new Error(`${label}: duplicate ${key} ${value}`)
    seen.add(value)
  }
  return seen
}

function normalizePrototypeStatus(rawStatus) {
  if (rawStatus.startsWith('wired(')) return 'prototype-host-wired'
  if (rawStatus === 'entry-verified') return 'prototype-entry-verified'
  if (rawStatus === 'honest') return 'honest-unwired'
  if (rawStatus.startsWith('n/a(')) return 'prototype-not-applicable'
  throw new Error(`unsupported prototype status: ${rawStatus}`)
}

function explicitLegacyReview(v1, state) {
  const existing = new Map(v1.states.map(row => [row.sourceStateId, row])).get(state.id)
  if (existing) {
    return {
      reviewStatus: 'explicit',
      disposition: existing.disposition,
      family: existing.family,
      sourceConfidence: existing.sourceConfidence,
      sageSurface: existing.sageSurface,
      businessMatterProjection: existing.businessMatterProjection,
      rationale: existing.rationale,
    }
  }
  return {
    reviewStatus: 'default-unreviewed',
    disposition: v1.policy.defaultDisposition,
    family: null,
    sourceConfidence: 'unreviewed',
    sageSurface: null,
    businessMatterProjection: null,
    rationale: v1.policy.defaultReason,
  }
}

function ticketRef(ticket) {
  return `${TICKETS_REL_PATH}#task-${ticket.toLowerCase()}`
}

function candidateEvidence(text) {
  if (!text) return []
  return text.split(';').map(ref => ref.trim()).filter(Boolean).map(ref => ({
    kind: 'candidate-untracked',
    ref,
    countsAsVerification: false,
  }))
}

function initialDelivery(candidate) {
  return {
    ownerTicket: candidate.owner_ticket,
    ownerTicketRef: ticketRef(candidate.owner_ticket),
    applicability: 'unreviewed',
    ui: {
      status: candidate.ui_status,
      evidenceRefs: candidateEvidence(candidate.evidence),
    },
    applicationService: {
      status: candidate.service_status,
      routeRefs: [],
      evidenceRefs: [],
    },
    hostIntegration: { status: 'pending', evidenceRefs: [] },
    electronAcceptance: { status: 'pending', evidenceRefs: [] },
    visualAcceptance: { status: 'pending', evidenceRefs: [] },
    integrationStatus: candidate.integration_status,
    blockers: candidate.blocker ? [candidate.blocker] : [],
  }
}

function sourceRow(state) {
  return {
    title: state.title,
    groupIds: state.groupIds,
    page: state.page,
    variant: state.variant,
    sourceKind: state.sourceKind,
    trigger: state.trigger,
    exit: state.exit,
    evidence: state.evidence,
    observationIds: state.observationIds,
    notes: state.notes,
    implementedFlag: state.implemented,
  }
}

function prototypeRow(ledger) {
  return {
    class: ledger.class,
    wireDepthTarget: ledger.wire_depth_target,
    rawStatus: ledger.status,
    normalizedStatus: normalizePrototypeStatus(ledger.status),
    evidence: ledger.evidence,
    countsAsSageIntegration: false,
  }
}

export function buildMatrix({ catalog, ledgerRows, previous, candidateRows, sourceCommit, catalogSha256, ledgerSha256, candidateSha256 }) {
  if (sourceCommit !== PIN.commit) throw new Error(`Sanbao commit mismatch: expected ${PIN.commit}, got ${sourceCommit}`)
  if (catalogSha256 !== PIN.catalogSha256) throw new Error(`catalog SHA-256 mismatch: ${catalogSha256}`)
  if (ledgerSha256 !== PIN.ledgerSha256) throw new Error(`ledger SHA-256 mismatch: ${ledgerSha256}`)
  if (!Array.isArray(catalog.groups) || catalog.groups.length !== 59) throw new Error(`expected 59 catalog groups, got ${catalog.groups?.length}`)
  if (!Array.isArray(catalog.states) || catalog.states.length !== 206) throw new Error(`expected 206 catalog states, got ${catalog.states?.length}`)
  if (ledgerRows.length !== 206) throw new Error(`expected 206 ledger rows, got ${ledgerRows.length}`)
  const catalogIds = assertUnique(catalog.states, 'id', 'catalog')
  const ledgerIds = assertUnique(ledgerRows, 'state_id', 'ledger')
  const candidateIds = candidateRows ? assertUnique(candidateRows, 'state_id', 'candidate') : null
  for (const stateId of catalogIds) {
    if (!ledgerIds.has(stateId)) throw new Error(`ledger missing catalog state ${stateId}`)
    if (candidateIds && !candidateIds.has(stateId)) throw new Error(`candidate missing catalog state ${stateId}`)
  }
  for (const stateId of ledgerIds) if (!catalogIds.has(stateId)) throw new Error(`ledger has unknown state ${stateId}`)
  if (candidateIds) for (const stateId of candidateIds) if (!catalogIds.has(stateId)) throw new Error(`candidate has unknown state ${stateId}`)

  const ledgerById = new Map(ledgerRows.map(row => [row.state_id, row]))
  const candidateById = candidateRows ? new Map(candidateRows.map(row => [row.state_id, row])) : null
  const previousById = previous.schemaVersion === 2 ? new Map(previous.states.map(row => [row.sourceStateId, row])) : null
  if (previous.schemaVersion !== 1 && previous.schemaVersion !== 2) throw new Error(`unsupported previous schemaVersion ${previous.schemaVersion}`)

  const states = catalog.states.map(state => {
    const ledger = ledgerById.get(state.id)
    if (ledger.page !== state.page || ledger.variant !== state.variant || ledger.source_kind !== state.sourceKind) {
      throw new Error(`catalog/ledger field mismatch for ${state.id}`)
    }
    if (stableJson(ledger.groups.split('|')) !== stableJson(state.groupIds)) throw new Error(`catalog/ledger group mismatch for ${state.id}`)
    const prior = previousById?.get(state.id)
    const candidate = candidateById?.get(state.id)
    if (candidate) {
      if (candidate.title !== state.title || candidate.source_kind !== state.sourceKind || stableJson(candidate.groups.split(';')) !== stableJson(state.groupIds)) {
        throw new Error(`catalog/candidate field mismatch for ${state.id}`)
      }
    }
    const legacyUi00Review = prior?.legacyUi00Review ?? explicitLegacyReview(previous, state)
    const delivery = candidate ? initialDelivery(candidate) : prior?.delivery
    if (!delivery) throw new Error(`no delivery overlay for ${state.id}; pass --candidate for the initial migration`)
    return {
      sourceStateId: state.id,
      source: sourceRow(state),
      prototype: prototypeRow(ledger),
      legacyUi00Review,
      delivery,
    }
  })

  const stateIdsSha256 = sha256(JSON.stringify(states.map(row => row.sourceStateId)))
  const normalizedSourceSha256 = sha256(stableJson(sourceRowsForDigest(states)))
  const normalizedPrototypeSha256 = sha256(stableJson(prototypeRowsForDigest(states)))
  const matrix = {
    schemaVersion: 2,
    id: 'sage-sanbao-state-integration-matrix',
    status: 'delivery-tracker',
    source: {
      repository: 'zjgulai/sanbao_ui',
      branch: 'main',
      commit: sourceCommit,
      runtimeDependencyAllowed: false,
      catalog: {
        path: CATALOG_REL_PATH,
        sha256: catalogSha256,
        normalizedRowsSha256: normalizedSourceSha256,
        stateIdsSha256,
        groups: catalog.groups.length,
        states: catalog.states.length,
        sourceKinds: { observed: 123, 'entry-observed': 28, 'static-only': 55 },
      },
      prototypeLedger: {
        path: LEDGER_REL_PATH,
        sha256: ledgerSha256,
        normalizedRowsSha256: normalizedPrototypeSha256,
        rows: ledgerRows.length,
      },
    },
    migration: {
      legacySchemaVersion: 1,
      ...(candidateSha256 ? {
        candidate: {
          path: '.birdview/2026-10-05-sanbao-sage-integration-matrix.csv',
          sha256: candidateSha256,
          tracked: false,
          countsAsVerification: false,
        },
      } : previous.migration?.candidate ? { candidate: previous.migration.candidate } : {}),
    },
    policy: {
      primaryKey: 'sourceStateId',
      prototypeWiringCountsAsSageIntegration: false,
      fixtureCountsAsVerification: false,
      pagesCountsAsVerification: false,
      legacyRendererCountsAsVerification: false,
      domainAuthority: 'BusinessMatter projection',
      runtimeBoundary: 'Electron main-owned Application Service and the single Capability Adapter',
      requiredIntegrationDimensions: ['ui', 'applicationService', 'hostIntegration', 'electronAcceptance', 'visualAcceptance'],
    },
    summary: deriveSummary(states),
    states,
  }
  return matrix
}

function matrixText(matrix) {
  return `${JSON.stringify(matrix, null, 2)}\n`
}

function repoRoot() {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
}

function loadSource(sourceRoot) {
  const catalogPath = join(sourceRoot, CATALOG_REL_PATH)
  const ledgerPath = join(sourceRoot, LEDGER_REL_PATH)
  const catalogText = readFileSync(catalogPath, 'utf8')
  const ledgerText = readFileSync(ledgerPath, 'utf8')
  return {
    catalog: JSON.parse(catalogText),
    ledgerRows: parseCsv(ledgerText),
    sourceCommit: execFileSync('git', ['-C', sourceRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    catalogSha256: sha256(catalogText),
    ledgerSha256: sha256(ledgerText),
  }
}

function run() {
  const args = parseArgs(process.argv.slice(2))
  const root = repoRoot()
  const matrixPath = resolve(root, args.matrix ?? MATRIX_REL_PATH)
  const validationOptions = {
    isTrackedEvidence: gitTrackedEvidenceChecker(root),
    requireInitialZero: args.requireInitialZero,
    routeKeys: routeKeysFromAuthorityMatrix(readJson(join(root, ROUTE_MATRIX_REL_PATH))),
  }
  if (args.check && !args.sourceRoot) {
    const matrix = readJson(matrixPath)
    const issues = validateMatrix(matrix, validationOptions)
    if (issues.length) {
      for (const issue of issues) console.error(`${issue.code}${issue.stateId ? ` ${issue.stateId}` : ''}: ${issue.detail}`)
      process.exit(1)
    }
    console.log(`sage-sanbao-state-matrix generator check: PASS (${matrix.states.length} rows; integrated ${matrix.summary.delivery.integration.integrated ?? 0})`)
    return
  }
  if (!args.sourceRoot) throw new Error('--source-root is required for generation or source comparison')
  const sourceRoot = resolve(args.sourceRoot)
  const previous = readJson(matrixPath)
  const candidatePath = args.candidate ? resolve(root, args.candidate) : null
  const candidateText = candidatePath ? readFileSync(candidatePath, 'utf8') : null
  const matrix = buildMatrix({
    ...loadSource(sourceRoot),
    previous,
    candidateRows: candidateText ? parseCsv(candidateText) : null,
    candidateSha256: candidateText ? sha256(candidateText) : null,
  })
  const issues = validateMatrix(matrix, validationOptions)
  if (issues.length) throw new Error(`generated matrix failed validation:\n${issues.map(issue => `${issue.code}${issue.stateId ? ` ${issue.stateId}` : ''}: ${issue.detail}`).join('\n')}`)
  const output = matrixText(matrix)
  if (args.checkSource) {
    const current = readFileSync(matrixPath, 'utf8')
    if (current !== output) throw new Error(`${relative(root, matrixPath)} is stale; regenerate from the pinned Sanbao source`)
    console.log(`sage-sanbao-state-matrix source check: PASS (${matrix.states.length} rows)`)
  }
  if (args.print) process.stdout.write(output)
  if (args.write) {
    writeFileSync(matrixPath, output)
    console.log(`wrote ${relative(root, matrixPath)}`)
  }
  if (!args.checkSource && !args.print && !args.write) throw new Error('choose --check-source, --print, or --write')
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (isMain) {
  try {
    run()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
