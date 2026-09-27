/** Typed, origin-fenced host routes for the Sage product surface. */

import type { SageCapabilityAdapter } from './contracts.js'
import {
  SAGE_ACTIONS_PATH,
  SAGE_APP_ORIGIN,
  SAGE_STATE_PATH,
  isExactSageAppUrl,
  type SageActionIntent,
  type SageViewState,
} from '../product/contracts.js'
import type { FetchHandler } from '../host/handler.js'

/** Guard against an accidental large payload on the only P0-2 action route. */
export const MAX_SAGE_ACTION_BYTES = 4 * 1024

function json(value: SageViewState | { readonly error: string }, status = 200): Response {
  return Response.json(value, {
    status,
    headers: { 'cache-control': 'no-store' },
  })
}

function isTrustedSageRequest(url: URL, request: Request): boolean {
  const origin = request.headers.get('origin')
  return isExactSageAppUrl(url) && (origin === null || origin === SAGE_APP_ORIGIN)
}

/**
 * Read only the accepted bytes. The host transport is streaming, so request.text() would otherwise
 * buffer an unbounded chunked upload before the 4 KiB action limit can be checked.
 */
async function readActionBodyWithinLimit(request: Request): Promise<string | undefined> {
  if (request.body === null) return ''
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0
  try {
    for (;;) {
      const next = await reader.read()
      if (next.done) break
      bytes += next.value.byteLength
      if (bytes > MAX_SAGE_ACTION_BYTES) return undefined
      chunks.push(next.value)
    }
  } finally {
    reader.releaseLock()
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), bytes).toString('utf8')
}

function parseRetryIntent(body: string): SageActionIntent | undefined {
  let value: unknown
  try {
    value = JSON.parse(body)
  } catch {
    return undefined
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  if (Object.keys(record).length !== 1 || record.type !== 'retry') return undefined
  return { type: 'retry' }
}

/**
 * Expose the fixed P0-2 contract. It owns no Context and therefore cannot leak raw host access
 * back to the renderer.
 */
export function createSageCapabilityHandler(adapter: SageCapabilityAdapter): FetchHandler {
  return {
    requestBodyMode: () => 'buffered',
    async fetch(request): Promise<Response> {
      const url = new URL(request.url)
      if (!isTrustedSageRequest(url, request)) return new Response(null, { status: 403 })

      if (url.pathname === SAGE_STATE_PATH) {
        if (request.method !== 'GET') return new Response(null, { status: 405, headers: { allow: 'GET' } })
        return json(adapter.readState())
      }

      if (url.pathname !== SAGE_ACTIONS_PATH) return new Response(null, { status: 404 })
      if (request.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } })
      const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
      if (contentType !== 'application/json') return new Response(null, { status: 415 })
      const declaredLength = request.headers.get('content-length')
      if (declaredLength !== null && (!/^\d+$/u.test(declaredLength) || Number(declaredLength) > MAX_SAGE_ACTION_BYTES)) {
        return new Response(null, { status: 413 })
      }
      const body = await readActionBodyWithinLimit(request)
      if (body === undefined) return new Response(null, { status: 413 })
      if (parseRetryIntent(body) === undefined) return json({ error: 'unsupported Sage action' }, 400)

      try {
        return json(adapter.retry(), 202)
      } catch {
        return json({ error: 'Sage action is unavailable' }, 503)
      }
    },
  }
}
