import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  JEV_KEY_NAME,
  parseCredentialsRefs,
  parseDotEnv,
  redact,
  resolveJevKey,
} from './jev-credentials.mjs'

function fixture(name, files) {
  const root = mkdtempSync(join(tmpdir(), `jev-cred-${name}-`))
  for (const [rel, content] of Object.entries(files)) {
    const p = join(root, rel)
    mkdirSync(join(p, '..'), { recursive: true })
    writeFileSync(p, content)
  }
  return root
}

test('优先级链：env > credentials refs > 项目 .env > $DSH_HOME/.env', () => {
  const root = fixture('priority', {
    '.credentials.yaml': 'version: 1\nrefs:\n  LUTE_JEV_API_KEY: from-creds\n',
    '.env': 'LUTE_JEV_API_KEY=from-project\n',
    'dsh/.env': 'LUTE_JEV_API_KEY=from-dshhome\n',
  })
  const paths = {
    credentialsFile: join(root, '.credentials.yaml'),
    projectEnv: join(root, '.env'),
    dshHomeEnv: join(root, 'dsh/.env'),
  }
  assert.deepEqual(resolveJevKey({ env: { [JEV_KEY_NAME]: 'from-env' }, paths }), {
    key: 'from-env', source: 'env', tried: [],
  })
  assert.equal(resolveJevKey({ env: {}, paths }).key, 'from-creds')
  assert.equal(resolveJevKey({ env: {}, paths: { ...paths, credentialsFile: join(root, 'nope.yaml') } }).key, 'from-project')
  assert.equal(resolveJevKey({ env: {}, paths: { ...paths, credentialsFile: join(root, 'nope.yaml'), projectEnv: join(root, 'nope.env') } }).key, 'from-dshhome')
})

test('全部缺失 → key null + tried 列出全部探过的路径，不抛错', () => {
  const r = resolveJevKey({ env: {}, paths: { credentialsFile: '/no/a.yaml', projectEnv: '/no/b.env', dshHomeEnv: '/no/c.env' } })
  assert.equal(r.key, null)
  assert.equal(r.source, null)
  assert.deepEqual(r.tried, ['/no/a.yaml', '/no/b.env', '/no/c.env'])
})

test('credentials 解析：真实结构（version/records 噪声 + refs 块）、引号、refs 之外不抓', () => {
  const refs = parseCredentialsRefs(`version: 1
records:
  client-connection/browser-session:
    kind: grant
refs:
  DEEPSEEK_API_KEY: sk-xxx
  "QUOTED_KEY": "with: colon"
  empty_key:
  LUTE_JEV_API_KEY: apikey_abcdef
junk:
  NOT_A_REF: nope
`)
  assert.equal(refs.LUTE_JEV_API_KEY, 'apikey_abcdef')
  assert.equal(refs.QUOTED_KEY, 'with: colon')
  assert.equal(refs.empty_key, undefined)
  assert.equal(refs.NOT_A_REF, undefined)
})

test('.env 解析：注释、内联值含等号、引号', () => {
  const pairs = parseDotEnv('# comment\nLUTE_JEV_API_KEY=abc=def\nQK="quoted"\nNOVALUE\n')
  assert.equal(pairs.LUTE_JEV_API_KEY, 'abc=def')
  assert.equal(pairs.QK, 'quoted')
  assert.equal(pairs.NOVALUE, undefined)
})

test('credentials 文件存在但没有 refs/LUTE_JEV_API_KEY → 下探到 .env，不误停', () => {
  const root = fixture('no-ref', {
    '.credentials.yaml': 'version: 1\nrefs:\n  OTHER_KEY: v\n',
    '.env': 'LUTE_JEV_API_KEY=from-project\n',
  })
  const r = resolveJevKey({
    env: {},
    paths: { credentialsFile: join(root, '.credentials.yaml'), projectEnv: join(root, '.env'), dshHomeEnv: join(root, 'nope.env') },
  })
  assert.equal(r.key, 'from-project')
  assert.equal(r.source, 'project-env')
})

test('redact 不回传完整 key', () => {
  const r = redact('apikey_2264c32bb2eb0c241e6bfdf1abc6681cad4')
  assert.ok(!r.includes('2264c32bb2eb0c241e6bfdf1abc6681cad4'))
  assert.match(r, /^apikey_2…\(\d+\)$/)
})
