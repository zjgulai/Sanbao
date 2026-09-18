#!/usr/bin/env node
/**
 * 门禁 `preset-config-schema` 的判据：**每一条 preset 行的 config，对着它引用的插件
 * 自己的 schema 校验一次**。
 *
 * ── 为什么需要它（2026-09-17 实测，代价是装完直接不可用）──────────────────────
 *
 * 2.5.0 装完，preset 树加载失败、日志以 ~10MB/2min 的速度洪泛、用户看到的现象是
 * 「输入会话，大模型没反应」：
 *
 *   [E] [preset-tree] failed to apply loader entry persona (@deepseek-ai/dsh-persona):
 *       invalid config: $.prefix missing required value (at prefix)
 *
 * 上游 2.0.10 把 `dsh-persona` 的配置键从 `text` 改成了 `prefix`（**必填**），而我们的
 * 53 个预设与产出它们的生成器仍写 `text:`。**没有任何判据会因此变红**：
 *
 *   - `live-presets` 核的是「每条行能不能解析得到」，它读 config 正文只为了找占位符；
 *   - `patch-anchors` / `verify-patches-v2` 核的是补丁在不在；
 *   - 装配链上的自检核的是行解析、路径形态、技能白名单。
 *
 * 三条缺陷（悬空路径常量 / v0 会话 `title` 被迁移器拒绝 / 本条）是**同一个形状**：
 * 基座升级改了一条事实，而我们的产物里还钉着旧值，且没有任何判据量它。这一条判据补的
 * 就是配置 schema 这一类事实——**判据必须量真消费面**（插件的 schema），不是量我们
 * 自己维护的键名表：手抄的表本身就是下一个会过期的「旧值」。
 *
 * ── 三层判据（缺一不可）────────────────────────────────────────────────────
 *
 * 1. **插件自己的 `Config` 调用一次**（与宿主 loader 同一个 schema、同一个调用点 ⇒ 同一个判罚）。
 *    缺必填键、类型不符由它判。
 * 2. **未声明键**：schemastery **不拒未知键**（实测 `{prefix, bogus}` 静默通过，而
 *    `{suffix}` 判红）。所以「上游改了键名、旧键还在、新键有默认值」这一形态，只靠第 1 层
 *    抓不到——必须自己算：row 的键集 ⊆ `Config.dict` 的键集。
 * 3. **取不到 schema / 解析不了 / 树不在场 → `unverifiable`**：单独计数，绝不并入「已核实」。
 *    射程为空（一个可校验的行都没有）报 **skip**，不是 pass。
 *
 * ── 边界（诚实写清楚）──────────────────────────────────────────────────────
 *
 * - 行抽取复用 `live-presets.mjs` 的受控解析器（`scanAgentCordis` 的 opt-in `includeConfig`），
 *   不新建第二份解析器：两份实现迟早分叉，而分叉时没有东西会说话（总账 P-07）。
 * - 只量 `package` 行；内置（`cordis:`）、preset 相对行、`file:`/绝对路径行不适用。
 * - `group: true` 行的 config 是 nested list 而不是对象，计 `notApplicable`。
 * - 校验对象是**渲染前**的 config：`{{model}}`/`{{cwd}}` 这类模板占位符原样是字符串，
 *   实测不产生假红（persona 的 prefix 带模板仍通过）。反过来，若某插件 schema 对值做了
 *   枚举/正则约束，模板串可能被判红——那时是**判据需要先渲染再校验**，不是这条判据的射程
 *   里可以糊过去的事，必须回来改这里。
 * - 判据量的是「能不能被这个 schema 接受」，不是「这条配置在语义上有没有用」。
 *
 * ── 契约 ───────────────────────────────────────────────────────────────────
 *
 * 结果沿用 legacy 面 `{passed, skipped, violations, note}`（与 `resource-path-reachability`
 * 同形，供 `scripts/gate.mjs` 消费）。CLI：`--json` 走 stdout、人读走 stderr；
 * 退出码 0 通过或 skip / 1 存在失败 / 2 用法错误。
 *
 * @module
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { nodeCommand } from '../lib/real-node.mjs'
import { classifyRowSpecifier, listPresetDirs, scanAgentCordis } from './live-presets.mjs'

const SELF = fileURLToPath(import.meta.url)
const REPO_ROOT = dirname(dirname(dirname(SELF)))

/** 本机用户预设根（live 面）。 */
export const DEFAULT_LIVE_PRESET_ROOT = join(homedir(), '.dsh', '.agent-presets')

