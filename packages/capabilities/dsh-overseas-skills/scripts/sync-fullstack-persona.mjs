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
 * ## 为什么锚点认结构、不认配置键名
 *
 * 「人格正文写在哪个配置键」这条事实的家是**插件自己的 `Config`**，不是本文件的正则：
 * 2026-09-17 上游 2.0.10 把 `@deepseek-ai/dsh-persona` 的键从 `text` 改成必填的 `prefix`，
 * 而这里曾把 `text: |-` 钉进锚点 —— 键名一改，锚点再也命中不了，抽取恒为 null。
 * 现在只认结构（行 id / 插件名 / `config:` / 恰好一个块标量键），键名写错的罚单由配置镜
 * `scripts/gates/preset-config-schema.mjs` 开（它读同一个 schema）。
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

/**
 * persona 行的**结构**定位：认形状，不认配置键名。
 *
 * 为什么不再钉键名（2026-09-17 实测）：上游 2.0.10 把 `@deepseek-ai/dsh-persona` 的配置键
 * 从 `text` 改成了**必填**的 `prefix`，而本文件把 `text: |-` 写死进正则 —— 键名一改，
 * 锚点再也命中不了，抽取返回 null，判据报「空转」而不是静默放行（这一步是对的），
 * 但每跟一次基座就要有人来改一次字面量。这就是「一条事实多个家」：
 * **键名的家是插件自己的 `Config`，不是本文件的正则** —— 键名写错的罚单归配置镜开
 * （`scripts/gates/preset-config-schema.mjs` 按插件真实 schema 判，实得 `$.prefix missing required value`），
 * 本文件只负责「把这行里的正文读出来 / 写回去」。
 *
 * 只认结构：`- id: persona` → `  name: '<pkg>'` → `  config:` → 恰好**一个**字面块标量键
 * （键名任意，写回时原样保留、不重命名）。0 个（内联标量）或 ≥2 个（如 prefix + suffix 同时是块标量）
 * 都必须响亮失败：猜错键会把人格写进 `suffix`，而读出来的仍是旧正文 —— 两边都不报错，只有行为变了。
 */
