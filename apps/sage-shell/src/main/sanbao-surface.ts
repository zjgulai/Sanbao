/**
 * Sanbao 承载面（「206 页接线程序」未闭项 1）：Sage 壳真实承载 sanbao_ui，并把
 * `window.__SANBAO_HOST__`（protocolVersion 1）注入给它。
 *
 * 结构（承载面安全样板照 `preview-window.ts` 的非特权容器）：
 * - 特权自定义 scheme `sage-sanbao://`（standard + secure + supportFetchAPI + stream）：
 *   `protocol.handle` 服务只来自注入的 local root（sanbao 静态产物目录），带
 *   realpath 前缀校验的穿越防护、只读（GET/HEAD）、404 兜底；
 * - 独立非持久 partition `sage-sanbao`：sandbox + contextIsolation + nodeIntegration:false +
 *   webviewTag:false；禁导航出 scheme、禁 window.open、webRequest 取消一切非本 scheme 请求；
 * - 预载 `sanbao-host-preload.cjs`（sandboxed preload）：contextBridge 注入 `__SANBAO_HOST__`，
 *   每个方法 → `ipcRenderer.invoke('sanbao-host:call', { method, args })`；
 * - main 侧单一 `ipcMain.handle('sanbao-host:call')`：方法白名单 + 参数形状严格校验，
 *   调用 `createSanbaoHostPort(facts)`，返回 JSON 可序列化结果；异常一律转 honest unavailable，
 *   绝不让 renderer 看到堆栈。
 *
 * 生产默认 facts：每个方法如实 unavailable（原因统一「壳尚未提供该类事实」）——本模块只搭
 * 承载与通道，不发明业务事实。注入真值（探针/测试）时按 sanbao 的纪律只回结构化事实，
 * 绝不含任何配置值、密钥或路径。
 *
 * 契约镜像出处：sanbao_ui 原型仓 `apps/sanbao-prototype/src/runtime/host.ts` 的
 * SanbaoHostPort（protocolVersion 1）。不跨仓 import——形状以本文件为 Sage 侧唯一镜像；
 * 漂移由真实 Electron 探针（test/support/sanbao-surface-probe.mjs）端到端兜底。
 */
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BrowserWindow, ipcMain, protocol, session } from 'electron'

export const SANBAO_SCHEME = 'sage-sanbao'
/** 承载面只认这一个 host：sage-sanbao://app/…（与 dsh-app://app 同一形状）。 */
export const SANBAO_SURFACE_HOST = 'app'
export const SANBAO_SURFACE_ORIGIN = `${SANBAO_SCHEME}://${SANBAO_SURFACE_HOST}`
export const SANBAO_SURFACE_ENTRY = `${SANBAO_SURFACE_ORIGIN}/index.html`
export const SANBAO_PARTITION = 'sage-sanbao'
export const SANBAO_HOST_CHANNEL = 'sanbao-host:call'
export const SANBAO_HOST_PROTOCOL_VERSION = 1 as const

/** 相对 root 之外的调用一律诚实 unavailable；生产默认 facts 的统一原因。 */
const NOT_PROVIDED_REASON = '壳尚未提供该类事实'
const UNKNOWN_METHOD_REASON = '壳未提供该方法'
const INVALID_ARGS_REASON = '参数无效'
const CALL_FAILED_REASON = '壳侧调用失败'

// ---------------------------------------------------------------------------
// host.ts 契约镜像（只读形状；出处见文件头）
// ---------------------------------------------------------------------------

export type HostUnavailable = { readonly state: 'unavailable'; readonly reason: string }

export type HostWorkspaceRead = {
  readonly state: 'read'
  readonly name: string
  readonly mode: string
  readonly repo?: string
  readonly branch?: string
}

export type HostRequirementOpened = { readonly state: 'opened'; readonly sessionRef: string }

export type HostSessionMessage = { readonly role: 'user' | 'assistant'; readonly text: string }

