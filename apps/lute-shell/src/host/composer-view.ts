export const COMPOSER_RENDER_BODY = String.raw`
const h = react_jsx_runtime.jsx, hs = react_jsx_runtime.jsxs;
const icon = (kind) => h("svg", {viewBox:"0 0 20 20", width:18, height:18, "aria-hidden":true, children:
  kind === "stop" ? h("rect", {x:5,y:5,width:10,height:10,rx:2,fill:"currentColor"}) :
  h("path", {d:kind === "attach" ? "M7 10.5 12 5.5a3 3 0 0 1 4.2 4.2l-7 7a4 4 0 0 1-5.7-5.7l7-7" : kind === "plus" ? "M10 4v12M4 10h12" : "M10 16V4M5 9l5-5 5 5", fill:"none",stroke:"currentColor",strokeWidth:1.6,strokeLinecap:"round",strokeLinejoin:"round"})});
const action = (label, kind, onClick, isDisabled, extra) => h(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
  label, side:"top", delayMs:400, disabled:isDisabled,
  children:h("button", {type:"button",className:"sanbao-composer-action", "aria-label":label, disabled:isDisabled,onMouseDown:keepFocus,onClick,...extra,children:icon(kind)})});
const SANBAO_PLACEHOLDER_TEXT = {
  "描述你想要构建的内容, / 调用指令, @ 文件或对话":"输入",
  "Describe what you want to build, / commands, @ files or sessions":"Input",
  "发消息或创建任务, / 调用指令, @ 文件或对话":"输入",
  "Message or run a task, / commands, @ files or sessions":"Input"
};
const placeholderDisplay = SANBAO_PLACEHOLDER_TEXT[placeholderText] ?? placeholderText;
return hs("div", {className:"sanbao-composer", "data-sanbao-composer":"v1", children:[
  toast !== null && h(_deepseek_ai_dsh_client_ui_primitives.Toast, {text:toast.text,icon:h(_deepseek_ai_dsh_client_ui_primitives.IconWarningOutline16,{}),anchor:cardRef.current,onDone:dismissToast},toast.seq),
  notice?.level === "info" && h("div",{role:"status",className:"sanbao-composer-notice",children:notice.text}),
  hs("div", {ref:cardRef,className:"sanbao-composer-card","data-composer-card":true,children:[
    sessionId !== void 0 && h("div",{className:"sanbao-composer-overlay",children:renderSlot("conversation.input.overlay",{})}),
    renderSlot("conversation.input.attachments",{attachments,canAcceptDrop,onAddFiles:intakeFiles,onRemoveAttachment:(id)=>removeAttachment?.(id),uploads,onRetryFile:(id)=>retryFileUpload?.(id),dropLimits:imageLimits===void 0?void 0:{count:imageLimits.maxImagesPerMessage,size:imageSizeText(imageLimits.maxImageBytes)}}),
    h("div",{ref:scrollRef,className:"sanbao-composer-scroll","data-input-scroll":true,children:hs("div",{className:"sanbao-composer-grow",children:[
      h(ComposerContentEditable,{editor,editable,className:clsx(InputBar_module_css_default.input,"sanbao-composer-editor"),"data-phase":input?.phase??"inert","aria-disabled":editorDisabled||void 0,"data-placeholder":placeholderText,"aria-label":placeholderText,style:hint===null?void 0:{"--dsh-composer-hint":JSON.stringify(hint)}}),
      draft===""&&attachments.length===0&&!claimActive&&h("div",{"aria-hidden":true,className:"sanbao-composer-placeholder","data-composer-placeholder":true,children:placeholderDisplay}),
      h(DecoratorPortals,{editor})
    ]})}),
    hs("div",{className:"sanbao-composer-toolbar",children:[
      hs("div",{className:"sanbao-composer-leading",children:[
        action(t("input.commands"),"plus",onToggleCommandMenu,locked||toggleCommandMenu===void 0,{"aria-haspopup":"listbox","aria-expanded":commandMenuOpen}),
        action(t("file.attach"),"attach",()=>fileInputRef.current?.click(),subagent!==null||locked||machineBusy||addFiles===void 0),
        h("input",{ref:fileInputRef,type:"file",multiple:true,disabled:subagent!==null,hidden:true,onChange:onPickFiles}),
        sessionId===void 0?null:renderSlot("conversation.input.model",{locked:modelSeatLocked}),
        input===void 0||sessionId===void 0?null:renderSlot("conversation.input.left",{})
      ]}),
      hs("div",{className:"sanbao-composer-trailing",children:[
        input===void 0||sessionId===void 0?null:renderSlot("conversation.input.right",{}),
        interruptible&&action(t("input.stop"),"stop",stop,stop===void 0),
        action(primaryLabel,primaryStops?"stop":"send",onPrimary,primaryDisabled,{className:"sanbao-composer-action sanbao-composer-send"})
      ]})
    ]})
  ]}),
  hs("div",{className:"sanbao-composer-footer",children:[
    hs("div",{className:"sanbao-composer-context",children:[accessory,accessSelect,sessionId===void 0?null:renderSlot("conversation.input.plan",{locked})]}),
    h(ContextMeter,{useProjection,t})
  ]}),
  variant==="composer"&&input!==void 0&&sessionId!==void 0?renderSlot("conversation.composer.dock",{}):null
]});
`

