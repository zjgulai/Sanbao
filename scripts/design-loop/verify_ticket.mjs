#!/usr/bin/env node
/** LOOP.md §1 的判据执行器：把"绿到可审"变成一条命令，判据本身不由实现者改。
 *  用法：node scripts/design-loop/verify_ticket.mjs --ticket 001 --specs "test/x.spec.ts" --mutation "H 清空 readiness 集 → 1 条具名红"
 *  退出码：0 = 五条判据全部满足（可交用户翻）；1 = 至少一条不满足；2 = 仪器自身跑不动。
 *  来源：2026-10-06 收纳自 Sage-ui-wiring-design/tools/verify_ticket.mjs；
 *  原默认 worktree 是用户机器绝对路径（worktrees/sage-ui-wiring），已改为宿主仓相对入口。 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const argv = process.argv.slice(2)
function flag(name, fallback = '') {
  const index = argv.indexOf(`--${name}`)
  return index === -1 ? fallback : (argv[index + 1] ?? '')
}

// 默认跑在宿主仓自身；需要隔离运行或对准其他 checkout 时显式 --worktree。
const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const worktree = resolve(flag('worktree', repoRoot))
const shell = join(worktree, 'apps/sage-shell')
const specs = flag('specs').split(',').map((s) => s.trim()).filter(Boolean)
const mutation = flag('mutation')
const ticket = flag('ticket', '?')

if (!existsSync(shell)) {
  console.error(`judge: 找不到 ${shell}（用 --worktree 指定隔离工作树）`)
  process.exit(2)
}
if (specs.length === 0) {
  console.error('judge: --specs 至少要列出本票的测试文件（逗号分隔）')
  process.exit(2)
}

function run(cwd, command, args) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
  })
  if (result.error !== undefined) {
    console.error(`judge: 无法执行 ${command} ${args.join(' ')}: ${result.error.message}`)
    process.exit(2)
  }
  return { code: result.status ?? 2, out: `${result.stdout ?? ''}${result.stderr ?? ''}` }
}

/** vitest 汇总行：`      Tests  13 passed (13)`；失败是 `1 failed | 12 passed (13)`；跳过是 `637 passed | 1 skipped (638)`。 */
function parseTotals(output) {
  const line = output.split('\n').filter((l) => /^\s*Tests\s/.test(l)).pop() ?? ''
  const matched = line.match(/(?:(\d+)\s+failed\s*\|\s*)?(\d+)\s+passed(?:\s*\|\s*(\d+)\s+skipped)?\s+\((\d+)\)/u)
  // String.match 无匹配返回 null（不是 undefined）；写错会让"没跑到"冒充"跑过"。
  if (matched === null) return { failed: null, passed: null, skipped: null, total: null, line: line.trim() }
  return {
    failed: Number(matched[1] ?? 0),
    passed: Number(matched[2]),
    skipped: Number(matched[3] ?? 0),
    total: Number(matched[4]),
    line: line.trim(),
  }
}

function namesOfFailures(output) {
  return output.split('\n')
    .filter((l) => l.trim().startsWith('FAIL'))
    .map((l) => l.trim().slice(4).trim())
}

const rows = []
function record(criterion, ok, detail) {
  rows.push({ criterion, verdict: ok === true ? 'PASS' : ok === false ? 'FAIL' : 'MANUAL', detail })
  return ok === true
}

// 判据 3 的前半：类型
const tsc = run(shell, 'npx', ['tsc', '--noEmit'])
record('typecheck 退出 0', tsc.code === 0, `exit=${tsc.code}${tsc.code === 0 ? '' : ` — ${tsc.out.split('\n').filter((l) => l.includes('error')).slice(0, 3).join(' / ')}`}`)

// 判据 1+2：本票 spec 必须存在且全绿（红→绿的"红"由人留档，这里只证"绿"是真的绿）
const specRun = run(shell, 'node', ['scripts/test.mjs', 'run', ...specs])
const specTotals = parseTotals(specRun.out)
const specFilesExist = specs.every((s) => existsSync(join(shell, s)))
record('本票 spec 文件在盘上', specFilesExist, specs.join(', '))
record(
  '本票 spec 全绿且计数可信',
  specRun.code === 0 && specTotals.failed === 0 && specTotals.total !== null && specTotals.total > 0,
  `exit=${specRun.code} ${specTotals.line || specRun.out.split('\n').pop()}${specTotals.skipped ? ` 其中跳过 ${specTotals.skipped} 条=没跑到，不计为通过` : ''}`,
)

// 判据 3 的后半：全量套件
const full = run(shell, 'node', ['scripts/test.mjs', 'run'])
const fullTotals = parseTotals(full.out)
record(
  '全量套件 0 失败',
  full.code === 0 && fullTotals.failed === 0 && fullTotals.total !== null && fullTotals.total > 0,
  `exit=${full.code} ${fullTotals.line} 具名红=${namesOfFailures(full.out).length}`
    + (fullTotals.skipped ? ` 跳过=${fullTotals.skipped}（跳过项不算已核对）` : ''),
)

