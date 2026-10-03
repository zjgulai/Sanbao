/** Ticket 011 (US-065~070): Sage-owned matter ↔ workspace links.
 *
 * The trail is the store. Every link, unlink and default-environment change is one appended record
 * with its own id, instant and actor reference; the current association set is the **fold** of that
 * trail, so "可追溯" is not a second feature bolted onto a mutable table — the history *is* the
 * state. Nothing here reads file content: a link names a workspace that the adopted-workspace
 * registry already reported, and nothing else.
 *
 * Preferences and links share this file because they are the same fact family (which environments
 * this matter runs in); a second store would be a second home for it.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const MAX_TRAIL_BYTES = 4 * 1024 * 1024

export type MatterLinkAction = 'linked' | 'unlinked' | 'default-set' | 'default-cleared'

export interface MatterLinkRecord {
  readonly linkId: string
  readonly at: string
  readonly action: MatterLinkAction
  readonly matterRef: string
  /** Absent on `default-cleared`; present on the other three. */
  readonly workspaceRef?: string
  /** Who asked; a named operation record is only traceable if it names its actor. */
  readonly actorRef: string
}

/** One association as the surface sees it. */
export interface MatterLinkView {
  readonly matterRef: string
  readonly workspaceRef: string
  readonly workspacePath: string
  readonly linkedAt: string
  readonly isDefault: boolean
}

export interface MatterLinkState {
  readonly state: 'read' | 'unavailable'
  readonly links: readonly MatterLinkView[]
  readonly trail: readonly MatterLinkRecord[]
}

export interface MatterLinkStore {
  readonly snapshot: () => MatterLinkState
  readonly link: (input: { readonly matterRef: string, readonly workspaceRef: string, readonly workspacePath: string, readonly actorRef: string }) => MatterLinkState
  readonly unlink: (input: { readonly matterRef: string, readonly workspaceRef: string, readonly actorRef: string }) => MatterLinkState
  readonly setDefault: (input: { readonly matterRef: string, readonly workspaceRef: string, readonly actorRef: string }) => MatterLinkState
  /** The matter's default environment, or undefined when none was chosen. */
  readonly defaultOf: (matterRef: string) => string | undefined
}

export interface MatterLinkStoreDeps {
  readonly linksDir: string
  readonly now: () => string
  readonly nextId: () => string
}

const ACTIONS: readonly MatterLinkAction[] = ['linked', 'unlinked', 'default-set', 'default-cleared']

function parseRecord(value: unknown): MatterLinkRecord | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  if (typeof record.linkId !== 'string' || record.linkId === '') return undefined
  if (typeof record.at !== 'string' || typeof record.matterRef !== 'string' || record.matterRef === '') return undefined
  if (typeof record.actorRef !== 'string' || record.actorRef === '') return undefined
  if (typeof record.action !== 'string' || !ACTIONS.includes(record.action as MatterLinkAction)) return undefined
  const workspaceRef = record.workspaceRef
  if (record.action === 'default-cleared') {
    if (workspaceRef !== undefined) return undefined
    return { linkId: record.linkId, at: record.at, action: 'default-cleared', matterRef: record.matterRef, actorRef: record.actorRef }
  }
  if (typeof workspaceRef !== 'string' || workspaceRef === '') return undefined
  return { linkId: record.linkId, at: record.at, action: record.action as MatterLinkAction, matterRef: record.matterRef, workspaceRef, actorRef: record.actorRef }
}

/** Fold the trail into the current association set and defaults. */
export function foldLinks(trail: readonly MatterLinkRecord[]): { links: readonly MatterLinkView[], defaults: ReadonlyMap<string, string> } {
  const links = new Map<string, MatterLinkView>()
  const defaults = new Map<string, string>()
  const key = (matterRef: string, workspaceRef: string): string => `${matterRef}\u0000${workspaceRef}`
  for (const record of trail) {
    if (record.action === 'linked') {
      const ref = record.workspaceRef as string
      if (!links.has(key(record.matterRef, ref))) {
        links.set(key(record.matterRef, ref), { matterRef: record.matterRef, workspaceRef: ref, workspacePath: '', linkedAt: record.at, isDefault: false })
      }
      continue
    }
    if (record.action === 'unlinked') {
      links.delete(key(record.matterRef, record.workspaceRef as string))
      // Unlinking the default clears the default: an association that no longer exists cannot be
      // the environment a dispatch runs in (and nothing silently slides to another workspace).
      if (defaults.get(record.matterRef) === record.workspaceRef) defaults.delete(record.matterRef)
      continue
    }
    if (record.action === 'default-set') {
      const ref = record.workspaceRef as string
      // Only a currently linked workspace can become the default: a preference without a link
      // would make "the environment" a fact with no home.
      if (links.has(key(record.matterRef, ref))) defaults.set(record.matterRef, ref)
      continue
    }
    defaults.delete(record.matterRef)
  }
  return { links: [...links.values()], defaults }
}

