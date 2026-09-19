import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { renderWordmark } from '../lib/brand-wordmark.mjs'
import { DERIVATIVES, computeExpectedForDerivative } from '../lib/brand-derivatives.mjs'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const fontPath = fileURLToPath(new URL('../../brand/logo/Inter-SemiBold.ttf', import.meta.url))
const markSvg = readFileSync(new URL('../../brand/logo/placeholder-mark.svg', import.meta.url), 'utf8')

test('名源生成 Inter 路径字标，改名改变轮廓且不依赖运行时字体', () => {
  const first = renderWordmark({ nameLatin: 'Sanbao', markSvg, fontPath })
  const second = renderWordmark({ nameLatin: 'Fleet', markSvg, fontPath })
  assert.match(first, /^<svg /)
  assert.match(first, /data-brand-wordmark="stacked"/)
  assert.match(first, /aria-label="Sanbao"/)
  assert.match(first, /data-font="Inter-SemiBold"/)
  assert.match(first, /<path[^>]*d="[^"]*[LQC][^"]*"/)
  assert.doesNotMatch(first, /<(?:text|image|script)\b|font-family|@font-face|data:image/i)
  const path = (svg) => svg.match(/<path[^>]*d="([^"]+)"/)?.[1]
  assert.notEqual(path(first), path(second), '必须重算字形，不能只换 aria-label')
  assert.equal(first, renderWordmark({ nameLatin: 'Sanbao', markSvg, fontPath }))
})

test('既有品牌生成清单覆盖启动 SVG 载荷，旧 ROOT 文本必须被完全替换', () => {
  const derivative = DERIVATIVES.find((entry) => entry.id === 'boot-stacked-wordmark')
  assert.ok(derivative, '启动载荷必须进入同一名源生成清单')
  assert.equal(derivative.file, 'dsh-patches/brand-payload-wordmark.txt')
  const payload = computeExpectedForDerivative('this.wordmark=div(css.wordmark,"ROOT");', derivative, { nameLatin: 'Sanbao' })
  assert.match(payload, /^<svg /)
  assert.doesNotMatch(payload, /ROOT|this\.wordmark/)
  assert.match(payload, /aria-label="Sanbao"/)
})

