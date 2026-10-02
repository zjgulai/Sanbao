/** WT-02C.2E-PMAP: main-owned static-layer producers for Provider / Model / Agent / Preset
 * runtime-inventory evidence. Read-only by contract; observation scope is materialized-static —
 * runtime-effective configuration (env layering, live mount enablement, default-preset
 * selection) belongs to the Host-protocol ticket and is never guessed here.
 *
 * 0.2.0-rc.2 row/layer model (WT-02C.2E-PMAP.1, ADR-0194): presets are declarative rows
 * (`name: '@deepseek-ai/dsh-agent-preset'`) inside the composed patch layers, and the model
 * selection is the layered `config` of the `agent-default-model` row. Layers are resolved in
 * composition order — each bundle's `dsh.bundle.patch` files, the profile `cordis.patch.yml`,
 * then the shell overlay — and sliced as text blocks: no YAML engine, no `!!js` evaluation. */
import { createHash } from 'node:crypto'
import { join, relative } from 'node:path'
import { overlayPath } from '../profile/layout.js'

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
  /** Active materialized profile (generation) directory; its manifest, bundles and layers are the observed surface. */
  readonly profileDir: string
  readonly fs: PmapFsPorts
  readonly now: () => string
}

const PROFILE_PATCH_FILE = 'cordis.patch.yml'
const AGENT_PACKAGE_JSON_RELATIVE = 'node_modules/@deepseek-ai/dsh-agent/package.json'
const AGENT_PACKAGE_DIR_RELATIVE = 'node_modules/@deepseek-ai/dsh-agent'
const AGENT_PRESET_PACKAGE = '@deepseek-ai/dsh-agent-preset'
const DEFAULT_MODEL_ROW_ID = 'agent-default-model'
const SELECTION_FIELDS = ['provider', 'model', 'reasoningEffort'] as const

// Provider routes are constants inside the llm packages (llm-deepseek-api-key PROVIDER =
// 'deepseek-official'); the static layer cannot import them, so this table is re-verified
// against the kernel at every upgrade (ADR-0194).
const PROVIDER_PACKAGE_BY_ROUTE: Readonly<Record<string, string>> = Object.freeze({
  'deepseek-official': '@deepseek-ai/dsh-llm-deepseek-api-key',
  'deepseek-account': '@deepseek-ai/dsh-llm-deepseek-account',
})

