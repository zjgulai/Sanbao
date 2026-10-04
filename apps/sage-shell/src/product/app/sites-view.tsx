/**
 * Web-deliverables catalog (ADR-0261, strangler P3 / batch 16).
 *
 * Renders `#sage-region-sites` (the `sage-sites-card` article is the React root container; the
 * served document keeps the fail-closed first frame inside it). The only entry is the per-version
 * offline preview, which calls back into the legacy wire action; the copy and the state machine
 * (catalog is a read-only filter of observed cards — 已托管≠上线) stay pinned to the legacy text.
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import type { JSX } from 'react'

import { regionMessage, type AppBridgeStore, type SitesRegionMessage } from './bridge.js'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isWebCard(card: unknown): card is Record<string, unknown> {
  return isRecord(card) && card.kind === 'html'
}

function cardName(card: Record<string, unknown>): string {
  return typeof card.name === 'string' ? card.name : String(card.artifactId ?? '')
}

function stateCopy(state: unknown): string {
  return state === 'ready' ? '本机就绪（离线预览可用）'
    : state === 'absent' ? '观察时不存在（保留上次版本标记）' : '未核验（重新观察后再试）'
}

export interface SitesRegionProps {
  readonly store: AppBridgeStore
  /** The `#sage-region-sites` article; the region publishes its machine state here. */
  readonly container: HTMLElement
}

export function SitesRegion({ store, container }: SitesRegionProps): JSX.Element {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const message = regionMessage<SitesRegionMessage>(snapshot, 'sites', { kind: 'unavailable' })
  const [pendingId, setPendingId] = useState<string | null>(null)

  useEffect(() => {
    container.setAttribute('data-region-state', message.kind)
  }, [container, message.kind])

  const cards = message.kind === 'cards' ? message.cards : []
  const web = cards.filter(isWebCard)
  const note = message.kind === 'unavailable'
    ? '未核验：这一版还没有接上产物存储（目录不空报）。'
    : web.length === 0
      ? '本机还没有网页型成果：目录只读，观察到 .html/.htm 文件变化后才会出现。'
      : '共 ' + String(web.length) + ' 项网页型成果（同源版本；访问限制：仅本机离线预览）。'

  const preview = (artifactId: string): void => {
    setPendingId(artifactId)
    void (async () => {
      try {
        await window.__SAGE_LEGACY_ACTIONS__?.openArtifact?.(artifactId)
      } finally {
        setPendingId(null)
      }
    })()
  }

  return (
    <>
      <div className="sage-card-head"><span className="sage-card-label">WEB DELIVERABLES · LOCAL CATALOG</span><span className="sage-card-index">D11</span></div>
      <h2>网页成果目录（只读）</h2>
      <p className="sage-card-note">本目录只读浏览本次运行观察到的网页型成果，显示同源版本与访问限制——<strong>已托管/可预览不等于网站上线</strong>：本版没有发布、部署或托管入口；预览沿离线容器打开，外链沿系统浏览器显式入口。</p>
      <ul className="sage-roster-list" id="site-rows">
        {web.map((card) => {
          const artifactId = typeof card.artifactId === 'string' ? card.artifactId : ''
          if (artifactId === '') return null
          return (
            <li key={artifactId} className="sage-roster-row">
              <strong>{cardName(card)}</strong>
              <span className="sage-roster-tag">版本 {String(card.version ?? '')}</span>
              <span>{stateCopy(card.state)}</span>
              <span>访问限制：仅本机离线预览（无发布/托管入口）</span>
              {card.state === 'ready' && (
                <button
                  className="sage-row-button"
                  type="button"
                  data-artifact-action="open"
                  data-artifact-id={artifactId}
                  disabled={pendingId === artifactId}
                  onClick={() => preview(artifactId)}
                >
                  预览（离线）
                </button>
              )}
            </li>
          )
        })}
      </ul>
      <p id="site-note" className="sage-card-note" role="status" aria-live="polite">{note}</p>
    </>
  )
}
