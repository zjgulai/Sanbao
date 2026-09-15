#!/usr/bin/env node
/**
 * verify-generic.mjs — 通用技能线闸门。
 *
 * ## 它回答的问题
 *
 * 「这 15 条通用技能，**真的能在 50 个岗位会话里被模型调用**吗？」
 *
 * 前面的闸门回答的都是别的问题：`verify_static.mjs` 问「id 存在吗 / 有图标吗」，
 * `skill-runtime-preconditions` 问「跑得起来吗」。**没有一条问「它到底挂上了没有」**——
 * 而「通用技能」这个定语的全部含义就是「每个岗位都挂」，挂不上就等于这条线不存在，
 * 且没有任何一处会报错：设置页照常显示 15 张卡片、技能目录照常有 15 个目录。
 *
 * 判据（每条都读**落盘字节**，不读意图）：
 *
 * 1. **清单一致**：`manifest/generic-skills.json` 与派生源一致（`--check`），
 *    且与 `taxonomy-v3.json` 的 `genericNames` 无漂移。
 * 2. **装得上**：15/15 目录存在，四件套齐全（title / description / user_summary / user_try），
 *    frontmatter 合法。description 必须含触发词与「何时不用」——已装库实测覆盖率 99%/95%。
 * 3. **挂得上**：T0 的每一条出现在**每一个**岗位 preset 的 `agent.cordis.yml` 的 `skill-subset` 里。
 *    有一个岗位漏了就是红，并点名是哪个岗位缺了哪几条。
 * 4. **挂得对**：T0 的 frontmatter 不得有 `disable-model-invocation: true`——
 *    挂上但模型看不到，与没挂无法区分。
 * 5. **图标**：分组与行都有头像（写进 `skill-icons-gn.json` 而不是 `skills.json` 的 `icon`，
 *    后者会静默失效）。
 *
 * 用法：node scripts/verify-generic.mjs
 * 退出码 0=通过，1=失败。
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { nodeCommand } from '../../../../scripts/lib/real-node.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const SKILLS_DIR = join(homedir(), '.dsh', 'skills')
const PRESET_DIR = join(homedir(), '.dsh', '.agent-presets')
const MANIFEST = join(ROOT, 'manifest', 'generic-skills.json')

const problems = []
/** 本机不在射程内的判据：**必须打印出来**，静默跳过与通过长得一样（P-11）。 */
const skipped = []
const note = (m) => problems.push(m)

if (!existsSync(MANIFEST)) {
  console.error(`✗ 通用线清单不存在：${MANIFEST}`)
  console.error('  跑 `node scripts/build-generic-manifest.mjs` 生成。')
  process.exit(1)
}
const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'))
const rows = manifest.skills ?? []
const groups = manifest.groups ?? []
const t0 = rows.filter((s) => s.tier === 'T0')
const t1 = rows.filter((s) => s.tier === 'T1')

// ── ① 清单一致 ────────────────────────────────────────────────────────────────
{
  const { command, env } = nodeCommand()
  try {
    execFileSync(command, [join(HERE, 'build-generic-manifest.mjs'), '--check'], { cwd: ROOT, encoding: 'utf8', env, stdio: 'pipe' })
  } catch (e) {
    // 退出码 2 = 派生源 staging/ 不在本机（不入库）；1 = 清单真的与派生源不一致。
    // 混成一句会让「环境不在」与「数据不对」共用一条红，两条修法都不会被走（ADR-0085 §③）。
    if (e.status === 2) {
      skipped.push('清单比对（派生源 staging/ 不在本机）')
    } else {
      note(`清单与派生源不一致：${String(e.stderr || e.stdout || e.message).trim().split('\n').slice(-1)[0]}`)
    }
  }
  let tax = null
  try { tax = JSON.parse(readFileSync(join(ROOT, 'manifest', 'taxonomy-v3.json'), 'utf8')) } catch { note('taxonomy-v3.json 读不到') }
  if (tax) {
    const a = [...(tax.genericNames ?? [])].sort().join(',')
    const b = rows.map((s) => s.name).sort().join(',')
    if (a !== b) note(`名单漂移：taxonomy.genericNames(${(tax.genericNames ?? []).length}) ≠ manifest(${rows.length})`)
  }
  const used = new Set(rows.map((s) => s.category))
  for (const g of groups) if (!used.has(g.key)) note(`分组 ${g.key}（${g.title}）下没有技能——页面上会是一格空白`)
  if (groups.length === 0) note('通用线没有任何分组')
}

