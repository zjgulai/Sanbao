/** Ticket 015 (US-031~038/040/042): artifact cards from the session's own observation feed.
 *
 * FW-004's chain, as evidenced by the base:
 *
 * - `workspaceFiles.changes` reports observations of instrumented filesystem operations — "frames
 *   report observations, not deltas" and "the OS is not watched". A change is therefore a **clue**,
 *   never a generation receipt: this store confirms every clue with a fresh `stat` and only then
 *   writes a card whose `ready` means "that exact version was readable".
 * - The card keeps the opaque `version` token; an open reads THAT version (the preview module), so
 *   a newer observation only updates the card — it never moves something already being viewed.
 * - Cards are candidates derived from clues and are worded as such; nothing here claims a
 *   deliverable was accepted, and no generator is ever re-run by any read path.
 */
import type { ArtifactCard, ArtifactKind, ArtifactObserveOutcome, ArtifactStatus } from '../appservice/contracts.js'
import type { BridgeCaller } from './workspace-adoption.js'

const MAX_OBSERVED = 32

export interface ArtifactRecord {
  readonly artifactId: string
  readonly matterRef: string
  /** Main-only: the workspace the clue arrived with, used to re-resolve the file scope. */
  readonly workspaceRoot: string
  /** Main-only: the file's absolute path. Never part of any projection. */
  readonly path: string
  name: string
  kind: ArtifactKind
  version: string
  bytes: number | null
  state: 'ready' | 'absent' | 'unconfirmed'
  observedAt: string
}

export interface ArtifactsStore {
  /** One bounded read of the changes feed + a confirming stat per clue; updates cards only. */
  readonly observe: (input: { readonly matterRef: string, readonly workspaceRoot: string }) => Promise<ArtifactObserveOutcome>
  readonly cardsFor: (matterRef: string) => readonly ArtifactCard[]
  readonly recordFor: (artifactId: string) => ArtifactRecord | undefined
}

export interface ArtifactsStoreDeps {
  readonly callBridge: BridgeCaller
  /** The stream half of the bridge, for the bounded `workspaceFiles/changes` read. */
  readonly streamCall: (endpoint: string, payload: readonly unknown[], onFrame: (frame: unknown) => boolean) => Promise<unknown>
  readonly now: () => string
  readonly nextId: () => string
}

