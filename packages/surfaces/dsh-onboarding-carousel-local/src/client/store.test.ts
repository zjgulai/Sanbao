import { describe, expect, it } from 'vitest'
import { INTRO_VERSION, UPSTREAM_NOTICE_VERSION } from '../onboarding-copy.js'
import { IntroCarouselStore, type ScopeLike } from './store.js'
import type { IntroScopeLike } from './step.js'

function fakeScope(initial: IntroScopeLike) {
  const listeners = new Set<() => void>()
  const writes: [string, string][] = []
  let snapshot = initial
  let failNext = false
  const scope: ScopeLike = {
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    getSnapshot() { return snapshot },
    async set(field, value) {
      if (failNext) { failNext = false; throw new Error('write refused') }
      writes.push([field, value])
      const section = typeof snapshot.value === 'object' && snapshot.value !== null ? snapshot.value : {}
      snapshot = { ...snapshot, value: { ...section, [field]: value } }
      for (const listener of listeners) listener()
    },
  }
  return {
    scope,
    writes,
    push(next: IntroScopeLike) { snapshot = next; for (const listener of listeners) listener() },
    failOnce() { failNext = true },
  }
}

const loading = (): IntroScopeLike => ({ status: 'loading', mode: 'host', value: undefined })
const fresh = (): IntroScopeLike => ({ status: 'ready', mode: 'host', value: {} })

describe('intro carousel store', () => {
  it('shows while the durable acknowledgement is missing', () => {
    const intro = fakeScope(fresh())
    const notice = fakeScope(fresh())
    const store = new IntroCarouselStore(intro.scope, notice.scope)
    store.load()
    expect(store.getSnapshot().decision).toBe('show')
  })

  it('stays waiting until the settings scope answers', () => {
    const intro = fakeScope(loading())
    const notice = fakeScope(fresh())
    const store = new IntroCarouselStore(intro.scope, notice.scope)
    store.load()
    expect(store.getSnapshot().decision).toBe('waiting')
    intro.push(fresh())
    expect(store.getSnapshot().decision).toBe('show')
  })

  it('writes both acknowledgements when the user finishes', async () => {
    const intro = fakeScope(fresh())
    const notice = fakeScope(fresh())
    const store = new IntroCarouselStore(intro.scope, notice.scope)
    store.load()
    await store.finish()
    expect(intro.writes).toEqual([['introVersion', INTRO_VERSION]])
    expect(notice.writes).toEqual([['welcomeNoticeVersion', UPSTREAM_NOTICE_VERSION]])
    expect(store.getSnapshot().decision).toBe('done')
  })

  it('ends the step even when a write is refused, and says so', async () => {
    const intro = fakeScope(fresh())
    const notice = fakeScope(fresh())
    const store = new IntroCarouselStore(intro.scope, notice.scope)
    store.load()
    intro.failOnce()
    await store.finish()
    expect(store.getSnapshot().decision).toBe('done')
    expect(store.getSnapshot().error).toBe('write refused')
  })

  it('advances immediately while the write is still in flight', () => {
    const intro = fakeScope(fresh())
    const notice = fakeScope(fresh())
    const store = new IntroCarouselStore(intro.scope, notice.scope)
    store.load()
    const pending = store.finish()
    expect(store.getSnapshot().decision).toBe('done')
    return pending
  })

  it('never writes a second time for one session', async () => {
    const intro = fakeScope(fresh())
    const notice = fakeScope(fresh())
    const store = new IntroCarouselStore(intro.scope, notice.scope)
    store.load()
    await store.finish()
    await store.finish()
    expect(intro.writes).toHaveLength(1)
    expect(notice.writes).toHaveLength(1)
  })
})
