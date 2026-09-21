/** Pure, package-private view projections shared by the research surfaces and hooks. */

import type { ResearchCoverageStatus, ResearchDepth, ResearchProject, ResearchStartRequest, ResearchVerification } from '../types.ts'
import type { DeepResearchKey } from './locales.ts'

export type PhaseFilter = 'all' | 'planning' | 'investigating' | 'done'
export type Translate = (key: DeepResearchKey, params?: Record<string, unknown>) => string
export type EditableQuestion = ResearchStartRequest['questions'][number]
export type ResearchQuestionView = ResearchProject['questions'][number]
export type ResearchEvidenceView = ResearchProject['evidence'][number]
export type ResearchScoutView = ResearchProject['progress']['scouts'][number]
export type QuestionIndex = ReadonlyMap<ResearchQuestionView['id'], number>
export type PendingDelete = { id: ResearchProject['id']; title: string }
export type ResearchStep = 'plan' | 'investigate' | 'report'
export type LimitationView = { key: string; status: ResearchCoverageStatus | ''; ref: string; text: string }

/** Render a dependency reference as `01 · question text`, clipped to `max` characters. */
export function formatDepLabel(index: number, text: string, max = 42): string {
  const number = ordinal(index)
  const clipped = clipLabel(text, max)
  return clipped === '' ? number : `${number} · ${clipped}`
}

export function clipLabel(text: string, max: number): string {
  const characters = Array.from(text.trim())
  if (characters.length === 0) return ''
  return characters.length > max ? `${characters.slice(0, max - 1).join('')}…` : characters.join('')
}

export function readableDraft(text: string): string {
  const value = text.trim()
  if (value === '') return ''
  if (/^(Search|Fetch|Read artifact|Evaluator read)\b/i.test(value)) return ''
  if (value.startsWith('{') || value.startsWith('[')) return ''
  return value
}

export function toolLabel(name: string, t: Translate): string {
  if (name === 'research_web_search') return t('investigate.toolSearch')
  if (name === 'research_web_fetch') return t('investigate.toolFetch')
  if (name === 'read_artifact') return t('investigate.toolRead')
  return name
}

export function isSettledQuestion(status: ResearchQuestionView['status']): boolean {
  return status === 'covered' || status === 'partial' || status === 'blocked'
}

function limitationFallback(status: ResearchCoverageStatus, t: Translate): string {
  if (status === 'partial') return t('limitation.partialFallback')
  if (status === 'blocked') return t('limitation.blockedFallback')
  if (status === 'conflicted') return t('limitation.conflictedFallback')
  return t('limitation.missingFallback')
}

export function boardLimitations(project: ResearchProject, t: Translate, live: boolean): LimitationView[] {
  const rows: LimitationView[] = []
  for (const [index, question] of project.questions.entries()) {
    for (const criterion of question.criteria) {
      if (criterion.status === 'covered') continue
      const note = [criterion.gap, criterion.warning].map(item => item.trim()).filter(Boolean).join(' ')
      if (criterion.status === 'missing' && live && note === '') continue
      const text = note || limitationFallback(criterion.status, t)
      rows.push({
        key: `${question.id}:${criterion.id}`,
        status: criterion.status,
        ref: `${formatDepLabel(index, question.text, 36)} · ${clipLabel(criterion.text, 28)}`,
        text,
      })
    }
  }
  for (const [index, item] of project.limitations.entries()) {
    const text = item.trim()
    if (!text || rows.some(row => row.text === text || text.endsWith(row.text))) continue
    rows.push({ key: `note:${index}:${text}`, status: '', ref: '', text })
  }
  return rows
}

export function boardScouts(project: ResearchProject): ResearchScoutView[] {
  const live = new Map((project.progress?.scouts ?? []).map(scout => [scout.questionId, scout]))
  return project.questions.map(question => {
    const existing = live.get(question.id)
    if (existing !== undefined) return existing
    return {
      questionId: question.id,
      role: question.status === 'running' ? 'scout' : 'waiting',
      status: question.status === 'running' ? 'running' : question.status === 'covered' ? 'done' : question.status === 'partial' ? 'partial' : question.status === 'blocked' || question.status === 'failed' ? 'blocked' : 'waiting',
      waitingOn: question.dependsOn ?? [],
      toolsUsed: 0,
      toolsCap: 10,
      activity: '',
      tools: [],
      scoutDraft: '',
      evaluatorDraft: '',
      activeCriterionId: '',
      activeCriterionText: '',
      dependencySummary: '',
      handoff: question.handoff ?? '',
    }
  })
}

/** Remove one question without changing the targets of surviving index-based dependencies. */
export function removePlanQuestion(questions: readonly EditableQuestion[], removedIndex: number): EditableQuestion[] {
  return questions.filter((_, index) => index !== removedIndex).map(question => ({
    ...question,
    dependsOn: question.dependsOn?.filter(index => index !== removedIndex)
      .map(index => index > removedIndex ? index - 1 : index),
  }))
}

