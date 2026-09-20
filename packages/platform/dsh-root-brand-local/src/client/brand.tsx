import type { CSSProperties, ReactElement } from "react";
import { jsx, jsxs } from "react/jsx-runtime";

import { SANBAO_BRAND_SOURCE } from "./sanbao-brand-source.js";

export interface BrandMarkProps {
  /** Requested square edge in pixels (host hands `size` into the slot). */
  size?: number;
  className?: string;
}

/** Neutral placeholder geometry from brand/logo/placeholder-mark.svg. */
export function RootMark({ size = 24, className }: BrandMarkProps): ReactElement {
  return jsx("svg", {
    className,
    width: size,
    height: size,
    viewBox: "0 0 512 512",
    fill: "none",
    "data-plugin": "dsh-root-brand",
    "data-status": "placeholder",
    "data-semantic": "neutral-geometric",
    "aria-hidden": "true",
    children: jsxs("g", {
      fill: "currentColor",
      children: [
        jsx("polygon", { points: "256,92 330,166 256,240 182,166" }),
        jsx("polygon", { points: "164,212 238,286 164,360 90,286" }),
        jsx("polygon", { points: "348,212 422,286 348,360 274,286" }),
      ],
    }),
  });
}

/** Two-line name occupant for the host's 114px sidebar seat. */
export function SidebarRootName(): ReactElement {
  return jsxs("span", {
    "data-plugin": "dsh-root-brand",
    className: "dsh-rb-name",
    children: [
      jsx("span", { children: SANBAO_BRAND_SOURCE.nameLatin }),
      jsx("span", { className: "dsh-rb-slogan", children: SANBAO_BRAND_SOURCE.sloganZh }),
    ],
  });
}

/** Empty-session hero with bilingual name and Chinese slogan. */
export function HeroRootBrand({ size = 34, className }: BrandMarkProps): ReactElement {
  return jsxs("div", {
    "data-plugin": "dsh-root-brand",
    className: "dsh-rb-hero",
    children: [
      jsx(RootMark, { size, className }),
      jsxs("span", {
        className: "dsh-rb-hero-copy",
        children: [
          jsx("span", { className: "dsh-rb-hero-name", children: `${SANBAO_BRAND_SOURCE.nameLatin} · ${SANBAO_BRAND_SOURCE.nameZh}` }),
          jsx("span", { className: "dsh-rb-hero-slogan", children: SANBAO_BRAND_SOURCE.sloganZh }),
        ],
      }),
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
[data-plugin="dsh-root-brand"] {
  --dsh-rb-accent: var(--sanbao-accent);
}
svg[data-plugin="dsh-root-brand"] {
  color: var(--dsh-rb-accent);
  flex: 0 0 auto;
  aspect-ratio: 1;
}
[data-plugin="dsh-root-brand"].dsh-rb-hero {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  max-width: 100%;
  min-width: 0;
  color: var(--dsw-alias-label-primary, var(--sanbao-accent));
}
[data-plugin="dsh-root-brand"].dsh-rb-hero > svg {
  width: 56px;
  height: 56px;
}
[data-plugin="dsh-root-brand"] .dsh-rb-hero-copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 8px;
}
[data-plugin="dsh-root-brand"].dsh-rb-hero .dsh-rb-hero-name {
  font: var(--sanbao-font-hero, 600 36px/44px var(--dsw-font-family, system-ui, sans-serif));
  letter-spacing: normal;
  overflow-wrap: anywhere;
  text-wrap: balance;
}
[data-plugin="dsh-root-brand"] .dsh-rb-hero-slogan {
  font: var(--dsw-font-base-16, 400 16px/24px var(--dsw-font-family, system-ui, sans-serif));
  color: var(--dsw-alias-label-secondary, var(--dsh-rb-accent));
}
[data-plugin="dsh-root-brand"].dsh-rb-name {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0;
  min-width: 0;
  width: 100%;
  max-width: 114px;
  color: var(--dsh-rb-accent);
  font: var(--dsw-font-xxs-12, 600 12px/18px var(--dsw-font-family, system-ui, sans-serif));
  letter-spacing: 0;
  white-space: nowrap;
}
[data-plugin="dsh-root-brand"].dsh-rb-name > span {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}
[data-plugin="dsh-root-brand"] .dsh-rb-slogan {
  font: 400 10px/14px var(--dsw-font-family, system-ui, sans-serif);
  color: var(--dsw-alias-label-secondary, var(--dsh-rb-accent));
}
@media (max-width: 640px) {
  [data-plugin="dsh-root-brand"].dsh-rb-hero > svg {
    width: 48px;
    height: 48px;
  }
  [data-plugin="dsh-root-brand"].dsh-rb-hero .dsh-rb-hero-name {
    font: var(--sanbao-font-hero-compact, 600 28px/36px var(--dsw-font-family, system-ui, sans-serif));
  }
}

/* Keyboard focus remains visible on the brand surfaces. */
.dshro-action:focus-within,
[data-plugin="dsh-root-brand"].dsh-rb-hero:focus-within {
  outline: 2px solid var(--sanbao-accent);
  outline-offset: 2px;
}
.dshro-a:focus-visible {
  outline: 2px solid var(--sanbao-accent);
  outline-offset: 2px;
}
.dshro-advanced summary:focus-visible {
  outline: 2px solid var(--sanbao-accent);
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
