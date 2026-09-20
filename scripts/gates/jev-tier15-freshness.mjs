/**
 * jev-tier15-freshness：Tier 1.5 语义轨基线的内容寻址指纹门禁（ADR-0138 D5）。
 *
 * ## 为什么需要它
 *
 * 语义轨基线（`scripts/jev/scorecard.mjs --out …`）是真实 API 跑出来的判据质量证据，
 * 但它**不进 gate 关键路径**（D8：第三方可用性不进门禁）。没有本门禁时，corpus 或判据
 * 改了，旧基线报告仍然「有效」，实际指向一份不存在的输入——用纪律守只有机制能守住的
 * 东西（pitfalls-playbook）。
 *
 * 本门禁离线、确定性、零 API 调用：重算
 * `sha256(corpus ⊕ 判据文本⊕阈值 ⊕ 模型版本 ⊕ 基线样本集)` 与登记在
 * `jev-tier15.expected.json` 的指纹逐项比对。四项输入都没改 → 旧基线永远有效；
 * 改了 → 判红并**点名是哪一项**漂了，修法是重跑语义轨后重采 expected，不是手改哈希。
 *
 * ## 指纹输入的四项与各自的家
 *
 * - corpus：`skill-evidence-corpus.json` 原文（T3 拍板只评仓内 corpus，git 跟踪；
 *   0 条判红，P-15 空射程不可用）
 * - criteria：`scripts/jev/questions.mjs` 的 `fingerprintPayload()`（判据文本⊕阈值
 *   单一之家；改措辞/阈值自然换指纹，D6）
 * - model：`MODEL_VERSION`（钉具体版本不钉别名，D6）
 * - samples：`scripts/jev/samples.json` 原文——基线样本集含 state 构成本身
 *   （第二轮实测教训：state 从 description-only 换成 description+body_excerpt 后
 *   旧读数 0.73→0.06 不可迁移；state 构成必须随指纹走）
 *
 * ## 契约
 *
 * `checkJevTier15Freshness({corpusPath, samplesPath, expectedPath})` 返回
 * `{passed, status, violations, note, facts}` 兼容面；`toCanonicalJevTier15Result`
 * 交给总 gate 的 canonical 读数（5 个比对对象：四项输入 + 汇总指纹）。expected 文件
 * 是必备治理文件：缺失、损坏或 schema 不符一律 fail，不 skip。CLI 退出码：
 * 0 通过 / 1 存在漂移 / 2 用法错误。
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { MODEL_VERSION, fingerprintPayload } from '../jev/questions.mjs'

/** 待审语料（T3 拍板：只评仓内 git 跟踪 corpus）。 */
export const DEFAULT_CORPUS_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../packages/capabilities/dsh-overseas-skills/manifest/skill-evidence-corpus.json',
)
/** 基线样本集（state 构成随样本进指纹）。 */
export const DEFAULT_SAMPLES_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '../jev/samples.json',
)
/** 登记指纹的治理文件（同构 live-presets.expected.json：重采须人工审查后入库）。 */
export const DEFAULT_EXPECTED_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  'jev-tier15.expected.json',
)

const HEX64 = /^[a-f0-9]{64}$/
const EXPECTED_IDENTITY = 'corpus\u0000criteria\u0000model\u0000samples'

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

/**
 * 重算四项指纹。读不到/解析失败直接 throw（由 check 收编为 fail）；
 * corpus 或样本集为空集不在这里拦，由 check 按 P-15 判红。
 */
export function computeJevTier15Fingerprint({
  corpusPath = DEFAULT_CORPUS_PATH,
  samplesPath = DEFAULT_SAMPLES_PATH,
} = {}) {
  const corpusRaw = readFileSync(corpusPath, 'utf8')
  const corpus = JSON.parse(corpusRaw)
  if (!corpus || typeof corpus !== 'object' || Array.isArray(corpus) || typeof corpus.skills !== 'object' || Array.isArray(corpus.skills)) {
    throw new Error(`corpus 形状非法（应为 {_meta, skills} 对象）：${corpusPath}`)
  }
  const corpusEntries = Object.keys(corpus.skills).length

  const samplesRaw = readFileSync(samplesPath, 'utf8')
  const samples = JSON.parse(samplesRaw)
  if (!Array.isArray(samples?.samples)) {
    throw new Error(`基线样本集形状非法（应为 {samples: []}）：${samplesPath}`)
  }

  const components = {
    corpus: sha256(corpusRaw),
    criteria: sha256(fingerprintPayload()),
    model: MODEL_VERSION,
    samples: sha256(samplesRaw),
  }
  const fingerprint = sha256(
    ['corpus', 'criteria', 'model', 'samples']
      .map((key) => `${key}=${components[key]}`)
      .join('\n'),
  )
  return { components, fingerprint, corpusEntries, sampleCount: samples.samples.length }
}

