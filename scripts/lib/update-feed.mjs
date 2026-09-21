/**
 * 自动更新 feed（`latest.json`）的唯一事实源与判据核（DA-10 第一步，ADR-0063 路线的「不白做」前置）。
 *
 * ## 这份文件回答什么
 *
 * 更新路线（`docs/plans/2026-09-13-auto-update-route.md` §3）要求 feed **就是入库清单**
 * （ADR-0058 的 `release/<版本>.sha256`）——外加 `min_os` / `notes` / `channel` 三个面向更新器的字段。
 * 于是「feed 里写了什么」不允许有第二份手抄：本文件从清单**派生** feed，并给出两条判据：
 *   · `validateUpdateFeed`：feed 自身的形状（字段齐全、取值形状正确、无未知字段）；
 *   · `checkFeedAgainstManifest`：feed 与清单**不许分家**（六个派生字段逐一对账）。
 * 两者都由 `gate:update-feed` 在 CI/本地离线跑（清单在 git 里，不需要产物字节）。
 *
 * ## CLI（发布脚本用，同一份逻辑）
 *
 *   node scripts/lib/update-feed.mjs --manifest release/2.5.0.sha256 --min-os 12.0 \
 *     [--channel stable|canary] [--notes "…"] [--out packaging/release/2.5.0/latest.json]
 *
 * 不写 `--out` 时输出到 stdout（干跑读数用）；写文件前先自检形状，形状不合法不落盘。
 * `packaging/sign-and-dmg.sh` §7.5 调它生成 feed 并归档——生成者与判据共享本文件，不存在第二实现。
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const FEED_SCHEMA_VERSION = 1
export const FEED_CHANNELS = Object.freeze(['stable', 'canary'])
const VERSION_RE = /^\d+(\.\d+)*$/
/** feed 里的版本必须是发布用的三段式（x.y.z）——'9.9' 这种形状一律可疑。 */
const FEED_VERSION_RE = /^\d+\.\d+\.\d+$/
const MIN_OS_RE = /^\d+(\.\d+){0,2}$/
const SHA256_RE = /^[0-9a-f]{64}$/
const COMMIT_RE = /^[0-9a-f]{7,40}$/

/** feed 的字段集与顺序（派生字段在前，更新器专属字段在后）。 */
const FEED_FIELDS = Object.freeze([
  'schema_version', 'version', 'dmg', 'sha256', 'build',
  'source_commit', 'profile_snapshot', 'min_os', 'channel', 'notes',
])

/** 清单里必须有值的六个字段（feed 从它们派生）。 */
const MANIFEST_FIELDS = Object.freeze([
  'version', 'dmg', 'build', 'source_commit', 'profile_snapshot',
])

const isNonEmptyString = (value) => typeof value === 'string' && value.trim() !== ''

/**
 * 解析 ADR-0058 入库清单（`release/<版本>.sha256`）。
 * @param {string} text 清单正文。
 * @returns {{version: string, dmg: string, sha256: string, build: string, sourceCommit: string, sourceDirty: string, profileSnapshot: string}}
 */
export function parseReleaseManifest(text) {
  if (typeof text !== 'string' || text.trim() === '') {
    throw new Error('清单正文为空——读不到不是「干净」')
  }
  const fields = {}
  for (const line of text.split('\n')) {
    const match = /^#\s*([a-z_]+)=(.*)$/.exec(line)
    if (match !== null) fields[match[1]] = match[2]
  }
  const missing = MANIFEST_FIELDS.filter((name) => !isNonEmptyString(fields[name]))
  if (missing.length > 0) {
    throw new Error(`清单缺字段：${missing.join('、')}`)
  }
  const hashLine = text.match(/^([0-9a-f]{64})\s+(\S+)\s*$/m)
  if (hashLine === null) {
    throw new Error('清单里读不出哈希行（需要「64 位十六进制 + 两个空格 + 文件名」）')
  }
  return {
    version: fields.version,
    dmg: fields.dmg,
    sha256: hashLine[1],
    build: fields.build,
    sourceCommit: fields.source_commit,
    sourceDirty: fields.source_dirty ?? 'unknown',
    profileSnapshot: fields.profile_snapshot,
  }
}

