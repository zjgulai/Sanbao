import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { nodeCommand } from '../../../../scripts/lib/real-node.mjs'
import { NODES, expectedManifest, mergeRowsFromDocuments } from './build-fullstack-catalog.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_PACKAGE_ROOT = path.join(HERE, '..')
const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const ROUTER_TARGETS = new Map([
  ['grill-me', 'grilling'],
  ['grill-with-docs', 'domain-modeling'],
  ['ask-matt', 'skill'],
])

function readJson(file, label, problems) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (error) {
    problems.push(`${label} 无法读取：${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

function duplicates(values) {
  const seen = new Set()
  const repeated = new Set()
  for (const value of values) {
    if (seen.has(value)) repeated.add(value)
    seen.add(value)
  }
  return [...repeated].sort()
}

/**
 * 产品批准的是集合，不是展示顺序。指纹口径由用户明确确认：排序、逐行、保留末尾换行。
 * @param {string[]} skillIds
 */
export function whitelistSetSha256(skillIds) {
  const canonical = `${[...new Set(skillIds)].sort().join('\n')}\n`
  return createHash('sha256').update(canonical).digest('hex')
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function safeRelative(value) {
  if (typeof value !== 'string' || value.trim() === '' || path.isAbsolute(value)) return false
  return !value.split(/[\\/]+/).some((part) => part === '' || part === '.' || part === '..')
}

function parseFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text)
  if (!match) return null
  const values = new Map()
  const illegal = []
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim()) continue
    const scalar = /^([A-Za-z_][\w-]*):\s*("[^"]*"|'[^']*'|true|false)$/.exec(line)
    if (!scalar) {
      illegal.push(line)
      continue
    }
    const raw = scalar[2]
    values.set(scalar[1], raw.startsWith('"') || raw.startsWith("'") ? raw.slice(1, -1) : raw)
  }
  return { values, illegal, body: match[2] }
}

function walkArtifact(root) {
  const files = []
  const symlinks = []
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name)
      if (entry.isSymbolicLink()) symlinks.push(file)
      else if (entry.isDirectory()) visit(file)
      else if (entry.isFile()) files.push(file)
    }
  }
  visit(root)
  return { files, symlinks }
}

function syntaxProblem(file) {
  const extension = path.extname(file)
  let command
  let args
  let env = process.env
  if (['.js', '.mjs', '.cjs'].includes(extension)) {
    const node = nodeCommand()
    command = node.command
    args = ['--check', file]
    env = node.env
  } else if (extension === '.sh') {
    command = 'bash'
    args = ['-n', file]
  } else if (extension === '.py') {
    command = 'python3'
    args = [
      '-c',
      'import pathlib, sys; p = pathlib.Path(sys.argv[1]); compile(p.read_text(encoding="utf-8"), str(p), "exec")',
      file,
    ]
  } else {
    return null
  }
  const result = spawnSync(command, args, { encoding: 'utf8', env, timeout: 30_000 })
  if (result.status === 0) return null
  return (result.stderr || result.stdout || result.error?.message || `exit ${result.status}`).trim().split('\n')[0]
}

function resultFromAudit(audit, { passReason, note }) {
  const status = audit.failed > 0 ? 'fail' : audit.skipped > 0 ? 'skip' : 'pass'
  return {
    status,
    expected: audit.expected,
    discovered: audit.discovered,
    checked: audit.checked,
    skipped: audit.skipped,
    failed: audit.failed,
    typedSkips: audit.typedSkips,
    reason: status === 'pass' ? passReason : status === 'skip' ? audit.typedSkips[0].reason : audit.problems.join('；'),
    note,
    violations: audit.problems,
  }
}

export function auditFullstackCatalog(options = {}) {
  const packageRoot = options.packageRoot ?? DEFAULT_PACKAGE_ROOT
  const problems = []
  const mapping = options.mapping ?? readJson(
    options.mappingPath ?? path.join(packageRoot, 'scripts', 'fullstack-mapping.json'),
    'fullstack-mapping.json',
    problems,
  )
  const extra = options.extra ?? readJson(
    options.extraPath ?? path.join(packageRoot, 'scripts', 'fullstack-extra.json'),
    'fullstack-extra.json',
    problems,
  )
  const manifest = options.manifest ?? readJson(
    options.manifestPath ?? path.join(packageRoot, 'manifest', 'fullstack-skills.json'),
    'manifest/fullstack-skills.json',
    problems,
  )

  if (!mapping || !extra || !manifest) {
    return {
      expected: 1, discovered: 0, checked: 0, skipped: 0, failed: 1,
      typedSkips: [], problems, rows: [], itemResults: [], originCounts: { mapping: 0, extra: 0 },
    }
  }

  const mappingSkills = Array.isArray(mapping.skills) ? mapping.skills : []
  const extraSkills = Array.isArray(extra.skills) ? extra.skills : []
  if (!Array.isArray(mapping.skills)) problems.push('fullstack-mapping.json 的 skills 必须是数组')
  if (!Array.isArray(extra.skills)) problems.push('fullstack-extra.json 的 skills 必须是数组')
  if (!Array.isArray(manifest.skills)) problems.push('manifest/fullstack-skills.json 的 skills 必须是数组')
  if (!Array.isArray(manifest.categories)) problems.push('manifest/fullstack-skills.json 的 categories 必须是数组')

  const expected = Math.max(1, mappingSkills.length + extraSkills.length)
  const originCounts = { mapping: mappingSkills.length, extra: extraSkills.length }
  const merged = mergeRowsFromDocuments(mapping, extra)
  problems.push(...merged.problems)
  const rows = merged.rows
  /** @type {Map<string, string[]>} */
  const rowProblems = new Map(rows.map((row) => [row.name, []]))
  const addRowProblem = (name, message) => {
    problems.push(message)
    const bucket = rowProblems.get(name)
    if (bucket) bucket.push(message)
  }

  for (const row of rows) {
    if (!NAME_RE.test(row.name)) addRowProblem(row.name, `${row.name}: install ID 不是合法 kebab-case`)
    if (!NAME_RE.test(row.sourceName ?? '')) addRowProblem(row.name, `${row.name}: sourceName 非法或缺失`)
    if (row.origin === 'mapping') {
      if (!safeRelative(row.sourceRef)) addRowProblem(row.name, `${row.name}: mapping source ref 非法或缺失`)
    } else if (row.origin === 'extra') {
      const separator = String(row.sourceRef ?? '').indexOf(':')
      const repo = separator >= 0 ? row.sourceRef.slice(0, separator) : ''
      const dir = separator >= 0 ? row.sourceRef.slice(separator + 1) : ''
      if (!NAME_RE.test(repo) || !safeRelative(dir)) addRowProblem(row.name, `${row.name}: extra repo/dir source ref 非法或缺失`)
    } else {
      addRowProblem(row.name, `${row.name}: 未知 origin ${row.origin}`)
    }
  }

  const expectedCategories = NODES.map((node) => ({ key: node.key, title: node.title }))
  if (!sameJson(manifest.categories, expectedCategories)) {
    problems.push(`manifest categories 与 M00–M13 事实源不一致：expected ${expectedCategories.length}, got ${Array.isArray(manifest.categories) ? manifest.categories.length : 0}`)
  }

  const expectedRows = expectedManifest(rows).skills
  const actualRows = Array.isArray(manifest.skills) ? manifest.skills : []
  const manifestDuplicates = duplicates(actualRows.map((row) => row?.name))
  if (manifestDuplicates.length > 0) problems.push(`manifest duplicate：${manifestDuplicates.join(', ')}`)
  const actualByName = new Map(actualRows.filter((row) => row && typeof row.name === 'string').map((row) => [row.name, row]))
  const expectedNames = new Set(expectedRows.map((row) => row.name))
  for (const row of expectedRows) {
    const actual = actualByName.get(row.name)
    if (!actual) addRowProblem(row.name, `manifest 缺 ${row.name}`)
    else if (!sameJson(actual, row)) addRowProblem(row.name, `manifest 中 ${row.name} 的产物字段与事实源不一致`)
  }
  const unexpectedManifest = actualRows
    .map((row) => row?.name)
    .filter((name) => typeof name === 'string' && !expectedNames.has(name))
    .sort()
  if (unexpectedManifest.length > 0) problems.push(`manifest 多 ${unexpectedManifest.join(', ')}`)

  const checkInstalled = options.checkInstalled !== false
  const skillsDir = options.skillsDir ?? path.join(os.homedir(), '.dsh', 'skills')
  if (checkInstalled && !fs.existsSync(skillsDir) && problems.length === 0) {
    const reason = `技能库不存在：${skillsDir}；版本化 catalog 已闭合，但未核对 live artifact`
    return {
      expected,
      discovered: rows.length,
      checked: 0,
      skipped: expected,
      failed: 0,
      typedSkips: [{
        type: 'optional-environment-missing',
        count: expected,
        reason,
      }],
      problems,
      rows,
      itemResults: rows.map((row) => ({
        id: row.name,
        origin: row.origin,
        sourceName: row.sourceName,
        sourceRef: row.sourceRef,
        status: 'skip',
        violations: [],
        reason,
      })),
      originCounts,
    }
  }

  if (checkInstalled) {
    for (const row of rows) {
      const file = path.join(skillsDir, row.name, 'SKILL.md')
      if (!fs.existsSync(file)) {
        addRowProblem(row.name, `${row.name}: 未安装（缺 SKILL.md）`)
        continue
      }
      let text
      try {
        text = fs.readFileSync(file, 'utf8')
      } catch (error) {
        addRowProblem(row.name, `${row.name}: SKILL.md 无法读取：${error instanceof Error ? error.message : String(error)}`)
        continue
      }
      const parsed = parseFrontmatter(text)
      if (!parsed) {
        addRowProblem(row.name, `${row.name}: 无合法 frontmatter`)
        continue
      }
      if (parsed.illegal.length > 0) addRowProblem(row.name, `${row.name}: 非法 frontmatter 行 ${parsed.illegal[0].slice(0, 80)}`)
      if (parsed.values.get('name') !== row.name) addRowProblem(row.name, `${row.name}: frontmatter name 不符`)
      if (parsed.values.get('title') !== row.title) addRowProblem(row.name, `${row.name}: frontmatter title 与 catalog 不符`)
      if ((parsed.values.get('description') ?? '').length < 10) addRowProblem(row.name, `${row.name}: description 过短或缺失`)
      if (!['true', 'false'].includes(parsed.values.get('disable-model-invocation'))) {
        addRowProblem(row.name, `${row.name}: disable-model-invocation 必须是 boolean scalar`)
      }
      if (parsed.values.get('user-invocable') !== 'true') addRowProblem(row.name, `${row.name}: user-invocable 必须为 true`)
      if (parsed.body.trim() === '') addRowProblem(row.name, `${row.name}: 正文为空`)
      const routeTarget = ROUTER_TARGETS.get(row.name)
      if (routeTarget && !text.includes(routeTarget)) {
        addRowProblem(row.name, `${row.name}: 路由目标 ${routeTarget} 未出现在正文`)
      }

      let artifact
      try {
        artifact = walkArtifact(path.dirname(file))
      } catch (error) {
        addRowProblem(row.name, `${row.name}: artifact 无法遍历：${error instanceof Error ? error.message : String(error)}`)
        continue
      }
      if (artifact.symlinks.length > 0) {
        addRowProblem(row.name, `${row.name}: artifact 含 symlink：${artifact.symlinks.map((item) => path.relative(path.dirname(file), item)).join(', ')}`)
      }
      for (const resource of artifact.files) {
        try {
          fs.accessSync(resource, fs.constants.R_OK)
        } catch {
          addRowProblem(row.name, `${row.name}: resource 不可读 ${path.relative(path.dirname(file), resource)}`)
          continue
        }
        const syntax = syntaxProblem(resource)
        if (syntax) addRowProblem(row.name, `${row.name}: resource 语法失败 ${path.relative(path.dirname(file), resource)}：${syntax}`)
      }
    }
  }

  const validRows = rows.filter((row) => rowProblems.get(row.name)?.length === 0).length
  const itemResults = rows.map((row) => {
    const violations = rowProblems.get(row.name) ?? []
    return {
      id: row.name,
      origin: row.origin,
      sourceName: row.sourceName,
      sourceRef: row.sourceRef,
      status: violations.length > 0 ? 'fail' : 'pass',
      violations,
    }
  })
  let failed = Math.max(0, expected - validRows)
  if (problems.length > 0 && failed === 0) failed = 1
  failed = Math.min(expected, failed)
  return {
    expected,
    discovered: rows.length,
    checked: expected - failed,
    skipped: 0,
    failed,
    typedSkips: [],
    problems,
    rows,
    itemResults,
    originCounts,
  }
}

export function toCanonicalCatalogResult(audit) {
  return resultFromAudit(audit, {
    passReason: 'fullstack catalog 逐项契约闭合',
    note: `catalog ${audit.checked}/${audit.expected}（mapping ${audit.originCounts.mapping} + extra ${audit.originCounts.extra}）`,
  })
}

/**
 * @param {{whitelist?: any, whitelistPath?: string, catalogAudit?: any, packageRoot?: string}} [options]
 */
export function auditApprovedWhitelist(options = {}) {
  const { whitelist, whitelistPath, catalogAudit } = options
  const packageRoot = options.packageRoot ?? DEFAULT_PACKAGE_ROOT
  const problems = []
  const document = whitelist ?? readJson(
    whitelistPath ?? path.join(DEFAULT_PACKAGE_ROOT, 'manifest', 'agent-fullstack-whitelist.json'),
    'agent-fullstack approved whitelist',
    problems,
  )
  if (!document) {
    return {
      expected: 1, discovered: 0, checked: 0, skipped: 0, failed: 1,
      typedSkips: [], problems, owner: '(missing)', scope: '(missing)',
      orderSignificant: false, setSha256: '(missing)', calculatedSetSha256: '(missing)', skillIds: [],
    }
  }
  const skillIds = Array.isArray(document.skillIds) ? document.skillIds : []
  const expected = Math.max(1, skillIds.length)
  if (document.schemaVersion !== 1) problems.push('approved whitelist schemaVersion 必须为 1')
  if (document.presetId !== 'agent-fullstack') problems.push('approved whitelist presetId 必须为 agent-fullstack')
  if (!document.approval || typeof document.approval !== 'object') problems.push('approved whitelist 缺 approval')
  const owner = document.approval?.owner
  if (owner !== 'lute') problems.push('approved whitelist product owner 必须为 lute')
  const decisionRef = document.approval?.decisionRef
  if (decisionRef !== 'docs/adr/ADR-0091.md') {
    problems.push('approved whitelist decisionRef 必须为 docs/adr/ADR-0091.md')
  } else if (!fs.existsSync(path.resolve(packageRoot, '../../..', decisionRef))) {
    problems.push(`approved whitelist decisionRef 不可达：${decisionRef}`)
  }
  if (typeof document.approval?.reason !== 'string' || document.approval.reason.trim().length < 20) problems.push('approved whitelist reason 缺失或过短')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(document.approval?.approvedAt ?? '')) problems.push('approved whitelist approvedAt 必须是 YYYY-MM-DD')
  if (document.approval?.scope !== 'preset-composition-only') problems.push('approved whitelist scope 必须为 preset-composition-only，不能冒充发布授权')
  if (document.approval?.orderSignificant !== false) problems.push('approved whitelist orderSignificant 必须显式为 false（本次批准的是集合）')
  if (!Array.isArray(document.skillIds) || skillIds.length === 0) problems.push('approved whitelist skillIds 必须是非空数组')

  const repeated = duplicates(skillIds)
  if (repeated.length > 0) problems.push(`approved whitelist duplicate：${repeated.join(', ')}`)
  const invalid = skillIds.filter((name) => typeof name !== 'string' || !NAME_RE.test(name))
  if (invalid.length > 0) problems.push(`approved whitelist 非法 ID：${invalid.join(', ')}`)
  const catalogNames = new Set((catalogAudit?.rows ?? []).map((row) => row.name))
  if (!catalogAudit || catalogAudit.failed > 0) {
    problems.push('approved whitelist 无法绑定未闭合的 fullstack catalog')
  }
  const outsiders = skillIds.filter((name) => !catalogNames.has(name))
  if (outsiders.length > 0) problems.push(`approved whitelist 不属于 catalog：${outsiders.join(', ')}`)
  const calculatedSetSha256 = whitelistSetSha256(skillIds.filter((name) => typeof name === 'string'))
  const setSha256 = document.approval?.setSha256
  if (!/^[a-f0-9]{64}$/.test(setSha256 ?? '')) problems.push('approved whitelist setSha256 必须是 64 位小写 SHA-256')
  else if (setSha256 !== calculatedSetSha256) {
    problems.push(`approved whitelist setSha256 不符：声明 ${setSha256}，重算 ${calculatedSetSha256}`)
  }

  let failed = Math.min(expected, new Set([...repeated, ...invalid, ...outsiders]).size)
  if (problems.length > 0 && failed === 0) failed = 1
  return {
    expected,
    discovered: new Set(skillIds).size,
    checked: expected - failed,
    skipped: 0,
    failed,
    typedSkips: [],
    problems,
    owner: typeof owner === 'string' && owner ? owner : '(missing)',
    decisionRef: typeof decisionRef === 'string' ? decisionRef : '(missing)',
    scope: document.approval?.scope ?? '(missing)',
    orderSignificant: document.approval?.orderSignificant === true,
    setSha256: typeof setSha256 === 'string' ? setSha256 : '(missing)',
    calculatedSetSha256,
    skillIds,
  }
}

export function toCanonicalWhitelistResult(audit) {
  return resultFromAudit(audit, {
    passReason: 'agent-fullstack approved whitelist 闭合',
    note: `whitelist ${audit.checked}/${audit.expected}；owner=${audit.owner}；scope=${audit.scope}`,
  })
}

export function compareRuntimeWhitelist(approved, runtimeNames) {
  const approvedNames = Array.isArray(approved?.skillIds) ? approved.skillIds : []
  const names = Array.isArray(runtimeNames) ? runtimeNames : []
  const duplicatesInRuntime = duplicates(names)
  const approvedSet = new Set(approvedNames)
  const runtimeSet = new Set(names)
  const missing = approvedNames.filter((name) => !runtimeSet.has(name))
  const unexpected = [...new Set(names.filter((name) => !approvedSet.has(name)))].sort()
  const problems = []
  if (duplicatesInRuntime.length > 0) problems.push(`runtime whitelist duplicate：${duplicatesInRuntime.join(', ')}`)
  if (missing.length > 0) problems.push(`runtime whitelist missing：${missing.join(', ')}`)
  if (unexpected.length > 0) problems.push(`runtime whitelist unexpected：${unexpected.join(', ')}`)
  return { duplicates: duplicatesInRuntime, missing, unexpected, problems }
}

export function parseRuntimeWhitelist(yml) {
  const problems = []
  const block = /- id: skill-subset\b[\s\S]*$/m.exec(yml)?.[0] ?? ''
  if (!block) return { names: [], nodes: {}, problems: ['agent.cordis.yml 里没有 skill-subset 行'] }
  const names = []
  const nodes = {}
  let currentNode = null
  for (const line of block.split('\n')) {
    const heading = /^ {6}# (M\d\d)（(\d+) 条）$/.exec(line)
    if (heading) {
      currentNode = heading[1]
      nodes[currentNode] = { declared: Number(heading[2]), names: [] }
      continue
    }
    const skill = /^ {6}- "([a-z0-9-]+)"$/.exec(line)
    if (!skill) continue
    names.push(skill[1])
    if (!currentNode) problems.push(`runtime whitelist 的 ${skill[1]} 没有节点标题`)
    else nodes[currentNode].names.push(skill[1])
  }
  if (names.length === 0) problems.push('skill-subset 的 skills 列表一条都没抽到')
  for (const [node, entry] of Object.entries(nodes)) {
    if (entry.declared !== entry.names.length) problems.push(`${node} 声明 ${entry.declared} 实得 ${entry.names.length}`)
  }
  return { names, nodes, problems }
}
