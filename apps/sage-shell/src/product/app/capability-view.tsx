/**
 * Capability roster, its source badge and the model-config card (ADR-0261, P4 / batch 26).
 *
 * Both cards are pure read-only projections: they publish raw `/.sage/state` slices through the
 * region bridge and this module assembles structure facts and reason sentences — nothing here
 * fetches, and nothing here can edit or install anything. The heading's source badge reads the
 * same `capability` region message, so provenance stays one fact with two views.
 */
import { useEffect, useSyncExternalStore } from 'react'
import type { JSX } from 'react'

import { regionMessage, type AppBridgeStore, type CapabilityRegionMessage, type ModelConfigRegionMessage } from './bridge.js'

/** Module-level so its identity is stable: effects keyed on the message object must not loop. */
const CAPABILITY_UNAVAILABLE: CapabilityRegionMessage = { kind: 'unavailable' }
const MODEL_CONFIG_UNAVAILABLE: ModelConfigRegionMessage = { kind: 'unavailable' }

const asRecord = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
const text = (value: unknown, fallback = ''): string => typeof value === 'string' ? value : fallback

const CAPABILITY_REASON_NOTES: Record<string, string> = {
  'observation-not-read': '未核验：还没有读到运行时的清单，无法判断任何一项的状态。',
  'registry-service-absent': '未核验：这一版运行时没有提供目录服务，因此没有清单可读。',
  'invalid-roster': '未核验：运行时返回的清单不完整，已按不可信拒绝采用。',
  'observation-failed': '未核验：读取运行时清单时失败，稍后会再读一次。',
}
const MODEL_CONFIG_REASON_NOTES: Record<string, string> = {
  'not-read': '未核验：还没有读到配置文档。',
  'bridge-unavailable': '未核验：读取配置需要的能力运行时当前不可用。',
  'bridge-refused': '未核验：读取配置的请求被拒绝了。',
  'not-plain-data': '未核验：配置文档的形状不认识，已按不可信拒绝采用。',
}

export interface CapabilityRegionProps {
  readonly store: AppBridgeStore
  readonly container: HTMLElement
}

export function CapabilityRegion({ store, container }: CapabilityRegionProps): JSX.Element {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const message = regionMessage<CapabilityRegionMessage>(snapshot, 'capability', CAPABILITY_UNAVAILABLE)
  const slice = message.kind === 'read' ? asRecord(message.slot.slice) : null

  useEffect(() => {
    container.setAttribute('data-region-state', message.kind === 'read' ? 'read' : 'unavailable')
  }, [container, message.kind])

  const observed = slice !== null && slice.observed === true
  const presets = slice !== null && Array.isArray(slice.agentPresets) ? slice.agentPresets : []
  const note = !observed
    ? (CAPABILITY_REASON_NOTES[text(slice?.reason, 'observation-not-read')] ?? CAPABILITY_REASON_NOTES['observation-not-read'])
    : presets.length === 0
      ? '未就绪：运行时清单里没有任何已配置项，这不等于"已停用"。'
      : '已配置 ' + String(presets.length) + ' 项，其中 '
        + String(presets.filter((preset) => preset !== null && typeof preset === 'object' && (preset as Record<string, unknown>).state !== 'enabled').length)
        + ' 项未启用。已启用不等于可用。'

  return (
    <>
      <div className="sage-card-head"><span className="sage-card-label">AGENT PRESETS · READ-ONLY</span><span className="sage-card-index">04</span></div>
      <h2>已配置的 Agent 运行时</h2>
      <p className="sage-card-note">这里只显示 Electron main 观察到的运行时清单：已配置不等于已启用，已启用也不等于可用。安装、启用、停用与撤销在本页没有入口。</p>
      <ul className="sage-roster-list" id="capability-rows">
        {observed ? presets.map((preset) => {
          const entry = asRecord(preset)
          const presetId = entry !== null ? text(entry.id) : ''
          if (presetId === '') return null
          const enabled = entry !== null && entry.state === 'enabled'
          return (
            <li key={presetId} className="sage-roster-row" data-preset-id={presetId}>
              <strong>{presetId}</strong>
              <span className="sage-roster-tag">已配置</span>
              <span className={'sage-roster-tag ' + (enabled ? 'is-ok' : 'is-blocked')}>{enabled ? '已启用' : '未启用'}</span>
              <span className="sage-roster-tag is-blocked">可用性：外部能力面未接线，无法核验</span>
            </li>
          )
        }) : null}
      </ul>
      <p id="capability-note" className="sage-card-note" role="status" aria-live="polite">{note}</p>
    </>
  )
}

