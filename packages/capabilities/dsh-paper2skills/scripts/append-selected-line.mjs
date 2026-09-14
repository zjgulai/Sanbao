#!/usr/bin/env node
/**
 * append-selected-line.mjs — S5/B11：把**精选线独有的 53 张卡**接进产品侧分类底本。
 *
 * 为什么必须有这一步（不是可选的美化）
 * ------------------------------------
 * `staging/<L2 域>/<slug>/SKILL.md` 是产品侧卡的实物，而 `data/classification.json`
 * 是它的**分类底本**。`scripts/verify-install.mjs` 除了逐卡核对 frontmatter 的分类字段，
 * 还会把「占用 `p2s-` 前缀、但底本里没有」的目录判成**编外目录**并 exit 1。
 * 所以只往 staging 放 53 个新目录而不动底本 ⇒ 安装校验**必然报红**。
 *
 * 反过来，S12 的消费口闸门又把「契约引用了精选线 id 但技能目录里没有」记成 `待装线`
 * （实测 14 条），并**明文写着**这是 S5 换底的前置依赖。两边指的是同一件事。
 *
 * 纪律
 * ----
 *  · **不新造任何分类事实**：本脚本的全部输入是
 *    `paper2skills-vault/07-资源库/card-classification.json`（F5 的 146 张卡端事实源）
 *    与 `lib/taxonomy.js` 的 `slugFor` / `resolveFacets`（判据的唯一实现）。
 *    本脚本只做「搬运 + 按判据展开」，一个 L3 都不改写、一个 slot 都不新增。
 *  · **只增不改**：已存在的 id 一律不动（`--check` 会把任何字段差异报出来）。
 *  · **幂等**：重复 `--apply` 不产生第二份条目。
 *  · **slug 撞车必须报红**：`slugFor()` 会把非 ASCII 折成 `-`（`Skill-X-中文` → `p2s-x`），
 *    因此精选线 id 有可能折出**已被 legacy 卡占用**的 slug。撞车 = 两张卡争一个目录名，
 *    必须显式报出来，绝不静默改名（改名会让 S12 的 id→slug 换算算错）。
 *
 * 退出码：0 全过 / 1 判红 / 2 输入没拿到（≠ 通过）/ 3 内部错误
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadTaxonomy, slugFor, resolveFacets, DATA_DIR, SLUG_PREFIX, NAME_RE } from '../lib/taxonomy.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const PKG_ROOT = resolve(HERE, '..')
const argv = process.argv.slice(2)
const flag = (n, d) => {
  const i = argv.indexOf(`--${n}`)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d
}
const has = (n) => argv.includes(`--${n}`)

const VAULT = flag('vault', process.env.P2S_VAULT
  ?? resolve(PKG_ROOT, '../../../../paper_to_skills/paper2skills-vault'))
const SEL = flag('selection', join(VAULT, '07-资源库', 'card-classification.json'))
const CLS = flag('classification', join(DATA_DIR, 'classification.json'))
const PLAN_OUT = flag('plan-out', null)

for (const [name, p] of [['vault 07-资源库', join(VAULT, '07-资源库')],
  ['card-classification.json', SEL], ['classification.json', CLS]]) {
  if (!existsSync(p)) {
    console.error(`✗ 输入没拿到：${name} 不存在（${p}）`)
    console.error('  退出码 2 = 没测，不是通过。')
    process.exit(2)
  }
}

const sel = JSON.parse(readFileSync(SEL, 'utf8'))
const cls = JSON.parse(readFileSync(CLS, 'utf8'))
const tax = loadTaxonomy()

const known = new Set(cls.items.map((x) => x.id))
const slugOwner = new Map()
for (const it of cls.items) slugOwner.set(it.slug, it.id)

const toAdd = []
const problems = []
/** 被卡住、**不进底本**的条目（可见阻断，不是静默丢弃）。 */
const blocked = []
for (const it of sel.items) {
  if (known.has(it.id)) continue
  const slug = slugFor(it.id)
  // ⚠️ 实测撞出：`slugFor()` 对**全中文**的卡名会把非 ASCII 全折成 `-` 再 trim，得到 `p2s-`，
  //    而 `NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/` 判它非法 ⇒ `import-paper2skills.mjs` 直接
  //    `name 非法` exit 1。实测命中 1 张：`Skill-大规模消费者评论方面情感分析` → `p2s-`。
  //    **不许在这里替它改名** —— 改名＝自造第二套 slug 规则，S12 的 id→slug 换算会算错。
  //    故登记为**可见阻断**并把它排除在本次接入之外，改名决策留给 slugFor 的归属方。
  if (!slug.startsWith(SLUG_PREFIX) || !NAME_RE.test(slug)) {
    blocked.push({ id: it.id, slug, reason: !NAME_RE.test(slug)
      ? `slugFor() 折叠出非法 slug「${slug}」（不匹配 NAME_RE）—— 全非 ASCII 的卡名会折成 \`p2s-\``
      : `slugFor() 结果「${slug}」没有 ${SLUG_PREFIX} 前缀` })
    continue
  }
  const facets = resolveFacets({ l3: it.l3 }, tax)
  if (!facets) {
    problems.push(`${it.id}: resolveFacets 取不到（首个 L3「${it.l3[0]}」不在 taxonomy 151 条内）`)
    continue
  }
  const owner = slugOwner.get(slug)
  if (owner && owner !== it.id) {
    problems.push(`${it.id}: slug「${slug}」已被 ${owner} 占用 —— `
      + '两张卡争一个目录名，**不许静默改名**（改名会让 S12 的 id→slug 换算算错）')
    continue
  }
  toAdd.push({
    id: it.id,
    slug,
    title: it.title ?? it.id,
    src_domain: it.tech_domain,
    l3: it.l3,
    facets,
    planes: [facets.l1_id],
    domains: [facets.l2_id],
    cross_plane: false,
    confidence: it.confidence ?? 'medium',
    fills_gap: [],
    fills_gap_strong: [],
    fills_gap_adjacent: [],
    fills_gap_dropped: [],
    note: it.note ?? '',
    _provenance: {
      from: 'paper2skills-vault/07-资源库/card-classification.json',
      source: it.source,
      vault_path: it.path,
      added_by: 'PHASE6 S5/B11 append-selected-line.mjs',
    },
  })
}

