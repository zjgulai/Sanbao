#!/usr/bin/env node
/**
 * build-fullstack-catalog.mjs — 重建「AI全栈」技能线的**目录**（分组 + 行集 + 名单）。
 *
 * ## 为什么需要它
 *
 * 技能中心第三条线（AI全栈）的分组在 2026-09-16 之前是 8 个按**做法**分的类
 * （需求澄清 / 规格规划 / 架构设计 / 实现 / 质量排查 / 工程基建 / 协作复盘 / 写作内容），
 * 而这份 preset 的派活链是 M00–M13 十四个**交付节点**。两套轴不是一回事：
 * 「grilling 属于需求澄清」说的是这条技能像什么，而「grilling 服务于 M03 用户研究」说的才是
 * 它在交付链的哪一段。8 组的分类（`catOld`）保留了，但它不能决定页面挂法 ——
 * 否则 persona 里那张 M00–M13 派活表与页面上看到的组名对不上，模型说「走 M09」时人看不到 M09。
 *
 * ## 一份事实一个家
 *
 * 节点键与标题的**唯一事实源**是本文件的 `NODES`。它派生三份产物，三份都不许手改：
 *
 *   · `scripts/fullstack-mapping.json` 的 `categories`（存量 70 条的分组表）
 *   · `manifest/fullstack-skills.json`  的 `categories` + `skills`（页面读的那一份）
 *   · `manifest/taxonomy-v3.json` 的 `fullstackNames`（名单，verify_static 逐字比对）
 *
 * 行集是两份来源的**并集**：`fullstack-mapping.json`（存量 70，带 title/summaryZh）
 * 与 `fullstack-extra.json`（新增 68，带 titleZh/summaryZh）。两份的 `cat` 都已经是 Mxx，
 * 本脚本只做归并、校验与落盘，不重新判定归属 —— 归属是人做的判断，不该埋在脚本里。
 *
 * ## 用法
 *
 *   node scripts/build-fullstack-catalog.mjs            # 重建三份产物
 *   node scripts/build-fullstack-catalog.mjs --check    # 只比对，不写；有漂移退出码 1
 *   node scripts/build-fullstack-catalog.mjs --json
 */
import { readFileSync, writeFileSync, renameSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const MAPPING = join(HERE, 'fullstack-mapping.json')
const EXTRA = join(HERE, 'fullstack-extra.json')
const MANIFEST_FS = join(ROOT, 'manifest', 'fullstack-skills.json')
const TAXONOMY = join(ROOT, 'manifest', 'taxonomy-v3.json')

/**
 * M00–M13：节点键、节点号与中文标题。**唯一事实源。**
 *
 * 标题与 preset 的 persona 派活表逐字一致（`presets/agent-fullstack/SOUL.md` 的第三节），
 * 页面上看到的组名就是模型说的那个节点 —— 两边不一致时，「走 M09」这句话在人眼里就没有落点。
 */
export const NODES = [
  { key: 'm00', id: 'M00', title: 'M00 全局上下文与流程控制' },
  { key: 'm01', id: 'M01', title: 'M01 项目初始化与治理' },
  { key: 'm02', id: 'M02', title: 'M02 机会与市场调研' },
  { key: 'm03', id: 'M03', title: 'M03 用户研究与问题定义' },
  { key: 'm04', id: 'M04', title: 'M04 产品策略与范围决策' },
  { key: 'm05', id: 'M05', title: 'M05 领域模型与产品规格' },
  { key: 'm06', id: 'M06', title: 'M06 原型与 UX 验证' },
  { key: 'm07', id: 'M07', title: 'M07 架构与垂直切片' },
  { key: 'm08', id: 'M08', title: 'M08 实现、TDD 与调试' },
  { key: 'm09', id: 'M09', title: 'M09 AI Eval、质量与安全' },
  { key: 'm10', id: 'M10', title: 'M10 发布、CI 与部署' },
  { key: 'm11', id: 'M11', title: 'M11 可观测性、事故与用户反馈' },
  { key: 'm12', id: 'M12', title: 'M12 产品分析、实验与增长' },
  { key: 'm13', id: 'M13', title: 'M13 复盘、Memory 与 Skill 演进' },
]

const KEY_BY_ID = new Map(NODES.map((n) => [n.id, n.key]))
const TITLE_BY_KEY = new Map(NODES.map((n) => [n.key, n.title]))

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))
const writeAtomic = (p, text) => {
  const tmp = `${p}.tmp-${process.pid}`
  writeFileSync(tmp, text)
  renameSync(tmp, p)
}

