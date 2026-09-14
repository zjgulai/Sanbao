#!/usr/bin/env node
/**
 * 出货预设的**行级**闭合判据：每一条插件行都必须在**出货面**里解析得到。
 *
 * ## 为什么需要它（2026-09-14 实测，代价是 2.4.0 已经发到客户机上）
 *
 * 客户装完 2.4.0 后打开 DSH，`结伴 · 达人与联盟合作`（`agt-033`）这个 preset **加载失败**。
 * 成因是出货的 `presets/agt-033/agent.cordis.yml` 里带着这一行：
 *
 *     # 本机装配：深链星探 KOL Hunter（ADR-0061）
 *     - id: product-kol-hunter
 *       name: 'dsh-kol-hunter-local'
 *
 * 而客户机的出货 profile 里**没有** `dsh-kol-hunter-local`（依赖与 bundle 都被剥掉了，这是
 * ADR-0056 要求的）。行还在、包没了 → 该 preset 里那条行解析不到 → 整个 preset 加载失败。
 *
 * ## 为什么原有的守卫看不见它（这才是要修的东西）
 *
 * 已有的 `strip-local-products.mjs` 判据是**反向特征**：先在暂存 profile 的 `file:` 依赖里
 * 算出「外部产品名」集合，再拿这个名字去删补丁行。它的真值因此**依赖于开发机此刻的状态**——
 * 而那份状态已经被抹掉了：2.4.0 装配（09-14 11:2x）时，本机 profile 的
 * `dsh-kol-hunter-local` 依赖与 bundle 早在 09-13 的安装里就没了，只剩 preset 里这一行。
 * 于是 extNames 为空，脚本如实报告「✓ 出货面没有本机装配的外部产品」，而唯一残留的痕迹
 * 大摇大摆地出了门。**同一份 preset、同一台机器、两种状态，判据给出相反的结论**：
 *
 *     node strip-local-products.mjs --profile <09-13 的 profile 备份> --presets <出货副本> --dry-run
 *       → [strip] 移除 补丁行: agt-033/agent.cordis.yml: - id: product-kol-hunter
 *     node strip-local-products.mjs --profile <09-14 装配时的那份 profile> … --dry-run
 *       → [strip] 外部产品 0 个（无）／✓ 出货面没有本机装配的外部产品      ← 那一版就是这么发的
 *
 * ## 本判据：改成**正向闭合**，事实来源换成「出货面」而不是「本机」
 *
 * 「这一行能不能被解析」是**出货那个东西**的性质，不是开发机的性质。所以这里不再问
 * 「本机有没有挂外部产品」，而是问：这一行的 `name` 在**出货面**（出货 profile 的
 * `node_modules` ∪ app 内嵌的 `node_modules` ∪ 显式登记的内置名）里存在吗？
 *
 * - 在 → 放行；
 * - 不在，且**已登记**它只在本机装配（`packaging/local-only-preset-rows.json` 的 `localOnly`）
 *   → 从**出货副本**里剥掉并逐个点名。**登记即权威**：哪怕本机此刻真的装了这个包，
 *   它也不出货——「本机装没装」不是出货面的性质，这正是上一版判据失效的原因；
 * - 不在，且**未登记** → 中止并点名到「文件 + 行 + 包名」。未登记 = 没人表过态。
 *
 * 与 ADR-0073（目录级白名单）/ ADR-0074（技能级白名单）是同一套语法的第三层：**行的级**。
 * 「未登记即中止」的牙留在真正的未知形态上；已评审的例外写成一次可评审的表态（必须写 why）。
 *
 * ## 边界（诚实写清楚，免得被当成全覆盖）
 *
 * - 只查**出货副本**里 `presets/<预设>/agent.cordis.yml` 的顶层行；profile 的 `cordis.patch.yml`
 *   与锁文件仍由 `strip-local-products.mjs` 管（那两处的判据是「外部产品」，与「出货面能否解析」
 *   不同：patch 层里可以合法地引用仓库内 `file:./vendor/` 的包）；
 * - 解析面是**目录存在性**，不是 Node 的模块解析算法：不查 `exports`/`main`、不查包的
 *   `package.json` 名字与目录名不一致的情形（2026-09-14 实测 919 行里两者一致；
 *   不一致会被判成「不存在」→ 响亮失败 → 由人决定，不会静默放行）；
 * - 只认我们自己的生成器产出的那种 YAML 形态（见 `lib/yaml-rows.mjs` 的边界说明）。
 *
 * ## 用法
 *
 *     node check-preset-rows.mjs --presets <出货副本 presets> \
 *          --node-modules <出货 profile 的 node_modules> \
 *          [--node-modules <app 内嵌 node_modules>]… \
 *          --config packaging/local-only-preset-rows.json [--strip] [--quiet]
 *
 * 退出码：0 = 出货面每一行都解析得到（含已按登记剥离的情况）；
 *         1 = 有未登记的不可解析行 / 登记与现实不符；
 *         2 = 用法、配置或解析面本身有问题（**响亮失败，不退化成「无发现」**）。
 */
import { existsSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { rowFields, splitOwnBlock, splitRowBlocks } from './lib/yaml-rows.mjs'

/** 解析命令行。未知选项即失败——静默吞掉一个选项会让判据悄悄少看一眼。 */
export function parseArgs(argv) {
  const out = { presets: undefined, nodeModules: [], config: undefined, strip: false, quiet: false }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--presets') out.presets = argv[++i]
    else if (a === '--node-modules') out.nodeModules.push(argv[++i])
    else if (a === '--config') out.config = argv[++i]
    else if (a === '--strip') out.strip = true
    else if (a === '--quiet') out.quiet = true
    else throw new Error(`未知参数: ${a}`)
  }
  if (!out.presets) throw new Error('缺少必需参数 --presets')
  if (out.nodeModules.length === 0) {
    throw new Error('缺少必需参数 --node-modules（解析面；没有一个解析面就无法判断「出货面里有没有它」）')
  }
  if (!out.config) throw new Error('缺少必需参数 --config')
  return out
}

/**
 * 读并校验登记处。配置本身也要能被判否——缺文件、缺 why 都算坏输入：
 * 「名单读不到就当空名单」是 ADR-0074 明确否决过的死法（15 个技能就是这样无声少发的）。
 * @param {string} path 配置路径
 */
export function readConfig(path) {
  const raw = JSON.parse(readFileSync(path, 'utf8'))
  const builtins = Array.isArray(raw.builtins) ? raw.builtins : []
  const localOnly = Array.isArray(raw.localOnly) ? raw.localOnly : []
  for (const [field, list] of [['builtins', builtins], ['localOnly', localOnly]]) {
    for (const entry of list) {
      if (typeof entry?.name !== 'string' || entry.name.length === 0) {
        throw new Error(`${field} 条目缺少 name`)
      }
      if (typeof entry?.why !== 'string' || entry.why.trim().length === 0) {
        throw new Error(`${field} 条目 "${entry.name}" 缺少 why——登记而不写理由的名单会腐烂成谎话`)
      }
      if (field === 'localOnly' && (typeof entry.preset !== 'string' || typeof entry.id !== 'string')) {
        throw new Error(`localOnly 条目 "${entry.name}" 必须同时写 preset 与 id（只按包名匹配会把别的预设里的同名行一起剥掉）`)
      }
    }
  }
  return { builtins, localOnly }
}

/**
 * 从一个 `name` 值里取出它要的**包名**。
 *
 * 出货副本里实测到三种形态（2026-09-14，919 条顶层行 + 663 条容器内行）：
 *   ① 裸包名：`dsh-skill-subset`、`@deepseek-ai/dsh-tool-subagent`;
 *   ② 包名 + 入口子路径：`@deepseek-ai/dsh-tool-subagent-control/list-agents`
 *      —— 平台按「包 / 入口」寻址，字面路径在 node_modules 里不存在，取包名才是对的；
 *   ③ profile 平面里的绝对路径（`__DSH_HOME__` 占位符安装时替换）：
 *      `__DSH_HOME__/profiles/desktop/node_modules/@aiwayds/dsh-dcp/lib/index.js`
 *      —— lute-cordis 用它是有理由的（预设行的包名解析 base 是 harness 安装目录，
 *      裸名从那里向上走不到 profile 平面），所以判据取 `node_modules/` 之后的那一段。
 * **子路径本身不校验**：入口名由包的 `exports` 决定，目录存在性看不见它——这是本判据
 * 明说的边界，不猜。
 * @param {string} name 行里声明的 name
 * @returns {{pkg: string, form: 'bare' | 'subpath' | 'path'}}
 */
export function packageNameOf(name) {
  const marker = name.lastIndexOf('node_modules/')
  if (marker !== -1) return { pkg: pkgPart(name.slice(marker + 'node_modules/'.length)), form: 'path' }
  if (name.startsWith('/') || name.startsWith('.') || name.startsWith('__')) {
    // 仓库外的裸路径（既没有 node_modules 也不是包名）：整串当「包名」查，必然查不到 →
    // 判违规，并在消息里如实报出它的形态。判据不去猜它指向什么。
    return { pkg: name, form: 'path' }
  }
  const parts = name.split('/')
  const isSubpath = name.startsWith('@') ? parts.length > 2 : parts.length > 1
  return { pkg: pkgPart(name), form: isSubpath ? 'subpath' : 'bare' }
}

