import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { beforeAll, describe, expect, it } from 'vitest'

import { renderSageDocument } from '../src/product/renderer.js'

/**
 * UI-DECISION-01 / P1 infrastructure guards (ADR-0261).
 *
 * These guards pin the seams that keep the React bundle (a) buildable by the
 * esbuild script, (b) safe to inline into the single CSP-restricted document
 * (`script-src 'unsafe-inline'`, no `unsafe-eval`), and (c) still a no-op when
 * the placeholder module is what ships. The build runs on demand so a fresh
 * checkout without `lib/` can still run this spec.
 */
const shellRoot = fileURLToPath(new URL('../', import.meta.url))
const BUNDLE_OUT_FILE = 'lib/product/app-bundle.js'
const PLACEHOLDER_FILE = 'src/product/app-bundle.ts'
const APP_MAIN_FILE = 'src/product/app/main.tsx'
const BUNDLE_PREFIX = 'export const SAGE_APP_BUNDLE = '

/** React 19 production output lands far above the floor; the cap blocks a jumped/dep-dump bundle. */
const MIN_BUNDLE_BYTES = 30_000
const MAX_BUNDLE_BYTES = 450_000

interface BundleBuild {
  readonly status: number | null
  readonly stdout: string
  readonly stderr: string
  readonly error: string
}

function runBundleBuild(): BundleBuild {
  const build = spawnSync(process.execPath, ['scripts/build-renderer.mjs'], {
    cwd: shellRoot,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    encoding: 'utf8',
    timeout: 120_000,
  })
  return {
    status: build.status,
    stdout: build.stdout ?? '',
    stderr: build.stderr ?? '',
    error: build.error === undefined ? '' : String(build.error),
  }
}

let build: BundleBuild

function bundledJs(): string {
  const text = readFileSync(join(shellRoot, BUNDLE_OUT_FILE), 'utf8')
  expect(text.startsWith(BUNDLE_PREFIX)).toBe(true)
  return JSON.parse(text.slice(BUNDLE_PREFIX.length).trim()) as string
}

describe('renderer app bundle guards (ADR-0261 P1)', () => {
  beforeAll(() => {
    build = runBundleBuild()
  })

  it('builds the single-file bundle into lib/product/app-bundle.js through the esbuild script', () => {
    expect(build.error, build.stderr).toBe('')
    expect(build.status, build.stderr).toBe(0)
    expect(existsSync(join(shellRoot, BUNDLE_OUT_FILE))).toBe(true)
    const js = bundledJs()
    expect(js.length).toBeGreaterThanOrEqual(MIN_BUNDLE_BYTES)
    expect(js.length).toBeLessThanOrEqual(MAX_BUNDLE_BYTES)
  })

  it('keeps the bundle inline- and CSP-safe: no script terminator, no eval, marker preserved', () => {
    const js = bundledJs()
    // An inline <script> must not carry a case-variant terminator or a comment opener.
    expect(js).not.toMatch(/<\/script/iu)
    expect(js).not.toContain('<!--')
    // The document CSP has no 'unsafe-eval'; a bundle that needs eval would silently stop working.
    expect(js).not.toMatch(/\beval\s*\(/u)
    expect(js).not.toMatch(/new Function\s*\(/u)
    // The window probe asserts this flag inside the real Electron window.
    expect(js).toContain('__SAGE_APP_MOUNTED__')
  })

  it('ships the mount seam and keeps bundle-less documents on a single legacy script', () => {
    const doc = renderSageDocument()
    expect(doc).toContain('id="sage-app-root"')
    // The placeholder keeps every existing script-extraction regex valid: without a built
    // bundle the document must not grow a second (empty) script tag.
    expect(doc.match(/<script>/gu)).toHaveLength(1)

    const placeholder = readFileSync(join(shellRoot, PLACEHOLDER_FILE), 'utf8')
    expect(placeholder).toContain("export const SAGE_APP_BUNDLE: string = ''")

    const appMain = readFileSync(join(shellRoot, APP_MAIN_FILE), 'utf8')
    expect(appMain).toContain('sage-app-root')
    expect(appMain).toContain('__SAGE_APP_MOUNTED__')
  })

  it('keeps src/product/app/**/*.tsx inside the product boundary vocabulary (the gate scans only *.ts)', () => {
    const appRoot = join(shellRoot, 'src/product/app')
    const tsxFiles = readdirSync(appRoot, { recursive: true }).filter((entry) => entry.endsWith('.tsx'))
    expect(tsxFiles.length).toBeGreaterThan(0)
    // Mirror of sage-product-boundary's product tokens for the extension that gate cannot see.
    const forbidden = ['@deepseek-ai/', 'ctx.get(', 'localStorage', '__DSH_TRANSPORT__', 'data-sanbao-composer', '../host/']
    for (const entry of tsxFiles) {
      const text = readFileSync(join(appRoot, entry), 'utf8')
      for (const token of forbidden) {
        expect(text, `src/product/app/${entry} crosses the product boundary with ${JSON.stringify(token)}`).not.toContain(token)
      }
    }
  })
})
