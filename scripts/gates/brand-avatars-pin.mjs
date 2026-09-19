/**
 * 门禁校验项：brand/avatars 入仓资产与 vendor/worldpilot.pin 逐档 sha256 比对
 * （工单 004，S3 头像管线 R8：入仓后与素材源分叉即构建期拦截）。
 *
 * pin 是字节事实之家：上游出处（upstream-*）与逐档 sha256 都在 pin 里，本判据
 * 只做「盘上字节 == pin 声明」的重算，不访问网络。同步形态（runGateChecks
 * 同步调用 run()，见 brand-derivatives-sync 的同类事故记录）。
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export const PIN_PATH = 'vendor/worldpilot.pin'

/** 解析 pin 的 sha256 段：每行「仓库相对路径 sha256」。 */
export function parsePinEntries(pinText) {
  const lines = pinText.split('\n')
  const start = lines.findIndex((line) => line.trim() === 'sha256:')
  if (start === -1) return null
  const entries = []
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === '') continue
    const parts = line.trim().split(/\s+/)
    if (parts.length !== 2) return null
    entries.push({ path: parts[0], sha256: parts[1] })
  }
  return entries
}

/**
 * @param {{repoRoot: string, pinText?: string}} options
 *   pinText 供自测注入突变 fixture；缺省读真实 pin。
 * @returns {{passed: boolean, violations: string[], checked: number}}
 */
export function checkBrandAvatarsPin({ repoRoot, pinText }) {
  let pin = pinText
  if (pin === undefined) {
    try {
      pin = readFileSync(join(repoRoot, PIN_PATH), 'utf8')
    } catch {
      return { passed: false, violations: [`brand-avatars-pin: 找不到 ${PIN_PATH}`], checked: 0 }
    }
  }
  const entries = parsePinEntries(pin)
  if (entries === null) {
    return { passed: false, violations: [`brand-avatars-pin: ${PIN_PATH} 缺 sha256: 段或行格式损坏（每行须是「路径 sha256」）`], checked: 0 }
  }
  if (entries.length === 0) {
    return { passed: false, violations: [`brand-avatars-pin: ${PIN_PATH} 的 sha256 段是空的——恒绿判据不予合入（P-15 同族），入仓资产必须逐档登记`], checked: 0 }
  }
  const violations = []
  let checked = 0
  for (const { path, sha256 } of entries) {
    checked += 1
    let bytes
    try {
      bytes = readFileSync(join(repoRoot, path))
    } catch {
      violations.push(`brand-avatars-pin: 资产缺失 ${path}（pin 已登记——先回 pin 核对，或从 upstream 重采并 bump pin）`)
      continue
    }
    const actual = createHash('sha256').update(bytes).digest('hex')
    if (actual !== sha256) {
      violations.push(
        `brand-avatars-pin: ${path} 字节与 pin 不一致（盘上 ${actual.slice(0, 12)}… ≠ pin ${sha256.slice(0, 12)}…）`
          + '——资产被手改或重采未 bump pin；禁止为了让门禁变绿而回填 pin 哈希',
      )
    }
  }
  return { passed: violations.length === 0, violations, checked }
}
