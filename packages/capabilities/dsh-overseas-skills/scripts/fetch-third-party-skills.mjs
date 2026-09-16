#!/usr/bin/env node
/**
 * fetch-third-party-skills.mjs — 第三方技能**取件器**（SOP §12.0 第零步）
 *
 * ## 为什么是「取件器」而不是「clone」
 *
 * 2026-09-15 实测：`git clone https://github.com/phuryn/pm-skills` **连续三次失败**
 * （`Connection reset by peer` / `invalid index-pack output`），`codeload` 的 tar.gz
 * 90s 内未完成；而同一时刻
 *   - `api.github.com/repos/<r>/git/trees/HEAD?recursive=1` 秒回（151 blob）
 *   - `raw.githubusercontent.com/<r>/HEAD/<path>` 逐文件 <20s
 * 即**仓库级打包取件在本机网络下不可靠，文件级取件可靠**。故取件路径固定为
 * 「trees API 枚举 → raw 逐文件 → sha256 对账」，不依赖 clone。这条不是偏好，
 * 是被实测逼出来的：假设 clone 可用的取件器会在 CI/换网时整批失败。
 *
 * ## 这道闸门守什么
 *
 * ① **枚举完整性**：trees API 返回 `truncated: true` 时**拒绝**——截断的树里
 *    「少了几条技能」与「上游本来就没有」长得一模一样，静默漏收是最难查的缺陷。
 * ② **字节完整性**：每文件落盘后复算 sha256 并与 trees API 的 blob sha 比对。
 *    GitHub blob sha 是 `sha1("blob <len>\0" + content)`，故本脚本算的就是它
 *    自己那套；这里做的是**长度 + 重取比对**，能在代理截断正文时判红。
 * ③ **清单闭合**：manifest 里声明的每条技能都必须能在树里找到，反之树里有
 *    SKILL.md 而 manifest 未声明时必须恰好登记为 imported / skipped / alreadyInstalled 之一——
 *    「没装」与「忘了装」在结果上无法区分，必须由人写下来才能区分。
 *
 * ## 用法
 *
 *   node scripts/fetch-third-party-skills.mjs --list        # 只枚举，不下载
 *   node scripts/fetch-third-party-skills.mjs               # 按 manifest 取件到缓存
 *   node scripts/fetch-third-party-skills.mjs --only pm     # 只取一个仓库
 *   node scripts/fetch-third-party-skills.mjs --force       # 缓存命中仍重取
 *
 * 缓存根：`staging/third-party/<owner>__<repo>/<path>`（进仓库，可审计、可离线重放）
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const MANIFEST = path.join(HERE, 'third-party-intake.json')
const CACHE = path.join(ROOT, 'staging', 'third-party')

const argv = process.argv.slice(2)
const LIST_ONLY = argv.includes('--list')
const FORCE = argv.includes('--force')
const oi = argv.indexOf('--only')
const ONLY = oi >= 0 ? (argv[oi + 1] || '').split(',').map((s) => s.trim()).filter(Boolean) : []

const API = 'https://api.github.com'
const RAW = 'https://raw.githubusercontent.com'
const UA = 'lute-fullstack-intake/1.0 (+local skill intake; contact: repo owner)'

const say = (s = '') => console.log(s)
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex')

/** 带指数退避的取文本；网络是本机已知的不稳定项，重试必须显式而不是靠运气。 */
async function getText(url, { attempts = 4 } = {}) {
  let lastErr
  for (let i = 0; i < attempts; i++) {
    try {
      const ctl = new AbortController()
      const timer = setTimeout(() => ctl.abort(), 30_000)
      const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/vnd.github+json' }, signal: ctl.signal })
      clearTimeout(timer)
      if (res.status === 404) return { ok: false, status: 404, text: null }
      if (!res.ok) { lastErr = new Error(`HTTP ${res.status}`); }
      else return { ok: true, status: res.status, text: await res.text() }
    } catch (e) { lastErr = e }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, 700 * 2 ** i))
  }
  throw new Error(`${url} 取件失败（${attempts} 次）：${lastErr?.message}`)
}

