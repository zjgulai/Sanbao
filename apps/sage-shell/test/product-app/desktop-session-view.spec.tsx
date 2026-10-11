/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DesktopSessionView, type DesktopSessionViewProps } from '../../src/product/app/desktop/session-view.js'
import { SAGE_DESKTOP_CSS } from '../../src/product/app/desktop/styles.js'

const mounted: Array<() => void> = []
afterEach(() => { mounted.splice(0).forEach(dispose => dispose()); vi.unstubAllGlobals() })

function renderSession(overrides: Partial<DesktopSessionViewProps> = {}) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const container = document.createElement('div')
  container.className = 'sage-desktop'
  document.body.append(container)
  const root = createRoot(container)
  const props = {
    title: '校核事项',
    execution: 'executing' as const,
    lastTurnEnd: null,
    paused: false,
    streamBroken: false,
    messages: [
      { role: 'user' as const, text: '保留实际问题' },
      { role: 'assistant' as const, text: '<script>不执行这段内容</script>\n实际回复第一行' },
    ],
    ...overrides,
  }
  act(() => { root.render(createElement(DesktopSessionView, props)) })
  mounted.push(() => { act(() => root.unmount()); container.remove() })
  return container
}

describe('desktop session reads source projections instead of prototype observations', () => {
  it('renders the actual title and messages as inert content', () => {
    const title = '<img src=x onerror="alert(1)">校核事项'
    const node = renderSession({ title })
    expect(node.querySelector('.session-header strong')?.textContent).toBe(title)
    expect(node.querySelector('.user-message')?.textContent).toBe('保留实际问题')
    expect(node.querySelector('.reply-body')?.textContent).toBe('<script>不执行这段内容</script>\n实际回复第一行')
    expect(node.querySelector('script, img, iframe')).toBeNull()
    expect(node.querySelector('.assistant-heading')?.textContent).toContain('Sage')
    expect(node.textContent).not.toMatch(/Qoder|纸飞机|UI 原型规划|1 次模型迭代|已完成思考|12s/)
  })

  it('distinguishes paused, interrupted and ended runs without inventing completion', () => {
    const paused = renderSession({ paused: true, execution: 'idle' })
    expect(paused.textContent).toContain('已暂停')
    const broken = renderSession({ streamBroken: true })
    expect(broken.textContent).toContain('连接中断')
    const ended = renderSession({ execution: 'idle', lastTurnEnd: 'completed' })
    expect(ended.textContent).toContain('本轮已结束')
    expect(ended.textContent).not.toContain('事项已完成')
  })

  it.each([
    { paused: true, streamBroken: true, execution: 'executing', lastTurnEnd: 'completed', label: '已暂停' },
    { paused: false, streamBroken: true, execution: 'executing', lastTurnEnd: 'completed', label: '连接中断' },
    { paused: false, streamBroken: false, execution: 'executing', lastTurnEnd: 'completed', label: '正在执行' },
    { paused: false, streamBroken: false, execution: 'idle', lastTurnEnd: 'completed', label: '本轮已结束' },
    { paused: false, streamBroken: false, execution: 'idle', lastTurnEnd: null, label: '待命' },
  ] as const)('prioritizes the current state as $label', ({ label, ...props }) => {
    const node = renderSession(props)
    expect(node.querySelector('[role="status"]')?.textContent).toBe(label)
  })

  it.each(['failed', 'cancelled', ''])('does not label turn end %j as success', lastTurnEnd => {
    const node = renderSession({ execution: 'idle', lastTurnEnd })
    expect(node.querySelector('[role="status"]')?.textContent).toBe('本轮已结束')
    expect(node.textContent).not.toMatch(/成功|已完成/)
  })

  it('keeps user text literal and renders assistant markdown (ADR-0299)', () => {
    const texts = ['  第一行\n\n\t缩进 **原文**  ', '## 标题\n\n**重点** 回复正文', '后续问题']
    const node = renderSession({ messages: [
      { role: 'user', text: texts[0]! },
      { role: 'assistant', text: texts[1]! },
      { role: 'user', text: texts[2]! },
    ] })
    const style = document.createElement('style')
    style.textContent = SAGE_DESKTOP_CSS
    document.head.append(style)
    mounted.push(() => style.remove())
    // The user side stays literal text; the assistant reply is rendered markdown.
    const userBodies = [...node.querySelectorAll('.user-message > span')]
    expect(userBodies.map(body => body.textContent)).toEqual([texts[0], texts[2]])
    for (const body of userBodies) {
      expect(body.childElementCount).toBe(0)
      expect(getComputedStyle(body).whiteSpace).toBe('pre-wrap')
      expect(getComputedStyle(body).overflowWrap).toBe('anywhere')
    }
    const reply = node.querySelector('.reply-body')!
    expect(reply.querySelector('h2')?.textContent).toBe('标题')
    expect(reply.querySelector('strong')?.textContent).toBe('重点')
    expect(reply.textContent).toContain('回复正文')
  })

  it('never renders raw HTML from assistant text', () => {
    const node = renderSession({ messages: [{ role: 'assistant', text: '<script>alert(1)</script>\n\n正文一段' }] })
    expect(node.querySelector('script')).toBeNull()
    expect(node.textContent).toContain('正文一段')
  })

  it('toggles the artifact rail from the side-panel entry (P14.sidepanel.entry)', async () => {
    const node = renderSession()
    // No cards and no preview: the rail is closed until the side-panel button asks for it.
    expect(node.querySelector('.artifact-rail')).toBeNull()
    const toggle = node.querySelector<HTMLButtonElement>('button[aria-label="侧面板"]')!
    expect(toggle).not.toBeNull()
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    await act(async () => { toggle.click() })
    const rail = node.querySelector('.artifact-rail')
    expect(rail).not.toBeNull()
    expect(rail?.textContent).toContain('尚无观察到产出物')
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    await act(async () => { toggle.click() })
    expect(node.querySelector('.artifact-rail')).toBeNull()
  })

  it('labels a blocked turn end as 被阻断结束 (ADR-0313 S06)', () => {
    const node = renderSession({
      execution: 'idle', lastTurnEnd: 'blocked',
      turnProcess: { durationMs: null, endedAt: null, iterations: null, fileWrites: [] },
    })
    expect(node.querySelector('.turn-process-label')?.textContent).toContain('被阻断结束')
  })

  it('renders approval waits for a display-only consumer without dead controls (ADR-0313 review)', () => {
    const node = renderSession({
      approvals: { state: 'read', code: null, pending: [{ requestId: 'approval:1', toolName: 'run_shell', reason: null, withdrawable: true }] },
    })
    const section = node.querySelector('.approvals-section')
    expect(section).not.toBeNull()
    expect(section?.textContent).toContain('run_shell')
    expect(section?.querySelector('button')).toBeNull()
  })

  it('shows terminal rows and tool results without inventing controls for a display-only consumer (ADR-0314)', () => {
    const node = renderSession({
      execution: 'idle',
      terminal: { state: 'read', reason: null, terminals: [{ terminalId: 't-1', name: null, type: 'shell', status: { kind: 'running' } }] },
      toolResults: { state: 'read', results: [
        { resultId: 'r1', tool: 'bash', title: 'bash', at: '', state: 'read', fields: [{ kind: 'key-values', entries: [{ name: '退出码', value: '0' }] }] },
      ] },
    })
    const terminal = node.querySelector('[aria-label="集成终端"]')
    expect(terminal?.textContent).toContain('t-1 · shell')
    expect(terminal?.textContent).toContain('运行中')
    // No onTerminalRead handler: the row renders, but there is no dead open control.
    expect(terminal?.querySelector('button')).toBeNull()
    const results = node.querySelector('[aria-label="工具结果"]')
    expect(results?.textContent).toContain('bash')
    expect(results?.textContent).toContain('退出码：0')
  })

  it('keeps the service-scheduled retry delay exact (500ms is 0.5s, never rounded) (ADR-0313 review)', () => {
    const node = renderSession({
      modelQueue: { state: 'read', verdict: 'retrying', verifyOnly: false, reason: null,
        retries: [{ retryId: 'retry:1', provider: 'provider:local', failureCode: 'rate-limited', attempt: 2, maxAttempts: 3, delayMs: 500, started: false }] },
    })
    expect(node.querySelector('.model-queue-card')?.textContent).toContain('服务计划 0.5s 后重试')
    const half = renderSession({
      modelQueue: { state: 'read', verdict: 'retrying', verifyOnly: false, reason: null,
        retries: [{ retryId: 'retry:2', provider: 'provider:local', failureCode: 'rate-limited', attempt: 2, maxAttempts: null, delayMs: 1500, started: false }] },
    })
    expect(half.querySelector('.model-queue-card')?.textContent).toContain('服务计划 1.5s 后重试')
  })

  it('does not synthesize an answer or an outgoing prompt for an empty transcript', () => {
    const node = renderSession({ messages: [], execution: 'idle' })
    expect(node.querySelector('.assistant-message')).toBeNull()
    expect(node.querySelector('.user-message')).toBeNull()
    expect(node.textContent).toContain('当前会话尚无可读消息')
    // The ordinary side-panel entry exists on this page (observed); nothing else is synthesized.
    expect(node.querySelector('textarea, input')).toBeNull()
    const otherButtons = [...node.querySelectorAll('button')]
      .filter((button) => button.getAttribute('aria-label') !== '侧面板')
    expect(otherButtons).toHaveLength(0)
  })
})
