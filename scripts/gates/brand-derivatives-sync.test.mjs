/**
 * 品牌派生物一致性判据的反向自测（工单 003，ADR-0136 D2）。
 *
 * 本项必须能说「不」：
 * - 派生物被手改一个字符 → 红，且 violation 同时点名派生物文件与名源路径；
 * - 锚点行被删光（空扫描面）→ 红，不得静默绿（P-15）；
 * - 突变后 --write 回路 → 回到绿（生成路径真的能修，而不是只会报红）；
 * - 真实仓库 → 绿（当前派生物与名源一致）。
 * 突变不红，说明拦住缺陷的不是判据本身（P-02 / P-03）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DERIVATIVES, computeExpected, writeDerivativeFile } from '../lib/brand-derivatives.mjs'
import { checkBrandDerivatives } from './brand-derivatives-sync.mjs'
import { SANBAO_BRAND_SOURCE } from '../../shared/client/sanbao-brand-source.ts'

const currentTitle = `<title>${SANBAO_BRAND_SOURCE.nameLatin}</title>`
const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(scriptDir, '..', '..')

/** 派生物文件在 tmp 根下的完整拷贝，供突变用例使用。 */
function makeFixture() {
  const root = mkdtempSync(join(tmpdir(), 'brand-derivatives-'))
  mkdirSync(join(root, 'dsh-patches'), { recursive: true })
  const file = join(root, 'dsh-patches', 'brand-replay.sh')
  writeFileSync(file, readFileSync(join(repoRoot, 'dsh-patches', 'brand-replay.sh'), 'utf8'))
  writeFileSync(join(root, 'dsh-patches', 'brand-payload-wordmark.txt'), readFileSync(join(repoRoot, 'dsh-patches', 'brand-payload-wordmark.txt')))
  return { root, file }
}

test('清单不是空的，且每个派生物声明了源字段与落点', () => {
  assert.ok(DERIVATIVES.length >= 1)
  for (const d of DERIVATIVES) {
    assert.equal(typeof d.id, 'string')
    assert.equal(typeof d.sourceField, 'string')
    assert.equal(typeof d.file, 'string')
    assert.ok(d.pattern instanceof RegExp)
    assert.ok(d.pattern.global, 'pattern 必须是全局的，否则重写只落到第一处')
  }
})

test('真实仓库：派生物与名源一致', async () => {
  const result = await checkBrandDerivatives({ repoRoot })
  assert.deepEqual(result.violations, [])
})

test('突变：派生物手改一个字符 → 红，且同时点名派生物与名源两处路径', async () => {
  const { root, file } = makeFixture()
  const tampered = readFileSync(file, 'utf8').replace(currentTitle, '<title>WrongBrand</title>')
  assert.notEqual(tampered, readFileSync(file, 'utf8'), '突变必须真的发生')
  writeFileSync(file, tampered)

  const result = await checkBrandDerivatives({ repoRoot: root })
  assert.equal(result.passed, false, '突变必须判红')
  const joined = result.violations.join('\n')
  assert.ok(joined.includes('dsh-patches/brand-replay.sh'), `要点名派生物路径：${joined}`)
  assert.ok(joined.includes('sanbao-brand-source.ts'), `要点名名源路径：${joined}`)
  assert.ok(joined.includes('nameLatin'), `要点名源字段：${joined}`)
})

test('空射程：锚点行删光 → 红（不得静默绿，P-15）', async () => {
  const { root, file } = makeFixture()
  const emptied = readFileSync(file, 'utf8').replaceAll(currentTitle, '')
  writeFileSync(file, emptied)

  const result = await checkBrandDerivatives({ repoRoot: root })
  assert.equal(result.passed, false, '空扫描面必须判红')
  assert.ok(result.violations.join('\n').includes('空扫描面'))
})

test('write 回路：突变后按期望值重写 → 回到绿，且原文件 mode 不被抹掉', async () => {
  const { root, file } = makeFixture()
  chmodSync(file, 0o755)
  const tampered = readFileSync(file, 'utf8').replace(currentTitle, '<title>WrongBrand</title>')
  writeFileSync(file, tampered)
  assert.equal((await checkBrandDerivatives({ repoRoot: root })).passed, false)

  writeDerivativeFile(file, await computeExpected(tampered))
  assert.equal((await checkBrandDerivatives({ repoRoot: root })).passed, true, '生成回路必须能真的修复')
  assert.equal(statSync(file).mode & 0o777, 0o755, 'tmp+mv 必须回填原 mode（brand-replay.sh 是可执行脚本）')
})
