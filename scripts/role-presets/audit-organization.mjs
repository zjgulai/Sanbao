#!/usr/bin/env node
/**
 * 53 数字员工组织一致性审计（只报告，不阻塞；ADR-0129 P4 / research-16 的正式化）。
 *
 * 维度（与 docs/research/16-organization-audit-53-roles.md §1 表一致）：
 *   A1 AGT 属性完备性       role-catalog 18 必备字段 + production_authorized=false
 *   A2 协作声明             collaborates_with 悬空引用 = ERROR；非对称 = INFO（有向边语义，
 *                           材料 D-066 / ADR-0129 D7——枢纽岗被指不回指是设计意图）
 *   A3 协作图参与           collaboration-graph 是 Case 编排图（角色↔角色边恒为 0 是事实陈述）；
 *                           任何 AGT 在图中零参与 = WARN
 *   A4 引用闭合             flows/scenarios 悬空 = ERROR
 *   A5 MGT 覆盖闭合         两管理域 AGT 覆盖并集 = 全集且零双线 = ERROR 级；层内覆盖单独核
 *   A6 MGT 属性完备性       15 必备字段 + production_authorized=false + case_role_participation=false
 *   A7 技能映射             skill-map 覆盖两侧全部技能名（缺条目 = ERROR）；gap 率聚合报告
 *   A8 产物一致性           order/icon 唯一、T0 按各自期望集在位、披露段在位、
 *                           MGT 状态披露块在位（评估载体姿态可核对）
 *   A9 快照传染面           AGT shared hashes 一致性读数（INFO：任一共享源改动 = 50 全量重生成）
 *
 * 用法：
 *   node scripts/role-presets/audit-organization.mjs           # 人读报告
 *   node scripts/role-presets/audit-organization.mjs --json    # 机器可读
 * 退出码：存在 ERROR 级发现时为 1，否则 0（WARN/INFO 不阻塞——这是审计不是门禁；
 * 门禁化的判据住在 verify-lossless 与 scripts/gates/，两处不重叠）。
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const MATERIAL_ROOT = process.env.ROLE_MATERIAL_ROOT || '/Users/lute/project/AI组织变革'
const DOCS = join(MATERIAL_ROOT, 'docs')
const OUT_ROOT = process.env.ROLE_PRESET_OUT || join(homedir(), '.dsh', '.agent-presets')
const SKILL_MAP_PATH = join(HERE, 'skill-map.json')
const GENERIC_MANIFEST =
  process.env.ROLE_GENERIC_MANIFEST ||
  join(HERE, '..', '..', 'packages', 'capabilities', 'dsh-overseas-skills', 'manifest', 'generic-skills.json')
const MGT_T0_EXCLUDED = ['meeting-minutes', 'xindaya-translator', 'kami']
const AS_JSON = process.argv.includes('--json')

const raw = (rel) => readFileSync(join(DOCS, rel), 'utf8')
const findings = []
const F = (sev, area, msg) => findings.push({ sev, area, msg })

// ── A1 AGT 属性完备性 ────────────────────────────────────────────────────────
const rc = JSON.parse(raw('05-agents/role-catalog.json'))
const REQ = ['id', 'group', 'alias', 'title', 'mission', 'personality', 'principle', 'skills', 'artifact',
  'metrics', 'collaborates_with', 'scenarios', 'boundary', 'status', 'production_authorized', 'flows',
  'playbooks', 'autonomy']
for (const r of rc.roles) {
  const missing = REQ.filter((k) => r[k] === undefined || r[k] === null || r[k] === '')
  if (missing.length) F('WARN', 'A1', `${r.id} 缺字段: ${missing.join(',')}`)
  if (r.production_authorized !== false) F('ERROR', 'A1', `${r.id} production_authorized=${r.production_authorized}`)
  const n = (r.skills || []).length
  if (n !== 3 && r.id !== 'AGT-002') F('INFO', 'A1', `${r.id} skills=${n}（期望3；AGT-002=4 为登记例外，材料 D-066③）`)
}

// ── A2 协作声明（有向边语义，D7）─────────────────────────────────────────────
const byId = new Map(rc.roles.map((r) => [r.id, r]))
let declared = 0
let asym = 0
const inbound = {}
for (const r of rc.roles) {
  for (const c of r.collaborates_with || []) {
    declared++
    const t = byId.get(c)
    if (!t) { F('ERROR', 'A2', `${r.id} → ${c} 悬空引用（指向不存在岗位）`); continue }
    if (!(t.collaborates_with || []).includes(r.id)) {
      asym++
      inbound[c] = (inbound[c] || 0) + 1
    }
  }
}
F('INFO', 'A2', `collaborates_with ${declared} 条有向声明，非对称 ${asym} 条（有向边语义下属设计意图；入度Top: ${Object.entries(inbound).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k}×${v}`).join(' ')}）`)

// ── A3 协作图参与 ────────────────────────────────────────────────────────────
const cg = JSON.parse(raw('07-orchestration/collaboration-graph.json'))
const touched = new Set()
for (const e of cg.edges) { touched.add(e.from); touched.add(e.to) }
for (const c of cg.role_contributions || []) touched.add(c.role_id)
const rr = cg.edges.filter((e) => /^AGT/.test(e.from || '') && /^AGT/.test(e.to || '')).length
if (rr !== 0) F('INFO', 'A3', `collaboration-graph 出现 ${rr} 条角色↔角色边（材料 D-066②：该图应为 Case 编排图，角色间协作事实住在 role-catalog）`)
for (const r of rc.roles) if (!touched.has(r.id)) F('WARN', 'A3', `${r.id}（${r.alias}）在协作图零参与`)

// ── A4 引用闭合 ──────────────────────────────────────────────────────────────
const flowIds = new Set((cg.flows || []).map((f) => f.id))
const scenIds = new Set((cg.scenarios || []).map((s) => s.id))
for (const r of rc.roles) {
  for (const f of r.flows || []) if (!flowIds.has(f)) F('ERROR', 'A4', `${r.id} flow ${f} 悬空`)
  for (const s of r.scenarios || []) if (!scenIds.has(s)) F('ERROR', 'A4', `${r.id} scenario ${s} 悬空`)
}

// ── A5/A6 MGT 覆盖闭合与属性 ─────────────────────────────────────────────────
const mcPath = '04-organization/management/management-catalog.json'
if (!existsSync(join(DOCS, mcPath))) {
  F('ERROR', 'A5', `management-catalog 缺失：${mcPath}`)
} else {
  const mc = JSON.parse(raw(mcPath))
  const allAgt = new Set(rc.roles.map((r) => r.id))
  const mgtIds = new Set(mc.roles.map((r) => r.id))
  const covered = new Map()
  for (const m of mc.roles) {
    for (const o of m.owned_role_ids || []) {
      if (mgtIds.has(o)) continue // 层内覆盖（CEO→两位负责人），不计入 AGT 覆盖
      if (!allAgt.has(o)) F('ERROR', 'A5', `${m.id} owned ${o} 不在 AGT 集合`)
      else if (covered.has(o)) F('ERROR', 'A5', `${o} 双线归属：${covered.get(o)} 与 ${m.id}`)
      else covered.set(o, m.id)
    }
  }
  for (const a of allAgt) if (!covered.has(a)) F('ERROR', 'A5', `${a} 无管理域覆盖`)
  if (covered.size === allAgt.size) F('INFO', 'A5', `MGT 覆盖闭合：${covered.size}/${allAgt.size}，双线 0`)
  const MREQ = ['id', 'alias', 'title', 'mission', 'personality', 'principle', 'skills', 'artifact', 'metrics',
    'decision_rights', 'decision_rights_explicitly_not_granted', 'boundary', 'autonomy', 'owned_role_ids', 'collaborates_with']
  for (const m of mc.roles) {
    const missing = MREQ.filter((k) => m[k] === undefined)
    if (missing.length) F('WARN', 'A6', `${m.id} 缺字段: ${missing.join(',')}`)
    if (m.production_authorized !== false) F('ERROR', 'A6', `${m.id} production_authorized != false`)
    if (m.autonomy?.case_role_participation !== false) F('ERROR', 'A6', `${m.id} case_role_participation != false`)
    if (m.autonomy?.profile_loadable !== true) F('WARN', 'A6', `${m.id} profile_loadable != true（评估载体姿态要求可加载）`)
    for (const c of m.collaborates_with || []) {
      const t = mc.roles.find((x) => x.id === c)
      if (!t) F('ERROR', 'A6', `${m.id} collaborates_with ${c} 悬空`)
      else if (!(t.collaborates_with || []).includes(m.id)) F('WARN', 'A6', `MGT 协作非对称：${m.id} → ${c}（管理层三人应互为对称）`)
    }
  }
  const dsh = mc.dsh_integration
  if (!dsh || dsh.authorization_status !== 'evaluation_carrier_not_shadow_authorized') {
    F('ERROR', 'A6', 'management-catalog 缺 dsh_integration 或授权姿态不是评估载体（材料 D-065）')
  }
}

// ── A7 技能映射覆盖与 gap 聚合 ───────────────────────────────────────────────
const sm = JSON.parse(readFileSync(SKILL_MAP_PATH, 'utf8')).skills
const kinds = {}
for (const v of Object.values(sm)) kinds[v.kind] = (kinds[v.kind] || 0) + 1
const declaredNames = new Set()
for (const r of rc.roles) for (const s of r.skills || []) declaredNames.add(s)
{
  const mcFile = join(DOCS, mcPath)
  if (existsSync(mcFile)) {
    const mc = JSON.parse(readFileSync(mcFile, 'utf8'))
    for (const m of mc.roles) for (const s of m.skills || []) declaredNames.add(s)
  }
}
for (const n of declaredNames) if (!sm[n]) F('ERROR', 'A7', `材料技能名未入映射表 → ${n}`)
F('INFO', 'A7', `skill-map ${Object.keys(sm).length} 条（材料声明 ${declaredNames.size} 名全覆盖）；kinds=${JSON.stringify(kinds)}`)

// ── A8 产物一致性 ────────────────────────────────────────────────────────────
const genericSkills = existsSync(GENERIC_MANIFEST) ? JSON.parse(readFileSync(GENERIC_MANIFEST, 'utf8')).skills || [] : []
const allT0 = genericSkills.filter((s) => s.tier === 'T0').map((s) => s.name)
const mgtT0 = allT0.filter((s) => !MGT_T0_EXCLUDED.includes(s))
if (existsSync(OUT_ROOT)) {
  const dirs = readdirSync(OUT_ROOT).filter((d) => /^(agt|mgt)-\d{3}$/.test(d))
  const orders = new Map()
  const icons = new Map()
  for (const d of dirs) {
    const ymlP = join(OUT_ROOT, d, 'preset.yml')
    const corP = join(OUT_ROOT, d, 'agent.cordis.yml')
    if (!existsSync(ymlP) || !existsSync(corP)) { F('ERROR', 'A8', `${d} 产物缺失`); continue }
    const yml = readFileSync(ymlP, 'utf8')
    const order = Number(yml.match(/^order:\s*(\d+)$/m)?.[1])
    if (Number.isFinite(order)) {
      if (orders.has(order)) F('ERROR', 'A8', `order ${order} 撞号：${orders.get(order)} 与 ${d}`)
      orders.set(order, d)
    }
    const icon = yml.match(/^icon: '([^']+)'/m)?.[1]
    if (icon) {
      const h = createHash('sha256').update(icon).digest('hex').slice(0, 16)
      if (icons.has(h)) F('ERROR', 'A8', `icon 重复：${icons.get(h)} 与 ${d}`)
      icons.set(h, d)
    } else F('ERROR', 'A8', `${d} preset.yml 缺 icon`)
    const cor = readFileSync(corP, 'utf8')
    const line = cor.split('\n').find((l) => l.trim().startsWith('skills: ['))
    const subset = line ? [...line.matchAll(/'([^']+)'/g)].map((m) => m[1]) : []
    const expectT0 = d.startsWith('mgt-') ? mgtT0 : allT0
    for (const s of expectT0) if (!subset.includes(s)) F('ERROR', 'A8', `${d} T0 期望集缺 ${s}`)
    if (d.startsWith('mgt-')) {
      for (const s of MGT_T0_EXCLUDED) if (subset.includes(s)) F('ERROR', 'A8', `${d} 含 T0 剔除项 ${s}`)
      if (!cor.includes('── 状态披露')) F('ERROR', 'A8', `${d} persona 缺状态披露块（ADR-0129 D1）`)
      if (!cor.includes('evaluation_carrier_not_shadow_authorized')) F('ERROR', 'A8', `${d} 状态披露缺授权姿态`)
    }
    if (!cor.includes('技能供给实况')) F('WARN', 'A8', `${d} persona 缺技能供给实况披露段`)
  }
  F('INFO', 'A8', `产物 ${dirs.length} 个：order 唯一 ${orders.size}、icon 唯一 ${icons.size}（AGT T0 ${allT0.length} / MGT T0 ${mgtT0.length}）`)
} else {
  F('WARN', 'A8', `产物根不存在：${OUT_ROOT}`)
}

// ── A9 快照传染面 ────────────────────────────────────────────────────────────
{
  const m1P = join(OUT_ROOT, 'agt-001', 'manifest.json')
  const m50P = join(OUT_ROOT, 'agt-050', 'manifest.json')
  if (existsSync(m1P) && existsSync(m50P)) {
    const h1 = JSON.parse(readFileSync(m1P, 'utf8')).source_snapshot?.shared_source_hashes
    const h50 = JSON.parse(readFileSync(m50P, 'utf8')).source_snapshot?.shared_source_hashes
    F('INFO', 'A9', `AGT shared_source_hashes 首尾一致=${JSON.stringify(h1) === JSON.stringify(h50)}（任一共享源改动 = 50 全量重生成；MGT 共享源独立，见 ADR-0129 D3/D4）`)
  }
}

// ── 输出 ─────────────────────────────────────────────────────────────────────
const errors = findings.filter((f) => f.sev === 'ERROR')
if (AS_JSON) {
  console.log(JSON.stringify({
    auditedAt: new Date().toISOString(),
    materialRoot: MATERIAL_ROOT,
    outRoot: OUT_ROOT,
    counts: {
      ERROR: errors.length,
      WARN: findings.filter((f) => f.sev === 'WARN').length,
      INFO: findings.filter((f) => f.sev === 'INFO').length,
    },
    findings,
  }, null, 2))
} else {
  console.log(`组织一致性审计 · 材料根 ${MATERIAL_ROOT} · 产物根 ${OUT_ROOT}`)
  for (const f of findings) console.log(`${f.sev}\t[${f.area}]\t${f.msg}`)
  console.log(`\n合计 ${findings.length}（ERROR ${errors.length} / WARN ${findings.filter((f) => f.sev === 'WARN').length} / INFO ${findings.filter((f) => f.sev === 'INFO').length}）`)
}
process.exit(errors.length > 0 ? 1 : 0)
