import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync } from 'node:fs';
import { createHostBridge, createViewerBridge } from './runtime.mjs';
import { loadThemeSources } from '../../scripts/lib/theme-source-loader.mjs';

export const home = dirname(fileURLToPath(import.meta.url));
export const repo = resolve(home, '../..');
export const ts = createRequire(join(repo, 'packages/platform/dsh-theme-local/package.json'))('typescript');
export function parse(text) {
  const ast = ts.createSourceFile('office.js', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  assert.equal(ast.parseDiagnostics.length, 0, 'Office script does not parse');
  return ast;
}
export function nodes(ast, predicate) {
  const found = [];
  function walk(node) { if (predicate(node)) found.push(node); ts.forEachChild(node, walk); }
  walk(ast); return found;
}
export function one(items, label) { assert.equal(items.length, 1, `${label}: expected one structural anchor, got ${items.length}`); return items[0]; }
const prop = (node, name) => ts.isPropertyAccessExpression(node) && node.name.text === name;
function edits(text, changes) {
  let end = text.length;
  for (const [start, stop, replacement] of changes.sort((a, b) => b[0] - a[0])) {
    assert(stop <= end, 'Overlapping patch edits');
    text = text.slice(0, start) + replacement + text.slice(stop); end = start;
  }
  parse(text); return text;
}
export function viewerStructure(text) {
  const ast = parse(text);
  const controller = one(nodes(ast, n => (ts.isClassExpression(n) || ts.isClassDeclaration(n)) &&
    n.members.some(m => m.name?.getText(ast) === 'chooseAppearance')), 'appearance controller');
  const member = name => one(controller.members.filter(m => m.name?.getText(ast) === name), name);
  const choose = member('chooseAppearance');
  const parameter = choose.parameters[0]?.name.getText(ast);
  assert(parameter && choose.parameters.length === 1, 'appearance parameter');
  const calls = nodes(choose, ts.isCallExpression);
  const identifiers = calls.filter(n => ts.isIdentifier(n.expression));
  assert.equal(identifiers.length, 4, 'appearance read/set/persist/paint calls');
  const [getter, setter, persist, paint] = identifiers.map(n => n.expression.text);
  assert.match(choose.getText(ast), /this\.viewer\.setDarkMode\(/);
  assert.match(choose.getText(ast), /this\.emit\(\)/);
  assert.match(calls.find(n => prop(n.expression, 'setDarkMode')).arguments[0].getText(ast), /===\s*[`'"]dark[`'"]/);
  const fn = name => one(nodes(ast, n => ts.isFunctionDeclaration(n) && n.name?.text === name), name);
  assert.match(fn(persist).getText(ast), /localStorage\.setItem/);
  assert.match(fn(paint).getText(ast), /classList\.toggle/);
  assert.match(fn(paint).getText(ast), /style\.colorScheme/);
  const boot = one(nodes(ast, n => ts.isCallExpression(n) && n.expression.getText(ast) === setter &&
    n.arguments.length === 1 && ts.isCallExpression(n.arguments[0])), 'initial appearance');
  const read = fn(boot.arguments[0].expression.getText(ast));
  assert.match(read.getText(ast), /localStorage\.getItem/);
  const menu = one(nodes(ast, n => ts.isCallExpression(n) && prop(n.expression, 'map') &&
    ts.isArrayLiteralExpression(n.expression.expression) &&
    n.expression.expression.elements.map(e => e.text).join(',') === 'light,dark' &&
    nodes(n, c => ts.isCallExpression(c) && prop(c.expression, 'chooseAppearance')).length === 1), 'appearance-only menu');
  const controllerName = ts.isVariableDeclaration(controller.parent) ? controller.parent.name.getText(ast) : controller.name.text;
  return { ast, controller, controllerName, choose, setter, getter, paint, read, menu,
    constructor: one(controller.members.filter(ts.isConstructorDeclaration), 'constructor'), dispose: member('dispose') };
}
export function patchViewer(text) {
  const s = viewerStructure(text), changes = [];
  changes.push([s.read.body.getStart(s.ast), s.read.body.end, '{return __luteOfficeViewer.scheme()}']);
  changes.push([s.choose.body.getStart(s.ast), s.choose.body.end, '{/* Appearance is owned by the main application. */}']);
  changes.push([s.menu.getStart(s.ast), s.menu.end, 'null']);
  const attach = `;this.__luteOfficeThemeDispose=__luteOfficeViewer.attach((id,notify)=>{${s.setter}(id==="dark"?"dark":"light");${s.paint}();this.viewer.setDarkMode(id==="dark");if(notify)this.emit()});`;
  changes.push([s.constructor.body.end - 1, s.constructor.body.end - 1, attach]);
  changes.push([s.dispose.body.getStart(s.ast) + 1, s.dispose.body.getStart(s.ast) + 1, 'this.__luteOfficeThemeDispose?.();']);
  const sync = one(s.controller.members.filter(m => m.name?.getText(s.ast) === 'syncUrl'), 'URL sync');
  const writers = nodes(sync, n => ts.isCallExpression(n) && ts.isIdentifier(n.expression)).flatMap(call =>
    nodes(s.ast, n => ts.isFunctionDeclaration(n) && n.name?.text === call.expression.text &&
      nodes(n, c => ts.isCallExpression(c) && c.expression.getText(s.ast) === 'history.replaceState').length === 1));
  const writer = one(writers, 'URL writer');
  const search = one(nodes(writer, n => ts.isVariableDeclaration(n) && n.initializer && ts.isNewExpression(n.initializer) &&
    n.initializer.expression.getText(s.ast) === 'URLSearchParams'), 'URL query builder').name.getText(s.ast);
  const history = one(nodes(writer, n => ts.isCallExpression(n) && n.expression.getText(s.ast) === 'history.replaceState'), 'history replace');
  changes.push([history.getStart(s.ast), history.getStart(s.ast), `__luteOfficeViewer.retainQuery(${search}),`]);
  const patched = edits(text, changes);
  return `/* lute-office-theme-v1 */\nconst __luteOfficeViewer=(${createViewerBridge.toString()})();\n${patched}`;
}
export function patchHost(text) {
  const ast = parse(text), changes = [];
  const frames = nodes(ast, n => ts.isCallExpression(n) && n.arguments[0]?.text === 'iframe' &&
    ts.isObjectLiteralExpression(n.arguments[1]) && n.arguments[1].properties.some(p =>
      p.name?.getText(ast) === 'className' && ['uvf_panelFrame', 'uvf_frame'].includes(p.initializer?.text)));
  assert.equal(frames.length, 2, 'Both Office iframe render sites required');
  for (const frame of frames) {
    const object = frame.arguments[1];
    assert(!object.properties.some(p => ['ref', 'onLoad'].includes(p.name?.getText(ast))), 'Existing frame lifecycle changed');
    const src = one(object.properties.filter(p => p.name?.getText(ast) === 'src'), 'iframe source');
    const jsxRuntime = one(nodes(frame.expression, n => ts.isPropertyAccessExpression(n) && ['jsx', 'jsxs'].includes(n.name.text)), 'iframe JSX runtime');
    let owner = frame.parent;
    while (owner && !ts.isFunctionDeclaration(owner)) owner = owner.parent;
    const stateHook = nodes(owner, n => ts.isCallExpression(n) && prop(n.expression, 'useState'))[0];
    assert(stateHook, 'Office frame component has no React state namespace');
    const reactNamespace = stateHook.expression.expression.getText(ast);
    changes.push([frame.arguments[0].getStart(ast), frame.arguments[0].end, '__LuteOfficeFrame']);
    changes.push([src.getStart(ast), src.end, `viewerUrl: ${src.initializer.getText(ast)}`]);
    if (frame === frames[0]) {
      const component = `function __LuteOfficeFrame({viewerUrl,...props}){const bound=${reactNamespace}.useMemo(()=>__luteOfficeHost.frameProps(viewerUrl),[viewerUrl]);return ${jsxRuntime.getText(ast)}("iframe",{...props,...bound})}\n`;
      const applyAt = one(nodes(ast, n => ts.isFunctionDeclaration(n) && n.name?.text === 'apply' && n.getText(ast).includes('univer: dictionaries')), 'Office apply');
      changes.push([applyAt.getStart(ast), applyAt.getStart(ast), component]);
    }
  }
  const apply = one(nodes(ast, n => ts.isFunctionDeclaration(n) && n.name?.text === 'apply' &&
    n.getText(ast).includes('univer: dictionaries')), 'Office apply');
  changes.push([apply.getStart(ast), apply.getStart(ast), `const __luteOfficeHost=(${createHostBridge.toString()})();\n`]);
  const ctx = apply.parameters[0].name.getText(ast);
  changes.push([apply.body.getStart(ast) + 1, apply.body.getStart(ast) + 1,
    `\n${ctx}.effect(()=>__luteOfficeHost.start(), "univer: host theme");\n`]);
  return `/* lute-office-theme-v1 */\n${edits(text, changes)}`;
}
export async function buildCss(css) {
  const { shared } = await loadThemeSources(repo);
  const native = {
    background: 'canvas', foreground: 'foreground', card: 'panel', 'card-foreground': 'foreground',
    popover: 'overlay', 'popover-foreground': 'foreground', primary: 'accentFill', 'primary-hover': 'accent',
    'primary-active': 'accent', 'primary-foreground': 'onAccent', secondary: 'inset', 'secondary-foreground': 'foreground',
    muted: 'inset', 'muted-foreground': 'secondary', accent: 'hover', 'accent-foreground': 'foreground', border: 'border',
    input: 'controlBorder', ring: 'accent', sidebar: 'sidebar', 'sidebar-foreground': 'foreground',
    'sidebar-accent': 'hover', 'sidebar-accent-foreground': 'foreground', 'sidebar-border': 'border',
  };
  for (const key of Object.keys(native)) assert(css.includes(`--color-${key}:`), `Native CSS variable missing: ${key}`);
  const used = new Set([...css.matchAll(/var\((--univer-(?:gray|primary)-[\d]+)/g)].map(m => m[1]));
  assert(used.has('--univer-gray-0') && used.has('--univer-primary-600'), 'Univer UI variables missing');
  const gray = { 0: 'panel', 50: 'canvas', 100: 'inset', 200: 'hover', 300: 'border', 400: 'disabled', 500: 'secondary', 600: 'secondary', 700: 'foreground', 800: 'foreground', 900: 'foreground', 1000: 'foreground' };
  const darkGray = { 0: 'foreground', 50: 'foreground', 100: 'foreground', 200: 'foreground', 300: 'secondary', 400: 'secondary', 500: 'disabled', 600: 'controlBorder', 700: 'border', 800: 'inset', 900: 'panel', 1000: 'canvas' };
  return '\n/* lute-office-theme-v1: UI variables only; document data is untouched */\n' + shared.THEME_IDS.map(id => {
    const palette = shared.SANBAO_PALETTES[id];
    const variables = Object.fromEntries(Object.entries(native).map(([name, key]) => [`--color-${name}`, palette[key]]));
    for (const name of used) {
      const [, family, step] = name.match(/^--univer-(gray|primary)-(\d+)$/);
      const key = family === 'gray' ? (id === 'dark' ? darkGray : gray)[step] :
        Number(step) < 400 ? 'selected' : Number(step) === 600 ? 'accentFill' : 'accent';
      assert(key, `Unmapped UI variable ${name}`); variables[name] = palette[key];
    }
    return `:root[data-sanbao-theme="${id}"],body[data-sanbao-theme="${id}"]{${Object.entries(variables).map(([name, value]) => `${name}:${value};`).join('')}}`;
  }).join('\n') + '\n';
}
export function discover(root) {
  const htmlPath = 'artifacts/viewer/index.html', html = readFileSync(join(root, htmlPath), 'utf8');
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["'](\/assets\/[^"']+\.js)["'][^>]*>/g)].map(m => `artifacts/viewer${m[1]}`);
  const viewer = one(scripts.filter(file => readFileSync(join(root, file), 'utf8').includes('chooseAppearance(')), 'viewer entry asset');
  const styles = [...html.matchAll(/<link\b[^>]*\bhref=["'](\/assets\/[^"']+\.css)["'][^>]*>/g)].map(m => `artifacts/viewer${m[1]}`);
  const css = one(styles.filter(file => readFileSync(join(root, file), 'utf8').includes('html.gateway-dark')), 'viewer stylesheet');
  assert(readdirSync(join(root, 'artifacts/viewer/assets')).length > 0, 'No viewer assets');
  return { host: 'lib/client.js', viewer, css, html: htmlPath };
}
