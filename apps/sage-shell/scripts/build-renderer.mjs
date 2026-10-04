#!/usr/bin/env node
/**
 * Bundle the Sage React app (src/product/app/main.tsx) into one self-contained
 * script and persist it as lib/product/app-bundle.js, shaped as
 * `export const SAGE_APP_BUNDLE = "<JSON-escaped single-file script>"`.
 *
 * ADR-0261: single-file output only (no code-splitting, no dev server, no Vite),
 * always runs after `tsc` (tsc emits the placeholder module and the matching
 * .d.ts first; this script overwrites only the emitted .js). The inline payload
 * rides the existing strict-CSP document, whose `script-src 'unsafe-inline'`
 * already allows it — SAGE_DOCUMENT_CSP and host/assets.ts stay untouched.
 */
import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { build } from 'esbuild'

const shellRoot = fileURLToPath(new URL('..', import.meta.url))
const entry = join(shellRoot, 'src', 'product', 'app', 'main.tsx')
const outFile = join(shellRoot, 'lib', 'product', 'app-bundle.js')

const result = await build({
  entryPoints: [entry],
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  jsx: 'automatic',
  legalComments: 'none',
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'silent',
})

if (result.outputFiles.length !== 1) {
  throw new Error(`build-renderer expected exactly one output file, got ${result.outputFiles.length}`)
}
const js = result.outputFiles[0].text

// Inline-embedding guards: the payload is placed inside a <script> element of
// the served document, so it must not terminate the element or open a comment.
if (/<\/script/iu.test(js)) throw new Error('build-renderer output contains a </script terminator')
if (js.includes('<!--')) throw new Error('build-renderer output contains an HTML comment opener')

const payload = 'export const SAGE_APP_BUNDLE = ' + JSON.stringify(js) + '\n'
mkdirSync(dirname(outFile), { recursive: true })
// Unique temp name: window specs can run in parallel workers and each invokes this script;
// a shared temp path would race on the rename. Renames are atomic and the payload is identical.
const tmpFile = `${outFile}.${process.pid}.${Date.now().toString(36)}.tmp`
writeFileSync(tmpFile, payload)
renameSync(tmpFile, outFile)
process.stdout.write(`build-renderer: wrote ${outFile} (bundle ${Buffer.byteLength(js)} bytes)\n`)
