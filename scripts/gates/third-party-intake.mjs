import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { nodeCommand } from '../lib/real-node.mjs'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const builder = join(repoRoot, 'packages', 'capabilities', 'dsh-overseas-skills', 'scripts', 'build-third-party-intake.mjs')

export function checkThirdPartyIntake({ cwd = repoRoot, env = process.env } = {}) {
  const node = nodeCommand()
  const result = spawnSync(node.command, [builder, '--check', '--json'], {
    cwd,
    env: { ...node.env, ...env },
    encoding: 'utf8',
    timeout: 30_000,
  })
  const stdout = result.stdout?.trim() ?? ''
  try {
    const parsed = JSON.parse(stdout)
    if (!['pass', 'fail'].includes(parsed.status)) throw new Error('status 非 pass/fail')
    return parsed
  } catch (error) {
    const parseMessage = error instanceof Error ? error.message : String(error)
    const detail = result.error?.message || result.stderr?.trim() || stdout || `exit ${result.status}`
    return {
      status: 'fail',
      expected: 1,
      discovered: 0,
      checked: 0,
      skipped: 0,
      failed: 1,
      typedSkips: [],
      reason: `third-party intake checker 未返回 canonical JSON：${detail}（${parseMessage}）`,
      note: 'mandatory input unreadable',
      violations: [`third-party intake checker 未返回 canonical JSON：${detail}`],
    }
  }
}
