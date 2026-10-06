#!/usr/bin/env node
/**
 * crawl-sanbao-in-sage.mjs —— 在真实运行的 Sage 进程内逐 state 爬检 sanbao 承载面
 * （sanbao-in-Sage 装配 spec 2026-10-05 的 S2：206 路由在真实 Sage 内逐状态验收）。
 *
 * 做法：连接已开启的 renderer CDP（默认 http://127.0.0.1:9222/json/list），挑选
 * `sage-sanbao://` 的 page target（dev 承载窗），对每条 state：
 *   Page.navigate 整页导航到 `sage-sanbao://app/index.html?state=<id>`
 *   → 50ms 轮询 `document.documentElement.dataset.sanbaoWiring` 与 URL 的 state 参数
 *     （标记非 null 且参数匹配 = 本条已挂载；10s 未达 = timedOut）
 *   → 读事实包 { title, mountOk(.prototype), bodyChars, marker }
 * 期间用 Runtime.exceptionThrown + Log.entryAdded(level=error) 逐 state 记 console 错误账
 * （每次 navigate 前清账），每 state 之间空 150ms。
 *
 * 证据（默认 <Sage 仓根>/.birdview/evidence/sanbao-in-sage-2026-10-05/，--out 覆盖）：
 *   crawl-results.csv   state,marker,title,mountOk,bodyChars,consoleErrors,timedOut,ms（行尾 \n）
 *   crawl-summary.json  总数/ok 数/fail 列表/console 错误 state/总时长/cdpPort/清单来源
 *
 * 退出码：全部挂载且无超时 = 0；存在失败 state = 2；仪器错误 = 1；清单缺失 = 3。
 * 空选择（过滤后 0 条）按仪器错误拒绝空跑假绿；仪器错误中途发生时不写证据文件
 * （拒绝部分结果冒充全量读数）。
 *
 * 状态清单：--states <csv> 显式传入；未传时从 SAGE_SANBAO_SURFACE_ROOT 或 Sage 同级快照仓
 * 布局推导 `evidence/wiring/ledger.csv`（state id 列：state_id）。不硬编码机器绝对路径。
 *
 * 用法（由维护者在本机 dev:debug 会话旁运行；本脚本只读驱动，不启动应用、不改仓库）：
 *   node apps/sage-shell/scripts/crawl-sanbao-in-sage.mjs [选项]
 *     --states <csv>    状态清单 CSV（默认按上述发现规则）
 *     --cdp-port <n>    渲染进程 CDP 端口（默认 SAGE_DEV_CDP_PORT 或 9222）
 *     --out <dir>       证据输出目录（默认 <仓根>/.birdview/evidence/sanbao-in-sage-2026-10-05）
 *     --only <子串>     只爬 state id 含该子串的条目
 *     --limit <n>       最多爬 n 条（便于仪器自证）
 *     --help            打印用法
 *
 * 注意：爬检会把承载窗导航到清单最后一个 state，期间请不要手动操作该窗口。
 * 仅使用 Node ≥22 内置 fetch / WebSocket，无第三方依赖。
 */
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SAGE_ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const DEFAULT_OUT_DIR = join(SAGE_ROOT, '.birdview', 'evidence', 'sanbao-in-sage-2026-10-05')
const SURFACE_ENTRY = 'sage-sanbao://app/index.html'
const TARGET_URL_PREFIX = 'sage-sanbao://'

const MOUNT_TIMEOUT_MS = 10_000
const POLL_INTERVAL_MS = 50
const CONSOLE_SETTLE_MS = 150
const NAVIGATE_TIMEOUT_MS = 20_000
const EVALUATE_TIMEOUT_MS = 10_000
const FACT_READ_RETRIES = 3
const FACT_RETRY_GAP_MS = 150
const CDP_LIST_TIMEOUT_MS = 4_000
const WS_CONNECT_TIMEOUT_MS = 5_000
const DOMAIN_ENABLE_DRAIN_MS = 150

