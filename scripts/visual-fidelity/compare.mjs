#!/usr/bin/env node
// VF-3 (ADR on VF tickets): pixel/geometry comparison between a Sage screenshot and the
// Qoder reference baseline of the same state. Reads two PNGs, samples both at a coarse grid,
// and reports: color-distance histogram buckets + dominant-palette deltas per region.
// Pure node (no native deps): PNG decode via zero-copy zlib scanline reader for 8-bit RGBA/RGB.
// Usage: node scripts/visual-fidelity/compare.mjs <sage.png> <qoder.png> [--json]
import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'

function decodePng(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error('not a png')
  let pos = 8
  let width = 0, height = 0, bitDepth = 0, colorType = 0
  const idat = []
  while (pos < buffer.length) {
    const length = buffer.readUInt32BE(pos)
    const type = buffer.toString('ascii', pos + 4, pos + 8)
    const data = buffer.subarray(pos + 8, pos + 8 + length)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
    } else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    pos += 12 + length
  }
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`unsupported png: bitDepth=${bitDepth} colorType=${colorType} (need 8-bit RGB/RGBA)`)
  }
  const channels = colorType === 6 ? 4 : 3
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const out = Buffer.alloc(width * height * 3)
  let prev = Buffer.alloc(stride)
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    const cur = Buffer.alloc(stride)
    for (let i = 0; i < stride; i += 1) {
      const a = i >= channels ? cur[i - channels] : 0
      const b = prev[i]
      const c = i >= channels ? prev[i - channels] : 0
      let v = line[i]
      if (filter === 1) v += a
      else if (filter === 2) v += b
      else if (filter === 3) v += (a + b) >> 1
      else if (filter === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c)
      }
      cur[i] = v & 0xff
    }
    for (let x = 0; x < width; x += 1) {
      out[(y * width + x) * 3] = cur[x * channels]
      out[(y * width + x) * 3 + 1] = cur[x * channels + 1]
      out[(y * width + x) * 3 + 2] = cur[x * channels + 2]
    }
    prev = cur
  }
  return { width, height, pixels: out }
}

function sampleRegions({ width, height, pixels }, grid = Number(process.env.VF_GRID ?? 4)) {
  const regions = []
  for (let gy = 0; gy < grid; gy += 1) {
    for (let gx = 0; gx < grid; gx += 1) {
      const x0 = Math.floor(width * gx / grid), x1 = Math.floor(width * (gx + 1) / grid)
      const y0 = Math.floor(height * gy / grid), y1 = Math.floor(height * (gy + 1) / grid)
      const counts = new Map()
      let n = 0
      let edges = 0
      let prevKey = null
      for (let y = y0; y < y1; y += 4) {
        for (let x = x0; x < x1; x += 4) {
          const i = (y * width + x) * 3
          const key = `${pixels[i] >> 4},${pixels[i + 1] >> 4},${pixels[i + 2] >> 4}`
          counts.set(key, (counts.get(key) ?? 0) + 1)
          n += 1
          if (prevKey !== null && key !== prevKey) edges += 1
          prevKey = key
        }
      }
      const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
      regions.push({
        gx, gy,
        dominantKey: dominant?.[0] ?? '?',
        dominantShare: dominant ? Number((dominant[1] / n).toFixed(3)) : 0,
        edgeDensity: Number((edges / n).toFixed(3)),
      })
    }
  }
  return regions
}

function hexKeyDistance(a, b) {
  if (a === b) return 0
  const [ar, ag, ab] = a.split(',').map(Number)
  const [br, bg, bb] = b.split(',').map(Number)
  return Math.abs(ar - br) + Math.abs(ag - bg) + Math.abs(ab - bb)
}

const args = process.argv.slice(2)
const json = args.includes('--json')
const files = args.filter((a) => !a.startsWith('--'))
if (files.length !== 2) {
  console.error('usage: compare.mjs <sage.png> <qoder.png> [--json]')
  process.exit(2)
}
const sage = decodePng(readFileSync(files[0]))
const qoder = decodePng(readFileSync(files[1]))
const sr = sampleRegions(sage)
const qr = sampleRegions(qoder)
const perRegion = sr.map((s, i) => {
  const q = qr[i]
  const d = hexKeyDistance(s.dominantKey, q.dominantKey)
  const edgeDelta = Math.abs(s.edgeDensity - q.edgeDensity)
  return { region: `${s.gx},${s.gy}`, sage: s.dominantKey, qoder: q.dominantKey, channelDistance: d, edgeDelta: Number(edgeDelta.toFixed(3)), match: d <= 3 && edgeDelta <= 0.15 }
})
const matched = perRegion.filter((r) => r.match).length
const summary = {
  sage: { width: sage.width, height: sage.height },
  qoder: { width: qoder.width, height: qoder.height },
  grid: Number(process.env.VF_GRID ?? 4),
  regionsMatched: matched,
  regionsTotal: perRegion.length,
  alignmentRatio: Number((matched / perRegion.length).toFixed(3)),
}
if (json) {
  console.log(JSON.stringify({ summary, perRegion }, null, 1))
} else {
  console.log(`alignment ${summary.alignmentRatio} (${matched}/${perRegion.length} regions, tol=3)`)
  for (const r of perRegion) console.log(`  [${r.region}] sage=${r.sage} qoder=${r.qoder} d=${r.channelDistance}${r.match ? '' : '  ←'}`)
}
process.exit(0)
