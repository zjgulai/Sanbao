/** Workspace presentation: plan review, investigation board and report. */

import { useMemo, type Dispatch, type SetStateAction } from 'react'
import { IconCheckOutline14 as IconCheck, IconChevronDownOutline14 as IconChevronDown, IconChevronLeftOutline14 as IconArrowLeft, IconGoalOutline16 as IconTarget, IconLoadingOutline16 as IconLoading, IconPlusOutline16 as IconPlus, IconRightUpOutline14 as IconExternalLink, IconSparkle16 as IconBolt, MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ResearchProject } from '../types.ts'
import type { ResearchViewApi } from './view-types.ts'
import type { DeepResearchKey } from './locales.ts'
import { useReportExport, useResearchWorkspace } from './use-research-workspace.ts'
import {
  boardLimitations, boardScouts, clipLabel, confidenceLabel, coverageLabel, depthLabel,
  formatDepLabel, isSettledQuestion, ordinal, phaseLabel, primaryEvidenceUrl, reachableStep,
  readableDraft, removePlanQuestion, resolveIndexes, scoutStatusLabel, sourceHostname, statusLabel, toolLabel, verificationLabel,
  type EditableQuestion, type LimitationView, type QuestionIndex, type ResearchEvidenceView,
  type ResearchQuestionView, type ResearchScoutView, type ResearchStep, type Translate,
} from './research-view-model.ts'
import css from './views.module.css'

export function ResearchWorkspace({ project, api, t, onChange, onBack, onDelete, error, setError }: { project: ResearchProject; api: ResearchViewApi; t: Translate; onChange: (project: ResearchProject) => void; onBack: () => void; onDelete: () => void; error: string | null; setError: (value: string | null) => void }) {
  const {
    goal, setGoal, questions, setQuestions, busy, setFocus, activeStep,
    running, paused, canContinue, canWrite, savePlan, confirmAndStart,
    stopRun, resumeRun, rewriteReport,
  } = useResearchWorkspace({ project, api, t, onChange, setError })

  const steps: ReadonlyArray<readonly [ResearchStep, DeepResearchKey]> = [['plan', 'stepper.plan'], ['investigate', 'stepper.investigate'], ['report', 'stepper.report']]
  return <div className={css.workspace}>
    <header className={css.workspaceHeader}>
      <button className={css.backButton} type="button" onClick={onBack}><IconArrowLeft size={15} />{t('workspace.back')}</button>
      <div className={css.projectHeading}><p className={css.eyebrow}>RESEARCH PROJECT</p><h2>{project.title}</h2></div>
      <div className={css.headerActions}>
        <span className={css.phase} data-phase={paused ? 'aborted' : project.phase}>{phaseLabel(project, t)}</span>
        {running ? <button className={css.stopButton} type="button" disabled={busy} onClick={stopRun}>{t('investigate.stop')}</button> : null}
        {canContinue ? <button className={css.secondaryButton} type="button" disabled={busy} onClick={resumeRun}>{project.planConfirmed ? t('investigate.continue') : t('plan.retry')}</button> : null}
        {canWrite && (project.phase === 'ready_for_report' || project.phase === 'writing' || project.phase === 'done' || project.phase === 'incomplete') ? <button className={css.primaryButton} type="button" disabled={busy} onClick={rewriteReport}>{project.report ? t('report.retry') : t('investigate.writeReport')}</button> : null}
        <button className={css.deleteText} type="button" onClick={onDelete}>{t('workspace.delete')}</button>
      </div>
    </header>
    <div className={css.progressBar}><nav className={css.stepper}>{steps.map(([id, key]) => {
      const reachable = reachableStep(project, id)
      return <button key={id} type="button" disabled={!reachable} data-active={activeStep === id} onClick={() => { setFocus(id) }}>{t(key)}</button>
    })}</nav></div>
    {error === null ? null : <div className={css.error}>{error}</div>}
    <div className={css.detailBody}>
    <span data-deepresearch-view="" hidden />
      {activeStep !== 'plan' ? null : <PlanStep project={project} t={t} busy={busy} goal={goal} setGoal={setGoal} questions={questions} setQuestions={setQuestions} onSave={savePlan} onConfirm={() => { void confirmAndStart() }} onRetry={resumeRun} />}
      {activeStep !== 'investigate' ? null : <InvestigatePane project={project} t={t} busy={busy} onStop={stopRun} onContinue={resumeRun} onWrite={rewriteReport} />}
      {activeStep !== 'report' ? null : <ReportPane project={project} t={t} busy={busy} onRewrite={rewriteReport} />}
    </div>
  </div>
}

