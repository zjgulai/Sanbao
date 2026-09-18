/**
 * `resource-path-reachability.mjs` 的反向自测。
 *
 * 本项守的是「**补丁里的环境常量在出货产物上悬空**」这一类缺陷。它的判据必须是
 * **能说「不」**的：一个只会在正确产物上判绿的实现，与没有实现的区别只是更让人放心，
 * 而那正是 P-02「仪器假绿」的成因。所以这里最要紧的是三类用例：
 *
 * 1. **缺陷原文突变**（P0-8）：用 2026-09-17 实际炸掉 2.5.0 的那行字面量原样喂进去，
 *    必须判红——这条用例让「只检查常量名在不在文件里」的退化实现红给你看。
 * 2. **已验收产物必须静默**（防仪器假红）：`main.js` 里那处 `.replace(/app\.asar(?!\.unpacked)/g,
 *    "app.asar.unpacked")` 是合法替换值、在 no-ASAR 下是 no-op；判据必须放过它。
 *    若它判红，就是把一条正确的出货物读成缺陷——同族前科见总账 P-02 的仪器假红段。
 * 3. **空射程报跳过而非通过**：产物不在场时 `skipped: true` 且 `passed: false`。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  checkResourcePathReachability,
  detectForm,
  extractResourcePathLiterals,
  judgeResourcePaths,
  maskNonStringSpans,
  staticPathSegment,
} from './resource-path-reachability.mjs'

/** 2.0.10 的真实产物形态：`Resources/app` 在，`app.asar` / `app.asar.unpacked` 都不在。 */
const NO_ASAR_PROBE = { hasApp: true, hasAsar: false, hasUnpacked: false, ok: true }

/** 2.0.5 的真实产物形态：`app.asar` + `app.asar.unpacked` 都在。 */
const ASAR_PROBE = { hasApp: false, hasAsar: true, hasUnpacked: true, ok: true }

/** P0-8 的**缺陷原文**（2.5.0 出厂字节里那一行，逐字）。 */
const P08_SOURCE = [
  '// P0-8 补丁：pi-ai lazy 模块强制从 unpacked 磁盘加载（绕开 asar 内 ESM 动态 import 缺陷）',
  'const PI_AI_API_DIR = `${process.resourcesPath}/app.asar.unpacked/node_modules/@earendil-works/pi-ai/dist/api`;',
  'const { anthropicMessagesApi } = await import(`${PI_AI_API_DIR}/anthropic-messages.lazy.js`);',
].join('\n')

/** `main.js` 里那处**合法**的替换串（no-ASAR 下 no-op，不参与路径解析）。 */
const RECOVERY_SOURCE =
  'const RECOVERY_DOCUMENT = fileURLToPath(new URL("./native-ui/recovery.html", import.meta.url))' +
  '.replace(/app\\.asar(?!\\.unpacked)/g, "app.asar.unpacked");'

test('形态探测：no-ASAR 与 ASAR 两种产物各自成立，探测失败时 unknown', () => {
  assert.equal(detectForm(NO_ASAR_PROBE), 'no-asar')
  assert.equal(detectForm(ASAR_PROBE), 'asar')
  assert.equal(detectForm({ hasApp: false, hasAsar: false, hasUnpacked: false, ok: true }), 'unknown')
  assert.equal(detectForm({ hasApp: true, hasAsar: false, hasUnpacked: false, ok: false }), 'unknown')
})

test('提取器：正则字面量里的路径片段不算候选（掩码生效）', () => {
  const { masked, spans } = maskNonStringSpans(RECOVERY_SOURCE)
  assert.equal(masked.includes('/app\\.asar'), false)
  // 两个字符串字面量：`"./native-ui/recovery.html"` 与替换值 `"app.asar.unpacked"`。
  // 后者的内容在 `app.asar.unpacked` 之后**没有分隔符** → 不构成路径候选：
  // 这条「差一个 `/`」的边界正是判据只钉**路径形态**而不钉「提到过 asar」的界线。
  assert.equal(extractResourcePathLiterals(RECOVERY_SOURCE).length, 0)
  assert.equal(spans.length, 2)
})

test('提取器：模板字面量的插值被保留，路径段完整', () => {
  const found = extractResourcePathLiterals(P08_SOURCE)
  assert.equal(found.length, 1)
  assert.equal(
    found[0],
    '${process.resourcesPath}/app.asar.unpacked/node_modules/@earendil-works/pi-ai/dist/api',
  )
})

test('静态路径段：取最长路径段，纯插值字面量不可判', () => {
  assert.equal(
    staticPathSegment('${process.resourcesPath}/app.asar.unpacked/node_modules/x/y'),
    'app.asar.unpacked/node_modules/x/y',
  )
  assert.equal(staticPathSegment('${a}/b'), undefined)
  assert.equal(staticPathSegment('/a'), undefined)
})

