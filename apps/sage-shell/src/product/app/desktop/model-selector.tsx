/**
 * ADR-0340: the composer model selector. The Qoder observation for this trigger is
 * static-only (`data-chat-model-selector-menu`, menu never opened in any capture), so the
 * anatomy here is built honestly from the live catalog: groups from the session controller,
 * the current default marked, unavailable providers named with their message, and an explicit
 * note about what switching does (and does not) change.
 */
import { useState, type ReactNode } from 'react'

import { Icon } from './icons.js'
import {
  type ModelCatalogOutcome,
  type ModelRoutesController,
} from './model-routes.js'

function selectionLabel(catalog: Extract<ModelCatalogOutcome, { kind: 'read' }>['catalog']): string {
  const current = catalog.default
  if (current === null) return '未选择'
  for (const group of catalog.groups) {
    for (const model of group.models) {
      if (group.id === current.provider && model.id === current.model) return model.name ?? model.id
    }
  }
  return current.model
}

function defaultRefusalLabel(code: string): string {
  switch (code) {
    case 'bridge-model-selection-unknown': return '该模型不在可用目录中，未切换。'
    case 'bridge-model-effort-unknown': return '该推理档位不在可用目录中，未切换。'
    case 'bridge-model-default-overridden': return '默认模型被实例本地或命令行覆盖层锁定，未切换。'
    case 'bridge-model-catalog-failed': return '模型目录读取失败，未切换。'
    case 'bridge-provider-unavailable': return '本机模型服务不可用，未切换。'
    case 'model-config-identity-unavailable': return '需要先登录；登录后可切换默认模型。'
    case 'bridge-answer-unrecognised':
    case 'unrecognised': return '服务回执无法识别，未切换。'
    case 'unreachable': return '请求未能送达服务，未切换。'
    default: return `切换未完成（${code}）。`
  }
}

export function ModelSelector({ controller }: { readonly controller?: ModelRoutesController }): ReactNode {
  // Lazy by design: the composer mounts on every page, so the catalog is read when the menu
  // opens (and re-read on every open — providers may have changed), never at mount.
  const [read, setRead] = useState<ModelCatalogOutcome | { kind: 'loading' } | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const refresh = async (): Promise<void> => {
    if (controller === undefined) return
    setRead({ kind: 'loading' })
    setRead(await controller.catalog())
  }
  if (controller === undefined) return null
  const catalog = read !== null && read.kind === 'read' ? read.catalog : null
  const choose = async (provider: string, model: string, reasoningEffort?: string): Promise<void> => {
    if (busy) return
    setBusy(true)
    setNotice(null)
    const outcome = await controller.setDefault({ provider, model, ...(reasoningEffort === undefined ? {} : { reasoningEffort }) })
    setBusy(false)
    if (outcome.kind === 'set') {
      setOpen(false)
      await refresh()
      setNotice(`默认模型已切换为 ${outcome.selection.model}；对下一次请求生效。`)
      return
    }
    setNotice(defaultRefusalLabel(outcome.kind === 'refused' ? outcome.code : 'unreachable'))
  }
  return <span className="model-selector" data-model-selector="composer">
    <button type="button" className="text-button" aria-label="模型"
      aria-haspopup="menu" aria-expanded={open}
      onClick={() => { setOpen(!open); setNotice(null); if (!open) void refresh() }}>
      {read === null ? '模型' : read.kind === 'loading' ? '模型读取中…' : catalog === null ? '模型未知' : selectionLabel(catalog)}
      {' '}<Icon name="down" size={12} />
    </button>
    {open
      ? <>
        <div className="model-selector-backdrop" role="presentation" onClick={() => setOpen(false)} />
        <div className="model-selector-menu" role="menu" aria-label="选择模型"
          onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false) } }}>
          {catalog === null
            ? <p className="settings-observed-note" role="status">{read !== null && read.kind === 'unavailable'
              ? `模型目录暂不可用（${read.code}）。`
              : '模型目录读取中…'}</p>
            : <>
              {catalog.groups.length === 0
                ? <p className="settings-observed-note" role="status">目录中没有可用模型。</p>
                : catalog.groups.map(group => <div role="group" aria-label={group.name} key={group.id}
                  className="model-selector-group">
                  <h3>{group.name}</h3>
                  {group.models.map(model => {
                    const selected = catalog.default !== null && catalog.default.provider === group.id && catalog.default.model === model.id
                    return <button type="button" role="menuitemradio" aria-checked={selected}
                      aria-label={`选择模型 ${model.name ?? model.id}`} tabIndex={selected ? 0 : -1}
                      disabled={busy} key={model.id}
                      onClick={() => { void choose(group.id, model.id, catalog.default?.reasoningEffort) }}>
                      <span>{model.name ?? model.id}</span>{selected ? <span aria-hidden="true">✓</span> : null}
                    </button>
                  })}
                </div>)}
              {catalog.failures.length > 0
                ? <div className="model-selector-failures" role="status" aria-label="不可用供应商">
                  {catalog.failures.map(failure => <p key={failure.id}>{failure.name}：{failure.message}</p>)}
                </div>
                : null}
              <p className="settings-observed-note">切换影响下一次请求；已有回合的会话保持其首次使用的模型。</p>
            </>}
          {notice !== null ? <p className="settings-observed-note" role="status">{notice}</p> : null}
        </div>
      </>
      : notice !== null ? <span className="settings-observed-note" role="status">{notice}</span> : null}
  </span>
}