/** Plan step: waiting shell, planner failure, or the reviewable plan itself. */
function PlanStep({ project, t, busy, goal, setGoal, questions, setQuestions, onSave, onConfirm, onRetry }: { project: ResearchProject; t: Translate; busy: boolean; goal: string; setGoal: (value: string) => void; questions: EditableQuestion[]; setQuestions: Dispatch<SetStateAction<EditableQuestion[]>>; onSave: () => void; onConfirm: () => void; onRetry: () => void }) {
  if (project.phase === 'planning' && project.questions.length === 0) {
    const stopped = project.runState !== 'running'
    return <section className={css.planPane}>
      <div className={css.planningState}>
        <span className={css.planningIcon} aria-hidden="true">{stopped ? <IconTarget size={22} /> : <IconLoading className={css.spinner} size={22} />}</span>
        <div>
          <h3>{stopped ? t('plan.stopped') : t('phase.planning')}</h3>
          <p>{stopped ? t('plan.stoppedHint') : t('plan.subtitle')}</p>
          {stopped ? <button className={css.primaryButton} type="button" disabled={busy} onClick={onRetry}>{t('plan.retry')}</button> : null}
        </div>
      </div>
    </section>
  }
  if (project.phase === 'failed' && !project.planConfirmed && project.questions.length === 0) {
    return <section className={css.planPane}>
      <div className={css.planFailure} role="alert">
        <h3>{t('plan.failedTitle')}</h3>
        <p>{t('plan.failedHint')}</p>
        {project.limitations.map(item => <code key={item}>{item}</code>)}
      </div>
    </section>
  }

  const locked = project.planConfirmed || busy
  const updateQuestion = (index: number, patch: Partial<EditableQuestion>) => {
    setQuestions(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item))
  }
  return <section className={css.planPane}>
    <div className={css.sectionHeader}>
      <div>
        <p className={css.planEyebrow}>{t('plan.title')}</p>
        <h3 className={css.planQuestionTitle}>{project.question}</h3>
        <p>{t('plan.subtitle')}</p>
      </div>
      <div className={css.headerActions}>
        <span className={css.planDepth}>{`${t('composer.depth')} · ${depthLabel(project.depth, t)}`}</span>
        {project.planConfirmed
          ? <span className={css.confirmed}><IconCheck size={13} />{t('plan.confirmed')}</span>
          : <>
            <button className={css.secondaryButton} type="button" disabled={busy} onClick={onSave}>{t('action.saveChanges')}</button>
            <button className={css.primaryButton} type="button" disabled={busy || questions.length === 0} onClick={onConfirm}>{t('action.confirmStart')}</button>
          </>}
      </div>
    </div>
    <label className={css.goalBlock}>
      <span>{t('plan.goal')}</span>
      <textarea value={goal} disabled={locked} onChange={event => { setGoal(event.target.value) }} />
    </label>
    <div className={css.planList}>
      <span className={css.planListLabel}>{t('plan.criteria')}</span>
      {questions.map((question, index) => {
        const criteria = question.criteria.filter(item => item.trim() !== '')
        const deps = question.dependsOn ?? []
        return <section className={css.planQuestion} key={`${project.id}-${index}`}>
          <span>{ordinal(index)}</span>
          <div>
            {project.planConfirmed
              ? <h4>{question.text}</h4>
              : <textarea value={question.text} disabled={busy} onChange={event => { updateQuestion(index, { text: event.target.value }) }} />}
            {project.planConfirmed
              ? <ul className={css.criteriaList}>{criteria.map((item, itemIndex) => <li key={`${index}-${itemIndex}`}>{item}</li>)}</ul>
              : <label>{t('plan.criteria')}<textarea value={question.criteria.join('\n')} disabled={busy} onChange={event => { updateQuestion(index, { criteria: event.target.value.split('\n') }) }} /></label>}
            {deps.length === 0 ? null : <div className={css.depBlock}>
              <span className={css.depLabel}>{t('plan.dependsOn')}</span>
              <div className={css.depChips}>
                {deps.map(dep => <span className={css.depChip} key={`${index}-${dep}`}>{t('plan.dependsOnChip', { label: formatDepLabel(dep, questions[dep]?.text ?? '') })}</span>)}
              </div>
              <small className={css.depHint}>{t('plan.dependsOnHint')}</small>
            </div>}
            {!project.planConfirmed ? <div className={css.planActionRow}>
              <span />
              <button className={css.exportButton} type="button" disabled={busy || questions.length <= 1} onClick={() => { setQuestions(curr => removePlanQuestion(curr, index)) }}>{t('plan.removeQuestion')}</button>
            </div> : null}
          </div>
        </section>
      })}
      {!project.planConfirmed ? <div style={{ padding: '16px 0' }}>
        <button className={css.secondaryButton} type="button" disabled={busy} onClick={() => { setQuestions(curr => [...curr, { text: '新增补充子问题', criteria: ['核验该子问题关联的权威事实'], dependsOn: [] }]) }}><IconPlus size={14} />{t('plan.addQuestion')}</button>
      </div> : null}
    </div>
  </section>
}

