/** Sanbao 承载面真实 Electron 探针（206 页接线程序未闭项 1）。
 *
 * 真实启动 → 建承载面（sage-sanbao:// 服务注入的 local root）→ 载
 * `sage-sanbao://app/index.html?state=QDR.P01.home.workspace` → 真实 renderer 读数并断言：
 * - live 组（注入 facts）：挂载标记 live；工作区摘要出现注入名与「壳已接线」；设置页在
 *   readSettings 上渲染壳侧命名空间结构；readSession 经 contextBridge→IPC 通道回真消息；
 *   形状校验（缺参/错型）如实「参数无效」；无 facts 的方法统一「壳尚未提供该类事实」；
 * - honest 组（空 facts）：挂载标记 live 且出现「未接线」如实句；fixture 文案不被替换；
 * - 安全读数（两组都跑）：window.open 被拒、外源导航被拦、路径守卫（穿越/缺失/异 host/异
 *   scheme 一律拒绝、入口可读）、真实资源经 scheme 可载、renderer 导航到穿越 URL 拿不到 root 外文件。
 *
 * Env：SAGE_SANBAO_PROBE_ROOT（必需，Electron 数据目录基座）、SAGE_SANBAO_PROBE_FACTS=live|honest、
 * SAGE_SANBAO_PROBE_NEGATIVE_CONTROL=1（把 live 组期望工作区名改成永不注入的值，证明具名断言会红）、
 * SAGE_SANBAO_PROBE_SCREENSHOT_DIR（默认 <Sage 仓根>/.birdview/evidence/sanbao-surface-2026-10-05）。
 * 退出码：全绿 0；任一具名断言红 2；探针自身致命 1。逐条读数行前缀 SAGE_SANBAO_SURFACE_READ。 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, protocol } from 'electron'
import {
  SANBAO_SCHEME_REGISTRATION,
  SANBAO_SURFACE_ENTRY,
  SANBAO_SURFACE_ORIGIN,
  createSanbaoSurface,
  resolveServedAssetPath,
} from '../../lib/main/sanbao-surface.js'
import { resolveSanbaoSurfaceRoot } from '../../lib/main/sanbao-surface-root.js'

const RESULT_PREFIX = 'SAGE_SANBAO_SURFACE_RESULT '
const READ_PREFIX = 'SAGE_SANBAO_SURFACE_READ '
const PROBE_TIMEOUT_MS = 60_000
const STEP_TIMEOUT_MS = 6_000
const LIVE_SESSION_REF = 'session-sanbao-e2e'
const LIVE_SESSION_MESSAGE = '壳侧真消息：sanbao-e2e'
const HONEST_DEFAULT_REASON = '壳尚未提供该类事实'
const INVALID_ARGS_REASON = '参数无效'
const PROBE_METHODS = [
  'readWorkspace', 'startRequirement', 'readKnowledge', 'readSites', 'readSession', 'stopSession',
  'answerClarification', 'searchSessions', 'readAutomations', 'readUsage', 'openArtifact',
  'readSettings', 'readCapabilities',
]

const probeRoot = process.env.SAGE_SANBAO_PROBE_ROOT
if (probeRoot === undefined || probeRoot.length === 0) throw new Error('SAGE_SANBAO_PROBE_ROOT is required')
const mode = process.env.SAGE_SANBAO_PROBE_FACTS === 'live' ? 'live' : 'honest'
const negativeControl = process.env.SAGE_SANBAO_PROBE_NEGATIVE_CONTROL === '1'
const screenshotOverride = process.env.SAGE_SANBAO_PROBE_SCREENSHOT_DIR
const sageRoot = fileURLToPath(new URL('../../../../', import.meta.url))
const screenshotDir = screenshotOverride !== undefined && screenshotOverride.length > 0
  ? screenshotOverride
  : join(sageRoot, '.birdview', 'evidence', 'sanbao-surface-2026-10-05')

for (const name of ['user-data', 'session-data', 'crash-dumps', 'logs']) {
  mkdirSync(join(probeRoot, 'electron', name), { recursive: true })
}
app.setPath('userData', join(probeRoot, 'electron', 'user-data'))
app.setPath('sessionData', join(probeRoot, 'electron', 'session-data'))
app.setPath('crashDumps', join(probeRoot, 'electron', 'crash-dumps'))
app.setAppLogsPath(join(probeRoot, 'electron', 'logs'))

// 特权 scheme 必须在 app ready 前注册；**单次调用纪律**（2026-10-05 实测：第二次调用会
// 清除先前 scheme 的 fetch 特权）——本探针只注册 sanbao 一个 scheme，仍走唯一一次调用。
protocol.registerSchemesAsPrivileged([SANBAO_SCHEME_REGISTRATION])
app.disableHardwareAcceleration()
app.on('window-all-closed', () => {})

const failures = []
const harnessErrors = []
const evidence = {
  mode,
  negativeControl,
  resolvedRoot: null,
  reads: [],
  pixelEvidence: [],
  pageFacts: {},
}

function read(name, ok, detail) {
  const entry = { name, ok: ok === true, detail }
  evidence.reads.push(entry)
  process.stdout.write(READ_PREFIX + JSON.stringify(entry) + '\n')
  if (ok !== true) failures.push(name + ': ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)))
  return ok === true
}

function delay(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms) })
}

async function evaluate(window, source) {
  return await Promise.race([
    window.webContents.executeJavaScript(source),
    delay(STEP_TIMEOUT_MS).then(() => { throw new Error('page evaluation timed out') }),
  ])
}

async function capture(surface, name) {
  const image = await surface.window.capturePage()
  const png = image.toPNG()
  const size = image.getSize()
  mkdirSync(screenshotDir, { recursive: true })
  writeFileSync(join(screenshotDir, name), png)
  const entry = {
    name,
    width: size.width,
    height: size.height,
    byteLength: png.byteLength,
    sha256: createHash('sha256').update(png).digest('hex'),
    saved: true,
  }
  evidence.pixelEvidence.push(entry)
  process.stdout.write(READ_PREFIX + JSON.stringify({ name: 'screenshot', ok: true, detail: entry }) + '\n')
}

function liveFacts() {
  return {
    workspace: { state: 'read', name: 'sanbao-e2e-workspace', mode: 'local', repo: 'sanbao-e2e-repo', branch: 'main' },
    requirement: { state: 'opened', sessionRef: LIVE_SESSION_REF },
    sessions: {
      [LIVE_SESSION_REF]: {
        messages: [{ role: 'assistant', text: LIVE_SESSION_MESSAGE }],
        streaming: false,
      },
    },
    settings: [{ ns: 'sanbao-e2e', revision: 7, applies: 'live', saved: 'user', secrets: { set: 1, total: 2 } }],
  }
}

async function runCommonSecurityReads(surface, resolved) {
  const window = surface.window
  const guard = {
    acceptsEntry: resolveServedAssetPath(resolved.servedRoot, SANBAO_SURFACE_ENTRY) !== null,
    rejectsEncodedTraversal: resolveServedAssetPath(resolved.servedRoot, `${SANBAO_SURFACE_ORIGIN}/%2E%2E%2Fpackage.json`) === null,
    rejectsDecodedTraversal: resolveServedAssetPath(resolved.servedRoot, `${SANBAO_SURFACE_ORIGIN}/..%2F..%2Fetc%2Fhosts`) === null,
    rejectsMissing: resolveServedAssetPath(resolved.servedRoot, `${SANBAO_SURFACE_ORIGIN}/missing-${Date.now().toString(36)}.js`) === null,
    rejectsForeignHost: resolveServedAssetPath(resolved.servedRoot, 'sage-sanbao://evil/index.html') === null,
    rejectsForeignScheme: resolveServedAssetPath(resolved.servedRoot, 'dsh-app://app/index.html') === null,
  }
  read('path-guard', Object.values(guard).every(Boolean), guard)

  const assetCandidates = ['assets/brand/A_StarSail_Product_symbol_light.svg', 'styles.css']
  const assetName = assetCandidates.find((name) => existsSync(join(resolved.servedRoot, name)))
  if (assetName === undefined) {
    read('asset-served', false, { reason: 'no known asset found under the served root', candidates: assetCandidates })
  } else {
    const assetFacts = await evaluate(window, `(async () => new Promise((resolve) => {
      const image = new Image()
      const timer = setTimeout(() => resolve({ loaded: false, naturalWidth: 0, reason: 'timeout' }), 4000)
      image.onload = () => { clearTimeout(timer); resolve({ loaded: true, naturalWidth: image.naturalWidth }) }
      image.onerror = () => { clearTimeout(timer); resolve({ loaded: false, naturalWidth: 0, reason: 'error' }) }
      image.src = ${JSON.stringify(`${SANBAO_SURFACE_ORIGIN}/${assetName}?probe=1`)}
    }))()`)
    read('asset-served', assetFacts.loaded === true && assetFacts.naturalWidth > 0, { assetName, ...assetFacts })
  }

  const openFacts = await evaluate(window, `(() => {
    let opened = 'not-called'
    try {
      const result = window.open('https://example.com/sanbao-probe')
      opened = result === null ? 'null' : typeof result
    } catch {
      opened = 'threw'
    }
    return { opened }
  })()`)
  read('window-open-denied', openFacts.opened === 'null', openFacts)

  const navFacts = await evaluate(window, `(async () => {
    const before = location.href
    try { location.href = 'https://example.com/sanbao-probe' } catch {}
    await new Promise((resolve) => { setTimeout(resolve, 500) })
    return { before, after: location.href, stayed: location.protocol === 'sage-sanbao:' }
  })()`)
  read('external-navigation-blocked', navFacts.stayed === true && !navFacts.after.includes('example.com'), navFacts)
}

async function runLiveReads(surface, expectedWorkspaceName, resolved) {
  const window = surface.window
  const summaryFacts = await evaluate(window, `(async () => {
    const deadline = Date.now() + 6000
    let last = null
    while (Date.now() < deadline) {
      const summary = document.querySelector('.workspace-summary[data-workspace-wiring]')
      last = summary === null ? null : {
        wiring: summary.getAttribute('data-workspace-wiring'),
        name: summary.querySelector('strong')?.textContent ?? null,
        text: summary.textContent ?? '',
      }
      if (last !== null && last.wiring === 'live') return last
      await new Promise((resolve) => { setTimeout(resolve, 25) })
    }
    return last
  })()`)
  read(
    'workspace-live-summary',
    summaryFacts !== null
      && summaryFacts.wiring === 'live'
      && summaryFacts.name === expectedWorkspaceName
      && summaryFacts.text.includes('壳已接线')
      && summaryFacts.text.includes('本地模式'),
    { expectedWorkspaceName, ...(summaryFacts ?? { summary: 'absent' }) },
  )

  await delay(150)
  await capture(surface, 'sanbao-surface-live.png')

  const sessionFacts = await evaluate(window, `(async () => {
    const result = await window.__SANBAO_HOST__.readSession(${JSON.stringify(LIVE_SESSION_REF)})
    return JSON.parse(JSON.stringify(result))
  })()`)
  read(
    'session-port-round-trip',
    sessionFacts.state === 'read'
      && sessionFacts.sessionRef === LIVE_SESSION_REF
      && Array.isArray(sessionFacts.messages)
      && sessionFacts.messages[0]?.text === LIVE_SESSION_MESSAGE
      && sessionFacts.streaming === false,
    sessionFacts,
  )

  const shapeFacts = await evaluate(window, `(async () => {
    const host = window.__SANBAO_HOST__
    const zeroArgs = JSON.parse(JSON.stringify(await host.readSession()))
    const wrongType = JSON.parse(JSON.stringify(await host.readSession(123)))
    return { zeroArgs, wrongType }
  })()`)
  read(
    'shape-validation',
    shapeFacts.zeroArgs.state === 'unavailable' && shapeFacts.zeroArgs.reason === INVALID_ARGS_REASON
      && shapeFacts.wrongType.state === 'unavailable' && shapeFacts.wrongType.reason === INVALID_ARGS_REASON,
    shapeFacts,
  )

  const defaultFacts = await evaluate(window, `(async () => {
    const host = window.__SANBAO_HOST__
    const usage = JSON.parse(JSON.stringify(await host.readUsage()))
    const automations = JSON.parse(JSON.stringify(await host.readAutomations()))
    return { usage, automations }
  })()`)
  read(
    'honest-default-per-method',
    defaultFacts.usage.state === 'unavailable' && defaultFacts.usage.reason === HONEST_DEFAULT_REASON
      && defaultFacts.automations.state === 'unavailable' && defaultFacts.automations.reason === HONEST_DEFAULT_REASON,
    defaultFacts,
  )

  await surface.load(`${SANBAO_SURFACE_ENTRY}?state=QDR.P06.settings.models.default`)
  const settingsFacts = await evaluate(window, `(async () => {
    const deadline = Date.now() + 8000
    let last = null
    while (Date.now() < deadline) {
      const section = document.querySelector('[data-settings-wiring]')
      const row = section?.querySelector('li[data-settings-ns="sanbao-e2e"]') ?? null
      last = {
        marker: document.documentElement.dataset.sanbaoWiring ?? null,
        wiring: section?.getAttribute('data-settings-wiring') ?? null,
        rowText: row?.textContent ?? null,
      }
      if (last.wiring !== null && last.wiring !== 'loading') return last
      await new Promise((resolve) => { setTimeout(resolve, 25) })
    }
    return last
  })()`)
  read(
    'settings-live-surface',
    settingsFacts !== null
      && settingsFacts.marker === 'live'
      && settingsFacts.wiring === 'read'
      && typeof settingsFacts.rowText === 'string'
      && settingsFacts.rowText.includes('sanbao-e2e')
      && settingsFacts.rowText.includes('层 user')
      && settingsFacts.rowText.includes('即时生效')
      && settingsFacts.rowText.includes('revision 7')
      && settingsFacts.rowText.includes('密钥 1/2'),
    settingsFacts,
  )

  const traversalUrl = `${SANBAO_SURFACE_ORIGIN}/%2E%2E%2Fpackage.json`
  const packageJsonOutsideRoot = existsSync(join(resolved.servedRoot, '..', 'package.json'))
  let traversalLoadRejected = false
  try {
    await surface.load(traversalUrl)
  } catch {
    traversalLoadRejected = true
  }
  const traversalFacts = await evaluate(window, `(() => {
    const text = (document.body?.textContent ?? '').slice(0, 400)
    return { href: location.href, leakedPackageName: text.includes('sanbao-prototype'), text }
  })()`)
  read(
    'renderer-traversal-blocked',
    traversalFacts.leakedPackageName === false,
    { traversalUrl, packageJsonOutsideRoot, traversalLoadRejected, ...traversalFacts },
  )
}

async function runHonestReads(surface) {
  const window = surface.window
  const toastFacts = await evaluate(window, `(async () => {
    const deadline = Date.now() + 6000
    const readToast = () => document.querySelector('.prototype-toast')?.textContent ?? null
    let last = readToast()
    while (Date.now() < deadline) {
      if (last !== null && last.includes('未接线')) break
      await new Promise((resolve) => { setTimeout(resolve, 25) })
      last = readToast()
    }
    return { toast: last }
  })()`)
  read(
    'honest-toast',
    toastFacts.toast !== null
      && toastFacts.toast.includes('壳已连接但工作区读取未接线')
      && toastFacts.toast.includes(HONEST_DEFAULT_REASON)
      && toastFacts.toast.includes('仍显示本地示例绑定'),
    toastFacts,
  )

  await capture(surface, 'sanbao-surface-honest.png')

  const fixtureFacts = await evaluate(window, `(() => {
    const summary = document.querySelector('.workspace-summary[data-workspace-wiring]')
    return summary === null ? null : { wiring: summary.getAttribute('data-workspace-wiring'), text: summary.textContent ?? '' }
  })()`)
  read(
    'fixture-copy-preserved',
    fixtureFacts !== null
      && fixtureFacts.wiring === 'fixture'
      && fixtureFacts.text.includes('SanBao 本地演示')
      && fixtureFacts.text.includes('未连接业务系统')
      && !fixtureFacts.text.includes('壳已接线'),
    fixtureFacts ?? { summary: 'absent' },
  )
}

async function run() {
  await app.whenReady()
  const resolved = resolveSanbaoSurfaceRoot()
  if (resolved === null) {
    harnessErrors.push('sanbao prototype artifact not found (set SAGE_SANBAO_SURFACE_ROOT or place the snapshot repo next to the Sage repo)')
    return
  }
  evidence.resolvedRoot = resolved
  process.stdout.write(READ_PREFIX + JSON.stringify({ name: 'resolved-root', ok: true, detail: resolved }) + '\n')
  const expectedWorkspaceName = negativeControl ? 'sanbao-surface-negative-control' : 'sanbao-e2e-workspace'
  const facts = mode === 'live' ? liveFacts() : {}
  const surface = createSanbaoSurface({ root: resolved.servedRoot, facts })
  if ('failed' in surface) {
    harnessErrors.push(`createSanbaoSurface failed: ${surface.failed}`)
    return
  }
  try {
    await surface.load(`${SANBAO_SURFACE_ENTRY}?state=QDR.P01.home.workspace`)
    const window = surface.window

    const mountFacts = await evaluate(window, `(async () => {
      const deadline = Date.now() + 8000
      while (Date.now() < deadline) {
        const marker = document.documentElement.dataset.sanbaoWiring ?? null
        if (marker !== null) return { marker, appRootPresent: document.querySelector('.prototype') !== null, title: document.title }
        await new Promise((resolve) => { setTimeout(resolve, 20) })
      }
      return { marker: document.documentElement.dataset.sanbaoWiring ?? null, appRootPresent: document.querySelector('.prototype') !== null, title: document.title }
    })()`)
    evidence.pageFacts.mount = mountFacts
    read('mount-marker-live', mountFacts.marker === 'live' && mountFacts.appRootPresent === true, mountFacts)

    const bridgeFacts = await evaluate(window, `(() => {
      const host = window.__SANBAO_HOST__
      const methods = ${JSON.stringify(PROBE_METHODS)}
      const present = typeof host === 'object' && host !== null
      const functionMethods = present ? methods.filter((name) => typeof host[name] === 'function') : []
      return {
        present,
        protocolVersion: present ? host.protocolVersion ?? null : null,
        functionMethodCount: functionMethods.length,
        methodCount: methods.length,
        hasReadWorkspace: present && typeof host.readWorkspace === 'function',
        hasStartRequirement: present && typeof host.startRequirement === 'function',
      }
    })()`)
    evidence.pageFacts.bridge = bridgeFacts
    read(
      'preload-bridge',
      bridgeFacts.present === true
        && bridgeFacts.protocolVersion === 1
        && bridgeFacts.functionMethodCount === bridgeFacts.methodCount
        && bridgeFacts.hasReadWorkspace === true
        && bridgeFacts.hasStartRequirement === true,
      bridgeFacts,
    )

    await runCommonSecurityReads(surface, resolved)
    if (mode === 'live') {
      await runLiveReads(surface, expectedWorkspaceName, resolved)
    } else {
      await runHonestReads(surface)
    }
  } finally {
    surface.destroy()
  }
}

let fatal = null
const globalTimeout = setTimeout(() => {
  fatal = `probe timed out after ${PROBE_TIMEOUT_MS}ms`
  void finish()
}, PROBE_TIMEOUT_MS)

let finished = false
async function finish() {
  if (finished) return
  finished = true
  clearTimeout(globalTimeout)
  if (fatal !== null) harnessErrors.push(fatal)
  const outcome = harnessErrors.length > 0 ? 'harness-fatal' : failures.length > 0 ? 'no-go' : 'pass'
  const exitCode = outcome === 'pass' ? 0 : outcome === 'no-go' ? 2 : 1
  const result = {
    schemaVersion: 1,
    outcome,
    electron: process.versions.electron ?? null,
    chromium: process.versions.chrome ?? null,
    processType: process.type ?? null,
    evidence,
    failures,
    harnessErrors,
    passed: outcome === 'pass',
    ...(fatal === null ? {} : { fatal }),
  }
  process.stdout.write(RESULT_PREFIX + JSON.stringify(result) + '\n')
  app.exit(exitCode)
}

run().then(finish).catch((error) => {
  harnessErrors.push(error instanceof Error ? error.message : String(error))
  void finish()
})
