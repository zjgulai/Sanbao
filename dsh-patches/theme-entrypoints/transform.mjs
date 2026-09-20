import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPureModules, loadThemeSources } from '../../scripts/lib/theme-source-loader.mjs';

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const pkg = join(repoRoot, 'packages/platform/dsh-theme-local/package.json');
const ts = createRequire(pkg)('typescript');
const message = '配色由全局外观管理 / Colors are managed by global Appearance';
const denial = `throw new Error(${JSON.stringify(message)});`;

/** Palette and translated labels are projections of the existing theme sources. */
export async function loadPalette() {
  const { identities, shared } = await loadThemeSources(repoRoot);
  const { locales } = await loadPureModules({ locales: join(repoRoot, 'packages/platform/dsh-theme-local/src/client/locales.ts') }, pkg);
  return identities.map(({ id }) => ({
    id, label: { zh: locales.zh[`mode.${id}`], en: locales.en[`mode.${id}`] },
    // Use resolved per-card colors, not dsw aliases bound to the currently active body theme.
    swatch: ['canvas', 'sidebar', 'panel', 'accent', 'foreground'].map(token => {
      const color = shared.SANBAO_PALETTES[id]?.[token];
      assert.match(color ?? '', /^#[0-9a-f]{6}$/i, `Missing swatch ${id}/${token}`);
      return color;
    }),
  }));
}

function once(source, anchor, replacement) {
  assert.equal(source.split(anchor).length - 1, 1, `anchor must match once: ${anchor.slice(0, 100)}`);
  return source.replace(anchor, () => replacement);
}
function parsed(source) {
  const file = ts.createSourceFile('artifact.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  assert.equal(file.parseDiagnostics.length, 0, 'artifact must parse');
  return file;
}
function unique(source, predicate) {
  const file = parsed(source);
  const found = [];
  const visit = node => { if (predicate(node)) found.push(node); ts.forEachChild(node, visit); };
  visit(file);
  assert.equal(found.length, 1, 'AST anchor must match once');
  return { file, node: found[0] };
}
function symbol(source, name) {
  return unique(source, node => (ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node)) && node.name?.getText() === name);
}
function replaceSymbol(source, name, transform) {
  const { file, node } = symbol(source, name);
  return source.slice(0, node.getStart(file)) + transform(node.getText(file)) + source.slice(node.end);
}
function bodyGuard(source, name, guard) {
  const { file, node } = symbol(source, name);
  const body = ts.isFunctionDeclaration(node) ? node.body : node.initializer?.body;
  assert.ok(body && ts.isBlock(body), `body anchor: ${name}`);
  const start = body.getStart(file) + 1;
  return source.slice(0, start) + '\n' + guard + '\n' + source.slice(start);
}
function finish(source) { parsed(source); return source; }
const snapshot = `() => { const id = document.body?.dataset.sanbaoTheme; return ["light", "dark", "warm-pink"].includes(id) ? id : null; }`;
const subscribe = `(notify) => { document.addEventListener("sanbao:appearance-change", notify); return () => document.removeEventListener("sanbao:appearance-change", notify); }`;
const select = `const event = document.createEvent("CustomEvent"); event.initCustomEvent("sanbao:select-theme", false, false, { themeId: id }); document.dispatchEvent(event);`;

/** Only CUBES and AppearanceRow change; CSS hashes, slot registration and ThemeRuntime remain byte-identical. */
export function transformOfficial(source, palette) {
  source = replaceSymbol(source, 'CUBES', old => {
    assert.match(old, /id: "system"/);
    return once(once(once(old, 'id: "system"', 'id: "warm-pink"'), 'labelKey: "appearance.system"', 'labelKey: "appearance.warm-pink"'),
      'Icon: _deepseek_ai_dsh_client_ui_primitives.IconFollowsystemOutline16', 'Icon: _deepseek_ai_dsh_client_ui_primitives.IconLightOutline16');
  });
  source = replaceSymbol(source, 'AppearanceRow', old => {
    let row = once(old, 'const preference = useStore((s) => s.preference);',
      `const getIdentity = ${snapshot};\nconst preference = require("react").useSyncExternalStore(${subscribe}, getIdentity, getIdentity);\nconst labels = ${JSON.stringify(Object.fromEntries(palette.map(def => [def.id, def.label])))};\nconst lang = /[\\u3400-\\u9fff]/.test(t("appearance.title")) ? "zh" : "en";`);
    row = once(row, 'setTheme(id);', select);
    return once(row, 't(labelKey)', 'labels[id][lang]');
  });
  return finish(source);
}

export function transformMarketClient(source, palette) {
  source = once(source, 'function MarketSection(props) {',
    `const SANBAO_PALETTE = ${JSON.stringify(palette)};\nconst sanbaoThemeSnapshot = ${snapshot};\nconst sanbaoSubscribe = ${subscribe};\nfunction MarketSection(props) {\nconst sanbaoThemeId = react.useSyncExternalStore(sanbaoSubscribe, sanbaoThemeSnapshot, sanbaoThemeSnapshot);`);
  source = replaceSymbol(source, 'themeCard', old => once(
    once(old, 'themeSnap !== null && themeSnap.preference === id', 'sanbaoThemeId === id'), 'props.theme.setTheme(id);', select));
  source = once(source, 'const extra = themeSnap.themes.filter((def) => def.id !== "light" && def.id !== "dark");', 'const extra = SANBAO_PALETTE;');
  source = once(source, 'themeCard(def.id, def.id, themeSwatch(def))', 'themeCard(def.id, def.label[lang], def.swatch)');
  source = once(source, 'tab === "themes" && themeSnap !== null', 'tab === "themes"');
  // Keep cover, description, repository details and favorite controls; remove just lifecycle actions.
  const gallery = symbol(source, 'themePluginCard').node.getText();
  const { file, node } = unique(gallery, node => ts.isObjectLiteralExpression(node) && node.properties.some(p =>
    ts.isPropertyAssignment(p) && p.name.getText() === 'className' && p.initializer.getText() === 'Market_module_css_default.themeActions'));
  const children = node.properties.find(p => p.name?.getText() === 'children');
  assert.ok(children && ts.isPropertyAssignment(children), 'gallery actions anchor');
  const readOnly = gallery.slice(0, children.initializer.getStart(file)) + JSON.stringify(message) + gallery.slice(children.initializer.end);
  source = once(source, gallery, readOnly);
  source = bodyGuard(source, 'pluginCard', 'if (pluginCategories(p).includes("theme")) return themePluginCard(p);');
  source = once(source, 'const doInstall = (0, react.useCallback)((plugin) => {',
    `const doInstall = (0, react.useCallback)((plugin) => {\nif (pluginCategories(plugin).includes("theme")) { setConfirming(null); setInstallError(${JSON.stringify(message)}); return; }`);
  source = once(source, 'const doUseSkin = (0, react.useCallback)((name) => {',
    `const doUseSkin = (0, react.useCallback)((name) => {\nsetInstallError(${JSON.stringify(message)}); return;`);
  return finish(source);
}

export function transformThemes(source) {
  source = bodyGuard(source, 'activateTheme', `if (name !== 'dsh-theme') { ${denial} }`);
  source = once(source, "import { repoOf } from './sources.js';", "import { repoOf, findInstalledAlias } from './sources.js';");
  // Classification failures must not fall through into the ordinary-plugin enable path.
  source = replaceSymbol(source, 'installedThemeNames', old => {
    assert.match(old, /registry unavailable/);
    return `async function installedThemeNames() {
      const names = new Set(['dsh-theme']);
      const registry = await loadRegistry();
      const entries = registry.plugins.filter(entry => pluginCategories(entry).includes('theme'));
      for (const [name, spec] of Object.entries(readInstalled(profile, activeProfileDir))) {
        if (entries.some(entry => findInstalledAlias(entry, { [name]: spec }) === name)) names.add(name);
      }
      return names;
    }`;
  });
  return finish(source);
}

export function transformRoutes(source) {
  // Refuse before any pending rollback, disabled-set, bundle/patch, network or install write.
  source = once(source, 'const plainTarget = installTargetFor(entry);',
    `if (pluginCategories(entry).includes('theme')) { ${denial} }\nconst plainTarget = installTargetFor(entry);`);
  source = bodyGuard(source, 'setPluginEnabled', `if ((await themes.installedThemeNames()).has(name)) { ${denial} }`);
  source = once(source, "const enabled = body.enabled === true;\n                        if (name === 'dsh-market' || name === 'dshmarket') {",
    `const enabled = body.enabled === true;\nif ((await themes.installedThemeNames()).has(name)) { ${denial} }\n                        if (name === 'dsh-market' || name === 'dshmarket') {`);
  source = once(source, 'pendingRollbacks.clear();\n                    const activated = await themes.activateTheme(name);',
    `if (name !== 'dsh-theme') { ${denial} }\npendingRollbacks.clear();\n                    const activated = await themes.activateTheme(name);`);
  source = once(source, 'pendingRollbacks.clear();\n                        // Batch toggle:',
    `if (groups[name].some(member => themeNames.has(member))) { ${denial} }\npendingRollbacks.clear();\n                        // Batch toggle:`);
  // All add/update/retry/collection operations share this executor. Match catalog theme identity,
  // not generic install operations; ordinary plugin add/remove/install behavior remains untouched.
  source = once(source, 'const runPlugin = (profile, args) => withHoistRecovery(commands.runPlugin, profile, args, activeProfileDir);',
    `const runPlugin = async (profile, args) => {
      if (args[0] === 'add') {
        const targets = args.slice(1).filter(arg => !arg.startsWith('-'));
        const registry = await loadRegistry();
        const themeEntries = registry.plugins.filter(entry => pluginCategories(entry).includes('theme'));
        for (const target of targets) {
          if (themeEntries.some(entry => {
            const names = [entry.name, entry.npm].filter(Boolean);
            const spec = installTargetFor(entry);
            const repo = repoOfTarget(target);
            const themeRepo = spec === null ? null : repoOfTarget(spec);
            return names.some(name => target === name || target.startsWith(name + '@')) ||
              target === spec || (repo !== null && themeRepo !== null &&
                (repo === themeRepo || (!themeRepo.includes('#path:/') && repo.startsWith(themeRepo + '#path:/'))));
          })) { ${denial} }
        }
      }
      return withHoistRecovery(commands.runPlugin, profile, args, activeProfileDir);
    };`);
  return finish(source);
}

export function transformHot(source) {
  // Covers the non-theme install branch and startup's client-only shim path. Registry classification
  // is kept at the mount executor, so neither path can bypass the theme-specific refusal.
  source = once(source, "import { logEvent } from './log.js';", "import { logEvent } from './log.js';\nimport { loadRegistry, pluginCategories } from './registry.js';\nimport { readInstalled } from './profile.js';\nimport { findInstalledAlias } from './sources.js';");
  source = bodyGuard(source, 'hotMount', `if (packageName !== 'dsh-theme') {
      let registry;
      try { registry = await loadRegistry(); }
      catch (error) { return { ok: false, reason: error instanceof Error ? error.message : String(error) }; }
      const installed = readInstalled('', profileDir);
      if (registry.plugins.some(entry => pluginCategories(entry).includes('theme') &&
        (entry.name === packageName || entry.npm === packageName || findInstalledAlias(entry, { [packageName]: installed[packageName] }) === packageName))) {
        return { ok: false, reason: ${JSON.stringify(message)} };
      }
    }`);
  return finish(source);
}