/** Investigate step: timeline first, then questions + limitations, then evidence. */
function InvestigatePane({ project, t, busy, onStop, onContinue, onWrite }: { project: ResearchProject; t: Translate; busy: boolean; onStop: () => void; onContinue: () => void; onWrite: () => void }) {
  const indexOf = useMemo<QuestionIndex>(() => new Map(project.questions.map((question, index) => [question.id, index])), [project.questions])
  const scouts = useMemo(() => boardScouts(project), [project])
  const scoutOf = useMemo(() => new Map(scouts.map(scout => [scout.questionId, scout])), [scouts])
  const settledQuestions = project.questions.filter(item => isSettledQuestion(item.status)).length
  const settledScouts = scouts.filter(item => item.status === 'done' || item.status === 'partial' || item.status === 'blocked').length
  const accepted = project.evidence.filter(item => item.status !== 'candidate' && item.status !== 'rejected').length
  const limitations = boardLimitations(project, t, project.phase === 'investigating')

  return <section className={css.investigatePane}>
    <header className={css.questionHeader}>
      <span>{t('composer.question')}</span>
      <h3>{project.question}</h3>
      {project.goal === '' ? null : <p>{project.goal}</p>}
    </header>
    {project.phase === 'investigating' && project.runState === 'running' ? <div className={css.runningBanner} role="status"><IconLoading className={css.spinner} size={16} /><span>{t('investigate.running')}</span><button className={css.stopButton} type="button" disabled={busy} onClick={onStop}>{t('investigate.stop')}</button></div> : null}
    {project.runState === 'paused' && ['investigating', 'incomplete', 'writing', 'aborted'].includes(project.phase) ? <div className={css.pausedBanner} role="status"><IconTarget size={15} /><div><strong>{t('phase.aborted')}</strong><p>{t('investigate.pausedHint')}</p></div><div className={css.bannerActions}><button className={css.secondaryButton} type="button" disabled={busy} onClick={onContinue}>{t('investigate.continue')}</button>{project.questions.every(item => isSettledQuestion(item.status)) ? <button className={css.primaryButton} type="button" disabled={busy} onClick={onWrite}>{t('investigate.writeReport')}</button> : null}</div></div> : null}
    {project.phase === 'ready_for_report' && project.runState !== 'running' ? <div className={css.readyBanner} role="status"><IconCheck size={15} /><div><strong>{t('investigate.readyTitle')}</strong><p>{t('investigate.readyHint')}</p></div><button className={css.primaryButton} type="button" disabled={busy} onClick={onWrite}>{t('investigate.writeReport')}</button></div> : null}
    {project.phase === 'incomplete' && project.runState !== 'paused' ? <div className={css.incompleteBanner} role="status"><IconTarget size={15} /><div><strong>{t('investigate.incompleteTitle')}</strong><p>{t('investigate.incompleteHint')}</p></div></div> : null}
    <div className={css.metrics}>
      <Metric label={t('metric.subQuestions')} value={`${settledQuestions}/${project.questions.length}`} />
      <Metric label={t('metric.evidence')} value={String(accepted)} />
      <Metric label={t('investigate.scouts')} value={`${settledScouts}/${scouts.length}`} />
    </div>
    <section className={css.timeline}>
      <div className={css.sectionHeader}><div><h3>{t('investigate.title')}</h3><p>{t('investigate.subtitle')}</p></div></div>
      {scouts.map(scout => <ScoutCard key={scout.questionId} project={project} scout={scout} indexOf={indexOf} t={t} />)}
    </section>
    <div className={css.boardGrid}>
      <div className={css.questions}>
        <h4 className={css.boardHeading}>{t('investigate.questions')} <span>{project.questions.length}</span></h4>
        {project.questions.map((question, index) => <QuestionCard key={question.id} project={project} question={question} index={index} indexOf={indexOf} scout={scoutOf.get(question.id)} t={t} />)}
      </div>
      <LimitationsBoard items={limitations} t={t} always />
    </div>
    <section className={css.evidencePane}>
      <h4 className={css.boardHeading}>{t('evidence.title')} <span>{project.evidence.length}</span></h4>
      {project.evidence.length === 0
        ? <div className={css.evidenceEmpty}><span><IconTarget size={17} /></span><p>{t('evidence.empty')}</p></div>
        : <div className={css.evidenceGrid}>{project.evidence.map(item => <EvidenceCard key={item.id} evidence={item} t={t} />)}</div>}
    </section>
  </section>
}

