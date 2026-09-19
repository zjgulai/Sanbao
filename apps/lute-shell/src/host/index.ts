/** Plain-Node child process: boots the profile and carries API plus SPA assets over framed pipes. */

import { createRequire } from 'node:module'
import { closeSync, createReadStream, createWriteStream, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { once } from 'node:events'
import { join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import { boot, loadLayeredEnv } from '@deepseek-ai/dsh-app-boot'
import { provideCmdline } from '@deepseek-ai/dsh-cmdline'
import { DSH_LAUNCH_ENVIRONMENT_KEY } from '@deepseek-ai/dsh-launch-environment'
import type {} from '@deepseek-ai/dsh-api-gateway'
import type {} from '@deepseek-ai/dsh-client-modules'
// Type-only: loads the module augmentation that declares ctx.get('connection') as HostConnectionHandle.
import type {} from '@deepseek-ai/dsh-client-connection'
import {
  HostRequestDecoder,
  SHELL_HOST_PROTOCOL_VERSION,
  SHELL_PIPE_CHUNK_BYTES,
  SHELL_REQUEST_PIPE_FD,
  SHELL_RESPONSE_PIPE_FD,
  encodeResponseData,
  encodeResponseEnd,
  encodeResponseError,
  encodeResponseStart,
  isHostCommand,
  type HostEvent,
  type HostRequestFrame,
} from '../protocol.js'
import { ROOT_CONFIG_CONTENT, SHELL_LABEL, composeShellPatches, rootConfigPath } from './composition.js'
import { REMOTE_STREAM_PATH, createAssetHandler, resolveFrontendDistRoot } from './assets.js'
import { createRemoteStreamHandler } from './streams.js'
import type { FetchHandler } from './handler.js'

/** One request forwarded from the shell's `dsh-app://` handler. */
export interface HostFetchCommand {
  readonly streamId: number
  readonly request: {
    readonly url: string
    readonly method: string
    readonly headers: readonly [string, string][]
  }
}

/** Controller returned to tests and to the self-executing process entry. */
export interface HostController {
  /** Installed dsh version carried by this host. */
  readonly dshVersion: string
  /** Dispatch one custom-protocol request and stream its response to the response pipe. */
  fetch(command: HostFetchCommand, body: ReadableStream<Uint8Array> | null): Promise<void>
  /** Abort one in-flight request. */
  cancel(streamId: number): void
  /** Stop accepting messages and await complete host teardown. */
  dispose(): Promise<void>
}

interface NodeRequestInit extends RequestInit {
  readonly duplex?: 'half'
}

type RouteTarget = 'stream' | 'api' | 'assets'

/** Which handler owns one request pathname. */
export function routeRequest(pathname: string): RouteTarget {
  if (pathname === REMOTE_STREAM_PATH) return 'stream'
  if (pathname.startsWith('/api/')) return 'api'
  return 'assets'
}

function isInside(root: string, target: string): boolean {
  const resolved = realpathSync(target)
  return resolved === root || resolved.startsWith(root + sep)
}

function readDshVersion(profileDir: string): string {
  const require = createRequire(join(profileDir, 'package.json'))
  const manifest = JSON.parse(readFileSync(require.resolve('@deepseek-ai/dsh/package.json'), 'utf8')) as { version?: unknown }
  if (typeof manifest.version !== 'string') throw new Error('lute shell: installed dsh manifest has no version')
  return manifest.version
}

/**
 * Boot one materialized profile.
 * @param input - profile directory, shell overlay path, and drain-aware response writer.
 * @returns controller after every host and client-manifest row is active.
 */
export async function runShellHost(input: {
  profileDir: string
  overlayPatchPath: string
  writeResponse: (frame: Buffer) => Promise<void>
}): Promise<HostController> {
  const { writeResponse } = input
  // profileDir arrives over a process boundary; composeShellPatches needs an absolute path.
  const profileDir = resolve(input.profileDir)
  mkdirSync(profileDir, { recursive: true })
  const profileRoot = realpathSync(profileDir)
  const rootConfig = rootConfigPath(profileDir)
  writeFileSync(rootConfig, ROOT_CONFIG_CONTENT)
  const composition = composeShellPatches({
    profileDir,
    overlayPatchPath: input.overlayPatchPath,
  })
  for (const [index, layerDir] of composition.layerDirs.entries()) {
    if (!isInside(profileRoot, layerDir)) {
      throw new Error(`lute shell: profile bundle ${JSON.stringify(composition.layerNames[index])} resolved outside the profile`)
    }
  }
  const environment = loadLayeredEnv(SHELL_LABEL)
  let current: Context | undefined
  const ctx = await boot(SHELL_LABEL, rootConfig, composition.patches, (hostCtx) => {
    current = hostCtx
    hostCtx.provide(DSH_LAUNCH_ENVIRONMENT_KEY, environment)
    provideCmdline(hostCtx, { args: [], exit: () => {} })
  })
  current = ctx
  const connection = ctx.get('connection')
  const clientModules = ctx.get('clientModules')
  const gateway = ctx.get('typertGateway')
  if (connection === undefined || clientModules === undefined || gateway === undefined) {
    await ctx.fiber.dispose()
    throw new Error('lute shell: composition did not provide connection, typertGateway, and clientModules')
  }
  const api = connection.createSharedFetchHandler('/api')
  const handlers: Record<RouteTarget, FetchHandler> = {
    api: { requestBodyMode: () => 'buffered', fetch: (request) => api.fetch(request) },
    assets: createAssetHandler(ctx, resolveFrontendDistRoot(profileDir)),
    stream: createRemoteStreamHandler(ctx),
  }
  const requests = new Map<number, AbortController>()
  let disposing: Promise<void> | undefined

  const dispose = async (): Promise<void> => {
    disposing ??= (async () => {
      for (const controller of requests.values()) controller.abort()
      requests.clear()
      await current?.fiber.dispose()
      current = undefined
    })()
    await disposing
  }

  return {
    dshVersion: readDshVersion(profileDir),
    cancel(streamId) {
      requests.get(streamId)?.abort()
    },
    async fetch(command, body) {
      if (disposing !== undefined) throw new Error('lute shell: host is disposing')
      const controller = new AbortController()
      requests.set(command.streamId, controller)
      try {
        const url = new URL(command.request.url)
        const init: NodeRequestInit = {
          method: command.request.method,
          headers: new Headers(command.request.headers.map(([name, value]) => [name, value] as [string, string])),
          ...(body === null ? {} : { body, duplex: 'half' }),
          signal: controller.signal,
        }
        const response = await handlers[routeRequest(url.pathname)].fetch(new Request(url, init))
        await writeResponse(encodeResponseStart(command.streamId, {
          status: response.status,
          headers: [...response.headers.entries()],
          hasBody: response.body !== null,
        }))
        if (response.body !== null) {
          for await (const chunk of response.body) {
            const bytes = Buffer.from(chunk)
            for (let offset = 0; offset < bytes.byteLength; offset += SHELL_PIPE_CHUNK_BYTES) {
              await writeResponse(encodeResponseData(
                command.streamId,
                bytes.subarray(offset, offset + SHELL_PIPE_CHUNK_BYTES),
              ))
            }
          }
        }
        await writeResponse(encodeResponseEnd(command.streamId))
      } catch (error) {
        if (!controller.signal.aborted) {
          await writeResponse(encodeResponseError(
            command.streamId,
            error instanceof Error ? error.message : String(error),
          ))
        }
      } finally {
        requests.delete(command.streamId)
      }
    },
    dispose,
  }
}

/**
 * Run the pipe/IPC lifecycle around one booted profile until shutdown.
 * @param argv - full process argv; `argv[2]` is the materialized profile directory.
 */
export async function startHostProcess(argv: readonly string[]): Promise<void> {
  const profileDir = argv[2]
  if (profileDir === undefined || process.send === undefined) {
    throw new Error('lute shell: expected project directory, byte pipes, and a Node IPC channel')
  }
  if (argv[3] !== undefined) {
    throw new Error(`lute shell: unsupported host argument ${JSON.stringify(argv[3])}`)
  }
  // The materializer places this bundle at <profile>/lute-host/host/index.js beside the overlay.
  const overlayPatchPath = fileURLToPath(new URL('../shell.cordis.patch.yml', import.meta.url))
  const requestPipe = createReadStream('', { fd: SHELL_REQUEST_PIPE_FD, autoClose: false })
  const responsePipe = createWriteStream('', { fd: SHELL_RESPONSE_PIPE_FD, autoClose: false })
  let responseWriteTail: Promise<void> = Promise.resolve()
  const writeResponse = (frame: Buffer): Promise<void> => {
    const write = responseWriteTail.then(async () => {
      if (responsePipe.destroyed) throw new Error('lute shell: Electron response pipe is unavailable')
      if (!responsePipe.write(frame)) await once(responsePipe, 'drain')
    })
    responseWriteTail = write.catch(() => undefined)
    return write
  }
  const send = (event: HostEvent): void => {
    if (process.send === undefined || !process.connected) return
    try {
      process.send(event)
    } catch (error) {
      // A concurrent parent disconnect owns teardown; only that closed-channel
      // condition is safe to discard while streamed responses unwind.
      if ((error as NodeJS.ErrnoException).code !== 'ERR_IPC_CHANNEL_CLOSED') throw error
    }
  }
  const controller = await runShellHost({ profileDir, overlayPatchPath, writeResponse })
  send({
    type: 'ready',
    protocolVersion: SHELL_HOST_PROTOCOL_VERSION,
    dshVersion: controller.dshVersion,
  })
  const decoder = new HostRequestDecoder()
  const requestBodies = new Map<number, ReadableStreamDefaultController<Uint8Array>>()
  const blockedRequests = new Set<number>()
  const discardedRequestBodies = new Set<number>()
  const runs = new Set<Promise<void>>()
  let lastStreamId = 0
  let requestedExitCode = 0
  let stopping: Promise<void> | undefined

  const resumeRequestPipe = (): void => {
    if (blockedRequests.size === 0) requestPipe.resume()
  }

  const stop = (exitCode = 0): Promise<void> => {
    requestedExitCode = Math.max(requestedExitCode, exitCode)
    stopping ??= (async () => {
      requestPipe.pause()
      requestPipe.removeAllListeners('data')
      const stopped = new Error('lute shell: Host is stopping')
      for (const body of requestBodies.values()) body.error(stopped)
      requestBodies.clear()
      blockedRequests.clear()
      discardedRequestBodies.clear()
      requestPipe.destroy()
      closeSync(SHELL_REQUEST_PIPE_FD)
      await controller.dispose()
      await Promise.allSettled([...runs])
      await responseWriteTail.catch(() => undefined)
      if (!responsePipe.destroyed) {
        await new Promise<void>((resolvePromise) => { responsePipe.end(resolvePromise) })
        responsePipe.destroy()
      }
      closeSync(SHELL_RESPONSE_PIPE_FD)
      if (process.connected) process.disconnect()
      process.exitCode = requestedExitCode
    })()
    return stopping
  }

  const failTransport = (error: unknown): void => {
    const message = error instanceof Error ? error.message : String(error)
    send({ type: 'fatal', message })
    void stop(1)
  }

  const beginRequest = (frame: Extract<HostRequestFrame, { type: 'start' }>): void => {
    if (frame.streamId <= lastStreamId) {
      throw new Error(`lute shell: Electron reused or reordered request stream ${String(frame.streamId)}`)
    }
    lastStreamId = frame.streamId
    let body: ReadableStream<Uint8Array> | null = null
    if (frame.hasBody) {
      body = new ReadableStream<Uint8Array>({
        start(controllerOfBody) {
          requestBodies.set(frame.streamId, controllerOfBody)
        },
        pull() {
          blockedRequests.delete(frame.streamId)
          resumeRequestPipe()
        },
        cancel() {
          requestBodies.delete(frame.streamId)
          blockedRequests.delete(frame.streamId)
          controller.cancel(frame.streamId)
          resumeRequestPipe()
        },
      })
    }
    const run = controller.fetch({
      streamId: frame.streamId,
      request: {
        url: frame.url,
        method: frame.method,
        headers: frame.headers,
      },
    }, body)
    runs.add(run)
    void run.catch(failTransport).finally(() => {
      runs.delete(run)
      const openBody = requestBodies.get(frame.streamId)
      if (openBody === undefined) return
      openBody.error(new Error('lute shell: response completed before the request body ended'))
      requestBodies.delete(frame.streamId)
      blockedRequests.delete(frame.streamId)
      discardedRequestBodies.add(frame.streamId)
      resumeRequestPipe()
    })
  }

  const handleRequestFrame = (frame: HostRequestFrame): void => {
    switch (frame.type) {
      case 'start':
        beginRequest(frame)
        return
      case 'data': {
        const body = requestBodies.get(frame.streamId)
        if (body === undefined) {
          if (discardedRequestBodies.has(frame.streamId)) return
          throw new Error(`lute shell: Electron sent body data for inactive stream ${String(frame.streamId)}`)
        }
        body.enqueue(frame.data)
        if ((body.desiredSize ?? 0) <= 0) {
          blockedRequests.add(frame.streamId)
          requestPipe.pause()
        }
        return
      }
      case 'end': {
        const body = requestBodies.get(frame.streamId)
        if (body === undefined) {
          if (discardedRequestBodies.delete(frame.streamId)) return
          throw new Error(`lute shell: Electron ended inactive body stream ${String(frame.streamId)}`)
        }
        body.close()
        requestBodies.delete(frame.streamId)
        blockedRequests.delete(frame.streamId)
        resumeRequestPipe()
        return
      }
      case 'cancel': {
        if (frame.streamId > lastStreamId) {
          throw new Error(`lute shell: Electron canceled unknown stream ${String(frame.streamId)}`)
        }
        const body = requestBodies.get(frame.streamId)
        body?.error(new Error('lute shell: Electron canceled the request'))
        requestBodies.delete(frame.streamId)
        blockedRequests.delete(frame.streamId)
        discardedRequestBodies.delete(frame.streamId)
        controller.cancel(frame.streamId)
        resumeRequestPipe()
        return
      }
      default:
        frame satisfies never
    }
  }

  requestPipe.on('data', (chunk: string | Buffer) => {
    try {
      for (const frame of decoder.push(Buffer.from(chunk))) handleRequestFrame(frame)
    } catch (error) {
      failTransport(error)
    }
  })
  requestPipe.once('end', () => {
    if (stopping !== undefined) return
    try {
      decoder.finish()
      failTransport(new Error('lute shell: Electron request pipe ended'))
    } catch (error) {
      failTransport(error)
    }
  })
  requestPipe.once('error', failTransport)
  responsePipe.once('error', failTransport)
  process.on('message', (message: unknown) => {
    if (!isHostCommand(message)) {
      send({ type: 'fatal', message: 'lute shell: invalid Electron IPC command' })
      void stop(1)
      return
    }
    void stop()
  })
  process.once('disconnect', () => { void stop() })
  process.once('SIGTERM', () => { void stop() })
  process.once('SIGINT', () => { void stop() })
}

const entryPath = process.argv[1]
const isEntry = entryPath !== undefined && realpathSync(entryPath) === realpathSync(fileURLToPath(import.meta.url))
if (isEntry) {
  startHostProcess(process.argv).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    if (process.send !== undefined) process.send({ type: 'fatal', message } satisfies HostEvent)
    else process.stderr.write(`lute shell: ${message}\n`)
    process.exitCode = 1
  })
}