export type HostClarification = {
  readonly question: string
  readonly options: readonly string[]
  readonly recommended?: string
}

export type HostArtifact = {
  readonly name: string
  readonly kind: string
  readonly additions?: number
  readonly deletions?: number
}

export type HostRosterItem = { readonly title: string; readonly kind?: string }

export type HostKnowledgeRead =
  | { readonly state: 'read'; readonly collections: readonly HostRosterItem[] }
  | HostUnavailable

export type HostSitesRead =
  | { readonly state: 'read'; readonly sites: readonly HostRosterItem[] }
  | HostUnavailable

export type HostSessionRead =
  | {
      readonly state: 'read'
      readonly sessionRef: string
      readonly messages: readonly HostSessionMessage[]
      readonly streaming?: boolean
      readonly pendingClarification?: HostClarification | null
      readonly artifacts?: readonly HostArtifact[]
    }
  | HostUnavailable

export type HostSettingsNamespace = {
  readonly ns: string
  readonly revision: number
  readonly applies: string
  readonly saved: string
  readonly secrets: { readonly set: number; readonly total: number }
}

export type HostSettingsRead =
  | { readonly state: 'read'; readonly namespaces: readonly HostSettingsNamespace[] }
  | HostUnavailable

export type HostSessionHit = { readonly sessionRef: string; readonly title: string; readonly subtitle?: string }
export type HostAutomation = { readonly title: string; readonly schedule: string; readonly enabled: boolean }
export type HostQuota = { readonly remaining: number; readonly total: number }
export type HostCapability = { readonly id: string; readonly label: string; readonly configured: boolean; readonly enabled: boolean }

/** 方法白名单（与 host.ts 的 SanbaoHostPort 一一对应；顺序即契约顺序）。 */
export const SANBAO_HOST_METHODS = [
  'readWorkspace',
  'startRequirement',
  'readKnowledge',
  'readSites',
  'readSession',
  'stopSession',
  'answerClarification',
  'searchSessions',
  'readAutomations',
  'readUsage',
  'openArtifact',
  'readSettings',
  'readCapabilities',
] as const
export type SanbaoHostMethod = (typeof SANBAO_HOST_METHODS)[number]

/** 每个方法的参数个数（全部为字符串参数；形状校验在这里，业务校验在 port）。 */
const METHOD_ARITY: Readonly<Record<SanbaoHostMethod, number>> = {
  readWorkspace: 0,
  startRequirement: 1,
  readKnowledge: 0,
  readSites: 0,
  readSession: 1,
  stopSession: 1,
  answerClarification: 2,
  searchSessions: 1,
  readAutomations: 0,
  readUsage: 0,
  openArtifact: 2,
  readSettings: 0,
  readCapabilities: 0,
}

/** 单个会话的注入事实（readSession 的读形状去掉 state/sessionRef）。 */
export interface SanbaoSessionFacts {
  readonly messages: readonly HostSessionMessage[]
  readonly streaming?: boolean
  readonly pendingClarification?: HostClarification | null
  readonly artifacts?: readonly HostArtifact[]
}

/** 承载面可注入的结构化事实。缺省＝该能力如实 unavailable；不携带任何值、密钥或路径。 */
export interface SanbaoHostFacts {
  readonly workspace?: HostWorkspaceRead
  readonly requirement?: HostRequirementOpened
  readonly sessions?: Readonly<Record<string, SanbaoSessionFacts>>
  readonly settings?: readonly HostSettingsNamespace[]
  readonly knowledge?: readonly HostRosterItem[]
  readonly sites?: readonly HostRosterItem[]
  readonly capabilities?: readonly HostCapability[]
  readonly automations?: readonly HostAutomation[]
  readonly usage?: { readonly plan: HostQuota; readonly resources: HostQuota }
  readonly search?: readonly HostSessionHit[]
}

