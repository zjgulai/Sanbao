import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { auditSecurityContractMasterGate } from './security-contract-master.mjs'
import { SECURITY_CONTRACT_REGISTRY } from './security-contract-registry.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..', '..')

test('auditSecurityContractMasterGate: 完整且合法的登记表顺利通过', () => {
  const result = auditSecurityContractMasterGate({
    repoRoot: REPO_ROOT,
    registry: SECURITY_CONTRACT_REGISTRY,
  })

  assert.equal(result.passed, true, `安全契约总门禁应通过，但出现违规: ${result.violations.join('; ')}`)
  assert.equal(result.failed, 0)
  assert.equal(result.violations.length, 0)
  // 分母必须跟着登记表走。写死 10 会让「新增一条契约」本身变成总门禁判 schema invalid 的
  // 原因——2026-09-18 加 SEC-RT-011 时实测到：expected=10 而 checked=11。
  // 必需项下限由 requiredIds 保证，缺项由下面的突变自测守着。
  assert.equal(result.expected, SECURITY_CONTRACT_REGISTRY.length)
  assert.equal(result.checked, SECURITY_CONTRACT_REGISTRY.length)
  assert.ok(result.expected >= 10, '必需契约至少 10 条：SEC-RT-001~009 + 003A')
})

test('auditSecurityContractMasterGate 突变自测: 缺失必需契约项必须判红', () => {
  const pruned = SECURITY_CONTRACT_REGISTRY.filter((e) => e.id !== 'SEC-RT-001')
  const result = auditSecurityContractMasterGate({
    repoRoot: REPO_ROOT,
    registry: pruned,
  })

  assert.equal(result.passed, false)
  assert.ok(result.violations.some((v) => v.includes('缺少必需的安全契约项 [SEC-RT-001]')))
})

test('auditSecurityContractMasterGate 突变自测: 虚假/不存在的目标源文件必须判红', () => {
  const mutated = SECURITY_CONTRACT_REGISTRY.map((e) => {
    if (e.id === 'SEC-RT-002') {
      return { ...e, targetFiles: [...e.targetFiles, 'non/existent/bogus-file.js'] }
    }
    return e
  })
  const result = auditSecurityContractMasterGate({
    repoRoot: REPO_ROOT,
    registry: mutated,
  })

  assert.equal(result.passed, false)
  assert.ok(result.violations.some((v) => v.includes('targetFile 不存在 [non/existent/bogus-file.js]')))
})

test('auditSecurityContractMasterGate 突变自测: 虚假/不存在的测试文件必须判红', () => {
  const mutated = SECURITY_CONTRACT_REGISTRY.map((e) => {
    if (e.id === 'SEC-RT-004') {
      return { ...e, testFiles: ['non/existent/bogus-test.spec.mjs'] }
    }
    return e
  })
  const result = auditSecurityContractMasterGate({
    repoRoot: REPO_ROOT,
    registry: mutated,
  })

  assert.equal(result.passed, false)
  assert.ok(result.violations.some((v) => v.includes('testFile 不存在 [non/existent/bogus-test.spec.mjs]')))
})

test('auditSecurityContractMasterGate 突变自测: 缺少故障注入点必须判红', () => {
  const mutated = SECURITY_CONTRACT_REGISTRY.map((e) => {
    if (e.id === 'SEC-RT-005') {
      return { ...e, faultPoints: [] }
    }
    return e
  })
  const result = auditSecurityContractMasterGate({
    repoRoot: REPO_ROOT,
    registry: mutated,
  })

  assert.equal(result.passed, false)
  assert.ok(result.violations.some((v) => v.includes('必须登记至少一个 faultPoints 故障注入点')))
})

test('auditSecurityContractMasterGate 突变自测: 未标记为 releaseBlocker 必须判红', () => {
  const mutated = SECURITY_CONTRACT_REGISTRY.map((e) => {
    if (e.id === 'SEC-RT-009') {
      return { ...e, releaseBlocker: false }
    }
    return e
  })
  const result = auditSecurityContractMasterGate({
    repoRoot: REPO_ROOT,
    registry: mutated,
  })

  assert.equal(result.passed, false)
  assert.ok(result.violations.some((v) => v.includes('SEC-RT 系列契约必须声明 releaseBlocker: true')))
})