/** 取路径串开头的包名（scoped 取两段，其余取一段）。 */
function pkgPart(spec) {
  const parts = spec.split('/').filter((p) => p.length > 0)
  if (parts.length === 0) return spec
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
}

/**
 * 出货面解析：`name` 是不是出货那个东西能装上的东西。
 * @param {string} name 行里声明的包名（或内置名）
 * @param {string[]} roots 解析面根目录（出货 profile 的 node_modules、app 内嵌 node_modules）
 * @param {Set<string>} builtins 显式登记的内置名
 */
export function resolvable(name, roots, builtins) {
  if (builtins.has(name)) return true
  const { pkg } = packageNameOf(name)
  if (builtins.has(pkg)) return true
  return roots.some((root) => existsSync(join(root, pkg)))
}

/**
 * 纯判定：把「预设 → 行」摊平成判定结果，便于自测直接喂坏输入。
 *
 * 只判**声明了 `name` 的行**：出货副本里还有 152 条不含 `name` 的 `- ` 行，它们是
 * instructions 文本里的 Markdown 列表项与 `customSkillDirs` 之类的列表项（2026-09-14 实测
 * 分类：顶层 919 条行 + 容器内 663 条行全部 id+name；不含 name 的 152 条全部在更深缩进），
 * 不是插件行。
 * @param {Array<{preset: string, file: string, lines: string[]}>} files 出货副本里的组合文件
 * @param {{roots: string[], builtins: Set<string>, localOnly: Array<{preset: string, id: string, name: string, why: string}>}} surface 出货面
 */
