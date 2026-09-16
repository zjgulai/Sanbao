/**
 * `dead-instrument.mjs` 的反向自测（ADR-0080）。
 *
 * ## 为什么这些用例必须是「能说不」的
 *
 * 本项守的是**判据面**——发布前清单、代码块、脚本里那些**会被人照着跑**的行。
 * 一份只在正确时判绿的校验，与没有校验的区别只在于它更让人放心，而那正是 P-02
 * 的成因。所以这里的第一条用例用的就是**缺陷原文**（2026-09-13 那行 SOP 检查项），
 * 且用**真登记簿**（不是合成模式）来判它——那样才证明「登记簿里的模式确实拦得住
 * 那次真实事故」。
 *
 * ## 边界也要有用例
 *
 * 本项**故意**不管散文里的提及（机器分不出叙述与规定）。这条边界不写用例就会漂：
 * 有人顺手把射程扩大到全文档，一条正确的叙述（「`pgrep -f` 看不见这个进程」）
 * 立刻变成假红，而假红会让人关掉这条判据。所以有一条用例**钉住这个放行是决定**，
 * 不是遗漏。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkDeadInstrument, extractDocPrescriptions, extractScriptPrescriptions, parseRegistry, REGISTRY_REL_PATH } from './dead-instrument.mjs'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const realRegistry = readFileSync(join(repoRoot, REGISTRY_REL_PATH), 'utf8')

/** 事故原文：2026-09-13 `docs/sop/dmg-release.md` §0 的那条检查项（一字不改）。 */
const DEFECT_LINE = '- [ ] **本机无运行中的 DSH 实例**（`pgrep -f "/Applications/DSH Desktop.app/Contents/MacOS/"` 为空；运行中替换 app bundle 会触发宿主 HMR 热更 → 生产 renderer 无完整热替换 runtime → 白屏，2026-09-13 实测）。'

/** 把一行放进一份最小文档里（可选包成围栏代码块）。 */
const docWith = (line, { fenced = false } = {}) =>
  fenced ? `# T\n\n\`\`\`bash\n${line}\n\`\`\`\n` : `# T\n\n${line}\n`

const check = (files, registryText = realRegistry) => checkDeadInstrument({ registryText, files })

test('R1 缺陷原文（清单行，真登记簿）必须判红', () => {
  const result = check([{ relPath: 'docs/sop/dmg-release.md', text: docWith(DEFECT_LINE) }])
  assert.equal(result.passed, false, '缺陷原文必须被拦住——否则本项拦不住那次真实事故')
  assert.ok(result.violations.some((v) => v.includes('pgrep-electron-main-process')), result.violations.join('\n'))
})

test('R2 围栏代码块里的同一句也必须判红（那是给人照着敲的）', () => {
  const result = check([{ relPath: 'docs/sop/dmg-release.md', text: docWith('pgrep -f "/Applications/DSH Desktop.app/Contents/MacOS/"', { fenced: true }) }])
  assert.equal(result.passed, false, '代码块是「照着敲」的面，不能比清单项更松')
})

test('R3 写成「…」引用则放行（引用不是使用）', () => {
  const quoted = '- [ ] 判据用 `dsh-running.sh`；**不要**用「`pgrep -f "/Applications/DSH Desktop.app/Contents/MacOS/"`」，它读数为空。'
  const result = check([{ relPath: 'docs/sop/dmg-release.md', text: docWith(quoted) }])
  assert.equal(result.passed, true, `引用形式的反例不该判红：${result.violations.join(' | ')}`)
})

test('R4 散文里的提及放行——这是**决定**，不是遗漏', () => {
  // 文档里同时放一条正常清单项：**判据面非空**是本项的前提（见 M2），
  // 一份只有散文的文档会因「抽不出判据面」判红，那是另一条规则。
  const text = '# T\n\n- [ ] 用 `dsh-running.sh` 确认没有实例在跑。\n\n2026-09-13 实测：`pgrep -f "/Applications/DSH Desktop.app/Contents/MacOS/"` 在主进程在跑时返回 0 条。\n'
  const result = check([{ relPath: 'docs/notes/implemented/x.md', text }])
  assert.equal(result.passed, true, `叙述不在判据面上：${result.violations.join(' | ')}`)
})

test('R5 脚本：注释里的说明放行、代码行里的使用判红', () => {
  const commentOnly = `#!/bin/bash\n# 判据不能用 \`pgrep -f "$APP/Contents/MacOS/"\`：它读数为空\nbash "$HERE/dsh-running.sh" --app "$APP"\n`
  const ok = check([{ relPath: 'packaging/scripts/x.sh', text: commentOnly }])
  assert.equal(ok.passed, true, `注释是说明、不是判据：${ok.violations.join(' | ')}`)

  const inCode = `#!/bin/bash\nif pgrep -f "$APP/Contents/MacOS/" >/dev/null; then echo running; fi\n`
  const bad = check([{ relPath: 'packaging/scripts/x.sh', text: inCode }])
  assert.equal(bad.passed, false, '脚本代码行里的使用必须拦住')
})

