/**
 * Git 状态 API —— 客户端侧。
 *
 * 渲染进程不能开子进程：`node:child_process` 不在桌面端的模块表里，在这里 import
 * 会让整个插件启动失败。git 调用留在宿主半（`src/index.ts`）的 loopback 路由后面，
 * 本模块是它上面的薄封装。
 */

/** Route mirrored from the host half (`ROUTES.gitStatus`). */
const GIT_STATUS_ROUTE = '/api/dsh-qoder-sidebar/git-status'

export interface GitStatusInfo {
  branch: string
  uncommittedFiles: number
  ahead: number
  behind: number
  lastCommit?: { hash: string; message: string }
}

/** 路由不可用（宿主半未装载）时返回「没有可说的环境信息」，视图层据此不显示这一栏。 */
export async function fetchGitStatus(cwd?: string): Promise<GitStatusInfo | undefined> {
  try {
    const url = cwd === undefined ? GIT_STATUS_ROUTE : `${GIT_STATUS_ROUTE}?cwd=${encodeURIComponent(cwd)}`
    const response = await fetch(url, { headers: { accept: 'application/json' } })
    if (!response.ok) return undefined
    return (await response.json()) as GitStatusInfo
  } catch {
    return undefined
  }
}
