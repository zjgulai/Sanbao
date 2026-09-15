#!/usr/bin/env node
/**
 * build-generic-manifest.mjs — 由来件元数据生成**通用技能线**的归位事实源。
 *
 * ## 数据流（每个事实只有一个家，ADR-0009）
 *
 * ```
 * staging/intake-localize.json   四件套 + 分组 + 不挂岗理由   ← 单人撰写的事实源
 * manifest/intake-provenance.json 批次 / 原始单元 / 许可证 / 修补 ← 安装时留底
 *            ↓ 本脚本（派生机械，唯一的人工判断是下面的 tier 名单）
 * manifest/generic-skills.json   通用线的分组、tier、行记录   ← 归位与接线的**发布副本**
 *            ↓ 被 4 处消费
 *   build_preset_catalog.py  → lib/catalog.js 的 CATEGORIES_GN / SKILLS_GN
 *   assign_lute_icons.py     → manifest/category-icons-gn.json + skill-icons-gn.json
 *   verify-generic.mjs       → 判据
 *   scripts/role-presets/generate.mjs → T0 并入全部 50 个 preset 的 skill-subset
 * ```
 *
 * ## 为什么不像全栈线那样分成 mapping + manifest 两份
 *
 * 全栈线有两份文件（`scripts/fullstack-mapping.json` 与 `manifest/fullstack-skills.json`），
 * 内容高度重叠。同一批事实放两个家会漂移，而漂移只能靠人对齐——那是纪律不是机制。
 * 通用线只保留**一份**，其余全部由它派生；本脚本是派生器，不是第二个家。
 *
 * ## tier 的含义
 *
 * - `T0`：常挂**全部**岗位 preset（≈1,900 tok/会话）。判据是「任何岗位都用得上，
 *   且不产出该岗位三条责任所要求的工作产物」——所以它不挂岗，而是作为底座。
 * - `T1`：按岗位族挂。**本批为空**，扩容时在 `TIER_BY_NAME` 里登记。
 *
 * 用法：node scripts/build-generic-manifest.mjs [--check]
 *   --check 只比对不写盘，供门禁使用：一致 → 0；与磁盘不一致（数据缺陷）→ 1；
 *   派生源 `staging/` 不在本机（环境事实，不入库）→ **2**，调用方按「跳过」处理。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const LOCALIZE = join(ROOT, 'staging', 'intake-localize.json')
const PROVENANCE = join(ROOT, 'manifest', 'intake-provenance.json')
const OUT = join(ROOT, 'manifest', 'generic-skills.json')

/** 用途分组的显示顺序与 key。分组标题来自 intake-localize 的 `genericGroup`（逐条读过原文写的），此处只给 key 与顺序。 */
const GROUP_ORDER = [
  ['gn-writing', '文档与写作'],
  ['gn-data', '数据与表格'],
  ['gn-visual', '演示与图表'],
  ['gn-meeting', '会议与协作'],
  ['gn-process', '流程与规范'],
  ['gn-decision', '决策与评估'],
  ['gn-translation', '翻译与本地化'],
  ['gn-parsing', '资料解析'],
]

/**
 * 技能 → tier。**T0 名单的家就是这里**，不再在任何别处抄第二份。
 * 扩容到 T1(30) 时在此追加 `'<name>'`。
 */
const T0_NAMES = [
  'meeting-minutes',
  'humanizer-zh',
  'validate-data',
  'copy-editor',
  'audience-adapter',
  'work-report-writer',
  'sop-writer',
  'weighted-scoring',
  'xindaya-translator',
  'markdown-mermaid-writing',
  'guizang-ppt-skill',
  'chart-gen',
  'sn-da-excel-workflow',
  'sn-da-non-spreadsheet-analysis',
  'minimax-pdf',
]
const TIER_BY_NAME = Object.fromEntries(T0_NAMES.map((n) => [n, 'T0']))

