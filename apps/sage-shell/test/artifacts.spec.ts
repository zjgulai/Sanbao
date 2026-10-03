import { describe, expect, it } from 'vitest'

import { createArtifacts, kindOf } from '../src/main/artifacts.js'

/**
 * Ticket 015 (US-031~038/040/042): cards from the session's own observation feed.
 *
 * The feed reports observations, not deltas — so every clue must be confirmed by a fresh stat, and
 * only then does a card say `ready` at that exact version. Nothing here treats a change as a
 * delivery, and no bridge call ever carries the machine path outside main.
 */

const change = (path: string, version: string) => ({ kind: 'change', change: { absolutePath: path, version } })
const gone = (path: string) => ({ kind: 'change', change: { absolutePath: path, absent: true } })

function store(frames: readonly unknown[], statAnswers: Record<string, unknown>) {
  const calls: Array<{ readonly endpoint: string, readonly payload: readonly unknown[] }> = []
  let counter = 0
  const instance = createArtifacts({
    callBridge: async (endpoint, payload = []) => {
      calls.push({ endpoint, payload })
      const path = (payload[0] as { path?: string } | undefined)?.path ?? ''
      return statAnswers[path] ?? { ok: false, code: 'bridge-file-not-found' }
    },
    streamCall: async (endpoint, payload, onFrame) => {
      calls.push({ endpoint, payload })
      for (const frame of frames) if (!onFrame(frame)) break
      return { ok: true, result: { frames: frames.length } }
    },
    now: () => '2026-10-02T12:00:00.000Z',
    nextId: () => String(++counter),
  })
  return { instance, calls }
}

const statOk = (version: string, bytes: number) => ({ ok: true, result: { absolutePath: '/w/x', version, bytes } })