/**
 * 从清单派生 feed。channel / min_os / notes 是更新器专属字段，由发布者显式给定。
 * @param {{manifest: ReturnType<typeof parseReleaseManifest>, channel?: string, minOs: string, notes?: string}} input
 */
export function buildUpdateFeed({ manifest, channel = 'stable', minOs, notes = '' }) {
  if (!FEED_CHANNELS.includes(channel)) {
    throw new Error(`channel 只认 ${FEED_CHANNELS.join(' / ')}，得到 ${JSON.stringify(channel)}`)
  }
  if (!isNonEmptyString(minOs) || !MIN_OS_RE.test(minOs)) {
    throw new Error(`min_os 必填且形如 12 / 12.0 / 12.0.1，得到 ${JSON.stringify(minOs)}`)
  }
  if (typeof notes !== 'string') {
    throw new Error(`notes 必须是字符串（可为空串），得到 ${JSON.stringify(notes)}`)
  }
  return {
    schema_version: FEED_SCHEMA_VERSION,
    version: manifest.version,
    dmg: manifest.dmg,
    sha256: manifest.sha256,
    build: manifest.build,
    source_commit: manifest.sourceCommit,
    profile_snapshot: manifest.profileSnapshot,
    min_os: minOs,
    channel,
    notes,
  }
}

/**
 * feed 形状判据（纯函数）。
 * @returns {{passed: boolean, violations: string[]}}
 */
export function validateUpdateFeed(feed) {
  const violations = []
  if (feed === null || typeof feed !== 'object' || Array.isArray(feed)) {
    return { passed: false, violations: ['feed 不是对象'] }
  }
  const unknown = Object.keys(feed).filter((key) => !FEED_FIELDS.includes(key))
  if (unknown.length > 0) {
    violations.push(`未知字段 ${unknown.join('、')}——字段表是本文件的 FEED_FIELDS，加字段要先改契约`)
  }
  if (feed.schema_version !== FEED_SCHEMA_VERSION) {
    violations.push(`schema_version 必须为 ${FEED_SCHEMA_VERSION}（得到 ${JSON.stringify(feed.schema_version)}）`)
  }
  if (!isNonEmptyString(feed.version) || !FEED_VERSION_RE.test(feed.version)) {
    violations.push(`version 形状不对（得到 ${JSON.stringify(feed.version)}；需要发布用的三段式 x.y.z）`)
  }
  if (!isNonEmptyString(feed.dmg) || !feed.dmg.endsWith('.dmg') || !feed.dmg.includes(String(feed.version))) {
    violations.push(`dmg 必须是以 .dmg 结尾且含版本号的文件名（得到 ${JSON.stringify(feed.dmg)}）`)
  }
  if (!isNonEmptyString(feed.sha256) || !SHA256_RE.test(feed.sha256)) {
    violations.push(`sha256 不是 64 位小写十六进制（得到 ${JSON.stringify(feed.sha256)}）`)
  }
  if (!isNonEmptyString(feed.build)) {
    violations.push(`build 为空（得到 ${JSON.stringify(feed.build)}）`)
  }
  if (!isNonEmptyString(feed.source_commit) || !COMMIT_RE.test(feed.source_commit)) {
    violations.push(`source_commit 不是 7-40 位十六进制（得到 ${JSON.stringify(feed.source_commit)}）`)
  }
  if (!isNonEmptyString(feed.profile_snapshot)) {
    violations.push(`profile_snapshot 为空（得到 ${JSON.stringify(feed.profile_snapshot)}）`)
  }
  if (!isNonEmptyString(feed.min_os) || !MIN_OS_RE.test(feed.min_os)) {
    violations.push(`min_os 形状不对（得到 ${JSON.stringify(feed.min_os)}）`)
  }
  if (!FEED_CHANNELS.includes(feed.channel)) {
    violations.push(`channel 只认 ${FEED_CHANNELS.join(' / ')}（得到 ${JSON.stringify(feed.channel)}）`)
  }
  if (typeof feed.notes !== 'string') {
    violations.push(`notes 必须是字符串（得到 ${JSON.stringify(feed.notes)}）`)
  }
  return { passed: violations.length === 0, violations }
}

