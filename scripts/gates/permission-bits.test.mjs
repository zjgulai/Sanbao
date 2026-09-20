import assert from 'node:assert/strict'
import { chmodSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import { checkPermissionBits } from './permission-bits.mjs'
import { validateGateResult } from './gate-result.mjs'
import { withMutationFixture } from '../lib/mutation-fixture.mjs'

test('chmod 000 的文件判红：点名文件 + 权限位 + 修复指引', async () => {
  await withMutationFixture({ prefix: 'permission-bits' }, async (fixture) => {
    writeFileSync(join(fixture.repo, 'locked.txt'), 'x')
    chmodSync(join(fixture.repo, 'locked.txt'), 0o000)

    const verdict = checkPermissionBits({ root: fixture.repo, paths: ['locked.txt'] })

    assert.equal(verdict.status, 'fail')
    assert.equal(verdict.failed, 1)
    const text = verdict.violations.join('\n')
    assert.match(text, /locked\.txt/)
    assert.match(text, /权限位 000/)
    assert.match(text, /chmod 644/)
    assert.match(text, /先 stat 再怀疑任何人/)
  })
})

test('正常权限（644/755）静默通过，且 checked 计入分母', async () => {
  await withMutationFixture({ prefix: 'permission-bits' }, async (fixture) => {
    writeFileSync(join(fixture.repo, 'plain.txt'), 'x')
    chmodSync(join(fixture.repo, 'plain.txt'), 0o644)
    writeFileSync(join(fixture.repo, 'run.sh'), '#!/bin/sh\n')
    chmodSync(join(fixture.repo, 'run.sh'), 0o755)

    const verdict = checkPermissionBits({ root: fixture.repo, paths: ['plain.txt', 'run.sh'] })

    assert.equal(verdict.status, 'pass')
    assert.equal(verdict.checked, 2)
    assert.deepEqual(verdict.violations, [])
    assert.deepEqual(validateGateResult(verdict), { valid: true, errors: [] })
  })
})

test('没有读位的写-only 文件（020）也判红：判的是「谁都读不了」而不是字面 000', async () => {
  await withMutationFixture({ prefix: 'permission-bits' }, async (fixture) => {
    writeFileSync(join(fixture.repo, 'write-only.txt'), 'x')
    chmodSync(join(fixture.repo, 'write-only.txt'), 0o020)

    const verdict = checkPermissionBits({ root: fixture.repo, paths: ['write-only.txt'] })

    assert.equal(verdict.status, 'fail')
    assert.match(verdict.violations.join('\n'), /权限位 020/)
  })
})

test('owner 无读位（040）被 R_OK 读拒，同样判红', async () => {
  await withMutationFixture({ prefix: 'permission-bits' }, async (fixture) => {
    writeFileSync(join(fixture.repo, 'group-read.txt'), 'x')
    chmodSync(join(fixture.repo, 'group-read.txt'), 0o040)

    const verdict = checkPermissionBits({ root: fixture.repo, paths: ['group-read.txt'] })

    assert.equal(verdict.status, 'fail')
    assert.match(verdict.violations.join('\n'), /R_OK/)
  })
})

test('已删除路径与非普通文件（目录、符号链接）计入账目但不判红', async () => {
  await withMutationFixture({ prefix: 'permission-bits' }, async (fixture) => {
    writeFileSync(join(fixture.repo, 'kept.txt'), 'x')
    chmodSync(join(fixture.repo, 'kept.txt'), 0o644)
    mkdirSync(join(fixture.repo, 'adir'))
    symlinkSync('kept.txt', join(fixture.repo, 'alink.txt'))

    const verdict = checkPermissionBits({
      root: fixture.repo,
      paths: ['kept.txt', 'deleted.txt', 'adir', 'alink.txt'],
    })

    // 「已删除 / 非普通文件」是读数而不是跳过：判据的记账单位是**可判文件**，
    // 分母与另两类的数量必须显式出现在 note 里（P-15：一个都不能隐形）。
    assert.equal(verdict.status, 'pass')
    assert.equal(verdict.checked, 1)
    assert.equal(verdict.skipped, 0)
    assert.deepEqual(verdict.violations, [])
    assert.match(verdict.note, /可判文件 1/)
    assert.match(verdict.note, /已不存在 1/)
    assert.match(verdict.note, /非普通文件 2/)
    assert.deepEqual(validateGateResult(verdict), { valid: true, errors: [] })
  })
})

test('射程为空给 skip 读数而不是假 pass（「没改动」≠「已核对」）', async () => {
  await withMutationFixture({ prefix: 'permission-bits' }, async (fixture) => {
    const verdict = checkPermissionBits({ root: fixture.repo, paths: [] })

    assert.equal(verdict.status, 'skip')
    assert.equal(verdict.checked, 0)
    assert.ok(verdict.skipped >= 1)
    assert.ok(verdict.typedSkips.length >= 1)
    assert.deepEqual(verdict.violations, [])
    assert.deepEqual(validateGateResult(verdict), { valid: true, errors: [] })
  })
})

test('全部路径都不存在时同样是 skip，不冒充「已核对」', async () => {
  await withMutationFixture({ prefix: 'permission-bits' }, async (fixture) => {
    const verdict = checkPermissionBits({ root: fixture.repo, paths: ['gone-a.txt', 'gone-b.txt'] })

    assert.equal(verdict.status, 'skip')
    assert.equal(verdict.checked, 0)
    assert.deepEqual(validateGateResult(verdict), { valid: true, errors: [] })
  })
})

test('判红的读数也满足 canonical schema（fail 分支守恒）', async () => {
  await withMutationFixture({ prefix: 'permission-bits' }, async (fixture) => {
    writeFileSync(join(fixture.repo, 'a.txt'), 'x')
    chmodSync(join(fixture.repo, 'a.txt'), 0o644)
    writeFileSync(join(fixture.repo, 'b.txt'), 'x')
    chmodSync(join(fixture.repo, 'b.txt'), 0o000)

    const verdict = checkPermissionBits({ root: fixture.repo, paths: ['a.txt', 'b.txt', 'gone.txt'] })

    assert.equal(verdict.status, 'fail')
    assert.equal(verdict.checked, 1)
    assert.equal(verdict.failed, 1)
    assert.equal(verdict.skipped, 0)
    assert.match(verdict.note, /已不存在 1/)
    assert.deepEqual(validateGateResult(verdict), { valid: true, errors: [] })
  })
})
