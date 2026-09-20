/**
 * Tier 1.5 主体：corpus 全量评审（ADR-0138 D3/D4）。
 *
 * ## 定位
 *
 * 基线记分卡（scorecard.mjs）回答「判据质量如何」；本脚本回答「corpus 里哪些条目有缺陷」。
 * 逐条（292 条）对主集里的非逐任务判据（② 停止义务 / ③ 环境机制）各问一次 Noul，
 * fired（≥阈值）的条目进 findings——它们是 sug-*.json 建议的上游事实，不是建议本身。
 * ① 越界率是逐任务判据，需要「域内但越界」任务句对照集，单独立项，本脚本不跑。
 *
 * ## state 组成
 *
 * 与基线样本一致：`description: …\n\nbody: …`（description + body_excerpt 原文）。
 * 第二轮实测教训：state 组成变了旧读数不可迁移——本脚本与 samples.json 的拼法必须保持同构。
 *
 * ## 失败语义（P-02）
 *
 * 单条请求失败计入 errors 并点名条目，不静默缩分母；读数分母 = entries × criteria - errors。
 * 单次读数即可判 fired（基线已实测同文本漂移 spread ≤0.05）；0.4–0.6 之间的读数单独标记
 * borderline，供人工复核，不自动二判。
 *
 * CLI：node scripts/jev/corpus-review.mjs [--corpus <file>] [--out <file>] [--criteria q2,q3]
 * key 解析走 jev-credentials（D7）；解析不到大声退出（exit 2）。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { createJevClient } from './client.mjs'
import { resolveJevKey, redact } from '../lib/jev-credentials.mjs'
import { CRITERIA, MODEL_VERSION, fingerprintPayload } from './questions.mjs'

/** 默认待审语料（T3 拍板：仓内 git 跟踪 corpus）。 */
export const DEFAULT_CORPUS_PATH = new URL(
  '../../packages/capabilities/dsh-overseas-skills/manifest/skill-evidence-corpus.json',
  import.meta.url,
)

/** 与基线样本同构的 state 拼法。 */
export function stateFor(entry) {
  return `description: ${entry.description ?? ''}\n\nbody: ${entry.body_excerpt ?? ''}`
}

/** 读 corpus 并校验形状；0 条直接 throw（P-15 空射程不可用）。 */
export function loadCorpus(path = DEFAULT_CORPUS_PATH) {
  const raw = readFileSync(path, 'utf8')
  const corpus = JSON.parse(raw)
  if (!corpus || typeof corpus !== 'object' || Array.isArray(corpus) || typeof corpus.skills !== 'object' || Array.isArray(corpus.skills)) {
    throw new Error(`corpus 形状非法（应为 {_meta, skills} 对象）：${path}`)
  }
  const names = Object.keys(corpus.skills)
  if (names.length === 0) throw new Error('corpus 0 条（P-15 空射程：没有可评语料）')
  for (const name of names) {
    const e = corpus.skills[name]
    if (!e || typeof e !== 'object' || typeof e.description !== 'string') {
      throw new Error(`corpus 条目 ${name} 缺 description`)
    }
  }
  return { raw, names, entries: corpus.skills }
}

/**
 * 全量评审。criteriaIds 必须都是非逐任务判据（kind !== 'per-task'）。
 * @param {{client: object, corpus: {names: string[], entries: object}, criteriaIds?: string[]}} options
 */
