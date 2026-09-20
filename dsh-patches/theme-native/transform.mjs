import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadThemeSources } from '../../scripts/lib/theme-source-loader.mjs';

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const pkg = join(repoRoot, 'packages/platform/dsh-theme-local/package.json');
const ts = createRequire(pkg)('typescript');

export async function loadNativeCss() {
  const { shared } = await loadThemeSources(repoRoot);
  const palettes = shared.SANBAO_PALETTES;
  assert.ok(palettes.light && palettes.dark && palettes['warm-pink'], 'Missing palettes');
  const cssMap = {};
  for (const id of ['light', 'dark', 'warm-pink']) {
    const p = palettes[id];
    const scheme = shared.themeColorScheme(id);
    cssMap[id] = `:root {
  --background: ${p.canvas};
  --foreground: ${p.foreground};
  --card: ${p.panel};
  --card-foreground: ${p.foreground};
  --popover: ${p.overlay};
  --popover-foreground: ${p.foreground};
  --primary: ${p.accentFill};
  --primary-foreground: ${p.onAccent};
  --secondary: ${p.inset};
  --secondary-foreground: ${p.foreground};
  --muted: ${p.inset};
  --muted-foreground: ${p.secondary};
  --destructive: ${p.error};
  --border: ${p.border};
  --input: ${p.border};
  --ring: ${p.controlBorder};
  color-scheme: ${scheme};
}`.trim();
  }
  return cssMap;
}

function once(source, anchor, replacement) {
  const count = source.split(anchor).length - 1;
  assert.equal(count, 1, `anchor must match once (found ${count}): ${anchor.slice(0, 100)}`);
  return source.replace(anchor, () => replacement);
}

function parsed(source, label = 'artifact.js') {
  const file = ts.createSourceFile(label, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  assert.equal(file.parseDiagnostics.length, 0, `${label} must parse cleanly`);
  return file;
}

export function transformAdmission(source) {
  // 1. In createHostRuntime, add setSanbaoTheme
  assert.ok(source.includes('createHostRuntime'), 'Missing createHostRuntime anchor');
  const hostAnchor = 'setThemeSource(source) {';
  assert.ok(source.includes(hostAnchor), 'Missing setThemeSource anchor in admission');
  source = once(source, hostAnchor, `setSanbaoTheme(themeId) {\n\t\t\tif (["light", "dark", "warm-pink"].includes(themeId)) {\n\t\t\t\tvoid send("native:setSanbaoTheme", [themeId]);\n\t\t\t}\n\t\t},\n\t\tsetThemeSource(source) {`);

  // 2. In bindNativeRuntime, add "setSanbaoTheme" to the method allowlist
  assert.ok(source.includes('bindNativeRuntime'), 'Missing bindNativeRuntime anchor');
  const allowlistAnchor = '"setThemeSource",';
  source = once(source, allowlistAnchor, '"setThemeSource",\n\t\t"setSanbaoTheme",');

  parsed(source, 'admission.js');
  return source;
}

export function transformElectronRuntime(source, cssMap) {
  assert.ok(source.includes('createDesktopLocalWindow'), 'Missing createDesktopLocalWindow');
  assert.ok(source.includes('setThemeSource(source) {'), 'Missing setThemeSource');

  const header = `\n// --- SANBAO NATIVE THEME INJECTION ---\nlet __currentSanbaoTheme = (typeof global !== "undefined" && global.__initialSanbaoTheme) || "dark";\nconst __SANBAO_THEME_CSS = ${JSON.stringify(cssMap)};\nconst __insertedCss = new WeakMap();const __pendingRemoval = new WeakMap();\nfunction __applySanbaoThemeToWebContents(wc, themeId) {\n\tif (!wc || typeof wc.isDestroyed === "function" && wc.isDestroyed()) return;\n\tif (!["light", "dark", "warm-pink"].includes(themeId)) return;\n\tconst url = String(wc.getURL?.() ?? "");\n\tif (!url.startsWith("file:") || !url.includes("/native-ui/")) return;\n\tconst css = __SANBAO_THEME_CSS[themeId];\n\tif (!css || typeof wc.insertCSS !== "function") return;\n\t// insertCSS accumulates: the previous sheet must be removed or the window keeps the stale theme rules.\n\tconst previous = __insertedCss.get(wc);\n\tif (previous !== undefined && typeof wc.removeInsertedCSS === "function") __pendingRemoval.set(wc, previous);\n\tvoid wc.insertCSS(css).then((key) => {\n\t\tif (key) __insertedCss.set(wc, key);\n\t\tconst stale = __pendingRemoval.get(wc);\n\t\t__pendingRemoval.delete(wc);\n\t\tif (stale && stale !== key) void wc.removeInsertedCSS(stale).catch(() => {});\n\t}, () => {});\n}\n// --- END SANBAO NATIVE THEME INJECTION ---\n`;

  source = header + source;

  // In createDesktopLocalWindow, inject listener on did-finish-load
  const winAnchor = 'return window;\n}';
  source = once(source, winAnchor, `\twindow.webContents.on("did-finish-load", () => {\n\t\t__applySanbaoThemeToWebContents(window.webContents, __currentSanbaoTheme);\n\t});\n\treturn window;\n}`);

  // In desktop runtime class, add setSanbaoTheme(themeId)
  const setAnchor = 'setThemeSource(source) {';
  const methodInjection = `setSanbaoTheme(themeId) {\n\t\tif (!["light", "dark", "warm-pink"].includes(themeId)) return;\n\t\t__currentSanbaoTheme = themeId;\n\t\tif (typeof BrowserWindow !== "undefined" && typeof BrowserWindow.getAllWindows === "function") {\n\t\t\tfor (const win of BrowserWindow.getAllWindows()) {\n\t\t\t\tif (!win.isDestroyed()) {\n\t\t\t\t\t__applySanbaoThemeToWebContents(win.webContents, themeId);\n\t\t\t\t}\n\t\t\t}\n\t\t}\n\t}\n\tsetThemeSource(source) {`;
  source = once(source, setAnchor, methodInjection);

  parsed(source, 'electron-runtime.js');
  return source;
}

export function transformMain(source) {
  assert.ok(source.includes('onSettingsDocumentResolved: (settingsDocument) => {'), 'Missing onSettingsDocumentResolved in main.js');

  const anchor = 'onSettingsDocumentResolved: (settingsDocument) => {';
  const injection = `onSettingsDocumentResolved: (settingsDocument) => {\n\t\t\t\ttry {\n\t\t\t\t\tconst doc = typeof settingsDocument?.toJSON === "function" ? settingsDocument.toJSON() : settingsDocument;\n\t\t\t\t\tconst tid = doc?.["sanbao-appearance"]?.themeId;\n\t\t\t\t\tif (["light", "dark", "warm-pink"].includes(tid)) {\n\t\t\t\t\t\tglobal.__initialSanbaoTheme = tid;\n\t\t\t\t\t}\n\t\t\t\t} catch {}\n`;

  source = once(source, anchor, injection);
  parsed(source, 'main.js');
  return source;
}
