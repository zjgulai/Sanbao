/**
 * 官方样式的**真值提取器**：从真实产物里读出官方 CSS-module 注入内容与词典字面量，
 * 供测试在 DOM 里重建官方结构。
 *
 * 纪律：
 *   1. 期望值必须来自独立真值（官方产物字节），禁止复制实现算法、禁止把插件写下的
 *      哈希常量抄进断言；
 *   2. **当前基座的产物是硬前置**：读不到就抛，不 skip。2026-09-18 实测的教训——
 *      本文件原先把路径钉在 2.0.5 的 asar 布局（`app.asar.unpacked/…`）上，
 *      2.0.10 改成 no-ASAR 之后这些用例整段 `describe.skipIf` 掉，`pnpm test` 依旧全绿，
 *      而插件在真机上正坏着（官方标题「探索未至之境」重新出现）。
 *      「射程为空」与「都合格」必须是两种读数。
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { appResourcesRoot } from '../../../../scripts/lib/app-resources.mjs'

/** 仓库根：本文件位于 packages/platform/dsh-root-brand-local/test/ 下。 */
export function repoRoot(): string {
  return resolve(import.meta.dirname, '../../../..')
}

/** 已入库的 2.0.4 归档（任何机器可复现，用于上一代结构的对照）。 */
export const ARCHIVE_CONVERSATION_CLIENT =
  'dsh-patches/archive/chatui-orig-bundles/dsh-client-ui-conversation-client.js.orig'

/** 官方 hero 模块 id（dsh-client-ui-conversation 包）。 */
export const HERO_SHELL_MODULE_ID = '@deepseek-ai/dsh-client-ui-conversation/HeroShell.module.css'

/**
 * 本机 app 的资源根。**路径的家是 `scripts/lib/app-resources.mjs`**（no-ASAR 与 asar 双形态探测），
 * 这里不再自带一份路径常量——同一份事实两个家，正是路径漂移的温床。
 */
export function installedResourcesRoot(): string | null {
  return appResourcesRoot(process.env.DSH_APP ?? '/Applications/DSH Desktop.app')
}

/**
 * 当前基座的官方 conversation 客户端产物路径。
 *
 * @throws 本机没有可读产物时——这是**硬前置**：插件对官方类名的依赖离开这份产物就无法被验证，
 *   把它降级成 skip 就等于把「没量到」记成「没问题」。
 */
export function installedConversationBundle(): string {
  const root = installedResourcesRoot()
  if (root === null) {
    throw new Error(
      '本机没有可读的 DSH Desktop 资源根（scripts/lib/app-resources.mjs 返回 null）：'
        + '插件对官方类名的依赖无法被验证。这是硬前置，不是可跳过的可选面——'
        + '若确实要在无 app 的机器上跑，请显式设置 DSH_APP 指向一份产物。',
    )
  }
  const bundle = resolve(root, 'node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js')
  if (!existsSync(bundle)) throw new Error(`找不到官方 conversation 客户端产物：${bundle}`)
  return bundle
}

/** 第一个存在的候选路径；都不存在时返回 undefined（仅供**可选**的旧基座对照使用）。 */
export function firstExisting(paths: readonly string[]): string | undefined {
  return paths.find((path) => existsSync(path))
}

/**
 * 从官方客户端产物里提取某个 CSS-module 的 CSS 文本。
 *
 * 依据官方编译产物形态：模块 id 字面量（`"<包路径>/<模块>.module.css"`）之前，
 * 是它自己的 `const css$N = "…";`。取最近的一条。
 */
export function extractModuleCss(bundlePath: string, moduleId: string): string {
  const source = readFileSync(bundlePath, 'utf8')
  const anchor = source.indexOf(`"${moduleId}"`)
  if (anchor < 0) throw new Error(`产物里找不到模块 id ${moduleId}：${bundlePath}`)
  const before = source.slice(0, anchor)
  const declaration = [...before.matchAll(/const css\$[0-9]+ = ("(?:[^"\\]|\\.)*");/g)].pop()
  if (declaration === undefined) throw new Error(`模块 ${moduleId} 前找不到 css 声明：${bundlePath}`)
  return JSON.parse(declaration[1] as string) as string
}

/**
 * 把官方 CSS 文本里的某个模块局部名解析成**完整类名**，用负向断言取唯一前缀：
 * 含该局部名的前缀必须恰好一个（多于一个说明锚放错了模块）。
 */
export function resolveClassName(css: string, localName: string): string {
  const pattern = new RegExp(`\\.([A-Za-z0-9_]+)_${localName}(?![A-Za-z0-9_-])`, 'g')
  const prefixes = new Set<string>()
  for (const match of css.matchAll(pattern)) prefixes.add(match[1] as string)
  if (prefixes.size !== 1) {
    throw new Error(`局部名 ${localName} 的前缀候选 ${prefixes.size} 个（应为 1）：${[...prefixes].join(', ')}`)
  }
  return `${[...prefixes][0] as string}_${localName}`
}

/** 从产物里读出官方 zh 词典的某个键（真值，不手抄）。 */
export function officialLocaleValue(bundlePath: string, key: string): string {
  const source = readFileSync(bundlePath, 'utf8')
  const match = new RegExp(`"${key.replace('.', '\\.')}":\\s*"([^"]*)"`).exec(source)
  if (match === null) throw new Error(`产物里找不到词典项 ${key}：${bundlePath}`)
  return match[1] as string
}

/** 官方 hero 里插件要用的四个类名（真值来自产物 CSS）。 */
export function officialHeroClasses(bundlePath: string): {
  headline: string
  titleGroup: string
  previewBadge: string
  fishHitbox: string
} {
  const css = extractModuleCss(bundlePath, HERO_SHELL_MODULE_ID)
  return {
    headline: resolveClassName(css, 'headline'),
    titleGroup: resolveClassName(css, 'titleGroup'),
    previewBadge: resolveClassName(css, 'previewBadge'),
    fishHitbox: resolveClassName(css, 'fishHitbox'),
  }
}
