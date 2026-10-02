import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  collectPmapEvidence,
  type PmapComponentEvidence,
  type PmapFsPorts,
} from '../src/main/runtime-inventory-pmap.js'

const NOW = '2026-10-02T12:00:00Z'
const BASE_BUNDLE = '@deepseek-ai/dsh-base'
const BASE_PATCH_LABEL = `bundle:${BASE_BUNDLE}/cordis.patch.yml`
const PRESET_BUNDLE = '@sage-fixture/preset-bundle'
const PROFILE_PATCH_LABEL = 'profile:cordis.patch.yml'
const OVERLAY_LABEL = 'profile:sage-host/shell.cordis.patch.yml'

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
async function makeProfileRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'sage-pmap-'))
  activeTemps.push(root)
  return root
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(value))
}

async function writeBundle(profileDir: string, name: string, patchFiles: Record<string, string>): Promise<void> {
  const dir = join(profileDir, 'node_modules', ...name.split('/'))
  await writeJson(join(dir, 'package.json'), {
    name,
    version: '0.2.0-rc.2',
    dsh: { bundle: { patch: Object.keys(patchFiles) } },
  })
  for (const [relative, content] of Object.entries(patchFiles)) {
    await mkdir(dirname(join(dir, relative)), { recursive: true })
    await writeFile(join(dir, relative), content)
  }
}

async function writeProfileManifest(profileDir: string, bundles: readonly string[]): Promise<void> {
  await writeJson(join(profileDir, 'package.json'), {
    name: 'sage-fixture-profile',
    version: '0.0.0',
    dsh: { profile: { bundles } },
  })
}

async function writeProfileLayer(profileDir: string, content: string): Promise<void> {
  await writeFile(join(profileDir, 'cordis.patch.yml'), content)
}

async function writeOverlayLayer(profileDir: string, content: string): Promise<void> {
  await mkdir(join(profileDir, 'sage-host'), { recursive: true })
  await writeFile(join(profileDir, 'sage-host', 'shell.cordis.patch.yml'), content)
}

async function writePackage(profileDir: string, name: string, manifest: Record<string, unknown>): Promise<void> {
  await writeJson(join(profileDir, 'node_modules', ...name.split('/'), 'package.json'), manifest)
}

const AGENT_MANIFEST = { name: '@deepseek-ai/dsh-agent', version: '0.2.0-rc.2', exports: { '.': './lib/index.js' } }
const API_KEY_MANIFEST = { name: '@deepseek-ai/dsh-llm-deepseek-api-key', version: '0.2.0-rc.2', exports: { '.': './lib/index.js' } }
const ACCOUNT_MANIFEST = { name: '@deepseek-ai/dsh-llm-deepseek-account', version: '0.2.0-rc.2', exports: { '.': './lib/index.js' } }

/** One `- insert:` file whose single row block is `block` (the canonical bytes, no trailing newline). */
function insertFile(rowLines: readonly string[]): { readonly file: string; readonly block: string } {
  const block = rowLines.join('\n')
  return { file: `- insert:\n${block}\n`, block }
}

function presetRow(id: string, configTail: readonly string[] = ['        plugins: []']): readonly string[] {
  return [
    `    - id: preset-${id}`,
    "      name: '@deepseek-ai/dsh-agent-preset'",
    '      config:',
    `        id: ${id}`,
    ...configTail,
  ]
}

const MODEL_ROW = [
  '    - id: agent-default-model',
  "      name: '@deepseek-ai/dsh-agent-default-model'",
  '      config:',
  '        provider: deepseek-official',
  '        model: deepseek-flash',
] as const

async function makeHealthyProfile(): Promise<{
  readonly profile: string
  readonly presetBlockOne: string
  readonly presetBlockTwo: string
}> {
  const profile = await makeProfileRoot()
  const one = insertFile(presetRow('one'))
  const two = insertFile(presetRow('two'))
  await writeBundle(profile, BASE_BUNDLE, { 'cordis.patch.yml': insertFile(MODEL_ROW).file })
  await writeBundle(profile, PRESET_BUNDLE, {
    'presets/one.patch.yml': one.file,
    'presets/two.patch.yml': two.file,
  })
  await writeProfileManifest(profile, [BASE_BUNDLE, PRESET_BUNDLE])
  await writeOverlayLayer(profile, '[]\n')
  await writePackage(profile, '@deepseek-ai/dsh-llm-deepseek-api-key', API_KEY_MANIFEST)
  await writePackage(profile, '@deepseek-ai/dsh-agent', AGENT_MANIFEST)
  return { profile, presetBlockOne: one.block, presetBlockTwo: two.block }
}

