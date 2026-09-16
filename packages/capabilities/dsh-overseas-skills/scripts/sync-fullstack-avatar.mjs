#!/usr/bin/env node
/**
 * sync-fullstack-avatar.mjs — 把图标库里的头像渲染进 preset.yml 的 `icon:` 行（唯一渲染实现）。
 *
 * ## 为什么存在
 *
 * `icon:` 是 DSH 官方预设卡片**显式消费**的显示字段（平台 schema 只有
 * name / description / order / icon 四个），roster 把它送到前端，卡片渲染成
 * `<img class="cardAvatar">`。它是一个 base64 data URI，也就是一坨**没人读得动**的文本。
 *
 * 于是它有两种腐烂方式，两种都不响：
 *
 *   · **丢**：preset.yml 里没有 `icon:` —— 卡片回落成没有头像。加载、日志、页面读数全正常；
 *   · **霉**：图标库重新生成（改了造型、修了颜色）之后，preset.yml 里那份**副本仍是旧的**。
 *     两份文本各自合法、界面照常显示，只是显示的是上一版的脸。
 *
 * 第二种正是本仓库登记过的「一份事实多个家」。所以：图标库 manifest 是**唯一事实源**，
 * `icon:` 行是它渲染出来的**物化副本**，「副本是否仍等于源」由门禁复算 —— 不是靠纪律。
 *
 * ## 为什么渲染函数要导出，而不是在门禁里再写一遍
 *
 * 与 `sync-fullstack-persona.mjs` 同一条理由：门禁若自带一份「等价」实现，渲染规则
 * （引号、转义、换行）一改，门禁校的是旧规则而同步器写的是新规则 —— 两种都错，
 * 且两种都报绿。故 `renderIconLine` / `extractIcon` 只此一处，门禁 import 它。
 *
 * ## 用法
 *
 *   node scripts/sync-fullstack-avatar.mjs                  # 渲染并写回 preset（默认）
 *   node scripts/sync-fullstack-avatar.mjs --check          # 只比对，不写；有漂移退出码 1
 *   node scripts/sync-fullstack-avatar.mjs --dry-run        # 打印将写入的行
 *   node scripts/sync-fullstack-avatar.mjs --json
 *   node scripts/sync-fullstack-avatar.mjs --preset-yml <f> --manifest <f> --id <icon-id>
 */
import fs from 'node:fs'
import path from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

/** 「三无」用的图标 id。事实源是图标库 manifest 里的这一条。 */
export const DEFAULT_ICON_ID = 'sanwu-emperor'

/** 图标库清单（lute-brand-icons 的产物）。 */
export const DEFAULT_MANIFEST_PATH = path.join(
  homedir(), '.dsh', 'skills', 'lute-brand-icons', 'assets', 'manifest.json',
)

/** 目标：用户预设的身份文件。 */
export const DEFAULT_PRESET_YML = path.join(
  homedir(), '.dsh', '.agent-presets', 'agent-fullstack', 'preset.yml',
)

/** 合法头像的形状：base64 SVG data URI。 */
const DATA_URI_PREFIX = 'data:image/svg+xml;base64,'
/** `icon:` 行的锚。只认这一种写法；不认就响亮失败，不做模糊匹配。 */
const ICON_LINE = /^icon:.*$/m

/**
 * 读图标库里的一条，并**在读取这一层**断言它是合法头像。
 *
 * 为什么不把断言留给渲染器或门禁：`icon:` 收下任何字符串都「能用」——
 * 一个相对路径会 404 成一枚空白头像，一个手抄错的 base64 会解出一张坏图，
 * 两者都**不报错**。所以这里拒绝：读不到、解不开、解出来不是 100×100 徽章，全都抛。
 *
 * @param {string} [manifestPath]
 * @param {string} [iconId]
 * @returns {{id: string, name: string, icon: string}}
 */
export function loadAvatarEntry(manifestPath = DEFAULT_MANIFEST_PATH, iconId = DEFAULT_ICON_ID) {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`图标库清单不存在：${manifestPath}\n  先生成头像库：node ~/.dsh/skills/lute-brand-icons/scripts/build.js`)
  }
  const rows = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  const row = rows.find((r) => r.id === iconId)
  if (!row) {
    const near = rows.filter((r) => String(r.id).includes('sanwu')).map((r) => r.id)
    throw new Error(
      `图标库里没有 id="${iconId}" 的条目`
      + (near.length ? `（相近的有：${near.join(', ')}）` : '')
      + `\n  清单：${manifestPath}`,
    )
  }
  const icon = row.icon
  if (typeof icon !== 'string' || !icon.startsWith(DATA_URI_PREFIX)) {
    throw new Error(`图标库条目 ${iconId} 的 icon 不是 ${DATA_URI_PREFIX} 开头的 data URI —— 收下它只会得到一枚空白头像`)
  }
  const svg = Buffer.from(icon.slice(DATA_URI_PREFIX.length), 'base64').toString('utf8')
  if (!svg.startsWith('<svg') || !svg.includes('viewBox="0 0 100 100"')) {
    throw new Error(`图标库条目 ${iconId} 的 data URI 解出来不是 100×100 的品牌徽章 SVG（前 40 字：${svg.slice(0, 40)}）`)
  }
  return { id: row.id, name: row.name, icon }
}

