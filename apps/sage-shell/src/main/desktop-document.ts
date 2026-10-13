import { isExactSageAppUrl, SAGE_DOCUMENT_CSP } from '../product/contracts.js'
import { renderSageDensityTokenCss, renderSageThemeTokenCss } from '../product/theme-tokens.js'
import { SAGE_DESKTOP_BUNDLE, SAGE_EXPERT_AVATARS } from './desktop-bundle.js'

export function assertDesktopBundleAvailable(): void {
  if (SAGE_DESKTOP_BUNDLE.length === 0) throw new Error('Sage desktop build is missing. Run the shell build before launch.')
}

export function serveDesktopDocument(request: Request): Response | null {
  const url = new URL(request.url)
  const headers = { 'cache-control': 'no-store', 'content-security-policy': SAGE_DOCUMENT_CSP }
  if (!isExactSageAppUrl(url)) return new Response(null, { status: 403, headers })
  if (url.pathname.startsWith('/.sage/')) return null
  if (url.pathname.startsWith('/assets/experts/') && Object.hasOwn(SAGE_EXPERT_AVATARS, url.pathname)) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response(null, { status: 405, headers: { ...headers, allow: 'GET, HEAD' } })
    }
    // Only build-sealed bytes are reachable; request paths never become filesystem paths.
    const bytes = Buffer.from(SAGE_EXPERT_AVATARS[url.pathname]!, 'base64')
    return new Response(request.method === 'HEAD' ? null : bytes, {
      headers: { ...headers, 'content-type': 'image/webp', 'content-length': String(bytes.length), 'x-content-type-options': 'nosniff' },
    })
  }
  if (url.pathname !== '/' && url.pathname !== '/index.html') return new Response(null, { status: 404, headers })
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(null, { status: 405, headers: { ...headers, allow: 'GET, HEAD' } })
  }
  if (SAGE_DESKTOP_BUNDLE.length === 0) {
    return new Response(request.method === 'HEAD' ? null : 'Sage desktop build is missing. Run the shell build before launch.', {
      status: 503,
      headers: { ...headers, 'content-type': 'text/plain; charset=utf-8' },
    })
  }
  const document = `<!doctype html>
<html lang="zh-CN" data-sage-theme-effective="unknown" data-sage-density="unknown">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Sage</title>
<style>${renderSageThemeTokenCss()}\n${renderSageDensityTokenCss()}\nbody{margin:0;background:var(--sage-canvas);color:var(--sage-ink)}</style></head>
<body><div id="sage-desktop-root"><p role="status">正在加载 Sage…</p></div><script>${SAGE_DESKTOP_BUNDLE}</script></body></html>`
  return new Response(request.method === 'HEAD' ? null : document, {
    headers: { ...headers, 'content-type': 'text/html; charset=utf-8' },
  })
}
