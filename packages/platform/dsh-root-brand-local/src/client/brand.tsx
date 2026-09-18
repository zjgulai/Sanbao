import type { CSSProperties, ReactElement } from "react";
import { jsx, jsxs } from "react/jsx-runtime";

/**
 * ROOT (路特创新) brand components.
 *
 * The mark is a geometric re-draw of the reference wordmark: a stroke-built
 * "R∞T" monogram (OO of ROOT rendered as the infinity loop), the three rounded
 * brand bars underneath (green / gray / green), and the Chinese wordmark
 * rendered as styled text so it follows the active UI font stack.
 *
 * Theme adaptation: letterforms use `currentColor` (inherits `--dsw-alias-label-primary`
 * through the host brand seat), so the mark stays legible in light and dark
 * themes. The brand green and bar gray are fixed brand colors.
 */

/** Brand green sampled from the reference artwork (#58b848 core bucket). */
export const BRAND_GREEN = "#58B848";
/** Neutral bar gray sampled from the reference artwork. */
export const BAR_GRAY = "#A8A8A8";
/** Reference wordmark aspect (viewBox 61 x 32). */
const MARK_ASPECT = 61 / 32;

export interface BrandMarkProps {
  /** Requested square edge in pixels (host hands `size` into the slot). */
  size?: number;
  className?: string;
}

/** Stroke-built R∞T monogram with the three brand bars. */
export function RootMark({ size = 24, className }: BrandMarkProps): ReactElement {
  const width = Math.round(size * MARK_ASPECT);
  return jsx(
    "svg",
    {
      className,
      width,
      height: size,
      viewBox: "0 0 61 32",
      fill: "none",
      "aria-hidden": "true",
      children: jsxs("g", {
        stroke: "currentColor",
        strokeWidth: 4.2,
        strokeLinecap: "round",
        strokeLinejoin: "round",
        children: [
          // R
          jsx("path", { d: "M6.5 20 V3 H14.5 C18.6 3 21.5 5.9 21.5 9.8 C21.5 13.7 18.6 16.5 14 16.5 H6.5" }),
          jsx("path", { d: "M14 16.5 L20.5 20" }),
          // ∞ (the OO of ROOT)
          jsx("path", {
            d: "M32.75 11.75 C32.75 6.3 25.5 6.3 25.5 11.75 C25.5 17.2 32.75 17.2 32.75 11.75 C32.75 6.3 40 6.3 40 11.75 C40 17.2 32.75 17.2 32.75 11.75",
          }),
          // T
          jsx("path", { d: "M45.5 3 H57" }),
          jsx("path", { d: "M51.25 3 V20" }),
          // brand bars
          jsx("rect", { x: 6.5, y: 26, width: 16.5, height: 5, rx: 2.5, fill: BRAND_GREEN, stroke: "none" }),
          jsx("rect", { x: 25.5, y: 26, width: 16.5, height: 5, rx: 2.5, fill: BAR_GRAY, stroke: "none" }),
          jsx("rect", { x: 44, y: 26, width: 16.5, height: 5, rx: 2.5, fill: BRAND_GREEN, stroke: "none" }),
        ],
      }),
    },
  );
}

/**
 * Sidebar brand-name occupant: 路特创新 wordmark + the "AgenticOS" badge.
 *
 * 宿主名字槽仅约 114px 宽（mark 由 host 固定 size=24），一行须压缩：
 * 名字使用主题字体 token，徽标保持紧凑胶囊（fit-content，不拉伸）。
 * 品牌绿只保留在标识与强调边界，不用渐变或装饰性辉光。
 */
export function SidebarRootName(): ReactElement {
  return jsxs("span", {
    "data-plugin": "dsh-root-brand",
    className: "dsh-rb-name",
    children: [
      "路特创新",
      jsx("span", { className: "dsh-rb-agentic", children: "AgenticOS" }),
    ],
  });
}

/** Empty-session hero occupant: ROOT mark + the product line. */
export function HeroRootBrand({ size = 34, className }: BrandMarkProps): ReactElement {
  return jsxs("div", {
    "data-plugin": "dsh-root-brand",
    className: "dsh-rb-hero",
    children: [
      jsx(RootMark, { size, className }),
      jsx("span", { className: "dsh-rb-hero-name", children: "Artificial Business Intelligence Agentic" }),
    ],
  });
}

