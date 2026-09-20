/**
 * Tier 1.5 分诊：corpus 评审 findings → 人工复核短名单（离线，零 API 调用）。
 *
 * ## 为什么需要它
 *
 * 全量评审打出 189 条 findings，不能盲转 sug-*.json（D3 契约：建议面以事实为上游）。
 * 审计文档（agent-instructions-audit.md）已裁决过两类「触发判据但不是缺陷」的文本：
 *   1. **有意保障**（§2，保留不动）：schema/迁移/删除确认、架构权限安全变更停止、
 *      安全边界拒绝、生产 allowlist；
 *   2. **F1 修复后新措辞**（§3.1）：「缺不可推定的关键材料才追问；可依惯例推定的
 *      标注假设后继续」——这是被裁决过的合法追问，不是 blanket 停止。
 * 本脚本把 findings 与这两类豁免标记交叉，命中的归「审计已裁决」，没命中的按
 * 簇前缀分组、按 noul 降序，产出人工复核短名单。**它不产出 sug 建议**——
 * 短名单上每一条的最终定性由人复核后进建议面。
 *
 * ## 边界
 *
 * 豁免判据是**文本标记匹配**，不是语义判定：一个条目既含豁免标记又含真缺陷时
 * 会被误归豁免——所以豁免名单也完整输出（带命中标记），供人扫一眼；分母恒等于
 * findings + borderline 全集，不许静默缩（P-02）。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { stateFor, loadCorpus } from './corpus-review.mjs'

/** 有意保障 + F1 修复新措辞的文本标记（审计文档 §2/§3.1 的机器可读投影）。 */
export const EXEMPTION_MARKERS = [
  { tag: 'guarantee-schema-migration', pattern: /schema|数据迁移|数据删除|回填|搬移|数据库变更/i },
  { tag: 'guarantee-arch-permission-safety', pattern: /架构.{0,12}(变更|改动)|权限.{0,8}(变更|确认)|安全变更|相容性/i },
  { tag: 'guarantee-security-boundary', pattern: /安全边界|注入|危险命令|越权|索要密钥/i },
  { tag: 'guarantee-production-allowlist', pattern: /allowlist|生产命令|不主动\s*commit|不自动\s*commit/i },
  { tag: 'fixed-f1-graded-wording', pattern: /不可推定的关键材料|标注假设后继续|绝不编造/i },
]

/** 簇前缀：同簇条目疑似共享模板，复核时可整簇定性。 */
export const CLUSTERS = [
  { tag: 'amazon-prelaunch-family', prefix: 'amazon-prelaunch-' },
  { tag: 'skill-meta', prefix: 'skill-' },
  { tag: 'seo', prefix: 'seo-' },
  { tag: 'amazon', prefix: 'amazon-' },
  { tag: 'ecommerce', prefix: 'ecommerce-' },
  { tag: 'brand', prefix: 'brand-' },
]

/** 找出一条 findings 命中的全部豁免标记。 */
export function matchExemptions(text) {
  return EXEMPTION_MARKERS.filter((m) => m.pattern.test(text)).map((m) => m.tag)
}

/** 簇标签：前缀最长者优先，无簇归 standalone。 */
export function clusterOf(name) {
  const hits = CLUSTERS.filter((c) => name.startsWith(c.prefix))
  if (hits.length === 0) return 'standalone'
  return hits.reduce((a, b) => (a.prefix.length >= b.prefix.length ? a : b)).tag
}

/**
 * 分诊主体。豁免标记只在 q2 findings 上生效：有意保障与 F1 修复新措辞裁决的都是
 * 「停止/追问义务」语义，对 q3（环境机制）finding 无豁免效力——q3 触发的原因
 * 与文本里恰好带「注入/越权」等保障字样无关（首轮实测：88 条 q3 被安全边界
 * 标记误豁免，skill-creator 簇因此整簇漏出短名单）。
 * @param {{review: object, corpus: {names: string[], entries: object}}} options
 */
export function triageFindings({ review, corpus }) {
  const all = [...(review.findings ?? []), ...(review.borderline ?? []).map((b) => ({ ...b, borderline: true }))]
  const exempt = []
  const shortlist = []
  for (const f of all) {
    const text = stateFor(corpus.entries[f.name])
    const exemptions = f.criterion === 'q2-stop-obligation' ? matchExemptions(text) : []
    const row = {
      name: f.name,
      criterion: f.criterion,
      noul: f.noul,
      borderline: f.borderline === true,
      cluster: clusterOf(f.name),
      ...(exemptions.length > 0 ? { exemptions } : {}),
    }
    if (exemptions.length > 0) exempt.push(row)
    else shortlist.push(row)
  }
  shortlist.sort((a, b) => b.noul - a.noul || a.name.localeCompare(b.name))
  exempt.sort((a, b) => a.name.localeCompare(b.name) || a.criterion.localeCompare(b.criterion))

  const shortlistByCluster = {}
  for (const row of shortlist) {
    const list = shortlistByCluster[row.cluster] ?? []
    list.push(row)
    shortlistByCluster[row.cluster] = list
  }

  return {
    totals: {
      findings: review.findings?.length ?? 0,
      borderline: review.borderline?.length ?? 0,
      examined: all.length,
      exempt: exempt.length,
      shortlist: shortlist.length,
      conserved: exempt.length + shortlist.length === all.length,
    },
    shortlist,
    shortlistByCluster,
    exempt,
  }
}

/** 人面渲染。 */
export function render(triage) {
  const lines = []
  lines.push(`== Tier 1.5 分诊（离线）==`)
  lines.push(`findings=${triage.totals.findings} borderline=${triage.totals.borderline} → 豁免=${triage.totals.exempt} 短名单=${triage.totals.shortlist}（守恒=${triage.totals.conserved}）`)
  lines.push('')
  lines.push('## 短名单（按簇分组，簇内 noul 降序；人复核后进建议面）')
  for (const [cluster, rows] of Object.entries(triage.shortlistByCluster)) {
    lines.push(`### ${cluster}（${rows.length} 条）`)
    for (const r of rows) {
      lines.push(`  ${r.noul.toFixed(2)}${r.borderline ? '~' : ' '} ${r.name} [${r.criterion}]`)
    }
  }
  lines.push('')
  lines.push(`## 豁免（审计已裁决文本标记命中，含命中标记；误归风险见脚本头注）`)
  for (const r of triage.exempt) {
    lines.push(`  ${r.noul.toFixed(2)}${r.borderline ? '~' : ' '} ${r.name} [${r.criterion}] ← ${r.exemptions.join('+')}`)
  }
  return lines.join('\n')
}

async function main(argv) {
  const out = { reviewPath: '.scratch/jev-tier15/corpus-review.json', outPath: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--review') out.reviewPath = argv[++i]
    else if (a === '--out') out.outPath = argv[++i]
    else {
      console.error(`未知参数：${a}`)
      process.exit(2)
    }
  }
  const review = JSON.parse(readFileSync(out.reviewPath, 'utf8'))
  const corpus = loadCorpus()
  const triage = triageFindings({ review, corpus })
  if (!triage.totals.conserved) {
    console.error('分诊计数不守恒（P-02），拒绝输出')
    process.exit(1)
  }
  console.log(render(triage))
  if (out.outPath) {
    writeFileSync(out.outPath, JSON.stringify(triage, null, 2))
    console.error(`分诊报告已写 ${out.outPath}`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(`分诊失败：${err?.message ?? err}`)
    process.exit(1)
  })
}
