#!/usr/bin/env node
/**
 * sync-card-facets.mjs — 把精选线 vault 卡的「来源事实」透传进已装 p2s 卡。
 *
 * 为什么需要它（这是链路上缺失的一环，不是优化）：
 *   `~/.dsh/skills/p2s-<slug>/SKILL.md` 的 frontmatter 由 `scripts/assemble-skills.mjs`
 *   从 `generated/cards.json`（源头是 playbook HTML，即**另一条语料线**）装配而成，
 *   全程**不读** `paper2skills-vault/`。而 venue / venue_tier / evidence_grade /
 *   paper_id 只写在 vault 卡的 frontmatter 里。两条线唯一的连接点是 `p2s_card_id`
 *   （已装卡 → 卡 id）。缺了这一环，页面上这四项永远是空的。
 *
 * 这个脚本就是那一环：按 `p2s_card_id` 把 vault 卡的 frontmatter 读出来，
 * 原样写成已装卡的 `p2s_*` 字段。**它不产出任何新事实** —— 值一律照抄，
 * 认不出的卡一律不写（页面显示「未标注」，而不是这个脚本替它猜一个）。
 *
 * 产物分两处：
 *   1. `data/card-facets.json`（入库，小）—— 本次透传的审计台账。
 *      ⚠️ **页面插件不读它**（`dsh-algo-skills-local` 只读卡自己的 frontmatter，
 *      这是该插件的设计原则：「卡自己就是数据」）。它的作用只有两个：
 *      让 `--check` 能在不读 vault 的情况下复核装机态，以及让覆盖率可复算。
 *   2. 已装卡的 frontmatter（`--apply` 才写）。
 *
 * 用法：
 *   node scripts/sync-card-facets.mjs --dry     # 只打印计划（默认）
 *   node scripts/sync-card-facets.mjs --apply   # 写入已装卡 + 刷新台账
 *   node scripts/sync-card-facets.mjs --check   # 断言装机态与台账一致
 *   node scripts/sync-card-facets.mjs --report  # 只打印各字段覆盖率
 *
 * ⚠️ **跑完 `npm run install:skills` 必须重跑本脚本**。安装器是「按 staging 的
 *    frontmatter 整体重写已装卡」的，只保留 `KEEP_KEYS`（disable-model-invocation /
 *    user-invocable / workflow / whenToUse）四行 —— `p2s_*` 不在其中，所以一次重装会把
 *    透传字段**静默抹掉**，而页面上只会回到「未标注」（看上去完全正常）。
 *    `--check` 就是为这件事准备的：装机态与台账不一致时 exit 1。
 *
 * 退出码：0 通过 / 1 判红（--check 有漂移）/ 2 **输入没拿到**（vault 或装机目录
 * 不存在；这不是通过）。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PKG = dirname(__dirname)
const DATA_DIR = join(PKG, 'data')
const LEDGER = join(DATA_DIR, 'card-facets.json')
const CODE_AVAIL = join(DATA_DIR, 'code-availability.json')
const CODE_RECOVERY = join(DATA_DIR, 'code-recovery.json')

const VAULT = process.env.P2S_VAULT || '/Users/lute/project/paper_to_skills/paper2skills-vault'
const SKILLS_DIR = process.env.P2S_SKILLS_OUT || join(process.env.HOME || '', '.dsh', 'skills')

const MODE = process.argv.includes('--apply')
  ? 'apply'
  : (process.argv.includes('--check') ? 'check' : (process.argv.includes('--report') ? 'report' : 'dry'))

/**
 * 透传的字段：vault frontmatter 里的键 → 已装卡的 `p2s_*` 键。
 *
 * 键名带 `p2s_` 前缀不是装饰：已装目录里同时住着平台原生技能，前缀让「这一项来自
 * paper→skills 管线」在卡面上自明。`p2s_card_id` / `p2s_src_domain` 已经这么做了。
 */
