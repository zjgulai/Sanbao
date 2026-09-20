#!/usr/bin/env node
/**
 * 50 岗位 AI 分身 + 3 管理岗位 Preset 生成器（全量保真 / lossless，双命名空间）
 *
 * 目标：把《AI组织变革》材料里散落在多个来源的**每一个岗位**的全部信息，
 * 逐字落成一个可挂载的 DSH preset，不摘要、不改名、不丢字段。
 *
 * 两个命名空间（ADR-0129 D2/D3）：
 *   · AGT-001~050 → agt-NNN（执行面，4 组织平面 × 8 责任域）
 *   · MGT-001~003 → mgt-NNN（管理层决策权平面，投影平面 PLN-EXC；评估载体姿态，
 *     未授权 Shadow/生产，出货面走 exclude 档——状态披露块随 persona/manifest 落地）
 *   MGT 分支只读管理层自有材料（04-organization/management/ 等），**不触碰任何 AGT
 *   共享源**（role-catalog/organization-graph/collaboration-graph…），保证存量 50 个
 *   preset 的 cordis/preset.yml 字节零扰动（ADR-0129 D4）。
 *
 * 每个 AGT 岗位信息的 12 个来源：
 *   1. docs/05-agents/roles/AGT-NNN.md          岗位卡全文（7 个 ## 小节）
 *   2. docs/05-agents/role-catalog.json         该岗位 20 字段结构化记录
 *   3. docs/04-organization/organization-graph.json   平面/责任域归属 + 组织边
 *   4. docs/05-agents/agent-management-graph.json     五契约绑定 + 治理边
 *   5. docs/05-agents/agent-lifecycle.json            Role Release Bundle 状态
 *   6. docs/07-orchestration/collaboration-graph.json 角色贡献 + 流程/场景 + 涉及该岗位的边
 *   7. docs/03-scenarios/FLOW-CATALOG.md              该岗位作为能力贡献者的流程条目
 *   8. docs/06-playbooks/PLAYBOOKS.md                 该岗位参与的手册全文
 *   9. docs/05-agents/ROSTER.md                       总表行
 *  10. docs/05-agents/roles/souls/AGT-NNN.soul.md     独立 Soul Contract
 *  11. docs/06-playbooks/role-playbooks/AGT-NNN.md    独立 Role Playbook
 *  12. docs/10-platform/deepseek-harness/preset-blueprints/AGT-NNN.json  Preset Blueprint
 *
 * 每个 MGT 管理岗位信息的 9 个来源（ADR-0129 D3）：
 *   1. docs/04-organization/management/management-catalog.json  结构化记录（共享）
 *   2. docs/04-organization/MANAGEMENT-LAYER.md                 管理层主设计（共享）
 *   3. docs/04-organization/management/DECISION-RIGHTS.md       决策权阶梯（共享）
 *   4. docs/04-organization/management/ENFORCEMENT.md           生效机制（共享）
 *   5. docs/04-organization/management/SHADOW-VERIFICATION.md   验证状态（共享；状态变化传染重生成）
 *   6. docs/04-organization/management/roles/MGT-NNN.md         管理岗位档案
 *   7. docs/04-organization/management/souls/MGT-NNN.soul.md    Soul Contract
 *   8. docs/04-organization/management/playbooks/MGT-NNN.md     Role Playbook
 *   9. docs/04-organization/management/preset-blueprints/MGT-NNN.json  Preset Blueprint
 *
 * 落点（DSH preset 目录）：
 *   ~/.dsh/.agent-presets/agt-001/  （mgt-001/ 同构）
 *     preset.yml        官方显示字段 name/description/order + icon（官方卡片把它渲染成头像）
 *     manifest.json     material 命名空间逐字归档旧来源 + role_assets / source_snapshot + x_lute
 *     agent.cordis.yml  以 shipped standard 行集为基座，persona 注入身份与 Soul 摘要
 *
 * 用法：
 *   node scripts/role-presets/generate.mjs                # 生成到 ~/.dsh/.agent-presets
 *   node scripts/role-presets/generate.mjs --dry-run      # 只打印，不写盘
 *   node scripts/role-presets/generate.mjs --check        # 新鲜度判定：产物记录的源快照 vs 现场重算
 *                                                         # （0=一致 / 1=有漂移并点名共享文件 / 2=读数不可用；不写盘）
 *   ROLE_MATERIAL_ROOT=... ROLE_PRESET_OUT=... node ...   # 覆盖源/目标
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { judgeSourceFreshness, readRecordedSnapshot } from './source-freshness.mjs'

import { unmanagedRowBlocks, reinstateRows } from './unmanaged-rows.mjs'
import { appNodeModules } from '../lib/app-resources.mjs'
const HERE = dirname(fileURLToPath(import.meta.url))
const MATERIAL_ROOT = process.env.ROLE_MATERIAL_ROOT || '/Users/lute/project/AI组织变革'
const DOCS = join(MATERIAL_ROOT, 'docs')
const OUT_ROOT = process.env.ROLE_PRESET_OUT || join(homedir(), '.dsh', '.agent-presets')
const SKILLS_ROOT = process.env.ROLE_SKILLS_ROOT || join(homedir(), '.dsh', 'skills')
const SKILL_MAP_PATH = join(HERE, 'skill-map.json')
/**
 * 通用技能线清单（T0 的**发布副本**，本文件只读不写）。
 *
 * 为什么把 T0 写进**每一个**岗位 preset，而不是写进某一份共享行：
 *   DSH 的技能可见性由 `dsh-skill-subset` 的 `skills: [...]` 白名单 + `hideOthers` 决定，
 *   没有「全局技能」这一层——不逐个挂，模型就是看不见。所以「通用」在装配上的含义
 *   只能是「每个岗位各挂一份名单里同样的那几条」。
 *
 * 为什么名单读文件而不是在本文件里写一个常量数组：
 *   同一份清单还要被设置页（显示 tier）、图标分配、`verify_static`（三线名单防漂移）
 *   和运行时前提门禁读。常量放这里就等于有第二个家，而第二个家只能靠人对齐。
 *   本文件读的是发布副本 `manifest/generic-skills.json`；**「哪几条算 T0」这个人工判断的家**
 *   是派生器 `packages/capabilities/dsh-overseas-skills/scripts/build-generic-manifest.mjs`
 *   里的 `T0_NAMES`——扩容、降档都改那里，改完重跑派生器，不要在任何消费侧手改 tier。
 */
const GENERIC_MANIFEST =
  process.env.ROLE_GENERIC_MANIFEST ||
  join(HERE, '..', '..', 'packages', 'capabilities', 'dsh-overseas-skills', 'manifest', 'generic-skills.json')
/**
 * 生成的 skill-subset 行是否尊重技能文件的调用开关。
 *
 * 这是**唯一**的开关：它同时决定渲染进 preset 的值与收尾判据的算法，所以把它翻回去
 * 不会得到「静默失效」，而是立刻得到一次红灯（理由见 renderComposition 里的注释）。
 */
const SUBSET_RESPECTS_FILE_FLAGS = false
/**
 * 图标索引（lute-brand-icons 的产物；仓外未版本管理）。
 *
 * 岗位 ↔ 头像的对应关系**不需要第二张映射表**：catalog 里的条目 id 与 preset id
 * 同名（agt-001..agt-050），图标库自己就是这条事实之家（ADR-0009）。
 * 少了它就直接失败——静默写 null 正是「50 张卡片没头像」这个缺陷本身。
 *
 * 受管源（S3，工单 004）：brand/avatars/manifest.json 登记的岗位**优先**——
 * 由 vendor/worldpilot.pin 锁过字节的 webp 产出 data URI（深色道兜底串，
 * 官方卡显式消费）。未登记的岗位回退本索引；022 全量迁移后本索引退役
 * （ADR-0133 残留 R5：只停止新增依赖）。
 */
const ICON_MANIFEST =
  process.env.ROLE_ICON_MANIFEST ||
  join(SKILLS_ROOT, 'lute-brand-icons', 'assets', 'manifest.json')
const AVATAR_MANIFEST = join(HERE, '..', '..', 'brand', 'avatars', 'manifest.json')
/** 官方卡头像显示约 40px；128 档给 3x 屏留余量，单文件仍 <10KB。 */
const AVATAR_CARD_SIZE = '128'
const STANDARD_COMPOSITION =
  process.env.ROLE_STANDARD_COMPOSITION ||
  join(appNodeModules() ?? '', '@deepseek-ai/dsh-agent-presets/presets/standard/agent.cordis.yml')
const SNAPSHOT_DATE = '2026-09-11'
const SOURCE_DSH_VERSION = '2.0.5'
const DRY_RUN = process.argv.includes('--dry-run')
const CHECK = process.argv.includes('--check')

/** 平面 → order 千位基座。平面内再按「首次出现的责任域」分百位段，故扁平列表里平面与责任域都成块。 */
const PLANE_BASE = { 'PLN-MGT': 1000, 'PLN-OPS': 2000, 'PLN-CTL': 3000, 'PLN-PLT': 4000, 'PLN-EXC': 0 }

// ── 管理层（MGT）分支常量（ADR-0129）──────────────────────────────────────────
/** MGT 材料快照日期：管理层 v2 资产于 2026-09-18 定型、整合决策于 2026-09-19 批准。 */
const MGT_SNAPSHOT_DATE = '2026-09-19'
const MGT_SOURCE_FILES = {
  managementCatalog: '04-organization/management/management-catalog.json',
  managementLayer: '04-organization/MANAGEMENT-LAYER.md',
  decisionRights: '04-organization/management/DECISION-RIGHTS.md',
  enforcement: '04-organization/management/ENFORCEMENT.md',
  shadowVerification: '04-organization/management/SHADOW-VERIFICATION.md',
  blueprintManifest: '04-organization/management/preset-blueprints/manifest.json',
  roleCard: (id) => `04-organization/management/roles/${id}.md`,
  soul: (id) => `04-organization/management/souls/${id}.soul.md`,
  rolePlaybook: (id) => `04-organization/management/playbooks/${id}.md`,
  presetBlueprint: (id) => `04-organization/management/preset-blueprints/${id}.json`,
}
/**
 * MGT 的 T0 定制子集 = 全量 T0 减去下列三项（ADR-0129 D5）。
 * 这里是「MGT 不挂哪几条」的家；T0 全量名单的家仍在 build-generic-manifest.mjs 的 T0_NAMES。
 * 每项必须带理由——无理由的剔除与无理由的挂载同样不可审计。
 */
const MGT_T0_EXCLUDED = {
  'meeting-minutes': '纪要/转述语义与管理层「禁止信息中继」（材料 MANAGEMENT-LAYER §2）直接冲突',
  'xindaya-translator': '租户专属工具，T0 判据「任何岗位都用得上」不成立',
  'kami': '租户专属工具，T0 判据「任何岗位都用得上」不成立',
}
/**
 * MGT Soul 摘要的候选章节（按此顺序抽取存在者）。
 * 三个岗位的灵魂章节标题不同构（MGT-001/002 是「我的灵魂原则+第二条原则」，
 * MGT-003 是三条灵魂原则），故按候选表抽取而不是钉死四个标题；
 * 「我是谁/我绝不做什么/我的停止信号」三节必须存在，缺一即抛（不许静默降级）。
 */
const MGT_SOUL_SECTIONS = [
  '我是谁',
  '我的灵魂原则',
  '我的第一条灵魂原则',
  '我的第二条原则（v2新增）',
  '我的第二条灵魂原则（v2新增，本岗位的承重原则）',
  '我的第三条灵魂原则（v2新增）',
  '我绝不做什么',
  '我的协作姿态',
  '我的停止信号',
]
const MGT_SOUL_REQUIRED = ['我是谁', '我绝不做什么', '我的停止信号']

/** preset id 派生（命名空间感知，ADR-0129 D2）：AGT-001→agt-001，MGT-001→mgt-001。 */
function presetIdFor(id) {
  const m = /^(AGT|MGT)-(\d{3})$/.exec(id)
  if (!m) throw new Error(`无法识别的岗位 ID 命名空间：${id}`)
  return `${m[1].toLowerCase()}-${m[2]}`
}

// ── S12 消费口闸门（Q5）：白名单生成条件加「且该卡已被契约引用」 ─────────────────
//
// 判据只有一处：packages/capabilities/dsh-paper2skills/lib/contract-gate.js
// （独立核对器 scripts/check-contract-gate.mjs 消费的是同一份 —— 风险 N2）。
//
// 为什么闸门落在这里：−0.95 的参数移植发生在卡**被模型调用**的那一刻。而实测 1338 张
// p2s 卡全部 `disable-model-invocation: true`，只经本文件生成的岗位白名单逐岗露出
// ⇒ 这里就是模型目录的入口。这不是新增一道门，是给一道已存在的门补判据。
const CONTRACT_GATE_MODE = process.env.P2S_CONTRACT_GATE ?? 'count'
if (!['count', 'enforce', 'off'].includes(CONTRACT_GATE_MODE)) {
  console.error(`✗ P2S_CONTRACT_GATE 只认 count / enforce / off，拿到「${CONTRACT_GATE_MODE}」`)
  process.exit(2)
}
const CONTRACT_GATE_LIB = join(HERE, '..', '..', 'packages', 'capabilities', 'dsh-paper2skills', 'lib', 'contract-gate.js')
/** 契约引用索引；`off` 时为 null（显式退出，不是「静默跳过」）。 */
let contractGate = null
if (CONTRACT_GATE_MODE !== 'off') {
  const gate = await import(CONTRACT_GATE_LIB)
  const gateVault = process.env.P2S_VAULT ?? gate.DEFAULT_VAULT
  const contractsDir = join(gateVault, gate.CONTRACTS_REL)
  const clsPath = join(HERE, '..', '..', 'packages', 'capabilities', 'dsh-paper2skills', 'data', 'classification.json')
  for (const [name, p] of [['契约目录', contractsDir], ['card-classification.json', join(gateVault, gate.CARD_CLASSIFICATION_REL)], ['classification.json', clsPath]]) {
    if (!existsSync(p)) {
      // 读不到契约就**不许**继续 —— 闸门「静默消失」比闸门判红危险得多（Q5 的存在理由）。
      console.error(`✗ 契约闸门读不到输入：${name}（${p}）`)
      console.error('  用 P2S_VAULT 指定 vault，或显式设 P2S_CONTRACT_GATE=off 退出闸门（会在收尾打印警告）。')
      process.exit(2)
    }
  }
  const { contracts } = gate.readContracts(contractsDir)
  const cls = JSON.parse(readFileSync(clsPath, 'utf8')).items ?? []
  const slugById = new Map(cls.filter((x) => x.id && x.slug).map((x) => [x.id, x.slug]))
  const installedSlugs = new Set(cls.map((x) => x.slug).filter(Boolean))
  const sel = JSON.parse(readFileSync(join(gateVault, gate.CARD_CLASSIFICATION_REL), 'utf8'))
  const selIds = new Set((sel.items ?? sel.cards ?? []).map((x) => x.id).filter(Boolean))
  const resolved = gate.resolveRefs({ contracts, slugById, installedSlugs, selIds })
  contractGate = { lib: gate, mode: CONTRACT_GATE_MODE, vault: gateVault, contracts: contracts.length, resolved }
}
/** 全库汇总（跨岗位去重），收尾打印用。 */
const contractGateBound = new Set()
const contractGatePending = new Set()
const contractGateRemoved = new Set()
/**
 * 通用线 T0：常挂全部岗位 preset 的通用底座。
 *
 * 读不到清单就**不许**继续（与契约闸门同一取舍）：静默降级成「没有通用技能」会生成
 * 50 个看起来正常的 preset，而模型从此看不见这批通用技能——没有任何一处会报错。
 */