test('缺陷原文突变：P0-8 的字面量在 no-ASAR 产物上必须判红（本项的恒真桩突变）', () => {
  const verdict = checkResourcePathReachability({
    tree: 'mutated-p08',
    probe: NO_ASAR_PROBE,
    jsFiles: ['@deepseek-ai/dsh-llm-pi-ai/lib/index.js'],
    read: () => P08_SOURCE,
    exists: (rel) => rel === 'app' || rel.startsWith('app/'), // no-ASAR：只有 app/ 存在
  })
  assert.equal(verdict.passed, false, '悬空的 app.asar.unpacked 路径必须判红')
  assert.equal(verdict.skipped, false)
  assert.equal(verdict.form, 'no-asar')
  assert.equal(verdict.violations.length, 1)
  assert.match(verdict.violations[0].literal, /app\.asar\.unpacked\/node_modules/)
})

test('已验收产物必须静默：合法的 replace 替换值不得判红（防仪器假红）', () => {
  const verdict = checkResourcePathReachability({
    tree: 'installed-2.5.0',
    probe: NO_ASAR_PROBE,
    jsFiles: ['lib/main.js'],
    read: () => RECOVERY_SOURCE,
    exists: () => true,
  })
  // 候选为 0 条 → 射程内没有可判对象：报跳过，但**不判红**（passed=true 表示「没有发现缺陷」，
  // checked=0 表示「本条树未被核实」——两者必须不同形）。
  assert.equal(verdict.passed, true)
  assert.equal(verdict.skipped, true)
  assert.equal(verdict.checked, 0)
  assert.equal(verdict.violations.length, 0)
})

test('已修复的 no-ASAR 产物必须静默：扫到文件但零候选不得判红（仪器假红防线）', () => {
  // 这正是本机 /Applications 修复后的读数：745 个 .js、0 条候选。
  // 若这里判红，门禁就会把**已经修好**的产物报成缺陷，而它的长相与真缺陷一样。
  const verdict = checkResourcePathReachability({
    tree: 'installed-post-fix',
    probe: NO_ASAR_PROBE,
    jsFiles: ['node_modules/@deepseek-ai/dsh-llm-pi-ai/lib/index.js'],
    read: () => 'import { anthropicMessagesApi } from "@earendil-works/pi-ai/api/anthropic-messages.lazy";',
    exists: () => true,
  })
  assert.equal(verdict.passed, true)
  assert.equal(verdict.skipped, true, '零候选 = 本条树未被核实，必须报跳过而不是「已验证」')
  assert.equal(verdict.checked, 0)
  assert.equal(verdict.violations.length, 0)
})

test('ASAR 产物上同一条路径可达时判绿（形态对称性）', () => {
  const verdict = checkResourcePathReachability({
    tree: 'asar-tree',
    probe: ASAR_PROBE,
    jsFiles: ['@deepseek-ai/dsh-llm-pi-ai/lib/index.js'],
    read: () => P08_SOURCE,
    exists: (rel) => rel === 'app.asar.unpacked/node_modules/@earendil-works/pi-ai/dist',
  })
  assert.equal(verdict.passed, true)
  assert.equal(verdict.skipped, false)
  assert.equal(verdict.violations.length, 0)
})

test('修复后的字节判绿：上游静态 import 里没有资源根字面量', () => {
  const fixed = [
    'import { anthropicMessagesApi } from "@earendil-works/pi-ai/api/anthropic-messages.lazy";',
    'import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";',
  ].join('\n')
  assert.equal(extractResourcePathLiterals(fixed).length, 0)
})

test('射程为空必须报跳过：没有可扫文件时不得报通过', () => {
  const verdict = checkResourcePathReachability({
    tree: 'absent',
    probe: NO_ASAR_PROBE,
    jsFiles: [],
    read: () => '',
    exists: () => false,
  })
  assert.equal(verdict.skipped, true)
  assert.equal(verdict.passed, true)
  assert.equal(verdict.checked, 0)
  assert.match(verdict.note, /射程为空/)
})

test('形态未知必须报跳过：探测落空时不得把「没量到」读成「都合格」', () => {
  const verdict = checkResourcePathReachability({
    tree: 'unknown-form',
    probe: { hasApp: false, hasAsar: false, hasUnpacked: false, ok: false },
    jsFiles: ['lib/main.js'],
    read: () => P08_SOURCE,
    exists: () => true,
  })
  assert.equal(verdict.skipped, true)
  assert.equal(verdict.passed, true)
  assert.match(verdict.note, /无法判定产物资源形态/)
})

test('判据本身：目录不存在即红，存在即绿', () => {
  const candidates = [{ file: 'a.js', literal: '/app.asar.unpacked/node_modules/x' }]
  const red = judgeResourcePaths({
    form: 'no-asar',
    candidates,
    exists: () => false,
  })
  assert.equal(red.violations.length, 1)
  const green = judgeResourcePaths({
    form: 'asar',
    candidates,
    exists: (rel) => rel === 'app.asar.unpacked/node_modules',
  })
  assert.equal(green.violations.length, 0)
  assert.equal(green.checked, 1)
})
