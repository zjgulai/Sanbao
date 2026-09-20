/** Pure decision and paging rules for the first-run carousel. */

import { INTRO_PAGES, INTRO_ACK_FIELD, INTRO_VERSION } from '../onboarding-copy.js'

/** What the settings scope currently answers. */
export interface IntroScopeLike {
  readonly status: 'loading' | 'ready' | 'unavailable'
  readonly mode: 'host' | 'memory'
  readonly value?: Record<string, unknown> | undefined
}

/** What the step should do right now. */
export type IntroDecision = 'waiting' | 'show' | 'done'

/**
 * Decide the step's visible branch.
 * @param input - scope answer plus the process-local fallback for memory mode.
 * @returns `waiting` while the scope is still loading, `done` once this exact
 * intro version is acknowledged, otherwise `show`.
 */
export function introDecision(input: { scope: IntroScopeLike; seenLocally: boolean }): IntroDecision {
  const { scope, seenLocally } = input
  if (scope.mode === 'memory') return seenLocally ? 'done' : 'show'
  if (scope.status === 'loading') return 'waiting'
  if (scope.status === 'unavailable') return 'show'
  return scope.value?.[INTRO_ACK_FIELD] === INTRO_VERSION ? 'done' : 'show'
}

/** Total page count. */
export function pageCount(): number {
  return INTRO_PAGES.length
}

/** Advance one page, clamped at the end so the primary button becomes 开始使用. */
export function nextPage(current: number, count: number = pageCount()): number {
  return Math.min(current + 1, count - 1)
}

/** Go back one page, clamped at the start. */
export function previousPage(current: number, count: number = pageCount()): number {
  return Math.max(current - 1, 0)
}

/** Whether the primary button finishes the carousel instead of paging on. */
export function isLastPage(current: number, count: number = pageCount()): boolean {
  return current >= count - 1
}