/** 把一次成功重算压成可入库的 expected 形状。 */
export function serializeExpected(computed, provenance) {
  return {
    schemaVersion: 1,
    identity: EXPECTED_IDENTITY,
    corpusEntries: computed.corpusEntries,
    sampleCount: computed.sampleCount,
    components: { ...computed.components },
    fingerprint: computed.fingerprint,
    provenance,
  }
}

/** expected 文件自身的 schema 校验；返回 violations（空 = 合法）。 */
export function validateExpected(expected) {
  const violations = []
  if (!expected || typeof expected !== 'object' || Array.isArray(expected)) {
    return ['jev-tier15 expected 必须是 object']
  }
  if (expected.schemaVersion !== 1) violations.push('expected schemaVersion 必须为 1')
  if (expected.identity !== EXPECTED_IDENTITY) violations.push('expected identity 契约不受支持')
  if (!Number.isInteger(expected.corpusEntries) || expected.corpusEntries <= 0) {
    violations.push('expected corpusEntries 非法（须为正整数）')
  }
  if (!Number.isInteger(expected.sampleCount) || expected.sampleCount <= 0) {
    violations.push('expected sampleCount 非法（须为正整数）')
  }
  const components = expected.components
  if (!components || typeof components !== 'object' || Array.isArray(components)) {
    return [...violations, 'expected components 必须是 object']
  }
  for (const key of ['corpus', 'criteria', 'samples']) {
    if (!HEX64.test(String(components[key]))) violations.push(`expected components.${key} 必须是 sha256 hex`)
  }
  if (typeof components.model !== 'string' || components.model === '') {
    violations.push('expected components.model 必须是非空字符串（钉具体版本，不用别名）')
  }
  if (!HEX64.test(String(expected.fingerprint))) violations.push('expected fingerprint 必须是 sha256 hex')
  return violations
}

/**
 * 门禁主体：expected 与四项输入任一不符都判红并点名哪项漂了。
 * @param {{corpusPath?: string, samplesPath?: string, expectedPath?: string}} options
 * @returns {{passed: boolean, status: 'pass'|'fail', violations: string[], note: string, facts: object}}
 */
export function checkJevTier15Freshness({
  corpusPath = DEFAULT_CORPUS_PATH,
  samplesPath = DEFAULT_SAMPLES_PATH,
  expectedPath = DEFAULT_EXPECTED_PATH,
} = {}) {
  const violations = []
  const facts = { corpusPath, samplesPath, expectedPath, compared: 0, drifted: [] }

  let expected
  try {
    expected = JSON.parse(readFileSync(expectedPath, 'utf8'))
  } catch (error) {
    const message = `必备 jev-tier15 expected 无法读取：${expectedPath}（${error instanceof Error ? error.message : String(error)}）`
    return {
      passed: false,
      status: 'fail',
      violations: [message],
      note: `${message}；expected 是必备治理文件，缺失不等于通过（ADR-0138 D5）`,
      facts,
    }
  }
  violations.push(...validateExpected(expected))

  let computed
  try {
    computed = computeJevTier15Fingerprint({ corpusPath, samplesPath })
  } catch (error) {
    violations.push(`指纹输入无法重算：${error instanceof Error ? error.message : String(error)}`)
    return {
      passed: false,
      status: 'fail',
      violations,
      note: `指纹输入损坏，本项**未核对任何有效输入**（不是「都一致」）`,
      facts,
    }
  }

  // P-15：空射程不可用——0 条 corpus / 0 条样本不许借「无输入」通过。
  if (computed.corpusEntries === 0) violations.push('corpus 0 条（P-15 空射程：没有可评语料，不是通过）')
  if (computed.sampleCount === 0) violations.push('基线样本集 0 条（P-15 空射程：记分卡没有分母，不是通过）')

  const label = { corpus: 'corpus（待审语料）', criteria: '判据文本⊕阈值（questions.mjs）', model: '模型版本', samples: '基线样本集（samples.json）' }
  for (const key of ['corpus', 'criteria', 'model', 'samples']) {
    facts.compared += 1
    if (String(expected.components?.[key]) !== computed.components[key]) {
      facts.drifted.push(key)
      violations.push(
        `${label[key]}漂移：expected=${String(expected.components?.[key]).slice(0, 12)}… actual=${computed.components[key].slice(0, 12)}…`
          + '——旧基线已失效，重跑语义轨记分卡后重采 expected，不要手改哈希',
      )
    }
  }
  facts.compared += 1
  if (expected.fingerprint !== computed.fingerprint) {
    facts.drifted.push('fingerprint')
    violations.push(`汇总指纹不守恒：expected=${String(expected.fingerprint).slice(0, 12)}… actual=${computed.fingerprint.slice(0, 12)}…（四项都对而汇总不对 = 手抄/篡改）`)
  }
  if (expected.corpusEntries !== undefined && expected.corpusEntries !== computed.corpusEntries) {
    violations.push(`corpus 条目数漂移：expected=${expected.corpusEntries}, actual=${computed.corpusEntries}`)
  }
  if (expected.sampleCount !== undefined && expected.sampleCount !== computed.sampleCount) {
    violations.push(`基线样本数漂移：expected=${expected.sampleCount}, actual=${computed.sampleCount}`)
  }

  const passed = violations.length === 0
  return {
    passed,
    status: passed ? 'pass' : 'fail',
    violations,
    note: passed
      ? `四项指纹与登记一致（corpus ${computed.corpusEntries} 条 / 样本 ${computed.sampleCount} 条 / model=${computed.components.model}）——旧基线有效，零 API 调用`
      : `指纹漂移 ${facts.drifted.length} 项（${facts.drifted.join('、') || 'schema/射程'}）——旧基线报告已失效`,
    facts: { ...facts, computed },
  }
}