describe('artifact cards come from confirmed clues', () => {
  it('confirms every clue with a fresh stat and only then writes a ready card at that version', async () => {
    const { instance, calls } = store(
      [{ kind: 'ready' }, change('/work/q3/report.md', 'v7'), change('/work/q3/chart.png', 'v3')],
      { '/work/q3/report.md': statOk('v7', 2048), '/work/q3/chart.png': statOk('v3', 65536) },
    )
    const outcome = await instance.observe({ matterRef: 'receipt:1', workspaceRoot: '/work' })
    expect(outcome).toEqual({ state: 'observed', observed: 2, cards: 2 })
    const cards = instance.cardsFor('receipt:1')
    expect(cards.map((card) => [card.name, card.kind, card.version, card.state])).toEqual([
      ['report.md', 'markdown', 'v7', 'ready'],
      ['chart.png', 'image', 'v3', 'ready'],
    ])
    // The clue is confirmed by one stat each — the change alone never made anything ready.
    expect(calls.filter((call) => call.endpoint === 'workspaceFiles/stat').map((call) => (call.payload[0] as { path: string }).path))
      .toEqual(['/work/q3/report.md', '/work/q3/chart.png'])
    // The projection carries no machine path.
    const json = JSON.stringify(cards)
    expect(json).not.toContain('/work')
    expect(json).not.toContain('absolutePath')
  })

  it('keeps the last observation per path, and marks absent without erasing the last version', async () => {
    let frames: readonly unknown[] = [{ kind: 'ready' }, change('/work/a.txt', 'v1'), change('/work/a.txt', 'v2')]
    let counter = 0
    const instance = createArtifacts({
      callBridge: async () => statOk('v2', 10),
      streamCall: async (endpoint, payload, onFrame) => { for (const frame of frames) if (!onFrame(frame)) break; return { ok: true, result: { frames: frames.length } } },
      now: () => 't',
      nextId: () => String(++counter),
    })
    await instance.observe({ matterRef: 'm', workspaceRoot: '/work' })
    expect(instance.cardsFor('m')[0]).toMatchObject({ version: 'v2', state: 'ready' })
    frames = [{ kind: 'ready' }, gone('/work/a.txt')]
    await instance.observe({ matterRef: 'm', workspaceRoot: '/work' })
    const card = instance.cardsFor('m')[0]!
    // The absence observation keeps the last known version on the card, saying when it was last seen.
    expect(card.state).toBe('absent')
    expect(card.version).toBe('v2')
  })

  it('says unconfirmed — never ready — when the stat disagrees with the clue or cannot answer', async () => {
    const { instance } = store(
      [{ kind: 'ready' }, change('/work/moved.txt', 'v5'), change('/work/sick.bin', 'v1')],
      { '/work/moved.txt': statOk('v9', 1), '/work/sick.bin': { ok: false, code: 'bridge-provider-failed' } },
    )
    await instance.observe({ matterRef: 'm', workspaceRoot: '/work' })
    const cards = instance.cardsFor('m')
    expect(cards.find((card) => card.name === 'moved.txt')).toMatchObject({ state: 'unconfirmed' })
    expect(cards.find((card) => card.name === 'sick.bin')).toMatchObject({ state: 'unconfirmed' })
  })

  it('skips directories and dotfiles: they are not candidates', async () => {
    const { instance, calls } = store(
      [{ kind: 'ready' }, change('/work/.DS_Store', 'v1'), change('/work/q3', 'v2')],
      { '/work/q3': { ok: false, code: 'bridge-file-not-regular' } },
    )
    await instance.observe({ matterRef: 'm', workspaceRoot: '/work' })
    expect(instance.cardsFor('m')).toEqual([])
    // The dotfile was refused before any stat; the directory got its one stat and was dropped.
    expect(calls.filter((call) => call.endpoint === 'workspaceFiles/stat')).toHaveLength(1)
  })

  it('updates the existing card on a newer observation, and keeps matters separate', async () => {
    let frames: readonly unknown[] = [{ kind: 'ready' }, change('/work/notes.txt', 'v1')]
    let statAnswer: unknown = statOk('v1', 3)
    let counter = 0
    const instance = createArtifacts({
      callBridge: async () => statAnswer,
      streamCall: async (endpoint, payload, onFrame) => { for (const frame of frames) if (!onFrame(frame)) break; return { ok: true, result: { frames: frames.length } } },
      now: () => 't',
      nextId: () => String(++counter),
    })
    await instance.observe({ matterRef: 'm1', workspaceRoot: '/work' })
    const first = instance.cardsFor('m1')[0]!
    expect(first).toMatchObject({ version: 'v1', state: 'ready' })

    frames = [{ kind: 'ready' }, change('/work/notes.txt', 'v2')]
    statAnswer = statOk('v2', 4)
    await instance.observe({ matterRef: 'm1', workspaceRoot: '/work' })
    const cards = instance.cardsFor('m1')
    // Same card identity, new version: a card read of the record, nothing else moved.
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({ artifactId: first.artifactId, version: 'v2', bytes: 4, state: 'ready' })
    expect(instance.cardsFor('m2')).toEqual([])
  })

  it('refuses when the feed itself cannot answer, and refuses without a ready frame', async () => {
    const refused = createArtifacts({
      callBridge: async () => ({ ok: false, code: 'bridge-file-not-found' }),
      streamCall: async () => ({ ok: false, code: 'bridge-file-scope-unavailable' }),
      now: () => 't',
      nextId: () => 'x',
    })
    await expect(refused.observe({ matterRef: 'm', workspaceRoot: '/work' }))
      .resolves.toEqual({ state: 'refused', code: 'bridge-file-scope-unavailable' })
    const notReady = createArtifacts({
      callBridge: async () => ({ ok: false, code: 'bridge-file-not-found' }),
      streamCall: async (endpoint, payload, onFrame) => { onFrame(change('/work/a.txt', 'v1')); return { ok: true, result: { frames: 1 } } },
      now: () => 't',
      nextId: () => 'x',
    })
    await expect(notReady.observe({ matterRef: 'm', workspaceRoot: '/work' }))
      .resolves.toEqual({ state: 'refused', code: 'artifact-feed-not-ready' })
  })
})

describe('kind selection is explicit and extension-based (US-038/040)', () => {
  it('maps the first-release families and keeps Office out of the preview set', () => {
    expect(kindOf('a.md')).toBe('markdown')
    expect(kindOf('a.ts')).toBe('code')
    expect(kindOf('a.txt')).toBe('text')
    expect(kindOf('a.png')).toBe('image')
    expect(kindOf('a.jpeg')).toBe('image')
    expect(kindOf('a.html')).toBe('html')
    expect(kindOf('a.pdf')).toBe('pdf')
    expect(kindOf('a.csv')).toBe('csv')
    expect(kindOf('a.docx')).toBe('office')
    expect(kindOf('archive.zip')).toBe('binary')
  })
})