let T0_SKILLS = []
/** 通用线清单里非 T0 的成员：接线口径不同（T1 按岗位族挂），收尾必须显式说明它们**没被挂**。 */
let GENERIC_NON_T0 = []
{
  if (!existsSync(GENERIC_MANIFEST)) {
    console.error(`✗ 通用技能线清单读不到：${GENERIC_MANIFEST}`)
    console.error('  它不存在时**不降级**：降级会产出 50 个「看起来正常、但模型看不见通用技能」的 preset，')
    console.error('  而且没有任何一处会报错。用 ROLE_GENERIC_MANIFEST 指定，或先跑')
    console.error('  `node packages/capabilities/dsh-overseas-skills/scripts/build-generic-manifest.mjs`。')
    process.exit(2)
  }
  const gm = JSON.parse(readFileSync(GENERIC_MANIFEST, 'utf8'))
  const gmSkills = gm.skills || []
  T0_SKILLS = gmSkills.filter((s) => s.tier === 'T0').map((s) => s.name).sort()
  GENERIC_NON_T0 = gmSkills.filter((s) => s.tier !== 'T0').map((s) => s.name).sort()
  if (T0_SKILLS.length === 0) {
    console.error(`✗ 通用线清单里 T0 为空：${GENERIC_MANIFEST}`)
    console.error('  T0 是「常挂全部岗位」的那一档；为空说明清单被改坏了，不是「本批没有通用技能」。')
    process.exit(2)
  }
}
/** 收尾判据：每个岗位是否都真的挂上了完整 T0。 */
const t0Wired = new Set()
let t0RolesChecked = 0
/** 落盘回读发现的缺口（岗位 → 缺哪几条）。非空即失败。 */
const t0MissingInFile = []
/** 被原样带过的手插行（跨岗位），收尾要点名报出来。 */
const carriedRows = []

/** 对一个岗位的白名单做闸门判定：返回 { mode, bound, pending, unboundContracts }。 */
function contractGateFor(ids) {
  if (!contractGate) return { mode: 'off', bound: [], pending: [], note: '闸门被 P2S_CONTRACT_GATE=off 显式关闭' }
  const boundBySlug = new Map([...contractGate.resolved.bySlug.keys()].map((s) => [s, true]))
  const bound = []
  const pending = []
  for (const id of ids) {
    if (!id.startsWith('p2s-')) continue
    if (boundBySlug.has(id)) bound.push(id)
    else pending.push(id)
  }
  return { mode: contractGate.mode, bound: bound.sort(), pending: pending.sort() }
}

const SOURCE_FILES = {
  roleCard: (id) => `05-agents/roles/${id}.md`,
  soul: (id) => `05-agents/roles/souls/${id}.soul.md`,
  rolePlaybook: (id) => `06-playbooks/role-playbooks/${id}.md`,
  presetBlueprint: (id) => `10-platform/deepseek-harness/preset-blueprints/${id}.json`,
  rolePlaybookIndex: '06-playbooks/role-playbooks/index.json',
  presetBlueprintManifest: '10-platform/deepseek-harness/preset-blueprints/manifest.json',
  roleCatalog: '05-agents/role-catalog.json',
  organizationGraph: '04-organization/organization-graph.json',
  managementGraph: '05-agents/agent-management-graph.json',
  lifecycle: '05-agents/agent-lifecycle.json',
  collaborationGraph: '07-orchestration/collaboration-graph.json',
  flowCatalog: '03-scenarios/FLOW-CATALOG.md',
  playbooks: '06-playbooks/PLAYBOOKS.md',
  roster: '05-agents/ROSTER.md',
}

const raw = (rel) => readFileSync(join(DOCS, rel), 'utf8')
const json = (rel) => JSON.parse(raw(rel))
const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex')
const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]))
  }
  return value
}
const canonicalJson = (value) => JSON.stringify(canonicalize(value))
const GENERATOR_REVISION = process.env.ROLE_GENERATOR_REVISION ||
  sha256(readFileSync(fileURLToPath(import.meta.url), 'utf8'))

/** 把一段 Markdown 按 `## <prefix>` 标题切成 { heading, body } 列表（body 含标题行本身，逐字）。 */
function splitSections(markdown, startsWith) {
  const lines = markdown.split('\n')
  const out = []
  let cur = null
  for (const line of lines) {
    if (line.startsWith('## ') && line.slice(3).startsWith(startsWith)) {
      if (cur) out.push(cur)
      cur = { heading: line, body: [line] }
    } else if (cur) {
      cur.body.push(line)
    }
  }
  if (cur) out.push(cur)
  return out.map((s) => ({ heading: s.heading, body: s.body.join('\n').replace(/\s+$/, '') }))
}

/** 岗位卡的 7 个 ## 小节（逐字，含标题行）。 */
function cardSections(cardText) {
  const lines = cardText.split('\n')
  const out = []
  let cur = null
  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (cur) out.push(cur)
      cur = { heading: line.slice(3).trim(), body: [line] }
    } else if (cur) {
      cur.body.push(line)
    }
  }
  if (cur) out.push(cur)
  return out.map((s) => ({ heading: s.heading, body: s.body.join('\n').replace(/\s+$/, '') }))
}

/**
 * 渲染「技能供给实况」段：把材料声明的业务技能名逐条对照到平台实际装配的技能。
 *
 * 为什么必须有这一段（2026-09-11 验收实测）：岗位卡原文列了「业务技能：需求分诊、能力匹配、
 * 依赖协调、异常冻结与恢复」，但其中两项在平台技能库里**零供给**（`x_lute.skills.gaps`）。
 * persona 只承载卡原文、skill-subset 只承载实际装配，**模型看不到两者的差**——实测中
 * AGT-002 因此在自我介绍里把「异常冻结与恢复」宣称为自己能接的活。
 *
 * 卡原文已经写过「这些名称不代表现有工具接口」，但那是**泛化的免责声明**；本段把它落实为
 * 逐条可核对的清单，并明确「优先于上文材料声明的能力名」，让缺口从"模型不知道"变成"模型会主动说"。
 * @param {Array<{name: string, kind: string, supply: string[]}>} skillMapping - 材料技能名 → 平台供给。
 * @param {string[]} playbookIds - 本岗位参与的共享手册技能 id（如 PB-002）。
 * @param {string[]} [t0NoteLines] - 追加在段尾的通用线说明行（MGT 定制 T0 子集用它披露剔除项与理由）。
 * @returns {string} 供给实况段落。
 */
function renderSupplyStatus(skillMapping, playbookIds, t0NoteLines = []) {
  const gaps = skillMapping.filter((m) => m.kind === 'gap').map((m) => m.name)
  const lines = [
    '── 你的技能供给实况 ──────────────────────────────────────────',
    '',
    '以下为可核对的平台实况，**优先于上文材料声明的能力名**（材料原文已写明',
    '「这些名称不代表现有工具接口」，本段把这句话落实为逐条清单）。',
    '',
    '材料声明的业务技能 → 平台实际装配的技能：',
    '',
  ]
  for (const m of skillMapping) {
    const target = m.supply.length > 0 ? m.supply.join('、') : '**平台无供给**'
    const tag = m.kind === 'partial' ? '（仅部分覆盖）' : ''
    lines.push(`- ${m.name} → ${target}${tag}`)
  }
  lines.push('')
  if (gaps.length > 0) {
    lines.push(`其中 **${gaps.join('、')}** 在平台技能库里没有任何对应供给：这类任务你要靠推理与`)
    lines.push('流程承担，**不得假设有工具或 Skill 支撑**，也不得把它当成已具备的能力；')
    lines.push('遇到这类任务应明示能力缺口，而不是宣称能做到。')
  } else {
    lines.push('上面每一项都已映射到平台技能库中真实存在的技能，可直接使用。')
  }
  if (playbookIds.length > 0) {
    lines.push('')
    lines.push(`另装配了你参与手册的共享技能 ${playbookIds.length} 本：` +
      `${playbookIds.map((p) => p.toLowerCase()).join('、')}（正文即手册全文，按需读取）。`)
  }
  if (t0NoteLines.length > 0) {
    lines.push('')
    lines.push(...t0NoteLines)
  }
  return lines.join('\n')
}

/**
 * 从独立 Soul Contract 提取常驻 persona 所需的最小摘要。
 *
 * Soul 原文仍会进入 manifest.role_assets；persona 只常驻身份、灵魂原则、硬边界和停止
 * 信号，避免把完整 Role Playbook 或整份 Soul 长期压进每个回合的上下文。
 */
function soulSection(soulText, heading) {
  const lines = soulText.split('\n')
  const marker = `## ${heading}`
  const start = lines.findIndex((line) => line.trim() === marker)
  if (start < 0) throw new Error(`Soul Contract 缺少章节：${marker}`)
  const body = []
  for (let i = start; i < lines.length; i++) {
    if (i > start && lines[i].startsWith('## ')) break
    body.push(lines[i])
  }
  return body.join('\n').replace(/\s+$/, '')
}

function renderSoulSummary(soulText, soulPath, soulSha) {
  const sections = ['我是谁', '我的灵魂原则', '我绝不做什么', '我的停止信号']
  return [
    '── Soul Contract 摘要（身份 / 灵魂 / 硬边界 / 停止信号）────────────────',
    '',
    `来源：${soulPath}；sha256 ${soulSha}`,
    '以下摘要是常驻身份约束；完整 Soul Contract 与 Role Playbook 只在 manifest 的角色资产区按需寻址。',
    '',
    ...sections.flatMap((heading) => [soulSection(soulText, heading), '']),
  ].join('\n').replace(/\n+$/, '')
}

/**
 * 渲染岗位 persona：字面块标量 `|-`（不是 `>-`，折叠标量会把行粘成一段、毁掉原文结构）。
 * 常驻层只放身份与 Soul 摘要；岗位卡全文归档在 manifest，完整 Role Playbook 通过独立 Skill
 * descriptor 按需寻址，避免把长正文压进每个回合的上下文。
 * @param {object} role - 材料 role-catalog 记录。
 * @param {object} provenance - 平面/责任域名与源文件溯源信息。
 * @param {string} soulSummary - Soul Contract 的常驻摘要。
 * @param {string} supplyStatus - {@link renderSupplyStatus} 的产物。
 * @returns {string} persona 正文。
 */
function renderPersona(role, provenance, soulSummary, supplyStatus) {
  const header = [
    `你是 {{model}} 驱动的 AI 岗位分身「${role.alias}」，岗位 ${role.id} ${role.title}，` +
      `所属组织平面「${provenance.planeName}」，责任域「${provenance.domainName}」。你的工作目录是 {{cwd}}。`,
    '',
    `你的完整岗位卡已逐字归档在 manifest.material.role_card；当前 persona 常驻身份与 Soul 摘要` +
      `（材料快照 ${SNAPSHOT_DATE}；source revision ${provenance.sourceRevision}；` +
      `源文件 ${provenance.roleCardPath}；sha256 ${provenance.roleCardSha}）。`,
    '',
    `材料原文保留其撰写时点的表述，其中的相对链接（如 ../../06-playbooks/PLAYBOOKS.md）指向材料仓库` +
      `（根目录 ${MATERIAL_ROOT}）。`,
    '',
    `其中「Harness 映射」一节所述「当前没有对应生产 preset、凭据或导入配置」描述的是材料撰写时点的事实；` +
      `本 preset 是该岗位定义的结构化落地方案。岗位的生产授权状态仍为 false（production_authorized=false），` +
      `这与 ADR-0005/D-023 的 Role Release Bundle 七状态门禁一致——本 preset 属设计期草案，不构成生产授权。`,
    '',
    soulSummary,
    '',
  ].join('\n')
  const footer = [
    '',
    supplyStatus,
  ].join('\n')
  return `${header}${footer}`
}

/** 以一个缩进级别把多行文本渲染成 YAML 字面块标量体。 */
function yamlLiteralBlock(text, indent) {
  const pad = ' '.repeat(indent)
  return text
    .split('\n')
    .map((line) => (line.length === 0 ? '' : pad + line))
    .join('\n')
}

