/** Composer-local form state and presentation; remote creation belongs to the library hook. */
import type { ResearchStartRequest } from '../types.ts';
import { type Translate } from './research-view-model.ts';
export declare function ResearchComposer({ busy, error, setBusy, t, onClose, onCreate, setError }: {
    busy: boolean;
    error: string | null;
    setBusy: (value: boolean) => void;
    t: Translate;
    onClose: () => void;
    onCreate: (request: ResearchStartRequest) => Promise<void>;
    setError: (value: string | null) => void;
}): import("react").JSX.Element;
//# sourceMappingURL=ResearchComposer.d.ts.map