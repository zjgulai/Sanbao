/**
 * live-presets：用户预设根（`~/.dsh/.agent-presets`）的写后核验。
 *
 * ## 为什么需要它
 *
 * 2026-09-14 / 2026-09-15 两天内，用户预设根被两次写坏，而当时的门禁一条都没看见：
 *
 *   1. 打包面占位符 `__DSH_HOME__` 被写进 `agent.cordis.yml` 的插件行——该占位符只在
 *      `cordis.patch.yml` 首启时被 main.js 展开，预设加载器**不展开任何占位符**；
 *   2. 预设目录被整目录下线，但仍有会话引用它，恢复时 `agent-preset/not-found`。
 *
 * 第 2 条的预检由 `scripts/role-presets/remove-preset.mjs` 负责（引用面扫描 + 归档）；
 * 本模块负责第 1 条与同类「写坏」：**每一条 agent.cordis.yml 的插件行必须在当前
 * 本机的解析面里解析得到**，占位符残留必须为零。判据与宿主 `dsh-agent-presets` 的
 * `classifyRowSpecifier` / `packageInstalled` 同构（见该包 lib/index.js），但**离线可跑**，
 * 不依赖应用在运行。
 *
 * ## 射程与边界
 *
 * - 只扫**用户预设根**里每个目录的 `agent.cordis.yml`（不扫 shipped 根——出货面由
 *   `packaging/scripts/check-preset-rows.mjs` 守）；`.bak-*` 等非本名文件不扫。
 * - 零依赖的受控 indentation parser 只接受宿主 composition 实际使用的 row 子集：
 *   top-level list row，以及 `group: true` 的 `config` 里的 nested list row。普通 config 与 block
 *   scalar 中的 `name:` 不是 row；无法确定层级时 fail-closed。
 * - 裸包名、scoped package、相对/绝对路径、`file:` 与 `cordis:` 全部进入分母。
 * - `disabled: !!js ...` 只评估 `process.platform ===/!== 'win32'`；其他表达式
 *   标记为 conditional 并 fail-closed，不猜测为 disabled。
 * - 用户预设根整体不存在是 typed skip；根存在但没有 preset/row，preset 目录缺
 *   `agent.cordis.yml`，都是 fail。
 *
 * ## 契约
 *
 * `checkLivePresets({ userRoot, profileBase })` 保留 `{ passed, violations, note }` 兼容面，
 * 另返回 `status/skipped/metrics/facts` 及顶层四计数。row 分母始终满足
 * `discovered = checked + disabled + failed`。CLI 退出码：0 通过或 skip / 1 存在失败 / 2 用法错误。
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { isBuiltin } from 'node:module'
import { dirname, isAbsolute, join } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** 默认用户预设根。 */
export const DEFAULT_USER_PRESET_ROOT = join(homedir(), '.dsh', '.agent-presets')

/** 默认 profile 基目录（包名向上遍历的起点，即桌面 profile cordis.yml 所在目录）。 */
export const DEFAULT_PROFILE_BASE = join(homedir(), '.dsh', 'profiles', 'desktop')

/** 当前 live preset row 身份清单；只存稳定身份摘要，不保存用户配置正文。 */
export const DEFAULT_INVENTORY_PATH = join(dirname(fileURLToPath(import.meta.url)), 'live-presets.expected.json')

/** 只允许出现在 cordis.patch.yml（打包面）的占位符；预设行里出现即写坏。 */
const FORBIDDEN_PLACEHOLDERS = ['__DSH_HOME__', '__LUTE_PROJECT_ROOT__']
const PRESET_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** 与宿主 dsh-agent-presets/lib/index.js `classifyRowSpecifier` 同构。 */
export function classifyRowSpecifier(name) {
  if (name.startsWith('cordis:')) return { kind: 'builtin' }
  if (name.startsWith('.')) return { kind: 'preset' }
  if (name.startsWith('file:')) return { kind: 'file' }
  if (isAbsolute(name)) return { kind: 'file' }
  return { kind: 'package' }
}

