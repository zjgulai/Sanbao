/** Workspace presentation: plan review, investigation board and report. */
import type { ResearchProject } from '../types.ts';
import type { ResearchViewApi } from './view-types.ts';
import { type Translate } from './research-view-model.ts';
export declare function ResearchWorkspace({ project, api, t, onChange, onBack, onDelete, error, setError }: {
    project: ResearchProject;
    api: ResearchViewApi;
    t: Translate;
    onChange: (project: ResearchProject) => void;
    onBack: () => void;
    onDelete: () => void;
    error: string | null;
    setError: (value: string | null) => void;
}): import("react").JSX.Element;
//# sourceMappingURL=ResearchWorkspace.d.ts.map