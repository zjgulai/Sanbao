/**
 * 品牌派生物清单与重算（工单 003，ADR-0136 D2：改名 = 改一个源 + 重跑生成）。
 *
 * 名源是 `shared/client/sanbao-brand-source.ts`（S-A，唯一可编辑面）；本模块
 * 声明每个派生物「落在哪个文件的哪些锚点上、由哪个源字段生成」，并能把任意
 * 文本重算成与当前名源一致的期望内容。三个消费方共用这一份定义：
 * - `scripts/generate-brand-derivatives.mjs`（生成 CLI：--check / --write）
 * - `scripts/gates/brand-derivatives-sync.mjs`（一致性门禁）
 * - `scripts/gates/brand-derivatives-sync.test.mjs`（反向自测，突变必须红）
 *
 * 名源是 TS 模块，用 node 原生类型剥离直接 import（node ≥24 默认开启；
 * 22.19 的默认关闭，会在 import 时响亮失败——见下方 catch 的 remediation）。
 */
import { chmodSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const BRAND_SOURCE_DISPLAY = 'shared/client/sanbao-brand-source.ts'

let brandSourceCache = null
export async function loadBrandSource() {
  if (brandSourceCache !== null) return brandSourceCache
  try {
    const mod = await import('../../shared/client/sanbao-brand-source.ts')
    brandSourceCache = mod.SANBAO_BRAND_SOURCE
  } catch (error) {
    throw new Error(
      `无法从 ${BRAND_SOURCE_DISPLAY} 读取品牌名源（node ≥24 才默认支持 import .ts）：${error.message}`,
    )
  }
  return brandSourceCache
}

/**
 * 派生物清单。pattern 只匹配「由名源生成的那个字面量」——替换锚（如旧名
 * DeepSeek Harness）不属于派生物，必须留在 pattern 之外。
 */
export const DERIVATIVES = [
  {
    id: 'index-html-title',
    description: 'index.html 窗口标题（brand-replay.sh 的校验行与替换行，S06）',
    sourceField: 'nameLatin',
    file: 'dsh-patches/brand-replay.sh',
    // 排除替换锚里的旧名 <title>DeepSeek Harness</title>：那是「被替换者」，不归名源管。
    pattern: /(['"])<title>(?!DeepSeek Harness<\/title>)[^<]*<\/title>\1/g,
    render: (brand) => `<title>${brand.nameLatin}</title>`,
  },
]

/** 单个派生物的期望文本：把 pattern 命中的字面量重写成当前名源的值。 */
export function computeExpectedForDerivative(text, derivative, brand) {
  return text.replace(derivative.pattern, (match, quote) => quote + derivative.render(brand) + quote)
}

/** pattern 在文本里的命中数（重写前先量，空扫描面要响亮失败，P-15）。 */
export function countMatches(text, derivative) {
  return [...text.matchAll(derivative.pattern)].length
}

/**
 * 把重算后的期望内容落盘（tmp+mv 语义，保住 file: 硬链接与仓库红线）。
 * rename 会把 tmp 的默认 mode 带过去，抹掉原文件的可执行位（brand-replay.sh
 * 实测 100755→100644）——tmp+mv 后必须回填原 mode。
 */
export function writeDerivativeFile(abs, expected) {
  const tmp = abs + '.brandgen.tmp'
  writeFileSync(tmp, expected)
  chmodSync(tmp, statSync(abs).mode)
  renameSync(tmp, abs)
}

/**
 * 把文本按整份清单重算成期望内容（全部派生物依次应用）。
 * 单参调用（只给 text）即按当前名源重算；brand 缺省时自动加载名源。
 */
export async function computeExpected(text, derivatives = DERIVATIVES, brand = null) {
  if (brand === null) brand = await loadBrandSource()
  let out = text
  for (const d of derivatives) out = computeExpectedForDerivative(out, d, brand)
  return out
}

/**
 * 校验一个仓库根下的全部派生物（brand 已就绪的同步版本）。
 * gate.mjs 的 runGateChecks 同步调用 run()、不 await Promise——异步判据必须
 * 走「预载 brand + 同步执行」的形态，否则 Promise 会被 normalize 成 fail-close
 * 的 schema 错（实际事故：2026-09-19 gate 报 legacy violations 不是数组）。
 * @returns {{passed: boolean, violations: string[], checked: number}}
 */
export function checkDerivativesSync(repoRoot, brand) {
  const violations = []
  let checked = 0
  for (const d of DERIVATIVES) {
    checked += 1
    const abs = join(repoRoot, d.file)
    let text
    try {
      text = readFileSync(abs, 'utf8')
    } catch {
      violations.push(`${d.id}: 派生物缺失 ${d.file}（名源 ${BRAND_SOURCE_DISPLAY}.${d.sourceField}）`)
      continue
    }
    const matches = countMatches(text, d)
    if (matches === 0) {
      violations.push(
        `${d.id}: ${d.file} 里找不到 ${d.description} 的锚点（空扫描面，P-15）——锚点被移走时先回本清单核对 pattern；名源 ${BRAND_SOURCE_DISPLAY}.${d.sourceField}`,
      )
      continue
    }
    const expected = computeExpectedForDerivative(text, d, brand)
    if (expected !== text) {
      violations.push(
        `${d.id}: ${d.file} 的「${d.description}」与名源 ${BRAND_SOURCE_DISPLAY}.${d.sourceField} 不一致（当前应为「${d.render(brand)}」，共 ${matches} 处）——名源是唯一可编辑面，跑 node scripts/generate-brand-derivatives.mjs --write`,
      )
    }
  }
  return { passed: violations.length === 0, violations, checked }
}

/** 异步便捷版：自测与 CLI 用（自行加载名源）。gate 走 checkDerivativesSync。 */
export async function checkDerivatives(repoRoot) {
  return checkDerivativesSync(repoRoot, await loadBrandSource())
}
