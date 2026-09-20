/**
 * The carousel itself. The step owns its whole chrome — the settings shell
 * paints none — so this component is the backdrop, the card, the paging and
 * the two exits.
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import type { JSX } from 'react'
import { INTRO_PAGES } from '../onboarding-copy.js'
import { isLastPage, nextPage, previousPage } from './step.js'
import type { IntroCarouselStore } from './store.js'

export interface CarouselProps {
  /** Slot owner prop: complete or skip this step and hand over to the next one. */
  complete: () => void
  /** Injected store holding the durable acknowledgement state. */
  store: IntroCarouselStore
  /** Injected locale lookup bound to this package's dictionary. */
  t: (key: string) => string
}

export function Carousel({ complete, store, t }: CarouselProps): JSX.Element | null {
  const subscribe = useCallback((listener: () => void) => store.subscribe(listener), [store])
  const read = useCallback(() => store.getSnapshot(), [store])
  const snapshot = useSyncExternalStore(subscribe, read, read)
  const [page, setPage] = useState(0)

  const finish = useCallback(() => {
    void store.finish()
    complete()
  }, [complete, store])

  const showing = snapshot.decision === 'show'

  useEffect(() => {
    if (!showing) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finish()
      else if (event.key === 'ArrowRight') setPage(current => nextPage(current))
      else if (event.key === 'ArrowLeft') setPage(current => previousPage(current))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => { window.removeEventListener('keydown', onKeyDown) }
  }, [finish, showing])

  if (!showing) return null
  const current = INTRO_PAGES[Math.min(page, INTRO_PAGES.length - 1)]
  if (current === undefined) return null
  const last = isLastPage(page)

  return (
    <div className="soc-backdrop" data-sanbao-intro="v1" data-page={current.id}>
      <div className="soc-card" role="dialog" aria-modal="true" aria-labelledby="soc-intro-title">
        <p className="soc-kicker">{`${page + 1} / ${INTRO_PAGES.length}`}</p>
        <h2 className="soc-title" id="soc-intro-title">{t(current.titleKey)}</h2>
        <p className="soc-body">{t(current.bodyKey)}</p>
        <div className="soc-dots" aria-hidden="true">
          {INTRO_PAGES.map((entry, index) => (
            <span key={entry.id} className="soc-dot" data-current={index === page ? 'true' : 'false'} />
          ))}
        </div>
        <div className="soc-actions">
          <button type="button" className="soc-skip" onClick={finish}>{t('action.skip')}</button>
          <button
            type="button"
            className="soc-primary"
            onClick={last ? finish : () => { setPage(current => nextPage(current)) }}
          >
            {t(last ? 'action.start' : 'action.next')}
          </button>
        </div>
      </div>
    </div>
  )
}
