#!/usr/bin/env node
/**
 * 品牌派生物生成 CLI（工单 003，ADR-0136 D2）。
 *
 * 用法：
 *   node scripts/generate-brand-derivatives.mjs            校验（默认；有漂移则退出码 1）
 *   node scripts/generate-brand-derivatives.mjs --write    把派生物重写成与名源一致（tmp+mv 语义，保住 file: 硬链接）
 *   node scripts/generate-brand-derivatives.mjs --list     只列出派生物清单
 *
 * 退出码即契约：0 = 一致；1 = 有漂移或名源读不到；2 = 用法错误。
 * 改名 = 改 shared/client/sanbao-brand-source.ts 后跑本命令 --write，不碰第二处。
 */
import { readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  BRAND_SOURCE_DISPLAY,
  DERIVATIVES,
  checkDerivatives,
  computeExpectedForDerivative,
  countMatches,
  loadBrandSource,
  writeDerivativeFile,
} from './lib/brand-derivatives.mjs'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const known = new Set(['--write', '--list'])
const unknown = args.filter((a) => !known.has(a))
if (unknown.length > 0) {
  console.error(`generate-brand-derivatives: 未知参数 ${unknown.join(' ')}`)
  process.exit(2)
}
const write = args.includes('--write')
const listOnly = args.includes('--list')

if (listOnly) {
  for (const d of DERIVATIVES) {
    console.log(`${d.id}  ${d.file}  <-  ${BRAND_SOURCE_DISPLAY}.${d.sourceField}  ${d.description}`)
  }
  console.log(`\n共 ${DERIVATIVES.length} 个派生物。`)
  process.exit(0)
}

const brand = await loadBrandSource()

if (write) {
  let rewritten = 0
  for (const d of DERIVATIVES) {
    const abs = join(repoRoot, d.file)
    const text = readFileSync(abs, 'utf8')
    const matches = countMatches(text, d)
    if (matches === 0) {
      console.error(`[FAIL] ${d.id}: ${d.file} 找不到锚点（空扫描面，P-15）——先核对清单 pattern`)
      process.exit(1)
    }
    const expected = computeExpectedForDerivative(text, d, brand)
    if (expected === text) {
      console.log(`[ok] ${d.file}（${d.id}，${matches} 处已一致）`)
      continue
    }
    writeDerivativeFile(abs, expected)
    rewritten += 1
    console.log(`[written] ${relative(repoRoot, abs)}  <-  ${BRAND_SOURCE_DISPLAY}.${d.sourceField}（${matches} 处）`)
  }
  const after = await checkDerivatives(repoRoot)
  if (!after.passed) {
    for (const v of after.violations) console.error(`[FAIL] ${v}`)
    process.exit(1)
  }
  console.log(`generate-brand-derivatives: 重写 ${rewritten} 个派生物；${after.checked} 个全部与名源一致。`)
  process.exit(0)
}

const result = await checkDerivatives(repoRoot)
for (const v of result.violations) console.error(`[DRIFT] ${v}`)
if (result.violations.length > 0) {
  console.error(`\ngenerate-brand-derivatives: ${result.violations.length} 处不一致。跑 node scripts/generate-brand-derivatives.mjs --write 从名源重算。`)
  process.exit(1)
}
console.log(`generate-brand-derivatives: ${result.checked} 个派生物全部与名源一致。`)
