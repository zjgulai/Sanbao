/** Shared tmp-filesystem fixture for the WT-02C.2E.2 provider and consumption specs:
 * one materialized Sage generation (attestation-sealed), the composed boot layers
 * (bundle patches + profile patch + shell overlay; WT-02C.2E-PMAP.1 row/layer model),
 * the trusted clock constants, and sealed C2D registry snapshots. Every byte is
 * deterministic so hand-written digest goldens stay stable across machines. */

import { createHash } from 'node:crypto'
import { appendFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { readFile, readdir, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  PROFILE_MANIFEST_FILE,
  ensureSageDirectories,
  generationProfileDir,
  resolveSagePaths,
  type SagePaths,
} from '../../src/profile/paths.js'
import { overlayPath } from '../../src/profile/layout.js'
import {
  RUNTIME_ARTIFACT_ATTESTATION_FILE,
  createRuntimeArtifactAttestation,
  type RuntimeArtifactAttestationV1,
} from '../../src/profile/runtime-artifact-attestation.js'
import {
  createHostLiveInventoryProjectionProvider,
  type HostLiveInventorySnapshot,
} from '../../src/main/runtime-inventory.js'
import type { PmapFsPorts } from '../../src/main/runtime-inventory-pmap.js'
import { createRuntimeInventoryProvider } from '../../src/main/runtime-inventory-provider.js'
import {
  sealCapabilityRegistrySnapshot,
  type CapabilityRegistryEntryBodyV1,
} from '../../src/security/capability-registry.js'

export const OBSERVED_AT = '2026-10-02T12:00:00.000Z'
export const EXPIRES_AT = '2026-10-02T12:00:30.000Z'
export const ACTIVATED_AT = '2026-10-02T11:59:00.000Z'
export const BOOT_ID = 'sage-host:33333333-3333-4333-8333-333333333333'
export const RUNTIME_GENERATION = 7
export const HARNESS_VERSION = '0.2.0-rc.2'
export const OWNED_PROFILE_DIGEST = `sha256:${'a'.repeat(64)}`

export const BASE_BUNDLE = '@deepseek-ai/dsh-base'
export const WEB_APP_BUNDLE = '@deepseek-ai/dsh-web-app'
export const BASE_PATCH_LABEL = `bundle:${BASE_BUNDLE}/cordis.patch.yml`
export const ZETA_PATCH_LABEL = `bundle:${WEB_APP_BUNDLE}/presets/zeta.patch.yml`
export const PROFILE_PATCH_LABEL = 'profile:cordis.patch.yml'

export const AGENT_MANIFEST = { name: '@deepseek-ai/dsh-agent', version: '0.2.0-rc.2', exports: { '.': './lib/index.js' } }
export const PROVIDER_MANIFEST = { name: '@deepseek-ai/dsh-llm-deepseek-api-key', version: '0.2.0-rc.2', exports: { '.': './lib/index.js' } }
export const PRESETS_MANIFEST = { name: '@deepseek-ai/dsh-agent-preset-registry', version: '0.2.0-rc.2', exports: { '.': './lib/index.js', './invariant': './lib/invariant.js' } }
export const OVERLAY_CONTENT = '# compose overlay\n'

export const MODEL_ROW_BLOCK = [
  '    - id: agent-default-model',
  "      name: '@deepseek-ai/dsh-agent-default-model'",
  '      config:',
  '        provider: deepseek-official',
  '        model: deepseek-chat',
  '        reasoningEffort: high',
].join('\n')

function presetBlock(id: string): string {
  return [
    `    - id: preset-${id}`,
    "      name: '@deepseek-ai/dsh-agent-preset'",
    '      config:',
    `        id: ${id}`,
    '        plugins: []',
  ].join('\n')
}

/** One `- insert:` patch file declaring one preset row; the block is what PMAP digests. */
export function presetInsertFile(id: string): string {
  return `- insert:\n${presetBlock(id)}\n`
}

export const SYSTEM_PRESET_BLOCK = presetBlock('zeta')
export const USER_PRESET_BLOCK = presetBlock('alpha')
export const PROFILE_PATCH_CONTENT = presetInsertFile('alpha')

const created: string[] = []

export function temporary(label: string): string {
  const path = join(tmpdir(), `sage-runtime-inventory-provider-${label}-${String(created.length)}-${String(Date.now())}`)
  created.push(path)
  return path
}

export function cleanupTemporaryRoots(): void {
  while (created.length > 0) rmSync(created.pop() as string, { recursive: true, force: true })
}

export function sha256Hex(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex')
}

export function contentDigest(value: string | Buffer): string {
  return `sha256:${sha256Hex(value)}`
}

export function realPorts(): PmapFsPorts {
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

function writePackage(profileDir: string, name: string, manifest: Record<string, unknown>): void {
  const dir = join(profileDir, 'node_modules', ...name.split('/'))
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest))
}