/** 与宿主 `packageInstalled` 同构：从 base 向上找 `node_modules/<pkg>/package.json`。 */
export function packageInstalled(name, base) {
  const pkg = name.split('/').slice(0, name.startsWith('@') ? 2 : 1).join('/')
  let dir = base
  for (;;) {
    if (existsSync(join(dir, 'node_modules', pkg, 'package.json'))) return true
    const parent = dirname(dir)
    if (parent === dir) return false
    dir = parent
  }
}

/** 判断一个插件行名在当前解析面里能否解析（不 import，只看磁盘）。 */
export function rowResolves(name, presetDir, profileBase) {
  const c = classifyRowSpecifier(name)
  if (c.kind === 'builtin') return true
  if (c.kind === 'preset') {
    try {
      const url = new URL(name, pathToFileURL(presetDir + '/').href)
      return statSync(fileURLToPath(url)).isFile()
    } catch {
      return false
    }
  }
  if (c.kind === 'file') {
    try {
      return statSync(name.startsWith('file:') ? fileURLToPath(name) : name).isFile()
    } catch {
      return false
    }
  }
  return isBuiltin(name) || packageInstalled(name, profileBase)
}

/** 移除引号外的 YAML 行尾注释。 */
function stripInlineComment(raw) {
  let quote = null
  for (let i = 0; i < raw.length; i++) {
    const char = raw[i]
    if (quote === "'") {
      if (char === "'" && raw[i + 1] === "'") i += 1
      else if (char === "'") quote = null
      continue
    }
    if (quote === '"') {
      if (char === '\\') i += 1
      else if (char === '"') quote = null
      continue
    }
    if (char === "'" || char === '"') quote = char
    else if (char === '#' && (i === 0 || /\s/.test(raw[i - 1]))) return raw.slice(0, i)
  }
  return raw
}

