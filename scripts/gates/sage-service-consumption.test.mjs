import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkServiceConsumption, collectConsumptionFiles } from './service-consumption.mjs'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const registryRelPath = 'scripts/gates/sage-service-consumption.json'

test('Sage 服务消费扫描只覆盖 apps/sage-shell', () => {
  const files = collectConsumptionFiles(repoRoot, ['apps/sage-shell'])
  assert.ok(files.length > 0, 'Sage shell 射程不能为空')
  assert.ok(files.every(({ path }) => path.startsWith('apps/sage-shell/')))
  assert.equal(files.some(({ path }) => path.startsWith('packages/')), false)
})

test('Sage 独立登记与当前 shell 消费面逐项一致', () => {
  const registryText = readFileSync(join(repoRoot, registryRelPath), 'utf8')
  const registry = JSON.parse(registryText)
  assert.ok(registry.consumptions.every(({ file }) => file.startsWith('apps/sage-shell/')))

  const result = checkServiceConsumption({
    registryText,
    registryRelPath,
    files: collectConsumptionFiles(repoRoot, ['apps/sage-shell']),
    allowEmptyRegistry: true,
  })
  assert.equal(result.passed, true, result.violations.join('\n'))
  // ADR-0198: the count is no longer pinned to zero — the registry must reconcile exactly with
  // whatever the host side consumes, and this keeps a drift from silently passing as "0".
  const matched = result.note.match(/^对账 (\d+) 个消费文件/)
  assert.ok(matched !== null, result.note)
  assert.equal(Number(matched[1]), registry.consumptions.length)
})

test('空登记放行只属于显式开关：默认模式下空登记仍判红', () => {
  const emptyRegistryText = JSON.stringify({ schemaVersion: 1, consumptions: [] })
  // 「登记为空」的两种读法靠一个显式开关区分：射程内确实零消费时调用方可声明，否则空登记恒绿（P-02）。
  const emptyScan = [] // 真值为零消费的射程
  const strict = checkServiceConsumption({
    registryText: emptyRegistryText,
    registryRelPath,
    files: emptyScan,
  })
  assert.equal(strict.passed, false)
  assert.ok(strict.violations[0].includes('为空'))

  const explicit = checkServiceConsumption({
    registryText: emptyRegistryText,
    registryRelPath,
    files: emptyScan,
    allowEmptyRegistry: true,
  })
  assert.equal(explicit.passed, true, explicit.violations.join('\n'))

  // 空登记不能掩盖漂移：射程里真有消费者时，即使开了放行开关也照样判红。
  const masking = checkServiceConsumption({
    registryText: emptyRegistryText,
    registryRelPath,
    files: [{ path: 'apps/sage-shell/src/host/readonly-bridge.ts', text: "const s = ctx.get('settingsController')" }],
    allowEmptyRegistry: true,
  })
  assert.equal(masking.passed, false)
  assert.ok(masking.violations.some((violation) => violation.includes('必须随提交登记')))

  // 真实登记处必须能在严格模式下过——一旦壳里出现未登记消费，这里就是第一个报红的地方。
  const real = checkServiceConsumption({
    registryText: readFileSync(join(repoRoot, registryRelPath), 'utf8'),
    registryRelPath,
    files: collectConsumptionFiles(repoRoot, ['apps/sage-shell']),
  })
  assert.equal(real.passed, true, real.violations.join('\n'))
})