function writeBundle(profileDir: string, name: string, patchFiles: Record<string, string>): void {
  const dir = join(profileDir, 'node_modules', ...name.split('/'))
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    name,
    version: '0.2.0-rc.2',
    dsh: { bundle: { patch: Object.keys(patchFiles) } },
  }))
  for (const [relative, content] of Object.entries(patchFiles)) {
    mkdirSync(dirname(join(dir, relative)), { recursive: true })
    writeFileSync(join(dir, relative), content)
  }
}

/** Append one patch block to the generation's profile layer (the user trust layer). */
export function appendProfilePatch(profileDir: string, content: string): void {
  appendFileSync(join(profileDir, 'cordis.patch.yml'), content)
}

export interface ComposeFixtureOptions {
  /** Model-row state on the base bundle: full selection, no row, tagged config, or provider only. */
  readonly modelRowMode?: 'full' | 'absent' | 'unparsable' | 'provider-only'
  readonly includeWebAppBundle?: boolean
  readonly includePresetsManifest?: boolean
  readonly includeOverlay?: boolean
}

function basePatchContent(mode: NonNullable<ComposeFixtureOptions['modelRowMode']>): string {
  if (mode === 'absent') return '[]\n'
  if (mode === 'unparsable') {
    return `- insert:\n    - id: agent-default-model\n      name: '@deepseek-ai/dsh-agent-default-model'\n      config: !!js ({ provider: 'deepseek-official', model: 'deepseek-chat' })\n`
  }
  if (mode === 'provider-only') {
    return `- insert:\n    - id: agent-default-model\n      name: '@deepseek-ai/dsh-agent-default-model'\n      config:\n        provider: deepseek-official\n`
  }
  return `- insert:\n${MODEL_ROW_BLOCK}\n`
}

export interface MaterializedGeneration {
  readonly generation: string
  readonly profileDir: string
  readonly manifestSha256: string
  readonly attestationSha256: string
  readonly attestation: RuntimeArtifactAttestationV1
}

