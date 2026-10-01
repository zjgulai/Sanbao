/** Pure route skeleton for the main-owned /.sage/* surface (spec §3.1). */
import type { ServiceDeps } from './contracts.js'
import { MAX_SAGE_ACTION_BYTES, serviceJson } from './errors.js'

const SAGE_STATE_PATH = '/.sage/state'
const SAGE_ACTIONS_PATH = '/.sage/actions'

export async function handleSageServiceRequest(request: Request, deps: ServiceDeps): Promise<Response> {
  if (deps.callerBinding === null) return new Response(null, { status: 403 })

  const url = new URL(request.url)
  if (url.pathname === SAGE_STATE_PATH) {
    if (request.method !== 'GET') return new Response(null, { status: 405, headers: { allow: 'GET' } })
    return deps.providers.readState()
  }

  if (url.pathname === SAGE_ACTIONS_PATH) {
    if (request.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } })
    const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
    if (contentType !== 'application/json') return new Response(null, { status: 415 })
    const declaredLength = request.headers.get('content-length')
    if (declaredLength !== null && (!/^\d+$/u.test(declaredLength) || Number(declaredLength) > MAX_SAGE_ACTION_BYTES)) {
      return new Response(null, { status: 413 })
    }
    const body = await readActionBodyWithinLimit(request)
    if (body === undefined) return new Response(null, { status: 413 })
    if (parseIntent(body) === undefined) return serviceJson({ error: 'invalid-intent', retryable: false }, 400)
    return deps.providers.dispatch()
  }

  return new Response(null, { status: 404 })
}

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

function parseIntent(body: string): { type: 'retry' } | undefined {
  let value: unknown
  try { value = JSON.parse(body) } catch { return undefined }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  if (Object.keys(record).length !== 1 || record.type !== 'retry') return undefined
  return { type: 'retry' }
}
