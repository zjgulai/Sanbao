/**
 * ADR 决策账本校验项（ADR-0122）。
 *
 * ## 为什么需要它
 *
 * 2026-09-18 用户裁决：「**adr 机制需要修复，每一轮决策的结果面向 AGENT 都要做 adr 记录**」。
 *
 * 现状实测（同一天）：
 *
 * 1. `docs/adr/` 有 121 篇 ADR，编号连续、索引双向一致——**形式上完全合规**。
 * 2. 但 **121/121 全部是 `accepted`**：`状态` 字段不承载任何信息（没有 superseded /
 *    withdrawn / proposed 的实例），所以「这条决策还有效吗」在文件里答不出来。
 * 3. 决策只以**散文**存在。一个新会话的 agent 想「开工前先知道平台立过哪些约束」，
 *    唯一办法是把 121 篇 Markdown 读一遍——它不会读，于是同一类问题反复返工。
 *    本仓库自己的复发故障总账把这个形态记为「**知道没有变成拦住**」。
 * 4. 没有任何判据要求「决策**面向 agent** 可机读」。ADR-0015 只强制了**人读**的四段
 *    （Problem / Decision / Alternatives / Consequences）。
 *
 * 也就是说：留痕机制把人照顾好了，把 agent 落下了。而本仓库的绝大多数写入者是 agent。
 *
 * ## 判据
 *
 * 1. **账本必须与 ADR 文件一致**：`docs/adr/decisions.json` 的每一条都要能由
 *    `docs/adr/ADR-NNNN.md` 重新生成出来（逐字段比对）。账本是**派生面**，
 *    源永远是 ADR 文件——两个家会分叉，分叉那天没人知道。
 * 2. **新 ADR 必须带机器可读决策块**：`## 机器可读决策` 标题下的 `json` 围栏，
 *    至少一条 decision。这是「每一轮决策的结果面向 AGENT 都要做 adr 记录」的机器面。
 * 3. **历史豁免只减不增**：`legacyWithoutDecisions` 是引入本项时那批还没有决策块的 ADR。
 *    它**只能变短**——写进一个新编号即判红。基线取 `git show HEAD:docs/adr/decisions.json`
 *    （与 `exemptions-frozen` 同一套做法，ADR-0014 / ADR-0056：靠人记得不是工程解）。
 * 4. **分母必须常显**：扫了多少篇 ADR、其中多少篇有决策块、豁免多少篇、共多少条 decision。
 *    扫描面为空或账本读不出来一律判红——「一篇都没扫」与「都扫过且合规」必须分开（P-15）。
 *
 * ## 本项**不**检查什么（诚实写清楚，免得被当成全覆盖）
 *
 * 1. **决策的质量**。本项只断言「有、可解析、与源一致」，不判断决策写得好不好、
 *    是否真的被执行。判质量需要一套语义标准，而那种标准会腐烂。
 * 2. **`状态` 的语义正确性**。本项只断言账本与文件里那一行的字面值一致。
 *    「121/121 全 accepted」这个事实本项**看得见但没有立场判红**——它属于下一轮决策，
 *    不是机器能替人拍的那一半。
 * 3. **Note 的四段完整性**。那是 ADR-0015 与 `verify-agent-note-format` 的射程。
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** 账本相对仓库根的路径。 */
export const LEDGER_REL_PATH = 'docs/adr/decisions.json'
/** 决策块在 ADR 正文里的标题（逐字匹配）。 */
export const DECISION_HEADING = '## 机器可读决策'
/** 账本 schema 版本。字段含义变化时递增。 */
export const LEDGER_SCHEMA = 1

const ADR_FILE_RE = /^ADR-(\d{4})\.md$/

/** 列出 `docs/adr/ADR-NNNN.md`，按编号升序。 */
export function listAdrIds(repoRoot) {
  const dir = join(repoRoot, 'docs', 'adr')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => ADR_FILE_RE.test(name))
    .map((name) => `ADR-${ADR_FILE_RE.exec(name)[1]}`)
    .sort()
}