export const FACET_KEYS = [
  ['venue', 'p2s_venue'],
  ['venue_tier', 'p2s_venue_tier'],
  ['evidence_grade', 'p2s_evidence_grade'],
  ['paper_id', 'p2s_paper_id'],
]

/** 代码可执行性字段名（值由 `codeLevelOf` 从两张入库表导出，见下）。 */
export const CODE_KEY = 'p2s_code_level'

/**
 * 代码可执行性：由 `data/code-availability.json`（卡面节选实测）与
 * `data/code-recovery.json`（完整实现恢复结果）**直接转录**，不新造判据。
 *
 * 六个取值各自对应两个已发布的布尔量，没有一处需要重新判断：
 *   无代码            卡面没有代码（`lines === 0`）
 *   非 Python         卡面代码不是 Python ⇒ 本包不对其做语法断言
 *   完整实现·可解析    恢复出完整实现 且 `ast.parse` 通过
 *   完整实现·不可解析  恢复出完整实现 但 `ast.parse` 失败
 *   节选·可解析        未恢复完整实现，卡面节选 `ast.parse` 通过
 *   节选·不可解析      未恢复完整实现，卡面节选 `ast.parse` 失败
 * @param {object|undefined} avail `code-availability.json` 的 `cards[id]`
 * @param {object|undefined} rec `code-recovery.json` 的 `cards[id]`
 * @returns {string} 取值，或空串（两项都拿不到 —— 不许猜）
 */
export function codeLevelOf(avail, rec) {
  if (!avail) return ''
  if ((avail.lines ?? 0) === 0) return '无代码'
  if (avail.lang !== 'python') return '非 Python'
  const hasFull = rec !== undefined && rec.tier !== 'unrecovered' && (rec.lines ?? 0) > 0
  if (hasFull) return rec.parses === true ? '完整实现·可解析' : '完整实现·不可解析'
  if (avail.parses === true) return '节选·可解析'
  if (avail.parses === false) return '节选·不可解析'
  return ''
}

/** 平铺解析 frontmatter（只认 `key: value` 单行；与本包既有口径一致）。 */
export function parseFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (!m) return undefined
  /** @type {Record<string,string>} */
  const fields = {}
  for (const line of m[1].split(/\r?\n/)) {
    if (line.trim() === '' || /^\s*#/.test(line)) continue
    const i = line.indexOf(':')
    if (i <= 0) continue
    let value = line.slice(i + 1).trim()
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
      try {
        const parsed = JSON.parse(value)
        if (typeof parsed === 'string') value = parsed
      } catch {
        value = value.slice(1, -1)
      }
    }
    fields[line.slice(0, i).trim()] = value
  }
  return { block: m[1], span: m[0], fields }
}

/**
 * 把透传字段写进 frontmatter：**先删后插**，因此幂等、且能清掉上游已删除的值。
 *
 * 值为空 ⇒ 不写这一行。理由：「卡没带这一项」的如实表达是**键不存在**，
 * 写 `p2s_venue: ""` 反而是把这个脚本变成了该字段的作者。页面把两者都读成空串。
 * @param {string} text 原始 SKILL.md
 * @param {Record<string,string>} values `p2s_*` 键 → 值
 * @returns {string|null} 重写后的文本；无 frontmatter 时返回 null（调用方拒绝写盘）
 */
export function applyFacets(text, values) {
  const parsed = parseFrontmatter(text)
  if (parsed === undefined) return null
  const owned = new Set([...FACET_KEYS.map(([, to]) => to), CODE_KEY])
  const kept = parsed.block.split(/\r?\n/).filter((line) => {
    const i = line.indexOf(':')
    return i <= 0 || !owned.has(line.slice(0, i).trim())
  })
  // 插在 `p2s_src_domain` 之后（找不到就插在 `p2s_card_id` 之后，再找不到就追加），
  // 让「这张卡从哪儿来」的字段在卡面上是连续的一块。
  const anchors = ['p2s_src_domain', 'p2s_card_id']
  let at = -1
  for (const anchor of anchors) {
    const found = kept.findIndex((line) => line.startsWith(`${anchor}:`))
    if (found >= 0) { at = found + 1; break }
  }
  const added = [...FACET_KEYS.map(([, to]) => to), CODE_KEY]
    .filter((key) => (values[key] ?? '') !== '')
    .map((key) => `${key}: ${JSON.stringify(values[key])}`)
  if (added.length > 0) kept.splice(at < 0 ? kept.length : at, 0, ...added)
  const eol = text.startsWith('---\r\n') ? '\r\n' : '\n'
  const body = text.slice(parsed.span.length)
  if (at < 0 && added.length === 0) return text
  return `---${eol}${kept.join(eol)}${eol}---${body}`
}

