import type { ReactNode } from 'react'

export interface DesktopSessionViewProps {
  readonly title: string
  readonly execution: 'idle' | 'executing'
  readonly lastTurnEnd: string | null
  readonly paused: boolean
  readonly streamBroken: boolean
  readonly messages: readonly { role: 'user' | 'assistant'; text: string }[]
}

// Sanbao src/pages/SessionPage.tsx:78–86: transcript structure only, without observation-driven content.
export function DesktopSessionView({
  title, execution, lastTurnEnd, paused, streamBroken, messages,
}: DesktopSessionViewProps): ReactNode {
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
        <div className="message-scroll" role="region" aria-label="会话消息" tabIndex={0}>
          {messages.length === 0 ? <p className="session-empty">当前会话尚无可读消息</p>
            : messages.map((message, index) => message.role === 'user'
              ? <div className="user-message" key={index}><span>{message.text}</span></div>
              : <div className="assistant-message" key={index}>
                <div className="assistant-heading"><strong>Sage</strong></div>
                <div className="reply-body">{message.text}</div>
              </div>)}
        </div>
      </div>
    </div>
  </section>
}