function build() {
  if (!existsSync(LOCALIZE)) throw new Error(`读不到四件套事实源：${LOCALIZE}`)
  const localize = JSON.parse(readFileSync(LOCALIZE, 'utf8'))
  const provenance = existsSync(PROVENANCE) ? JSON.parse(readFileSync(PROVENANCE, 'utf8')) : { skills: {} }
  const prov = provenance.skills ?? {}

  const groups = GROUP_ORDER.map(([key, title]) => ({ key, title }))
  const titleByGroup = new Map(groups.map((g) => [g.title, g.key]))
  const problems = []

  const skills = []
  for (const s of localize.skills) {
    if (s.catalog !== 'generic') continue
    const category = titleByGroup.get(s.genericGroup)
    if (!category) {
      problems.push(`${s.name}: genericGroup「${s.genericGroup}」不在 GROUP_ORDER 的 8 组里`)
      continue
    }
    const p = prov[s.name] ?? {}
    skills.push({
      src: s.src ?? s.name,
      name: s.name,
      title: s.title,
      category,
      categoryTitle: s.genericGroup,
      tier: TIER_BY_NAME[s.name] ?? (problems.push(`${s.name}: 未登记 tier`) && 'T1'),
      summaryZh: s.summaryZh,
      userSummary: s.userSummary ?? '',
      triggers: s.triggers ?? [],
      notUse: s.notUse ?? '',
      userTry: s.userTry ?? '',
      noRoleKind: s.noRoleKind ?? '',
      noRoleReason: s.noRoleReason ?? '',
      source: s.source ?? p.batch ?? '',
      license: p.license ?? s.license ?? '',
      toolBacked: false,
      toolGap: '',
      icon: '',
    })
  }
  skills.sort((a, b) => {
    const gi = groups.findIndex((g) => g.key === a.category) - groups.findIndex((g) => g.key === b.category)
    return gi !== 0 ? gi : a.name.localeCompare(b.name)
  })

  // 分组不许空转：一个组如果一条技能都没有，它只是页面上的一格空白。
  const used = new Set(skills.map((s) => s.category))
  for (const g of groups) if (!used.has(g.key)) problems.push(`分组 ${g.key}（${g.title}）下没有任何技能`)

  const t0 = skills.filter((s) => s.tier === 'T0').map((s) => s.name).sort()
  const t1 = skills.filter((s) => s.tier === 'T1').map((s) => s.name).sort()

  const out = {
    _meta: {
      purpose: '通用技能线：分组 + tier + 行记录。归位（哪些技能属这条线）与接线（T0 常挂全部 preset）的唯一事实源。',
      schema: 'groups[{key,title}] / skills[{src,name,title,category,categoryTitle,tier,summaryZh,userSummary,triggers,notUse,userTry,noRoleKind,noRoleReason,source,license,toolBacked,toolGap,icon}]',
      generatedBy: 'scripts/build-generic-manifest.mjs（派生机械；唯一的人工判断是 T0 分档，家在 build-generic-manifest.mjs 的 T0_NAMES）',
      tierMeaning: 'T0 = 常挂全部岗位 preset 的通用底座；T1 = 按岗位族挂。T0 名单的家是 build-generic-manifest.mjs 的 T0_NAMES（TIER_BY_NAME 由它派生）。',
      wiring: 'T0 由 scripts/role-presets/generate.mjs 生成时并入每个 agt-* preset 的 skill-subset；此处不写进任何 preset 文件。',
      counts: { groups: groups.length, skills: skills.length, T0: t0.length, T1: t1.length },
    },
    groups,
    skills,
  }

  return { out, problems, t0, t1 }
}

/**
 * `--check` 的**前提**：派生源 `staging/intake-localize.json` 在不在本机。
 *
 * `staging/` 按 `.gitignore:44` 不入库（那是撰写期的素材区，1,500+ 文件），
 * 于是**任何一份干净的 clone 上都没有它**——而 `manifest/generic-skills.json` 是入库的
 * 派生产物。若不区分这两种非零，verifier 会把「派生源不在本机」（环境事实）报成
 * 「清单与派生源不一致」（数据缺陷）：前者的修法是「别跑这一项」，后者是「重建清单」，
 * 一句红字同时说两件事，两条路都不会被走（ADR-0085 §③ 给 `verify-fullstack` 诊过的同一个病）。
 *
 * 约定：`--check` 且派生源不在 → 退出码 **2** + 本行说明，调用方按「跳过」处理；
 * 退出码 1 一律是数据缺陷。非 `--check`（真重建）时缺源仍是硬错——没有源就重建不出东西。
 */
const check = process.argv.includes('--check')
if (check && !existsSync(LOCALIZE)) {
  console.log(`⏭ 派生源不在本机（${LOCALIZE}；staging/ 不入库）—— 本项无射程，跳过比对`)
  console.log('  入库的 manifest/generic-skills.json 即事实源；要改名单请在有 staging/ 的撰写机上改 T0_NAMES 后重跑')
  process.exit(2)
}

const { out, problems, t0, t1 } = build()
if (problems.length) {
  console.error('✗ 通用线清单构建失败:')
  for (const p of problems) console.error('  - ' + p)
  process.exit(1)
}

const text = JSON.stringify(out, null, 2) + '\n'
if (check) {
  const prev = existsSync(OUT) ? readFileSync(OUT, 'utf8') : ''
  if (prev !== text) {
    console.error('✗ manifest/generic-skills.json 与派生源不一致——跑 `node scripts/build-generic-manifest.mjs` 重建')
    process.exit(1)
  }
  console.log(`✓ 通用线清单一致：${out.groups.length} 组 / ${out.skills.length} 条（T0 ${t0.length} / T1 ${t1.length}）`)
} else {
  writeFileSync(OUT, text, 'utf8')
  console.log(`✓ manifest/generic-skills.json 已写出：${out.groups.length} 组 / ${out.skills.length} 条（T0 ${t0.length} / T1 ${t1.length}）`)
  console.log(`  T0：${t0.join(', ')}`)
}
