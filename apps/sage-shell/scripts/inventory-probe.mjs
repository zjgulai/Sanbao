#!/usr/bin/env node
/** Read-only re-observation probe (ADR-0276/0277): compose the production runtime inventory
 *  against a given Sage root and write the full result as JSON. Zero writes to the root; the
 *  host child is stopped on every path.
 *
 *  Usage: SAGE_ROOT=<isolated-root> node scripts/inventory-probe.mjs <output.json>
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { readFile, readdir, realpath } from 'node:fs/promises'
import { homedir } from 'node:os'

import electronPath from 'electron'

import { ShellHostProcess } from '../lib/main/host-process.js'
import { resolveHostRuntime } from '../lib/main/runtime.js'
import { createHostLiveInventoryProjectionProvider } from '../lib/main/runtime-inventory.js'
import { createRuntimeInventoryProvider } from '../lib/main/runtime-inventory-provider.js'
import { readActiveProfile, resolveSagePaths } from '../lib/profile/paths.js'
import { createBundledCapabilityRegistryProvider } from '../lib/security/capability-registry-provider.js'

const root = process.env.SAGE_ROOT
const outputPath = process.argv[2]
if (root === undefined || root === '' || outputPath === undefined) {
  process.stderr.write('usage: SAGE_ROOT=<isolated-root> node scripts/inventory-probe.mjs <output.json>\n')
  process.exit(2)
}

const paths = resolveSagePaths({ home: homedir(), platform: process.platform, root })
const activeProfile = await readActiveProfile(paths)
if (activeProfile === null) {
  process.stderr.write('no active profile in the given root; run materialize first\n')
  process.exit(1)
}

const runtime = resolveHostRuntime({ execPath: electronPath, paths, activeProfile, env: process.env })
const host = new ShellHostProcess(runtime)
try {
  await host.start()
  const inventory = createRuntimeInventoryProvider({
    paths,
    hostProjection: createHostLiveInventoryProjectionProvider({
      paths,
      host,
      clock: { now: () => new Date().toISOString() },
    }),
    pmapFs: {
      readFileBytes: (path) => readFile(path),
      listDirectory: async (path) => (await readdir(path, { withFileTypes: true })).map((entry) => ({
        name: entry.name,
        isDirectory: entry.isDirectory(),
        isFile: entry.isFile(),
        isSymbolicLink: entry.isSymbolicLink(),
      })),
      realpath: (path) => realpath(path),
    },
    readFileBytes: (path) => readFileSync(path),
    runtimeEffective: { read: () => host.readRuntimeEffective() },
    registry: { read: () => createBundledCapabilityRegistryProvider().read() },
  })
  const result = await inventory.read()
  writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 })
  if (result.kind === 'available') {
    process.stdout.write(`inventory available: descriptor=${result.descriptor.runtimeDescriptorDigest} evidence=${result.evidence.inventoryEvidenceDigest}\n`)
    process.exitCode = 0
  } else {
    process.stdout.write(`inventory unavailable: ${result.code} (${result.reason})\n`)
    process.exitCode = 1
  }
} finally {
  await host.stop()
}
