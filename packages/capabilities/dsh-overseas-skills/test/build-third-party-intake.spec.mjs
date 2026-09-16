import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import {
  auditThirdPartyClassification,
  toCanonicalThirdPartyIntakeResult,
} from '../scripts/third-party-intake-accounting.mjs'
import { checkThirdPartyIntake } from '../../../../scripts/gates/third-party-intake.mjs'
import { nodeCommand } from '../../../../scripts/lib/real-node.mjs'

const packageRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const scriptsRoot = path.join(packageRoot, 'scripts')
const builder = path.join(scriptsRoot, 'build-third-party-intake.mjs')
const sourcePaths = {
  mapping: path.join(scriptsRoot, 'fullstack-mapping.json'),
  extra: path.join(scriptsRoot, 'fullstack-extra.json'),
  skip: path.join(scriptsRoot, 'third-party-skip.json'),
  inventory: path.join(scriptsRoot, 'third-party-source-inventory.json'),
  out: path.join(scriptsRoot, 'third-party-intake.json'),
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))
const clone = (value) => JSON.parse(JSON.stringify(value))

function currentDocuments() {
  return {
    mapping: readJson(sourcePaths.mapping),
    extra: readJson(sourcePaths.extra),
    skip: readJson(sourcePaths.skip),
    inventory: readJson(sourcePaths.inventory),
  }
}

function audit(documents) {
  return auditThirdPartyClassification({
    inventory: documents.inventory,
    imported: documents.extra.skills,
    skipped: documents.skip.skips,
    mappingSkills: documents.mapping.skills,
  })
}

function fixture(documents = currentDocuments()) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lute-third-party-intake-'))
  const paths = {
    mapping: path.join(root, 'mapping.json'),
    extra: path.join(root, 'extra.json'),
    skip: path.join(root, 'skip.json'),
    inventory: path.join(root, 'inventory.json'),
    out: path.join(root, 'intake.json'),
  }
  for (const key of ['mapping', 'extra', 'skip', 'inventory']) {
    fs.writeFileSync(paths[key], JSON.stringify(documents[key], null, 2) + '\n')
  }
  return { root, paths }
}

function runBuilder(paths, args = []) {
  const node = nodeCommand()
  return spawnSync(node.command, [builder, ...args], {
    encoding: 'utf8',
    env: {
      ...node.env,
      LUTE_INTAKE_MAPPING: paths.mapping,
      LUTE_INTAKE_EXTRA: paths.extra,
      LUTE_INTAKE_SKIP: paths.skip,
      LUTE_INTAKE_INVENTORY: paths.inventory,
      LUTE_INTAKE_OUT: paths.out,
    },
  })
}

function withFixture(documents, body) {
  const item = fixture(documents)
  try {
    return body(item)
  } finally {
    fs.rmSync(item.root, { recursive: true, force: true })
  }
}

test('当前分类守恒：pm 69=63+3+3，mp 37=5+3+29', () => {
  const result = audit(currentDocuments())
  assert.deepEqual(result.problems, [])
  assert.equal(result.expectedSourceCount, 106)
  assert.equal(result.validSourceCount, 106)
  assert.deepEqual(
    result.repoAudits.map((repo) => [repo.id, repo.upstream, repo.imported, repo.skipped, repo.alreadyInstalled]),
    [['pm', 69, 63, 3, 3], ['mp', 37, 5, 3, 29]],
  )
  assert.deepEqual(toCanonicalThirdPartyIntakeResult(result), {
    status: 'pass', expected: 107, discovered: 107, checked: 107, skipped: 0, failed: 0,
    typedSkips: [], reason: 'third-party intake 分类守恒且生成清单一致',
    note: 'pm 69=63+3+3；mp 37=5+3+29', violations: [],
  })
})

test('imported / skipped overlap 必须判红', () => {
  const documents = currentDocuments()
  const row = documents.extra.skills.find((item) => item.repo === 'pm')
  documents.skip.skips.push({ repo: 'pm', name: row.name, dir: row.dir, reason: '故意制造 imported 与 skipped 重叠的测试理由，必须在写文件前失败。' })
  const result = audit(documents)
  assert.ok(result.problems.some((problem) => problem.includes(`source ID「${row.name}」同时属于 imported + skipped`)))
})

test('alreadyInstalled 重复 ID 不得被 Set 静默吞掉', () => {
  const documents = currentDocuments()
  const repo = documents.inventory.repos.find((item) => item.id === 'mp')
  repo.alreadyInstalled.ids.push(repo.alreadyInstalled.ids[0])
  const result = audit(documents)
  assert.ok(result.problems.some((problem) => problem.includes('alreadyInstalled 重复 source ID')))
})

test('漏掉一个 upstream source ID 必须判红', () => {
  const documents = currentDocuments()
  const removed = documents.extra.skills.find((item) => item.repo === 'pm')
  documents.extra.skills = documents.extra.skills.filter((item) => item !== removed)
  const result = audit(documents)
  assert.ok(result.problems.some((problem) => problem.includes(`source ID「${removed.name}」没有终态`)))
})