/**
 * 把 data URI 渲染成 `icon:` 行。
 *
 * 单引号 + YAML 单引号转义：与 `scripts/role-presets/generate.mjs` 的 `q()` 同一套纪律。
 * base64 字符集里没有单引号，但转义规则保持一致，免得日后换成别的载荷时这里变成坑。
 *
 * @param {string} icon
 * @returns {string}
 */
export function renderIconLine(icon) {
  if (typeof icon !== 'string' || !icon.startsWith(DATA_URI_PREFIX)) {
    throw new Error('renderIconLine 只接受 base64 SVG data URI')
  }
  return `icon: '${icon.replace(/'/g, "''")}'`
}

/**
 * 抽出现有 `icon:` 行的值（含引号剥除）。抽不到返回 null。
 *
 * @param {string} yml
 * @returns {string|null}
 */
export function extractIcon(yml) {
  const line = ICON_LINE.exec(yml)?.[0]
  if (line === undefined) return null
  const raw = line.replace(/^icon:\s*/, '').trim()
  if (raw === '') return null
  // 单引号包裹 → 去掉并还原 '' 转义；否则按裸标量处理。
  if (raw.startsWith("'") && raw.endsWith("'") && raw.length >= 2) {
    return raw.slice(1, -1).replace(/''/g, "'")
  }
  return raw
}

/**
 * 用 `icon` 替换（或补上）`yml` 里的 `icon:` 行，返回新文本。
 *
 * 只碰这一行：name / description / order 与其余字节逐个保留 —— 身份文件是人写的，
 * 同步器不许顺手重排它。行不存在时**追加到末尾**（追加而不是抛弃，因为丢掉 icon 是静默的）。
 *
 * @param {string} yml
 * @param {string} icon
 * @returns {{text: string, action: 'replaced'|'appended'}}
 */
export function replaceIcon(yml, icon) {
  const line = renderIconLine(icon)
  if (ICON_LINE.test(yml)) {
    const count = yml.match(new RegExp(ICON_LINE.source, 'gm'))?.length ?? 0
    if (count !== 1) throw new Error(`preset.yml 里有 ${count} 行 icon: —— 身份文件不该有多份头像，拒绝猜改哪一行`)
    return { text: yml.replace(ICON_LINE, line), action: 'replaced' }
  }
  const text = yml.endsWith('\n') ? `${yml}${line}\n` : `${yml}\n${line}\n`
  return { text, action: 'appended' }
}

/** 原子写：tmp + rename。**不要**用写回原 inode 的方式 —— preset 文件可能是硬链接。 */
export function writeAtomic(file, content) {
  const tmp = `${file}.tmp-${process.pid}`
  fs.writeFileSync(tmp, content, { mode: fs.statSync(file).mode & 0o777 })
  fs.renameSync(tmp, file)
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function main() {
  const argv = process.argv.slice(2)
  const opt = (name, dflt) => {
    const i = argv.indexOf(name)
    return i >= 0 ? argv[i + 1] : dflt
  }
  const presetYml = opt('--preset-yml', DEFAULT_PRESET_YML)
  const manifest = opt('--manifest', DEFAULT_MANIFEST_PATH)
  const iconId = opt('--id', DEFAULT_ICON_ID)
  const check = argv.includes('--check')
  const dryRun = argv.includes('--dry-run')
  const asJson = argv.includes('--json')

  const entry = loadAvatarEntry(manifest, iconId)
  if (!fs.existsSync(presetYml)) {
    console.error(`preset.yml 不存在：${presetYml}`)
    process.exit(1)
  }
  const yml = fs.readFileSync(presetYml, 'utf8')
  const current = extractIcon(yml)
  const same = current === entry.icon

  if (asJson) {
    console.log(JSON.stringify({ presetYml, iconId: entry.id, name: entry.name, sameSource: same, currentChars: current?.length ?? 0, sourceChars: entry.icon.length, dryRun, check }, null, 2))
  } else if (check) {
    console.log(`同源核对 | ${presetYml}`)
    console.log(`  图标库 ${entry.id}（${entry.name}）: ${entry.icon.length} 字符`)
    console.log(`  preset.yml icon 行: ${current === null ? '(没有 icon 行)' : `${current.length} 字符`}`)
    console.log(`  同源: ${same ? '是' : '否'}`)
  } else if (dryRun) {
    console.log(renderIconLine(entry.icon).slice(0, 120) + '…')
  } else {
    const { text, action } = replaceIcon(yml, entry.icon)
    if (text === yml) {
      console.log(`已是同源，未写入（${entry.id}，${entry.icon.length} 字符）`)
    } else {
      writeAtomic(presetYml, text)
      console.log(`已${action === 'replaced' ? '替换' : '追加'} icon 行：${entry.id}（${entry.name}），${entry.icon.length} 字符`)
      console.log(`  ${presetYml}`)
      console.log('  ⚠️ 预设卡片头像由宿主在装载时读取，需重启 DSH 才可见')
    }
  }
  if (check && !same) process.exit(1)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