/** 解析受控单行 scalar；多行、标签与未闭合引号拒绝。 */
function parseControlledScalar(raw) {
  const source = stripInlineComment(raw).trim()
  if (source === '' || /^[|>][+-]?$/.test(source)) return source === '' ? '' : undefined
  if (source.startsWith("'")) {
    if (!source.endsWith("'") || source.length < 2) return undefined
    return source.slice(1, -1).replace(/''/g, "'")
  }
  if (source.startsWith('"')) {
    if (!source.endsWith('"') || source.length < 2) return undefined
    try {
      return JSON.parse(source)
    } catch {
      return undefined
    }
  }
  if (/\s+[\[{]/.test(source) || source.startsWith('!')) return undefined
  return source
}

/** 解析 `name:` 右侧的受控单行标量。 */
export function parseNameScalar(raw) {
  const value = parseControlledScalar(raw)
  return typeof value === 'string' && value !== '' ? value : undefined
}

/** 任何非空、无空白的 scalar 都是模块说明符，包括裸包名。 */
export function looksLikeRowName(name) {
  return typeof name === 'string' && name !== '' && !/\s/.test(name)
}

/** 评估 `disabled:` 标量；不受控的 JS 保留 conditional，不猜测。 */
export function disabledTruthy(raw) {
  const s = stripInlineComment(raw).trim()
  if (s.startsWith('!!js')) {
    const expressionScalar = parseControlledScalar(s.slice(4).trim())
    const expr = typeof expressionScalar === 'string' ? expressionScalar : ''
    if (expr === "process.platform === 'win32'") return process.platform === 'win32'
    if (expr === "process.platform !== 'win32'") return process.platform !== 'win32'
    return 'conditional'
  }
  if (s === '' || s === 'false' || s === 'null' || s === '~') return false
  if (/^[+-]?(?:0+(?:\.0*)?|\.0+)$/.test(s)) return false
  if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) {
    const value = parseControlledScalar(s)
    return typeof value === 'string' && value.length > 0
  }
  return true
}

/**
 * 受控解析一个 agent.cordis.yml 文本。
 * @param {string} text 文件全文。
 * @returns {{
 *   placeholders: Array<{line: number, token: string}>,
 *   problems: Array<{line: number, message: string}>,
 *   rows: Array<{id: string|null, name: string, line: number, rowPath: string, disabled: boolean|'conditional'}>
 * }}
 */
export function scanAgentCordis(text) {
  const placeholders = []
  const problems = []
  const rows = []
  const lines = text.split('\n')

  const meta = (index) => {
    const raw = lines[index]
    const leading = /^(\s*)/.exec(raw)?.[1] ?? ''
    return {
      raw,
      trimmed: raw.trimStart(),
      indent: leading.includes('\t') ? -1 : leading.length,
    }
  }
  const ignorable = (index) => {
    const { trimmed } = meta(index)
    return trimmed === '' || trimmed.startsWith('#')
  }

  // 占位符扫描与 row parser 分离：config/block scalar 仍是真实配置面。
  for (let i = 0; i < lines.length; i++) {
    const { raw: line, trimmed } = meta(i)
    if (trimmed.startsWith('#')) continue
    const active = stripInlineComment(line)
    for (const token of FORBIDDEN_PLACEHOLDERS) {
      if (active.includes(token)) placeholders.push({ line: i + 1, token })
    }
  }

  const parseField = (raw, line) => {
    const match = /^([A-Za-z_][A-Za-z0-9_-]*):(?:\s*(.*))?$/.exec(raw)
    if (!match) {
      problems.push({ line, message: '应为 key: value 的 row 字段' })
      return null
    }
    return { key: match[1], raw: match[2] ?? '' }
  }

  const nextBoundary = (from, end, indent) => {
    for (let i = from; i < end; i++) {
      if (ignorable(i)) continue
      if (meta(i).indent <= indent) return i
    }
    return end
  }

  const combineDisabled = (outer, own) => {
    if (outer === true || own === true) return true
    if (outer === 'conditional' || own === 'conditional') return 'conditional'
    return false
  }

  const parseList = (start, end, listIndent, prefix, outerDisabled = false) => {
    let ordinal = 0
    let i = start
    while (i < end) {
      if (ignorable(i)) {
        i += 1
        continue
      }
      const current = meta(i)
      if (current.indent === -1) {
        problems.push({ line: i + 1, message: '缩进不得使用 tab' })
        i += 1
        continue
      }
      if (current.indent < listIndent) return i
      if (current.indent !== listIndent || !/^-($|\s+)/.test(current.trimmed)) {
        problems.push({
          line: i + 1,
          message: listIndent === 0
            ? '顶层只能是缩进 0 的 list row'
            : `nested row 必须使用 ${listIndent} 个空格缩进`,
        })
        i += 1
        continue
      }

      ordinal += 1
      const rowPath = prefix === '' ? String(ordinal) : `${prefix}.${ordinal}`
      const blockEnd = nextBoundary(i + 1, end, listIndent)
      const fields = new Map()
      let config = null
      const header = current.trimmed.replace(/^-\s*/, '')
      if (header !== '') {
        const field = parseField(header, i + 1)
        if (field) fields.set(field.key, { ...field, line: i + 1 })
      }

      const fieldIndent = listIndent + 2
      let j = i + 1
      while (j < blockEnd) {
        if (ignorable(j)) {
          j += 1
          continue
        }
        const child = meta(j)
        if (child.indent === -1) {
          problems.push({ line: j + 1, message: '缩进不得使用 tab' })
          j += 1
          continue
        }
        if (child.indent !== fieldIndent) {
          problems.push({ line: j + 1, message: `row 字段必须使用 ${fieldIndent} 个空格缩进` })
          j += 1
          continue
        }
        if (/^-($|\s+)/.test(child.trimmed)) {
          problems.push({ line: j + 1, message: '嵌套 list 只能出现在 group row 的 config 下' })
          j += 1
          continue
        }
        const field = parseField(child.trimmed, j + 1)
        if (!field) {
          j += 1
          continue
        }
        const subtreeEnd = nextBoundary(j + 1, blockEnd, fieldIndent)
        if (fields.has(field.key)) {
          problems.push({ line: j + 1, message: `row 字段 ${field.key} 重复` })
        } else {
          fields.set(field.key, { ...field, line: j + 1 })
        }
        if (field.key === 'config') {
          config = { raw: field.raw, start: j + 1, end: subtreeEnd, line: j + 1 }
        }
        // config、块标量与其他 map 值的内部不是 row 的直接字段。
        j = subtreeEnd
      }

      const idField = fields.get('id')
      const nameField = fields.get('name')
      const disabledField = fields.get('disabled')
      const groupField = fields.get('group')
      const idValue = idField ? parseControlledScalar(idField.raw) : null
      const nameValue = nameField ? parseNameScalar(nameField.raw) : undefined
      const groupEnabled = groupField && stripInlineComment(groupField.raw).trim() === 'true'
      const ownDisabled = disabledField ? disabledTruthy(disabledField.raw) : false
      const effectiveDisabled = combineDisabled(outerDisabled, ownDisabled)

      if (idField && (typeof idValue !== 'string' || idValue === '')) {
        problems.push({ line: idField.line, message: 'row id 必须是非空单行 scalar' })
      }
      if (!nameField || nameValue === undefined || !looksLikeRowName(nameValue)) {
        problems.push({ line: nameField?.line ?? i + 1, message: `row ${rowPath} 缺有效 name scalar` })
      } else {
        rows.push({
          id: typeof idValue === 'string' && idValue !== '' ? idValue : null,
          name: nameValue,
          line: nameField.line,
          rowPath,
          disabled: effectiveDisabled,
        })
      }

      if (groupEnabled) {
        if (!config || config.raw !== '') {
          problems.push({ line: config?.line ?? groupField?.line ?? i + 1, message: `group row ${rowPath} 的 config 必须是 nested list` })
        } else if (config.start >= config.end) {
          problems.push({ line: config.line, message: `group row ${rowPath} 的 config 不得为空` })
        } else {
          parseList(config.start, config.end, listIndent + 4, rowPath, effectiveDisabled)
        }
      }
      i = blockEnd
    }
    return i
  }

  parseList(0, lines.length, 0, '')
  return { placeholders, problems, rows }
}

/** 读一个预设根里的 preset id 集合（目录名即 id）。 */
export function listPresetDirs(userRoot) {
  try {
    return readdirSync(userRoot, { withFileTypes: true })
      // 与宿主 preset id 形状一致；node_modules/.bak 等工具目录不占 preset 槽。
      .filter((e) => e.isDirectory() && PRESET_ID.test(e.name))
      .map((e) => e.name)
      .sort()
  } catch {
    return null
  }
}

/**
 * 用户预设根写后核验。
 * @param {{userRoot?: string, profileBase?: string}} options
 * @returns {{passed: boolean, status: 'pass'|'fail'|'skip', skipped: boolean, violations: string[], note: string,
 * metrics: {discovered: number, checked: number, disabled: number, failed: number},
 * discovered: number, checked: number, disabled: number, failed: number, facts: object}}
 */
export function checkLivePresets({
  userRoot = DEFAULT_USER_PRESET_ROOT,
  profileBase = DEFAULT_PROFILE_BASE,
} = {}) {
  const metrics = { discovered: 0, checked: 0, disabled: 0, failed: 0 }
  const facts = {
    userRoot,
    presetDirectories: 0,
    presetFiles: 0,
    rows: [],
    fileFailures: [],
  }
  const result = (status, violations, note) => ({
    passed: status !== 'fail',
    status,
    skipped: status === 'skip',
    violations,
    note,
    metrics: { ...metrics },
    discovered: metrics.discovered,
    checked: metrics.checked,
    disabled: metrics.disabled,
    failed: metrics.failed,
    facts,
  })

  if (!existsSync(userRoot)) {
    return result(
      'skip',
      [],
      `用户预设根不存在（${userRoot}）——本项**未核对任何预设**（不是「都健康」）`,
    )
  }
  const ids = listPresetDirs(userRoot)
  if (ids === null) {
    const message = `用户预设根无法读取（${userRoot}）`
    facts.fileFailures.push({ presetId: null, reason: message })
    return result('fail', [message], message)
  }
  facts.presetDirectories = ids.length
  if (ids.length === 0) {
    const message = `用户预设根存在但 0 个预设目录（${userRoot}）——本项**未核对任何行**`
    facts.fileFailures.push({ presetId: null, reason: message })
    return result('fail', [message], message)
  }
  const violations = []
  for (const id of ids) {
    const file = join(userRoot, id, 'agent.cordis.yml')
    if (!existsSync(file)) {
      const message = `${id}/agent.cordis.yml 缺失（preset 目录已存在，不得静默跳过）`
      violations.push(message)
      facts.fileFailures.push({ presetId: id, reason: message })
      continue
    }
    let text
    try {
      text = readFileSync(file, 'utf8')
    } catch (error) {
      const message = `${id}/agent.cordis.yml 无法读取：${error instanceof Error ? error.message : String(error)}`
      violations.push(message)
      facts.fileFailures.push({ presetId: id, reason: message })
      continue
    }
    facts.presetFiles += 1
    const scan = scanAgentCordis(text)
    if (scan.rows.length === 0) {
      const message = `${id}/agent.cordis.yml 未发现任何插件 row（不得以 0 射程通过）`
      violations.push(message)
      facts.fileFailures.push({ presetId: id, reason: message })
    }
    for (const problem of scan.problems) {
      const message = `${id}/agent.cordis.yml:${problem.line}: ${problem.message}`
      violations.push(message)
      facts.fileFailures.push({ presetId: id, reason: message })
    }
    for (const hit of scan.placeholders) {
      const message = `${id}/agent.cordis.yml:${hit.line}: 残留打包面占位符 ${hit.token}（预设行不展开占位符，只允许出现在 cordis.patch.yml）`
      violations.push(message)
      facts.fileFailures.push({ presetId: id, reason: message })
    }

    const idCounts = new Map()
    for (const row of scan.rows) {
      if (row.id !== null) idCounts.set(row.id, (idCounts.get(row.id) ?? 0) + 1)
    }
    const duplicateIds = new Set([...idCounts].filter(([, count]) => count > 1).map(([rowId]) => rowId))
    for (const rowId of duplicateIds) {
      violations.push(`${id}/agent.cordis.yml: 重复 row id ${JSON.stringify(rowId)}`)
    }

    for (const row of scan.rows) {
      let status = 'checked'
      let reason = null
      if (row.id !== null && duplicateIds.has(row.id)) {
        status = 'failed'
        reason = `row id ${JSON.stringify(row.id)} 重复`
      } else if (row.disabled === 'conditional') {
        status = 'failed'
        reason = 'disabled 是未知 dynamic expression，无法判定（conditional）'
      } else if (row.disabled === true) {
        status = 'disabled'
      } else if (!rowResolves(row.name, join(userRoot, id), profileBase)) {
        status = 'failed'
        reason = `行 ${JSON.stringify(row.name)} 在当前解析面无法解析`
          + '（绝对/相对/file: 路径不存在，或包名在 profile node_modules 向上不可达）'
      }
      metrics.discovered += 1
      metrics[status] += 1
      const fact = {
        stableId: `${id}:${row.rowPath}${row.id === null ? '' : `#${row.id}`}`,
        presetId: id,
        rowPath: row.rowPath,
        entryId: row.id,
        name: row.name,
        kind: classifyRowSpecifier(row.name).kind,
        line: row.line,
        status,
        ...(reason === null ? {} : { reason }),
      }
      facts.rows.push(fact)
      if (reason !== null) {
        violations.push(`${id}/agent.cordis.yml:${row.line}: ${reason}`)
      }
    }
  }
  const conserved = metrics.discovered === metrics.checked + metrics.disabled + metrics.failed
  if (!conserved) violations.push('live-presets 内部计数不守恒')
  const status = violations.length === 0 ? 'pass' : 'fail'
  return result(
    status,
    violations,
    `核对 ${facts.presetFiles}/${facts.presetDirectories} 个预设文件 / ${metrics.discovered} 个插件行`
      + `（checked=${metrics.checked}, disabled=${metrics.disabled}, failed=${metrics.failed}）`,
  )
}

/**
 * 把逐 row 事实压成可入库的结构清单。摘要只绑定稳定 ID、specifier 与类型；不保存 config、
 * 凭证或其他用户内容。故意不绑定 disabled 的当前真值，因为 win32/macOS 的分类不同。
 */
export function buildLivePresetInventory(result) {
  if (!result || result.status !== 'pass' || result.metrics?.failed !== 0) {
    throw new Error('只能从完整通过的 live-presets 结果生成 inventory')
  }
  const grouped = new Map()
  for (const row of result.facts?.rows ?? []) {
    const rows = grouped.get(row.presetId) ?? []
    rows.push(row)
    grouped.set(row.presetId, rows)
  }
  const presets = [...grouped]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([presetId, rows]) => ({
      presetId,
      rowCount: rows.length,
      rowIdentitySha256: hashRowIdentities(rows),
    }))
  return {
    schemaVersion: 1,
    identity: 'stableId\u0000name\u0000kind',
    presetCount: presets.length,
    rowCount: presets.reduce((total, preset) => total + preset.rowCount, 0),
    presets,
  }
}