export function createMatterLinkStore(deps: MatterLinkStoreDeps): MatterLinkStore {
  const trailFile = join(deps.linksDir, 'trail.jsonl')
  // Paths are presentation metadata for the fold; they live beside the trail, never inside it.
  const pathsFile = join(deps.linksDir, 'workspace-paths.json')

  const readTrail = (): MatterLinkRecord[] => {
    if (!existsSync(trailFile)) return []
    let text: string
    try {
      const bytes = readFileSync(trailFile, 'utf8')
      if (bytes.length > MAX_TRAIL_BYTES) return []
      text = bytes
    } catch {
      return []
    }
    const records: MatterLinkRecord[] = []
    for (const line of text.split('\n')) {
      if (line.trim() === '') continue
      let value: unknown
      try {
        value = JSON.parse(line) as unknown
      } catch {
        // A corrupt line makes the whole trail untrustworthy: an association set folded from a
        // half-read history could silently drop a link.
        return []
      }
      const record = parseRecord(value)
      if (record === undefined) return []
      records.push(record)
    }
    return records
  }

  const readPaths = (): Record<string, string> => {
    if (!existsSync(pathsFile)) return {}
    try {
      const value = JSON.parse(readFileSync(pathsFile, 'utf8')) as unknown
      if (value === null || typeof value !== 'object' || Array.isArray(value)) return {}
      const out: Record<string, string> = {}
      for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
        if (typeof entry === 'string') out[key] = entry
      }
      return out
    } catch {
      return {}
    }
  }

  const rememberPath = (workspaceRef: string, workspacePath: string): void => {
    mkdirSync(deps.linksDir, { recursive: true, mode: 0o700 })
    const paths = readPaths()
    if (paths[workspaceRef] === workspacePath) return
    paths[workspaceRef] = workspacePath
    writeFileSync(pathsFile, JSON.stringify(paths, null, 2), { mode: 0o600 })
  }

  const append = (record: MatterLinkRecord): void => {
    mkdirSync(deps.linksDir, { recursive: true, mode: 0o700 })
    appendFileSync(trailFile, `${JSON.stringify(record)}\n`, { mode: 0o600 })
  }

  const snapshot = (): MatterLinkState => {
    const trail = readTrail()
    const folded = foldLinks(trail)
    const paths = readPaths()
    return {
      state: 'read',
      links: folded.links.map((link) => ({
        ...link,
        workspacePath: paths[link.workspaceRef] ?? '',
        isDefault: folded.defaults.get(link.matterRef) === link.workspaceRef,
      })),
      trail,
    }
  }

  return {
    snapshot,
    link(input) {
      // The same link twice is not two associations: the fold already de-duplicates, and the trail
      // still records the request, so "who linked what when" stays answerable.
      rememberPath(input.workspaceRef, input.workspacePath)
      append({ linkId: `link-${deps.nextId()}`, at: deps.now(), action: 'linked', matterRef: input.matterRef, workspaceRef: input.workspaceRef, actorRef: input.actorRef })
      return snapshot()
    },
    unlink(input) {
      append({ linkId: `link-${deps.nextId()}`, at: deps.now(), action: 'unlinked', matterRef: input.matterRef, workspaceRef: input.workspaceRef, actorRef: input.actorRef })
      return snapshot()
    },
    setDefault(input) {
      append({ linkId: `link-${deps.nextId()}`, at: deps.now(), action: 'default-set', matterRef: input.matterRef, workspaceRef: input.workspaceRef, actorRef: input.actorRef })
      return snapshot()
    },
    defaultOf(matterRef) {
      return foldLinks(readTrail()).defaults.get(matterRef)
    },
  }
}
