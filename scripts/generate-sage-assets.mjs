#!/usr/bin/env node
/**
 * Sage P0 asset supply chain.
 *
 * This intentionally has no connection to the legacy packaging asset paths.
 * It accepts exactly one audited external input, extracts path geometry only,
 * and writes an internally reviewable candidate set.  A blocked release gate
 * in the manifest is deliberate: these files are not P1/public-release
 * approval.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inspectPng } from './lib/sage-png.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const expectedSourceSha256 = '9a90f439f48b597c4afc9459836cd036371705880573f1749970cae78631a4d1'
const expectedGeometrySha256 = 'a49c03f1a684f86fcaa5c9ea690002ad30b0e28212a96c277f31ddba5065cd1d'
const outputRoot = join(repoRoot, 'assets', 'sage')
const iconEntries = [
  ['icon_16x16.png', 16],
  ['icon_16x16@2x.png', 32],
  ['icon_32x32.png', 32],
  ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128],
  ['icon_128x128@2x.png', 256],
  ['icon_256x256.png', 256],
  ['icon_256x256@2x.png', 512],
  ['icon_512x512.png', 512],
  ['icon_512x512@2x.png', 1024],
]
const svgNames = ['sage-symbol-plain.svg', 'sage-symbol-dark.svg', 'sage-symbol-light.svg', 'Sage-lockup.svg']
const expectedOutputs = [...svgNames, ...iconEntries.map(([name]) => `AppIcon.iconset/${name}`), 'Sage.icns'].sort()

function usage() {
  return 'usage: node scripts/generate-sage-assets.mjs [--out <directory>] [--source <svg>] [--check]'
}

function parseArgs(argv) {
  const args = { out: outputRoot, source: null, check: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--out' || arg === '--source') {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`)
      args[arg.slice(2)] = resolve(value)
      index += 1
    } else if (arg === '--check') {
      args.check = true
    } else {
      throw new Error(`unknown argument: ${arg}`)
    }
  }
  return args
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function fileSha256(path) {
  return sha256(readFileSync(path))
}

function geometrySha256(geometry) {
  return sha256(JSON.stringify(geometry))
}

function xmlEscape(value) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

function attribute(raw, name) {
  return raw.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? null
}

/** Extract only the trusted source's outer transform and path geometry. */
function extractGeometry(sourceText) {
  const group = sourceText.match(/<g\s+transform="([^"]+)"[^>]*>([\s\S]*?)<\/g>/)
  if (!group) throw new Error('source SVG does not contain one extractable geometry group')
  const paths = [...group[2].matchAll(/<path\s+([^>]*?)\/>/g)].map((match) => {
    const d = attribute(match[1], 'd')
    if (!d) throw new Error('source SVG path lacks d geometry')
    const transform = attribute(match[1], 'transform')
    return { d, transform }
  })
  if (paths.length === 0) throw new Error('source SVG yielded no path geometry')
  return { groupTransform: group[1], paths }
}

function renderedPaths(geometry, indent = '    ') {
  return geometry.paths.map(({ d, transform }) => `${indent}<path d="${xmlEscape(d)}" fill="currentColor"${transform ? ` transform="${xmlEscape(transform)}"` : ''} />`).join('\n')
}

function symbolSvg(geometry, color = null) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" fill="currentColor"${color ? ` color="${color}"` : ''} role="img" aria-label="Sage" shape-rendering="geometricPrecision">`,
    '  <title>Sage</title>',
    `  <g transform="${xmlEscape(geometry.groupTransform)}">`,
    renderedPaths(geometry, '    '),
    '  </g>',
    '</svg>',
    '',
  ].join('\n')
}

function lockupSvg(geometry) {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1024" fill="currentColor" color="#17324d" role="img" aria-label="Sage" shape-rendering="geometricPrecision">',
    '  <title>Sage</title>',
    '  <g transform="translate(18 18) scale(0.72)">',
    `    <g transform="${xmlEscape(geometry.groupTransform)}">`,
    renderedPaths(geometry, '      '),
    '    </g>',
    '  </g>',
    '  <text x="820" y="590" font-family="-apple-system, BlinkMacSystemFont, &quot;Helvetica Neue&quot;, sans-serif" font-size="260" font-weight="600" letter-spacing="-12">Sage</text>',
    '</svg>',
    '',
  ].join('\n')
}

function iconSvg(geometry) {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img" aria-label="Sage" shape-rendering="geometricPrecision">',
    '  <title>Sage</title>',
    '  <rect x="64" y="64" width="896" height="896" rx="224" fill="#17324d" />',
    '  <g color="#e7f8f2" transform="translate(143.36 143.36) scale(0.72)">',
    `    <g transform="${xmlEscape(geometry.groupTransform)}">`,
    renderedPaths(geometry, '      '),
    '    </g>',
    '  </g>',
    '</svg>',
    '',
  ].join('\n')
}

async function listFiles(root) {
  const found = []
  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const full = join(current, entry.name)
      if (entry.isDirectory()) await visit(full)
      else if (entry.isFile()) found.push(relative(root, full))
      else throw new Error(`unsupported asset entry: ${relative(root, full)}`)
    }
  }
  await visit(root)
  return found.sort()
}

