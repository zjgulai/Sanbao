import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const script = resolve(import.meta.dirname, '../../packaging/scripts/release-verify-test.sh')

for (const mode of ['failure', 'empty', 'missing', 'file']) {
  test(`沙箱创建 ${mode} 时，在任何修改命令前退出`, () => {
    const root = mkdtempSync(join(tmpdir(), 'release-sandbox-'))
    try {
      const envFile = join(root, 'boundary.sh')
      writeFileSync(envFile, `
mktemp() {
  case "$PROBE_MODE" in
    failure) return 1 ;;
    empty) return 0 ;;
    missing) printf '%s/nonexistent\\n' "$PROBE_ROOT" ;;
    file) printf '%s/boundary.sh\\n' "$PROBE_ROOT" ;;
  esac
}
blocked() { printf '%s\\n' "$*" >> "$PROBE_ROOT/writes"; exit 96; }
mkdir() { blocked mkdir "$@"; }
cp() { blocked cp "$@"; }
rm() { blocked rm "$@"; }
chflags() { blocked chflags "$@"; }
`)
      const result = spawnSync('/bin/bash', [script], {
        encoding: 'utf8', timeout: 10000,
        env: { ...process.env, BASH_ENV: envFile, PROBE_MODE: mode, PROBE_ROOT: root },
      })
      assert.equal(result.status, 2, result.stdout + result.stderr)
      assert.equal(existsSync(join(root, 'writes')), false, '创建失败后不得执行修改命令')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
}

test('沙箱使用可移植的尾部 X 模板，并在给定 TMPDIR 内创建', () => {
  const root = mkdtempSync(join(tmpdir(), 'release-template-'))
  try {
    const envFile = join(root, 'boundary.sh')
    writeFileSync(envFile, `
mktemp() {
  [ "$#" -eq 2 ] && [ "$1" = '-d' ] || return 1
  case "$2" in "$TMPDIR/"*.XXXXXX) ;; *) return 1 ;; esac
  command mktemp "$@"
}
mkdir() { printf '%s\\n' "$SANDBOX" > "$PROBE_ROOT/created"; exit 95; }
`)
    const result = spawnSync('/bin/bash', [script], {
      encoding: 'utf8', timeout: 10000,
      env: { ...process.env, BASH_ENV: envFile, TMPDIR: root, PROBE_ROOT: root },
    })
    assert.equal(result.status, 95, result.stdout + result.stderr)
    assert.ok(readFileSync(join(root, 'created'), 'utf8').startsWith(`${root}/lute-release-verify.`))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
