/** Ticket 038 (US-189~191): the input-area skill & plugin selectors.
 *
 * The rules the ticket names:
 *
 * - **Both lists are read-only projections of what is actually mounted.** Skills come from the
 *   base's own registry (`ctx.skills.snapshot` through the bridge) with its discovery-completeness
 *   flag; plugins come from the same composed runtime inventory the rear readout prints. Nothing
 *   here writes enablement state, and an incomplete observation is never shown as "gone".
 * - **A selection is a per-request reference.** It is validated against the CURRENT projection
 *   (user-invocable skill / mounted plugin), held per matter, carried with the next send as a
 *   bounded `[/skill:name]`-style prefix, and consumed by that request (`consume`) — a refused
 *   send keeps it so the user can retry; selections for one matter never bleed into another.
 * - **Unavailable-first.** Before any read, nothing is selectable (`selection-skills-unread` /
 *   `selection-plugins-unread`); a provider that is absent answers a named `unavailable`, never an
 *   empty catalog.
 */
import type {
  InputPluginView,
  InputSelectedView,
  InputSelectionOutcome,
  InputSelectionsStatus,
  InputSkillView,
} from '../appservice/contracts.js'
import type { BridgeCaller } from './workspace-adoption.js'

const MAX_SKILLS = 100
const MAX_PLUGINS = 32
const MAX_SELECTED = 4
const MAX_REF_CHARS = 128

export interface InputSelectionsDeps {
  readonly callBridge: BridgeCaller
  readonly now: () => string
  /** The composed runtime inventory's component rows — the SAME projection the readout prints. */
  readonly plugins: () => { readonly state: 'read', readonly rows: readonly InputPluginView[] } | { readonly state: 'unavailable', readonly code: string }
}

export interface InputSelectionsStore {
  readonly read: (input: { readonly matterRef: string }) => Promise<InputSelectionsStatus>
  readonly select: (input: { readonly matterRef: string, readonly kind: 'skill' | 'plugin', readonly ref: string }) => InputSelectionOutcome
  readonly clear: (input: { readonly matterRef: string, readonly kind: 'skill' | 'plugin', readonly ref?: string }) => InputSelectionOutcome
  /** The prefix a send must carry for this matter (`''` when nothing is selected). */
  readonly carryPrefix: (matterRef: string) => string
  /** The request consumed the selections (accepted/deferred); a refused send keeps them. */
  readonly consume: (matterRef: string) => void
  readonly selectedOf: (matterRef: string) => readonly InputSelectedView[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function boundedText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed === '') return null
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed
}

export function createInputSelections(deps: InputSelectionsDeps): InputSelectionsStore {
  /** The last successfully read skills catalog (global — skills are not matter-scoped). */
  let skills: readonly InputSkillView[] = []
  let skillsRead = false
  let skillsNote: string | null = null
  let skillsCode: string | null = null
  const pending = new Map<string, InputSelectedView[]>()

  const selectedOf = (matterRef: string): readonly InputSelectedView[] => pending.get(matterRef) ?? []

  const snapshotOf = (matterRef: string, pluginView: ReturnType<InputSelectionsDeps['plugins']>): InputSelectionsStatus => ({
    state: skillsRead ? 'read' : 'unavailable',
    skills,
    skillsNote,
    plugins: pluginView.state === 'read' ? pluginView.rows.slice(0, MAX_PLUGINS) : [],
    pluginsNote: pluginView.state === 'read' ? null : '未核验：挂载清单不可读（不以空列表冒充，也不说成已停用）。',
    selected: selectedOf(matterRef),
    code: skillsRead ? null : (skillsCode ?? (pluginView.state === 'unavailable' ? pluginView.code : null)),
    at: deps.now(),
  })

  return {
    async read(input) {
      let code: string | null = null
      try {
        const answer = await deps.callBridge('skills/snapshot', [])
        const record = isRecord(answer) ? answer : null
        if (record !== null && record.ok === true && isRecord(record.result) && Array.isArray(record.result.skills)) {
          const rows: InputSkillView[] = []
          for (const entry of record.result.skills) {
            if (!isRecord(entry)) continue
            const name = boundedText(entry.name, MAX_REF_CHARS)
            if (name === null) continue
            rows.push({
              name,
              description: boundedText(entry.description, 200),
              source: boundedText(entry.source, 64),
              provider: boundedText(entry.provider, 64),
              userInvocable: entry.userInvocable === true,
              modelInvocable: entry.modelInvocable === true,
            })
          }
          skills = rows.slice(0, MAX_SKILLS)
          skillsRead = true
          // US-190: an incomplete discovery is not "the skill is gone" — keep the note.
          skillsNote = record.result.complete === true ? null : '清单不完整（发现未完成）：不得当作"已失效"，可稍后重试。'
          skillsCode = null
        } else {
          code = record !== null && record.ok === false && typeof record.code === 'string' ? record.code : 'skills-answer-unrecognised'
          skillsRead = false
          skillsCode = code
          skillsNote = null
        }
      } catch (error) {
        code = isRecord(error) && typeof error.code === 'string' ? error.code : 'bridge-host-not-ready'
        skillsRead = false
        skillsCode = code
        skillsNote = null
      }
      return snapshotOf(input.matterRef, deps.plugins())
    },

    select(input) {
      const ref = input.ref.trim()
      if (ref === '' || ref.length > MAX_REF_CHARS) return { state: 'refused', code: 'selection-ref-invalid' }
      if (input.kind === 'skill') {
        if (!skillsRead) return { state: 'refused', code: 'selection-skills-unread' }
        const skill = skills.find((entry) => entry.name === ref)
        // US-190: not in the mounted catalog keeps its own honest name — never "已失效".
        if (skill === undefined) return { state: 'refused', code: 'selection-skill-not-listed' }
        if (!skill.userInvocable) return { state: 'refused', code: 'selection-skill-model-only' }
      } else {
        const pluginView = deps.plugins()
        if (pluginView.state !== 'read') return { state: 'refused', code: 'selection-plugins-unread' }
        if (!pluginView.rows.some((row) => row.identity === ref)) return { state: 'refused', code: 'selection-plugin-not-mounted' }
      }
      const list = [...selectedOf(input.matterRef)]
      if (list.some((entry) => entry.kind === input.kind && entry.ref === ref)) return { state: 'selected', selected: list }
      if (list.length >= MAX_SELECTED) return { state: 'refused', code: 'selection-limit-reached' }
      list.push({ kind: input.kind, ref })
      pending.set(input.matterRef, list)
      return { state: 'selected', selected: list }
    },

    clear(input) {
      const list = selectedOf(input.matterRef)
      const next = input.ref === undefined
        ? list.filter((entry) => entry.kind !== input.kind)
        : list.filter((entry) => !(entry.kind === input.kind && entry.ref === input.ref))
      pending.set(input.matterRef, next)
      return { state: 'cleared', selected: next }
    },

    carryPrefix(matterRef) {
      const list = selectedOf(matterRef)
      if (list.length === 0) return ''
      return list.map((entry) => entry.kind === 'skill' ? `[/skill:${entry.ref}]` : `[/plugin:${entry.ref}]`).join(' ') + ' '
    },

    consume(matterRef) {
      pending.delete(matterRef)
    },

    selectedOf,
  }
}
