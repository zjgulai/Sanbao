import { describe, expect, it, vi } from 'vitest'

import { createUnavailableFirstService } from '../src/appservice/composition.js'
import { handleSageServiceRequest } from '../src/appservice/route-skeleton.js'
import { createArtifactPreview, type PreviewContainer, type PreviewLoad } from '../src/main/artifact-preview.js'
import type { ArtifactRecord } from '../src/main/artifacts.js'

/**
 * Ticket 044 (US-205) at the module and route seams.
 *
 * The acceptance lines: the separate window opens ONLY on an explicit action over an already-open
 * preview (a card render, boot or the panel open never creates it); it shows the SAME prepared
 * document reference as the side container — zero bridge re-reads, zero generator runs — so two
 * coexisting surfaces can never show two authoritative version values; a late window load under a
 * superseded selection is dropped and destroyed; and closing the window returns to the panel
 * layout without touching the run (this module's bridge surface is read-only and carries no
 * cancel).
 */

function harness() {
  const calls: Array<{ readonly endpoint: string, readonly payload: readonly unknown[] }> = []
  const panelLoads: PreviewLoad[] = []
  const windowLoads: PreviewLoad[] = []
  let panelCreated = 0
  let panelDestroyed = 0
  let windowCreated = 0
  let windowDestroyed = 0
  let windowLoadGate: Promise<void> | null = null
  let releaseGate: (() => void) | null = null

  const preview = createArtifactPreview({
    callBridge: async (endpoint, payload = []) => {
      calls.push({ endpoint, payload })
      const path = (payload[0] as { path?: string } | undefined)?.path ?? ''
      if (endpoint === 'workspaceFiles/stat') return { ok: true, result: { absolutePath: path, version: 'v1', bytes: 3 } }
      if (endpoint === 'workspaceFiles/read') return { ok: true, result: { absolutePath: path, version: 'v1', offset: 1, text: 'line', lines: 1, eof: true, bytes: 3 } }
      if (endpoint === 'workspaceFiles/readAll') return { ok: true, result: { absolutePath: path, version: 'v1', offset: 0, data: Buffer.from('bytes').toString('base64'), eof: true, bytes: 5 } }
      return { ok: false, code: 'bridge-endpoint-unsupported' }
    },
    createContainer: () => {
      panelCreated += 1
      const container: PreviewContainer = {
        load: async (input) => { panelLoads.push(input) },
        destroy: () => { panelDestroyed += 1 },
      }
      return container
    },
    createWindowContainer: () => {
      windowCreated += 1
      const container: PreviewContainer = {
        load: async (input) => {
          windowLoads.push(input)
          if (windowLoadGate !== null) await windowLoadGate
        },
        destroy: () => { windowDestroyed += 1 },
      }
      return container
    },
    now: () => 't',
  })
  return {
    preview, calls, panelLoads, windowLoads,
    counts: () => ({ panelCreated, panelDestroyed, windowCreated, windowDestroyed }),
    gateNextWindowLoad: () => {
      windowLoadGate = new Promise<void>((resolve) => { releaseGate = resolve })
    },
    releaseWindowLoad: () => { releaseGate?.(); windowLoadGate = null; releaseGate = null },
  }
}

const record = (over: Partial<ArtifactRecord> = {}): ArtifactRecord => ({
  artifactId: 'art-1',
  matterRef: 'm',
  workspaceRoot: '/work',
  path: '/work/notes.txt',
  name: 'notes.txt',
  kind: 'text',
  version: 'v1',
  bytes: 3,
  state: 'ready',
  observedAt: 't',
  ...over,
})

