import { spawn } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  HostResponseDecoder,
  SHELL_REQUEST_PIPE_FD,
  SHELL_RESPONSE_PIPE_FD,
  encodeRequestStart,
} from '../lib/protocol.js'
import { defaultProfileDir, hostEntryPath } from '../lib/profile/layout.js'

const profileDir = process.env.LUTE_SHELL_PROFILE ?? defaultProfileDir(homedir())
const entry = hostEntryPath(profileDir)
if (!existsSync(entry)) {
  process.stderr.write(`lute shell smoke: no host runtime at ${entry} — run pnpm run materialize\n`)
  process.exit(1)
}

const failures = []
const check = (label, ok, detail) => {
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'} ${label}${detail === undefined ? '' : ` — ${detail}`}\n`)
  if (!ok) failures.push(label)
}

// 本 check 只佐证 manifest 的 dsh.profile.bundles；LUTE 插件层的实际挂载点是 profile 的 cordis.patch.yml（P1 用户层为 []，P2 起在此声明）与 lute-host/shell.cordis.patch.yml，不在本谓词射程。
const manifestPath = join(profileDir, 'package.json')
if (!existsSync(manifestPath)) {
  process.stderr.write(`lute shell smoke: no profile manifest at ${manifestPath} — run pnpm run materialize\n`)
  process.exit(1)
}
let bundles
try {
  bundles = JSON.parse(readFileSync(manifestPath, 'utf8'))?.dsh?.profile?.bundles
} catch (error) {
  process.stderr.write(`lute shell smoke: unreadable profile manifest at ${manifestPath} — ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
}
check(
  'profile manifest pins exactly the two upstream bundles',
  Array.isArray(bundles) && bundles.length === 2
    && bundles[0] === '@deepseek-ai/dsh-base' && bundles[1] === '@deepseek-ai/dsh-web-app',
  `bundles=${JSON.stringify(bundles)}`,
)

const child = spawn(process.execPath, [entry, profileDir], {
  cwd: profileDir,
  env: { ...process.env, DSH_HOME: process.env.DSH_HOME ?? `${homedir()}/.dsh` },
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
    state.reject(new Error(`request ${state.path} never answered — ${String(reason?.message ?? reason)}`))
  }
  responses.clear()
}

child.on('message', (message) => {
  if (message?.type === 'ready') readyResolve(message)
  else failHost(message?.type === 'fatal' ? `host fatal: ${message.message}` : `unexpected IPC event ${JSON.stringify(message)}`)
})
child.on('error', failHost)
child.on('exit', (code, signal) => {
  childExited = true
  failHost(`host exited (code=${String(code)} signal=${String(signal)})`)
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
      state.resolve({
        status: state.status,
        headers: state.headers,
        bytes,
        body: bytes.toString('utf8'),
      })
    } else {
      state.reject(new Error(frame.message))
    }
  }
})

const requestPipe = child.stdio[SHELL_REQUEST_PIPE_FD]
requestPipe.on('error', failHost)
// 60s 每请求上限：冷启动开销全在 120s ready 预算内，请求只发生在已 boot 宿主上、命中本地磁盘，误报不可能；超上限必是挂死。
const REQUEST_TIMEOUT_MS = 60_000
const send = (path) => {
  const id = ++streamId
  const pending = new Promise((resolve, reject) => {
    const state = {
      path,
      chunks: [],
      resolve: (value) => { clearTimeout(state.timer); responses.delete(id); resolve(value) },
      reject: (error) => { clearTimeout(state.timer); responses.delete(id); reject(error) },
    }
    responses.set(id, state)
    state.timer = setTimeout(() => {
      state.reject(new Error(`request ${path} timed out after ${String(REQUEST_TIMEOUT_MS)}ms`))
    }, REQUEST_TIMEOUT_MS)
  })
  requestPipe.write(encodeRequestStart(id, {
    url: `dsh-app://app${path}`,
    method: 'GET',
    headers: [['accept', '*/*']],
    hasBody: false,
  }))
  // hasBody:false 的请求绝不发 end 帧——end 只用来结束请求体，多发宿主按 inactive body stream 走 fatal 拆机（vendor/dsh-desktop/deepseek-harness/apps/desktop/src/host-process.ts:229、vendor/dsh-desktop/deepseek-harness/apps/desktop-host/src/index.ts:523）。
  return pending
}

let phase = 'host became ready'
try {
  const info = await Promise.race([
    readyPromise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`host not ready in 120s: ${stderr.trim()}`)), 120_000).unref()
    }),
  ])
  check('host reports ready at protocol v3', info.protocolVersion === 3, `dshVersion=${info.dshVersion}`)
  check('host resolved an installed dsh version', /^\d+\.\d+\.\d+/u.test(info.dshVersion), info.dshVersion)

  phase = 'host survived every request'
  const index = await send('/index.html')
  check(
    'GET /index.html is 200 html',
    index.status === 200 && index.headers.some(([name, value]) => name === 'content-type' && value.startsWith('text/html')),
    `status=${index.status}`,
  )
  check('index.html carries the injected page transport', index.body.includes('globalThis.__DSH_TRANSPORT__'))
  check('injected transport declares ownsHost', index.body.includes('ownsHost:true'))

  const fallback = await send('/no-such-route')
  check('unknown SPA route falls back to index.html', fallback.status === 200 && fallback.body.includes('__DSH_TRANSPORT__'))

  const traversal = await send('/%2e%2e%2fpackage.json')
  check('path traversal is rejected with 403', traversal.status === 403, `status=${traversal.status}`)

  // 真实二进制资产：字体加载失败也返回 200，所以只断言状态码等于没断言。
  // 挑 dist/assets 里最大的文件，让响应体跨过 64 KiB 帧分片边界——分片前提写进谓词，
  // 前提失效即 FAIL；逐字节比对才能证明分片重组没丢没错序。
  const distAssets = join(profileDir, 'node_modules', '@deepseek-ai', 'dsh-web-frontend', 'dist', 'assets')
  const largest = readdirSync(distAssets)
    .map(name => ({ name, size: statSync(join(distAssets, name)).size }))
    .filter(entry => entry.size > 0)
    .sort((left, right) => right.size - left.size)[0]
  if (largest === undefined) {
    check('dist/assets holds a binary asset to verify', false, 'directory empty or missing')
  } else {
    const asset = await send(`/assets/${encodeURIComponent(largest.name)}`)
    const contentType = asset.headers.find(([name]) => name === 'content-type')?.[1] ?? '<none>'
    const onDisk = readFileSync(join(distAssets, largest.name))
    check(
      `largest dist asset round-trips byte-for-byte (${largest.name}, ${largest.size} bytes, crosses 64 KiB chunks: ${largest.size > 65_536})`,
      asset.status === 200 && largest.size > 65_536 && asset.bytes.equals(onDisk),
      `status=${asset.status} contentType=${contentType} servedBytes=${asset.bytes.byteLength}`,
    )
    process.stdout.write(`     实际 content-type = ${contentType}\n`)
  }
} catch (error) {
  check(phase, false, error instanceof Error ? error.message : String(error))
}

const exitedBeforeShutdown = childExited
if (child.connected) child.send({ type: 'shutdown' })
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
  exitedBeforeShutdown
    ? `host exited (code=${String(exitCode)}) before shutdown IPC — not caused by shutdown`
    : `code=${String(exitCode)}`,
)

if (failures.length > 0) {
  process.stderr.write(`lute shell smoke: ${failures.length} failure(s): ${failures.join(', ')}\n${stderr}\n`)
  process.exit(1)
}
process.stdout.write('lute shell smoke: PASS\n')
