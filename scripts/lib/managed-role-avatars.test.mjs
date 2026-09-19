import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const manifest = JSON.parse(readFileSync(new URL('../../brand/avatars/manifest.json', import.meta.url), 'utf8'))

test('50 个 AGT 全员都有明暗两套受管头像，不再只替换一人', () => {
  assert.deepEqual(manifest.entries?.map((entry) => entry.presetId), Array.from({ length: 50 }, (_, i) => `agt-${String(i + 1).padStart(3, '0')}`))
  for (const entry of manifest.entries) {
    for (const colorway of ['dark', 'light']) {
      const bytes = readFileSync(new URL(`../../brand/avatars/${entry.assets[colorway]['128']}`, import.meta.url))
      assert.equal(bytes.subarray(0, 4).toString(), 'RIFF')
      assert.equal(bytes.subarray(8, 12).toString(), 'WEBP')
    }
  }
})
