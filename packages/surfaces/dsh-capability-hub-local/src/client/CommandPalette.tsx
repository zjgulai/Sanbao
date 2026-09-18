/**
 * 能力命令面板：Cmd/Ctrl+K 唤起的统一能力调度面（S2 主体交付）。
 *
 * 挂 `shell.overlay`（帧级 additive 官方座位），模态走 `<dialog showModal()>`
 * （top layer，零 z-index——D4 决策：凡模态一律 dialog）。数据来自
 * {@link CapabilityCatalog}（五切片只读聚合），执行走
 * {@link dispatchAction}（判别联合分发到既有通道）。
 * @module dsh-capability-hub-local/client/CommandPalette
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { CapabilityCatalog } from './catalog.ts'
import { dispatchAction, type DispatcherDeps } from './dispatcher.ts'
import { paletteStrings, type PaletteStrings } from './locales.ts'
import { searchItems } from './search.ts'
import type { CapabilityAvailability, CapabilityItem, CapabilityKind, CatalogResult } from './types.ts'
import classes from './palette.module.css'

/** 单屏最多渲染的命中数（560 条全量渲染无意义；截断即可，无需虚拟化）。 */
const MAX_VISIBLE = 50

/**
 * 面板控制器：开关状态 + 目录缓存 + 动作执行。
 *
 * 组件与 apply 之间的唯一桥（inject face）——组件不碰 ctx、不碰 fetch 细节。
 */
export class PaletteController {
  private open = false
  private readonly listeners = new Set<() => void>()
  private readonly catalog = new CapabilityCatalog()

  /**
   * @param deps - 分发依赖（apply 闭包装配：sessions/conversation/fetch）。
   */
  constructor(private readonly deps: DispatcherDeps) {}

  /** 当前开合状态快照。 */
  snapshot(): boolean {
    return this.open
  }

  /** 订阅开合变化。 */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private publish(): void {
    for (const listener of this.listeners) listener()
  }

  /** 打开面板。 */
  openPalette(): void {
    if (this.open) return
    this.open = true
    this.publish()
  }

  /** 关闭面板。 */
  closePalette(): void {
    if (!this.open) return
    this.open = false
    this.publish()
  }

  /** 切换（快捷键用）。 */
  toggle(): void {
    if (this.open) this.closePalette()
    else this.openPalette()
  }

  /** 取目录（有缓存复用；面板打开时的取数入口）。 */
  load(force?: boolean): Promise<CatalogResult> {
    return this.catalog.load(globalFetch(), { force })
  }

  /** 执行一个能力并关闭面板（先关面板保证手感，执行结果失败时出声）。 */
  run(item: CapabilityItem): void {
    this.closePalette()
    void dispatchAction(item.action, this.deps).then((outcome) => {
      if (!outcome.ok) console.warn(`[capability-hub] 执行「${item.title}」失败：${outcome.reason}`)
    })
  }

  /** 丢弃缓存（dispose 用）。 */
  dispose(): void {
    this.catalog.invalidate()
    this.listeners.clear()
  }
}

/** 全局 fetch（隔离成函数便于测试替换心智）。 */
function globalFetch(): DispatcherDeps['fetchLike'] {
  return (route, init) => fetch(route, init)
}

/** 组件 props：inject face（controller）——四 share 之外无自造面。 */
export interface CommandPaletteProps {
  controller: PaletteController
}

