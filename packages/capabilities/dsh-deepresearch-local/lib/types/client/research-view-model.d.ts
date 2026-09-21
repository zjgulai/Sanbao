/** Pure, package-private view projections shared by the research surfaces and hooks. */
import type { ResearchCoverageStatus, ResearchDepth, ResearchProject, ResearchStartRequest, ResearchVerification } from '../types.ts';
import type { DeepResearchKey } from './locales.ts';
export type PhaseFilter = 'all' | 'planning' | 'investigating' | 'done';
export type Translate = (key: DeepResearchKey, params?: Record<string, unknown>) => string;
export type EditableQuestion = ResearchStartRequest['questions'][number];
export type ResearchQuestionView = ResearchProject['questions'][number];
export type ResearchEvidenceView = ResearchProject['evidence'][number];
export type ResearchScoutView = ResearchProject['progress']['scouts'][number];
export type QuestionIndex = ReadonlyMap<ResearchQuestionView['id'], number>;
export type PendingDelete = {
    id: ResearchProject['id'];
    title: string;
};
export type ResearchStep = 'plan' | 'investigate' | 'report';
export type LimitationView = {
    key: string;
    status: ResearchCoverageStatus | '';
    ref: string;
    text: string;
};
/** Render a dependency reference as `01 · question text`, clipped to `max` characters. */
export declare function formatDepLabel(index: number, text: string, max?: number): string;
export declare function clipLabel(text: string, max: number): string;
export declare function readableDraft(text: string): string;
export declare function toolLabel(name: string, t: Translate): string;
export declare function isSettledQuestion(status: ResearchQuestionView['status']): boolean;
export declare function boardLimitations(project: ResearchProject, t: Translate, live: boolean): LimitationView[];
export declare function boardScouts(project: ResearchProject): ResearchScoutView[];
/** Remove one question without changing the targets of surviving index-based dependencies. */
export declare function removePlanQuestion(questions: readonly EditableQuestion[], removedIndex: number): EditableQuestion[];
export declare function ordinal(index: number): string;
export declare function resolveIndexes(ids: readonly ResearchQuestionView['id'][], indexOf: QuestionIndex): number[];
export declare function editablePlan(project: ResearchProject): EditableQuestion[];
export declare function stepFor(project: ResearchProject): ResearchStep;
export declare function reachableStep(project: ResearchProject, step: ResearchStep): boolean;
export declare function depthLabel(depth: ResearchDepth, t: Translate): string;
export declare function phaseLabel(project: Pick<ResearchProject, 'phase' | 'runState'>, t: Translate): string;
export declare function statusLabel(status: ResearchQuestionView['status'], t: Translate): string;
export declare function scoutStatusLabel(scout: ResearchScoutView, t: Translate): string;
export declare function coverageLabel(status: ResearchCoverageStatus, t: Translate): string;
export declare function confidenceLabel(value: ResearchProject['evidence'][number]['confidence'], t: Translate): string;
export declare function primaryEvidenceUrl(evidence: ResearchEvidenceView): string;
export declare function sourceHostname(url: string): string;
export declare function verificationLabel(value: ResearchVerification, t: Translate): string;
export declare function splitEmoji(value: string): [string, string];
export declare function formatDate(value: number): string;
export declare function messageOf(value: unknown): string;
/** HTML exports render literal text; Markdown and mindmap retain their source formats. */
export declare function reportExportContent(project: ResearchProject, accepted: ResearchEvidenceView[], format: 'md' | 'html' | 'mindmap'): string;
//# sourceMappingURL=research-view-model.d.ts.map