/** 默认 app 树（插件 schema 的解析面）。 */
export const DEFAULT_APP_TREES = [
  // preset 行的第一解析面是 profile（宿主 packageInstalled 的 base），app 树次之。
  join(homedir(), '.dsh', 'profiles', 'desktop'),
  '/Applications/DSH Desktop.app/Contents/Resources/app',
]

/** 一段 YAML 的公共缩进剔除；空行原样保留。 */
export function dedent(text) {
  const lines = text.split('\n')
  let indent = null
  for (const line of lines) {
    if (line.trim() === '') continue
    const n = /^ */.exec(line)[0].length
    indent = indent === null ? n : Math.min(indent, n)
  }
  if (!indent) return text
  return lines.map((line) => (line.trim() === '' ? '' : line.slice(indent))).join('\n')
}

/** 一行文本里的第一条消息（schema 的 ValidationError 是多行的）。 */
function firstLine(text) {
  return String(text ?? '').split('\n')[0].trim()
}

/**
 * 判**一个已经解析好的 config 对象**（纯函数，反向自测直接喂对象，不依赖 YAML 解析器）。
 *
 * @param {{name: string, config: object, schema: {keys: string[]|null, validate: (o: object) => unknown}}} input
 * @returns {{status: 'ok'|'failed', reason?: string, weak?: boolean}}
 */
export function judgeConfigObject({ config, schema }) {
  try {
    schema.validate(config)
  } catch (error) {
    return { status: 'failed', reason: `schema 拒绝：${firstLine(error?.message)}` }
  }
  if (schema.keys) {
    const undeclared = Object.keys(config).filter((key) => !schema.keys.includes(key))
    if (undeclared.length > 0) {
      return {
        status: 'failed',
        reason: `未声明键 ${undeclared.join('、')}（该插件 schema 只声明 ${schema.keys.join('、')}）`,
      }
    }
  }
  // `keys === null` = 该插件的 Config 不是 object 形态（拿不到键集），只过了第 1 层。
  return { status: 'ok', weak: schema.keys === null }
}

/**
 * 判一条 preset 行。
 *
 * @param {{name: string, disabled: boolean|'conditional', config: {line: number, inline: string, text: string}|null}} target
 * @param {{schemaFor: (name: string) => {status: 'ok'|'unverifiable', schema?: object, reason?: string}, parseYaml: (text: string) => unknown}} deps
 * @returns {{status: 'ok'|'failed'|'unverifiable'|'notApplicable', reason?: string, weak?: boolean}}
 */
export function judgeTarget(target, deps) {
  const c = classifyRowSpecifier(target.name)
  if (c.kind !== 'package') return { status: 'notApplicable', reason: `非 package 行（${c.kind}）` }
  if (target.disabled === true) return { status: 'notApplicable', reason: 'disabled 行' }
  if (target.config === null) return { status: 'notApplicable', reason: '无 config' }

  const inline = target.config.inline.trim()
  const block = dedent(target.config.text)
  const yamlText = inline !== '' ? inline : block
  if (yamlText.trim() === '') return { status: 'notApplicable', reason: '空 config' }
  // group 行的 config 是 nested list（缩进为 0 的 `- ` 行），不是 mapping。
  if (inline === '' && block.split('\n').some((line) => /^-(\s|$)/.test(line))) {
    return { status: 'notApplicable', reason: 'group row（config 是 nested list）' }
  }

  let parsed
  try {
    parsed = deps.parseYaml(yamlText)
  } catch (error) {
    return { status: 'unverifiable', reason: `config 解析失败：${firstLine(error?.message)}` }
  }
  if (parsed === null || parsed === undefined) parsed = {}
  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { status: 'unverifiable', reason: 'config 不是 mapping' }
  }

  const found = deps.schemaFor(target.name)
  if (found.status !== 'ok') return { status: 'unverifiable', reason: found.reason }

  const verdict = judgeConfigObject({ config: parsed, schema: found.schema })
  return verdict.status === 'ok' ? { status: 'ok', weak: verdict.weak } : verdict
}

