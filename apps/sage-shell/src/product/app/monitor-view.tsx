/**
 * Run-monitor card (ADR-0261, strangler P3 / batch 17).
 *
 * Renders `#sage-region-run-monitor` (the `sage-run-monitor-card` article is the React root
 * container). The four axes keep their own words (no synthesized status); collapsing is local
 * view state that posts nothing and survives the poll. The run-log cursor walk stays on the
 * legacy wire: the actions return the display rows plus the legacy-computed notice, and this
 * component only applies append/replace and renders.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { JSX } from 'react'

import { regionMessage, type AppBridgeStore, type RunLogResult, type RunMonitorRegionMessage } from './bridge.js'

const STEPS_UNAVAILABLE = '不可用（监控未读取）'
const BUDGET_TEXT = '未知（来源未接线——未知≠零，不用数字冒充）'
const DEVICE_TEXT = '未知（未接上设备绑定读数）——离线≠运行取消，≠被其他设备接管'
const BACKGROUND_TEXT = '未知（Host 侧执行主体未接线）——面板开合不影响运行'
const CONTEXT_TEXT = '未知（无上下文读数；压缩无读数——本版无压缩触发入口，压缩不得泄漏私有侧聊或扩大外传）'

function stepsText(message: RunMonitorRegionMessage): string {
  if (message.kind !== 'read') return STEPS_UNAVAILABLE
  const steps = message.slot.steps ?? null
  if (steps === null) return STEPS_UNAVAILABLE
  return steps.state === 'running' ? '执行中（会话有未结束的一轮）'
    : steps.state === 'idle' ? '空闲（没有未结束的轮）'
      : '不可用（' + String(steps.reason ?? 'unknown') + '）'
}

export interface MonitorRegionProps {
  readonly store: AppBridgeStore
  /** The `#sage-region-run-monitor` article; the region publishes its machine state here. */
  readonly container: HTMLElement
}

export function MonitorRegion({ store, container }: MonitorRegionProps): JSX.Element {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const message = regionMessage<RunMonitorRegionMessage>(snapshot, 'run-monitor', { kind: 'unavailable' })
  const [collapsed, setCollapsed] = useState(false)
  const [logPath, setLogPath] = useState('logs/run.log')
  const [logLines, setLogLines] = useState<readonly { readonly no?: unknown, readonly text?: unknown }[]>([])
  const [logNote, setLogNote] = useState('')
  const [pendingOpen, setPendingOpen] = useState(false)
  const [pendingContinue, setPendingContinue] = useState(false)
  const logPathRef = useRef(logPath)
  logPathRef.current = logPath

  useEffect(() => {
    container.setAttribute('data-region-state', message.kind === 'read' ? 'read' : 'unavailable')
  }, [container, message.kind])

  const applyResult = (result: RunLogResult): void => {
    setLogLines((previous) => (result.append ? [...previous, ...result.lines] : [...result.lines]))
    setLogNote(result.notice)
  }

  const open = (): void => {
    setPendingOpen(true)
    void (async () => {
      try {
        const result = await window.__SAGE_LEGACY_ACTIONS__?.runLogOpen?.(logPathRef.current.trim())
        if (result !== undefined && result !== null) applyResult(result)
      } finally {
        setPendingOpen(false)
      }
    })()
  }

  const cont = (): void => {
    setPendingContinue(true)
    void (async () => {
      try {
        const result = await window.__SAGE_LEGACY_ACTIONS__?.runLogContinue?.()
        if (result !== undefined && result !== null) applyResult(result)
      } finally {
        setPendingContinue(false)
      }
    })()
  }

  return (
    <>
      <div className="sage-card-head"><span className="sage-card-label">RUN MONITOR · FOUR AXES · LOG READ-ONLY</span><span className="sage-card-index">D8</span></div>
      <h2>运行监控、用量与运行日志</h2>
      <p className="sage-card-note">四轴<strong>各自独立</strong>呈现、不合成单一「运行状态」：步骤来自会话的同一投影；预算／用量分<strong>预留／消耗／最终账单</strong>三态，来源未接线时为「未知」——<strong>不以零代替未知</strong>。设备<strong>离线不等于运行取消、也不等于被其他设备接管</strong>。后台执行主体在 Host 侧：<strong>折叠或关闭这个面板不会取消运行</strong>（面板只是本地视图状态）。上下文用量与压缩只读呈现；压缩是否发生由执行侧决定，本版没有压缩读数、也没有压缩触发入口；任何压缩都不得把私有侧聊带入主对话或扩大外传。运行日志<strong>只读、有界续读</strong>，不进入普通对话同步；导出需独立核权（本版无导出入口）。</p>
      <button className="sage-secondary-button" id="monitor-toggle" type="button" onClick={() => setCollapsed((value) => !value)}>{collapsed ? '展开面板' : '收起面板'}</button>
      <div id="monitor-body" hidden={collapsed}>
        <div className="sage-state-row"><span>步骤（同一会话投影）</span><strong id="monitor-steps" data-monitor-fact>{stepsText(message)}</strong></div>
        <div className="sage-state-row"><span>预算 · 预留</span><strong id="monitor-budget-reserved" data-monitor-fact>{BUDGET_TEXT}</strong></div>
        <div className="sage-state-row"><span>预算 · 消耗</span><strong id="monitor-budget-consumed" data-monitor-fact>{BUDGET_TEXT}</strong></div>
        <div className="sage-state-row"><span>预算 · 最终账单</span><strong id="monitor-budget-billed" data-monitor-fact>{BUDGET_TEXT}</strong></div>
        <div className="sage-state-row"><span>设备</span><strong id="monitor-device" data-monitor-fact>{DEVICE_TEXT}</strong></div>
        <div className="sage-state-row"><span>后台</span><strong id="monitor-background" data-monitor-fact>{BACKGROUND_TEXT}</strong></div>
        <div className="sage-state-row"><span>上下文 / 压缩</span><strong id="monitor-context" data-monitor-fact>{CONTEXT_TEXT}</strong></div>
        <div className="sage-run-log-block" aria-label="运行日志">
          <span className="sage-card-label">RUN LOG · READ-ONLY · BOUNDED CURSOR</span>
          <div className="sage-state-row"><span>日志文件（工作区内相对路径）</span><input className="sage-row-input" id="run-log-path" type="text" value={logPath} aria-label="日志文件相对路径" onChange={(event) => setLogPath(event.target.value)} /></div>
          <button className="sage-secondary-button" id="run-log-open" type="button" disabled={pendingOpen} onClick={open}>读取运行日志</button>
          <button className="sage-secondary-button" id="run-log-continue" type="button" disabled={pendingContinue} onClick={cont}>继续读取（游标）</button>
          <p id="run-log-note" className="sage-card-note" role="status" aria-live="polite">{logNote}</p>
          <ul className="sage-roster-list" id="run-log-rows">
            {logLines.map((line, index) => (
              <li key={index} className="sage-roster-row" data-log-line-no={String(line.no ?? '')}>
                <span className="sage-roster-tag">{String(line.no ?? '?')}</span>
                <span>{typeof line.text === 'string' ? line.text : ''}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  )
}
