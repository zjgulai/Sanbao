/**
 * Client entry: register the Sanbao first-run carousel as the first
 * `settings.onboarding` step and retire the upstream internal-testing notice
 * the moment the user finishes it.
 *
 * The settings shell mounts one ordered step at a time, so a lower `order`
 * takes over from the shipped steps without patching any upstream bundle.
 */

import { Carousel } from './Carousel.js'
import { IntroCarouselStore, type ScopeLike } from './store.js'
import {
  INTRO_COPY,
  INTRO_LOCALE_NS,
  INTRO_SETTINGS_NAMESPACE,
  UPSTREAM_NOTICE_NAMESPACE,
} from '../onboarding-copy.js'
import './carousel.css'

/** Local structural contract: only the client services this package uses. */
interface ClientContext {
  slots: {
    inject(key: string, callback: () => unknown): void
    register(options: Record<string, unknown>, component: unknown): unknown
  }
  locale: {
    register(ns: string, dicts: unknown): () => void
    bind(ns: string): (key: string) => string
  }
  settingsScope: {
    bind(spec: { namespace: string; decode?: (value: unknown) => unknown }): ScopeLike
  }
}

export const inject = ['slots', 'locale', 'settingsScope']

/** A malformed durable section reads as empty, so the step treats it as unseen. */
function decodeSection(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

export function apply(ctx: ClientContext): void {
  const store = new IntroCarouselStore(
    ctx.settingsScope.bind({ namespace: INTRO_SETTINGS_NAMESPACE, decode: decodeSection }),
    ctx.settingsScope.bind({ namespace: UPSTREAM_NOTICE_NAMESPACE, decode: decodeSection }),
  )
  store.load()
  ctx.locale.register(INTRO_LOCALE_NS, INTRO_COPY)
  const t = ctx.locale.bind(INTRO_LOCALE_NS)
  ctx.slots.inject('settings.onboarding', () => ctx.slots.register({
    name: 'settings.onboarding',
    id: 'sanbao-intro',
    order: -1000,
    inject: () => ({ store, t }),
  }, Carousel))
}
