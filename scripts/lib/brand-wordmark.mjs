import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const outlineScript = fileURLToPath(new URL('./wordmark-outline.swift', import.meta.url))
const defaultFont = fileURLToPath(new URL('../../brand/logo/Inter-SemiBold.ttf', import.meta.url))
const defaultMark = fileURLToPath(new URL('../../brand/logo/placeholder-mark.svg', import.meta.url))

function xml(text) {
  return text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char])
}

export function renderWordmark({ nameLatin, fontPath = defaultFont, markSvg = readFileSync(defaultMark, 'utf8') }) {
  if (typeof nameLatin !== 'string' || !nameLatin.trim() || nameLatin.length > 120 || /[\u0000-\u001f]/.test(nameLatin)) {
    throw new Error('品牌名必须为 1–120 字符且不含控制字符')
  }
  const polygons = [...markSvg.matchAll(/<polygon\s+points="([0-9.,\s-]+)"\s*\/>/g)]
  if (!polygons.length) throw new Error('受管占位 mark 缺少 polygon')
  const outline = JSON.parse(execFileSync('swift', [outlineScript], {
    input: JSON.stringify({ fontPath, text: nameLatin }), encoding: 'utf8', timeout: 120000,
  }))
  if (outline.font !== 'Inter-SemiBold') throw new Error(`字体不是 Inter SemiBold：${outline.font}`)
  const width = Math.max(320, Math.ceil(outline.width + 64))
  const number = (value) => Number(value.toFixed(3))
  const x = number((width - outline.width) / 2 - outline.x)
  const y = number(244 + outline.y + outline.height)
  const height = Math.ceil(244 + outline.height + 32)
  const mark = polygons.map(([, points]) => `<polygon points="${points}"/>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="320" role="img" aria-label="${xml(nameLatin)}" data-brand-wordmark="stacked" data-font="Inter-SemiBold"><title>${xml(nameLatin)}</title><g fill="currentColor" data-status="placeholder" transform="translate(${number((width - 224) / 2)} 0) scale(0.4375)">${mark}</g><path fill="currentColor" transform="translate(${x} ${y}) scale(1 -1)" d="${outline.path}"/></svg>`
}