export async function runCorpusReview({ client, corpus, criteriaIds }) {
  const criteria = CRITERIA.filter((c) => (criteriaIds ?? defaultCriteriaIds()).includes(c.id))
  if (criteria.length === 0) throw new Error('评审判据集为空')
  for (const c of criteria) {
    if (c.kind === 'per-task') throw new Error(`判据 ${c.id} 是逐任务判据，需要任务句对照集，不在本脚本射程`)
  }

  const findings = []
  const borderline = []
  const errors = []
  const modelEchoes = new Set()
  const byCriterion = {}
  for (const c of criteria) {
    byCriterion[c.id] = { asked: 0, fired: 0, borderline: 0, errors: 0 }
  }

  for (const name of corpus.names) {
    const state = stateFor(corpus.entries[name])
    for (const c of criteria) {
      try {
        const response = await client.ask(state, { [c.id]: { type: c.primitive, instructions: c.text } })
        modelEchoes.add(response.model)
        const answer = response.answers?.[c.id]
        const noul = answer?.noul
        if (typeof noul !== 'number') throw new Error(`回答形状坏：${c.id} 无 noul 数值`)
        byCriterion[c.id].asked += 1
        const fired = noul >= c.thresholds.noul
        if (fired) {
          byCriterion[c.id].fired += 1
          findings.push({ name, criterion: c.id, noul })
        } else if (noul >= c.thresholds.noul - 0.1) {
          byCriterion[c.id].borderline += 1
          borderline.push({ name, criterion: c.id, noul })
        }
      } catch (error) {
        byCriterion[c.id].errors += 1
        errors.push({ name, criterion: c.id, error: String(error?.message ?? error) })
      }
    }
  }

  return {
    modelEchoes: [...modelEchoes],
    totals: {
      entries: corpus.names.length,
      criteria: criteria.map((c) => c.id),
      readings: Object.values(byCriterion).reduce((t, s) => t + s.asked, 0),
      errors: errors.length,
    },
    byCriterion,
    findings,
    borderline,
    errors,
    fingerprint: { criteria: fingerprintPayload(), model: MODEL_VERSION },
  }
}

/** 默认评审判据 = 主集减去逐任务判据。 */
export function defaultCriteriaIds() {
  return CRITERIA.filter((c) => c.mainSet && c.kind !== 'per-task').map((c) => c.id)
}

/** 人面渲染。 */
export function render(report) {
  const lines = []
  lines.push(`== Tier 1.5 corpus 评审（model=${MODEL_VERSION} 回读=${report.modelEchoes.join(',')}）==`)
  lines.push(`条目=${report.totals.entries} 判据=${report.totals.criteria.join('+')} 读数=${report.totals.readings} 错误=${report.totals.errors}`)
  for (const [id, s] of Object.entries(report.byCriterion)) {
    lines.push(`${id}: fired=${s.fired}/${s.asked} borderline=${s.borderline} errors=${s.errors}`)
  }
  for (const f of report.findings) {
    lines.push(`  ✦ ${f.name} [${f.criterion}] noul=${f.noul}`)
  }
  if (report.borderline.length > 0) {
    lines.push(`borderline（0.4–0.6，人工复核，不自动二判）共 ${report.borderline.length} 条：`)
    for (const b of report.borderline) {
      lines.push(`  ~ ${b.name} [${b.criterion}] noul=${b.noul}`)
    }
  }
  for (const e of report.errors) {
    lines.push(`  ✗ ${e.name} [${e.criterion}] ${e.error}`)
  }
  return lines.join('\n')
}

async function main(argv) {
  const out = { corpusPath: DEFAULT_CORPUS_PATH, outPath: null, criteria: defaultCriteriaIds() }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--corpus') out.corpusPath = new URL(`file://${argv[++i]}`)
    else if (a === '--out') out.outPath = argv[++i]
    else if (a === '--criteria') out.criteria = argv[++i].split(',')
    else {
      console.error(`未知参数：${a}`)
      process.exit(2)
    }
  }

  const { key, source, tried } = resolveJevKey({})
  if (!key) {
    console.error(`Jev key 解析失败：探过 ${tried.join(',')} 无一命中。大声退出，不降级不假跑。`)
    process.exit(2)
  }
  console.error(`key 来源: ${source} (${redact(key)})`)

  const corpus = loadCorpus(out.corpusPath)
  const criteria = CRITERIA.filter((c) => out.criteria.includes(c.id))
  const budget = { maxRequests: corpus.names.length * criteria.length + 50 }
  const client = createJevClient({ apiKey: key, model: MODEL_VERSION, budget })

  const report = await runCorpusReview({ client, corpus, criteriaIds: out.criteria })
  report.stats = client.stats()
  console.log(render(report))
  if (out.outPath) {
    writeFileSync(out.outPath, JSON.stringify(report, null, 2))
    console.error(`报告已写 ${out.outPath}`)
  }
  return report
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(`corpus 评审失败：${err?.message ?? err}`)
    process.exit(1)
  })
}
