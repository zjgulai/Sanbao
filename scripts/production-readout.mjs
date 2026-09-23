#!/usr/bin/env node
/**
 * 生产机现场只读取证（DA-37）：零写入，只读 app 版本/签名元数据、
 * 脱敏生命周期读数与 profile 装配面（依赖名+bundles 名，不导出凭据/设置/日志内容）。
 * 读数回传前由操作人人工复核脱敏面，再贴回会话。
 *
 * 用法：node scripts/production-readout.mjs [--app <路径>] [--data <数据目录>]
 * 缺省：app=/Applications/DSH Desktop.app，data=~/Library/Application Support/Sanbao
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'

function argValue(args, flag, fallback) {
  const i = args.indexOf(flag)
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback
}

const args = process.argv.slice(2)
const APP = argValue(args, '--app', '/Applications/DSH Desktop.app')
const DATA = argValue(args, '--data', join(homedir(), 'Library', 'Application Support', 'Sanbao'))

/** @param {string} cmd @param {string[]} argv */
function execQuiet(cmd, argv) {
  try {
    const r = spawnSync(cmd, argv, { encoding: 'utf8', timeout: 15000 })
    if (r.error || r.status !== 0) return null
    return `${r.stdout ?? ''}${r.stderr ?? ''}`.trim()
  } catch {
    return null
  }
}

function plistValue(plistPath, key) {
  try {
    const text = readFileSync(plistPath, 'utf8')
    const m = new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`).exec(text)
    return m ? m[1] : null
  } catch {
    return null
  }
}

const out = {
  readout: 'production-machine-readout',
  collectedAt: new Date().toISOString(),
  machine: { platform: process.platform, arch: process.arch },
  app: {},
  lifecycle: { source: 'startup.jsonl（仅最近 5 次 run 的脱敏字段）', runs: [] },
  profile: {},
  omitted: 'settings/凭据/完整日志/会话内容一律不读；见 docs/sop/production-machine-readout.md',
}

const infoPlist = join(APP, 'Contents', 'Info.plist')
if (existsSync(infoPlist)) {
  out.app = {
    bundleId: plistValue(infoPlist, 'CFBundleIdentifier'),
    cfBundleVersion: plistValue(infoPlist, 'CFBundleVersion'),
    cfBundleShortVersionString: plistValue(infoPlist, 'CFBundleShortVersionString'),
    displayName: plistValue(infoPlist, 'CFBundleDisplayName') ?? plistValue(infoPlist, 'CFBundleName'),
    signingAuthority: execQuiet('codesign', ['-dv', '--verbose=2', APP])
      ?.split('\n').find((line) => line.startsWith('Authority='))?.replace('Authority=', '') ?? null,
  }
}

const startupPath = join(DATA, 'lifecycle-events', 'startup.jsonl')
if (existsSync(startupPath)) {
  const lines = readFileSync(startupPath, 'utf8').trim().split('\n').filter(Boolean)
  const completed = lines.map((l) => JSON.parse(l)).filter((r) => r.eventName === 'startup.run.completed')
  out.lifecycle.runs = completed.slice(-5).map((r) => ({
    at: r.timestamp,
    totalMs: Math.round(r.durationMs ?? 0),
    finalStage: r.details?.finalStage ?? null,
    rendererStatus: r.details?.rendererStatus ?? null,
  }))
  // 数据源特性：startup.jsonl 每轮冷启动截断，只保留最近一次 run（实测 22 行/1 run）。
  out.lifecycle.note = '文件只保留最近一次 run（每轮冷启动截断）；历史 run 不落盘'
}

const profileDir = join(homedir(), '.dsh', 'profiles', 'desktop')
const profilePkg = join(profileDir, 'package.json')
if (existsSync(profilePkg)) {
  try {
    const pkg = JSON.parse(readFileSync(profilePkg, 'utf8'))
    out.profile = {
      dependencyNames: Object.keys(pkg.dependencies ?? {}),
      bundles: pkg.dsh?.profile?.bundles ?? [],
      lockfilePresent: existsSync(join(profileDir, 'pnpm-lock.yaml')),
      nodeModulesTopLevel: (() => {
        try { return readdirSync(join(profileDir, 'node_modules')).filter((n) => !n.startsWith('.')).length } catch { return null }
      })(),
    }
  } catch {
    out.profile = { unreadable: true }
  }
} else {
  out.profile = { absent: profilePkg }
}

process.stdout.write(`${JSON.stringify(out, null, 2)}\n`)
