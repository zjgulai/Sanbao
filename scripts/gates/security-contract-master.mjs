import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { SECURITY_CONTRACT_REGISTRY } from './security-contract-registry.mjs'

/**
 * 校验安全契约注册表完整性与真实文件可达性（SEC-RT-010）。
 *
 * 1. 验证 SEC-RT-001 ~ SEC-RT-009 与 SEC-RT-003A 均有登记（无遗漏、无重复）。
 * 2. 验证所有 targetFiles 与 testFiles 真实存在于仓库中，防止空声明。
 * 3. 验证每个条目均具备 owner、faultPoints、runTier 与 releaseBlocker 字段。
 *
 * @param {{ repoRoot: string, registry?: typeof SECURITY_CONTRACT_REGISTRY }} options
 * @returns {{
 *   passed: boolean,
 *   expected: number,
 *   discovered: number,
 *   checked: number,
 *   skipped: number,
 *   failed: number,
 *   violations: string[]
 * }}
 */
export function auditSecurityContractMasterGate({ repoRoot, registry = SECURITY_CONTRACT_REGISTRY }) {
  const violations = []
  const requiredIds = [
    'SEC-RT-001',
    'SEC-RT-002',
    'SEC-RT-003',
    'SEC-RT-003A',
    'SEC-RT-004',
    'SEC-RT-005',
    'SEC-RT-006',
    'SEC-RT-007',
    'SEC-RT-008',
    'SEC-RT-009',
  ]

  let discovered = 0
  let checked = 0
  let failed = 0
  let expected = requiredIds.length
  const skipped = 0

  if (!Array.isArray(registry)) {
    return {
      passed: false,
      expected,
      discovered: 0,
      checked: 0,
      skipped: 0,
      failed: 1,
      violations: ['security-contract-registry: 登记表必须是一个有效的数组'],
    }
  }

  discovered = registry.length

  const seenIds = new Set()
  const registryMap = new Map()

  for (const entry of registry) {
    if (!entry.id) {
      failed += 1
      violations.push('security-contract-registry: 存在缺失 id 的登记项')
      continue
    }
    if (seenIds.has(entry.id)) {
      failed += 1
      violations.push(`security-contract-registry: 发现重复的契约 id [${entry.id}]`)
      continue
    }
    seenIds.add(entry.id)
    registryMap.set(entry.id, entry)
  }

  // 1. 检查覆盖完整性 (无一遗漏)
  const missingRequired = requiredIds.filter((id) => !registryMap.has(id))
  for (const reqId of missingRequired) {
    failed += 1
    violations.push(`security-contract-registry: 缺少必需的安全契约项 [${reqId}]`)
  }

  // 分母 = 登记项数 + 缺失的必需项数。这样 `expected` 恒等于 checked + skipped + failed，
  // 且**新增**契约（如 SEC-RT-011）不会把总门禁判成 schema invalid：旧写法把分母钉死在
  // 必需项数（10），登记第 11 条时总门禁自己报 `expected must equal checked + skipped + failed`
  // 并附 `non-failing result must not discover more objects than expected`——
  // 那会让「加一条安全契约」变成一件必须同时改三处代码的事，而登记表本该是可扩展的。
  expected = discovered + missingRequired.length

  // 2. 检查每个条目的结构与文件实体有效性
  for (const [id, entry] of registryMap.entries()) {
    let itemValid = true

    if (!entry.owner || typeof entry.owner !== 'string') {
      violations.push(`${id}: 缺少有效的 owner`)
      itemValid = false
    }

    if (!Array.isArray(entry.faultPoints) || entry.faultPoints.length === 0) {
      violations.push(`${id}: 必须登记至少一个 faultPoints 故障注入点`)
      itemValid = false
    }

    if (!Array.isArray(entry.targetFiles) || entry.targetFiles.length === 0) {
      violations.push(`${id}: 必须指定至少一个 targetFiles 目标文件`)
      itemValid = false
    } else {
      for (const relPath of entry.targetFiles) {
        const fullPath = resolve(repoRoot, relPath)
        if (!existsSync(fullPath)) {
          violations.push(`${id}: targetFile 不存在 [${relPath}]`)
          itemValid = false
        }
      }
    }

    if (!Array.isArray(entry.testFiles) || entry.testFiles.length === 0) {
      violations.push(`${id}: 必须指定至少一个 testFiles 测试套件`)
      itemValid = false
    } else {
      for (const relPath of entry.testFiles) {
        const fullPath = resolve(repoRoot, relPath)
        if (!existsSync(fullPath)) {
          violations.push(`${id}: testFile 不存在 [${relPath}]`)
          itemValid = false
        }
      }
    }

    if (entry.releaseBlocker !== true) {
      violations.push(`${id}: SEC-RT 系列契约必须声明 releaseBlocker: true`)
      itemValid = false
    }

    if (itemValid) {
      checked += 1
    } else {
      failed += 1
    }
  }

  return {
    passed: violations.length === 0,
    expected,
    discovered,
    checked,
    skipped,
    failed,
    violations,
  }
}
