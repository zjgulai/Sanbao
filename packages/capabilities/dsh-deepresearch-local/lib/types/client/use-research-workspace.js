/** Workspace drafts, progress lifecycle and remote mutation coordination. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { editablePlan, messageOf, reportExportContent, reachableStep, stepFor } from "./research-view-model.js";
export function useResearchWorkspace({ project, api, t, onChange, setError }) {
    const [focus, setFocus] = useState(stepFor(project));
    const [goal, setGoal] = useState(project.goal);
    const [questions, setQuestions] = useState(() => editablePlan(project));
    const [busy, setBusy] = useState(false);
    const prevPhase = useRef(project.phase);
    useEffect(() => {
        setGoal(project.goal);
        setQuestions(editablePlan(project));
        const from = prevPhase.current;
        prevPhase.current = project.phase;
        setFocus(current => {
            const target = stepFor(project);
            if (from !== project.phase && target === 'investigate' && current === 'plan')
                return 'investigate';
            if (from !== project.phase && target === 'report' && current !== 'report')
                return 'report';
            return reachableStep(project, current) ? current : target;
        });
    }, [project.phase, project.goal, project.id, project.updatedAt]);
    const seenUpdatedAt = useRef(project.updatedAt);
    seenUpdatedAt.current = project.updatedAt;
    const applyLatest = useCallback((latest) => {
        if (latest.id !== project.id || latest.updatedAt === seenUpdatedAt.current)
            return;
        onChange(latest);
    }, [onChange, project.id]);
    useEffect(() => {
        let active = true;
        const unsubscribe = api.subscribeProgress(latest => {
            if (active)
                applyLatest(latest);
        });
        return () => { active = false; unsubscribe(); };
    }, [api.subscribeProgress, applyLatest]);
    useEffect(() => {
        if (project.runState !== 'running')
            return;
        let active = true;
        let inFlight = false;
        const sync = () => {
            if (!active || inFlight)
                return;
            inFlight = true;
            void api.get(project.id).then(latest => {
                if (active && latest !== null)
                    applyLatest(latest);
            }).finally(() => { inFlight = false; });
        };
        sync();
        const timer = window.setInterval(sync, 2500);
        return () => { active = false; window.clearInterval(timer); };
    }, [api, applyLatest, project.id, project.runState]);
    const run = useCallback(async (operation) => {
        setBusy(true);
        setError(null);
        try {
            onChange(await operation());
        }
        catch (cause) {
            setError(messageOf(cause));
        }
        finally {
            setBusy(false);
        }
    }, [onChange, setError]);
    // Constraints are collected once in the composer context and are never edited here.
    const planRequest = useCallback(() => ({
        id: project.id,
        goal: goal.trim(),
        constraints: project.constraints,
        depth: project.depth,
        questions: questions
            .map(question => ({ ...question, text: question.text.trim(), criteria: question.criteria.map(item => item.trim()).filter(Boolean) }))
            .filter(question => question.text !== '' && question.criteria.length > 0),
    }), [goal, project.constraints, project.depth, project.id, questions]);
    const savePlan = useCallback(() => { void run(() => api.updatePlan(planRequest())); }, [api, planRequest, run]);
    const confirmAndStart = useCallback(async () => {
        if (busy)
            return;
        setBusy(true);
        setError(null);
        try {
            const saved = await api.updatePlan(planRequest());
            onChange(await api.confirmPlan(saved.id));
            setFocus('investigate');
        }
        catch (cause) {
            setError(messageOf(cause));
        }
        finally {
            setBusy(false);
        }
    }, [api, busy, onChange, planRequest, setError]);
    const running = project.runState === 'running';
    const paused = project.runState === 'paused';
    const canContinue = paused && ['planning', 'investigating', 'incomplete', 'writing', 'aborted', 'failed'].includes(project.phase);
    const canWrite = project.planConfirmed && !running && ['ready_for_report', 'writing', 'done', 'incomplete', 'investigating'].includes(project.phase);
    const stopRun = useCallback(() => { void run(() => api.fail(project.id, t('investigate.stopReason'), true)); }, [api, project.id, run, t]);
    const resumeRun = useCallback(() => { void run(() => api.resume(project.id)); }, [api, project.id, run]);
    const rewriteReport = useCallback(() => {
        void run(async () => {
            const next = await api.writeReport(project.id);
            setFocus('report');
            return next;
        });
    }, [api, project.id, run]);
    const activeStep = reachableStep(project, focus) ? focus : stepFor(project);
    return {
        goal, setGoal, questions, setQuestions, busy, setFocus, activeStep,
        running, paused, canContinue, canWrite, savePlan, confirmAndStart,
        stopRun, resumeRun, rewriteReport,
    };
}
/** Kept at report-pane mount scope, including its existing notice timer semantics. */
export function useReportExport({ project, accepted, t }) {
    const [copyNotice, setCopyNotice] = useState(null);
    const handleExport = (format) => {
        if (!project.report)
            return;
        const content = reportExportContent(project, accepted, format);
        navigator.clipboard.writeText(content).then(() => {
            setCopyNotice(t('report.exportSuccess'));
            setTimeout(() => { setCopyNotice(null); }, 3000);
        }).catch(() => { });
    };
    return { copyNotice, handleExport };
}
//# sourceMappingURL=use-research-workspace.js.map