const USAGE = `用法：node apps/sage-shell/scripts/crawl-sanbao-in-sage.mjs [选项]
  --states <csv>    状态清单 CSV（默认从 SAGE_SANBAO_SURFACE_ROOT 或 Sage 同级快照仓推导）
  --cdp-port <n>    渲染进程 CDP 端口（默认 SAGE_DEV_CDP_PORT 或 9222）
  --out <dir>       证据输出目录（默认 <仓根>/.birdview/evidence/sanbao-in-sage-2026-10-05）
  --only <子串>     只爬 state id 含该子串的条目
  --limit <n>       最多爬 n 条
  --help            打印本用法
退出码：0 全部挂载且无超时；2 有失败 state；1 仪器错误；3 清单缺失。`

const VALUE_FLAGS = new Map([
  ['--states', 'states'],
  ['--cdp-port', 'cdpPort'],
  ['--out', 'out'],
  ['--only', 'only'],
  ['--limit', 'limit'],
])

function usageError(message) {
  process.stderr.write(`[crawl] 参数错误：${message}\n${USAGE}\n`)
  process.exit(1)
}

function parseArgs(argv) {
  const parsed = { help: false, states: null, cdpPort: null, out: null, only: null, limit: null }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help') {
      parsed.help = true
      continue
    }
    if (!VALUE_FLAGS.has(arg)) usageError(`未知参数 ${arg}`)
    const value = argv[index + 1]
    if (value === undefined || value.startsWith('--')) usageError(`参数 ${arg} 缺少值`)
    parsed[VALUE_FLAGS.get(arg)] = value
    index += 1
  }
  if (parsed.cdpPort !== null && !/^\d+$/.test(parsed.cdpPort)) usageError(`--cdp-port 必须是端口数字：${parsed.cdpPort}`)
  if (parsed.limit !== null && (!/^\d+$/.test(parsed.limit) || Number(parsed.limit) < 1)) usageError(`--limit 必须是 ≥1 的整数：${parsed.limit}`)
  return parsed
}

function delay(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms) })
}

