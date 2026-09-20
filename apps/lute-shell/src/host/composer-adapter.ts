import { COMPOSER_RENDER_BODY } from './composer-view.js'

const CONVERSATION_MODULE = 'id: "@deepseek-ai/dsh-client-ui-conversation"'
const AGENT_PRESET_MODULE = 'id: "@deepseek-ai/dsh-client-ui-agent-preset"'

function replaceOne(source: string, anchor: string, replacement: string, label = 'composer compatibility'): string {
  const first = source.indexOf(anchor)
  if (first < 0 || source.indexOf(anchor, first + anchor.length) >= 0) {
    throw new Error(`lute shell: ${label} anchor is missing or ambiguous: ${anchor.slice(0, 100)}`)
  }
  return source.slice(0, first) + replacement + source.slice(first + anchor.length)
}

function adaptModule(source: string, identity: string, adapt: (moduleSource: string) => string, label: string): string {
  const at = source.indexOf(identity)
  if (at < 0) return source
  const moduleStart = source.lastIndexOf('window.__ModuleLoader__.load({', at)
  const nextModule = source.indexOf('\nwindow.__ModuleLoader__.load({', at)
  if (moduleStart < 0) throw new Error(`lute shell: ${label} module boundary anchor is missing`)
  const moduleEnd = nextModule < 0 ? source.length : nextModule
  const adapted = adapt(source.slice(moduleStart, moduleEnd))
  return source.slice(0, moduleStart) + adapted + source.slice(moduleEnd)
}

export function adaptClientBundle(source: string): string {
  const conversation = adaptModule(source, CONVERSATION_MODULE, adaptComposerModule, 'composer compatibility')
  return adaptModule(conversation, AGENT_PRESET_MODULE, adaptAgentPresetModule, 'agent preset')
}

function adaptComposerModule(source: string): string {
  const startAnchor = 'const primaryStops = running && subagent === null && (empty || blocked !== void 0);'
  const start = source.indexOf(startAnchor)
  if (start < 0 || source.indexOf(startAnchor, start + 1) >= 0) {
    throw new Error('lute shell: composer compatibility anchor is missing or ambiguous: primaryStops')
  }
  const renderStart = source.indexOf('return (0, react_jsx_runtime.jsxs)("div", {', start)
  const renderEnd = source.indexOf('\n\t\t});\n\t\t//#endregion', renderStart)
  if (renderStart < 0 || renderEnd < 0) throw new Error('lute shell: composer render anchor is missing')
  const originalRender = source.slice(renderStart, renderEnd)
  for (const binding of ['ComposerContentEditable', 'DecoratorPortals', 'ContextMeter', 'PermissionSelect']) {
    const declaration = new RegExp(`(?:function|const|var) ${binding}\\b`, 'u')
    if (!declaration.test(source)) throw new Error(`lute shell: composer binding anchor is missing: ${binding}`)
  }
  for (const contract of ['renderSlot("conversation.input.attachments"', 'onClick: onPrimary', 'editor: workspaceTrigger ? null : editor']) {
    if (!originalRender.includes(contract)) throw new Error(`lute shell: composer render anchor is missing: ${contract}`)
  }
  let result = source.slice(0, renderStart) + COMPOSER_RENDER_BODY + source.slice(renderEnd)
  result = replaceOne(result,
    'renderSlot, renderSlotChain, selectWorkspace, t }) {',
    'renderSlot, renderSlotChain, selectWorkspace, startLocalSession, t }) {')
  result = replaceOne(result,
    'const [pickerOpen, setPickerOpen] = (0, react.useState)(false);',
    `const [localError, setLocalError] = (0, react.useState)(null);
    const [localAttempt, setLocalAttempt] = (0, react.useState)(0);
    const sessionsPhase = useSessions(s => s.phase);
    (0, react.useEffect)(() => {
      if (sessionId !== void 0 || sessionsPhase !== "ready") return;
      const controller = new AbortController();
      setLocalError(null);
      startLocalSession(controller.signal).catch(error => { if (!controller.signal.aborted) setLocalError(String(error.message ?? error)); });
      return () => { controller.abort(); };
    }, [sessionId, sessionsPhase, startLocalSession, localAttempt]);
    const [pickerOpen, setPickerOpen] = (0, react.useState)(false);`)
  result = replaceOne(result,
    'const inert = sessionId === void 0 || hero && chipTitle === void 0;',
    'const inert = sessionId === void 0;')
  result = replaceOne(result,
    'variant: hero ? "hero" : "composer",',
    'variant: hero ? "hero" : "composer", accessory: heroWorkspaceRow,')
  result = replaceOne(result,
    'placeholder: t("placeholder.workspace"),',
    'placeholder: localError ?? "正在准备对话…",')
  result = replaceOne(result,
    'hero && heroWorkspaceRow,',
    `sessionId === void 0 && localError !== null && (0, react_jsx_runtime.jsxs)("div", {role:"alert",children:[localError,(0,react_jsx_runtime.jsx)("button",{type:"button",onClick:()=>setLocalAttempt(attempt=>attempt+1),children:"重试"})]}),`)
  result = replaceOne(result,
    'label: chipTitle,',
    'label: chipTitle ?? "项目",')
  result = replaceOne(result,
    'function PermissionSelect({ value, locked, command, t }) {',
    `const SANBAO_SHORT_PERMISSION_LABELS = {
      "Read Only": "只读", "仅可查看": "只读",
      "Workspace Write": "可改", "工作区内修改": "可改",
      "Full access": "全权", "完全权限": "全权"
    };
    function permissionShortLabel(value, name, t) {
      const full = permissionLabel(value, name, t);
      return SANBAO_SHORT_PERMISSION_LABELS[full] ?? full;
    }
    function PermissionSelect({ value, locked, command, t }) {`)
  result = replaceOne(result,
    'const currentLabel = current === void 0 ? permissionLabel(currentValue, currentValue, t) : permissionLabel(current.value, current.name, t);',
    `const currentFullLabel = current === void 0 ? permissionLabel(currentValue, currentValue, t) : permissionLabel(current.value, current.name, t);
    const currentLabel = current === void 0 ? permissionShortLabel(currentValue, currentValue, t) : permissionShortLabel(current.value, current.name, t);`)
  result = replaceOne(result,
    't("input.accessMode", { name: currentLabel })',
    't("input.accessMode", { name: currentFullLabel })')
  result = replaceOne(result,
    'title: current?.description,',
    'title: current?.description ?? currentFullLabel,')
  result = replaceOne(result,
    'label: permissionLabel(option.value, option.name, t),',
    'label: permissionShortLabel(option.value, option.name, t),')
  result = replaceOne(result,
    'const registerConversationRoot = () => slots.register({',
    `let localSessionPending;
    const startLocalSession = async (signal) => {
      localSessionPending ??= (async () => {
        const response = await fetch("/.sanbao/session-directory", {method:"POST"});
        if (!response.ok) throw new Error("无法准备会话目录 (" + response.status + ")");
        const {cwd} = await response.json();
        if (typeof cwd !== "string" || cwd.length === 0) throw new Error("会话目录响应无效");
        return sessions.create({cwd});
      })().finally(() => { localSessionPending = void 0; });
      const id = await localSessionPending;
      if (!signal.aborted && sessions.list.getSnapshot().current === void 0) workspaceNavigation.openSession(id);
      return id;
    };
    const registerConversationRoot = () => slots.register({`)
  result = replaceOne(result,
    'hooks: { composerBlock: sessionId === void 0 ? ABSENT_BLOCK : composerBlocks.storeFor(sessionId) },',
    'startLocalSession, hooks: { composerBlock: sessionId === void 0 ? ABSENT_BLOCK : composerBlocks.storeFor(sessionId) },')
  return result
}

