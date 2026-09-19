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
 * 3. **资产实际像素 = 声明像素，且形状合格**：直接读 PNG 的 IHDR 与 IDAT（不依赖 `sips`/`file`；
 *    它们不可用时不能让判据静默变成「没什么可比的」）。所有出货图标必须有 alpha 且四角透明。
 * 4. **目标名唯一**：两行写同一个目标 = 后一行覆盖前一行，是表自身的事故。
 * 5. **动态半（射程可选）**：已装的 app 在场时，`…/app.asar.unpacked/build/<目标>` 必须存在
 *    ——基座换了图标文件名时，这张表就过期了，而过期的表会让 `--apply` 在装配时才失败。
 *    app 不在射程内时报 `skip` 并说明，**静态半照常说话**。
 *
 * ## 本项**不**检查什么（诚实写清楚）
 *
 * 1. **具体品牌图案语义**。机器守 alpha/透明角与尺寸，但「占位标是不是好看、是否已达到正式 Sanbao 字母标」
 *    仍是人的判断；占位状态由 `brand/logo/placeholder-mark.svg` 显式标记，正式设计在 T1。
 * 2. **`.icns` 那一半家**。`Contents/Resources/icon.icns` 走 `packaging/assets/app-icon.icns`，
 *    尺寸规格由 ICNS 容器自己描述，不在本项的 `ICON_PAIRS` 表里。
 * 3. **渲染结果**。Dock 显示什么由 LaunchServices 缓存与 `app.dock.setIcon()` 共同决定，
 *    没有任何静态判据能回答「屏幕上现在是哪张图」（与 ADR-0078 同一处边界）。
 */
import { inflateSync } from 'node:zlib'

/** PNG 魔数（8 字节）。判定「这是不是一张 PNG」只此一处，免得两处写法分叉。 */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const MAX_PNG_DIMENSION = 4096
const MAX_INFLATED_BYTES = 64 * 1024 * 1024

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

/** PNG 是否声明了 alpha：灰度/RGB 可通过 tRNS，灰度+alpha/RGBA 自带 alpha。 */
export function pngHasAlpha(bytes) {
  const png = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (readPngSize(png) === null || png.length < 33) return false
  const colorType = png[25]
  if (colorType === 4 || colorType === 6) return true
  let offset = 8
  while (offset + 12 <= png.length) {
    const length = png.readUInt32BE(offset)
    const type = png.subarray(offset + 4, offset + 8).toString('ascii')
    if (type === 'tRNS') return true
    if (type === 'IEND') break
    offset += 12 + length
  }
  return false
}

function paeth(a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  if (pb <= pc) return b
  return c
}

/** 解码 8-bit RGBA PNG；不支持或超出资源上限时返回 null（调用方 fail-close）。 */
export function readPngRgba(bytes) {
  const png = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const size = readPngSize(png)
  if (
    size === null || size.width > MAX_PNG_DIMENSION || size.height > MAX_PNG_DIMENSION
    || png[24] !== 8 || png[25] !== 6 || png[26] !== 0 || png[27] !== 0 || png[28] !== 0
  ) return null
  const stride = size.width * 4
  const expectedBytes = (stride + 1) * size.height
  if (expectedBytes > MAX_INFLATED_BYTES) return null
  const idat = []
  let offset = 8
  while (offset + 12 <= png.length) {
    const length = png.readUInt32BE(offset)
    const type = png.subarray(offset + 4, offset + 8).toString('ascii')
    if (offset + 12 + length > png.length) return null
    if (type === 'IDAT') idat.push(png.subarray(offset + 8, offset + 8 + length))
    if (type === 'IEND') break
    offset += 12 + length
  }
  if (idat.length === 0) return null
  let raw
  try {
    raw = inflateSync(Buffer.concat(idat), { maxOutputLength: expectedBytes })
  } catch {
    return null
  }
  if (raw.length !== expectedBytes) return null
  const rows = []
  let cursor = 0
  for (let y = 0; y < size.height; y += 1) {
    const filter = raw[cursor]
    cursor += 1
    const encoded = raw.subarray(cursor, cursor + stride)
    cursor += stride
    const row = Buffer.alloc(stride)
    const prev = rows[y - 1] ?? Buffer.alloc(stride)
    for (let x = 0; x < stride; x += 1) {
      const left = x >= 4 ? row[x - 4] : 0
      const up = prev[x]
      const upperLeft = x >= 4 ? prev[x - 4] : 0
      let predictor
      if (filter === 0) predictor = 0
      else if (filter === 1) predictor = left
      else if (filter === 2) predictor = up
      else if (filter === 3) predictor = Math.floor((left + up) / 2)
      else if (filter === 4) predictor = paeth(left, up, upperLeft)
      else return null
      row[x] = (encoded[x] + predictor) & 0xff
    }
    rows.push(row)
  }
  return { width: size.width, height: size.height, rows }
}