export interface SanbaoHostPort {
  readonly protocolVersion: 1
  readWorkspace(): Promise<HostWorkspaceRead | HostUnavailable>
  startRequirement(text: string): Promise<HostRequirementOpened | HostUnavailable>
  readKnowledge(): Promise<HostKnowledgeRead>
  readSites(): Promise<HostSitesRead>
  readSession(sessionRef: string): Promise<HostSessionRead>
  stopSession(sessionRef: string): Promise<{ readonly state: 'stopped' } | HostUnavailable>
  answerClarification(sessionRef: string, answer: string): Promise<{ readonly state: 'submitted' } | HostUnavailable>
  searchSessions(query: string): Promise<{ readonly state: 'read'; readonly results: readonly HostSessionHit[] } | HostUnavailable>
  readAutomations(): Promise<{ readonly state: 'read'; readonly items: readonly HostAutomation[] } | HostUnavailable>
  readUsage(): Promise<{ readonly state: 'read'; readonly plan: HostQuota; readonly resources: HostQuota } | HostUnavailable>
  openArtifact(sessionRef: string, name: string): Promise<{ readonly state: 'opened' } | HostUnavailable>
  readSettings(): Promise<HostSettingsRead>
  readCapabilities(): Promise<{ readonly state: 'read'; readonly entries: readonly HostCapability[] } | HostUnavailable>
}

/**
 * 事实驱动端口：生产默认 facts 为空 ＝ 每个方法如实 unavailable（不发明事实）。
 * 读形状只做显式字段白名单复制——结构之外的一切（值、密钥、路径）不得进入返回值。
 */
export function createSanbaoHostPort(facts: SanbaoHostFacts = {}): SanbaoHostPort {
  const notProvided = <T>(): Promise<T | HostUnavailable> => Promise.resolve({
    state: 'unavailable',
    reason: NOT_PROVIDED_REASON,
  })
  const unavailable = <T>(reason: string): Promise<T | HostUnavailable> => Promise.resolve({ state: 'unavailable', reason })
  return {
    protocolVersion: SANBAO_HOST_PROTOCOL_VERSION,
    readWorkspace: () => facts.workspace === undefined
      ? notProvided<HostWorkspaceRead>()
      : Promise.resolve({
          state: 'read',
          name: facts.workspace.name,
          mode: facts.workspace.mode,
          ...(facts.workspace.repo === undefined ? {} : { repo: facts.workspace.repo }),
          ...(facts.workspace.branch === undefined ? {} : { branch: facts.workspace.branch }),
        }),
    startRequirement: (text) => {
      const trimmed = typeof text === 'string' ? text.trim() : ''
      if (trimmed === '') return unavailable<HostRequirementOpened>(INVALID_ARGS_REASON)
      return facts.requirement === undefined
        ? notProvided<HostRequirementOpened>()
        : Promise.resolve({ state: 'opened', sessionRef: facts.requirement.sessionRef })
    },
    readKnowledge: () => facts.knowledge === undefined
      ? notProvided<HostKnowledgeRead>()
      : Promise.resolve({ state: 'read', collections: facts.knowledge.map((item) => ({ ...item })) }),
    readSites: () => facts.sites === undefined
      ? notProvided<HostSitesRead>()
      : Promise.resolve({ state: 'read', sites: facts.sites.map((item) => ({ ...item })) }),
    readSession: (sessionRef) => {
      if (typeof sessionRef !== 'string' || sessionRef === '') return unavailable<HostSessionRead>(INVALID_ARGS_REASON)
      const factsForSession = facts.sessions?.[sessionRef]
      if (factsForSession === undefined) return notProvided<HostSessionRead>()
      return Promise.resolve({
        state: 'read',
        sessionRef,
        messages: factsForSession.messages.map((message) => ({ role: message.role, text: message.text })),
        ...(factsForSession.streaming === undefined ? {} : { streaming: factsForSession.streaming }),
        ...(factsForSession.pendingClarification === undefined
          ? {}
          : { pendingClarification: factsForSession.pendingClarification }),
        ...(factsForSession.artifacts === undefined
          ? {}
          : { artifacts: factsForSession.artifacts.map((artifact) => ({ ...artifact })) }),
      })
    },
    stopSession: () => notProvided<{ readonly state: 'stopped' }>(),
    answerClarification: () => notProvided<{ readonly state: 'submitted' }>(),
    searchSessions: (query) => {
      if (typeof query !== 'string' || query.trim() === '') {
        return unavailable<{ readonly state: 'read'; readonly results: readonly HostSessionHit[] }>(INVALID_ARGS_REASON)
      }
      return facts.search === undefined
        ? notProvided<{ readonly state: 'read'; readonly results: readonly HostSessionHit[] }>()
        : Promise.resolve({ state: 'read', results: facts.search.map((hit) => ({ ...hit })) })
    },
    readAutomations: () => facts.automations === undefined
      ? notProvided<{ readonly state: 'read'; readonly items: readonly HostAutomation[] }>()
      : Promise.resolve({ state: 'read', items: facts.automations.map((item) => ({ ...item })) }),
    readUsage: () => facts.usage === undefined
      ? notProvided<{ readonly state: 'read'; readonly plan: HostQuota; readonly resources: HostQuota }>()
      : Promise.resolve({
          state: 'read',
          plan: { ...facts.usage.plan },
          resources: { ...facts.usage.resources },
        }),
    openArtifact: () => notProvided<{ readonly state: 'opened' }>(),
    readSettings: () => facts.settings === undefined
      ? notProvided<HostSettingsRead>()
      : Promise.resolve({
          state: 'read',
          namespaces: facts.settings.map((namespace) => ({
            ns: namespace.ns,
            revision: namespace.revision,
            applies: namespace.applies,
            saved: namespace.saved,
            secrets: { set: namespace.secrets.set, total: namespace.secrets.total },
          })),
        }),
    readCapabilities: () => facts.capabilities === undefined
      ? notProvided<{ readonly state: 'read'; readonly entries: readonly HostCapability[] }>()
      : Promise.resolve({ state: 'read', entries: facts.capabilities.map((entry) => ({ ...entry })) }),
  }
}

