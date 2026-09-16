/** @typedef {'pass' | 'fail' | 'skip'} GateStatus */

/**
 * @typedef {object} TypedSkip
 * @property {string} type 稳定、可聚合的跳过类型。
 * @property {number} count 该类型覆盖的对象数。
 * @property {string} reason 人可读原因。
 * @property {string[]} [objects] 可选的对象标识。
 */

/**
 * @typedef {object} GateResult
 * @property {GateStatus} status
 * @property {number} expected
 * @property {number} discovered
 * @property {number} checked
 * @property {number} skipped
 * @property {number} failed
 * @property {TypedSkip[]} typedSkips
 * @property {string} reason
 * @property {string} [note]
 * @property {string[]} violations
 */

export const GATE_STATUSES = Object.freeze(['pass', 'fail', 'skip'])

/**
 * Validate one canonical gate result without mutating it.
 *
 * `expected` is the accounting denominator. Every expected object must end in
 * exactly one of checked, typed skipped, or failed. `discovered` is reported
 * separately because discovery drift is evidence of its own.
 *
 * @param {unknown} value
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateGateResult(value) {
  const errors = []
  if (!isRecord(value)) {
    return { valid: false, errors: ['result must be a non-array object'] }
  }

  if ('passed' in value) {
    errors.push('canonical result must not contain legacy field passed')
  }
  if (!GATE_STATUSES.includes(/** @type {GateStatus} */ (value.status))) {
    errors.push('status must be one of pass, fail, skip')
  }

  for (const field of ['expected', 'discovered', 'checked', 'skipped', 'failed']) {
    const count = value[field]
    if (!Number.isInteger(count) || /** @type {number} */ (count) < 0) {
      errors.push(`${field} must be a non-negative integer`)
    }
  }

  if (typeof value.reason !== 'string' || value.reason.trim() === '') {
    errors.push('reason must be a non-empty string')
  }
  if ('note' in value && typeof value.note !== 'string') {
    errors.push('note must be a string when present')
  }
  if (!Array.isArray(value.violations) || value.violations.some((item) => typeof item !== 'string')) {
    errors.push('violations must be an array of strings')
  }

  let typedSkipTotal = 0
  if (!Array.isArray(value.typedSkips)) {
    errors.push('typedSkips must be an array')
  } else {
    for (const [index, entry] of value.typedSkips.entries()) {
      if (!isRecord(entry)) {
        errors.push(`typedSkips[${index}] must be an object`)
        continue
      }
      if (typeof entry.type !== 'string' || entry.type.trim() === '') {
        errors.push(`typedSkips[${index}].type must be a non-empty string`)
      }
      if (!Number.isInteger(entry.count) || /** @type {number} */ (entry.count) <= 0) {
        errors.push(`typedSkips[${index}].count must be a positive integer`)
      } else {
        typedSkipTotal += /** @type {number} */ (entry.count)
      }
      if (typeof entry.reason !== 'string' || entry.reason.trim() === '') {
        errors.push(`typedSkips[${index}].reason must be a non-empty string`)
      }
      if ('objects' in entry && (!Array.isArray(entry.objects) || entry.objects.some((item) => typeof item !== 'string'))) {
        errors.push(`typedSkips[${index}].objects must be an array of strings when present`)
      }
    }
  }

  const expected = integerOrNull(value.expected)
  const discovered = integerOrNull(value.discovered)
  const checked = integerOrNull(value.checked)
  const skipped = integerOrNull(value.skipped)
  const failed = integerOrNull(value.failed)

  if (expected !== null && checked !== null && skipped !== null && failed !== null) {
    if (expected !== checked + skipped + failed) {
      errors.push('expected must equal checked + skipped + failed')
    }
  }
  if (skipped !== null && Array.isArray(value.typedSkips) && typedSkipTotal !== skipped) {
    errors.push('typedSkips count must equal skipped')
  }
  if (checked !== null && discovered !== null && checked > discovered) {
    errors.push('checked must not exceed discovered')
  }
  if (value.status !== 'fail' && discovered !== null && expected !== null && discovered > expected) {
    errors.push('non-failing result must not discover more objects than expected')
  }

  const violations = Array.isArray(value.violations) ? value.violations : []
  if (value.status === 'pass') {
    if (checked === 0) errors.push('pass requires checked > 0; empty scope cannot pass')
    if (skipped !== 0 || failed !== 0) errors.push('pass requires skipped = 0 and failed = 0')
    if (violations.length > 0) errors.push('pass must not contain violations')
  } else if (value.status === 'skip') {
    if (skipped === 0) errors.push('skip requires skipped > 0')
    if (failed !== 0) errors.push('skip requires failed = 0')
    if (violations.length > 0) errors.push('skip must not contain violations')
  } else if (value.status === 'fail') {
    if (failed === 0) errors.push('fail requires failed > 0')
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Normalize a canonical or legacy checker result. Invalid or contradictory
 * inputs become a valid fail result; this function never lets malformed data
 * turn green.
 *
 * Legacy input is deliberately gate-level: one legacy checker maps to one
 * expected unit. Object-level denominators require migration to the canonical
 * schema rather than inference here.
 *
 * @param {unknown} raw
 * @param {{name?: string}} [options]
 * @returns {GateResult}
 */
export function normalizeGateResult(raw, { name = 'unnamed-check' } = {}) {
  if (!isRecord(raw)) {
    return invalidResult(name, ['result must be a non-array object'])
  }

  if ('status' in raw) {
    const canonical = pickCanonicalResult(raw)
    const validation = validateGateResult(canonical)
    return validation.valid ? canonical : invalidResult(name, validation.errors)
  }

  return normalizeLegacyResult(raw, name)
}

/**
 * Run synchronous checker functions and return normalized results plus a
 * summary. No filesystem or process state is touched here.
 *
 * @param {Array<{name: string, run: () => unknown, remediation?: string}>} checks
 * @param {{requireNoSkip?: boolean}} [options]
 * @returns {{results: Array<GateResult & {name: string, remediation?: string}>, summary: ReturnType<typeof summarizeGateResults>, exitCode: number}}
 */
export function runGateChecks(checks, { requireNoSkip = false } = {}) {
  const safeChecks = Array.isArray(checks) ? checks : []
  const results = safeChecks.map((check, index) => {
    const name = typeof check?.name === 'string' && check.name.trim() !== '' ? check.name : `unnamed-check-${index + 1}`
    let result
    if (typeof check?.run !== 'function') {
      result = invalidResult(name, ['checker run must be a function'])
    } else {
      try {
        result = normalizeGateResult(check.run(), { name })
      } catch (error) {
        result = thrownResult(name, error)
      }
    }

    return {
      name,
      ...result,
      ...(typeof check?.remediation === 'string' ? { remediation: check.remediation } : {}),
    }
  })
  const summary = summarizeGateResults(results, { requireNoSkip })
  return { results, summary, exitCode: summary.exitCode }
}

/**
 * Summarize canonical results. Inputs are normalized again so this standalone
 * function is also fail-closed when called outside runGateChecks().
 *
 * @param {unknown[]} results
 * @param {{requireNoSkip?: boolean}} [options]
 */
export function summarizeGateResults(results, { requireNoSkip = false } = {}) {
  const normalized = (Array.isArray(results) ? results : []).map((result, index) => {
    const name = isRecord(result) && typeof result.name === 'string' ? result.name : `summary-result-${index + 1}`
    return normalizeGateResult(result, { name })
  })
  const passed = normalized.filter((result) => result.status === 'pass').length
  const skipped = normalized.filter((result) => result.status === 'skip').length
  const failed = normalized.filter((result) => result.status === 'fail').length
  const empty = normalized.length === 0
  const strictSkipFailure = requireNoSkip && skipped > 0
  const exitCode = failed > 0 || strictSkipFailure || empty ? 1 : 0
  const status = exitCode !== 0 ? 'fail' : skipped > 0 ? 'skip' : 'pass'

  return {
    status,
    total: normalized.length,
    passed,
    skipped,
    failed,
    expected: sum(normalized, 'expected'),
    discovered: sum(normalized, 'discovered'),
    checked: sum(normalized, 'checked'),
    skippedObjects: sum(normalized, 'skipped'),
    failedObjects: sum(normalized, 'failed'),
    requireNoSkip,
    exitCode,
    ...(empty ? { reason: 'no gate checks were supplied' } : {}),
    ...(strictSkipFailure ? { reason: 'requireNoSkip rejected one or more skipped checks' } : {}),
  }
}

/** @param {Record<string, unknown>} raw @returns {GateResult} */
function pickCanonicalResult(raw) {
  return {
    status: /** @type {GateStatus} */ (raw.status),
    expected: /** @type {number} */ (raw.expected),
    discovered: /** @type {number} */ (raw.discovered),
    checked: /** @type {number} */ (raw.checked),
    skipped: /** @type {number} */ (raw.skipped),
    failed: /** @type {number} */ (raw.failed),
    typedSkips: /** @type {TypedSkip[]} */ (raw.typedSkips),
    reason: /** @type {string} */ (raw.reason),
    ...('note' in raw ? { note: /** @type {string} */ (raw.note) } : {}),
    violations: /** @type {string[]} */ (raw.violations),
    ...('passed' in raw ? { passed: raw.passed } : {}),
  }
}

/** @param {Record<string, unknown>} raw @param {string} name @returns {GateResult} */
function normalizeLegacyResult(raw, name) {
  const violations = raw.violations
  if (!Array.isArray(violations) || violations.some((item) => typeof item !== 'string')) {
    return invalidResult(name, ['legacy violations must be an array of strings'])
  }
  if ('note' in raw && typeof raw.note !== 'string') {
    return invalidResult(name, ['legacy note must be a string when present'])
  }
  if ('skipped' in raw && typeof raw.skipped !== 'boolean') {
    return invalidResult(name, ['legacy skipped must be boolean when present'])
  }

  if (raw.skipped === true) {
    if (raw.passed === false) {
      return invalidResult(name, ['legacy result cannot be both failed and skipped'])
    }
    if (raw.passed !== undefined && raw.passed !== true) {
      return invalidResult(name, ['legacy passed must be boolean when present'])
    }
    const note = typeof raw.note === 'string' ? raw.note.trim() : ''
    if (note === '') {
      return invalidResult(name, ['legacy skip requires a non-empty reason or note'])
    }
    if (violations.length > 0) {
      return invalidResult(name, ['legacy skip must not contain violations'])
    }
    return {
      status: 'skip',
      expected: 1,
      discovered: 0,
      checked: 0,
      skipped: 1,
      failed: 0,
      typedSkips: [{ type: 'legacy-skip', count: 1, reason: note }],
      reason: note,
      note: /** @type {string} */ (raw.note),
      violations: [],
    }
  }

  if (typeof raw.passed !== 'boolean') {
    return invalidResult(name, ['legacy result requires boolean passed or skipped=true'])
  }
  if (raw.passed) {
    if (violations.length > 0) {
      return invalidResult(name, ['legacy pass must not contain violations'])
    }
    return {
      status: 'pass',
      expected: 1,
      discovered: 1,
      checked: 1,
      skipped: 0,
      failed: 0,
      typedSkips: [],
      reason: 'legacy checker passed',
      ...(typeof raw.note === 'string' ? { note: raw.note } : {}),
      violations: [],
    }
  }

  const failureViolations = violations.length > 0 ? violations : ['legacy checker reported failure without violations']
  return {
    status: 'fail',
    expected: 1,
    discovered: 1,
    checked: 0,
    skipped: 0,
    failed: 1,
    typedSkips: [],
    reason: 'legacy checker failed',
    ...(typeof raw.note === 'string' ? { note: raw.note } : {}),
    violations: failureViolations,
  }
}

/** @param {string} name @param {string[]} errors @returns {GateResult} */
function invalidResult(name, errors) {
  return {
    status: 'fail',
    expected: 1,
    discovered: 0,
    checked: 0,
    skipped: 0,
    failed: 1,
    typedSkips: [],
    reason: `${name}: result schema invalid`,
    violations: errors.map((error) => `${name}: ${error}`),
  }
}

/** @param {string} name @param {unknown} error @returns {GateResult} */
function thrownResult(name, error) {
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  return {
    status: 'fail',
    expected: 1,
    discovered: 0,
    checked: 0,
    skipped: 0,
    failed: 1,
    typedSkips: [],
    reason: `${name}: checker threw`,
    violations: [`${name}: checker threw ${detail}`],
  }
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** @param {unknown} value @returns {number | null} */
function integerOrNull(value) {
  return Number.isInteger(value) && /** @type {number} */ (value) >= 0 ? /** @type {number} */ (value) : null
}

/** @param {GateResult[]} results @param {'expected'|'discovered'|'checked'|'skipped'|'failed'} field */
function sum(results, field) {
  return results.reduce((total, result) => total + result[field], 0)
}
