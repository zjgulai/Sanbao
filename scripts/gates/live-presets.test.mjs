/**
 * `live-presets.mjs` 的反向自测：判据必须能说「不」。
 *
 * 守的是 2026-09-14 那起事故的回归钉：`__DSH_HOME__` 被打进预设行、以及行名
 * 无法在当前解析面解析。只会在正确时判绿的校验与没有校验的区别只在于它更让人放心
 * （P-02）。最要紧的钉子：
 *
 *   S1 占位符必须判红；S2/S3 解析不到的行（包名 / 绝对路径）必须判红；
 *   S4 宿主会跳过的 disabled 行不得判红（把 JS 决定的行判红会让 gate 变成噪声）；
 *   S5/S6 空射程必须「跳过并写明」，而不是长得和「都健康」一样；
 *   S7 块标量内容里的 name:/占位符不得被当插件行（占位符仍在非注释行说话）；
 *   M1 恒真桩突变：一个只查占位符、不查行名的退化实现必须放过 S2 的缺陷形状，
 *      证明真正拦住它的是本判据的行解析，而不是运气。
 */
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  buildLivePresetInventory,
  checkLivePresets,
  checkLivePresetsAgainstInventory,
  compareLivePresetInventory,
  scanAgentCordis,
  disabledTruthy,
  rowResolves,
  packageInstalled,
  toCanonicalLivePresetResult,
} from './live-presets.mjs'
import { validateGateResult } from './gate-result.mjs'

const temps = []
afterEach(() => {
  while (temps.length > 0) rmSync(temps.pop(), { recursive: true, force: true })
})

function makeRoot() {
  const dir = mkdtempSync(join(tmpdir(), 'live-presets-'))
  temps.push(dir)
  return dir
}

function writePreset(root, id, body) {
  const presetDir = join(root, id)
  mkdirSync(presetDir, { recursive: true })
  writeFileSync(join(presetDir, 'agent.cordis.yml'), body)
  return presetDir
}

function readPreset(root, id) {
  return readFileSync(join(root, id, 'agent.cordis.yml'), 'utf8')
}

function writePkg(base, pkg) {
  const pkgDir = join(base, 'node_modules', pkg)
  mkdirSync(pkgDir, { recursive: true })
  writeFileSync(join(pkgDir, 'package.json'), '{}\n')
}

function assertConservation(result) {
  assert.equal(
    result.metrics.discovered,
    result.metrics.checked + result.metrics.disabled + result.metrics.failed,
  )
  assert.equal(result.discovered, result.metrics.discovered)
  assert.equal(result.checked, result.metrics.checked)
  assert.equal(result.disabled, result.metrics.disabled)
  assert.equal(result.failed, result.metrics.failed)
}

const VALID_ROWS = [
  "- id: a\n  name: cordis:group\n",
  "- id: b\n  name: '@scope/installed'\n",
  "- id: c\n  name: '/tmp/definitely-missing-file.js'\n  disabled: true\n",
].join('')

test('S1 占位符残留必须判红并点到文件与行号', () => {
  const root = makeRoot()
  writePreset(root, 'p1', "- id: x\n  name: '__DSH_HOME__/profiles/desktop/node_modules/@aiwayds/dsh-dcp/lib/index.js'\n")
  const result = checkLivePresets({ userRoot: root, profileBase: root })
  assert.equal(result.passed, false)
  assert.ok(result.violations.some((v) => v.includes('p1/agent.cordis.yml:2') && v.includes('__DSH_HOME__')))
})

test('S2 解析不到的包名必须判红', () => {
  const root = makeRoot()
  writePreset(root, 'p2', "- id: x\n  name: '@nope/missing-pkg'\n")
  const result = checkLivePresets({ userRoot: root, profileBase: root })
  assert.equal(result.passed, false)
  assert.ok(result.violations.some((v) => v.includes('@nope/missing-pkg') && v.includes('无法解析')))
})

test('S3 解析不到的绝对路径必须判红', () => {
  const root = makeRoot()
  writePreset(root, 'p3', "- id: x\n  name: '/no/such/file.js'\n")
  const result = checkLivePresets({ userRoot: root, profileBase: root })
  assert.equal(result.passed, false)
  assert.ok(result.violations.some((v) => v.includes('/no/such/file.js')))
})

test('S4 disabled 行不得判红（宿主 Boolean(disabled) 同构）', () => {
  const root = makeRoot()
  writePkg(root, '@scope/installed')
  writePreset(root, 'p4', VALID_ROWS)
  const result = checkLivePresets({ userRoot: root, profileBase: root })
  assert.equal(result.passed, true, result.violations.join('\n'))
})

