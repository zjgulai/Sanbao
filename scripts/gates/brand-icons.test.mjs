/**
 * `brand-icons.mjs` 的反向自测（ADR-0081）。
 *
 * ## 为什么这些用例必须是「能说不」的
 *
 * 本项守的是**声明的第三列**（资产的实际像素尺寸）。守它的理由很具体：`--apply` 落笔前量的是
 * **目标**的尺寸，资产自己错了没人管——512×512 的资产配 1024×1024 的声明，`cp` 照样落，
 * Dock 图标成一张放大的模糊图，而**所有读数都是绿的**。这与 P-02 是同一形状：仪器量错了对象。
 * 所以这里最要紧的一条用例是「资产尺寸与声明不符必须判红」，而它同时也是**恒真桩突变**：
 * 一个只比「声明 vs 声明」的实现会放过它。
 *
 * 另一条要紧的是**两向对照**（表 ↔ 目录）：少一个文件、多一个文件都必须判红。
 * 只做一向的实现照样能通过「资产都在」那一半，而目录里多出来的未使用资产会腐烂，
 * 且它看起来像「已经品牌化了」（P-07）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'
import { ASSETS_DIR_REL, checkBrandIcons, parseIconPairs, pngHasAlpha, readPngCornerAlpha, readPngSize, REPLAY_REL } from './brand-icons.mjs'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const realReplay = readFileSync(join(repoRoot, REPLAY_REL), 'utf8')

function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const name = Buffer.from(type, 'ascii')
  const crcInput = Buffer.concat([name, data])
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  name.copy(out, 4)
  data.copy(out, 8)
  out.writeUInt32BE(crc32(crcInput), 8 + data.length)
  return out
}

/** 造一张完整的 8-bit RGB/RGBA PNG；像素字面量是测试的独立真相源。 */
function rasterPng(width, height, { colorType, pixel, pixelAt }) {
  const channels = colorType === 6 ? 4 : 3
  assert.equal(pixel.length, channels)
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = colorType
  const rows = []
  for (let y = 0; y < height; y += 1) {
    const pixels = Buffer.alloc(channels * width)
    for (let x = 0; x < width; x += 1) Buffer.from(pixelAt?.(x, y) ?? pixel).copy(pixels, x * channels)
    rows.push(Buffer.concat([Buffer.from([0]), pixels]))
  }
  const raw = Buffer.concat(rows)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

/** 造一张最小合法 PNG（只有签名 + IHDR，够读尺寸）。 */
function fakePng(width, height) {
  const bytes = Buffer.alloc(24)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0)
  bytes.writeUInt32BE(13, 8)
  bytes.write('IHDR', 12, 'ascii')
  bytes.writeUInt32BE(width, 16)
  bytes.writeUInt32BE(height, 20)
  return bytes
}

/** 真资产（磁盘上的那一份）——用它做「现状必须绿」的对照。 */
function realAssets() {
  const dir = join(repoRoot, ASSETS_DIR_REL)
  return readdirSync(dir).map((name) => ({ name, bytes: readFileSync(join(dir, name)) }))
}

const check = (overrides = {}) =>
  checkBrandIcons({ replayText: realReplay, assets: realAssets(), installedBuildDirEntries: null, ...overrides })

test('R1 现状（真表 + 真资产 + 目标侧不在射程）必须绿，且报 skip 而不是静默通过', () => {
  const result = check()
  assert.equal(result.passed, true, result.violations.join('\n'))
  assert.equal(result.skipped, true, '目标侧没量到就必须报 skip——「没量到」与「都合格」不能同形（P-15）')
  assert.match(result.note, /表内 \d+ 对；资产 \d+ 个（尺寸\/alpha\/透明角已核 \d+ 个）/)
})

test('R2 资产实际像素与声明不符必须判红——`--apply` 只管目标那一侧', () => {
  const pairs = parseIconPairs(realReplay)
  const target = pairs[0]
  const assets = realAssets().map((asset) =>
    asset.name === target.asset ? { name: asset.name, bytes: fakePng(512, 512) } : asset,
  )
  const result = check({ assets })
  assert.equal(result.passed, false, '声明 1024 而资产 512 必须拦住——这正是所有读数都绿的那一种')
  assert.ok(result.violations.some((v) => v.includes(`实际 512x512，表里声明 ${target.dim}`)), result.violations.join('\n'))
})

test('R2b 尺寸正确但无 alpha 的 RGB 硬边方块必须判红', () => {
  const pairs = parseIconPairs(realReplay)
  const target = pairs[0]
  const assets = realAssets().map((asset) =>
    asset.name === target.asset
      ? { name: asset.name, bytes: rasterPng(target.width, target.height, { colorType: 2, pixel: [11, 21, 33] }) }
      : asset,
  )
  const result = check({ assets })
  assert.equal(result.passed, false, '尺寸对但没有 alpha 的硬边方块正是旧判据会漏过的出货缺陷')
  assert.ok(
    result.violations.some((v) => v.includes(target.asset) && v.includes('alpha')),
    result.violations.join('\n'),
  )
})

