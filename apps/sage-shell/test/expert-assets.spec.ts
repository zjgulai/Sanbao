import { mkdtempSync, cpSync, readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

import { loadExpertRendererAssets, assertExpertProjectionCurrent } from '../../../scripts/experts/renderer-assets.mjs'

const assetsRoot = fileURLToPath(new URL('../../../assets/experts/', import.meta.url))
const cleanups: string[] = []

afterEach(() => {
  for (const root of cleanups.splice(0)) rmSync(root, { recursive: true, force: true })
})

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'sage-expert-assets-'))
  cleanups.push(root)
  const assets = join(root, 'experts')
  cpSync(assetsRoot, assets, { recursive: true })
  return { root, assets }
}

function mutateCatalog(assets: string, mutate: (catalog: any) => void): void {
  const path = join(assets, 'expert-registry.json')
  const catalog = JSON.parse(readFileSync(path, 'utf8'))
  mutate(catalog)
  writeFileSync(path, JSON.stringify(catalog))
}

describe('EP-1 bundled expert assets', () => {
  it('builds 53 same-origin avatars and a design-only renderer projection from the repository', () => {
    const result = loadExpertRendererAssets(assetsRoot)
    expect(result.registry.counts).toEqual({ managers: 3, agents: 50, total: 53 })
    expect(result.registry.experts).toHaveLength(53)
    expect(result.registry.designStatus).toBe('design_only')
    expect(Object.keys(result.avatarAssets)).toHaveLength(53)
    for (const expert of result.registry.experts) {
      const relativePath = `avatars/${expert.id.toLowerCase()}/light/list-64.webp`
      expect(expert.avatar).toBe(`/assets/experts/${relativePath}`)
      expect(Buffer.from(result.avatarAssets[expert.avatar], 'base64')).toEqual(readFileSync(join(assetsRoot, relativePath)))
      expect(expert).not.toHaveProperty('sourceRefs')
      expect(expert).not.toHaveProperty('soulDigest')
      expect(expert).not.toHaveProperty('productionAuthorized')
    }
  })

  it('rejects a stale generated module without rewriting it', () => {
    const { root, assets } = fixture()
    const output = join(root, 'expert-registry.generated.ts')
    const generated = loadExpertRendererAssets(assets).moduleSource
    writeFileSync(output, generated)
    expect(() => assertExpertProjectionCurrent(assets, output)).not.toThrow()
    writeFileSync(output, generated.replace('天時', '过期目录'))
    const stale = readFileSync(output, 'utf8')
    expect(() => assertExpertProjectionCurrent(assets, output)).toThrow(/stale/)
    expect(readFileSync(output, 'utf8')).toBe(stale)
  })

  it('rejects a missing referenced avatar instead of emitting a broken URL', () => {
    const { assets } = fixture()
    const avatar = join(assets, 'avatars/agt-001/light/list-64.webp')
    renameSync(avatar, `${avatar}.missing`)
    expect(() => loadExpertRendererAssets(assets)).toThrow(/avatar/)
  })

  it.each([
    ['duplicate ID', (catalog: any) => { catalog.experts[1].id = catalog.experts[0].id }],
    ['counter drift', (catalog: any) => { catalog.counts.agents = 49 }],
    ['authority promotion', (catalog: any) => { catalog.experts[0].productionAuthorized = true }],
    ['path traversal', (catalog: any) => { catalog.experts[0].avatar = '../foreign.webp' }],
    ['wrong role avatar', (catalog: any) => { catalog.experts[0].avatar = 'avatars/agt-001/light/list-64.webp' }],
  ])('rejects %s at the catalogue boundary', (_name, mutate) => {
    const { assets } = fixture()
    mutateCatalog(assets, mutate)
    expect(() => loadExpertRendererAssets(assets)).toThrow()
  })
})
