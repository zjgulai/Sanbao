import { inflateSync } from 'node:zlib'

const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function paeth(a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

/**
 * Decode the restricted, deterministic PNG shape emitted by macOS sips.
 * Unsupported inputs return null so every caller can fail closed.
 */
export function inspectPng(bytes) {
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(signature)) return null
  if (bytes.subarray(12, 16).toString('ascii') !== 'IHDR') return null
  const width = bytes.readUInt32BE(16)
  const height = bytes.readUInt32BE(20)
  if (width === 0 || height === 0 || width > 4096 || height > 4096 || bytes[24] !== 8 || bytes[25] !== 6 || bytes[26] !== 0 || bytes[27] !== 0 || bytes[28] !== 0) return null
  const chunks = []
  let offset = 8
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset)
    if (offset + 12 + length > bytes.length) return null
    const type = bytes.subarray(offset + 4, offset + 8).toString('ascii')
    if (type === 'IDAT') chunks.push(bytes.subarray(offset + 8, offset + 8 + length))
    if (type === 'IEND') break
    offset += 12 + length
  }
  if (chunks.length === 0) return null
  const stride = width * 4
  const expected = (stride + 1) * height
  let raw
  try {
    raw = inflateSync(Buffer.concat(chunks), { maxOutputLength: expected })
  } catch {
    return null
  }
  if (raw.length !== expected) return null
  const rows = []
  let cursor = 0
  for (let y = 0; y < height; y += 1) {
    const filter = raw[cursor++]
    const encoded = raw.subarray(cursor, cursor + stride)
    cursor += stride
    const row = Buffer.alloc(stride)
    const previous = rows[y - 1] ?? Buffer.alloc(stride)
    for (let x = 0; x < stride; x += 1) {
      const left = x >= 4 ? row[x - 4] : 0
      const up = previous[x]
      const upperLeft = x >= 4 ? previous[x - 4] : 0
      const predictor = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? up : filter === 3 ? Math.floor((left + up) / 2) : filter === 4 ? paeth(left, up, upperLeft) : null
      if (predictor === null) return null
      row[x] = (encoded[x] + predictor) & 0xff
    }
    rows.push(row)
  }
  let opaquePixels = 0
  let transparentPixels = 0
  for (const row of rows) {
    for (let x = 3; x < row.length; x += 4) {
      if (row[x] === 0) transparentPixels += 1
      else opaquePixels += 1
    }
  }
  return {
    width,
    height,
    corners: [rows[0][3], rows[0][stride - 1], rows[height - 1][3], rows[height - 1][stride - 1]],
    opaquePixels,
    transparentPixels,
  }
}