// ---------------------------------------------------------------------------
// scheme 注册与只读服务（root 注入 + 穿越防护）
// ---------------------------------------------------------------------------

/**
 * `sage-sanbao://` 的特权注册**描述符**。
 *
 * **单一调用纪律（2026-10-05 实测确立）**：Electron 43 下，
 * `protocol.registerSchemesAsPrivileged` 的**第二次调用会清除此前 scheme 的 fetch 等特权**——
 * 最小复刻：连续两次调用后，第一个 scheme 的 `fetch()` 立即报 “scheme is not supported”。
 * 因此本模块**不得自行注册**；由 `main/index.ts` 在唯一一次调用里把 dsh-app 与本描述符
 * 一起注册（回归守卫见 `test/scheme-registration-single-call.spec.ts`，发现过程见
 * dev 环境 Note 2026-10-05 的「首批战果」）。
 */
export const SANBAO_SCHEME_REGISTRATION = {
  scheme: SANBAO_SCHEME,
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: false,
    stream: true,
    codeCache: true,
  },
}

const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.cjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.map': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain',
  '.wasm': 'application/wasm',
}

function mimeForAsset(path: string): string {
  return MIME_BY_EXTENSION[extname(path).toLowerCase()] ?? 'application/octet-stream'
}

/**
 * 把 `sage-sanbao://app/<path>` 映射到 root 之内的真实文件；任何越界、坏编码、
 * 缺失、非文件、异 host/异 scheme 一律返回 null（调用方兜底 404）。
 * 两道校验：lexical（resolve 后前缀）＋ realpath（符号链接跳转后前缀）。
 */
