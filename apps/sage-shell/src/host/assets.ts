/** Serves the self-owned Sage document and no upstream client assets. */

import { isExactSageAppUrl, SAGE_DOCUMENT_CSP } from '../product/contracts.js'
import { renderSageDocument } from '../product/renderer.js'
import type { FetchHandler } from './handler.js'

/** Create the fixed, static asset surface for the first Sage product renderer. */
export function createAssetHandler(): FetchHandler {
  return {
    requestBodyMode: () => 'buffered',
    async fetch(request): Promise<Response> {
      const url = new URL(request.url)
      if (!isExactSageAppUrl(url)) return new Response(null, { status: 403 })
      if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405, headers: { allow: 'GET, HEAD' } })
      let pathname: string
      try {
        pathname = decodeURIComponent(url.pathname)
      } catch {
        return new Response(null, { status: 400 })
      }
      if (pathname.split('/').includes('..') || pathname.includes('\\')) return new Response(null, { status: 403 })
      if (pathname !== '/' && pathname !== '/index.html') return new Response(null, { status: 404 })
      return new Response(request.method === 'HEAD' ? null : renderSageDocument(), {
        headers: {
          'cache-control': 'no-store',
          'content-type': 'text/html; charset=utf-8',
          'content-security-policy': SAGE_DOCUMENT_CSP,
        },
      })
    },
  }
}