test('S4b 平台表达式的 disabled 真值与宿主意图一致', () => {
  assert.equal(disabledTruthy("!!js process.platform === 'win32'"), process.platform === 'win32')
  assert.equal(disabledTruthy("!!js process.platform !== 'win32'"), process.platform !== 'win32')
  assert.equal(disabledTruthy('false'), false)
  assert.equal(disabledTruthy('0'), false)
  assert.equal(disabledTruthy('true'), true)
  assert.equal(disabledTruthy('!!js some.unknown.expression'), 'conditional')
})

test('S5 用户预设根不存在 → 跳过并写明，不是「都健康」', () => {
  const result = checkLivePresets({ userRoot: join(tmpdir(), 'no-such-root-live-presets'), profileBase: tmpdir() })
  assert.equal(result.passed, true)
  assert.equal(result.status, 'skip')
  assert.equal(result.skipped, true)
  assert.ok(result.note.includes('未核对任何预设'))
  assertConservation(result)
})

test('S6 根存在但 0 个预设目录 → fail-closed', () => {
  const root = makeRoot()
  const result = checkLivePresets({ userRoot: root, profileBase: root })
  assert.equal(result.passed, false)
  assert.equal(result.status, 'fail')
  assert.ok(result.note.includes('未核对任何行'))
  assertConservation(result)
})

test('包名解析与宿主 packageInstalled 同构：向上可达即真', () => {
  const base = makeRoot()
  writePkg(base, '@scope/installed')
  assert.equal(packageInstalled('@scope/installed', base), true)
  assert.equal(packageInstalled('@scope/installed/subpath.js', base), true)
  assert.equal(packageInstalled('@nope/missing', base), false)
  assert.equal(rowResolves('@scope/installed', base, base), true)
  assert.equal(rowResolves('cordis:group', base, base), true)
})

test('S7 块标量内容里的 name: 行不得被当成插件行（占位符检测仍说话）', () => {
  const root = makeRoot()
  writePreset(root, 'p5', [
    '- id: a\n',
    '  name: cordis:group\n',
    '  config:\n',
    '    section: |\n',
    '      name: this is prose inside a block scalar\n',
    '      __DSH_HOME__ is mentioned in prose too\n',
  ].join(''))
  const scan = scanAgentCordis(readPreset(root, 'p5'))
  assert.deepEqual(scan.rows.map((r) => r.name), ['cordis:group'])
  assert.equal(scan.placeholders.length, 1)
})

test('M1 恒真桩突变：只查占位符的退化实现必须放过 S2 的缺陷形状', () => {
  const root = makeRoot()
  writePreset(root, 'p2', "- id: x\n  name: '@nope/missing-pkg'\n")
  const real = checkLivePresets({ userRoot: root, profileBase: root })
  assert.equal(real.passed, false)
  // 退化实现：把行解析整段拿掉，只剩占位符扫描——它必须对 S2 恒绿，
  // 才能证明真实判据的红来自行解析这一半，而不是占位符那半。
  const degenerateCheck = () => ({ passed: true, violations: [], note: '只查了占位符' })
  assert.equal(degenerateCheck().passed, true)
})

test('QG2-1 裸包名与 nested group row 全部进入分母并 Green', () => {
  const root = makeRoot()
  writePkg(root, 'dsh-skill-subset')
  writePreset(root, 'nested', [
    '- id: group\n',
    '  name: cordis:group\n',
    '  group: true\n',
    '  config:\n',
    '    - id: bare\n',
    '      name: dsh-skill-subset\n',
  ].join(''))

  const result = checkLivePresets({ userRoot: root, profileBase: root })
  assert.equal(result.passed, true, result.violations.join('\n'))
  assert.deepEqual(result.metrics, { discovered: 2, checked: 2, disabled: 0, failed: 0 })
  assert.deepEqual(result.facts.rows.map((row) => row.rowPath), ['1', '1.1'])
  assert.equal(new Set(result.facts.rows.map((row) => row.stableId)).size, 2)
  assert.equal(result.facts.rows[1].kind, 'package')
  assertConservation(result)
})

test('QG2-2 unknown disabled expression 不得自动当 disabled', () => {
  const root = makeRoot()
  writePreset(root, 'conditional', [
    '- id: maybe\n',
    '  name: cordis:group\n',
    '  disabled: !!js some.unknown.expression\n',
  ].join(''))

  const result = checkLivePresets({ userRoot: root, profileBase: root })
  assert.equal(result.passed, false)
  assert.deepEqual(result.metrics, { discovered: 1, checked: 0, disabled: 0, failed: 1 })
  assert.match(result.violations.join('\n'), /无法判定|conditional|dynamic/i)
  assertConservation(result)
})