export async function materializeGeneration(
  paths: SagePaths,
  generation: string,
  options: ComposeFixtureOptions = {},
): Promise<MaterializedGeneration> {
  const profileDir = generationProfileDir(paths, generation)
  mkdirSync(join(profileDir, 'node_modules', 'fixture'), { recursive: true })
  writeFileSync(join(profileDir, 'package.json'), `${JSON.stringify({
    name: 'fixture',
    version: '1.0.0',
    dsh: { profile: { bundles: [BASE_BUNDLE, WEB_APP_BUNDLE] } },
  })}\n`)
  writeFileSync(join(profileDir, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n')
  writeFileSync(join(profileDir, 'cordis.patch.yml'), PROFILE_PATCH_CONTENT)
  writeFileSync(join(profileDir, 'node_modules', 'fixture', 'index.js'), 'export const fixture = true\n')
  writePackage(profileDir, '@deepseek-ai/dsh-agent', AGENT_MANIFEST)
  writePackage(profileDir, '@deepseek-ai/dsh-llm-deepseek-api-key', PROVIDER_MANIFEST)
  if (options.includePresetsManifest !== false) writePackage(profileDir, '@deepseek-ai/dsh-agent-preset-registry', PRESETS_MANIFEST)
  writeBundle(profileDir, BASE_BUNDLE, { 'cordis.patch.yml': basePatchContent(options.modelRowMode ?? 'full') })
  if (options.includeWebAppBundle !== false) {
    writeBundle(profileDir, WEB_APP_BUNDLE, { 'presets/zeta.patch.yml': presetInsertFile('zeta') })
  }
  if (options.includeOverlay !== false) {
    mkdirSync(join(profileDir, 'sage-host'), { recursive: true })
    writeFileSync(overlayPath(profileDir), OVERLAY_CONTENT)
  }

  const attestation = await createRuntimeArtifactAttestation({ profileDir, generation, ownedProfileDigest: OWNED_PROFILE_DIGEST })
  const attestationSha256 = sha256Hex(readFileSync(join(profileDir, RUNTIME_ARTIFACT_ATTESTATION_FILE)))
  const receipt = `${JSON.stringify({
    schemaVersion: 1,
    generation,
    files: [{ path: RUNTIME_ARTIFACT_ATTESTATION_FILE, sha256: attestationSha256 }],
  }, null, 2)}\n`
  writeFileSync(join(profileDir, PROFILE_MANIFEST_FILE), receipt)
  return { generation, profileDir, manifestSha256: sha256Hex(receipt), attestationSha256, attestation }
}

export function writePointer(paths: SagePaths, generation: string, manifestSha256: string, activatedAt: string): void {
  writeFileSync(paths.activeProfileFile, `${JSON.stringify({
    schemaVersion: 1,
    generation,
    manifestSha256,
    activatedAt,
  }, null, 2)}\n`)
}

export interface ComposeFixture extends MaterializedGeneration {
  readonly paths: SagePaths
  snapshot(): HostLiveInventorySnapshot
}

export async function composeFixture(label: string, options: ComposeFixtureOptions = {}): Promise<ComposeFixture> {
  const paths = resolveSagePaths({ home: temporary(`${label}-home`), root: temporary(`${label}-root`) })
  await ensureSageDirectories(paths)
  const primary = await materializeGeneration(paths, `${label}-generation`, options)
  writePointer(paths, primary.generation, primary.manifestSha256, ACTIVATED_AT)
  return {
    ...primary,
    paths,
    snapshot: () => Object.freeze({
      kind: 'active' as const,
      bootId: BOOT_ID,
      runtimeGeneration: RUNTIME_GENERATION,
      activeGeneration: primary.generation,
      manifestSha256: primary.manifestSha256,
      loaderPhase: 'active' as const,
      hostProtocolVersion: '4' as const,
      harnessVersion: HARNESS_VERSION,
    }),
  }
}

export function sealRegistry(entries: readonly CapabilityRegistryEntryBodyV1[]) {
  const sealed = sealCapabilityRegistrySnapshot({
    schemaVersion: 'sage.capability-registry.v1',
    canonicalizationVersion: 'sage.capability-registry-canonical-json.v1',
    createdAt: '2026-10-01T00:00:00.000Z',
    entries,
  })
  if (sealed.ok === false) throw new Error(`registry fixture must seal (${sealed.code})`)
  return sealed.value
}

export function sealedEmptyRegistry() {
  return sealRegistry([])
}

export function approvedEntry(options: {
  readonly capabilityVersion?: string
  readonly effectiveAt?: string
  readonly expiresAt?: string
} = {}): CapabilityRegistryEntryBodyV1 {
  return {
    schemaVersion: 'sage.capability-registry-entry.v1',
    canonicalizationVersion: 'sage.capability-registry-canonical-json.v1',
    capabilityId: 'capability:sage.demo-echo',
    capabilityVersion: options.capabilityVersion ?? '1.2.3',
    state: 'approved',
    descriptor: {
      descriptorDigest: `urn:sage:external-capability-descriptor:sha256:${'1'.repeat(64)}`,
      artifactSubjectDigest: `urn:sage:external-capability-artifact:sha256:${'2'.repeat(64)}`,
      launchContractDigest: `urn:sage:external-capability-launch:sha256:${'3'.repeat(64)}`,
      toolContractDigest: `urn:sage:external-capability-tool-contract:sha256:${'4'.repeat(64)}`,
      verification: 'verified',
      source: 'c2c5',
      evidenceDigest: `urn:sage:external-capability-evidence:sha256:${'5'.repeat(64)}`,
    },
    operations: [{
      operationId: 'echo.call',
      adapter: { identity: 'adapter:sage.bridge', version: '1.0.0', digest: `sha256:${'6'.repeat(64)}` },
      effectClass: 'external-read',
      dataBoundary: 'network:external',
      inputContractDigest: `sha256:${'7'.repeat(64)}`,
      outputContractDigest: `sha256:${'8'.repeat(64)}`,
      preflight: 'read-only',
      revokeBehavior: 'deny-new-actions',
    }],
    approvals: [{
      decisionId: 'decision:sage.demo-echo',
      ownerId: 'owner:sage.security',
      decidedAt: '2026-10-01T00:00:00.000Z',
      reason: 'approved for the composition test',
    }],
    effectiveAt: options.effectiveAt ?? '2026-10-01T00:00:00.000Z',
    ...(options.expiresAt === undefined ? {} : { expiresAt: options.expiresAt }),
  }
}

export function composeWithPorts(
  fixture: ComposeFixture,
  ports: {
    readonly readFileBytes?: (path: string) => Buffer
    /** null omits the registry port entirely; undefined uses the sealed empty registry. */
    readonly registry?: { read: () => unknown } | null
    readonly snapshot?: HostLiveInventorySnapshot
  } = {},
) {
  const registry = ports.registry === undefined ? { read: () => sealedEmptyRegistry() } : ports.registry
  return createRuntimeInventoryProvider({
    paths: fixture.paths,
    hostProjection: createHostLiveInventoryProjectionProvider({
      paths: fixture.paths,
      host: { readSnapshot: () => ports.snapshot ?? fixture.snapshot() },
      clock: { now: () => OBSERVED_AT },
    }),
    pmapFs: realPorts(),
    readFileBytes: ports.readFileBytes ?? ((path: string) => readFileSync(path)),
    ...(registry === null ? {} : { registry }),
  })
}

export function composeProvider(fixture: ComposeFixture, registryRead: () => unknown) {
  return composeWithPorts(fixture, { registry: { read: registryRead } })
}
