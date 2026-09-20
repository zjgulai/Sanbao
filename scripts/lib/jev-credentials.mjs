/**
 * Jev API key 解析（ADR-0138 D7）。只读不写，不新增家。
 *
 * 优先级链照抄 DSH 凭证存储的官方语义（启动环境快照 > 存储文件 refs >
 * 项目 .env > $DSH_HOME/.env），对离线脚本而言「启动环境快照」= 进程 env。
 * 键名 LUTE_JEV_API_KEY：不占产品 provider 名，避免与基座配置碰撞。
 *
 * 本模块永不把 key 写进日志或错误消息；调用方要展示时用 redact()。
 * 文件缺失、格式不认识、refs 块缺失一律视为「该层无值」继续下探，不抛错。
 */
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const JEV_KEY_NAME = 'LUTE_JEV_API_KEY'

/** 仓库根（scripts/lib/ 向上两级）。 */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** 默认路径族，可被注入覆盖（测试用 tmp fixtures）。 */
export function defaultPaths(env = process.env) {
  const dshHome = env.DSH_HOME || join(homedir(), '.dsh')
  return {
    credentialsFile: join(dshHome, '.credentials.yaml'),
    projectEnv: join(REPO_ROOT, '.env'),
    dshHomeEnv: join(dshHome, '.env'),
  }
}

/** 展示用脱敏：前 8 位 + 长度，绝不回传完整 key。 */
export function redact(key) {
  if (typeof key !== 'string' || key.length === 0) return '<empty>'
  return `${key.slice(0, 8)}…(${key.length})`
}

/** 从 `refs:` 块抽 `KEY: value`（两空格缩进），其余 YAML 一律不认识 = 跳过。 */
export function parseCredentialsRefs(text) {
  const refs = {}
  let inRefs = false
  for (const rawLine of String(text ?? '').split('\n')) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith('#')) continue
    if (/^\S/.test(rawLine)) {
      inRefs = rawLine.trimEnd() === 'refs:'
      continue
    }
    if (!inRefs) continue
    const m = /^ {2}("[^"]+"|[A-Za-z0-9_./-]+):\s*(.*?)\s*$/.exec(rawLine)
    if (m && m[2]) refs[stripQuotes(m[1])] = stripQuotes(m[2])
  }
  return refs
}

/** 最小 .env 解析：`KEY=VALUE`，忽略空行与 `#` 注释，剥成对引号。 */
export function parseDotEnv(text) {
  const pairs = {}
  for (const rawLine of String(text ?? '').split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    const value = stripQuotes(line.slice(eq + 1).trim())
    if (key && value) pairs[key] = value
  }
  return pairs
}

function stripQuotes(v) {
  if (v.length >= 2 && ((v[0] === '"' && v.at(-1) === '"') || (v[0] === "'" && v.at(-1) === "'"))) {
    return v.slice(1, -1)
  }
  return v
}

/**
 * 解析 Jev key。返回 `{ key, source, tried }`：
 * key 为 null 时 source 为 null，tried 按优先级列出全部探过的路径（不含 env）。
 * 永不抛错、永不外泄 key 内容。
 */
export function resolveJevKey({
  env = process.env,
  paths = defaultPaths(env),
  readFile = (p) => {
    try {
      return readFileSync(p, 'utf8')
    } catch {
      return null
    }
  },
} = {}) {
  const tried = []
  const read = (p) => {
    if (!tried.includes(p)) tried.push(p)
    return readFile(p)
  }

  const fromEnv = env[JEV_KEY_NAME]
  if (fromEnv) return { key: fromEnv, source: 'env', tried }

  const credText = read(paths.credentialsFile)
  if (credText !== null) {
    const ref = parseCredentialsRefs(credText)[JEV_KEY_NAME]
    if (ref) return { key: ref, source: 'credentials-refs', tried }
  }

  const projectText = read(paths.projectEnv)
  if (projectText !== null) {
    const v = parseDotEnv(projectText)[JEV_KEY_NAME]
    if (v) return { key: v, source: 'project-env', tried }
  }

  const dshHomeText = read(paths.dshHomeEnv)
  if (dshHomeText !== null) {
    const v = parseDotEnv(dshHomeText)[JEV_KEY_NAME]
    if (v) return { key: v, source: 'dshhome-env', tried }
  }

  return { key: null, source: null, tried }
}