/** A root whose only bundle declares one `agent-default-model` row built from `tailLines`. */
async function makeModelRoot(tailLines: readonly string[]): Promise<string> {
  const profile = await makeProfileRoot()
  const block = insertFile([
    '    - id: agent-default-model',
    "      name: '@deepseek-ai/dsh-agent-default-model'",
    ...tailLines,
  ])
  await writeBundle(profile, BASE_BUNDLE, { 'cordis.patch.yml': block.file })
  await writeProfileManifest(profile, [BASE_BUNDLE])
  await writeOverlayLayer(profile, '[]\n')
  await writePackage(profile, '@deepseek-ai/dsh-agent', AGENT_MANIFEST)
  return profile
}

function byComponent(evidence: readonly PmapComponentEvidence[], component: string): PmapComponentEvidence[] {
  return evidence.filter((row) => row.component === component)
}

function sha256Hex(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex')
}

function urn(namespace: string, canonical: string): string {
  return `urn:sage:${namespace}:sha256:${sha256Hex(canonical)}`
}

afterEach(async () => {
  while (activeTemps.length > 0) {
    const dir = activeTemps.pop()
    if (dir !== undefined) await rm(dir, { recursive: true, force: true })
  }
})

describe('PMAP static-layer producers (WT-02C.2E-PMAP)', () => {
  it('observes layered provider, model, agent and preset evidence in composition order, path-free and frozen', async () => {
    const { profile, presetBlockOne, presetBlockTwo } = await makeHealthyProfile()

    const evidence = await collectPmapEvidence({ profileDir: profile, fs: realPorts(), now: () => NOW })
    expect(evidence.map(row => row.component)).toEqual(['provider', 'model', 'agent', 'preset', 'preset'])

    const provider = evidence[0]
    expect(provider).toMatchObject({
      state: 'observed', identity: 'provider:deepseek-official', version: '0.2.0-rc.2',
      provenance: { source: BASE_PATCH_LABEL, observedAt: NOW },
    })
    expect(provider?.artifactDigest).toBe(urn('pmap-package-artifact', JSON.stringify([
      { path: 'package.json', sha256: sha256Hex(JSON.stringify(API_KEY_MANIFEST)) },
    ])))
    expect(provider?.contractDigest).toBe(urn('pmap-package-contract', JSON.stringify(API_KEY_MANIFEST.exports)))
    expect(provider?.behaviorConfigurationDigest)
      .toBe(urn('pmap-provider-selection', JSON.stringify({ provider: 'deepseek-official', source: BASE_PATCH_LABEL })))

    const model = evidence[1]
    expect(model).toMatchObject({ state: 'observed', identity: 'model:deepseek-official/deepseek-flash' })
    expect(model?.version).toBeUndefined()
    expect(model?.artifactDigest).toBeUndefined()
    expect(model?.behaviorConfigurationDigest)
      .toBe(urn('pmap-model-selection', JSON.stringify({ model: 'deepseek-flash', source: BASE_PATCH_LABEL })))

    const agent = evidence[2]
    expect(agent).toMatchObject({
      state: 'observed', identity: 'agent:@deepseek-ai/dsh-agent@0.2.0-rc.2', version: '0.2.0-rc.2',
      provenance: { source: 'profile:node_modules/@deepseek-ai/dsh-agent/package.json', observedAt: NOW },
    })
    expect(agent?.behaviorConfigurationDigest).toBeUndefined()

    const [presetOne, presetTwo] = evidence.slice(3)
    expect(presetOne).toMatchObject({
      state: 'observed', identity: 'preset:one@system',
      provenance: { source: `bundle:${PRESET_BUNDLE}/presets/one.patch.yml`, observedAt: NOW },
    })
    expect(presetOne?.version).toBeUndefined()
    expect(presetOne?.artifactDigest).toBe(urn('pmap-preset-artifact', JSON.stringify([
      { path: `bundle:${PRESET_BUNDLE}/presets/one.patch.yml#preset-one`, sha256: sha256Hex(presetBlockOne) },
    ])))
    expect(presetOne?.contractDigest).toBe(urn('pmap-preset-contract', Buffer.from(presetBlockOne, 'utf8').toString('base64')))
    expect(presetOne?.behaviorConfigurationDigest).toBe(presetOne?.contractDigest)
    expect(presetTwo?.identity).toBe('preset:two@system')
    expect(presetTwo?.artifactDigest).toBe(urn('pmap-preset-artifact', JSON.stringify([
      { path: `bundle:${PRESET_BUNDLE}/presets/two.patch.yml#preset-two`, sha256: sha256Hex(presetBlockTwo) },
    ])))

    const serialized = JSON.stringify(evidence)
    expect(serialized).not.toContain(profile)
    expect(Object.isFrozen(evidence)).toBe(true)
    expect(Object.isFrozen(evidence[0])).toBe(true)
    expect(Object.isFrozen(evidence[0]?.provenance)).toBe(true)
    for (const row of evidence) expect(row.evidenceDigest).toMatch(/^urn:sage:pmap-evidence:sha256:[0-9a-f]{64}$/u)
  })

  it('freezes the preset block-slice digest formula with a hand-written golden', async () => {
    const profile = await makeProfileRoot()
    const goldenBlock = [
      '    - id: preset-golden',
      "      name: '@deepseek-ai/dsh-agent-preset'",
      '      config:',
      '        id: golden',
      '        order: 9',
      '        plugins:',
      '          - id: persona',
      "            name: '@deepseek-ai/dsh-persona'",
      '          - id: tool-bash',
      "            name: '@deepseek-ai/dsh-tool-bash'",
      "            disabled: !!js process.platform === 'win32'",
    ].join('\n')
    await writeBundle(profile, PRESET_BUNDLE, { 'presets/golden.patch.yml': `- insert:\n${goldenBlock}\n` })
    await writeProfileManifest(profile, [PRESET_BUNDLE])
    await writeOverlayLayer(profile, '[]\n')
    await writePackage(profile, '@deepseek-ai/dsh-agent', AGENT_MANIFEST)

    const evidence = await collectPmapEvidence({ profileDir: profile, fs: realPorts(), now: () => NOW })
    const preset = byComponent(evidence, 'preset')[0]
    expect(preset).toMatchObject({ state: 'observed', identity: 'preset:golden@system' })
    expect(preset?.artifactDigest).toBe(urn('pmap-preset-artifact', JSON.stringify([
      { path: `bundle:${PRESET_BUNDLE}/presets/golden.patch.yml#preset-golden`, sha256: sha256Hex(goldenBlock) },
    ])))
    expect(preset?.contractDigest).toBe(urn('pmap-preset-contract', Buffer.from(goldenBlock, 'utf8').toString('base64')))
    expect(preset?.behaviorConfigurationDigest).toBe(preset?.contractDigest)
    // Full-literal freeze, re-anchored from the real producer (2026-10-02).
    expect(preset?.artifactDigest).toBe(
      'urn:sage:pmap-preset-artifact:sha256:5cdee46f53ae3838b4ee3e96f7893095619abf7a290afb1d211714c748f4e2cb',
    )
    expect(preset?.contractDigest).toBe(
      'urn:sage:pmap-preset-contract:sha256:c6bfd6e6ce9d9858878f3272b646011ed30bf5a951d07e050cdf29588a75612a',
    )
  })

  it('lets later layers override the base model selection and names the winning layer', async () => {
    const { profile } = await makeHealthyProfile()
    await writeProfileLayer(profile, [
      '- id: agent-default-model',
      '  config:',
      '    provider: deepseek-account',
      '    model: deepseek-chat',
      '    reasoningEffort: high',
    ].join('\n') + '\n')
    await writePackage(profile, '@deepseek-ai/dsh-llm-deepseek-account', ACCOUNT_MANIFEST)

    const evidence = await collectPmapEvidence({ profileDir: profile, fs: realPorts(), now: () => NOW })
    const provider = byComponent(evidence, 'provider')[0]
    expect(provider).toMatchObject({
      state: 'observed', identity: 'provider:deepseek-account', version: '0.2.0-rc.2',
      provenance: { source: PROFILE_PATCH_LABEL },
    })
    expect(provider?.behaviorConfigurationDigest)
      .toBe(urn('pmap-provider-selection', JSON.stringify({ provider: 'deepseek-account', source: PROFILE_PATCH_LABEL })))

    const model = byComponent(evidence, 'model')[0]
    expect(model).toMatchObject({ state: 'observed', identity: 'model:deepseek-account/deepseek-chat' })
    expect(model?.behaviorConfigurationDigest).toBe(urn('pmap-model-selection', JSON.stringify({
      model: 'deepseek-chat', reasoningEffort: 'high', source: PROFILE_PATCH_LABEL,
    })))

    expect(byComponent(evidence, 'preset').map(row => row.identity)).toEqual(['preset:one@system', 'preset:two@system'])
  })

  it('treats overlay declarations as user trust and resolves cross-layer id collisions first-observed-first-wins', async () => {
    const profile = await makeProfileRoot()
    const dup = insertFile(presetRow('dup'))
    await writeBundle(profile, BASE_BUNDLE, { 'cordis.patch.yml': insertFile(MODEL_ROW).file })
    await writeBundle(profile, PRESET_BUNDLE, { 'presets/dup.patch.yml': dup.file })
    await writeProfileManifest(profile, [BASE_BUNDLE, PRESET_BUNDLE])
    await writeOverlayLayer(profile, `${insertFile(presetRow('local')).file}${dup.file}`)
    await writePackage(profile, '@deepseek-ai/dsh-llm-deepseek-api-key', API_KEY_MANIFEST)
    await writePackage(profile, '@deepseek-ai/dsh-agent', AGENT_MANIFEST)

    const evidence = await collectPmapEvidence({ profileDir: profile, fs: realPorts(), now: () => NOW })
    const presets = byComponent(evidence, 'preset')
    expect(presets.map(row => row.identity)).toEqual(['preset:dup@system', 'preset:local@user', 'preset:dup@user'])
    expect(presets.map(row => row.state)).toEqual(['observed', 'observed', 'broken'])
    expect(presets[1]).toMatchObject({ provenance: { source: OVERLAY_LABEL } })
    expect(presets[2]).toMatchObject({ reason: 'preset-id-collision', provenance: { source: OVERLAY_LABEL } })
    expect(presets[2]?.artifactDigest).toBeUndefined()
    expect(presets[2]?.contractDigest).toBeUndefined()
  })

  it('marks a preset declaration broken when its id cannot be statically read', async () => {
    const profile = await makeProfileRoot()
    const noConfig = insertFile([
      '    - id: preset-no-config',
      "      name: '@deepseek-ai/dsh-agent-preset'",
    ])
    const jsConfig = insertFile([
      '    - id: preset-js-config',
      "      name: '@deepseek-ai/dsh-agent-preset'",
      "      config: !!js ({ id: 'js-config' })",
    ])
    await writeBundle(profile, BASE_BUNDLE, { 'cordis.patch.yml': insertFile(MODEL_ROW).file })
    await writeBundle(profile, PRESET_BUNDLE, { 'presets/broken.patch.yml': `${noConfig.file}${jsConfig.file}` })
    await writeProfileManifest(profile, [BASE_BUNDLE, PRESET_BUNDLE])
    await writeOverlayLayer(profile, '[]\n')
    await writePackage(profile, '@deepseek-ai/dsh-llm-deepseek-api-key', API_KEY_MANIFEST)
    await writePackage(profile, '@deepseek-ai/dsh-agent', AGENT_MANIFEST)

    const evidence = await collectPmapEvidence({ profileDir: profile, fs: realPorts(), now: () => NOW })
    const presets = byComponent(evidence, 'preset')
    expect(presets).toHaveLength(2)
    expect(presets[0]).toMatchObject({
      state: 'broken', reason: 'preset-row-unparsable',
      provenance: { source: `bundle:${PRESET_BUNDLE}/presets/broken.patch.yml` },
    })
    expect(presets[0]?.identity).toBeUndefined()
    expect(presets[1]).toMatchObject({ state: 'broken', reason: 'preset-row-unparsable' })
  })

  it('marks preset and selection faces broken when a declared layer cannot be resolved', async () => {
    // Variant 1: the Sage overlay layer is absent — composition would fail, so nothing may be claimed.
    const missingOverlay = await makeProfileRoot()
    await writeBundle(missingOverlay, BASE_BUNDLE, { 'cordis.patch.yml': insertFile(MODEL_ROW).file })
    await writeProfileManifest(missingOverlay, [BASE_BUNDLE])
    await writePackage(missingOverlay, '@deepseek-ai/dsh-llm-deepseek-api-key', API_KEY_MANIFEST)
    await writePackage(missingOverlay, '@deepseek-ai/dsh-agent', AGENT_MANIFEST)

    const first = await collectPmapEvidence({ profileDir: missingOverlay, fs: realPorts(), now: () => NOW })
    expect(first.map(row => row.component)).toEqual(['provider', 'model', 'agent', 'preset'])
    for (const component of ['provider', 'model', 'preset'] as const) {
      expect(byComponent(first, component)[0]).toMatchObject({
        state: 'broken', reason: 'patch-layer-unresolved', provenance: { source: OVERLAY_LABEL },
      })
    }
    expect(byComponent(first, 'preset')).toHaveLength(1)
    expect(byComponent(first, 'agent')[0]?.state).toBe('observed')

    // Variant 2: one declared bundle patch file is unreadable — no partial roster may leak from the readable ones.
    const missingPatchFile = await makeProfileRoot()
    const one = insertFile(presetRow('one'))
    const dir = join(missingPatchFile, 'node_modules', ...PRESET_BUNDLE.split('/'))
    await writeJson(join(dir, 'package.json'), {
      name: PRESET_BUNDLE,
      version: '0.2.0-rc.2',
      dsh: { bundle: { patch: ['presets/one.patch.yml', 'presets/missing.patch.yml'] } },
    })
    await mkdir(join(dir, 'presets'), { recursive: true })
    await writeFile(join(dir, 'presets', 'one.patch.yml'), one.file)
    await writeProfileManifest(missingPatchFile, [PRESET_BUNDLE])
    await writeOverlayLayer(missingPatchFile, '[]\n')
    await writePackage(missingPatchFile, '@deepseek-ai/dsh-agent', AGENT_MANIFEST)

    const second = await collectPmapEvidence({ profileDir: missingPatchFile, fs: realPorts(), now: () => NOW })
    const source = `bundle:${PRESET_BUNDLE}/presets/missing.patch.yml`
    expect(byComponent(second, 'preset')).toHaveLength(1)
    expect(byComponent(second, 'preset')[0]).toMatchObject({ state: 'broken', reason: 'patch-layer-unresolved', provenance: { source } })
    expect(byComponent(second, 'provider')[0]).toMatchObject({ state: 'broken', reason: 'patch-layer-unresolved', provenance: { source } })
    expect(byComponent(second, 'model')[0]).toMatchObject({ state: 'broken', reason: 'patch-layer-unresolved', provenance: { source } })
  })

  it('treats a composition with no preset declarations as a legal empty roster', async () => {
    const profile = await makeProfileRoot()
    await writeProfileManifest(profile, [])
    await writeOverlayLayer(profile, '[]\n')
    await writePackage(profile, '@deepseek-ai/dsh-agent', AGENT_MANIFEST)

    const evidence = await collectPmapEvidence({ profileDir: profile, fs: realPorts(), now: () => NOW })
    expect(evidence.map(row => row.component)).toEqual(['provider', 'model', 'agent'])
    expect(byComponent(evidence, 'preset')).toHaveLength(0)
    for (const component of ['provider', 'model'] as const) {
      expect(byComponent(evidence, component)[0]).toMatchObject({
        state: 'broken', reason: 'model-selection-row-missing', provenance: { source: 'profile:package.json' },
      })
    }
    expect(byComponent(evidence, 'agent')[0]?.state).toBe('observed')
  })

  it('reports unresolved provider routes and absent packages as broken while keeping the model row', async () => {
    const unknownRoute = await makeModelRoot([
      '      config:',
      '        provider: unknownroute',
      '        model: some-model',
    ])
    const evidence = await collectPmapEvidence({ profileDir: unknownRoute, fs: realPorts(), now: () => NOW })
    expect(byComponent(evidence, 'provider')[0]).toMatchObject({
      state: 'broken', reason: 'provider-package-unresolved', identity: 'provider:unknownroute',
      provenance: { source: BASE_PATCH_LABEL },
    })
    expect(byComponent(evidence, 'model')[0]).toMatchObject({ state: 'observed', identity: 'model:unknownroute/some-model' })

    const absentPackage = await makeModelRoot([
      '      config:',
      '        provider: deepseek-official',
      '        model: deepseek-flash',
    ])
    const second = await collectPmapEvidence({ profileDir: absentPackage, fs: realPorts(), now: () => NOW })
    expect(byComponent(second, 'provider')[0]).toMatchObject({
      state: 'broken', reason: 'provider-package-unresolved', identity: 'provider:deepseek-official',
    })
    expect(byComponent(second, 'model')[0]).toMatchObject({ state: 'observed', identity: 'model:deepseek-official/deepseek-flash' })
  })

  it('distinguishes an unparsable selection block from a missing required field', async () => {
    const unparsable = await makeModelRoot(["      config: !!js ({ provider: 'x', model: 'y' })"])
    const first = await collectPmapEvidence({ profileDir: unparsable, fs: realPorts(), now: () => NOW })
    for (const component of ['provider', 'model'] as const) {
      expect(byComponent(first, component)[0]).toMatchObject({
        state: 'broken', reason: 'model-selection-unparsable', provenance: { source: BASE_PATCH_LABEL },
      })
    }

    const providerOnly = await makeModelRoot([
      '      config:',
      '        provider: deepseek-official',
    ])
    await writePackage(providerOnly, '@deepseek-ai/dsh-llm-deepseek-api-key', API_KEY_MANIFEST)
    const second = await collectPmapEvidence({ profileDir: providerOnly, fs: realPorts(), now: () => NOW })
    expect(byComponent(second, 'provider')[0]?.state).toBe('observed')
    expect(byComponent(second, 'model')[0]).toMatchObject({
      state: 'broken', reason: 'model-selection-incomplete', provenance: { source: BASE_PATCH_LABEL },
    })
    expect(byComponent(second, 'model')[0]?.identity).toBeUndefined()

    const emptyConfig = await makeModelRoot(['      config: {}'])
    const third = await collectPmapEvidence({ profileDir: emptyConfig, fs: realPorts(), now: () => NOW })
    for (const component of ['provider', 'model'] as const) {
      expect(byComponent(third, component)[0]).toMatchObject({ state: 'broken', reason: 'model-selection-incomplete' })
    }
  })

  it('fails closed when the agent package resolves outside the profile root', async () => {
    const profile = await makeProfileRoot()
    await writeProfileManifest(profile, [])
    await writeOverlayLayer(profile, '[]\n')
    const outsideRoot = await mkdtemp(join(tmpdir(), 'sage-pmap-outside-'))
    activeTemps.push(outsideRoot)
    await writePackage(outsideRoot, '@deepseek-ai/dsh-agent', AGENT_MANIFEST)
    await mkdir(join(profile, 'node_modules', '@deepseek-ai'), { recursive: true })
    await symlink(join(outsideRoot, 'node_modules', '@deepseek-ai', 'dsh-agent'), join(profile, 'node_modules', '@deepseek-ai', 'dsh-agent'))

    const evidence = await collectPmapEvidence({ profileDir: profile, fs: realPorts(), now: () => NOW })
    expect(byComponent(evidence, 'agent')[0]).toMatchObject({ state: 'broken', reason: 'package-tree-escapes-profile' })
  })

  it('never executes !!js expressions and carries only whitelisted selection fields', async () => {
    const profile = await makeProfileRoot()
    const block = insertFile([
      '    - id: agent-default-model',
      "      name: '@deepseek-ai/dsh-agent-default-model'",
      '      config:',
      '        provider: deepseek-official',
      '        model: deepseek-flash',
      '        apiKeyEnv: SAGE_KEY_REF_FIXTURE',
    ])
    const hostile = insertFile(presetRow('hostile', [
      '        plugins:',
      '          - id: tool-bash',
      "            name: '@deepseek-ai/dsh-tool-bash'",
      "            disabled: !!js (() => { throw new Error('pmap-boom') })()",
    ]))
    await writeBundle(profile, BASE_BUNDLE, { 'cordis.patch.yml': block.file })
    await writeBundle(profile, PRESET_BUNDLE, { 'presets/hostile.patch.yml': hostile.file })
    await writeProfileManifest(profile, [BASE_BUNDLE, PRESET_BUNDLE])
    await writeOverlayLayer(profile, '[]\n')
    await writePackage(profile, '@deepseek-ai/dsh-llm-deepseek-api-key', API_KEY_MANIFEST)
    await writePackage(profile, '@deepseek-ai/dsh-agent', AGENT_MANIFEST)

    const first = await collectPmapEvidence({ profileDir: profile, fs: realPorts(), now: () => NOW })
    const second = await collectPmapEvidence({ profileDir: profile, fs: realPorts(), now: () => NOW })
    expect(second).toEqual(first)
    expect(byComponent(first, 'preset')[0]).toMatchObject({ state: 'observed', identity: 'preset:hostile@system' })

    const serialized = JSON.stringify(first)
    expect(serialized).not.toContain('SAGE_KEY_REF_FIXTURE')
    expect(serialized).not.toContain('pmap-boom')
    expect(serialized).not.toContain('!!js')
  })
})