/** 从 shipped standard 组合里取出「一个顶层行块」的起止行号（含其上方紧邻的注释与空行留给调用方）。 */
function rowBlockRange(lines, id) {
  const start = lines.findIndex((l) => l === `- id: ${id}`)
  if (start < 0) throw new Error(`standard 组合里找不到行: ${id}`)
  let end = start + 1
  while (end < lines.length && !lines[end].startsWith('- id: ')) end++
  return [start, end]
}

/**
 * 产品装配表：哪些 Agent 产品包挂进哪个岗位的 agent-plane 组合。
 *
 * 这里与 `product.json` 的 `preset` 字段不是同一份事实，也不该合并：
 *   · `product.json` 的 `preset` = **产品说它属于谁**（归属，产品自己的家）
 *   · 本表 = **岗位说它挂谁**（装配，岗位组合的家）
 * 两者必须一致；产品侧的 `run.mjs --check` 有一项专门读生成的 composition 断言这件事，
 * 不一致即红——因为「挂错层」不会报错，只会让局部技能静默变成全局技能
 * （技能注册表按挂载 scope 分层，宿主行→全局层，preset 行→该 preset 的层）。
 *
 * 产品包住在产品自己的目录里（ADR-0033：本仓库不吞并产品代码），由 profile 装进
 * node_modules，因此这里只登记包名与行 id，不搬代码。
 *
 * ## 为什么本表现在是空的（2026-09-12，DMG 2.2.0 打包前）
 *
 * 出货的 preset 不得烘焙**任何**外部产品行，理由有两条，都不是风格问题：
 *
 * 1. **挂载是硬依赖。** 产品行一旦写进 `agent.cordis.yml`，客户机上就必须装到对应
 *    包，否则该岗位组合装载失败（`plugin tree failed to load` → 恢复模式）。产品的家
 *    在各自项目里（ADR-0033），本仓库无法保证任何客户机装过它——所以这个行只能在本机
 *    为真的前提下写。
 * 2. **它会带出机器路径。** `agt-033` 曾挂 `dsh-kol-hunter-local`，其 profile 依赖是
 *    `file:/Users/lute/project/KOL-Hunter`：该路径既不进 vendor 抽取（前缀只认
 *    本仓库）、也不被 `rewrite-file-deps.mjs` 重写（旧前缀表不含它），于是会原样打进
 *    出货 profile（实测 23 条 `file:` 依赖中唯一漏网的一条）。
 *
 * 因此 KOL-Hunter 随本次移出产品面：本表清空、profile 不再引用该包。要恢复「本机挂载
 * 自己的产品」，正确做法是给本机加一层**本地**装配（不进本仓库出货物），而不是把某台
 * 机器的产品目录写回这里。
 */
const PRODUCT_MOUNTS = {}

/**
 * 渲染产品行：挂在 skill-subset 之后。
 * 产品行必须由本函数生成，不能手改 agent.cordis.yml——本脚本每次都会重写全部 50 个组合。
 */
function renderProductRows(presetId) {
  const mounts = PRODUCT_MOUNTS[presetId]
  if (!mounts || mounts.length === 0) return []
  const lines = ['', '# 本岗位挂载的 Agent 产品包（每行 = 一个产品；产品代码在各自项目里）。']
  for (const m of mounts) {
    lines.push(`# ${m.note}`)
    lines.push(`- id: ${m.id}`)
    lines.push(`  name: '${m.pkg}'`)
  }
  lines.push('')
  return lines
}

/**
 * 组装 agent.cordis.yml：以 shipped standard 为基座（D5 决策），
 * 替换 persona 行块为岗位 persona，并在 skills 段追加 dsh-skill-subset 行与产品行。
 */
function renderComposition(personaText, skills, presetId) {
  const std = readFileSync(STANDARD_COMPOSITION, 'utf8')
  const lines = std.split('\n')

  const [pStart, pEnd] = rowBlockRange(lines, 'persona')
  const personaRow = [
    '- id: persona',
    "  name: '@deepseek-ai/dsh-persona'",
    '  config:',
    // ⚠️ 字段名是 `prefix`，不是 `text`。2.0.10 的 `@deepseek-ai/dsh-persona` 把配置键从
    // `text` 改名为 `prefix` 且 `prefix` 为 required（suffix/complete/includeRuntimeContext
    // 另有默认值）。写 `text:` 的 preset 会在加载期抛
    // `$.prefix missing required value (at prefix)`，**整个 preset 树**载入失败
    // → 会话里发消息后模型完全无响应（2026-09-17 实测：53 个 preset 全中）。
    '    prefix: |-',
    yamlLiteralBlock(personaText, 6),
  ]
  lines.splice(pStart, pEnd - pStart, ...personaRow)

  const [, tEnd] = rowBlockRange(lines, 'tool-skill')
  const subsetRow = [
    '',
    '# 本岗位的技能子集：在 preset scope 层把这些技能重注册为模型可见（遮蔽全局 model-off 副本）。',
    '# 名单由 scripts/role-presets/generate.mjs 依据材料 role-catalog.json 的 skills 字段映射而来。',
    '- id: skill-subset',
    "  name: 'dsh-skill-subset'",
    '  config:',
    `    skills: [${skills.map((s) => `'${s}'`).join(', ')}]`,
    // respectFileFlags —— 白名单是授予，不能被文件开关否决。
    //
    // 这一行曾经是 `true`，两个机制就此互相抵消：语料里每张 p2s- 卡都按 ADR-0031
    // 写着 disable-model-invocation: "true"（为了不让 1338 张卡挤进全局模型目录），
    // 而 respectFileFlags: true 让正向注册去读这个开关，于是「挂上了」的卡仍然
    // modelInvocable: false —— 实测 50 个岗位的 439 个白名单位里 275 个（62.6%）
    // 是死的，没有一个岗位全部生效。ADR-0031 的「可见性只经白名单开放」与 I3 的
    // 「设置页开关在岗位会话内也生效」在语料全库 model-off 的前提下不可能同时成立。
    // 本产物取前者：岗位装配由岗位自己负责，设置页开关管的是岗位之外。
    //
    // 上面那句「重注册为模型可见」是这一行的原意，也是它被改成 true 时被违背的话。
    // 收尾的「白名单生效性」判据会拦住任何把它翻回 true 却不同时修数据的改动。
    `    respectFileFlags: ${SUBSET_RESPECTS_FILE_FLAGS}`,
    '',
  ]
  lines.splice(tEnd, 0, ...subsetRow)

  const [, pEndAfterSubset] = rowBlockRange(lines, 'skill-subset')
  lines.splice(pEndAfterSubset, 0, ...renderProductRows(presetId))

  return lines.join('\n')
}

/** YAML 单行字符串安全引号。 */
const q = (s) => `'${String(s).replace(/'/g, "''")}'`

function renderPresetYml(name, description, order, icon) {
  const lines = [
    `name: ${q(name)}`,
    `description: ${q(description)}`,
    `order: ${order}`,
  ]
  // icon 是官方显式消费的显示字段：roster 把它送到前端，卡片渲染成 <img class="cardAvatar">。
  // 单引号 + YAML 单引号转义：data URI 里没有单引号，但保持与 name/description 同一套转义纪律。
  if (icon) lines.push(`icon: ${q(icon)}`)
  lines.push('')
  return lines.join('\n')
}

// ── 载入全部来源 ────────────────────────────────────────────────────────────

function loadSources() {
  const files = {
    roleCatalog: SOURCE_FILES.roleCatalog,
    organizationGraph: SOURCE_FILES.organizationGraph,
    managementGraph: SOURCE_FILES.managementGraph,
    lifecycle: SOURCE_FILES.lifecycle,
    collaborationGraph: SOURCE_FILES.collaborationGraph,
    flowCatalog: SOURCE_FILES.flowCatalog,
    playbooks: SOURCE_FILES.playbooks,
    roster: SOURCE_FILES.roster,
  }
  const text = {}
  const hashes = {}
  for (const [key, rel] of Object.entries(files)) {
    text[key] = raw(rel)
    hashes[key] = sha256(text[key])
  }
  const rolePlaybookIndex = JSON.parse(raw(SOURCE_FILES.rolePlaybookIndex))
  const presetBlueprintManifest = JSON.parse(raw(SOURCE_FILES.presetBlueprintManifest))
  const assetIndexHashes = {
    rolePlaybookIndex: sha256(raw(SOURCE_FILES.rolePlaybookIndex)),
    presetBlueprintManifest: sha256(raw(SOURCE_FILES.presetBlueprintManifest)),
  }
  const playbooksByRole = new Map((rolePlaybookIndex.roles || []).map((entry) => [entry.role_id, entry]))
  const blueprintsByRole = new Map((presetBlueprintManifest.roles || []).map((entry) => [entry.role_id, entry]))
  const roleAssets = new Map()

  for (const role of JSON.parse(text.roleCatalog).roles || []) {
    const id = role.id
    const roleCardPath = SOURCE_FILES.roleCard(id)
    const soulPath = SOURCE_FILES.soul(id)
    const rolePlaybookPath = SOURCE_FILES.rolePlaybook(id)
    const presetBlueprintPath = SOURCE_FILES.presetBlueprint(id)
    const profileText = raw(roleCardPath)
    const soulText = raw(soulPath)
    const rolePlaybookText = raw(rolePlaybookPath)
    const presetBlueprintText = raw(presetBlueprintPath)
    const blueprint = JSON.parse(presetBlueprintText)
    const playbookIndexEntry = playbooksByRole.get(id)
    const blueprintIndexEntry = blueprintsByRole.get(id)
    const expectedPresetId = `dsh.role.${id.toLowerCase()}.v1`

    if (!playbookIndexEntry || !blueprintIndexEntry) {
      throw new Error(`${id}: Role Playbook index 或 Blueprint manifest 缺少角色引用`)
    }
    if (playbookIndexEntry.playbook_ref !== `docs/${rolePlaybookPath}` ||
        playbookIndexEntry.soul_ref !== `docs/${soulPath}` ||
        playbookIndexEntry.preset_id !== expectedPresetId ||
        blueprintIndexEntry.preset_id !== expectedPresetId) {
      throw new Error(`${id}: index 引用与源路径或 preset_id 不一致`)
    }
    if (blueprint.role_id !== id || blueprint.preset_id !== expectedPresetId ||
        blueprint.role_profile_ref !== `docs/${roleCardPath}` ||
        blueprint.soul_ref !== `docs/${soulPath}` ||
        blueprint.role_playbook_ref !== `docs/${rolePlaybookPath}`) {
      throw new Error(`${id}: Blueprint 角色 ID、preset_id 或引用路径不一致`)
    }
    for (const [field, value] of Object.entries({
      alias: role.alias,
      title: role.title,
      mission: role.mission,
      personality: role.personality,
      soul_principle: role.principle,
    })) {
      if (blueprint.identity?.[field] !== value) throw new Error(`${id}: Blueprint identity.${field} 与 role-catalog 不一致`)
    }
    if (blueprint.status !== 'blueprint_only_not_importable' ||
        blueprint.assurance?.production_authorized !== false ||
        blueprint.modes?.standalone?.can_execute_assets !== false ||
        blueprint.modes?.composition?.orchestration_owner !== 'external_case_control' ||
        blueprint.modes?.composition?.peer_chat !== false ||
        blueprint.modes?.composition?.re_delegation !== false ||
        blueprint.tools?.action_boundary !== 'action_intent_only_to_model_external_policy_gate' ||
        blueprint.tools?.credentials !== 'never_visible_to_model') {
      throw new Error(`${id}: Blueprint 运行边界不符合设计期外部 Case Control 契约`)
    }

    roleAssets.set(id, {
      roleProfile: { path: roleCardPath, text: profileText, sha256: sha256(profileText) },
      soul: { path: soulPath, text: soulText, sha256: sha256(soulText) },
      rolePlaybook: { path: rolePlaybookPath, text: rolePlaybookText, sha256: sha256(rolePlaybookText) },
      presetBlueprint: { path: presetBlueprintPath, text: presetBlueprintText, sha256: sha256(presetBlueprintText), record: blueprint },
      playbookIndexEntry,
      blueprintIndexEntry,
    })
  }

  const revisionPayload = {
    shared: hashes,
    indexes: assetIndexHashes,
    roles: [...roleAssets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([id, assets]) => ({
      id,
      roleCard: assets.roleProfile.sha256,
      soul: assets.soul.sha256,
      rolePlaybook: assets.rolePlaybook.sha256,
      presetBlueprint: assets.presetBlueprint.sha256,
    })),
  }
  const sourceRevision = process.env.ROLE_SOURCE_REVISION || `source-hash:${sha256(canonicalJson(revisionPayload))}`
  return {
    text,
    hashes,
    roleCatalog: JSON.parse(text.roleCatalog),
    organizationGraph: JSON.parse(text.organizationGraph),
    managementGraph: JSON.parse(text.managementGraph),
    lifecycle: JSON.parse(text.lifecycle),
    collaborationGraph: JSON.parse(text.collaborationGraph),
    rolePlaybookIndex,
    presetBlueprintManifest,
    assetIndexHashes,
    roleAssets,
    sourceRevision,
  }
}

/**
 * 载入图标索引：preset id → data URI。
 *
 * 条目 id 与 preset id 同名，所以这里是直查而不是映射；查不到就抛，
 * 让「某个岗位没头像」在生成期暴露，而不是变成一张空白卡片发到界面上。
 * @returns {Map<string, string>} catalog 条目 id 到内联 SVG 头像的映射。
 */
function loadIconIndex() {
  if (!existsSync(ICON_MANIFEST)) {
    throw new Error(
      `图标索引不存在：${ICON_MANIFEST}\n` +
        '  先生成头像库：node ~/.dsh/skills/lute-brand-icons/scripts/build.js\n' +
        '  （或用 ROLE_ICON_MANIFEST 指向别处；受管岗位见 brand/avatars/manifest.json）',
    )
  }
  const rows = JSON.parse(readFileSync(ICON_MANIFEST, 'utf8'))
  return new Map(rows.map((row) => [row.id, row.icon]))
}

