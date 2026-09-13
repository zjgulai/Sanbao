/**
 * 「运行时图标资产与声明一致」校验项（ADR-0081）。
 *
 * ## 为什么需要它
 *
 * 品牌有**两个家**：`Contents/Resources/icon.icns`（Finder 里看到的）与
 * `Contents/Resources/app.asar.unpacked/build/{app-icon-mac.png,tray-icon*.png}`（**Dock 与托盘**
 * 里看到的）。`dsh-plugin-desktop` 启动时用 `app.dock?.setIcon()` 覆盖后者，所以「Finder 里是
 * ROOT、Dock 里是 DSH 原生」可以同时成立——而 `brand-replay.sh` 长期只守了前一个家，还报
 * `BRAND ALL VERIFIED`（P-02 仪器假绿 + P-07 一条事实多个家）。
 *
 * 第 5 块补上了第二个家，并声明了「目标 : 资产 : 尺寸」三列。本项守的是**那三列的第三列**：
 * `--apply` 落笔前会量**目标**的尺寸并拒绝不符的，但**资产**自己错了没人管——
 * 资产是 512×512 而表里写 1024×1024 时，目标（1024）与声明相符、`cp` 照落，
 * Dock 图标就成了一张放大的模糊图，而所有读数都是绿的。这与 P-02 是同一形状：
 * **仪器量错了对象**。
 *
 * ## 判据
 *
 * 1. **表能解析且非空**：从 `dsh-patches/brand-replay.sh` 的 `ICON_PAIRS` 里读出
 *    `<目标>:<资产>:<WxH>` 三列。解析不出任何一行 = 判红（表被删或被改写 = 本项空转）。
 * 2. **逐对齐全**：表里每个资产必须在 `packaging/assets/brand-icons/` 里存在；反过来，
 *    目录里每个文件都必须被表引用——**多一个少一个都判红**（清单本身即判据，ADR-0069）。
 * 3. **资产实际像素 = 声明像素**：直接读 PNG 的 IHDR（不依赖 `sips`/`file` 这类外部工具，
 *    它们不可用时会让判据静默变成「没什么可比的」）。
 * 4. **目标名唯一**：两行写同一个目标 = 后一行覆盖前一行，是表自身的事故。
 * 5. **动态半（射程可选）**：已装的 app 在场时，`…/app.asar.unpacked/build/<目标>` 必须存在
 *    ——基座换了图标文件名时，这张表就过期了，而过期的表会让 `--apply` 在装配时才失败。
 *    app 不在射程内时报 `skip` 并说明，**静态半照常说话**。
 *
 * ## 本项**不**检查什么（诚实写清楚）
 *
 * 1. **图标长什么样**。它只核尺寸与清单，不核「这张图是不是 ROOT 品牌」。图案对不对是人的判断，
 *    机器判不了——`brand-replay.sh --check` 用**哈希**判定目标是否等于资产，那才是品牌态的判据。
 * 2. **`.icns` 那一半家**。`Contents/Resources/icon.icns` 走 `packaging/assets/app-icon.icns`，
 *    尺寸规格由 ICNS 容器自己描述，不在本项的 `ICON_PAIRS` 表里。
 * 3. **渲染结果**。Dock 显示什么由 LaunchServices 缓存与 `app.dock.setIcon()` 共同决定，
 *    没有任何静态判据能回答「屏幕上现在是哪张图」（与 ADR-0078 同一处边界）。
 */
/** PNG 魔数（8 字节）。判定「这是不是一张 PNG」只此一处，免得两处写法分叉。 */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/** 资产目录（仓库根相对）。 */
export const ASSETS_DIR_REL = 'packaging/assets/brand-icons'

/** 声明表所在的脚本（仓库根相对）。 */
export const REPLAY_REL = 'dsh-patches/brand-replay.sh'

/**
 * 从 `brand-replay.sh` 里读出 `ICON_PAIRS` 的三列表。
 * 只认形如 `"目标:资产:WxH"` 的字符串字面量——表换了写法就会解析为空，本项随即判红
 * （而不是安静地什么都不比）。
 * @param {string} replayText 脚本正文
 * @returns {Array<{target: string, asset: string, dim: string}>}
 */
export function parseIconPairs(replayText) {
  const pairs = []
  const line = /^\s*"([^":\s]+):([^":\s]+):(\d+)x(\d+)",?\s*$/gm
  let match
  while ((match = line.exec(replayText)) !== null) {
    pairs.push({ target: match[1], asset: match[2], dim: `${match[3]}x${match[4]}`, width: Number(match[3]), height: Number(match[4]) })
  }
  return pairs
}

/**
 * 读 PNG 的 IHDR 尺寸。非 PNG 或长度不足时返回 `null`——「读不出」与「尺寸对」必须分开。
 * @param {Buffer|Uint8Array} bytes
 * @returns {{width: number, height: number}|null}
 */
export function readPngSize(bytes) {
  if (bytes.length < 24) return null
  for (let i = 0; i < PNG_SIGNATURE.length; i += 1) if (bytes[i] !== PNG_SIGNATURE[i]) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const chunkType = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15])
  if (chunkType !== 'IHDR') return null
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