function isFile(path) {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

function instrumentExit(message) {
  process.stderr.write(`[crawl] 仪器错误：${message}\n`)
  process.exit(1)
}

function manifestExit(message) {
  process.stderr.write(`[crawl] 清单问题：${message}\n`)
  process.exit(3)
}

/** 极简 CSV 解析：支持引号包裹与 "" 转义（ledger 当前无引号字段，防御未来证据列含逗号）。 */
function parseCsvRows(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"'
        index += 1
      } else if (char === '"') {
        quoted = false
      } else {
        field += char
      }
      continue
    }
    if (char === '"' && field.length === 0) {
      quoted = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (char !== '\r') {
      field += char
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((entries) => entries.some((entry) => entry.trim().length > 0))
}

/** 默认清单发现：env 覆盖先行，再取仓内收纳副本 vendor/sanbao-prototype，再按 Sage 同级快照仓布局
 *  （与 test/support/sanbao-surface-root.mjs 同约定）。 */
function candidateLedgerPaths(env) {
  const bases = []
  const override = env.SAGE_SANBAO_SURFACE_ROOT
  if (typeof override === 'string' && override.length > 0) bases.push(override)
  bases.push(join(SAGE_ROOT, 'vendor', 'sanbao-prototype'))
  const parent = dirname(SAGE_ROOT)
  for (const name of ['Sanbao', 'sanbao']) {
    bases.push(join(parent, name, 'repository-snapshot', 'apps', 'sanbao-prototype'))
  }
  const paths = []
  for (const base of bases) {
    paths.push(join(base, 'evidence', 'wiring', 'ledger.csv'))
    paths.push(join(dirname(base), 'evidence', 'wiring', 'ledger.csv'))
  }
  return paths
}

function resolveLedgerPath(explicit, env) {
  if (explicit !== null) {
    if (!isFile(explicit)) manifestExit(`--states 指定的清单不存在或不是文件：${explicit}`)
    return explicit
  }
  const candidates = candidateLedgerPaths(env)
  const found = candidates.find((candidate) => isFile(candidate))
  if (found !== undefined) return found
  manifestExit(`未找到状态清单 evidence/wiring/ledger.csv。尝试过：\n  ${candidates.join('\n  ')}\n可用 --states 或 SAGE_SANBAO_SURFACE_ROOT 显式指定。`)
}

function loadStateIds(ledgerPath) {
  let text
  try {
    text = readFileSync(ledgerPath, 'utf8')
  } catch (error) {
    manifestExit(`清单不可读：${ledgerPath}（${error.message}）`)
  }
  if (text.startsWith('\uFEFF')) text = text.slice(1)
  const rows = parseCsvRows(text)
  if (rows.length === 0) manifestExit(`清单为空：${ledgerPath}`)
  const header = rows[0].map((cell) => cell.trim().toLowerCase())
  const column = header.findIndex((name) => name === 'state_id' || name === 'state' || name === 'id')
  if (column === -1) manifestExit(`清单缺少 state_id 列：${ledgerPath}（表头：${header.join(', ')}）`)
  const ids = []
  const seen = new Set()
  for (const row of rows.slice(1)) {
    const value = (row[column] ?? '').trim()
    if (value.length === 0 || seen.has(value)) continue
    seen.add(value)
    ids.push(value)
  }
  if (ids.length === 0) manifestExit(`清单没有 state 行：${ledgerPath}`)
  return ids
}

async function fetchTargetList(port) {
  const url = `http://127.0.0.1:${port}/json/list`
  let response
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(CDP_LIST_TIMEOUT_MS) })
  } catch (error) {
    instrumentExit(`无法连接 CDP ${url}（${error.message}）——确认 dev 应用已以 --remote-debugging-port=${port} 启动`)
  }
  if (!response.ok) instrumentExit(`CDP /json/list 返回 HTTP ${response.status}：${url}`)
  try {
    const list = await response.json()
    if (!Array.isArray(list)) throw new Error('不是数组')
    return list
  } catch (error) {
    instrumentExit(`CDP /json/list 响应解析失败：${error.message}`)
  }
}

function pickSurfaceTarget(list) {
  const targets = list.filter((entry) => entry !== null && typeof entry === 'object' && typeof entry.url === 'string')
  const surfaceTargets = targets.filter((entry) => entry.type === 'page' && entry.url.startsWith(TARGET_URL_PREFIX))
  if (surfaceTargets.length === 0) {
    const lines = list.map((entry) => `  - ${entry?.type ?? '?'}\t${entry?.url ?? '?'}`)
    process.stderr.write(`[crawl] 未找到 ${TARGET_URL_PREFIX} 的 page target。当前 CDP target 列表：\n${lines.join('\n')}\n`)
    process.stderr.write('[crawl] 仪器错误：请确认承载面窗口已打开（dev:debug 默认开；SAGE_SANBAO_SURFACE=1）。\n')
    process.exit(1)
  }
  if (surfaceTargets.length > 1) {
    process.stderr.write(`[crawl] 警告：存在 ${surfaceTargets.length} 个 ${TARGET_URL_PREFIX} target，取第一个；其余：\n${surfaceTargets.slice(1).map((entry) => `  - ${entry.url}`).join('\n')}\n`)
  }
  const target = surfaceTargets[0]
  if (typeof target.webSocketDebuggerUrl !== 'string' || target.webSocketDebuggerUrl.length === 0) {
    instrumentExit(`target 缺少 webSocketDebuggerUrl：${target.url}`)
  }
  return target
}

/** 最小 CDP 客户端：id 配对请求 + 按 method 派发事件；socket 关闭即让所有在飞命令失败。 */
class CdpPeer {
  #socket
  #nextId = 1
  #pending = new Map()
  #handlers = new Map()
  #closed = false

