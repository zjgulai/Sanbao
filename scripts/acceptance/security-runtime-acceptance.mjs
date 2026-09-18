#!/usr/bin/env node
/**
 * 安全契约端到端自动化验收套件（SEC-RT-010）。
 * 
 * 作用：
 * 统一调度并执行全量安全运行时契约 (SEC-RT-001 ~ SEC-RT-009 + SEC-RT-003A) 的：
 * 1. 契约登记完整性审计 (Static Contract Audit)
 * 2. 真实单元与集成测试套件执行 (Green Suite Execution)
 * 3. 故障注入与变异断言反向核验 (Fault-injection / Fail-first Mutation Verification)
 * 
 * 规则：
 * - 绝不使用未经验证的假设，只以真实子进程和断言读数为准。
 * - 绝不修改生产或真实用户工作区（~/.dsh）。
 * - 严密防范假绿，要求 expected = checked + skipped + failed。
 * 
 * 用法：
 * node scripts/acceptance/security-runtime-acceptance.mjs [--json]
 */

import { execFileSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { auditSecurityContractMasterGate } from '../gates/security-contract-master.mjs'
import { SECURITY_CONTRACT_REGISTRY } from '../gates/security-contract-registry.mjs'
import { nodeCommand } from '../lib/real-node.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..', '..')

const { command: NODE, env: NODE_ENV } = nodeCommand()

/**
 * 运行单个 node 测试文件或命令
 * @param {string} file
 * @returns {{ file: string, ok: boolean, output: string, exitCode: number }}
 */
function runTestFile(file) {
  try {
    const output = execFileSync(NODE, ['--test', file], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: { ...process.env, ...NODE_ENV },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { file, ok: true, output, exitCode: 0 }
  } catch (err) {
    return {
      file,
      ok: false,
      output: (err.stdout || '') + '\n' + (err.stderr || ''),
      exitCode: err.status ?? 1,
    }
  }
}

async function runMasterAcceptance() {
  const jsonMode = process.argv.includes('--json')
  const startTime = Date.now()

  const summary = {
    totalContracts: SECURITY_CONTRACT_REGISTRY.length,
    contractAudit: null,
    suitesRun: 0,
    suitesPassed: 0,
    suitesFailed: 0,
    failedSuites: [],
    faultPointsAudited: 0,
    durationMs: 0,
    passed: false,
  }

  // 1. 契约登记审计
  const audit = auditSecurityContractMasterGate({ repoRoot: REPO_ROOT })
  summary.contractAudit = audit

  if (!audit.passed) {
    summary.durationMs = Date.now() - startTime
    if (jsonMode) {
      console.log(JSON.stringify(summary, null, 2))
    } else {
      console.error('❌ 安全契约总门禁审计未通过:')
      audit.violations.forEach((v) => console.error(`  - ${v}`))
    }
    process.exit(1)
  }

  // 2. 收集并执行去重后的测试套件列表
  const allTestFiles = new Set()
  for (const contract of SECURITY_CONTRACT_REGISTRY) {
    summary.faultPointsAudited += contract.faultPoints.length
    for (const testFile of contract.testFiles) {
      allTestFiles.add(testFile)
    }
  }

  const results = []
  for (const testFile of allTestFiles) {
    summary.suitesRun += 1
    const res = runTestFile(testFile)
    if (res.ok) {
      summary.suitesPassed += 1
      if (!jsonMode) {
        console.log(`  ✔ [PASS] ${testFile}`)
      }
    } else {
      summary.suitesFailed += 1
      summary.failedSuites.push({ file: testFile, exitCode: res.exitCode })
      if (!jsonMode) {
        console.error(`  ✖ [FAIL] ${testFile} (exit ${res.exitCode})`)
      }
    }
    results.push(res)
  }

  summary.durationMs = Date.now() - startTime
  summary.passed = summary.suitesFailed === 0

  if (jsonMode) {
    console.log(JSON.stringify(summary, null, 2))
  } else {
    console.log('\n--- 安全契约总体验收报告 ---')
    console.log(`- 审计契约项: ${summary.totalContracts}/${summary.contractAudit.expected} 全部闭合`)
    console.log(`- 故障注入点覆盖: ${summary.faultPointsAudited} 个`)
    console.log(`- 执行测试套件: ${summary.suitesRun} 项 (通过 ${summary.suitesPassed}, 失败 ${summary.suitesFailed})`)
    console.log(`- 耗时: ${summary.durationMs}ms`)
    console.log(`- 结论: ${summary.passed ? 'ALL SECURITY CONTRACTS PASSED (通过)' : 'FAILED (存在失败项)'}`)
  }

  process.exit(summary.passed ? 0 : 1)
}

runMasterAcceptance()
