/**
 * Side-chat card (ADR-0261, strangler P3 / batch 18).
 *
 * Renders `#sage-region-side-chats` (the `sage-side-chat-card` article is the React root
 * container). The fork/read/send/return requests and their notices stay on the legacy wire via
 * the down-bridge (the create path reads the link-card context there); this component owns the
 * DOM, the open view, the transcript, per-entry pending state and the notice timing.
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import type { JSX } from 'react'

import { regionMessage, type AppBridgeStore, type SideChatItemView, type SideChatsRegionMessage } from './bridge.js'

function itemTag(item: SideChatItemView): string {
  return item.execution === 'executing' ? '侧聊 · 执行中'
    : item.execution === 'not-read' ? '侧聊 · 未读'
      : item.lastTurnEnd !== null && item.lastTurnEnd !== undefined ? '侧聊 · 本轮已结束（' + String(item.lastTurnEnd) + '）' : '侧聊 · 空闲'
}

export interface SideChatsRegionProps {
  readonly store: AppBridgeStore
  /** The `#sage-region-side-chats` article; the region publishes its machine state here. */
  readonly container: HTMLElement
}

export function SideChatsRegion({ store, container }: SideChatsRegionProps): JSX.Element {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const message = regionMessage<SideChatsRegionMessage>(snapshot, 'side-chats', { kind: 'unavailable' })
  const [localNotice, setLocalNotice] = useState<string | null>(null)
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [transcript, setTranscript] = useState<readonly { readonly role?: unknown, readonly text?: unknown }[]>([])
  const [viewExecution, setViewExecution] = useState<string>('idle')
  const [input, setInput] = useState('')
  const [pendingCreate, setPendingCreate] = useState(false)
  const [pendingViewId, setPendingViewId] = useState<string | null>(null)
  const [pendingSend, setPendingSend] = useState(false)
  const [pendingReturn, setPendingReturn] = useState(false)

  useEffect(() => {
    container.setAttribute('data-region-state', message.kind === 'read' ? 'read' : 'unavailable')
  }, [container, message.kind])

  const known = message.kind === 'read'
  const items = known && Array.isArray(message.slot.items) ? message.slot.items : []
  const unavailableCode = message.kind === 'unavailable' && typeof message.code === 'string' ? message.code : null
  const payloadNote = !known
    ? (unavailableCode === null ? '侧聊未核验：这一版还没有接上侧聊记录。' : '侧聊未核验：' + unavailableCode + '。')
    : items.length === 0
      ? '还没有侧聊；派生一条不会改动主对话历史。'
      : String(items.length) + ' 条侧聊记录（独立投影，不混排进主对话）。'
  const note = localNotice ?? payloadNote
  const viewNote = localNotice ?? (viewExecution === 'executing' ? '子会话执行中（侧聊内容仍与主对话独立）。' : '')

  const create = (): void => {
    setLocalNotice(null)
    setPendingCreate(true)
    void (async () => {
      try {
        const notice = await window.__SAGE_LEGACY_ACTIONS__?.createSideChat?.()
        if (typeof notice === 'string') setLocalNotice(notice)
      } finally {
        setPendingCreate(false)
      }
    })()
  }

  const view = (sideChatId: string): void => {
    setLocalNotice(null)
    setPendingViewId(sideChatId)
    void (async () => {
      try {
        const result = await window.__SAGE_LEGACY_ACTIONS__?.readSideChat?.(sideChatId)
        if (result === undefined || result === null) return
        if (result.kind !== 'read') {
          if (typeof result.notice === 'string') setLocalNotice(result.notice)
          return
        }
        setCurrentId(sideChatId)
        setTranscript(Array.isArray(result.transcript) ? result.transcript : [])
        setViewExecution(typeof result.execution === 'string' ? result.execution : 'idle')
      } finally {
        setPendingViewId(null)
      }
    })()
  }

  const send = (): void => {
    const text = input.trim()
    if (currentId === null || text === '') {
      setLocalNotice('先打开一条侧聊并写好输入。')
      return
    }
    setLocalNotice(null)
    setPendingSend(true)
    void (async () => {
      try {
        const result = await window.__SAGE_LEGACY_ACTIONS__?.sendSideChat?.(currentId, text)
        if (result !== undefined && result !== null) {
          setLocalNotice(result.notice)
          if (result.transcript !== null && result.transcript.kind === 'read' && Array.isArray(result.transcript.transcript)) {
            setTranscript(result.transcript.transcript)
            setViewExecution(typeof result.transcript.execution === 'string' ? result.transcript.execution : viewExecution)
          }
        }
      } finally {
        setPendingSend(false)
      }
    })()
  }

  const returnToMain = (): void => {
    const text = input.trim()
    if (currentId === null || text === '') {
      setLocalNotice('先打开一条侧聊并写好要带回的文本。')
      return
    }
    setLocalNotice(null)
    setPendingReturn(true)
    void (async () => {
      try {
        const notice = await window.__SAGE_LEGACY_ACTIONS__?.returnSideChat?.(currentId, text)
        if (typeof notice === 'string') setLocalNotice(notice)
      } finally {
        setPendingReturn(false)
      }
    })()
  }

  return (
    <>
      <div className="sage-card-head"><span className="sage-card-label">SIDE CHATS · FORKED CHILD SESSIONS</span><span className="sage-card-index">D5</span></div>
      <h2>侧聊（派生会话）</h2>
      <p className="sage-card-note">侧聊从该事项主对话的<strong>已完成轮</strong>派生一条独立子会话：有自己的上下文与历史，<strong>不写入主对话流</strong>；事项仍只关联主对话，这里只列出派生记录并可单独回看。内容不因同属一个事项就默认进入主对话或对他人开放；把结论带回主对话必须走显式动作（沿主对话同一发送路径，受理≠执行），没有自动合并。在途运行也可派生（截到最后一个完成轮）；无已完成轮或锚点落在未完成轮时如实拒绝。</p>
      <button className="sage-secondary-button" id="side-chat-create" type="button" disabled={pendingCreate} onClick={create}>新建侧聊（派生当前主对话）</button>
      <p id="side-chat-note" className="sage-card-note" role="status" aria-live="polite">{note}</p>
      <ul className="sage-roster-list" id="side-chat-rows">
        {items.map((item) => {
          const sideChatId = typeof item.sideChatId === 'string' ? item.sideChatId : ''
          if (sideChatId === '') return null
          return (
            <li key={sideChatId} className="sage-roster-row" data-side-chat={sideChatId}>
              <span className="sage-roster-tag">{itemTag(item)}</span>
              <span>{sideChatId}（派生自 {String(item.createdAt ?? '')}{item.atSeq === null || item.atSeq === undefined ? ' · 从最后一个完成轮' : ' · 锚点 ' + String(item.atSeq)}）</span>
              <button className="sage-row-button" type="button" data-side-chat-action="view" data-side-chat={sideChatId} disabled={pendingViewId === sideChatId} onClick={() => view(sideChatId)}>单独回看</button>
            </li>
          )
        })}
      </ul>
      <div id="side-chat-view" hidden={currentId === null}>
        <span className="sage-card-label" id="side-chat-view-label">{currentId === null ? '侧聊内容' : '侧聊内容 · ' + currentId + '（独立于主对话）'}</span>
        <ul className="sage-roster-list" id="side-chat-transcript">
          {transcript.map((entry, index) => (
            <li key={index} className="sage-roster-row" data-side-chat-entry={String(entry.role)}>
              <span className="sage-roster-tag">{entry.role === 'user' ? '我（侧聊回显）' : '助手 · 历史'}</span>
              <span>{typeof entry.text === 'string' ? entry.text : ''}</span>
            </li>
          ))}
        </ul>
        <div className="sage-state-row"><span>侧聊输入</span><input className="sage-row-input" id="side-chat-input" type="text" aria-label="侧聊输入" value={input} onChange={(event) => setInput(event.target.value)} /></div>
        <button className="sage-secondary-button" id="side-chat-send" type="button" disabled={pendingSend} onClick={send}>发送到侧聊</button>
        <button className="sage-secondary-button" id="side-chat-return" type="button" disabled={pendingReturn} onClick={returnToMain}>带回主对话（显式）</button>
        <button className="sage-secondary-button" id="side-chat-view-close" type="button" onClick={() => setCurrentId(null)}>收起</button>
        <p id="side-chat-view-note" className="sage-card-note" role="status" aria-live="polite">{viewNote}</p>
      </div>
    </>
  )
}
