#!/usr/bin/env node
/**
 * sync-fullstack-persona.mjs — 把 `SOUL.md` 渲染成 preset 的 persona 行（唯一渲染实现）。
 *
 * ## 为什么存在
 *
 * 「三无 · Agent全栈专家」的人格正文有两个可能的位置，而**两个位置都是错的**：
 *
 *   · 只写在 `agent.cordis.yml` 的 persona 行里 —— 人格就埋在一个 400 行的组合文件中间，
 *     人类看不见它、评审不了它、也没法拿它去和文档对照；
 *   · 只写在 `SOUL.md` 里 —— DSH 的预设加载器**不展开任何 include**，人格不落到 persona 行
 *     就等于不存在（模型读到的是部署默认人格）。
 *
 * 所以这里选的是第三种：`SOUL.md` 是**唯一事实源**，persona 行是它渲染出来的**物化副本**，
 * 而「副本是否仍然等于源」由一个共享的渲染函数 + 门禁逐字复核。一份事实一个家，
 * 副本漂移会被机器抓住，而不是靠纪律。
 *
 * ## 为什么渲染函数要单独导出，而不是在门禁里再写一遍
 *
 * 本仓库登记过的复发故障里有「两份实现各自漂移，而漂移的那一份仍然报绿」。
 * 门禁若自带一份「等价」的实现，那么渲染规则一改（缩进、空行、首尾换行），
 * 门禁校验的就是旧规则，同步器写的却是新规则 —— 每次同步都判红或每次都判绿，两种都错。
 * 故 `renderPersonaText` / `replacePersonaBody` 只此一处，门禁 import 它。
 *
 * ## 用法
 *
 *   node scripts/sync-fullstack-persona.mjs              # 渲染并写回 preset（默认）
 *   node scripts/sync-fullstack-persona.mjs --check      # 只比对，不写；有漂移退出码 1
 *   node scripts/sync-fullstack-persona.mjs --dry-run    # 打印将写入的内容
 *   node scripts/sync-fullstack-persona.mjs --soul <f> --cordis <f>   # 测另一份副本
 *   node scripts/sync-fullstack-persona.mjs --json
 */
import fs from 'node:fs'
import path from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PKG_ROOT = path.resolve(HERE, '..')

/** SOUL.md 的事实源路径（仓库内）。 */
export const DEFAULT_SOUL_PATH = path.join(PKG_ROOT, 'presets', 'agent-fullstack', 'SOUL.md')
/** 目标：用户预设里的组合文件。 */
export const DEFAULT_CORDIS_PATH = path.join(
  homedir(), '.dsh', '.agent-presets', 'agent-fullstack', 'agent.cordis.yml',
)

/** persona 行的锚：只认这个形状，认不到就响亮失败，不做「尽量匹配」。 */
const PERSONA_ANCHOR = /^- id: persona\n  name: '@deepseek-ai\/dsh-persona'\n  config:\n    text: \|-\n/m
/** 块标量的内容缩进（`    text: |-` 之下 6 格，与既有组合文件一致）。 */
const BODY_INDENT = '      '

/**
 * 读 SOUL.md 的**人格正文**：去掉文件头那段给人类看的 HTML 注释，其余逐字保留。
 *
 * 为什么用「去注释」而不是「取某个二级标题之后」：后者的失效形态是静默的 ——
 * 有人改了标题措辞，抽取就返回空串，而空人格能加载、能运行、日志正常，
 * 只是模型不再受任何约束。所以空正文在**读取这一层**就拒绝，
 * 而不是留给渲染器或让门禁报一个「不同源」了事（那会指向错的根因）。
 *
 * @param {string} [soulPath]
 * @returns {string} 正文（不含末尾换行）
 */
export function loadSoulBody(soulPath = DEFAULT_SOUL_PATH) {
  const raw = fs.readFileSync(soulPath, 'utf8')
  // 只去掉**文件最开头**的注释块；正文里若出现 <!-- --> 一律保留原样。
  const stripped = raw.replace(/^\s*<!--[\s\S]*?-->\s*\n?/, '')
  const body = stripped.replace(/\s+$/, '')
  if (body.trim() === '') {
    throw new Error(`${soulPath} 正文为空（只剩注释块或全是空白）—— 空人格会静默解除全部约束，拒绝接受`)
  }
  return body
}

/**
 * 把正文渲染成 persona 的 `text` 标量内容（即 YAML 块里 6 格缩进之后的东西）。
 *
 * 规则：每行前面加 6 格；**空行渲染成真正的空行**（YAML 块标量允许空行不带缩进，
 * 而带尾随空格的「空行」会在 diff 与门禁比对里变成幽灵差异）。
 *
 * @param {string} body
 * @returns {string} 带 6 格缩进的块内容（以换行结尾）
 */
