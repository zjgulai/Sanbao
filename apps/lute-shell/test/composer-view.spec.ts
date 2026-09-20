import { describe, expect, it } from 'vitest'
import { COMPOSER_RENDER_BODY } from '../src/host/composer-view.js'

type Node = { type: unknown; props: Record<string, any> }
const jsx = (type: unknown, props: Record<string, any>): Node => ({ type, props })
function flatten(node: any): Node[] {
  if (!node || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(flatten)
  return [node, ...flatten(node.props?.children)]
}
function render(extra: Record<string, any> = {}) {
  const calls: string[] = []
  const context = {
    react_jsx_runtime: { jsx, jsxs: jsx },
    _deepseek_ai_dsh_client_ui_primitives: { Tooltip: 'Tooltip', Toast: 'Toast', IconWarningOutline16: 'Warning' },
    clsx: (...names: unknown[]) => names.filter(Boolean).join(' '),
    t: (key: string) => key,
    keepFocus() {}, toast: null, notice: null, cardRef: {}, scrollRef: {}, sessionId: 'session-one',
    renderSlot: (name: string, props: object) => jsx(name, props),
    attachments: [], canAcceptDrop: true, intakeFiles: () => calls.push('add'),
    removeAttachment: (id: string) => calls.push(`remove:${id}`), uploads: {},
    retryFileUpload: (id: string) => calls.push(`retry:${id}`), imageLimits: undefined,
    imageSizeText: String, ComposerContentEditable: 'Editor', DecoratorPortals: 'Decorators',
    ContextMeter: 'Meter', editor: { id: 'live-editor' }, editable: true,
    InputBar_module_css_default: { input: 'existing-input' }, input: { phase: 'plain' },
    editorDisabled: false, placeholderText: 'Message', hint: null, draft: '', claimActive: false,
    onToggleCommandMenu: () => calls.push('commands'), locked: false, toggleCommandMenu() {},
    commandMenuOpen: false, fileInputRef: { current: { click: () => calls.push('pick') } },
    subagent: null, machineBusy: false, addFiles() {}, onPickFiles() {}, modelSeatLocked: false,
    interruptible: false, stop: () => calls.push('stop'), primaryLabel: 'send', primaryStops: false,
    onPrimary: () => calls.push('primary'), primaryDisabled: false,
    accessory: 'Project', accessSelect: 'Permissions', useProjection() {}, variant: 'composer',
    ...extra,
  }
  const nodes = flatten(new Function(...Object.keys(context), COMPOSER_RENDER_BODY)(...Object.values(context)))
  return { nodes, calls, context }
}

describe('composer render contract', () => {
  it('connects one editor and its decorators to the existing editor identity', () => {
    const { nodes, context } = render()
    expect(nodes.filter(node => node.type === 'Editor')).toHaveLength(1)
    expect(nodes.find(node => node.type === 'Editor')?.props.editor).toBe(context.editor)
    expect(nodes.find(node => node.type === 'Decorators')?.props.editor).toBe(context.editor)
  })

  it('routes primary, command, and file picker actions to the existing handlers', () => {
    const { nodes, calls } = render()
    for (const label of ['send', 'input.commands', 'file.attach']) {
      nodes.find(node => node.type === 'button' && node.props['aria-label'] === label)?.props.onClick()
    }
    expect(calls).toEqual(['primary', 'commands', 'pick'])
  })

  it('keeps attachment retry and removal on the same attachment identity', () => {
    const { nodes, calls } = render()
    const rail = nodes.find(node => node.type === 'conversation.input.attachments')!
    rail.props.onRetryFile('file-one')
    rail.props.onRemoveAttachment('file-one')
    expect(calls).toEqual(['retry:file-one', 'remove:file-one'])
  })

  it('keeps model recovery available when the draft is blocked', () => {
    const { nodes } = render({ locked: true, modelSeatLocked: false, editable: false, primaryDisabled: true })
    expect(nodes.find(node => node.type === 'Editor')?.props.editable).toBe(false)
    expect(nodes.find(node => node.type === 'conversation.input.model')?.props.locked).toBe(false)
    expect(nodes.find(node => node.type === 'button' && node.props['aria-label'] === 'send')?.props.disabled).toBe(true)
  })

  it('shows a two-character placeholder while the editor keeps the full hint', () => {
    const full = '描述你想要构建的内容, / 调用指令, @ 文件或对话'
    const { nodes } = render({ placeholderText: full })
    expect(nodes.find(node => node.props?.['data-composer-placeholder'])?.props.children).toBe('输入')
    const editor = nodes.find(node => node.type === 'Editor')
    expect(editor?.props['data-placeholder']).toBe(full)
    expect(editor?.props['aria-label']).toBe(full)
  })

  it('shortens the English and in-conversation hints and leaves unknown copy alone', () => {
    const placeholderOf = (text: string) => render({ placeholderText: text }).nodes
      .find(node => node.props?.['data-composer-placeholder'])?.props.children
    expect(placeholderOf('Describe what you want to build, / commands, @ files or sessions')).toBe('Input')
    expect(placeholderOf('发消息或创建任务, / 调用指令, @ 文件或对话')).toBe('输入')
    expect(placeholderOf('Message or run a task, / commands, @ files or sessions')).toBe('Input')
    expect(placeholderOf('排队中的消息')).toBe('排队中的消息')
  })
})