/** 验证 inventory 自身，再与当前逐 row 事实比较；任何删、增、改名或换类型都会漂移。 */
export function compareLivePresetInventory(result, expectedInventory) {
  const violations = validateLivePresetInventory(expectedInventory)
  if (violations.length > 0) return violations
  if (!result || result.status === 'skip') return []

  const actual = buildInventoryFromFacts(result.facts?.rows ?? [])
  const expectedById = new Map(expectedInventory.presets.map((preset) => [preset.presetId, preset]))
  const actualById = new Map(actual.presets.map((preset) => [preset.presetId, preset]))
  if (actual.presetCount !== expectedInventory.presetCount) {
    violations.push(`preset inventory 数量漂移：expected=${expectedInventory.presetCount}, actual=${actual.presetCount}`)
  }
  if (actual.rowCount !== expectedInventory.rowCount) {
    violations.push(`preset row inventory 分母漂移：expected=${expectedInventory.rowCount}, actual=${actual.rowCount}`)
  }
  for (const [presetId, expected] of expectedById) {
    const observed = actualById.get(presetId)
    if (!observed) {
      violations.push(`preset inventory 缺失：${presetId}`)
      continue
    }
    if (observed.rowCount !== expected.rowCount || observed.rowIdentitySha256 !== expected.rowIdentitySha256) {
      violations.push(
        `${presetId} row inventory 漂移：expected=${expected.rowCount}/${expected.rowIdentitySha256}, `
          + `actual=${observed.rowCount}/${observed.rowIdentitySha256}`,
      )
    }
  }
  for (const presetId of actualById.keys()) {
    if (!expectedById.has(presetId)) violations.push(`preset inventory 出现未登记项：${presetId}`)
  }
  return violations
}