test('加入未知 ID 必须判红', () => {
  const documents = currentDocuments()
  documents.extra.skills.push({
    repo: 'pm', name: 'unknown-balanced-count', dir: 'pm-test/skills/unknown-balanced-count',
    cat: 'M00', titleZh: '未知条目', summaryZh: '用于证明未知 ID 不会因为数量看起来正确而被吸收。',
  })
  const result = audit(documents)
  assert.ok(result.problems.some((problem) => problem.includes('未知 source ID「unknown-balanced-count」')))
})

test('同一 repo 内重复 source ID 必须判红', () => {
  const documents = currentDocuments()
  documents.extra.skills.push(clone(documents.extra.skills.find((item) => item.repo === 'mp')))
  const result = audit(documents)
  assert.ok(result.problems.some((problem) => problem.includes('imported 重复 source ID')))
})

test('删一补一维持总数也必须同时报告 missing / unexpected', () => {
  const documents = currentDocuments()
  const index = documents.extra.skills.findIndex((item) => item.repo === 'pm')
  const removed = documents.extra.skills[index]
  documents.extra.skills[index] = {
    ...removed,
    name: 'same-count-substitution',
    dir: 'pm-test/skills/same-count-substitution',
  }
  const result = audit(documents)
  assert.ok(result.problems.some((problem) => problem.includes(`source ID「${removed.name}」没有终态`)))
  assert.ok(result.problems.some((problem) => problem.includes('未知 source ID「same-count-substitution」')))
})

test('坏 JSON 非零退出、无成功文案、目标字节不变', () => withFixture(currentDocuments(), ({ paths }) => {
  const sentinel = 'DO-NOT-TOUCH\n'
  fs.writeFileSync(paths.out, sentinel)
  fs.writeFileSync(paths.skip, '{ bad json\n')
  const result = runBuilder(paths)
  assert.notEqual(result.status, 0)
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /✓/)
  assert.equal(fs.readFileSync(paths.out, 'utf8'), sentinel)
}))

test('后置 accounting 问题在任何写入/成功输出前失败', () => {
  const documents = currentDocuments()
  const removed = documents.extra.skills.find((item) => item.repo === 'pm')
  documents.extra.skills = documents.extra.skills.filter((item) => item !== removed)
  withFixture(documents, ({ paths }) => {
    const sentinel = 'UNCHANGED\n'
    fs.writeFileSync(paths.out, sentinel)
    const result = runBuilder(paths)
    assert.equal(result.status, 1)
    assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /✓/)
    assert.equal(fs.readFileSync(paths.out, 'utf8'), sentinel)
  })
})

test('--check 全路径只读，drift 非零且目标 hash 不变', () => withFixture(currentDocuments(), ({ paths }) => {
  const sentinel = 'STALE\n'
  fs.writeFileSync(paths.out, sentinel)
  const before = fs.readFileSync(paths.out)
  const result = runBuilder(paths, ['--check', '--json'])
  assert.equal(result.status, 1)
  const report = JSON.parse(result.stdout)
  assert.equal(report.status, 'fail')
  assert.equal(report.expected, report.checked + report.skipped + report.failed)
  assert.deepEqual(fs.readFileSync(paths.out), before)
}))

test('生成使用同目录临时文件原子替换，随后 --check 幂等且零 diff', () => withFixture(currentDocuments(), ({ root, paths }) => {
  const generated = runBuilder(paths)
  assert.equal(generated.status, 0, generated.stderr)
  const before = fs.readFileSync(paths.out)
  const checked = runBuilder(paths, ['--check', '--json'])
  assert.equal(checked.status, 0, checked.stderr)
  const report = JSON.parse(checked.stdout)
  assert.equal(report.status, 'pass')
  assert.equal(report.expected, report.checked + report.skipped + report.failed)
  assert.deepEqual(fs.readFileSync(paths.out), before)
  assert.deepEqual(fs.readdirSync(root).filter((name) => name.endsWith('.tmp')), [])
}))

test('根 gate checker 返回 canonical 107/107，mandatory input 缺失时 fail-closed', () => {
  const green = checkThirdPartyIntake()
  assert.equal(green.status, 'pass')
  assert.equal(green.expected, 107)
  assert.equal(green.checked, 107)
  assert.deepEqual(green.typedSkips, [])
  assert.match(green.reason, /分类守恒/)

  const red = checkThirdPartyIntake({ env: { ...process.env, LUTE_INTAKE_INVENTORY: '/definitely/missing/inventory.json' } })
  assert.equal(red.status, 'fail')
  assert.equal(red.expected, red.checked + red.skipped + red.failed)
  assert.deepEqual(red.typedSkips, [])
  assert.match(red.reason, /未返回 canonical JSON/)
})