/** 收集 vault 里所有 `Skill-*.md`，按文件名（去掉 .md）建索引。 */
function indexVault(root) {
  /** @type {Map<string,string>} */
  const byId = new Map()
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'papers' || entry.name === 'node_modules') continue
      const abs = join(dir, entry.name)
      if (entry.isDirectory()) { walk(abs); continue }
      if (!/^Skill-.+\.md$/.test(entry.name)) continue
      byId.set(entry.name.replace(/\.md$/, ''), abs)
    }
  }
  walk(root)
  return byId
}

/** 已装 p2s 卡的目录名（排序）。 */
function installedCards(root) {
  return readdirSync(root)
    .filter((name) => name.startsWith('p2s-') && statSync(join(root, name)).isDirectory())
    .sort()
}

/**
 * 算出每张已装卡应该带的 `p2s_*` 值。
 * @returns {{plan: Array<{slug:string,file:string,cardId:string,values:Record<string,string>,inVault:boolean}>}}
 */
function buildPlan() {
  if (!existsSync(VAULT)) {
    console.error(`✗ vault 不存在：${VAULT}（用 P2S_VAULT 指定；读不到就是没测，不是通过）`)
    process.exit(2)
  }
  if (!existsSync(SKILLS_DIR)) {
    console.error(`✗ 装机目录不存在：${SKILLS_DIR}（先跑 node scripts/import-paper2skills.mjs）`)
    process.exit(2)
  }
  for (const file of [CODE_AVAIL, CODE_RECOVERY]) {
    if (!existsSync(file)) {
      console.error(`✗ 缺少 ${file} —— 先跑 npm run build:code-availability / build:code-recovery`)
      process.exit(2)
    }
  }
  const availById = JSON.parse(readFileSync(CODE_AVAIL, 'utf8')).cards
  const recoveryById = JSON.parse(readFileSync(CODE_RECOVERY, 'utf8')).cards
  const vaultIndex = indexVault(VAULT)
  console.log(`vault 卡 ${vaultIndex.size} 张 · 已装 p2s 卡扫描中…`)

  const plan = []
  for (const slug of installedCards(SKILLS_DIR)) {
    const file = join(SKILLS_DIR, slug, 'SKILL.md')
    const text = readFileSync(file, 'utf8')
    const parsed = parseFrontmatter(text)
    const cardId = parsed?.fields.p2s_card_id ?? ''
    /** @type {Record<string,string>} */
    const values = {}
    let inVault = false
    const vaultFile = vaultIndex.get(cardId)
    if (cardId !== '' && vaultFile !== undefined) {
      inVault = true
      const vaultFm = parseFrontmatter(readFileSync(vaultFile, 'utf8'))?.fields ?? {}
      for (const [from, to] of FACET_KEYS) {
        const value = (vaultFm[from] ?? '').trim()
        if (value !== '') values[to] = value
      }
    }
    const level = codeLevelOf(availById[cardId], recoveryById[cardId])
    if (level !== '') values[CODE_KEY] = level
    plan.push({ slug, file, cardId, values, inVault })
  }
  return plan
}