/**
 * 受管头像源：brand/avatars/manifest.json 登记的岗位 → data:image/webp 深色道
 * 兜底串（字节已由 brand-avatars-pin 门禁对 vendor/worldpilot.pin 校验）。清单
 * 缺深色道 ${AVATAR_CARD_SIZE} 档或资产缺失都在生成期响亮失败——静默回退正是
 * 「新旧头像混装但没人知道」这个缺陷本身。
 * @returns {Map<string, string>} preset id 到 webp data URI 的映射。
 */
function loadManagedAvatarIndex() {
  const mf = JSON.parse(readFileSync(AVATAR_MANIFEST, 'utf8'))
  const expected = Array.from({ length: 50 }, (_, i) => `agt-${String(i + 1).padStart(3, '0')}`)
  if (JSON.stringify(mf.entries?.map((entry) => entry.presetId)) !== JSON.stringify(expected)) {
    throw new Error('受管头像必须完整覆盖 agt-001…agt-050，且无重复或额外岗位')
  }
  return new Map(mf.entries.map((entry) => {
    const icons = {}
    for (const colorway of ['dark', 'light']) {
      const rel = entry.assets?.[colorway]?.[AVATAR_CARD_SIZE]
      if (!rel) throw new Error(`${entry.presetId} 缺 ${colorway}/${AVATAR_CARD_SIZE} 头像`)
      const bytes = readFileSync(join(dirname(AVATAR_MANIFEST), rel))
      if (bytes.subarray(0, 4).toString() !== 'RIFF' || bytes.subarray(8, 12).toString() !== 'WEBP') {
        throw new Error(`${entry.presetId} ${colorway} 不是 WebP`)
      }
      icons[colorway] = `data:image/webp;base64,${bytes.toString('base64')}`
    }
    return [entry.presetId, icons]
  }))
}

/** 计算 order：平面基座 + 平面内责任域段 + 域内序号（域段按 AGT 升序首次出现顺序分配）。 */
function computeOrders(orgGraph) {
  const byPlane = new Map()
  for (const r of orgGraph.roles) {
    if (!byPlane.has(r.plane_id)) byPlane.set(r.plane_id, [])
    byPlane.get(r.plane_id).push(r)
  }
  const orders = new Map()
  for (const [planeId, roles] of byPlane) {
    const base = PLANE_BASE[planeId]
    if (base === undefined) throw new Error(`未知平面 ${planeId}`)
    const sorted = [...roles].sort((a, b) => a.id.localeCompare(b.id))
    const domainSlot = new Map()
    const seqInDomain = new Map()
    for (const r of sorted) {
      if (!domainSlot.has(r.domain_view_id)) domainSlot.set(r.domain_view_id, domainSlot.size + 1)
      const slot = domainSlot.get(r.domain_view_id)
      const seq = (seqInDomain.get(r.domain_view_id) || 0) + 1
      seqInDomain.set(r.domain_view_id, seq)
      orders.set(r.id, base + slot * 100 + seq)
    }
  }
  return orders
}

// ── 管理层（MGT）装载与渲染（ADR-0129 D1~D5）────────────────────────────────

/**
 * 载入管理层材料：5 个共享源 + 每岗 4 件资产，并做入口校验。
 *
 * 校验原则与 AGT 分支一致：身份字段、preset_id、运行边界凡与材料设计不符即抛，
 * 不许「先生成出来再说」。特别地：
 *   · `dsh_integration` 块必须存在且 status/authorization_status 与 D1/D2 批准值一致
 *     ——该块是投影平面与 preset id 映射的机器可读之家（材料侧 D-065）；
 *   · SHADOW-VERIFICATION.md 的状态行必须能定位——persona 的状态披露**逐字引用**它，
 *     而不是在生成器里复写一份评估结论（一份事实一个家；材料改状态 → 哈希变 →
 *     重生成 → 披露自动更新）。
 */
function loadMgtSources() {
  const sharedFiles = {
    managementCatalog: MGT_SOURCE_FILES.managementCatalog,
    managementLayer: MGT_SOURCE_FILES.managementLayer,
    decisionRights: MGT_SOURCE_FILES.decisionRights,
    enforcement: MGT_SOURCE_FILES.enforcement,
    shadowVerification: MGT_SOURCE_FILES.shadowVerification,
  }
  const text = {}
  const hashes = {}
  for (const [key, rel] of Object.entries(sharedFiles)) {
    text[key] = raw(rel)
    hashes[key] = sha256(text[key])
  }
  const catalog = JSON.parse(text.managementCatalog)
  if (catalog.namespace !== 'MGT') throw new Error(`management-catalog namespace 应为 MGT，实为 ${catalog.namespace}`)
  if (!Array.isArray(catalog.roles) || catalog.roles.length !== catalog.role_count) {
    throw new Error(`management-catalog roles(${catalog.roles?.length}) 与 role_count(${catalog.role_count}) 不一致`)
  }
  if (catalog.runtime_model?.production_authorized !== false) {
    throw new Error('management-catalog runtime_model.production_authorized 必须为 false')
  }
  const dsh = catalog.dsh_integration
  if (!dsh || dsh.status !== 'approved_2026_09_19' ||
      dsh.authorization_status !== 'evaluation_carrier_not_shadow_authorized' ||
      dsh.preset_namespace !== 'mgt' || !dsh.projection_plane || !dsh.projection_domain) {
    throw new Error('management-catalog 缺少有效的 dsh_integration 块（材料侧 D-065 的机器可读之家）')
  }

  // 状态披露引用的验证状态行：逐字取自材料，不在生成器里复写结论。
  const statusLine = /^状态：.*$/m.exec(text.shadowVerification)?.[0]
  if (!statusLine || !statusLine.includes('MGT-EVAL-B')) {
    throw new Error('SHADOW-VERIFICATION.md 定位不到含 MGT-EVAL-B 的状态行——状态披露块拒绝生成（不许静默过期）')
  }

  const blueprintManifestText = raw(MGT_SOURCE_FILES.blueprintManifest)
  const blueprintManifest = JSON.parse(blueprintManifestText)
  const assetIndexHashes = { mgtBlueprintManifest: sha256(blueprintManifestText) }
  const blueprintsByRole = new Map((blueprintManifest.blueprints || []).map((e) => [e.role_id, e]))

  const mgtAssets = new Map()
  for (const role of catalog.roles) {
    const id = role.id
    if (!/^MGT-\d{3}$/.test(id)) throw new Error(`management-catalog 出现非 MGT 命名空间 id：${id}`)
    const roleCardPath = MGT_SOURCE_FILES.roleCard(id)
    const soulPath = MGT_SOURCE_FILES.soul(id)
    const rolePlaybookPath = MGT_SOURCE_FILES.rolePlaybook(id)
    const presetBlueprintPath = MGT_SOURCE_FILES.presetBlueprint(id)
    const profileText = raw(roleCardPath)
    const soulText = raw(soulPath)
    const rolePlaybookText = raw(rolePlaybookPath)
    const presetBlueprintText = raw(presetBlueprintPath)
    const blueprint = JSON.parse(presetBlueprintText)
    const blueprintIndexEntry = blueprintsByRole.get(id)
    const expectedPresetId = `dsh.mgt.${id.slice(4)}.v1`

    if (!blueprintIndexEntry) throw new Error(`${id}: MGT blueprint manifest 缺少角色引用`)
    if (blueprintIndexEntry.preset_id !== expectedPresetId ||
        blueprintIndexEntry.blueprint_ref !== `docs/${presetBlueprintPath}` ||
        blueprintIndexEntry.soul_ref !== `docs/${soulPath}` ||
        blueprintIndexEntry.role_playbook_ref !== `docs/${rolePlaybookPath}`) {
      throw new Error(`${id}: MGT blueprint manifest 引用与源路径或 preset_id 不一致`)
    }
    if (blueprint.role_id !== id || blueprint.preset_id !== expectedPresetId ||
        blueprint.role_profile_ref !== `docs/${roleCardPath}` ||
        blueprint.soul_ref !== `docs/${soulPath}` ||
        blueprint.role_playbook_ref !== `docs/${rolePlaybookPath}` ||
        blueprint.decision_rights_ref !== `docs/${MGT_SOURCE_FILES.decisionRights}`) {
      throw new Error(`${id}: MGT Blueprint 角色 ID、preset_id 或引用路径不一致`)
    }
    for (const [field, value] of Object.entries({
      alias: role.alias,
      title: role.title,
      mission: role.mission,
      personality: role.personality,
      soul_principle: role.principle,
    })) {
      if (blueprint.identity?.[field] !== value) throw new Error(`${id}: MGT Blueprint identity.${field} 与 management-catalog 不一致`)
    }
    if (blueprint.status !== 'blueprint_only_not_importable' ||
        blueprint.assurance?.production_authorized !== false ||
        blueprint.assurance?.self_acceptance_allowed !== false ||
        blueprint.modes?.standalone?.can_emit_action_intent !== false ||
        blueprint.modes?.standalone?.can_execute_assets !== false ||
        blueprint.modes?.composition?.case_role_participation !== 'none' ||
        blueprint.modes?.composition?.lead_or_worker !== false ||
        blueprint.modes?.composition?.peer_chat !== false ||
        blueprint.modes?.composition?.re_delegation !== false ||
        blueprint.modes?.composition?.orchestration_owner !== 'external_case_control' ||
        blueprint.tools?.credentials !== 'never_visible_to_model' ||
        blueprint.access?.default_decision !== 'deny' ||
        blueprint.access?.service_identity_holder !== 'none') {
      throw new Error(`${id}: MGT Blueprint 运行边界不符合决策权平面契约（无 Action Intent / 无资产执行 / 零会话 / 只读聚合 / deny 默认）`)
    }
    if (role.autonomy?.profile_loadable !== true || role.autonomy?.case_role_participation !== false ||
        role.production_authorized !== false) {
      throw new Error(`${id}: management-catalog autonomy/production_authorized 与评估载体姿态不符`)
    }
    if (dsh.preset_ids?.[id] !== presetIdFor(id)) {
      throw new Error(`${id}: dsh_integration.preset_ids 映射与命名空间派生不一致（期望 ${presetIdFor(id)}）`)
    }

    mgtAssets.set(id, {
      roleProfile: { path: roleCardPath, text: profileText, sha256: sha256(profileText) },
      soul: { path: soulPath, text: soulText, sha256: sha256(soulText) },
      rolePlaybook: { path: rolePlaybookPath, text: rolePlaybookText, sha256: sha256(rolePlaybookText) },
      presetBlueprint: { path: presetBlueprintPath, text: presetBlueprintText, sha256: sha256(presetBlueprintText), record: blueprint },
      blueprintIndexEntry,
    })
  }

  const revisionPayload = {
    shared: hashes,
    indexes: assetIndexHashes,
    roles: [...mgtAssets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([id, assets]) => ({
      id,
      roleCard: assets.roleProfile.sha256,
      soul: assets.soul.sha256,
      rolePlaybook: assets.rolePlaybook.sha256,
      presetBlueprint: assets.presetBlueprint.sha256,
    })),
  }
  const sourceRevision = process.env.ROLE_MGT_SOURCE_REVISION || `source-hash:${sha256(canonicalJson(revisionPayload))}`

  return { text, hashes, catalog, dsh, blueprintManifest, assetIndexHashes, mgtAssets, sourceRevision, evalStatusLine: statusLine }
}

/** MGT order：按 PLANE_BASE['PLN-EXC'] 与单域序号计算，并与材料 dsh_integration.orders 交叉核对（两处必须一致）。 */
function computeMgtOrders(catalog, dsh) {
  const base = PLANE_BASE[dsh.projection_plane.id]
  if (base === undefined) throw new Error(`PLANE_BASE 缺少投影平面 ${dsh.projection_plane.id}`)
  if (dsh.projection_plane.order_base !== base) {
    throw new Error(`dsh_integration.projection_plane.order_base(${dsh.projection_plane.order_base}) 与生成器 PLANE_BASE(${base}) 不一致`)
  }
  const orders = new Map()
  const sorted = [...catalog.roles].sort((a, b) => a.id.localeCompare(b.id))
  sorted.forEach((r, i) => orders.set(r.id, base + 1 * 100 + (i + 1)))
  for (const [id, order] of orders) {
    if (dsh.projection_plane.orders?.[id] !== order) {
      throw new Error(`${id}: dsh_integration.orders(${dsh.projection_plane.orders?.[id]}) 与生成器计算值(${order}) 不一致——两个家必须说同一句话`)
    }
  }
  return orders
}

/** MGT Soul 摘要：按候选章节表抽取存在者；必备节缺失即抛。 */
function renderMgtSoulSummary(soulText, soulPath, soulSha, roleId) {
  const present = MGT_SOUL_SECTIONS.filter((h) => soulText.split('\n').some((l) => l.trim() === `## ${h}`))
  for (const h of MGT_SOUL_REQUIRED) {
    if (!present.includes(h)) throw new Error(`${roleId}: Soul Contract 缺少必备章节「${h}」`)
  }
  if (!present.some((h) => h.includes('原则'))) throw new Error(`${roleId}: Soul Contract 缺少任何灵魂原则章节`)
  return [
    '── Soul Contract 摘要（身份 / 灵魂 / 硬边界 / 协作姿态 / 停止信号）────────',
    '',
    `来源：${soulPath}；sha256 ${soulSha}`,
    '以下摘要是常驻身份约束；完整 Soul Contract 与 Role Playbook 只在 manifest 的角色资产区按需寻址。',
    '',
    ...present.flatMap((heading) => [soulSection(soulText, heading), '']),
  ].join('\n').replace(/\n+$/, '')
}

/**
 * 渲染管理岗位 persona（七段，ADR-0129 D1/D5）：
 * 身份句 → 状态披露块 → 材料归档声明 → Soul 摘要 → 决策权与阶梯 → 承重机制 → 协作接口（零会话声明）
 * （技能供给实况由调用方拼在 footer，与 AGT 分支同构）。
 */