function QuestionCard({ project, question, index, indexOf, scout, t }: { project: ResearchProject; question: ResearchQuestionView; index: number; indexOf: QuestionIndex; scout: ResearchScoutView | undefined; t: Translate }) {
  const deps = resolveIndexes(question.dependsOn, indexOf)
  const waiting = resolveIndexes(scout?.waitingOn ?? [], indexOf)
  const gaps = question.gaps ?? []
  const label = (at: number) => formatDepLabel(at, project.questions[at]?.text ?? '')
  const waitingOnDeps = waiting.length > 0
  const queued = !waitingOnDeps && scout?.status === 'waiting'
  return <article className={css.questionCard} data-status={waitingOnDeps ? 'waiting' : question.status} data-live={question.status === 'running' || undefined}>
    <div className={css.questionTitle}>
      <span>{ordinal(index)}</span>
      <div>
        <h4>{question.text}</h4>
        {deps.length === 0 ? null : <div className={css.depChips}>
          {deps.map(at => <span className={css.depChip} key={at}>{t('plan.dependsOnChip', { label: label(at) })}</span>)}
        </div>}
        {waiting.length === 0 ? null : <p className={css.waitingLine}>{t('investigate.waitingOn', { list: waiting.map(label).join('、') })}</p>}
        {gaps.length === 0 ? null : <p className={css.gapLine}>{`${t('investigate.gaps')}: ${gaps.join(' · ')}`}</p>}
      </div>
      <strong data-status={waitingOnDeps ? 'waiting' : queued ? 'pending' : question.status}>{waitingOnDeps ? t('investigate.waitingStatus') : queued ? t('investigate.queued') : statusLabel(question.status, t)}</strong>
    </div>
  </article>
}