/**
 * feed 与清单对账：派生字段逐一对齐——「一份事实只有一个家」（ADR-0009）。
 * @param {{feed: object, manifest: ReturnType<typeof parseReleaseManifest>}} input
 */
export function checkFeedAgainstManifest({ feed, manifest }) {
  const pairs = [
    ['version', feed.version, manifest.version],
    ['dmg', feed.dmg, manifest.dmg],
    ['sha256', feed.sha256, manifest.sha256],
    ['build', feed.build, manifest.build],
    ['source_commit', feed.source_commit, manifest.sourceCommit],
    ['profile_snapshot', feed.profile_snapshot, manifest.profileSnapshot],
  ]
  const violations = []
  for (const [field, feedValue, manifestValue] of pairs) {
    if (feedValue !== manifestValue) {
      violations.push(`${field} 与清单分家（feed=${JSON.stringify(feedValue)}，清单=${JSON.stringify(manifestValue)}）`)
    }
  }
  return { passed: violations.length === 0, violations }
}

/**
 * 版本比较（数字点分，按段补零）。更新器用它与当前版本比对；形状不对就抛错，不猜。
 * @returns {-1 | 0 | 1}
 */
export function compareVersions(left, right) {
  for (const value of [left, right]) {
    if (typeof value !== 'string' || !VERSION_RE.test(value)) {
      throw new Error(`版本形状不支持：${JSON.stringify(value)}（需要数字点分）`)
    }
  }
  const a = left.split('.').map(Number)
  const b = right.split('.').map(Number)
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const diff = (a[index] ?? 0) - (b[index] ?? 0)
    if (diff !== 0) return diff > 0 ? 1 : -1
  }
  return 0
}

// ── CLI（发布脚本与人工干跑共用） ────────────────────────────────────────────

function usage() {
  return [
    '用法: node scripts/lib/update-feed.mjs --manifest <清单路径> --min-os <12.0>',
    '       [--channel stable|canary] [--notes "…"] [--out <latest.json 路径>]',
    '     不写 --out 时输出到 stdout。',
  ].join('\n')
}

function parseArgs(argv) {
  const options = { channel: 'stable', notes: '', out: null, manifest: null, minOs: null }
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    const value = argv[index + 1]
    if (flag === '--manifest') { options.manifest = value; index += 1 }
    else if (flag === '--min-os') { options.minOs = value; index += 1 }
    else if (flag === '--channel') { options.channel = value; index += 1 }
    else if (flag === '--notes') { options.notes = value; index += 1 }
    else if (flag === '--out') { options.out = value; index += 1 }
    else if (flag === '-h' || flag === '--help') { options.help = true }
    else throw new Error(`未知参数：${flag}\n${usage()}`)
  }
  return options
}

function main(argv) {
  const options = parseArgs(argv)
  if (options.help) { console.log(usage()); return }
  if (options.manifest === null) throw new Error(`--manifest 必填\n${usage()}`)
  const manifest = parseReleaseManifest(readFileSync(resolve(options.manifest), 'utf8'))
  const feed = buildUpdateFeed({ manifest, channel: options.channel, minOs: options.minOs, notes: options.notes })
  const shape = validateUpdateFeed(feed)
  if (!shape.passed) {
    throw new Error(`生成的 feed 形状不合法，拒绝落盘：\n  - ${shape.violations.join('\n  - ')}`)
  }
  const text = `${JSON.stringify(feed, null, 2)}\n`
  if (options.out === null) {
    process.stdout.write(text)
  } else {
    writeFileSync(resolve(options.out), text)
    console.log(`[update-feed] 已写出 ${options.out}（version=${feed.version} channel=${feed.channel} sha256=${feed.sha256.slice(0, 12)}…）`)
  }
}

const isMain = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href

if (isMain) {
  try {
    main(process.argv.slice(2))
  } catch (error) {
    console.error(`[update-feed] ✗ ${error.message}`)
    process.exit(1)
  }
}
