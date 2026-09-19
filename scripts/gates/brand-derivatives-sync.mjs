/**
 * 门禁校验项：品牌派生物与名源不一致即判红（工单 003，S-G 登记）。
 *
 * 判据本体在 scripts/lib/brand-derivatives.mjs（清单 + 重算），本文件只做
 * gate.mjs 的入口薄壳——保持「判据可被自测直接 import」与仓库既有形态一致。
 *
 * gate.mjs 的 runGateChecks 同步调用 run()、不 await Promise，所以名源在模块
 * 顶层预载（.mjs 顶层 await 静态可达）；加载失败按判红处置，不允许静默绿。
 */
import { checkDerivativesSync, loadBrandSource } from '../lib/brand-derivatives.mjs'

let brand = null
let loadError = null
try {
  brand = await loadBrandSource()
} catch (error) {
  loadError = error
}

export function checkBrandDerivatives({ repoRoot }) {
  if (loadError !== null) {
    return { passed: false, violations: [`brand-derivatives-sync: 名源加载失败——${loadError.message}`] }
  }
  return checkDerivativesSync(repoRoot, brand)
}
