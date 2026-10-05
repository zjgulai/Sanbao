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

  it('preserves message order, blank lines, indentation and literal markdown', () => {
    const texts = ['  第一行\n\n\t缩进 **原文**  ', '  回复\n\n\t<script>原文</script>  ', '后续问题']
    const node = renderSession({ messages: [
      { role: 'user', text: texts[0]! },
      { role: 'assistant', text: texts[1]! },
      { role: 'user', text: texts[2]! },
    ] })
    const style = document.createElement('style')
    style.textContent = SAGE_DESKTOP_CSS
    document.head.append(style)
    mounted.push(() => style.remove())
    const bodies = [...node.querySelectorAll('.user-message > span, .reply-body')]
    expect(bodies.map(body => body.textContent)).toEqual(texts)
    for (const body of bodies) {
      expect(body.childElementCount).toBe(0)
      expect(getComputedStyle(body).whiteSpace).toBe('pre-wrap')
      expect(getComputedStyle(body).overflowWrap).toBe('anywhere')
    }
  })

  it('does not synthesize an answer or an outgoing prompt for an empty transcript', () => {
    const node = renderSession({ messages: [], execution: 'idle' })
    expect(node.querySelector('.assistant-message')).toBeNull()
    expect(node.querySelector('.user-message')).toBeNull()
    expect(node.textContent).toContain('当前会话尚无可读消息')
    expect(node.querySelector('textarea, input, button')).toBeNull()
  })
})
