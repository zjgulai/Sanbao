/**
 * Artifact card (ADR-0261, strangler P3 / batch 17).
 *
 * Renders `#sage-region-artifacts` (the `sage-artifact-card` article is the React root
 * container): the observed cards, the side-preview panel states and the explicit entries
 * (observe / open by version / retry same version / full view / separate window / close).
 * Requests, refusal-code sentences and the local notice text stay on the legacy wire through
 * the down-bridge; this component owns the DOM, per-entry pending state and notice timing.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { JSX } from 'react'

import { regionMessage, type AppBridgeStore, type ArtifactCardView, type ArtifactsRegionMessage, type ArtifactPreviewView } from './bridge.js'

const KIND_LABEL: Readonly<Record<string, string>> = {
  text: '纯文本', markdown: 'Markdown（源文本）', code: '代码', image: '图像',
  html: '离线 HTML', pdf: 'PDF', csv: 'CSV 表格', office: 'Office 原格式', binary: '二进制',
}

const FAILURE_SENTENCE: Readonly<Record<string, string>> = {
  'artifact-source-absent': '打开失败：文件已不在。',
  'artifact-too-large': '超出本版预览上限：文件超出实测处理上限，未解析显示（不把截断冒充完整内容）。',
  'artifact-not-text': '无法预览：内容不是可解码文本。',
  'artifact-csv-parse-failed': 'CSV 解析失败：结构无法解析，未显示表格（这不是"空文件"）。',
  'artifact-load-failed': '预览容器加载失败（可重试同一版本）。',
  'artifact-version-changed': '打开失败：文件在打开前已变化（不会切到新版本）。',
  'artifact-preview-window-unavailable': '预览容器暂不可用：无法创建预览窗口。',
}

function previewNoteOf(preview: ArtifactPreviewView): string {
  const state = typeof preview.state === 'string' ? preview.state : 'closed'
  if (state === 'closed') return '未打开：卡片出现不会创建或加载预览。'
  if (state === 'opening') return '正在按卡片版本读取内容…'
  if (state === 'ready') {
    return '已在右侧容器打开：' + String(preview.name) + '（' + String(preview.version) + '）。'
      + (preview.expanded === true ? '（全屏查看：同一文档，未重新加载、未重读版本）' : '')
      + (preview.window === true ? '（独立窗口已打开：同一文档、同一版本引用；关闭独立窗口不改产物记录）' : '')
  }
  if (state === 'failed') {
    return (FAILURE_SENTENCE[String(preview.code)] ?? ('打开失败：' + String(preview.code)))
      + (preview.retryable === true ? '（可对同一版本重试）' : '（该失败不支持同版本重试）')
  }
  return ''
}

export interface ArtifactRegionProps {
  readonly store: AppBridgeStore
  /** The `#sage-region-artifacts` article; the region publishes its machine state here. */
  readonly container: HTMLElement
}