  constructor(socket) {
    this.#socket = socket
    socket.addEventListener('message', (event) => { this.#onMessage(event.data) })
    socket.addEventListener('close', () => { this.#failAll(new Error('CDP WebSocket 已关闭')) })
    socket.addEventListener('error', () => { this.#failAll(new Error('CDP WebSocket 出错')) })
  }

  static async connect(wsUrl) {
    if (typeof WebSocket !== 'function') instrumentExit('需要 Node ≥22（内置全局 WebSocket）')
    const socket = new WebSocket(wsUrl)
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`WebSocket 连接超时（${wsUrl}）`)), WS_CONNECT_TIMEOUT_MS)
      socket.addEventListener('open', () => { clearTimeout(timer); resolve() }, { once: true })
      socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error(`WebSocket 连接失败（${wsUrl}）`)) }, { once: true })
    }).catch((error) => instrumentExit(error.message))
    return new CdpPeer(socket)
  }

  get closed() {
    return this.#closed
  }

  on(method, handler) {
    const handlers = this.#handlers.get(method) ?? []
    handlers.push(handler)
    this.#handlers.set(method, handlers)
  }

  send(method, params = {}, timeoutMs = 15_000) {
    if (this.#closed) return Promise.reject(new Error('CDP WebSocket 已关闭'))
    const id = this.#nextId
    this.#nextId += 1
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id)
        reject(new Error(`CDP ${method} 超时（${timeoutMs}ms）`))
      }, timeoutMs)
      this.#pending.set(id, { resolve, reject, timer, method })
      try {
        this.#socket.send(JSON.stringify({ id, method, params }))
      } catch (error) {
        clearTimeout(timer)
        this.#pending.delete(id)
        reject(new Error(`CDP ${method} 发送失败：${error.message}`))
      }
    })
  }

  close() {
    try {
      this.#socket.close()
    } catch {
      // 已断开即可
    }
  }

  #onMessage(raw) {
    if (typeof raw !== 'string') return
    let message
    try {
      message = JSON.parse(raw)
    } catch {
      return
    }
    if (typeof message.id !== 'number') {
      const handlers = this.#handlers.get(message.method)
      if (handlers !== undefined) {
        for (const handler of handlers) handler(message.params ?? {})
      }
      return
    }
    const pending = this.#pending.get(message.id)
    if (pending === undefined) return
    this.#pending.delete(message.id)
    clearTimeout(pending.timer)
    if (message.error !== undefined) {
      pending.reject(new Error(`CDP ${pending.method} 错误：${message.error.message ?? 'unknown'}`))
    } else {
      pending.resolve(message.result ?? {})
    }
  }

  #failAll(error) {
    this.#closed = true
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }
    this.#pending.clear()
  }
}

async function evaluate(peer, expression) {
  const result = await peer.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: false }, EVALUATE_TIMEOUT_MS)
  if (result.exceptionDetails !== undefined) {
    throw new Error(`页面表达式异常：${result.exceptionDetails.text ?? 'unknown'}`)
  }
  return result.result?.value
}

/** 轮询本 state 的挂载：标记非 null 且 URL state 参数已指向目标（防止读到上一 state 的旧文档）。 */
async function waitForMount(peer, stateId, deadline) {
  const probe = `(() => { try { return { state: new URLSearchParams(location.search).get('state'), marker: document.documentElement.dataset.sanbaoWiring ?? null } } catch (error) { return { state: null, marker: null } } })()`
  while (Date.now() < deadline) {
    try {
      const seen = await evaluate(peer, probe)
      if (seen !== null && seen !== undefined && seen.marker !== null && seen.state === stateId) return true
    } catch (error) {
      if (peer.closed) throw error
      // 导航中途 evaluate 失败：容忍并继续轮询
    }
    await delay(POLL_INTERVAL_MS)
  }
  return false
}