// 「只增不改」的**判据**（原先这里是一段空循环：注释宣称「逐项确认没被本脚本改过」，
// 而循环体什么都不做、也从不往 `problems` 里写东西——那是一条恒真的断言，
// 与 P-02「仪器假绿」同型，故改成真会判红的形式）。
//
// 口径：只比**两侧 schema 都有的分类事实字段**（`l3` / `confidence` / `note`）。
// 不比 `title`（底本存卡面长标题，精选线只有 id 短名，不是同一事实）、
// 不比 `facets`/`planes`/`domains`（那是由 `resolveFacets()` 从 `l3` 展开的派生量）、
// 不比 `slug`（由 `slugFor()` 从 id 派生）。两侧共有且非本次新增的条目实测 93 条。
//
// **`note` 的规范化**：精选线对「产品侧流水线没给逐卡理由」的条目写的是
// **占位说明** `（产品侧流水线的逐卡理由为空）`，而底本那一侧就是空串。实测 93 条里
// 81 条两侧逐字相同、12 条是这个占位形态、**真实分歧 0 条**——即两者是**同一个事实的
// 两种写法**。故比对前把占位说明规范化为空串，但**不静默吞掉**：被规范化了几条会
// 打印在「规范化读数」一行里，读数非 0 时看得到它，不至于哪天它变成真的分歧还没人知道。
const NOTE_EMPTY_PLACEHOLDER = '（产品侧流水线的逐卡理由为空）'
/** 两侧 schema 都有的**分类事实**字段（其余字段不是同一事实，见上）。 */
const FACTS = ['l3', 'confidence', 'note']
const normFact = (field, value) => {
  if (field === 'note') {
    const s = String(value ?? '').trim()
    return s === NOTE_EMPTY_PLACEHOLDER ? '' : s
  }
  if (field === 'l3') return Array.isArray(value) ? value : []
  if (field === 'confidence') return value ?? 'medium'
  return value
}
const selById = new Map(sel.items.map((it) => [it.id, it]))
const comparedFields = new Set()
let comparedExisting = 0
let normalizedNote = 0
for (const it of cls.items) {
  if (it._provenance?.added_by) continue
  const peer = selById.get(it.id)
  if (!peer) continue
  comparedExisting += 1
  if (String(peer.note ?? '').trim() === NOTE_EMPTY_PLACEHOLDER
    && String(it.note ?? '').trim() === '') normalizedNote += 1
  for (const f of FACTS) {
    comparedFields.add(f)
    const mine = normFact(f, it[f])
    const theirs = normFact(f, peer[f])
    if (JSON.stringify(mine) !== JSON.stringify(theirs)) {
      problems.push(`${it.id}: 分类事实「${f}」两侧不符 —— `
        + `底本 ${JSON.stringify(it[f] ?? null)} vs 精选线 ${JSON.stringify(peer[f] ?? null)}。`
        + '「只增不改」被破坏，或两份事实源已分叉')
    }
  }
}
if (comparedExisting === 0) {
  problems.push('底本与精选线**没有任何共有 id**（比对射程为空）——'
    + '「没比对」不等于「没差异」，请先确认两侧 id 空间是否真的不相交')
}

