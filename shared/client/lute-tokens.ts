/**
 * LUTE 自建设计 token 家族（S1，2026-09-19 能力中枢计划）。
 *
 * ## 为什么是 `--lute-*` 而不是 `--dsw-*`
 *
 * 基座平台没有 spacing / radius 的 token 家族（`theme-tokens.mjs` 门禁的 baseline
 * 已登记 `--dsw-alias-radius-*` 等名字从未被官方定义——引用它们就是幻觉 token）。
 * 品牌色 block（`newapp.module.css` 的 Brand block）已示范自建 `--lute-*` 字面量
 * 之家是合规路径：平台命名空间（`--dsw-/--ds-/--dsh-`）归官方主题包所有，本仓库
 * 不得在其上发明名字；`--lute-*` 是本仓库自己的命名空间。
 *
 * ## 数值从哪来
 *
 * 不是新发明，是**既有读数的收敛**：侧栏行圆角 8px（ADR-0079 行轴）、卡片圆角
 * 10/12px、chip 胶囊 999px、间距字面值 4/8/12/16/24（各包散落的 gap/padding 取整
 * 到 4px 栅格）。既有包的字面值不强制回填——本家族约束**新 UI**；旧面在 S3/S4
 * 被触碰时顺手迁移。
 *
 * ## 消费纪律
 *
 * 消费一律写 `var(--lute-space-3, 12px)` 带 fallback（与 token 三法则一致：
 * fallback 是亮色主题的真实读数，这里就是字面量本身）。本模块的注入在 apply 阶段
 * 幂等完成；注入缺失时消费面走 fallback，视觉不塌。
 *
 * 经 `scripts/sync-shared.mjs` 分发（副本首行带生成标记）；改这里后跑
 * `node scripts/sync-shared.mjs --write`。
 */

/** 注入 style 标签的 data 锚（幂等判据，也是浏览器探针可观察的自报面）。 */
const STYLE_ANCHOR = 'luteDesignTokens'

/** token 定义。亮暗主题同值——间距与圆角不随主题翻转；品牌线色是焦点光环的合法出处。 */
const TOKEN_CSS = `:root {
  --lute-space-1: 4px;
  --lute-space-2: 8px;
  --lute-space-3: 12px;
  --lute-space-4: 16px;
  --lute-space-5: 24px;
  --lute-radius-row: 8px;
  --lute-radius-card: 12px;
  --lute-radius-chip: 999px;
  --lute-brand: #58b848;
  --lute-brand-line: rgba(88, 184, 72, 0.45);
}`

/**
 * 幂等注入 LUTE 设计 token。
 *
 * 判据是 style 标签上的 data 锚而不是文本比对：同一页面多个共享层副本都调它时，
 * 第一个注入即胜出，其余直接返回——不产生重复标签，也不产生 MutationObserver
 * 级联（黑屏事故 P-52 的教训：注入路径必须「写一次后不再满足写条件」）。
 *
 * **调用方不得在 dispose 时移除这个标签**：它可能是兄弟插件注入的（返回的元素
 * 未必是本次创建的），移除会坑别人；token 值是静态常量，插件卸载后残留无害。
 * @returns 注入的标签（本次未注入时返回既有标签；无 document 时返回 undefined）。
 */
export function ensureLuteTokens(): HTMLStyleElement | undefined {
  if (typeof document === 'undefined') return undefined
  const existing = document.querySelector<HTMLStyleElement>(`style[data-lute-tokens="${STYLE_ANCHOR}"]`)
  if (existing !== null) return existing
  const style = document.createElement('style')
  style.dataset.luteTokens = STYLE_ANCHOR
  style.textContent = TOKEN_CSS
  document.head.append(style)
  return style
}
