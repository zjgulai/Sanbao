import {
  accessSync,
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  statfsSync,
  writeFileSync,
} from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'

import {
  canonicalRoot,
  copyTreeVerified,
  fsyncDirectory,
  inspectTree,
  revalidatePathSnapshot,
  revalidateTreeManifest,
  resolveContainedTarget,
  snapshotPath,
  validateFinalName,
  validateFinalNames,
} from '../../../../scripts/lib/preset-skill-paths.mjs'

const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f]/u
const ONLY_VALUES = new Set(['existing', 'mp', 'pm'])
const NOFOLLOW = constants.O_NOFOLLOW ?? 0

export class FullstackInstallError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'FullstackInstallError'
    this.code = code
    this.details = details
  }
}

/** @returns {never} */
function fail(code, message, details) {
  throw new FullstackInstallError(code, message, details)
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

export function parseInstallerArgs(argv) {
  const options = { apply: false, dryRun: true, json: false, only: [] }
  let sawMode = false
  let sawOnly = false
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--apply') {
      if (sawMode) fail('CLI_MODE_DUPLICATE', '只能指定一次 --apply/--dry-run')
      options.apply = true
      options.dryRun = false
      sawMode = true
    } else if (arg === '--dry' || arg === '--dry-run') {
      if (sawMode) fail('CLI_MODE_DUPLICATE', '只能指定一次 --apply/--dry-run')
      sawMode = true
    } else if (arg === '--json') {
      if (options.json) fail('CLI_JSON_DUPLICATE', '--json 不得重复')
      options.json = true
    } else if (arg === '--only') {
      if (sawOnly) fail('CLI_ONLY_DUPLICATE', '--only 不得重复')
      sawOnly = true
      const raw = argv[++i]
      if (!raw || raw.startsWith('--')) fail('CLI_ONLY_MISSING', '--only 必须给 existing、mp、pm 中至少一个')
      const values = raw.split(',').map((value) => value.trim())
      if (values.some((value) => value === '')) fail('CLI_ONLY_EMPTY', '--only 不得含空项')
      for (const value of values) {
        if (!ONLY_VALUES.has(value)) fail('CLI_ONLY_UNKNOWN', `--only 不认识：${value}`)
      }
      if (new Set(values).size !== values.length) fail('CLI_ONLY_DUPLICATE_VALUE', '--only 内不得重复')
      options.only = values
    } else if (arg === '--help' || arg === '-h') {
      options.help = true
    } else {
      fail('CLI_UNKNOWN', `未知参数：${arg}`)
    }
  }
  return options
}

export function selectInstallTasks(mapping, extra, only = []) {
  const selected = new Set(only)
  const includeAll = selected.size === 0
  /** @type {any[]} */
  const tasks = []
  if (includeAll || selected.has('existing')) {
    for (const skill of mapping.skills ?? []) {
      tasks.push({ ...skill, titleZh: skill.title, repo: 'existing', isExisting: true })
    }
  }
  for (const skill of extra.skills ?? []) {
    if (!includeAll && !selected.has(skill.repo)) continue
    tasks.push({ ...skill, title: skill.titleZh, isExisting: false })
  }
  return tasks
}

function splitSkill(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text)
  if (!match) return { frontmatter: '', body: text }
  return { frontmatter: match[1], body: match[2] }
}

function readFlags(frontmatter) {
  const disable = /^disable-model-invocation:\s*(true|false)\s*$/m.exec(frontmatter)
  const user = /^user-invocable:\s*(true|false)\s*$/m.exec(frontmatter)
  return {
    disableModel: disable ? disable[1] === 'true' : false,
    userInvocable: user ? user[1] === 'true' : true,
  }
}

function buildDescription(skill) {
  const triggers = `触发词：${skill.titleZh}、${skill.name}、${skill.summaryZh}。`
  const gap = skill.toolGap ? `工具缺口：${skill.toolGap}。` : ''
  return `${skill.summaryZh}。${triggers}${gap}`
}

function buildFrontmatter(skill, finalName, flags) {
  return [
    '---',
    `name: ${JSON.stringify(finalName)}`,
    `title: ${JSON.stringify(skill.titleZh)}`,
    `description: ${JSON.stringify(buildDescription(skill))}`,
    'enabled: "true"',
    `disable-model-invocation: ${flags.disableModel}`,
    `user-invocable: ${flags.userInvocable}`,
    '---',
    '',
  ].join('\n')
}

