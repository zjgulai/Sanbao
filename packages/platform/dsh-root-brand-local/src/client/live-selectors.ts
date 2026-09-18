/**
 * 官方 UI 改写锚的**运行时解析**。
 *
 * ── 锚点从哪里来 ────────────────────────────────────────────────────────────
 *
 * 官方 client 包在自己注入的 `<style>` 上带
 * `data-plugin-css="<包路径>/<模块>.module.css"`，这是**包路径级**结构锚，不随构建哈希变化。
 * 从那张样式表里，按「已知局部名取唯一前缀」算出完整类名，就得到当前基座的真实类名。
 *
 * ── 声明与代码的**唯一家** ──────────────────────────────────────────────────
 *
 * 依赖哪些局部名不是写在代码里的，而是写在包根的 `ui-anchors.json`（与门禁
 * `plugin-ui-anchor-drift` 共读同一份文件）：门禁据此对着**出货产物**核「还能不能解析出来」，
 * 本模块据此做运行时定位。两边读同一份声明，因此不可能出现「代码依赖了 A、门禁只量了 B」。
 *
 * ── 为什么还要一份 ANCHOR_KEYS ─────────────────────────────────────────────
 *
 * JSON 里的 id 是字符串，而代码需要**类型**（编译期能查的键集合）。两者必须相等，
 * 但把相等交给纪律就是「用纪律守只有机制能守住的东西」。所以
 * {@link assertManifestMatchesCode} 在模块初始化时做**双向**断言：清单里有代码不认识的 id → 抛；
 * 代码用到而清单没声明 → 抛。反过来的方向（规则存在但永远解析不到）才是真正危险的，
 * 那条也在这里被拦住。
 */
import rawManifest from '../../ui-anchors.json' with { type: 'json' }

/** 声明清单里的一个条目（形状由门禁 `plugin-ui-anchor-drift` 校验）。 */
interface AnchorDeclaration {
  id: string
  moduleId: string
  localName: string
  purpose?: string
}

/** 代码侧认识的语义键。清单必须与它**互为子集**。 */
export const ANCHOR_KEYS = ['heroPreviewBadge'] as const

/** 语义键类型：编译期用它查键，拼错即编译失败。 */
export type AnchorId = (typeof ANCHOR_KEYS)[number]

/** 解析结果：每个已解析的键给出完整类名（形如 `sro9dq_previewBadge`）。 */
export type LiveAnchors = Partial<Record<AnchorId, string>>

/** 一个官方模块及其声明的锚（局部名前缀由解析器算出完整类名）。 */
export interface AnchorModule {
  moduleId: string
  /** 语义键 → 局部名。 */
  readonly anchors: Partial<Record<AnchorId, string>>
}

const DECLARED: readonly AnchorDeclaration[] =
  (rawManifest as { anchors?: AnchorDeclaration[] }).anchors ?? []

/** 声明清单推出的模块分组。 */
export const ANCHOR_MODULES: readonly AnchorModule[] = Object.entries(
  DECLARED.reduce<Record<string, Partial<Record<AnchorId, string>>>>((groups, entry) => {
    const group = groups[entry.moduleId] ?? {}
    group[entry.id as AnchorId] = entry.localName
    groups[entry.moduleId] = group
    return groups
  }, {}),
).map(([moduleId, anchors]) => ({ moduleId, anchors }))

/** 全部等待解析的锚点名（诊断用）。 */
export const ANCHOR_NAMES: readonly AnchorId[] = ANCHOR_MODULES.flatMap(
  (module) => Object.keys(module.anchors) as AnchorId[],
)

/**
 * 清单与代码的锚点词汇必须相等（双向）。
 *
 * 抛错而不是降级：这两个集合不一致只可能来自一次**改错**（改清单没改代码，或反过来），
 * 不是上游漂移。降级会把它混进「上游变了」的读数里，让人去查上游。
 *
 * 参数化是为了让这条守卫本身可被反向自测（`live-selectors.test.ts` 拿不一致的输入喂它，
 * 必须抛）——一个永远不抛的守卫等于没有守卫。
 */
export function assertManifestMatchesCode(
  declaredIds: readonly string[],
  codeKeys: readonly string[],
): void {
  const unknown = declaredIds.filter((id) => !codeKeys.includes(id))
  const undeclared = codeKeys.filter((key) => !declaredIds.includes(key))
  if (unknown.length > 0 || undeclared.length > 0) {
    throw new Error(
      '[dsh-root-brand] ui-anchors.json 与代码的锚点词汇不一致：'
        + `清单里有代码不认识的 id ${unknown.length > 0 ? unknown.join('、') : '（无）'}；`
        + `代码用到而清单没有声明的 id ${undeclared.length > 0 ? undeclared.join('、') : '（无）'}`,
    )
  }
}

assertManifestMatchesCode(
  DECLARED.map((entry) => entry.id),
  ANCHOR_KEYS,
)

/** 含该局部名的完整类名候选（`_local` 后不得紧跟标识符字符，避免前缀误配）。 */
function candidatesFor(css: string, localName: string): string[] {
  const pattern = new RegExp(`\\.([A-Za-z0-9_]+)_${localName}(?![A-Za-z0-9_-])`, 'g')
  return [...css.matchAll(pattern)].map((match) => `${match[1] as string}_${localName}`)
}

/** 候选集合里恰好一个前缀胜出；0 或多于 1 个都判为解析失败。 */
function resolveAnchor(css: string, localName: string): string | undefined {
  const candidates = [...new Set(candidatesFor(css, localName))]
  if (candidates.length !== 1) return undefined
  return candidates[0]
}

/**
 * 从 DOM 里已安装的官方样式标签解析全部锚点。
 * 只读官方标签；插件自己的样式标签带的是自身包路径，不会命中模块 id。
 */
export function resolveLiveAnchors(doc: Document): { anchors: LiveAnchors; missing: AnchorId[] } {
  const anchors: LiveAnchors = {}
  const missing: AnchorId[] = []
  for (const { moduleId, anchors: moduleAnchors } of ANCHOR_MODULES) {
    const tag = doc.querySelector(`style[data-plugin-css="${moduleId}"]`)
    const css = tag?.textContent ?? ''
    for (const [key, localName] of Object.entries(moduleAnchors) as [AnchorId, string][]) {
      const className = resolveAnchor(css, localName)
      if (className === undefined) missing.push(key)
      else anchors[key] = className
    }
  }
  return { anchors, missing }
}

/** CSS 标识符安全的选择器：前缀以数字开头时改用属性选择器。 */
export function classSelector(className: string): string {
  return /^[0-9]/.test(className) ? `[class~="${className}"]` : `.${className}`
}
