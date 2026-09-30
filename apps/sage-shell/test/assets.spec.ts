import { describe, expect, it } from 'vitest'
import { createAssetHandler } from '../src/host/assets.js'
import { SAGE_DOCUMENT_CSP } from '../src/product/contracts.js'

function request(path: string, method = 'GET'): Request {
  return new Request(`dsh-app://app${path}`, { method })
}

describe('Sage asset handler', () => {
  it('serves the self-owned Sage document at the two explicit product paths', async () => {
    const handler = createAssetHandler()
    for (const path of ['/', '/index.html']) {
      const response = await handler.fetch(request(path))
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8')
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(response.headers.get('content-security-policy')).toBe(SAGE_DOCUMENT_CSP)
      expect(SAGE_DOCUMENT_CSP).toContain("frame-src 'none'")
      expect(SAGE_DOCUMENT_CSP).toContain("child-src 'none'")
      expect(SAGE_DOCUMENT_CSP).toContain("frame-ancestors 'none'")
      expect(SAGE_DOCUMENT_CSP).toContain("object-src 'none'")
      expect(SAGE_DOCUMENT_CSP).toContain("connect-src 'self'")
      const body = await response.text()
      expect(body).toContain('<title>Sage</title>')
      expect(body).toContain('/.sage/state')
      expect(body).not.toContain('__DSH_TRANSPORT__')
      expect(body).not.toContain('data-sanbao-composer')
    }
  })

  it('allows a bodyless HEAD for the document', async () => {
    const response = await createAssetHandler().fetch(request('/index.html', 'HEAD'))
    expect(response.status).toBe(200)
    expect(response.body).toBeNull()
  })

  it('rejects unknown paths, traversal, wrong methods, and non-desktop origins', async () => {
    const handler = createAssetHandler()
    expect((await handler.fetch(request('/unknown'))).status).toBe(404)
    expect((await handler.fetch(request('/%2e%2e%2fpackage.json'))).status).toBe(403)
    expect((await handler.fetch(request('/index.html', 'POST'))).status).toBe(405)
    expect((await handler.fetch(new Request('https://untrusted.example/index.html'))).status).toBe(403)
    expect((await handler.fetch(new Request('dsh-app://app:123/index.html'))).status).toBe(403)
    expect((await handler.fetch(new Request('dsh-app://app/index.html?unexpected=true'))).status).toBe(403)
  })

  it('declares a buffered request body mode for the shared host transport', () => {
    expect(createAssetHandler().requestBodyMode()).toBe('buffered')
  })
})