function validateFrontmatter(skillName, output) {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(output)?.[1] ?? ''
  for (const line of frontmatter.split(/\r?\n/)) {
    if (!line.trim()) continue
    if (!/^[A-Za-z_][\w-]*:\s*(".*"|true|false)$/.test(line)) {
      fail('FRONTMATTER_LINE', `${skillName}: 非法 frontmatter 行「${line.slice(0, 60)}」`)
    }
  }
  if (!/^disable-model-invocation:\s*(true|false)$/m.test(frontmatter)) {
    fail('FRONTMATTER_DISABLE_FLAG', `${skillName}: 缺 disable-model-invocation`)
  }
  if (!/^user-invocable:\s*(true|false)$/m.test(frontmatter)) {
    fail('FRONTMATTER_USER_FLAG', `${skillName}: 缺 user-invocable`)
  }
}

/**
 * @param {any} rootDescriptor
 * @param {string} relativePath
 * @param {{mustExist?: boolean, type?: 'file'|'directory'|null}} [options]
 * @returns {string|null}
 */
function containedNestedPath(rootDescriptor, relativePath, { mustExist = true, type = null } = {}) {
  if (typeof relativePath !== 'string' || relativePath.length === 0) fail('SOURCE_PATH_EMPTY', 'source path 不能为空')
  if (relativePath !== relativePath.normalize('NFC') || CONTROL_RE.test(relativePath) || path.isAbsolute(relativePath)
    || relativePath.includes('\\')) {
    fail('SOURCE_PATH_FORMAT', `source path 非法：${JSON.stringify(relativePath)}`)
  }
  const parts = relativePath.split('/')
  if (parts.some((part) => part === '' || part === '.' || part === '..')) {
    fail('SOURCE_PATH_TRAVERSAL', `source path 含空段或 traversal：${relativePath}`)
  }
  const candidate = path.resolve(rootDescriptor.path, ...parts)
  const rel = path.relative(rootDescriptor.path, candidate)
  if (rel.startsWith('..') || path.isAbsolute(rel)) fail('SOURCE_PATH_ESCAPE', `source path 逃逸：${relativePath}`)
  if (!existsSync(candidate)) {
    if (mustExist) fail('SOURCE_MISSING', `source 不存在：${candidate}`)
    return null
  }
  const direct = lstatSync(candidate)
  if (direct.isSymbolicLink()) fail('SOURCE_SYMLINK', `source 不得是 symlink：${candidate}`)
  const real = realpathSync.native(candidate)
  if (real !== candidate) fail('SOURCE_PARENT_SYMLINK', `source parent 不得经 symlink：${candidate}`)
  if (type === 'file' && !direct.isFile()) fail('SOURCE_TYPE', `source 应为文件：${candidate}`)
  if (type === 'directory' && !direct.isDirectory()) fail('SOURCE_TYPE', `source 应为目录：${candidate}`)
  return candidate
}

function readVerifiedText(pathname) {
  const snapshot = snapshotPath(pathname)
  if (snapshot.type !== 'file') fail('SOURCE_TYPE', `应为普通文件：${pathname}`)
  const text = readFileSync(pathname, 'utf8')
  revalidatePathSnapshot(snapshot)
  return { text, snapshot }
}

function translationFor(root, skillName) {
  const pathname = containedNestedPath(root, `${skillName}.body.md`, { mustExist: false, type: 'file' })
  return pathname ? { path: pathname, ...readVerifiedText(pathname) } : null
}

function upstreamFor(skill, sourceRoots) {
  const sourceRoot = skill.isExisting ? sourceRoots.mp : sourceRoots[skill.repo]
  if (!sourceRoot) return null
  const relativeSkill = skill.isExisting ? skill.src : skill.dir
  if (typeof relativeSkill !== 'string' || relativeSkill.length === 0) return null
  const root = canonicalRoot(sourceRoot)
  const file = containedNestedPath(root, `${relativeSkill}/SKILL.md`, { mustExist: false, type: 'file' })
  if (!file) return null
  const directory = path.dirname(file)
  const manifest = inspectTree(directory)
  const text = readVerifiedText(file).text
  revalidateTreeManifest(manifest)
  return { root, file, directory, manifest, text }
}

