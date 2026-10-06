/**
 * Search card (ADR-0261, P4 / batch 25).
 *
 * Renders `#sage-region-search` (the `sage-search-card` article is the React root container): one
 * query, two sections — matters matched locally and session hits from the runtime query engine.
 * The card has no projection slice; the outcome of the single explicit `/.sage/search` POST stays
 * client-side until the next search, while the request, its in-flight guard, the refusal sentence
 * and the empty-query guard stay on the legacy wire behind `runSearch`.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { JSX } from 'react'

import { regionMessage, type AppBridgeStore, type SearchRegionMessage } from './bridge.js'

/** Module-level so its identity is stable: effects keyed on the message object must not loop. */
const SEARCH_UNAVAILABLE: SearchRegionMessage = { kind: 'unavailable' }

const asRecord = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null

export interface SearchRegionProps {
  readonly store: AppBridgeStore
  /** The `#sage-region-search` article; the region publishes its machine state here. */
  readonly container: HTMLElement
}

export function SearchRegion({ store, container }: SearchRegionProps): JSX.Element {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const message = regionMessage<SearchRegionMessage>(snapshot, 'search', SEARCH_UNAVAILABLE)

  const [query, setQuery] = useState('')
  const [outcome, setOutcome] = useState<Record<string, unknown> | null>(null)
  const [localNotice, setLocalNotice] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)
  const inFlight = useRef(false)

  useEffect(() => {
    container.setAttribute('data-region-state', message.kind === 'read' ? 'read' : 'unavailable')
  }, [container, message.kind])

  const run = (): void => {
    if (inFlight.current) return
    const trimmed = query.trim()
    if (trimmed === '') {
      setLocalNotice('先写关键词再搜索。')
      return
    }
    setLocalNotice(null)
    inFlight.current = true
    setSearching(true)
    void (async () => {
      try {
        const result = await window.__SAGE_LEGACY_ACTIONS__?.runSearch?.(trimmed)
        if (result === undefined || result === null) return
        if (result.kind === 'read') {
          setOutcome(result.outcome)
        } else {
          // A refusal or an unreadable answer clears the previous read: rows empty, session state blank.
          setOutcome(null)
          if (typeof result.notice === 'string') setLocalNotice(result.notice)
        }
      } finally {
        inFlight.current = false
        setSearching(false)
      }
    })()
  }

  // ---- derived display words (the legacy renderer's own sentences) ----
  const matters = outcome !== null && Array.isArray(outcome.matters) ? outcome.matters.filter((hit): hit is Record<string, unknown> => hit !== null && typeof hit === 'object') : []
  const sessions = outcome === null
    ? null
    : asRecord(outcome.sessions) ?? { state: 'failed', code: 'search-unrecognised' }
  const sessionItems = sessions !== null && sessions.state === 'available' && Array.isArray(sessions.items)
    ? sessions.items.filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object')
    : []
  const sessionStateText = sessions === null ? ''
    : sessions.state === 'available'
      ? (sessionItems.length === 0
          ? '检索可用：没有命中的会话（"无结果"说的是这件事）。'
          : (sessions.hasMore === true ? '检索可用：显示前 ' + String(sessionItems.length) + ' 条，还有更多命中未列出。' : '检索可用：' + String(sessionItems.length) + ' 条命中。'))
      : sessions.state === 'unavailable' ? '会话检索不可用：运行时没有挂载 dsh-session-query（这不是"无结果"；事项本地匹配不受影响）。'
        : '会话检索失败：' + String(sessions.code ?? 'unknown') + '（这不是"无结果"）。'
  const derivedNote = outcome === null ? ''
    : '查询"' + String(outcome.query ?? '') + '"：事项 ' + String(matters.length) + ' 条命中；会话区见下。命中只是文本，点击不会打开会话或加载正文。'
  const note = localNotice ?? derivedNote

  return (
    <>
      <div className="sage-card-head"><span className="sage-card-label">SEARCH · MATTERS LOCAL + SESSION CONTENT</span><span className="sage-card-index">D0</span></div>
      <h2>搜索</h2>
      <p className="sage-card-note">一次输入两区：<strong>事项</strong>在 Sage 本地记录按标题与属性匹配；<strong>会话</strong>走运行时检索（只读、有界、只含可见会话，内部分页）。命中都是只读文本——<strong>不打开会话、不激活执行、不加载正文</strong>；全文检索与统一排序后置；运行时没有检索引擎时会话区如实显示「不可用」。</p>
      <div className="sage-state-row">
        <span>关键词</span>
        <input
          className="sage-row-input"
          id="search-input"
          type="text"
          aria-label="搜索关键词"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') run() }}
        />
      </div>
      <button className="sage-secondary-button" id="search-run" type="button" disabled={searching} onClick={run}>搜索</button>
      <p id="search-note" className="sage-card-note" role="status" aria-live="polite">{note}</p>
      <span className="sage-card-label">事项（本地匹配）</span>
      <ul className="sage-roster-list" id="search-matter-rows">
        {matters.map((hit) => {
          const matterRef = typeof hit.matterRef === 'string' ? hit.matterRef : ''
          if (matterRef === '') return null
          const fieldLabel = hit.matchedField === 'goal' ? '标题' : hit.matchedField === 'deliverable' ? '交付' : hit.matchedField === 'responsibility' ? '责任' : '项目'
          return (
            <li key={matterRef} className="sage-roster-row" data-search-matter={matterRef}>
              <span className="sage-roster-tag">{'命中：' + fieldLabel + '（本地记录）'}</span>
              <span>{String(hit.title ?? matterRef)}</span>
            </li>
          )
        })}
      </ul>
      <span className="sage-card-label">会话（运行时检索）</span>
      <p id="search-session-state" className="sage-card-note" role="status" aria-live="polite">{sessionStateText}</p>
      <ul className="sage-roster-list" id="search-session-rows">
        {sessionItems.map((item) => {
          const sessionId = typeof item.sessionId === 'string' ? item.sessionId : ''
          if (sessionId === '') return null
          return (
            <li key={sessionId} className="sage-roster-row" data-search-session={sessionId}>
              <span className="sage-roster-tag">会话命中</span>
              <span>{String(item.snippet ?? '')}</span>
            </li>
          )
        })}
      </ul>
    </>
  )
}