function renderMgtPersona(mrole, ctx) {
  const { dsh, planeName, domainName, cardPath, cardSha, sourceRevision, soulSummary, evalStatusLine, svSha, catalog } = ctx
  const cadenceNames = { daily: '日', weekly: '周', monthly: '月', quarterly: '季' }
  const myCadences = Object.entries(catalog.operating_model.cadence)
    .filter(([, roles]) => roles.includes(mrole.id))
    .map(([k]) => cadenceNames[k] || k)
  const queueKey = Object.entries(catalog.operating_model.daily_queue_dispatch)
    .find(([, owner]) => owner === mrole.id)?.[0]
  const queueLabel = { demand_side_execution_exceptions: '经营执行异常', control_and_resource_exceptions: '控制与资源异常' }[queueKey]
  const mitigations = catalog.structure_history?.v2?.mitigation || []
  const mitigationNote = catalog.structure_history?.v2?.mitigation_is_evidence_based || ''

  const header = [
    `你是 {{model}} 驱动的 AI 管理岗位分身「${mrole.alias}」，岗位 ${mrole.id} ${mrole.title}，` +
      `管理域「${mrole.management_domain}」，位于 DSH 投影平面「${planeName}」（${dsh.projection_plane.id}）、` +
      `分组「${domainName}」。投影平面只是界面展示分组，不是材料侧的组织平面。你的工作目录是 {{cwd}}。`,
    '',
    '── 状态披露（先于任何自我介绍）──────────────────────────────',
    '',
    `本 preset 是**评估载体与人在环决策演练**用途（authorization_status: ${dsh.authorization_status}）：`,
    '- 未授权 Shadow 与生产（production_authorized=false）；不接入真实经营账本，不参与任何 Case 执行。',
    `- 验证状态（逐字引自材料 SHADOW-VERIFICATION.md 状态行，sha256 ${svSha}）：${evalStatusLine}`,
    '- 本 persona 的全部边界是 Prompt 层表达，**不构成服务端权限控制**。材料要求的三条承重机制' +
      '（口径冻结签署方机械校验、复核线只读通道、强制追溯记录旁路直达）需要模型外构件，本 preset 不提供。',
    '- 会话中的一切「聚合指标 / 异常队列 / 资源冲突清单」输入都由用户人工提供；不得声称已读取任何运行数据。',
    '',
    `你的完整管理岗位档案已逐字归档在 manifest.material.role_card；管理层四份共享设计文档` +
      `（主设计/决策权阶梯/生效机制/影子验证）逐字归档在 manifest.material.management_design` +
      `（材料快照 ${MGT_SNAPSHOT_DATE}；source revision ${sourceRevision}；源文件 ${cardPath}；sha256 ${cardSha}）。`,
    '',
    soulSummary,
    '',
  ].join('\n')

  const rights = [
    '── 决策权与阶梯 ──────────────────────────────────────────────',
    '',
    '决策权按六级阶梯行使：L0 自动化 / L1-G 增长域 / L1-V 治理域 / L2 跨域（CEO）/ ' +
      'L2b 自涉争议（真人所有者专属）/ L3 呈报 / L4 真人所有者专属。完整阶梯与升降级规则' +
      '逐字归档在 manifest.material.management_design.decision_rights。没有归属的事项视为未授权，默认 HOLD；' +
      '沉默、超时与「没反对」均不构成批准。',
    '',
    '你持有的决策权（逐字取自材料 management-catalog）：',
    ...mrole.decision_rights.map((r) => `- ${r}`),
    '',
    '明确**不授予**你的（逐字）：',
    ...mrole.decision_rights_explicitly_not_granted.map((r) => `- ${r}`),
    '',
    `岗位硬边界（逐字）：${mrole.boundary}`,
    '',
  ].join('\n')

  const loadBearing = [
    '── 承重机制（v2 三岗结构引入，缺一不可）────────────────────────',
    '',
    '把 8 个 CXO 合并为 2 个二级负责人制造了「治理官同时是评估尺子的作者、维护者与被评估者」的失效模式。三条处置（逐字取自材料）：',
    ...mitigations.map((m) => `- ${m}`),
    ...(mitigationNote ? [`依据声明：${mitigationNote}`] : []),
    ...(mrole.second_principle ? [`你的第二条原则（逐字）：「${mrole.second_principle}」`] : []),
    ...(mrole.id === 'MGT-003'
      ? ['红线（材料 ENFORCEMENT §5A）：只要上述三条机制还只能以 Prompt 表达，本岗位不得进入 Shadow 阶段——提示词中的约束不构成服务端权限控制。']
      : []),
    '',
  ].join('\n')

  const collab = [
    '── 协作接口（零会话声明）────────────────────────────────────',
    '',
    '- 你不与任何执行面岗位会话、不下发指令、不作为 Lead 或 Worker 参与任何 Case；' +
      '你的结论只能通过版本化契约（MDC/GOC）与资源配额记录生效，由模型外 Case Control 与 Policy Gate 查表执行。',
    `- 横向只与 ${mrole.collaborates_with.join('、')} 交换管理决策包（management_decision_package），` +
      '不要求也不产出叙述性汇报；信息缺口的正确处理方式是要求补数据，不是要求讲故事。',
    `- 覆盖：${mrole.owned_role_count} 个岗位（${mrole.owned_role_ids.join('、')}）。覆盖关系以材料 management-catalog 为家，不在协作图里加边。`,
    `- 节拍：${myCadences.join('、')}。${queueLabel ? `日节拍队列：${queueLabel}（按异常单类型机械分派，类型无归属时 HOLD 并记自治异常，不自行认领）。` : ''}` +
      `${catalog.operating_model.cadence_scheduler === mrole.id ? '你常设承担管理节拍运行与决策队列维护（该排程权刻意排除增长官兼任）；超期未决事项自动上升，你无权让其滞留队列。' : ''}` +
      ' 节拍之外不得介入单张 Case；唯一例外是阈值触发的模型外升级，此时你只作为接收者出现。',
    `- 升级与冻结：无法处理的异常一律 ${mrole.autonomy.unhandled_exception}；` +
      '涉真人所有者的四类终审（资本与预算、组织与人事、法律与对外承诺、最终停止）只呈报、不代批。',
    '',
  ].join('\n')

  return `${header}${rights}\n${loadBearing}\n${collab}${ctx.supplyStatus}`
}

// ── 主流程 ──────────────────────────────────────────────────────────────────

/**
 * `--check`：把「产物记录的源快照」与「现场重算」逐条比对（DA-14）。
 *
 * 重算用的就是本文件里那两个 load 函数（与生成走同一条路），比对逻辑在
 * `source-freshness.mjs`（纯函数、自带测试）——判据与生成器**共用同一份实现**，
 * 不给"共享源是哪几个文件"造第二个家（P-07）。
 *
 * 退出码：0 全部一致；1 有漂移（点名共享文件与需重生成的条数）；2 读数不可用
 * （材料根读不到 / 目标目录还没有产物）——2 是"仪器不可用"，不是"新鲜"。
 */
function runSourceFreshnessCheck() {
  const namespaces = [
    { name: 'AGT', prefix: 'agt-', designCount: 50, load: loadSources },
    { name: 'MGT', prefix: 'mgt-', designCount: 3, load: loadMgtSources },
  ]
  let drifted = 0
  for (const ns of namespaces) {
    const dirs = existsSync(OUT_ROOT)
      ? readdirSync(OUT_ROOT).filter((name) => name.startsWith(ns.prefix))
      : []
    if (dirs.length === 0) {
      console.error(`[${ns.name}] ${OUT_ROOT} 下没有 ${ns.prefix}* 产物——先跑一次生成，本项才有对照面（读不到 ≠ 新鲜）`)
      process.exit(2)
    }
    let computed
    try {
      computed = ns.load()
    } catch (error) {
      console.error(`[${ns.name}] 源读不到（材料根 ${MATERIAL_ROOT}）：${error instanceof Error ? error.message : String(error)}`)
      process.exit(2)
    }
    const stale = []
    for (const dir of dirs.sort()) {
      let manifest = null
      try {
        manifest = JSON.parse(readFileSync(join(OUT_ROOT, dir, 'manifest.json'), 'utf8'))
      } catch {
        manifest = null
      }
      const verdict = judgeSourceFreshness({
        recorded: readRecordedSnapshot(manifest),
        computed: { revision: computed.sourceRevision, hashes: computed.hashes },
      })
      if (!verdict.fresh) stale.push({ dir, verdict })
    }
    if (stale.length > 0) {
      drifted += 1
      console.error(`✗ [${ns.name}] ${stale.length}/${dirs.length} 条产物与共享源不一致——${stale[0].verdict.reason}`)
      console.error(`   需重跑 node scripts/role-presets/generate.mjs 全量重生成（${ns.name} 本机 ${dirs.length} 条 / 设计存量 ${ns.designCount} 条）；举例：${stale.slice(0, 5).map((entry) => entry.dir).join('、')}${stale.length > 5 ? ' …' : ''}`)
    } else {
      console.log(`✓ [${ns.name}] ${dirs.length} 条产物与共享源一致（${computed.sourceRevision}）`)
    }
  }
  process.exit(drifted > 0 ? 1 : 0)
}