/**
 * 归并两份来源 → 138 行，按节点顺序、节点内保持各文件原序。
 *
 * 为什么不排序：行序就是页面上的卡片序。节点内保持来源原序，人一旦发现某条挂错了节点，
 * 改动在 diff 里只体现为「这一条换了组」，而不会被整体重排淹没。
 *
 * @returns {{rows: Array<object>, problems: string[]}}
 */
export function mergeRows() {
  const problems = []
  const mapping = readJson(MAPPING)
  const extra = readJson(EXTRA)

  const seen = new Map()
  const take = (name, cat, title, summaryZh, origin) => {
    if (!name || !cat) { problems.push(`${origin}: 缺 name 或 cat`); return }
    if (!KEY_BY_ID.has(cat)) { problems.push(`${origin}: ${name} 的 cat「${cat}」不在 M00–M13 里`); return }
    if (seen.has(name)) { problems.push(`重名：${name} 同时出现在 ${seen.get(name)} 与 ${origin}`); return }
    if (!title) problems.push(`${origin}: ${name} 缺标题`)
    if (!summaryZh) problems.push(`${origin}: ${name} 缺中文简介`)
    seen.set(name, origin)
    return {
      name,
      title: title ?? name,
      category: KEY_BY_ID.get(cat),
      categoryTitle: TITLE_BY_KEY.get(KEY_BY_ID.get(cat)),
      toolBacked: false,
      summaryZh: summaryZh ?? '',
      toolGap: '',
      icon: '',
      nodeId: cat,
      origin,
    }
  }

  const rows = []
  for (const n of NODES) {
    for (const s of mapping.skills ?? []) {
      if (s.cat !== n.id) continue
      const r = take(s.name, s.cat, s.title, s.summaryZh, 'mapping')
      if (r) rows.push(r)
    }
    for (const s of extra.skills ?? []) {
      if (s.cat !== n.id) continue
      const name = s.installAs ?? s.name
      const r = take(name, s.cat, s.titleZh, s.summaryZh, 'extra')
      if (r) rows.push(r)
    }
  }

  // 两份来源里凡是没被收进来的行都要报出来 —— 静默丢一条的诊断成本远高于在这里红一次。
  const covered = new Set(rows.map((r) => r.name))
  for (const s of mapping.skills ?? []) if (!covered.has(s.name)) problems.push(`mapping: ${s.name} 未被收进任何节点`)
  for (const s of extra.skills ?? []) {
    const name = s.installAs ?? s.name
    if (!covered.has(name)) problems.push(`extra: ${name} 未被收进任何节点`)
  }
  return { rows, problems }
}

/** 期望落盘的 manifest 形状（`skills` 里去掉本脚本自用的溯源字段）。 */
export function expectedManifest(rows) {
  return {
    categories: NODES.map((n) => ({ key: n.key, title: n.title })),
    skills: rows.map(({ name, title, category, categoryTitle, toolBacked, summaryZh, toolGap, icon }) => ({
      name, title, category, categoryTitle, toolBacked, summaryZh, toolGap, icon,
    })),
  }
}

/**
 * `fullstack-mapping.json` 的**新文本**：只换 `categories` 那一段，其余字节原样。
 *
 * 为什么不整份 `JSON.stringify` 重写：那份文件的格式**不是**本脚本的财产 ——
 * 它的家是 `promote-intake-batch.mjs` 的 `writeCompact`（一行一条，70 条技能各占一行）。
 * 第一版本脚本用 pretty JSON 整份重写，结果是 616 行新增 / 78 行删除的**纯格式翻搅**，
 * 真实的改动（8 个旧分组换成 14 个节点）被埋在重排里 —— 而"格式由谁定"这件事
 * 也因此变成两个家。外科式替换后，diff 里只剩真正变了的那几行。
 *
 * @param {string} text 现有文件全文
 * @returns {string}
 */
