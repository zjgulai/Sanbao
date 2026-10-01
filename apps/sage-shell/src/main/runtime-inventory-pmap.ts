/** WT-02C.2E-PMAP: main-owned static-layer producers for Provider / Model / Agent / Preset
 * runtime-inventory evidence. Read-only by contract; observation scope is materialized-static —
 * runtime-effective configuration (env layering, live mount enablement, default-preset
 * selection) belongs to the Host-protocol ticket and is never guessed here. */
import { createHash } from 'node:crypto'

export const PMAP_EVIDENCE_SCHEMA = 'sage.pmap-component-evidence.v1' as const
export const PMAP_OBSERVATION_SCOPE = 'materialized-static' as const

export type PmapComponent = 'provider' | 'model' | 'agent' | 'preset'
export type PmapEvidenceState = 'observed' | 'absent' | 'broken'

export interface PmapComponentEvidence {
  readonly schemaVersion: typeof PMAP_EVIDENCE_SCHEMA
  readonly component: PmapComponent
  readonly observationScope: typeof PMAP_OBSERVATION_SCOPE
  readonly state: PmapEvidenceState
  readonly identity?: string
  readonly version?: string
  readonly artifactDigest?: string
  readonly contractDigest?: string
  readonly behaviorConfigurationDigest?: string
  readonly provenance: { readonly source: string; readonly observedAt: string }
  readonly reason?: string
  readonly evidenceDigest: string
}

export interface PmapDirEntry {
  readonly name: string
  readonly isDirectory: boolean
  readonly isFile: boolean
  readonly isSymbolicLink: boolean
}

/** Injected I/O surface: every read goes through these ports; the module owns no fs import. */
export interface PmapFsPorts {
  readonly readFileBytes: (absolutePath: string) => Promise<Buffer>
  readonly listDirectory: (absolutePath: string) => Promise<readonly PmapDirEntry[]>
  readonly realpath: (absolutePath: string) => Promise<string>
}

export interface PmapObservationOptions {
  /** Sage harness home (the dsh home of this isolated root). */
  readonly harnessHome: string
  /** Active materialized profile (generation) directory. */
  readonly profileDir: string
  readonly fs: PmapFsPorts
  readonly now: () => string
}

const SHIPPED_PRESETS_RELATIVE = 'node_modules/@deepseek-ai/dsh-agent-presets/presets'
const AGENT_PACKAGE_JSON_RELATIVE = 'node_modules/@deepseek-ai/dsh-agent/package.json'
const COMPOSITION_FILE = 'agent.cordis.yml'
const PRESET_METADATA_FILE = 'preset.yml'
const SETTINGS_FILENAMES = ['settings.yaml', 'settings.yml', 'settings.json'] as const
const DEFAULT_MODEL_NAMESPACE = 'agent-default-model'

const REASON = {
  shippedRootMissing: 'shipped-preset-root-missing',
  compositionUnreadable: 'preset-composition-unreadable',
  settingsAbsent: 'settings-document-absent',
  settingsUnreadable: 'settings-document-unreadable',
  settingsNotParsed: 'settings-not-statically-parsed',
  namespaceAbsent: 'settings-namespace-absent',
  fieldAbsent: 'settings-field-absent',
  providerPackageUnresolved: 'provider-package-unresolved',
  packageUnreadable: 'package-manifest-unreadable',
  packageEscapesProfile: 'package-tree-escapes-profile',
} as const

function sha256Hex(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function urn(namespace: string, canonical: string): string {
  return `urn:sage:${namespace}:sha256:${sha256Hex(Buffer.from(canonical, 'utf8'))}`
}

function freezeDeep<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value
  for (const key of Reflect.ownKeys(value)) freezeDeep(Reflect.get(value, key))
  return Object.freeze(value)
}

