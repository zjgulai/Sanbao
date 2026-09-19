import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HeroRootBrand, RootMark, SidebarRootName } from "./brand.js";
import { SANBAO_BRAND_SOURCE } from "./sanbao-brand-source.js";

const placeholder = readFileSync(resolve(import.meta.dirname, "../../../../../brand/logo/placeholder-mark.svg"), "utf8");

describe("Sanbao brand components", () => {
  it.each([24, 34, 48])("renders the neutral three-diamond placeholder at square size %i", (size) => {
    const html = renderToStaticMarkup(RootMark({ size, className: "fish" }));
    expect(html).toContain(`width="${size}"`);
    expect(html).toContain(`height="${size}"`);
    expect(html).toContain('class="fish"');
    expect(html).toContain('viewBox="0 0 512 512"');
    expect(html).toContain('data-status="placeholder"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('fill="currentColor"');
    const points = (svg: string) => [...svg.matchAll(/points="([^"]+)"/g)].map((match) => match[1]);
    expect(points(html)).toHaveLength(3);
    expect(points(html)).toEqual(points(placeholder));
    expect(html).not.toMatch(/<path|<rect|#58b848|#a8a8a8/i);
  });

  it("renders the sidebar Latin name with a separate Chinese slogan line", () => {
    const html = renderToStaticMarkup(SidebarRootName());
    expect(html).toContain(`>${SANBAO_BRAND_SOURCE.nameLatin}<`);
    expect(html).toContain(`class="dsh-rb-slogan">${SANBAO_BRAND_SOURCE.sloganZh}</span>`);
    expect(html).toContain('data-plugin="dsh-root-brand"');
    expect(html).not.toMatch(/路特创新|AgenticOS/);
  });

  it("renders the bilingual hero title above the Chinese slogan with the new mark", () => {
    const html = renderToStaticMarkup(HeroRootBrand({ size: 34, className: "hero-mark" }));
    expect(html).toContain(`class="dsh-rb-hero-name">${SANBAO_BRAND_SOURCE.nameLatin} · ${SANBAO_BRAND_SOURCE.nameZh}</span>`);
    expect(html).toContain(`class="dsh-rb-hero-slogan">${SANBAO_BRAND_SOURCE.sloganZh}</span>`);
    expect(html).toContain('data-plugin="dsh-root-brand"');
    expect(html).toContain('class="dsh-rb-hero"');
    expect(html).toContain('data-status="placeholder"');
    expect(html).toContain('class="hero-mark"');
    expect(html).not.toContain("Artificial Business Intelligence Agentic");
  });
});
