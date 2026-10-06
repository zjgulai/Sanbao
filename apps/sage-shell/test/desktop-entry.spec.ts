import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { SAGE_DOCUMENT_CSP } from '../src/product/contracts.js'

const bundle = vi.hoisted(() => ({ script: 'window.desktopTest = true;' }))
vi.mock('../src/main/desktop-bundle.js', () => ({ get SAGE_DESKTOP_BUNDLE() { return bundle.script } }))
import { assertDesktopBundleAvailable, serveDesktopDocument } from '../src/main/desktop-document.js'

const request = (path: string, method = 'GET') => new Request(`dsh-app://app${path}`, { method })

describe('default desktop document', () => {
  it('serves the new desktop mount at both default paths with the existing security headers', async () => {
    for (const path of ['/', '/index.html']) {
      const response = serveDesktopDocument(request(path))
      expect(response?.status).toBe(200)
      expect(response?.headers.get('content-security-policy')).toBe(SAGE_DOCUMENT_CSP)
      expect(response?.headers.get('cache-control')).toBe('no-store')
      const html = await response!.text()
      expect(html).toContain('id="sage-desktop-root"')
      expect(html).toContain('<title>Sage</title>')
      expect(html).toContain('window.desktopTest = true;')
      expect(html).not.toMatch(/state-directory|review-bar|sage-matter-region|sage-sanbao:\/\//)
    }
  })

  it('never intercepts service paths or accepts alternate document origins', () => {
    expect(serveDesktopDocument(request('/.sage/state'))).toBeNull()
    expect(serveDesktopDocument(request('/unknown'))?.status).toBe(404)
    for (const url of ['https://app/index.html', 'dsh-app://app:99/index.html', 'dsh-app://app/index.html?mode=research']) {
      expect(serveDesktopDocument(new Request(url))?.status).toBe(403)
    }
  })

  it('terminates encoded document aliases before the legacy Host asset handler', async () => {
    const legacy = vi.fn(async () => new Response('old matter UI'))
    for (const path of ['/%69ndex.html', '/index%2ehtml', '/%2e%2e%2frenderer.js']) {
      const response = serveDesktopDocument(request(path)) ?? await legacy()
      expect(response.status).toBe(404)
      expect(await response.text()).not.toContain('old matter UI')
    }
    expect(legacy).not.toHaveBeenCalled()
  })

  it('refuses startup when the desktop bundle is empty and keeps the HTTP failure uncacheable', async () => {
    const previous = bundle.script
    bundle.script = ''
    try {
      expect(() => assertDesktopBundleAvailable()).toThrow('Sage desktop build is missing')
      const response = serveDesktopDocument(request('/index.html'))
      expect(response?.status).toBe(503)
      expect(response?.headers.get('cache-control')).toBe('no-store')
      expect(await response!.text()).toContain('Run the shell build')
      expect(serveDesktopDocument(request('/index.html', 'HEAD'))?.body).toBeNull()
    } finally {
      bundle.script = previous
    }
    expect(() => assertDesktopBundleAvailable()).not.toThrow()
  })

  it('handles HEAD without a body and rejects document writes', () => {
    expect(serveDesktopDocument(request('/index.html', 'HEAD'))?.body).toBeNull()
    expect(serveDesktopDocument(request('/index.html', 'POST'))?.status).toBe(405)
  })

  it('connects the document to the real main entry rather than an auxiliary window', () => {
    const entry = readFileSync(new URL('../src/main/index.ts', import.meta.url), 'utf8')
    expect(entry).toContain('serveDesktopDocument(request)')
    expect(entry).not.toContain('await launchSanbaoSurfaceFromEnv()')
    expect(entry).toContain('createSageWindow(framePolicy)')
    const bootstrap = entry.slice(entry.indexOf('async function bootstrap()'))
    const guard = bootstrap.indexOf('assertDesktopBundleAvailable()')
    const configure = bootstrap.indexOf('configureElectronPaths(paths)')
    const bundledProfile = bootstrap.indexOf('await installBundledProfileTemplate({')
    const ready = bootstrap.indexOf('await app.whenReady()')
    expect(guard).toBeGreaterThan(-1)
    expect(guard).toBeLessThan(bootstrap.indexOf('ensureSageDirectoriesSync(paths)'))
    expect(bootstrap).toContain('if (app.isPackaged)')
    expect(bundledProfile).toBeGreaterThan(configure)
    expect(bundledProfile).toBeLessThan(ready)
    expect(guard).toBeLessThan(bootstrap.indexOf('await main(paths)'))
  })
})