export function ArtifactRegion({ store, container }: ArtifactRegionProps): JSX.Element {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const message = regionMessage<ArtifactsRegionMessage>(snapshot, 'artifacts', { kind: 'unavailable' })
  const [localNotice, setLocalNotice] = useState<string | null>(null)
  const [previewNote, setPreviewNote] = useState('')
  const [pendingObserve, setPendingObserve] = useState(false)
  const [pendingCardId, setPendingCardId] = useState<string | null>(null)
  const [pendingRetry, setPendingRetry] = useState(false)
  const [pendingClose, setPendingClose] = useState(false)
  const [pendingExpand, setPendingExpand] = useState(false)
  const [pendingWindow, setPendingWindow] = useState(false)
  const expandRef = useRef<HTMLButtonElement | null>(null)
  const localNoticeRef = useRef<string | null>(null)
  localNoticeRef.current = localNotice

  const known = message.kind === 'cards'
  const cards: readonly ArtifactCardView[] = known ? message.cards : []
  const preview: ArtifactPreviewView = known ? message.preview : { state: 'closed' }
  const previewState = typeof preview.state === 'string' ? preview.state : 'closed'
  const previewExpanded = previewState === 'ready' && preview.expanded === true
  const windowOpen = previewState === 'ready' && preview.window === true

  useEffect(() => {
    container.setAttribute('data-region-state', message.kind === 'cards' ? 'cards' : 'unavailable')
  }, [container, message.kind])

  // The payload preview sentence is frozen while a local notice is showing (legacy guard).
  useEffect(() => {
    if (localNoticeRef.current === null) setPreviewNote(previewNoteOf(preview))
  }, [preview])

  const payloadNote = !known
    ? '未核验：这一版还没有接上产物观察端口。'
    : cards.length === 0
      ? '还没有观察到产物；点"观察本次运行的文件变化"读取线索（线索经 stat 核验后才显示就绪）。'
      : String(cards.length) + ' 张产物卡（来源：本会话的文件变化观察 + 一次 stat 核验；不是交付验收结论）。'
  const note = localNotice ?? payloadNote

  const observe = (): void => {
    setLocalNotice(null)
    setPendingObserve(true)
    void (async () => {
      try {
        const notice = await window.__SAGE_LEGACY_ACTIONS__?.observeArtifacts?.()
        if (typeof notice === 'string') setLocalNotice(notice)
      } finally {
        setPendingObserve(false)
      }
    })()
  }

  const openCard = (artifactId: string): void => {
    setLocalNotice(null)
    setPendingCardId(artifactId)
    void (async () => {
      try {
        await window.__SAGE_LEGACY_ACTIONS__?.openArtifact?.(artifactId)
      } finally {
        setPendingCardId(null)
      }
    })()
  }

  const retry = (): void => {
    setLocalNotice(null)
    setPendingRetry(true)
    void (async () => {
      try {
        await window.__SAGE_LEGACY_ACTIONS__?.retryArtifactPreview?.()
      } finally {
        setPendingRetry(false)
      }
    })()
  }

  const close = (): void => {
    setLocalNotice(null)
    setPendingClose(true)
    void (async () => {
      try {
        await window.__SAGE_LEGACY_ACTIONS__?.closeArtifactPreview?.()
      } finally {
        setPendingClose(false)
      }
    })()
  }

  const toggleFullscreen = (): void => {
    const wasExpanded = previewExpanded
    setLocalNotice(null)
    setPendingExpand(true)
    void (async () => {
      try {
        await window.__SAGE_LEGACY_ACTIONS__?.setArtifactFullscreen?.(!wasExpanded)
      } finally {
        setPendingExpand(false)
        // 退出全屏：焦点回到触发器（US-172 的"全屏退出恢复焦点"）。
        if (wasExpanded) expandRef.current?.focus()
      }
    })()
  }

  const toggleWindow = (): void => {
    const isOpen = windowOpen
    setLocalNotice(null)
    setPendingWindow(true)
    void (async () => {
      try {
        const notice = await window.__SAGE_LEGACY_ACTIONS__?.artifactWindow?.(isOpen ? 'close' : 'open')
        if (typeof notice === 'string') setLocalNotice(notice)
      } finally {
        setPendingWindow(false)
      }
    })()
  }

  return (
    <>
      <div className="sage-card-head"><span className="sage-card-label">ARTIFACTS · CARD FIRST, OPEN ON CLICK</span><span className="sage-card-index">D4</span></div>
      <h2>产物卡与侧面预览</h2>
      <p className="sage-card-note">卡片只展示本次运行观察到的文件变化（线索经一次 stat 核验后给出"就绪"版本），<strong>卡片出现不会创建或加载任何预览</strong>。点击卡片才按该版本读取内容，并在 main 管理的右侧容器中打开；预览失败可对<strong>同一版本</strong>重试——不静默切到最新版本、不重跑生成。Office 原格式本版不内置预览、不自动转换，也不把"可下载"写成"可预览"。</p>
      <button className="sage-secondary-button" id="artifact-observe" type="button" disabled={pendingObserve} onClick={observe}>观察本次运行的文件变化</button>
      <p id="artifact-note" className="sage-card-note" role="status" aria-live="polite">{note}</p>
      <ul className="sage-roster-list" id="artifact-cards">
        {cards.map((card) => {
          const artifactId = typeof card.artifactId === 'string' ? card.artifactId : ''
          if (artifactId === '') return null
          const kind = typeof card.kind === 'string' ? card.kind : 'binary'
          const state = typeof card.state === 'string' ? card.state : 'unconfirmed'
          return (
            <li key={artifactId} className="sage-roster-row" data-artifact-card={artifactId} data-artifact-state={state}>
              <span className={`sage-roster-tag ${state === 'ready' ? 'is-ok' : 'is-blocked'}`}>{state === 'ready' ? '就绪（版本已核验）' : state === 'absent' ? '观察时不存在' : '未能核验（保留上一次观察）'}</span>
              <span>{String(card.name ?? '')}（{KIND_LABEL[kind] ?? KIND_LABEL.binary}{(typeof card.bytes === 'number' ? ' · ' + String(card.bytes) + ' 字节' : '')}）</span>
              {kind === 'office' && <span className="sage-roster-tag">本版无内置预览（不自动转换；不把可下载写成可预览）</span>}
              {kind === 'binary' && <span className="sage-roster-tag">本版不支持该格式</span>}
              {kind !== 'office' && kind !== 'binary' && state === 'ready' && (
                <button className="sage-row-button" type="button" data-artifact-action="open" data-artifact-id={artifactId} disabled={pendingCardId === artifactId} onClick={() => openCard(artifactId)}>打开预览（该版本）</button>
              )}
            </li>
          )
        })}
      </ul>
      <div id="artifact-preview" className="sage-artifact-preview" data-preview-state={previewState}>
        <span className="sage-card-label">SIDE PREVIEW · NON-PRIVILEGED CONTAINER</span>
        <p id="artifact-preview-note" className="sage-card-note" role="status" aria-live="polite">{previewNote}</p>
        <button className="sage-secondary-button" id="artifact-expand" type="button" hidden={previewState !== 'ready'} data-expanded={previewExpanded ? 'true' : 'false'} disabled={pendingExpand} ref={expandRef} onClick={toggleFullscreen}>{previewExpanded ? '退出全屏（返回侧栏）' : '全屏查看（离线）'}</button>
        <button className="sage-secondary-button" id="artifact-window" type="button" hidden={previewState !== 'ready'} data-window-open={windowOpen ? 'true' : 'false'} disabled={pendingWindow} onClick={toggleWindow}>{windowOpen ? '关闭独立窗口' : '在独立窗口打开（同一版本）'}</button>
        <button className="sage-secondary-button" id="artifact-retry" type="button" hidden={previewState !== 'failed' || preview.retryable !== true} disabled={pendingRetry} onClick={retry}>重试同一版本</button>
        <button className="sage-secondary-button" id="artifact-close" type="button" hidden={previewState !== 'ready' && previewState !== 'opening' && previewState !== 'failed'} disabled={pendingClose} onClick={close}>关闭预览</button>
        <p className="sage-card-note">预览在独立非特权容器中打开（独立会话、无 preload、无特权通道、离线交互）；关闭预览不停止执行、不动对话与输入。</p>
      </div>
    </>
  )
}