/** 收集 preset 根下的所有行（含 config 切片）。 */
export function collectTargets(sources) {
  const targets = []
  const problems = []
  for (const source of sources) {
    if (!existsSync(source.presetsRoot)) {
      problems.push(`${source.label}: 预设根不在场（${source.presetsRoot}）`)
      continue
    }
    for (const id of listPresetDirs(source.presetsRoot)) {
      const file = join(source.presetsRoot, id, 'agent.cordis.yml')
      if (!existsSync(file)) {
        problems.push(`${source.label}/${id}: 缺 agent.cordis.yml`)
        continue
      }
      const scanned = scanAgentCordis(readFileSync(file, 'utf8'), { includeConfig: true })
      for (const p of scanned.problems) problems.push(`${source.label}/${id}:${p.line} ${p.message}`)
      for (const row of scanned.rows) {
        targets.push({
          source: source.label,
          preset: id,
          rowId: row.id ?? row.rowPath,
          line: row.line,
          name: row.name,
          disabled: row.disabled,
          config: row.config ?? null,
        })
      }
    }
  }
  return { targets, problems }
}

/** 按四态把逐行判定压成计数与违规清单。 */
export function summarize(targets, verdicts, context = {}) {
  const counts = { ok: 0, failed: 0, unverifiable: 0, notApplicable: 0 }
  const weak = []
  const violations = []
  const unverifiableReasons = new Map()
  const notApplicableReasons = new Map()
  targets.forEach((target, i) => {
    const v = verdicts[i] ?? { status: 'unverifiable', reason: '无判定' }
    counts[v.status] = (counts[v.status] ?? 0) + 1
    const where = `${target.source}/${target.preset}/${target.rowId}:${target.line}`
    if (v.status === 'failed') violations.push(`${where} [${target.name}] ${v.reason}`)
    if (v.status === 'unverifiable') {
      unverifiableReasons.set(v.reason, (unverifiableReasons.get(v.reason) ?? 0) + 1)
    }
    if (v.status === 'notApplicable') {
      notApplicableReasons.set(v.reason, (notApplicableReasons.get(v.reason) ?? 0) + 1)
    }
    if (v.status === 'ok' && v.weak) weak.push(`${where} [${target.name}]`)
  })
  const breakdown = (map) =>
    [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([reason, n]) => `${reason}×${n}`)
      .join('；')
  const checked = counts.ok + counts.failed
  const note = [
    `射程：${context.span ?? '未记录'}`,
    `discovered=${targets.length} / checked=${checked}（ok=${counts.ok} failed=${counts.failed}）/ unverifiable=${counts.unverifiable} / notApplicable=${counts.notApplicable}`,
    counts.unverifiable > 0 ? `未核实面：${breakdown(unverifiableReasons)}（**未核实 ≠ 合格**）` : '',
    counts.notApplicable > 0 ? `不适用面：${breakdown(notApplicableReasons)}` : '',
    weak.length > 0 ? `另有 ${weak.length} 行只过了「schema 接受」这一层（该插件 Config 非 object 形态，拿不到键集）` : '',
    context.problems?.length > 0 ? `解析面另有 ${context.problems.length} 条问题：${context.problems.slice(0, 3).join('；')}` : '',
  ]
    .filter((s) => s !== '')
    .join('；')
  return { counts, violations, note, checked }
}

/** 组装成 gate 消费的 legacy 结果。 */
function toLegacyResult(summary, problems) {
  const violations = [...summary.violations]
  for (const p of problems) violations.push(`[解析面] ${p}`)
  return {
    // 与 resource-path-reachability 同形：判红只看真违规；射程为空另走 skipped。
    passed: violations.length === 0,
    skipped: summary.checked === 0,
    violations,
    note:
      summary.checked === 0
        ? `${summary.note} —— 一行都没有被真 schema 校验过（射程为空），报跳过而非通过`
        : summary.note,
  }
}

/** 已打 tag 的版本（`v<版本>`）：已发布的产物由归档负责，不再由发布前判据度量（ADR-0067）。
 *  读不到 tag（浅克隆 / git 不可用）时返回空数组——默认错误方向选「多量」。 */
