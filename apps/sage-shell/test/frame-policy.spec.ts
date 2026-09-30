import { describe, expect, it } from 'vitest'
import { FramePolicy } from '../src/main/frame-policy.js'

function commitOwned(policy: FramePolicy, url: string): void {
  policy.ownedNavigationIntent(url)
  policy.onNavigationStart({ isMainFrame: true, isSameDocument: false, url })
  policy.onNavigationWill({ isMainFrame: true, isSameDocument: false, url })
  policy.onNavigationCommitted({ isMainFrame: true, url, singleFrameTree: true })
}

describe('FramePolicy generation state machine', () => {
  it('commits the main-owned initial navigation as a clean trusted generation', () => {
    const policy = new FramePolicy()
    expect(policy.snapshot()).toMatchObject({ generation: 0, ready: false, contaminated: false })
    expect(policy.isTrustedGeneration()).toBe(false)
    commitOwned(policy, 'dsh-app://app/index.html')
    expect(policy.snapshot()).toEqual({ generation: 1, ready: true, contaminated: false, contaminationReasons: [] })
    expect(policy.isTrustedGeneration()).toBe(true)
  })

  it('contaminates the generation on any non-main frame and stays sticky across frame removal and same-document navigation', () => {
    const policy = new FramePolicy()
    commitOwned(policy, 'dsh-app://app/index.html')
    policy.onFrameCreated(false)
    expect(policy.snapshot()).toMatchObject({ generation: 1, ready: false, contaminated: true })
    expect(policy.snapshot().contaminationReasons).toContain('non-main-frame-created')
    expect(policy.isTrustedGeneration()).toBe(false)
    // Same-document navigation must not wash the contamination.
    policy.onNavigationStart({ isMainFrame: true, isSameDocument: true, url: 'dsh-app://app/index.html#hash' })
    expect(policy.isTrustedGeneration()).toBe(false)
    // No event exists for "the child is gone now": the state stays contaminated.
    policy.onFrameCreated(true)
    expect(policy.isTrustedGeneration()).toBe(false)
  })

  it('recovers only through a clean main-owned cross-document reload', () => {
    const policy = new FramePolicy()
    commitOwned(policy, 'dsh-app://app/index.html')
    policy.onFrameCreated(false)
    expect(policy.isTrustedGeneration()).toBe(false)
    commitOwned(policy, 'dsh-app://app/')
    expect(policy.snapshot()).toEqual({ generation: 2, ready: true, contaminated: false, contaminationReasons: [] })
    expect(policy.isTrustedGeneration()).toBe(true)
  })

  it('keeps a reload contaminated when a child appeared during the navigation window', () => {
    const policy = new FramePolicy()
    commitOwned(policy, 'dsh-app://app/index.html')
    policy.ownedNavigationIntent('dsh-app://app/')
    policy.onFrameCreated(false)
    policy.onNavigationStart({ isMainFrame: true, isSameDocument: false, url: 'dsh-app://app/' })
    policy.onNavigationWill({ isMainFrame: true, isSameDocument: false, url: 'dsh-app://app/' })
    policy.onNavigationCommitted({ isMainFrame: true, url: 'dsh-app://app/', singleFrameTree: false })
    expect(policy.snapshot()).toMatchObject({ generation: 2, ready: false, contaminated: true })
    expect(policy.snapshot().contaminationReasons).toContain('non-main-frame-created')
    expect(policy.isTrustedGeneration()).toBe(false)
  })

  it('keeps a reload contaminated when the live frame tree is not single-frame at commit', () => {
    const policy = new FramePolicy()
    policy.ownedNavigationIntent('dsh-app://app/index.html')
    policy.onNavigationStart({ isMainFrame: true, isSameDocument: false, url: 'dsh-app://app/index.html' })
    policy.onNavigationWill({ isMainFrame: true, isSameDocument: false, url: 'dsh-app://app/index.html' })
    policy.onNavigationCommitted({ isMainFrame: true, url: 'dsh-app://app/index.html', singleFrameTree: false })
    expect(policy.snapshot()).toMatchObject({ generation: 1, ready: false, contaminated: true })
    expect(policy.snapshot().contaminationReasons).toContain('live-frame-tree-not-single')
  })

  it('denies renderer-initiated top cross-document navigation and contaminates the generation', () => {
    const policy = new FramePolicy()
    commitOwned(policy, 'dsh-app://app/index.html')
    const will = policy.onNavigationWill({ isMainFrame: true, isSameDocument: false, url: 'dsh-app://app/index.html' })
    expect(will.preventDefault).toBe(true)
    expect(policy.snapshot().contaminationReasons).toContain('unowned-top-navigation')
    policy.onNavigationStart({ isMainFrame: true, isSameDocument: false, url: 'dsh-app://app/index.html' })
    policy.onNavigationCommitted({ isMainFrame: true, url: 'dsh-app://app/index.html', singleFrameTree: true })
    expect(policy.snapshot().contaminationReasons).toContain('unowned-top-navigation-committed')
    expect(policy.isTrustedGeneration()).toBe(false)
  })

  it('allows the main-owned navigation at will-time but only while the intent is pending', () => {
    const policy = new FramePolicy()
    policy.ownedNavigationIntent('dsh-app://app/index.html')
    expect(policy.onNavigationWill({ isMainFrame: true, isSameDocument: false, url: 'dsh-app://app/index.html' }).preventDefault).toBe(false)
    policy.onNavigationStart({ isMainFrame: true, isSameDocument: false, url: 'dsh-app://app/index.html' })
    policy.onNavigationCommitted({ isMainFrame: true, url: 'dsh-app://app/index.html', singleFrameTree: true })
    expect(policy.onNavigationWill({ isMainFrame: true, isSameDocument: false, url: 'dsh-app://app/index.html' }).preventDefault).toBe(true)
  })

  it('denies non-main navigations at every stage', () => {
    const policy = new FramePolicy()
    commitOwned(policy, 'dsh-app://app/index.html')
    const will = policy.onNavigationWill({ isMainFrame: false, isSameDocument: false, url: 'dsh-app://app/child' })
    expect(will.preventDefault).toBe(true)
    policy.onNavigationStart({ isMainFrame: false, isSameDocument: false, url: 'dsh-app://app/child' })
    policy.onNavigationCommitted({ isMainFrame: false, url: 'dsh-app://app/child', singleFrameTree: false })
    const reasons = policy.snapshot().contaminationReasons
    expect(reasons).toContain('non-main-frame-navigation')
    expect(reasons).toContain('non-main-frame-navigation-started')
    expect(reasons).toContain('non-main-frame-navigation-committed')
    expect(policy.isTrustedGeneration()).toBe(false)
  })

  it('denies webview attachment and contaminates the generation', () => {
    const policy = new FramePolicy()
    commitOwned(policy, 'dsh-app://app/index.html')
    expect(policy.onWebviewAttach().preventDefault).toBe(true)
    expect(policy.snapshot().contaminationReasons).toContain('webview-attach-attempt')
    expect(policy.isTrustedGeneration()).toBe(false)
  })

  it('invalidates a pending navigation when the main load fails', () => {
    const policy = new FramePolicy()
    policy.ownedNavigationIntent('dsh-app://app/index.html')
    policy.onLoadFailed(true)
    expect(policy.snapshot()).toMatchObject({ generation: 0, ready: false, contaminated: true })
    expect(policy.snapshot().contaminationReasons).toContain('main-load-failed')
    // A later owned navigation can still commit a clean generation.
    commitOwned(policy, 'dsh-app://app/')
    expect(policy.isTrustedGeneration()).toBe(true)
  })

  it('invalidates the generation on renderer crash or destruction', () => {
    for (const [act, reason] of [
      [(policy: FramePolicy) => policy.onRenderProcessGone('crashed'), 'render-process-gone:crashed'],
      [(policy: FramePolicy) => policy.onDestroyed(), 'web-contents-destroyed'],
    ] as const) {
      const policy = new FramePolicy()
      commitOwned(policy, 'dsh-app://app/index.html')
      act(policy)
      expect(policy.snapshot()).toMatchObject({ ready: false, contaminated: true })
      expect(policy.snapshot().contaminationReasons).toContain(reason)
      expect(policy.isTrustedGeneration()).toBe(false)
    }
  })

  it('reports contamination once per generation to the listener', () => {
    const events: Array<{ reason: string; generation: number }> = []
    const policy = new FramePolicy({ onContamination: (reason, generation) => { events.push({ reason, generation }) } })
    commitOwned(policy, 'dsh-app://app/index.html')
    policy.onFrameCreated(false)
    policy.onNavigationWill({ isMainFrame: false, isSameDocument: false, url: 'dsh-app://app/child' })
    expect(events).toEqual([{ reason: 'non-main-frame-created', generation: 1 }])
    commitOwned(policy, 'dsh-app://app/')
    policy.onWebviewAttach()
    expect(events).toEqual([
      { reason: 'non-main-frame-created', generation: 1 },
      { reason: 'webview-attach-attempt', generation: 2 },
    ])
  })

  it('treats child events during a pending navigation as a child seen by that navigation', () => {
    const policy = new FramePolicy()
    policy.ownedNavigationIntent('dsh-app://app/')
    policy.onNavigationStart({ isMainFrame: false, isSameDocument: false, url: 'dsh-app://app/child' })
    expect(policy.snapshot().contaminationReasons).toContain('non-main-frame-navigation-started')
    policy.onNavigationStart({ isMainFrame: true, isSameDocument: false, url: 'dsh-app://app/' })
    policy.onNavigationWill({ isMainFrame: true, isSameDocument: false, url: 'dsh-app://app/' })
    policy.onNavigationCommitted({ isMainFrame: true, url: 'dsh-app://app/', singleFrameTree: true })
    // The commit summarizes the child as seen by this navigation instead of keeping every event name.
    expect(policy.snapshot()).toMatchObject({ generation: 1, ready: false, contaminated: true })
    expect(policy.snapshot().contaminationReasons).toEqual(['non-main-frame-created'])
  })
})
