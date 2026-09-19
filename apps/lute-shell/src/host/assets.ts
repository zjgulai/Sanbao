/** Serves the prebuilt harness SPA and injects the shell-owned page transport. */

import { createRequire } from 'node:module'
import { realpathSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, extname, join, normalize, resolve, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
// Type-only: loads the module augmentation that declares ctx.clientModules on cordis Context.
import type {} from '@deepseek-ai/dsh-client-modules'
import { renderIndexInjections, type IndexInjection } from '@deepseek-ai/dsh-host-webserver'
import type { FetchHandler } from './handler.js'

/** Endpoint the page transport POSTs to for gateway streaming. */
export const REMOTE_STREAM_PATH = '/.dsh/remote-stream'

/**
 * Page transport adopted by the client bundles. `ownsHost: true` is what makes the client
 * treat this origin as loopback (dsh-client-connection client/index.ts:227).
 */
export const SHELL_TRANSPORT_SCRIPT = `globalThis.__DSH_TRANSPORT__={
  ownsHost:true,
  async *openStream(endpoint,payload,signal){
    const response=await fetch(${JSON.stringify(REMOTE_STREAM_PATH)},{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({endpoint,payload}),signal
    })
    if(!response.ok||response.body===null)throw new Error('lute shell: stream transport failed: HTTP '+response.status)
    const reader=response.body.getReader(),decoder=new TextDecoder()
    let pending=''
    for(;;){
      const {done,value}=await reader.read()
      pending+=decoder.decode(value,{stream:!done})
      let newline
      while((newline=pending.indexOf('\\n'))!==-1){
        const line=pending.slice(0,newline);pending=pending.slice(newline+1)
        if(line!=='')yield JSON.parse(line)
      }
      if(done)break
    }
    if(pending!=='')yield JSON.parse(pending)
  }
}`

const MIME: Readonly<Record<string, string>> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
}

/**
 * Resolve the installed SPA dist root from one materialized profile.
 * @param profileDir - profile whose node_modules carries the frontend package.
 * @returns realpath of the directory holding index.html.
 */
export function resolveFrontendDistRoot(profileDir: string): string {
  const require = createRequire(join(profileDir, 'package.json'))
  let distIndex: string
  try {
    distIndex = require.resolve('@deepseek-ai/dsh-web-frontend/dist/index.html')
  } catch {
    throw new Error(`lute shell: profile ${profileDir} has no installed @deepseek-ai/dsh-web-frontend`)
  }
  return realpathSync(dirname(distIndex))
}

/**
 * Serve SPA assets and client plugin bundles for one host context.
 * @param ctx - booted host context supplying clientModules and index-inject events.
 * @param distRoot - realpath of the frontend dist directory.
 * @returns handler for every request that is not an API or stream call.
 */
export function createAssetHandler(ctx: Context, distRoot: string): FetchHandler {
  const renderIndex = async (): Promise<Response> => {
    const rows: IndexInjection[] = [{ kind: 'script', placement: 'head', text: SHELL_TRANSPORT_SCRIPT }]
    ctx.emit('webserver/index-inject', rows)
    const body = renderIndexInjections(await readFile(join(distRoot, 'index.html'), 'utf8'), rows)
    return new Response(body, { headers: { 'content-type': MIME['.html'] ?? 'text/html; charset=utf-8' } })
  }
  return {
    requestBodyMode: () => 'buffered',
    async fetch(request): Promise<Response> {
      if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405 })
      const url = new URL(request.url)
      if (url.pathname.startsWith('/plugins/')) return ctx.clientModules.fetchBundle(request)
      let pathname: string
      try {
        pathname = decodeURIComponent(url.pathname)
      } catch {
        return new Response(null, { status: 400 })
      }
      if (pathname === '/' || pathname === '/index.html') return renderIndex()
      const target = resolve(normalize(join(distRoot, pathname)))
      // %2f is never a URL path separator, so %2e%2e%2f survives parsing on every scheme — decodeURIComponent above creates a real ../ escape.
      if (target !== distRoot && !target.startsWith(distRoot + sep)) return new Response(null, { status: 403 })
      try {
        const realTarget = realpathSync(target)
        if (realTarget !== distRoot && !realTarget.startsWith(distRoot + sep)) return new Response(null, { status: 403 })
        return new Response(request.method === 'HEAD' ? null : await readFile(realTarget), {
          headers: { 'content-type': MIME[extname(realTarget)] ?? 'application/octet-stream' },
        })
      } catch {
        return renderIndex()
      }
    },
  }
}