const REASON = {
  patchLayerUnresolved: 'patch-layer-unresolved',
  presetRowUnparsable: 'preset-row-unparsable',
  presetIdCollision: 'preset-id-collision',
  providerPackageUnresolved: 'provider-package-unresolved',
  modelSelectionUnparsable: 'model-selection-unparsable',
  modelSelectionIncomplete: 'model-selection-incomplete',
  modelSelectionRowMissing: 'model-selection-row-missing',
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

async function realpathOrUndefined(fs: PmapFsPorts, absolutePath: string): Promise<string | undefined> {
  try {
    return await fs.realpath(absolutePath)
  } catch {
    return undefined
  }
}

function isInside(root: string, target: string): boolean {
  return target === root || target.startsWith(`${root}/`)
}

async function readJsonObject(fs: PmapFsPorts, absolutePath: string): Promise<Record<string, unknown> | undefined> {
  const bytes = await readBytesOrUndefined(fs, absolutePath)
  if (bytes === undefined) return undefined
  try {
    const parsed = JSON.parse(bytes.toString('utf8')) as unknown
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined
  } catch {
    return undefined
  }
}

async function readLayerBytes(
  fs: PmapFsPorts,
  absolutePath: string,
): Promise<{ readonly kind: 'bytes'; readonly bytes: Buffer } | { readonly kind: 'absent' } | { readonly kind: 'error' }> {
  try {
    return { kind: 'bytes', bytes: await fs.readFileBytes(absolutePath) }
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ENOENT' ? { kind: 'absent' } : { kind: 'error' }
  }
}

interface PmapLayer {
  readonly label: string
  readonly trust: 'system' | 'user'
  readonly bytes: Buffer
}

type LayerResolution =
  | { readonly kind: 'resolved'; readonly layers: readonly PmapLayer[] }
  | { readonly kind: 'unresolved'; readonly source: string }

function profileBundleNames(manifest: Record<string, unknown>): readonly string[] | undefined {
  const dsh = manifest.dsh
  if (typeof dsh !== 'object' || dsh === null || Array.isArray(dsh)) return []
  const profile = (dsh as Record<string, unknown>).profile
  if (typeof profile !== 'object' || profile === null || Array.isArray(profile)) return []
  const bundles = (profile as Record<string, unknown>).bundles
  if (bundles === undefined) return []
  if (!Array.isArray(bundles) || !bundles.every(name => typeof name === 'string' && name !== '')) return undefined
  return bundles
}

function bundlePatchFiles(manifest: Record<string, unknown>): readonly string[] | undefined {
  const dsh = manifest.dsh
  if (typeof dsh !== 'object' || dsh === null || Array.isArray(dsh)) return undefined
  const bundle = (dsh as Record<string, unknown>).bundle
  if (typeof bundle !== 'object' || bundle === null || Array.isArray(bundle)) return undefined
  const patch = (bundle as Record<string, unknown>).patch
  const declared = typeof patch === 'string' ? [patch] : patch
  if (!Array.isArray(declared) || !declared.every(file => typeof file === 'string' && file !== '')) return undefined
  return declared
}

function normalizedRelative(declared: string): string {
  return declared.startsWith('./') ? declared.slice(2) : declared
}

/** Resolve the composed layer list in boot order: bundle patches (system), profile patch
 * (user, absent file = upstream-legal empty layer), then the required shell overlay (user). */
async function resolveLayers(options: PmapObservationOptions, profileRealRoot: string): Promise<LayerResolution> {
  const { fs, profileDir } = options
  const manifest = await readJsonObject(fs, join(profileDir, 'package.json'))
  if (manifest === undefined) return { kind: 'unresolved', source: 'profile:package.json' }
  const bundles = profileBundleNames(manifest)
  if (bundles === undefined) return { kind: 'unresolved', source: 'profile:package.json' }

  const layers: PmapLayer[] = []
  for (const packageName of bundles) {
    const candidates = [
      join(profileDir, 'node_modules', packageName),
      join(profileDir, 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', packageName),
    ]
    let bundleDir: string | undefined
    let bundleManifest: Record<string, unknown> | undefined
    for (const candidate of candidates) {
      const candidateManifest = await readJsonObject(fs, join(candidate, 'package.json'))
      if (candidateManifest !== undefined) {
        bundleDir = candidate
        bundleManifest = candidateManifest
        break
      }
    }
    if (bundleDir === undefined || bundleManifest === undefined) {
      return { kind: 'unresolved', source: `bundle:${packageName}/package.json` }
    }
    const realBundleDir = await realpathOrUndefined(fs, bundleDir)
    if (realBundleDir === undefined || !isInside(profileRealRoot, realBundleDir)) {
      return { kind: 'unresolved', source: `bundle:${packageName}` }
    }
    const patchFiles = bundlePatchFiles(bundleManifest)
    if (patchFiles === undefined) return { kind: 'unresolved', source: `bundle:${packageName}/package.json` }
    for (const declared of patchFiles) {
      const target = normalizedRelative(declared)
      const label = `bundle:${packageName}/${target}`
      const read = await readLayerBytes(fs, join(bundleDir, target))
      if (read.kind !== 'bytes') return { kind: 'unresolved', source: label }
      layers.push({ label, trust: 'system', bytes: read.bytes })
    }
  }

  const profilePatch = await readLayerBytes(fs, join(profileDir, PROFILE_PATCH_FILE))
  if (profilePatch.kind === 'error') return { kind: 'unresolved', source: `profile:${PROFILE_PATCH_FILE}` }
  if (profilePatch.kind === 'bytes') {
    layers.push({ label: `profile:${PROFILE_PATCH_FILE}`, trust: 'user', bytes: profilePatch.bytes })
  }

  const overlayFile = overlayPath(profileDir)
  const overlayLabel = `profile:${relative(profileDir, overlayFile)}`
  const overlay = await readLayerBytes(fs, overlayFile)
  if (overlay.kind !== 'bytes') return { kind: 'unresolved', source: overlayLabel }
  layers.push({ label: overlayLabel, trust: 'user', bytes: overlay.bytes })

  return { kind: 'resolved', layers }
}

type Scalar =
  | { readonly kind: 'scalar'; readonly value: string }
  | { readonly kind: 'empty' }
  | { readonly kind: 'unparsable' }

function parseScalar(raw: string): Scalar {
  const trimmed = raw.trim()
  if (trimmed === '') return { kind: 'empty' }
  if (trimmed.startsWith('|') || trimmed.startsWith('>') || trimmed.startsWith('!')) return { kind: 'unparsable' }
  const quote = trimmed[0]
  if (quote === "'" || quote === '"') {
    const end = trimmed.indexOf(quote, 1)
    if (end === -1) return { kind: 'unparsable' }
    return { kind: 'scalar', value: trimmed.slice(1, end) }
  }
  const commentAt = trimmed.indexOf(' #')
  const value = (commentAt === -1 ? trimmed : trimmed.slice(0, commentAt)).trim()
  return value === '' ? { kind: 'empty' } : { kind: 'scalar', value }
}

function leadingSpaces(line: string): number {
  let count = 0
  while (line[count] === ' ') count += 1
  return count
}

interface RowBlock {
  readonly rowId: string | undefined
  readonly blockLines: readonly string[]
  readonly propertyIndent: number
}

const ROW_HEADER = /^([ ]*)-([ ]+)id:(.*)$/u
const PROPERTY_LINE = /^([A-Za-z_][A-Za-z0-9_.-]*):(.*)$/u

/** Slice one patch file into `- id:` row blocks by indentation. Text-level only: a block is
 * every line up to the next non-blank line at or left of the header's indent. */
function sliceRowBlocks(text: string): readonly RowBlock[] {
  const lines = text.split('\n')
  const blocks: RowBlock[] = []
  for (let index = 0; index < lines.length; index += 1) {
    const header = ROW_HEADER.exec(lines[index] as string)
    if (header === null) continue
    const indent = (header[1] as string).length
    const propertyIndent = indent + 1 + (header[2] as string).length
    let lastContent = index
    let cursor = index + 1
    for (; cursor < lines.length; cursor += 1) {
      const line = lines[cursor] as string
      if (line.trim() === '') continue
      if (leadingSpaces(line) <= indent) break
      lastContent = cursor
    }
    const rowId = parseScalar(header[3] as string)
    blocks.push({
      rowId: rowId.kind === 'scalar' && rowId.value !== '' ? rowId.value : undefined,
      blockLines: lines.slice(index, lastContent + 1),
      propertyIndent,
    })
  }
  return blocks
}

interface RowProperty {
  readonly raw: string
  readonly lineIndex: number
}

function rowProperties(block: RowBlock): ReadonlyMap<string, RowProperty> {
  const properties = new Map<string, RowProperty>()
  for (let index = 1; index < block.blockLines.length; index += 1) {
    const line = block.blockLines[index] as string
    if (leadingSpaces(line) !== block.propertyIndent) continue
    const match = PROPERTY_LINE.exec(line.slice(block.propertyIndent))
    if (match === null || properties.has(match[1] as string)) continue
    properties.set(match[1] as string, { raw: match[2] as string, lineIndex: index })
  }
  return properties
}

/** The row's `config` fields at the config block's own property level. `{}`/`[]`/null are the
 * empty config; any other inline value (flow map, tag, block scalar) is unreadable text. */
function configFields(block: RowBlock, config: RowProperty): ReadonlyMap<string, string> | undefined {
  const trimmed = config.raw.trim()
  if (trimmed === '{}' || trimmed === '[]' || trimmed === 'null' || trimmed === '~') return new Map()
  if (trimmed !== '') return undefined

  const fields = new Map<string, string>()
  let configIndent = -1
  for (let index = config.lineIndex + 1; index < block.blockLines.length; index += 1) {
    const line = block.blockLines[index] as string
    const content = line.trim()
    if (content === '' || content.startsWith('#')) continue
    const indent = leadingSpaces(line)
    if (indent <= block.propertyIndent) break
    if (configIndent === -1) configIndent = indent
    if (indent !== configIndent) continue
    const match = PROPERTY_LINE.exec(line.slice(indent))
    if (match === null || fields.has(match[1] as string)) continue
    fields.set(match[1] as string, match[2] as string)
  }
  return fields
}

function blockBytes(block: RowBlock): Buffer {
  return Buffer.from(block.blockLines.join('\n'), 'utf8')
}

function collectPresetEvidenceFromLayers(layers: readonly PmapLayer[], observedAt: string): PmapComponentEvidence[] {
  const out: PmapComponentEvidence[] = []
  const seen = new Set<string>()
  for (const layer of layers) {
    for (const block of sliceRowBlocks(layer.bytes.toString('utf8'))) {
      const properties = rowProperties(block)
      const nameProperty = properties.get('name')
      const name = nameProperty === undefined ? undefined : parseScalar(nameProperty.raw)
      if (name?.kind !== 'scalar' || name.value !== AGENT_PRESET_PACKAGE) continue

      let presetId: string | undefined
      const configProperty = properties.get('config')
      if (configProperty !== undefined) {
        const idRaw = configFields(block, configProperty)?.get('id')
        if (idRaw !== undefined) {
          const id = parseScalar(idRaw)
          if (id.kind === 'scalar' && id.value !== '') presetId = id.value
        }
      }
      if (block.rowId === undefined || presetId === undefined) {
        out.push(buildEvidence({
          component: 'preset', state: 'broken', source: layer.label, observedAt,
          reason: REASON.presetRowUnparsable,
        }))
        continue
      }
      const identity = `preset:${presetId}@${layer.trust}`
      if (seen.has(presetId)) {
        out.push(buildEvidence({
          component: 'preset', state: 'broken', identity, source: layer.label, observedAt,
          reason: REASON.presetIdCollision,
        }))
        continue
      }
      seen.add(presetId)
      const bytes = blockBytes(block)
      const contractDigest = urn('pmap-preset-contract', bytes.toString('base64'))
      out.push(buildEvidence({
        component: 'preset', state: 'observed', identity, source: layer.label, observedAt,
        artifactDigest: urn('pmap-preset-artifact', JSON.stringify([
          { path: `${layer.label}#${block.rowId}`, sha256: sha256Hex(bytes) },
        ])),
        contractDigest,
        behaviorConfigurationDigest: contractDigest,
      }))
    }
  }
  return out
}

type ModelSelectionMerge =
  | { readonly kind: 'broken'; readonly reason: string; readonly source: string }
  | {
    readonly kind: 'merged'
    readonly provider?: string
    readonly providerSource?: string
    readonly model?: string
    readonly modelSource?: string
    readonly reasoningEffort?: string
    readonly lastSource: string
  }

function mergeModelSelection(layers: readonly PmapLayer[]): ModelSelectionMerge {
  let provider: { readonly value: string; readonly source: string } | undefined
  let model: { readonly value: string; readonly source: string } | undefined
  let reasoningEffort: string | undefined
  let sawRow = false
  let lastSource = 'profile:package.json'
  for (const layer of layers) {
    for (const block of sliceRowBlocks(layer.bytes.toString('utf8'))) {
      if (block.rowId !== DEFAULT_MODEL_ROW_ID) continue
      sawRow = true
      lastSource = layer.label
      const configProperty = rowProperties(block).get('config')
      if (configProperty === undefined) continue
      const fields = configFields(block, configProperty)
      if (fields === undefined) {
        return { kind: 'broken', reason: REASON.modelSelectionUnparsable, source: layer.label }
      }
      for (const field of SELECTION_FIELDS) {
        const raw = fields.get(field)
        if (raw === undefined) continue
        const scalar = parseScalar(raw)
        if (scalar.kind === 'unparsable') {
          return { kind: 'broken', reason: REASON.modelSelectionUnparsable, source: layer.label }
        }
        if (scalar.kind !== 'scalar' || scalar.value === '') continue
        if (field === 'provider') provider = { value: scalar.value, source: layer.label }
        else if (field === 'model') model = { value: scalar.value, source: layer.label }
        else reasoningEffort = scalar.value
      }
    }
  }
  if (!sawRow) return { kind: 'broken', reason: REASON.modelSelectionRowMissing, source: 'profile:package.json' }
  return {
    kind: 'merged',
    ...(provider === undefined ? {} : { provider: provider.value, providerSource: provider.source }),
    ...(model === undefined ? {} : { model: model.value, modelSource: model.source }),
    ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
    lastSource,
  }
}

async function collectSelectionEvidence(
  options: PmapObservationOptions,
  layers: readonly PmapLayer[],
  observedAt: string,
  profileRealRoot: string,
): Promise<PmapComponentEvidence[]> {
  const merged = mergeModelSelection(layers)
  if (merged.kind === 'broken') {
    return [
      buildEvidence({ component: 'provider', state: 'broken', source: merged.source, observedAt, reason: merged.reason }),
      buildEvidence({ component: 'model', state: 'broken', source: merged.source, observedAt, reason: merged.reason }),
    ]
  }

  const out: PmapComponentEvidence[] = []
  if (merged.provider === undefined) {
    out.push(buildEvidence({
      component: 'provider', state: 'broken', source: merged.lastSource, observedAt,
      reason: REASON.modelSelectionIncomplete,
    }))
  } else {
    const identity = `provider:${merged.provider}`
    const source = merged.providerSource ?? merged.lastSource
    const packageName = PROVIDER_PACKAGE_BY_ROUTE[merged.provider]
    if (packageName === undefined) {
      out.push(buildEvidence({ component: 'provider', state: 'broken', identity, source, observedAt, reason: REASON.providerPackageUnresolved }))
    } else {
      const packageDir = join(options.profileDir, 'node_modules', packageName)
      const manifest = await readPackageManifest(options.fs, join(packageDir, 'package.json'))
      if (manifest === undefined) {
        out.push(buildEvidence({ component: 'provider', state: 'broken', identity, source, observedAt, reason: REASON.providerPackageUnresolved }))
      } else {
        const artifactDigest = await digestPackageTree(options.fs, profileRealRoot, packageDir)
        if (artifactDigest === undefined) {
          out.push(buildEvidence({ component: 'provider', state: 'broken', identity, source, observedAt, reason: REASON.packageEscapesProfile }))
        } else {
          out.push(buildEvidence({
            component: 'provider', state: 'observed', identity, source, observedAt,
            version: manifest.version,
            artifactDigest,
            contractDigest: urn('pmap-package-contract', manifest.exportsCanonical),
            behaviorConfigurationDigest: urn('pmap-provider-selection', JSON.stringify({ provider: merged.provider, source })),
          }))
        }
      }
    }
  }

  if (merged.model === undefined || merged.provider === undefined) {
    out.push(buildEvidence({
      component: 'model', state: 'broken', source: merged.lastSource, observedAt,
      reason: REASON.modelSelectionIncomplete,
    }))
  } else {
    const source = merged.modelSource ?? merged.lastSource
    out.push(buildEvidence({
      component: 'model', state: 'observed', identity: `model:${merged.provider}/${merged.model}`, source, observedAt,
      behaviorConfigurationDigest: urn('pmap-model-selection', JSON.stringify({
        model: merged.model,
        ...(merged.reasoningEffort === undefined ? {} : { reasoningEffort: merged.reasoningEffort }),
        source,
      })),
    }))
  }
  return out
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
      const relativePath = prefix === '' ? entry.name : `${prefix}/${entry.name}`
      if (entry.isDirectory) {
        if (!(await visit(`${dir}/${entry.name}`, relativePath))) return false
      } else if (entry.isFile) {
        const bytes = await readBytesOrUndefined(fs, `${dir}/${entry.name}`)
        if (bytes === undefined) return false
        files.push([relativePath, sha256Hex(bytes)])
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

export async function collectPmapEvidence(options: PmapObservationOptions): Promise<readonly PmapComponentEvidence[]> {
  const observedAt = options.now()
  const profileRealRoot = await options.fs.realpath(options.profileDir)
  const resolution = await resolveLayers(options, profileRealRoot)

  let selectionRows: PmapComponentEvidence[]
  let presetRows: PmapComponentEvidence[]
  if (resolution.kind === 'unresolved') {
    selectionRows = [
      buildEvidence({ component: 'provider', state: 'broken', source: resolution.source, observedAt, reason: REASON.patchLayerUnresolved }),
      buildEvidence({ component: 'model', state: 'broken', source: resolution.source, observedAt, reason: REASON.patchLayerUnresolved }),
    ]
    presetRows = [
      buildEvidence({ component: 'preset', state: 'broken', source: resolution.source, observedAt, reason: REASON.patchLayerUnresolved }),
    ]
  } else {
    selectionRows = await collectSelectionEvidence(options, resolution.layers, observedAt, profileRealRoot)
    presetRows = collectPresetEvidenceFromLayers(resolution.layers, observedAt)
  }

  const agentRows: PmapComponentEvidence[] = []
  const agentSource = `profile:${AGENT_PACKAGE_JSON_RELATIVE}`
  const agentManifest = await readPackageManifest(options.fs, join(options.profileDir, AGENT_PACKAGE_JSON_RELATIVE))
  if (agentManifest === undefined) {
    agentRows.push(buildEvidence({ component: 'agent', state: 'broken', source: agentSource, observedAt, reason: REASON.packageUnreadable }))
  } else {
    const artifactDigest = await digestPackageTree(options.fs, profileRealRoot, join(options.profileDir, AGENT_PACKAGE_DIR_RELATIVE))
    if (artifactDigest === undefined) {
      agentRows.push(buildEvidence({
        component: 'agent', state: 'broken', identity: `agent:${agentManifest.name}@${agentManifest.version}`,
        source: agentSource, observedAt, reason: REASON.packageEscapesProfile,
      }))
    } else {
      agentRows.push(buildEvidence({
        component: 'agent', state: 'observed', identity: `agent:${agentManifest.name}@${agentManifest.version}`,
        source: agentSource, observedAt,
        version: agentManifest.version,
        artifactDigest,
        contractDigest: urn('pmap-package-contract', agentManifest.exportsCanonical),
      }))
    }
  }

  return Object.freeze([...selectionRows, ...agentRows, ...presetRows])
}
