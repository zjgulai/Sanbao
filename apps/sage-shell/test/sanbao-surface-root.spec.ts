/**
 * 承载面 root 解析（唯一家 src/main/sanbao-surface-root.ts）的纯函数级验收：
 * 直接候选 → dist → _site 的优先顺序；产物完整性门（index.html＋main.js 缺一不可，
 * provenance 源码目录不得作数）；每个候选都走完仍无完整产物 → null；
 * 候选构造把 env 覆盖放最前、同级快照仓在后，空 env 值不产生空候选。
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

import { candidateSanbaoPrototypeDirs, resolveSanbaoSurfaceRootFrom } from '../src/main/sanbao-surface-root.js'

const fixtures: string[] = []

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'sage-sanbao-root-'))
  fixtures.push(dir)
  return dir
}

function makeComplete(dir: string): string {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>probe</title>')
  writeFileSync(join(dir, 'main.js'), '// bundle')
  return dir
}

afterAll(() => {
  for (const dir of fixtures) rmSync(dir, { recursive: true, force: true })
})

describe('sanbao surface root resolution', () => {
  it('prefers the directly-complete candidate over its dist and _site', () => {
    const root = makeComplete(makeTempDir())
    makeComplete(join(root, 'dist'))
    makeComplete(join(root, '_site'))
    expect(resolveSanbaoSurfaceRootFrom([root])).toEqual({ servedRoot: root, source: 'override' })
  })

  it('falls back to dist, then _site, when the candidate itself is incomplete', () => {
    const distCase = makeTempDir()
    makeComplete(join(distCase, 'dist'))
    expect(resolveSanbaoSurfaceRootFrom([distCase])).toEqual({ servedRoot: join(distCase, 'dist'), source: 'dist' })

    const siteCase = makeTempDir()
    makeComplete(join(siteCase, '_site'))
    expect(resolveSanbaoSurfaceRootFrom([siteCase])).toEqual({ servedRoot: join(siteCase, '_site'), source: '_site' })
  })

  it('treats a provenance directory (index.html without main.js) as not servable', () => {
    const provenance = makeTempDir()
    writeFileSync(join(provenance, 'index.html'), '<!doctype html>')
    expect(resolveSanbaoSurfaceRootFrom([provenance])).toBeNull()
  })

  it('returns null when no candidate carries a complete artifact, and for an empty list', () => {
    const emptyCandidate = makeTempDir()
    expect(resolveSanbaoSurfaceRootFrom([emptyCandidate])).toBeNull()
    expect(resolveSanbaoSurfaceRootFrom([])).toBeNull()
  })

  it('orders candidates as env override first, then sibling snapshot repo layout', () => {
    const candidates = candidateSanbaoPrototypeDirs({ SAGE_SANBAO_SURFACE_ROOT: '/custom/override' })
    expect(candidates[0]).toBe('/custom/override')
    expect(candidates.length).toBeGreaterThanOrEqual(3)
    for (const candidate of candidates.slice(1)) {
      expect(candidate.endsWith(join('repository-snapshot', 'apps', 'sanbao-prototype'))).toBe(true)
    }
  })

  it('skips the override entry when the env var is empty', () => {
    const candidates = candidateSanbaoPrototypeDirs({ SAGE_SANBAO_SURFACE_ROOT: '' })
    expect(candidates.every((candidate) => candidate.length > 0)).toBe(true)
    expect(candidates[0].endsWith(join('repository-snapshot', 'apps', 'sanbao-prototype'))).toBe(true)
  })
})