export function mappingWithNodeCategories(text) {
  const block = ['  "categories": [',
    ...NODES.map((n, i) => `    { "key": ${JSON.stringify(n.key)}, "title": ${JSON.stringify(n.title)} }${i < NODES.length - 1 ? ',' : ''}`),
    '  ],'].join('\n')
  const re = /^ {2}"categories": \[[\s\S]*?^ {2}\],$/m
  if (!re.test(text)) {
    throw new Error('fullstack-mapping.json 里找不到 "categories": [ ... ] 形态的块 —— 不做模糊匹配，形态变了要有人看一眼')
  }
  return text.replace(re, block)
}

/** 期望的 taxonomy 名单（与 manifest 的行同名、同序）。 */
export function expectedNames(rows) {
  return rows.map((r) => r.name)
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function main() {
  const argv = process.argv.slice(2)
  const check = argv.includes('--check')
  const asJson = argv.includes('--json')

  const { rows, problems } = mergeRows()
  const counts = {}
  for (const r of rows) counts[r.nodeId] = (counts[r.nodeId] ?? 0) + 1

  if (problems.length === 0) {
    const manifest = expectedManifest(rows)
    const nextManifest = `${JSON.stringify(manifest, null, 2)}\n`

    // taxonomy：只换 fullstackNames，其余字段逐字保留（这份文件还有别的家的内容）。
    const tax = readJson(TAXONOMY)
    const nextTax = { ...tax, fullstackNames: expectedNames(rows) }
    const nextTaxText = `${JSON.stringify(nextTax, null, 2)}\n`

    // mapping：只换 categories 那一段（格式的家在 promote-intake-batch.mjs 的 writeCompact）；
    // skills 原样 —— `catOld` 是历史归属，留着做溯源。
    const nextMappingText = mappingWithNodeCategories(readFileSync(MAPPING, 'utf8'))

    const drift = {
      manifest: readFileSync(MANIFEST_FS, 'utf8') !== nextManifest,
      taxonomy: readFileSync(TAXONOMY, 'utf8') !== nextTaxText,
      mapping: readFileSync(MAPPING, 'utf8') !== nextMappingText,
    }
    if (!check) {
      if (drift.manifest) writeAtomic(MANIFEST_FS, nextManifest)
      if (drift.taxonomy) writeAtomic(TAXONOMY, nextTaxText)
      if (drift.mapping) writeAtomic(MAPPING, nextMappingText)
    }
    const drifted = Object.entries(drift).filter(([, v]) => v).map(([k]) => k)
    const facts = { rows: rows.length, groups: NODES.length, counts, drift, wrote: !check && drifted.length > 0 }
    if (asJson) console.log(JSON.stringify({ ...facts, problems }, null, 2))
    else {
      console.log('AI全栈目录重建 | 事实源 scripts/fullstack-mapping.json + fullstack-extra.json')
      console.log(`  分组 ${NODES.length} 个 · 行 ${rows.length} 条`)
      console.log('  分布 ' + NODES.map((n) => `${n.id}:${counts[n.id] ?? 0}`).join(' '))
      if (drifted.length === 0) console.log('  ✓ 三份产物与事实源一致')
      else if (check) console.log(`  ✗ 漂移（${drifted.join(', ')}）—— 跑 node scripts/build-fullstack-catalog.mjs 重建`)
      else console.log(`  ✓ 已重建（${drifted.join(', ')}）`)
    }
    process.exit(check && drifted.length > 0 ? 1 : 0)
  }

  if (asJson) console.log(JSON.stringify({ rows: rows.length, problems }, null, 2))
  else {
    console.log('AI全栈目录重建 | 事实源有问题，未落盘')
    problems.forEach((p) => console.log('  - ' + p))
  }
  process.exit(1)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
