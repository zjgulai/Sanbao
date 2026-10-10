import { useEffect, useRef, type ReactNode } from 'react'

import { MarkdownText } from '../markdown.js'
import type { DesktopArtifacts } from './client.js'

export interface DesktopSessionViewProps {
  readonly title: string
  readonly execution: 'idle' | 'executing'
  readonly lastTurnEnd: string | null
  readonly paused: boolean
  readonly streamBroken: boolean
  readonly messages: readonly { role: 'user' | 'assistant'; text: string }[]
  /** ADR-0298: the live delta text while the turn executes (null when nothing is streaming). */
  readonly streaming?: string | null
  /** ADR-0300: the artifact cards and the one side-preview state (absent = slot omitted). */
  readonly artifacts?: DesktopArtifacts
  readonly onArtifactOpen?: (artifactId: string) => void
  readonly onArtifactRetry?: () => void
  readonly onArtifactClose?: () => void
  readonly onArtifactFullscreen?: (on: boolean) => void
  readonly onArtifactWindow?: (action: 'open' | 'close') => void
}

function bytesLabel(bytes: number | null): string {
  if (bytes === null) return '大小未知'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** ADR-0300: the right rail — cards stay visible (left of the panel) while the preview is open. */
function ArtifactRail({ artifacts, onArtifactOpen, onArtifactRetry, onArtifactClose, onArtifactFullscreen, onArtifactWindow }: {
  readonly artifacts: DesktopArtifacts
  readonly onArtifactOpen?: (artifactId: string) => void
  readonly onArtifactRetry?: () => void
  readonly onArtifactClose?: () => void
  readonly onArtifactFullscreen?: (on: boolean) => void
  readonly onArtifactWindow?: (action: 'open' | 'close') => void
}): ReactNode {
  const preview = artifacts.preview
  return <aside className="artifact-rail" aria-label="产出物">
    <header className="artifact-rail-header"><strong>产出物</strong></header>
    {artifacts.cards.length === 0
      ? <p className="artifact-empty">尚无观察到产出物</p>
      : artifacts.cards.map((card) => <div className="artifact-card" key={card.artifactId}>
        <div className="artifact-card-title"><span className="artifact-name">{card.name}</span><span className="artifact-kind">{card.kind}</span></div>
        <div className="artifact-card-meta">{card.state === 'ready' ? bytesLabel(card.bytes) : card.state === 'absent' ? '已不在工作区' : '尚未确认'}</div>
        <div className="artifact-card-actions">
          <button className="text-button" aria-label={`面板打开 ${card.name}`} onClick={() => onArtifactOpen?.(card.artifactId)}>打开</button>
        </div>
        <details className="artifact-menu">
          <summary aria-label={`更多文件操作 ${card.name}`}>更多操作</summary>
          <div className="artifact-menu-body">
            <button className="text-button" aria-label={`面板打开选项 ${card.name}`} onClick={() => onArtifactOpen?.(card.artifactId)}>面板打开</button>
            <button
              className="text-button"
              aria-label={`独立窗口 ${card.name}`}
              disabled={preview.state !== 'ready'}
              onClick={() => onArtifactWindow?.('open')}
            >独立窗口</button>
          </div>
        </details>
      </div>)}
    {preview.state === 'opening'
      ? <div className="artifact-preview-status" data-artifact-preview="opening" role="status">正在打开：{preview.name}</div>
      : null}
    {preview.state === 'ready'
      ? <div className="artifact-preview-status" data-artifact-preview="ready" role="status">
        <p>已在右侧打开：{preview.name}</p>
        <div className="artifact-card-actions">
          <button className="text-button" aria-label="关闭预览" onClick={() => onArtifactClose?.()}>关闭预览</button>
          <button className="text-button" aria-label={preview.expanded ? '退出全屏' : '全屏查看'} onClick={() => onArtifactFullscreen?.(!preview.expanded)}>{preview.expanded ? '退出全屏' : '全屏查看'}</button>
          {preview.window
            ? <button className="text-button" aria-label="关闭独立窗口" onClick={() => onArtifactWindow?.('close')}>关闭独立窗口</button>
            : <button className="text-button" aria-label="打开独立窗口" onClick={() => onArtifactWindow?.('open')}>独立窗口</button>}
        </div>
      </div>
      : null}
    {preview.state === 'failed'
      ? <div className="artifact-preview-status" data-artifact-preview="failed" role="status">
        <p>打开失败：{preview.code}</p>
        {preview.retryable ? <button className="text-button" aria-label="重试打开" onClick={() => onArtifactRetry?.()}>重试</button> : null}
      </div>
      : null}
  </aside>
}

// Sanbao src/pages/SessionPage.tsx:78–86: transcript structure only, without observation-driven content.
export function DesktopSessionView({
  title, execution, lastTurnEnd, paused, streamBroken, messages, streaming = null,
  artifacts, onArtifactOpen, onArtifactRetry, onArtifactClose, onArtifactFullscreen, onArtifactWindow,
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
    <div className={`session-layout${artifacts !== undefined && (artifacts.preview.state === 'opening' || artifacts.preview.state === 'ready') ? ' preview-open' : ''}`}>
      <div className="conversation">
        <div className="message-scroll" role="region" aria-label="会话消息" tabIndex={0} ref={scroller}>
          {messages.length === 0 ? <p className="session-empty">当前会话尚无可读消息</p>
            : messages.map((message, index) => message.role === 'user'
              ? <div className="user-message" key={index}><span>{message.text}</span></div>
              : <div className="assistant-message" key={index}>
                <div className="assistant-heading"><strong>Sage</strong></div>
                <div className="reply-body"><MarkdownText text={message.text} /></div>
              </div>)}
          {streaming !== null && streaming !== ''
            ? <div className="assistant-message streaming-message" aria-label="正在生成">
              <div className="assistant-heading"><strong>Sage</strong></div>
              <div className="reply-body"><MarkdownText text={streaming} /></div>
            </div>
            : null}
        </div>
      </div>
      {artifacts !== undefined && artifacts.state === 'read'
        && (artifacts.cards.length > 0 || artifacts.preview.state !== 'closed')
        ? <ArtifactRail
          artifacts={artifacts}
          {...(onArtifactOpen === undefined ? {} : { onArtifactOpen })}
          {...(onArtifactRetry === undefined ? {} : { onArtifactRetry })}
          {...(onArtifactClose === undefined ? {} : { onArtifactClose })}
          {...(onArtifactFullscreen === undefined ? {} : { onArtifactFullscreen })}
          {...(onArtifactWindow === undefined ? {} : { onArtifactWindow })}
        />
        : null}
    </div>
  </section>
}
