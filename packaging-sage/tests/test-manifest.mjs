import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

export const SAGE_PACKAGING_TEST_LAYERS = Object.freeze(['pure', 'platform', 'input', 'live'])
export const SAGE_PACKAGING_TEST_RUNNERS = Object.freeze(['node', 'node-test', 'bash'])
export const SAGE_PACKAGING_EXPECTED_TEST_COUNT = 14

export const SAGE_PACKAGING_CONTRACT_TESTS = Object.freeze([
  Object.freeze({
    path: 'packaging-sage/scripts/accept-dmg.test.mjs',
    layer: 'pure',
    runner: 'node-test',
  }),
  Object.freeze({
    path: 'packaging-sage/tests/certificate-policy-test.mjs',
    layer: 'platform',
    runner: 'node',
  }),
  Object.freeze({
    path: 'packaging-sage/tests/dmg-contract-test.mjs',
    layer: 'pure',
    runner: 'node',
  }),
  Object.freeze({
    path: 'packaging-sage/tests/fixture-test.sh',
    layer: 'platform',
    runner: 'bash',
  }),
  Object.freeze({
    path: 'packaging-sage/tests/input-lock-contract-test.mjs',
    layer: 'pure',
    runner: 'node',
  }),
  Object.freeze({
    path: 'packaging-sage/tests/local-signing-recovery-test.mjs',
    layer: 'pure',
    runner: 'node',
  }),
  Object.freeze({
    path: 'packaging-sage/tests/native-inventory-test.mjs',
    layer: 'pure',
    runner: 'node',
  }),
  Object.freeze({
    path: 'packaging-sage/tests/native-projection-test.mjs',
    layer: 'platform',
    runner: 'node',
  }),
  Object.freeze({
    path: 'packaging-sage/tests/pnpm-install-artifacts-test.mjs',
    layer: 'pure',
    runner: 'node',
  }),
  Object.freeze({
    path: 'packaging-sage/tests/producer-contract-test.mjs',
    layer: 'input',
    runner: 'node',
  }),
  Object.freeze({
    path: 'packaging-sage/tests/runtime-graph-builtins-test.mjs',
    layer: 'pure',
    runner: 'node',
  }),
  Object.freeze({
    path: 'packaging-sage/tests/shell-scripts-bash32-safety-test.mjs',
    layer: 'pure',
    runner: 'node',
  }),
  Object.freeze({
    path: 'packaging-sage/tests/signing-normalized-tree-test.mjs',
    layer: 'platform',
    runner: 'node',
  }),
  Object.freeze({
    path: 'packaging-sage/tests/signing-plan-test.mjs',
    layer: 'pure',
    runner: 'node',
  }),
])

