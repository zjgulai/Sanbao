#!/usr/bin/env node
/**
 * verify-agent-fullstack.mjs — 「三无 · Agent全栈专家」preset 的门禁
 *
 * ## 为什么需要它
 *
 * 这个 preset 有七层东西会**同时腐烂**，而它们各自的症状都不指向根因：
 *
 *   1. **身份层**：`preset.yml` 的 name/description/order；
 *   2. **组合层**：`agent.cordis.yml` 的插件行是否可解析、有没有打包面占位符残留；
 *   3. **压缩后端层**：必须是官方 `compaction-basic`，且 config 里不许出现 dsh-dcp 私有键
 *      （`validateKeys` 抛错会让**整个压缩行不加载**，症状是「以为有压缩，实际没有」）；
 *   4. **技能子集层**：`skill-subset` 的 89 条白名单 —— 技能库改名/下线一条，
 *      这里就静默少一条，而页面照样显示 89，因为页面读的是这个文件；
 *   5. **调用开关层**：`respectFileFlags` 必须是 `true`。
 *      这一条最阴：**它是唯一一个「少写一行 config 不会报任何错」的项** ——
 *      缺省 false 时子集内所有技能被强制 modelInvocable/userInvocable = true，
 *      技能文件里的开关全部失效，而加载、日志、页面读数一律正常；
 *   6. **人格层**：`persona` 行的正文必须等于 `SOUL.md` 的渲染结果。
 *      腐烂形态最安静：人格变成骨架占位、被截断成半段、或者只留下开场白而丢掉
 *      M00–M13 派活表，**加载、日志、页面读数全部正常**，只是模型不再按这十四节点干活。
 *   7. **头像层**：`preset.yml` 的 `icon:` 行必须存在，且等于图标库里那一条的物化副本。
 *      它是一坨几千字符的 base64，**没人读得动**，所以两种腐烂都不响：
 *      「丢」（行被删 → 卡片回落成没有头像）与「霉」（图标库重画过 → 副本还停在上一版的脸）。
 *
 * 故本文件对每一层给一条**独立可复算**的判据，且每条都先断言「能抽到」再断言「值对」：
 * 抽不到的检查会静默变成空转，而空转仍然报绿（本仓库的复发故障形态之一）。
 *
 * ## 为什么门禁正文是一个导出函数
 *
 * 判据必须**能说「不」**，而证明这一点只能靠突变自测。自测若要走子进程读退出码，
 * 每条突变就得复制一份 preset 目录；导出 `checkAgentFullstack()` 后自测能在 tmp 目录里
 * 造最小 fixture、直接看 `problems[]` 里出现了哪一条。CLI 只是它的一层壳。
 *
 * ## 用法
 *
 *   node scripts/verify-agent-fullstack.mjs
 *   node scripts/verify-agent-fullstack.mjs --preset-root <dir>   # 测另一份副本
 *   node scripts/verify-agent-fullstack.mjs --json
 */
import fs from 'node:fs'
import path from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
// 组合层解析器复用主仓那一份，不另写 —— 两份实现会在上游改解析规则时各自漂移。
// ⚠️ 这里必须是**相对说明符**：ESM 的 `import()` **不认绝对文件系统路径**（会把 `/Users/...`
// 当成裸包名，报 ERR_MODULE_NOT_FOUND）。第一版就是那样写的，而「路径对但协议不对」
// 这个错会把人引去查路径，其实是写法不对。
import { scanAgentCordis, rowResolves } from '../../../../scripts/gates/live-presets.mjs'
// 渲染函数只此一处：同步器写什么，门禁就校什么。
import { DEFAULT_SOUL_PATH, loadSoulBody, extractPersonaBody } from './sync-fullstack-persona.mjs'
// 头像同理：`renderIconLine` / `extractIcon` / 图标 id 只在同步器里定义一份。
import {
  DEFAULT_ICON_ID, DEFAULT_MANIFEST_PATH, loadAvatarEntry, extractIcon,
} from './sync-fullstack-avatar.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))

/** `compaction-basic` 的官方合法 config 键集（多一个键就让整行不加载）。 */
export const OFFICIAL_COMPACTION_KEYS = new Set([
  'thresholdRatio', 'retainRatio', 'retainTokens', 'summarizationProvider', 'summarizationModel',
  'maxTokens', 'compactionRetries', 'maxOverflowRetries', 'modelPolicies', 'auto',
])

