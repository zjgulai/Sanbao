import { spawn } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  HostResponseDecoder,
  SHELL_REQUEST_PIPE_FD,
  SHELL_RESPONSE_PIPE_FD,
  encodeRequestEnd,
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

const child = spawn(process.execPath, [entry, profileDir], {
  cwd: profileDir,
  env: { ...process.env, DSH_HOME: process.env.DSH_HOME ?? `${homedir()}/.dsh` },
  stdio: ['ignore', 'pipe', 'pipe', 'pipe', 'pipe', 'ipc'],
})

const decoder = new HostResponseDecoder()
const responses = new Map()
let streamId = 0
let stderr = ''

const readyPromise = new Promise((resolve, reject) => {
  child.once('message', (message) => {
    if (message?.type === 'ready') resolve(message)
    else reject(new Error(`lute shell smoke: unexpected IPC event ${JSON.stringify(message)}`))
  })
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
const send = (path) => {
  const id = ++streamId
  const pending = new Promise((resolve, reject) => { responses.set(id, { resolve, reject, chunks: [] }) })
  const hasBody = false
  requestPipe.write(encodeRequestStart(id, {
    url: `dsh-app://app${path}`,
    method: 'GET',
    headers: [['accept', '*/*']],
    hasBody,
  }))
  // 协议契约（参照 apps/desktop/src/host-process.ts 的 pumpRequest）：end 帧只用来结束
  // 请求体，hasBody:false 的请求绝不发 end——发了宿主会按「ended inactive body stream」
  // 走 fatal 拆机（参照 desktop-host/src/index.ts 同样如此）。
  if (hasBody) requestPipe.write(encodeRequestEnd(id))
  return pending
}

const info = await Promise.race([
  readyPromise,
  new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`host not ready in 120s: ${stderr.trim()}`)), 120_000).unref()
  }),
])
check('host reports ready at protocol v3', info.protocolVersion === 3, `dshVersion=${info.dshVersion}`)
check('host resolved an installed dsh version', /^\d+\.\d+\.\d+/u.test(info.dshVersion), info.dshVersion)

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
// 挑 dist/assets 里最大的文件，既记录 MIME 实际取值，也让响应体大概率跨过 64 KiB
// 帧分片边界——逐字节比对才能证明分片重组没丢没错序。
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
    asset.status === 200 && asset.bytes.equals(onDisk),
    `status=${asset.status} contentType=${contentType} servedBytes=${asset.bytes.byteLength}`,
  )
  process.stdout.write(`     实际 content-type = ${contentType}（MIME 表只有 6 项，字体类会落到 octet-stream；实测值记进 report，字形是否真渲染交由 Task 8 在 DevTools 里确认）\n`)
}

child.send({ type: 'shutdown' })
const exitCode = await new Promise((resolve) => { child.once('exit', (code) => resolve(code)) })
check('shutdown IPC exits the host cleanly', exitCode === 0, `code=${String(exitCode)}`)

if (failures.length > 0) {
  process.stderr.write(`lute shell smoke: ${failures.length} failure(s): ${failures.join(', ')}\n${stderr}\n`)
  process.exit(1)
}
process.stdout.write('lute shell smoke: PASS\n')
