import test from 'node:test'
import assert from 'node:assert/strict'
import { checkServiceConsumption, scanServiceConsumption } from './service-consumption.mjs'

const registry = JSON.stringify({
  schemaVersion: 1,
  consumptions: [
    { file: 'packages/surfaces/demo-a/src/index.ts', services: ['web', 'settings'] },
    { file: 'packages/surfaces/demo-b/src/client/index.ts', services: ['connection'], dynamic: true },
  ],
})

const fileA = {
  path: 'packages/surfaces/demo-a/src/index.ts',
  text: [
    'const web = ctx.get("web")',
    "const settings = ctx.get('settings') as S | undefined",
    '// const stale = ctx.get(\'commented\') — 注释行不计',
    'function f() { return 1 }',
  ].join('\n'),
}
const fileB = {
  path: 'packages/surfaces/demo-b/src/client/index.ts',
  text: ['const svc = ctx.get(name) : undefined', "const conn = ctx.get('connection')"].join('\n'),
}

test('scanServiceConsumption extracts literals and skips comment lines', () => {
  const scanned = scanServiceConsumption(fileA.text)
  assert.deepEqual(scanned.services, ['settings', 'web'])
  assert.equal(scanned.dynamicCount, 0)
})

test('scanServiceConsumption counts non-literal calls as dynamic', () => {
  const scanned = scanServiceConsumption(fileB.text)
  assert.deepEqual(scanned.services, ['connection'])
  assert.equal(scanned.dynamicCount, 1)
})

test('scanServiceConsumption keeps hyphenated service names (mutation-discovered blind spot)', () => {
  const scanned = scanServiceConsumption('const x = ctx.get("brand-new-fake-service")')
  assert.deepEqual(scanned.services, ['brand-new-fake-service'])
  assert.equal(scanned.dynamicCount, 0)
})

test('passes when registry matches the scan', () => {
  const result = checkServiceConsumption({ registryText: registry, files: [fileA, fileB] })
  assert.equal(result.passed, true)
  assert.deepEqual(result.violations, [])
  assert.match(result.note, /2 个消费文件/)
})

test('rejects a newly consumed service that is not registered', () => {
  const result = checkServiceConsumption({
    registryText: registry,
    files: [{ ...fileA, text: fileA.text + "\nconst jobs = ctx.get('jobs')" }],
  })
  assert.equal(result.passed, false)
  assert.ok(result.violations.some((v) => v.includes('"jobs" 未登记')))
})

test('rejects a consuming file that is missing from the registry', () => {
  const newFile = { path: 'packages/surfaces/demo-c/src/index.ts', text: "const x = ctx.get('web')" }
  const result = checkServiceConsumption({ registryText: registry, files: [fileA, fileB, newFile] })
  assert.equal(result.passed, false)
  assert.ok(result.violations.some((v) => v.includes('demo-c') && v.includes('没有该文件')))
})

test('rejects a stale registered service the file no longer consumes', () => {
  const result = checkServiceConsumption({
    registryText: registry,
    files: [{ ...fileA, text: 'const web = ctx.get("web")' }],
  })
  assert.equal(result.passed, false)
  assert.ok(result.violations.some((v) => v.includes('"settings" 已不再被消费')))
})

test('rejects a registry entry whose file no longer consumes anything', () => {
  const result = checkServiceConsumption({
    registryText: registry,
    files: [{ path: 'packages/surfaces/demo-b/src/client/index.ts', text: 'export const x = 1' }],
  })
  assert.equal(result.passed, false)
  assert.ok(result.violations.some((v) => v.includes('demo-a') && v.includes('陈旧条目')))
})

test('rejects dynamic consumption that is not flagged in the registry', () => {
  const noFlag = JSON.stringify({
    consumptions: [{ file: 'packages/surfaces/demo-b/src/client/index.ts', services: ['connection'] }],
  })
  const result = checkServiceConsumption({ registryText: noFlag, files: [fileB] })
  assert.equal(result.passed, false)
  assert.ok(result.violations.some((v) => v.includes('dynamic: true')))
})

test('rejects an unreadable registry instead of treating it as empty', () => {
  const result = checkServiceConsumption({ registryText: null, files: [fileA] })
  assert.equal(result.passed, false)
  assert.ok(result.violations[0].includes('读不出'))
})

test('rejects an empty registry (a gate that can never say no)', () => {
  const result = checkServiceConsumption({ registryText: '{"consumptions": []}', files: [fileA] })
  assert.equal(result.passed, false)
  assert.ok(result.violations[0].includes('为空'))
})
