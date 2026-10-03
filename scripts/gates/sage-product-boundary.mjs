/**
 * Sage P0-2 product boundary gate.
 *
 * It protects the ownership split rather than trying to prove runtime health:
 * the renderer is self-owned, no shell source reads a Cordis service after the
 * WT-02D.1 P0-2 adapter retirement, and the retired upstream page/stream
 * surfaces cannot re-enter through source drift.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

const SOURCE_ROOT = 'apps/sage-shell/src'
const PRODUCT_ROOT = SOURCE_ROOT + '/product/'
/**
 * The Cordis host process (ADR-0198). It boots the profile and carries the container, so it is the
 * one Sage source tree allowed to read a Cordis service — and only through the consumption
 * registry (`scripts/gates/sage-service-consumption.json`), which reds any unregistered or stale
 * consumer. Everything else under `src/` stays lexically clean, so the retirement of the P0-2
 * product adapter cannot re-enter through source drift.
 */
const HOST_CONSUMER_ROOT = SOURCE_ROOT + '/host/'

const REQUIRED_FILES = [
  PRODUCT_ROOT + 'contracts.ts',
  PRODUCT_ROOT + 'renderer.ts',
  SOURCE_ROOT + '/host/assets.ts',
  SOURCE_ROOT + '/host/index.ts',
  SOURCE_ROOT + '/profile/layout.ts',
]

const RETIRED_FILES = [
  SOURCE_ROOT + '/host/composer-adapter.ts',
  SOURCE_ROOT + '/host/composer-view.ts',
  SOURCE_ROOT + '/host/streams.ts',
  // WT-02D.1: the P0-2 Host-side product adapter retired with the /.sage/* route ownership move.
  PRODUCT_ROOT + 'state.ts',
  SOURCE_ROOT + '/adapter/contracts.ts',
  SOURCE_ROOT + '/adapter/capability-adapter.ts',
  SOURCE_ROOT + '/adapter/handler.ts',
]

const UPSTREAM_TOKENS = [
  '@deepseek-ai/dsh-web-frontend',
  '@deepseek-ai/dsh-client-modules',
  '@deepseek-ai/dsh-api-gateway',
  '@deepseek-ai/dsh-host-webserver',
  'clientModules',
  'createSharedFetchHandler',
  'typertGateway',
  '__DSH_TRANSPORT__',
  'data-sanbao-composer',
  'composer-adapter',
  'composer-view',
]

const PRODUCT_TOKENS = [
  '/api',
  '/plugins',
  '/.dsh/remote-stream',
  '/.sanbao/',
  '__DSH_TRANSPORT__',
  'localStorage',
  'ctx.get(',
  '@deepseek-ai/',
  '../host/',
]

function meaningfulText(text) {
  return text.split('\n')
    .filter((line) => {
      const trimmed = line.trim()
      return !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*') && !trimmed.startsWith('*/')
    })
    .join('\n')
}

function hasToken(text, token) {
  return meaningfulText(text).includes(token)
}

/**
 * Read the current source tree, including files not yet staged for a commit.
 * @param {string} repoRoot
 * @returns {Array<{path: string, text: string}>}
 */
export function collectSageProductBoundaryFiles(repoRoot) {
  const root = join(repoRoot, SOURCE_ROOT)
  if (!existsSync(root)) return []
  return readdirSync(root, { recursive: true })
    .filter((entry) => entry.endsWith('.ts'))
    .map((entry) => {
      const absolute = join(root, entry)
      return {
        path: relative(repoRoot, absolute),
        text: readFileSync(absolute, 'utf8'),
      }
    })
}

/**
 * @param {{files: Array<{path: string, text: string}>}} input
 * @returns {{passed: boolean, violations: string[], note: string}}
 */
export function checkSageProductBoundary({ files }) {
  const violations = []
  if (files.length === 0) {
    return {
      passed: false,
      violations: [SOURCE_ROOT + ' contains no readable source files — boundary scan has no object to check'],
      note: 'scanned 0 Sage source files',
    }
  }

  const byPath = new Map(files.map((file) => [file.path, file.text]))
  for (const path of REQUIRED_FILES) {
    if (!byPath.has(path)) violations.push(path + ' is required for the P0-2 Sage product boundary')
  }
  for (const path of RETIRED_FILES) {
    if (byPath.has(path)) violations.push(path + ' is retired; its upstream product path must not remain in Sage source')
  }

  for (const [path, text] of byPath) {
    for (const token of UPSTREAM_TOKENS) {
      if (hasToken(text, token)) violations.push(path + ' still contains retired upstream token ' + JSON.stringify(token))
    }
    if (path.startsWith(HOST_CONSUMER_ROOT)) continue
    if (hasToken(text, 'ctx.get(')) {
      violations.push(path + ' calls ctx.get outside ' + HOST_CONSUMER_ROOT
        + ' — only the Cordis host process may read a service, and only when the consumer is registered (ADR-0198)')
    }
  }

  for (const [path, text] of byPath) {
    if (!path.startsWith(PRODUCT_ROOT)) continue
    for (const token of PRODUCT_TOKENS) {
      if (hasToken(text, token)) violations.push(path + ' crosses the product boundary with ' + JSON.stringify(token))
    }
  }

  const layout = byPath.get(SOURCE_ROOT + '/profile/layout.ts')
  if (layout !== undefined && (hasToken(layout, 'dsh-onboarding-carousel') || hasToken(layout, 'composer') || hasToken(layout, 'streams'))) {
    violations.push(SOURCE_ROOT + '/profile/layout.ts still composes a retired product package or runtime module')
  }

  return {
    passed: violations.length === 0,
    violations,
    note: 'scanned ' + files.length + ' Sage source files; comments are excluded from token checks',
  }
}