// ── ② 装得上 + 四件套 ────────────────────────────────────────────────────────
const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
let installed = 0
const frontmatterOf = new Map()
for (const s of rows) {
  const file = join(SKILLS_DIR, s.name, 'SKILL.md')
  if (!existsSync(file)) { note(`${s.name}: 未安装（${file}）`); continue }
  installed++
  const text = readFileSync(file, 'utf8')
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (!m) { note(`${s.name}: 无 frontmatter`); continue }
  const fm = m[1]
  frontmatterOf.set(s.name, fm)
  if (!NAME_RE.test(s.name)) note(`${s.name}: name 非法`)
  const nm = /^name:\s*"([^"]+)"/m.exec(fm)
  if (!nm || nm[1] !== s.name) note(`${s.name}: frontmatter name 不符`)
  for (const [label, re] of [['title', /^title:\s*"(.+)"/m], ['description', /^description:\s*"(.+)"/m],
    ['user_summary', /^user_summary:\s*"(.+)"/m], ['user_try', /^user_try:\s*"(.+)"/m]]) {
    if (!re.test(fm)) note(`${s.name}: 四件套缺 ${label}`)
  }
  const desc = /^description:\s*"(.+)"/m.exec(fm)?.[1] ?? ''
  if (!desc.includes('触发词')) note(`${s.name}: description 无「触发词：」段`)
  if (!desc.includes('何时不用')) note(`${s.name}: description 无「何时不用」段`)
  for (const line of fm.split(/\r?\n/)) {
    if (!line.trim()) continue
    // 三种合法形态：标量行 `k: "v"` / `k: true`，块头 `k:`（子行缩进），缩进的子行。
    // 第一版把 `metadata:` 判成非法 —— 只认「冒号后跟引号或布尔」的规则，遇到
    // frontmatter 的块映射就会误报，而误报会逼着人去改**正确**的数据来迁就**错误**的判据。
    const ok = /^[A-Za-z_][\w-]*:\s*(".*"|true|false)$/.test(line)
      || /^[A-Za-z_][\w-]*:\s*$/.test(line)
      || /^\s+[A-Za-z_][\w-]*:\s*(".*"|true|false)$/.test(line)
    if (!ok) note(`${s.name}: 无法解析的 frontmatter 行 ${line.slice(0, 40)}`)
  }
}

// ── ③ 挂得上：T0 必须在每一个 agt preset 的 skill-subset 里 ──────────────────
let presetCount = 0
const missing = []
if (!existsSync(PRESET_DIR)) {
  note(`预设目录不存在：${PRESET_DIR} —— 50 岗位 preset 尚未生成，通用线挂载无从核对`)
} else {
  const dirs = readdirSync(PRESET_DIR, { withFileTypes: true }).filter((d) => d.isDirectory() && d.name.startsWith('agt-')).map((d) => d.name).sort()
  if (dirs.length === 0) note('没有 agt-* 预设目录')
  for (const d of dirs) {
    const yml = join(PRESET_DIR, d, 'agent.cordis.yml')
    if (!existsSync(yml)) { note(`${d}: 无 agent.cordis.yml`); continue }
    presetCount++
    const m = /id:\s*skill-subset[\s\S]{0,600}?skills:\s*\[([^\]]*)\]/.exec(readFileSync(yml, 'utf8'))
    if (!m) { note(`${d}: 没有 skill-subset 行`); continue }
    const inFile = new Set(m[1].split(',').map((x) => x.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean))
    const miss = t0.filter((s) => !inFile.has(s.name)).map((s) => s.name)
    if (miss.length) missing.push(`${d} 缺 ${miss.join(', ')}`)
  }
}

// ── ④ 挂得对：挂上但模型看不到，与没挂无法区分 ───────────────────────────────
for (const s of t0) {
  const fm = frontmatterOf.get(s.name)
  if (fm === undefined) continue
  const off = /^disable-model-invocation:[ \t]*"?([a-z]+)"?[ \t]*$/m.exec(fm)?.[1]
  if (off === 'true') note(`${s.name}: T0 却标了 disable-model-invocation: true —— 挂了但模型永远不会挑它`)
}

// ── ⑤ 图标 ───────────────────────────────────────────────────────────────────
{
  const cat = existsSync(join(ROOT, 'manifest', 'category-icons-gn.json'))
    ? JSON.parse(readFileSync(join(ROOT, 'manifest', 'category-icons-gn.json'), 'utf8')) : {}
  const row = existsSync(join(ROOT, 'manifest', 'skill-icons-gn.json'))
    ? JSON.parse(readFileSync(join(ROOT, 'manifest', 'skill-icons-gn.json'), 'utf8')) : {}
  const noCat = groups.filter((g) => !(cat[g.key] ?? '').startsWith('data:image/svg+xml;base64,'))
  if (noCat.length) note(`通用线无头像分组: ${noCat.map((g) => g.key).join(', ')}（跑 scripts/assign_lute_icons.py）`)
  const noRow = rows.filter((s) => !(row[s.name] ?? '').startsWith('data:image/svg+xml;base64,') && !(cat[s.category] ?? '').startsWith('data:image/svg+xml;base64,'))
  if (noRow.length) note(`通用线无图标行: ${noRow.map((s) => s.name).join(', ')}`)
}

// ── 汇总 ─────────────────────────────────────────────────────────────────────
console.log(`通用技能线闸门 | 分组 ${groups.length} | 清单 ${rows.length} 条（T0 ${t0.length} / T1 ${t1.length}）`)
console.log(`  安装 ${installed}/${rows.length} | 核对岗位 preset ${presetCount} 个 | T0 挂载缺口 ${missing.length} 个岗位`)
if (t1.length > 0) console.log(`  注：T1 ${t1.length} 条（${t1.map((s) => s.name).join(', ')}）按岗位族挂，不在本闸门射程内`)
if (skipped.length) console.log(`  ⏭ 跳过：${skipped.join('；')}`)
if (problems.length || missing.length) {
  for (const m of missing.slice(0, 20)) console.log(`  ✗ ${m}`)
  if (missing.length > 20) console.log(`  … 另有 ${missing.length - 20} 个岗位同样缺 T0`)
  for (const p of problems) console.log(`  ✗ ${p}`)
  console.log(`✗ 通用技能线未达标：${problems.length + missing.length} 项`)
  process.exit(1)
}
console.log(`✓ 通用技能线达标：${installed}/${rows.length} 已装 · 四件套齐全 · T0 ${t0.length} 条在 ${presetCount}/${presetCount} 个岗位逐字命中 · 图标齐备`)
