/** Materializes the tracked profile seed plus the built host runtime into a runnable profile. */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { copyFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { hostEntryPath, overlayPath, planMaterialize, type CopyPlan } from './layout.js'

/** One materialized profile ready to be handed to the host child process. */
export interface MaterializedProfile {
  readonly profileDir: string
  readonly hostEntry: string
  readonly overlay: string
  readonly installed: boolean
}

function assertPlan(plan: CopyPlan, seedDir: string): void {
  for (const entry of plan.entries) {
    if (existsSync(entry.from)) continue
    throw new Error(entry.from.startsWith(seedDir)
      ? `lute shell: missing seed file ${entry.from}`
      : `lute shell: built host runtime is missing ${entry.from} — run pnpm run build in apps/lute-shell`)
  }
}

/**
 * Install profile dependencies with pnpm.
 * @param profileDir - materialized profile holding package.json and pnpm-lock.yaml.
 */
export function defaultInstall(profileDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('pnpm', ['install', '--dir', profileDir], {
      cwd: profileDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stderr = ''
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => { stderr += chunk })
    child.stdout.resume()
    child.once('error', (error) => {
      reject(new Error(`lute shell: pnpm install failed to start: ${error.message}`))
    })
    child.once('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`lute shell: pnpm install failed with ${String(code)}: ${stderr.trim()}`))
    })
  })
}

/**
 * Copy the seed and host runtime into one profile, then install its dependencies.
 * @param input - seed directory, shell package root, target profile, and install override.
 * @returns the materialized profile paths.
 */
export async function materializeProfile(input: {
  seedDir: string
  shellRoot: string
  profileDir: string
  install?: (profileDir: string) => Promise<void>
}): Promise<MaterializedProfile> {
  const plan = planMaterialize(input)
  assertPlan(plan, input.seedDir)
  for (const entry of plan.entries) {
    await mkdir(dirname(entry.to), { recursive: true })
    await copyFile(entry.from, entry.to)
  }
  const install = input.install ?? defaultInstall
  await install(input.profileDir)
  return {
    profileDir: input.profileDir,
    hostEntry: hostEntryPath(input.profileDir),
    overlay: overlayPath(input.profileDir),
    installed: true,
  }
}
