import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** Composer-local form state and presentation; remote creation belongs to the library hook. */
import { useState } from 'react';
import { IconChevronDownOutline14 as IconChevronDown, IconChevronUpOutline14 as IconChevronUp, IconCloseOutline16 as IconX, IconGoalOutline16 as IconTarget, IconLoadingOutline16 as IconLoading, IconSparkle16 as IconBolt } from '@deepseek-ai/dsh-client-ui-primitives';
import { messageOf } from "./research-view-model.js";
import css from './views.module.css';
export function ResearchComposer({ busy, error, setBusy, t, onClose, onCreate, setError }) {
    const [question, setQuestion] = useState('');
    const [goal, setGoal] = useState('');
    const [constraints, setConstraints] = useState('');
    const [seedText, setSeedText] = useState('');
    const [depth, setDepth] = useState('standard');
    const [contextOpen, setContextOpen] = useState(false);
    const [selectedSources, setSelectedSources] = useState(['web', 'academic', 'news', 'docs']);
    const [budgetPreset, setBudgetPreset] = useState('balanced');
    const toggleSource = (source) => {
        setSelectedSources(current => current.includes(source) ? (current.length > 1 ? current.filter(s => s !== source) : current) : [...current, source]);
    };
    const contextCount = [goal, constraints, seedText].filter(value => value.trim() !== '').length;
    const submit = (event) => {
        event.preventDefault();
        const trimmed = question.trim();
        if (busy || trimmed === '')
            return;
        setBusy(true);
        setError(null);
        const augmentedConstraints = [
            constraints.trim(),
            `[定向检索源: ${selectedSources.join(', ')}]`,
            `[预算预设: ${budgetPreset}]`,
        ].filter(Boolean).join('\n');
        void onCreate({ question: trimmed, goal: goal.trim(), constraints: augmentedConstraints, seedText: seedText.trim(), depth, questions: [] }).catch((cause) => { setError(messageOf(cause)); }).finally(() => { setBusy(false); });
    };
    return _jsx("div", { className: css.modalBackdrop, role: "presentation", children: _jsxs("form", { className: `${css.modal} ${css.auroraGlow}`, role: "dialog", "aria-modal": "true", "aria-labelledby": "new-research-title", onSubmit: submit, children: [_jsxs("div", { className: css.modalHeader, children: [_jsxs("div", { className: css.modalHeading, children: [_jsx("span", { "aria-hidden": "true", className: css.auroraPulse, children: _jsx(IconBolt, { size: 18 }) }), _jsxs("div", { children: [_jsx("h3", { id: "new-research-title", children: t('composer.title') }), _jsx("p", { children: t('composer.subtitle') })] })] }), _jsx("button", { className: css.modalCloseButton, type: "button", "aria-label": t('composer.closeAria'), disabled: busy, onClick: onClose, children: _jsx(IconX, { size: 16 }) })] }), _jsxs("div", { className: css.modalBody, children: [_jsxs("label", { className: css.fieldLabel, children: [_jsxs("span", { children: [t('composer.question'), " ", _jsx("b", { children: t('composer.required') })] }), _jsx("textarea", { autoFocus: true, className: css.questionInput, value: question, onChange: event => { setQuestion(event.target.value); }, placeholder: t('composer.questionPlaceholder') })] }), _jsxs("div", { className: css.contextCard, children: [_jsxs("button", { type: "button", "aria-expanded": contextOpen, onClick: () => { setContextOpen(value => !value); }, children: [_jsx("span", { children: _jsx(IconTarget, { size: 15 }) }), _jsxs("span", { children: [_jsxs("strong", { children: [t('composer.context'), contextCount === 0 ? '' : t('composer.contextCount', { count: contextCount })] }), _jsx("small", { children: t('composer.contextHint') })] }), _jsx("b", { children: contextOpen ? _jsx(IconChevronUp, { size: 14 }) : _jsx(IconChevronDown, { size: 14 }) })] }), contextOpen ? _jsxs("div", { className: css.contextFields, children: [_jsxs("label", { children: [t('composer.goal'), _jsx("input", { className: css.input, value: goal, onChange: event => { setGoal(event.target.value); }, placeholder: t('composer.goalPlaceholder') })] }), _jsxs("label", { children: [t('composer.depth'), _jsxs("select", { className: css.input, value: depth, onChange: event => { setDepth(event.target.value); }, children: [_jsx("option", { value: "quick", children: t('depth.quick') }), _jsx("option", { value: "standard", children: t('depth.standard') }), _jsx("option", { value: "deep", children: t('depth.deep') })] })] }), _jsxs("label", { children: [t('composer.budgetPreset'), _jsxs("select", { className: css.input, value: budgetPreset, onChange: event => { setBudgetPreset(event.target.value); }, children: [_jsx("option", { value: "conservative", children: t('budget.conservative') }), _jsx("option", { value: "balanced", children: t('budget.balanced') }), _jsx("option", { value: "exhaustive", children: t('budget.exhaustive') })] })] }), _jsxs("div", { children: [_jsx("label", { children: t('composer.sources') }), _jsx("div", { className: css.sourceSelector, children: [{ id: 'web', label: t('sources.web') }, { id: 'academic', label: t('sources.academic') }, { id: 'news', label: t('sources.news') }, { id: 'docs', label: t('sources.docs') }].map(src => _jsx("button", { type: "button", className: css.sourcePill, "data-selected": selectedSources.includes(src.id) || undefined, onClick: () => { toggleSource(src.id); }, children: src.label }, src.id)) })] }), _jsxs("label", { children: [t('composer.constraints'), _jsx("textarea", { className: css.textareaSmall, value: constraints, onChange: event => { setConstraints(event.target.value); }, placeholder: t('composer.constraintsPlaceholder') })] }), _jsxs("label", { children: [t('composer.seed'), _jsx("textarea", { className: css.textareaSmall, value: seedText, onChange: event => { setSeedText(event.target.value); }, placeholder: t('composer.seedPlaceholder') })] })] }) : null] }), error === null ? null : _jsx("div", { className: css.modalError, role: "alert", children: error })] }), _jsxs("div", { className: css.modalFooter, children: [_jsx("span", { children: t('composer.footer') }), _jsxs("div", { children: [_jsx("button", { className: css.modalCancelButton, type: "button", disabled: busy, onClick: onClose, children: t('action.cancel') }), _jsxs("button", { className: css.modalSubmitButton, type: "submit", disabled: busy || question.trim() === '', children: [busy ? _jsx(IconLoading, { className: css.spinner, size: 14 }) : _jsx(IconBolt, { size: 14 }), busy ? t('action.creating') : t('action.createPlan')] })] })] })] }) });
}
//# sourceMappingURL=ResearchComposer.js.map