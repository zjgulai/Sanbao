#!/usr/bin/env node
/** Build the retained renderer and default desktop as independently guarded, self-contained scripts. */
import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { build } from 'esbuild'

const shellRoot = fileURLToPath(new URL('..', import.meta.url))

async function bundleRenderer(entry, output, exportName) {
  const outFile = join(shellRoot, output)
  const result = await build({
    entryPoints: [join(shellRoot, entry)],
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
  if (/<\/script/iu.test(js)) throw new Error('build-renderer output contains a </script terminator')
  if (js.includes('<!--')) throw new Error('build-renderer output contains an HTML comment opener')

  const payload = `export const ${exportName} = ${JSON.stringify(js)}\n`
  mkdirSync(dirname(outFile), { recursive: true })
  // Parallel window probes build the same output; each needs its own atomic write.
  const tmpFile = `${outFile}.${process.pid}.${Date.now().toString(36)}.tmp`
  writeFileSync(tmpFile, payload)
  renameSync(tmpFile, outFile)
  process.stdout.write(`build-renderer: wrote ${outFile} (bundle ${Buffer.byteLength(js)} bytes)\n`)
}

await bundleRenderer('src/product/app/main.tsx', 'lib/product/app-bundle.js', 'SAGE_APP_BUNDLE')
await bundleRenderer('src/product/app/desktop/main.tsx', 'lib/main/desktop-bundle.js', 'SAGE_DESKTOP_BUNDLE')
