/**
 * Typed tool-result rows (ADR-0261, strangler P3 / batch 16).
 *
 * Renders `#sage-region-tool-results` (the `sage-tool-results-card` article is the React root
 * container). Kinds render through Sage-owned element shapes only (text / key-values / table /
 * link / image); refused types are named and carry no entry. The two explicit entries call back
 * into the legacy wire actions; the local notice (opened / refused / failed handoff) comes back
 * from the legacy action as final text and stays until the next action, exactly like the legacy
 * writer did.
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import type { JSX } from 'react'

import { regionMessage, type AppBridgeStore, type ToolResultFieldView, type ToolResultView, type ToolResultsRegionMessage } from './bridge.js'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function FieldView({ field, pendingLink, pendingArtifact, onOpenLink, onOpenArtifact }: {
  readonly field: ToolResultFieldView
  readonly pendingLink: string | null
  readonly pendingArtifact: string | null
  readonly onOpenLink: (url: string) => void
  readonly onOpenArtifact: (artifactId: string) => void
}): JSX.Element | null {
  if (typeof field.kind !== 'string') return null
  if (field.kind === 'text') {
    return <pre className="sage-tool-text">{typeof field.text === 'string' ? field.text : ''}</pre>
  }
  if (field.kind === 'key-values') {
    const entries = Array.isArray(field.entries) ? field.entries : []
    return (
      <>
        {entries.filter(isRecord).map((entry, index) => (
          <span key={index} className="sage-tool-kv">{String(entry.name ?? '')}：{String(entry.value ?? '')}</span>
        ))}
      </>
    )
  }
  if (field.kind === 'table') {
    const columns = Array.isArray(field.columns) ? field.columns : []
    const rows = Array.isArray(field.rows) ? field.rows : []
    return (
      <table className="sage-tool-table">
        <tbody>
          <tr>{columns.map((column, index) => <th key={index}>{String(column)}</th>)}</tr>
        </tbody>
        <tbody>
          {rows.filter(Array.isArray).map((row, rowIndex) => (
            <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{String(cell)}</td>)}</tr>
          ))}
        </tbody>
      </table>
    )
  }
  if (field.kind === 'link') {
    const url = typeof field.url === 'string' ? field.url : ''
    return (
      <>
        <span className="sage-tool-link">{String(field.label ?? '')} · {String(field.host ?? '')}</span>
        <button
          className="sage-row-button"
          type="button"
          data-tool-action="open-link"
          data-link-url={url}
          disabled={url !== '' && pendingLink === url}
          onClick={() => onOpenLink(url)}
        >
          在系统浏览器打开（先校验）
        </button>
      </>
    )
  }
  if (field.kind === 'image') {
    const artifactId = typeof field.artifactId === 'string' ? field.artifactId : ''
    return (
      <>
        <span className="sage-tool-image">{String(field.name ?? '')} · 版本 {String(field.version ?? '')}</span>
        <button
          className="sage-row-button"
          type="button"
          data-artifact-action="open"
          data-artifact-id={artifactId}
          disabled={artifactId !== '' && pendingArtifact === artifactId}
          onClick={() => onOpenArtifact(artifactId)}
        >
          打开预览（按版本）
        </button>
      </>
    )
  }
  return <span>该条目不提供入口（{String(field.code ?? 'unknown')}）——不用替代内容渲染。</span>
}

function ResultRow({ result, pendingLink, pendingArtifact, onOpenLink, onOpenArtifact }: {
  readonly result: ToolResultView
  readonly pendingLink: string | null
  readonly pendingArtifact: string | null
  readonly onOpenLink: (url: string) => void
  readonly onOpenArtifact: (artifactId: string) => void
}): JSX.Element | null {
  if (typeof result.resultId !== 'string') return null
  if (result.state === 'unsupported') {
    return (
      <li className="sage-roster-row" data-tool-result-id={result.resultId}>
        <strong>{String(result.tool ?? '')} · {String(result.title ?? '')}</strong>
        <span>不支持的类型：{String(result.declaredType ?? '未知')}（已明确拒绝——不用替代内容渲染）。</span>
      </li>
    )
  }
  const fields = Array.isArray(result.fields) ? result.fields : []
  return (
    <li className="sage-roster-row" data-tool-result-id={result.resultId}>
      <strong>{String(result.tool ?? '')} · {String(result.title ?? '')}</strong>
      <span>{String(result.at ?? '')}</span>
      {fields.filter(isRecord).map((field, index) => (
        <FieldView
          key={index}
          field={field}
          pendingLink={pendingLink}
          pendingArtifact={pendingArtifact}
          onOpenLink={onOpenLink}
          onOpenArtifact={onOpenArtifact}
        />
      ))}
    </li>
  )
}

export interface ToolResultsRegionProps {
  readonly store: AppBridgeStore
  /** The `#sage-region-tool-results` article; the region publishes its machine state here. */
  readonly container: HTMLElement
}