test('R6 mdfind 作为「不存在」的判据同样拦住（第二种已证伪仪器）', () => {
  const result = check([{ relPath: 'docs/sop/dmg-release.md', text: docWith('- [ ] 确认产物不在本机：`mdfind -name DSH-Desktop-LUTE` 无输出。') }])
  assert.equal(result.passed, false)
  assert.ok(result.violations.some((v) => v.includes('mdfind-as-absence-proof')), result.violations.join('\n'))
})

test('R7 空登记簿判红（恒绿是最坏的形态）', () => {
  const empty = JSON.stringify({ instruments: [] })
  const result = check([{ relPath: 'docs/x.md', text: docWith('- [ ] ok') }], empty)
  assert.equal(result.passed, false, '空登记簿必须判红：一条永远不会说不的判据比没有更坏')
})

test('R8 登记簿读不出/解析失败判红（不是当成「没有登记项」）', () => {
  for (const registryText of ['', '{ 坏 json']) {
    const result = check([{ relPath: 'docs/x.md', text: docWith('- [ ] ok') }], registryText)
    assert.equal(result.passed, false, `登记簿「${registryText}」必须判红`)
  }
})

test('R9 登记项缺字段判红（缺证据的登记只是一句口味）', () => {
  for (const field of ['provenOn', 'reading', 'why', 'useInstead']) {
    const entry = { id: 'x', pattern: 'zzz', provenOn: 'd', reading: 'r', why: 'w', useInstead: 'u' }
    delete entry[field]
    const result = check([{ relPath: 'docs/x.md', text: docWith('- [ ] ok') }], JSON.stringify({ instruments: [entry] }))
    assert.equal(result.passed, false, `缺 ${field} 必须判红`)
  }
})

test('M1 恒真桩突变：射程换成空数组，必须判红而不是判绿', () => {
  const result = check([])
  assert.equal(result.passed, false, '「一个都没比」与「都比过且干净」不能同形（P-15）')
  assert.ok(result.violations.some((v) => v.includes('射程为空')))
})

test('M2 恒真桩突变：判据面抽出 0 行，必须判红而不是判绿', () => {
  const result = check([{ relPath: 'docs/x.md', text: '# 空文档\n\n只有散文，没有清单行也没有围栏。\n' }])
  assert.equal(result.passed, false, '抽不出判据面说明解析坏了，不能读成「仓库干净」')
})

test('M3 模式换成永不匹配的串，缺陷原文就必须漏过——证明拦住它的是登记簿内容', () => {
  const dead = JSON.stringify({
    instruments: [{ id: 'zzz', pattern: 'qwerty-never-matches-anything', provenOn: 'd', reading: 'r', why: 'w', useInstead: 'u' }],
  })
  const result = check([{ relPath: 'docs/sop/dmg-release.md', text: docWith(DEFECT_LINE) }], dead)
  assert.equal(result.passed, true, '若换成空模式仍然判红，说明拦住它的不是登记簿——那本项拦的就不是这条事故')
})

test('抽取器本身：围栏边界、清单行与其**续行**', () => {
  const doc = [
    '# T', // 1
    '', // 2
    '- [ ] 清单项', // 3
    '  续行也属于这一项', // 4
    '', // 5 ← 空行结束该项
    '正文行（不在判据面上）', // 6
    '```bash', // 7
    'fenced line', // 8
    '```', // 9
    '收尾正文（不在判据面上）', // 10
  ].join('\n')
  assert.deepEqual(
    extractDocPrescriptions(doc).map((p) => p.line),
    [3, 4, 8],
    '清单项 3 与其续行 4、围栏内 8 在判据面上；空行之后的散文不在',
  )
  assert.deepEqual(
    extractScriptPrescriptions('#!/bin/bash\n# 注释\n\n  x=1   # 尾随注释\n').map((p) => p.line),
    [4],
    '只有代码行（4）在射程内：shebang 与纯注释都是注释，不是判据',
  )
})

test('登记簿自身可解析、每条都带齐证据字段、id 不重复', () => {
  const { instruments, errors } = parseRegistry(realRegistry)
  assert.deepEqual(errors, [], errors.join('\n'))
  // **不钉死条数**：往登记簿里**加**一条已证伪的仪器是好事，钉死条数只会训练下一个人
  // 无脑把数字改大（那正是「拦住」退化成「记得改数字」的形态）。这里守的是**没被清空**
  // ——空登记簿让本项恒绿（parseRegistry 也单独判了红），下限 2 是仓库当时的实际条数。
  assert.ok(
    instruments.length >= 2,
    `登记簿只剩 ${instruments.length} 条——空/近乎空的登记簿让本项恒绿（P-02）`,
  )
  const ids = instruments.map((i) => i.id)
  assert.equal(new Set(ids).size, ids.length, `登记簿 id 有重复：${ids.join(' ')}`)
})
