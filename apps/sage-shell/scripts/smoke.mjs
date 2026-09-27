import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  HostResponseDecoder,
  SHELL_REQUEST_PIPE_FD,
  SHELL_RESPONSE_PIPE_FD,
  encodeRequestData,
  encodeRequestEnd,
  encodeRequestStart,
} from '../lib/protocol.js'
import { readActiveProfile, resolveSagePaths } from '../lib/profile/paths.js'
import { resolveHostRuntime } from '../lib/main/runtime.js'

const root = process.env.SAGE_ROOT
const paths = resolveSagePaths({
  home: homedir(),
  ...(root === undefined ? {} : { root }),
})
const activeProfile = await readActiveProfile(paths)
if (activeProfile === null) {
  process.stderr.write(`sage shell smoke: no active Sage profile at ${paths.activeProfileFile} — run pnpm run materialize\n`)
  process.exit(1)
}
const runtime = resolveHostRuntime({
  execPath: process.execPath,
  paths,
  activeProfile,
  env: process.env,
})
const profileDir = runtime.profileDir
const entry = runtime.entry
if (!existsSync(entry)) {
  process.stderr.write('sage shell smoke: no host runtime at ' + entry + ' — run pnpm run materialize\n')
  process.exit(1)
}

const failures = []
const check = (label, ok, detail) => {
  process.stdout.write((ok ? 'PASS ' : 'FAIL ') + label + (detail === undefined ? '' : ' — ' + detail) + '\n')
  if (!ok) failures.push(label)
}

const manifestPath = join(profileDir, 'package.json')
if (!existsSync(manifestPath)) {
  process.stderr.write('sage shell smoke: no profile manifest at ' + manifestPath + ' — run pnpm run materialize\n')
  process.exit(1)
}
let bundles
try {
  bundles = JSON.parse(readFileSync(manifestPath, 'utf8'))?.dsh?.profile?.bundles
} catch (error) {
  process.stderr.write('sage shell smoke: unreadable profile manifest at ' + manifestPath + ' — ' + (error instanceof Error ? error.message : String(error)) + '\n')
  process.exit(1)
}
check(
  'profile manifest retains the two pinned runtime base bundles',
  Array.isArray(bundles) && bundles.length === 2
    && bundles[0] === '@deepseek-ai/dsh-base' && bundles[1] === '@deepseek-ai/dsh-web-app',
  'bundles=' + JSON.stringify(bundles),
)

const child = spawn(runtime.node, [runtime.entry, runtime.sageRoot, runtime.profileDir], {
  cwd: runtime.profileDir,
  env: runtime.env,
  stdio: ['ignore', 'pipe', 'pipe', 'pipe', 'pipe', 'ipc'],
})

const decoder = new HostResponseDecoder()
const responses = new Map()
let streamId = 0
let stderr = ''
let readyResolve
let readyReject
const readyPromise = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject })
let exitResolve
const exited = new Promise((resolve) => { exitResolve = resolve })
let childExited = false

const failHost = (reason) => {
  readyReject(new Error(String(reason?.message ?? reason)))
  for (const state of responses.values()) {
    state.reject(new Error('request ' + state.path + ' never answered — ' + String(reason?.message ?? reason)))
  }
  responses.clear()
}

child.on('message', (message) => {
  if (message?.type === 'ready') readyResolve(message)
  else failHost(message?.type === 'fatal' ? 'host fatal: ' + message.message : 'unexpected IPC event ' + JSON.stringify(message))
})
child.on('error', failHost)
child.on('exit', (code, signal) => {
  childExited = true
  failHost('host exited (code=' + String(code) + ' signal=' + String(signal) + ')')
  exitResolve({ code, signal })
})
child.stderr.setEncoding('utf8')
child.stderr.on('data', (chunk) => { stderr += chunk })
child.stdout.pipe(process.stdout)
child.stdio[SHELL_RESPONSE_PIPE_FD].on('data', (chunk) => {
  for (const frame of decoder.push(chunk)) {
    const state = responses.get(frame.streamId)
    if (state === undefined) continue
    if (frame.type === 'start') {
      state.status = frame.status
      state.headers = frame.headers
      state.chunks = []
    } else if (frame.type === 'data') {
      state.chunks.push(frame.data)
    } else if (frame.type === 'end') {
      const bytes = Buffer.concat(state.chunks)
      state.resolve({ status: state.status, headers: state.headers, body: bytes.toString('utf8') })
    } else {
      state.reject(new Error(frame.message))
    }
  }
})