function ScoutCard({ project, scout, indexOf, t }: { project: ResearchProject; scout: ResearchScoutView; indexOf: QuestionIndex; t: Translate }) {
  const at = indexOf.get(scout.questionId)
  const question = at === undefined ? undefined : project.questions[at]
  const title = question?.text ?? String(scout.questionId)
  const waiting = scout.status === 'waiting'
  const verifying = scout.status === 'verifying' || scout.role === 'evaluator'
  const live = scout.status === 'running' || verifying
  const failed = scout.status === 'blocked'
  const partial = scout.status === 'partial'
  const accepted = project.evidence.filter(item => item.questionId === scout.questionId && item.status !== 'candidate' && item.status !== 'rejected')
  const activity = scout.activity.trim() !== ''
    ? scout.activity
    : verifying
      ? t('investigate.evaluating')
      : waiting
        ? (scout.waitingOn.length > 0 ? t('investigate.waitingOn', { list: resolveIndexes(scout.waitingOn, indexOf).map(item => formatDepLabel(item, project.questions[item]?.text ?? '')).join('、') }) : t('investigate.queuedHint'))
        : live
          ? (scout.activeCriterionText || t('investigate.running'))
          : ''
  const scoutDraft = readableDraft(scout.scoutDraft)
  const evaluatorDraft = readableDraft(scout.evaluatorDraft)
  const criterionLabel = clipLabel(scout.activeCriterionText, 36)
  return <details className={css.scoutCard} data-status={scout.status} data-role={scout.role} data-live={live || undefined} open={live || waiting || failed || undefined}>
    <summary className={css.scoutSummary}>
      <span className={css.scoutIcon} data-status={waiting ? 'waiting' : live ? 'running' : failed || partial ? scout.status : 'done'}>
        {live ? <IconLoading className={css.spinner} size={14} /> : failed || partial ? <IconTarget size={14} /> : waiting ? <IconTarget size={14} /> : <IconCheck size={14} />}
      </span>
      <span className={css.scoutSummaryBody}>
        <strong>{title}</strong>
        <span className={css.scoutMetaRow}>
          <span className={css.scoutChip} data-kind={verifying ? 'verify' : 'role'}>{verifying ? t('investigate.verifying') : t('investigate.scouts')}</span>
          <span className={css.scoutChip}>{t('investigate.toolsUsed', { used: scout.toolsUsed, cap: scout.toolsCap || 10 })}</span>
          <span className={css.scoutChip}>{t('investigate.evidenceCount', { count: accepted.length })}</span>
          {criterionLabel === '' || !live ? null : <span className={css.scoutChip} data-kind="criterion">{criterionLabel}</span>}
        </span>
      </span>
      <span className={css.scoutStatus} data-live={live || undefined}>{scoutStatusLabel(scout, t)}</span>
      <IconChevronDown size={14} />
    </summary>
    <div className={css.scoutBody}>
      {activity === '' ? null : <p className={css.scoutActivity} data-live={live || undefined}>{live ? <IconLoading className={css.spinner} size={12} /> : waiting ? <IconTarget size={12} /> : null}<span>{activity}</span></p>}
      {question === undefined || question.criteria.length === 0 ? null : <CriterionList criteria={question.criteria} scout={scout} t={t} />}
      {(scout.tools ?? []).length === 0 ? null : <ul className={css.toolList}>
        {scout.tools.map((tool, index) => <li key={`${tool.name}-${index}`} data-status={tool.status}><b>{toolLabel(tool.name, t)}</b><span>{tool.detail}</span></li>)}
      </ul>}
      {accepted.length === 0 ? null : <div className={css.scoutEvidence}>
        {accepted.slice(0, 8).map(item => <EvidenceCard key={item.id} evidence={item} t={t} />)}
      </div>}
      {scout.dependencySummary === '' ? null : <details className={css.handoff} open={waiting || undefined}><summary>{t('investigate.dependencySummary')}</summary><pre>{scout.dependencySummary}</pre></details>}
      {scoutDraft === '' ? null : <details className={css.handoff}><summary>{t('investigate.scoutDraft')}</summary><pre>{scoutDraft}</pre></details>}
      {evaluatorDraft === '' ? null : <details className={css.handoff}><summary>{t('investigate.evaluatorDraft')}</summary><pre>{evaluatorDraft}</pre></details>}
      {scout.handoff === '' ? null : <details className={css.handoff}><summary>{t('investigate.handoff')}</summary><pre>{scout.handoff}</pre></details>}
    </div>
  </details>
}

