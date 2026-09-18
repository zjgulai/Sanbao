/** 一次性 harness 构建配置（用完即删）。 */
import { readFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

import { defineConfig } from "tsdown";

const CSS_PREFIX = "\0harness-css:";
const CSS_SUFFIX = ".mjs";

function inlineCssPlugin() {
  return {
    name: "harness-inline-css",
    resolveId(source: string, importer?: string) {
      if (!source.endsWith(".css")) return null;
      const file =
        importer === undefined ? source : resolve(dirname(importer), source);
      return `${CSS_PREFIX}${file}${CSS_SUFFIX}`;
    },
    async load(id: string) {
      if (!id.startsWith(CSS_PREFIX)) return null;
      const file = id.slice(CSS_PREFIX.length, -CSS_SUFFIX.length);
      const css = await readFile(file, "utf8");
      return [
        `const css = ${JSON.stringify(css)};`,
        `const tagId = ${JSON.stringify(`dsh-theme/${basename(file)}`)};`,
        "if (document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']') === null) {",
        "  const tag = document.createElement('style');",
        "  tag.dataset.plugin = 'dsh-theme';",
        "  tag.dataset.pluginCss = tagId;",
        "  tag.textContent = css;",
        "  document.head.appendChild(tag);",
        "}",
        "export default {};",
      ].join("\n");
    },
  };
}

export default defineConfig({
  name: "dsh-theme/harness",
  entry: { harness: resolve(HERE, "entry.tsx") },
  outDir: resolve(HERE, "dist"),
  format: "iife",
  platform: "browser",
  target: "es2022",
  dts: false,
  sourcemap: false,
  clean: true,
  deps: {
    neverBundle: [],
    alwaysBundle: () => true,
    onlyBundle: false,
  },
  plugins: [inlineCssPlugin()],
});
