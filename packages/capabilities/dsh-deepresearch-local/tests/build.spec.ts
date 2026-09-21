// @vitest-environment jsdom

import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs'
import { delimiter, dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it, vi } from 'vitest'
import { nodeCommand } from '../../../../scripts/lib/real-node.mjs'
import { expectModalLayers, materializeClient } from './client-artifact.ts'
import type { DeepResearchClientFace } from '../src/client/client-face.ts'

const packageRoot = dirname(import.meta.dirname)

it('builds a fresh loader client and host entries without deleting Typert artifacts', async () => {
  const tempRoot = join(packageRoot, '.tmp')
  mkdirSync(tempRoot, { recursive: true })
  const fixture = mkdtempSync(join(tempRoot, 'client-build-'))
  try {
    for (const name of readdirSync(packageRoot)) {
      if (name === 'src' || name === 'lib' || name === 'build' || name === 'package.json'
        || name === 'tsdown.config.ts' || /^tsconfig.*\.json$/.test(name)) {
        cpSync(join(packageRoot, name), join(fixture, name), { recursive: true })
      }
    }
    symlinkSync(join(packageRoot, 'node_modules'), join(fixture, 'node_modules'), 'dir')
    const retained = readdirSync(join(fixture, 'lib'))
      .filter(name => name.startsWith('typert.'))
      .map(name => [name, readFileSync(join(fixture, 'lib', name))] as const)
    expect(retained.length).toBeGreaterThan(0)
    for (const name of ['client.js', 'client.js.map', 'index.js', 'invariant.js', 'tsconfig.host.tsbuildinfo', 'tsconfig.client.tsbuildinfo']) {
      rmSync(join(fixture, 'lib', name), { force: true })
    }
    const manifest = JSON.parse(readFileSync(join(fixture, 'package.json'), 'utf8'))
    // Run the shipping script, not an equivalent test-only bundler config.
    const build = spawnSync(manifest.scripts.build, {
      cwd: fixture,
      shell: true,
      encoding: 'utf8',
      timeout: 120_000,
      env: { ...process.env, PATH: `${join(packageRoot, 'node_modules/.bin')}${delimiter}${process.env.PATH ?? ''}` },
    })
    expect(build.status, `${build.error ?? ''}\n${build.stdout}\n${build.stderr}`).toBe(0)
    expect(existsSync(join(fixture, 'lib/client.js')), 'build must emit lib/client.js from source').toBe(true)

    const { client, styles, location } = materializeClient(readFileSync(join(fixture, 'lib/client.js'), 'utf8'))
    const entries: Record<string, unknown>[] = []
    const providers = new Map<string, { open(): void }>()
    const disposeRemote = vi.fn(async () => undefined)
    const disposeView = vi.fn(async () => undefined)
    const scope = {
      remote: { deepResearch: {} },
      slots: {
        inject: (name: string, callback: () => unknown) => { expect(name).toBe('shell.overlay'); return callback() },
        register: (entry: Record<string, unknown>, component: unknown) => {
          expect(component).toBeTypeOf('function')
          entries.push(entry)
          return () => undefined
        },
      },
    }
    type Context = Parameters<typeof client.apply>[0]
    // Remote methods are not called by apply; only namespace mounting and slot/provider registration are exercised.
    const ctx = {
      remote: { $mount: vi.fn(async () => disposeRemote) },
      locale: { register: vi.fn(() => () => undefined) },
      effect: (callback: () => unknown) => callback(),
      provide: (name: string, value: { open(): void }) => providers.set(name, value),
      inject: (services: readonly string[], callback: (scoped: typeof scope) => unknown) => {
        expect(services).toEqual(['remote.deepResearch', 'slots'])
        callback(scope)
        return { dispose: disposeView }
      },
    }
    expect(client.inject).toEqual(['remote', 'slots', 'locale'])
    const dispose = await client.apply(ctx as unknown as Context)
    expect(ctx.remote.$mount).toHaveBeenCalledOnce()
    expect(entries.map(({ name, id }) => ({ name, id }))).toEqual([{ name: 'shell.overlay', id: 'deepresearch' }])
    const { store } = (entries[0]!.inject as () => DeepResearchClientFace)()
    expect(store.getOpen()).toBe(false)
    expect(providers.has('deepresearch-workbench')).toBe(true)
    providers.get('deepresearch-workbench')!.open()
    expect(store.getOpen()).toBe(true)
    expect(location.hash).toBe('#deepresearch')
    store.setOpen(false)
    providers.get('deepresearch-workbench')!.open()
    expect(store.getOpen()).toBe(true)
    await dispose()
    expect(disposeView).toHaveBeenCalledOnce()
    expect(disposeRemote).toHaveBeenCalledOnce()

    const map = JSON.parse(readFileSync(join(fixture, 'lib/client.js.map'), 'utf8'))
    for (const name of ['index.ts', 'ResearchComposer.tsx', 'ResearchWorkspace.tsx', 'research-view-model.ts', 'use-research-library.ts', 'use-research-workspace.ts']) {
      const index = map.sources.findIndex((source: string) => source.endsWith(`/src/client/${name}`))
      expect(index, `${name} must be part of the emitted source map`).toBeGreaterThanOrEqual(0)
      expect(map.sourcesContent[index]).toBe(readFileSync(join(fixture, 'src/client', name), 'utf8'))
    }
    for (const [name, bytes] of retained) {
      expect(readFileSync(join(fixture, 'lib', name)), `${name} must survive the build`).toEqual(bytes)
    }
    for (const [key, entry] of Object.entries(manifest.exports)) {
      if (typeof entry !== 'object' || entry === null) continue
      const { types, default: runtime } = entry as { types: string; default: string }
      expect(existsSync(join(fixture, types)), `${key} declarations must remain available`).toBe(true)
      if (key === './client') continue
      const { command, env } = nodeCommand()
      const marker = `DEEPRESEARCH-IMPORT-OK:${key}`
      const imported = spawnSync(command, ['--input-type=module', '-e', `await import(${JSON.stringify(pathToFileURL(join(fixture, runtime)).href)}); console.log(${JSON.stringify(marker)})`], {
        cwd: fixture, encoding: 'utf8', timeout: 30_000, env,
      })
      expect(imported.status, `${key}: ${imported.error ?? ''}\n${imported.stderr}`).toBe(0)
      expect(imported.stdout.trim()).toBe(marker)
    }
    expectModalLayers(styles)
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
}, 180_000)