function buildEvidence(input: {
  readonly component: PmapComponent
  readonly state: PmapEvidenceState
  readonly source: string
  readonly observedAt: string
  readonly identity?: string
  readonly version?: string
  readonly artifactDigest?: string
  readonly contractDigest?: string
  readonly behaviorConfigurationDigest?: string
  readonly reason?: string
}): PmapComponentEvidence {
  // Key order is the canonical form; evidenceDigest covers everything but itself.
  const body = {
    schemaVersion: PMAP_EVIDENCE_SCHEMA,
    component: input.component,
    observationScope: PMAP_OBSERVATION_SCOPE,
    state: input.state,
    ...(input.identity === undefined ? {} : { identity: input.identity }),
    ...(input.version === undefined ? {} : { version: input.version }),
    ...(input.artifactDigest === undefined ? {} : { artifactDigest: input.artifactDigest }),
    ...(input.contractDigest === undefined ? {} : { contractDigest: input.contractDigest }),
    ...(input.behaviorConfigurationDigest === undefined ? {} : { behaviorConfigurationDigest: input.behaviorConfigurationDigest }),
    provenance: { source: input.source, observedAt: input.observedAt },
    ...(input.reason === undefined ? {} : { reason: input.reason }),
  }
  const evidenceDigest = urn('pmap-evidence', JSON.stringify(body))
  return freezeDeep({ ...body, evidenceDigest })
}

async function readBytesOrUndefined(fs: PmapFsPorts, absolutePath: string): Promise<Buffer | undefined> {
  try {
    return await fs.readFileBytes(absolutePath)
  } catch {
    return undefined
  }
}

async function listOrUndefined(fs: PmapFsPorts, absolutePath: string): Promise<readonly PmapDirEntry[] | undefined> {
  try {
    return await fs.listDirectory(absolutePath)
  } catch {
    return undefined
  }
}

/** Digest the regular files of one package tree by logical path (symlinks are not expanded —
 * install-time topology is C2A's job). Returns undefined when the tree escapes the profile root. */
