/** Codemini-aligned Deep Research library and its project/delete presentation. */
import type { ResearchViewApi } from './view-types.ts';
import { type Translate } from './research-view-model.ts';
/** Props for the global Deep Research workspace surface. */
type ResearchViewProps = ResearchViewApi & {
    t: Translate;
    projectId?: string | null;
    onSelectProject?: (id: string | null) => void;
    onClose?: () => void;
};
/** Render the research library, reviewable plan, live investigation board, and report. */
export declare function ResearchView({ t, projectId, onSelectProject, onClose, ...api }: ResearchViewProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=ResearchView.d.ts.map