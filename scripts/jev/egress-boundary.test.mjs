import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assertEgressSourceTracked, JevEgressBoundaryError } from './egress-boundary.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
/** 本仓里一份真实被跟踪的文件——闸门的阳性对照（committed 2026-09-20）。 */
const TRACKED_IN_REPO = join(HERE, 'samples.json')

function repoDir(files, { track = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'jev-egress-'))
  execFileSync('git', ['init', '-q', dir])
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text)
  if (track) execFileSync('git', ['-C', dir, 'add', '--', ...Object.keys(files)])
  return dir
}

test('本仓被跟踪的文件：放行并回出仓库内相对路径', () => {
  const result = assertEgressSourceTracked(TRACKED_IN_REPO)
  assert.equal(result.relPath, 'scripts/jev/samples.json')
  assert.ok(result.repoRoot.endsWith('Magpie-Horch'), result.repoRoot)
})

test('URL 与字符串两种形态同判', () => {
  const viaUrl = assertEgressSourceTracked(new URL('./samples.json', import.meta.url))
  assert.equal(viaUrl.realPath, assertEgressSourceTracked(TRACKED_IN_REPO).realPath)
})

test('未跟踪文件：拒载并点名 ADR-0138 D2（attrib 那类文本的判词）', () => {
  const dir = repoDir({ 'draft.json': '{"skills":{}}' }, { track: false })
  assert.throws(
    () => assertEgressSourceTracked(join(dir, 'draft.json')),
    (error) => error instanceof JevEgressBoundaryError
      && /未被 git 跟踪/.test(error.message)
      && /ADR-0138 D2/.test(error.message),
  )
})

test('仓外文件（不在任何 git 仓库里）：拒载并点名 D2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'jev-egress-outside-'))
  const path = join(dir, 'corpus.json')
  writeFileSync(path, '{"skills":{}}')
  assert.throws(
    () => assertEgressSourceTracked(path),
    (error) => error instanceof JevEgressBoundaryError
      && /不在任何 git 仓库内/.test(error.message)
      && /ADR-0138 D2/.test(error.message),
  )
})

test('不存在的路径与目录：拒载而不是抛 ENOENT/EISDIR', () => {
  assert.throws(() => assertEgressSourceTracked(join(tmpdir(), 'jev-not-here-8f3a.json')), JevEgressBoundaryError)
  assert.throws(() => assertEgressSourceTracked(HERE), /不是文件/)
})