test('R2c 有 alpha 通道但四角全不透明的硬边方块必须判红', () => {
  const pairs = parseIconPairs(realReplay)
  const target = pairs[0]
  const assets = realAssets().map((asset) =>
    asset.name === target.asset
      ? { name: asset.name, bytes: rasterPng(target.width, target.height, { colorType: 6, pixel: [11, 21, 33, 255] }) }
      : asset,
  )
  const result = check({ assets })
  assert.equal(result.passed, false, 'RGBA 只说明有通道；四角全不透明仍是硬边方块')
  assert.ok(
    result.violations.some((v) => v.includes(target.asset) && v.includes('透明边角区域')),
    result.violations.join('\n'),
  )
})

test('R2d 只挖四个角点、其余仍是硬边方块必须判红', () => {
  const pairs = parseIconPairs(realReplay)
  const target = pairs[0]
  const corner = (x, y) => (x === 0 || x === target.width - 1) && (y === 0 || y === target.height - 1)
  const bytes = rasterPng(target.width, target.height, {
    colorType: 6,
    pixel: [11, 21, 33, 255],
    pixelAt: (x, y) => corner(x, y) ? [11, 21, 33, 0] : [11, 21, 33, 255],
  })
  const assets = realAssets().map((asset) => asset.name === target.asset ? { name: asset.name, bytes } : asset)
  const result = check({ assets })
  assert.equal(result.passed, false, '四个单点透明不能冒充圆角/squircle 轮廓')
  assert.ok(result.violations.some((v) => v.includes(target.asset) && v.includes('透明边角区域')), result.violations.join('\n'))
})

test('R2e app squircle 中心深底不是 #0b1521 必须判红', () => {
  const bytes = rasterPng(1024, 1024, {
    colorType: 6,
    pixel: [12, 22, 34, 255],
    pixelAt: (x, y) => (x < 128 && y < 128) || (x >= 896 && y < 128) || (x < 128 && y >= 896) || (x >= 896 && y >= 896)
      ? [0, 0, 0, 0]
      : [12, 22, 34, 255],
  })
  const assets = realAssets().map((asset) => asset.name === 'app-squircle-1024.png' ? { name: asset.name, bytes } : asset)
  const result = check({ assets })
  assert.equal(result.passed, false)
  assert.ok(result.violations.some((v) => v.includes('中心像素') && v.includes('#0b1521')), result.violations.join('\n'))
})

test('R3 表里声明了但文件不存在（少一个）必须判红', () => {
  const pairs = parseIconPairs(realReplay)
  const result = check({ assets: realAssets().filter((asset) => asset.name !== pairs[0].asset) })
  assert.equal(result.passed, false)
  assert.ok(result.violations.some((v) => v.includes('但文件不存在（少一个）')), result.violations.join('\n'))
})

test('R4 目录里有但表里没引用（多一个）必须判红', () => {
  const result = check({ assets: [...realAssets(), { name: 'unused-64.png', bytes: fakePng(64, 64) }] })
  assert.equal(result.passed, false)
  assert.ok(result.violations.some((v) => v.includes('不在 ICON_PAIRS 里（多一个）')), result.violations.join('\n'))
})

test('R5 目标名重复必须判红（后一行覆盖前一行）', () => {
  // 表里一行一条独立字面量（真表就是这个写法）；重复那一行照同样格式追加。
  const duplicated = realReplay.replace('ICON_PAIRS=(', 'ICON_PAIRS=(\n  "app-icon-mac.png:app-squircle-1024.png:1024x1024"')
  assert.notEqual(duplicated, realReplay, '注入失败：表头写法变了？')
  const result = check({ replayText: duplicated })
  assert.equal(result.passed, false)
  assert.ok(result.violations.some((v) => v.includes('出现两次')), result.violations.join('\n'))
})

test('R5b 只认独立字面量，但漏读会被「多一个」兜住（表换写法不会静默少比）', () => {
  // 把一条表项改成同一行里追加的写法：解析器读不到它，于是它的资产变成「目录里有但表里没引用」。
  // 这条用例钉住的是**兜底**：解析器变窄不会让本项静默少比。
  const inline = realReplay.replace(/^\s*"tray-iconTemplate@2x\.png:mark-template-32\.png:32x32",?$/m, '')
    + '\nICON_PAIRS+=("tray-iconTemplate@2x.png:mark-template-32.png:32x32")\n'
  assert.notEqual(inline, realReplay, '注入失败：表项写法变了？')
  const result = check({ replayText: inline })
  assert.equal(result.passed, false)
  assert.ok(
    result.violations.some((v) => v.includes('mark-template-32.png') && v.includes('多一个')),
    `期望「多一个」兜底，实得：${result.violations.join(' | ')}`,
  )
})