/**
 * 跑一次「运行时图标资产」校验。
 *
 * @param {{
 *   replayText: string,
 *   assets: Array<{name: string, bytes: Buffer|Uint8Array}>,
 *   installedBuildDirEntries: string[]|null,
 * }} input
 *   `installedBuildDirEntries`：已装 app 的 `app.asar.unpacked/build/` 条目名；
 *   app 不在射程内（或目录读不到）传 `null`——那是「未核查」，会报 `skip` 而不是通过。
 * @returns {{passed: boolean, violations: string[], skipped?: boolean, note?: string}}
 */
export function checkBrandIcons({ replayText, assets, installedBuildDirEntries = null }) {
  const violations = []
  const pairs = parseIconPairs(replayText)

  if (pairs.length === 0) {
    violations.push(
      `${REPLAY_REL}: 解析不出 ICON_PAIRS 里的「目标:资产:尺寸」三列表——表被删除或改了写法，`
        + '本项随即空转。若改写是刻意的，请同步更新 parseIconPairs（P-02：读不到 ≠ 合格）',
    )
    return { passed: false, violations }
  }

  // ── R1 目标名唯一 ──────────────────────────────────────────────────────────
  const seenTargets = new Set()
  for (const { target } of pairs) {
    if (seenTargets.has(target)) {
      violations.push(`ICON_PAIRS 里目标 \`${target}\` 出现两次——后一行会覆盖前一行，落笔结果取决于表序`)
    }
    seenTargets.add(target)
  }

  // ── R2 表 ↔ 目录逐名两向对照 ───────────────────────────────────────────────
  const byName = new Map(assets.map((asset) => [asset.name, asset]))
  const referenced = new Set(pairs.map((pair) => pair.asset))
  for (const { asset, target } of pairs) {
    if (!byName.has(asset)) {
      violations.push(`${ASSETS_DIR_REL}/${asset}: 表里为 \`${target}\` 声明了它，但文件不存在（少一个）`)
    }
  }
  for (const { name } of assets) {
    if (!referenced.has(name)) {
      violations.push(`${ASSETS_DIR_REL}/${name}: 在目录里但不在 ICON_PAIRS 里（多一个）——未被使用的资产会腐烂，且它看起来像「已经品牌化了」`)
    }
  }

  // ── R3 资产实际像素 = 声明像素（本项的重点：`--apply` 只管目标那一侧）────────
  let measured = 0
  for (const { asset, dim, width, height, target } of pairs) {
    const entry = byName.get(asset)
    if (!entry) continue
    const size = readPngSize(entry.bytes)
    if (size === null) {
      violations.push(`${ASSETS_DIR_REL}/${asset}: 读不出 PNG 尺寸（不是 PNG，或不是以 IHDR 开头）——判不出就不放行`)
      continue
    }
    measured += 1
    if (size.width !== width || size.height !== height) {
      violations.push(
        `${ASSETS_DIR_REL}/${asset}: 实际 ${size.width}x${size.height}，表里声明 ${dim}（目标 \`${target}\`）`
          + '——资产尺寸不符时目标与声明相符、`cp` 照落，Dock 图标会变成一张放大的模糊图，而读数全绿',
      )
    }
  }

  // ── R5 动态半：已装 app 里目标名还在不在 ───────────────────────────────────
  let installedChecked = 0
  let dynamicNote
  if (installedBuildDirEntries === null) {
    dynamicNote = '目标侧不在射程内（未安装 / 目录读不到）——本项**未核对任何目标名**'
  } else {
    const present = new Set(installedBuildDirEntries)
    for (const { target } of pairs) {
      installedChecked += 1
      if (!present.has(target)) {
        violations.push(
          `已装 app 的 app.asar.unpacked/build/ 里没有 \`${target}\`——基座可能改了图标文件名，本表已过期`
            + '（过期的表会让 `--apply` 在装配时才失败，而不是在这里）',
        )
      }
    }
    dynamicNote = `目标侧已核 ${installedChecked} 个文件名`
  }

  const note =
    `表内 ${pairs.length} 对；资产 ${assets.length} 个（实际像素已核 ${measured} 个）；${dynamicNote}`
  if (installedBuildDirEntries === null && violations.length === 0) {
    return { passed: true, violations, skipped: true, note }
  }
  return { passed: violations.length === 0, violations, note }
}
