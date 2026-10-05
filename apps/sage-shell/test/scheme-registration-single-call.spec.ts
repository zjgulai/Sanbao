import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * 单一调用纪律守卫（2026-10-05，dev 环境首跑战果）。
 *
 * Electron 43 实测：`protocol.registerSchemesAsPrivileged` 的第二次调用会清除此前 scheme 的
 * fetch 等特权（最小复刻见 ADR-0263 Note「首批战果」；本仓曾因此在 ADR-0262 批后让 dsh-app
 * 的 `fetch('/.sage/state')` 全部失败、区域恒 unavailable）。因此 src/main 下必须恰好只有
 * 一处调用点——位于 index.ts，且 dsh-app 与 sage-sanbao 描述符一起出现。
 */
const mainDir = fileURLToPath(new URL('../src/main/', import.meta.url))

describe('privileged scheme registration stays single-call', () => {
  it('produces exactly one registerSchemesAsPrivileged call across src/main', () => {
    const calls = readdirSync(mainDir)
      .filter((name) => name.endsWith('.ts'))
      .flatMap((name) => readFileSync(join(mainDir, name), 'utf8').match(/registerSchemesAsPrivileged\(/gu) ?? [])
    expect(calls).toHaveLength(1)
  })

  it('registers both dsh-app and the sanbao descriptor in that call site', () => {
    const indexSource = readFileSync(join(mainDir, 'index.ts'), 'utf8')
    expect(indexSource).toContain('registerSchemesAsPrivileged([{')
    expect(indexSource).toContain("scheme: SCHEME")
    expect(indexSource).toContain('SANBAO_SCHEME_REGISTRATION')
  })
})
