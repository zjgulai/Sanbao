import { readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  COMPOSED_DIR_NAME,
  COMPOSED_PACKAGES,
  HOST_CONFIG_FILE,
  HOST_DIR_NAME,
  HOST_LIB_FILES,
  PROFILE_LABEL,
  SEED_FILES,
  defaultProfileDir,
  hostEntryPath,
  overlayPath,
  planMaterialize,
} from '../src/profile/layout.js'
import { generationProfileDir, resolveSagePaths } from '../src/profile/paths.js'

const shellRoot = '/repo/apps/sage-shell'
const seedDir = `${shellRoot}/seed`
const paths = resolveSagePaths({ home: '/home/lute', root: '/tmp/sage-layout' })
const profileDir = generationProfileDir(paths, 'layout-fixture')

describe('layout', () => {
  it('uses Sage-owned profile and host names', () => {
    expect(PROFILE_LABEL).toBe('sage-shell')
    expect(HOST_DIR_NAME).toBe('sage-host')
    expect(defaultProfileDir('/home/lute')).toBe(resolveSagePaths({ home: '/home/lute' }).profilesDir)
  })

  it('plans every seed file onto the profile root, in order', () => {
    const plan = planMaterialize({ seedDir, shellRoot, repoRoot: shellRoot, profileDir })
    const seedTargets = plan.entries.filter(entry => entry.from.startsWith(seedDir))
    expect(seedTargets.map(entry => entry.from)).toEqual(SEED_FILES.map(name => join(seedDir, name)))
    expect(seedTargets.map(entry => entry.to)).toEqual(SEED_FILES.map(name => join(profileDir, name)))
    expect([...SEED_FILES]).toEqual(['package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml', 'cordis.yml', 'cordis.patch.yml'])
  })

  it('plans the runtime into the Sage host directory inside a generation', () => {
    const plan = planMaterialize({ seedDir, shellRoot, repoRoot: shellRoot, profileDir })
    const hostTargets = plan.entries.filter(entry => entry.from.startsWith(join(shellRoot, 'lib')))
    expect(hostTargets.map(entry => entry.from)).toEqual(HOST_LIB_FILES.map(name => join(shellRoot, 'lib', name)))
    expect(hostTargets.map(entry => entry.to)).toEqual(HOST_LIB_FILES.map(name => join(profileDir, HOST_DIR_NAME, name)))
  })

  it('plans the overlay next to the host entry and exposes both paths', () => {
    const plan = planMaterialize({ seedDir, shellRoot, repoRoot: shellRoot, profileDir })
    expect(plan.entries).toContainEqual({
      from: join(shellRoot, HOST_CONFIG_FILE),
      to: join(profileDir, HOST_DIR_NAME, 'shell.cordis.patch.yml'),
      kind: 'host-runtime',
    })
    expect(hostEntryPath(profileDir)).toBe(join(profileDir, HOST_DIR_NAME, 'host', 'index.js'))
    expect(overlayPath(profileDir)).toBe(join(profileDir, HOST_DIR_NAME, 'shell.cordis.patch.yml'))
  })

  it('keeps P0-2 free of composed product packages and copies only the self-owned renderer', () => {
    const plan = planMaterialize({ seedDir, shellRoot, repoRoot: shellRoot, profileDir })
    const composed = plan.entries.filter(entry => entry.kind === 'composed-package')
    expect(COMPOSED_PACKAGES).toEqual([])
    expect(composed).toEqual([])
    expect(HOST_LIB_FILES).toEqual(expect.arrayContaining([
      'product/contracts.js',
      'product/renderer.js',
      'profile/paths.js',
    ]))
    expect(HOST_LIB_FILES.join('\n')).not.toMatch(/composer|streams|adapter|product\/state/u)
    expect(COMPOSED_DIR_NAME).toBe('.composed')
  })

  it('registers every built host-scope file from lib output, so materialization cannot drop one', () => {
    const libRoot = join(realShellRoot(), 'lib')
    const builtHostScope = new Set<string>()
    for (const entry of walkJs(libRoot)) builtHostScope.add(entry)
    builtHostScope.add('profile/paths.js')
    builtHostScope.add('protocol.js')
    const registered = new Set(HOST_LIB_FILES)
    expect([...builtHostScope].filter((name) => !registered.has(name))).toEqual([])
    expect([...registered].filter((name) => !builtHostScope.has(name))).toEqual([])
  })
})

function realShellRoot(): string {
  return join(fileURLToPath(new URL('.', import.meta.url)), '..')
}

function walkJs(libRoot: string): string[] {
  const out: string[] = []
  const visit = (dir: string, skipDirs: ReadonlySet<string> = new Set<string>()): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!skipDirs.has(entry.name)) visit(full)
      } else if (entry.name.endsWith('.js')) out.push(relative(libRoot, full))
    }
  }
  // WT-02D.1: the Host no longer carries product routes (`adapter/` retired); host-scope output is host/ + product/.
  visit(join(libRoot, 'host'))
  // ADR-0261 P1: `product/app/**` is the React source tree that the esbuild step bundles into
  // `product/app-bundle.js` (registered in HOST_LIB_FILES); its raw tsc emit still carries bare
  // runtime imports and is intentionally not materialized, so it is not host scope.
  visit(join(libRoot, 'product'), new Set(['app']))
  return out
}
