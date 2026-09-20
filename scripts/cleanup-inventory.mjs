#!/usr/bin/env node
/**
 * 清场清单工具：对每个候选条目按**固定顺序**问三个问题，把三步读数摆出来再给结论。
 *
 * 用法：node scripts/cleanup-inventory.mjs <仓库相对路径>... [--json]
 *   · 例：node scripts/cleanup-inventory.mjs packaging/release/2.4.1 packaging/release/2.5.0
 *     （shell 展开版本目录亦可：把该目录下的每个条目列成候选）
 *   · 结论只有两种：`protected`（①②任一命中——证据面，不进入删除建议）
 *     与 `suggested`（①②都为否，按③体积降序进入建议清单）。
 *   · 本工具**不删除、不判红**：它产出的读数才是「把候选写进删除批次」的前置（P-49）。
 *   · 判据与分工见 scripts/lib/cleanup-inventory.mjs 的模块注释（与 gate:object-store-hygiene
 *     的射程互补：那个管没有承诺的对象，本工具管工作树/磁盘上的候选条目）。
 *
 * 退出码：0 = 报告生成成功（无论有没有建议项）；2 = 用法错误或候选不存在。
 */
import { existsSync } from 'node:fs'
import { dirname, join, relative, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createRealDeps, inspectCandidate, orderSuggested } from './lib/cleanup-inventory.mjs'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const json = argv.includes('--json')
const rawCandidates = argv.filter((argument) => !argument.startsWith('--'))

if (rawCandidates.length === 0) {
  process.stderr.write(
    '用法：node scripts/cleanup-inventory.mjs <仓库相对路径>... [--json]\n'
      + '  例：node scripts/cleanup-inventory.mjs packaging/release/2.4.1 packaging/release/2.5.0\n',
  )
  process.exit(2)
}

const candidates = rawCandidates.map((candidate) => (isAbsolute(candidate) ? relative(repoRoot, candidate) : candidate))
const missing = candidates.filter((candidate) => !existsSync(join(repoRoot, candidate)))
if (missing.length > 0) {
  process.stderr.write(`候选不存在（相对仓库根）：${missing.join('、')}\n`)
  process.exit(2)
}

function human(bytes) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

const deps = createRealDeps({ repoRoot })
const readings = candidates.map((candidate) => inspectCandidate({ candidate, repoRoot, deps }))
const suggested = orderSuggested(readings)
const protectedItems = readings.filter((reading) => reading.verdict === 'protected')

if (json) {
  process.stdout.write(`${JSON.stringify({ schemaVersion: 1, kind: 'cleanup-inventory', readings, suggested }, null, 2)}\n`)
  process.exit(0)
}

for (const reading of readings) {
  process.stdout.write(`候选 ${reading.candidate}\n`)
  const commitments = reading.commitments.length > 0
    ? reading.commitments.map((entry) => `${entry.kind}（${entry.detail}）`).join('；')
    : '无'
  process.stdout.write(`  ① 承诺：${commitments}\n`)
  const references = reading.references.length > 0
    ? reading.references.slice(0, 3).map((hit) => `${hit.file}:${hit.line}`).join('、') + (reading.references.length > 3 ? `（共 ${reading.references.length} 处）` : '')
    : '无'
  process.stdout.write(`  ② 引用：${references}\n`)
  process.stdout.write(`  ③ 体积：${human(reading.sizeBytes)}\n`)
  process.stdout.write(`  → ${reading.verdict === 'protected' ? '出局（证据面）' : '进入建议清单'}：${reading.reason}\n`)
}

process.stdout.write(`\n共 ${readings.length} 个候选：证据面（被承诺/被引用）${protectedItems.length} 个 / 建议清单 ${suggested.length} 个\n`)
if (suggested.length > 0) {
  process.stdout.write('建议清单（①②都为否，按体积降序）：\n')
  suggested.forEach((reading, index) => {
    process.stdout.write(`  ${index + 1}. ${reading.candidate}  ${human(reading.sizeBytes)}\n`)
  })
} else {
  process.stdout.write('建议清单为空：没有一个候选同时满足「无承诺、无引用」。\n')
}