function asAnswer(value: unknown): { readonly ok: true, readonly result: unknown } | { readonly ok: false, readonly code: string } {
  if (value !== null && typeof value === 'object' && (value as { ok?: unknown }).ok === true) {
    return { ok: true, result: (value as { result?: unknown }).result }
  }
  if (value !== null && typeof value === 'object' && (value as { ok?: unknown }).ok === false
    && typeof (value as { code?: unknown }).code === 'string') {
    return { ok: false, code: (value as { code: string }).code }
  }
  return { ok: false, code: 'bridge-answer-unrecognised' }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

const CODE_EXTENSIONS = new Set(['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'c', 'h', 'cc', 'cpp', 'hpp', 'cs', 'swift', 'json', 'yaml', 'yml', 'toml', 'ini', 'sh', 'bash', 'zsh', 'css', 'scss', 'sql', 'xml'])
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'])
const OFFICE_EXTENSIONS = new Set(['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp'])
const TEXT_EXTENSIONS = new Set(['txt', 'log', 'text'])

/** First-release viewer selection by extension; content decides readability, extension picks the lens. */
export function kindOf(name: string): ArtifactKind {
  const dot = name.lastIndexOf('.')
  const extension = dot === -1 ? '' : name.slice(dot + 1).toLowerCase()
  if (extension === 'md' || extension === 'markdown') return 'markdown'
  if (extension === 'csv' || extension === 'tsv') return 'csv'
  if (extension === 'html' || extension === 'htm') return 'html'
  if (extension === 'pdf') return 'pdf'
  if (OFFICE_EXTENSIONS.has(extension)) return 'office'
  if (IMAGE_EXTENSIONS.has(extension)) return 'image'
  if (TEXT_EXTENSIONS.has(extension)) return 'text'
  if (CODE_EXTENSIONS.has(extension)) return 'code'
  return 'binary'
}

function nameOf(path: string): string {
  const parts = path.split('/')
  return parts[parts.length - 1] === '' ? path : parts[parts.length - 1]!
}

/** One clue from the feed, after consolidation (last observation per path wins). */
interface Clue {
  readonly path: string
  readonly version: string | null
  readonly absent: boolean
}

function cluesOf(frames: readonly unknown[]): { readonly clues: readonly Clue[], readonly ready: boolean } {
  const byPath = new Map<string, Clue>()
  let ready = false
  for (const frame of frames) {
    if (!isRecord(frame)) continue
    if (frame.kind === 'ready') {
      ready = true
      continue
    }
    if (frame.kind !== 'change' || !isRecord(frame.change)) continue
    const change = frame.change
    if (typeof change.absolutePath !== 'string' || change.absolutePath === '') continue
    if (change.absent === true) {
      byPath.set(change.absolutePath, { path: change.absolutePath, version: null, absent: true })
      continue
    }
    if (typeof change.version === 'string' && change.version !== '') {
      byPath.set(change.absolutePath, { path: change.absolutePath, version: change.version, absent: false })
    }
  }
  return { clues: [...byPath.values()].slice(-MAX_OBSERVED), ready }
}

export function createArtifacts(deps: ArtifactsStoreDeps): ArtifactsStore {
  const records: ArtifactRecord[] = []

  return {
    async observe(input) {
      const frames: unknown[] = []
      try {
        const answer = asAnswer(await deps.streamCall('workspaceFiles/changes', [{ workspaceRoot: input.workspaceRoot }], (frame) => {
          frames.push(frame)
          return frames.length < 256
        }))
        if (!answer.ok) return { state: 'refused', code: answer.code }
      } catch (error) {
        const code = isRecord(error) && typeof error.code === 'string' ? error.code : 'bridge-host-not-ready'
        return { state: 'refused', code }
      }
      const { clues, ready } = cluesOf(frames)
      if (!ready) return { state: 'refused', code: 'artifact-feed-not-ready' }
      let observed = 0
      for (const clue of clues) {
        observed += 1
        const name = nameOf(clue.path)
        if (name.startsWith('.')) continue
        let record = records.find((entry) => entry.matterRef === input.matterRef && entry.path === clue.path)
        const upsert = (state: ArtifactRecord['state'], version: string, bytes: number | null): void => {
          const kind = kindOf(name)
          if (record === undefined) {
            record = {
              artifactId: `art-${deps.nextId()}`,
              matterRef: input.matterRef,
              workspaceRoot: input.workspaceRoot,
              path: clue.path,
              name,
              kind,
              version,
              bytes,
              state,
              observedAt: deps.now(),
            }
            records.push(record)
            if (records.length > MAX_OBSERVED * 2) records.splice(0, records.length - MAX_OBSERVED * 2)
            return
          }
          record.name = name
          record.kind = kind
          record.version = version
          record.bytes = bytes
          record.state = state
          record.observedAt = deps.now()
        }
        if (clue.absent) {
          // The clue says gone; stat would only repeat it. Keep the last known version visible on
          // the card so the wording can say "观察时不存在" without erasing what it once was.
          if (record !== undefined) {
            record.state = 'absent'
            record.observedAt = deps.now()
          }
          continue
        }
        // Confirm the clue: only a fresh stat names a readable version (US-031/034).
        const stat = asAnswer(await deps.callBridge('workspaceFiles/stat', [{ workspaceRoot: input.workspaceRoot, path: clue.path }]))
        if (!stat.ok) {
          if (stat.code === 'bridge-file-not-found') {
            if (record !== undefined) record.state = 'absent'
            continue
          }
          // A directory or an unreadable path is not an artifact; anything else stays unconfirmed.
          if (stat.code === 'bridge-file-not-regular') continue
          if (record !== undefined) {
            record.state = 'unconfirmed'
            record.observedAt = deps.now()
          } else {
            upsert('unconfirmed', clue.version ?? '', null)
          }
          continue
        }
        const result = stat.result
        const statVersion = isRecord(result) && typeof result.version === 'string' && result.version !== '' ? result.version : null
        const statBytes = isRecord(result) && typeof result.bytes === 'number' ? result.bytes : null
        if (statVersion === null || statVersion !== clue.version) {
          // The clue and the stat disagree: something moved between them; say unconfirmed, take nothing.
          if (record !== undefined) {
            record.state = 'unconfirmed'
            record.observedAt = deps.now()
          } else {
            upsert('unconfirmed', clue.version ?? '', statBytes)
          }
          continue
        }
        upsert('ready', statVersion, statBytes)
      }
      return { state: 'observed', observed, cards: records.filter((entry) => entry.matterRef === input.matterRef).length }
    },

    cardsFor(matterRef) {
      return records
        .filter((record) => record.matterRef === matterRef)
        .map((record): ArtifactCard => ({
          artifactId: record.artifactId,
          name: record.name,
          kind: record.kind,
          bytes: record.bytes,
          version: record.version,
          state: record.state,
          source: 'changes-observed',
          observedAt: record.observedAt,
        }))
    },

    recordFor(artifactId) {
      return records.find((record) => record.artifactId === artifactId)
    },
  }
}

/** One card-free status for matters the page has not observed anything for yet. */
export function emptyArtifactStatus(): ArtifactStatus {
  return { state: 'read', cards: [], preview: { state: 'closed' } }
}
