#!/usr/bin/env node
/**
 * AI 全栈 catalog 验证入口。
 *
 * 逐项判据在 fullstack-contract.mjs：mapping 与 extra 必须先合成唯一的
 * canonical catalog，再以同一套 metadata / 来源 / 产物规则核对。这里仅负责
 * CLI 输出与历史 preset 副本判据，避免命令行和根 gate 各复制一套契约。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { auditFullstackCatalog, toCanonicalCatalogResult } from './fullstack-contract.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PACKAGE_ROOT = path.join(HERE, '..')
const PRESET_ID = 'ai-product-developer'

function checkPresetCopies() {
  const presetSkillsDir = path.join(os.homedir(), '.dsh', '.agent-presets', PRESET_ID, 'skills')
  if (!fs.existsSync(presetSkillsDir)) {
    return {
      status: 'skip',
      expected: 0,
      checked: 0,
      violations: [],
      note: `预设 ${PRESET_ID} 不在本机（跳过副本核对，不判红）`,
    }
  }

  const violations = []
  let names
  try {
    const document = JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, 'presets', 'preset-skills.json'), 'utf8'))
    names = (document.presets ?? []).find((preset) => preset.id === PRESET_ID)?.skills?.map((skill) => skill.name ?? skill)
  } catch (error) {
    violations.push(`无法读取 ${PRESET_ID} 的版本化技能清单：${error instanceof Error ? error.message : String(error)}`)
  }
  if (!Array.isArray(names) || names.length === 0) {
    violations.push(`${PRESET_ID} 的版本化技能清单为空；不能从 live 目录反推期望集合`)
    names = []
  }
  for (const name of names) {
    if (!fs.existsSync(path.join(presetSkillsDir, name, 'SKILL.md'))) {
      violations.push(`预设副本丢失：${PRESET_ID}/skills/${name}`)
    }
  }
  return {
    status: violations.length > 0 ? 'fail' : 'pass',
    expected: names.length,
    checked: Math.max(0, names.length - violations.filter((item) => item.startsWith('预设副本丢失')).length),
    violations,
    note: `预设 ${PRESET_ID} 副本 ${names.length}/${names.length}`,
  }
}

function main(argv = process.argv.slice(2)) {
  const unknown = argv.filter((arg) => arg !== '--json')
  if (unknown.length > 0) {
    console.error(`用法：node scripts/verify-fullstack.mjs [--json]\n未知参数：${unknown.join(', ')}`)
    return 2
  }

  const catalogAudit = auditFullstackCatalog()
  const catalog = toCanonicalCatalogResult(catalogAudit)
  const presetCopies = checkPresetCopies()
  const failed = catalog.status === 'fail' || presetCopies.status === 'fail'

  if (argv.includes('--json')) {
    console.log(JSON.stringify({
      catalog,
      items: catalogAudit.itemResults,
      presetCopies,
      status: failed ? 'fail' : catalog.status,
    }, null, 2))
  } else {
    console.log(
      `AI全栈适配测试 | catalog ${catalog.checked}/${catalog.expected}`
      + `（mapping ${catalogAudit.originCounts.mapping} + extra ${catalogAudit.originCounts.extra}）`
      + ` | ${presetCopies.note}`,
    )
    for (const problem of [...catalog.violations, ...presetCopies.violations]) console.log(`  - ${problem}`)
    if (!failed && catalog.status === 'pass') console.log(`✓ catalog ${catalog.checked}/${catalog.expected} 全项通过`)
    else if (!failed && catalog.status === 'skip') console.log(`↷ catalog live 核对跳过：${catalog.reason}`)
  }
  return failed ? 1 : 0
}

process.exitCode = main()
