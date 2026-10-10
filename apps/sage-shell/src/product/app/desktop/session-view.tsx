import { useEffect, useRef, type ReactNode } from 'react'

export interface DesktopSessionViewProps {
  readonly title: string
  readonly execution: 'idle' | 'executing'
  readonly lastTurnEnd: string | null
  readonly paused: boolean
  readonly streamBroken: boolean
  readonly messages: readonly { role: 'user' | 'assistant'; text: string }[]
  /** ADR-0298: the live delta text while the turn executes (null when nothing is streaming). */
  readonly streaming?: string | null
}

// Sanbao src/pages/SessionPage.tsx:78–86: transcript structure only, without observation-driven content.
export function DesktopSessionView({
  title, execution, lastTurnEnd, paused, streamBroken, messages, streaming = null,
}: DesktopSessionViewProps): ReactNode {
  // ADR-0298: the viewport follows the output while it grows, as the observed product does.
  const scroller = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const node = scroller.current
    if (node === null || streaming === null) return
    node.scrollTop = node.scrollHeight
  }, [streaming])
  const state = paused ? 'paused'
    : streamBroken ? 'interrupted'
      : execution === 'executing' ? 'executing'
        : lastTurnEnd !== null ? 'ended' : 'idle'
  const label = {
    paused: '已暂停',
    interrupted: '连接中断',
    executing: '正在执行',
    ended: '本轮已结束',
    idle: '待命',
  }[state]

  return <section className="session-page" aria-label="当前会话">
    <header className="session-header">
      <strong>{title}</strong>
      <span className="session-state" data-session-state={state} role="status">{label}</span>
    </header>
    <div className="session-layout">
      <div className="conversation">
        <div className="message-scroll" role="region" aria-label="会话消息" tabIndex={0} ref={scroller}>
          {messages.length === 0 ? <p className="session-empty">当前会话尚无可读消息</p>
            : messages.map((message, index) => message.role === 'user'
              ? <div className="user-message" key={index}><span>{message.text}</span></div>
              : <div className="assistant-message" key={index}>
                <div className="assistant-heading"><strong>Sage</strong></div>
                <div className="reply-body">{message.text}</div>
              </div>)}
          {streaming !== null && streaming !== ''
            ? <div className="assistant-message streaming-message" aria-label="正在生成">
              <div className="assistant-heading"><strong>Sage</strong></div>
              <div className="reply-body">{streaming}</div>
            </div>
            : null}
        </div>
      </div>
    </div>
  </section>
}
