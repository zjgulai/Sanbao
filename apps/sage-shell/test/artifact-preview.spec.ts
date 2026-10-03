import { describe, expect, it } from 'vitest'

import { buildImageDocument, buildTextDocument, createArtifactPreview, type PreviewContainer, type PreviewLoad } from '../src/main/artifact-preview.js'
import type { ArtifactRecord } from '../src/main/artifacts.js'

/**
 * Ticket 015 (US-032~037/042): the preview state machine and its documents.
 *
 * What these tests bind: the container exists only because of an explicit open; an open reads the
 * card's exact version and nothing else; a late result never overrides a newer selection and never
 * reopens a closed preview; close reclaims the container; Office is a card, not a preview.
 */

function deferred<T>(): { readonly promise: Promise<T>, readonly resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

interface Harness {
  readonly preview: ReturnType<typeof createArtifactPreview>
  readonly loads: PreviewLoad[]
  readonly destroyed: () => number
  readonly created: () => number
  readonly calls: Array<{ readonly endpoint: string, readonly payload: readonly unknown[] }>
}

function harness(options: { readonly stat?: (path: string) => Promise<unknown>, readonly read?: (kind: 'read' | 'readAll', payload: readonly unknown[]) => Promise<unknown>, readonly codelessCreate?: boolean } = {}): Harness {
  const loads: PreviewLoad[] = []
  let created = 0
  let destroyed = 0
  const calls: Array<{ readonly endpoint: string, readonly payload: readonly unknown[] }> = []
  let container: PreviewContainer | null = null
  const preview = createArtifactPreview({
    callBridge: async (endpoint, payload = []) => {
      calls.push({ endpoint, payload })
      const path = (payload[0] as { path?: string } | undefined)?.path ?? ''
      if (endpoint === 'workspaceFiles/stat') {
        return options.stat !== undefined ? options.stat(path) : { ok: true, result: { absolutePath: path, version: 'v1', bytes: 3 } }
      }
      if (endpoint === 'workspaceFiles/read') {
        return options.read !== undefined ? options.read('read', payload) : { ok: true, result: { absolutePath: path, version: 'v1', offset: 1, text: 'line', lines: 1, eof: true, bytes: 3 } }
      }
      if (endpoint === 'workspaceFiles/readAll') {
        return options.read !== undefined ? options.read('readAll', payload) : { ok: true, result: { absolutePath: path, version: 'v1', offset: 0, data: Buffer.from('bytes').toString('base64'), eof: true, bytes: 5 } }
      }
      return { ok: false, code: 'bridge-endpoint-unsupported' }
    },
    createContainer: () => {
      created += 1
      container = {
        load: async (input) => { loads.push(input) },
        destroy: () => { destroyed += 1 },
      }
      void container
      return container
    },
    now: () => 't',
  })
  return { preview, loads, destroyed: () => destroyed, created: () => created, calls }
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

describe('the container exists only because of an open (US-032/033)', () => {
  it('creates it on the first successful open, keeps it across opens, and destroys it on close', async () => {
    const h = harness()
    expect(h.created()).toBe(0)
    await expect(h.preview.open(record())).resolves.toMatchObject({ state: 'opened', preview: { state: 'ready', version: 'v1' } })
    expect(h.created()).toBe(1)
    expect(h.loads).toHaveLength(1)
    expect(h.loads[0]).toMatchObject({ kind: 'document' })
    expect(String((h.loads[0] as { body: string }).body)).toContain('notes.txt')
    expect(String((h.loads[0] as { body: string }).body)).not.toContain('<script')
    // A second open reuses the one side surface, then close reclaims it.
    await h.preview.open(record({ artifactId: 'art-2', name: 'two.txt' }))
    expect(h.created()).toBe(1)
    h.preview.close()
    expect(h.destroyed()).toBe(1)
    expect(h.preview.state()).toEqual({ state: 'closed' })
    // The next open builds a fresh container (close really reclaimed the old one).
    await h.preview.open(record())
    expect(h.created()).toBe(2)
  })

  it('refuses Office and binary kinds without ever creating a container (US-040)', async () => {
    const h = harness()
    await expect(h.preview.open(record({ kind: 'office', name: 'report.docx' })))
      .resolves.toEqual({ state: 'refused', code: 'artifact-format-deferred' })
    await expect(h.preview.open(record({ kind: 'binary', name: 'archive.zip' })))
      .resolves.toEqual({ state: 'refused', code: 'artifact-format-unsupported' })
    expect(h.created()).toBe(0)
    expect(h.preview.state()).toEqual({ state: 'closed' })
  })
})

describe('an open reads the card\'s exact version (US-035)', () => {
  it('fails with its own code when the version moved, and retry re-reads the SAME version', async () => {
    let statVersion = 'v9'
    const h = harness({
      stat: async (path) => ({ ok: true, result: { absolutePath: path, version: statVersion, bytes: 3 } }),
    })
    const outcome = await h.preview.open(record())
    expect(outcome).toMatchObject({ state: 'opened', preview: { state: 'failed', code: 'artifact-version-changed', retryable: true } })
    // The failure came before any content read and before any container: nothing half-opened.
    expect(h.calls.some((call) => call.endpoint === 'workspaceFiles/read')).toBe(false)
    expect(h.created()).toBe(0)

    // Retry keeps the SAME expectation: while the file still differs, the same failure stands…
    await expect(h.preview.retry()).resolves.toMatchObject({ preview: { state: 'failed', code: 'artifact-version-changed' } })
    const statCalls = h.calls.filter((call) => call.endpoint === 'workspaceFiles/stat')
    expect(statCalls).toHaveLength(2)
    expect((statCalls[1]!.payload[0] as { path: string }).path).toBe('/work/notes.txt')
    // …and when the file is back at the card's version, the SAME version reads — never v9.
    statVersion = 'v1'
    await expect(h.preview.retry()).resolves.toMatchObject({ preview: { state: 'ready', version: 'v1' } })
    expect(h.loads).toHaveLength(1)
  })

  it('reports too-large and not-text as their own failures, with honest retryability', async () => {
    const tooLarge = harness({ read: async () => ({ ok: false, code: 'bridge-file-too-large' }) })
    await expect(tooLarge.preview.open(record({ kind: 'image', name: 'huge.png' })))
      .resolves.toMatchObject({ preview: { state: 'failed', code: 'artifact-too-large', retryable: true } })
    const notText = harness({ read: async () => ({ ok: false, code: 'bridge-file-not-text' }) })
    await expect(notText.preview.open(record()))
      .resolves.toMatchObject({ preview: { state: 'failed', code: 'artifact-not-text', retryable: false } })
  })
})

describe('late results never override or reopen (US-036/037)', () => {
  it('drops the older open\'s completion once a newer selection owns the surface', async () => {
    const slowStat = deferred<unknown>()
    const h = harness({
      stat: async (path) => (path === '/work/slow.txt' ? slowStat.promise : { ok: true, result: { absolutePath: path, version: 'v1', bytes: 3 } }),
    })
    const older = h.preview.open(record({ artifactId: 'a-old', path: '/work/slow.txt', name: 'slow.txt' }))
    const newer = await h.preview.open(record({ artifactId: 'a-new', name: 'new.txt' }))
    expect(newer).toMatchObject({ preview: { state: 'ready', name: 'new.txt' } })
    slowStat.resolve({ ok: true, result: { absolutePath: '/work/slow.txt', version: 'v1', bytes: 3 } })
    await expect(older).resolves.toEqual({ state: 'refused', code: 'artifact-superseded' })
    // The newest selection stands; the late one loaded nothing.
    expect(h.preview.state()).toMatchObject({ state: 'ready', name: 'new.txt' })
    expect(h.loads).toHaveLength(1)
  })

  it('drops a load that finishes late, and fails when the read itself returns another version', async () => {
    // Late during the container load: open A's load is held; open B completes; A's late finish
    // must not steal the surface back.
    let held: (() => void) | null = null
    const loads: string[] = []
    const preview = createArtifactPreview({
      callBridge: async (endpoint, payload = []) => {
        const path = (payload[0] as { path?: string } | undefined)?.path ?? ''
        if (endpoint === 'workspaceFiles/stat') return { ok: true, result: { absolutePath: path, version: 'v1', bytes: 3 } }
        if (endpoint === 'workspaceFiles/read') return { ok: true, result: { absolutePath: path, version: 'v1', lines: 1, text: 'x', eof: true, bytes: 3 } }
        return { ok: false, code: 'bridge-endpoint-unsupported' }
      },
      createContainer: () => ({
        load: async (input) => {
          const body = input.kind === 'document' ? input.body : ''
          loads.push(body)
          if (body.includes('slow.txt')) await new Promise<void>((resolve) => { held = resolve })
        },
        destroy: () => undefined,
      }),
      now: () => 't',
    })
    const older = preview.open(record({ artifactId: 'a-old', name: 'slow.txt', path: '/work/slow.txt' }))
    await new Promise((resolve) => setTimeout(resolve, 0))
    const newer = await preview.open(record({ artifactId: 'a-new', name: 'new.txt' }))
    expect(newer).toMatchObject({ preview: { state: 'ready', name: 'new.txt' } })
    held?.()
    await expect(older).resolves.toEqual({ state: 'refused', code: 'artifact-superseded' })
    expect(preview.state()).toMatchObject({ state: 'ready', name: 'new.txt' })

    // The read stage is its own gate: a read that reports another version fails the open even
    // though the stat agreed a moment earlier.
    const drifted = harness({ read: async () => ({ ok: true, result: { absolutePath: '/work/notes.txt', version: 'v9', lines: 1, text: 'x', eof: true, bytes: 3 } }) })
    await expect(drifted.preview.open(record()))
      .resolves.toMatchObject({ preview: { state: 'failed', code: 'artifact-version-changed', retryable: true } })
    expect(drifted.created()).toBe(0)
  })

  it('never lets a late result reopen a closed preview', async () => {
    const slowStat = deferred<unknown>()
    const h = harness({ stat: async () => slowStat.promise })
    const inFlight = h.preview.open(record())
    h.preview.close()
    slowStat.resolve({ ok: true, result: { absolutePath: '/work/notes.txt', version: 'v1', bytes: 3 } })
    await expect(inFlight).resolves.toEqual({ state: 'refused', code: 'artifact-superseded' })
    expect(h.preview.state()).toEqual({ state: 'closed' })
    expect(h.created()).toBe(0)
    expect(h.loads).toHaveLength(0)
  })
})

describe('content per kind (US-038/042)', () => {
  it('loads HTML as the artifact\'s own offline page and PDF as its bytes', async () => {
    const html = harness({ read: async () => ({ ok: true, result: { absolutePath: '/work/a.html', version: 'v1', offset: 0, data: Buffer.from('<h1>hi</h1>').toString('base64'), eof: true, bytes: 11 } }) })
    await html.preview.open(record({ kind: 'html', name: 'a.html' }))
    expect(html.loads[0]).toEqual({ kind: 'artifact-html', body: '<h1>hi</h1>' })
    const pdf = harness({ read: async () => ({ ok: true, result: { absolutePath: '/work/a.pdf', version: 'v1', offset: 0, data: 'JVBERi0=', eof: true, bytes: 5 } }) })
    await pdf.preview.open(record({ kind: 'pdf', name: 'a.pdf' }))
    expect(pdf.loads[0]).toEqual({ kind: 'pdf', data: 'JVBERi0=' })
  })

  it('reads CSV with the row cap requested from the reader and loads a table document', async () => {
    const seen: unknown[] = []
    const h = harness({
      read: async (kind, payload) => {
        seen.push(payload[0])
        return { ok: true, result: { absolutePath: '/work/q3.csv', version: 'v1', offset: 1, lines: 2, text: 'a,b\n1,2', eof: false, bytes: 7 } }
      },
    })
    await h.preview.open(record({ kind: 'csv', name: 'q3.csv', path: '/work/q3.csv' }))
    expect(h.preview.state()).toMatchObject({ state: 'ready', kind: 'csv' })
    expect((seen[0] as { range: unknown }).range).toEqual({ limit: 2001 })
    const body = (h.loads[0] as { body: string }).body
    expect(body).toContain('<thead><tr><th>a</th><th>b</th></tr></thead>')
    expect(body).toContain('<td>1</td>')
    expect(body).toContain('只显示前 2 行')
    expect(body).not.toContain('<script')
  })

  it('separates a broken CSV from an empty one, and both from the too-large cut', async () => {
    const broken = harness({ read: async () => ({ ok: true, result: { absolutePath: '/work/b.csv', version: 'v1', lines: 1, text: '"abc', eof: true, bytes: 4 } }) })
    await expect(broken.preview.open(record({ kind: 'csv', name: 'b.csv' })))
      .resolves.toMatchObject({ preview: { state: 'failed', code: 'artifact-csv-parse-failed', retryable: false } })
    expect(broken.created()).toBe(0)

    const empty = harness({ read: async () => ({ ok: true, result: { absolutePath: '/work/e.csv', version: 'v1', lines: 0, text: '', eof: true, bytes: 0 } }) })
    await empty.preview.open(record({ kind: 'csv', name: 'e.csv' }))
    expect(empty.preview.state()).toMatchObject({ state: 'ready' })
    expect(String((empty.loads[0] as { body: string }).body)).toContain('空文件：没有可解析的行')

    const tooLarge = harness({ read: async () => ({ ok: false, code: 'bridge-file-too-large' }) })
    await expect(tooLarge.preview.open(record({ kind: 'csv', name: 'huge.csv' })))
      .resolves.toMatchObject({ preview: { state: 'failed', code: 'artifact-too-large', retryable: true } })
  })

  it('builds script-free, self-contained documents for text pages and images', () => {
    const text = buildTextDocument({ name: '<img>.txt', kind: 'markdown', text: '<b>&"', lines: 2, eof: false, bytes: 10 })
    expect(text).toContain('&lt;img&gt;.txt')
    expect(text).toContain('&lt;b&gt;&amp;&quot;')
    expect(text).toContain('本页到第 2 行')
    expect(text).not.toContain('<script')
    const image = buildImageDocument({ name: 'chart.png', mime: 'image/png', data: 'AAAA', bytes: 3 })
    expect(image).toContain('src="data:image/png;base64,AAAA"')
    expect(image).not.toContain('<script')
  })
})