test('QG2-3 重复 row id 判红且每条 row 仍有唯一稳定身份', () => {
  const root = makeRoot()
  writePreset(root, 'duplicate', [
    '- id: same\n',
    '  name: cordis:group\n',
    '- id: same\n',
    '  name: cordis:group\n',
  ].join(''))

  const result = checkLivePresets({ userRoot: root, profileBase: root })
  assert.equal(result.passed, false)
  assert.deepEqual(result.metrics, { discovered: 2, checked: 0, disabled: 0, failed: 2 })
  assert.match(result.violations.join('\n'), /重复.*same/)
  assert.equal(new Set(result.facts.rows.map((row) => row.stableId)).size, 2)
  assertConservation(result)
})

test('QG2-4 错误缩进判红，不得把脱离 row 的 name 当有效行', () => {
  const root = makeRoot()
  writePreset(root, 'bad-indent', [
    '- id: x\n',
    "name: 'cordis:group'\n",
  ].join(''))

  const result = checkLivePresets({ userRoot: root, profileBase: root })
  assert.equal(result.passed, false)
  assert.match(result.violations.join('\n'), /缩进|顶层|name/)
  assertConservation(result)
})

test('QG2-5 preset 目录缺 agent.cordis.yml 判红', () => {
  const root = makeRoot()
  mkdirSync(join(root, 'missing-file'))

  const result = checkLivePresets({ userRoot: root, profileBase: root })
  assert.equal(result.passed, false)
  assert.match(result.violations.join('\n'), /missing-file.*agent\.cordis\.yml.*缺失/)
  assertConservation(result)
})

test('QG2-6 普通 config 和 block scalar 里的 name 不是 row', () => {
  const scan = scanAgentCordis([
    '- id: plugin\n',
    '  name: cordis:group\n',
    '  config:\n',
    '    name: not-a-row\n',
    '    prose: |\n',
    '      name: also-not-a-row\n',
  ].join(''))

  assert.deepEqual(scan.rows.map((row) => row.name), ['cordis:group'])
  assert.deepEqual(scan.problems, [])
})

test('QG2-7 已知 win32 表达式保留宿主真值并统计守恒', () => {
  const root = makeRoot()
  writePreset(root, 'platform', [
    '- id: platform\n',
    '  name: cordis:group\n',
    "  disabled: !!js process.platform !== 'win32'\n",
  ].join(''))

  const result = checkLivePresets({ userRoot: root, profileBase: root })
  const expectedDisabled = process.platform !== 'win32' ? 1 : 0
  assert.deepEqual(result.metrics, {
    discovered: 1,
    checked: expectedDisabled === 1 ? 0 : 1,
    disabled: expectedDisabled,
    failed: 0,
  })
  assert.equal(result.passed, true, result.violations.join('\n'))
  assertConservation(result)
})

test('QG2-8 scoped/bare/relative/absolute/file:/cordis: 六种 specifier 都进入 checked', () => {
  const root = makeRoot()
  writePkg(root, '@scope/installed')
  writePkg(root, 'bare-installed')
  const presetDir = writePreset(root, 'all-specifiers', '')
  const local = join(presetDir, 'local.mjs')
  writeFileSync(local, 'export function apply() {}\n')
  writeFileSync(join(presetDir, 'agent.cordis.yml'), [
    '- id: builtin\n  name: cordis:group\n',
    "- id: scoped\n  name: '@scope/installed/subpath.js'\n",
    '- id: bare\n  name: bare-installed\n',
    '- id: relative\n  name: ./local.mjs\n',
    `- id: absolute\n  name: '${local}'\n`,
    `- id: file-url\n  name: '${pathToFileURL(local).href}'\n`,
  ].join(''))

  const result = checkLivePresets({ userRoot: root, profileBase: root })
  assert.equal(result.passed, true, result.violations.join('\n'))
  assert.deepEqual(result.metrics, { discovered: 6, checked: 6, disabled: 0, failed: 0 })
  assert.deepEqual(new Set(result.facts.rows.map((row) => row.kind)), new Set(['builtin', 'package', 'preset', 'file']))
  assertConservation(result)
})

test('QG2-9 preset 文件存在但 0 rows 判红', () => {
  const root = makeRoot()
  writePreset(root, 'empty', '[]\n')

  const result = checkLivePresets({ userRoot: root, profileBase: root })
  assert.equal(result.passed, false)
  assert.match(result.violations.join('\n'), /0 射程|未发现任何插件 row/)
  assert.deepEqual(result.metrics, { discovered: 0, checked: 0, disabled: 0, failed: 0 })
  assertConservation(result)
})

