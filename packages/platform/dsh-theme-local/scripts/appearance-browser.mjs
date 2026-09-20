#!/usr/bin/env node
/** Core-only browser acceptance, NOT whole-site or deployment proof.
 * Run with node; --serve [--port=4179] keeps an immutable snapshot on loopback.
 * All bundles/evidence are temporary. No installs, lib writes, profiles or app edits.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scripts = dirname(fileURLToPath(import.meta.url));
const pkg = resolve(scripts, '..');
const repoRoot = resolve(pkg, '../../..');
const mainTree = process.env.DSH_TEST_TOOLS_ROOT ? resolve(process.env.DSH_TEST_TOOLS_ROOT) : repoRoot;
const require = createRequire(join(pkg, 'package.json'));
const toolRequire = createRequire(require.resolve('tsdown'));
const { rolldown } = await import(pathToFileURL(toolRequire.resolve('rolldown')).href);
const browserRequire = createRequire(join(mainTree, 'packages/capabilities/dsh-browser-local/package.json'));
const { chromium } = browserRequire('playwright-core');
const args = process.argv.slice(2);
const serve = args.includes('--serve');
assert(args.every(arg => arg === '--serve' || /^--port=\d+$/.test(arg)), 'Only --serve and --port=<number> supported');
const port = Number(args.find(arg => arg.startsWith('--port='))?.slice(7) ?? 0);
assert(Number.isInteger(port) && port >= 0 && port <= 65535, 'Invalid port');
const artifacts = mkdtempSync('/tmp/appearance-browser-');
const sha256 = value => createHash('sha256').update(value).digest('hex');
const inputHashes = new Map();
const report = {
  scope: 'Real apply + registered React ThemeStudio/SizeStepper + real controller/model/tokens/CSS; adapted Host Scope, slots, presenter and defineStore boundary. NOT whole-site or deployed DSH acceptance.',
  artifacts, startedAt: new Date().toISOString(), cases: [], screenshots: [],
};

function installedCss() {
  const roots = [
    '/Applications/DSH Desktop.app/Contents/Resources/app/node_modules/@deepseek-ai',
    join(mainTree, 'vendor/dsh-desktop/dsh-plugin-desktop/node_modules/@deepseek-ai'),
  ];
  const root = roots.find(candidate => existsSync(join(candidate, 'dsh-client-ui-theme/lib/client.js')));
  assert(root, 'Cannot locate official theme CSS; refusing a handmade substitute');
  const sourcePath = join(root, 'dsh-client-ui-theme/lib/client.js');
  const source = readFileSync(sourcePath, 'utf8');
  const sheets = [...source.matchAll(/\bvar\s+(\w+_css_default)\s*=\s*("(?:[^"\\]|\\.)*");/g)]
    .map(([, name, literal]) => ({ name, css: JSON.parse(literal) }));
  assert(sheets.some(sheet => sheet.css.includes('body[data-ds-dark-theme]') && sheet.css.includes('--dsw-alias-button-primary-fill')), 'Official body palette not extracted');
  assert(sheets.some(sheet => sheet.css.includes('--dsw-font-markdown-code-block')), 'Official typography not extracted');
  const buttonPath = join(root, 'dsh-client-ui-primitives/lib/Button.module.css');
  const buttonCss = readFileSync(buttonPath, 'utf8');
  assert(buttonCss.includes('var(--dsw-alias-button-primary-fill)'), 'Official button CSS contract changed');
  report.officialCss = { sourcePath, sha256: sha256(source), sheets: sheets.map(({ name, css }) => ({ name, bytes: Buffer.byteLength(css), sha256: sha256(css) })), buttonPath, buttonSha256: sha256(buttonCss) };
  return [...sheets, { name: 'official-button-probe', css: buttonCss }];
}

// Only module alias. Run the real store's init/actions with immutable snapshots;
// no theme rules, fake components, tokens, controllers or render replacements.
const storeBoundary = `export function defineStore(options) {
  if (typeof options.init !== 'function' || !options.actions) throw new Error('defineStore boundary mismatch');
  return { create() {
    let state = options.init(); const listeners = new Set();
    const actions = Object.fromEntries(Object.entries(options.actions).map(([name, action]) => [name, (...args) => {
      const draft = structuredClone(state); action(draft, ...args); state = draft;
      listeners.forEach(listener => listener());
    }]));
    return { actions, getSnapshot: () => state, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); } };
  }};
}`;
let browser, server, shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  await browser?.close();
  if (server?.listening) {
    server.closeAllConnections();
    await new Promise(resolveClose => server.close(resolveClose));
  }
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  void shutdown().finally(() => process.exit(signal === 'SIGINT' ? 130 : 143));
});
const expected = {
  light: { canvas: '#FDFDFD', panel: '#FFFFFF', sidebar: '#F1F1F0', primary: '#386940' },
  dark: { canvas: '#232523', panel: '#191B1A', sidebar: '#242624', primary: '#5C9363' },
  'warm-pink': { canvas: '#FFF8F7', panel: '#FFFDFC', sidebar: '#F7EEEC', primary: '#8F5361' },
};
const rgb = hex => `rgb(${hex.slice(1).match(/../g).map(part => parseInt(part, 16)).join(', ')})`;
const info = page => page.evaluate(() => window.__appearance.info());
async function saved(page) {
  await page.waitForFunction(() => document.querySelector('[data-appearance-status]')?.getAttribute('data-status') === 'saved');
}
async function choose(page, theme) {
  await page.locator(`[data-appearance-mode]:has(input[value="${theme}"])`).click();
  await page.waitForFunction(id => document.body.dataset.sanbaoTheme === id, theme);
  await saved(page);
  await page.mouse.move(1, 1);
}
async function readColors(page) {
  return page.evaluate(() => {
    const css = selector => getComputedStyle(document.querySelector(selector));
    return {
      theme: document.body.dataset.sanbaoTheme, scheme: getComputedStyle(document.body).colorScheme,
      canvas: getComputedStyle(document.body).backgroundColor,
      reset: css('[data-appearance-button]').backgroundColor,
      primary: css('[data-host-primary-probe]').backgroundColor,
      previews: Array.from(document.querySelectorAll('[data-appearance-preview]')).map(node => ({
        theme: node.dataset.mode, canvas: getComputedStyle(node).backgroundColor,
        sidebar: getComputedStyle(node.querySelector('[data-appearance-preview-sidebar]')).backgroundColor,
        panel: getComputedStyle(node.querySelector('[data-appearance-preview-surface]')).backgroundColor,
      })),
    };
  });
}
function assertColors(actual, theme) {
  assert.equal(actual.theme, theme);
  assert.equal(actual.scheme, theme === 'dark' ? 'dark' : 'light');
  assert.equal(actual.canvas, rgb(expected[theme].canvas), 'Real body canvas');
  assert.equal(actual.reset, rgb(expected[theme].panel), 'Real ThemeStudio button');
  assert.equal(actual.primary, rgb(expected[theme].primary), 'Official button CSS + applied primary token');
  assert.equal(actual.previews.length, 3);
  for (const preview of actual.previews) for (const key of ['canvas', 'sidebar', 'panel'])
    assert.equal(preview[key], rgb(expected[preview.theme][key]), `${preview.theme} preview ${key}, active ${theme}`);
}
async function screenshot(page, name) {
  const path = join(artifacts, name);
  await page.screenshot({ path, fullPage: true, animations: 'disabled' });
  report.screenshots.push(path); return path;
}
async function textResize(page) {
  return page.evaluate(() => {
    // Text-only enlargement, not DPR/zoom transform: double actual computed sizes
    // and explicit line heights while leaving all widths/heights/padding intact.
    const measured = Array.from(document.querySelectorAll('#appearance-root, #appearance-root *')).map(node => {
      const css = getComputedStyle(node);
      return { node, size: parseFloat(css.fontSize), lineHeight: parseFloat(css.lineHeight) };
    });
    for (const { node, size, lineHeight } of measured) {
      node.style.setProperty('font-size', `${size * 2}px`, 'important');
      if (Number.isFinite(lineHeight)) node.style.setProperty('line-height', `${lineHeight * 2}px`, 'important');
    }
    return measured.filter(({ node }) => node.matches('h2, h3, select, button, [data-appearance-mode] > span:last-child'))
      .map(({ node, size }) => ({ element: node.tagName, text: (node.textContent ?? '').slice(0, 40), before: size, after: parseFloat(getComputedStyle(node).fontSize) }));
  });
}
async function layoutEvidence(page) {
  const evidence = await page.evaluate(() => {
    const root = document.querySelector('[data-appearance-studio]');
    const hidden = node => node.matches('[data-appearance-sr], option') || !node.getClientRects().length;
    const horizontal = Array.from(root.querySelectorAll('*')).filter(node => !hidden(node) && node.clientWidth > 0 && node.scrollWidth > node.clientWidth + 2)
      .map(node => ({ tag: node.tagName, attributes: node.getAttributeNames().filter(key => key.startsWith('data-appearance')), client: node.clientWidth, scroll: node.scrollWidth }));
    const clipped = Array.from(root.querySelectorAll('button, select, input:not([type=radio])')).filter(node => !hidden(node)).flatMap(node => {
      // An icon-only switch has an accessible name but no visible text to clip.
      if (!node.matches('input, select') && !node.textContent.trim()) return [];
      const css = getComputedStyle(node);
      const innerHeight = node.clientHeight - parseFloat(css.paddingTop) - parseFloat(css.paddingBottom);
      const fontSize = parseFloat(css.fontSize);
      // Native selects do not expose clipped option glyphs through scrollHeight.
      return innerHeight + 1 < fontSize || node.scrollHeight > node.clientHeight + 2
        ? [{ name: node.getAttribute('aria-label') ?? node.textContent.trim().slice(0, 40), fontSize, innerHeight, clientHeight: node.clientHeight, scrollHeight: node.scrollHeight }] : [];
    });
    return { viewport: innerWidth, documentWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth, horizontal, clipped };
  });
  const controls = page.locator('[data-appearance-studio] button:not(:disabled), [data-appearance-studio] select, [data-appearance-studio] input');
  evidence.controls = [];
  for (let index = 0; index < await controls.count(); index++) {
    const control = controls.nth(index);
    const target = await control.getAttribute('type') === 'radio' ? control.locator('..') : control;
    await target.scrollIntoViewIfNeeded();
    const measured = await target.evaluate(node => {
      const r = node.getBoundingClientRect(), x = (r.left + r.right) / 2, y = (r.top + r.bottom) / 2;
      const top = document.elementFromPoint(x, y);
      return { name: node.getAttribute('aria-label') ?? node.textContent.trim().slice(0, 40), left: r.left, right: r.right, width: r.width, height: r.height, hit: Boolean(top && (node === top || node.contains(top))) };
    });
    await control.focus();
    measured.focus = await control.evaluate(node => document.activeElement === node);
    evidence.controls.push(measured);
  }
  return evidence;
}
async function runCase(baseURL, name, fn, options = {}) {
  const context = await browser.newContext({ viewport: { width: options.width ?? 1280, height: 1000 }, reducedMotion: 'reduce', colorScheme: 'light' });
  const page = await context.newPage();
  page.setDefaultTimeout(6000); page.setDefaultNavigationTimeout(15000);
  const errors = [], warnings = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); if (message.type() === 'warning') warnings.push(message.text()); });
  page.on('requestfailed', request => errors.push(`requestfailed: ${request.url()} ${request.failure()?.errorText}`));
  const result = { name, status: 'fail', evidence: {}, errors, warnings };
  try {
    await page.goto(`${baseURL}/?cssOrder=${options.order ?? 'before'}`);
    await page.waitForFunction(() => window.__appearance?.ready);
    await saved(page); await fn(page, result.evidence);
    assert.deepEqual(errors, [], 'Browser console/pageerror/request failures');
    assert.deepEqual(warnings, [], 'Browser console warnings');
    result.status = 'pass';
  } catch (error) {
    result.error = error.stack ?? String(error);
    result.screenshot = await screenshot(page, `failure-${name.replace(/[^a-z0-9-]/gi, '-')}.png`).catch(() => undefined);
  } finally {
    report.cases.push(result); await context.close();
    console.log(`${result.status.toUpperCase()} ${name}${result.error ? `: ${result.error.split('\n')[0]}` : ''}`);
  }
}

async function runSuite(baseURL) {
  await runCase(baseURL, 'real-apply-registration', async (page, evidence) => {
    const actual = evidence.integration = await info(page);
    assert.equal(actual.injectionCount, 1); assert.equal(actual.registerCount, 1);
    assert.equal(actual.registeredId, 'dsh-theme'); assert(actual.renderCount > 0);
    assert.deepEqual(actual.injectedActions, ['resetTheme', 'setPrefs', 'setTheme', 'setTypography']);
    assert(actual.officialDefaultCount > 200, 'Missing installed official defaults');
    assert.equal(await page.getByRole('radio').count(), 6);
    assert.equal(await page.getByRole('combobox').count(), 2);
  });
  await runCase(baseURL, 'measurement-negative-controls', async (page, evidence) => {
    await choose(page, 'warm-pink');
    assertColors(await readColors(page), 'warm-pink');
    await page.evaluate(() => document.querySelector('style[data-plugin-css="dsh-theme/token-vars"]').remove());
    evidence.withoutApplyTokens = await readColors(page);
    assert.throws(() => assertColors(evidence.withoutApplyTokens, 'warm-pink'), 'Removing real apply tokens must fail color acceptance');
    await page.evaluate(() => {
      const studio = document.querySelector('[data-appearance-studio]');
      studio.style.width = '2000px'; studio.style.maxWidth = 'none';
    });
    evidence.overflowWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    assert(evidence.overflowWidth > 1280, 'Deliberate overflow must be visible to the instrument');
    await page.evaluate(() => {
      const studio = document.querySelector('[data-appearance-studio]');
      studio.style.removeProperty('width'); studio.style.removeProperty('max-width');
      const select = document.querySelector('[data-appearance-select]');
      select.style.fontSize = '48px'; select.style.height = '20px'; select.style.minHeight = '0';
    });
    evidence.clipped = (await layoutEvidence(page)).clipped;
    assert(evidence.clipped.some(item => item.fontSize === 48), 'Deliberately clipped visible text must be detected');
  });
  for (const order of ['before', 'after']) await runCase(baseURL, `three-theme-cascade-${order}`, async (page, evidence) => {
    evidence.readings = [];
    for (const theme of ['light', 'warm-pink', 'dark', 'warm-pink']) {
      await choose(page, theme);
      const colors = await readColors(page); evidence.readings.push(colors);
      assertColors(colors, theme);
      if (order === 'before' && !report.screenshots.some(path => path.endsWith(`/${theme}-1280.png`))) await screenshot(page, `${theme}-1280.png`);
    }
    await page.evaluate(() => window.__appearance.echo('light'));
    assertColors(await readColors(page), 'warm-pink');
    assert.equal((await info(page)).host.user.themeId, 'warm-pink');
  }, { order });
  await runCase(baseURL, 'keyboard-radio-and-focus', async (page, evidence) => {
    await page.getByRole('button', { name: '恢复配色', exact: true }).focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('value')), 'light');
    evidence.sequence = [];
    for (const [key, theme] of [['ArrowRight', 'dark'], ['ArrowRight', 'warm-pink'], ['ArrowRight', 'light'], ['ArrowLeft', 'warm-pink']]) {
      await page.keyboard.press(key); await saved(page);
      const current = await page.evaluate(() => ({ theme: document.body.dataset.sanbaoTheme, value: document.activeElement?.getAttribute('value'), checked: document.activeElement?.checked, outline: getComputedStyle(document.activeElement.parentElement).outlineWidth }));
      evidence.sequence.push(current);
      assert.equal(current.theme, theme); assert.equal(current.value, theme); assert.equal(current.checked, true);
      assert(parseFloat(current.outline) >= 2, 'Visible keyboard radio focus');
    }
  });
  await runCase(baseURL, 'fonts-size-clicks-and-color-reset', async (page, evidence) => {
    const codeBefore = await page.locator('#host-code-probe').evaluate(node => parseFloat(getComputedStyle(node).fontSize));
    await page.getByRole('combobox', { name: '界面字体', exact: true }).selectOption('avenir'); await saved(page);
    await page.getByRole('combobox', { name: '代码字体', exact: true }).selectOption('menlo'); await saved(page);
    await page.getByRole('button', { name: '增大 界面字号', exact: true }).click(); await saved(page);
    await page.getByRole('button', { name: '增大 代码字号', exact: true }).click(); await saved(page);
    evidence.typography = await page.evaluate(() => ({ ui: getComputedStyle(document.querySelector('[data-appearance-studio]')).fontFamily, uiSize: getComputedStyle(document.body).fontSize, code: getComputedStyle(document.querySelector('#host-code-probe')).fontFamily, codeSize: getComputedStyle(document.querySelector('#host-code-probe')).fontSize }));
    assert.match(evidence.typography.ui, /Avenir Next/); assert.match(evidence.typography.code, /Menlo/);
    evidence.typography.codeBefore = codeBefore;
    assert.equal(evidence.typography.uiSize, '15px');
    assert.equal(parseFloat(evidence.typography.codeSize), codeBefore + 1, 'Code size click must change computed glyph size');
    for (const theme of ['dark', 'warm-pink', 'light']) await choose(page, theme);
    await page.getByRole('combobox', { name: '界面字体', exact: true }).selectOption('serif'); await saved(page);
    await page.getByRole('combobox', { name: '代码字体', exact: true }).selectOption('cascadia'); await saved(page);
    await choose(page, 'warm-pink');
    await page.getByRole('button', { name: '恢复配色', exact: true }).click(); await saved(page);
    evidence.afterReset = (await info(page)).host.user;
    assert.deepEqual(evidence.afterReset, { themeId: 'light', uiFont: 'serif', codeFont: 'cascadia', uiFontSize: 15, codeFontSize: 13 });
    assert.equal(await page.getByRole('textbox', { name: '界面字号', exact: true }).inputValue(), '15');
    assert.equal(await page.getByRole('textbox', { name: '代码字号', exact: true }).inputValue(), '13');
    evidence.resetComputed = await page.evaluate(() => ({
      ui: getComputedStyle(document.querySelector('[data-appearance-studio]')).fontFamily,
      code: getComputedStyle(document.querySelector('#host-code-probe')).fontFamily,
      uiSize: getComputedStyle(document.querySelector('[data-appearance-studio]')).fontSize,
      codeSize: getComputedStyle(document.querySelector('#host-code-probe')).fontSize,
    }));
    assert.match(evidence.resetComputed.ui, /Iowan Old Style/);
    assert.match(evidence.resetComputed.code, /Cascadia Code/);
    assert.equal(evidence.resetComputed.uiSize, '15px');
    assert.equal(parseFloat(evidence.resetComputed.codeSize), codeBefore + 1);
    await page.getByRole('button', { name: '减小 界面字号', exact: true }).click(); await saved(page);
    assert.equal((await info(page)).host.user.uiFontSize, 14);
  });
  for (const mode of ['reject', 'recover-without-write']) await runCase(baseURL, `host-${mode}-not-saved`, async (page, evidence) => {
    evidence.before = await info(page);
    const cache = await page.evaluate(() => localStorage.getItem('dsh-theme/settings/v2'));
    await page.evaluate(mode => {
      window.__appearance.behavior(mode); window.__statusObservations = [];
      new MutationObserver(() => window.__statusObservations.push(document.querySelector('[data-appearance-status]')?.getAttribute('data-status'))).observe(document.querySelector('[data-appearance-status]'), { attributes: true, childList: true, subtree: true });
    }, mode);
    await page.locator('[data-appearance-mode]:has(input[value="warm-pink"])').click();
    await page.waitForFunction(() => document.querySelector('[data-appearance-status]')?.getAttribute('data-status') === 'error');
    evidence.after = await info(page); evidence.statuses = await page.evaluate(() => window.__statusObservations);
    assert(!evidence.statuses.includes('saved'), 'Rejected intent briefly reported saved');
    assert.equal(evidence.after.host.user.themeId, 'light');
    assert.equal(evidence.after.state.settings.themeId, 'warm-pink');
    assert.equal(await page.evaluate(() => localStorage.getItem('dsh-theme/settings/v2')), cache);
    assert.match(await page.locator('[data-appearance-status]').textContent(), /尚未保存/);
  });
  await runCase(baseURL, 'host-broadcast-and-local-prefs', async (page, evidence) => {
    await page.evaluate(() => window.__appearance.publish({ ...window.__appearance.info().host.value, themeId: 'warm-pink', uiFont: 'avenir' }));
    await saved(page); assertColors(await readColors(page), 'warm-pink');
    assert.equal(await page.getByRole('combobox', { name: '界面字体', exact: true }).inputValue(), 'avenir');
    await page.locator('[data-appearance-segment] label:has(input[value="on"])').click();
    await page.getByRole('switch', { name: '字体平滑' }).click();
    evidence.prefs = await page.evaluate(() => ({ motion: document.body.dataset.luteReduceMotion, smoothing: document.body.dataset.luteFontSmoothing, cache: JSON.parse(localStorage.getItem('dsh-theme/prefs/v1')) }));
    assert.equal(evidence.prefs.motion, 'reduce'); assert.equal(evidence.prefs.smoothing, 'on');
    assert.equal(evidence.prefs.cache.fontSmoothing, true);
    assert.equal((await info(page)).requests.length, 0, 'Local presentation prefs must not write Host appearance');
  });
  await runCase(baseURL, 'dispose-with-late-host-reply', async (page, evidence) => {
    await page.evaluate(() => window.__appearance.behavior('defer'));
    await page.locator('[data-appearance-mode]:has(input[value="warm-pink"])').click();
    assert.equal((await info(page)).state.saveStatus, 'saving');
    await page.evaluate(() => window.__appearance.dispose());
    const before = await page.evaluate(() => document.documentElement.outerHTML);
    await page.evaluate(async () => { window.__appearance.settlePending(); await Promise.resolve(); await Promise.resolve(); window.__appearance.lateActions(); });
    assert.equal(await page.evaluate(() => document.documentElement.outerHTML), before, 'Late replies/actions changed disposed DOM');
    evidence.disposed = await info(page);
    for (const key of ['scopeListeners', 'themeListeners', 'layers', 'dictionaries']) assert.equal(evidence.disposed[key], 0, key);
    assert.equal(evidence.disposed.registeredId, undefined); assert.equal(evidence.disposed.requests.length, 1);
    assert.equal(await page.locator('[data-appearance-studio], style[data-sanbao-tokens], style[data-plugin="dsh-theme"]').count(), 0);
    assert.equal(await page.evaluate(() => document.body.dataset.sanbaoTheme), undefined);
  });
  for (const width of [1280, 760, 480]) for (const scale of [1, 2]) for (const theme of ['light', 'warm-pink', 'dark']) {
    await runCase(baseURL, `layout-${width}-${scale * 100}pct-${theme}`, async (page, evidence) => {
      await choose(page, theme); assertColors(await readColors(page), theme);
      if (scale === 2) {
        evidence.textResize = await textResize(page);
        assert(evidence.textResize.length >= 10, 'No text enlargement readings');
        for (const item of evidence.textResize) assert(Math.abs(item.after / item.before - 2) < 0.01, 'Computed text not doubled');
      }
      evidence.layout = await layoutEvidence(page);
      await page.evaluate(() => window.scrollTo(0, 0));
      if (theme === 'warm-pink') await screenshot(page, `${theme}-${width}-${scale * 100}pct.png`);
      const layout = evidence.layout;
      assert(layout.documentWidth <= width + 1 && layout.bodyWidth <= width + 1, `Page overflow: ${layout.documentWidth}/${layout.bodyWidth} > ${width}`);
      assert.deepEqual(layout.horizontal, [], 'Internal horizontal overflow');
      assert(layout.controls.length >= 15, 'Missing real control coverage');
      assert.deepEqual(layout.controls.filter(control => !control.hit || !control.focus || control.left < -1 || control.right > width + 1), [], 'Unreachable controls');
      assert.deepEqual(layout.clipped, [], 'Text clipped inside fixed-height controls');
    }, { width });
  }
}

try {
  const sheets = installedCss();
  const bundle = await rolldown({
    input: join(scripts, 'appearance-browser-entry.tsx'), platform: 'browser',
    resolve: { extensionAlias: { '.js': ['.ts', '.tsx', '.js'] } },
    transform: { define: { 'process.env.NODE_ENV': JSON.stringify('development') }, jsx: 'react' },
    plugins: [{
      name: 'appearance-test-host-boundary',
      resolveId(id) { if (id === '@deepseek-ai/dsh-client-store') return '\0appearance-store-boundary'; },
      load(id) {
        if (id === '\0appearance-store-boundary') return storeBoundary;
        if (id.endsWith('.css')) {
          const css = readFileSync(id, 'utf8'); inputHashes.set(id, sha256(css));
          return { code: `const tag=document.createElement('style');tag.dataset.testSourceCss=${JSON.stringify(id)};tag.textContent=${JSON.stringify(css)};document.head.append(tag);`, moduleType: 'js', moduleSideEffects: true };
        }
        if (id.startsWith(pkg) && !id.includes('node_modules') && /\.[cm]?[jt]sx?$/.test(id)) inputHashes.set(id, sha256(readFileSync(id)));
      },
    }],
    onwarn(warning) { throw new Error(`Bundle warning: ${warning.message}`); },
  });
  const output = await bundle.generate({ format: 'iife', name: 'AppearanceBrowserTest', codeSplitting: false });
  await bundle.close();
  assert.equal(output.output.length, 1, 'Expected one in-memory bundle');
  const js = output.output[0].code; assert(js, 'No browser bundle');
  report.bundleSha256 = sha256(js); report.inputs = Object.fromEntries(inputHashes);
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" href="data:,"><title>Appearance — real component core acceptance</title>
${sheets.map(({ name, css }) => `<style data-official-css="${name}">${css.replace(/<\/style/gi, '<\\/style')}</style>`).join('\n')}
<style data-test-host-frame>body{margin:0;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:var(--dsw-font-s-14)}main{padding:24px}aside[data-test-scope]{margin-bottom:20px;max-width:720px}#host-code-probe{font:var(--dsw-font-markdown-code-block)}</style></head><body><main><aside data-test-scope>核心验收：真实 ThemeStudio / apply；宿主边界适配，非全站、非正式 DSH 部署。<p><button tabindex="-1" class="button md primary" data-host-primary-probe>官方按钮 CSS 探针</button> <code id="host-code-probe">const theme = true;</code></p></aside><div id="appearance-root"></div></main><script src="/appearance.js"></script></body></html>`;
  server = createServer((request, response) => {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    const allowed = pathname === '/' || pathname === '/appearance.js';
    response.writeHead(allowed ? 200 : 404, { 'Content-Type': pathname === '/appearance.js' ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    response.end(pathname === '/' ? html : pathname === '/appearance.js' ? js : 'Not found');
  });
  await new Promise((resolveListen, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolveListen); });
  const baseURL = `http://127.0.0.1:${server.address().port}`; report.url = baseURL;
  console.log(`CORE ONLY ${baseURL}\nARTIFACTS ${artifacts}\nOFFICIAL CSS ${report.officialCss.sourcePath}`);
  if (serve) {
    writeFileSync(join(artifacts, 'serve.json'), JSON.stringify(report, null, 2));
    console.log('--serve: immutable bundle snapshot; restart this test server to pick up source changes. No DSH process/profile touched.');
    await new Promise(resolveClosed => server.once('close', resolveClosed));
  } else {
    browser = await chromium.launch({ channel: 'chrome', headless: true }); report.browser = browser.version();
    await runSuite(baseURL);
    report.changedDuringRun = [...inputHashes].filter(([path, hash]) => sha256(readFileSync(path)) !== hash).map(([path]) => path);
    report.passed = report.cases.filter(test => test.status === 'pass').length;
    report.failed = report.cases.length - report.passed;
    if (report.failed || report.changedDuringRun.length) process.exitCode = 1;
    console.log(`RESULT ${report.passed}/${report.cases.length} passed; ${report.failed} failed; changed inputs ${report.changedDuringRun.length}`);
  }
} catch (error) {
  report.fatal = error.stack ?? String(error); console.error(report.fatal); process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  writeFileSync(join(artifacts, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`REPORT ${join(artifacts, 'report.json')}`);
  await shutdown();
}