export function readPngCornerAlpha(bytes) {
  const image = readPngRgba(bytes)
  if (image === null) return null
  const rightAlpha = image.width * 4 - 1
  return [image.rows[0][3], image.rows[0][rightAlpha], image.rows[image.height - 1][3], image.rows[image.height - 1][rightAlpha]]
}

export function inspectPngShape(bytes) {
  const image = readPngRgba(bytes)
  if (image === null) return null
  const cornerDepth = Math.max(1, Math.floor(Math.min(image.width, image.height) * 0.05))
  let transparent = 0
  let opaque = 0
  let cornerOpaque = 0
  for (let y = 0; y < image.height; y += 1) {
    const inCornerY = y < cornerDepth || y >= image.height - cornerDepth
    for (let x = 0; x < image.width; x += 1) {
      const alpha = image.rows[y][x * 4 + 3]
      if (alpha === 0) transparent += 1
      else opaque += 1
      if (inCornerY && (x < cornerDepth || x >= image.width - cornerDepth) && alpha !== 0) cornerOpaque += 1
    }
  }
  const centerX = Math.floor(image.width / 2)
  const centerY = Math.floor(image.height / 2)
  return {
    transparentRatio: transparent / (image.width * image.height),
    opaque,
    cornerOpaque,
    center: Buffer.from(image.rows[centerY].subarray(centerX * 4, centerX * 4 + 4)),
  }
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
    if (!pngHasAlpha(entry.bytes)) {
      violations.push(
        `${ASSETS_DIR_REL}/${asset}: PNG 没有 alpha 通道——硬边方块会原样出现在 Finder/Dock，不能只凭尺寸放行`,
      )
      continue
    }
    const shape = inspectPngShape(entry.bytes)
    if (shape === null) {
      violations.push(
        `${ASSETS_DIR_REL}/${asset}: 无法从真实 PNG 字节判定 alpha 形状（只支持 8-bit RGBA 非隔行 PNG，且尺寸不得超过 ${MAX_PNG_DIMENSION}px）——判不出就不放行`,
      )
    } else if (shape.cornerOpaque !== 0) {
      violations.push(
        `${ASSETS_DIR_REL}/${asset}: 四个 5% 透明边角区域里有 ${shape.cornerOpaque} 个非透明像素——只挖四个角点不能冒充圆角/squircle`,
      )
    } else if (shape.transparentRatio < 0.05 || shape.opaque === 0) {
      violations.push(
        `${ASSETS_DIR_REL}/${asset}: 透明像素占比 ${(shape.transparentRatio * 100).toFixed(2)}%、非透明像素 ${shape.opaque}——图标必须同时有透明边角与可见主体`,
      )
    } else if (asset === 'app-squircle-1024.png' && !shape.center.equals(Buffer.from([0x0b, 0x15, 0x21, 0xff]))) {
      violations.push(
        `${ASSETS_DIR_REL}/${asset}: 中心像素必须是规格深底 #0b1521，实得 #${shape.center.subarray(0, 3).toString('hex')} alpha=${shape.center[3]}`,
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
    `表内 ${pairs.length} 对；资产 ${assets.length} 个（尺寸/alpha/透明角已核 ${measured} 个）；${dynamicNote}`
  if (installedBuildDirEntries === null && violations.length === 0) {
    return { passed: true, violations, skipped: true, note }
  }
  return { passed: violations.length === 0, violations, note }
}