export interface CapabilitySourceBadgeProps {
  readonly store: AppBridgeStore
  readonly container: HTMLElement
}

export function CapabilitySourceBadge({ store, container }: CapabilitySourceBadgeProps): JSX.Element {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const message = regionMessage<CapabilityRegionMessage>(snapshot, 'capability', CAPABILITY_UNAVAILABLE)
  const slice = message.kind === 'read' ? asRecord(message.slot.slice) : null

  useEffect(() => {
    container.setAttribute('data-region-state', message.kind === 'read' ? 'read' : 'unavailable')
  }, [container, message.kind])

  const observed = slice !== null && slice.observed === true
  const badge = observed
    ? '来源：运行时清单观察'
    : slice !== null && typeof slice.source === 'string' ? '来源：尚未读到运行时清单' : '来源：等待运行时清单'
  return <>{badge}</>
}

export interface ModelConfigRegionProps {
  readonly store: AppBridgeStore
  readonly container: HTMLElement
}

export function ModelConfigRegion({ store, container }: ModelConfigRegionProps): JSX.Element {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const message = regionMessage<ModelConfigRegionMessage>(snapshot, 'model-config', MODEL_CONFIG_UNAVAILABLE)
  const slice = message.kind === 'read' ? asRecord(message.slot.slice) : null

  useEffect(() => {
    container.setAttribute('data-region-state', message.kind === 'read' ? 'read' : 'unavailable')
  }, [container, message.kind])

  const read = slice !== null && slice.state === 'read'
  const connectivityTest = slice !== null && slice.connectivityTest === 'untested'
    ? '连通性：未测试（保存配置不代表供应商已被调用过）。'
    : '连通性：无法核验。'
  const namespaces = read && slice !== null && Array.isArray(slice.namespaces) ? slice.namespaces : []
  let missingSecrets = 0
  const rowViews = namespaces.map((entry) => {
    const namespace = asRecord(entry)
    const ns = namespace !== null ? text(namespace.ns) : ''
    if (ns === '') return null
    const saved = namespace !== null && namespace.saved === 'user' ? '已保存' : namespace !== null && namespace.saved === 'base-only' ? '仅默认值' : '未配置'
    const applies = namespace !== null && namespace.applies === 'live' ? '立即生效' : '需重启'
    const appliesOk = namespace !== null && namespace.applies === 'live'
    const secrets = namespace !== null ? asRecord(namespace.secrets) : null
    const total = secrets !== null && typeof secrets.total === 'number' ? secrets.total : 0
    const set = secrets !== null && typeof secrets.set === 'number' ? secrets.set : 0
    if (total > set) missingSecrets += 1
    const credential = total === 0 ? '凭据：此命名空间不需要' : '凭据：已设置 ' + String(set) + '/' + String(total)
    return { ns, saved, applies, appliesOk, credential, credentialOk: total === 0 || set === total }
  }).filter((view): view is NonNullable<typeof view> => view !== null)
  const note = !read
    ? (MODEL_CONFIG_REASON_NOTES[text(slice?.reason, 'not-read')] ?? MODEL_CONFIG_REASON_NOTES['not-read'])
    : namespaces.length === 0
      ? '未就绪：这份配置文档里还没有任何命名空间。'
      : missingSecrets === 0
        ? '已读 ' + String(namespaces.length) + ' 个命名空间的结构；配置值与凭据内容都不在本页。'
        : '仍有 ' + String(missingSecrets) + ' 个命名空间缺凭据；缺凭据的项不算配置完成。'

  return (
    <>
      <div className="sage-card-head"><span className="sage-card-label">MODEL CONFIG · READ-ONLY</span><span className="sage-card-index">05</span></div>
      <h2>模型配置</h2>
      <p className="sage-card-note">只显示结构、层级与凭据是否已设置：不显示任何配置值，也无编辑入口。保存过配置不等于这个供应商可用——「已保存」与「连通性」是两回事。</p>
      <ul className="sage-roster-list" id="model-rows">
        {rowViews.map((view) => (
          <li key={view.ns} className="sage-roster-row" data-model-namespace={view.ns}>
            <strong>{view.ns}</strong>
            <span className="sage-roster-tag">{view.saved}</span>
            <span className={'sage-roster-tag ' + (view.appliesOk ? 'is-ok' : 'is-blocked')}>{view.applies}</span>
            <span className={'sage-roster-tag ' + (view.credentialOk ? 'is-ok' : 'is-blocked')}>{view.credential}</span>
          </li>
        ))}
      </ul>
      <p id="model-test" className="sage-card-note">{connectivityTest}</p>
      <p id="model-note" className="sage-card-note" role="status" aria-live="polite">{note}</p>
    </>
  )
}