async function readFacts(peer) {
  const expression = `(() => { try { return { title: document.title, mountOk: document.querySelector('.prototype') !== null, bodyChars: document.body.textContent.length, marker: document.documentElement.dataset.sanbaoWiring ?? null } } catch (error) { return { title: null, mountOk: false, bodyChars: null, marker: null } } })()`
  for (let attempt = 0; attempt < FACT_READ_RETRIES; attempt += 1) {
    try {
      const facts = await evaluate(peer, expression)
      if (facts !== null && facts !== undefined && typeof facts === 'object') return facts
    } catch (error) {
      if (peer.closed) throw error
    }
    await delay(FACT_RETRY_GAP_MS)
  }
  return { title: null, mountOk: false, bodyChars: null, marker: null }
}

function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function buildCsv(results) {
  const header = 'state,marker,title,mountOk,bodyChars,consoleErrors,timedOut,ms'
  const lines = results.map((row) => [
    csvCell(row.state),
    csvCell(row.marker),
    csvCell(row.title),
    csvCell(row.mountOk),
    csvCell(row.bodyChars),
    csvCell(row.consoleErrors),
    csvCell(row.timedOut),
    csvCell(row.ms),
  ].join(','))
  return `${[header, ...lines].join('\n')}\n`
}

function printSummary(summary, failStates, consoleErrorStates, outDir) {
  const seconds = (summary.totalMs / 1000).toFixed(1)
  process.stdout.write(`[crawl] 合计 ${summary.totalStates}：ok ${summary.okStates}，fail ${failStates.length}，时长 ${seconds}s\n`)
  if (failStates.length > 0) process.stdout.write(`[crawl] 失败 state：${failStates.join(', ')}\n`)
  if (consoleErrorStates.length > 0) process.stdout.write(`[crawl] console 有错误的 state（${consoleErrorStates.length}）：${consoleErrorStates.join(', ')}\n`)
  process.stdout.write(`[crawl] 结果：${join(outDir, 'crawl-results.csv')}；摘要：${join(outDir, 'crawl-summary.json')}\n`)
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2))
  if (parsed.help) {
    process.stdout.write(`${USAGE}\n`)
    return 0
  }
  const port = parsed.cdpPort ?? process.env.SAGE_DEV_CDP_PORT ?? '9222'
  if (!/^\d+$/.test(port)) usageError(`CDP 端口必须是数字：${port}`)
  const outDir = parsed.out ?? DEFAULT_OUT_DIR
  const onlyFilter = parsed.only === null ? null : parsed.only
  const limit = parsed.limit === null ? null : Number(parsed.limit)

  const ledgerPath = resolveLedgerPath(parsed.states, process.env)
  const allIds = loadStateIds(ledgerPath)
  let selected = onlyFilter === null ? allIds : allIds.filter((id) => id.includes(onlyFilter))
  if (limit !== null) selected = selected.slice(0, limit)
  if (selected.length === 0) {
    instrumentExit(`过滤后状态数为 0（清单 ${allIds.length} 条，only=${onlyFilter ?? '-'}，limit=${limit ?? '-'}）——拒绝空跑假绿`)
  }
  process.stdout.write(`[crawl] 清单：${ledgerPath}（${allIds.length} 条，本次 ${selected.length} 条）\n`)

  const list = await fetchTargetList(port)
  const target = pickSurfaceTarget(list)
  process.stdout.write(`[crawl] 目标：${target.url}（targetId=${target.id ?? '?'}）\n`)

  const peer = await CdpPeer.connect(target.webSocketDebuggerUrl)
  try {
    const errorLedger = { count: 0 }
    peer.on('Runtime.exceptionThrown', () => { errorLedger.count += 1 })
    peer.on('Log.entryAdded', (params) => {
      if (params.entry !== undefined && params.entry.level === 'error') errorLedger.count += 1
    })
    try {
      await peer.send('Runtime.enable')
      await peer.send('Log.enable')
      await peer.send('Page.enable')
    } catch (error) {
      instrumentExit(`CDP 域启用失败：${error.message}`)
    }
    await delay(DOMAIN_ENABLE_DRAIN_MS)

    const results = []
    const runStartedAt = Date.now()
    for (const [index, stateId] of selected.entries()) {
      errorLedger.count = 0
      const stateStartedAt = Date.now()
      const navigateUrl = `${SURFACE_ENTRY}?state=${encodeURIComponent(stateId)}`
      try {
        const nav = await peer.send('Page.navigate', { url: navigateUrl }, NAVIGATE_TIMEOUT_MS)
        if (nav.errorText !== undefined && nav.errorText !== 'net::ERR_ABORTED') {
          await delay(200)
          const retry = await peer.send('Page.navigate', { url: navigateUrl }, NAVIGATE_TIMEOUT_MS)
          if (retry.errorText !== undefined) process.stderr.write(`[crawl] ${stateId} 导航报错：${retry.errorText}\n`)
        }
      } catch (error) {
        if (peer.closed) throw error
        process.stderr.write(`[crawl] ${stateId} 导航命令失败：${error.message}\n`)
      }
      const mounted = await waitForMount(peer, stateId, Date.now() + MOUNT_TIMEOUT_MS)
      const facts = await readFacts(peer)
      const elapsed = Date.now() - stateStartedAt
      // 让本 state 的异步错误事件落账（同时充当 state 间 150ms 间隔）；下一次 navigate 前再清账。
      await delay(CONSOLE_SETTLE_MS)
      const row = {
        state: stateId,
        marker: facts.marker ?? null,
        title: typeof facts.title === 'string' ? facts.title : null,
        mountOk: facts.mountOk === true,
        bodyChars: typeof facts.bodyChars === 'number' ? facts.bodyChars : null,
        consoleErrors: errorLedger.count,
        timedOut: !mounted,
        ms: elapsed,
      }
      results.push(row)
      const label = `[${String(index + 1).padStart(String(selected.length).length, ' ')}/${selected.length}]`
      const ok = row.marker !== null && row.mountOk && !row.timedOut
      process.stdout.write(`[crawl] ${label} ${stateId} ${ok ? '挂载' : '失败'} marker=${row.marker ?? 'null'} errors=${row.consoleErrors} ${row.ms}ms\n`)
    }

    const failStates = results.filter((row) => !(row.marker !== null && row.mountOk && !row.timedOut)).map((row) => row.state)
    const consoleErrorStates = results.filter((row) => row.consoleErrors > 0).map((row) => row.state)
    const summary = {
      schemaVersion: 1,
      cdpPort: Number(port),
      targetUrl: target.url,
      statesSource: ledgerPath,
      totalStates: results.length,
      okStates: results.length - failStates.length,
      failStates,
      consoleErrorStates,
      totalMs: Date.now() - runStartedAt,
      filters: { only: onlyFilter, limit },
      generatedAt: new Date().toISOString(),
    }
    mkdirSync(outDir, { recursive: true })
    writeFileSync(join(outDir, 'crawl-results.csv'), buildCsv(results), 'utf8')
    writeFileSync(join(outDir, 'crawl-summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
    printSummary(summary, failStates, consoleErrorStates, outDir)
    return failStates.length === 0 ? 0 : 2
  } finally {
    peer.close()
  }
}

let exitCode = 1
try {
  exitCode = await main()
} catch (error) {
  process.stderr.write(`[crawl] 仪器错误：${error instanceof Error ? error.message : String(error)}\n`)
  exitCode = 1
}
process.exitCode = exitCode
// WS 关闭后事件循环应自然退出；兜底定时器不阻止退出，只在仍有句柄时强制收尾（避免 stdout 截断）。
setTimeout(() => { process.exit(exitCode) }, 500).unref()
