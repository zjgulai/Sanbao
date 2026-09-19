import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readPngCornerAlpha } from './brand-icons.mjs'
import { parsePinEntries } from './brand-avatars-pin.mjs'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const buildScript = join(repoRoot, 'packaging', 'scripts', 'build-app-icon.sh')
const markSource = join(repoRoot, 'brand', 'logo', 'placeholder-mark.svg')
const realReplay = readFileSync(join(repoRoot, 'dsh-patches', 'brand-replay.sh'), 'utf8')
const assemble = readFileSync(join(repoRoot, 'packaging', 'assemble.sh'), 'utf8')
const refreshScript = readFileSync(join(repoRoot, 'packaging', 'scripts', 'refresh-app-brand.sh'), 'utf8')
const expectedAssets = [
  'app-squircle-1024.png',
  'mark-colored-16.png',
  'mark-colored-20.png',
  'mark-colored-24.png',
  'mark-colored-32.png',
  'mark-template-16.png',
  'mark-template-32.png',
]

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function buildFixture(label, t) {
  const root = mkdtempSync(join(tmpdir(), `sanbao-app-icon-${label}-`))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const assetsDir = join(root, 'brand-icons')
  const icns = join(root, 'app-icon.icns')
  execFileSync('bash', [buildScript, icns], {
    cwd: repoRoot,
    env: { ...process.env, DSH_VENDOR: repoRoot, APP_ICON_ASSETS_DIR: assetsDir },
    stdio: 'pipe',
  })
  return { root, assetsDir, icns }
}

test('同一受管占位 mark 连跑两次，icns 与运行时 PNG 必须逐字节可复现', (t) => {
  const script = readFileSync(buildScript, 'utf8')
  assert.doesNotMatch(script, /LUTE_ICON_ENGINE/, '废弃的仓外头像引擎分支必须删除')
  const mark = readFileSync(markSource, 'utf8')
  assert.match(mark, /data-status="placeholder"/)
  assert.match(mark, /data-semantic="neutral-geometric"/)

  const first = buildFixture('a', t)
  const second = buildFixture('b', t)
  assert.deepEqual(readdirSync(first.assetsDir).sort(), expectedAssets)
  assert.deepEqual(readdirSync(second.assetsDir).sort(), expectedAssets)
  assert.equal(sha256(first.icns), sha256(second.icns), 'iconutil 产物也必须可复现')
  assert.equal(sha256(first.icns), sha256(join(repoRoot, 'packaging', 'assets', 'app-icon.icns')), '入仓 icns 必须是当前生成器产物')
  for (const name of expectedAssets) {
    assert.equal(sha256(join(first.assetsDir, name)), sha256(join(second.assetsDir, name)), `${name} 两次构建字节漂移`)
    assert.equal(
      sha256(join(first.assetsDir, name)),
      sha256(join(repoRoot, 'packaging', 'assets', 'brand-icons', name)),
      `${name} 入仓副本与生成器产物分叉`,
    )
    assert.deepEqual(readPngCornerAlpha(readFileSync(join(first.assetsDir, name))), [0, 0, 0, 0], `${name} 四角必须透明`)
  }
})

