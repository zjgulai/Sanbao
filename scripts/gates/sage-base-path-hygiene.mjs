/**
 * Sage BASE 的本机路径卫生判据。
 *
 * 只守活动入口与本轮修过的兼容脚本；历史文档、第三方 provenance 和 legacy
 * fixture 不在本项射程内。旧 Magpie-Horch 路径可以作为 packaging 的兼容输入，
 * 但当前 Sage、iCloud、恢复集和 worktree 路径不得重新成为默认值。
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export const SAGE_BASE_PATH_FILES = [
  'scripts/gate.mjs',
  'scripts/gates/profile-coverage.test.mjs',
  'scripts/jev/egress-boundary.test.mjs',
  'packaging/assemble.sh',
  'packaging/scripts/rewrite-file-deps.mjs',
]

const FORBIDDEN_ACTIVE_PATHS = [
  '/Users/lute/project/Sage',
  '/Users/lute/Library/Mobile Documents/com~apple~CloudDocs/Sage_hub/Sage',
  '/Users/lute/project/Sage-recovery-',
  '/.codex/worktrees/',
]

function requireText(violations, files, path, token, message) {
  const text = files.get(path)
  if (text === undefined) {
    violations.push(`${path} 不存在或不可读`)
  } else if (!text.includes(token)) {
    violations.push(message)
  }
}

/**
 * @param {{files: Array<{path: string, text: string}>}} input
 * @returns {{passed: boolean, violations: string[], note: string}}
 */
export function checkSageBasePathHygiene({ files }) {
  const byPath = new Map(files.map((file) => [file.path, file.text]))
  const violations = []

  for (const path of SAGE_BASE_PATH_FILES) {
    const text = byPath.get(path)
    if (text === undefined) {
      violations.push(`${path} 不存在或不可读`)
      continue
    }
    for (const forbidden of FORBIDDEN_ACTIVE_PATHS) {
      if (text.includes(forbidden)) {
        violations.push(`${path} 写死活动路径 ${JSON.stringify(forbidden)}`)
      }
    }
  }

  requireText(
    violations,
    byPath,
    'scripts/gate.mjs',
    'fileURLToPath(import.meta.url)',
    'scripts/gate.mjs 必须从 import.meta.url 发现仓根',
  )
  for (const path of ['scripts/gates/profile-coverage.test.mjs', 'scripts/jev/egress-boundary.test.mjs']) {
    requireText(
      violations,
      byPath,
      path,
      'fileURLToPath(import.meta.url)',
      `${path} 必须从 import.meta.url 发现仓根`,
    )
  }
  requireText(
    violations,
    byPath,
    'packaging/assemble.sh',
    'REPO_ROOT="$(cd "$PKG_ROOT/.." && pwd)"',
    'packaging/assemble.sh 必须从脚本目录推导 REPO_ROOT',
  )
  requireText(
    violations,
    byPath,
    'packaging/assemble.sh',
    'DSH_VENDOR="${DSH_VENDOR:-$REPO_ROOT}"',
    'packaging/assemble.sh 的 DSH_VENDOR 默认值必须是动态 REPO_ROOT',
  )
  requireText(
    violations,
    byPath,
    'packaging/scripts/rewrite-file-deps.mjs',
    'fileURLToPath(import.meta.url)',
    'rewrite-file-deps.mjs 必须从 import.meta.url 发现脚本目录',
  )
  requireText(
    violations,
    byPath,
    'packaging/scripts/rewrite-file-deps.mjs',
    "const repoRoot = path.resolve(scriptDir, '..', '..');",
    'rewrite-file-deps.mjs 必须从脚本目录推导当前 repoRoot',
  )
  requireText(
    violations,
    byPath,
    'packaging/scripts/rewrite-file-deps.mjs',
    '`file:${repoRoot}/`',
    'rewrite-file-deps.mjs 必须接受动态当前仓绝对 file: 前缀',
  )

  return {
    passed: violations.length === 0,
    violations,
    note: `核对 ${SAGE_BASE_PATH_FILES.length} 个 BASE 活动入口；legacy Magpie-Horch 仅作为 packaging 兼容输入保留`,
  }
}

/** @param {string} repoRoot */
export function collectSageBasePathFiles(repoRoot) {
  return SAGE_BASE_PATH_FILES.flatMap((path) => {
    const absolute = join(repoRoot, path)
    return existsSync(absolute) ? [{ path, text: readFileSync(absolute, 'utf8') }] : []
  })
}
