/**
 * Main-owned frame policy for the privileged Sage renderer (ADR-0178).
 *
 * The invariant: the privileged renderer has no nested browsing contexts. Any child
 * frame contaminates the current document generation until a clean main-owned top
 * cross-document reload commits a fresh one. Removing the child and same-document
 * navigation never wash the contamination. This module is deliberately free of
 * Electron imports so it stays unit-testable in plain Node.
 */

/** Observed state of one privileged renderer generation. */
export interface FramePolicyState {
  readonly generation: number
  readonly ready: boolean
  readonly contaminated: boolean
  readonly contaminationReasons: readonly string[]
}

/** One main-initiated navigation intent, the only kind that can commit a clean generation. */
interface PendingNavigation {
  readonly url: string
  readonly nextGeneration: number
  sawChild: boolean
}

/** Notified the first time a generation becomes contaminated. */
export type ContaminationListener = (reason: string, generation: number) => void

/** Facts of one navigation observation shared by start / will / commit events. */
export interface NavigationInput {
  readonly isMainFrame: boolean
  readonly isSameDocument: boolean
  readonly url: string
}

/** Facts of one committed navigation; `singleFrameTree` is observed by the caller. */
export interface NavigationCommitInput {
  readonly isMainFrame: boolean
  readonly url: string
  readonly singleFrameTree: boolean
}

const CHILD_REASONS = /^non-main-frame/u

export class FramePolicy {
  private generation = 0
  private ready = false
  private contaminated = false
  private contaminationReasons: string[] = []
  private pending: PendingNavigation | null = null
  private readonly onContamination: ContaminationListener | undefined

  constructor(options: { onContamination?: ContaminationListener } = {}) {
    this.onContamination = options.onContamination
  }

  /** Declare the only navigation the policy will trust: one started by the main process. */
  ownedNavigationIntent(url: string): void {
    this.pending = { url, nextGeneration: this.generation + 1, sawChild: false }
    this.ready = false
  }

  onFrameCreated(isMainFrame: boolean): void {
    if (isMainFrame) return
    this.contaminate('non-main-frame-created')
  }

  onNavigationStart(input: NavigationInput): void {
    if (!input.isMainFrame) {
      this.contaminate('non-main-frame-navigation-started')
      return
    }
    if (input.isSameDocument) return
    if (this.pending !== null && this.pending.url === input.url) return
    this.contaminate('unowned-top-navigation-started')
  }

  /** Decide whether a navigation about to happen must be cancelled. */
  onNavigationWill(input: NavigationInput): { preventDefault: boolean } {
    if (!input.isMainFrame) {
      this.contaminate('non-main-frame-navigation')
      return { preventDefault: true }
    }
    if (input.isSameDocument) return { preventDefault: false }
    if (this.pending !== null && this.pending.url === input.url) return { preventDefault: false }
    this.contaminate('unowned-top-navigation')
    return { preventDefault: true }
  }

  onNavigationCommitted(input: NavigationCommitInput): void {
    if (!input.isMainFrame) {
      this.contaminate('non-main-frame-navigation-committed')
      return
    }
    if (this.pending !== null && this.pending.url === input.url) {
      const clean = input.singleFrameTree && !this.pending.sawChild
      this.generation = this.pending.nextGeneration
      this.ready = clean
      this.contaminated = !clean
      this.contaminationReasons = clean
        ? []
        : [this.pending.sawChild ? 'non-main-frame-created' : 'live-frame-tree-not-single']
      this.pending = null
      return
    }
    this.contaminate('unowned-top-navigation-committed')
  }

  onWebviewAttach(): { preventDefault: boolean } {
    this.contaminate('webview-attach-attempt')
    return { preventDefault: true }
  }

  onLoadFailed(isMainFrame: boolean): void {
    if (!isMainFrame) return
    this.pending = null
    this.contaminate('main-load-failed')
  }

  onRenderProcessGone(reason: string): void {
    this.contaminate(`render-process-gone:${reason}`)
  }

  onDestroyed(): void {
    this.contaminate('web-contents-destroyed')
  }

  snapshot(): FramePolicyState {
    return {
      generation: this.generation,
      ready: this.ready,
      contaminated: this.contaminated,
      contaminationReasons: [...this.contaminationReasons],
    }
  }

  /** The fact a future privileged-IPC entry point must check before trusting the caller. */
  isTrustedGeneration(): boolean {
    return this.ready && !this.contaminated
  }

  private contaminate(reason: string): void {
    if (this.pending !== null && (CHILD_REASONS.test(reason) || reason === 'webview-attach-attempt')) {
      this.pending.sawChild = true
    }
    const firstForGeneration = !this.contaminated
    if (!this.contaminationReasons.includes(reason)) this.contaminationReasons.push(reason)
    this.contaminated = true
    this.ready = false
    if (firstForGeneration && this.onContamination !== undefined) this.onContamination(reason, this.generation)
  }
}
