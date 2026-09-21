/** Library state, route loading and remote mutation coordination. */
import { type ResearchProject, type ResearchStartRequest } from '../types.ts';
import { type PendingDelete, type PhaseFilter, type Translate } from './research-view-model.ts';
import type { ResearchViewApi } from './view-types.ts';
type ResearchLibraryOptions = {
    api: ResearchViewApi;
    t: Translate;
    projectId?: string | null;
    onSelectProject?: (id: string | null) => void;
};
export declare function useResearchLibrary({ api, t, projectId, onSelectProject }: ResearchLibraryOptions): {
    projects: readonly ResearchProject[];
    selected: ResearchProject | null;
    query: string;
    setQuery: import("react").Dispatch<import("react").SetStateAction<string>>;
    filter: PhaseFilter;
    setFilter: import("react").Dispatch<import("react").SetStateAction<PhaseFilter>>;
    viewMode: "list" | "grid";
    setViewMode: import("react").Dispatch<import("react").SetStateAction<"list" | "grid">>;
    sort: "title" | "recent";
    setSort: import("react").Dispatch<import("react").SetStateAction<"title" | "recent">>;
    composerOpen: boolean;
    setComposerOpen: import("react").Dispatch<import("react").SetStateAction<boolean>>;
    busy: boolean;
    setBusy: import("react").Dispatch<import("react").SetStateAction<boolean>>;
    error: string | null;
    setError: import("react").Dispatch<import("react").SetStateAction<string | null>>;
    pendingDelete: PendingDelete | null;
    setPendingDelete: import("react").Dispatch<import("react").SetStateAction<PendingDelete | null>>;
    deleteBusy: boolean;
    projectLoading: boolean;
    visible: ResearchProject[];
    openProject: (project: ResearchProject | null) => void;
    refresh: (nextQuery: string) => Promise<void>;
    requestDelete: (target: PendingDelete) => void;
    confirmDelete: () => Promise<void>;
    updateSelected: (project: ResearchProject) => void;
    createProject: (request: ResearchStartRequest) => Promise<void>;
};
export {};
//# sourceMappingURL=use-research-library.d.ts.map