function CriterionList({ criteria, scout, t }: { criteria: ResearchQuestionView['criteria']; scout: ResearchScoutView | undefined; t: Translate }) {
  const live = scout?.status === 'running' || scout?.status === 'verifying'
  const verifying = scout?.status === 'verifying' || scout?.role === 'evaluator'
  const cap = Math.max(1, scout?.toolsCap || 10)
  if (criteria.length === 0) return null
  return <div className={css.coverage}>
    <h5>{t('investigate.coverage')}</h5>
    <ul className={css.coverageList}>
      {criteria.map(criterion => {
        const active = Boolean(live && scout !== undefined && scout.activeCriterionId === criterion.id)
        const used = active && scout !== undefined ? scout.toolsUsed : (criterion.toolCount ?? 0)
        const atCap = used >= cap
        const status = active && verifying ? t('investigate.verifying') : coverageLabel(criterion.status, t)
        const verification = verificationLabel(criterion.verification, t)
        return <li key={criterion.id} className={css.coverageItem} data-status={criterion.status} data-active={active || undefined} data-verify={criterion.verification || undefined}>
          <div className={css.coverageHead}>
            <b>{criterion.text}</b>
            <span>
              {active ? `${t('investigate.activeNow')} · ` : ''}
              {status}
              {verification === '' ? '' : ` · ${verification}`}
              {` · ${t('investigate.toolsUsed', { used, cap })}`}
              {atCap ? ` · ${t('investigate.capReached')}` : ''}
            </span>
          </div>
          {criterion.summary === '' ? null : <p>{`${t('investigate.summary')}: ${criterion.summary}`}</p>}
          {criterion.warning === '' ? null : <em data-tone="warning">{`${t('investigate.warning')}: ${criterion.warning}`}</em>}
          {criterion.gap === '' ? null : <em data-tone="gap">{`${t('investigate.gaps')}: ${criterion.gap}`}</em>}
        </li>
      })}
    </ul>
  </div>
}

function EvidenceCard({ evidence, t }: { evidence: ResearchEvidenceView; t: Translate }) {
  const url = primaryEvidenceUrl(evidence)
  const host = sourceHostname(url)
  return <article className={css.evidenceCard} data-status={evidence.status}>
    <div>
      <span data-confidence={evidence.confidence}>{confidenceLabel(evidence.confidence, t)}</span>
      {host === '' ? null : <span title={url}>{host}</span>}
    </div>
    <p>{evidence.claim}</p>
    {url === '' ? null : <a href={url} target="_blank" rel="noreferrer" title={url}><IconExternalLink size={12} /><span>{host || url}</span></a>}
  </article>
}