/** 各字段的覆盖率（有值 / 未标注）。 */
function coverage(plan) {
  const keys = [...FACET_KEYS.map(([, to]) => to), CODE_KEY]
  const out = {}
  for (const key of keys) {
    const filled = plan.filter((row) => (row.values[key] ?? '') !== '').length
    out[key] = { filled, blank: plan.length - filled, total: plan.length }
  }
  out['__vault_join'] = {
    filled: plan.filter((row) => row.inVault).length,
    blank: plan.filter((row) => !row.inVault).length,
    total: plan.length,
  }
  return out
}

const plan = buildPlan()
const stats = coverage(plan)

if (MODE === 'report' || MODE === 'dry') {
  console.log(`模式：${MODE}（已装卡 ${plan.length} 张）`)
  for (const [key, c] of Object.entries(stats)) {
    console.log(`  ${key.padEnd(22)} ${String(c.filled).padStart(5)}/${c.total} 有值 · ${c.blank} 将显示「未标注」`)
  }
}

if (MODE === 'dry' || MODE === 'report') {
  // ⚠️ `--report` 也必须在这里返回：第一版只 return 了 dry，report 会**掉进下面的
  //    apply 段**（打印完覆盖率顺手写盘 + 覆盖台账）。当时恰好 0 张卡需要改所以没造成
  //    后果，但那是运气 —— 一个自称「只打印」的模式不许有任何写盘路径。
  const sample = plan.filter((row) => Object.keys(row.values).length > 0).slice(0, 3)
  if (MODE === 'dry') for (const row of sample) console.log(`  例：${row.slug} → ${JSON.stringify(row.values)}`)
  process.exit(0)
}

if (MODE === 'check') {
  let drift = 0
  for (const row of plan) {
    const parsed = parseFrontmatter(readFileSync(row.file, 'utf8'))
    for (const key of [...FACET_KEYS.map(([, to]) => to), CODE_KEY]) {
      const want = row.values[key] ?? ''
      const have = parsed?.fields[key] ?? ''
      if (want !== have) {
        if (drift < 10) console.log(`  🔴 ${row.slug}: ${key} 装机态「${have}」≠ 台账「${want}」`)
        drift += 1
      }
    }
  }
  if (drift > 0) {
    console.error(`🔴 ${drift} 处漂移 —— 跑 node scripts/sync-card-facets.mjs --apply`)
    process.exit(1)
  }
  console.log(`✅ ${plan.length} 张卡的 ${Object.keys(stats).length - 1} 个字段与台账逐项一致`)
  process.exit(0)
}

// ── apply ────────────────────────────────────────────────────────────────────
let written = 0
for (const row of plan) {
  const before = readFileSync(row.file, 'utf8')
  const after = applyFacets(before, row.values)
  if (after === null) {
    console.error(`✗ ${row.slug}: 无 frontmatter，拒绝写盘`)
    process.exit(2)
  }
  if (after !== before) { writeFileSync(row.file, after, 'utf8'); written += 1 }
}
mkdirSync(DATA_DIR, { recursive: true })
writeFileSync(LEDGER, `${JSON.stringify({
  _meta: {
    generator: 'packages/capabilities/dsh-paper2skills/scripts/sync-card-facets.mjs',
    purpose: 'vault 精选卡 frontmatter → 已装 p2s 卡 p2s_* 字段的透传台账',
    consumers: [
      'scripts/sync-card-facets.mjs --check（唯一 reader）',
      '⚠️ dsh-algo-skills-local **不读**本文件：页面只读卡自己的 frontmatter',
    ],
    fact_source: `${VAULT}/**/Skill-*.md 与 data/code-availability.json + data/code-recovery.json`,
    keys: [...FACET_KEYS.map(([from, to]) => `${from} → ${to}`), `code_level(导出) → ${CODE_KEY}`],
  },
  counts: stats,
  items: Object.fromEntries(plan.filter((r) => Object.keys(r.values).length > 0).map((r) => [r.slug, r.values])),
}, null, 2)}\n`, 'utf8')
console.log(`✅ 写入 ${written} 张卡 · 台账 ${LEDGER}`)
console.log(`   有 vault 卡的 ${stats['__vault_join'].filled} 张 · 无（显示「未标注」）${stats['__vault_join'].blank} 张`)