export function buildInstallPlan({
  mapping,
  extra,
  only = [],
  skillsRoot,
  sourceRoots,
  translationsRoot,
}) {
  const root = canonicalRoot(skillsRoot)
  const translations = canonicalRoot(translationsRoot)
  const tasks = selectInstallTasks(mapping, extra, only)
  if (tasks.length === 0) fail('EMPTY_SELECTION', '筛选结果为空，拒绝空跑')

  const finalNames = tasks.map((skill) => skill.installAs ?? skill.name)
  for (const skill of tasks) {
    validateFinalName(skill.name)
    if (!skill.titleZh) fail('TITLE_MISSING', `${skill.name}: 缺 titleZh`)
    if (!skill.summaryZh) fail('SUMMARY_MISSING', `${skill.name}: 缺 summaryZh`)
    if (!skill.isExisting && !ONLY_VALUES.has(skill.repo)) fail('REPO_UNKNOWN', `${skill.name}: repo 非法 ${skill.repo}`)
  }
  // Exact existing targets are planned replacements (with before manifest,
  // backup and rollback); aliases/case/NFC collisions remain forbidden.
  const exactExisting = finalNames.filter((name) => existsSync(path.join(root.path, name)))
  validateFinalNames(finalNames, { root, allowExisting: exactExisting })

  /** @type {any[]} */
  const items = []
  for (const skill of tasks) {
    const finalName = skill.installAs ?? skill.name
    const target = resolveContainedTarget(root, finalName, { mustExist: skill.isExisting })
    const beforeManifest = target.exists ? inspectTree(target.path) : null
    const upstream = upstreamFor(skill, sourceRoots)
    const translation = translationFor(translations, skill.name)

    if (!skill.isExisting && !upstream) {
      fail('NEW_SOURCE_MISSING', `${skill.name}: 新技能必须有完整上游目录，不能只靠 translation 造半份`)
    }
    if (!upstream && !translation) {
      fail('SKILL_SOURCE_MISSING', `${skill.name}: 上游 SKILL.md 与 translation 都不存在`)
    }

    let flags
    let body
    let sourceMode
    if (upstream) {
      const parsed = splitSkill(upstream.text)
      flags = readFlags(parsed.frontmatter)
      body = (translation?.text ?? parsed.body).replace(/\s+$/, '') + '\n'
      sourceMode = translation ? 'upstream+zh' : 'upstream'
    } else {
      const currentSkill = containedNestedPath(canonicalRoot(target.path), 'SKILL.md', { type: 'file' })
      if (!currentSkill) fail('INSTALLED_SKILL_MISSING', `${skill.name}: installed tree 缺 SKILL.md`)
      if (!translation) fail('TRANSLATION_MISSING', `${skill.name}: installed-only source 缺 translation`)
      flags = readFlags(splitSkill(readVerifiedText(currentSkill).text).frontmatter)
      body = translation.text.replace(/\s+$/, '') + '\n'
      sourceMode = 'installed-resources+zh'
    }

    const output = buildFrontmatter(skill, finalName, flags) + '\n' + body
    validateFrontmatter(skill.name, output)
    const stageSource = skill.isExisting ? target.path : upstream?.directory
    const stageSourceManifest = skill.isExisting ? beforeManifest : upstream?.manifest
    if (!stageSource || !stageSourceManifest) {
      fail('STAGE_SOURCE_MISSING', `${skill.name}: 无法建立完整 staging source`)
    }
    items.push({
      name: finalName,
      sourceName: skill.name,
      repo: skill.repo,
      category: skill.cat,
      isExisting: skill.isExisting,
      target,
      beforeManifest,
      stageSource,
      stageSourceManifest,
      output,
      sourceMode,
      translated: Boolean(translation),
    })
  }

  revalidatePathSnapshot(root.snapshot)
  revalidatePathSnapshot(translations.snapshot)
  for (const item of items) {
    if (item.beforeManifest) revalidateTreeManifest(item.beforeManifest)
    revalidateTreeManifest(item.stageSourceManifest)
  }
  const requiredStageBytes = items.reduce((sum, item) => {
    const sourceBytes = item.stageSourceManifest.entries
      .filter((entry) => entry.type === 'file')
      .reduce((total, entry) => total + entry.size, 0)
    const sourceSkillBytes = item.stageSourceManifest.entries
      .find((entry) => entry.path === 'SKILL.md' && entry.type === 'file')?.size ?? 0
    return sum + sourceBytes - sourceSkillBytes + Buffer.byteLength(item.output)
  }, 0) + 1024 * 1024
  const parent = canonicalRoot(path.dirname(root.path))
  try {
    accessSync(root.path, constants.W_OK | constants.X_OK)
    accessSync(parent.path, constants.W_OK | constants.X_OK)
  } catch (error) {
    fail('SKILLS_ROOT_NOT_WRITABLE', `skill root 或其 parent 不可写：${errorMessage(error)}`)
  }
  const fileSystem = statfsSync(parent.path, { bigint: true })
  const availableBytes = fileSystem.bavail * fileSystem.bsize
  if (availableBytes < BigInt(requiredStageBytes)) {
    fail('STAGING_SPACE_INSUFFICIENT', `staging 可用空间不足：需要至少 ${requiredStageBytes} B`)
  }
  return {
    version: 1,
    root,
    only: [...only],
    selected: items.length,
    expectedTotal: (mapping.skills?.length ?? 0) + (extra.skills?.length ?? 0),
    requiresThirdPartyApproval: items.some((item) => !item.isExisting),
    requiredStageBytes,
    availableBytes: availableBytes.toString(),
    items,
  }
}