function ReportPane({ project, t, busy, onRewrite }: { project: ResearchProject; t: Translate; busy: boolean; onRewrite: () => void }) {
  const accepted = project.evidence.filter(item => item.status !== 'candidate' && item.status !== 'rejected')
  const writing = project.phase === 'writing' && project.runState === 'running'
  const { copyNotice, handleExport } = useReportExport({ project, accepted, t })

  // `MarkdownText` 的 `labels` 必须是**引用稳定**的对象（换身份会丢掉流式渲染缓存），
  // 所以按 locale 记忆，而不是每次渲染现造一个（ADR-0055）。
  const markdownLabels = useMemo(() => ({
    code: { copyLabel: t('markdown.codeCopy'), copiedLabel: t('markdown.codeCopied') },
    footnotes: t('markdown.footnotes'),
  }), [t])

  return <section className={css.reportPane}>
    <div className={css.sectionHeader}>
      <div>
        <h3>{t('report.title')}</h3>
        <p>{t('report.subtitle')}</p>
      </div>
      <div className={css.headerActions}>
        {project.report ? <div className={css.exportButtonGroup}>
          <button className={css.exportButton} type="button" onClick={() => { handleExport('md') }}>{t('report.exportMarkdown')}</button>
          <button className={css.exportButton} type="button" onClick={() => { handleExport('html') }}>{t('report.exportHtml')}</button>
          <button className={css.exportButton} type="button" onClick={() => { handleExport('mindmap') }}>{t('report.exportMindmap')}</button>
        </div> : null}
        {project.planConfirmed && !writing ? <button className={css.primaryButton} type="button" disabled={busy} onClick={onRewrite}>{project.report ? t('report.retry') : t('investigate.writeReport')}</button> : null}
      </div>
    </div>
    {copyNotice ? <div className={css.confirmed} style={{ margin: '8px 0' }}><IconCheck size={14} />{copyNotice}</div> : null}

    {/* 顶尖研报：Executive Summary 与 Key Takeaways 顶栏卡片 */}
    {project.report ? <div className={css.executiveCard}>
      <h4><IconBolt size={14} />{t('report.executiveSummary')}</h4>
      <p>{project.goal ? `围绕核心命题「${project.question}」，基于已穿透核验的 ${accepted.length} 项多方信源证据生成全景研报。` : project.question}</p>
      <ul className={css.takeawayList}>
        <li className={css.takeawayItem}><b>🎯 研究核心</b><span>{project.question}</span></li>
        <li className={css.takeawayItem}><b>🔍 证据覆盖</b><span>{accepted.length} 条已核验证据链 · {project.questions.length} 个子领域</span></li>
        <li className={css.takeawayItem}><b>⚡ 研判置信度</b><span>{accepted.some(a => a.confidence === 'high') ? '高 (多方独立交叉验证通过)' : '中 (基线证据充足)'}</span></li>
      </ul>
    </div> : null}

    {project.report !== null
      ? <article className={`${css.reportDocument} ${css.auroraGlow}`}><MarkdownText text={project.report} streaming={writing} labels={markdownLabels} /></article>
      : writing
        ? <div className={css.reportPending} role="status"><IconLoading className={css.spinner} size={16} /><span>{t('report.writing')}</span></div>
        : <div className={css.reportPending}>{t('report.empty')}</div>}
    {accepted.length === 0 ? null : <section className={css.evidencePane}>
      <h4 className={css.boardHeading}>{t('evidence.sourcesTitle')} <span>{accepted.length}</span></h4>
      <div className={css.evidenceGrid}>{accepted.map(item => <EvidenceCard key={item.id} evidence={item} t={t} />)}</div>
    </section>}
  </section>
}


function LimitationsBoard({ items, t, always }: { items: LimitationView[]; t: Translate; always?: boolean }) {
  if (!always && items.length === 0) return null
  return <section className={css.limitationsBoard}>
    <h4>{t('report.limitations')}{items.length === 0 ? null : <span>{items.length}</span>}</h4>
    {items.length === 0
      ? <p className={css.limitationsEmpty}>{t('report.limitationsEmpty')}</p>
      : <ul className={css.limitationList}>
        {items.map(item => <li key={item.key} className={css.limitationItem} data-status={item.status || undefined}>
          <div className={css.limitationHead}>
            {item.ref === '' ? null : <span>{item.ref}</span>}
            {item.status === '' ? null : <b>{coverageLabel(item.status, t)}</b>}
          </div>
          <p>{item.text}</p>
        </li>)}
      </ul>}
  </section>
}

function Metric({ label, value }: { label: string; value: string }) { return <div><span>{label}</span><strong>{value}</strong></div> }