async function digestPackageTree(fs: PmapFsPorts, profileRealRoot: string, packageDir: string): Promise<string | undefined> {
  const realPackageRoot = await fs.realpath(packageDir)
  if (realPackageRoot !== profileRealRoot && !realPackageRoot.startsWith(`${profileRealRoot}/`)) {
    return undefined
  }
  const files: Array<readonly [string, string]> = []
  const visit = async (dir: string, prefix: string): Promise<boolean> => {
    const entries = await listOrUndefined(fs, dir)
    if (entries === undefined) return false
    for (const entry of [...entries].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`
      if (entry.isDirectory) {
        if (!(await visit(`${dir}/${entry.name}`, relative))) return false
      } else if (entry.isFile) {
        const bytes = await readBytesOrUndefined(fs, `${dir}/${entry.name}`)
        if (bytes === undefined) return false
        files.push([relative, sha256Hex(bytes)])
      }
    }
    return true
  }
  if (!(await visit(packageDir, ''))) return undefined
  const canonical = JSON.stringify(files.map(([path, digest]) => ({ path, sha256: digest })))
  return urn('pmap-package-artifact', canonical)
}

async function readPackageManifest(fs: PmapFsPorts, packageJsonPath: string): Promise<{ name: string; version: string; exportsCanonical: string } | undefined> {
  const bytes = await readBytesOrUndefined(fs, packageJsonPath)
  if (bytes === undefined) return undefined
  try {
    const parsed = JSON.parse(bytes.toString('utf8')) as Record<string, unknown>
    const name = typeof parsed.name === 'string' && parsed.name.length > 0 ? parsed.name : undefined
    const version = typeof parsed.version === 'string' && parsed.version.length > 0 ? parsed.version : undefined
    if (name === undefined || version === undefined) return undefined
    const exportsCanonical = JSON.stringify(parsed.exports ?? null)
    return { name, version, exportsCanonical }
  } catch {
    return undefined
  }
}

async function collectPresetEvidence(options: PmapObservationOptions, observedAt: string): Promise<PmapComponentEvidence[]> {
  const { fs, profileDir, harnessHome } = options
  const out: PmapComponentEvidence[] = []
  const roots = [
    { trust: 'system' as const, dir: `${profileDir}/${SHIPPED_PRESETS_RELATIVE}`, sourcePrefix: `profile:${SHIPPED_PRESETS_RELATIVE}` },
    { trust: 'user' as const, dir: `${harnessHome}/.agent-presets`, sourcePrefix: 'harness:.agent-presets' },
  ]
  const seen = new Set<string>()
  for (const root of roots) {
    const entries = await listOrUndefined(fs, root.dir)
    if (entries === undefined) {
      if (root.trust === 'system') {
        out.push(buildEvidence({
          component: 'preset', state: 'broken', source: root.sourcePrefix, observedAt,
          reason: REASON.shippedRootMissing,
        }))
      }
      continue
    }
    for (const entry of [...entries].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      if (!entry.isDirectory || entry.name.startsWith('.')) continue
      if (seen.has(entry.name)) continue // first-root-wins per id (dsh discovery semantics)
      seen.add(entry.name)
      const source = `${root.sourcePrefix}/${entry.name}`
      const identity = `preset:${entry.name}@${root.trust}`
      const compositionBytes = await readBytesOrUndefined(fs, `${root.dir}/${entry.name}/${COMPOSITION_FILE}`)
      if (compositionBytes === undefined) {
        out.push(buildEvidence({
          component: 'preset', state: 'broken', identity, source, observedAt,
          reason: REASON.compositionUnreadable,
        }))
        continue
      }
      const metadataBytes = await readBytesOrUndefined(fs, `${root.dir}/${entry.name}/${PRESET_METADATA_FILE}`)
      const artifactEntries = [
        { path: COMPOSITION_FILE, sha256: sha256Hex(compositionBytes) },
        ...(metadataBytes === undefined ? [] : [{ path: PRESET_METADATA_FILE, sha256: sha256Hex(metadataBytes) }]),
      ]
      const contractDigest = urn('pmap-preset-contract', compositionBytes.toString('base64'))
      out.push(buildEvidence({
        component: 'preset', state: 'observed', identity, source, observedAt,
        artifactDigest: urn('pmap-preset-artifact', JSON.stringify(artifactEntries)),
        contractDigest,
        behaviorConfigurationDigest: contractDigest,
      }))
    }
  }
  return out
}

async function readSettingsSelection(options: PmapObservationOptions): Promise<
  | { readonly kind: 'absent'; readonly reason: string; readonly source: string }
  | { readonly kind: 'unparsed'; readonly source: string }
  | { readonly kind: 'broken'; readonly reason: string; readonly source: string }
  | { readonly kind: 'selection'; readonly source: string; readonly provider?: string; readonly model?: string; readonly reasoningEffort?: string; readonly namespaceAbsent: boolean }
> {
  const { fs, harnessHome } = options
  const entries = await listOrUndefined(fs, harnessHome)
  const present = SETTINGS_FILENAMES.find((name) => entries?.some((entry) => entry.name === name && entry.isFile) === true)
  if (present === undefined) {
    return { kind: 'absent', reason: REASON.settingsAbsent, source: 'harness:settings' }
  }
  const source = `harness:${present}`
  if (!present.endsWith('.json')) {
    // Zero-dependency discipline: YAML is not parsed here; the field-level channel is a later ticket's call.
    return { kind: 'unparsed', source }
  }
  const bytes = await readBytesOrUndefined(fs, `${harnessHome}/${present}`)
  if (bytes === undefined) return { kind: 'broken', reason: REASON.settingsUnreadable, source }
  let parsed: unknown
  try {
    parsed = JSON.parse(bytes.toString('utf8'))
  } catch {
    return { kind: 'broken', reason: REASON.settingsUnreadable, source }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { kind: 'broken', reason: REASON.settingsUnreadable, source }
  }
  const namespace = (parsed as Record<string, unknown>)[DEFAULT_MODEL_NAMESPACE]
  if (typeof namespace !== 'object' || namespace === null || Array.isArray(namespace)) {
    return { kind: 'selection', source, namespaceAbsent: true }
  }
  const record = namespace as Record<string, unknown>
  const provider = typeof record.provider === 'string' && record.provider.length > 0 && record.provider === record.provider.trim() ? record.provider : undefined
  const model = typeof record.model === 'string' && record.model.length > 0 && record.model === record.model.trim() ? record.model : undefined
  const reasoningEffort = typeof record.reasoningEffort === 'string' && record.reasoningEffort.length > 0 && record.reasoningEffort === record.reasoningEffort.trim() ? record.reasoningEffort : undefined
  return {
    kind: 'selection', source, namespaceAbsent: false,
    ...(provider === undefined ? {} : { provider }),
    ...(model === undefined ? {} : { model }),
    ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
  }
}

export async function collectPmapEvidence(options: PmapObservationOptions): Promise<readonly PmapComponentEvidence[]> {
  const observedAt = options.now()
  const out: PmapComponentEvidence[] = []
  const profileRealRoot = await options.fs.realpath(options.profileDir)

  const settings = await readSettingsSelection(options)
  if (settings.kind === 'absent' || settings.kind === 'broken') {
    for (const component of ['provider', 'model'] as const) {
      out.push(buildEvidence({ component, state: settings.kind === 'broken' ? 'broken' : 'absent', source: settings.source, observedAt, reason: settings.reason }))
    }
  } else if (settings.kind === 'unparsed') {
    for (const component of ['provider', 'model'] as const) {
      out.push(buildEvidence({ component, state: 'absent', source: settings.source, observedAt, reason: REASON.settingsNotParsed }))
    }
  } else {
    // selection
    if (settings.provider === undefined) {
      out.push(buildEvidence({ component: 'provider', state: 'absent', source: settings.source, observedAt, reason: settings.namespaceAbsent ? REASON.namespaceAbsent : REASON.fieldAbsent }))
    } else {
      const packageName = `@deepseek-ai/dsh-llm-${settings.provider}`
      const packageManifestPath = `${options.profileDir}/node_modules/${packageName}/package.json`
      const manifest = await readPackageManifest(options.fs, packageManifestPath)
      if (manifest === undefined) {
        out.push(buildEvidence({
          component: 'provider', state: 'broken', identity: `provider:${settings.provider}`, source: settings.source, observedAt,
          reason: REASON.providerPackageUnresolved,
        }))
      } else {
        const artifactDigest = await digestPackageTree(options.fs, profileRealRoot, `${options.profileDir}/node_modules/${packageName}`)
        if (artifactDigest === undefined) {
          out.push(buildEvidence({
            component: 'provider', state: 'broken', identity: `provider:${settings.provider}`, source: settings.source, observedAt,
            reason: REASON.packageEscapesProfile,
          }))
        } else {
          out.push(buildEvidence({
            component: 'provider', state: 'observed', identity: `provider:${settings.provider}`, source: settings.source, observedAt,
            version: manifest.version,
            artifactDigest,
            contractDigest: urn('pmap-package-contract', manifest.exportsCanonical),
            behaviorConfigurationDigest: urn('pmap-provider-selection', JSON.stringify({ provider: settings.provider, source: settings.source })),
          }))
        }
      }
    }
    if (settings.model === undefined) {
      out.push(buildEvidence({ component: 'model', state: 'absent', source: settings.source, observedAt, reason: settings.namespaceAbsent ? REASON.namespaceAbsent : REASON.fieldAbsent }))
    } else {
      const providerForIdentity = settings.provider ?? '<unset>'
      out.push(buildEvidence({
        component: 'model', state: 'observed', identity: `model:${providerForIdentity}/${settings.model}`, source: settings.source, observedAt,
        behaviorConfigurationDigest: urn('pmap-model-selection', JSON.stringify({
          model: settings.model,
          ...(settings.reasoningEffort === undefined ? {} : { reasoningEffort: settings.reasoningEffort }),
          source: settings.source,
        })),
      }))
    }
  }

  // agent: package identity of the agent runtime.
  const agentSource = `profile:${AGENT_PACKAGE_JSON_RELATIVE}`
  const agentManifest = await readPackageManifest(options.fs, `${options.profileDir}/${AGENT_PACKAGE_JSON_RELATIVE}`)
  if (agentManifest === undefined) {
    out.push(buildEvidence({ component: 'agent', state: 'broken', source: agentSource, observedAt, reason: REASON.packageUnreadable }))
  } else {
    const agentDir = `${options.profileDir}/node_modules/@deepseek-ai/dsh-agent`
    const artifactDigest = await digestPackageTree(options.fs, profileRealRoot, agentDir)
    if (artifactDigest === undefined) {
      out.push(buildEvidence({ component: 'agent', state: 'broken', identity: `agent:${agentManifest.name}@${agentManifest.version}`, source: agentSource, observedAt, reason: REASON.packageEscapesProfile }))
    } else {
      out.push(buildEvidence({
        component: 'agent', state: 'observed', identity: `agent:${agentManifest.name}@${agentManifest.version}`, source: agentSource, observedAt,
        version: agentManifest.version,
        artifactDigest,
        contractDigest: urn('pmap-package-contract', agentManifest.exportsCanonical),
      }))
    }
  }

  out.push(...await collectPresetEvidence(options, observedAt))
  return Object.freeze(out)
}
