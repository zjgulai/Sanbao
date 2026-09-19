/**
 * Git API - P1 Implementation
 * 
 * Uses child_process to execute git commands. In production, this should
 * be replaced with a more robust solution that handles errors gracefully.
 */

import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export interface GitStatus {
  branch: string
  ahead?: number
  behind?: number
  stagedChanges: number
  unstagedChanges: number
  untrackedFiles: string[]
  recentCommits: Array<{
    hash: string
    message: string
    author: string
    date: Date
  }>
}

export interface GitApi {
  getStatus(): Promise<GitStatus>
  refresh(): Promise<void>
}

// Real implementation using git commands
export const gitApi: GitApi = {
  getStatus: async (): Promise<GitStatus> => {
    try {
      // Get current branch
      const { stdout: branchOut } = await execAsync('git branch --show-current', { cwd: process.cwd() })
      const branch = branchOut.trim() || 'unknown'

      // Get staged changes
      const { stdout: stagedOut } = await execAsync('git diff --staged --stat', { cwd: process.cwd() })
      const stagedChanges = (stagedOut.match(/(\d+) insertion/)?.[1] ? parseInt(stagedOut.match(/(\d+) insertion/)[1]) : 0) +
        (stagedOut.match(/(\d+) deletion/)?.[1] ? parseInt(stagedOut.match(/(\d+) deletion/)[1]) : 0)

      // Get unstaged changes
      const { stdout: unstagedOut } = await execAsync('git diff --stat', { cwd: process.cwd() })
      const unstagedChanges = (unstagedOut.match(/(\d+) insertion/)?.[1] ? parseInt(unstagedOut.match(/(\d+) insertion/)[1]) : 0) +
        (unstagedOut.match(/(\d+) deletion/)?.[1] ? parseInt(unstagedOut.match(/(\d+) deletion/)[1]) : 0)

      // Get untracked files
      const { stdout: untrackedOut } = await execAsync('git ls-files --others --exclude-standard', { cwd: process.cwd() })
      const untrackedFiles = untrackedOut.trim() ? untrackedOut.trim().split('\n') : []

      // Get ahead/behind count
      let ahead = 0, behind = 0
      try {
        const { stdout: trackingOut } = await execAsync('git rev-list --count --left-right @{upstream}...HEAD', { cwd: process.cwd() })
        const lines = trackingOut.trim().split('\n')
        if (lines.length === 2) {
          const [left, right] = lines
          behind = parseInt(left) || 0
          ahead = parseInt(right) || 0
        }
      } catch {
        // No upstream configured
      }

      // Get recent commits
      const { stdout: logOut } = await execAsync(
        'git log --pretty=format:"%h|%s|%an|%ad" -5 --date=short',
        { cwd: process.cwd() }
      )
      const recentCommits: Array<{ hash: string; message: string; author: string; date: Date }> = logOut
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const [hash, message, author, date] = line.split('|')
          return { hash, message, author, date: new Date(date) }
        })

      return {
        branch,
        ahead,
        behind,
        stagedChanges,
        unstagedChanges,
        untrackedFiles,
        recentCommits,
      }
    } catch (error) {
      console.error('[dsh-right-sidebar] Git status error:', error)
      // Return default values on error
      return {
        branch: 'error',
        stagedChanges: 0,
        unstagedChanges: 0,
        untrackedFiles: [],
        recentCommits: [],
      }
    }
  },

  refresh: async (): Promise<void> => {
    // Force refresh by re-querying
    await gitApi.getStatus()
  },
}
