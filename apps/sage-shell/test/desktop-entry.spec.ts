import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { SAGE_DOCUMENT_CSP } from '../src/product/contracts.js'

const bundle = vi.hoisted(() => ({ script: 'window.desktopTest = true;', avatars: {} as Record<string, string> }))
vi.mock('../src/main/desktop-bundle.js', () => ({
  get SAGE_DESKTOP_BUNDLE() { return bundle.script },
  get SAGE_EXPERT_AVATARS() { return bundle.avatars },
}))
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

  it('serves exactly the 53 bundled expert avatars under the unchanged CSP', async () => {
    const { loadExpertRendererAssets } = await import('../../../scripts/experts/renderer-assets.mjs')
    const { avatarAssets } = loadExpertRendererAssets()
    bundle.avatars = avatarAssets
    try {
      expect(Object.keys(avatarAssets)).toHaveLength(53)
      for (const [path, base64] of Object.entries(avatarAssets) as Array<[string, string]>) {
        const response = serveDesktopDocument(request(path))!
        expect(response.status, path).toBe(200)
        expect(response.headers.get('content-type')).toBe('image/webp')
        expect(response.headers.get('content-security-policy')).toBe(SAGE_DOCUMENT_CSP)
        expect(Buffer.from(await response.arrayBuffer())).toEqual(Buffer.from(base64, 'base64'))
        const head = serveDesktopDocument(request(path, 'HEAD'))!
        expect(head.status).toBe(200)
        expect(head.body).toBeNull()
        expect(Number(head.headers.get('content-length'))).toBe(Buffer.from(base64, 'base64').length)
        expect(serveDesktopDocument(request(path, 'POST'))?.status).toBe(405)
      }
      for (const path of [
        '/assets/experts/avatars/agt-999/light/list-64.webp',
        '/assets/experts/avatars/agt-001/dark/list-64.webp',
        '/assets/experts/avatars/agt-001/light/detail-256.webp',
        '/assets/experts/avatars/%61gt-001/light/list-64.webp',
        '/assets/experts/avatars/agt-001%2flight/list-64.webp',
        '/assets/experts/avatars/..%2fexpert-registry.json',
        '/assets/experts/avatars/AGT-001/light/list-64.webp',
        '/assets/experts/avatars/agt-001/light/list-64.webp/',
        '/assets/experts/toString',
      ]) expect(serveDesktopDocument(request(path))?.status, path).toBe(404)
      expect(serveDesktopDocument(request('/assets/experts/avatars/agt-001/light/list-64.webp?raw=1'))?.status).toBe(403)
      expect(serveDesktopDocument(request('/.sage/experts'))).toBeNull()
    } finally {
      bundle.avatars = {}
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
    // ADR-0335 ordering: the reconciler runs after Electron is configured (its awaits must not
    // reopen the pre-configure window where Chromium's default userData IS the Sage root) and
    // before both the pristine admission and the install.
    const reconcile = bootstrap.indexOf('await reconcileProfileState({')
    const admission = bootstrap.indexOf('assertBundledProfileAdmissibleSync(paths)')
    expect(reconcile).toBeGreaterThan(configure)
    expect(admission).toBeGreaterThan(reconcile)
    expect(reconcile).toBeLessThan(bundledProfile)
  })
})
