/**
 * Carousel state over the settings scopes: the intro acknowledgement this
 * package owns, plus the upstream internal-testing notice it retires.
 *
 * The scope is the transport. A loopback browser follows the durable host
 * section; a remote browser's memory-mode scope never persists, so the
 * acknowledgement stays process-local there.
 */

import {
  INTRO_ACK_FIELD,
  INTRO_VERSION,
  UPSTREAM_NOTICE_ACK_FIELD,
  UPSTREAM_NOTICE_VERSION,
} from '../onboarding-copy.js'
import { introDecision, type IntroDecision, type IntroScopeLike } from './step.js'

/** The slice of a settings namespace scope this store uses. */
export interface ScopeLike {
  subscribe(listener: () => void): () => void
  getSnapshot(): IntroScopeLike
  set(field: string, value: string): Promise<unknown>
}

/** State the step renders from. */
export interface IntroCarouselSnapshot {
  readonly decision: IntroDecision
  readonly error: string | null
}

/** Coordinates the durable acknowledgements for one page session. */
export class IntroCarouselStore {
  private snapshot: IntroCarouselSnapshot = { decision: 'waiting', error: null }
  private readonly listeners = new Set<() => void>()
  private seenLocally = false
  private following: (() => void)[] = []
  private pending: Promise<void> | undefined

  /**
   * @param intro - this package's namespace scope.
   * @param notice - the upstream notice's namespace scope, acknowledged in the
   * same breath so the two steps never queue behind each other.
   */
  constructor(
    private readonly intro: ScopeLike,
    private readonly notice: ScopeLike,
  ) {}

  /** Begin following both scopes (idempotent) and publish the current answer. */
  load(): void {
    if (this.following.length === 0) {
      for (const scope of [this.intro, this.notice]) {
        this.following.push(scope.subscribe(() => { this.derive() }))
      }
    }
    this.derive()
  }

  /** Stop following the scopes. */
  dispose(): void {
    for (const unsubscribe of this.following) unsubscribe()
    this.following = []
  }

  /** uSES-compatible read. */
  getSnapshot(): IntroCarouselSnapshot {
    return this.snapshot
  }

  /** uSES-compatible subscribe. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /**
   * Acknowledge the intro and retire the upstream notice. Repeated calls share
   * one settlement, so a double click cannot write twice.
   * @returns settlement after both writes have been attempted.
   */
  finish(): Promise<void> {
    this.seenLocally = true
    this.publish({ decision: 'done', error: this.snapshot.error })
    this.pending ??= this.persist()
    return this.pending
  }

  private async persist(): Promise<void> {
    let error: string | null = null
    if (this.intro.getSnapshot().mode !== 'memory') {
      try {
        await this.intro.set(INTRO_ACK_FIELD, INTRO_VERSION)
      } catch (cause) {
        error = String((cause as { message?: unknown })?.message ?? cause)
      }
    }
    if (this.notice.getSnapshot().mode !== 'memory') {
      try {
        await this.notice.set(UPSTREAM_NOTICE_ACK_FIELD, UPSTREAM_NOTICE_VERSION)
      } catch (cause) {
        error ??= String((cause as { message?: unknown })?.message ?? cause)
      }
    }
    this.publish({ decision: 'done', error })
  }

  private derive(): void {
    if (this.seenLocally) return
    const decision = introDecision({ scope: this.intro.getSnapshot(), seenLocally: false })
    this.publish({ decision, error: this.snapshot.error })
  }

  private publish(next: IntroCarouselSnapshot): void {
    if (next.decision === this.snapshot.decision && next.error === this.snapshot.error) return
    this.snapshot = next
    for (const listener of this.listeners) listener()
  }
}
