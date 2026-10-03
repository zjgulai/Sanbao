import { describe, expect, it } from 'vitest'

import { createExternalLinks, readExternalUrl } from '../src/main/external-links.js'

/**
 * Ticket 033 (US-172, D-036): the controlled external-link entry.
 *
 * The module is validate-then-hand-off: schemes other than http/https, embedded credentials and
 * over-long URLs are refused by their own codes; the projection carries scheme + host only; and
 * without an opener the answer is an honest `external-open-unavailable` — never a pretend success.
 * Nothing here fetches, resolves or probes the target (no auto-network by construction).
 */

describe('the external-link module (ticket 033)', () => {
  it('validates scheme, credentials and length with their own codes', () => {
    expect(readExternalUrl('https://example.com/a?x=1')).toMatchObject({ ok: true, scheme: 'https', host: 'example.com' })
    // IDN hosts come back in their normalized (punycode) form — the projection never carries raw text.
    expect(readExternalUrl('http://例え.jp/p')).toMatchObject({ ok: true, scheme: 'http', host: 'xn--r8jz45g.jp' })
    expect(readExternalUrl('javascript:alert(1)')).toEqual({ ok: false, code: 'link-scheme-refused' })
    expect(readExternalUrl('file:///etc/passwd')).toEqual({ ok: false, code: 'link-scheme-refused' })
    expect(readExternalUrl('data:text/html,x')).toEqual({ ok: false, code: 'link-scheme-refused' })
    expect(readExternalUrl('myapp://open')).toEqual({ ok: false, code: 'link-scheme-refused' })
    expect(readExternalUrl('https://user:secret@example.com/')).toEqual({ ok: false, code: 'link-credentials-refused' })
    expect(readExternalUrl('not a url')).toEqual({ ok: false, code: 'link-invalid' })
    expect(readExternalUrl('https://' + 'a'.repeat(2100) + '.com')).toEqual({ ok: false, code: 'link-too-long' })
  })

  it('opens through the injected port and echoes scheme + host only — never the full URL', async () => {
    const seen: string[] = []
    const links = createExternalLinks({ openExternal: async (url) => { seen.push(url) }, now: () => '2026-10-03T10:00:00.000Z' })
    expect(links.lastOpen()).toBeNull()
    const outcome = await links.open('https://example.com/private/path?token=abc#frag')
    expect(outcome).toEqual({ state: 'opened', target: { scheme: 'https', host: 'example.com' } })
    // The projection never carries the path/query/fragment back.
    expect(JSON.stringify(outcome)).not.toContain('token')
    expect(JSON.stringify(outcome)).not.toContain('/private')
    // The opener received the validated URL — exactly once, only on this explicit call.
    expect(seen).toEqual(['https://example.com/private/path?token=abc#frag'])
    expect(links.lastOpen()).toMatchObject({ scheme: 'https', host: 'example.com', at: '2026-10-03T10:00:00.000Z' })
  })

  it('keeps refusals honest: blocked schemes never reach the opener; no opener means unavailable', async () => {
    const seen: string[] = []
    const links = createExternalLinks({ openExternal: async (url) => { seen.push(url) }, now: () => 't' })
    expect(await links.open('javascript:alert(1)')).toEqual({ state: 'refused', code: 'link-scheme-refused' })
    expect(await links.open('https://u:p@example.com/')).toEqual({ state: 'refused', code: 'link-credentials-refused' })
    expect(seen).toEqual([])
    expect(links.lastOpen()).toBeNull()

    const unwired = createExternalLinks({ now: () => 't' })
    expect(await unwired.open('https://example.com/')).toEqual({ state: 'refused', code: 'external-open-unavailable' })
    expect(unwired.lastOpen()).toBeNull()

    const failing = createExternalLinks({ openExternal: async () => { throw new Error('no browser') }, now: () => 't' })
    expect(await failing.open('https://example.com/')).toEqual({ state: 'refused', code: 'external-open-failed' })
    // A throw is not proof of non-delivery, so it is never recorded as an open either.
    expect(failing.lastOpen()).toBeNull()
  })
})