function assertSageMetadata(svgPath) {
  const text = readFileSync(svgPath, 'utf8')
  if (!/<title>Sage<\/title>/.test(text) || !/aria-label="Sage"/.test(text)) {
    throw new Error(`${basename(svgPath)} must use Sage title and aria-label`)
  }
  if (/sanbao/i.test(text) || /deepseek|harness|lute/i.test(text)) {
    throw new Error(`${basename(svgPath)} carries prohibited source-brand metadata`)
  }
}

function assertPng(path, expectedSize) {
  const image = inspectPng(readFileSync(path))
  if (image === null) throw new Error(`${relative(repoRoot, path)} is not a supported RGBA PNG`)
  if (image.width !== expectedSize || image.height !== expectedSize) {
    throw new Error(`${relative(repoRoot, path)} dimensions ${image.width}x${image.height} != ${expectedSize}x${expectedSize}`)
  }
  if (image.corners.some((alpha) => alpha !== 0)) throw new Error(`${relative(repoRoot, path)} has opaque corners`)
  if (image.opaquePixels === 0 || image.transparentPixels === 0) throw new Error(`${relative(repoRoot, path)} lacks a usable alpha silhouette`)
}

function canonicalManifest(manifest) {
  const { manifestCanonicalSha256, ...unsigned } = manifest
  return `${JSON.stringify(unsigned, null, 2)}\n`
}

function expectedManifest(root, geometry) {
  const outputs = expectedOutputs.map((assetPath) => ({
    path: assetPath,
    sha256: fileSha256(join(root, assetPath)),
    purpose: assetPath.endsWith('.icns') ? 'macOS icon container candidate' : assetPath.startsWith('AppIcon.iconset/') ? 'macOS iconset candidate' : assetPath === 'Sage-lockup.svg' ? 'independent Sage lockup candidate' : 'canonical Sage symbol candidate',
    surfaces: assetPath.endsWith('.icns') || assetPath.startsWith('AppIcon.iconset/') ? ['Finder', 'Dock candidate'] : assetPath === 'Sage-lockup.svg' ? ['product lockup candidate'] : ['product symbol candidate'],
  }))
  const manifest = {
    schemaVersion: 1,
    generator: { path: 'scripts/generate-sage-assets.mjs', version: 1 },
    source: {
      id: 'sanbao-a-starsail-product-symbol-v1',
      rawUpstreamSha256: expectedSourceSha256,
      geometrySha256: expectedGeometrySha256,
    },
    geometryExtraction: {
      method: 'outer-group-transform-and-path-d-only',
      extractedPathCount: geometry.paths.length,
      excluded: ['source title', 'source aria-label', 'source lockup', 'source wordmark'],
    },
    outputs,
    approval: {
      rights: 'unapproved',
      trademark: 'unapproved',
      visual: 'unapproved',
      approvedBy: null,
      approvedAt: null,
    },
    releaseGate: {
      status: 'blocked',
      phase: 'P1 public release',
      reason: 'rights, trademark, and visual approval are required before public release',
    },
  }
  return { ...manifest, manifestCanonicalSha256: sha256(canonicalManifest(manifest)) }
}

function createIcns(iconsetDir, outPath) {
  execFileSync('iconutil', ['-c', 'icns', iconsetDir, '-o', outPath], { stdio: 'pipe' })
}

function unpackIcns(icnsPath, temporaryRoot) {
  const unpacked = join(temporaryRoot, 'unpacked.iconset')
  execFileSync('iconutil', ['-c', 'iconset', icnsPath, '-o', unpacked], { stdio: 'pipe' })
  return unpacked
}

function validateManifest(root, manifest, geometry) {
  if (manifest.schemaVersion !== 1 || manifest.generator?.path !== 'scripts/generate-sage-assets.mjs' || manifest.generator?.version !== 1) {
    throw new Error('manifest generator identity is invalid')
  }
  if (manifest.source?.id !== 'sanbao-a-starsail-product-symbol-v1' || manifest.source?.rawUpstreamSha256 !== expectedSourceSha256 || manifest.source?.geometrySha256 !== expectedGeometrySha256) {
    throw new Error('manifest source identity or SHA-256 is invalid')
  }
  if (geometrySha256(geometry) !== expectedGeometrySha256) throw new Error('candidate geometry does not match the independent Sage geometry anchor')
  if (manifest.geometryExtraction?.extractedPathCount !== geometry.paths.length || manifest.geometryExtraction?.method !== 'outer-group-transform-and-path-d-only') {
    throw new Error('manifest geometry extraction record drifted')
  }
  if (manifest.approval?.rights !== 'unapproved' || manifest.approval?.trademark !== 'unapproved' || manifest.approval?.visual !== 'unapproved' || manifest.approval?.approvedBy !== null || manifest.approval?.approvedAt !== null) {
    throw new Error('manifest approval must remain explicitly unapproved')
  }
  if (manifest.releaseGate?.status !== 'blocked' || manifest.releaseGate?.phase !== 'P1 public release') {
    throw new Error('manifest P1 public release gate must remain blocked')
  }
  if (manifest.manifestCanonicalSha256 !== sha256(canonicalManifest(manifest))) throw new Error('manifest canonical SHA-256 drifted')

  const outputPaths = manifest.outputs?.map((entry) => entry.path).sort()
  if (JSON.stringify(outputPaths) !== JSON.stringify(expectedOutputs)) throw new Error('manifest output list does not exactly match the Sage asset contract')
  const actual = listFiles(root)
  return Promise.resolve(actual).then((files) => {
    const expectedFiles = ['manifest.json', ...expectedOutputs].sort()
    if (JSON.stringify(files) !== JSON.stringify(expectedFiles)) throw new Error('Sage asset directory and manifest outputs diverged')
    for (const entry of manifest.outputs) {
      if (entry.sha256 !== fileSha256(join(root, entry.path))) throw new Error(`manifest SHA-256 drifted: ${entry.path}`)
      if (!Array.isArray(entry.surfaces) || entry.surfaces.length === 0 || typeof entry.purpose !== 'string') throw new Error(`manifest purpose/surfaces missing: ${entry.path}`)
    }
  })
}

