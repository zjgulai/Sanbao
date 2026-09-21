/** Workspace drafts, progress lifecycle and remote mutation coordination. */
import type { ResearchProject } from '../types.ts';
import { type ResearchEvidenceView, type ResearchStep, type Translate } from './research-view-model.ts';
import type { ResearchViewApi } from './view-types.ts';
type ResearchWorkspaceOptions = {
    project: ResearchProject;
    api: ResearchViewApi;
    t: Translate;
    onChange: (project: ResearchProject) => void;
    setError: (value: string | null) => void;
};
export declare function useResearchWorkspace({ project, api, t, onChange, setError }: ResearchWorkspaceOptions): {
    goal: string;
    setGoal: import("react").Dispatch<import("react").SetStateAction<string>>;
    questions: {
        readonly text: string;
        readonly criteria: string[];
        readonly dependsOn?: number[];
    }[];
    setQuestions: import("react").Dispatch<import("react").SetStateAction<{
        readonly text: string;
        readonly criteria: string[];
        readonly dependsOn?: number[];
    }[]>>;
    busy: boolean;
    setFocus: import("react").Dispatch<import("react").SetStateAction<ResearchStep>>;
    activeStep: ResearchStep;
    running: boolean;
    paused: boolean;
    canContinue: boolean;
    canWrite: boolean;
    savePlan: () => void;
    confirmAndStart: () => Promise<void>;
    stopRun: () => void;
    resumeRun: () => void;
    rewriteReport: () => void;
};
/** Kept at report-pane mount scope, including its existing notice timer semantics. */
export declare function useReportExport({ project, accepted, t }: {
    project: ResearchProject;
    accepted: ResearchEvidenceView[];
    t: Translate;
}): {
    copyNotice: string | null;
    handleExport: (format: "md" | "html" | "mindmap") => void;
};
export {};
//# sourceMappingURL=use-research-workspace.d.ts.map