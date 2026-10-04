/**
 * Compile `src/` to `lib/` for the window probes, then run the esbuild bundle
 * step so the materialized profile carries the real single-file React bundle
 * (ADR-0261). The window probes exercise production code, so this must run
 * before every spawn — a failed tsc or a failed bundle build aborts the spec
 * instead of letting a stale `lib/` pass.
 */
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require_ = createRequire(import.meta.url)
const shellRoot = fileURLToPath(new URL('../../', import.meta.url))

function runOrThrow(command: readonly string[], message: string): void {
  const result = spawnSync(process.execPath, [...command], {
    cwd: shellRoot,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    encoding: 'utf8',
    timeout: 120_000,
  })
  if (result.status !== 0) {
    throw new Error(`${message}:\n${result.stdout}\n${result.stderr}`)
  }
}

export function buildProductionLibrary(): void {
  const tscPath = join(dirname(require_.resolve('typescript/package.json')), 'bin', 'tsc')
  runOrThrow([tscPath, '--build', 'tsconfig.json'], 'tsc build failed before the window probe')
  runOrThrow(['scripts/build-renderer.mjs'], 'renderer bundle build failed before the window probe')
}
