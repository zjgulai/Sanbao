/**
 * Link card (ADR-0261, strangler P3 / batch 20 — the selector cluster).
 *
 * Renders `#sage-region-link` (the `sage-link-card` article is the React root container): the two
 * pickers, the three named link acts, the linked-rows roster and the read-only trail. The picker
 * selection is pushed to the legacy script through `__SAGE_APP_SET_LINK_SELECTION__` so every
 * wire action reads it there instead of this DOM; the acts themselves stay on the legacy wire
 * through the down-bridge (exact bodies, refusal text, refresh).
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import type { JSX } from 'react'

import { regionMessage, type AppBridgeStore, type LinkRegionMessage } from './bridge.js'

export interface LinkRegionProps {
  readonly store: AppBridgeStore
  /** The `#sage-region-link` article; the region publishes its machine state here. */
  readonly container: HTMLElement
}

export function LinkRegion({ store, container }: LinkRegionProps): JSX.Element {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const message = regionMessage<LinkRegionMessage>(snapshot, 'link', { kind: 'unavailable' })
  const [localNotice, setLocalNotice] = useState<string | null>(null)
  const [matterChoice, setMatterChoice] = useState<string | null>(null)
  const [workspaceChoice, setWorkspaceChoice] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [defaulting, setDefaulting] = useState(false)

  useEffect(() => {
    container.setAttribute('data-region-state', message.kind === 'read' ? 'read' : 'unavailable')
  }, [container, message.kind])

  const known = message.kind === 'read'
  const slot = known ? message.slot : null
  const links = slot !== null && Array.isArray(slot.links) ? slot.links : []
  const trail = slot !== null && Array.isArray(slot.trail) ? slot.trail : []
  const matters = slot !== null && Array.isArray(slot.matters) ? slot.matters : []
  const workspaces = slot !== null && Array.isArray(slot.workspaces) ? slot.workspaces : []

  const optionValues = (options: readonly { readonly value?: string }[]): string[] =>
    options.map((option) => (typeof option.value === 'string' ? option.value : ''))
  const matterValues = optionValues(matters)
  const workspaceValues = optionValues(workspaces)
  // Defaults follow the legacy fillSelect exactly: keep the previous pick while it survives a
  // refresh, otherwise fall to the first option, '' when there is none.
  const matterRef = matterChoice !== null && matterValues.includes(matterChoice) ? matterChoice : (matterValues[0] ?? '')
  const workspaceRef = workspaceChoice !== null && workspaceValues.includes(workspaceChoice) ? workspaceChoice : (workspaceValues[0] ?? '')

  // Every derived selection reaches the legacy wire actions through the up-bridge.
  useEffect(() => {
    window.__SAGE_APP_SET_LINK_SELECTION__?.(matterRef, workspaceRef)
  }, [matterRef, workspaceRef])

  const note = localNotice ?? (!known ? '未核验：这一版还没有接上关联存储。'
    : trail.length === 0 ? '还没有任何关联操作记录。'
      : '操作记录 ' + String(trail.length) + ' 条（只读留痕）。')

  const add = (): void => {
    setLocalNotice(null)
    setAdding(true)
    void (async () => {
      try {
        const notice = await window.__SAGE_LEGACY_ACTIONS__?.addLink?.(matterRef, workspaceRef)
        if (typeof notice === 'string') setLocalNotice(notice)
      } finally {
        setAdding(false)
      }
    })()
  }

  const remove = (): void => {
    setLocalNotice(null)
    setRemoving(true)
    void (async () => {
      try {
        await window.__SAGE_LEGACY_ACTIONS__?.removeLink?.(matterRef, workspaceRef)
      } finally {
        setRemoving(false)
      }
    })()
  }

  const setDefault = (): void => {
    setLocalNotice(null)
    setDefaulting(true)
    void (async () => {
      try {
        await window.__SAGE_LEGACY_ACTIONS__?.setDefaultLink?.(matterRef, workspaceRef)
      } finally {
        setDefaulting(false)
      }
    })()
  }

  const actionLabels: Record<string, string> = { 'linked': '建立关联', 'unlinked': '解除关联', 'default-set': '设为默认', 'default-cleared': '清除默认' }

  return (
    <>
      <div className="sage-card-head"><span className="sage-card-label">MATTER ↔ WORKSPACE · NAMED OPS</span><span className="sage-card-index">D2</span></div>
      <h2>事项 ↔ 工作区关联</h2>
      <p className="sage-card-note">关联由你在事项侧显式建立和解除，每次操作都会写进下面的操作记录（谁、何时、对哪个工作区做了哪一步）。关联只引用已采纳的工作区，<strong>不读取、不上传任何资料内容</strong>；解除只解除关联——既有引用仍指向原来源版本，也不会把执行环境静默换成别的工作区。</p>
      <div className="sage-state-row"><span>事项</span><select id="link-matter" aria-label="选择事项" value={matterRef} onChange={(event) => setMatterChoice(event.target.value)}>
        {matters.length === 0
          ? <option value="">（本设备还没有已建项的事项）</option>
          : matters.map((option, index) => <option key={index} value={typeof option.value === 'string' ? option.value : ''}>{typeof option.label === 'string' ? option.label : ''}</option>)}
      </select></div>
      <div className="sage-state-row"><span>工作区</span><select id="link-workspace" aria-label="选择工作区" value={workspaceRef} onChange={(event) => setWorkspaceChoice(event.target.value)}>
        {workspaces.length === 0
          ? <option value="">（还没有已采纳的工作区）</option>
          : workspaces.map((option, index) => <option key={index} value={typeof option.value === 'string' ? option.value : ''}>{typeof option.label === 'string' ? option.label : ''}</option>)}
      </select></div>
      <button className="sage-secondary-button" id="link-add" type="button" disabled={adding} onClick={add}>关联</button>
      <button className="sage-secondary-button" id="link-remove" type="button" disabled={removing} onClick={remove}>解除</button>
      <button className="sage-secondary-button" id="link-default" type="button" disabled={defaulting} onClick={setDefault}>设为默认执行环境</button>
      <p id="link-note" className="sage-card-note" role="status" aria-live="polite">{note}</p>
      <ul className="sage-roster-list" id="link-rows">
        {links.map((link, index) => (
          <li key={index} className="sage-roster-row" data-link-key={String(link.matterRef) + '|' + String(link.workspaceRef)}>
            <strong>{String(link.workspacePath !== '' ? link.workspacePath : link.workspaceRef)}</strong>
            <span className="sage-roster-tag">{'事项 ' + String(link.matterRef)}</span>
            {link.isDefault === true && <span className="sage-roster-tag is-ok">默认执行环境</span>}
          </li>
        ))}
      </ul>
      <ul className="sage-roster-list" id="link-trail">
        {trail.map((record, index) => (
          <li key={index} className="sage-roster-row" data-trail-id={String(record.linkId)}>
            <span className="sage-roster-tag">{actionLabels[String(record.action)] ?? String(record.action)}</span>
            <span>{String(record.matterRef) + (record.workspaceRef === undefined ? '' : ' → ' + String(record.workspaceRef))}</span>
            <span className="sage-roster-tag">{String(record.at)}</span>
          </li>
        ))}
      </ul>
    </>
  )
}