/**
 * 从一篇 ADR 正文里抽出机器可读决策。
 *
 * 只认真实标题行 `## 机器可读决策`（允许行尾空白），其后第一个 ```json 围栏。
 * 找不到标题、围栏坏了、JSON 解析失败、decisions 为空数组以外的形状——
 * 一律返回 `{ found: false, error }`，由调用方决定是判红还是记为豁免。
 */
export function parseDecisionBlock(text) {
  const lines = String(text ?? '').split('\n')
  let headingAt = -1
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].trimEnd() === DECISION_HEADING) {
      headingAt = i
      break
    }
  }
  if (headingAt === -1) return { found: false, error: '缺少 `## 机器可读决策` 标题' }

  let fenceAt = -1
  for (let i = headingAt + 1; i < lines.length; i += 1) {
    if (lines[i].trimEnd().startsWith('## ')) break // 进了下一节，说明本节没有围栏
    if (/^```json\s*$/.test(lines[i])) {
      fenceAt = i
      break
    }
  }
  if (fenceAt === -1) return { found: false, error: '`## 机器可读决策` 下没有 ```json 围栏' }

  let endAt = -1
  for (let i = fenceAt + 1; i < lines.length; i += 1) {
    if (/^```\s*$/.test(lines[i])) {
      endAt = i
      break
    }
  }
  if (endAt === -1) return { found: false, error: '```json 围栏没有闭合' }

  let parsed
  try {
    parsed = JSON.parse(lines.slice(fenceAt + 1, endAt).join('\n'))
  } catch (error) {
    return { found: false, error: `决策块不是合法 JSON：${error.message}` }
  }
  if (!Array.isArray(parsed?.decisions) || parsed.decisions.length === 0) {
    return { found: false, error: '决策块里 `decisions` 必须是非空数组' }
  }
  for (const [i, d] of parsed.decisions.entries()) {
    if (typeof d?.id !== 'string' || d.id === '') {
      return { found: false, error: `decisions[${i}].id 缺失或不是非空字符串` }
    }
    if (typeof d?.text !== 'string' || d.text === '') {
      return { found: false, error: `decisions[${i}].text 缺失或不是非空字符串` }
    }
    if (d.constraints !== undefined && !Array.isArray(d.constraints)) {
      return { found: false, error: `decisions[${i}].constraints 存在时必须是数组` }
    }
  }
  return {
    found: true,
    decisions: parsed.decisions.map((d) => ({
      id: d.id,
      text: d.text,
      constraints: Array.isArray(d.constraints) ? d.constraints : [],
    })),
  }
}

/** 从 ADR 头部抽 `- 状态：X` / `- 日期：X`；抽不到返回空串（由判据决定是否算问题）。 */
export function parseHeaderField(text, label) {
  const re = new RegExp(`^-\\s*${label}\\s*[：:]\\s*(.+?)\\s*$`, 'm')
  return re.exec(String(text ?? ''))?.[1] ?? ''
}

/** 取正文第一个 `# ` 标题的文字（去掉 `# ` 前缀）。 */
export function parseTitle(text) {
  for (const line of String(text ?? '').split('\n')) {
    if (line.startsWith('# ')) return line.slice(2).trim()
  }
  return ''
}

/**
 * 由 ADR 文件生成账本。
 *
 * `previous` 是上一版账本，只用于**继承** `legacyWithoutDecisions`：
 * 已经补上决策块的编号自动移出豁免（豁免只会变短），已不存在的编号自动丢弃；
 * **不会**把新出现的「没有决策块」的 ADR 自动加进豁免——那正是要判红的状态。
 */
export function buildLedger({ repoRoot, previous = null }) {
  const ids = listAdrIds(repoRoot)
  const prevLegacy = new Set(previous?.legacyWithoutDecisions ?? [])
  const adrs = []
  const legacy = []

  for (const id of ids) {
    const rel = `docs/adr/${id}.md`
    const text = readFileSync(join(repoRoot, rel), 'utf8')
    const block = parseDecisionBlock(text)
    if (!block.found && prevLegacy.has(id)) legacy.push(id)
    adrs.push({
      id,
      title: parseTitle(text),
      status: parseHeaderField(text, '状态'),
      date: parseHeaderField(text, '日期'),
      decisions: block.found ? block.decisions : [],
    })
  }

  return {
    schema: LEDGER_SCHEMA,
    note:
      '机器可读决策账本。**派生面**，由 scripts/gates/adr-agent-records.mjs 从 '
      + 'docs/adr/ADR-NNNN.md 的「## 机器可读决策」块生成；重新生成：'
      + 'node scripts/gates/adr-agent-records.mjs --write。'
      + '门禁 adr-agent-records 断言本文件与源文件逐字段一致。',
    legacyWithoutDecisions: legacy,
    adrs,
  }
}

/** 稳定序列化：账本比较与落盘都用它，避免键序造成假红。 */
export function serializeLedger(ledger) {
  const ordered = {
    schema: ledger.schema,
    note: ledger.note,
    legacyWithoutDecisions: [...(ledger.legacyWithoutDecisions ?? [])],
    adrs: (ledger.adrs ?? []).map((a) => ({
      id: a.id,
      title: a.title,
      status: a.status,
      date: a.date,
      decisions: (a.decisions ?? []).map((d) => ({
        id: d.id,
        text: d.text,
        constraints: [...(d.constraints ?? [])],
      })),
    })),
  }
  return `${JSON.stringify(ordered, null, 2)}\n`
}

/**
 * 校验账本。
 *
 * @param {{repoRoot: string, ledger: unknown, baseline?: unknown|null, ledgerText?: string|null}} input
 *   `baseline` 取 `git show HEAD:docs/adr/decisions.json`；为 `null` 表示 HEAD 里还没有
 *   这个文件（首次引入），此时「只减不增」这一条**跳过并明示**，不静默放过。
 */
export function checkAdrAgentRecords({ repoRoot, ledger, baseline = null, ledgerText = null }) {
  const violations = []
  const ids = listAdrIds(repoRoot)

  if (ids.length === 0) {
    return {
      passed: false,
      violations: ['射程为空：docs/adr 下一篇 ADR-NNNN.md 都没有枚举到——「一篇都没扫」与「都扫过且合规」必须分开（P-15）'],
      note: '扫描 0 篇 ADR（取不到射程，本项本次未核对任何东西）',
      scanned: 0,
    }
  }

  if (ledger === null || typeof ledger !== 'object') {
    return {
      passed: false,
      violations: [`账本 ${LEDGER_REL_PATH} 读不出来或 JSON 解析失败——重新生成：node scripts/gates/adr-agent-records.mjs --write`],
      note: `枚举到 ${ids.length} 篇 ADR，但账本不可读（本项本次未核对任何东西）`,
      scanned: ids.length,
    }
  }

  // 1) 账本必须能由 ADR 文件重新生成出来（逐字段）。
  const expected = buildLedger({ repoRoot, previous: ledger })
  const expectedById = new Map(expected.adrs.map((a) => [a.id, a]))
  const actualById = new Map((ledger.adrs ?? []).map((a) => [a.id, a]))

  for (const id of ids) {
    if (!actualById.has(id)) {
      violations.push(`${id}：ADR 文件在，账本里没有它——账本落后于源（重新生成即可）`)
      continue
    }
    const want = expectedById.get(id)
    const got = actualById.get(id)
    for (const field of ['title', 'status', 'date']) {
      if ((want[field] ?? '') !== (got[field] ?? '')) {
        violations.push(`${id}：账本 ${field} 与 ADR 文件不一致（账本「${got[field] ?? ''}」≠ 文件「${want[field] ?? ''}」）`)
      }
    }
    const wantD = JSON.stringify(want.decisions)
    const gotD = JSON.stringify((got.decisions ?? []).map((d) => ({
      id: d.id,
      text: d.text,
      constraints: d.constraints ?? [],
    })))
    if (wantD !== gotD) {
      violations.push(`${id}：账本 decisions 与 ADR 文件里的决策块不一致——账本是派生面，源是 ADR 文件`)
    }
  }
  for (const id of actualById.keys()) {
    if (!ids.includes(id)) violations.push(`${id}：账本里有它，docs/adr/ 下没有对应文件——删掉这条或补回文件`)
  }

  // 2) 除豁免外，每篇 ADR 必须有机器可读决策块。
  const legacy = new Set(ledger.legacyWithoutDecisions ?? [])
  for (const id of ids) {
    if (legacy.has(id)) continue
    const text = readFileSync(join(repoRoot, `docs/adr/${id}.md`), 'utf8')
    const block = parseDecisionBlock(text)
    if (!block.found) {
      violations.push(
        `${id}：既不在 legacyWithoutDecisions 里，又没有可解析的决策块（${block.error}）`
          + `——每一轮决策的结果面向 AGENT 都要做 adr 记录（ADR-0122）`,
      )
    }
  }

  // 3) 豁免清单只减不增。
  if (baseline && typeof baseline === 'object') {
    const baseLegacy = new Set(baseline.legacyWithoutDecisions ?? [])
    for (const id of legacy) {
      if (!baseLegacy.has(id)) {
        violations.push(
          `${id}：新加进 legacyWithoutDecisions 的豁免——历史豁免只减不增（ADR-0014 / ADR-0122）。`
            + '要豁免一篇 ADR，先说明为什么它不该有面向 agent 的决策面',
        )
      }
    }
  }

  // 4) 豁免里的编号必须真实存在（否则是一份会腐烂的清单）。
  for (const id of legacy) {
    if (!ids.includes(id)) violations.push(`${id}：在 legacyWithoutDecisions 里，但 docs/adr/ 下没有这篇 ADR——清掉幽灵条目`)
  }

  const withBlock = expected.adrs.filter((a) => a.decisions.length > 0).length
  const totalDecisions = expected.adrs.reduce((n, a) => n + a.decisions.length, 0)
  const note =
    `扫描 ${ids.length} 篇 ADR；有决策块 ${withBlock} 篇；豁免 ${legacy.size} 篇；`
    + `共 ${totalDecisions} 条 machine-readable decision；`
    + (baseline && typeof baseline === 'object'
      ? `基线（HEAD）豁免 ${(baseline.legacyWithoutDecisions ?? []).length} 篇，本项核对「只减不增」`
      : 'HEAD 里还没有本账本，本次跳过「只减不增」核对（不是「已合规」）')

  return { passed: violations.length === 0, violations, note, scanned: ids.length }
}

/** 生成账本文件内容（CLI 与判据共用同一实现，避免两个家）。 */
export function renderLedger({ repoRoot, previous = null }) {
  return serializeLedger(buildLedger({ repoRoot, previous }))
}

/** 读 HEAD 里的账本作为基线；HEAD 没有该文件时返回 null。 */
export function readBaselineLedger(repoRoot) {
  try {
    execFileSync('git', ['-C', repoRoot, 'cat-file', '-e', `HEAD:${LEDGER_REL_PATH}`], { stdio: 'ignore' })
  } catch {
    return null
  }
  try {
    const text = execFileSync('git', ['-C', repoRoot, 'show', `HEAD:${LEDGER_REL_PATH}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return JSON.parse(text)
  } catch {
    return null
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const repoRoot = process.cwd()
  const ledgerPath = join(repoRoot, LEDGER_REL_PATH)
  if (process.argv.includes('--write')) {
    const previous = existsSync(ledgerPath) ? JSON.parse(readFileSync(ledgerPath, 'utf8')) : null
    const next = renderLedger({ repoRoot, previous })
    writeFileSync(ledgerPath, next)
    const parsed = JSON.parse(next)
    process.stdout.write(
      `已写入 ${LEDGER_REL_PATH}：${parsed.adrs.length} 篇 ADR，`
        + `${parsed.adrs.filter((a) => a.decisions.length > 0).length} 篇有决策块，`
        + `${parsed.legacyWithoutDecisions.length} 篇豁免\n`,
    )
  } else {
    const ledger = existsSync(ledgerPath) ? JSON.parse(readFileSync(ledgerPath, 'utf8')) : null
    const result = checkAdrAgentRecords({ repoRoot, ledger, baseline: readBaselineLedger(repoRoot) })
    process.stdout.write(`${result.passed ? 'PASS' : 'FAIL'}  ${result.note}\n`)
    for (const v of result.violations) process.stdout.write(`  - ${v}\n`)
    process.exit(result.passed ? 0 : 1)
  }
}
