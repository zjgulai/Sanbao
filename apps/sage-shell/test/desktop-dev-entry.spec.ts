import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const script = fileURLToPath(new URL('../scripts/dev-debug.mjs', import.meta.url))

describe('default desktop development entry', () => {
  it('prints one product window and no fixture injection even when inherited from the parent', () => {
    const result = spawnSync(process.execPath, [script, '--print'], {
      encoding: 'utf8',
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', SAGE_FIXTURE_PROJECTION: '1', SAGE_SANBAO_SURFACE: '1' },
      timeout: 10_000,
    })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('主界面：Sanbao 桌面（Sage 默认主窗口）')
    expect(result.stdout).toContain('投影：真实服务响应（不注入 fixture）')
    expect(result.stdout).not.toContain('sanbao 承载面：开')
  })
})