test('真实重放替换旧 ROOT 字标为 SVG，保持 spinner 构造并可幂等校验', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'boot-wordmark-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const tools = join(root, 'tools')
  const app = join(root, 'DSH Desktop.app')
  const assets = join(app, 'Contents/Resources/app/node_modules/@deepseek-ai/dsh-web-frontend/dist/assets')
  mkdirSync(tools, { recursive: true })
  mkdirSync(assets, { recursive: true })
  cpSync(join(repoRoot, 'dsh-patches/brand-replay.sh'), join(tools, 'brand-replay.sh'))
  cpSync(join(repoRoot, 'dsh-patches/boot-brand-replay.py'), join(tools, 'boot-brand-replay.py'))
  cpSync(join(repoRoot, 'dsh-patches/brand-payload-wordmark.txt'), join(tools, 'brand-payload-wordmark.txt'))
  const file = join(assets, 'boot.js')
  const original = 'const rt={wordmark:"_wordmark_demo_1",spinner:"_spinner_demo_1"};class BootPage{constructor(t){this.wordmark=ot(rt.wordmark,"ROOT"),this.spinner=ot(rt.spinner),this.spinner.dataset.dshBootSpinner="",t.append(this.wordmark,this.spinner)}}'
  const css = '._spinner_demo_1{animation:_spin_demo_1 .8s linear infinite}._spinner_demo_1::after{background:conic-gradient(var(--dsw-alias-brand-primary) var(--dsh-boot-arc,72deg),transparent 0)}@keyframes _spin_demo_1{to{transform:rotate(360deg)}}'
  writeFileSync(join(assets, 'boot.css'), css)
  writeFileSync(file, original)
  const replay = (mode) => spawnSync('bash', [join(tools, 'brand-replay.sh'), mode], { encoding: 'utf8', env: { ...process.env, DSH_APP: app } })
  const reject = (mode, pattern) => {
    const result = replay(mode)
    assert.equal(result.status, 1, result.stdout + result.stderr)
    assert.match(result.stdout + result.stderr, pattern)
    return result
  }
  assert.match(replay('--check').stdout, /DRIFT wordmark/)
  const applied = replay('--apply')
  assert.match(applied.stdout, /APPLY wordmark/, applied.stderr)
  const result = readFileSync(file, 'utf8')
  assert.match(result, /this\.wordmark\.innerHTML=/)
  assert.doesNotMatch(result, /wordmark,"ROOT"/)
  assert.ok(result.includes('this.spinner=ot(rt.spinner),this.spinner.dataset.dshBootSpinner=""'))
  assert.match(replay('--check').stdout, /OK   wordmark/)
  replay('--apply')
  assert.equal(readFileSync(file, 'utf8'), result)

  writeFileSync(file, '/* boot constructor removed */')
  reject('--check', /missing\/ambiguous boot constructor/)
  writeFileSync(file, original + ';' + original.replace('BootPage', 'Duplicate'))
  reject('--apply', /multiple wordmark classes/)
  assert.equal(readFileSync(file, 'utf8'), original + ';' + original.replace('BootPage', 'Duplicate'))
  writeFileSync(file, original)
  writeFileSync(join(assets, 'duplicate.js'), original)
  reject('--apply', /missing\/ambiguous boot constructor/)
  assert.equal(readFileSync(file, 'utf8'), original, '跨文件多锚不能先改后报红')
  rmSync(join(assets, 'duplicate.js'))

  for (const badCss of [
    '',
    '/* ._spinner_demo_1{animation:_spin_demo_1 2s linear infinite} */',
    css.replace('.8s linear infinite', '2s linear infinite;animation:none'),
    css + '._spinner_demo_1{animation:none}',
    css + '[data-dsh-boot-spinner]{animation:none!important}',
    css.replace('animation:', '--animation:'),
  ]) {
    writeFileSync(file, original)
    writeFileSync(join(assets, 'boot.css'), badCss)
    reject('--apply', /boot-spin/)
    assert.equal(readFileSync(file, 'utf8'), original, 'CSS 判据失败时 JS 不能先落笔')
    assert.equal(readFileSync(join(assets, 'boot.css'), 'utf8'), badCss)
  }
  writeFileSync(join(assets, 'boot.css'), css)
  const singleQuote = original.replace(',this.spinner=', ",this.wordmark.innerHTML='<svg>old</svg>',this.spinner=")
  writeFileSync(file, singleQuote)
  const replaced = replay('--apply')
  assert.match(replaced.stdout, /APPLY wordmark/, replaced.stderr)
  assert.ok(!readFileSync(file, 'utf8').includes('<svg>old</svg>'))
  for (const falseAnchor of ['/*' + original + '*/', 'const example = ' + JSON.stringify(original)]) {
    writeFileSync(file, falseAnchor)
    reject('--apply', /missing\/ambiguous boot constructor/)
    assert.equal(readFileSync(file, 'utf8'), falseAnchor)
  }
})

test('第二个启动文件写入失败时回滚第一个文件，并回收临时文件', () => {
  const program = `
import importlib.util, pathlib, sys, tempfile
from unittest.mock import patch
spec = importlib.util.spec_from_file_location('boot_replay', sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
with tempfile.TemporaryDirectory(prefix='boot-rollback-') as root:
    root = pathlib.Path(root)
    js, css = root / 'boot.js', root / 'boot.css'
    js.write_bytes(b'original JS')
    css.write_bytes(b'original CSS')
    originals = {js: js.read_bytes(), css: css.read_bytes()}
    modes = {js: 0o644, css: 0o644}
    replace = module.os.replace
    failed = False
    def fail_css(source, target):
        global failed
        if pathlib.Path(target) == css and not failed:
            failed = True
            raise OSError('simulated CSS replacement failure')
        return replace(source, target)
    with patch.object(module.os, 'replace', fail_css):
        try:
            module.apply_changes(originals, modes, [('wordmark', js, b'new JS'), ('boot-spin', css, b'new CSS')])
        except OSError:
            pass
        else:
            raise AssertionError('write failure must propagate')
    assert failed
    assert js.read_bytes() == originals[js]
    assert css.read_bytes() == originals[css]
    assert sorted(p.name for p in root.iterdir()) == ['boot.css', 'boot.js']
print('ROLLBACK_OK')
`
  const result = spawnSync('python3', ['-c', program, join(repoRoot, 'dsh-patches/boot-brand-replay.py')], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stdout + result.stderr)
  assert.match(result.stdout, /ROLLBACK_OK/)
})