const vaultAbsent = []
for (const a of toAdd) {
  const rel = a._provenance.vault_path
  if (rel && !existsSync(join(resolve(VAULT, '..'), rel))) vaultAbsent.push(`${a.id} → ${rel}`)
}
for (const v of vaultAbsent) problems.push(`源卡实物不在：${v}`)

const plan = {
  vault: VAULT,
  selection: SEL,
  classification: CLS,
  existing_total: cls.items.length,
  selection_total: sel.items.length,
  already_present: sel.items.filter((it) => known.has(it.id)).length,
  // 「只增不改」这条判据的**射程读数**：比了多少条、比了哪些字段。
  // 射程为 0 会进 problems（空射程必须自己报出来，不能长得像「通过」）。
  compared_existing: comparedExisting,
  compared_fields: [...comparedFields].sort(),
  // 被规范化掉「空 vs 占位说明」的条数：它不是通过/不通过的判据，而是这条判据的
  // **可见读数**——读数变了说明两侧的写法变了，值得有人看一眼。
  note_placeholders_normalized: normalizedNote,
  to_add: toAdd.length,
  blocked,
  items: toAdd,
  problems,
}

if (PLAN_OUT) {
  const { mkdirSync } = await import('node:fs')
  mkdirSync(dirname(PLAN_OUT), { recursive: true })
  writeFileSync(PLAN_OUT, JSON.stringify(plan, null, 1) + '\n')
}

console.log('PHASE6 S5/B11 · 精选线接入产品侧分类底本')
console.log(`  底本现有             ${cls.items.length}`)
console.log(`  精选线（card-classification） ${sel.items.length}`)
console.log(`  其中底本已有         ${plan.already_present}`)
console.log(`  本次要接入（精选线独有） ${toAdd.length}`)
console.log(`  阻断（不进底本）      ${blocked.length}`)
console.log(`  「只增不改」比对射程   ${comparedExisting} 条 × ${[...comparedFields].sort().join('/')}`)
console.log(`  note 占位规范化读数    ${normalizedNote} 条（空 ↔ 占位说明，同一事实的两种写法）`)
for (const b of blocked) console.log(`    ⛔ ${b.id} → 「${b.slug}」：${b.reason}`)
for (const a of toAdd.slice(0, 8)) console.log(`    + ${a.slug}  ← ${a.id}`)
if (toAdd.length > 8) console.log(`    …（共 ${toAdd.length} 条）`)

if (problems.length) {
  console.log(`\n🔴 ${problems.length} 项不合格：`)
  for (const p of problems) console.log(`  · ${p}`)
  process.exit(1)
}

if (blocked.length && !has('allow-blocked')) {
  console.log(`\n🔴 ${blocked.length} 条被阻断（**可见阻断**，未静默丢弃）。`
    + `确认排除它们之后用 --allow-blocked 继续；改名决策留给 \`slugFor\` 的归属方。`)
  process.exit(1)
}

if (has('apply')) {
  cls.items = [...cls.items, ...toAdd]
  cls.total = cls.items.length
  cls.classified = cls.items.length
  writeFileSync(CLS, JSON.stringify(cls, null, 1) + '\n')
  console.log(`\n✅ 已写入 ${CLS}（total=${cls.total}）`)
} else if (!has('check')) {
  console.log('\n（未指定 --apply/--check：只出计划，未写盘）')
} else if (toAdd.length > 0) {
  // `--check` 原先无条件打印「✅ 计划与现场一致（--check：无待接入或已幂等）」并 exit 0——
  // **有待接入时也照样这么打印**。实测：把底本回退到接入前（52 条待接入）跑
  // `--check --allow-blocked`，它仍然 ✅ + exit 0。那是本文件里第二条恒真断言（P-02 同型，
  // 与上面那段空循环是同一个病），故改成真会判红的形式。
  console.log(`\n🔴 --check 判红：仍有 **${toAdd.length}** 条待接入（底本与精选线不一致）。`
    + '\n   「计划与现场一致」只有在待接入为 0 时成立。要写入请用 --apply。')
  process.exit(1)
} else {
  console.log(`\n✅ --check 通过：待接入 0 条，且「只增不改」判据已比对 `
    + `${comparedExisting} 条 × ${[...comparedFields].sort().join('/')}，无分歧。`)
}