test('QG2-10 group disabled 会按宿主语义传给 nested rows', () => {
  const root = makeRoot()
  writePreset(root, 'disabled-group', [
    '- id: group\n',
    '  name: cordis:group\n',
    '  group: true\n',
    '  disabled: true\n',
    '  config:\n',
    '    - id: child\n',
    '      name: definitely-not-installed\n',
  ].join(''))

  const result = checkLivePresets({ userRoot: root, profileBase: root })
  assert.equal(result.passed, true, result.violations.join('\n'))
  assert.deepEqual(result.metrics, { discovered: 2, checked: 0, disabled: 2, failed: 0 })
  assertConservation(result)
})

test('QG2-11 inventory 固定分母：删除一条裸包即使剩余行都可解析也必须判红', () => {
  const root = makeRoot()
  writePkg(root, 'dsh-skill-subset')
  writePreset(root, 'inventory-delete', [
    '- id: builtin\n  name: cordis:group\n',
    '- id: bare\n  name: dsh-skill-subset\n',
  ].join(''))
  const baseline = checkLivePresets({ userRoot: root, profileBase: root })
  const inventory = buildLivePresetInventory(baseline)
  assert.deepEqual(compareLivePresetInventory(baseline, inventory), [])

  writePreset(root, 'inventory-delete', '- id: builtin\n  name: cordis:group\n')
  const mutated = checkLivePresets({ userRoot: root, profileBase: root })
  assert.equal(mutated.status, 'pass', '语义检查本身应全绿，证明失败来自 inventory 分母')
  assert.match(compareLivePresetInventory(mutated, inventory).join('\n'), /分母漂移|inventory-delete.*漂移/)
})

test('QG2-12 inventory 固定身份：把裸包替换成另一个可解析包仍必须判红', () => {
  const root = makeRoot()
  writePkg(root, 'bare-one')
  writePkg(root, 'bare-two')
  writePreset(root, 'inventory-replace', '- id: bare\n  name: bare-one\n')
  const baseline = checkLivePresets({ userRoot: root, profileBase: root })
  const inventory = buildLivePresetInventory(baseline)
  const inventoryPath = join(root, 'expected.json')
  writeFileSync(inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`)

  writePreset(root, 'inventory-replace', '- id: bare\n  name: bare-two\n')
  const mutated = checkLivePresets({ userRoot: root, profileBase: root })
  assert.equal(mutated.status, 'pass', '替换目标也可解析，不能靠 resolver 偶然判红')
  const result = checkLivePresetsAgainstInventory({ userRoot: root, profileBase: root, inventoryPath })
  assert.equal(result.status, 'fail')
  assert.match(result.violations.join('\n'), /inventory-replace.*漂移/)
})

test('QG2-13 必备 inventory 缺失或损坏必须 fail-closed', () => {
  const root = makeRoot()
  writePreset(root, 'inventory-required', '- id: builtin\n  name: cordis:group\n')

  const missing = checkLivePresetsAgainstInventory({
    userRoot: root,
    profileBase: root,
    inventoryPath: join(root, 'missing.json'),
  })
  assert.equal(missing.status, 'fail')
  assert.match(missing.violations.join('\n'), /必备.*inventory.*无法读取/)

  const malformedPath = join(root, 'malformed.json')
  writeFileSync(malformedPath, '{"schemaVersion":1,"presets":[]}\n')
  const malformed = checkLivePresetsAgainstInventory({ userRoot: root, profileBase: root, inventoryPath: malformedPath })
  assert.equal(malformed.status, 'fail')
  assert.match(malformed.violations.join('\n'), /identity|presetCount|rowCount/)
})

test('QG2-14 canonical 映射把 disabled row 记为 typed skip 且保持守恒', () => {
  const root = makeRoot()
  writePreset(root, 'canonical', [
    '- id: enabled\n  name: cordis:group\n',
    '- id: disabled\n  name: missing-but-disabled\n  disabled: true\n',
  ].join(''))
  const legacy = checkLivePresets({ userRoot: root, profileBase: root })
  const canonical = toCanonicalLivePresetResult(legacy)

  assert.equal(canonical.status, 'skip')
  assert.equal(canonical.skipped, 1)
  assert.equal(canonical.typedSkips[0].type, 'disabled-preset-row')
  assert.deepEqual(validateGateResult(canonical), { valid: true, errors: [] })
})