/**
 * Brand surface styles (version-independent part).
 *
 * 这里**只有与官方类名无关的样式**（品牌座位自己的外观）。曾经的哈希规则——隐藏官方标题、
 * 折叠统计条——已全部撤出：2.0.10 之后官方标题是个无类名的 span，按类名隐藏注定失手
 * （2026-09-18 装机实测的故障原文），改为按 DOM 关系定位并在 JS 里 `display:none`
 * （见 `hero-title.ts`），统计条折叠则因上游换了模块而退役（见 ADR-0117）。
 *
 * 结果：本文件不再需要「运行时解析出的类名」，`installBrandCss` 只装这一份静态样式。
 * 上游重新哈希不再影响任何样式规则。
 */
export const BRAND_CSS = `
[data-plugin="dsh-root-brand"].dsh-rb-hero {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  max-width: 560px;
  color: var(--dsw-alias-label-primary);
}
[data-plugin="dsh-root-brand"].dsh-rb-hero .dsh-rb-hero-name {
  font: var(--dsw-font-m-18, 500 18px/26px var(--dsw-font-family, system-ui, sans-serif));
  letter-spacing: 0.2px;
  white-space: nowrap;
}
[data-plugin="dsh-root-brand"].dsh-rb-name {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 100%;
  color: ${BRAND_GREEN};
  font: var(--dsw-font-xxs-12, 600 12px/18px var(--dsw-font-family, system-ui, sans-serif));
  letter-spacing: 0.5px;
  white-space: nowrap;
}
/* "AgenticOS" badge — 紧凑的中性胶囊（一行版，适配 ~114px 名字槽） */
[data-plugin="dsh-root-brand"] .dsh-rb-agentic {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  width: fit-content;
  height: 15px;
  padding: 0 5px;
  border-radius: 999px;
  font: var(--dsw-font-xxxs-11, 600 11px/16px var(--dsw-font-family, system-ui, sans-serif));
  letter-spacing: 0;
  white-space: nowrap;
  flex: 0 0 auto;
  color: var(--dsw-alias-state-business-primary, #58b848);
  background: var(--dsw-alias-state-business-tertiary, rgba(88, 184, 72, 0.12));
  border: 1px solid var(--dsw-alias-state-business-primary, #58b848);
}
[data-plugin="dsh-root-brand"] .dsh-rb-agentic::before {
  content: "";
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--dsw-alias-state-business-primary, #58b848);
}
@media (max-width: 640px) {
  [data-plugin="dsh-root-brand"].dsh-rb-hero .dsh-rb-hero-name {
    font: var(--dsw-font-s-14, 500 14px/20px var(--dsw-font-family, system-ui, sans-serif));
  }
}

/* P2 键盘可达性：覆写区与 hero 的 focus ring（品牌绿描边） */
.dshro-action:focus-within,
[data-plugin="dsh-root-brand"].dsh-rb-hero:focus-within {
  outline: 2px solid var(--dsw-alias-state-business-primary, #58b848);
  outline-offset: 2px;
}
.dshro-a:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary, #58b848);
  outline-offset: 2px;
}
.dshro-advanced summary:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary, #58b848);
  outline-offset: 2px;
  border-radius: 4px;
}
@media (prefers-reduced-motion: reduce) {
  [data-plugin="dsh-root-brand"] *,
  [data-plugin="dsh-root-brand"] *::before,
  [data-plugin="dsh-root-brand"] *::after {
    transition: none !important;
  }
}
`;

export const BRAND_CSS_STYLE_ID = "dsh-root-brand-css";

/**
 * Install the brand style tag; returns a disposer that removes it.
 *
 * 只装上面那份静态样式：哈希规则已随 2.0.10 的 hero 结构变化全部撤出
 * （标题隐藏改在 JS 里按 DOM 关系做，统计条折叠退役）。
 */
export function installBrandCss(): () => void {
  if (typeof document === "undefined") return () => {};
  if (document.getElementById(BRAND_CSS_STYLE_ID) !== null) return () => {};
  const tag = document.createElement("style");
  tag.id = BRAND_CSS_STYLE_ID;
  tag.dataset.plugin = "dsh-root-brand";
  tag.textContent = BRAND_CSS;
  document.head.appendChild(tag);
  return () => {
    document.getElementById(BRAND_CSS_STYLE_ID)?.remove();
  };
}

/** Shared brand-name style blocks (kept small; the span carries the class). */
export const BRAND_NAME_STYLE: CSSProperties = {};