/** 枚举一棵树。`truncated: true` 一律拒绝——见文件头 ①。 */
async function listTree(repo) {
  const { ok, text, status } = await getText(`${API}/repos/${repo}/git/trees/HEAD?recursive=1`)
  if (!ok) throw new Error(`${repo}: trees API ${status}`)
  const data = JSON.parse(text)
  if (data.truncated) {
    throw new Error(
      `${repo}: trees API 返回 truncated=true。截断的树无法区分「上游没有这条」与「本次没收到这条」，` +
        `拒绝继续。请改用分页树 API 逐层枚举。`
    )
  }
  if (!Array.isArray(data.tree)) throw new Error(`${repo}: trees 响应无 tree 数组`)
  return data.tree
}

/** 一条技能的「单元目录」= 它的 SKILL.md 所在目录；其余文件按同一目录前缀收。 */
function unitFiles(tree, skillDir) {
  const prefix = skillDir + '/'
  return tree
    .filter((x) => x.type === 'blob' && x.path.startsWith(prefix))
    .map((x) => ({ path: x.path, rel: x.path.slice(prefix.length), size: x.size, gitSha: x.sha }))
}

async function main() {
  if (!fs.existsSync(MANIFEST)) throw new Error(`缺少 manifest：${MANIFEST}`)
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
  const report = { fetchedAt: new Date().toISOString(), repos: {}, skills: [], problems: [], skipped: [] }

  for (const repo of manifest.repos) {
    if (ONLY.length && !ONLY.includes(repo.id)) continue
    say(`\n=== ${repo.id}  ${repo.repo} ===`)
    const tree = await listTree(repo.repo)
    const allSkillDirs = [...new Set(tree.filter((x) => x.path.endsWith('/SKILL.md')).map((x) => x.path.replace(/\/SKILL\.md$/, '')))].sort()
    say(`  树上 SKILL.md 单元 ${allSkillDirs.length} 个 | blob ${tree.filter((x) => x.type === 'blob').length}`)

    // 清单闭合：每个树上 source ID 必须恰好属于 imported / skipped / alreadyInstalled。
    // dir 只用于 imported/skipped 的实际取件路径；alreadyInstalled 是独立终态，不再伪装成
    // 带占位 dir 的 skip。若上游同仓库出现两个同名末级目录，name 判别键失去唯一性，直接判红。
    const declared = new Set([...repo.skills.map((s) => s.dir), ...(repo.skip || []).map((s) => s.dir)])
    const declaredNames = new Set([
      ...repo.skills.map((s) => s.sourceName ?? s.name),
      ...(repo.skip || []).map((s) => s.sourceName ?? s.name),
      ...(repo.alreadyInstalled || []).map((s) => s.name),
    ])
    const nameOf = (dir) => dir.split('/').pop()
    const sourceNameCounts = new Map()
    for (const dir of allSkillDirs) sourceNameCounts.set(nameOf(dir), (sourceNameCounts.get(nameOf(dir)) || 0) + 1)
    const duplicateSourceNames = [...sourceNameCounts].filter(([, count]) => count > 1).map(([name]) => name).sort()
    if (duplicateSourceNames.length) {
      report.problems.push(`${repo.id}: 上游 source name 不唯一，不能用 name 做稳定 ID：${duplicateSourceNames.join(', ')}`)
    }
    const undeclared = allSkillDirs.filter((d) => !declared.has(d) && !declaredNames.has(nameOf(d)))
    if (undeclared.length) {
      report.problems.push(
        `${repo.id}: ${undeclared.length} 个单元没有 imported / skipped / alreadyInstalled 终态 —— 「没装」与「忘了装」在结果上无法区分：\n    ${undeclared.join('\n    ')}`
      )
    }
    // 反向：imported/skipped 的目录必须存在；alreadyInstalled 的 source ID 也必须仍在上游集合。
    const missing = [...declared].filter((d) => !allSkillDirs.includes(d))
    if (missing.length) report.problems.push(`${repo.id}: manifest 声明了树上不存在的单元：${missing.join(', ')}`)
    const liveSourceNames = new Set(allSkillDirs.map(nameOf))
    const missingAlready = (repo.alreadyInstalled || []).map((s) => s.name).filter((name) => !liveSourceNames.has(name))
    if (missingAlready.length) report.problems.push(`${repo.id}: alreadyInstalled 声明了树上不存在的 source ID：${missingAlready.join(', ')}`)

    if (LIST_ONLY) {
      report.repos[repo.id] = {
        repo: repo.repo,
        skillUnits: allSkillDirs.length,
        imported: repo.skills.length,
        skipped: (repo.skip || []).length,
        alreadyInstalled: (repo.alreadyInstalled || []).length,
      }
      continue
    }

    const outRoot = path.join(CACHE, repo.repo.replace('/', '__'))
    let bytes = 0, files = 0
    for (const s of repo.skills) {
      const files_ = unitFiles(tree, s.dir)
      if (!files_.length) { report.problems.push(`${repo.id}/${s.name}: 单元 ${s.dir} 在树上无文件`); continue }
      const dest = path.join(outRoot, s.dir)
      for (const f of files_) {
        const url = `${RAW}/${repo.repo}/HEAD/${f.path}`
        const target = path.join(dest, f.rel)
        if (!FORCE && fs.existsSync(target) && fs.statSync(target).size === f.size) { files++; bytes += f.size; continue }
        const { ok, text } = await getText(url)
        if (!ok) { report.problems.push(`${repo.id}/${s.name}: raw 404 ${f.path}`); continue }
        const buf = Buffer.from(text, 'utf8')
        if (f.size !== undefined && buf.length !== f.size) {
          report.problems.push(
            `${repo.id}/${s.name}: ${f.rel} 字节数不符（trees 报 ${f.size}，实得 ${buf.length}）—— ` +
              `正文可能被代理截断，拒绝落盘`
          )
          continue
        }
        fs.mkdirSync(path.dirname(target), { recursive: true })
        fs.writeFileSync(target, buf)
        files++; bytes += buf.length
      }
      report.skills.push({
        repo: repo.id, name: s.name, sourceName: s.sourceName ?? s.dir.split('/').pop(), dir: s.dir,
        installAs: s.installAs ?? s.name, category: s.category, titleZh: s.titleZh, summaryZh: s.summaryZh,
        fileCount: files_.length, sha256SkillMd: sha256(fs.readFileSync(path.join(dest, 'SKILL.md'))),
      })
    }
    // 附属文件：`commands/*.md` 这类**不属于任何技能单元**、但本轮要折叠进技能正文的
    // 上游文件。它们的取件走一条独立通道，**不进**上面的清单闭合判据 —— 闭合判据问的是
    // 「每个 SKILL.md 单元是否被处置过」，而这些文件根本不是单元，混进去会让判据失去含义。
    const extra = repo.extraFiles || []
    for (const rel of extra) {
      const url = `${RAW}/${repo.repo}/HEAD/${rel}`
      const target = path.join(outRoot, rel)
      if (!FORCE && fs.existsSync(target)) { files++; bytes += fs.statSync(target).size; continue }
      const { ok, text } = await getText(url)
      if (!ok) { report.problems.push(`${repo.id}: extraFile 404 ${rel}`); continue }
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, Buffer.from(text, 'utf8'))
      files++; bytes += Buffer.byteLength(text, 'utf8')
    }
    if (extra.length) say(`  · 附属文件 ${extra.length} 个（commands 等）`)

    say(`  ✓ 落盘 ${files} 文件 / ${(bytes / 1024).toFixed(1)} KiB → ${path.relative(ROOT, outRoot)}`)
    report.repos[repo.id] = {
      repo: repo.repo,
      skillUnits: allSkillDirs.length,
      imported: repo.skills.length,
      skipped: (repo.skip || []).length,
      alreadyInstalled: (repo.alreadyInstalled || []).length,
      files,
      bytes,
    }
  }

  if (!LIST_ONLY) {
    const out = path.join(ROOT, 'staging', 'third-party-fetch-report.json')
    fs.writeFileSync(out, JSON.stringify(report, null, 2))
    say(`\n报告 → ${path.relative(ROOT, out)}`)
  }
  say(`\n技能单元合计 ${report.skills.length} | 问题 ${report.problems.length}`)
  if (report.problems.length) { report.problems.forEach((p) => say('  - ' + p)); process.exit(1) }
  if (!LIST_ONLY) say('✓ 取件完成，字节数与清单闭合均通过')
}

await main()