export const COMPOSER_CSS = `
.sanbao-composer{display:flex;flex-direction:column;align-items:center;width:100%;box-sizing:border-box;padding:0 var(--dsh-composer-side-clearance) 8px;color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family)}
.sanbao-composer-card{box-sizing:border-box;position:relative;display:flex;flex-direction:column;gap:12px;width:100%;max-width:var(--dsh-composer-card-max-width);border:1px solid var(--dsw-alias-border-l2);border-radius:20px;background:var(--dsw-specific-input-major);padding:16px 12px 10px;font-size:var(--dsh-content-font-size,14px);line-height:calc(24px + var(--dsh-content-font-delta,0px));transition:border-color 120ms ease}
.sanbao-composer-card:focus-within{border-color:var(--dsw-alias-label-tertiary)}
.sanbao-composer-overlay{position:absolute;inset:0 0 auto;height:0}
.sanbao-composer-scroll{max-height:var(--dsh-composer-text-max-height);overflow-y:auto}
.sanbao-composer-grow{position:relative}
.sanbao-composer-editor{min-height:68px!important;padding:0 4px!important;font:inherit;white-space:pre-wrap;overflow-wrap:anywhere;outline:none}
.sanbao-composer-placeholder{position:absolute;inset:0 4px auto;pointer-events:none;color:var(--dsw-alias-label-secondary);font:inherit}
.sanbao-composer-toolbar,.sanbao-composer-leading,.sanbao-composer-trailing,.sanbao-composer-footer,.sanbao-composer-context{display:flex;align-items:center;gap:6px;min-width:0}
.sanbao-composer-toolbar,.sanbao-composer-footer{justify-content:space-between}
.sanbao-composer-leading,.sanbao-composer-context{flex-wrap:wrap}
.sanbao-composer-trailing{flex-shrink:0}
.sanbao-composer-action{display:grid;place-items:center;flex:none;width:30px;height:30px;border:0;border-radius:10px;background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer}
.sanbao-composer-action:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.sanbao-composer-action:focus-visible{outline:2px solid var(--dsw-alias-label-primary);outline-offset:2px}
.sanbao-composer-action:disabled{opacity:.4;cursor:default}
.sanbao-composer-send{border-radius:50%;background:var(--dsw-alias-label-primary);color:var(--dsw-specific-input-major)}
.sanbao-composer-send:hover:not(:disabled){background:var(--dsw-alias-label-secondary)}
.sanbao-composer-footer{box-sizing:border-box;width:100%;max-width:var(--dsh-composer-card-max-width);padding:6px 4px 0;gap:12px;font-size:12px;color:var(--dsw-alias-label-secondary)}
.sanbao-composer-context>div{margin:0;gap:6px}
.sanbao-composer-notice{width:100%;max-width:var(--dsh-composer-card-max-width);padding:6px 0;font-size:12px}
.sanbao-composer-footer button{font-size:12px}
@media(prefers-reduced-motion:reduce){.sanbao-composer-card{transition:none}}
`