test('R6 表解析不出任何一行必须判红（不是当作「没有什么可比的」）', () => {
  for (const replayText of ['', '#!/bin/bash\n# 表被删了\nICON_PAIRS=()\n']) {
    const result = check({ replayText })
    assert.equal(result.passed, false, `表为「${replayText.slice(0, 20)}」时必须判红`)
    assert.ok(result.violations.some((v) => v.includes('解析不出 ICON_PAIRS')))
  }
})

test('R7 目标侧在场时缺文件名必须判红；齐全时必须绿且报「已核 N 个」', () => {
  const pairs = parseIconPairs(realReplay)
  const missing = pairs.slice(1).map((pair) => pair.target)
  const bad = check({ installedBuildDirEntries: missing })
  assert.equal(bad.passed, false, '已装 app 里缺一个目标名 = 基座改了规格、本表过期')
  assert.ok(bad.violations.some((v) => v.includes(pairs[0].target)), bad.violations.join('\n'))

  const good = check({ installedBuildDirEntries: pairs.map((pair) => pair.target) })
  assert.equal(good.passed, true, good.violations.join('\n'))
  assert.equal(good.skipped, undefined, '目标侧量到了就不该报 skip')
  assert.match(good.note, new RegExp(`目标侧已核 ${pairs.length} 个文件名`))
})

test('R8 非 PNG / 读不出尺寸必须判红（判不出就不放行）', () => {
  const assets = realAssets().map((asset, index) =>
    index === 0 ? { name: asset.name, bytes: Buffer.from('not a png at all, 24 bytes') } : asset,
  )
  const result = check({ assets })
  assert.equal(result.passed, false)
  assert.ok(result.violations.some((v) => v.includes('读不出 PNG 尺寸')), result.violations.join('\n'))
})

test('M1 恒真桩突变：只比「声明 vs 声明」的实现会放过 R2 —— 证明 R2 量的是磁盘字节', () => {
  // 模拟退化实现：把资产尺寸当成声明值喂回去（即不读磁盘字节）——R2 的场景必须因此判绿，
  // 才说明 R2 的红来自「读了磁盘」。
  const pairs = parseIconPairs(realReplay)
  const declaredOnly = pairs.map((pair) => ({
    name: pair.asset,
    bytes: rasterPng(pair.width, pair.height, {
      colorType: 6,
      pixel: [0, 0, 0, 0],
      pixelAt: (x, y) => {
        const edge = Math.max(1, Math.floor(Math.min(pair.width, pair.height) * 0.125))
        const inCorner = (x < edge || x >= pair.width - edge) && (y < edge || y >= pair.height - edge)
        if (inCorner) return [0, 0, 0, 0]
        if (pair.asset === 'app-squircle-1024.png') return [0x0b, 0x15, 0x21, 0xff]
        const center = x >= edge && x < pair.width - edge && y >= edge && y < pair.height - edge
        return center ? [0xc4, 0xd0, 0xdc, 0xff] : [0, 0, 0, 0]
      },
    }),
  }))
  const result = checkBrandIcons({ replayText: realReplay, assets: declaredOnly, installedBuildDirEntries: null })
  assert.equal(result.passed, true, '声明与「自己声明的尺寸」当然相符——所以真正的牙齿在于读磁盘上的那一份')
})

test('解析器与尺寸读取器的边界', () => {
  const pairs = parseIconPairs(realReplay)
  assert.ok(pairs.length >= 5, `真表应至少 5 对，实得 ${pairs.length}`)
  for (const pair of pairs) assert.match(pair.dim, /^\d+x\d+$/)
  assert.equal(readPngSize(Buffer.alloc(4)), null, '不足 24 字节必须返回 null 而不是抛')
  assert.deepEqual(readPngSize(fakePng(7, 9)), { width: 7, height: 9 })
  const transparent = rasterPng(2, 2, { colorType: 6, pixel: [0, 0, 0, 0] })
  assert.deepEqual(readPngCornerAlpha(new Uint8Array(transparent)), [0, 0, 0, 0], '公共接口声明 Uint8Array 就必须真能解码')
  const rgb = rasterPng(2, 2, { colorType: 2, pixel: [0, 0, 0] })
  const withTransparency = Buffer.concat([
    rgb.subarray(0, -12),
    pngChunk('tRNS', Buffer.from([0, 0, 0, 0, 0, 0])),
    rgb.subarray(-12),
  ])
  assert.equal(pngHasAlpha(new Uint8Array(withTransparency)), true, 'RGB+tRNS 的 Uint8Array 也必须识别为有 alpha')
})