function adaptAgentPresetModule(source: string): string {
  let result = replaceOne(source,
    'function AgentPresetSeat({ load, select, introduced, useAgentPresetSeat, t }) {',
    `const SANBAO_SHORT_PRESET_NAMES = {
      standard: "标准", ptc: "PTC", minimal: "极简", cordis: "创造"
    };
    function presetSeatLabel(preset, label) {
      if (preset === void 0 || preset.trust !== "system") return label;
      return SANBAO_SHORT_PRESET_NAMES[preset.id] ?? label;
    }
    function AgentPresetSeat({ load, select, introduced, useAgentPresetSeat, t }) {`,
    'agent preset')
  result = replaceOne(result,
    'const label = (chosen === void 0 ? void 0 : presetDisplayText(chosen, t))?.name ?? state.current;',
    `const label = (chosen === void 0 ? void 0 : presetDisplayText(chosen, t))?.name ?? state.current;
    const seatLabel = presetSeatLabel(chosen, label);`,
    'agent preset')
  result = replaceOne(result,
    'if (!state.introduce || !ready) return;\n\t\t\t\tconst characters = Array.from(label);',
    'if (!state.introduce || !ready) return;\n\t\t\t\tconst characters = Array.from(seatLabel);',
    'agent preset')
  result = replaceOne(result,
    'if (!ready) return null;\n\t\t\tconst characters = Array.from(label);',
    'if (!ready) return null;\n\t\t\tconst characters = Array.from(seatLabel);',
    'agent preset')
  result = replaceOne(result, '}) : label;', '}) : seatLabel;', 'agent preset')
  result = replaceOne(result,
    'title: state.error ?? t("seatHint"),',
    'title: state.error ?? (label === void 0 ? t("seatHint") : label + " · " + t("seatHint")),',
    'agent preset')
  return result
}