describe('the artifact window surface (ticket 044)', () => {
  it('creates no window before the explicit action, then opens it over the SAME prepared document (zero bridge calls)', async () => {
    const h = await harness()
    await h.preview.open(record())
    expect(h.counts().windowCreated).toBe(0)
    const callsAfterPanel = h.calls.length

    const opened = await h.preview.openWindow()
    expect(opened).toMatchObject({ state: 'opened', preview: { state: 'ready', version: 'v1', window: true } })
    expect(h.counts().windowCreated).toBe(1)
    // The SAME prepared reference — no stat, no read, no generator run.
    expect(h.windowLoads).toHaveLength(1)
    expect(h.windowLoads[0]).toBe(h.panelLoads[0])
    expect(h.calls.length).toBe(callsAfterPanel)

    // Idempotent: a second explicit open dials nothing new.
    const again = await h.preview.openWindow()
    expect(again).toMatchObject({ state: 'opened' })
    expect(h.counts().windowCreated).toBe(1)
    // Idempotent in the strong sense: no second load either — the window keeps its document.
    expect(h.windowLoads).toHaveLength(1)
  })

  it('closing the window returns to the panel layout — the panel and the run are untouched', async () => {
    const h = await harness()
    await h.preview.open(record())
    await h.preview.openWindow()
    const callsBefore = h.calls.length

    const closed = h.preview.closeWindow()
    expect(closed).toMatchObject({ state: 'closed', preview: { state: 'ready', window: false, artifactId: 'art-1' } })
    expect(h.counts().windowDestroyed).toBe(1)
    expect(h.counts().panelDestroyed).toBe(0)
    expect(h.preview.state()).toMatchObject({ state: 'ready', window: false })
    // Nothing but reads ever crossed the bridge — no session call exists on any path.
    expect(h.calls.length).toBe(callsBefore)
    expect(h.calls.every((call) => call.endpoint.startsWith('workspaceFiles/'))).toBe(true)
  })

  it('same-version reopen re-reads nothing and re-runs no generator', async () => {
    const h = await harness()
    await h.preview.open(record())
    await h.preview.openWindow()
    h.preview.closeWindow()
    const callsAfterFirstCycle = h.calls.length
    await h.preview.openWindow()
    expect(h.calls.length).toBe(callsAfterFirstCycle)
    expect(h.windowLoads).toHaveLength(2)
    expect(h.windowLoads[1]).toBe(h.panelLoads[0])
  })

  it('a late window load under a superseded selection is dropped and destroyed — never two version values', async () => {
    const h = await harness()
    await h.preview.open(record())
    h.gateNextWindowLoad()
    const opening = h.preview.openWindow()
    // A new selection lands while the window is still loading its old document.
    await h.preview.open(record({ artifactId: 'art-2', path: '/work/other.txt', name: 'other.txt' }))
    h.releaseWindowLoad()
    await expect(opening).resolves.toMatchObject({ state: 'refused', code: 'artifact-superseded' })
    expect(h.counts().windowDestroyed).toBe(1)
    expect(h.preview.state()).toMatchObject({ state: 'ready', artifactId: 'art-2', window: false })
  })

  it('refuses by name: no open preview, no factory, not open, and one close releases both surfaces', async () => {
    const h = await harness()
    expect(await h.preview.openWindow()).toMatchObject({ state: 'refused', code: 'artifact-preview-not-open' })
    expect(h.preview.closeWindow()).toMatchObject({ state: 'refused', code: 'artifact-preview-not-open' })

    await h.preview.open(record())
    expect(h.preview.closeWindow()).toMatchObject({ state: 'refused', code: 'artifact-window-not-open' })

    const bare = createArtifactPreview({
      callBridge: async () => ({ ok: true, result: { version: 'v1', absolutePath: '/work/notes.txt', bytes: 3, text: 'line', lines: 1, eof: true, data: Buffer.from('x').toString('base64'), offset: 0 } }),
      createContainer: () => ({ load: async () => undefined, destroy: () => undefined }),
      now: () => 't',
    })
    await bare.open(record())
    expect(await bare.openWindow()).toMatchObject({ state: 'refused', code: 'artifact-window-unavailable' })

    await h.preview.openWindow()
    h.preview.close()
    expect(h.counts().windowDestroyed).toBe(1)
    expect(h.counts().panelDestroyed).toBe(1)
    expect(h.preview.state()).toEqual({ state: 'closed' })
  })
})

describe('the artifact window route (ticket 044)', () => {
  it('parses exactly, forwards, and keeps an unwired provider honest', async () => {
    const seen: string[] = []
    const providers = createUnavailableFirstService(null, {
      artifactWindowOpen: async () => {
        seen.push('open')
        return { state: 'opened', preview: { state: 'ready', artifactId: 'a', name: 'n', kind: 'text' as const, version: 'v1', expanded: false, window: true } }
      },
      artifactWindowClose: () => {
        seen.push('close')
        return { state: 'closed', preview: { state: 'ready', artifactId: 'a', name: 'n', kind: 'text' as const, version: 'v1', expanded: false, window: false } }
      },
    })
    const post = (body: unknown, service = providers) => handleSageServiceRequest(
      new Request('dsh-app://app/.sage/artifacts/window', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      { callerBinding: { correlation: 'c-044' }, providers: service } as never,
    )
    expect(await (await post({ action: 'open' })).json()).toMatchObject({ state: 'opened', preview: { window: true } })
    expect(await (await post({ action: 'close' })).json()).toMatchObject({ state: 'closed', preview: { window: false } })
    expect(seen).toEqual(['open', 'close'])

    expect((await post({ action: 'nope' })).status).toBe(400)
    expect((await post({})).status).toBe(400)
    expect((await post({ action: 'open', extra: 1 })).status).toBe(400)

    const unwired = createUnavailableFirstService(null, {})
    expect(await (await post({ action: 'open' }, unwired)).json()).toMatchObject({ code: 'artifact-window-unavailable' })
    expect(await (await post({ action: 'close' }, unwired)).json()).toMatchObject({ code: 'artifact-window-unavailable' })
  })
})
