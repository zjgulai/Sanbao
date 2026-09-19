/**
 * brand-avatars-pin 门禁的反向自测（工单 004，R8）。
 *
 * 本项必须能说「不」：
 * - 篡改任一入仓资产一个字节 → 红，且点名资产路径（P-02/P-03：突变不红 = 拦住
 *   缺陷的不是判据本身）；
 * - 资产文件缺失 → 红，不得静默跳过；
 * - pin 的 sha256 段为空 → 红（恒绿判据不予合入，P-15 同族）；
 * - 真实仓库 → 绿（当前资产与 pin 一致）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkBrandAvatarsPin } from './brand-avatars-pin.mjs'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(scriptDir, '..', '..')

/** pin 与资产在 tmp 根下的完整拷贝，供突变用例使用。 */
function makeFixture() {
  const root = mkdtempSync(join(tmpdir(), 'brand-avatars-pin-'))
  mkdirSync(join(root, 'brand', 'avatars'), { recursive: true })
  const pin = readFileSync(join(repoRoot, 'vendor', 'worldpilot.pin'), 'utf8')
  const assetRel = 'brand/avatars/assets/dark/48/AGT-001.webp'
  mkdirSync(join(root, 'brand', 'avatars', 'assets', 'dark', '48'), { recursive: true })
  writeFileSync(
    join(root, 'brand', 'avatars', 'assets', 'dark', '48', 'AGT-001.webp'),
    readFileSync(join(repoRoot, assetRel)),
  )
  return { root, pin, assetRel }
}

test('真实仓库：入仓资产与 pin 逐档一致', () => {
  const result = checkBrandAvatarsPin({ repoRoot })
  assert.deepEqual(result.violations, [])
  assert.ok(result.checked > 0, '必须真的校了资产（空转即恒绿，P-15）')
})

test('突变：资产改一个字节 → 红，且点名资产路径', () => {
  const { root, pin, assetRel } = makeFixture()
  const bytes = readFileSync(join(root, assetRel))
  bytes[0] = bytes[0] ^ 0xff
  writeFileSync(join(root, assetRel), bytes)

  const result = checkBrandAvatarsPin({ repoRoot: root, pinText: pin })
  assert.equal(result.passed, false, '篡改必须判红')
  const joined = result.violations.join('\n')
  assert.ok(joined.includes(assetRel), `要点名资产路径：${joined}`)
})

test('资产缺失 → 红，不得静默跳过', () => {
  const { root, pin, assetRel } = makeFixture()
  unlinkSync(join(root, assetRel))

  const result = checkBrandAvatarsPin({ repoRoot: root, pinText: pin })
  assert.equal(result.passed, false)
  assert.ok(result.violations.join('\n').includes(assetRel))
})

test('pin 的 sha256 段为空 → 红（恒绿判据不予合入）', () => {
  const { root, pin } = makeFixture()
  const emptied = pin.replace(/sha256:\n[\s\S]*$/, 'sha256:\n')
  const result = checkBrandAvatarsPin({ repoRoot: root, pinText: emptied })
  assert.equal(result.passed, false)
  assert.ok(result.violations.join('\n').includes('sha256'))
})