/**
 * 总门禁入口：inventory 是必备治理文件。用户根整体不存在仍是 skip，但清单缺失或损坏
 * 必须先 fail，不能借可选环境缺失绕过仓库内契约。
 */
export function checkLivePresetsAgainstInventory({
  userRoot = DEFAULT_USER_PRESET_ROOT,
  profileBase = DEFAULT_PROFILE_BASE,
  inventoryPath = DEFAULT_INVENTORY_PATH,
} = {}) {
  const result = checkLivePresets({ userRoot, profileBase })
  let inventory
  try {
    inventory = JSON.parse(readFileSync(inventoryPath, 'utf8'))
  } catch (error) {
    return failInventoryResult(
      result,
      `必备 live preset inventory 无法读取：${inventoryPath}（${error instanceof Error ? error.message : String(error)}）`,
    )
  }
  const inventoryViolations = compareLivePresetInventory(result, inventory)
  if (inventoryViolations.length === 0) {
    return {
      ...result,
      facts: { ...result.facts, inventory: { path: inventoryPath, matched: result.status !== 'skip' } },
    }
  }
  return failInventoryResult(result, ...inventoryViolations)
}

/** 把 live row 分类映射为 QG-001 canonical schema，供总 gate 使用。 */
export function toCanonicalLivePresetResult(result) {
  if (result.status === 'skip') {
    return {
      status: 'skip',
      expected: 1,
      discovered: 0,
      checked: 0,
      skipped: 1,
      failed: 0,
      typedSkips: [{ type: 'optional-live-preset-root-missing', count: 1, reason: result.note }],
      reason: result.note,
      note: result.note,
      violations: [],
    }
  }

  const failed = result.status === 'fail'
  const disabled = result.metrics?.disabled ?? 0
  const rows = result.facts?.rows ?? []
  return {
    status: failed ? 'fail' : disabled > 0 ? 'skip' : 'pass',
    // 除逐 row 分类外，另有一个「根/文件/解析/inventory 完整性」对象。
    expected: (result.metrics?.discovered ?? 0) + 1,
    discovered: (result.metrics?.discovered ?? 0) + 1,
    checked: (result.metrics?.checked ?? 0) + (failed ? 0 : 1),
    skipped: disabled,
    failed: (result.metrics?.failed ?? 0) + (failed ? 1 : 0),
    typedSkips: disabled > 0
      ? [{
          type: 'disabled-preset-row',
          count: disabled,
          reason: '宿主在当前平台明确禁用这些 preset rows',
          objects: rows.filter((row) => row.status === 'disabled').map((row) => row.stableId),
        }]
      : [],
    reason: failed
      ? 'live preset row、解析或 inventory 契约失败'
      : disabled > 0
        ? '所有 live preset rows 均已分类；其中部分由宿主在当前平台明确禁用'
        : '所有 live preset rows 与 inventory 均已核对',
    note: `${result.note}；另核 1 个根/文件/解析/inventory 完整性对象`,
    violations: result.violations,
  }
}