async function renderCandidate(root, geometry) {
  await writeFile(join(root, 'sage-symbol-plain.svg'), symbolSvg(geometry))
  await writeFile(join(root, 'sage-symbol-dark.svg'), symbolSvg(geometry, '#e7f8f2'))
  await writeFile(join(root, 'sage-symbol-light.svg'), symbolSvg(geometry, '#17324d'))
  await writeFile(join(root, 'Sage-lockup.svg'), lockupSvg(geometry))
  const temporaryIconSvg = join(root, 'icon-source.svg')
  await writeFile(temporaryIconSvg, iconSvg(geometry))
  const iconset = join(root, 'AppIcon.iconset')
  await mkdir(iconset)
  for (const [name, size] of iconEntries) execFileSync('sips', ['-z', String(size), String(size), '-s', 'format', 'png', temporaryIconSvg, '--out', join(iconset, name)], { stdio: 'pipe' })
  await rm(temporaryIconSvg)
  createIcns(iconset, join(root, 'Sage.icns'))
  const manifest = expectedManifest(root, geometry)
  await writeFile(join(root, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
}

async function validateAssetSet(root) {
  if (!existsSync(root)) throw new Error(`Sage asset directory does not exist: ${root}`)
  const geometry = extractGeometry(readFileSync(join(root, 'sage-symbol-plain.svg'), 'utf8'))
  const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'))
  await validateManifest(root, manifest, geometry)
  for (const name of svgNames) assertSageMetadata(join(root, name))
  for (const [name, size] of iconEntries) assertPng(join(root, 'AppIcon.iconset', name), size)

  const temporaryRoot = mkdtempSync(join(tmpdir(), 'sage-icns-check-'))
  try {
    const unpacked = unpackIcns(join(root, 'Sage.icns'), temporaryRoot)
    for (const [name, size] of iconEntries) assertPng(join(unpacked, name), size)
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
  const regenerated = mkdtempSync(join(tmpdir(), 'sage-assets-anchor-'))
  try {
    await renderCandidate(regenerated, geometry)
    for (const path of ['manifest.json', ...expectedOutputs]) {
      if (!readFileSync(join(root, path)).equals(readFileSync(join(regenerated, path)))) throw new Error(`independent geometry-anchor regeneration differs: ${path}`)
    }
  } finally {
    rmSync(regenerated, { recursive: true, force: true })
  }
}

async function generate(out, sourcePath) {
  if (!sourcePath) throw new Error('generation requires an explicit --source <svg>')
  if (existsSync(out)) throw new Error(`refusing to overwrite existing Sage candidate: ${out}`)
  const sourceText = readFileSync(sourcePath, 'utf8')
  if (fileSha256(sourcePath) !== expectedSourceSha256) throw new Error(`source SHA-256 mismatch; expected ${expectedSourceSha256}`)
  const geometry = extractGeometry(sourceText)
  if (geometrySha256(geometry) !== expectedGeometrySha256) throw new Error('source geometry does not match the independent Sage geometry anchor')
  const parent = dirname(out)
  await mkdir(parent, { recursive: true })
  const temporaryRoot = mkdtempSync(join(parent, '.sage-assets-'))
  try {
    await renderCandidate(temporaryRoot, geometry)
    renameSync(temporaryRoot, out)
  } catch (error) {
    rmSync(temporaryRoot, { recursive: true, force: true })
    throw error
  }
}

async function main() {
  const { out, source, check } = parseArgs(process.argv.slice(2))
  if (check) {
    await validateAssetSet(out)
    process.stdout.write(`[sage-assets] CHECK PASS ${out}\n`)
    return
  }
  await generate(out, source)
  process.stdout.write(`[sage-assets] GENERATED ${out}\n`)
}

main().catch((error) => {
  process.stderr.write(`[sage-assets] FAIL: ${error.message}\n${usage()}\n`)
  process.exitCode = 1
})