export function taggedVersions(repoRoot = REPO_ROOT) {
  const r = spawnSync('git', ['-C', repoRoot, 'tag', '--list', 'v*'], { encoding: 'utf8' })
  if (r.status !== 0) return []
  return String(r.stdout ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((tag) => tag.replace(/^v/, ''))
}

/**
 * 待发布出货载荷（`packaging/staging/<版本>/payload/skills-presets.tar.gz`）。
 * 已打 tag 的版本默认排除：对它们长期判红等于养一条会被关掉的噪声规则（P-02 的死法）。
 */
export function presetRootsFromStaging(repoRoot = REPO_ROOT, { excludeVersions = [] } = {}) {
  const staging = join(repoRoot, 'packaging', 'staging')
  if (!existsSync(staging)) return []
  const out = []
  for (const version of readdirSync(staging)) {
    if (excludeVersions.includes(version)) continue
    const tarball = join(staging, version, 'payload', 'skills-presets.tar.gz')
    if (existsSync(tarball)) out.push({ label: `staging/${version}（出货载荷）`, tarball })
  }
  return out
}

/** 把所有出货载荷解到临时目录（只取 presets/），返回根与清理函数。 */
export function expandShippedSources(entries) {
  const temps = []
  const sources = []
  for (const entry of entries) {
    const dir = mkdtempSync(join(tmpdir(), 'preset-config-schema-'))
    temps.push(dir)
    const r = spawnSync('tar', ['-xzf', entry.tarball, '-C', dir, 'presets'], { encoding: 'utf8' })
    if (r.status !== 0) {
      sources.push({ label: `${entry.label} 解包失败`, presetsRoot: join(dir, 'presets') })
      continue
    }
    sources.push({ label: entry.label, presetsRoot: join(dir, 'presets') })
  }
  return { sources, cleanup: () => temps.forEach((d) => rmSync(d, { recursive: true, force: true })) }
}

/** 默认 app 树（存在才算）。 */
export function resolveAppTrees(explicit, repoRoot = REPO_ROOT) {
  const trees = []
  for (const tree of explicit ?? []) if (existsSync(join(tree, 'package.json'))) trees.push(tree)
  if (trees.length > 0) return trees
  const staged = []
  const staging = join(repoRoot, 'packaging', 'staging')
  if (existsSync(staging)) {
    for (const version of readdirSync(staging)) {
      staged.push(join(staging, version, 'app', 'DSH Desktop.app', 'Contents', 'Resources', 'app'))
    }
  }
  for (const tree of [...DEFAULT_APP_TREES, ...staged]) {
    if (existsSync(join(tree, 'package.json'))) trees.push(tree)
  }
  return trees
}

/**
 * 同步编排：抽行 → 子进程（import 插件 schema + 解析 config + 判定）→ 汇总。
 * `run()` 在 gate 里必须同步，所以重活全在子进程里。
 */
export function checkPresetConfigSchema({
  presetSources,
  appTrees,
  timeoutMs = 300000,
  span,
} = {}) {
  const { targets, problems } = collectTargets(presetSources)
  if (targets.length === 0) {
    return toLegacyResult(
      summarize([], [], { span: span ?? '（无预设根）', problems }),
      problems,
    )
  }
  const trees = appTrees ?? resolveAppTrees()
  const spec = {
    trees,
    targets: targets.map((t, i) => ({
      i,
      name: t.name,
      hasConfig: t.config !== null,
      inline: t.config?.inline ?? '',
      text: t.config?.text ?? '',
    })),
  }
  const { command, env } = nodeCommand()
  const child = spawnSync(command, [SELF, '--worker'], {
    input: JSON.stringify(spec),
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
    timeout: timeoutMs,
    env: { ...process.env, ...env },
  })
  if (child.status !== 0) {
    return toLegacyResult(
      summarize(targets, [], { span: span ?? describeSpan(presetSources), problems }),
      [
        ...problems,
        `worker 未给出可用结果（退出码 ${child.status ?? 'null'}）：${firstLine(child.stderr ?? '')}`,
      ],
    )
  }
  let parsed
  try {
    parsed = JSON.parse(child.stdout)
  } catch (error) {
    return toLegacyResult(summarize(targets, [], { span: span ?? describeSpan(presetSources), problems }), [
      ...problems,
      `worker 输出不是 JSON：${firstLine(error?.message)}`,
    ])
  }
  const verdicts = targets.map((_, i) => parsed.results?.[i] ?? { status: 'unverifiable', reason: 'worker 未判定' })
  const summary = summarize(targets, verdicts, {
    span: `${span ?? describeSpan(presetSources)}；schema 来源树：${(parsed.trees ?? trees).join('、') || '（无）'}`,
    problems,
  })
  return toLegacyResult(summary, problems)
}

function describeSpan(sources) {
  return sources.map((s) => s.label).join(' + ') || '（无）'
}

// ── 子进程：import 插件 schema、解析 config、逐行判定 ──────────────────────────

/**
 * 从 `base` 向上找 `node_modules/<pkg>/package.json`，读它的 `exports['.']`（import/default）
 * 或 `main`/`module`，返回入口文件绝对路径。遍历口径与宿主 `packageInstalled` 同构。
 *
 * 为什么不用 `import.meta.resolve(spec, parentBase)`：Node 26 下它对本判据给出的 parent
 * 一律 `ERR_MODULE_NOT_FOUND`（2026-09-17 实测，app 树与 profile 树都失败），而这里的
 * parent 恰恰是「某一棵 app/profile 树」，不是本模块自己。分辨率必须能被解释，
 * 不能靠一个说不清的 resolver 语义。
 */
export function resolvePackageEntry(pkg, base) {
  const root = pkg.split('/').slice(0, pkg.startsWith('@') ? 2 : 1).join('/')
  let dir = base
  for (;;) {
    const manifest = join(dir, 'node_modules', root, 'package.json')
    if (existsSync(manifest)) {
      let pkgJson
      try {
        pkgJson = JSON.parse(readFileSync(manifest, 'utf8'))
      } catch (error) {
        return { status: 'unverifiable', reason: `${root} 的 package.json 读不动：${firstLine(error?.message)}` }
      }
      const entry = pickEntry(pkgJson)
      if (!entry) {
        return { status: 'unverifiable', reason: `${root} 的 package.json 里 exports/main/module 都缺，入口不明` }
      }
      return { status: 'ok', file: join(dirname(manifest), entry) }
    }
    const parent = dirname(dir)
    if (parent === dir) return { status: 'unverifiable', reason: `在解析面里找不到插件（${root}）` }
    dir = parent
  }
}

/** 从 package.json 里挑入口（exports['.'] 的 import/default → module → main）。 */
function pickEntry(pkgJson) {
  const exported = pkgJson?.exports
  let value = null
  if (typeof exported === 'string') value = exported
  else if (exported && typeof exported === 'object') {
    const rootExport = '.' in exported ? exported['.'] : exported
    if (typeof rootExport === 'string') value = rootExport
    else if (rootExport && typeof rootExport === 'object') {
      value = rootExport.import ?? rootExport.default ?? rootExport.node ?? null
    }
  }
  if (!value) value = pkgJson?.module ?? pkgJson?.main ?? null
  if (typeof value !== 'string' || value === '') return null
  return value.startsWith('./') ? value.slice(2) : value
}

async function loadSchemaFor(pkg, trees) {
  const reasons = []
  for (const tree of trees) {
    const found = resolvePackageEntry(pkg, tree)
    if (found.status !== 'ok') {
      reasons.push(found.reason)
      continue
    }
    try {
      const mod = await import(pathToFileURL(found.file).href)
      const Config = mod?.Config ?? mod?.default?.Config
      if (!Config) return { status: 'unverifiable', reason: `插件未导出 Config（${pkg}）` }
      const keys =
        Config?.dict && typeof Config.dict === 'object' && !Array.isArray(Config.dict)
          ? Object.keys(Config.dict)
          : null
      return { status: 'ok', schema: { keys, validate: (object) => Config(object) } }
    } catch (error) {
      reasons.push(`import 失败（${pkg} @ ${tree}）：${firstLine(error?.message)}`)
    }
  }
  return { status: 'unverifiable', reason: reasons[0] ?? `schema 取不到（${pkg}）` }
}

async function loadYaml(trees) {
  for (const tree of trees) {
    const found = resolvePackageEntry('js-yaml', tree)
    if (found.status !== 'ok') continue
    try {
      const mod = await import(pathToFileURL(found.file).href)
      const yaml = mod?.default ?? mod
      if (typeof yaml?.load === 'function') return yaml
    } catch {
      continue
    }
  }
  return null
}

async function runWorker() {
  const spec = JSON.parse(readFileSync(0, 'utf8'))
  const trees = spec.trees ?? []
  const yaml = await loadYaml(trees)
  const cache = new Map()
  const results = []
  for (const target of spec.targets) {
    if (!yaml) {
      results[target.i] = { status: 'unverifiable', reason: '解析面里没有可用的 YAML 解析器（js-yaml）' }
      continue
    }
    let schema = cache.get(target.name)
    if (!schema) {
      schema = await loadSchemaFor(target.name, trees)
      cache.set(target.name, schema)
    }
    results[target.i] = judgeTarget(
      {
        name: target.name,
        disabled: false,
        // 「没有 config 的行」必须与「有 config 但正文为空」分开记：同一桶会掩盖形态
        config: target.hasConfig ? { line: 0, inline: target.inline, text: target.text } : null,
      },
      { schemaFor: () => schema, parseYaml: (text) => yaml.load(text) },
    )
  }
  process.stdout.write(JSON.stringify({ results, trees }) + '\n')
}

// ── CLI ─────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const roots = []
  const apps = []
  const skipVersions = []
  let json = false
  let noShipped = false
  let includeReleased = false
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--root') roots.push(argv[++i])
    else if (a === '--app') apps.push(argv[++i])
    else if (a === '--skip-version') skipVersions.push(argv[++i])
    else if (a === '--json') json = true
    else if (a === '--no-shipped') noShipped = true
    else if (a === '--include-released') includeReleased = true
    else return { error: `未知参数 ${a}` }
  }
  return { roots, apps, skipVersions, json, noShipped, includeReleased }
}