/** 映射为 QG-001 canonical schema，供总 gate 使用（5 个比对对象：四项输入 + 汇总）。 */
export function toCanonicalJevTier15Result(result) {
  const failed = result.status === 'fail'
  const objectFailures = result.facts?.drifted?.length ?? (failed ? 1 : 0)
  return {
    status: failed ? 'fail' : 'pass',
    expected: 5,
    discovered: 5,
    checked: failed ? 5 - objectFailures : 5,
    skipped: 0,
    failed: failed ? objectFailures : 0,
    typedSkips: [],
    reason: failed ? `Tier 1.5 基线指纹漂移：${result.violations.length} 处` : 'Tier 1.5 基线指纹与登记一致（离线重算，零 API 调用）',
    note: result.note,
    violations: result.violations,
  }
}

// CLI：默认核对 expected；--print-expected 输出重采候选，须人工审查后入库（同构 live-presets）。
const DEFAULT_PROVENANCE =
  '登记于 2026-09-19 基线重跑（q2 召回 10/10 误报 0/5；q3 召回 15/15 误报 0/5；报告 .scratch/jev-tier15/scorecard-baseline.json）。'
  + '重采前必须先重跑语义轨记分卡并确认判据质量未退化（ADR-0138 D5/D8）。'

function parseArgs(argv) {
  const out = {
    corpusPath: DEFAULT_CORPUS_PATH,
    samplesPath: DEFAULT_SAMPLES_PATH,
    expectedPath: DEFAULT_EXPECTED_PATH,
    json: false,
    printExpected: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--corpus') out.corpusPath = requiredArg(argv, ++i, a)
    else if (a === '--samples') out.samplesPath = requiredArg(argv, ++i, a)
    else if (a === '--expected') out.expectedPath = requiredArg(argv, ++i, a)
    else if (a === '--json') out.json = true
    else if (a === '--print-expected') out.printExpected = true
    else if (a === '--help' || a === '-h') {
      console.log('用法：node scripts/gates/jev-tier15-freshness.mjs [--corpus <file>] [--samples <file>] [--expected <file>] [--json|--print-expected]')
      process.exit(0)
    } else {
      console.error(`未知参数：${a}`)
      process.exit(2)
    }
  }
  return out
}

function requiredArg(argv, index, flag) {
  const value = argv[index]
  if (value === undefined || value.startsWith('--')) {
    console.error(`${flag} 缺少值`)
    process.exit(2)
  }
  return value
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = parseArgs(process.argv.slice(2))
  if (args.printExpected) {
    let computed
    try {
      computed = computeJevTier15Fingerprint(args)
    } catch (error) {
      console.error(`无法重算指纹：${error instanceof Error ? error.message : String(error)}`)
      process.exit(1)
    }
    console.log(JSON.stringify(serializeExpected(computed, DEFAULT_PROVENANCE), null, 2))
    process.exit(0)
  }
  const result = checkJevTier15Freshness(args)
  if (args.json) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    for (const v of result.violations) console.log(`✗ ${v}`)
    console.log(result.note ?? '')
    if (result.passed) console.log('✓ jev-tier15-freshness 通过')
  }
  process.exit(result.passed ? 0 : 1)
}