test('打包缺 app/runtime 图标必须 fail-closed，不得保留官方原样继续出货', () => {
  const appBlock = assemble.match(/# 暂存改写：Sanbao 受管 squircle[\s\S]*?# 暂存改写：品牌重放/)?.[0] ?? ''
  assert.match(appBlock, /缺少必备资产 assets\/app-icon\.icns/)
  assert.match(appBlock, /exit 1/)
  assert.doesNotMatch(appBlock, /图标保持官方原样/)

  const payloadBlock = assemble.match(/# Sanbao 受管 squircle 随包分发[\s\S]*?chmod 755/)?.[0] ?? ''
  assert.match(payloadBlock, /sed -n '\/\^ICON_PAIRS=\(\/[\s\S]*?brand-replay\.sh/)
  assert.match(payloadBlock, /for asset in "\$\{icon_assets\[@\]\}"/)
  assert.match(payloadBlock, /缺少 ICON_PAIRS 必备资产/)
  assert.match(payloadBlock, /exit 1/)
  assert.doesNotMatch(payloadBlock, /app-icon\.icns[^\n]*\|\| true/)
  assert.doesNotMatch(payloadBlock, /brand-icons[^\n]*\|\| true/)
})

test('打包 runtime 资产真实复制成功，且缺任一项必须拒绝', (t) => {
  const block = assemble.match(/mkdir -p "\$PAYLOAD\/tools\/brand-icons"[\s\S]*?(?=chmod 755)/)?.[0]
  assert.ok(block)
  const root = mkdtempSync(join(tmpdir(), 'sanbao-icon-payload-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const pkg = join(root, 'packaging')
  cpSync(join(repoRoot, 'packaging/assets/brand-icons'), join(pkg, 'assets/brand-icons'), { recursive: true })
  const run = (payload) => spawnSync('bash', ['-c', `set -euo pipefail\n${block}`], {
    encoding: 'utf8',
    env: { ...process.env, PKG_ROOT: pkg, PAYLOAD: payload, DSH_VENDOR: repoRoot },
  })
  const payload = join(root, 'complete')
  const complete = run(payload)
  assert.equal(complete.status, 0, complete.stderr + complete.stdout)
  assert.deepEqual(readdirSync(join(payload, 'tools/brand-icons')).sort(), expectedAssets)
  for (const name of expectedAssets) {
    const file = join(pkg, 'assets/brand-icons', name)
    const bytes = readFileSync(file)
    unlinkSync(file)
    const missing = run(join(root, `missing-${name}`))
    assert.equal(missing.status, 1, `${name}: ${missing.stderr}${missing.stdout}`)
    assert.ok(missing.stdout.includes(name), missing.stdout)
    writeFileSync(file, bytes)
  }
})

test('refresh 备份失败必须中止，不能继续报告备份成功', (t) => {
  const block = refreshScript.slice(refreshScript.indexOf('  STAMP='), refreshScript.indexOf('\n# ── 3.'))
  assert.ok(block.includes('已备份原字节'))
  const root = mkdtempSync(join(tmpdir(), 'sanbao-icon-backup-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const app = join(root, 'DSH Desktop.app')
  mkdirSync(join(app, 'Contents/Resources/app/build'), { recursive: true })
  const result = spawnSync('bash', ['-c', `set -u\nsay() { printf '%s\\n' "$*"; }\nif true; then\n${block}\nprintf 'CONTINUED\\n'`], {
    encoding: 'utf8', env: { ...process.env, HOME: root, DSH_APP: app },
  })
  assert.equal(result.status, 1, result.stdout + result.stderr)
  assert.ok(!result.stdout.includes('CONTINUED'), result.stdout)
  assert.ok(!result.stdout.includes('已备份原字节'), result.stdout)
})

test('refresh-app-brand 必须在重放前备份，并覆盖 no-ASAR/旧 unpacked 双形态 build 根', () => {
  const backupAt = refreshScript.indexOf('已备份原字节')
  const replayAt = refreshScript.indexOf('bash "$REPLAY" "$MODE"')
  assert.ok(backupAt > 0 && replayAt > 0 && backupAt < replayAt, '备份必须发生在任何 bundle 写入之前')
  assert.match(refreshScript, /BRAND_ICON_ASSET="\$REPO\/packaging\/assets\/app-icon\.icns"/)
  assert.match(refreshScript, /BRAND_ICON_ASSET="\$BRAND_ICON_ASSET" BRAND_ICONS_DIR=/)
  assert.match(refreshScript, /Contents\/Resources\/app\/build/)
  assert.match(refreshScript, /Contents\/Resources\/app\.asar\.unpacked\/build/)
})

test('占位输入与全部生成输出必须进入 pin，brand-replay 回退 sha1 必须指向当前 icns', () => {
  const pinEntries = parsePinEntries(readFileSync(join(repoRoot, 'vendor', 'worldpilot.pin'), 'utf8'))
  assert.ok(pinEntries)
  const pinned = new Set(pinEntries.map((entry) => entry.path))
  const expectedPinned = [
    'brand/logo/placeholder-mark.svg',
    'packaging/assets/app-icon.icns',
    ...expectedAssets.map((name) => `packaging/assets/brand-icons/${name}`),
  ]
  for (const path of expectedPinned) assert.ok(pinned.has(path), `${path} 未进入 vendor/worldpilot.pin`)
  const fallback = realReplay.match(/BRAND_ICON_SHA="([0-9a-f]{40})"\s+# build-app-icon\.sh 受管产物 sha1/)?.[1]
  assert.equal(fallback, createHash('sha1').update(readFileSync(join(repoRoot, 'packaging', 'assets', 'app-icon.icns'))).digest('hex'))
})