const TEST_ENTRYPOINT_PATTERN = /(?:\.test|-test)\.(?:mjs|sh)$/u
const TEST_SEARCH_ROOTS = Object.freeze([
  'packaging-sage/scripts',
  'packaging-sage/tests',
])
const REQUIRED_NON_PURE_LAYERS = new Map([
  ['packaging-sage/tests/certificate-policy-test.mjs', 'platform'],
  ['packaging-sage/tests/fixture-test.sh', 'platform'],
  ['packaging-sage/tests/native-projection-test.mjs', 'platform'],
  ['packaging-sage/tests/producer-contract-test.mjs', 'input'],
  ['packaging-sage/tests/signing-normalized-tree-test.mjs', 'platform'],
])
const FORBIDDEN_PURE_SOURCE = Object.freeze([
  /staging["']\s*,\s*["']input/u,
  /staging\/input/u,
  /produce-inputs\.(?:mjs|sh)/u,
  /(?:^|["'/])assemble\.sh/u,
  /(?:^|["'/])sign\.sh/u,
  /(?:^|["'/])dmg\.sh/u,
  /\/usr\/bin\/(?:codesign|hdiutil|openssl)/u,
  /--execute/u,
])

function toRepoPath(value) {
  return value.split(sep).join('/')
}

function walkFiles(root, directory, output) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) walkFiles(root, path, output)
    else if (entry.isFile()) output.push(toRepoPath(relative(root, path)))
  }
}

export function discoverSagePackagingTestEntrypoints(repoRoot) {
  const files = []
  for (const searchRoot of TEST_SEARCH_ROOTS) walkFiles(repoRoot, join(repoRoot, searchRoot), files)
  return files.filter(path => TEST_ENTRYPOINT_PATTERN.test(path)).sort()
}

export function validateSagePackagingTestManifest({
  repoRoot,
  entries = SAGE_PACKAGING_CONTRACT_TESTS,
  discovered = discoverSagePackagingTestEntrypoints(repoRoot),
} = {}) {
  const issues = []
  if (entries.length !== SAGE_PACKAGING_EXPECTED_TEST_COUNT) {
    issues.push(`manifest-count: expected ${SAGE_PACKAGING_EXPECTED_TEST_COUNT}, got ${entries.length}`)
  }
  if (discovered.length !== SAGE_PACKAGING_EXPECTED_TEST_COUNT) {
    issues.push(`discovered-count: expected ${SAGE_PACKAGING_EXPECTED_TEST_COUNT}, got ${discovered.length}`)
  }

  const registered = new Set()
  for (const [index, entry] of entries.entries()) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      issues.push(`invalid-entry: manifest[${index}] must be an object`)
      continue
    }
    if (typeof entry.path !== 'string' || !TEST_ENTRYPOINT_PATTERN.test(entry.path)) {
      issues.push(`invalid-path: manifest[${index}] ${String(entry.path)}`)
      continue
    }
    if (registered.has(entry.path)) issues.push(`duplicate-entry: ${entry.path}`)
    registered.add(entry.path)
    if (!SAGE_PACKAGING_TEST_LAYERS.includes(entry.layer)) {
      issues.push(`invalid-layer: ${entry.path} ${String(entry.layer)}`)
    }
    if (!SAGE_PACKAGING_TEST_RUNNERS.includes(entry.runner)) {
      issues.push(`invalid-runner: ${entry.path} ${String(entry.runner)}`)
    }
    const requiredLayer = REQUIRED_NON_PURE_LAYERS.get(entry.path)
    if (requiredLayer !== undefined && entry.layer !== requiredLayer) {
      issues.push(`unsafe-layer: ${entry.path} must be ${requiredLayer}, got ${String(entry.layer)}`)
    }
    if (entry.layer === 'pure' && entry.runner === 'bash') {
      issues.push(`unsafe-pure-runner: ${entry.path} cannot use bash in the quick contract suite`)
    }
    if (entry.layer === 'pure') {
      let source
      try {
        source = readFileSync(join(repoRoot, entry.path), 'utf8')
      } catch (error) {
        issues.push(`unreadable-pure-test: ${entry.path} ${error instanceof Error ? error.message : String(error)}`)
        continue
      }
      if (FORBIDDEN_PURE_SOURCE.some(pattern => pattern.test(source))) {
        issues.push(`unsafe-pure-source: ${entry.path} invokes or reads a non-quick packaging surface`)
      }
    }
  }

  const discoveredSet = new Set(discovered)
  for (const path of discovered) {
    if (!registered.has(path)) issues.push(`unregistered-test: ${path}`)
  }
  for (const path of registered) {
    if (!discoveredSet.has(path)) issues.push(`missing-test: ${path}`)
  }
  return issues
}

export function inspectSagePackagingTestManifest(repoRoot, options = {}) {
  const entries = options.entries ?? SAGE_PACKAGING_CONTRACT_TESTS
  const discovered = options.discovered ?? discoverSagePackagingTestEntrypoints(repoRoot)
  const issues = validateSagePackagingTestManifest({ repoRoot, entries, discovered })
  const layers = Object.fromEntries(SAGE_PACKAGING_TEST_LAYERS.map(layer => [
    layer,
    entries.filter(entry => entry?.layer === layer).length,
  ]))
  return { entries, discovered, issues, layers }
}