export function ordinal(index: number): string { return String(index + 1).padStart(2, '0') }
export function resolveIndexes(ids: readonly ResearchQuestionView['id'][], indexOf: QuestionIndex): number[] { return ids.flatMap(id => { const at = indexOf.get(id); return at === undefined ? [] : [at] }) }
export function editablePlan(project: ResearchProject): EditableQuestion[] { return project.questions.map(question => ({ text: question.text, criteria: question.criteria.map(item => item.text), dependsOn: question.dependsOn.map(id => project.questions.findIndex(candidate => candidate.id === id)).filter(index => index >= 0) })) }
export function stepFor(project: ResearchProject): ResearchStep { return ['planning', 'awaiting_plan_confirm'].includes(project.phase) || ['failed', 'aborted'].includes(project.phase) && !project.planConfirmed ? 'plan' : ['writing', 'done'].includes(project.phase) ? 'report' : 'investigate' }
export function reachableStep(project: ResearchProject, step: ResearchStep): boolean {
  if (project.planConfirmed && ['done', 'incomplete', 'failed', 'aborted', 'writing', 'ready_for_report'].includes(project.phase)) return true
  const order: ResearchStep[] = ['plan', 'investigate', 'report']
  const unlocked = project.phase === 'ready_for_report' ? 'investigate' : stepFor(project)
  return order.indexOf(step) <= order.indexOf(unlocked)
}
export function depthLabel(depth: ResearchDepth, t: Translate): string { return t(({ quick: 'depth.quick', standard: 'depth.standard', deep: 'depth.deep' } as const)[depth]) }
export function phaseLabel(project: Pick<ResearchProject, 'phase' | 'runState'>, t: Translate): string {
  if (project.runState === 'paused') return t('phase.aborted')
  return t(({ planning: 'phase.planning', awaiting_plan_confirm: 'phase.awaitingPlanConfirm', investigating: 'phase.investigating', ready_for_report: 'phase.readyForReport', incomplete: 'phase.incomplete', writing: 'phase.writing', done: 'phase.done', failed: 'phase.failed', aborted: 'phase.aborted' } as const)[project.phase])
}
export function statusLabel(status: ResearchQuestionView['status'], t: Translate): string { return t(({ pending: 'status.pending', running: 'status.running', covered: 'status.covered', partial: 'status.partial', blocked: 'status.blocked', failed: 'status.failed' } as const)[status]) }
export function scoutStatusLabel(scout: ResearchScoutView, t: Translate): string {
  if (scout.status === 'waiting' && scout.waitingOn.length === 0) return t('investigate.queued')
  return t(({ waiting: 'investigate.waitingStatus', running: 'status.running', verifying: 'investigate.verifying', done: 'status.covered', partial: 'status.partial', blocked: 'status.blocked' } as const)[scout.status])
}
export function coverageLabel(status: ResearchCoverageStatus, t: Translate): string { return t((`coverage.${status}`) as DeepResearchKey) }
export function confidenceLabel(value: ResearchProject['evidence'][number]['confidence'], t: Translate): string {
  return t(value === 'high' ? 'confidence.high' : value === 'low' ? 'confidence.low' : 'confidence.medium')
}
export function primaryEvidenceUrl(evidence: ResearchEvidenceView): string {
  const seen = new Set<string>()
  for (const source of evidence.sources ?? []) {
    const url = source.url.trim()
    if (url === '' || seen.has(url)) continue
    seen.add(url)
    return url
  }
  return evidence.url?.trim() ?? ''
}
export function sourceHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url.replace(/^https?:\/\//, '').split('/')[0] ?? ''
  }
}
export function verificationLabel(value: ResearchVerification, t: Translate): string { return value === 'PASS' ? t('verify.pass') : value === 'WARNING' ? t('verify.warning') : value === 'FAIL' ? t('verify.fail') : '' }
export function splitEmoji(value: string): [string, string] { const first = Array.from(value.trim())[0] ?? ''; return /\p{Extended_Pictographic}/u.test(first) ? [first, value.trim().slice(first.length).trim() || value] : ['', value] }
export function formatDate(value: number): string { return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(value) }
export function messageOf(value: unknown): string { return value instanceof Error ? value.message : String(value) }

/** Escape text for both the HTML title and report body, never markup. */
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/** HTML exports render literal text; Markdown and mindmap retain their source formats. */
export function reportExportContent(project: ResearchProject, accepted: ResearchEvidenceView[], format: 'md' | 'html' | 'mindmap'): string {
  if (!project.report) return ''
  let content = ''
  if (format === 'md') {
    content = `# ${project.title}\n\n${project.report}\n\n## 引用来源与证据链\n` + accepted.map(a => `- [${a.confidence.toUpperCase()}] ${a.claim} (${primaryEvidenceUrl(a)})`).join('\n')
  } else if (format === 'html') {
    const title = escapeHtml(project.title)
    const report = escapeHtml(project.report).replace(/\n/g, '<br/>')
    content = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:system-ui,-apple-system,sans-serif;max-width:860px;margin:40px auto;line-height:1.7;padding:0 20px;}blockquote{border-left:4px solid currentColor;margin:0;padding-left:16px;}code{padding:2px 6px;border-radius:4px;}</style></head><body><h1>${title}</h1><div>${report}</div></body></html>`
  } else if (format === 'mindmap') {
    content = `# ${project.title}\n## 核心目标\n- ${project.goal || project.question}\n## 调研子课题\n` + project.questions.map(q => `- ${q.text}`).join('\n')
  }
  return content
}
