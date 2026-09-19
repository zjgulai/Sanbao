/**
 * L10 头像判据的纯函数核心（工单 004）。
 *
 * 判据从「字符串前缀是 SVG data URI」升级为三件事：
 * 1. MIME 与字节头一致——data URI 自报的 MIME 必须与 base64 解码后的真实字节
 *    吻合（webp 必须是 RIFF…WEBP；svg 必须是文本节点开头）；
 * 2. 禁止 SVG 包位图骗过旧断言（ADR-0133 时代的伪造路径：位图字节裹进 svg 外壳，
 *    前缀检查照样绿）；
 * 3. 与源同串——expectedIcon 由调用方从源解析（受管 brand/avatars 或
 *    lute-brand-icons），三处（preset.yml / manifest.json / 源）必须同一字符串。
 *
 * 纯函数、零 IO：verify-lossless 的 L10 循环调用它；反向自测直接对它举反例。
 */

/** data URI 自报的 MIME → 字节头不一致或伪造内容时返回 violation 文案，一致返回 null。 */
export function iconMimeViolation(dataUri) {
  const match = typeof dataUri === 'string' ? dataUri.match(/^data:(image\/[a-z+]+);base64,(.+)$/s) : null
  if (match === null) {
    return `icon 不是 base64 图片 data URI（得到：${typeof dataUri === 'string' ? dataUri.slice(0, 40) : String(dataUri)}…）`
  }
  const mime = match[1]
  let bytes
  try {
    bytes = Buffer.from(match[2], 'base64')
  } catch {
    return `icon 的 base64 段无法解码`
  }
  if (mime === 'image/webp') {
    const isWebp =
      bytes.length >= 12 &&
      bytes.subarray(0, 4).toString('latin1') === 'RIFF' &&
      bytes.subarray(8, 12).toString('latin1') === 'WEBP'
    if (!isWebp) return `icon 自报 image/webp 但字节头不是 RIFF…WEBP（MIME 与字节不一致）`
    return null
  }
  if (mime === 'image/svg+xml') {
    const text = bytes.toString('utf8')
    if (!text.trimStart().startsWith('<')) {
      return `icon 自报 image/svg+xml 但字节头不是文本节点（MIME 与字节不一致）`
    }
    // 伪造路径：位图字节裹进 svg 外壳（ADR-0133 时代的骗法）。svg 里出现
    // <image> 且引用 raster data URI 即判红——线稿头像不需要嵌位图。
    if (/<image[\s>]/.test(text) && /data:image\/(png|jpe?g|webp|gif);base64/.test(text)) {
      return `icon 是 SVG 包位图（<image> 内嵌 raster data URI）——位图必须以真实 MIME 直出，不得裹 svg 外壳骗过前缀断言`
    }
    return null
  }
  return `icon 的 MIME ${mime} 不在受支持集合（image/webp 受管源 / image/svg+xml 旧源线稿）`
}

/**
 * 单岗位的 L10 判定。expectedIcon 由调用方按「受管优先、旧源回退」解析；
 * 互异判定（一位一头像）由调用方持有 owner 表，本函数不管。
 * @returns {string[]} violations（空数组 = 该岗位头像层全对）。
 */
export function judgeIconEntry({ presetId, ymlIcon, mfIcon, expectedIcon }) {
  const violations = []
  if (ymlIcon === undefined) {
    violations.push(`${presetId}: preset.yml 缺 icon —— 官方卡片会渲染成空头像`)
    return violations
  }
  const mimeViolation = iconMimeViolation(ymlIcon)
  if (mimeViolation !== null) violations.push(`${presetId}: ${mimeViolation}`)

  if (expectedIcon === undefined) {
    violations.push(`${presetId}: 头像源（受管 brand/avatars 或图标库）里没有 id 为 ${presetId} 的条目`)
  } else if (ymlIcon !== expectedIcon || mfIcon !== expectedIcon) {
    violations.push(
      `${presetId}: 头像三处不一致（preset.yml / manifest.json / 头像源必须同一字符串）`
        + `——受管源以 brand/avatars/manifest.json 登记的资产为准，跑 node scripts/role-presets/generate.mjs 重新生成`,
    )
  }
  return violations
}