/** 命令面板组件。 */
export function CommandPalette({ controller }: CommandPaletteProps): React.JSX.Element | null {
  const open = useSyncExternalStore(
    (listener) => controller.subscribe(listener),
    () => controller.snapshot(),
    () => false,
  )
  const strings = useMemo(() => paletteStrings(), [])
  const dialogRef = useRef<HTMLDialogElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<CatalogResult | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog === null) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
    if (result === undefined) {
      setLoading(true)
      controller.load()
        .then(setResult)
        .finally(() => { setLoading(false) })
    }
  }, [open, result, controller])

  const items = useMemo(() => {
    if (result === undefined) return []
    return result.slices.flatMap((slice) => slice.items)
  }, [result])

  const hits = useMemo(() => searchItems(items, query), [items, query])
  const visible = useMemo(() => hits.slice(0, MAX_VISIBLE), [hits])

  useEffect(() => { setActiveIndex(0) }, [query])

  const runActive = useCallback(() => {
    const hit = visible[activeIndex]
    if (hit !== undefined) controller.run(hit.item)
  }, [visible, activeIndex, controller])

  /** 键盘语义：↑↓ 在命中间移动；Enter 执行；Esc 关闭（dialog 原生 onCancel 同义）。 */
  const onKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => Math.min(index + 1, visible.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => Math.max(index - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      runActive()
    }
  }, [visible.length, runActive])

  const sliceErrors = useMemo(() => {
    if (result === undefined) return []
    return result.slices.filter((slice) => slice.error !== undefined)
  }, [result])

  if (!open) return null

  return (
    <dialog
      ref={dialogRef}
      className={classes.palette}
      onCancel={(event) => {
        event.preventDefault()
        controller.closePalette()
      }}
      aria-label={strings.placeholder}
    >
      <div className={classes.searchRow}>
        <input
          ref={inputRef}
          className={classes.search}
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls="capability-palette-list"
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          placeholder={strings.placeholder}
          value={query}
          onChange={(event) => { setQuery(event.target.value) }}
          onKeyDown={onKeyDown}
        />
        <button
          type="button"
          className={classes.refresh}
          onClick={() => {
            setLoading(true)
            controller.load(true)
              .then(setResult)
              .finally(() => { setLoading(false) })
          }}
        >
          {strings.refresh}
        </button>
      </div>

      {loading && result === undefined
        ? <div className={classes.status}>{strings.loading}</div>
        : visible.length === 0
          ? <div className={classes.status}>{strings.empty}</div>
          : (
            <ul className={classes.list} id="capability-palette-list" role="listbox">
              {visible.map(({ item }, index) => (
                <li key={`${item.kind}:${item.id}`}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === activeIndex}
                    className={index === activeIndex ? `${classes.item} ${classes.itemActive}` : classes.item}
                    onMouseEnter={() => { setActiveIndex(index) }}
                    onClick={() => { controller.run(item) }}
                  >
                    <span className={classes.kind}>{kindLabel(item.kind, strings)}</span>
                    <span className={classes.title}>{item.title}</span>
                    {item.availability !== 'ready'
                      ? <span className={classes.flag}>{availabilityLabel(item.availability, strings)}</span>
                      : null}
                    <span className={classes.summary}>{item.summary}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

      <div className={classes.footer}>
        <span className={classes.hint}>{strings.hint}</span>
        {sliceErrors.length > 0
          ? <span className={classes.sliceError}>{strings.sliceError}（{sliceErrors.map((slice) => slice.slice).join('、')}）</span>
          : null}
      </div>
    </dialog>
  )
}

/**
 * 切片名的展示标签。
 * @param kind - 切片。
 * @param strings - 文案。
 */
function kindLabel(kind: CapabilityKind, strings: PaletteStrings): string {
  switch (kind) {
    case 'skill': return strings.kindSkill
    case 'mcp-tool': return strings.kindMcpTool
    case 'role': return strings.kindRole
    case 'product': return strings.kindProduct
    case 'system': return strings.kindSystem
  }
}

/**
 * 可用性徽标文案（ready 不显示）。
 * @param availability - 可用性。
 * @param strings - 文案。
 */
function availabilityLabel(availability: CapabilityAvailability, strings: PaletteStrings): string {
  switch (availability) {
    case 'ready': return ''
    case 'degraded': return strings.availabilityDegraded
    case 'disabled': return strings.availabilityDisabled
    case 'absent': return strings.availabilityAbsent
  }
}