async function main() {
  const argv = process.argv.slice(2)
  if (argv.includes('--worker')) {
    await runWorker()
    return
  }
  const args = parseArgs(argv)
  if (args.error) {
    process.stderr.write(
      `[preset-config-schema] ${args.error}\n用法：--root <预设根>（可重复；缺省 = live 根 + 待发布出货载荷）--app <app 树>（可重复）--skip-version <版本>（可重复）--include-released --json --no-shipped\n`,
    )
    process.exitCode = 2
    return
  }
  const sources = []
  for (const root of args.roots) sources.push({ label: root, presetsRoot: root })
  if (args.roots.length === 0 || !args.noShipped) {
    if (args.roots.length === 0 && existsSync(DEFAULT_LIVE_PRESET_ROOT)) {
      sources.push({ label: 'live 根（~/.dsh/.agent-presets）', presetsRoot: DEFAULT_LIVE_PRESET_ROOT })
    }
    const excludeVersions = args.includeReleased
      ? args.skipVersions
      : [...new Set([...taggedVersions(), ...args.skipVersions])]
    const shipped = expandShippedSources(presetRootsFromStaging(REPO_ROOT, { excludeVersions }))
    sources.push(...shipped.sources)
    const result = checkPresetConfigSchema({ presetSources: sources, appTrees: resolveAppTrees(args.apps) })
    shipped.cleanup()
    emit(result, args.json)
    return
  }
  const result = checkPresetConfigSchema({ presetSources: sources, appTrees: resolveAppTrees(args.apps) })
  emit(result, args.json)
}

/**
 * `--json` 的载荷**必须有界**：gate 侧用 `runScript` 取流，它把输出截到 `SCRIPT_OUTPUT_TAIL`
 * （4000 字节）的**尾部**——一份 6KB 的 JSON 会被切掉头部，于是 `JSON.parse` 失败、门禁读成
 * 「判据没有产出读数」。所以载荷只带计数 + 前若干条违规，全量由 CLI 自己打。
 */
const VIOLATION_SAMPLE = 12

function emit(result, json) {
  if (json) {
    process.stdout.write(
      JSON.stringify({
        passed: result.passed,
        skipped: result.skipped,
        violationsTotal: result.violations.length,
        violations: result.violations.slice(0, VIOLATION_SAMPLE),
        note: result.note,
      }) + '\n',
    )
  }
  process.stderr.write(`[preset-config-schema] ${result.note}\n`)
  for (const v of result.violations) process.stderr.write(`  ✗ ${v}\n`)
  const ok = result.violations.length === 0
  process.exitCode = ok ? 0 : 1
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`[preset-config-schema] 运行失败：${error?.stack ?? error}\n`)
    process.exitCode = 1
  })
}
