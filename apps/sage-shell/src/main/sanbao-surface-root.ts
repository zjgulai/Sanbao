/**
 * 解析 sanbao 承载面的 local root（只读；不跨仓 import，也不发明路径）。
 *
 * 候选顺序：
 *   1. 环境变量 SAGE_SANBAO_SURFACE_ROOT（显式覆盖；可直接指向产物目录或 prototype 目录）；
 *   2. Sage 仓根的同级快照仓 <repo-parent>/Sanbao|sanbao/repository-snapshot/apps/sanbao-prototype。
 *
 * 每个候选里优先 `dist/`（必须含 index.html 与 main.js）；dist 不完整（缺 main.js，例如
 * tsdown 之后尚未 prepare-static）时退到 `_site/`——同一构建的发布产物（main.js 与 dist 同哈希）。
 * 两者都没有 → 返回 null（调用方必须显式失败或显式跳过，不允许静默假绿）。
 *
 * 唯一家：解析逻辑只在本模块（探针经编译产物 lib/main 引用；spec 经 vitest 解析 src 引用）。
 */
import { statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// lib/main/sanbao-surface-root.js → 仓根（apps/sage-shell 在仓内固定深度）。
const sageRepoRoot = fileURLToPath(new URL('../../../../', import.meta.url))

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

function completeServedRoot(directory: string): string | null {
  // 承载面 root 必须是真实构建产物：入口与打包脚本同时在场——provenance 源码目录的
  // index.html（原型仓根）没有 main.js，不得被当成可服务产物。
  if (isFile(join(directory, 'index.html')) && isFile(join(directory, 'main.js'))) return directory
  return null
}

export type SanbaoSurfaceRootSource = 'override' | 'dist' | '_site'

export interface SanbaoSurfaceRootResolution {
  /** 实际可服务目录（含 index.html 与 main.js）。 */
  readonly servedRoot: string
  /** 命中位置：候选自身（override）／其 dist／其 _site。 */
  readonly source: SanbaoSurfaceRootSource
}

/** 逐个候选解析；单独导出便于测试注入候选列表（不触碰真实 sibling 仓）。 */
export function resolveSanbaoSurfaceRootFrom(candidates: readonly string[]): SanbaoSurfaceRootResolution | null {
  for (const candidate of candidates) {
    if (completeServedRoot(candidate) !== null) return { servedRoot: candidate, source: 'override' }
    const dist = completeServedRoot(join(candidate, 'dist'))
    if (dist !== null) return { servedRoot: dist, source: 'dist' }
    const site = completeServedRoot(join(candidate, '_site'))
    if (site !== null) return { servedRoot: site, source: '_site' }
  }
  return null
}

export function candidateSanbaoPrototypeDirs(env: NodeJS.ProcessEnv = process.env): readonly string[] {
  const candidates: string[] = []
  const override = env.SAGE_SANBAO_SURFACE_ROOT
  if (typeof override === 'string' && override.length > 0) candidates.push(override)
  const parent = dirname(sageRepoRoot)
  for (const name of ['Sanbao', 'sanbao']) {
    candidates.push(join(parent, name, 'repository-snapshot', 'apps', 'sanbao-prototype'))
  }
  return candidates
}

export function resolveSanbaoSurfaceRoot(env: NodeJS.ProcessEnv = process.env): SanbaoSurfaceRootResolution | null {
  return resolveSanbaoSurfaceRootFrom(candidateSanbaoPrototypeDirs(env))
}