function main() {
  if (CHECK) {
    runSourceFreshnessCheck()
    return
  }
  const src = loadSources()
  const orgRoles = new Map(src.organizationGraph.roles.map((r) => [r.id, r]))
  const planes = new Map(src.organizationGraph.planes.map((p) => [p.id, p]))
  const domains = new Map(src.organizationGraph.domain_views.map((d) => [d.id, d]))
  const orgEdges = new Map()
  for (const e of src.organizationGraph.edges) {
    for (const side of ['from', 'to']) {
      const k = e[side]
      if (!orgEdges.has(k)) orgEdges.set(k, [])
      orgEdges.get(k).push(e)
    }
  }
  const mgmtBindings = new Map(src.managementGraph.role_bindings.map((b) => [b.role_id, b]))
  const mgmtEdges = new Map()
  for (const e of src.managementGraph.edges) {
    for (const side of ['from', 'to']) {
      const k = e[side]
      if (!mgmtEdges.has(k)) mgmtEdges.set(k, [])
      mgmtEdges.get(k).push(e)
    }
  }
  const lifeStatus = new Map(src.lifecycle.role_release_status.map((s) => [s.role_id, s]))
  const contributions = new Map(src.collaborationGraph.role_contributions.map((c) => [c.role_id, c]))
  const flowsById = new Map(src.collaborationGraph.flows.map((f) => [f.id, f]))
  const scenariosById = new Map(src.collaborationGraph.scenarios.map((s) => [s.id, s]))
  const collabEdges = new Map()
  for (const e of src.collaborationGraph.edges) {
    for (const side of ['from', 'to']) {
      const k = e[side]
      if (!collabEdges.has(k)) collabEdges.set(k, [])
      collabEdges.get(k).push(e)
    }
  }
  const orders = computeOrders(src.organizationGraph)
  const iconIndex = loadIconIndex()
  const managedAvatars = loadManagedAvatarIndex()
  const flowCatalogSections = splitSections(src.text.flowCatalog, 'FLOW-')
  const playbookSections = splitSections(src.text.playbooks, 'PB-')
  const rosterLines = src.text.roster.split('\n')

  // 技能供给：材料的中文业务技能名 → 现有技能库英文 id（skill-map.json，人工语义映射），
  // 外加该岗位参与的**共享** Playbook 技能 pb-00X（8 份手册装成全局技能，不逐 preset 复制）。
  const skillMap = JSON.parse(readFileSync(SKILL_MAP_PATH, 'utf8')).skills
  const installedSkills = new Set(
    readdirSync(SKILLS_ROOT, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name),
  )
  const danglingRefs = new Set()
  const inertRefs = new Set()

  /** 技能文件是否声明「模型不可自动调用」（与 dsh-skill-filesystem 同一读法，含引号形态）。 */
  const modelOffCache = new Map()
  function isModelOff(id) {
    if (modelOffCache.has(id)) return modelOffCache.get(id)
    let off = false
    try {
      const text = readFileSync(join(SKILLS_ROOT, id, 'SKILL.md'), 'utf8')
      const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? ''
      const value = /^disable-model-invocation:[ \t]*"?([a-z]+)"?[ \t]*$/m.exec(block)?.[1]
      off = value === 'true'
    } catch {
      off = false
    }
    modelOffCache.set(id, off)
    return off
  }

  /** 解析一个岗位的 skill-subset：映射供给并集 + 参与的 Playbook 技能 + 通用线 T0（可传定制子集）；返回映射明细供 manifest 存档。 */
  function resolveSkills(role, playbookIds, t0List = T0_SKILLS) {
    const mapping = (role.skills || []).map((name) => {
      const entry = skillMap[name]
      if (!entry) throw new Error(`${role.id}: 业务技能名未入映射表 → ${name}`)
      return { name, kind: entry.kind, supply: entry.supply, ...(entry.note ? { note: entry.note } : {}) }
    })
    const ids = new Set()
    for (const d of mapping) for (const s of d.supply) ids.add(s)
    for (const pb of playbookIds) ids.add(pb.toLowerCase())
    for (const id of ids) if (!installedSkills.has(id)) danglingRefs.add(`${role.id} → ${id}`)
    // 只有在生成的这一行尊重文件开关时，「白名单是否生效」才需要逐张核对；
    // 不尊重时正向注册恒为 modelInvocable: true，这条判据自然恒过。
    if (SUBSET_RESPECTS_FILE_FLAGS) {
      for (const id of ids) if (installedSkills.has(id) && isModelOff(id)) inertRefs.add(`${role.id} → ${id}`)
    }
    // ── S12 消费口闸门（Q5）：「一张卡只有被某份契约引用，才进模型目录」 ──────────
    //
    // 判据不在这里实现 —— 全部来自 packages/capabilities/dsh-paper2skills/lib/contract-gate.js，
    // 与独立核对器 check-contract-gate.mjs **共用同一份**判据（风险 N2：判据只能有一处）。
    //
    // 三态由 `P2S_CONTRACT_GATE` 决定，默认 count：
    //   count   = 过渡期口径（Q5 原文：先以「归位态可见 + 计数可查」的方式跑一轮，不硬拦）。
    //             白名单不变，但每个岗位的 bound/pending 记进 manifest，页面据此显示「待挂契约」。
    //   enforce = 硬拦：pending 的 p2s 条目从白名单移除。这是**对照测量的仪器**。
    //   off     = 完全不读契约（显式退出，会在收尾打印一行警告；不是默认值）。
    const gate = contractGateFor(ids)
    if (gate.mode === 'enforce') {
      for (const s of gate.pending) ids.delete(s)
      for (const s of gate.pending) contractGateRemoved.add(`${role.id} → ${s}`)
    }
    for (const s of gate.bound) contractGateBound.add(s)
    for (const s of gate.pending) contractGatePending.add(s)
    // ── 通用线 T0 并入（在契约闸门**之后**）──────────────────────────────────────
    //
    // 放在闸门之后的理由：闸门判的是 p2s- 卡的「这张卡有没有被契约引用」，第三方的
    // 通用技能不是 p2s 卡、没有契约可挂。放闸门之前它们会被算成 pending；一旦把
    // P2S_CONTRACT_GATE 切到 enforce，T0 就会被**静默删掉**——一条与计量模式无关的
    // 接线，不该跟着另一个开关的档位改变生死。
    //
    // t0List 参数化（ADR-0129 D5）：AGT 传全量 T0；MGT 传定制子集（全量减去
    // MGT_T0_EXCLUDED 三项：meeting-minutes/xindaya-translator/kami，理由见常量注释）。
    for (const s of t0List) {
      ids.add(s)
      if (!installedSkills.has(s)) danglingRefs.add(`${role.id} → ${s}（通用线 T0）`)
    }
    for (const s of t0List) t0Wired.add(s)
    return { ids: [...ids].sort(), mapping, contractGate: gate }
  }

  const rows = []
  // 先在内存完成 50 个岗位的全部解析、匹配和 manifest 构建；任何输入错误都在写盘前失败。
  // 这样源材料缺件、ID 错配或 Blueprint 越权不会留下半批新 preset。I/O 原子替换仍由
  // 后续 Host 适配门继续验证，当前阶段不触碰 resolver 或生产目录事务。
  const pendingWrites = []
  let written = 0
  let skipped = 0

  for (const role of src.roleCatalog.roles) {
    const id = role.id
    const org = orgRoles.get(id)
    const plane = planes.get(org.plane_id)
    const domain = domains.get(org.domain_view_id)
    const assets = src.roleAssets.get(id)
    if (!assets) throw new Error(`${id}: 角色资产未加载`)
    const cardText = assets.roleProfile.text
    const cardSha = assets.roleProfile.sha256
    const cardPath = SOURCE_FILES.roleCard(id)
    const sections = cardSections(cardText)
    const soulSummary = renderSoulSummary(assets.soul.text, `docs/${assets.soul.path}`, assets.soul.sha256)
    const soulSummarySha = sha256(soulSummary)

    const contribution = contributions.get(id)
    const flowIds = [...new Set([...(contribution?.eligible_flow_ids || []), ...(role.flows || [])])].sort()
    const flowRecords = flowIds.map((f) => flowsById.get(f)).filter(Boolean)
    const scenarioIdsFromFlows = [...new Set(flowRecords.flatMap((f) => f.scenario_ids || []))].sort()
    const scenarioRecords = [...new Set([...(role.scenarios || []), ...scenarioIdsFromFlows])]
      .sort()
      .map((s) => scenariosById.get(s))
      .filter(Boolean)
    const playbookIds = [...new Set([...(role.playbooks || []), ...flowRecords.map((f) => f.playbook_id)])]
      .filter(Boolean)
      .sort()
    const playbookRecords = playbookIds
      .map((pb) => playbookSections.find((s) => s.heading.startsWith(`## ${pb} `)))
      .filter(Boolean)
    const flowCatalogRecords = flowCatalogSections.filter((s) =>
      flowIds.some((f) => s.heading.startsWith(`## ${f} `)),
    )
    const rosterRow = rosterLines.find((l) => l.includes(`[${id}](roles/${id}.md)`)) || null

    const { ids: skillIds, mapping: skillMapping, contractGate: roleContractGate } = resolveSkills(role, playbookIds)

    // 本岗位作为**队长**时的选路条件，逐条取自各流程的 primary_role_selector。
    // 材料对零匹配/多匹配一律定 WAIT —— 编队生成器不得在此猜测队长。
    const leadRules = flowRecords.flatMap((flow) => {
      const selector = flow.primary_role_selector ?? {}
      return (selector.rules ?? [])
        .filter((rule) => rule.role_id === id)
        .map((rule) => ({
          flow: flow.id,
          rule: rule.selector_rule_id,
          condition: rule.condition_description,
          unconditional_default: rule.is_unconditional_default === true,
          selector_status: selector.status ?? null,
          zero_or_multiple_match_disposition: selector.zero_or_multiple_match_disposition ?? null,
        }))
    })

    const persona = renderPersona(role, {
      planeName: plane.name,
      domainName: domain.name,
      roleCardPath: join(MATERIAL_ROOT, 'docs', cardPath),
      roleCardSha: cardSha,
      sourceRevision: src.sourceRevision,
    }, soulSummary, renderSupplyStatus(skillMapping, playbookIds))

    const presetId = presetIdFor(id)
    const compositionRaw = renderComposition(persona, skillIds, presetId)
    // 本生成器只认自己产出的行；既有文件里其余行块（手插的本机装配）**原样带过、插回原位**。
    // 不这么做的话，「本机产品卡点了打不开」会以「生成器静默删行」的方式再次发生。
    const existingPath = join(OUT_ROOT, presetId, 'agent.cordis.yml')
    const managedIds = new Set([...compositionRaw.matchAll(/^- id: (\S+)\s*$/gm)].map((m) => m[1]))
    const carried = unmanagedRowBlocks(existsSync(existingPath) ? readFileSync(existingPath, 'utf8') : '', managedIds)
    const reinstated = carried.length === 0 ? { text: compositionRaw, repositioned: [], appended: [] } : reinstateRows(compositionRaw, carried)
    const composition = reinstated.text
    for (const bid of reinstated.repositioned) carriedRows.push(`${presetId} → ${bid}（原位）`)
    for (const bid of reinstated.appended) carriedRows.push(`${presetId} → ${bid}（⚠️ 前驱行不存在，追加到末尾，位置已变）`)

    const order = orders.get(id)
    const name = `${role.alias} · ${role.title}`
    const description =
      `【${plane.name}·${domain.name}】${role.mission}（标准产物：${role.artifact}）`
    const icon = managedAvatars.get(presetId)?.dark ?? iconIndex.get(presetId)
    if (!icon) {
      throw new Error(
        `岗位 ${presetId}（${name}）在图标库里没有对应头像。\n` +
          `  期望 ${ICON_MANIFEST} 里存在 id="${presetId}" 的条目。\n` +
          '  先生成头像库：node ~/.dsh/skills/lute-brand-icons/scripts/build.js\n' +
          '  （或用 ROLE_ICON_MANIFEST 指向别处；受管岗位见 brand/avatars/manifest.json）',
      )
    }
    const presetYml = renderPresetYml(name, description, order, icon)

    const blueprint = assets.presetBlueprint.record
    const bundleInput = {
      role_id: id,
      preset_id: presetId,
      version: blueprint.version,
      role_card_sha256: cardSha,
      soul_contract_sha256: assets.soul.sha256,
      role_playbook_sha256: assets.rolePlaybook.sha256,
      preset_blueprint_sha256: assets.presetBlueprint.sha256,
      production_authorized: false,
    }
    const rolePlaybookSkillId = `role-playbook-${presetId}`

    const manifest = {
      format: 'dsh-preset',
      version: 2,
      id: presetId,
      name,
      description,
      sourceDshVersion: SOURCE_DSH_VERSION,
      // 与 preset.yml 里那一份同串；浅色头像仅供自研展示，不扩官方 loader。
      icon,
      iconLight: managedAvatars.get(presetId).light,
      source_snapshot: {
        schema_version: 'rp-m2',
        snapshot_date: SNAPSHOT_DATE,
        source_root: MATERIAL_ROOT,
        source_revision: src.sourceRevision,
        generator_revision: GENERATOR_REVISION,
        generator_rules_revision: GENERATOR_REVISION,
        dependency_versions: { dsh: SOURCE_DSH_VERSION, node: process.version },
        shared_source_hashes: src.hashes,
        asset_index_hashes: src.assetIndexHashes,
        source_hashes: {
          role_card: cardSha,
          soul_contract: assets.soul.sha256,
          role_playbook: assets.rolePlaybook.sha256,
          preset_blueprint: assets.presetBlueprint.sha256,
        },
      },
      role_assets: {
        role_id: id,
        preset_id: presetId,
        role_profile: {
          ref: `docs/${assets.roleProfile.path}`,
          sha256: cardSha,
        },
        soul: {
          ref: `docs/${assets.soul.path}`,
          sha256: assets.soul.sha256,
          persona_summary_sha256: soulSummarySha,
          text: assets.soul.text,
        },
        role_playbook: {
          ref: `docs/${assets.rolePlaybook.path}`,
          sha256: assets.rolePlaybook.sha256,
          skill_id: rolePlaybookSkillId,
          loader: 'target-host-to-be-verified',
          source: `ai-org-material:${assets.rolePlaybook.path}`,
          body_sha256: assets.rolePlaybook.sha256,
          user_invocable: false,
          installed: false,
          text: assets.rolePlaybook.text,
        },
        preset_blueprint: {
          ref: `docs/${assets.presetBlueprint.path}`,
          sha256: assets.presetBlueprint.sha256,
          version: blueprint.version,
          record: blueprint,
        },
        runtime_contract: {
          status: blueprint.status,
          production_authorized: blueprint.assurance?.production_authorized === true,
          composition_owner: blueprint.modes?.composition?.orchestration_owner,
          peer_chat: blueprint.modes?.composition?.peer_chat,
          re_delegation: blueprint.modes?.composition?.re_delegation,
          can_execute_assets: blueprint.modes?.standalone?.can_execute_assets,
          action_boundary: blueprint.tools?.action_boundary,
        },
        role_release_bundle_ref: {
          bundle_id: `RRB-${id}`,
          version: blueprint.version,
          content_hash: `sha256:${sha256(canonicalJson(bundleInput))}`,
          status: blueprint.status,
        },
      },
      material: {
        snapshot_date: SNAPSHOT_DATE,
        source_root: MATERIAL_ROOT,
        source_hashes: src.hashes,
        role_card: { path: cardPath, sha256: cardSha, text: cardText, sections },
        role_catalog: {
          path: SOURCE_FILES.roleCatalog,
          sha256: src.hashes.roleCatalog,
          record: role,
        },
        organization_graph: {
          path: SOURCE_FILES.organizationGraph,
          sha256: src.hashes.organizationGraph,
          role_entry: org,
          plane,
          domain_view: domain,
          edges: orgEdges.get(id) || [],
        },
        agent_management_graph: {
          path: SOURCE_FILES.managementGraph,
          sha256: src.hashes.managementGraph,
          role_binding: mgmtBindings.get(id) || null,
          contract_types: src.managementGraph.contract_types,
          release_rules: src.managementGraph.release_rules,
          edges: mgmtEdges.get(id) || [],
        },
        agent_lifecycle: {
          path: SOURCE_FILES.lifecycle,
          sha256: src.hashes.lifecycle,
          role_release_status: lifeStatus.get(id) || null,
          states: src.lifecycle.states,
          transitions: src.lifecycle.transitions,
        },
        collaboration_graph: {
          path: SOURCE_FILES.collaborationGraph,
          sha256: src.hashes.collaborationGraph,
          role_contribution: contribution || null,
          flows: flowRecords,
          scenarios: scenarioRecords,
          edges: collabEdges.get(id) || [],
        },
        flow_catalog: {
          path: SOURCE_FILES.flowCatalog,
          sha256: src.hashes.flowCatalog,
          sections: flowCatalogRecords,
        },
        playbooks: {
          path: SOURCE_FILES.playbooks,
          sha256: src.hashes.playbooks,
          sections: playbookRecords,
        },
        roster: { path: SOURCE_FILES.roster, sha256: src.hashes.roster, row: rosterRow },
      },
      x_lute: {
        plane: { id: plane.id, name: plane.name, purpose: plane.purpose },
        domain: { id: domain.id, name: domain.name },
        order,
        lifecycle: {
          status: 'draft',
          production_authorized: false,
          note: '设计期草案：与材料 ADR-0005/D-023 的 Role Release Bundle 七状态门禁一致，不构成生产授权。',
        },
        squad: {
          // 队长资格由材料决定，不是常量：只有 primary_eligible_flow_ids 非空的岗位
          // 才可能担任某条工单的主岗位人格（材料 50 个岗位中仅 12 个具备）。
          // 硬编码 true 会让编队生成器选出一个永远当不了队长的岗位。
          can_be_primary: (contribution?.primary_eligible_flow_ids || []).length > 0,
          primary_flows: contribution?.primary_eligible_flow_ids || [],
          eligible_flows: contribution?.eligible_flow_ids || [],
          lead_rules: leadRules,
          contribution_modes: contribution?.contribution_modes || [],
          collaborates_with: role.collaborates_with || [],
          artifact: role.artifact,
          metrics: role.metrics,
          skills: role.skills || [],
        },
        skills: {
          mapping_source: 'scripts/role-presets/skill-map.json',
          subset: skillIds,
          material_skill_names: role.skills || [],
          mapping: skillMapping,
          gaps: skillMapping.filter((d) => d.kind === 'gap').map((d) => d.name),
          shared_playbook_skills: playbookIds.map((p) => p.toLowerCase()),
          // 通用线 T0：本岗挂载的通用底座（所有岗位同一份）。归档在此，便于事后回答
          // 「某个岗位当时到底挂了哪些通用技能」——预设 yml 只存列表，不存来源。
          generic_t0: T0_SKILLS,
          generic_t0_source: 'packages/capabilities/dsh-overseas-skills/manifest/generic-skills.json',
          // S12 消费口闸门：本岗白名单里哪些卡被契约引用（bound）、哪些没有（pending）。
          // 页面据此显示「待挂契约」——归位态的第 3 个值，不是静默暴露也不是断崖式移除。
          contract_gate: {
            mode: roleContractGate.mode,
            bound: roleContractGate.bound,
            pending: roleContractGate.pending,
            ...(roleContractGate.note ? { note: roleContractGate.note } : {}),
          },
        },
      },
    }

    const dirId = presetIdFor(id)
    const dir = join(OUT_ROOT, dirId)
    rows.push({
      id,
      dirId,
      order,
      plane: plane.name,
      domain: domain.name,
      name,
      sections: sections.length,
      cardBytes: cardText.length,
      flows: flowIds.length,
      playbooks: playbookIds.length,
      scenarios: scenarioRecords.length,
      squadSkills: (role.skills || []).length,
      subsetSkills: skillIds.length,
      t0Skills: T0_SKILLS.filter((s) => skillIds.includes(s)).length,
      t0Expected: T0_SKILLS.length,
      gaps: skillMapping.filter((d) => d.kind === 'gap').length,
      collab: (role.collaborates_with || []).length,
    })

    if (DRY_RUN) continue
    pendingWrites.push({ dir, dirId, presetYml, manifest, composition, t0List: T0_SKILLS })
  }

  // ── 管理层（MGT）分支（ADR-0129 D1~D5）───────────────────────────────────────
  //
  // 只读管理层自有材料，不触碰上面已装载的任何 AGT 共享源——存量 50 个 preset 的
  // cordis/preset.yml 字节零扰动是硬验收判据（manifest 仅 generator_revision 随本文件变）。
  const msrc = loadMgtSources()
  const mgtOrders = computeMgtOrders(msrc.catalog, msrc.dsh)
  // 覆盖闭合交叉校验：两个管理域的 AGT 覆盖并集 = 全集、零双线；层内覆盖（CEO→两位负责人）单独核。
  {
    const agtIds = new Set(src.roleCatalog.roles.map((r) => r.id))
    const covered = new Map()
    for (const mrole of msrc.catalog.roles) {
      for (const o of mrole.owned_role_ids || []) {
        if (o.startsWith('MGT-')) {
          if (!msrc.catalog.roles.some((x) => x.id === o)) throw new Error(`${mrole.id}: owned ${o} 不在管理层内`)
          continue
        }
        if (!agtIds.has(o)) throw new Error(`${mrole.id}: owned ${o} 不在 AGT 集合`)
        if (covered.has(o)) throw new Error(`AGT 岗位 ${o} 双线归属：${covered.get(o)} 与 ${mrole.id}`)
        covered.set(o, mrole.id)
      }
    }
    for (const a of agtIds) {
      if (!covered.has(a)) throw new Error(`${a} 无管理域覆盖——两域并集必须等于 AGT 全集（材料 coverage_verification.union_equals_full_set）`)
    }
    const cv = msrc.catalog.coverage_verification
    if (cv?.union_equals_full_set !== true || cv?.overlap_count !== 0 || cv?.union_size !== agtIds.size) {
      throw new Error('management-catalog coverage_verification 与实际覆盖核验不一致')
    }
  }
  const mgtT0 = T0_SKILLS.filter((s) => !MGT_T0_EXCLUDED[s])
  const mgtPlane = msrc.dsh.projection_plane
  const mgtDomain = msrc.dsh.projection_domain

  for (const mrole of msrc.catalog.roles) {
    const id = mrole.id
    const presetId = presetIdFor(id) // loader 已与 dsh_integration.preset_ids 交叉核对
    const assets = msrc.mgtAssets.get(id)
    const cardText = assets.roleProfile.text
    const cardSha = assets.roleProfile.sha256
    const cardPath = MGT_SOURCE_FILES.roleCard(id)
    const sections = cardSections(cardText)
    if (sections.length !== 7) throw new Error(`${id}: 管理岗位卡应为 7 个 ## 小节，实为 ${sections.length}`)
    const soulSummary = renderMgtSoulSummary(assets.soul.text, `docs/${assets.soul.path}`, assets.soul.sha256, id)
    const soulSummarySha = sha256(soulSummary)

    const { ids: skillIds, mapping: skillMapping, contractGate: roleContractGate } = resolveSkills(mrole, [], mgtT0)
    const supplyStatus = renderSupplyStatus(skillMapping, [], [
      `通用线 T0 在本管理岗位只挂定制子集 ${mgtT0.length}/${T0_SKILLS.length} 条（ADR-0129 D5），未挂项与理由：`,
      ...Object.entries(MGT_T0_EXCLUDED).map(([name, why]) => `- ${name}：${why}`),
    ])
    const persona = renderMgtPersona(mrole, {
      dsh: msrc.dsh,
      planeName: mgtPlane.name,
      domainName: mgtDomain.name,
      cardPath: join(MATERIAL_ROOT, 'docs', cardPath),
      cardSha,
      sourceRevision: msrc.sourceRevision,
      soulSummary,
      supplyStatus,
      evalStatusLine: msrc.evalStatusLine,
      svSha: msrc.hashes.shadowVerification,
      catalog: msrc.catalog,
    })

    const compositionRaw = renderComposition(persona, skillIds, presetId)
    const existingPath = join(OUT_ROOT, presetId, 'agent.cordis.yml')
    const managedIds = new Set([...compositionRaw.matchAll(/^- id: (\S+)\s*$/gm)].map((m) => m[1]))
    const carried = unmanagedRowBlocks(existsSync(existingPath) ? readFileSync(existingPath, 'utf8') : '', managedIds)
    const reinstated = reinstateRows(compositionRaw, carried)
    const composition = reinstated.text
    for (const bid of reinstated.repositioned) carriedRows.push(`${presetId} → ${bid}（原位）`)
    for (const bid of reinstated.appended) carriedRows.push(`${presetId} → ${bid}（⚠️ 前驱行不存在，追加到末尾，位置已变）`)

    const order = mgtOrders.get(id)
    const name = `${mrole.alias} · ${mrole.title}`
    const description =
      `【${mgtPlane.name}·${mgtDomain.name}】${mrole.mission}（标准产物：${mrole.artifact}）〔管理层·评估载体·未授权Shadow〕`
    const icon = managedAvatars.get(presetId)?.dark ?? iconIndex.get(presetId)
    if (!icon) {
      throw new Error(
        `管理岗位 ${presetId}（${name}）在图标库里没有对应头像。\n` +
          `  期望 ${ICON_MANIFEST} 里存在 id="${presetId}" 的条目。\n` +
          '  先生成头像库：node ~/.dsh/skills/lute-brand-icons/scripts/build.js\n' +
          '  （或用 ROLE_ICON_MANIFEST 指向别处；受管岗位见 brand/avatars/manifest.json）',
      )
    }
    const presetYml = renderPresetYml(name, description, order, icon)

    const blueprint = assets.presetBlueprint.record
    const bundleInput = {
      role_id: id,
      preset_id: presetId,
      version: blueprint.version,
      role_card_sha256: cardSha,
      soul_contract_sha256: assets.soul.sha256,
      role_playbook_sha256: assets.rolePlaybook.sha256,
      preset_blueprint_sha256: assets.presetBlueprint.sha256,
      production_authorized: false,
    }
    const rolePlaybookSkillId = `role-playbook-${presetId}`
    const myCadences = Object.entries(msrc.catalog.operating_model.cadence)
      .filter(([, roles]) => roles.includes(id))
      .map(([k]) => k)

    const manifest = {
      format: 'dsh-preset',
      version: 2,
      id: presetId,
      name,
      description,
      sourceDshVersion: SOURCE_DSH_VERSION,
      icon,
      source_snapshot: {
        schema_version: 'rp-m2-mgt',
        snapshot_date: MGT_SNAPSHOT_DATE,
        source_root: MATERIAL_ROOT,
        source_revision: msrc.sourceRevision,
        generator_revision: GENERATOR_REVISION,
        generator_rules_revision: GENERATOR_REVISION,
        dependency_versions: { dsh: SOURCE_DSH_VERSION, node: process.version },
        // MGT 共享源与 AGT 共享源相互独立（ADR-0129 D3）：材料侧更新验证状态只重生成 3 个 MGT。
        shared_source_hashes: msrc.hashes,
        asset_index_hashes: msrc.assetIndexHashes,
        source_hashes: {
          role_card: cardSha,
          soul_contract: assets.soul.sha256,
          role_playbook: assets.rolePlaybook.sha256,
          preset_blueprint: assets.presetBlueprint.sha256,
        },
      },
      role_assets: {
        role_id: id,
        preset_id: presetId,
        role_profile: {
          ref: `docs/${assets.roleProfile.path}`,
          sha256: cardSha,
        },
        soul: {
          ref: `docs/${assets.soul.path}`,
          sha256: assets.soul.sha256,
          persona_summary_sha256: soulSummarySha,
          text: assets.soul.text,
        },
        role_playbook: {
          ref: `docs/${assets.rolePlaybook.path}`,
          sha256: assets.rolePlaybook.sha256,
          skill_id: rolePlaybookSkillId,
          loader: 'target-host-to-be-verified',
          source: `ai-org-material:${assets.rolePlaybook.path}`,
          body_sha256: assets.rolePlaybook.sha256,
          user_invocable: false,
          installed: false,
          text: assets.rolePlaybook.text,
        },
        preset_blueprint: {
          ref: `docs/${assets.presetBlueprint.path}`,
          sha256: assets.presetBlueprint.sha256,
          version: blueprint.version,
          record: blueprint,
        },
        runtime_contract: {
          status: blueprint.status,
          production_authorized: false,
          authorization_status: msrc.dsh.authorization_status,
          composition_owner: blueprint.modes?.composition?.orchestration_owner,
          case_role_participation: blueprint.modes?.composition?.case_role_participation,
          peer_chat: blueprint.modes?.composition?.peer_chat,
          re_delegation: blueprint.modes?.composition?.re_delegation,
          can_execute_assets: blueprint.modes?.standalone?.can_execute_assets,
          can_emit_action_intent: blueprint.modes?.standalone?.can_emit_action_intent,
          action_boundary: blueprint.tools?.action_boundary,
          visibility: 'read_only_aggregate_view',
          credentials: blueprint.tools?.credentials,
        },
        role_release_bundle_ref: {
          bundle_id: `RRB-${id}`,
          version: blueprint.version,
          content_hash: `sha256:${sha256(canonicalJson(bundleInput))}`,
          status: blueprint.status,
        },
      },
      material: {
        snapshot_date: MGT_SNAPSHOT_DATE,
        source_root: MATERIAL_ROOT,
        source_hashes: msrc.hashes,
        role_card: { path: cardPath, sha256: cardSha, text: cardText, sections },
        management_catalog: {
          path: MGT_SOURCE_FILES.managementCatalog,
          sha256: msrc.hashes.managementCatalog,
          record: mrole,
          layout: msrc.catalog.layout,
          coverage_verification: msrc.catalog.coverage_verification,
          runtime_model: msrc.catalog.runtime_model,
          operating_model: msrc.catalog.operating_model,
          evidence_base: msrc.catalog.evidence_base,
          semantics: msrc.catalog.semantics,
          structure_history: msrc.catalog.structure_history,
          dsh_integration: msrc.dsh,
        },
        // 四份共享设计文档**逐字**归档（全量保真范式）；SHADOW-VERIFICATION 状态变化 →
        // 共享哈希变 → 3 个 MGT preset 重生成 → persona 披露块自动更新（状态不腐烂）。
        management_design: {
          management_layer: {
            path: MGT_SOURCE_FILES.managementLayer,
            sha256: msrc.hashes.managementLayer,
            text: msrc.text.managementLayer,
          },
          decision_rights: {
            path: MGT_SOURCE_FILES.decisionRights,
            sha256: msrc.hashes.decisionRights,
            text: msrc.text.decisionRights,
          },
          enforcement: {
            path: MGT_SOURCE_FILES.enforcement,
            sha256: msrc.hashes.enforcement,
            text: msrc.text.enforcement,
          },
          shadow_verification: {
            path: MGT_SOURCE_FILES.shadowVerification,
            sha256: msrc.hashes.shadowVerification,
            text: msrc.text.shadowVerification,
            status_line: msrc.evalStatusLine,
          },
        },
      },
      x_lute: {
        plane: { id: mgtPlane.id, name: mgtPlane.name, purpose: mgtPlane.purpose },
        domain: { id: mgtDomain.id, name: mgtDomain.name },
        order,
        lifecycle: {
          status: 'draft',
          production_authorized: false,
          authorization_status: msrc.dsh.authorization_status,
          note: '管理层评估载体：限 MGT-EVAL 与人在环决策演练；Prompt 层边界不构成服务端权限控制；不构成 Shadow 或生产授权（ADR-0129 D1）。',
        },
        management: {
          layer: mrole.layer,
          case_role_participation: 'none',
          standalone_only: true,
          squad: null, // 管理层不编队、不担任 Lead/Worker（ADR-0020 语义不扩）
          decision_rights: mrole.decision_rights,
          decision_rights_explicitly_not_granted: mrole.decision_rights_explicitly_not_granted,
          owned_role_ids: mrole.owned_role_ids,
          owned_role_count: mrole.owned_role_count,
          collaborates_with: mrole.collaborates_with,
          artifact: mrole.artifact,
          metrics: mrole.metrics,
          skills: mrole.skills,
          boundary: mrole.boundary,
          second_principle: mrole.second_principle || null,
          domain_tension: mrole.domain_tension,
          cadences: myCadences,
          daily_queue: Object.entries(msrc.catalog.operating_model.daily_queue_dispatch)
            .find(([, owner]) => owner === id)?.[0] ?? null,
          cadence_scheduler: msrc.catalog.operating_model.cadence_scheduler,
          ladder_ref: `docs/${MGT_SOURCE_FILES.decisionRights}`,
          mdc_goc_schema_ref: `docs/${MGT_SOURCE_FILES.enforcement}`,
        },
        skills: {
          mapping_source: 'scripts/role-presets/skill-map.json',
          subset: skillIds,
          material_skill_names: mrole.skills || [],
          mapping: skillMapping,
          gaps: skillMapping.filter((d) => d.kind === 'gap').map((d) => d.name),
          shared_playbook_skills: [],
          generic_t0: mgtT0,
          generic_t0_excluded: MGT_T0_EXCLUDED,
          generic_t0_source: 'packages/capabilities/dsh-overseas-skills/manifest/generic-skills.json',
          contract_gate: {
            mode: roleContractGate.mode,
            bound: roleContractGate.bound,
            pending: roleContractGate.pending,
            ...(roleContractGate.note ? { note: roleContractGate.note } : {}),
          },
        },
      },
    }

    rows.push({
      id,
      dirId: presetId,
      order,
      plane: mgtPlane.name,
      domain: mgtDomain.name,
      name,
      sections: sections.length,
      cardBytes: cardText.length,
      flows: (mrole.flows || []).length,
      playbooks: 0,
      scenarios: 0,
      squadSkills: (mrole.skills || []).length,
      subsetSkills: skillIds.length,
      t0Skills: mgtT0.filter((s) => skillIds.includes(s)).length,
      t0Expected: mgtT0.length,
      gaps: skillMapping.filter((d) => d.kind === 'gap').length,
      collab: (mrole.collaborates_with || []).length,
    })

    if (DRY_RUN) continue
    pendingWrites.push({ dir: join(OUT_ROOT, presetId), dirId: presetId, presetYml, manifest, composition, t0List: mgtT0 })
  }

  // 只有全部岗位（AGT + MGT）完成内存构建后才进入派生输出写盘阶段。
  for (const { dir, dirId, presetYml, manifest, composition, t0List } of pendingWrites) {
    mkdirSync(dir, { recursive: true })
    for (const stale of ['preset.yml', 'manifest.json', 'agent.cordis.yml']) {
      const p = join(dir, stale)
      if (existsSync(p)) rmSync(p)
    }
    writeFileSync(join(dir, 'preset.yml'), presetYml, 'utf8')
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8')
    writeFileSync(join(dir, 'agent.cordis.yml'), composition, 'utf8')
    written++
    // 写盘之后**按真实字节**核对 T0 是否真的落进了这一行，而不是相信上面的意图。
    // 「写了但从没跑到」这一类缺陷只有在读回落盘产物时才拦得住（P-17）。
    // t0List 是该 preset 的期望集：AGT=全量 15；MGT=定制子集 12（ADR-0129 D5）。
    const back = readFileSync(join(dir, 'agent.cordis.yml'), 'utf8')
    const m = /id:\s*skill-subset[\s\S]{0,600}?skills:\s*\[([^\]]*)\]/.exec(back)
    const inFile = new Set((m?.[1] ?? '').split(',').map((x) => x.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean))
    const miss = t0List.filter((s) => !inFile.has(s))
    if (miss.length) t0MissingInFile.push(`${dirId} 缺 ${miss.join(', ')}`)
    t0RolesChecked++
  }

  // ── 汇总 ──
  console.log(`材料根：${MATERIAL_ROOT}`)
  console.log(`输出根：${OUT_ROOT}${DRY_RUN ? '  （--dry-run，未写盘）' : ''}`)
  console.log(`基座：shipped standard 行集（D5）+ persona 替换 + skill-subset 追加`)
  console.log()
  console.log(
    ['AGT', 'dir', 'order', '平面', '责任域', '节', '卡字符', 'FLOW', 'PB', 'SCN', '映射', 'subset', 'T0', '缺口', '协作'].join('\t'),
  )
  for (const r of rows) {
    console.log(
      [
        r.id,
        r.dirId,
        r.order,
        r.plane,
        r.domain,
        r.sections,
        r.cardBytes,
        r.flows,
        r.playbooks,
        r.scenarios,
        r.squadSkills,
        r.subsetSkills,
        r.t0Skills,
        r.gaps,
        r.collab,
      ].join('\t'),
    )
  }
  console.log()
  const totalSections = rows.reduce((a, r) => a + r.sections, 0)
  const totalCardBytes = rows.reduce((a, r) => a + r.cardBytes, 0)
  // 数量断言从材料 role_count 派生（ADR-0129 D6④，审计发现 C 的最小改）：
  // 「50/3」不再写死在这里，材料增减岗位时断言跟随，硬编码只剩显式对照常量。
  const expectedAgt = src.roleCatalog.role_count
  const expectedMgt = msrc.catalog.role_count
  const EXPECTED_AGT_CONSTANT = 50
  const EXPECTED_MGT_CONSTANT = 3
  if (expectedAgt !== EXPECTED_AGT_CONSTANT || expectedMgt !== EXPECTED_MGT_CONSTANT) {
    console.error(`✗ 材料 role_count（AGT ${expectedAgt} / MGT ${expectedMgt}）与本文件显式常量（${EXPECTED_AGT_CONSTANT}/${EXPECTED_MGT_CONSTANT}）不一致——`)
    console.error('  岗位增减是基线变更：先改常量并核对 shipped-presets/门禁账本/verify-lossless，再生成。')
    process.exit(1)
  }
  if (src.roleCatalog.roles.length !== expectedAgt || msrc.catalog.roles.length !== expectedMgt) {
    console.error('✗ 材料 role_count 与 roles[] 实际条数不一致')
    process.exit(1)
  }
  console.log(`岗位数：${rows.length}（期望 ${expectedAgt} AGT + ${expectedMgt} MGT = ${expectedAgt + expectedMgt}）`)
  if (rows.length !== expectedAgt + expectedMgt) {
    console.error(`✗ 实际构建 ${rows.length} 行 ≠ 期望 ${expectedAgt + expectedMgt}`)
    process.exit(1)
  }
  console.log(`岗位卡小节总数：${totalSections}（期望 (${expectedAgt} + ${expectedMgt}) × 7 = ${(expectedAgt + expectedMgt) * 7}）`)
  console.log(`岗位卡字节总数：${totalCardBytes}`)
  const byPlane = {}
  for (const r of rows) byPlane[r.plane] = (byPlane[r.plane] || 0) + 1
  console.log(`平面分布：${JSON.stringify(byPlane)}（期望 经营管理 5 / 业务运营 35 / 独立控制 5 / 数据与Agent平台 5 / ${mgtPlane.name} ${expectedMgt}）`)
  const totalSubset = rows.reduce((a, r) => a + r.subsetSkills, 0)
  const totalGaps = rows.reduce((a, r) => a + r.gaps, 0)
  console.log(`skill-subset 引用总条目：${totalSubset}（跨岗位去重后 ${new Set(rows.map((r) => r.subsetSkills)).size} 种规模）`)
  console.log(`未获供给的材料业务技能名（gap）条目数：${totalGaps}`)
  console.log(`技能库实际规模：${installedSkills.size} 项（含 8 份 pb-00X 共享手册技能）`)
  if (danglingRefs.size > 0) {
    console.error(`\n✗ skill-subset 存在悬空引用（${danglingRefs.size} 条）—— 会静默遮蔽，必须修：`)
    for (const d of [...danglingRefs].slice(0, 20)) console.error('  ' + d)
    process.exit(1)
  }
  console.log('★ skill-subset 全部引用真实存在的技能（0 悬空）')
  // 白名单**生效性**：这一条与「悬空」是两种不同的静默失败。悬空 = 名字指向不存在的技能，
  // 注册报错但被 catch 吞掉；死位 = 技能存在、注册成功，却因为 respectFileFlags 读到文件的
  // disable-model-invocation: true 而 modelInvocable: false —— 岗位以为自己装配了它，
  // 模型却永远不会挑它，界面上两边都正常。
  if (inertRefs.size > 0) {
    console.error(`\n✗ skill-subset 有 ${inertRefs.size} 个白名单位是死的（挂了它，但模型不会自动调用）：`)
    for (const d of [...inertRefs].slice(0, 20)) console.error('  ' + d)
    console.error('  两条出路，选一条并把语义写进本文件：')
    console.error('    1) SUBSET_RESPECTS_FILE_FLAGS = false —— 岗位装配权威，设置页开关管岗位之外；')
    console.error('    2) 打开这些卡的文件开关（disable-model-invocation: false）后保留 true。')
    process.exit(1)
  }
  console.log(SUBSET_RESPECTS_FILE_FLAGS
    ? '★ 白名单全部生效（respectFileFlags: true，且名单内文件开关与之一致）'
    : '★ 白名单全部生效（respectFileFlags: false，岗位装配权威）')

  // ── 通用线 T0：接线读数必须落到真实字节上 ────────────────────────────────────
  //
  // 只报「T0 名单有 N 条」是自述，不是读数：那些条目有没有真的进每个 preset 的
  // skill-subset，只有回读落盘文件才算数。故此处报的是**回读结果**。
  console.log('')
  console.log(`通用线 T0：${T0_SKILLS.length} 条（AGT 全量挂载）· MGT 定制子集 ${mgtT0.length} 条（剔除 ${Object.keys(MGT_T0_EXCLUDED).join('、')}，理由家在 MGT_T0_EXCLUDED / ADR-0129 D5）· 回读 ${t0RolesChecked} 个 agent.cordis.yml 核对`)
  if (GENERIC_NON_T0.length > 0) {
    console.log(`  通用线非 T0（${GENERIC_NON_T0.length} 条，按岗位族挂，本次**未接**）：${GENERIC_NON_T0.join(', ')}`)
  }
  if (t0MissingInFile.length > 0) {
    console.error(`\n✗ 通用线 T0 未完整落进 preset（${t0MissingInFile.length} 个岗位）：`)
    for (const d of t0MissingInFile.slice(0, 20)) console.error('  ' + d)
    process.exit(1)
  }
  if (t0RolesChecked === 0 && !DRY_RUN) {
    console.error('\n✗ 通用线 T0 一条都没核对到 —— 这条判据没有跑到，不能算通过（P-17）')
    process.exit(1)
  }
  if (DRY_RUN) {
    // dry-run 没有落盘可回读，但「意图」这一层仍要判：否则 dry-run 会给出一个
    // 比真实运行更宽松的绿，而人正是拿它来决定要不要真实运行。
    const short = rows.filter((r) => r.t0Skills !== r.t0Expected)
    if (short.length) {
      console.error(`\n✗ 通用线 T0 未进入 ${short.length} 个岗位的待写名单（AGT 应为每岗 ${T0_SKILLS.length} 条，MGT 应为每岗 ${mgtT0.length} 条）：`)
      for (const r of short.slice(0, 20)) console.error(`  ${r.dirId} 只有 ${r.t0Skills} 条（期望 ${r.t0Expected}）`)
      process.exit(1)
    }
    console.log(`★ [dry-run] T0 在 ${rows.length}/${rows.length} 个岗位的待写名单里按各自期望集齐备（AGT ${T0_SKILLS.length} / MGT ${mgtT0.length}；尚未回读，真实运行才回读）`)
  }
  if (!DRY_RUN) {
    if (t0Wired.size !== T0_SKILLS.length) {
      console.error(`\n✗ 通用线 T0 只挂了 ${t0Wired.size}/${T0_SKILLS.length} 条：${T0_SKILLS.filter((s) => !t0Wired.has(s)).join(', ')}`)
      process.exit(1)
    }
    console.log(`★ 通用线 T0 ${T0_SKILLS.length}/${T0_SKILLS.length} 条在 ${t0RolesChecked}/${rows.length} 个岗位的 skill-subset 里逐字回读命中`)
  }

  // ── S12 消费口闸门：账与模式必须一起报（口径不能只留在代码里）────────────────
  if (!contractGate) {
    console.warn('⚠️ 契约闸门被 P2S_CONTRACT_GATE=off 显式关闭 —— 本次生成的模型目录**未经契约引用核对**。')
    console.warn('   这不是默认状态；默认 count 会算账并写进 manifest。')
  } else {
    const { counts } = contractGate.resolved
    const RK = contractGate.lib.REF_KIND
    console.log('')
    console.log(`契约闸门（S12/Q5）模式：${CONTRACT_GATE_MODE}  ·  契约 ${contractGate.contracts} 份  ·  vault ${contractGate.vault}`)
    console.log(`  契约引用条目：绑定 ${counts[RK.BOUND]} / 待装线 ${counts[RK.PENDING_INSTALL]} / 无法解析 ${counts[RK.UNRESOLVABLE]}`)
    console.log(`  白名单里的 p2s 条目（跨岗位去重）：${contractGateBound.size + contractGatePending.size}`)
    console.log(`    ├ 已挂契约      ${contractGateBound.size}`)
    console.log(`    └ 待挂契约      ${contractGatePending.size}   ← 已写进 manifest 的 x_lute.skills.contract_gate，页面显示「待挂契约」`)
    if (CONTRACT_GATE_MODE === 'enforce') {
      console.log(`  硬拦：已从白名单移除 ${contractGateRemoved.size} 条（跨岗位计），它们不再进模型目录`)
    } else {
      console.log('  过渡期口径（Q5）：只计数不硬拦。硬拦请用 P2S_CONTRACT_GATE=enforce（对照测量的仪器）。')
    }
  }
  if (carriedRows.length > 0) {
    console.log('')
    console.log(`⚠️ 原样带过了 ${carriedRows.length} 个**非生成器产出**的行块（手插的本机装配）：`)
    for (const r of carriedRows) console.log(`  ${r}`)
    console.log('   本脚本只重写自己产出的行，不再删除别人的行。')
    console.log('   按 AGENTS.md/ADR-0061，本机产品装配的正确位置是 profile 的 cordis.patch.yml；')
    console.log('   留在生成的 preset 里会在下次重生成时被再次带过（不再消失，但也不该长期在这）。')
  }
  if (!DRY_RUN) console.log(`已写入：${written} 个 preset 目录，跳过 ${skipped}`)
}

main()