/** 人格层要求逐条出现的三无条文。 */
export const THREE_NOS = ['无谄媚附和', '无编造未验证', '无越权承诺']
/** 人格层要求逐条出现的节点（M00–M13）。 */
export const NODE_IDS = Array.from({ length: 14 }, (_, i) => `M${String(i).padStart(2, '0')}`)
/** 人格正文的长度下限：低于它基本可以断定被截断或退化成开场白。 */
export const PERSONA_MIN_CHARS = 2000

/**
 * 逐层核对一个 agent-fullstack preset 副本。
 *
 * @param {object} [opts]
 * @param {string} [opts.presetRoot]  预设目录（默认 ~/.dsh/.agent-presets/agent-fullstack）
 * @param {string} [opts.soulPath]    人格事实源（默认仓库内的 presets/agent-fullstack/SOUL.md）
 * @param {string} [opts.skillsDir]   技能库根（默认 ~/.dsh/skills）
 * @param {string} [opts.profileBase] 行名解析面（默认 ~/.dsh/profiles/desktop）
 * @returns {{presetRoot: string, skipped: boolean, facts: object, problems: string[]}}
 */
export function checkAgentFullstack(opts = {}) {
  const PRESET_ROOT = opts.presetRoot
    ? path.resolve(opts.presetRoot)
    : path.join(homedir(), '.dsh', '.agent-presets', 'agent-fullstack')
  const SKILLS_DIR = opts.skillsDir ?? path.join(homedir(), '.dsh', 'skills')
  const profileBase = opts.profileBase ?? path.join(homedir(), '.dsh', 'profiles', 'desktop')
  const ICON_MANIFEST = opts.iconManifest ?? DEFAULT_MANIFEST_PATH

  const problems = []
  const facts = {}
  const need = (cond, msg) => { if (!cond) problems.push(msg) }

  // ── 0. 射程：预设目录不存在时「跳过并写明」，不判红 ─────────────────────────
  //
  // 本门禁校的是**本机运行时的用户预设**，而用户预设不进仓库。干净检出（CI、另一台机器、
  // 还没装过的开发机）上这个目录天然不存在 —— 那时判红会训练人忽略这条门禁，
  // 而真正该拦住的是「目录在、内容烂」。所以：没有目录 = 空射程，写明并跳过；
  // 有目录就逐层查。
  if (!fs.existsSync(PRESET_ROOT)) {
    return { presetRoot: PRESET_ROOT, skipped: true, facts, problems }
  }
  const skipped = false

  // ── 1. 身份层 ─────────────────────────────────────────────────────────────

  const presetYml = path.join(PRESET_ROOT, 'preset.yml')
  if (!fs.existsSync(presetYml)) {
    problems.push(`缺 preset.yml：${presetYml} —— 预设目录缺身份文件，后面各层都无从核对`)
  } else {
    const y = fs.readFileSync(presetYml, 'utf8')
    const name = /^name:\s*(.+)$/m.exec(y)?.[1]?.trim()
    const desc = /^description:\s*(.+)$/m.exec(y)?.[1]?.trim()
    const order = /^order:\s*(\d+)$/m.exec(y)?.[1]
    need(name === '三无 · Agent全栈专家', `preset.yml 的 name 应为「三无 · Agent全栈专家」，实得「${name ?? '(抽不到)'}」`)
    need(!!desc && desc.length >= 30, `preset.yml 的 description 应存在且 >= 30 字符，实得 ${desc ? desc.length : '(抽不到)'} 字符`)
    need(order !== undefined, 'preset.yml 缺 order —— 预设列表靠它排序，缺了会掉到列表末尾')
    facts.identity = { name, order: order === undefined ? null : Number(order), descriptionChars: desc?.length ?? 0 }
  }

  // ── 2. 组合层：插件行可解析 + 无占位符残留 ────────────────────────────────
  //
  // 直接复用 live-presets 门禁的解析器，而不是另写一份 —— 两份实现会在上游改解析
  // 规则时各自漂移，而漂移的那一份仍然报绿。

  const cordisYml = path.join(PRESET_ROOT, 'agent.cordis.yml')
  let yml = ''
  if (!fs.existsSync(cordisYml)) {
    problems.push(`缺 agent.cordis.yml：${cordisYml}`)
  } else {
    yml = fs.readFileSync(cordisYml, 'utf8')
    const { rows, placeholders } = scanAgentCordis(yml)
    need(rows.length > 0, 'agent.cordis.yml 里一行插件都没抽到 —— 解析器形状变了，后续判据已空转')
    need(placeholders.length === 0, `agent.cordis.yml 残留打包面占位符：${placeholders.map((p) => p.token).join(', ')}（预设加载器不展开任何占位符）`)
    const unresolvable = rows.filter((r) => !rowResolves(r.name, PRESET_ROOT, profileBase))
    need(unresolvable.length === 0, `agent.cordis.yml 有 ${unresolvable.length} 行在当前解析面里解析不到：${unresolvable.map((r) => r.name).join(', ')}`)
    facts.composition = { rows: rows.length, placeholders: placeholders.length, unresolvable: unresolvable.length }
  }

  // ── 3. 压缩后端层：必须是官方 compaction-basic，且不含 dsh-dcp 私有键 ──────

  if (yml) {
    const block = /- id: compaction\b[\s\S]*?(?=\n# ──|\n- id: (?!compaction-|command-compact|tool-result-pruner))/m.exec(yml)?.[0] ?? ''
    need(/name:\s*'@deepseek-ai\/dsh-compaction-basic'/.test(block), 'compaction 组里没挂官方 @deepseek-ai/dsh-compaction-basic —— 后端不是官方实现')
    need(!/'@aiwayds\/dsh-dcp'/.test(block), 'compaction 组里仍挂着 @aiwayds/dsh-dcp —— 本次改造要求回到官方后端')
    // 逐行扫 config 段里的键名，命中的必须都在官方合法键集里
    const cfg = /- id: compaction-basic[\s\S]*?\n(?=    - id: |\n# |\n- id: )/.exec(yml)?.[0] ?? ''
    const keys = [...cfg.matchAll(/^\s{8}([A-Za-z][A-Za-z0-9]*):/gm)].map((m) => m[1])
    const illegal = keys.filter((k) => !OFFICIAL_COMPACTION_KEYS.has(k))
    need(illegal.length === 0, `compaction-basic 的 config 出现官方非法键：${illegal.join(', ')} —— 加载时 validateKeys 会抛错，整个压缩行不加载`)
    facts.compaction = { official: true, configKeys: keys, illegalKeys: illegal }
  }

  // ── 4. 技能子集层 ─────────────────────────────────────────────────────────

  if (yml) {
    const block = /- id: skill-subset\b[\s\S]*$/m.exec(yml)?.[0] ?? ''
    need(block !== '', 'agent.cordis.yml 里没有 skill-subset 行 —— 白名单不存在，preset 会话里能看到全部 1700+ 条技能')

    // 抽不到就是空转：先断言抽到了，再断言值对。
    const subsetNames = [...block.matchAll(/^ {6}- "([a-z0-9-]+)"$/gm)].map((m) => m[1])
    need(subsetNames.length > 0, 'skill-subset 的 skills 列表一条都没抽到 —— 缩进或引号形状变了，本条判据已空转，请同步本文件')
    need(new Set(subsetNames).size === subsetNames.length, `skill-subset 白名单有重复项：${subsetNames.filter((n, i) => subsetNames.indexOf(n) !== i).join(', ')}`)

    // 4a. 白名单每条都必须在技能库里真实存在（改名/下线会让这里判红）
    const missing = subsetNames.filter((n) => !fs.existsSync(path.join(SKILLS_DIR, n, 'SKILL.md')))
    need(missing.length === 0, `白名单里 ${missing.length} 条在技能库中不存在：${missing.join(', ')}`)

    // 4b. 白名单必须与事实源（mapping + extra）一致：不许出现事实源之外的技能名
    const facts138 = new Set()
    try {
      for (const s of JSON.parse(fs.readFileSync(path.join(HERE, 'fullstack-mapping.json'), 'utf8')).skills) facts138.add(s.name)
      for (const s of JSON.parse(fs.readFileSync(path.join(HERE, 'fullstack-extra.json'), 'utf8')).skills) facts138.add(s.installAs)
    } catch (e) {
      problems.push(`读不到全栈事实源：${e.message}`)
    }
    const outsiders = subsetNames.filter((n) => !facts138.has(n))
    need(outsiders.length === 0, `白名单里有 ${outsiders.length} 条不属于全栈 138 条事实源：${outsiders.join(', ')}`)

    // 4c. 十四个节点必须全部有代表 —— 空节点意味着那条交付链在 preset 会话里断掉
    const declaredNodes = [...block.matchAll(/^ {6}# (M\d\d)（(\d+) 条）$/gm)].map((m) => [m[1], Number(m[2])])
    const counts = {}
    let cur = null
    for (const line of block.split('\n')) {
      const mm = /^ {6}# (M\d\d)（\d+ 条）$/.exec(line)
      if (mm) { cur = mm[1]; counts[cur] = 0; continue }
      if (/^ {6}- "/.test(line) && cur) counts[cur]++
    }
    const badDecl = declaredNodes.filter(([k, v]) => counts[k] !== v)
    need(badDecl.length === 0, `节点注释里声明的条数与实际列表不符：${badDecl.map(([k, v]) => `${k} 声明 ${v} 实得 ${counts[k]}`).join('; ')}`)
    const emptyNodes = NODE_IDS.filter((k) => !counts[k])
    need(emptyNodes.length === 0, `以下节点在 preset 会话里没有可用技能（交付链断点）：${emptyNodes.join(', ')}`)
    facts.subset = { total: subsetNames.length, nodes: counts }
  }

  // ── 5. 调用开关层：这是本 preset 存在的唯一理由 ───────────────────────────

  if (yml) {
    const flag = /- id: skill-subset\b[\s\S]*?respectFileFlags:\s*(true|false)/m.exec(yml)
    need(flag !== null, 'skill-subset 没有写 respectFileFlags —— 缺省 false 时文件开关全部失效，而加载/页面读数一律正常，是本 preset 最阴的一个缺陷')
    need(flag?.[1] === 'true', `respectFileFlags 应为 true，实得 ${flag?.[1] ?? '(抽不到)'}`)
    const hide = /- id: skill-subset\b[\s\S]*?hideOthers:\s*(true|false)/m.exec(yml)
    need(hide?.[1] === 'true', `hideOthers 应为 true（否则子集外的 1600+ 条技能在本 preset 里仍可见），实得 ${hide?.[1] ?? '(抽不到)'}`)
    facts.flags = { respectFileFlags: flag?.[1] === 'true', hideOthers: hide?.[1] === 'true' }
  }

  // ── 6. 人格层：persona 行 == SOUL.md 的渲染结果（同源） ────────────────────
  //
  // 渲染函数只此一处（`sync-fullstack-persona.mjs` 导出），门禁 import 它。
  // 门禁自带一份「等价实现」会漂移：渲染规则一改，门禁校的是旧规则，同步器写的是新规则。

  if (yml) {
    const soulPath = opts.soulPath ?? process.env.FULLSTACK_SOUL_PATH ?? DEFAULT_SOUL_PATH

    let soulBody = null
    if (!fs.existsSync(soulPath)) {
      problems.push(`[人格] 缺人格事实源 SOUL.md：${soulPath} —— 人格没有了家，persona 行就成了无源副本`)
    } else {
      try {
        soulBody = loadSoulBody(soulPath)
      } catch (e) {
        problems.push(`[人格] 读 SOUL.md 失败：${e.message}`)
      }
    }

    const personaBody = extractPersonaBody(yml)
    need(personaBody !== null, '[人格] agent.cordis.yml 里抽不到 persona 行的正文 —— 锚点形状变了，本条判据已空转，请同步本文件')

    if (soulBody !== null && personaBody !== null) {
      // 6a. 同源：逐字相等。这是本层的核心判据。
      need(
        personaBody === soulBody,
        `[人格] persona 行与 SOUL.md 不同源（persona ${personaBody.length} 字符 / SOUL ${soulBody.length} 字符）`
        + ' —— 改人格请改 SOUL.md 再跑 node scripts/sync-fullstack-persona.mjs，不要直接编辑 persona 行',
      )

      // 6b. 非骨架、非截断：人格变空或只剩开场白时，加载与页面读数一律正常，只有行为会变。
      need(!personaBody.includes('人格正文在 P4 阶段写入'), '[人格] persona 行仍是 P1 的骨架占位，人格从未写入')
      need(personaBody.length >= PERSONA_MIN_CHARS, `[人格] persona 正文只有 ${personaBody.length} 字符，低于本 preset 人格的下限 ${PERSONA_MIN_CHARS} —— 疑似被截断或退化成开场白`)

      // 6c. 三无三条与 M00–M13 十四个节点必须在正文里逐条点到。
      //     「人格还在，但派活表被删了」是本层最可能的腐烂形态，逐字比对挡不住它（源与副本一起删就一致了）。
      const missingWu = THREE_NOS.filter((w) => !personaBody.includes(w))
      need(missingWu.length === 0, `[人格] persona 正文缺三无条文：${missingWu.join('、')} —— 执业准则不完整`)

      const missingNodes = NODE_IDS.filter((n) => !personaBody.includes(n))
      need(missingNodes.length === 0, `[人格] persona 正文缺 ${missingNodes.length} 个节点（派活链断点）：${missingNodes.join(', ')}`)

      // 6d. 运行时占位符必须留着：persona 行是 DSH 唯一会做 {{...}} 替换的地方，
      //     被同步器或手改吃掉后，人格里就会留下字面的 `{{model}}`。
      const missingPh = ['{{model}}', '{{cwd}}'].filter((ph) => !personaBody.includes(ph))
      need(missingPh.length === 0, `[人格] persona 正文丢了运行时占位符 ${missingPh.join(', ')} —— agent 路由只替换存在的占位符`)

      facts.persona = {
        soulPath, soulChars: soulBody.length, personaChars: personaBody.length,
        sameSource: personaBody === soulBody,
        nodes: NODE_IDS.length - missingNodes.length, missingNodes,
      }
    }
  }

  // ── 7. 头像层：icon 行必须在，且等于图标库那一条 ---------------
  //
  // 判据分两问，因为它们坏的方式不同、修法也不同：
  //   7a. **副本自身**是不是一枚合法徽章 data URI（不依赖图标库）——
  //       这一问抓「手抄了半截」「写成了相对路径」；
  //   7b. **与图标库同源**——这一问抓「图标库重画过而副本还停在上一版」。
  // 先问 7a 再问 7b：副本本身是坏值时，同源比对会给出误导性的结论。
  if (fs.existsSync(presetYml)) {
    const y = fs.readFileSync(presetYml, 'utf8')
    const icon = extractIcon(y)
    if (icon === null) {
      problems.push('[头像] preset.yml 没有 icon 行 —— 官方卡片会静默回落成「没有头像」，加载/日志/页面读数全都正常')
    } else if (!icon.startsWith('data:image/svg+xml;base64,')) {
      problems.push(`[头像] icon 行不是 base64 SVG data URI（实得前 24 字：${icon.slice(0, 24)}）—— 相对路径会 404 成一枚空白头像，不报错`)
    } else {
      const svg = Buffer.from(icon.slice('data:image/svg+xml;base64,'.length), 'base64').toString('utf8')
      const badgeShaped = svg.startsWith('<svg') && svg.includes('viewBox="0 0 100 100"')
      need(badgeShaped, `[头像] icon 的 data URI 解出来不是 100×100 的品牌徽章 SVG（前 40 字：${svg.slice(0, 40)}）`)

      // 7c. paint 值必须合法 —— ADR-0090 的纪律：判据落在**被消费的产物**上。
      //     这一枚头像的载体就是 preset.yml（仓库够得着），所以仓库这一侧必须自己读它，
      //     而不是指望本机 ~/.dsh/skills 下那两支脚本 —— 它们不在仓库，门禁够不着。
      //     非法值会按 CSS 规范静默回落到黑色，正是 ADR-0090 那个「看着像设计」的缺陷形状。
      //     只在形状已经是徽章时跑：形状都不对时再报 paint 是噪音，会把根因埋掉。
      if (badgeShaped) {
        const paints = [...svg.matchAll(/(?:fill|stroke|stop-color)="([^"]*)"/g)].map((m) => m[1])
        need(paints.length > 0, '[头像] icon 的 SVG 里一个 paint 值都没有 —— 判据已空转，请同步本文件')
        const illegalPaints = [...new Set(paints.filter(
          (p) => p !== 'none' && !p.startsWith('url(#') && !/^#[0-9A-Fa-f]{3}([0-9A-Fa-f]{3})?$/.test(p)
            && !/^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(,\s*[\d.]+\s*)?\)$/.test(p),
        ))]
        need(illegalPaints.length === 0, `[头像] icon 的 SVG 有 ${illegalPaints.length} 个非法 paint 值：${illegalPaints.slice(0, 5).join(', ')} —— 非法值会被 SVG 静默回落到黑色（ADR-0090）`)
      }

      let source = null
      try {
        source = loadAvatarEntry(ICON_MANIFEST, DEFAULT_ICON_ID)
      } catch (e) {
        // 图标库读不到就**不猜**：判红并给出可执行的修法。这里不静默降级，
        // 否则「同源」这条判据会在缺库的机器上空转，而空转仍然报绿。
        problems.push(`[头像] 无法核对同源：${e.message.split('\n')[0]}`)
      }
      if (source) {
        need(icon === source.icon, `[头像] preset.yml 的 icon 与图标库 ${source.id}（${source.name}）不同源 —— 图标库重画过而副本没跟着走，卡片上会是上一版的脸。修法：node scripts/sync-fullstack-avatar.mjs`)
      }
      facts.avatar = {
        iconId: DEFAULT_ICON_ID,
        chars: icon.length,
        badgeShaped,
        sameSource: source ? icon === source.icon : null,
        manifest: ICON_MANIFEST,
      }
    }
  }

  return { presetRoot: PRESET_ROOT, skipped, facts, problems }
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function main() {
  const argv = process.argv.slice(2)
  const ri = argv.indexOf('--preset-root')
  const asJson = argv.includes('--json')

  const { presetRoot, skipped, facts, problems } = checkAgentFullstack({
    presetRoot: ri >= 0 ? argv[ri + 1] : undefined,
  })
  {
    if (asJson) {
      console.log(JSON.stringify({ presetRoot, skipped, facts, problems }, null, 2))
    } else {
      console.log(`agent-fullstack preset 门禁 | 根 ${presetRoot}`)
      if (skipped) {
        console.log('  跳过：预设目录不存在（空射程）—— 用户预设不进仓库，干净检出上这是预期状态')
      } else {
        if (facts.identity) console.log(`  身份: ${facts.identity.name}  order=${facts.identity.order}  描述 ${facts.identity.descriptionChars} 字`)
        if (facts.composition) console.log(`  组合: ${facts.composition.rows} 行插件 | 占位符 ${facts.composition.placeholders} | 不可解析 ${facts.composition.unresolvable}`)
        if (facts.compaction) console.log(`  压缩: 官方 compaction-basic | config 键 ${facts.compaction.configKeys.length} 个 | 非法键 ${facts.compaction.illegalKeys.length}`)
        if (facts.subset) console.log(`  子集: ${facts.subset.total} 条 | 节点 ${Object.keys(facts.subset.nodes).length}/14`)
        if (facts.flags) console.log(`  开关: respectFileFlags=${facts.flags.respectFileFlags} hideOthers=${facts.flags.hideOthers}`)
        if (facts.persona) console.log(`  人格: SOUL ${facts.persona.soulChars} 字符 | persona 行 ${facts.persona.personaChars} 字符 | 同源 ${facts.persona.sameSource ? '是' : '否'} | 节点 ${facts.persona.nodes}/14`)
        if (facts.avatar) console.log(`  头像: ${facts.avatar.iconId} | ${facts.avatar.chars} 字符 | 徽章形状 ${facts.avatar.badgeShaped ? '是' : '否'} | 同源 ${facts.avatar.sameSource === null ? '(未核对)' : facts.avatar.sameSource ? '是' : '否'}`)
      }
      console.log(`  问题 ${problems.length}`)
      problems.forEach((p) => console.log('  - ' + p))
    }
    process.exit(problems.length ? 1 : 0)
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