function writeDurableStageFile(pathname, text) {
  const before = snapshotPath(pathname)
  if (before.type !== 'file') fail('STAGE_SKILL_TYPE', `staged SKILL.md 不是普通文件：${pathname}`)
  let fd
  try {
    fd = openSync(pathname, constants.O_WRONLY | constants.O_TRUNC | NOFOLLOW)
    const opened = fstatSync(fd, { bigint: true })
    if (opened.dev.toString() !== before.dev || opened.ino.toString() !== before.ino) {
      fail('STAGE_SKILL_RACE', `staged SKILL.md identity 已变化：${pathname}`)
    }
    writeFileSync(fd, text)
    fsyncSync(fd)
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
  fsyncDirectory(path.dirname(pathname))
}

export function stageInstallItem(item, stagePath) {
  revalidateTreeManifest(item.stageSourceManifest)
  copyTreeVerified(item.stageSource, stagePath, { expectedManifest: item.stageSourceManifest })
  const skillFile = path.join(stagePath, 'SKILL.md')
  writeDurableStageFile(skillFile, item.output)
  const manifest = inspectTree(stagePath)
  const stagedSkill = manifest.entries.find((entry) => entry.path === 'SKILL.md' && entry.type === 'file')
  if (!stagedSkill) fail('STAGE_SKILL_MISSING', `${item.name}: staged tree 缺 SKILL.md`)
  return manifest
}

/**
 * Derive the immutable after-tree digest without writing a staging directory.
 * `stageInstallItem` copies the complete source tree and only replaces the
 * bytes of SKILL.md, so every other portable manifest field stays unchanged.
 */
export function expectedInstallManifest(item) {
  const entries = item.stageSourceManifest.entries.map((entry) => {
    if (entry.path !== 'SKILL.md' || entry.type !== 'file') {
      return {
        path: entry.path,
        type: entry.type,
        size: entry.size,
        mode: entry.mode,
        sha256: entry.sha256 ?? null,
      }
    }
    const bytes = Buffer.from(item.output)
    return {
      path: entry.path,
      type: entry.type,
      size: bytes.length,
      mode: entry.mode,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    }
  }).sort((a, b) => a.path.localeCompare(b.path, 'en'))
  if (!entries.some((entry) => entry.path === 'SKILL.md' && entry.type === 'file')) {
    fail('SOURCE_SKILL_MISSING', `${item.name}: source tree 缺 SKILL.md`)
  }
  return {
    treeSha256: createHash('sha256').update(Buffer.from(JSON.stringify(entries))).digest('hex'),
  }
}

export function publicInstallPlan(plan) {
  return {
    version: plan.version,
    dryRun: true,
    canonicalSkillsRoot: plan.root.path,
    only: plan.only,
    selected: plan.selected,
    expectedTotal: plan.expectedTotal,
    requiresThirdPartyApproval: plan.requiresThirdPartyApproval,
    requiredStageBytes: plan.requiredStageBytes,
    availableBytes: plan.availableBytes,
    items: plan.items.map((item) => ({
      name: item.name,
      sourceName: item.sourceName,
      repo: item.repo,
      action: item.target.exists ? 'replace' : 'install',
      canonicalTarget: item.target.path,
      beforeTreeSha256: item.beforeManifest?.treeSha256 ?? null,
      sourceTreeSha256: item.stageSourceManifest.treeSha256,
      sourceMode: item.sourceMode,
    })),
  }
}

/** @param {any} plan @param {any|null} [transaction] */
export function buildInstallReport(plan, transaction = null) {
  const installed = plan.items.map((item) => item.name)
  const byNode = {}
  for (const item of plan.items) byNode[item.category] = (byNode[item.category] ?? 0) + 1
  return {
    version: 2,
    batchId: transaction?.batchId ?? null,
    state: transaction?.state ?? 'preflight',
    installed,
    freshInstall: plan.items.filter((item) => !item.isExisting).map((item) => item.name),
    translated: plan.items.filter((item) => item.translated).map((item) => item.sourceName),
    englishFallback: plan.items.filter((item) => !item.translated).map((item) => item.sourceName),
    sourceMode: Object.fromEntries(plan.items.map((item) => [item.name, item.sourceMode])),
    byNode,
    trees: Object.fromEntries(plan.items.map((item) => [item.name, {
      before: item.beforeManifest?.treeSha256 ?? null,
      source: item.stageSourceManifest.treeSha256,
      after: transaction?.items?.find((row) => row.name === item.name)?.afterTreeSha256 ?? null,
    }])),
    problems: [],
  }
}
