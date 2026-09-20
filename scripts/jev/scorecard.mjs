/**
 * Tier 1.5 基线记分卡跑批器（ADR-0138 D8 语义轨，只出报告）。
 *
 * 记分卡只测量、只报告，不判死刑：阈值全是待校准初值，正例只有个位数，
 * 分母永远跟着数字走（P-15：空扫描面 / 无分母的百分比是假绿）。
 * 漂移 = 同一样本连打 N 次的 max-min——官方「extremely consistent」当被测事实。
 *
 * 库形态可注入 fake client 离线测试；CLI 形态才走真网：
 *   node scripts/jev/scorecard.mjs [--samples scripts/jev/samples.json] [--repeats 5] [--out <path>]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { fingerprintPayload, CRITERIA, MODEL_VERSION } from './questions.mjs'
import { resolveJevKey, redact } from '../lib/jev-credentials.mjs'
import { createJevClient } from './client.mjs'
import { assertEgressSourceTracked } from './egress-boundary.mjs'

const CRITERION_BY_ID = Object.fromEntries(CRITERIA.map((c) => [c.id, c]))

/** 样本集是 outbound state 的第二个来源，与 corpus 同过 D2 闸门（仓外/未跟踪一律拒载）。 */
export function loadSamples(path) {
  assertEgressSourceTracked(path)
  const raw = JSON.parse(readFileSync(path, 'utf8'))
  const samples = raw.samples ?? []
  if (samples.length === 0) throw new Error(`样本集为空：${path}（P-15：空扫描面不可判）`)
  for (const s of samples) {
    for (const field of ['id', 'kind', 'criterion', 'state', 'source']) {
      if (!s[field]) throw new Error(`样本 ${s.id ?? '?'} 缺 ${field}（P-01：不允许无名/无源样本）`)
    }
    if (!CRITERION_BY_ID[s.criterion]) throw new Error(`样本 ${s.id} 引用未知判据 ${s.criterion}`)
    if (s.kind !== 'recall' && s.kind !== 'false-positive') throw new Error(`样本 ${s.id} kind 非法: ${s.kind}`)
  }
  return samples
}

function questionFor(criterionId) {
  const c = CRITERION_BY_ID[criterionId]
  return { [criterionId]: { type: 'noul', instructions: c.text } }
}

/**
 * 跑一张记分卡。返回聚合报告对象（不落盘，调用方决定去向）。
 * 单个样本失败不吞：记进 report.errors，同时该样本记 0 次成功——
 * 静默丢样本会把分母悄悄改小，报告看起来正常（P-02）。
 */
export async function runScorecard({ client, samples, repeats = 5 }) {
  const perSample = []
  const errors = []
  const modelEchoes = new Set()
  for (const s of samples) {
    const threshold = CRITERION_BY_ID[s.criterion].thresholds.noul
    const readings = []
    for (let i = 0; i < repeats; i += 1) {
      try {
        const { model, answers } = await client.ask(s.state, questionFor(s.criterion))
        modelEchoes.add(model)
        readings.push(answers[s.criterion].noul)
      } catch (err) {
        errors.push({ sample: s.id, attempt: i, error: String(err?.message ?? err) })
      }
    }
    const fired = readings.filter((v) => v >= threshold).length
    perSample.push({
      id: s.id,
      kind: s.kind,
      criterion: s.criterion,
      expectFire: s.expectFire,
      threshold,
      readings,
      n: readings.length,
      fired,
      median: median(readings),
      spread: readings.length ? Math.max(...readings) - Math.min(...readings) : null,
    })
  }

  const byCriterion = {}
  for (const c of new Set(samples.map((s) => s.criterion))) {
    const rows = perSample.filter((r) => r.criterion === c && r.n > 0)
    const recallRows = rows.filter((r) => r.kind === 'recall')
    const fpRows = rows.filter((r) => r.kind === 'false-positive')
    byCriterion[c] = {
      recall: { fired: sum(recallRows, 'fired'), of: sum(recallRows, 'n') },
      falsePositive: { fired: sum(fpRows, 'fired'), of: sum(fpRows, 'n') },
      maxSpread: rows.length ? Math.max(...rows.map((r) => r.spread)) : null,
    }
  }

  const echoes = [...modelEchoes]
  return {
    report: 'skillopt-tier15-scorecard',
    modelVersion: MODEL_VERSION,
    modelEchoes: echoes,
    fingerprint: { criteria: fingerprintPayload() },
    repeats,
    totals: { samples: samples.length, readings: sum(perSample, 'n'), errors: errors.length },
    byCriterion,
    perSample,
    errors,
  }
}

function sum(rows, key) {
  return rows.reduce((acc, r) => acc + r[key], 0)
}

function median(values) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function render(report) {
  const lines = []
  lines.push(`== Tier 1.5 记分卡（model=${report.modelVersion} 回读=${report.modelEchoes.join(',') || '无'}）==`)
  lines.push(`指纹: sha256(判据⊕阈值)=${report.fingerprint.criteria.slice(0, 16)}… 样本=${report.totals.samples} 读数=${report.totals.readings} 错误=${report.totals.errors}`)
  for (const [id, agg] of Object.entries(report.byCriterion)) {
    lines.push(`${id}: 召回 ${agg.recall.fired}/${agg.recall.of} · 误报 ${agg.falsePositive.fired}/${agg.falsePositive.of} · 最大漂移 ${agg.maxSpread}`)
  }
  for (const r of report.perSample) {
    lines.push(`  ${r.id} [${r.kind}] n=${r.n} median=${r.median} spread=${r.spread} fired=${r.fired}/${r.n} (期望${r.expectFire ? '触发' : '不触发'}, 阈值${r.threshold})`)
  }
  if (report.errors.length > 0) {
    lines.push(`!! ${report.errors.length} 次调用失败（分母已如实计入，未静默丢弃）：`)
    for (const e of report.errors.slice(0, 5)) lines.push(`   ${e.sample} #${e.attempt}: ${e.error}`)
  }
  return lines.join('\n')
}

export function main(argv = process.argv.slice(2)) {
  const opt = (name, fallback) => {
    const i = argv.indexOf(name)
    return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback
  }
  const samplesPath = opt('--samples', new URL('./samples.json', import.meta.url).pathname)
  const repeats = Number(opt('--repeats', 5))
  const outPath = opt('--out', null)

  const samples = loadSamples(samplesPath)
  const { key, source } = resolveJevKey()
  if (!key) {
    console.error(`Jev key 解析失败：探过 ${['env', '~/.dsh/.credentials.yaml refs', '项目 .env', '$DSH_HOME/.env']} 无一命中。大声退出，不降级不假跑。`)
    process.exit(2)
  }
  console.error(`key 来源: ${source} (${redact(key)})`)
  const client = createJevClient({ apiKey: key, budget: { maxRequests: samples.length * repeats + 10 } })
  return runScorecard({ client, samples, repeats }).then((report) => {
    const text = render(report)
    console.log(text)
    if (outPath) {
      writeFileSync(outPath, JSON.stringify(report, null, 2))
      console.error(`报告已写 ${outPath}`)
    }
    return report
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`记分卡失败：${err?.message ?? err}`)
    process.exit(1)
  })
}