export function resolveServedAssetPath(root: string, requestUrl: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(requestUrl)
  } catch {
    return null
  }
  if (parsed.protocol !== `${SANBAO_SCHEME}:` || parsed.hostname !== SANBAO_SURFACE_HOST) return null
  let pathname: string
  try {
    pathname = decodeURIComponent(parsed.pathname)
  } catch {
    return null
  }
  if (pathname.includes('\0')) return null
  if (pathname === '' || pathname === '/') pathname = '/index.html'
  let rootReal: string
  try {
    rootReal = realpathSync(root)
  } catch {
    return null
  }
  const candidate = resolve(rootReal, `.${pathname}`)
  if (!(candidate === rootReal || candidate.startsWith(rootReal + sep))) return null
  let actual: string
  try {
    actual = realpathSync(candidate)
  } catch {
    return null
  }
  if (!(actual === rootReal || actual.startsWith(rootReal + sep))) return null
  try {
    if (!statSync(actual).isFile()) return null
  } catch {
    return null
  }
  return actual
}

/** 当前承载面服务的 root（realpath 归一）；undefined ＝ 尚未创建承载面。 */
let servedRoot: string | undefined
let protocolHandled = false

function ensureProtocolHandled(): void {
  if (protocolHandled) return
  protocolHandled = true
  const partitionSession = session.fromPartition(SANBAO_PARTITION)
  partitionSession.protocol.handle(SANBAO_SCHEME, (request) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405 })
    if (servedRoot === undefined) return new Response(null, { status: 404 })
    const asset = resolveServedAssetPath(servedRoot, request.url)
    if (asset === null) return new Response(null, { status: 404 })
    try {
      return new Response(readFileSync(asset), { headers: { 'content-type': mimeForAsset(asset) } })
    } catch {
      return new Response(null, { status: 404 })
    }
  })
  // 单向闸门：承载面之内只有本 scheme 可读——没有网络、没有 root 之外的文件可达。
  partitionSession.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !details.url.startsWith(`${SANBAO_SCHEME}://`) })
  })
}

// ---------------------------------------------------------------------------
// host 通道（白名单 + 形状校验 + honest unavailable 兜底）
// ---------------------------------------------------------------------------

interface ActiveSanbaoSurface {
  readonly webContentsId: number
  readonly port: SanbaoHostPort
}

let hostChannelRegistered = false
let activeSurface: ActiveSanbaoSurface | undefined

function unavailable(reason: string): HostUnavailable {
  return { state: 'unavailable', reason }
}

function validateHostCall(payload: unknown): { method: SanbaoHostMethod; args: readonly string[] } | 'invalid-method' | 'invalid-args' {
  if (typeof payload !== 'object' || payload === null) return 'invalid-args'
  const method = (payload as { method?: unknown }).method
  if (typeof method !== 'string') return 'invalid-args'
  if (!(SANBAO_HOST_METHODS as readonly string[]).includes(method)) return 'invalid-method'
  const args = (payload as { args?: unknown }).args
  if (!Array.isArray(args)) return 'invalid-args'
  if (!args.every((argument) => typeof argument === 'string')) return 'invalid-args'
  if (args.length !== METHOD_ARITY[method as SanbaoHostMethod]) return 'invalid-args'
  return { method: method as SanbaoHostMethod, args }
}

function ensureHostChannelRegistered(): void {
  if (hostChannelRegistered) return
  hostChannelRegistered = true
  ipcMain.handle(SANBAO_HOST_CHANNEL, async (event, payload: unknown) => {
    const surface = activeSurface
    // 只有当前承载面的 frame 能用这条通道；其余一律按「未提供」fail closed。
    if (surface === undefined || event.sender.id !== surface.webContentsId) return unavailable(UNKNOWN_METHOD_REASON)
    const call = validateHostCall(payload)
    if (call === 'invalid-method') return unavailable(UNKNOWN_METHOD_REASON)
    if (call === 'invalid-args') return unavailable(INVALID_ARGS_REASON)
    try {
      const method = surface.port[call.method] as (...args: readonly string[]) => Promise<unknown>
      return await method(...call.args)
    } catch (error) {
      // honest unavailable：renderer 只见结果形状，永不见堆栈；main 侧只留方法名的单行诊断。
      process.stdout.write(`sage sanbao surface: host call failed (${call.method})\n`)
      return unavailable(CALL_FAILED_REASON)
    }
  })
}