function buildInventoryFromFacts(rows) {
  const grouped = new Map()
  for (const row of rows) {
    const list = grouped.get(row.presetId) ?? []
    list.push(row)
    grouped.set(row.presetId, list)
  }
  const presets = [...grouped]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([presetId, entries]) => ({
      presetId,
      rowCount: entries.length,
      rowIdentitySha256: hashRowIdentities(entries),
    }))
  return {
    presetCount: presets.length,
    rowCount: presets.reduce((total, preset) => total + preset.rowCount, 0),
    presets,
  }
}

function hashRowIdentities(rows) {
  const payload = [...rows]
    .sort((a, b) => a.stableId.localeCompare(b.stableId))
    .map((row) => `${row.stableId}\u0000${row.name}\u0000${row.kind}`)
    .join('\n')
  return createHash('sha256').update(payload).digest('hex')
}

function validateLivePresetInventory(inventory) {
  const violations = []
  if (!inventory || typeof inventory !== 'object' || Array.isArray(inventory)) {
    return ['live preset inventory 必须是 object']
  }
  if (inventory.schemaVersion !== 1) violations.push('live preset inventory schemaVersion 必须为 1')
  if (inventory.identity !== 'stableId\u0000name\u0000kind') violations.push('live preset inventory identity 契约不受支持')
  if (!Number.isInteger(inventory.presetCount) || inventory.presetCount < 0) violations.push('inventory presetCount 非法')
  if (!Number.isInteger(inventory.rowCount) || inventory.rowCount < 0) violations.push('inventory rowCount 非法')
  if (!Array.isArray(inventory.presets)) return [...violations, 'inventory presets 必须是数组']
  const seen = new Set()
  let rows = 0
  for (const [index, preset] of inventory.presets.entries()) {
    if (!preset || typeof preset !== 'object' || Array.isArray(preset)) {
      violations.push(`inventory presets[${index}] 非法`)
      continue
    }
    if (typeof preset.presetId !== 'string' || !PRESET_ID.test(preset.presetId)) {
      violations.push(`inventory presets[${index}].presetId 非法`)
    } else if (seen.has(preset.presetId)) {
      violations.push(`inventory presetId 重复：${preset.presetId}`)
    } else {
      seen.add(preset.presetId)
    }
    if (!Number.isInteger(preset.rowCount) || preset.rowCount <= 0) {
      violations.push(`inventory ${preset.presetId ?? index} rowCount 非法`)
    } else {
      rows += preset.rowCount
    }
    if (typeof preset.rowIdentitySha256 !== 'string' || !/^[a-f0-9]{64}$/.test(preset.rowIdentitySha256)) {
      violations.push(`inventory ${preset.presetId ?? index} rowIdentitySha256 非法`)
    }
  }
  if (Number.isInteger(inventory.presetCount) && inventory.presetCount !== inventory.presets.length) {
    violations.push(`inventory presetCount 不守恒：${inventory.presetCount} != ${inventory.presets.length}`)
  }
  if (Number.isInteger(inventory.rowCount) && inventory.rowCount !== rows) {
    violations.push(`inventory rowCount 不守恒：${inventory.rowCount} != ${rows}`)
  }
  return violations
}