const ROW_ID = '- id: persona'
/** 引号单双都认：那是同一个 YAML 值，钉引号字符与钉键名是同一类缺陷。 */
const ROW_NAME = /^ {2}name: (['"])@deepseek-ai\/dsh-persona\1$/
const CONFIG_LINE = '  config:'
/** config 块内的正文键行：`    <key>: |-`（`|`/`|-`/`|+` 都是字面块标量；`>` 折行块不算，折行会改行语义）。 */
const BODY_KEY_LINE = /^ {4}([A-Za-z_][A-Za-z0-9_-]*): (\|[-+]?)$/
/** 块标量的内容缩进（`    <key>: |-` 之下 6 格，与既有组合文件一致）。 */
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
 * 定位 persona 行的正文块标量。
 *
 * @param {string} yml
 * @returns {{ok: true, at: number, key: string} | {ok: false, code: string, detail: string}}
 *   `at` 是正文键行的行下标（0 基）。
 */
function locatePersonaBody(yml) {
  if (yml.includes('\r\n')) {
    return { ok: false, code: 'crlf', detail: '文件是 CRLF 行尾，本判据只认 LF（钉 `|-` 行尾的旧实现同样会漏）' }
  }
  const lines = yml.split('\n')
  const at = lines.findIndex((l) => l === ROW_ID)
  if (at < 0) return { ok: false, code: 'no-row', detail: `全文没有顶层的 \`${ROW_ID}\` 行` }
  const nameLine = lines[at + 1] ?? ''
  if (!ROW_NAME.test(nameLine)) {
    return { ok: false, code: 'name-changed', detail: `${ROW_ID} 行下面是 ${JSON.stringify(nameLine)}，不是 persona 插件的行` }
  }
  const configLine = lines[at + 2] ?? ''
  if (configLine !== CONFIG_LINE) {
    return { ok: false, code: 'no-config', detail: `${ROW_ID} 行下面第 3 行是 ${JSON.stringify(configLine)}，不是 \`config:\`` }
  }
  // config 块 = 缩进 ≥3 的连续行；下一条 `- id:` 在 0 列，天然止步。
  let blockEnd = at + 3
  while (blockEnd < lines.length && (lines[blockEnd].trim() === '' || /^ {3}/.test(lines[blockEnd]))) blockEnd++
  const keys = []
  for (let i = at + 3; i < blockEnd; i++) {
    const m = BODY_KEY_LINE.exec(lines[i])
    if (m) keys.push({ at: i, key: m[1] })
  }
  if (keys.length === 0) {
    return { ok: false, code: 'no-block-scalar', detail: 'config 下没有字面块标量键（写成内联标量了？）' }
  }
  if (keys.length > 1) {
    return {
      ok: false,
      code: 'multi-block-scalar',
      detail: `config 下有 ${keys.length} 个块标量键：${keys.map((k) => k.key).join('、')} —— 猜错键会把人格写进别的键`,
    }
  }
  return { ok: true, at: keys[0].at, key: keys[0].key }
}

/** 把定位失败翻译成「下一个人该看哪一眼」。 */
function anchorReason(found) {
  return `${found.detail}（${found.code}）—— 不猜、不做模糊匹配：形状变了就必须有人来看一眼`
}

/**
 * 从块标量首行之后读到块尾。边界按 YAML 块标量语义：内容行是「空行」或「缩进 >= 6 的非空行」，
 * 到第一个「非空且缩进 < 6」的行为止 —— 后面就是 `- id: agent-instructions`。
 *
 * @param {string[]} restLines 正文键行之后的全部行
 * @returns {{text: string, end: number}} text 已去掉尾部空行；end 是块尾在 restLines 里的下标
 */
function readBodyBlock(restLines) {
  const out = []
  let end = 0
  for (; end < restLines.length; end++) {
    const line = restLines[end]
    if (line === '' || /^\s*$/.test(line)) { out.push(''); continue }
    if (line.startsWith(BODY_INDENT)) { out.push(line.slice(BODY_INDENT.length)); continue }
    break
  }
  // 吸收正文与下一行之间多余的空行，只留一个（渲染结果自带结尾换行）。
  while (end > 0 && /^\s*$/.test(restLines[end - 1] ?? '')) end--
  while (out.length > 0 && out[out.length - 1] === '') out.pop()
  return { text: out.join('\n'), end }
}

/**
 * 用 `body` 替换 `yml` 里 persona 行的块标量内容，返回新文本。定位不到则抛错。
 *
 * @param {string} yml
 * @param {string} body
 * @returns {string}
 */
export function replacePersonaBody(yml, body) {
  const found = locatePersonaBody(yml)
  if (!found.ok) {
    throw new Error(`agent.cordis.yml 里读不出 persona 行的正文：${anchorReason(found)}`)
  }
  const lines = yml.split('\n')
  const head = `${lines.slice(0, found.at + 1).join('\n')}\n`
  const rest = lines.slice(found.at + 1)
  const { end } = readBodyBlock(rest)
  return head + renderPersonaText(body) + rest.slice(end).join('\n')
}

/** 抽出现有 persona 行的块内容（用于 `--check` 与门禁比对）。定位不到返回 null。 */
export function extractPersonaBody(yml) {
  const found = locatePersonaBody(yml)
  if (!found.ok) return null
  return readBodyBlock(yml.split('\n').slice(found.at + 1)).text
}

/** 抽不到时的原因（由 `personaAnchorProblem` 提供给门禁，省掉一次「为什么空转」的现场勘查）。 */
export function personaAnchorProblem(yml) {
  const found = locatePersonaBody(yml)
  return found.ok ? null : anchorReason(found)
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
  const anchorProblem = personaAnchorProblem(yml)
  const next = body
  const drifted = current !== next

  if (!check && !dryRun && drifted) writeAtomic(cordisPath, replacePersonaBody(yml, body))

  const facts = {
    soulPath, cordisPath,
    bodyChars: body.length,
    bodyLines: body.split('\n').length,
    currentChars: current?.length ?? null,
    anchorProblem,
    drifted,
    wrote: !check && !dryRun && drifted,
  }
  if (asJson) console.log(JSON.stringify(facts, null, 2))
  else {
    console.log(`persona 同源同步器 | 源 ${soulPath}`)
    console.log(`  目标 ${cordisPath}`)
    console.log(`  SOUL.md 正文 ${facts.bodyChars} 字符 / ${facts.bodyLines} 行`)
    console.log(`  现有 persona 行 ${facts.currentChars ?? '(锚点未命中)'} 字符`)
    if (anchorProblem) console.log(`  ✗ 锚点：${anchorProblem}`)
    if (dryRun) console.log('  --dry-run：只打印，不写盘')
    else if (check) console.log(drifted ? '  ✗ 漂移：persona 行 != SOUL.md 渲染结果' : '  ✓ 一致')
    else console.log(drifted ? '  ✓ 已写回（persona 行 = SOUL.md 渲染结果）' : '  ✓ 无需改动（已一致）')
  }
  process.exit(check && (drifted || anchorProblem) ? 1 : 0)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
