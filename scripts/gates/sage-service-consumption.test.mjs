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
  })
  assert.equal(result.passed, true, result.violations.join('\n'))
  assert.match(result.note, /1 个消费文件/)
})