function failInventoryResult(result, ...violations) {
  return {
    ...result,
    passed: false,
    status: 'fail',
    skipped: false,
    violations: [...result.violations, ...violations],
    note: `${result.note}；inventory 未通过（${violations.length} 项）`,
    facts: { ...result.facts, inventory: { matched: false, violations } },
  }
}

// CLI 入口：默认核对 inventory；--print-inventory 只读重采候选清单，仍需人工审查后用 patch 入库。
function parseArgs(argv) {
  const out = {
    userRoot: DEFAULT_USER_PRESET_ROOT,
    profileBase: DEFAULT_PROFILE_BASE,
    inventoryPath: DEFAULT_INVENTORY_PATH,
    json: false,
    printInventory: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--user-root') out.userRoot = requiredArg(argv, ++i, a)
    else if (a === '--profile-base') out.profileBase = requiredArg(argv, ++i, a)
    else if (a === '--inventory') out.inventoryPath = requiredArg(argv, ++i, a)
    else if (a === '--json') out.json = true
    else if (a === '--print-inventory') out.printInventory = true
    else if (a === '--help' || a === '-h') {
      console.log('用法：node scripts/gates/live-presets.mjs [--user-root <dir>] [--profile-base <dir>] [--inventory <file>] [--json|--print-inventory]')
      process.exit(0)
    } else {
      console.error(`未知参数：${a}`)
      process.exit(2)
    }
  }
  return out
}

function requiredArg(argv, index, flag) {
  const value = argv[index]
  if (value === undefined || value.startsWith('--')) {
    console.error(`${flag} 缺少值`)
    process.exit(2)
  }
  return value
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = parseArgs(process.argv.slice(2))
  if (args.printInventory) {
    const scanned = checkLivePresets(args)
    if (scanned.status !== 'pass') {
      for (const violation of scanned.violations) console.error(`✗ ${violation}`)
      process.exit(1)
    }
    console.log(JSON.stringify(buildLivePresetInventory(scanned), null, 2))
    process.exit(0)
  }
  const result = checkLivePresetsAgainstInventory(args)
  if (args.json) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    for (const v of result.violations) console.log(`✗ ${v}`)
    console.log(result.note ?? '')
    if (result.passed) console.log('✓ live-presets 通过')
  }
  process.exit(result.passed ? 0 : 1)
}
