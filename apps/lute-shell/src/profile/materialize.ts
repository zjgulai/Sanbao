/** Materializes the tracked profile seed plus the built host runtime into a runnable profile. */

import { spawn } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { copyFile, cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { composeProfileManifest, hostEntryPath, overlayPath, planMaterialize, type CopyPlan, type ProfileManifest } from './layout.js'

/** One materialized profile ready to be handed to the host child process. */
export interface MaterializedProfile {
  readonly profileDir: string
  readonly hostEntry: string
  readonly overlay: string
  readonly installed: boolean
}

function assertPlan(plan: CopyPlan, seedDir: string): void {
  for (const entry of plan.entries) {
    if (existsSync(entry.from)) {
      // 递归目录条目只查「目录存在」会静默放过内容残缺（2026-09-23 DA-26 消融实测：
      // 抽走 lib/index.js 后 materialize 仍 exit=0，profile 声明 bundle 但宿主入口缺失）。
      // 空目录是能机器判出的最小完整性下界；逐文件清单的完整枚举超出此处。
      if (entry.recursive === true && readdirSync(entry.from).length === 0) {
        throw new Error(`lute shell: composed package directory ${entry.from} is empty — run pnpm run build in the owning package`)
      }
      continue
    }
    if (entry.kind === 'seed') throw new Error(`lute shell: missing seed file ${entry.from}`)
    if (entry.kind === 'composed-package') {
      throw new Error(`lute shell: missing composed package file ${entry.from} — run pnpm run build in the owning package`)
    }
    throw new Error(`lute shell: built host runtime is missing ${entry.from} — run pnpm run build in apps/lute-shell`)
  }
}

/**
 * Rewrite the copied profile manifest so it carries the composed packages.
 * @param profileDir - materialized profile holding the copied seed manifest.
 */
async function composeManifest(profileDir: string): Promise<void> {
  const path = join(profileDir, 'package.json')
  const manifest = JSON.parse(await readFile(path, 'utf8')) as ProfileManifest
  await writeFile(path, `${JSON.stringify(composeProfileManifest(manifest), null, 2)}\n`)
}

/**
 * Install profile dependencies with pnpm.
 * @param profileDir - materialized profile holding package.json and pnpm-lock.yaml.
 */
export function defaultInstall(profileDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('pnpm', ['install', '--dir', profileDir], {
      cwd: profileDir,
      // stdout 直通终端：数分钟的 install 必须可观测，「在干活」与「卡住」不得同形。
      stdio: ['ignore', 'inherit', 'pipe'],
    })
    let stderr = ''
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => { stderr += chunk })
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
  /** Repository root composed package paths are relative to; defaults to `repoRootOf(shellRoot)`. */
  repoRoot?: string
  install?: (profileDir: string) => Promise<void>
}): Promise<MaterializedProfile> {
  const plan = planMaterialize(input)
  assertPlan(plan, input.seedDir)
  for (const entry of plan.entries) {
    await mkdir(dirname(entry.to), { recursive: true })
    if (entry.recursive === true) await cp(entry.from, entry.to, { recursive: true })
    else await copyFile(entry.from, entry.to)
  }
  await composeManifest(input.profileDir)
  const install = input.install ?? defaultInstall
  await install(input.profileDir)
  return {
    profileDir: input.profileDir,
    hostEntry: hostEntryPath(input.profileDir),
    overlay: overlayPath(input.profileDir),
    installed: true,
  }
}