export function ToolResultsRegion({ store, container }: ToolResultsRegionProps): JSX.Element {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const message = regionMessage<ToolResultsRegionMessage>(snapshot, 'tool-results', { kind: 'unavailable' })
  const [localNotice, setLocalNotice] = useState<string | null>(null)
  const [pendingLink, setPendingLink] = useState<string | null>(null)
  const [pendingArtifact, setPendingArtifact] = useState<string | null>(null)

  useEffect(() => {
    container.setAttribute('data-region-state', message.kind)
  }, [container, message.kind])

  const results = message.kind === 'results' ? message.results : []
  const payloadNote = message.kind === 'unavailable'
    ? '未核验：这一版还没有接上工具结果来源（provider 未接线；不用空列表冒充结果）。'
    : results.length === 0
      ? '本次运行还没有 typed 工具结果。'
      : '共 ' + String(results.length) + ' 条结果（只读；可交互的只有：显式链接打开与按版本预览）。'
  const note = localNotice ?? payloadNote

  const openLink = (url: string): void => {
    if (url === '') return
    setLocalNotice(null)
    setPendingLink(url)
    void (async () => {
      try {
        const notice = await window.__SAGE_LEGACY_ACTIONS__?.openExternalLink?.(url)
        setLocalNotice(typeof notice === 'string' ? notice : null)
      } finally {
        setPendingLink(null)
      }
    })()
  }

  const openArtifact = (artifactId: string): void => {
    if (artifactId === '') return
    setPendingArtifact(artifactId)
    void (async () => {
      try {
        await window.__SAGE_LEGACY_ACTIONS__?.openArtifact?.(artifactId)
      } finally {
        setPendingArtifact(null)
      }
    })()
  }

  return (
    <>
      <div className="sage-card-head"><span className="sage-card-label">TOOL RESULTS · SAGE-OWNED COMPONENTS</span><span className="sage-card-index">D10</span></div>
      <h2>工具结果（typed 数据，Sage 组件呈现）</h2>
      <p className="sage-card-note">结果按声明类型经严格解析后由 Sage 自有组件呈现——<strong>不支持的类型明确拒绝，不用替代内容渲染</strong>；结果内不执行脚本、不接受权威动作输入；敏感字段以已脱敏显示，原始载荷不透传。链接只在显式点击下经校验交给系统浏览器（不自动联网）；图片结果按权限解析到本运行的就绪产物，打开仍按版本读取；没有批注入口。</p>
      <p id="tool-result-note" className="sage-card-note" role="status" aria-live="polite">{note}</p>
      <ul className="sage-roster-list" id="tool-result-rows">
        {results.map((result, index) => (
          <ResultRow
            key={typeof result.resultId === 'string' ? result.resultId : index}
            result={result}
            pendingLink={pendingLink}
            pendingArtifact={pendingArtifact}
            onOpenLink={openLink}
            onOpenArtifact={openArtifact}
          />
        ))}
      </ul>
    </>
  )
}
