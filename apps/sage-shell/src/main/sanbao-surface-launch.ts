/**
 * dev 可见承载面（ADR-0264）：`SAGE_SANBAO_SURFACE=1` 时，应用 ready 后在独立窗口打开
 * `sage-sanbao://` 承载面并接通 `__SANBAO_HOST__` 壳桥。
 *
 * 设计：
 * - **门控**：只认环境变量 `SAGE_SANBAO_SURFACE=1`（dev/debug 通道，常由 `pnpm dev:debug` 注入）。
 *   生产默认不开——打开时机与窗口归属是产品决策，尚未确认（ADR-0262 登记项，决策包输入后另批）。
 * - **honest 默认**：不注入 facts——页面按协议如实显示「壳尚未提供该类事实」，绝不伪造业务事实。
 * - **失败不致命**：根缺失/创建/加载失败只打一行诊断并返回 null，应用照常启动（承载面是增益，不是启动前提）。
 * - 成功返回 surface，由调用方（main/index.ts）联动生命周期：主窗关闭即 destroy。
 */
import { createSanbaoSurface, type SanbaoSurface } from './sanbao-surface.js'
import { resolveSanbaoSurfaceRoot } from './sanbao-surface-root.js'

export const SANBAO_SURFACE_ENABLE_ENV = 'SAGE_SANBAO_SURFACE'

export interface SanbaoSurfaceLaunchOptions {
  /** 缺省 process.env（测试可注入）。 */
  readonly env?: NodeJS.ProcessEnv
  /** 单行诊断出口；缺省 process.stdout。 */
  readonly log?: (line: string) => void
}

function defaultLog(line: string): void {
  process.stdout.write(`${line}\n`)
}

/** 打开承载面（含 load）；未启用或不可用返回 null（根缺失/失败时先打一行诊断）。 */
export async function launchSanbaoSurfaceFromEnv(options: SanbaoSurfaceLaunchOptions = {}): Promise<SanbaoSurface | null> {
  const env = options.env ?? process.env
  const log = options.log ?? defaultLog
  if (env[SANBAO_SURFACE_ENABLE_ENV] !== '1') return null
  const resolved = resolveSanbaoSurfaceRoot(env)
  if (resolved === null) {
    log('sage shell: sanbao 承载面未打开——未找到 sanbao 产物根（设 SAGE_SANBAO_SURFACE_ROOT 或把快照仓放在 Sage 仓同级）')
    return null
  }
  const surface = createSanbaoSurface({ root: resolved.servedRoot })
  if ('failed' in surface) {
    log(`sage shell: sanbao 承载面未打开——${surface.failed}`)
    return null
  }
  try {
    await surface.load()
  } catch (error) {
    surface.destroy()
    log(`sage shell: sanbao 承载面加载失败——${error instanceof Error ? error.message : String(error)}`)
    return null
  }
  log(`sage shell: sanbao 承载面已打开（root source=${resolved.source}）`)
  return surface
}