export function renderPersonaText(body) {
  if (!body || body.trim() === '') {
    throw new Error('SOUL.md 正文为空 —— 渲染出空人格会静默解除全部约束，拒绝写入')
  }
  return body.split('\n').map((l) => (l === '' ? '' : BODY_INDENT + l)).join('\n') + '\n'
}

/**
 * 用 `body` 替换 `yml` 里 persona 行的块标量内容，返回新文本。找不到锚点则抛错。
 *
 * 边界判定按 YAML 块标量语义：内容行是「空行」或「缩进 >= 6 的非空行」，
 * 到第一个「非空且缩进 < 6」的行为止 —— 后面就是 `- id: agent-instructions`。
 *
 * @param {string} yml
 * @param {string} body
 * @returns {string}
 */
export function replacePersonaBody(yml, body) {
  const m = PERSONA_ANCHOR.exec(yml)
  if (!m) {
    throw new Error(
      "agent.cordis.yml 里找不到 persona 行的锚点（应为 - id: persona / name: '@deepseek-ai/dsh-persona' / config: / text: |-）"
      + ' —— 不猜、不做模糊匹配：锚点形状变了就必须有人来看一眼',
    )
  }
  const head = yml.slice(0, m.index + m[0].length)
  const rest = yml.slice(m.index + m[0].length)
  const lines = rest.split('\n')
  let end = 0
  for (; end < lines.length; end++) {
    const line = lines[end]
    if (line === '' || /^\s*$/.test(line)) continue
    if (line.startsWith(BODY_INDENT)) continue
    break
  }
  // 吸收正文与下一行之间多余的空行，只留一个（渲染结果自带结尾换行）。
  while (end > 0 && /^\s*$/.test(lines[end - 1] ?? '')) end--
  return head + renderPersonaText(body) + lines.slice(end).join('\n')
}

/** 抽出现有 persona 行的块内容（用于 `--check` 与门禁比对）。 */
export function extractPersonaBody(yml) {
  const m = PERSONA_ANCHOR.exec(yml)
  if (!m) return null
  const rest = yml.slice(m.index + m[0].length)
  const lines = rest.split('\n')
  const out = []
  for (const line of lines) {
    if (line === '' || /^\s*$/.test(line)) { out.push(''); continue }
    if (line.startsWith(BODY_INDENT)) { out.push(line.slice(BODY_INDENT.length)); continue }
    break
  }
  while (out.length && out[out.length - 1] === '') out.pop()
  return out.join('\n')
}

/** 原子写：tmp + rename。**不要**用写回原 inode 的方式 —— 组合文件可能是硬链接。 */
export function writeAtomic(file, content) {
  const tmp = `${file}.tmp-${process.pid}`
  fs.writeFileSync(tmp, content, { mode: fs.statSync(file).mode & 0o777 })
  fs.renameSync(tmp, file)
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function main() {
  const argv = process.argv.slice(2)
  const val = (flag) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : null }
  const soulPath = val('--soul') ?? DEFAULT_SOUL_PATH
  const cordisPath = val('--cordis') ?? DEFAULT_CORDIS_PATH
  const check = argv.includes('--check')
  const dryRun = argv.includes('--dry-run')
  const asJson = argv.includes('--json')

  const body = loadSoulBody(soulPath)
  const yml = fs.readFileSync(cordisPath, 'utf8')
  const current = extractPersonaBody(yml)
  const next = body
  const drifted = current !== next

  if (!check && !dryRun && drifted) writeAtomic(cordisPath, replacePersonaBody(yml, body))

  const facts = {
    soulPath, cordisPath,
    bodyChars: body.length,
    bodyLines: body.split('\n').length,
    currentChars: current?.length ?? null,
    drifted,
    wrote: !check && !dryRun && drifted,
  }
  if (asJson) console.log(JSON.stringify(facts, null, 2))
  else {
    console.log(`persona 同源同步器 | 源 ${soulPath}`)
    console.log(`  目标 ${cordisPath}`)
    console.log(`  SOUL.md 正文 ${facts.bodyChars} 字符 / ${facts.bodyLines} 行`)
    console.log(`  现有 persona 行 ${facts.currentChars ?? '(锚点未命中)'} 字符`)
    if (dryRun) console.log('  --dry-run：只打印，不写盘')
    else if (check) console.log(drifted ? '  ✗ 漂移：persona 行 != SOUL.md 渲染结果' : '  ✓ 一致')
    else console.log(drifted ? '  ✓ 已写回（persona 行 = SOUL.md 渲染结果）' : '  ✓ 无需改动（已一致）')
  }
  process.exit(check && drifted ? 1 : 0)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