// ---------------------------------------------------------------------------
// 承载面
// ---------------------------------------------------------------------------

const PRELOAD_FILE_NAME = 'sanbao-host-preload.cjs'
const SURFACE_WIDTH = 1280
const SURFACE_HEIGHT = 900

function resolvePreloadPath(): string | null {
  const candidate = fileURLToPath(new URL(`./${PRELOAD_FILE_NAME}`, import.meta.url))
  return existsSync(candidate) ? candidate : null
}

export interface SanbaoSurfaceOptions {
  /** 承载面的本地 local root（sanbao 静态产物目录；只读）。 */
  readonly root: string
  /** 注入给页面的结构化事实；缺省＝生产默认（每个方法 honest unavailable）。 */
  readonly facts?: SanbaoHostFacts
  /**
   * 可选父窗口提供者（照 preview-window 的容器约定）；缺省时创建独立承载窗。
   * 提供者返回 null/已销毁窗口时创建失败（failed: 'sanbao-surface-window-unavailable'）。
   */
  readonly window?: () => BrowserWindow | null
}

export interface SanbaoSurface {
  readonly window: BrowserWindow
  load(url?: string): Promise<void>
  destroy(): void
}

/**
 * 前置条件：调用方已在 app ready 前把 `SANBAO_SCHEME_REGISTRATION` 纳入**唯一一次**
 * `registerSchemesAsPrivileged` 调用（见 main/index.ts / 探针；单一调用纪律见本文件顶部注释）。
 * 未注册时 `load()` 会以导航失败暴露，本函数不做重复注册。
 */
export function createSanbaoSurface(options: SanbaoSurfaceOptions): SanbaoSurface | { readonly failed: string } {
  let root: string
  try {
    root = realpathSync(options.root)
  } catch {
    return { failed: 'sanbao-surface-root-unavailable' }
  }
  const preload = resolvePreloadPath()
  if (preload === null) return { failed: 'sanbao-surface-preload-missing' }
  let parent: BrowserWindow | null = null
  if (options.window !== undefined) {
    parent = options.window()
    if (parent === null || parent.isDestroyed()) return { failed: 'sanbao-surface-window-unavailable' }
  }
  ensureProtocolHandled()
  ensureHostChannelRegistered()
  servedRoot = root
  const window = new BrowserWindow({
    ...(parent === null ? {} : { parent }),
    width: SURFACE_WIDTH,
    height: SURFACE_HEIGHT,
    show: true,
    webPreferences: {
      partition: SANBAO_PARTITION,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false,
      allowRunningInsecureContent: false,
      preload,
    },
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`${SANBAO_SCHEME}://`)) event.preventDefault()
  })
  const port = createSanbaoHostPort(options.facts ?? {})
  activeSurface = { webContentsId: window.webContents.id, port }
  let destroyed = false
  return {
    window,
    async load(url: string = SANBAO_SURFACE_ENTRY): Promise<void> {
      if (destroyed) throw Object.assign(new Error('承载面已关闭'), { code: 'sanbao-surface-closed' })
      await window.loadURL(url)
    },
    destroy(): void {
      if (destroyed) return
      destroyed = true
      if (activeSurface?.webContentsId === window.webContents.id) activeSurface = undefined
      if (servedRoot === root) servedRoot = undefined
      if (!window.isDestroyed()) window.destroy()
    },
  }
}
