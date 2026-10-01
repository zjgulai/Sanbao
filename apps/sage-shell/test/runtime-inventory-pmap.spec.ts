import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  collectPmapEvidence,
  type PmapComponentEvidence,
  type PmapFsPorts,
} from '../src/main/runtime-inventory-pmap.js'

const NOW = '2026-10-02T12:00:00Z'

function realPorts(): PmapFsPorts {
  return {
    readFileBytes: (absolutePath) => readFile(absolutePath),
    listDirectory: async (absolutePath) => (await readdir(absolutePath, { withFileTypes: true })).map((entry) => ({
      name: entry.name,
      isDirectory: entry.isDirectory(),
      isFile: entry.isFile(),
      isSymbolicLink: entry.isSymbolicLink(),
    })),
    realpath: (absolutePath) => realpath(absolutePath),
  }
}

const activeTemps: string[] = []
async function makeRoot(): Promise<{ harness: string; profile: string }> {
  const root = await mkdtemp(join(tmpdir(), 'sage-pmap-'))
  activeTemps.push(root)
  const harness = join(root, 'harness')
  const profile = join(root, 'profile')
  await mkdir(harness, { recursive: true })
  await mkdir(profile, { recursive: true })
  return { harness, profile }
}

async function writePreset(profileDir: string, id: string, composition: string, metadata?: string): Promise<void> {
  const dir = join(profileDir, 'node_modules', '@deepseek-ai', 'dsh-agent-presets', 'presets', id)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'agent.cordis.yml'), composition)
  if (metadata !== undefined) await writeFile(join(dir, 'preset.yml'), metadata)
}

async function writeUserPreset(harnessHome: string, id: string, composition: string): Promise<void> {
  const dir = join(harnessHome, '.agent-presets', id)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'agent.cordis.yml'), composition)
}

async function writePackage(profileDir: string, name: string, manifest: Record<string, unknown>): Promise<void> {
  const dir = join(profileDir, 'node_modules', ...name.split('/'))
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'package.json'), JSON.stringify(manifest))
}

const AGENT_MANIFEST = { name: '@deepseek-ai/dsh-agent', version: '0.1.5-rc.2', exports: { '.': './lib/index.js' } }
const PROVIDER_MANIFEST = { name: '@deepseek-ai/dsh-llm-deepseek', version: '0.1.5-rc.2', exports: { '.': './lib/index.js' } }

function byComponent(evidence: readonly PmapComponentEvidence[], component: string): PmapComponentEvidence[] {
  return evidence.filter((row) => row.component === component)
}

function findRow(evidence: readonly PmapComponentEvidence[], identity: string): PmapComponentEvidence | undefined {
  return evidence.find((row) => row.identity === identity)
}

function sha256Hex(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex')
}

afterEach(async () => {
  while (activeTemps.length > 0) {
    const dir = activeTemps.pop()
    if (dir !== undefined) await rm(dir, { recursive: true, force: true })
  }
})