// 判据 4：门禁全过且 skip=0（聚合行取最后一次匹配，并逐条列出 fail 项，避免"退出码等于已核对"）
const gate = run(worktree, 'pnpm', ['run', 'gate'])
const gateAggregate = [...gate.out.matchAll(/expected=(\d+), discovered=(\d+), checked=(\d+), skipped=(\d+), failed=(\d+)/gu)].pop()
const gateFailures = gate.out.split('\n').filter((l) => /^(?:fail|FAIL)\s+contract/u.test(l)).map((l) => l.trim())
record(
  'gate 全过且 skipped=0',
  gate.code === 0
    && gateAggregate !== undefined
    && Number(gateAggregate[4]) === 0
    && Number(gateAggregate[5]) === 0
    && Number(gateAggregate[1]) === Number(gateAggregate[2]),
  gateAggregate === undefined
    ? `exit=${gate.code} 没读到聚合行`
    : `exit=${gate.code} expected=${gateAggregate[1]} discovered=${gateAggregate[2]} checked=${gateAggregate[3]} skipped=${gateAggregate[4]} failed=${gateAggregate[5]} 明细=${gateFailures.length ? gateFailures.join(' | ').slice(0, 260) : '无'}`,
)

// 判据 5：机器化变异电池。--mutate 可重复，格式 file:::needle:::replacement。
// 每条都：断言 needle 恰好出现一次（防"替了个不存在的字符串"或"只替首个"）→ 备份 → 突变 → 跑本票 spec →
// 要求「退出码 1/2 且有具名 FAIL 且无崩溃签名」→ 无条件还原 → 还原后复跑确认回到原状。
const mutationSpecs = argv.map((a, i) => (a === '--mutate' ? argv[i + 1] : null)).filter(Boolean)

// 崩溃签名必须锚在"错误行"的形状上：早先的 /Unhandled|TypeError: / 会命中**测试名**里的
// "an unhandled route error"，把一条正确的具名红误判成崩溃。收窄后仍覆盖真崩溃的三种形状。
function crashSign(text) {
  return /^\s*(?:TypeError|ReferenceError|RangeError|SyntaxError|EvalError|URIError): /mu.test(text)
    || /Cannot find module '/u.test(text)
    || /Unhandled (?:promise )?rejection/iu.test(text)
}

const mutationResults = []
for (const raw of mutationSpecs) {
  const parts = raw.split(':::')
  const label = parts[1] === undefined ? raw.slice(0, 40) : `${parts[0]} → ${parts[1].trim().slice(0, 34)}`
  if (parts.length !== 3) {
    mutationResults.push({ label, ok: false, detail: '格式必须是 file:::needle:::replacement' })
    continue
  }
  const [rel, needle, replacement] = parts
  const target = join(shell, rel)
  if (!existsSync(target)) {
    mutationResults.push({ label, ok: false, detail: '文件不存在' })
    continue
  }
  const original = readFileSync(target, 'utf8')
  const occurrences = original.split(needle).length - 1
  if (occurrences !== 1) {
    mutationResults.push({ label, ok: false, detail: `needle 出现 ${occurrences} 次（要求恰好 1 次）` })
    continue
  }
  const backup = `${target}.judge-bak`
  let restored = true
  try {
    writeFileSync(backup, original)
    writeFileSync(target, original.replace(needle, replacement))
    const probe = run(shell, 'node', ['scripts/test.mjs', 'run', ...specs])
    const names = namesOfFailures(probe.out)
    const ok = (probe.code === 1 || probe.code === 2) && names.length > 0 && !crashSign(probe.out)
    mutationResults.push({
      label,
      ok,
      detail: `exit=${probe.code} 具名红=${names.length}${names.length ? `（${names[0].split(' > ').pop().slice(0, 52)}）` : ''}${crashSign(probe.out) ? ' 有崩溃签名=不算抓住' : ''}`,
    })
  } finally {
    if (existsSync(backup)) {
      renameSync(backup, target)
    } else {
      restored = false
    }
  }
  const after = run(shell, 'node', ['scripts/test.mjs', 'run', ...specs])
  if (restored && after.code !== 0) {
    mutationResults.push({ label: `${label} ｜还原后复跑`, ok: false, detail: `exit=${after.code} — 还原未恢复原状，必须人工检查` })
  }
}

if (mutationResults.length > 0) {
  const caught = mutationResults.filter((m) => m.ok).length
  record(
    '变异电池（机器复跑，每条都必须被抓住）',
    caught === mutationResults.length,
    `${caught}/${mutationResults.length} 条被抓；漏网：${mutationResults.filter((m) => !m.ok).map((m) => `${m.label}(${m.detail})`).join(' | ') || '无'}`,
  )
} else {
  // 没给 --mutate 时只接受自报，并明确标成非机器项。
  record('至少一条变异红（自报，需人核）', mutation.trim() === '' ? false : null, mutation.trim() === '' ? '未提供 --mutation/--mutate；不接受口头通过' : mutation)
}

console.log(`\n工单 ${ticket} · LOOP §1 判据读数`)
for (const row of rows) console.log(`  ${row.verdict.padEnd(6)} ${row.criterion} — ${row.detail}`)
for (const m of mutationResults) console.log(`  ${m.ok ? 'PASS' : 'FAIL'}   · 突变 ${m.label} — ${m.detail}`)
const machinePass = rows.every((r) => r.verdict !== 'FAIL')
const manual = rows.filter((r) => r.verdict === 'MANUAL').map((r) => r.criterion)
console.log(manual.length > 0 ? `\n自报项（脚本不验证，须人核）：${manual.join('；')}` : '')
console.log(machinePass
  ? (mutationResults.length > 0
      ? '\n判定：五条判据全部机器判定通过（含变异电池），可交用户翻"已完成"。'
      : '\n判定：机器判据无 FAIL，但变异项仅是自报——须人核后才可翻成"已完成"。')
  : '\n判定：未达标，按 §4 停并回报。')
process.exit(machinePass ? 0 : 1)
