/**
 * 宿主半：只提供**渲染进程做不到的那一件事**——读 git 状态。
 *
 * 客户端 bundle 的模块表里没有 `node:child_process`，在那里 import 会让整个
 * 插件在启动时挂掉（本仓库踩过：missed the module table）。所以读操作留在这一侧，
 * 经**只认 loopback** 的 HTTP 路由暴露；客户端半（`src/client/git-api.ts`）是它
 * 的薄封装。
 */
import { execFile } from 'node:child_process'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { promisify } from 'node:util'
import type { Context } from '@deepseek-ai/cordis'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { isLoopbackRequest } from './loopback'

export const name = 'qoder-sidebar-local'

/** Services required before the git route can mount. */
export const inject = ['webServer']

/** Route paths (the client bundle mirrors these literals). */
export const ROUTES = { gitStatus: '/api/dsh-qoder-sidebar/git-status' } as const

const execFileAsync = promisify(execFile)

/** What the 环境信息 section needs, and nothing more. */
export interface GitStatusInfo {
  branch: string
  uncommittedFiles: number
  ahead: number
  behind: number
  lastCommit?: { hash: string; message: string }
}

/** One git invocation in `cwd`; throws with git's own stderr on failure. */
async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd, maxBuffer: 4 * 1024 * 1024 })
  return stdout
}

async function collectGitStatus(cwd: string): Promise<GitStatusInfo> {
  const branch = (await git(cwd, ['branch', '--show-current'])).trim() || 'unknown'
  const porcelain = await git(cwd, ['status', '--porcelain'])
  const uncommittedFiles = porcelain.split('\n').filter((line) => line.trim() !== '').length

  let ahead = 0
  let behind = 0
  try {
    const counts = (await git(cwd, ['rev-list', '--left-right', '--count', '@{upstream}...HEAD'])).trim()
    const [behindCount, aheadCount] = counts.split(/\s+/)
    ahead = Number.parseInt(aheadCount ?? '0', 10) || 0
    behind = Number.parseInt(behindCount ?? '0', 10) || 0
  } catch {
    // No upstream configured (or a detached HEAD): ahead/behind stay 0.
  }

  let lastCommit: GitStatusInfo['lastCommit']
  try {
    const log = await git(cwd, ['log', '-1', '--format=%H%n%s'])
    const [hash, message] = log.split('\n')
    if (hash !== undefined && message !== undefined) lastCommit = { hash, message }
  } catch {
    // An empty repository has no commit to report.
  }

  return { branch, uncommittedFiles, ahead, behind, ...(lastCommit === undefined ? {} : { lastCommit }) }
}

/** First session workspace path, or undefined when the registry is absent. */
function activeSessionCwd(ctx: Context): string | undefined {
  try {
    const sessions = ctx.get('sessions') as { list?: () => Array<{ header?: { cwd?: string } }> } | undefined
    if (typeof sessions?.list !== 'function') return undefined
    return sessions.list().map((session) => session.header?.cwd).find((cwd) => typeof cwd === 'string' && cwd !== '')
  } catch {
    return undefined
  }
}

/** Minimal JSON writer for this route family. */
function writeJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(payload) })
  res.end(payload)
}

export function apply(ctx: Context): void {
  const route: WebRoute = {
    kind: 'exact',
    path: ROUTES.gitStatus,
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      if (!isLoopbackRequest(req)) {
        writeJson(res, 403, { error: 'loopback only' })
        return
      }
      if (req.method !== 'GET') {
        writeJson(res, 405, { error: 'GET only' })
        return
      }
      const url = new URL(req.url ?? '/', 'http://x')
      const cwd = url.searchParams.get('cwd') ?? activeSessionCwd(ctx) ?? process.cwd()
      try {
        writeJson(res, 200, await collectGitStatus(cwd))
      } catch (error) {
        writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
      }
    },
  }

  ctx.effect(() => {
    const dispose = ctx.webServer.register(route)
    return () => dispose()
  }, 'qoder-sidebar-local: git status route')
}