describe('PMAP static-layer producers (WT-02C.2E-PMAP)', () => {
  it('observes provider, model, agent and preset rows in stable order with path-free evidence', async () => {
    const { harness, profile } = await makeRoot()
    await writePreset(profile, 'cordis', '# cordis preset\n', 'name: Cordis\n')
    await writePreset(profile, 'minimal', '# minimal preset\n')
    await writeUserPreset(harness, 'my-flow', '# user preset\n')
    await writePackage(profile, '@deepseek-ai/dsh-agent', AGENT_MANIFEST)
    await writePackage(profile, '@deepseek-ai/dsh-llm-deepseek', PROVIDER_MANIFEST)
    await writeFile(join(harness, 'settings.json'), JSON.stringify({
      'agent-default-model': { provider: 'deepseek', model: 'deepseek-chat', reasoningEffort: 'high' },
    }))

    const evidence = await collectPmapEvidence({ harnessHome: harness, profileDir: profile, fs: realPorts(), now: () => NOW })

    expect(evidence.map((row) => row.component)).toEqual(['provider', 'model', 'agent', 'preset', 'preset', 'preset'])

    const provider = byComponent(evidence, 'provider')[0]!
    expect(provider).toMatchObject({
      state: 'observed',
      observationScope: 'materialized-static',
      identity: 'provider:deepseek',
      version: '0.1.5-rc.2',
      provenance: { source: 'harness:settings.json', observedAt: NOW },
    })
    expect(provider.artifactDigest).toMatch(/^urn:sage:pmap-package-artifact:sha256:[0-9a-f]{64}$/u)
    expect(provider.contractDigest).toMatch(/^urn:sage:pmap-package-contract:sha256:[0-9a-f]{64}$/u)
    expect(provider.behaviorConfigurationDigest).toBe(
      `urn:sage:pmap-provider-selection:sha256:${sha256Hex(JSON.stringify({ provider: 'deepseek', source: 'harness:settings.json' }))}`,
    )

    const model = byComponent(evidence, 'model')[0]!
    expect(model).toMatchObject({ state: 'observed', identity: 'model:deepseek/deepseek-chat' })
    expect(model.version).toBeUndefined()
    expect(model.artifactDigest).toBeUndefined()
    expect(model.behaviorConfigurationDigest).toBe(
      `urn:sage:pmap-model-selection:sha256:${sha256Hex(JSON.stringify({ model: 'deepseek-chat', reasoningEffort: 'high', source: 'harness:settings.json' }))}`,
    )

    const agent = byComponent(evidence, 'agent')[0]!
    expect(agent).toMatchObject({ state: 'observed', identity: 'agent:@deepseek-ai/dsh-agent@0.1.5-rc.2', version: '0.1.5-rc.2' })
    expect(agent.behaviorConfigurationDigest).toBeUndefined()

    const cordis = findRow(evidence, 'preset:cordis@system')!
    expect(cordis.state).toBe('observed')
    expect(cordis.artifactDigest).toBe(`urn:sage:pmap-preset-artifact:sha256:${sha256Hex(JSON.stringify([
      { path: 'agent.cordis.yml', sha256: sha256Hex('# cordis preset\n') },
      { path: 'preset.yml', sha256: sha256Hex('name: Cordis\n') },
    ]))}`)
    expect(cordis.contractDigest).toBe(`urn:sage:pmap-preset-contract:sha256:${sha256Hex(Buffer.from('# cordis preset\n').toString('base64'))}`)
    expect(cordis.behaviorConfigurationDigest).toBe(cordis.contractDigest)

    const minimal = findRow(evidence, 'preset:minimal@system')!
    expect(minimal.artifactDigest).toBe(`urn:sage:pmap-preset-artifact:sha256:${sha256Hex(JSON.stringify([
      { path: 'agent.cordis.yml', sha256: sha256Hex('# minimal preset\n') },
    ]))}`)

    const user = findRow(evidence, 'preset:my-flow@user')!
    expect(user.provenance.source).toBe('harness:.agent-presets/my-flow')

    // Evidence must be path-free and frozen.
    const serialized = JSON.stringify(evidence)
    expect(serialized).not.toContain(harness)
    expect(serialized).not.toContain(profile)
    expect(Object.isFrozen(evidence)).toBe(true)
    expect(Object.isFrozen(evidence[0])).toBe(true)
    expect(Object.isFrozen(evidence[0]!.provenance)).toBe(true)
    expect(evidence[0]!.evidenceDigest).toMatch(/^urn:sage:pmap-evidence:sha256:[0-9a-f]{64}$/u)
  })

  it('freezes the preset contract digest formula with a hand-written golden', async () => {
    const { harness, profile } = await makeRoot()
    await writePreset(profile, 'golden', '# golden\n')
    await writePackage(profile, '@deepseek-ai/dsh-agent', AGENT_MANIFEST)

    const evidence = await collectPmapEvidence({ harnessHome: harness, profileDir: profile, fs: realPorts(), now: () => NOW })
    expect(findRow(evidence, 'preset:golden@system')?.contractDigest).toBe(
      'urn:sage:pmap-preset-contract:sha256:7888f9e1c7cafc73805710ef33cacd895058bcc0e30d2a98bf52934a31032a0e',
    )
  })

  it('resolves duplicate preset ids first-root-wins with shipped presets taking precedence', async () => {
    const { harness, profile } = await makeRoot()
    await writePreset(profile, 'dup', '# shipped dup\n')
    await writeUserPreset(harness, 'dup', '# user dup\n')
    await writePackage(profile, '@deepseek-ai/dsh-agent', AGENT_MANIFEST)

    const evidence = await collectPmapEvidence({ harnessHome: harness, profileDir: profile, fs: realPorts(), now: () => NOW })
    const rows = byComponent(evidence, 'preset')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ identity: 'preset:dup@system', provenance: { source: 'profile:node_modules/@deepseek-ai/dsh-agent-presets/presets/dup' } })
  })

  it('reports a broken preset row when its composition is missing, and a missing user root leaves no rows', async () => {
    const { harness, profile } = await makeRoot()
    await mkdir(join(profile, 'node_modules', '@deepseek-ai', 'dsh-agent-presets', 'presets', 'broken-one'), { recursive: true })
    await writePackage(profile, '@deepseek-ai/dsh-agent', AGENT_MANIFEST)

    const evidence = await collectPmapEvidence({ harnessHome: harness, profileDir: profile, fs: realPorts(), now: () => NOW })
    const rows = byComponent(evidence, 'preset')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ state: 'broken', identity: 'preset:broken-one@system', reason: 'preset-composition-unreadable' })
  })

  it('reports a broken surface when the shipped preset root is missing', async () => {
    const { harness, profile } = await makeRoot()
    await writePackage(profile, '@deepseek-ai/dsh-agent', AGENT_MANIFEST)

    const evidence = await collectPmapEvidence({ harnessHome: harness, profileDir: profile, fs: realPorts(), now: () => NOW })
    const rows = byComponent(evidence, 'preset')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ state: 'broken', reason: 'shipped-preset-root-missing' })
  })

  it('distinguishes absent settings, unparsed YAML, broken JSON and absent namespaces', async () => {
    const cases: ReadonlyArray<{ readonly setup?: string; readonly expected: string }> = [
      { expected: 'settings-document-absent' },
      { setup: 'yaml', expected: 'settings-not-statically-parsed' },
      { setup: 'broken-json', expected: 'settings-document-unreadable' },
      { setup: 'other-namespace', expected: 'settings-namespace-absent' },
    ]
    for (const testCase of cases) {
      const { harness, profile } = await makeRoot()
      await writePackage(profile, '@deepseek-ai/dsh-agent', AGENT_MANIFEST)
      if (testCase.setup === 'yaml') await writeFile(join(harness, 'settings.yaml'), 'agent-default-model:\n  provider: deepseek\n  model: deepseek-chat\n')
      if (testCase.setup === 'broken-json') await writeFile(join(harness, 'settings.json'), '{ not json')
      if (testCase.setup === 'other-namespace') await writeFile(join(harness, 'settings.json'), JSON.stringify({ 'some-other': { token: 'secret-value' } }))

      const evidence = await collectPmapEvidence({ harnessHome: harness, profileDir: profile, fs: realPorts(), now: () => NOW })
      const provider = byComponent(evidence, 'provider')[0]!
      const model = byComponent(evidence, 'model')[0]!
      const expectedState = testCase.expected === 'settings-document-unreadable' ? 'broken' : 'absent'
      expect(provider).toMatchObject({ state: expectedState, reason: testCase.expected })
      expect(model).toMatchObject({ state: expectedState, reason: testCase.expected })
      expect(JSON.stringify(evidence)).not.toContain('secret-value')
    }
  })

  it('keeps a model row when only the provider field is unusable, and reports unresolved provider packages as broken', async () => {
    const { harness, profile } = await makeRoot()
    await writePackage(profile, '@deepseek-ai/dsh-agent', AGENT_MANIFEST)
    await writeFile(join(harness, 'settings.json'), JSON.stringify({
      'agent-default-model': { provider: 'unknownroute', model: 'some-model' },
    }))

    const evidence = await collectPmapEvidence({ harnessHome: harness, profileDir: profile, fs: realPorts(), now: () => NOW })
    expect(byComponent(evidence, 'provider')[0]).toMatchObject({ state: 'broken', reason: 'provider-package-unresolved', identity: 'provider:unknownroute' })
    expect(byComponent(evidence, 'model')[0]).toMatchObject({ state: 'observed', identity: 'model:unknownroute/some-model' })

    const second = await makeRoot()
    await writePackage(second.profile, '@deepseek-ai/dsh-agent', AGENT_MANIFEST)
    await writeFile(join(second.harness, 'settings.json'), JSON.stringify({
      'agent-default-model': { model: 'only-model' },
    }))
    const secondEvidence = await collectPmapEvidence({ harnessHome: second.harness, profileDir: second.profile, fs: realPorts(), now: () => NOW })
    expect(byComponent(secondEvidence, 'provider')[0]).toMatchObject({ state: 'absent', reason: 'settings-field-absent' })
    expect(byComponent(secondEvidence, 'model')[0]).toMatchObject({ state: 'observed' })
  })

  it('fails closed when the agent package resolves outside the profile root', async () => {
    const { harness, profile } = await makeRoot()
    const outsideRoot = await mkdtemp(join(tmpdir(), 'sage-pmap-outside-'))
    activeTemps.push(outsideRoot)
    await writePackage(outsideRoot, '@deepseek-ai/dsh-agent', AGENT_MANIFEST)
    await mkdir(join(profile, 'node_modules', '@deepseek-ai'), { recursive: true })
    await symlink(join(outsideRoot, 'node_modules', '@deepseek-ai', 'dsh-agent'), join(profile, 'node_modules', '@deepseek-ai', 'dsh-agent'))

    const evidence = await collectPmapEvidence({ harnessHome: harness, profileDir: profile, fs: realPorts(), now: () => NOW })
    expect(byComponent(evidence, 'agent')[0]).toMatchObject({ state: 'broken', reason: 'package-tree-escapes-profile' })
  })

  it('is deterministic and carries only the whitelisted settings fields', async () => {
    const { harness, profile } = await makeRoot()
    await writePreset(profile, 'cordis', '# cordis\n')
    await writePackage(profile, '@deepseek-ai/dsh-agent', AGENT_MANIFEST)
    await writePackage(profile, '@deepseek-ai/dsh-llm-deepseek', PROVIDER_MANIFEST)
    await writeFile(join(harness, 'settings.json'), JSON.stringify({
      'agent-default-model': { provider: 'deepseek', model: 'deepseek-chat', apiKeyEnv: 'SAGE_KEY_REF', extra: 'not-whitelisted' },
      'unrelated-namespace': { token: 'never-echoed' },
    }))

    const first = await collectPmapEvidence({ harnessHome: harness, profileDir: profile, fs: realPorts(), now: () => NOW })
    const second = await collectPmapEvidence({ harnessHome: harness, profileDir: profile, fs: realPorts(), now: () => NOW })
    expect(second).toEqual(first)
    const serialized = JSON.stringify(first)
    expect(serialized).not.toContain('never-echoed')
    expect(serialized).not.toContain('not-whitelisted')
    expect(serialized).not.toContain('SAGE_KEY_REF')
  })
})
