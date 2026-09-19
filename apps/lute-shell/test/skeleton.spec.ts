import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const shellRoot = join(import.meta.dirname, '..')
const manifest = JSON.parse(readFileSync(join(shellRoot, 'package.json'), 'utf8')) as {
  type: string
  main: string
  scripts: Record<string, string>
  devDependencies: Record<string, string>
}

describe('shell package skeleton', () => {
  it('is an ESM package whose Electron entry is the built main process', () => {
    expect(manifest.type).toBe('module')
    expect(manifest.main).toBe('lib/main/index.js')
  })

  it('exposes the six lifecycle scripts in the repo order', () => {
    expect(Object.keys(manifest.scripts)).toEqual([
      'typecheck', 'build', 'test', 'materialize', 'smoke', 'dev',
    ])
  })

  it('pins every harness package to an exact version', () => {
    const harness = Object.entries(manifest.devDependencies)
      .filter(([name]) => name.startsWith('@deepseek-ai/'))
    expect(harness.length).toBeGreaterThan(0)
    for (const [name, spec] of harness) {
      expect(spec, `${name} must be an exact version`).toMatch(/^\d+\.\d+\.\d+(-[\w.]+)?$/u)
    }
  })
})