export function judge(files, surface) {
  const violations = []
  const stale = []
  const rows = []
  let rowCount = 0
  let nonRowCount = 0
  const matchedDeclarations = new Set()

  for (const { preset, file, lines } of files) {
    for (const block of splitRowBlocks(lines)) {
      if (block.lead === true) continue
      const { own } = splitOwnBlock(block)
      const { id, name } = rowFields(own)
      const lineNo = block.start + 1
      if (name === undefined) {
        nonRowCount += 1
        continue
      }
      rowCount += 1
      const decl = surface.localOnly.find((d) => d.preset === preset && d.id === id && d.name === name)
      if (decl !== undefined) {
        matchedDeclarations.add(`${preset}|${id}|${name}`)
        rows.push({ preset, file, lineNo, id, name, idText: own[0].trim(), verdict: 'strip', why: decl.why })
        continue
      }
      if (!resolvable(name, surface.roots, surface.builtins)) {
        // 一条判定、两种解释：判据只回答「出货面里有没有它」，消息按形态说清它是哪一种坏法。
        const { pkg, form } = packageNameOf(name)
        const shape =
          form === 'path'
            ? `这是**路径形态**的 name（取到 \`${pkg}\` 仍不在出货面里）——ADR-0056 不许出货 preset 烘焙本机/仓库外的路径`
            : `包名 \`${pkg}\` 不在出货面里`
        violations.push(
          `${file}:${lineNo}: \`- id: ${id ?? '?'}\` 的 name \`${name}\` 在出货面里**解析不到**：${shape}。` +
            `客户机上这条行解析不到，会让整个 preset 加载失败（2026-09-14 实测：2.4.0 的 agt-033 就是这样让「结伴」加载失败的）。` +
            `出路两条：① 它是本机装配的行 → 登记进 packaging/local-only-preset-rows.json 的 localOnly（写清 why），出货副本会剥掉它；` +
            `② 它本该随包出货 → 把该包装进出货面（依赖 / bundle / app 内嵌三者之一），而不是让行悬空。`,
        )
        continue
      }
      rows.push({ preset, file, lineNo, id, name, idText: own[0].trim(), verdict: 'ok' })
    }
  }

  for (const decl of surface.localOnly) {
    if (!matchedDeclarations.has(`${decl.preset}|${decl.id}|${decl.name}`)) stale.push(`${decl.preset}: ${decl.id} (${decl.name})`)
  }
  return { rows, rowCount, nonRowCount, violations, stale }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const presetsDir = resolve(args.presets)
  const configPath = resolve(args.config)
  if (!existsSync(presetsDir)) throw new Error(`出货副本 presets 目录不存在: ${presetsDir}`)
  if (!existsSync(configPath)) {
    throw new Error(
      `登记处不存在: ${configPath}——「读不到就当没有本机行」正是这一版缺陷的死法，故此处响亮失败。`,
    )
  }
  const config = readConfig(configPath)

  const roots = args.nodeModules.map((r) => resolve(r))
  for (const root of roots) {
    if (!existsSync(root)) {
      throw new Error(`解析面不存在: ${root}——判据必须看得见出货面，看不见就不能报「没问题」。`)
    }
  }

  const files = readdirSync(presetsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(presetsDir, e.name, 'agent.cordis.yml')))
    .map((e) => ({
      preset: e.name,
      file: `presets/${e.name}/agent.cordis.yml`,
      abs: join(presetsDir, e.name, 'agent.cordis.yml'),
      lines: readFileSync(join(presetsDir, e.name, 'agent.cordis.yml'), 'utf8').split('\n'),
    }))
  if (files.length === 0) throw new Error(`${presetsDir} 里没有任何 presets/*/agent.cordis.yml（空射程不能读成通过）`)

  const verdict = judge(files, {
    roots,
    builtins: new Set(config.builtins.map((b) => b.name)),
    localOnly: config.localOnly,
  })

  const skipped = []
  if (args.strip) {
    for (const { preset, abs, lines } of files) {
      const stripKeys = new Set(
        verdict.rows.filter((r) => r.preset === preset && r.verdict === 'strip').map((r) => `${r.id}|${r.name}`),
      )
      if (stripKeys.size === 0) continue
      // 丢弃范围 = 被登记的那条行**整块**（含其后的空行）∪ 紧贴其上的注释块。
      // 注释属于它所描述的那条行：只删行不删注释，出货副本里会留下一句「说明一条并不存在的行」
      // 的话（2026-09-14 实测第一版就是这样，剥完 2.4.0 的 agt-033 后那三行注释还挂在原地）。
      const drop = new Set()
      for (const block of splitRowBlocks(lines)) {
        if (block.lead === true) continue
        const { id, name } = rowFields(splitOwnBlock(block).own)
        if (!stripKeys.has(`${id}|${name}`)) continue
        for (let i = block.start; i < block.start + block.lines.length; i += 1) drop.add(i)
        for (let up = block.start - 1; up >= 0 && /^\s*#/.test(lines[up]); up -= 1) drop.add(up)
      }
      const next = lines
        .filter((_, i) => !drop.has(i))
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
      if (next !== lines.join('\n')) writeFileSync(abs, next)
    }
  }

  const userRows = verdict.rows.filter((r) => r.verdict !== 'strip')
  if (!args.quiet) {
    console.log(
      `[preset-rows] 出货面解析：${files.length} 个预设 / ${verdict.rowCount} 条顶层行；` +
        `解析面 = ${roots.join(' + ')}（含登记内置 ${config.builtins.map((b) => b.name).join('、') || '无'}）`,
    )
    for (const r of verdict.rows.filter((x) => x.verdict === 'strip')) {
      skipped.push(`${r.preset}: ${r.idText} (${r.name})`)
      console.log(
        `[preset-rows] · ${args.strip ? '已剥离' : '待剥离'}本机行: ${r.file}:${r.lineNo} ${r.idText} (${r.name})` +
          ` —— ${r.why}${args.strip ? '' : '（当前是判定模式，加 --strip 才落盘）'}`,
      )
    }
    if (verdict.stale.length > 0) {
      console.log(
        `[preset-rows] ⚠ localOnly 里登记的 ${verdict.stale.join('、')} 在出货副本里不存在——名单过期了，` +
          `要么它回来了、要么把这条登记删掉（告警不判红：少一条「已评审的例外」不会让任何东西被发出去）`,
      )
    }
  }

  if (verdict.violations.length > 0) {
    console.error(`[preset-rows] ✗ 有 ${verdict.violations.length} 条行在出货面里解析不到，拒绝打包：`)
    for (const v of verdict.violations) console.error(`    ${v}`)
    return 1
  }
  if (!args.quiet) {
    console.log(
      `[preset-rows] ✓ ${files.length} 个预设的 ${userRows.length} 条出货行全部在解析面内` +
        `${skipped.length > 0 ? `（另有 ${skipped.length} 条本机装配行${args.strip ? '已剥离' : '待剥离'}）` : ''}`,
    )
  }
  return 0
}

/**
 * 判断本文件是不是被当作脚本执行。
 * 不能只比字符串：Node 的 ESM 加载器解析符号链接后 `import.meta.url` 是 realpath，而
 * `process.argv[1]` 保留传入形式；macOS 的 `$TMPDIR` 走 `/var → /private/var`，字符串比较
 * 会把「真跑」判成「被 import」→ **main 不执行、进程静默退出 0**（= 一条行都没查，装配却报成功）。
 * 这个坑在 `select-presets.mjs` 上实测过（见其自测 P1）。两侧都取 realpath；判不出来时按「跑」处理。
 */
function isEntryPoint() {
  if (process.argv[1] === undefined) return true
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return true
  }
}

if (isEntryPoint()) {
  try {
    process.exit(main())
  } catch (error) {
    console.error(`[preset-rows] ✗ ${error.message}`)
    process.exit(2)
  }
}