const requestPipe = child.stdio[SHELL_REQUEST_PIPE_FD]
requestPipe.on('error', failHost)
const REQUEST_TIMEOUT_MS = 60_000
const send = (path, { method = 'GET', headers = [], body } = {}) => {
  const id = ++streamId
  const bytes = body === undefined ? null : Buffer.from(body, 'utf8')
  const pending = new Promise((resolve, reject) => {
    const state = {
      path,
      chunks: [],
      resolve: (value) => { clearTimeout(state.timer); responses.delete(id); resolve(value) },
      reject: (error) => { clearTimeout(state.timer); responses.delete(id); reject(error) },
    }
    responses.set(id, state)
    state.timer = setTimeout(() => {
      state.reject(new Error('request ' + path + ' timed out after ' + String(REQUEST_TIMEOUT_MS) + 'ms'))
    }, REQUEST_TIMEOUT_MS)
  })
  requestPipe.write(encodeRequestStart(id, {
    url: 'dsh-app://app' + path,
    method,
    headers,
    hasBody: bytes !== null,
  }))
  if (bytes !== null) {
    requestPipe.write(encodeRequestData(id, bytes))
    requestPipe.write(encodeRequestEnd(id))
  }
  return pending
}

let phase = 'host became ready'
try {
  const info = await Promise.race([
    readyPromise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('host not ready in 120s: ' + stderr.trim())), 120_000).unref()
    }),
  ])
  check('host reports ready at protocol v3', info.protocolVersion === 3, 'dshVersion=' + info.dshVersion)
  check('host resolved an installed dsh version', /^\d+\.\d+\.\d+/u.test(info.dshVersion), info.dshVersion)

  phase = 'host served the Sage product surface'
  const index = await send('/index.html')
  check(
    'GET /index.html is the Sage document',
    index.status === 200
      && index.headers.some(([name, value]) => name === 'content-type' && value.startsWith('text/html'))
      && index.body.includes('<title>Sage</title>'),
    'status=' + index.status,
  )

  const state = await send('/.sage/state')
  let stateBody
  try { stateBody = JSON.parse(state.body) } catch { stateBody = null }
  check(
    'GET /.sage/state returns the typed availability projection',
    state.status === 200 && ['ready', 'unavailable', 'recovering'].includes(stateBody?.status),
    'status=' + state.status + ' body=' + state.body,
  )

  const retry = await send('/.sage/actions', {
    method: 'POST',
    headers: [['content-type', 'application/json']],
    body: JSON.stringify({ type: 'retry' }),
  })
  let retryBody
  try { retryBody = JSON.parse(retry.body) } catch { retryBody = null }
  check(
    'POST /.sage/actions accepts only the retry action',
    retry.status === 202 && retryBody?.status === 'recovering',
    'status=' + retry.status + ' body=' + retry.body,
  )

  const invalid = await send('/.sage/actions', {
    method: 'POST',
    headers: [['content-type', 'application/json']],
    body: JSON.stringify({ type: 'anything-else' }),
  })
  check('unknown Sage actions are rejected', invalid.status === 400, 'status=' + invalid.status)

  for (const path of ['/api', '/api/session/list', '/plugins/anything', '/.dsh/remote-stream', '/.sanbao/session-directory']) {
    const response = await send(path)
    check(path + ' is not exposed to the renderer', response.status === 404, 'status=' + response.status)
  }

  const traversal = await send('/%2e%2e%2fpackage.json')
  check('path traversal is rejected with 403', traversal.status === 403, 'status=' + traversal.status)
} catch (error) {
  check(phase, false, error instanceof Error ? error.message : String(error))
}

const exitedBeforeShutdown = childExited
if (child.connected) child.send({ type: 'shutdown' })
requestPipe.destroy()
let killTimer
const { code: exitCode } = await Promise.race([
  exited,
  new Promise((resolve) => {
    killTimer = setTimeout(() => { child.kill('SIGKILL'); resolve({ code: null }) }, 10_000)
  }),
])
clearTimeout(killTimer)
check(
  'shutdown IPC exits the host cleanly',
  !exitedBeforeShutdown && exitCode === 0,
  exitedBeforeShutdown ? 'host exited (code=' + String(exitCode) + ') before shutdown IPC' : 'code=' + String(exitCode),
)

if (failures.length > 0) {
  process.stderr.write('sage shell smoke: ' + failures.length + ' failure(s): ' + failures.join(', ') + '\n' + stderr + '\n')
  process.exit(1)
}
process.stdout.write('sage shell smoke: PASS\n')
